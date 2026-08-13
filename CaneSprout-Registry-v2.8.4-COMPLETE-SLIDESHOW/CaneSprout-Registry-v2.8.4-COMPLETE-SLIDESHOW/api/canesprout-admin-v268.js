import * as sdk from 'node-appwrite';

const ADMIN_LABEL = 'canesproutadmin';
const API_VERSION = '2.6.8-node-sdk-admin-auth';

export const config = { maxDuration: 60 };

function envText(name, fallback = '') {
  return String(process.env[name] || fallback || '').trim();
}

function serverConfig() {
  const endpoint = envText('APPWRITE_ENDPOINT', envText('VITE_APPWRITE_ENDPOINT', 'https://fra.cloud.appwrite.io/v1')).replace(/\/$/, '');
  const fallbackEndpoint = envText('APPWRITE_FALLBACK_ENDPOINT', envText('VITE_APPWRITE_FALLBACK_ENDPOINT', 'https://cloud.appwrite.io/v1')).replace(/\/$/, '');
  const projectId = envText('APPWRITE_PROJECT_ID', envText('VITE_APPWRITE_PROJECT_ID', '6a744cda00030236187b'));
  const candidates = [
    ['APPWRITE_ADMIN_API_KEY', process.env.APPWRITE_ADMIN_API_KEY],
    ['APPWRITE_USERS_API_KEY', process.env.APPWRITE_USERS_API_KEY],
    ['APPWRITE_ADMIN_KEY', process.env.APPWRITE_ADMIN_KEY],
    ['APPWRITE_API_KEY', process.env.APPWRITE_API_KEY]
  ];
  const presentNames = candidates.filter(([, value]) => String(value || '').trim()).map(([name]) => name);
  const selected = candidates.find(([, value]) => String(value || '').trim()) || ['', ''];
  return {
    endpoint,
    fallbackEndpoint,
    projectId,
    apiKeySource: selected[0],
    apiKey: String(selected[1] || '').trim(),
    presentNames
  };
}

function json(res, status, body) {
  res.status(status);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  return res.end(JSON.stringify(body));
}

function safeStatus() {
  const cfg = serverConfig();
  return {
    configured: Boolean(cfg.apiKey),
    apiVersion: API_VERSION,
    keySource: cfg.apiKey ? cfg.apiKeySource : '',
    detectedServerVariables: cfg.presentNames,
    projectId: cfg.projectId,
    route: '/canesprout-admin-api-v268',
    vercelEnvironment: envText('VERCEL_ENV', 'local'),
    deploymentHost: envText('VERCEL_PROJECT_PRODUCTION_URL', envText('VERCEL_URL', 'localhost')),
    gitCommit: envText('VERCEL_GIT_COMMIT_SHA', '').slice(0, 12)
  };
}

function statusOf(error) {
  return Number(error?.code || error?.status || error?.response?.code || 0);
}

function typeOf(error) {
  return String(error?.type || error?.response?.type || '').trim();
}

function messageOf(error) {
  return String(error?.message || error?.response?.message || error || 'Appwrite request failed.');
}

function isRetryable(error) {
  const status = statusOf(error);
  const message = messageOf(error).toLowerCase();
  return !status
    || status === 408
    || status === 429
    || status >= 500
    || message.includes('fetch')
    || message.includes('network')
    || message.includes('timeout')
    || message.includes('timed out');
}

function withTimeout(promise, ms, label) {
  let timer;
  return Promise.race([
    Promise.resolve(promise),
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(Object.assign(new Error(`${label} timed out.`), { code: 408 })), ms);
    })
  ]).finally(() => clearTimeout(timer));
}

function jwtAccount(endpoint, projectId, jwt) {
  const client = new sdk.Client()
    .setEndpoint(endpoint)
    .setProject(projectId)
    .setJWT(jwt);
  return new sdk.Account(client);
}

function usersService(endpoint, projectId, key) {
  const client = new sdk.Client()
    .setEndpoint(endpoint)
    .setProject(projectId)
    .setKey(key);
  return new sdk.Users(client);
}

async function accountFromJwt(jwt) {
  if (!jwt) {
    const error = new Error('Missing Appwrite JWT.');
    error.status = 401;
    error.appCode = 'admin_session_invalid';
    throw error;
  }

  const cfg = serverConfig();
  const endpoints = [...new Set([cfg.endpoint, cfg.fallbackEndpoint].filter(Boolean))];
  let lastError;

  for (let i = 0; i < endpoints.length; i += 1) {
    const endpoint = endpoints[i];
    try {
      const account = jwtAccount(endpoint, cfg.projectId, jwt);
      const user = await withTimeout(account.get(), 12000, 'Administrator identity check');
      return { user, endpoint };
    } catch (error) {
      const status = statusOf(error);
      // A real 401/403 from the configured regional endpoint means the JWT is
      // invalid/expired. Do not mask that by bouncing to another host.
      if (i === 0 && [401, 403].includes(status)) {
        const wrapped = new Error('Your Appwrite administrator session could not be verified. Sign out of CaneSprout, sign back in, then reopen Admin Center.');
        wrapped.status = 401;
        wrapped.appCode = 'admin_session_invalid';
        wrapped.cause = error;
        throw wrapped;
      }
      if (!isRetryable(error) || i === endpoints.length - 1) {
        lastError = error;
        break;
      }
      lastError = error;
    }
  }

  const wrapped = new Error(messageOf(lastError) || 'Administrator identity check failed.');
  wrapped.status = statusOf(lastError) || 503;
  wrapped.appCode = 'admin_identity_unreachable';
  wrapped.cause = lastError;
  throw wrapped;
}

async function verifiedAdmin(jwt) {
  const { user, endpoint } = await accountFromJwt(jwt);
  const labels = Array.isArray(user?.labels) ? user.labels : [];
  if (!labels.includes(ADMIN_LABEL)) {
    const error = new Error(`This signed-in Appwrite account does not have the ${ADMIN_LABEL} administrator label.`);
    error.status = 403;
    error.appCode = 'admin_label_missing';
    throw error;
  }
  return { user, endpoint };
}

async function withUsersRead(operation) {
  const cfg = serverConfig();
  const endpoints = [...new Set([cfg.endpoint, cfg.fallbackEndpoint].filter(Boolean))];
  let lastError;
  for (let i = 0; i < endpoints.length; i += 1) {
    try {
      const users = usersService(endpoints[i], cfg.projectId, cfg.apiKey);
      return { value: await withTimeout(operation(users), 15000, 'Appwrite Users API read'), endpoint: endpoints[i] };
    } catch (error) {
      error.authKind = 'key';
      lastError = error;
      if (!isRetryable(error) || i === endpoints.length - 1) throw error;
    }
  }
  throw lastError || new Error('Appwrite Users API request failed.');
}

async function withUsersWrite(operation) {
  const cfg = serverConfig();
  // Writes are never replayed against a second endpoint because a timeout can
  // happen after Appwrite already accepted the mutation.
  const users = usersService(cfg.endpoint, cfg.projectId, cfg.apiKey);
  try {
    return await withTimeout(operation(users), 18000, 'Appwrite Users API write');
  } catch (error) {
    error.authKind = 'key';
    throw error;
  }
}

function publicUser(user) {
  const labels = Array.isArray(user?.labels) ? user.labels : [];
  return {
    id: user?.$id || '',
    name: user?.name || '',
    email: user?.email || '',
    status: user?.status !== false,
    labels,
    role: labels.includes(ADMIN_LABEL) ? 'admin' : 'user',
    registration: user?.registration || ''
  };
}

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return json(res, 204, {});
  if (req.method === 'GET') return json(res, 200, safeStatus());
  if (req.method !== 'POST') return json(res, 405, { error: 'Method not allowed.' });

  const body = req.body && typeof req.body === 'object' ? req.body : {};
  const action = String(body.action || 'list');
  if (action === 'status') return json(res, 200, safeStatus());

  const cfg = serverConfig();
  if (!cfg.apiKey) {
    return json(res, 503, {
      code: 'admin_key_missing_production',
      error: 'No supported server-only Appwrite Users API key is available to this runtime.',
      ...safeStatus()
    });
  }

  const authorization = String(req.headers.authorization || '');
  const jwt = authorization.startsWith('Bearer ') ? authorization.slice(7).trim() : '';

  try {
    const { user: admin, endpoint: authEndpoint } = await verifiedAdmin(jwt);

    if (action === 'verifyAdmin') {
      return json(res, 200, {
        admin: publicUser(admin),
        apiVersion: API_VERSION,
        authEndpoint
      });
    }

    if (action === 'list') {
      const search = String(body.search || '').trim().slice(0, 256);
      const { value: result, endpoint: usersEndpoint } = await withUsersRead((users) => users.list({
        queries: [sdk.Query.limit(25)],
        search: search || undefined,
        total: false
      }));
      return json(res, 200, {
        users: (Array.isArray(result?.users) ? result.users : []).slice(0, 25).map(publicUser),
        admin: publicUser(admin),
        apiVersion: API_VERSION,
        authEndpoint,
        usersEndpoint
      });
    }

    if (action === 'create') {
      const email = String(body.email || '').trim().toLowerCase();
      const password = String(body.password || '');
      const name = String(body.name || '').trim().slice(0, 128);
      const role = body.role === 'admin' ? 'admin' : 'user';
      if (!email || !email.includes('@')) return json(res, 400, { error: 'A valid email is required.' });
      if (password.length < 8) return json(res, 400, { error: 'Password must contain at least 8 characters.' });

      let created = await withUsersWrite((users) => users.create({
        userId: sdk.ID.unique(),
        email,
        password,
        name: name || email.split('@')[0]
      }));

      if (role === 'admin') {
        const labels = Array.from(new Set([...(Array.isArray(created.labels) ? created.labels : []), ADMIN_LABEL]));
        created = await withUsersWrite((users) => users.updateLabels({ userId: created.$id, labels }));
      }

      return json(res, 201, { user: publicUser(created), apiVersion: API_VERSION });
    }

    if (action === 'setRole') {
      const userId = String(body.userId || '').trim();
      const role = body.role === 'admin' ? 'admin' : 'user';
      if (!userId) return json(res, 400, { error: 'User ID is required.' });
      if (userId === admin.$id && role !== 'admin') return json(res, 400, { error: 'You cannot remove your own administrator authority.' });

      const { value: target } = await withUsersRead((users) => users.get({ userId }));
      const labels = new Set(Array.isArray(target?.labels) ? target.labels : []);
      if (role === 'admin') labels.add(ADMIN_LABEL); else labels.delete(ADMIN_LABEL);
      const updated = await withUsersWrite((users) => users.updateLabels({ userId, labels: Array.from(labels) }));
      return json(res, 200, { user: publicUser(updated), apiVersion: API_VERSION });
    }

    return json(res, 400, { error: 'Unknown account-management action.' });
  } catch (error) {
    const status = statusOf(error) || Number(error?.status || 500);
    const message = messageOf(error);
    const appCode = error?.appCode || '';

    if (appCode === 'admin_session_invalid') {
      return json(res, 401, { code: appCode, error: message, apiVersion: API_VERSION });
    }
    if (appCode === 'admin_label_missing') {
      return json(res, 403, { code: appCode, error: message, apiVersion: API_VERSION });
    }
    if (appCode === 'admin_identity_unreachable') {
      return json(res, status || 503, { code: appCode, error: message, apiVersion: API_VERSION });
    }

    if (error?.authKind === 'key' || typeOf(error).includes('project_') || status === 401 || status === 403) {
      return json(res, status || 403, {
        code: 'admin_key_scope',
        error: `${message} Verify that APPWRITE_ADMIN_API_KEY has Appwrite users.read and users.write scopes.`,
        apiVersion: API_VERSION
      });
    }

    return json(res, status || 500, { code: 'admin_api_error', error: message, apiVersion: API_VERSION });
  }
}
