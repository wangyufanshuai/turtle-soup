/** Synthetic public-data tests only. This file does not start a browser or contact a model. */
import assert from 'node:assert/strict';
import { request as httpRequest } from 'node:http';
import test from 'node:test';
import { chooseAllowedToken, parseCliArgs, startFixture, TIMEOUT_DELAY_MS } from './local-ai-fixture.mjs';

const ORIGIN = 'http://127.0.0.1:8096';
const TOKENS = ['public-synthetic-choice-A', 'public-synthetic-choice-B'];
const publicRequest = (tokens = TOKENS) => ({
  model: 'local-fixture-no-model', stream: false, temperature: 0,
  messages: [{ role: 'system', content: 'Choose a public token only.' },
    { role: 'user', content: 'Synthetic public surface and synthetic public question only.' }],
  response_format: { type: 'json_schema', json_schema: { name: 'question_route', strict: true,
    schema: { type: 'object', additionalProperties: false,
      properties: { status: { type: 'string', enum: ['matched', 'ambiguous', 'unknown'] },
        candidateTokens: { type: 'array', items: { type: 'string', enum: tokens }, maxItems: 3 } },
      required: ['status', 'candidateTokens'] } } },
});

function send(url, { method = 'POST', body = publicRequest(), headers = {}, signal } = {}) {
  const target = new URL(url);
  assert.equal(target.hostname, '127.0.0.1', 'Tests must never request a remote host.');
  return new Promise((resolveResponse, rejectResponse) => {
    const request = httpRequest(target, { method, signal, agent: false,
      headers: { origin: ORIGIN, 'content-type': 'application/json', ...headers } }, (response) => {
      const chunks = [];
      response.on('data', (chunk) => chunks.push(chunk));
      response.once('error', rejectResponse);
      response.once('end', () => resolveResponse({ status: response.statusCode, headers: response.headers,
        text: Buffer.concat(chunks).toString('utf8') }));
    });
    request.once('error', rejectResponse);
    request.end(method === 'POST' ? (typeof body === 'string' ? body : JSON.stringify(body)) : undefined);
  });
}

async function usingFixture(t, extra = {}) {
  const fixture = await startFixture({ port: 0, origins: [ORIGIN], ...extra });
  t.after(() => fixture.close());
  assert.equal(fixture.host, '127.0.0.1');
  assert.ok(fixture.port > 0);
  return fixture;
}

function matchedContent(response) {
  assert.equal(response.status, 200);
  const envelope = JSON.parse(response.text);
  assert.equal(envelope.object, 'chat.completion');
  return JSON.parse(envelope.choices[0].message.content);
}

async function until(predicate, maxMs = 1_000) {
  const end = Date.now() + maxMs;
  while (!predicate()) {
    if (Date.now() > end) assert.fail('Fixture did not reach the expected bounded state.');
    await new Promise((resolveWait) => setTimeout(resolveWait, 10));
  }
}

test('CLI accepts only validated ports and exact loopback origins', () => {
  assert.deepEqual(parseCliArgs(['--port', '11489', '--origin', ORIGIN]), { port: 11489, origins: [ORIGIN] });
  for (const args of [['--port', '0'], ['--port', '80'], ['--port', '65536'], ['--port', '11489abc'],
    ['--origin', 'https://example.com'], ['--origin', 'http://127.0.0.1:8096/'],
    ['--origin', 'http://127.0.0.1.evil.test:8096'], ['--host', '0.0.0.0'], ['--origin']]) {
    assert.throws(() => parseCliArgs(args));
  }
});

test('programmatic startup rejects remote origins, invalid ports and empty origin lists', async () => {
  await assert.rejects(startFixture({ port: -1 }));
  await assert.rejects(startFixture({ port: 0, origins: ['https://example.com'] }));
  await assert.rejects(startFixture({ port: 0, origins: [] }));
});

test('success returns exactly the strict schema and a dynamically supplied allowed token', async (t) => {
  const fixture = await usingFixture(t);
  const tokens = ['public-dynamic-token-99', 'public-dynamic-token-12'];
  const response = await send(fixture.endpoints.success, { body: publicRequest(tokens) });
  assert.deepEqual(matchedContent(response), { status: 'matched', candidateTokens: [tokens[0]] });
  assert.equal(response.headers['access-control-allow-origin'], ORIGIN);
  assert.equal(response.headers['access-control-allow-credentials'], undefined);
  assert.equal(response.headers['cache-control'], 'no-store');
});

test('validated-json mode selects only a public candidate line, not preceding user text', async (t) => {
  const fixture = await usingFixture(t);
  const body = publicRequest();
  body.response_format = { type: 'json_object' };
  body.messages[1].content = '玩家原问题：public-wrong｜not a candidate\n候选：public-right｜公开测试标签｜对象:公开测试｜关系:公开测试\npublic-second｜其他公开测试\n只输出 JSON，不要 Markdown，不要解释。';
  assert.deepEqual(matchedContent(await send(fixture.endpoints.success, { body })),
    { status: 'matched', candidateTokens: ['public-right'] });
});

test('empty, absent or malformed enums fail closed without inventing a token', async (t) => {
  const fixture = await usingFixture(t);
  for (const body of [{}, publicRequest([]), publicRequest([1]), publicRequest(['bad\ntoken'])]) {
    assert.throws(() => chooseAllowedToken(body));
    assert.equal((await send(fixture.endpoints.success, { body })).status, 400);
  }
});

test('malicious response contains a forged token and out-of-schema synthetic causal assertion', async (t) => {
  const fixture = await usingFixture(t);
  const result = matchedContent(await send(fixture.endpoints.malicious));
  assert.equal(result.status, 'matched');
  assert.ok(!TOKENS.includes(result.candidateTokens[0]));
  assert.ok(Object.keys(result).some((key) => !['status', 'candidateTokens'].includes(key)));
  assert.match(result.causalAssertion, /^SYNTHETIC FIXTURE ONLY:/);
});

test('HTTP 500 and malformed outer JSON are distinct fixture failures', async (t) => {
  const fixture = await usingFixture(t);
  assert.equal((await send(fixture.endpoints.http500)).status, 500);
  const invalid = await send(fixture.endpoints['invalid-json']);
  assert.equal(invalid.status, 200);
  assert.throws(() => JSON.parse(invalid.text), SyntaxError);
});

test('valid preflight explicitly allows only POST, content-type and authorization', async (t) => {
  const fixture = await usingFixture(t);
  const result = await send(fixture.endpoints.success, { method: 'OPTIONS', headers: {
    'access-control-request-method': 'POST', 'access-control-request-headers': 'Content-Type, Authorization' } });
  assert.equal(result.status, 204);
  assert.equal(result.headers['access-control-allow-origin'], ORIGIN);
  assert.equal(result.headers['access-control-allow-methods'], 'POST');
  assert.equal(result.headers['access-control-allow-headers'], 'content-type, authorization');
  assert.equal(fixture.snapshot().requests, 0);
  const denied = await send(fixture.endpoints.success, { method: 'OPTIONS', headers: {
    'access-control-request-method': 'DELETE', 'access-control-request-headers': 'x-custom' } });
  assert.equal(denied.status, 403);
});

test('unlisted origins and DNS-rebinding host headers are rejected without CORS permission', async (t) => {
  const fixture = await usingFixture(t);
  for (const headers of [{ origin: 'https://example.com' }, { origin: 'http://127.0.0.1:8097' },
    { origin: 'null' }, { host: 'example.com' }]) {
    const response = await send(fixture.endpoints.success, { headers });
    assert.equal(response.status, 403);
    assert.equal(response.headers['access-control-allow-origin'], undefined);
  }
  assert.equal(fixture.snapshot().requests, 0);
});

test('CORS-failure endpoint deliberately omits CORS headers even for an allowed origin', async (t) => {
  const fixture = await usingFixture(t);
  for (const method of ['OPTIONS', 'POST']) {
    const result = await send(fixture.endpoints['cors-failure'], { method,
      headers: { 'access-control-request-method': 'POST' } });
    assert.equal(result.status, 403);
    assert.equal(result.headers['access-control-allow-origin'], undefined);
  }
});

test('logs and stats contain aggregate counts/flags and never raw questions, tokens or synthetic keys', async (t) => {
  const logs = [];
  const fixture = await usingFixture(t, { log: (entry) => logs.push(entry) });
  const body = publicRequest();
  body.messages[1].content = 'SYNTHETIC_PUBLIC_QUESTION_MARKER queryId factId certificate HIDDEN';
  await send(fixture.endpoints.success, { body, headers: { authorization: 'Bearer SYNTHETIC_TEST_KEY_NOT_REAL' } });
  await until(() => logs.length === 1);
  const result = await send(`${fixture.baseUrl}/_fixture/stats`, { method: 'GET' });
  const stats = JSON.parse(result.text);
  assert.equal(stats.requests, 1);
  assert.equal(stats.keyPresentRequests, 1);
  assert.deepEqual(stats.safetyFlags, { queryIds: 1, factIds: 1, certificates: 1, hiddenMarkers: 1 });
  assert.deepEqual(Object.keys(logs[0]).sort(), ['counts', 'keyPresent', 'scenario']);
  assert.equal(logs[0].keyPresent, true);
  const serialized = JSON.stringify({ logs, stats });
  for (const secret of ['SYNTHETIC_PUBLIC_QUESTION_MARKER', 'SYNTHETIC_TEST_KEY_NOT_REAL', ...TOKENS]) assert.ok(!serialized.includes(secret));
});

test('invalid JSON, oversized bodies, unknown paths and unsupported methods are bounded', async (t) => {
  const fixture = await usingFixture(t);
  assert.equal((await send(fixture.endpoints.success, { body: '{' })).status, 400);
  assert.equal((await send(fixture.endpoints.success, { body: 'x'.repeat(65 * 1024) })).status, 413);
  assert.equal((await send(`${fixture.baseUrl}/unknown`)).status, 404);
  assert.equal((await send(fixture.endpoints.success, { method: 'GET' })).status, 405);
});

test('timeout endpoint really responds after the application four-second deadline', async (t) => {
  const fixture = await usingFixture(t);
  assert.ok(TIMEOUT_DELAY_MS > 4_000);
  const started = performance.now();
  const result = await send(fixture.endpoints.timeout);
  assert.ok(performance.now() - started > 4_000);
  assert.deepEqual(matchedContent(result), { status: 'matched', candidateTokens: [TOKENS[0]] });
  assert.equal(fixture.snapshot().pendingTimeouts, 0);
});

test('client cancellation immediately clears the pending timeout without an unhandled promise', async (t) => {
  const fixture = await usingFixture(t);
  const controller = new AbortController();
  const rejection = assert.rejects(send(fixture.endpoints.timeout, { signal: controller.signal }), { name: 'AbortError' });
  await until(() => fixture.snapshot().pendingTimeouts === 1);
  controller.abort();
  await rejection;
  await until(() => fixture.snapshot().pendingTimeouts === 0);
  assert.equal(fixture.snapshot().cancelledPosts, 1);
});

test('closing a fixture with an active delay promptly destroys sockets and is idempotent', async (t) => {
  const fixture = await usingFixture(t);
  const rejected = assert.rejects(send(fixture.endpoints.timeout));
  await until(() => fixture.snapshot().pendingTimeouts === 1);
  const started = performance.now();
  await fixture.close();
  await fixture.close();
  await rejected;
  assert.ok(performance.now() - started < 1_000);
  assert.equal(fixture.snapshot().pendingTimeouts, 0);
});
