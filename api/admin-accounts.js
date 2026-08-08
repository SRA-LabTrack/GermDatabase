const endpoint = String(process.env.APPWRITE_ENDPOINT || process.env.VITE_APPWRITE_ENDPOINT || 'https://fra.cloud.appwrite.io/v1').replace(/\/$/, '');
const fallbackEndpoint = String(process.env.APPWRITE_FALLBACK_ENDPOINT || process.env.VITE_APPWRITE_FALLBACK_ENDPOINT || 'https://cloud.appwrite.io/v1').replace(/\/$/, '');
const endpoints = [...new Set([endpoint, fallbackEndpoint].filter(Boolean))];
const projectId = String(process.env.APPWRITE_PROJECT_ID || process.env.VITE_APPWRITE_PROJECT_ID || '6a744cda00030236187b');
// Recommended: APPWRITE_ADMIN_API_KEY with only users.read + users.write.
// Fallback names are server-side only and exist to make upgrades less brittle.
const apiKeyCandidates = [
  ['APPWRITE_ADMIN_API_KEY', process.env.APPWRITE_ADMIN_API_KEY],
  ['APPWRITE_USERS_API_KEY', process.env.APPWRITE_USERS_API_KEY],
  ['APPWRITE_API_KEY', process.env.APPWRITE_API_KEY]
].filter(([, value]) => String(value || '').trim());
const [apiKeySource = '', apiKeyValue = ''] = apiKeyCandidates[0] || [];
const apiKey = String(apiKeyValue || '').trim();
const ADMIN_LABEL = 'canesproutadmin';

function json(res, status, body) {
  res.status(status).setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(body));
}

async function appwrite(path, { method = 'GET', body, jwt = '', key = '' } = {}) {
  const headers = {
    'X-Appwrite-Project': projectId,
    'X-Appwrite-Response-Format': '1.9.5'
  };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (jwt) headers['X-Appwrite-JWT'] = jwt;
  if (key) headers['X-Appwrite-Key'] = key;

  let lastError;
  for (const base of endpoints) {
    try {
      const response = await fetch(`${base}${path}`, {
        method, headers,
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(20000)
      });
      const text = await response.text();
      let parsed = {};
      if (text) { try { parsed = JSON.parse(text); } catch { parsed = { message: text }; } }
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

async function verifiedAdmin(jwt) {
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
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    return res.end('');
  }
  if (req.method !== 'POST') return json(res, 405, { error: 'Method not allowed.' });

  const body = req.body && typeof req.body === 'object' ? req.body : {};
  const action = String(body.action || 'list');
  const auth = String(req.headers.authorization || '');
  const jwt = auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';

  // Lightweight health check. It never reveals the key itself.
  // If a JWT is present we validate that it at least belongs to this Appwrite project.
  if (action === 'status') {
    try {
      if (jwt) await accountFromJwt(jwt);
      return json(res, 200, {
        configured: Boolean(apiKey),
        keySource: apiKey ? apiKeySource : '',
        projectId,
        message: apiKey
          ? 'Account-management server credential is configured.'
          : 'A server-only Appwrite Users API key is required.'
      });
    } catch (error) {
      return json(res, Number(error?.status || 500), { configured: Boolean(apiKey), error: error?.message || 'Status check failed.' });
    }
  }

  if (!apiKey) {
    return json(res, 503, {
      code: 'admin_key_missing',
      error: 'Account Management is not configured on the server. Add APPWRITE_ADMIN_API_KEY in Vercel with Appwrite users.read and users.write scopes, then redeploy.'
    });
  }

  try {
    const admin = await verifiedAdmin(jwt);

    if (action === 'list') {
      const search = String(body.search || '').trim().slice(0, 256);
      const suffix = `?total=false&queries[]=${encodeURIComponent('limit(25)')}${search ? `&search=${encodeURIComponent(search)}` : ''}`;
      const result = await appwrite(`/users${suffix}`, { key: apiKey });
      return json(res, 200, { users: (result.users || []).map(publicUser) });
    }

    if (action === 'create') {
      const email = String(body.email || '').trim().toLowerCase();
      const password = String(body.password || '');
      const name = String(body.name || '').trim().slice(0, 128);
      const role = body.role === 'admin' ? 'admin' : 'user';
      if (!email || !email.includes('@')) return json(res, 400, { error: 'A valid email is required.' });
      if (password.length < 8) return json(res, 400, { error: 'Password must contain at least 8 characters.' });
      const created = await appwrite('/users', {
        method: 'POST', key: apiKey,
        body: { userId: uniqueId(), email, password, name: name || email.split('@')[0] }
      });
      if (role === 'admin') {
        await appwrite(`/users/${encodeURIComponent(created.$id)}/labels`, {
          method: 'PUT', key: apiKey, body: { labels: [ADMIN_LABEL] }
        });
        created.labels = [ADMIN_LABEL];
      }
      return json(res, 201, { user: publicUser(created) });
    }

    if (action === 'setRole') {
      const userId = String(body.userId || '').trim();
      const role = body.role === 'admin' ? 'admin' : 'user';
      if (!userId) return json(res, 400, { error: 'User ID is required.' });
      if (userId === admin.$id && role !== 'admin') return json(res, 400, { error: 'You cannot remove your own administrator authority.' });
      const target = await appwrite(`/users/${encodeURIComponent(userId)}`, { key: apiKey });
      const labels = new Set(Array.isArray(target.labels) ? target.labels : []);
      if (role === 'admin') labels.add(ADMIN_LABEL); else labels.delete(ADMIN_LABEL);
      const updated = await appwrite(`/users/${encodeURIComponent(userId)}/labels`, {
        method: 'PUT', key: apiKey, body: { labels: Array.from(labels) }
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
