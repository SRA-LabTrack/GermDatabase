const ADMIN_LABEL = 'canesproutadmin';
const API_VERSION = '2.6.3-production-git-redeploy';

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
    endpoints: [...new Set([fallbackEndpoint, endpoint].filter(Boolean))],
    projectId,
    apiKeySource: selected[0],
    apiKey: String(selected[1] || '').trim(),
    presentNames
  };
}

function json(res, status, body) {
  res.status(status).setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  res.end(JSON.stringify(body));
}

function safeStatus() {
  const cfg = serverConfig();
  return {
    configured: Boolean(cfg.apiKey),
    apiVersion: API_VERSION,
    keySource: cfg.apiKey ? cfg.apiKeySource : '',
    detectedServerVariables: cfg.presentNames,
    projectId: cfg.projectId,
    route: '/canesprout-admin-api',
    vercelEnvironment: envText('VERCEL_ENV', 'local'),
    vercelTargetEnvironment: envText('VERCEL_TARGET_ENV', ''),
    deploymentHost: envText('VERCEL_PROJECT_PRODUCTION_URL', envText('VERCEL_URL', 'localhost')),
    gitCommit: envText('VERCEL_GIT_COMMIT_SHA', '').slice(0, 12),
    message: cfg.apiKey
      ? `Account-management credential is available to this ${envText('VERCEL_ENV', 'local')} runtime.`
      : `No supported server-only Appwrite Users API key is available to this ${envText('VERCEL_ENV', 'local')} runtime.`
  };
}

async function appwrite(path, { method = 'GET', body, jwt = '', key = '' } = {}) {
  const cfg = serverConfig();
  const headers = {
    'X-Appwrite-Project': cfg.projectId,
    'X-Appwrite-Response-Format': '1.9.5'
  };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (jwt) headers['X-Appwrite-JWT'] = jwt;
  if (key) headers['X-Appwrite-Key'] = key;

  let lastError;
  for (const base of cfg.endpoints) {
    try {
      const response = await fetch(`${base}${path}`, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(12000)
      });
      const text = await response.text();
      let parsed = {};
      if (text) {
        try { parsed = JSON.parse(text); }
        catch { parsed = { message: text }; }
      }
      if (!response.ok) {
        const error = new Error(parsed?.message || `Appwrite ${response.status}`);
        error.status = response.status;
        error.type = parsed?.type;
        if (response.status >= 400 && response.status < 500 && ![408, 429].includes(response.status)) throw error;
        lastError = error;
        continue;
      }
      return parsed;
    } catch (error) {
      if (error?.status >= 400 && error?.status < 500 && ![408, 429].includes(error.status)) throw error;
      lastError = error;
    }
  }
  throw lastError || new Error('Appwrite account-management request failed.');
}

async function accountFromJwt(jwt) {
  if (!jwt) throw Object.assign(new Error('Missing Appwrite JWT.'), { status: 401 });
  return appwrite('/account', { jwt });
}

async function verifiedAdmin(jwt, apiKey) {
  const account = await accountFromJwt(jwt);
  const user = await appwrite(`/users/${encodeURIComponent(account.$id)}`, { key: apiKey });
  if (!Array.isArray(user.labels) || !user.labels.includes(ADMIN_LABEL)) {
    throw Object.assign(new Error('Administrator authority is required.'), { status: 403 });
  }
  return user;
}

function publicUser(user) {
  return {
    id: user.$id,
    name: user.name || '',
    email: user.email || '',
    status: user.status !== false,
    labels: Array.isArray(user.labels) ? user.labels : [],
    role: Array.isArray(user.labels) && user.labels.includes(ADMIN_LABEL) ? 'admin' : 'user',
    registration: user.registration || ''
  };
}

function uniqueId() {
  return `usr_${crypto.randomUUID().replace(/-/g, '').slice(0, 28)}`;
}

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    res.status(204).setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    return res.end('');
  }

  // Safe GET health endpoint. It never exposes the key value and never contacts
  // Appwrite. Opening /canesprout-admin-api in a browser can therefore confirm
  // exactly whether the Production Function received the Environment Variable.
  if (req.method === 'GET') return json(res, 200, safeStatus());
  if (req.method !== 'POST') return json(res, 405, { error: 'Method not allowed.' });

  const body = req.body && typeof req.body === 'object' ? req.body : {};
  const action = String(body.action || 'list');
  const auth = String(req.headers.authorization || '');
  const jwt = auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';
  const cfg = serverConfig();

  if (action === 'status') return json(res, 200, safeStatus());

  if (!cfg.apiKey) {
    return json(res, 503, {
      code: 'admin_key_missing_production',
      error: `The ${envText('VERCEL_ENV', 'server')} runtime does not contain any supported server-only Appwrite Users credential. Supported names are APPWRITE_ADMIN_API_KEY, APPWRITE_USERS_API_KEY, APPWRITE_ADMIN_KEY, or APPWRITE_API_KEY. Local .env/.env.local files are not uploaded to Vercel. Add the credential to this project's Production Environment Variables and create a fresh Production deployment.`,
      ...safeStatus()
    });
  }

  try {
    const admin = await verifiedAdmin(jwt, cfg.apiKey);

    if (action === 'list') {
      const search = String(body.search || '').trim().slice(0, 256);
      let result;
      let fallbackFiltered = false;
      if (search) {
        try {
          result = await appwrite(`/users?search=${encodeURIComponent(search)}`, { key: cfg.apiKey });
        } catch (error) {
          const message = String(error?.message || '').toLowerCase();
          if (!message.includes('quer') && error?.status !== 400) throw error;
          result = await appwrite('/users', { key: cfg.apiKey });
          fallbackFiltered = true;
        }
      } else {
        result = await appwrite('/users', { key: cfg.apiKey });
      }

      let users = Array.isArray(result?.users) ? result.users : [];
      if (fallbackFiltered && search) {
        const needle = search.toLowerCase();
        users = users.filter((user) =>
          String(user?.name || '').toLowerCase().includes(needle) ||
          String(user?.email || '').toLowerCase().includes(needle) ||
          String(user?.$id || '').toLowerCase().includes(needle)
        );
      }
      users = users.slice(0, 25);
      return json(res, 200, { users: users.map(publicUser), apiVersion: API_VERSION, fallbackFiltered });
    }

    if (action === 'create') {
      const email = String(body.email || '').trim().toLowerCase();
      const password = String(body.password || '');
      const name = String(body.name || '').trim().slice(0, 128);
      const role = body.role === 'admin' ? 'admin' : 'user';
      if (!email || !email.includes('@')) return json(res, 400, { error: 'A valid email is required.' });
      if (password.length < 8) return json(res, 400, { error: 'Password must contain at least 8 characters.' });
      const created = await appwrite('/users', {
        method: 'POST', key: cfg.apiKey,
        body: { userId: uniqueId(), email, password, name: name || email.split('@')[0] }
      });
      if (role === 'admin') {
        const existingLabels = Array.isArray(created.labels) ? created.labels : [];
        const labels = Array.from(new Set([...existingLabels, ADMIN_LABEL]));
        await appwrite(`/users/${encodeURIComponent(created.$id)}/labels`, {
          method: 'PUT', key: cfg.apiKey, body: { labels }
        });
        created.labels = labels;
      }
      return json(res, 201, { user: publicUser(created) });
    }

    if (action === 'setRole') {
      const userId = String(body.userId || '').trim();
      const role = body.role === 'admin' ? 'admin' : 'user';
      if (!userId) return json(res, 400, { error: 'User ID is required.' });
      if (userId === admin.$id && role !== 'admin') return json(res, 400, { error: 'You cannot remove your own administrator authority.' });
      const target = await appwrite(`/users/${encodeURIComponent(userId)}`, { key: cfg.apiKey });
      const labels = new Set(Array.isArray(target.labels) ? target.labels : []);
      if (role === 'admin') labels.add(ADMIN_LABEL); else labels.delete(ADMIN_LABEL);
      const updated = await appwrite(`/users/${encodeURIComponent(userId)}/labels`, {
        method: 'PUT', key: cfg.apiKey, body: { labels: Array.from(labels) }
      });
      return json(res, 200, { user: publicUser(updated) });
    }

    return json(res, 400, { error: 'Unknown account-management action.' });
  } catch (error) {
    const message = error?.message || 'Account management failed.';
    const lowered = String(message).toLowerCase();
    if (lowered.includes('scope') || lowered.includes('unauthorized') || lowered.includes('permission')) {
      return json(res, Number(error?.status || 403), {
        code: 'admin_key_scope',
        error: `${message} The server key must include Appwrite users.read and users.write scopes.`
      });
    }
    return json(res, Number(error?.status || 500), { error: message });
  }
}
