import { account } from './appwrite';

let cachedJwt = '';
let cachedUntil = 0;
let cachedStatus = null;
let cachedStatusUntil = 0;

async function adminJwt() {
  if (cachedJwt && Date.now() < cachedUntil) return cachedJwt;
  try {
    const result = await account.createJWT();
    cachedJwt = result.jwt;
    // Appwrite JWTs default to 15 minutes. Keep our cache shorter so a token is
    // never deliberately reused near its expiry boundary.
    cachedUntil = Date.now() + 8 * 60_000;
    return cachedJwt;
  } catch (cause) {
    const status = Number(cause?.code || cause?.status || 0);
    if ([401, 403].includes(status) || String(cause?.message || '').toLowerCase().includes('not authorized')) {
      const error = new Error('Your Appwrite login session has expired or cannot create an administrator JWT. Sign out of CaneSprout and sign in again.');
      error.code = 'admin_session_invalid';
      error.status = 401;
      error.cause = cause;
      throw error;
    }
    throw cause;
  }
}

export function clearAdminJwtCache() {
  cachedJwt = '';
  cachedUntil = 0;
  cachedStatus = null;
  cachedStatusUntil = 0;
}

function adminApiUrl() {
  const configured = String(import.meta.env.VITE_ADMIN_API_URL || '').trim();
  if (configured) return configured;
  // v2.6.1 uses one stable same-origin route in both Vite dev and Vercel.
  // Vercel rewrites this path explicitly to the server function before the
  // SPA catch-all; Vite serves the same route through its dev middleware.
  return '/canesprout-admin-api-v268';
}

async function postAdmin(body, { jwt = true, retryAuth = true } = {}) {
  const token = jwt ? await adminJwt() : '';
  let response;
  try {
    response = await fetch(adminApiUrl(), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {})
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(18_000)
    });
  } catch (cause) {
    const error = new Error('Account Management server route could not be reached. Redeploy the current CaneSprout build, then try again.');
    error.code = 'admin_api_unreachable';
    error.cause = cause;
    throw error;
  }

  const contentType = String(response.headers.get('content-type') || '').toLowerCase();
  const raw = await response.text().catch(() => '');
  let result = {};
  if (raw) {
    try { result = JSON.parse(raw); }
    catch {
      const error = new Error(contentType.includes('text/html')
        ? 'Account Management was routed to the website HTML instead of the server function. Deploy v2.6.1 or newer.'
        : `Account Management returned an invalid server response (${response.status}).`);
      error.code = 'admin_api_route_mismatch';
      error.status = response.status;
      throw error;
    }
  }

  if (!response.ok) {
    const code = result?.code || '';
    if (response.status === 401 || response.status === 403) clearAdminJwtCache();

    // A JWT can become invalid if the underlying Appwrite session changed. On a
    // server-confirmed session error, validate the live Account session and retry
    // exactly once with a newly minted JWT. This is rare and adds no polling.
    if (jwt && retryAuth && code === 'admin_session_invalid') {
      try {
        await account.get();
        return postAdmin(body, { jwt: true, retryAuth: false });
      } catch (cause) {
        const error = new Error('Your Appwrite login session has expired. Sign out of CaneSprout and sign in again before using Account Management.');
        error.code = 'admin_session_invalid';
        error.status = 401;
        error.cause = cause;
        throw error;
      }
    }

    const error = new Error(result?.error || `Account management failed (${response.status}).`);
    error.code = code;
    error.status = response.status;
    throw error;
  }
  return result;
}

export async function adminAccountStatus({ force = false } = {}) {
  if (!force && cachedStatus && Date.now() < cachedStatusUntil) return cachedStatus;
  // Status never needs an Appwrite JWT; the server only reports whether a key
  // exists and never exposes its value. This keeps the check fast and avoids
  // wasting an Appwrite request every time Admin Center opens.
  const result = await postAdmin({ action: 'status' }, { jwt: false });
  if (result?.configured && result?.apiVersion !== '2.6.8-node-sdk-admin-auth') {
    const error = new Error(`Account Management reached an outdated backend (${result?.apiVersion || 'unknown'}). Deploy CaneSprout v2.6.8 so the new versioned server route is active.`);
    error.code = 'admin_api_stale_backend';
    throw error;
  }
  cachedStatus = result;
  // Cache healthy configuration longer. Missing production configuration gets a
  // short cache so a redeploy/fixed Environment Variable is detected quickly.
  cachedStatusUntil = Date.now() + (result?.configured ? 10 * 60_000 : 30_000);
  return result;
}

export async function adminAccountRequest(action, payload = {}) {
  return postAdmin({ action, ...payload });
}
