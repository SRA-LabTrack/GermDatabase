import { isNetworkFailure } from './appwrite';
import { CHARACTERIZATION_FIELDS } from './characterizationFields';
import { GERMINATION_FIELDS } from './germinationFields';

export function messageFor(error) {
  const code = Number(error?.code || error?.status || 0);
  if (code === 401) return 'Your sign-in is no longer valid. Please sign in again.';
  if (code === 404) return 'The sugarcane collection has not been set up yet. Run npm.cmd run setup:appwrite once.';
  if (isNetworkFailure(error)) return 'Appwrite is unreachable. Cached pages can still be viewed, but saving needs a connection.';
  return error?.message || String(error || 'Something went wrong.');
}

export function loginMessageFor(error) {
  const code = Number(error?.code || error?.status || 0);
  const type = String(error?.type || '').toLowerCase();
  if (type === 'user_invalid_credentials' || type === 'user_not_found' || code === 401) {
    return 'Incorrect email or password. Please check your credentials and try again.';
  }
  if (type === 'user_blocked') return 'This account is blocked. Contact the registry administrator.';
  if (type === 'user_email_not_whitelisted') return 'This email is not allowed to sign in to this Appwrite project.';
  if (isNetworkFailure(error)) return 'Could not reach Appwrite. Check your connection and try again.';
  return error?.message || String(error || 'Could not sign in.');
}

export function pct(record) {
  const raw = record?.germination_pct;
  if (raw === '' || raw == null) return null;
  const value = Number(raw);
  return Number.isFinite(value) ? Math.max(0, Math.min(100, value)) : null;
}

export function emptyForm() {
  const base = Object.fromEntries(CHARACTERIZATION_FIELDS.map((field) => [field.key, '']));
  GERMINATION_FIELDS.forEach((field) => { base[field.key] = ''; });
  return {
    ...base,
    photo_file_ids: [],
    thumb_file_ids: [],
    photo_names: [],
    thumbnail_file_id: '',
    primary_file_id: '',
    source_name: 'Manual entry',
    source_row: ''
  };
}
