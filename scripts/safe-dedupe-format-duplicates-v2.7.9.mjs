import fs from "node:fs";
import path from "node:path";

const ALLOWED_CANONICALS = new Set([
  "PHIL56226",
  "PHIL58260",
  "PHIL992641",
]);

const EXPECTED_CLASSIFICATION = "FORMAT_EQUIVALENT_NO_DATA_CONFLICT";

function readEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return {};
  const out = {};
  const text = fs.readFileSync(filePath, "utf8");

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;

    const equals = line.indexOf("=");
    if (equals <= 0) continue;

    const key = line.slice(0, equals).trim();
    let value = line.slice(equals + 1).trim();

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    out[key] = value;
  }

  return out;
}

function loadEnvironment() {
  const local = readEnvFile(path.resolve(".env.local"));
  const base = readEnvFile(path.resolve(".env"));

  return {
    ...base,
    ...local,
    ...process.env,
  };
}

function numeric(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function canonicalizeVariety(value) {
  return String(value ?? "")
    .normalize("NFKD")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "");
}

function cleanDocument(document) {
  if (!document || typeof document !== "object") return document;

  const copy = {};
  for (const [key, value] of Object.entries(document)) {
    if (key.startsWith("$")) continue;
    copy[key] = value;
  }
  return copy;
}

function findLatestAuditReport() {
  const reportsDir = path.resolve("reports");

  if (!fs.existsSync(reportsDir)) {
    throw new Error(
      "reports folder is missing. Run npm.cmd run audit:registry-full first.",
    );
  }

  const candidates = fs
    .readdirSync(reportsDir)
    .filter((name) => /^registry-integrity-v.*\.json$/i.test(name))
    .map((name) => {
      const fullPath = path.join(reportsDir, name);
      return {
        name,
        fullPath,
        mtimeMs: fs.statSync(fullPath).mtimeMs,
      };
    })
    .sort((a, b) => b.mtimeMs - a.mtimeMs);

  if (!candidates.length) {
    throw new Error(
      "No registry-integrity JSON report was found. Run npm.cmd run audit:registry-full first.",
    );
  }

  return candidates[0];
}

function validateAudit(audit) {
  if (!audit || typeof audit !== "object") {
    throw new Error("Audit report is not valid JSON.");
  }

  const summary = audit.summary || {};

  const blockers = [
    ["core/detail mismatches", numeric(summary.core_detail_variety_mismatches)],
    ["missing details", numeric(summary.missing_details_documents)],
    ["orphan details", numeric(summary.orphan_details_documents)],
    ["invalid traits JSON", numeric(summary.invalid_traits_json)],
    ["invalid details JSON", numeric(summary.invalid_details_json)],
  ].filter(([, count]) => count !== 0);

  if (blockers.length) {
    throw new Error(
      `Refusing to dedupe because the latest audit still has blockers: ${blockers
        .map(([label, count]) => `${label}=${count}`)
        .join(", ")}.`,
    );
  }

  const allDuplicates = Array.isArray(audit.canonical_duplicates)
    ? audit.canonical_duplicates
    : [];

  const safeGroups = allDuplicates.filter(
    (group) => group?.classification === EXPECTED_CLASSIFICATION,
  );

  const unexpectedSafe = safeGroups.filter(
    (group) => !ALLOWED_CANONICALS.has(group?.canonical),
  );

  if (unexpectedSafe.length) {
    throw new Error(
      `Refusing to run because the audit contains new/unexpected safe groups: ${unexpectedSafe
        .map((group) => group?.canonical || "(unknown)")
        .join(", ")}. Review them first.`,
    );
  }

  const groups = [...ALLOWED_CANONICALS].map((canonical) => {
    const group = safeGroups.find((item) => item?.canonical === canonical);

    if (!group) {
      throw new Error(
        `Expected safe group ${canonical} is missing from the latest audit. Nothing was changed.`,
      );
    }

    if (!Array.isArray(group.records) || group.records.length !== 2) {
      throw new Error(
        `${canonical} does not contain exactly 2 records. Nothing was changed.`,
      );
    }

    const canonicalRows = group.records.filter((record) =>
      String(record?.id || "").startsWith("sc_"),
    );
    const migrationRows = group.records.filter(
      (record) => !String(record?.id || "").startsWith("sc_"),
    );

    if (canonicalRows.length !== 1 || migrationRows.length !== 1) {
      throw new Error(
        `${canonical} does not have exactly one canonical sc_ record and one migration-created record.`,
      );
    }

    return {
      canonical,
      keep: canonicalRows[0],
      remove: migrationRows[0],
    };
  });

  return groups;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function makeApi({ endpoint, projectId, apiKey }) {
  const base = endpoint.replace(/\/+$/, "");

  async function request(method, route, { body, allow404 = false } = {}) {
    const url = `${base}${route}`;
    let lastError = null;

    for (let attempt = 1; attempt <= 4; attempt += 1) {
      try {
        const response = await fetch(url, {
          method,
          headers: {
            "X-Appwrite-Project": projectId,
            "X-Appwrite-Key": apiKey,
            "Content-Type": "application/json",
          },
          body: body === undefined ? undefined : JSON.stringify(body),
        });

        if (allow404 && response.status === 404) {
          return null;
        }

        const text = await response.text();
        let payload = null;
        try {
          payload = text ? JSON.parse(text) : null;
        } catch {
          payload = text || null;
        }

        if (!response.ok) {
          const message =
            payload?.message ||
            payload?.error ||
            (typeof payload === "string" ? payload : "") ||
            `${response.status} ${response.statusText}`;

          const error = new Error(
            `${method} ${route} failed: ${message}`,
          );
          error.status = response.status;
          throw error;
        }

        return payload;
      } catch (error) {
        lastError = error;
        const status = Number(error?.status || 0);
        const retryable =
          status === 0 ||
          status === 408 ||
          status === 429 ||
          status >= 500;

        if (!retryable || attempt === 4) throw error;
        await sleep(Math.min(1000 * attempt, 4000));
      }
    }

    throw lastError || new Error("Appwrite request failed.");
  }

  return { request };
}

async function listCollections(api, databaseId) {
  const route =
    `/databases/${encodeURIComponent(databaseId)}/collections`;

  const payload = await api.request("GET", route);
  const collections = Array.isArray(payload?.collections)
    ? payload.collections
    : [];

  if (!collections.length) {
    throw new Error(
      `No collections were returned for database ${databaseId}.`,
    );
  }

  return collections;
}

async function getDocument(api, databaseId, collectionId, documentId) {
  return api.request(
    "GET",
    `/databases/${encodeURIComponent(databaseId)}` +
      `/collections/${encodeURIComponent(collectionId)}` +
      `/documents/${encodeURIComponent(documentId)}`,
    { allow404: true },
  );
}

async function deleteDocument(api, databaseId, collectionId, documentId) {
  return api.request(
    "DELETE",
    `/databases/${encodeURIComponent(databaseId)}` +
      `/collections/${encodeURIComponent(collectionId)}` +
      `/documents/${encodeURIComponent(documentId)}`,
  );
}

function sameCanonicalVariety(document, expectedCanonical) {
  const candidates = [
    document?.variety,
    document?.cultivar,
    document?.name,
    document?.display_name,
  ].filter((value) => String(value ?? "").trim());

  if (!candidates.length) return true;

  return candidates.some(
    (value) => canonicalizeVariety(value) === expectedCanonical,
  );
}

async function main() {
  const env = loadEnvironment();

  const endpoint =
    env.APPWRITE_ENDPOINT ||
    env.VITE_APPWRITE_ENDPOINT ||
    "https://fra.cloud.appwrite.io/v1";

  const projectId =
    env.APPWRITE_PROJECT_ID ||
    env.VITE_APPWRITE_PROJECT_ID;

  const databaseId =
    env.APPWRITE_DATABASE_ID ||
    env.VITE_APPWRITE_DATABASE_ID ||
    "germdatabase";

  const apiKey = env.APPWRITE_API_KEY;

  if (!projectId) {
    throw new Error(
      "APPWRITE_PROJECT_ID / VITE_APPWRITE_PROJECT_ID is missing.",
    );
  }

  if (!apiKey) {
    throw new Error(
      "APPWRITE_API_KEY is missing. Use a temporary server API key locally; never put it in Vercel or GitHub.",
    );
  }

  const auditFile = findLatestAuditReport();
  const audit = JSON.parse(fs.readFileSync(auditFile.fullPath, "utf8"));
  const groups = validateAudit(audit);

  console.log("");
  console.log("CaneSprout SAFE format-only dedupe v2.7.9");
  console.log(`Endpoint: ${endpoint}`);
  console.log(`Project:  ${projectId}`);
  console.log(`Database: ${databaseId}`);
  console.log(`Audit:    ${auditFile.fullPath}`);
  console.log("");
  console.log(
    "Allowed groups: PHIL56226, PHIL58260, PHIL992641",
  );
  console.log(
    "Conflicting historical observations and blank-variety rows are intentionally excluded.",
  );
  console.log("");

  const api = makeApi({ endpoint, projectId, apiKey });
  const collections = await listCollections(api, databaseId);

  const backup = {
    generated_at: new Date().toISOString(),
    mode: "safe-format-only-dedupe",
    source_audit: auditFile.fullPath,
    database_id: databaseId,
    groups: [],
  };

  for (const group of groups) {
    const found = [];

    for (const collection of collections) {
      const collectionId = collection?.$id || collection?.id;
      if (!collectionId) continue;

      const [keeperDoc, duplicateDoc] = await Promise.all([
        getDocument(api, databaseId, collectionId, group.keep.id),
        getDocument(api, databaseId, collectionId, group.remove.id),
      ]);

      if (!keeperDoc && !duplicateDoc) continue;

      if (!keeperDoc || !duplicateDoc) {
        throw new Error(
          `${group.canonical}: collection ${collectionId} contains only one side of the pair. Refusing partial cleanup.`,
        );
      }

      if (
        !sameCanonicalVariety(keeperDoc, group.canonical) ||
        !sameCanonicalVariety(duplicateDoc, group.canonical)
      ) {
        throw new Error(
          `${group.canonical}: live document identity in ${collectionId} no longer matches the audit. Nothing was deleted for this group.`,
        );
      }

      found.push({
        collectionId,
        keeper: keeperDoc,
        duplicate: duplicateDoc,
      });
    }

    if (!found.length) {
      throw new Error(
        `${group.canonical}: the live duplicate pair was not found together in any collection.`,
      );
    }

    backup.groups.push({
      canonical: group.canonical,
      keep_id: group.keep.id,
      remove_id: group.remove.id,
      collections: found.map((item) => ({
        collection_id: item.collectionId,
        keeper: cleanDocument(item.keeper),
        duplicate: cleanDocument(item.duplicate),
      })),
    });
  }

  const reportsDir = path.resolve("reports");
  fs.mkdirSync(reportsDir, { recursive: true });

  const backupPath = path.join(
    reportsDir,
    "safe-format-dedupe-backup-v2.7.9.json",
  );

  fs.writeFileSync(
    backupPath,
    JSON.stringify(backup, null, 2) + "\n",
    "utf8",
  );

  console.log(`Backup written before deletion: ${backupPath}`);
  console.log("");

  const deletionLog = [];

  for (const group of backup.groups) {
    console.log(
      `Cleaning ${group.canonical}: keeping ${group.keep_id}, removing ${group.remove_id}`,
    );

    const orderedCollections = [...group.collections].sort((a, b) => {
      const aDetail = /detail/i.test(a.collection_id) ? 0 : 1;
      const bDetail = /detail/i.test(b.collection_id) ? 0 : 1;
      return aDetail - bDetail;
    });

    for (const item of orderedCollections) {
      await deleteDocument(
        api,
        databaseId,
        item.collection_id,
        group.remove_id,
      );

      deletionLog.push({
        canonical: group.canonical,
        collection_id: item.collection_id,
        deleted_id: group.remove_id,
      });

      console.log(
        `  deleted ${group.remove_id} from ${item.collection_id}`,
      );
    }
  }

  const resultPath = path.join(
    reportsDir,
    "safe-format-dedupe-result-v2.7.9.json",
  );

  fs.writeFileSync(
    resultPath,
    JSON.stringify(
      {
        completed_at: new Date().toISOString(),
        kept: groups.map((group) => ({
          canonical: group.canonical,
          id: group.keep.id,
        })),
        deleted: deletionLog,
        untouched_conflicting_groups: [
          "PHIL931902349",
          "PHIL98010007",
          "VMC73229",
        ],
        blank_variety_policy: "UNTOUCHED",
      },
      null,
      2,
    ) + "\n",
    "utf8",
  );

  console.log("");
  console.log(
    `Safe dedupe complete. Result: ${resultPath}`,
  );
  console.log(
    "Now run: npm.cmd run audit:registry-full",
  );
  console.log(
    "Expected duplicate groups afterward: 3, all SAME_IDENTITY_CONFLICTING_OBSERVATIONS.",
  );
  console.log(
    "Expected blank varieties afterward: 1 (left untouched on purpose).",
  );
  console.log("");
}

main().catch((error) => {
  console.error("");
  console.error("SAFE DEDUPE STOPPED.");
  console.error(error?.message || error);
  console.error("No further deletions will be attempted.");
  console.error("");
  process.exitCode = 1;
});