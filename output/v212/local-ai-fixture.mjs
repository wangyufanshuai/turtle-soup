/**
 * Local-only, deterministic OpenAI-compatible question-routing TEST FIXTURE.
 * It is not a model and makes no claim that an actual AI/UI gate has passed.
 * Start: node output/v212/local-ai-fixture.mjs --port 11489 --origin http://127.0.0.1:8096
 * Test:  node --test output/v212/local-ai-fixture.test.mjs
 * UI endpoint: http://127.0.0.1:11489/<scenario>/v1/chat/completions
 * Use a synthetic model name and an EMPTY key; no real provider is contacted.
 */
import { createServer } from 'node:http';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export const SCENARIOS = Object.freeze(['success', 'malicious', 'http500', 'timeout', 'invalid-json', 'cors-failure']);
export const TIMEOUT_DELAY_MS = 4_600;
export const DEFAULT_ORIGINS = Object.freeze(['http://127.0.0.1:8096']);
const MAX_BODY_BYTES = 64 * 1024;

function validateOrigin(value) {
  try {
    const url = new URL(value);
    if (typeof value !== 'string' || value.length > 256 || url.origin !== value ||
        !['http:', 'https:'].includes(url.protocol) ||
        !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) ||
        url.username || url.password || url.search || url.hash) throw new Error();
    return value;
  } catch {
    throw new Error('Each --origin must be an exact HTTP(S) loopback origin without a path.');
  }
}

export function parseCliArgs(args) {
  const options = { port: 11489, origins: [] };
  for (let i = 0; i < args.length; i += 2) {
    const option = args[i];
    const value = args[i + 1];
    if (option === '--port' && typeof value === 'string' && /^\d{1,5}$/.test(value)) {
      options.port = Number(value);
      if (options.port < 1024 || options.port > 65535) throw new Error('--port must be 1024..65535.');
    } else if (option === '--origin' && value) {
      options.origins.push(validateOrigin(value));
    } else {
      throw new Error('Usage: local-ai-fixture.mjs [--port 1024..65535] [--origin exact-loopback-origin]');
    }
  }
  if (!options.origins.length) options.origins = [...DEFAULT_ORIGINS];
  return options;
}

/** Read only the public token enum, or the application's public candidate lines. */
export function chooseAllowedToken(body) {
  const format = body?.response_format;
  let candidates;
  if (format?.type === 'json_schema') {
    candidates = format.json_schema?.schema?.properties?.candidateTokens?.items?.enum;
  } else if (format?.type === 'json_object' && Array.isArray(body?.messages)) {
    const prompt = body.messages.find((message) => message?.role === 'user')?.content;
    if (typeof prompt === 'string') {
      const start = prompt.lastIndexOf('\n候选：');
      const section = start < 0 ? '' : prompt.slice(start + '\n候选：'.length).split('\n只输出 JSON')[0];
      candidates = section.split('\n').map((line) => line.match(/^([^｜\s]+)｜/)?.[1]).filter(Boolean);
    }
  }
  if (!Array.isArray(candidates) || candidates.length === 0 || candidates.some((token) =>
    typeof token !== 'string' || !token.length || token.length > 256 || /[\u0000-\u001f\u007f]/u.test(token))) {
    throw new Error('No valid public candidate token enum was supplied.');
  }
  return candidates[0];
}

function readBody(request) {
  return new Promise((resolveBody, rejectBody) => {
    const chunks = [];
    let size = 0;
    let settled = false;
    request.on('data', (chunk) => {
      if (settled) return;
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        settled = true;
        chunks.length = 0;
        rejectBody(Object.assign(new Error('Request exceeds fixture limit.'), { statusCode: 413 }));
      } else chunks.push(chunk);
    });
    request.once('end', () => {
      if (!settled) { settled = true; resolveBody(Buffer.concat(chunks).toString('utf8')); }
    });
    const failed = () => {
      if (!settled) { settled = true; rejectBody(new Error('Request interrupted.')); }
    };
    request.once('error', failed);
    request.once('aborted', failed);
  });
}

function completion(content) {
  return { id: 'local-fixture', object: 'chat.completion', model: 'local-fixture-no-model',
    choices: [{ index: 0, message: { role: 'assistant', content }, finish_reason: 'stop' }] };
}

export async function startFixture({ port = 11489, origins = DEFAULT_ORIGINS, log = () => {} } = {}) {
  if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error('Invalid fixture port.');
  if (!Array.isArray(origins) || !origins.length) throw new Error('At least one explicit loopback origin is required.');
  const allowedOrigins = new Set(origins.map(validateOrigin));
  const sockets = new Set();
  const pending = new Map();
  const counts = { requests: 0, preflights: 0, rejectedOrigins: 0, rejectedHosts: 0, keyPresentRequests: 0,
    completedPosts: 0, cancelledPosts: 0, scenarios: Object.fromEntries(SCENARIOS.map((name) => [name, 0])),
    safetyFlags: { queryIds: 0, factIds: 0, certificates: 0, hiddenMarkers: 0 } };
  let closePromise;
  let boundPort;
  const snapshot = () => structuredClone({ ...counts, pendingTimeouts: pending.size });
  // Only counts and flags escape this process. No body, token, question, key or raw error is logged.
  const record = (scenario, keyPresent) => log({ scenario, keyPresent, counts: snapshot() });
  const send = (response, statusCode, payload) => {
    if (response.destroyed || response.writableEnded) return;
    response.writeHead(statusCode, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
    response.end(typeof payload === 'string' ? payload : JSON.stringify(payload));
  };
  const handler = async (request, response) => {
    const host = request.headers.host;
    if (![ `127.0.0.1:${boundPort}`, `localhost:${boundPort}` ].includes(host)) {
      counts.rejectedHosts += 1;
      send(response, 403, { error: 'Non-loopback host rejected.' }); return;
    }
    const origin = request.headers.origin;
    if (origin !== undefined && !allowedOrigins.has(origin)) {
      counts.rejectedOrigins += 1;
      send(response, 403, { error: 'Origin not allowed.' }); return;
    }
    const match = /^\/(success|malicious|http500|timeout|invalid-json|cors-failure)\/v1\/chat\/completions$/.exec(request.url ?? '');
    const scenario = match?.[1];
    if (scenario === 'cors-failure') {
      if (request.method === 'OPTIONS') counts.preflights += 1;
      else if (request.method === 'POST') { counts.requests += 1; counts.scenarios[scenario] += 1; }
      send(response, 403, { error: 'Deliberate fixture CORS failure.' }); return;
    }
    if (origin) {
      response.setHeader('access-control-allow-origin', origin);
      response.setHeader('vary', 'Origin');
    }
    if (request.method === 'GET' && request.url === '/_fixture/stats') { send(response, 200, snapshot()); return; }
    if (!scenario) { send(response, 404, { error: 'Unknown fixture endpoint.' }); return; }
    if (request.method === 'OPTIONS') {
      counts.preflights += 1;
      const requestedHeaders = (request.headers['access-control-request-headers'] ?? '').toLowerCase().split(',').map((v) => v.trim()).filter(Boolean);
      if (request.headers['access-control-request-method'] !== 'POST' || requestedHeaders.some((v) => !['content-type', 'authorization'].includes(v))) {
        send(response, 403, { error: 'Preflight method or headers not allowed.' }); return;
      }
      response.writeHead(204, { 'access-control-allow-methods': 'POST', 'access-control-allow-headers': 'content-type, authorization', 'cache-control': 'no-store' });
      response.end(); return;
    }
    if (request.method !== 'POST') { send(response, 405, { error: 'Use POST.' }); return; }
    counts.requests += 1;
    counts.scenarios[scenario] += 1;
    const keyPresent = Boolean(request.headers.authorization);
    if (keyPresent) counts.keyPresentRequests += 1;
    response.once('close', () => {
      const timer = pending.get(response);
      if (timer) { clearTimeout(timer); pending.delete(response); }
      if (response.writableFinished) counts.completedPosts += 1;
      else counts.cancelledPosts += 1;
      record(scenario, keyPresent);
    });
    let body;
    try {
      const raw = await readBody(request);
      // Marker counters are a diagnostic tripwire, NOT a complete private-data audit.
      if (/\b(?:queryIds?|questionIds?)\b/i.test(raw)) counts.safetyFlags.queryIds += 1;
      if (/\bfactIds?\b/i.test(raw)) counts.safetyFlags.factIds += 1;
      if (/\bcert(?:ificate)?s?\b/i.test(raw)) counts.safetyFlags.certificates += 1;
      if (/\bHIDDEN\b/.test(raw)) counts.safetyFlags.hiddenMarkers += 1;
      body = JSON.parse(raw);
    } catch (error) { send(response, error.statusCode === 413 ? 413 : 400, { error: 'Invalid or oversized fixture request.' }); return; }
    if (response.destroyed) return;
    if (scenario === 'http500') { send(response, 500, { error: 'Deliberate local fixture HTTP 500.' }); return; }
    if (scenario === 'invalid-json') { send(response, 200, '{"choices":'); return; }
    if (scenario === 'malicious') {
      send(response, 200, completion(JSON.stringify({ status: 'matched', candidateTokens: ['forged-fixture-token'],
        causalAssertion: 'SYNTHETIC FIXTURE ONLY: an invented cause that must never be accepted.' })));
      return;
    }
    let token;
    try { token = chooseAllowedToken(body); }
    catch { send(response, 400, { error: 'Public candidate enum unavailable.' }); return; }
    const payload = completion(JSON.stringify({ status: 'matched', candidateTokens: [token] }));
    if (scenario === 'timeout') {
      const timer = setTimeout(() => { pending.delete(response); send(response, 200, payload); }, TIMEOUT_DELAY_MS);
      timer.unref();
      pending.set(response, timer);
      return;
    }
    send(response, 200, payload);
  };
  const server = createServer((request, response) => {
    void handler(request, response).catch(() => send(response, 500, { error: 'Local fixture handler failed.' }));
  });
  server.requestTimeout = 10_000;
  server.headersTimeout = 10_000;
  server.on('connection', (socket) => { sockets.add(socket); socket.once('close', () => sockets.delete(socket)); });
  server.on('clientError', (_error, socket) => socket.destroy());
  await new Promise((resolveListen, rejectListen) => {
    server.once('error', rejectListen);
    server.listen(port, '127.0.0.1', () => { server.off('error', rejectListen); boundPort = server.address().port; resolveListen(); });
  });
  return {
    host: '127.0.0.1', port: boundPort, baseUrl: `http://127.0.0.1:${boundPort}`, snapshot,
    endpoints: Object.fromEntries(SCENARIOS.map((name) => [name, `http://127.0.0.1:${boundPort}/${name}/v1/chat/completions`])),
    close() {
      if (!closePromise) closePromise = new Promise((resolveClose, rejectClose) => {
        for (const timer of pending.values()) clearTimeout(timer);
        pending.clear();
        server.close((error) => error ? rejectClose(error) : resolveClose());
        for (const socket of sockets) socket.destroy();
      });
      return closePromise;
    },
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const fixture = await startFixture({ ...parseCliArgs(process.argv.slice(2)), log: (entry) => process.stdout.write(`${JSON.stringify(entry)}\n`) });
    process.stdout.write(`${JSON.stringify({ fixtureOnly: true, listening: fixture.baseUrl, endpoints: fixture.endpoints })}\n`);
    const stop = () => { void fixture.close().catch(() => { process.exitCode = 1; }); };
    process.once('SIGINT', stop);
    process.once('SIGTERM', stop);
  } catch {
    process.stderr.write('Local fixture failed: check port availability and validated CLI arguments.\n');
    process.exitCode = 1;
  }
}
