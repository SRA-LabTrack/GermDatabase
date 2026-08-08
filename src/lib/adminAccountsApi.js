import { account } from './appwrite';

let cachedJwt = '';
let cachedUntil = 0;

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
}

function adminApiUrl() {
  const configured = String(import.meta.env.VITE_ADMIN_API_URL || '').trim();
  if (configured) return configured;
  if (window.germDesktop) return 'https://germ-database.vercel.app/api/admin-accounts';
  return '/api/admin-accounts';
}

export async function adminAccountRequest(action, payload = {}) {
  const jwt = await adminJwt();
  const response = await fetch(adminApiUrl(), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${jwt}` },
    body: JSON.stringify({ action, ...payload })
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    if (response.status === 401 || response.status === 403) clearAdminJwtCache();
    throw new Error(result?.error || `Account management failed (${response.status}).`);
  }
  return result;
}
