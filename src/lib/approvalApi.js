import {
  ADMIN_LABEL,
  COLLECTIONS,
  DATABASE_ID,
  ID,
  Permission,
  Query,
  Role,
  databases,
  withAppwriteFailover
} from './appwrite';
import {
  clearListCache,
  deleteStoredFiles,
  getRecord,
  lockStoredFiles,
  saveRecord,
  verifyPendingFiles,
  validateRecordPayload
} from './registryApi';

export const REQUEST_PAGE_SIZE = 25;
const REQUEST_LIST_FIELDS = [
  'request_type', 'target_id', 'submitted_by', 'submitted_name', 'submitted_email',
  'submitted_at', 'status', 'variety_summary', 'resolved_at', 'resolved_by'
];

function cleanRecord(data = {}) {
  return Object.fromEntries(Object.entries(data).filter(([key, value]) => !key.startsWith('$') && value !== undefined));
}

function parsePayload(value) {
  try {
    const parsed = JSON.parse(value || '{}');
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

export function isAdminUser(user) {
  return Array.isArray(user?.labels) && user.labels.includes(ADMIN_LABEL);
}

export async function submitChangeRequest({
  record,
  recordId = '',
  targetId = '',
  actor,
  uploadedFileIds = [],
  removedFileIds = [],
  requestId = ''
}) {
  validateRecordPayload(record);
  const userId = String(actor?.id || actor?.$id || '').trim();
  if (!userId) throw new Error('A signed-in user ID is required to submit a change request.');
  const type = recordId ? 'edit' : 'create';
  const finalTargetId = String(recordId || targetId || ID.unique());
  const payload = {
    record: cleanRecord(record),
    uploaded_file_ids: Array.from(new Set((uploadedFileIds || []).filter(Boolean))),
    removed_file_ids: Array.from(new Set((removedFileIds || []).filter(Boolean)))
  };
  const payloadJson = JSON.stringify(payload);
  if (payloadJson.length > 12000) throw new Error('This approval request is too large. Shorten unusually long notes or reduce photo metadata.');

  const data = {
    request_type: type,
    target_id: finalTargetId,
    submitted_by: userId,
    submitted_name: String(actor?.name || '').slice(0, 128),
    submitted_email: String(actor?.email || '').slice(0, 320),
    submitted_at: new Date().toISOString(),
    status: 'pending',
    variety_summary: String(record?.variety || 'Unnamed variety').slice(0, 255),
    payload_json: payloadJson,
    resolution_note: '',
    resolved_at: '',
    resolved_by: ''
  };

  const documentId = requestId || ID.unique();
  try {
    return await withAppwriteFailover(() => databases.createDocument({
      databaseId: DATABASE_ID,
      collectionId: COLLECTIONS.requests,
      documentId,
      data,
      permissions: [Permission.read(Role.user(userId))]
    }), { retryTransport: false, timeoutMs: 7000 });
  } catch (error) {
    const code = Number(error?.code || error?.status || 0);
    if (!requestId || code !== 409) throw error;
    const existing = await withAppwriteFailover(() => databases.getDocument({
      databaseId: DATABASE_ID,
      collectionId: COLLECTIONS.requests,
      documentId
    }), { timeoutMs: 5000 });
    if (existing?.submitted_by === userId && existing?.target_id === finalTargetId) return existing;
    throw error;
  }
}

export async function listPendingRequests({ cursor = '' } = {}) {
  const queries = [
    Query.equal('status', ['pending']),
    Query.limit(REQUEST_PAGE_SIZE),
    Query.select(REQUEST_LIST_FIELDS)
  ];
  if (cursor) queries.push(Query.cursorAfter(cursor));
  const result = await withAppwriteFailover(() => databases.listDocuments({
    databaseId: DATABASE_ID,
    collectionId: COLLECTIONS.requests,
    queries,
    total: false,
    ttl: 0
  }), { timeoutMs: 5000 });
  const documents = result.documents || [];
  return {
    documents,
    nextCursor: documents.length === REQUEST_PAGE_SIZE ? documents.at(-1)?.$id || '' : '',
    hasMore: documents.length === REQUEST_PAGE_SIZE
  };
}

export async function listMyRequests(userId, { cursor = '' } = {}) {
  const queries = [
    Query.equal('submitted_by', [String(userId)]),
    Query.limit(REQUEST_PAGE_SIZE),
    Query.select(REQUEST_LIST_FIELDS)
  ];
  if (cursor) queries.push(Query.cursorAfter(cursor));
  const result = await withAppwriteFailover(() => databases.listDocuments({
    databaseId: DATABASE_ID,
    collectionId: COLLECTIONS.requests,
    queries,
    total: false,
    ttl: 120
  }), { timeoutMs: 5000 });
  const documents = result.documents || [];
  return { documents, nextCursor: documents.length === REQUEST_PAGE_SIZE ? documents.at(-1)?.$id || '' : '', hasMore: documents.length === REQUEST_PAGE_SIZE };
}

export async function getChangeRequest(requestId) {
  const request = await withAppwriteFailover(() => databases.getDocument({
    databaseId: DATABASE_ID,
    collectionId: COLLECTIONS.requests,
    documentId: requestId
  }), { timeoutMs: 5000 });
  return { ...request, payload: parsePayload(request.payload_json) };
}

async function resolveRequest(requestId, status, reviewer, note = '') {
  return withAppwriteFailover(() => databases.updateDocument({
    databaseId: DATABASE_ID,
    collectionId: COLLECTIONS.requests,
    documentId: requestId,
    data: {
      status,
      resolution_note: String(note || '').slice(0, 500),
      resolved_at: new Date().toISOString(),
      resolved_by: String(reviewer?.id || reviewer?.$id || reviewer?.email || '').slice(0, 128)
    }
  }), { retryTransport: false, timeoutMs: 7000 });
}

export async function approveChangeRequest(requestId, reviewer) {
  const request = await getChangeRequest(requestId);
  if (request.status !== 'pending') throw new Error('This request has already been resolved.');
  const payload = request.payload || {};
  const record = payload.record || {};
  let previous = null;
  if (request.request_type === 'edit') previous = await getRecord(request.target_id, { bypassCache: true });

  const desiredMedia = new Set([...(record.photo_file_ids || []), ...(record.thumb_file_ids || [])].filter(Boolean));
  const newFiles = Array.from(new Set((payload.uploaded_file_ids || []).filter(Boolean)));
  // Validate pending Storage ownership before changing any live record. This
  // prevents a forged request from making an admin relabel arbitrary files.
  const verifiedNewFiles = newFiles.length ? await verifyPendingFiles(newFiles, request.submitted_by) : [];
  const referencedNewFiles = verifiedNewFiles.filter((fileId) => desiredMedia.has(fileId));
  const unusedNewFiles = verifiedNewFiles.filter((fileId) => !desiredMedia.has(fileId));

  const previousMedia = new Set([...(previous?.photo_file_ids || []), ...(previous?.thumb_file_ids || [])].filter(Boolean));
  const removed = Array.from(new Set((payload.removed_file_ids || []).filter((fileId) => previousMedia.has(fileId) && !desiredMedia.has(fileId))));

  let saved;
  if (request.request_type === 'edit') saved = await saveRecord(record, request.target_id, previous);
  else saved = await saveRecord(record, request.target_id, null, { knownNew: true });

  if (referencedNewFiles.length) await lockStoredFiles(referencedNewFiles);
  if (unusedNewFiles.length) await deleteStoredFiles(unusedNewFiles);
  if (removed.length) await deleteStoredFiles(removed);
  await resolveRequest(requestId, 'approved', reviewer);
  clearListCache();
  return saved;
}

export async function rejectChangeRequest(requestId, reviewer, note = '') {
  const request = await getChangeRequest(requestId);
  if (request.status !== 'pending') throw new Error('This request has already been resolved.');
  const uploaded = request.payload?.uploaded_file_ids || [];
  if (uploaded.length) {
    const verified = await verifyPendingFiles(uploaded, request.submitted_by, { allowMissing: true });
    if (verified.length) await deleteStoredFiles(verified);
  }
  await resolveRequest(requestId, 'rejected', reviewer, note);
  return true;
}
