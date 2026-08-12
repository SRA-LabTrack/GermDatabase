import { account } from './appwrite';

let cachedJwt = '';
let cachedUntil = 0;
let cachedStatus = null;
let cachedStatusUntil = 0;

async function adminJwt() {
  if (cachedJwt && Date.now() < cachedUntil) return cachedJwt;
  const result = await account.createJWT();
  cachedJwt = result.jwt;
  cachedUntil = Date.now() + 10 * 60_000;
  return cachedJwt;
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
  // Vite dev does not execute Vercel /api functions. Use the deployed endpoint
  // automatically for localhost/desktop unless the developer explicitly overrides it.
  const host = String(window.location?.hostname || '').toLowerCase();
  if (window.germDesktop || host === 'localhost' || host === '127.0.0.1') {
    return 'https://germ-database.vercel.app/api/admin-accounts';
  }
  return '/api/admin-accounts';
}

async function postAdmin(body, { jwt = true } = {}) {
  const token = jwt ? await adminJwt() : '';
  const response = await fetch(adminApiUrl(), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    },
    body: JSON.stringify(body)
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    if (response.status === 401 || response.status === 403) clearAdminJwtCache();
    const error = new Error(result?.error || `Account management failed (${response.status}).`);
    error.code = result?.code || '';
    error.status = response.status;
    throw error;
  }
  return result;
}

export async function adminAccountStatus({ force = false } = {}) {
  if (!force && cachedStatus && Date.now() < cachedStatusUntil) return cachedStatus;
  const result = await postAdmin({ action: 'status' });
  cachedStatus = result;
  cachedStatusUntil = Date.now() + 10 * 60_000;
  return result;
}

export async function adminAccountRequest(action, payload = {}) {
  return postAdmin({ action, ...payload });
}
