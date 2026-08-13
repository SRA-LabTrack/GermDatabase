const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { app, safeStorage } = require('electron');

const VAULT_VERSION = 1;
const PBKDF2_ITERATIONS = 210000;
const PBKDF2_BYTES = 32;
const PBKDF2_DIGEST = 'sha256';

function vaultPath() {
  return path.join(app.getPath('userData'), 'canesprout-offline-login.json');
}

function safeUser(user) {
  return {
    id: String(user?.$id || user?.id || '').trim(),
    name: String(user?.name || '').trim(),
    email: String(user?.email || '').trim().toLowerCase(),
    labels: Array.isArray(user?.labels) ? user.labels.map((value) => String(value)) : []
  };
}

function readVault() {
  try {
    const parsed = JSON.parse(fs.readFileSync(vaultPath(), 'utf8'));
    if (!parsed || Number(parsed.version) !== VAULT_VERSION || !parsed.user?.email) return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeVault(value) {
  const target = vaultPath();
  fs.mkdirSync(path.dirname(target), { recursive: true });
  const temporary = `${target}.tmp`;
  fs.writeFileSync(temporary, JSON.stringify(value, null, 2), { encoding: 'utf8', mode: 0o600 });
  fs.renameSync(temporary, target);
}

function deleteVault() {
  try { fs.rmSync(vaultPath(), { force: true }); } catch {}
}

function pbkdf2(password, salt, iterations = PBKDF2_ITERATIONS) {
  return new Promise((resolve, reject) => {
    crypto.pbkdf2(String(password || ''), salt, iterations, PBKDF2_BYTES, PBKDF2_DIGEST, (error, derived) => {
      if (error) reject(error);
      else resolve(derived);
    });
  });
}

async function deriveVerifier(password, saltBase64 = '') {
  const salt = saltBase64 ? Buffer.from(saltBase64, 'base64') : crypto.randomBytes(24);
  const hash = await pbkdf2(password, salt);
  return {
    salt: salt.toString('base64'),
    hash: hash.toString('base64'),
    iterations: PBKDF2_ITERATIONS,
    digest: PBKDF2_DIGEST
  };
}

async function verifyPassword(password, verifier) {
  if (!verifier?.salt || !verifier?.hash) return false;
  const salt = Buffer.from(verifier.salt, 'base64');
  const expected = Buffer.from(verifier.hash, 'base64');
  const actual = await pbkdf2(password, salt, Number(verifier.iterations || PBKDF2_ITERATIONS));
  return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
}

function encryptCredential(password) {
  try {
    if (!safeStorage.isEncryptionAvailable()) return '';
    return safeStorage.encryptString(String(password || '')).toString('base64');
  } catch {
    return '';
  }
}

function decryptCredential(cipher) {
  try {
    if (!cipher || !safeStorage.isEncryptionAvailable()) return '';
    return safeStorage.decryptString(Buffer.from(cipher, 'base64'));
  } catch {
    return '';
  }
}

async function rememberOfflineLogin({ email, password, user } = {}) {
  const normalizedUser = safeUser(user);
  const normalizedEmail = String(email || normalizedUser.email || '').trim().toLowerCase();
  if (!normalizedEmail || !password || !normalizedUser.email) throw new Error('Email, password, and user profile are required.');
  if (normalizedEmail !== normalizedUser.email) throw new Error('The signed-in account does not match the offline login email.');

  const verifier = await deriveVerifier(password);
  const encryptedPassword = encryptCredential(password);
  const previous = readVault();
  const now = new Date().toISOString();
  const vault = {
    version: VAULT_VERSION,
    createdAt: previous?.createdAt || now,
    updatedAt: now,
    user: normalizedUser,
    verifier,
    encryptedPassword,
    osEncryptedCredential: Boolean(encryptedPassword)
  };
  writeVault(vault);
  return status();
}

async function unlockOffline({ email, password } = {}) {
  const vault = readVault();
  if (!vault) return { ok: false, reason: 'not-configured' };
  const normalizedEmail = String(email || '').trim().toLowerCase();
  if (!normalizedEmail || normalizedEmail !== vault.user.email) return { ok: false, reason: 'email-mismatch' };
  if (!await verifyPassword(password, vault.verifier)) return { ok: false, reason: 'invalid-password' };
  return { ok: true, user: safeUser(vault.user), offline: true };
}

function status() {
  const vault = readVault();
  return {
    configured: Boolean(vault?.user?.email),
    user: vault?.user ? safeUser(vault.user) : null,
    canSilentReauth: Boolean(vault?.encryptedPassword),
    credentialProtection: vault?.encryptedPassword ? 'os-encrypted' : 'local-verifier-only'
  };
}

function forget() {
  deleteVault();
  return { ok: true };
}

async function restoreAppwriteSession(electronSession, { endpoint, projectId } = {}) {
  const vault = readVault();
  if (!vault?.user?.email) return { ok: false, reason: 'not-configured' };
  const password = decryptCredential(vault.encryptedPassword);
  if (!password) return { ok: false, reason: 'credential-unavailable' };

  const cleanEndpoint = String(endpoint || '').trim().replace(/\/$/, '');
  const cleanProject = String(projectId || '').trim();
  if (!/^https:\/\//i.test(cleanEndpoint) || !cleanProject) return { ok: false, reason: 'invalid-appwrite-config' };

  try {
    const response = await electronSession.fetch(`${cleanEndpoint}/account/sessions/email`, {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        'X-Appwrite-Project': cleanProject,
        'X-Appwrite-Response-Format': '1.7.4'
      },
      body: JSON.stringify({ email: vault.user.email, password })
    });

    let payload = null;
    try { payload = await response.clone().json(); } catch {}
    const type = String(payload?.type || '').toLowerCase();
    const message = String(payload?.message || '').toLowerCase();

    if (response.ok || type.includes('user_session_already_exists') || message.includes('session is active')) {
      try { await electronSession.flushStorageData(); } catch {}
      return { ok: true, restored: response.ok, alreadyActive: !response.ok };
    }

    if (response.status === 401 && (message.includes('invalid credentials') || type.includes('user_invalid_credentials'))) {
      return { ok: false, reason: 'credentials-rejected', status: response.status };
    }

    return { ok: false, reason: payload?.message || `Appwrite session restore failed (${response.status}).`, status: response.status };
  } catch (error) {
    return { ok: false, reason: 'network-unavailable', message: error?.message || String(error) };
  }
}

module.exports = {
  rememberOfflineLogin,
  unlockOffline,
  status,
  forget,
  restoreAppwriteSession,
  vaultPath
};
