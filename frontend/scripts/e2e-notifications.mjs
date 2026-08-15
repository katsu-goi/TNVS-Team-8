/**
 * Live end-to-end verification of the hardened notification system against the
 * RUNNING backend (H2 test profile on :8080, context /api).
 *
 * Proves the real network stack end-to-end: JWT login, REST notification API,
 * SockJS + STOMP realtime delivery per user, per-admin admin notifications,
 * DB-as-source-of-truth after a WebSocket disconnect, no duplicate rows, and no
 * seeded notifications on a fresh database.
 *
 * Usage: node scripts/e2e-notifications.mjs   (from frontend/)
 */
import { Client } from '@stomp/stompjs';
import SockJS from 'sockjs-client';

const BASE = 'http://localhost:8080/api';
const WS_BASE = 'http://localhost:8080/api/ws-endpoint';

const EMPLOYEE = { email: 'employee@photonicomega.com', pass: 'Employee2026!' };
const CONTRACT = { email: 'contract@photonicomega.com', pass: 'Contract2026!' };
const ADMIN = { email: 'admin@photonicomega.com', pass: 'Admin2026!' };

const results = [];
let failures = 0;

function record(name, pass, detail = '') {
  results.push({ name, pass, detail });
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? `  -> ${detail}` : ''}`);
  if (!pass) failures++;
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function api(method, path, token, body) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const res = await fetch(BASE + path, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  let json = null;
  try { json = await res.json(); } catch { /* ignore */ }
  return { status: res.status, json };
}

async function login(account) {
  const r = await api('POST', '/v1/auth/login', null, { email: account.email, password: account.pass });
  if (r.status !== 200 || !r.json?.data?.accessToken) {
    throw new Error(`Login failed for ${account.email}: ${r.status} ${JSON.stringify(r.json)}`);
  }
  return r.json.data.accessToken;
}

async function notifications(token) {
  const r = await api('GET', '/v1/employee/notifications', token);
  return r.json?.data ?? [];
}
async function createRequest(token, type, title) {
  const r = await api('POST', '/v1/employee/requests', token, { type, title, description: 'E2E verification' });
  if (r.status !== 200) throw new Error(`createRequest failed: ${r.status} ${JSON.stringify(r.json)}`);
  return r.json.data.id;
}

function connect(token, onFrame) {
  return new Promise((resolve, reject) => {
    const client = new Client({
      webSocketFactory: () => new SockJS(WS_BASE),
      connectHeaders: { Authorization: `Bearer ${token}` },
      reconnectDelay: 0,
      heartbeatIncoming: 0,
      heartbeatOutgoing: 0,
    });
    client.onConnect = () => {
      if (onFrame) client.subscribe('/user/queue/notifications', onFrame);
      resolve(client);
    };
    client.onStompError = (frame) => reject(new Error('STOMP error: ' + (frame?.body || 'n/a')));
    client.onWebSocketError = (e) => reject(new Error('WebSocket error'));
    client.activate();
  });
}

async function waitFor(predicate, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const hit = predicate();
    if (hit) return hit;
    await sleep(60);
  }
  return null;
}

async function main() {
  const employeeToken = await login(EMPLOYEE);
  const officerToken = await login(CONTRACT);
  const adminToken = await login(ADMIN);

  // ---- TEST 10: no seeded notifications on a fresh database ----
  let empNotes = await notifications(employeeToken);
  record('No seed notifications', empNotes.length === 0, `employee notifications at fresh start: ${empNotes.length}`);
  const adminStart = (await api('GET', '/v1/admin/notifications', adminToken)).json?.data ?? [];
  record('No admin seed notifications', adminStart.length === 0, `admin notifications at fresh start: ${adminStart.length}`);

  // ---- TEST 1: submission ----
  const reqA = await createRequest(employeeToken, 'CONTRACT', 'E2E laptop order');
  empNotes = await notifications(employeeToken);
  const sub = empNotes.find((n) => n.relatedEntityId === reqA && n.type === 'INFO');
  record('Submission', !!sub, `INFO submission notification for ${reqA}`);

  // ---- TEST 2: approval ----
  await api('POST', `/v1/requests-review/${reqA}/approve`, officerToken);
  empNotes = await notifications(employeeToken);
  const approval = empNotes.find((n) => n.relatedEntityId === reqA && n.type === 'APPROVAL');
  record('Approval', !!approval, `APPROVAL notification for ${reqA}`);

  // ---- TEST 4: completion ----
  await api('POST', `/v1/requests-review/${reqA}/complete`, officerToken);
  empNotes = await notifications(employeeToken);
  const completed = empNotes.find((n) => n.relatedEntityId === reqA && n.type === 'COMPLETED');
  record('Completion', !!completed, `COMPLETED notification for ${reqA}`);

  // ---- TEST 3: rejection (with reason) ----
  const reqB = await createRequest(employeeToken, 'CONTRACT', 'E2E stationery order');
  await api('POST', `/v1/requests-review/${reqB}/reject`, officerToken, { reason: 'Out of budget this quarter' });
  empNotes = await notifications(employeeToken);
  const rejected = empNotes.find((n) => n.relatedEntityId === reqB && n.type === 'REJECTION');
  record('Rejection', !!rejected && rejected.message.includes('Out of budget this quarter'),
    `REJECTION notification for ${reqB}`);

  // ---- TEST 5: cancellation ----
  const reqC = await createRequest(employeeToken, 'CONTRACT', 'E2E travel booking');
  await api('POST', `/v1/employee/requests/${reqC}/cancel`, employeeToken);
  empNotes = await notifications(employeeToken);
  const cancelled = empNotes.find((n) => n.relatedEntityId === reqC && n.type === 'CANCELLED');
  record('Cancellation', !!cancelled, `CANCELLED notification for ${reqC}`);

  // ---- Read state persistence ----
  await api('POST', `/v1/employee/notifications/${approval.id}/read`, employeeToken);
  empNotes = await notifications(employeeToken);
  const readAfter = empNotes.find((n) => n.id === approval.id);
  record('Read', readAfter?.read === true, `read flag persisted for ${approval.id}`);

  // ---- TEST 6: realtime (per-user STOMP delivery) ----
  const reqD = await createRequest(employeeToken, 'CONTRACT', 'E2E realtime approval');
  const empRealtime = [];
  const empClient = await connect(employeeToken, (m) => { if (m.body) empRealtime.push(JSON.parse(m.body)); });
  const t0 = Date.now();
  await api('POST', `/v1/requests-review/${reqD}/approve`, officerToken);
  const realtimeMsg = await waitFor(() => empRealtime.find((m) => m.relatedEntityId === reqD && m.type === 'APPROVAL'), 3000);
  const latency = realtimeMsg ? Date.now() - t0 : null;
  record('Realtime', !!realtimeMsg && latency < 1000, `APPROVAL pushed to employee /user/queue/notifications in ${latency ?? 'N/A'}ms (target <1000ms)`);

  // ---- TEST 8: no duplicates ----
  empNotes = await notifications(employeeToken);
  const dupCount = empNotes.filter((n) => n.relatedEntityId === reqD && n.type === 'APPROVAL').length;
  record('No duplicates', dupCount === 1, `APPROVAL rows for ${reqD}: ${dupCount}`);

  // ---- TEST 9: WebSocket disconnect -> DB is source of truth ----
  empClient.deactivate();
  const reqE = await createRequest(employeeToken, 'CONTRACT', 'E2E approved while offline');
  await api('POST', `/v1/requests-review/${reqE}/approve`, officerToken);
  empNotes = await notifications(employeeToken);
  const offlineApproval = empNotes.find((n) => n.relatedEntityId === reqE && n.type === 'APPROVAL');
  record('WebSocket disconnect', !!offlineApproval,
    `approval persisted while STOMP was disconnected; visible on reconnect via REST (DB source of truth)`);

  // ---- TEST 7: multi-user isolation + admin realtime ----
  const adminRealtime = [];
  const adminClient = await connect(adminToken, (m) => { if (m.body) adminRealtime.push(JSON.parse(m.body)); });
  adminClient.subscribe('/user/queue/admin-notifications', (m) => { if (m.body) adminRealtime.push(JSON.parse(m.body)); });

  // Trigger a real AI-provider OFFLINE transition: add a fast-failing provider,
  // assign it to mod-1, then live-fetch its models (connection refused -> offline).
  await api('POST', '/v1/ai/providers', adminToken, {
    id: 'p-e2e-offline', name: 'E2E Offline Provider', model: 'test-model',
    status: 'CONNECTED', type: 'local', baseUrl: 'http://127.0.0.1:9/v1',
    endpoint: '/models', apiKey: 'none', capabilities: [],
  });
  await api('PUT', '/v1/ai/modules/mod-1/config', adminToken, {
    enabled: true, providerId: 'p-e2e-offline', model: 'test-model', executionMode: 'REALTIME', enabledFeatures: [],
  });
  const t1 = Date.now();
  const fetchRes = await api('GET', '/v1/ai/modules/mod-1/models', adminToken);
  const adminMsg = await waitFor(() => adminRealtime.find((m) => m.type === 'AI_PROVIDER'), 3000);
  const adminLatency = adminMsg ? Date.now() - t1 : null;
  record('Admin realtime (AI OFFLINE)', !!adminMsg && fetchRes.status === 200 && adminLatency < 3000,
    `AI_PROVIDER admin notification pushed in ${adminLatency ?? 'N/A'}ms (fetch status ${fetchRes.status})`);

  const adminNotesNow = (await api('GET', '/v1/admin/notifications', adminToken)).json?.data ?? [];
  record('Admin scoped list', adminNotesNow.some((n) => n.type === 'AI_PROVIDER'),
    `admin sees own AI_PROVIDER row via REST (total ${adminNotesNow.length})`);

  // Employee must not be able to read admin notifications (403) ...
  const empAdminStatus = (await api('GET', '/v1/admin/notifications', employeeToken)).status;
  record('Isolation: employee cannot read admin notifications', empAdminStatus === 403, `status ${empAdminStatus}`);

  // ... and the contract officer cannot read the employee's notifications (403).
  const offEmpStatus = (await api('GET', '/v1/employee/notifications', officerToken)).status;
  record('Isolation: officer cannot read employee notifications', offEmpStatus === 403, `status ${offEmpStatus}`);

  // While both admin (both queues) and employee are connected, a new approval
  // must reach ONLY the requester's queue.
  const reqF = await createRequest(employeeToken, 'CONTRACT', 'E2E isolation proof');
  const empIsolation = [];
  const empClient2 = await connect(employeeToken, (m) => { if (m.body) empIsolation.push(JSON.parse(m.body)); });
  await api('POST', `/v1/requests-review/${reqF}/approve`, officerToken);
  const gotOnEmployee = await waitFor(() => empIsolation.find((m) => m.relatedEntityId === reqF), 3000);
  await sleep(500);
  const leakedToAdmin = adminRealtime.some((m) => m.relatedEntityId === reqF);
  record('Isolation realtime: requester receives own approval', !!gotOnEmployee, `employee got ${reqF} push`);
  record('Isolation realtime: admin received nothing of the employee notification', !leakedToAdmin,
    `leak to admin=${leakedToAdmin}`);

  empClient2.deactivate();
  adminClient.deactivate();

  // ---- summary ----
  console.log('\n===== E2E SUMMARY =====');
  console.log(`Total: ${results.length}  Passed: ${results.length - failures}  Failed: ${failures}`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error('E2E script error:', err);
  process.exit(1);
});
