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

function safeData(meta = {}) {
  const data = {
    category: text(meta.category).slice(0, 32),
    title: text(meta.title).slice(0, 255),
    code: text(meta.code).slice(0, 64),
    year: text(meta.year).slice(0, 16),
    authors: text(meta.authors).slice(0, 1000),
    description: text(meta.description).slice(0, 2000),
    file_id: text(meta.file_id).slice(0, 36),
    file_name: text(meta.file_name).slice(0, 255),
    mime_type: text(meta.mime_type).slice(0, 128),
    size_bytes: text(meta.size_bytes).slice(0, 32),
    uploaded_by: text(meta.uploaded_by).slice(0, 36),
    uploaded_by_name: text(meta.uploaded_by_name).slice(0, 128),
    created_at: text(meta.created_at).slice(0, 32),
    search_text: ''
  };
  data.search_text = text(meta.search_text || documentSearchText(data)).slice(0, 4096);
  return data;
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
  const data = safeData({
    ...meta,
    category,
    title,
    file_id: fileId,
    file_name: file.name,
    mime_type: file.type || 'application/octet-stream',
    size_bytes: String(Number(file.size || 0)),
    uploaded_by: actor?.id || actor?.$id,
    uploaded_by_name: actor?.name || actor?.email || 'Administrator',
    created_at: createdAt
  });

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

export async function updateBreedingProgramDocument(document, patch = {}) {
  if (!document?.$id) throw new Error('Missing Breeding Program document ID.');

  const data = safeData({
    ...document,
    ...patch,
    category: document.category,
    file_id: document.file_id,
    file_name: document.file_name,
    mime_type: document.mime_type,
    size_bytes: document.size_bytes,
    uploaded_by: document.uploaded_by,
    uploaded_by_name: document.uploaded_by_name,
    created_at: document.created_at
  });

  return withAppwriteFailover(() => databases.updateDocument({
    databaseId: DATABASE_ID,
    collectionId: COLLECTIONS.breedingDocuments,
    documentId: document.$id,
    data
  }), { retryTransport: false, timeoutMs: 9000 });
}

export async function listBreedingProgramOverrides(kind) {
  const category = kind === 'protocol' ? 'protocol_meta' : 'research_meta';
  return listBreedingProgramDocuments({ category, limit: 100 });
}

export async function saveBreedingProgramOverride({
  kind,
  sourceKey,
  title,
  year,
  authors,
  description
}, actor = {}) {
  const category = kind === 'protocol' ? 'protocol_meta' : 'research_meta';
  const stableKey = text(sourceKey).slice(0, 64);
  if (!stableKey) throw new Error('Missing source key for editable reference entry.');

  let existing = null;
  try {
    const result = await withAppwriteFailover(() => databases.listDocuments({
      databaseId: DATABASE_ID,
      collectionId: COLLECTIONS.breedingDocuments,
      queries: [
        Query.equal('category', category),
        Query.equal('code', stableKey),
        Query.limit(1)
      ],
      total: false,
      ttl: 0
    }), { timeoutMs: 7000 });
    existing = result.documents?.[0] || null;
  } catch (error) {
    throw setupError(error);
  }

  const now = new Date().toISOString().slice(0, 32);
  const data = safeData({
    category,
    code: stableKey,
    title,
    year,
    authors,
    description,
    file_id: '',
    file_name: '',
    mime_type: '',
    size_bytes: '',
    uploaded_by: actor?.id || actor?.$id,
    uploaded_by_name: actor?.name || actor?.email || 'Administrator',
    created_at: existing?.created_at || now,
    // Preserve a longer edited abstract in search_text where possible.
    search_text: text(description).slice(0, 4096)
  });

  if (existing?.$id) {
    return withAppwriteFailover(() => databases.updateDocument({
      databaseId: DATABASE_ID,
      collectionId: COLLECTIONS.breedingDocuments,
      documentId: existing.$id,
      data
    }), { retryTransport: false, timeoutMs: 9000 });
  }

  try {
    return await withAppwriteFailover(() => databases.createDocument({
      databaseId: DATABASE_ID,
      collectionId: COLLECTIONS.breedingDocuments,
      documentId: ID.unique(),
      data
    }), { retryTransport: false, timeoutMs: 9000 });
  } catch (error) {
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
