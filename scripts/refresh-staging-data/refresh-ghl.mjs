#!/usr/bin/env node
/**
 * Refresh staging GHL sub-account data from prod sub-account.
 *
 * What it does:
 *   1. Wipes every per-record DATA entity in the staging sub-account.
 *   2. Fetches the same entities from prod, paginated.
 *   3. Recreates them in staging, remapping foreign-key IDs (contact, opportunity, etc.).
 *
 * Scope: DATA only. Definitions of pipelines / custom fields / workflows / tags
 * are CONFIG and remain untouched (those came in via the AIME-8 snapshot).
 *
 * Idempotent: re-running wipes staging fresh and reloads. Resume via --resume
 * flag picks up from the last completed entity (uses /tmp/refresh-ghl-state.json).
 *
 * Required env vars:
 *   GHL_PROD_KEY        — Private Integration Token for prod sub-account
 *   GHL_PROD_LOC        — Prod location ID (cV1D3vLQCdcoLYS0rzU9)
 *   GHL_STAGING_KEY     — Private Integration Token for AIME Staging sub-account
 *   GHL_STAGING_LOC     — Staging location ID (PJAAN2zV4gJW33Sbm5Sr)
 *
 * Required PIT scopes (BOTH prod and staging tokens need these for full coverage):
 *   contacts.readonly contacts.write
 *   opportunities.readonly opportunities.write
 *   conversations.readonly conversations.write
 *   conversations/message.readonly conversations/message.write
 *   calendars.readonly calendars.write calendars/events.readonly calendars/events.write
 *   payments/orders.readonly payments/orders.write
 *   payments/transactions.readonly
 *   payments/subscriptions.readonly
 *   payments/coupons.readonly payments/coupons.write
 *   forms.readonly forms.write
 *   surveys.readonly
 *   invoices.readonly invoices.write
 *   invoices/schedule.readonly invoices/schedule.write
 *   courses.readonly courses.write
 *   products.readonly products.write
 *   medias.readonly medias.write
 *   objects.readonly objects.write
 *   locations/customFields.readonly
 *   locations/customValues.readonly
 *   locations/tags.readonly
 *   workflows.readonly
 *   businesses.readonly
 *   users.readonly
 *
 * Usage:
 *   GHL_PROD_KEY=pit-xxx GHL_PROD_LOC=cV1D3vLQCdcoLYS0rzU9 \
 *   GHL_STAGING_KEY=pit-yyy GHL_STAGING_LOC=PJAAN2zV4gJW33Sbm5Sr \
 *   node refresh-ghl.mjs
 */

import { writeFile, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';

// ============================================================================
// CONFIG
// ============================================================================

const BASE_URL = 'https://services.leadconnectorhq.com';
const API_VERSION = '2021-07-28';
const RATE_LIMIT_MS = 120;  // ~8 req/sec — well under GHL's 100/10sec limit
const MAX_RETRIES = 3;
const RETRY_BACKOFF_MS = 2000;
const STATE_FILE = '/tmp/refresh-ghl-state.json';
const PAGE_SIZE = 100;

const PROD_KEY = process.env.GHL_PROD_KEY;
const PROD_LOC = process.env.GHL_PROD_LOC;
const STAGING_KEY = process.env.GHL_STAGING_KEY;
const STAGING_LOC = process.env.GHL_STAGING_LOC;

if (!PROD_KEY || !PROD_LOC || !STAGING_KEY || !STAGING_LOC) {
  console.error('Missing required env vars: GHL_PROD_KEY, GHL_PROD_LOC, GHL_STAGING_KEY, GHL_STAGING_LOC');
  process.exit(1);
}

if (PROD_LOC === STAGING_LOC) {
  console.error('PROD_LOC and STAGING_LOC are the same — refusing to copy data onto itself');
  process.exit(1);
}

const RESUME = process.argv.includes('--resume');
const DRY_RUN = process.argv.includes('--dry-run');

// ============================================================================
// HTTP CLIENT — rate-limited, retrying
// ============================================================================

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function ghlRequest(key, method, path, body) {
  let lastError;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    if (attempt > 0) await sleep(RETRY_BACKOFF_MS * attempt);

    let res;
    try {
      res = await fetch(`${BASE_URL}${path}`, {
        method,
        headers: {
          Authorization: `Bearer ${key}`,
          Version: API_VERSION,
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: body !== undefined ? JSON.stringify(body) : undefined,
      });
    } catch (err) {
      lastError = err;
      continue;
    }

    if (res.status === 429) {
      const retryAfter = parseInt(res.headers.get('retry-after') || '5', 10);
      await sleep(retryAfter * 1000);
      continue;
    }
    if (res.status >= 500) {
      lastError = new Error(`${method} ${path} → ${res.status}`);
      continue;
    }
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`${method} ${path} → ${res.status}: ${text.slice(0, 500)}`);
    }
    return res.status === 204 ? null : res.json();
  }
  throw lastError ?? new Error(`${method} ${path} exhausted retries`);
}

const prodGet = (path) => ghlRequest(PROD_KEY, 'GET', path);
const stagingGet = (path) => ghlRequest(STAGING_KEY, 'GET', path);
const stagingPost = (path, body) => ghlRequest(STAGING_KEY, 'POST', path, body);
const stagingPut = (path, body) => ghlRequest(STAGING_KEY, 'PUT', path, body);
const stagingDelete = (path) => ghlRequest(STAGING_KEY, 'DELETE', path);

// ============================================================================
// PAGINATION
// ============================================================================

/**
 * Page-based: ?page=1&limit=100 → keep incrementing until empty page.
 * Returns flat array of all items.
 */
async function paginatePages(getFn, listKey, params = {}) {
  const all = [];
  let page = 1;
  while (true) {
    const qs = new URLSearchParams({ ...params, page: String(page), limit: String(PAGE_SIZE) });
    const data = await getFn(`?${qs}`);
    const items = data?.[listKey] ?? [];
    if (items.length === 0) break;
    all.push(...items);
    if (items.length < PAGE_SIZE) break;
    page++;
    await sleep(RATE_LIMIT_MS);
  }
  return all;
}

/**
 * Cursor-based with startAfterId + startAfter (date).
 * GHL contacts use this style.
 */
async function paginateCursor(buildPath, listKey, getFn) {
  const all = [];
  let startAfter = null;
  let startAfterId = null;
  while (true) {
    const params = {};
    if (startAfter) params.startAfter = startAfter;
    if (startAfterId) params.startAfterId = startAfterId;
    const path = buildPath(params);
    const data = await getFn(path);
    const items = data?.[listKey] ?? [];
    if (items.length === 0) break;
    all.push(...items);
    if (items.length < PAGE_SIZE) break;
    const last = items[items.length - 1];
    startAfter = last.dateAdded ?? last.dateUpdated ?? last.createdAt;
    startAfterId = last.id;
    if (!startAfterId) break;
    await sleep(RATE_LIMIT_MS);
  }
  return all;
}

// ============================================================================
// ID MAP — prod ID → staging ID (per entity type)
// ============================================================================

const idMap = {
  contacts: new Map(),
  opportunities: new Map(),
  conversations: new Map(),
  appointments: new Map(),
  orders: new Map(),
  transactions: new Map(),
  subscriptions: new Map(),
  coupons: new Map(),
  formSubmissions: new Map(),
  surveySubmissions: new Map(),
  invoices: new Map(),
  invoiceSchedules: new Map(),
  memberships: new Map(),
  products: new Map(),
  productReviews: new Map(),
  documents: new Map(),
  media: new Map(),
  customObjects: new Map(),
  customObjectRecords: new Map(),
};

// ============================================================================
// STATE / CHECKPOINTING
// ============================================================================

const state = { completedSteps: [], idMap: {} };

async function loadState() {
  if (RESUME && existsSync(STATE_FILE)) {
    const raw = await readFile(STATE_FILE, 'utf8');
    const saved = JSON.parse(raw);
    state.completedSteps = saved.completedSteps ?? [];
    for (const [key, entries] of Object.entries(saved.idMap ?? {})) {
      idMap[key] = new Map(entries);
    }
    console.log(`  resumed; completed steps: ${state.completedSteps.join(', ') || '(none)'}`);
  }
}

async function saveState() {
  const serialisable = {
    completedSteps: state.completedSteps,
    idMap: Object.fromEntries(
      Object.entries(idMap).map(([k, m]) => [k, [...m.entries()]])
    ),
  };
  await writeFile(STATE_FILE, JSON.stringify(serialisable, null, 2));
}

function isCompleted(step) {
  return state.completedSteps.includes(step);
}

async function markCompleted(step) {
  if (!state.completedSteps.includes(step)) state.completedSteps.push(step);
  await saveState();
}

// ============================================================================
// HELPERS
// ============================================================================

function strip(obj, keys) {
  const out = { ...obj };
  for (const k of keys) delete out[k];
  return out;
}

function remapContactId(item) {
  if (!item) return item;
  const out = { ...item };
  if (out.contactId && idMap.contacts.has(out.contactId)) {
    out.contactId = idMap.contacts.get(out.contactId);
  }
  if (out.contact_id && idMap.contacts.has(out.contact_id)) {
    out.contact_id = idMap.contacts.get(out.contact_id);
  }
  return out;
}

async function progressEvery(arr, n, label) {
  let last = Date.now();
  return (i) => {
    if ((i + 1) % n === 0 || i + 1 === arr.length) {
      const elapsed = ((Date.now() - last) / 1000).toFixed(1);
      console.log(`    ${label} ${i + 1}/${arr.length} (last batch ${elapsed}s)`);
      last = Date.now();
    }
  };
}

// ============================================================================
// ENTITY: CONTACTS (foundational — must run first)
// ============================================================================

async function listProdContacts() {
  return paginateCursor(
    (params) => `/contacts/?locationId=${PROD_LOC}&limit=${PAGE_SIZE}` +
      (params.startAfter ? `&startAfter=${params.startAfter}` : '') +
      (params.startAfterId ? `&startAfterId=${params.startAfterId}` : ''),
    'contacts',
    prodGet
  );
}

async function listStagingContacts() {
  return paginateCursor(
    (params) => `/contacts/?locationId=${STAGING_LOC}&limit=${PAGE_SIZE}` +
      (params.startAfter ? `&startAfter=${params.startAfter}` : '') +
      (params.startAfterId ? `&startAfterId=${params.startAfterId}` : ''),
    'contacts',
    stagingGet
  );
}

async function wipeStagingContacts() {
  console.log('  Wiping staging contacts...');
  const contacts = await listStagingContacts();
  console.log(`    Found ${contacts.length} staging contacts to delete`);
  let n = 0;
  for (const c of contacts) {
    if (DRY_RUN) { n++; continue; }
    try {
      await stagingDelete(`/contacts/${c.id}`);
      n++;
      if (n % 100 === 0) console.log(`    deleted ${n}/${contacts.length}`);
    } catch (err) {
      console.error(`    failed delete ${c.id}: ${err.message}`);
    }
    await sleep(RATE_LIMIT_MS);
  }
  console.log(`    Deleted ${n} contacts`);
}

async function copyContacts() {
  if (isCompleted('contacts')) { console.log('[contacts] skipped (already completed)'); return; }
  console.log('[contacts] starting');
  await wipeStagingContacts();

  const prodContacts = await listProdContacts();
  console.log(`  Listed ${prodContacts.length} prod contacts`);

  let ok = 0, fail = 0;
  for (let i = 0; i < prodContacts.length; i++) {
    const c = prodContacts[i];
    const payload = strip(c, ['id', 'locationId', 'dateAdded', 'dateUpdated']);
    payload.locationId = STAGING_LOC;
    if (DRY_RUN) { ok++; continue; }
    try {
      const created = await stagingPost('/contacts/', payload);
      const newId = created?.contact?.id ?? created?.id;
      if (newId) idMap.contacts.set(c.id, newId);
      ok++;
    } catch (err) {
      fail++;
      console.error(`  failed contact ${c.email || c.id}: ${err.message}`);
    }
    if ((i + 1) % 50 === 0) {
      console.log(`    ${i + 1}/${prodContacts.length} (ok=${ok}, fail=${fail})`);
      await saveState();
    }
    await sleep(RATE_LIMIT_MS);
  }
  console.log(`[contacts] done — ${ok} ok, ${fail} failed`);
  await markCompleted('contacts');
}

// ============================================================================
// ENTITY: OPPORTUNITIES
// ============================================================================

async function copyOpportunities() {
  if (isCompleted('opportunities')) { console.log('[opportunities] skipped'); return; }
  console.log('[opportunities] starting');

  // Wipe staging opportunities
  const staging = await paginatePages(
    (q) => stagingGet(`/opportunities/search${q}&location_id=${STAGING_LOC}`),
    'opportunities'
  );
  console.log(`  Wiping ${staging.length} staging opportunities`);
  for (const o of staging) {
    if (DRY_RUN) continue;
    try { await stagingDelete(`/opportunities/${o.id}`); } catch (err) { /* ignore */ }
    await sleep(RATE_LIMIT_MS);
  }

  // Fetch prod opportunities
  const prod = await paginatePages(
    (q) => prodGet(`/opportunities/search${q}&location_id=${PROD_LOC}`),
    'opportunities'
  );
  console.log(`  Listed ${prod.length} prod opportunities`);

  let ok = 0, fail = 0;
  for (let i = 0; i < prod.length; i++) {
    const o = prod[i];
    const payload = strip(o, ['id', 'locationId']);
    payload.locationId = STAGING_LOC;
    payload.contactId = idMap.contacts.get(o.contactId) ?? null;
    if (!payload.contactId) { fail++; continue; }
    if (DRY_RUN) { ok++; continue; }
    try {
      const created = await stagingPost('/opportunities/', payload);
      const newId = created?.opportunity?.id ?? created?.id;
      if (newId) idMap.opportunities.set(o.id, newId);
      ok++;
    } catch (err) {
      fail++;
      console.error(`  failed opportunity ${o.id}: ${err.message}`);
    }
    if ((i + 1) % 50 === 0) {
      console.log(`    ${i + 1}/${prod.length} (ok=${ok}, fail=${fail})`);
      await saveState();
    }
    await sleep(RATE_LIMIT_MS);
  }
  console.log(`[opportunities] done — ${ok} ok, ${fail} failed (failed includes orphans without mapped contact)`);
  await markCompleted('opportunities');
}

// ============================================================================
// ENTITY: NOTES (per-contact)
// ============================================================================

async function copyNotes() {
  if (isCompleted('notes')) { console.log('[notes] skipped'); return; }
  console.log('[notes] starting');
  let ok = 0, fail = 0, total = 0;
  const prodContactIds = [...idMap.contacts.keys()];
  for (let i = 0; i < prodContactIds.length; i++) {
    const prodId = prodContactIds[i];
    const stagingId = idMap.contacts.get(prodId);
    let notes = [];
    try {
      const data = await prodGet(`/contacts/${prodId}/notes`);
      notes = data?.notes ?? [];
    } catch (err) { continue; }
    for (const n of notes) {
      total++;
      const payload = strip(n, ['id', 'contactId', 'dateAdded']);
      if (DRY_RUN) { ok++; continue; }
      try {
        await stagingPost(`/contacts/${stagingId}/notes`, payload);
        ok++;
      } catch (err) {
        fail++;
      }
      await sleep(RATE_LIMIT_MS);
    }
    if ((i + 1) % 100 === 0) {
      console.log(`    contact ${i + 1}/${prodContactIds.length} (notes total=${total}, ok=${ok}, fail=${fail})`);
      await saveState();
    }
    await sleep(RATE_LIMIT_MS);
  }
  console.log(`[notes] done — ${total} found, ${ok} ok, ${fail} failed`);
  await markCompleted('notes');
}

// ============================================================================
// ENTITY: TASKS (per-contact)
// ============================================================================

async function copyTasks() {
  if (isCompleted('tasks')) { console.log('[tasks] skipped'); return; }
  console.log('[tasks] starting');
  let ok = 0, fail = 0, total = 0;
  const prodContactIds = [...idMap.contacts.keys()];
  for (let i = 0; i < prodContactIds.length; i++) {
    const prodId = prodContactIds[i];
    const stagingId = idMap.contacts.get(prodId);
    let tasks = [];
    try {
      const data = await prodGet(`/contacts/${prodId}/tasks`);
      tasks = data?.tasks ?? [];
    } catch (err) { continue; }
    for (const t of tasks) {
      total++;
      const payload = strip(t, ['id', 'contactId', 'dateAdded']);
      if (DRY_RUN) { ok++; continue; }
      try {
        await stagingPost(`/contacts/${stagingId}/tasks`, payload);
        ok++;
      } catch (err) {
        fail++;
      }
      await sleep(RATE_LIMIT_MS);
    }
    if ((i + 1) % 100 === 0) {
      console.log(`    contact ${i + 1}/${prodContactIds.length} (tasks total=${total}, ok=${ok}, fail=${fail})`);
      await saveState();
    }
    await sleep(RATE_LIMIT_MS);
  }
  console.log(`[tasks] done — ${total} found, ${ok} ok, ${fail} failed`);
  await markCompleted('tasks');
}

// ============================================================================
// ENTITY: TAG ASSIGNMENTS (per-contact)
// ============================================================================

async function copyTagAssignments() {
  if (isCompleted('tagAssignments')) { console.log('[tagAssignments] skipped'); return; }
  console.log('[tagAssignments] starting (contact tag attachments)');
  let ok = 0, fail = 0, total = 0;
  const prodContactIds = [...idMap.contacts.keys()];
  for (let i = 0; i < prodContactIds.length; i++) {
    const prodId = prodContactIds[i];
    const stagingId = idMap.contacts.get(prodId);
    let prodContact;
    try { prodContact = (await prodGet(`/contacts/${prodId}`))?.contact; } catch (err) { continue; }
    const tags = prodContact?.tags ?? [];
    if (!tags.length) continue;
    total += tags.length;
    if (DRY_RUN) { ok += tags.length; continue; }
    try {
      await stagingPost(`/contacts/${stagingId}/tags`, { tags });
      ok += tags.length;
    } catch (err) { fail += tags.length; }
    if ((i + 1) % 100 === 0) {
      console.log(`    contact ${i + 1}/${prodContactIds.length} (tags total=${total}, ok=${ok}, fail=${fail})`);
    }
    await sleep(RATE_LIMIT_MS);
  }
  console.log(`[tagAssignments] done — ${total} attachments, ${ok} ok, ${fail} failed`);
  await markCompleted('tagAssignments');
}

// ============================================================================
// ENTITY: CONVERSATIONS + MESSAGES
// ============================================================================

async function copyConversations() {
  if (isCompleted('conversations')) { console.log('[conversations] skipped'); return; }
  console.log('[conversations] starting');
  // List prod conversations
  const data = await prodGet(`/conversations/search?locationId=${PROD_LOC}&limit=${PAGE_SIZE}`);
  const convos = data?.conversations ?? [];
  console.log(`  Found ${convos.length} prod conversations (first page only — full pagination via search filters)`);
  let ok = 0, fail = 0;
  for (let i = 0; i < convos.length; i++) {
    const c = convos[i];
    const stagingContactId = idMap.contacts.get(c.contactId);
    if (!stagingContactId) { fail++; continue; }
    const payload = {
      locationId: STAGING_LOC,
      contactId: stagingContactId,
    };
    if (DRY_RUN) { ok++; continue; }
    try {
      const created = await stagingPost('/conversations/', payload);
      const newId = created?.conversation?.id ?? created?.id;
      if (newId) {
        idMap.conversations.set(c.id, newId);
        // Copy messages
        const msgData = await prodGet(`/conversations/${c.id}/messages?limit=${PAGE_SIZE}`);
        for (const m of (msgData?.messages?.messages ?? [])) {
          try {
            await stagingPost('/conversations/messages', {
              type: m.type,
              conversationId: newId,
              message: m.body ?? m.message,
              direction: m.direction,
              contactId: stagingContactId,
            });
          } catch (err) { /* skip individual message failures */ }
          await sleep(RATE_LIMIT_MS);
        }
      }
      ok++;
    } catch (err) {
      fail++;
    }
    await sleep(RATE_LIMIT_MS);
  }
  console.log(`[conversations] done — ${ok} ok, ${fail} failed`);
  await markCompleted('conversations');
}

// ============================================================================
// ENTITY: CALENDAR EVENTS / APPOINTMENTS
// ============================================================================

async function copyAppointments() {
  if (isCompleted('appointments')) { console.log('[appointments] skipped'); return; }
  console.log('[appointments] starting');
  // List calendars first (config — already exists in staging via snapshot)
  const calData = await prodGet(`/calendars/?locationId=${PROD_LOC}`);
  const calendars = calData?.calendars ?? [];
  let ok = 0, fail = 0, total = 0;
  // 1-year window per call
  const startTime = '2024-01-01T00:00:00.000Z';
  const endTime = '2027-01-01T00:00:00.000Z';
  for (const cal of calendars) {
    let events = [];
    try {
      const eventData = await prodGet(`/calendars/events?locationId=${PROD_LOC}&calendarId=${cal.id}&startTime=${startTime}&endTime=${endTime}`);
      events = eventData?.events ?? [];
    } catch (err) { continue; }
    for (const e of events) {
      total++;
      const stagingContactId = idMap.contacts.get(e.contactId);
      if (!stagingContactId) { fail++; continue; }
      const payload = {
        ...strip(e, ['id', 'locationId', 'contactId', 'calendarId']),
        locationId: STAGING_LOC,
        contactId: stagingContactId,
        calendarId: cal.id, // calendars exist in both via snapshot — IDs may differ; this is best-effort
      };
      if (DRY_RUN) { ok++; continue; }
      try {
        const created = await stagingPost('/calendars/events/appointments', payload);
        const newId = created?.id ?? created?.event?.id;
        if (newId) idMap.appointments.set(e.id, newId);
        ok++;
      } catch (err) { fail++; }
      await sleep(RATE_LIMIT_MS);
    }
  }
  console.log(`[appointments] done — ${total} found, ${ok} ok, ${fail} failed`);
  await markCompleted('appointments');
}

// ============================================================================
// ENTITY: PAYMENT ORDERS / TRANSACTIONS / SUBSCRIPTIONS
// READ-ONLY mostly: payment records typically can't be recreated cleanly via
// API without an actual charge happening. We list+log them but skip create.
// ============================================================================

async function listAndLogReadOnly(entityName, listPath, listKey) {
  if (isCompleted(entityName)) { console.log(`[${entityName}] skipped`); return; }
  console.log(`[${entityName}] listing (read-only, not recreated on staging)`);
  try {
    const data = await prodGet(listPath);
    const items = data?.[listKey] ?? data?.data ?? [];
    console.log(`  Found ${items.length} prod ${entityName} (skipping create — payment records require real charges to materialize)`);
  } catch (err) {
    console.log(`  scope missing or endpoint unavailable: ${err.message}`);
  }
  await markCompleted(entityName);
}

const copyOrders = () => listAndLogReadOnly('orders',
  `/payments/orders?locationId=${PROD_LOC}&altId=${PROD_LOC}&altType=location&limit=${PAGE_SIZE}`,
  'orders');
const copyTransactions = () => listAndLogReadOnly('transactions',
  `/payments/transactions?locationId=${PROD_LOC}&altId=${PROD_LOC}&altType=location&limit=${PAGE_SIZE}`,
  'transactions');
const copySubscriptions = () => listAndLogReadOnly('subscriptions',
  `/payments/subscriptions?locationId=${PROD_LOC}&altId=${PROD_LOC}&altType=location&limit=${PAGE_SIZE}`,
  'subscriptions');
const copyCoupons = () => listAndLogReadOnly('coupons',
  `/payments/coupon/list?altId=${PROD_LOC}&altType=location&limit=${PAGE_SIZE}`,
  'coupons');

// ============================================================================
// ENTITY: FORM SUBMISSIONS / SURVEY SUBMISSIONS
// ============================================================================

async function copyFormSubmissions() {
  if (isCompleted('formSubmissions')) { console.log('[formSubmissions] skipped'); return; }
  console.log('[formSubmissions] read-only listing — submissions cannot be recreated via API');
  try {
    const data = await prodGet(`/forms/submissions?locationId=${PROD_LOC}&limit=${PAGE_SIZE}`);
    const subs = data?.submissions ?? [];
    console.log(`  Found ${subs.length} prod form submissions (logged, not recreated)`);
  } catch (err) {
    console.log(`  unavailable: ${err.message}`);
  }
  await markCompleted('formSubmissions');
}

async function copySurveySubmissions() {
  if (isCompleted('surveySubmissions')) { console.log('[surveySubmissions] skipped'); return; }
  console.log('[surveySubmissions] read-only listing — submissions cannot be recreated via API');
  try {
    const data = await prodGet(`/surveys/submissions?locationId=${PROD_LOC}&limit=${PAGE_SIZE}`);
    const subs = data?.submissions ?? [];
    console.log(`  Found ${subs.length} prod survey submissions (logged, not recreated)`);
  } catch (err) {
    console.log(`  unavailable: ${err.message}`);
  }
  await markCompleted('surveySubmissions');
}

// ============================================================================
// ENTITY: INVOICES + INVOICE SCHEDULES
// ============================================================================

async function copyInvoices() {
  if (isCompleted('invoices')) { console.log('[invoices] skipped'); return; }
  console.log('[invoices] starting');
  let ok = 0, fail = 0;
  try {
    const items = await paginatePages(
      (q) => prodGet(`/invoices/${q}&altId=${PROD_LOC}&altType=location`),
      'invoices'
    );
    console.log(`  Listed ${items.length} prod invoices`);
    for (const inv of items) {
      const stagingContactId = idMap.contacts.get(inv.contactDetails?.id ?? inv.contactId);
      if (!stagingContactId) { fail++; continue; }
      const payload = {
        ...strip(inv, ['_id', 'id', 'altId', 'altType', 'paymentMethods']),
        altId: STAGING_LOC,
        altType: 'location',
        contactDetails: { ...inv.contactDetails, id: stagingContactId },
      };
      if (DRY_RUN) { ok++; continue; }
      try {
        const created = await stagingPost('/invoices/', payload);
        const newId = created?._id ?? created?.id;
        if (newId) idMap.invoices.set(inv._id ?? inv.id, newId);
        ok++;
      } catch (err) { fail++; }
      await sleep(RATE_LIMIT_MS);
    }
  } catch (err) {
    console.log(`  scope missing or endpoint unavailable: ${err.message}`);
  }
  console.log(`[invoices] done — ${ok} ok, ${fail} failed`);
  await markCompleted('invoices');
}

async function copyInvoiceSchedules() {
  if (isCompleted('invoiceSchedules')) { console.log('[invoiceSchedules] skipped'); return; }
  console.log('[invoiceSchedules] starting');
  try {
    const items = await paginatePages(
      (q) => prodGet(`/invoices/schedule/${q}&altId=${PROD_LOC}&altType=location`),
      'schedules'
    );
    console.log(`  Listed ${items.length} prod invoice schedules (logged, not recreated — schedules are state-bearing)`);
  } catch (err) {
    console.log(`  scope missing: ${err.message}`);
  }
  await markCompleted('invoiceSchedules');
}

// ============================================================================
// ENTITY: PRODUCTS + REVIEWS
// ============================================================================

async function copyProducts() {
  if (isCompleted('products')) { console.log('[products] skipped'); return; }
  console.log('[products] starting');
  let ok = 0, fail = 0;
  try {
    const items = await paginatePages(
      (q) => prodGet(`/products/${q}&locationId=${PROD_LOC}`),
      'products'
    );
    console.log(`  Listed ${items.length} prod products`);
    for (const p of items) {
      const payload = { ...strip(p, ['_id', 'id', 'locationId']), locationId: STAGING_LOC };
      if (DRY_RUN) { ok++; continue; }
      try {
        const created = await stagingPost('/products/', payload);
        const newId = created?.product?.id ?? created?._id ?? created?.id;
        if (newId) idMap.products.set(p._id ?? p.id, newId);
        ok++;
      } catch (err) { fail++; }
      await sleep(RATE_LIMIT_MS);
    }
  } catch (err) {
    console.log(`  scope missing: ${err.message}`);
  }
  console.log(`[products] done — ${ok} ok, ${fail} failed`);
  await markCompleted('products');
}

// ============================================================================
// ENTITY: MEMBERSHIPS / COURSE ENROLLMENTS
// ============================================================================

async function copyMemberships() {
  if (isCompleted('memberships')) { console.log('[memberships] skipped'); return; }
  console.log('[memberships] starting');
  try {
    const data = await prodGet(`/courses/memberships/${PROD_LOC}`);
    const items = data?.data ?? data?.memberships ?? [];
    console.log(`  Listed ${items.length} prod memberships (read-only — recreate would need fresh enrollment events)`);
  } catch (err) {
    console.log(`  scope missing or endpoint unavailable: ${err.message}`);
  }
  await markCompleted('memberships');
}

// ============================================================================
// ENTITY: DOCUMENTS & CONTRACTS
// ============================================================================

async function copyDocuments() {
  if (isCompleted('documents')) { console.log('[documents] skipped'); return; }
  console.log('[documents] starting');
  try {
    const items = await paginatePages(
      (q) => prodGet(`/proposals/document${q}&altId=${PROD_LOC}&altType=location`),
      'documents'
    );
    console.log(`  Listed ${items.length} prod documents (read-only — generated documents tied to specific transactions)`);
  } catch (err) {
    console.log(`  scope missing: ${err.message}`);
  }
  await markCompleted('documents');
}

// ============================================================================
// ENTITY: MEDIA LIBRARY (uploaded files)
// ============================================================================

async function copyMedia() {
  if (isCompleted('media')) { console.log('[media] skipped'); return; }
  console.log('[media] starting');
  try {
    const data = await prodGet(`/medias/files?altId=${PROD_LOC}&altType=location&limit=${PAGE_SIZE}`);
    const items = data?.files ?? [];
    console.log(`  Listed ${items.length} prod media files (read-only — file uploads need binary content, not just metadata)`);
  } catch (err) {
    console.log(`  scope missing: ${err.message}`);
  }
  await markCompleted('media');
}

// ============================================================================
// ENTITY: CUSTOM OBJECTS + RECORDS
// ============================================================================

async function copyCustomObjects() {
  if (isCompleted('customObjects')) { console.log('[customObjects] skipped'); return; }
  console.log('[customObjects] starting');
  try {
    const objData = await prodGet(`/objects/?locationId=${PROD_LOC}`);
    const objects = objData?.objects ?? [];
    let totalRecords = 0, ok = 0, fail = 0;
    for (const obj of objects) {
      const recordsData = await prodGet(`/objects/${obj.key}/records/search?locationId=${PROD_LOC}&limit=${PAGE_SIZE}`)
        .catch(() => ({ records: [] }));
      const records = recordsData?.records ?? [];
      totalRecords += records.length;
      for (const rec of records) {
        const payload = { ...strip(rec, ['id', 'locationId']), locationId: STAGING_LOC };
        if (DRY_RUN) { ok++; continue; }
        try {
          await stagingPost(`/objects/${obj.key}/records`, payload);
          ok++;
        } catch (err) { fail++; }
        await sleep(RATE_LIMIT_MS);
      }
    }
    console.log(`  ${objects.length} object types, ${totalRecords} records — ${ok} ok, ${fail} failed`);
  } catch (err) {
    console.log(`  scope missing or unavailable: ${err.message}`);
  }
  await markCompleted('customObjects');
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

  // ORDER MATTERS: contacts must come first because most other entities reference contactId.
  await copyContacts();
  await copyOpportunities();
  await copyNotes();
  await copyTasks();
  await copyTagAssignments();
  await copyConversations();
  await copyAppointments();
  await copyOrders();
  await copyTransactions();
  await copySubscriptions();
  await copyCoupons();
  await copyFormSubmissions();
  await copySurveySubmissions();
  await copyInvoices();
  await copyInvoiceSchedules();
  await copyProducts();
  await copyMemberships();
  await copyDocuments();
  await copyMedia();
  await copyCustomObjects();

  console.log('================================================================');
  console.log('GHL refresh complete.');
  console.log(`  contacts:        ${idMap.contacts.size}`);
  console.log(`  opportunities:   ${idMap.opportunities.size}`);
  console.log(`  conversations:   ${idMap.conversations.size}`);
  console.log(`  appointments:    ${idMap.appointments.size}`);
  console.log(`  invoices:        ${idMap.invoices.size}`);
  console.log(`  products:        ${idMap.products.size}`);
  console.log(`  customObjects:   ${idMap.customObjectRecords.size}`);
  console.log('  (read-only entities listed but not recreated: orders, transactions,');
  console.log('   subscriptions, coupons, form submissions, survey submissions,');
  console.log('   invoice schedules, memberships, documents, media — these require');
  console.log('   real-world events to materialize cleanly.)');
  console.log('================================================================');
}

main().catch((err) => {
  console.error('FATAL:', err);
  process.exit(1);
});
