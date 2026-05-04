#!/usr/bin/env node
/**
 * Refresh staging GHL sub-account data from prod sub-account.
 *
 * Endpoint and pagination contracts come from the official GHL API v2 OpenAPI
 * specs (https://github.com/GoHighLevel/highlevel-api-docs). Every entity
 * documented as creatable is mirrored here; entities the API doesn't expose
 * for create (transactions, subscriptions, form/survey submissions, documents,
 * memberships) are listed for visibility only.
 *
 * Required env vars:
 *   GHL_PROD_KEY        Private Integration Token for prod sub-account
 *   GHL_PROD_LOC        Prod location ID  (jkxvgEvFdjquLpd4fomf)
 *   GHL_STAGING_KEY     PIT for AIME Staging sub-account
 *   GHL_STAGING_LOC     Staging location ID (PJAAN2zV4gJW33Sbm5Sr)
 *
 * Required PIT scopes (BOTH tokens — staging needs write, prod readonly is enough but full read+write avoids surprises):
 *   contacts.readonly contacts.write
 *   opportunities.readonly opportunities.write
 *   conversations.readonly conversations.write
 *   conversations/message.readonly conversations/message.write
 *   calendars.readonly calendars.write
 *   calendars/events.readonly calendars/events.write
 *   payments/orders.readonly payments/orders.write
 *   payments/transactions.readonly  (read-only — no write scope exists)
 *   payments/subscriptions.readonly (read-only — no write scope exists)
 *   payments/coupons.readonly payments/coupons.write
 *   forms.readonly  (read-only — submissions can't be POSTed back)
 *   surveys.readonly  (read-only — same as forms)
 *   invoices.readonly invoices.write
 *   invoices/schedule.readonly invoices/schedule.write
 *   products.readonly products.write
 *   medias.readonly medias.write
 *   objects.readonly objects.write
 *
 * Flags:
 *   --dry-run   Sample first page of each entity, log counts, no writes
 *   --resume    Skip entities already completed (state file: /tmp/refresh-ghl-state.json)
 *
 * Read-only entities (listed but not recreated, per docs):
 *   payments/transactions, payments/subscriptions, forms (definitions),
 *   form submissions, surveys (definitions), survey submissions,
 *   proposals/documents, courses/memberships
 */

import { writeFile, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';

// ============================================================================
// CONFIG
// ============================================================================

const BASE = 'https://services.leadconnectorhq.com';
const VERSION_DEFAULT = '2021-07-28';
const VERSION_CONVERSATIONS = '2021-04-15';
const RATE_LIMIT_MS = 120;
const MAX_RETRIES = 3;
const RETRY_BACKOFF_MS = 2000;
const STATE_FILE = '/tmp/refresh-ghl-state.json';
const PAGE_SIZE = 100;

const PROD_KEY = process.env.GHL_PROD_KEY;
const PROD_LOC = process.env.GHL_PROD_LOC;
const STAGING_KEY = process.env.GHL_STAGING_KEY;
const STAGING_LOC = process.env.GHL_STAGING_LOC;

if (!PROD_KEY || !PROD_LOC || !STAGING_KEY || !STAGING_LOC) {
  console.error('Required env: GHL_PROD_KEY, GHL_PROD_LOC, GHL_STAGING_KEY, GHL_STAGING_LOC');
  process.exit(1);
}
if (PROD_LOC === STAGING_LOC) {
  console.error('PROD_LOC === STAGING_LOC — refusing to copy data onto itself');
  process.exit(1);
}

const RESUME = process.argv.includes('--resume');
const DRY_RUN = process.argv.includes('--dry-run');

// ============================================================================
// HTTP CLIENT
// ============================================================================

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const REQUEST_TIMEOUT_MS = 30000; // hard cap so a hung HTTPS connection can't stall a worker

async function ghl(key, method, path, { body, version = VERSION_DEFAULT } = {}) {
  let lastErr;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    if (attempt > 0) await sleep(RETRY_BACKOFF_MS * attempt);
    let res;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      res = await fetch(`${BASE}${path}`, {
        method,
        headers: {
          Authorization: `Bearer ${key}`,
          Version: version,
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: body !== undefined ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });
    } catch (err) {
      lastErr = err;
      continue;
    } finally {
      clearTimeout(timer);
    }
    if (res.status === 429) {
      const wait = parseInt(res.headers.get('retry-after') || '5', 10) * 1000;
      await sleep(wait);
      continue;
    }
    if (res.status >= 500) {
      lastErr = new Error(`${method} ${path} → ${res.status}`);
      continue;
    }
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`${method} ${path} → ${res.status}: ${text.slice(0, 500)}`);
    }
    if (res.status === 204) return null;
    const ct = res.headers.get('content-type') || '';
    return ct.includes('application/json') ? res.json() : res.text();
  }
  throw lastErr ?? new Error(`${method} ${path} retries exhausted`);
}

const prodGet = (path, opts) => ghl(PROD_KEY, 'GET', path, opts);
const prodPost = (path, body, opts) => ghl(PROD_KEY, 'POST', path, { ...opts, body });
const stgGet = (path, opts) => ghl(STAGING_KEY, 'GET', path, opts);
const stgPost = (path, body, opts) => ghl(STAGING_KEY, 'POST', path, { ...opts, body });
const stgDelete = (path, opts) => ghl(STAGING_KEY, 'DELETE', path, opts);

// ============================================================================
// PAGINATION HELPERS — one per documented pattern
// ============================================================================

/** Cursor: contacts. Body has searchAfter; each contact returns its own searchAfter array. */
async function paginateContactsSearch(key, locationId) {
  const all = [];
  let searchAfter = null;
  let total = null;
  while (true) {
    const body = { locationId, pageLimit: PAGE_SIZE };
    if (searchAfter) body.searchAfter = searchAfter;
    const data = await ghl(key, 'POST', '/contacts/search', { body });
    if (total === null) total = data?.total ?? 0;
    const items = data?.contacts ?? [];
    if (items.length === 0) break;
    all.push(...items);
    if (DRY_RUN) { console.log(`    [dry-run] sampled page 1 (${items.length}/${total} contacts)`); break; }
    if (all.length >= total || items.length < PAGE_SIZE) break;
    searchAfter = items[items.length - 1]?.searchAfter ?? null;
    if (!searchAfter) break;
    await sleep(RATE_LIMIT_MS);
  }
  return all;
}

/** Cursor: opportunities. GET /opportunities/search?location_id=...&startAfter=...&startAfterId=... */
async function paginateOpportunitiesSearch(key, locationId) {
  const all = [];
  let startAfter = null;
  let startAfterId = null;
  let total = null;
  while (true) {
    const params = new URLSearchParams({ location_id: locationId, limit: String(PAGE_SIZE) });
    if (startAfter) params.set('startAfter', String(startAfter));
    if (startAfterId) params.set('startAfterId', startAfterId);
    const data = await ghl(key, 'GET', `/opportunities/search?${params}`);
    if (total === null) total = data?.meta?.total ?? 0;
    const items = data?.opportunities ?? [];
    if (items.length === 0) break;
    all.push(...items);
    if (DRY_RUN) { console.log(`    [dry-run] sampled page 1 (${items.length}/${total} opportunities)`); break; }
    if (all.length >= total || items.length < PAGE_SIZE) break;
    startAfter = data?.meta?.startAfter ?? null;
    startAfterId = data?.meta?.startAfterId ?? null;
    if (!startAfterId) break;
    await sleep(RATE_LIMIT_MS);
  }
  return all;
}

/** Offset: payments + invoices + products. ?limit=&offset= */
async function paginateOffset(key, basePath, listKey, extraParams = {}, version) {
  const all = [];
  let offset = 0;
  let total = null;
  while (true) {
    const params = new URLSearchParams({ ...extraParams, limit: String(PAGE_SIZE), offset: String(offset) });
    const data = await ghl(key, 'GET', `${basePath}?${params}`, { version });
    if (total === null) total = data?.totalCount ?? data?.total ?? null;
    const items = data?.[listKey] ?? data?.data ?? [];
    if (items.length === 0) break;
    all.push(...items);
    if (DRY_RUN) { console.log(`    [dry-run] sampled offset=0 (${items.length} ${listKey})`); break; }
    if (items.length < PAGE_SIZE) break;
    if (total !== null && all.length >= total) break;
    offset += items.length;
    await sleep(RATE_LIMIT_MS);
  }
  return all;
}

/** Cursor: conversations. ?startAfterDate=...&locationId=... */
async function paginateConversationsSearch(key, locationId) {
  const all = [];
  let startAfterDate = null;
  while (true) {
    const params = new URLSearchParams({ locationId, limit: String(PAGE_SIZE) });
    if (startAfterDate) params.set('startAfterDate', String(startAfterDate));
    const data = await ghl(key, 'GET', `/conversations/search?${params}`, { version: VERSION_CONVERSATIONS });
    const items = data?.conversations ?? [];
    if (items.length === 0) break;
    all.push(...items);
    if (DRY_RUN) { console.log(`    [dry-run] sampled first batch (${items.length} conversations)`); break; }
    if (items.length < PAGE_SIZE) break;
    const last = items[items.length - 1];
    startAfterDate = last.dateUpdated ?? last.lastMessageDate ?? null;
    if (!startAfterDate) break;
    await sleep(RATE_LIMIT_MS);
  }
  return all;
}

// ============================================================================
// STATE / IDMAPS
// ============================================================================

const idMap = {
  contacts: new Map(),
  opportunities: new Map(),
  conversations: new Map(),
  appointments: new Map(),
  coupons: new Map(),
  invoices: new Map(),
  invoiceSchedules: new Map(),
  products: new Map(),
  customObjects: new Map(),
  customObjectRecords: new Map(),
};

const state = { completedSteps: [] };

async function loadState() {
  if (RESUME && existsSync(STATE_FILE)) {
    const saved = JSON.parse(await readFile(STATE_FILE, 'utf8'));
    state.completedSteps = saved.completedSteps ?? [];
    if (saved.lastNestedIndex !== undefined) state.lastNestedIndex = saved.lastNestedIndex;
    for (const [k, entries] of Object.entries(saved.idMap ?? {})) {
      if (idMap[k]) idMap[k] = new Map(entries);
    }
    console.log(`  resumed; completed: ${state.completedSteps.join(', ') || '(none)'}; nested-resume-from: ${state.lastNestedIndex ?? 0}`);
  }
}

async function saveState() {
  const data = {
    completedSteps: state.completedSteps,
    lastNestedIndex: state.lastNestedIndex,
    idMap: Object.fromEntries(Object.entries(idMap).map(([k, m]) => [k, [...m.entries()]])),
  };
  await writeFile(STATE_FILE, JSON.stringify(data, null, 2));
}

const isCompleted = (step) => state.completedSteps.includes(step);
async function markCompleted(step) {
  if (!state.completedSteps.includes(step)) state.completedSteps.push(step);
  await saveState();
}

const strip = (obj, keys) => {
  const out = { ...obj };
  for (const k of keys) delete out[k];
  return out;
};

// ============================================================================
// CONTACTS
// ============================================================================

// Whitelist of fields the POST /contacts/ endpoint accepts. The list
// response (POST /contacts/search) returns a superset including legacy/
// computed fields (address, businessName, firstNameLowerCase, contactName,
// businessId) that the create endpoint rejects with 422.
//
// `assignedTo` is intentionally excluded — it's a prod user UUID that
// doesn't exist on staging (staging only has Waleed; per AIME-8 memory).
const CONTACT_CREATE_FIELDS = [
  'firstName', 'lastName', 'name', 'email', 'phone',
  'companyName',
  'address1', 'city', 'state', 'country', 'postalCode',
  'website', 'timezone', 'source', 'dateOfBirth',
  'dnd', 'dndSettings', 'inboundDndSettings',
  'type', 'customFields', 'tags',
  'phoneLabel', 'additionalPhones', 'additionalEmails',
];

function pickContactPayload(c, locationId) {
  const out = { locationId };
  for (const k of CONTACT_CREATE_FIELDS) {
    if (c[k] !== undefined && c[k] !== null) out[k] = c[k];
  }
  // Email: drop if malformed — the API rejects with "email must be an email"
  // and the contact won't get created at all. Better to create with phone/name
  // than to lose the entire contact for one bad email field.
  if (out.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(out.email)) {
    delete out.email;
  }
  // dateOfBirth: list returns it as either a number (epoch ms — most common)
  // or an ISO timestamp string. Create wants a date-only string ("YYYY-MM-DD").
  if (typeof out.dateOfBirth === 'number') {
    out.dateOfBirth = new Date(out.dateOfBirth).toISOString().slice(0, 10);
  } else if (typeof out.dateOfBirth === 'string' && out.dateOfBirth.length > 10) {
    out.dateOfBirth = out.dateOfBirth.slice(0, 10);
  } else if (out.dateOfBirth !== undefined && typeof out.dateOfBirth !== 'string') {
    delete out.dateOfBirth;  // unknown shape — drop rather than fail
  }
  // additionalEmails: list returns objects with `validEmailDate` sub-property
  // that create rejects; keep only the `email` field per item.
  if (Array.isArray(out.additionalEmails)) {
    out.additionalEmails = out.additionalEmails
      .filter((e) => e && typeof e === 'object' && e.email)
      .map((e) => ({ email: e.email }));
    if (out.additionalEmails.length === 0) delete out.additionalEmails;
  }
  // dndSettings: API rejects "permanent" status on SMS (compliance restriction).
  // Convert any per-channel "permanent" status to "inactive" — the contact still
  // copies, just without the carry-over of the permanent DND flag.
  if (out.dndSettings && typeof out.dndSettings === 'object') {
    for (const channel of Object.keys(out.dndSettings)) {
      const setting = out.dndSettings[channel];
      if (setting && typeof setting === 'object' && setting.status === 'permanent') {
        setting.status = 'inactive';
      }
    }
  }
  return out;
}

async function copyContacts() {
  if (isCompleted('contacts')) { console.log('[contacts] skipped'); return; }
  console.log('[contacts] starting');

  const stagingExisting = await paginateContactsSearch(STAGING_KEY, STAGING_LOC);
  console.log(`  Staging has ${stagingExisting.length} contacts to delete`);
  if (!DRY_RUN) {
    let deleted = 0;
    for (const c of stagingExisting) {
      try { await stgDelete(`/contacts/${c.id}`); deleted++; } catch {}
      if (deleted % 100 === 0 && deleted > 0) console.log(`    deleted ${deleted}/${stagingExisting.length}`);
      await sleep(RATE_LIMIT_MS);
    }
    console.log(`  Deleted ${deleted}`);
  }

  const prod = await paginateContactsSearch(PROD_KEY, PROD_LOC);
  console.log(`  Listed ${prod.length} prod contacts`);

  let ok = 0, fail = 0;
  for (let i = 0; i < prod.length; i++) {
    const c = prod[i];
    if (DRY_RUN) { ok++; continue; }
    const payload = pickContactPayload(c, STAGING_LOC);
    try {
      const created = await stgPost('/contacts/', payload);
      const newId = created?.contact?.id ?? created?.id;
      if (newId) idMap.contacts.set(c.id, newId);
      ok++;
    } catch (err) {
      fail++;
      if (fail <= 5) console.error(`  contact ${c.email || c.id}: ${err.message}`);
    }
    if ((i + 1) % 100 === 0) {
      console.log(`    ${i + 1}/${prod.length} (ok=${ok}, fail=${fail})`);
      await saveState();
    }
    await sleep(RATE_LIMIT_MS);
  }
  console.log(`[contacts] done — ${ok} ok, ${fail} fail`);
  await markCompleted('contacts');
}

// ============================================================================
// PER-CONTACT NESTED RESOURCES (notes, tasks, tag attachments, followers)
// ============================================================================

// Tracks unique error patterns we've already logged so we don't spam stderr.
const seenErrorPatterns = new Set();

function logUniqueError(stage, prodId, err) {
  // Dedup key: strip per-contact IDs and traceIds out of the error message
  // so "POST /contacts/X/notes → 422: {...}" and "POST /contacts/Y/notes → 422: {...}"
  // match the same pattern.
  const dedupMessage = err.message
    .replace(/\/contacts\/[A-Za-z0-9]+/g, '/contacts/{id}')
    .replace(/"traceId":"[^"]+"/g, '"traceId":"..."')
    .slice(0, 200);
  const key = `${stage}|${dedupMessage}`;
  if (seenErrorPatterns.has(key)) return;
  seenErrorPatterns.add(key);
  console.error(`  ERR [${stage}] new pattern (#${seenErrorPatterns.size}) — contact=${prodId}: ${err.message}`);
}

async function processOneContact(prodId, totals) {
  const stgId = idMap.contacts.get(prodId);

  // notes (whitelist: only `body`; bodyText/userId/pinned/relations rejected)
  try {
    const data = await prodGet(`/contacts/${prodId}/notes`);
    for (const n of (data?.notes ?? [])) {
      if (DRY_RUN) { totals.notes++; continue; }
      if (!n.body) continue;
      try {
        await stgPost(`/contacts/${stgId}/notes`, { body: n.body });
        totals.notes++;
      } catch (err) {
        totals.fail++;
        logUniqueError('notes', prodId, err);
      }
      await sleep(RATE_LIMIT_MS);
    }
  } catch (err) { logUniqueError('notes-fetch', prodId, err); }

  // tasks (whitelist: title, dueDate, completed required)
  try {
    const data = await prodGet(`/contacts/${prodId}/tasks`);
    for (const t of (data?.tasks ?? [])) {
      if (DRY_RUN) { totals.tasks++; continue; }
      if (!t.title || !t.dueDate) continue;
      const payload = { title: t.title, dueDate: t.dueDate, completed: Boolean(t.completed) };
      if (t.body) payload.body = t.body;
      try {
        await stgPost(`/contacts/${stgId}/tasks`, payload);
        totals.tasks++;
      } catch (err) {
        totals.fail++;
        logUniqueError('tasks', prodId, err);
      }
      await sleep(RATE_LIMIT_MS);
    }
  } catch (err) { logUniqueError('tasks-fetch', prodId, err); }

  // tags only (followers intentionally dropped — array contains prod user IDs
  // that don't exist on staging; mapping isn't desired per scope decision).
  try {
    const c = await prodGet(`/contacts/${prodId}`);
    const tags = c?.contact?.tags ?? [];
    if (tags.length > 0) {
      try {
        if (!DRY_RUN) await stgPost(`/contacts/${stgId}/tags`, { tags });
        totals.tags += tags.length;
      } catch (err) {
        totals.fail++;
        logUniqueError('tags', prodId, err);
      }
    }
  } catch (err) {
    totals.fail++;
    logUniqueError('contact-fetch', prodId, err);
  }
}

async function copyPerContactNested() {
  if (isCompleted('perContactNested')) { console.log('[per-contact nested] skipped'); return; }
  const NESTED_CONCURRENCY = 5; // bursty; 429s handled via Retry-After backoff
  const totals = { notes: 0, tasks: 0, tags: 0, followers: 0, fail: 0 };
  const prodIds = [...idMap.contacts.keys()];
  const startIdx = state.lastNestedIndex ?? 0;
  console.log(`[per-contact nested] starting (concurrency=${NESTED_CONCURRENCY}, from idx ${startIdx}/${prodIds.length})`);

  for (let i = startIdx; i < prodIds.length; i += NESTED_CONCURRENCY) {
    const batchEnd = Math.min(i + NESTED_CONCURRENCY, prodIds.length);
    const batch = prodIds.slice(i, batchEnd);
    await Promise.all(batch.map((prodId) => processOneContact(prodId, totals)));

    if (batchEnd % 100 === 0 || batchEnd === prodIds.length) {
      state.lastNestedIndex = batchEnd;
      console.log(`    contact ${batchEnd}/${prodIds.length} (notes=${totals.notes}, tasks=${totals.tasks}, tags=${totals.tags}, followers=${totals.followers})`);
      await saveState();
    }
  }

  delete state.lastNestedIndex;
  console.log(`[per-contact nested] done — notes=${totals.notes}, tasks=${totals.tasks}, tags=${totals.tags}, followers=${totals.followers}, fail=${totals.fail}`);
  await markCompleted('perContactNested');
}

// ============================================================================
// OPPORTUNITIES (cursor-based; ID remapping via contact map)
// ============================================================================

// Whitelist of fields the POST /opportunities/ endpoint accepts. The list
// response returns a superset including computed/legacy fields:
// pipelineStageUId, lastStatusChangeAt, lastStageChangeAt, createdAt,
// updatedAt, effectiveProbability, followers, relations, contact, sort,
// attributions — all rejected by create. pipelineId + pipelineStageId are
// remapped via a name-based lookup (snapshot regenerates IDs).
const OPPORTUNITY_CREATE_FIELDS = [
  'name', 'status', 'monetaryValue',
  'source', 'customFields', 'tags', 'notes',
];

// Maps populated once at start of copyOpportunities (name-based lookup since
// snapshot regenerates pipeline/stage IDs).
const pipelineIdMap = new Map();        // prod_pipeline_id → staging_pipeline_id
const stageIdMap = new Map();           // prod_stage_id → staging_stage_id
const stagingPipelineIdsByName = new Map(); // pipeline_name → staging_pipeline_id (debug)

async function buildPipelineMaps() {
  const [prodResp, stgResp] = await Promise.all([
    prodGet(`/opportunities/pipelines?locationId=${PROD_LOC}`),
    stgGet(`/opportunities/pipelines?locationId=${STAGING_LOC}`),
  ]);
  const prodPipelines = prodResp?.pipelines ?? [];
  const stgPipelines = stgResp?.pipelines ?? [];

  // Build name → staging pipeline map
  const stgByName = new Map();
  for (const p of stgPipelines) stgByName.set(p.name, p);

  let matched = 0, unmatched = 0;
  for (const pp of prodPipelines) {
    const sp = stgByName.get(pp.name);
    if (!sp) { unmatched++; continue; }
    pipelineIdMap.set(pp.id, sp.id);
    stagingPipelineIdsByName.set(pp.name, sp.id);
    // Build stage maps (each pipeline has its own stages)
    const stgStagesByName = new Map();
    for (const s of (sp.stages ?? [])) stgStagesByName.set(s.name, s);
    for (const ps of (pp.stages ?? [])) {
      const ss = stgStagesByName.get(ps.name);
      if (ss) stageIdMap.set(ps.id, ss.id);
    }
    matched++;
  }
  console.log(`  Pipeline ID maps built: ${matched} matched / ${unmatched} unmatched (prod has ${prodPipelines.length} pipelines, staging has ${stgPipelines.length})`);
  console.log(`  Stage ID map: ${stageIdMap.size} prod stages mapped to staging`);
}

function pickOpportunityPayload(o, locationId, stgContactId) {
  const out = { locationId, contactId: stgContactId };
  for (const k of OPPORTUNITY_CREATE_FIELDS) {
    if (o[k] !== undefined && o[k] !== null) out[k] = o[k];
  }
  // Remap pipelineId + pipelineStageId from prod IDs → staging IDs
  out.pipelineId = pipelineIdMap.get(o.pipelineId) ?? null;
  out.pipelineStageId = stageIdMap.get(o.pipelineStageId) ?? null;
  return out;
}

async function copyOpportunities() {
  if (isCompleted('opportunities')) { console.log('[opportunities] skipped'); return; }
  console.log('[opportunities] starting');
  await buildPipelineMaps();

  const stagingExisting = await paginateOpportunitiesSearch(STAGING_KEY, STAGING_LOC);
  console.log(`  Staging has ${stagingExisting.length} to delete`);
  if (!DRY_RUN) {
    for (const o of stagingExisting) {
      try { await stgDelete(`/opportunities/${o.id}`); } catch {}
      await sleep(RATE_LIMIT_MS);
    }
  }

  const prod = await paginateOpportunitiesSearch(PROD_KEY, PROD_LOC);
  console.log(`  Listed ${prod.length} prod opportunities`);

  let ok = 0, fail = 0, orphan = 0, unmappedPipeline = 0;
  const oppErrorPatterns = new Set();
  for (let i = 0; i < prod.length; i++) {
    const o = prod[i];
    if (DRY_RUN) { ok++; continue; }
    const stgContactId = idMap.contacts.get(o.contactId);
    if (!stgContactId) { orphan++; continue; }
    const payload = pickOpportunityPayload(o, STAGING_LOC, stgContactId);
    if (!payload.pipelineId || !payload.pipelineStageId) {
      unmappedPipeline++;
      if (unmappedPipeline <= 3) console.error(`  opp ${o.id}: pipeline/stage not in name-map (prod_pipeline=${o.pipelineId})`);
      continue;
    }
    try {
      const created = await stgPost('/opportunities/', payload);
      const newId = created?.opportunity?.id ?? created?.id;
      if (newId) idMap.opportunities.set(o.id, newId);
      ok++;
    } catch (err) {
      fail++;
      // Log unique error patterns (same dedup approach as nested step).
      const dedup = err.message
        .replace(/\/opportunities\/[A-Za-z0-9]+/g, '/opportunities/{id}')
        .replace(/"traceId":"[^"]+"/g, '"traceId":"..."')
        .slice(0, 200);
      if (!oppErrorPatterns.has(dedup)) {
        oppErrorPatterns.add(dedup);
        console.error(`  ERR [opp] new pattern (#${oppErrorPatterns.size}) — opp=${o.id}: ${err.message}`);
      }
    }
    if ((i + 1) % 100 === 0) {
      console.log(`    ${i + 1}/${prod.length} (ok=${ok}, fail=${fail}, orphan=${orphan}, unmappedPipeline=${unmappedPipeline})`);
      await saveState();
    }
    await sleep(RATE_LIMIT_MS);
  }
  console.log(`[opportunities] done — ${ok} ok, ${fail} fail, ${orphan} orphan, ${unmappedPipeline} unmapped-pipeline`);
  await markCompleted('opportunities');
}

// ============================================================================
// CONVERSATIONS + MESSAGES
// ============================================================================

async function copyConversations() {
  if (isCompleted('conversations')) { console.log('[conversations] skipped'); return; }
  console.log('[conversations] starting');
  const prod = await paginateConversationsSearch(PROD_KEY, PROD_LOC);
  console.log(`  Listed ${prod.length} prod conversations`);

  let ok = 0, fail = 0;
  for (let i = 0; i < prod.length; i++) {
    const c = prod[i];
    if (DRY_RUN) { ok++; continue; }
    const stgContactId = idMap.contacts.get(c.contactId);
    if (!stgContactId) { fail++; continue; }
    try {
      const created = await stgPost('/conversations/', { locationId: STAGING_LOC, contactId: stgContactId }, { version: VERSION_CONVERSATIONS });
      const newId = created?.conversation?.id ?? created?.id;
      if (!newId) { fail++; continue; }
      idMap.conversations.set(c.id, newId);

      // Copy messages (cursor-based via lastMessageId)
      let lastMessageId = null;
      while (true) {
        const params = new URLSearchParams({ limit: String(PAGE_SIZE) });
        if (lastMessageId) params.set('lastMessageId', lastMessageId);
        const mdata = await ghl(PROD_KEY, 'GET', `/conversations/${c.id}/messages?${params}`, { version: VERSION_CONVERSATIONS });
        const msgs = mdata?.messages?.messages ?? mdata?.messages ?? [];
        if (msgs.length === 0) break;
        for (const m of msgs) {
          try {
            await stgPost('/conversations/messages', {
              type: m.type,
              conversationId: newId,
              contactId: stgContactId,
              message: m.body ?? m.message ?? '',
              direction: m.direction,
            }, { version: VERSION_CONVERSATIONS });
          } catch {}
          await sleep(RATE_LIMIT_MS);
        }
        if (msgs.length < PAGE_SIZE) break;
        lastMessageId = msgs[msgs.length - 1].id;
      }
      ok++;
    } catch (err) {
      fail++;
    }
    if ((i + 1) % 50 === 0) {
      console.log(`    ${i + 1}/${prod.length} (ok=${ok}, fail=${fail})`);
      await saveState();
    }
    await sleep(RATE_LIMIT_MS);
  }
  console.log(`[conversations] done — ${ok} ok, ${fail} fail`);
  await markCompleted('conversations');
}

// ============================================================================
// CALENDAR APPOINTMENTS
// ============================================================================

async function copyAppointments() {
  if (isCompleted('appointments')) { console.log('[appointments] skipped'); return; }
  console.log('[appointments] starting');
  const cdata = await prodGet(`/calendars/?locationId=${PROD_LOC}`);
  const calendars = cdata?.calendars ?? [];
  console.log(`  ${calendars.length} calendars in prod`);

  // We use a wide time window (2-yr historical, 2-yr forward).
  const now = new Date();
  const startTime = new Date(now.getTime() - 2 * 365 * 24 * 3600 * 1000).toISOString();
  const endTime = new Date(now.getTime() + 2 * 365 * 24 * 3600 * 1000).toISOString();

  let ok = 0, fail = 0, total = 0;
  for (const cal of calendars) {
    let events = [];
    try {
      const params = new URLSearchParams({ locationId: PROD_LOC, calendarId: cal.id, startTime, endTime });
      const e = await prodGet(`/calendars/events?${params}`);
      events = e?.events ?? [];
    } catch {}
    for (const ev of events) {
      total++;
      if (DRY_RUN) { ok++; continue; }
      const stgContactId = idMap.contacts.get(ev.contactId);
      if (!stgContactId) { fail++; continue; }
      try {
        const created = await stgPost('/calendars/events/appointments', {
          ...strip(ev, ['id', 'locationId', 'contactId', 'calendarId']),
          locationId: STAGING_LOC,
          contactId: stgContactId,
          calendarId: cal.id,
        });
        const newId = created?.id ?? created?.event?.id;
        if (newId) idMap.appointments.set(ev.id, newId);
        ok++;
      } catch { fail++; }
      await sleep(RATE_LIMIT_MS);
    }
  }
  console.log(`[appointments] done — ${total} found, ${ok} ok, ${fail} fail`);
  await markCompleted('appointments');
}

// ============================================================================
// COUPONS (offset-based; writable)
// ============================================================================

async function copyCoupons() {
  if (isCompleted('coupons')) { console.log('[coupons] skipped'); return; }
  console.log('[coupons] starting');
  const prod = await paginateOffset(PROD_KEY, '/payments/coupon/list', 'coupons', { altId: PROD_LOC, altType: 'location' });
  console.log(`  Listed ${prod.length} prod coupons`);
  let ok = 0, fail = 0;
  for (const c of prod) {
    if (DRY_RUN) { ok++; continue; }
    try {
      const payload = { ...strip(c, ['_id', 'id', 'altId', 'altType']), altId: STAGING_LOC, altType: 'location' };
      const created = await stgPost('/payments/coupon', payload);
      if (created?._id) idMap.coupons.set(c._id, created._id);
      ok++;
    } catch { fail++; }
    await sleep(RATE_LIMIT_MS);
  }
  console.log(`[coupons] done — ${ok} ok, ${fail} fail`);
  await markCompleted('coupons');
}

// ============================================================================
// INVOICES (offset-based)
// ============================================================================

async function copyInvoices() {
  if (isCompleted('invoices')) { console.log('[invoices] skipped'); return; }
  console.log('[invoices] starting');
  const prod = await paginateOffset(PROD_KEY, '/invoices/', 'invoices', { altId: PROD_LOC, altType: 'location' });
  console.log(`  Listed ${prod.length} prod invoices`);
  let ok = 0, fail = 0;
  for (const inv of prod) {
    if (DRY_RUN) { ok++; continue; }
    const stgContactId = idMap.contacts.get(inv.contactDetails?.id ?? inv.contactId);
    if (!stgContactId) { fail++; continue; }
    try {
      const payload = {
        ...strip(inv, ['_id', 'id', 'altId', 'altType']),
        altId: STAGING_LOC,
        altType: 'location',
        contactDetails: { ...inv.contactDetails, id: stgContactId },
      };
      const created = await stgPost('/invoices/', payload);
      const newId = created?._id ?? created?.id;
      if (newId) idMap.invoices.set(inv._id ?? inv.id, newId);
      ok++;
    } catch { fail++; }
    await sleep(RATE_LIMIT_MS);
  }
  console.log(`[invoices] done — ${ok} ok, ${fail} fail`);
  await markCompleted('invoices');
}

// ============================================================================
// INVOICE SCHEDULES (offset-based)
// ============================================================================

async function copyInvoiceSchedules() {
  if (isCompleted('invoiceSchedules')) { console.log('[invoiceSchedules] skipped'); return; }
  console.log('[invoiceSchedules] starting');
  const prod = await paginateOffset(PROD_KEY, '/invoices/schedule/', 'schedules', { altId: PROD_LOC, altType: 'location' });
  console.log(`  Listed ${prod.length} prod invoice schedules`);
  let ok = 0, fail = 0;
  for (const s of prod) {
    if (DRY_RUN) { ok++; continue; }
    const stgContactId = idMap.contacts.get(s.contactDetails?.id ?? s.contactId);
    if (!stgContactId) { fail++; continue; }
    try {
      const payload = {
        ...strip(s, ['_id', 'id', 'altId', 'altType']),
        altId: STAGING_LOC,
        altType: 'location',
        contactDetails: { ...s.contactDetails, id: stgContactId },
      };
      const created = await stgPost('/invoices/schedule/', payload);
      const newId = created?._id ?? created?.id;
      if (newId) idMap.invoiceSchedules.set(s._id ?? s.id, newId);
      ok++;
    } catch { fail++; }
    await sleep(RATE_LIMIT_MS);
  }
  console.log(`[invoiceSchedules] done — ${ok} ok, ${fail} fail`);
  await markCompleted('invoiceSchedules');
}

// ============================================================================
// PRODUCTS (offset-based)
// ============================================================================

async function copyProducts() {
  if (isCompleted('products')) { console.log('[products] skipped'); return; }
  console.log('[products] starting');
  const prod = await paginateOffset(PROD_KEY, '/products/', 'products', { locationId: PROD_LOC });
  console.log(`  Listed ${prod.length} prod products`);
  let ok = 0, fail = 0;
  for (const p of prod) {
    if (DRY_RUN) { ok++; continue; }
    try {
      const payload = { ...strip(p, ['_id', 'id', 'locationId']), locationId: STAGING_LOC };
      const created = await stgPost('/products/', payload);
      const newId = created?._id ?? created?.id ?? created?.product?.id;
      if (newId) idMap.products.set(p._id ?? p.id, newId);
      ok++;
    } catch { fail++; }
    await sleep(RATE_LIMIT_MS);
  }
  console.log(`[products] done — ${ok} ok, ${fail} fail`);
  await markCompleted('products');
}

// ============================================================================
// CUSTOM OBJECTS + RECORDS
// ============================================================================

async function copyCustomObjectRecords() {
  if (isCompleted('customObjectRecords')) { console.log('[customObjectRecords] skipped'); return; }
  console.log('[customObjectRecords] starting');
  let totalRecords = 0, ok = 0, fail = 0;
  try {
    const objData = await prodGet(`/objects/?locationId=${PROD_LOC}`);
    const objects = objData?.objects ?? [];
    for (const obj of objects) {
      let records = [];
      try {
        const r = await prodPost(`/objects/${obj.key}/records/search`, {
          locationId: PROD_LOC,
          pageLimit: PAGE_SIZE,
        });
        records = r?.records ?? [];
        if (DRY_RUN) console.log(`    [dry-run] sampled ${records.length} ${obj.key} records`);
      } catch {}
      for (const rec of records) {
        totalRecords++;
        if (DRY_RUN) { ok++; continue; }
        try {
          const payload = { ...strip(rec, ['id', 'locationId']), locationId: STAGING_LOC };
          await stgPost(`/objects/${obj.key}/records`, payload);
          ok++;
        } catch { fail++; }
        await sleep(RATE_LIMIT_MS);
      }
    }
  } catch (err) {
    console.log(`  scope or endpoint issue: ${err.message}`);
  }
  console.log(`[customObjectRecords] done — ${totalRecords} found, ${ok} ok, ${fail} fail`);
  await markCompleted('customObjectRecords');
}

// ============================================================================
// READ-ONLY ENTITIES (per docs — no API path to recreate)
// ============================================================================

async function listReadOnly(name, key, basePath, listKey, params, version) {
  if (isCompleted(name)) { console.log(`[${name}] skipped`); return; }
  console.log(`[${name}] read-only listing`);
  try {
    const items = await paginateOffset(key, basePath, listKey, params, version);
    console.log(`  ${items.length} prod ${name} (logged, not recreated — no write endpoint)`);
  } catch (err) {
    console.log(`  unavailable: ${err.message}`);
  }
  await markCompleted(name);
}

const copyTransactions = () => listReadOnly('transactions', PROD_KEY, '/payments/transactions', 'transactions', { altId: PROD_LOC, altType: 'location' });
const copySubscriptions = () => listReadOnly('subscriptions', PROD_KEY, '/payments/subscriptions', 'subscriptions', { altId: PROD_LOC, altType: 'location' });
const copyOrders = () => listReadOnly('orders', PROD_KEY, '/payments/orders', 'orders', { altId: PROD_LOC, altType: 'location' });

async function copyFormSubmissions() {
  if (isCompleted('formSubmissions')) { console.log('[formSubmissions] skipped'); return; }
  console.log('[formSubmissions] read-only — auto-generated by form fills, not creatable via API');
  try {
    const data = await prodGet(`/forms/submissions?locationId=${PROD_LOC}&limit=${PAGE_SIZE}`);
    console.log(`  ${data?.submissions?.length ?? 0} prod submissions found (logged only)`);
  } catch (err) { console.log(`  ${err.message}`); }
  await markCompleted('formSubmissions');
}

async function copySurveySubmissions() {
  if (isCompleted('surveySubmissions')) { console.log('[surveySubmissions] skipped'); return; }
  console.log('[surveySubmissions] read-only — auto-generated, not creatable via API');
  try {
    const data = await prodGet(`/surveys/submissions?locationId=${PROD_LOC}&limit=${PAGE_SIZE}`);
    console.log(`  ${data?.submissions?.length ?? 0} prod submissions found (logged only)`);
  } catch (err) { console.log(`  ${err.message}`); }
  await markCompleted('surveySubmissions');
}

async function copyDocuments() {
  if (isCompleted('documents')) { console.log('[documents] skipped'); return; }
  console.log('[documents] read-only — no create endpoint for proposals/documents');
  try {
    const items = await paginateOffset(PROD_KEY, '/proposals/document', 'documents', { altId: PROD_LOC, altType: 'location' });
    console.log(`  ${items.length} prod documents (logged only)`);
  } catch (err) { console.log(`  ${err.message}`); }
  await markCompleted('documents');
}

async function copyMemberships() {
  if (isCompleted('memberships')) { console.log('[memberships] skipped'); return; }
  console.log('[memberships] minimal API — only POST /courses/courses-exporter/public/import documented; no list endpoint, skipping');
  await markCompleted('memberships');
}

// ============================================================================
// MAIN
// ============================================================================

async function main() {
  console.log('================================================================');
  console.log('GHL data refresh: prod → staging');
  console.log(`  PROD location:    ${PROD_LOC}`);
  console.log(`  STAGING location: ${STAGING_LOC}`);
  console.log(`  RESUME mode:      ${RESUME}`);
  console.log(`  DRY_RUN mode:     ${DRY_RUN}`);
  console.log(`  Rate limit:       ${RATE_LIMIT_MS}ms between calls`);
  console.log(`  State file:       ${STATE_FILE}`);
  console.log('================================================================');

  await loadState();

  // Each entity wrapped so a missing scope or transient failure doesn't kill
  // the rest of the run.
  async function safe(name, fn) {
    try { await fn(); }
    catch (err) { console.error(`[${name}] FAILED — continuing. ${err.message}`); }
  }

  // Order matters: contacts first; everything else references contactId.
  await safe('contacts', copyContacts);
  await safe('perContactNested', copyPerContactNested);
  await safe('opportunities', copyOpportunities);
  await safe('conversations', copyConversations);
  await safe('appointments', copyAppointments);
  await safe('coupons', copyCoupons);
  await safe('invoices', copyInvoices);
  await safe('invoiceSchedules', copyInvoiceSchedules);
  await safe('products', copyProducts);
  await safe('customObjectRecords', copyCustomObjectRecords);

  // Read-only listings (logged, not recreated):
  await safe('orders', copyOrders);
  await safe('transactions', copyTransactions);
  await safe('subscriptions', copySubscriptions);
  await safe('formSubmissions', copyFormSubmissions);
  await safe('surveySubmissions', copySurveySubmissions);
  await safe('documents', copyDocuments);
  await safe('memberships', copyMemberships);

  console.log('================================================================');
  console.log('GHL refresh complete.');
  for (const [k, m] of Object.entries(idMap)) {
    if (m.size > 0) console.log(`  ${k}: ${m.size}`);
  }
  console.log('================================================================');
}

main().catch((err) => {
  console.error('FATAL:', err);
  process.exit(1);
});
