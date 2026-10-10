import {
  ADMIN_LABEL,
  BREEDING_BUCKET_ID,
  COLLECTIONS,
  DATABASE_ID,
  ID,
  Permission,
  Query,
  Role,
  databases,
  storage,
  withAppwriteFailover
} from './appwrite';

function text(value) {
  return String(value ?? '').trim();
}

function documentSearchText(meta = {}) {
  return [
    meta.category,
    meta.title,
    meta.code,
    meta.year,
    meta.authors,
    meta.description,
    meta.file_name
  ].map(text).filter(Boolean).join(' ').replace(/\s+/g, ' ').slice(0, 4096);
}

function setupError(error) {
  const code = Number(error?.code || error?.status || 0);
  if (code !== 404) return error;
  const wrapped = new Error(
    'Breeding Program cloud storage is not configured yet. An administrator can run npm.cmd run setup:breeding-program once.'
  );
  wrapped.code = 404;
  wrapped.setupRequired = true;
  return wrapped;
}

export function breedingProgramFileViewUrl(fileId) {
  if (!fileId) return '';
  try {
    return String(storage.getFileView({ bucketId: BREEDING_BUCKET_ID, fileId }));
  } catch {
    return '';
  }
}

export function breedingProgramFileDownloadUrl(fileId) {
  if (!fileId) return '';
  try {
    return String(storage.getFileDownload({ bucketId: BREEDING_BUCKET_ID, fileId }));
  } catch {
    return '';
  }
}

export async function listBreedingProgramDocuments({ category = '', limit = 100 } = {}) {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return { documents: [], offline: true, setupRequired: false };
  }

  const queries = [
    Query.orderDesc('created_at'),
    Query.limit(Math.max(1, Math.min(100, Number(limit) || 100)))
  ];
  if (text(category)) queries.push(Query.equal('category', text(category)));

  try {
    const result = await withAppwriteFailover(() => databases.listDocuments({
      databaseId: DATABASE_ID,
      collectionId: COLLECTIONS.breedingDocuments,
      queries,
      total: false,
      ttl: 0
    }), { timeoutMs: 7000 });

    return {
      documents: result.documents || [],
      offline: false,
      setupRequired: false
    };
  } catch (error) {
    const normalized = setupError(error);
    if (normalized.setupRequired) {
      return { documents: [], offline: false, setupRequired: true };
    }
    throw normalized;
  }
}

export async function uploadBreedingProgramDocument(file, meta = {}, actor = {}) {
  if (!file) throw new Error('Choose a file to upload.');
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    throw new Error('Connect to the internet before uploading a shared Breeding Program document.');
  }

  const category = text(meta.category);
  const title = text(meta.title);
  if (!['protocol', 'research'].includes(category)) {
    throw new Error('Document category must be protocol or research.');
  }
  if (!title) throw new Error('Enter a document title.');

  const fileId = ID.unique();
  const permissions = [
    Permission.read(Role.users()),
    Permission.update(Role.label(ADMIN_LABEL)),
    Permission.delete(Role.label(ADMIN_LABEL))
  ];

  try {
    await withAppwriteFailover(() => storage.createFile({
      bucketId: BREEDING_BUCKET_ID,
      fileId,
      file,
      permissions
    }), { retryTransport: false, timeoutMs: 20000 });
  } catch (error) {
    throw setupError(error);
  }

  const createdAt = new Date().toISOString().slice(0, 32);
  const data = {
    category,
    title: title.slice(0, 255),
    code: text(meta.code).slice(0, 64),
    year: text(meta.year).slice(0, 16),
    authors: text(meta.authors).slice(0, 1000),
    description: text(meta.description).slice(0, 2000),
    file_id: fileId,
    file_name: text(file.name).slice(0, 255),
    mime_type: text(file.type || 'application/octet-stream').slice(0, 128),
    size_bytes: String(Number(file.size || 0)).slice(0, 32),
    uploaded_by: text(actor?.id || actor?.$id).slice(0, 36),
    uploaded_by_name: text(actor?.name || actor?.email || 'Administrator').slice(0, 128),
    created_at: createdAt,
    search_text: ''
  };
  data.search_text = documentSearchText(data);

  try {
    return await withAppwriteFailover(() => databases.createDocument({
      databaseId: DATABASE_ID,
      collectionId: COLLECTIONS.breedingDocuments,
      documentId: ID.unique(),
      data
    }), { retryTransport: false, timeoutMs: 9000 });
  } catch (error) {
    await storage.deleteFile({ bucketId: BREEDING_BUCKET_ID, fileId }).catch(() => {});
    throw setupError(error);
  }
}

export async function deleteBreedingProgramDocument(document) {
  if (!document?.$id) return;
  const fileId = text(document.file_id);

  await withAppwriteFailover(() => databases.deleteDocument({
    databaseId: DATABASE_ID,
    collectionId: COLLECTIONS.breedingDocuments,
    documentId: document.$id
  }), { retryTransport: false, timeoutMs: 9000 });

  if (fileId) {
    await storage.deleteFile({
      bucketId: BREEDING_BUCKET_ID,
      fileId
    }).catch((error) => {
      const code = Number(error?.code || error?.status || 0);
      if (code !== 404) throw error;
    });
  }
}
