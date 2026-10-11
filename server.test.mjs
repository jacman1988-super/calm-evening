import test from 'node:test';
import assert from 'node:assert/strict';
import {Readable} from 'node:stream';
import {createMcpHandler, protocolVersion} from './server.mjs';

// In-memory transport checks the handler and protocol envelopes, not HTTP sockets,
// SDK interoperability, Alexa connectivity or any model's tool decisions.
function transport(handler) {
  return async (message, headers = {}, method = 'POST', raw) => {
    const request = Readable.from(method === 'POST' ? [Buffer.from(raw ?? JSON.stringify(message))] : []);
    request.method = method; request.url = '/mcp';
    request.headers = {host: '127.0.0.1:8787', 'content-type': 'application/json',
      accept: 'application/json, text/event-stream', ...headers};
    let status, responseHeaders, body;
    await handler(request, {writeHead(code, values) {status = code; responseHeaders = values;}, end(value) {body = value;}});
    return {status, headers: responseHeaders, body: body === undefined ? undefined : JSON.parse(body)};
  };
}
async function initialize(post) {
  const result = await post({jsonrpc: '2.0', id: 1, method: 'initialize', params: {
    protocolVersion, capabilities: {}, clientInfo: {name: 'synthetic-test', version: '1'}
  }});
  assert.equal(result.status, 200); assert.equal(result.body.result.protocolVersion, protocolVersion);
  const headers = {'mcp-session-id': result.headers['MCP-Session-Id'], 'mcp-protocol-version': protocolVersion};
  assert.equal((await post({jsonrpc: '2.0', method: 'notifications/initialized'}, headers)).status, 202);
  return headers;
}
const schedule = {tasks: [
  {id: 'lesson', start: '17:30', end: '18:30', transitionMinutes: 20, locked: true},
  {id: 'routine', start: '18:30', end: '19:00', transitionMinutes: 0, locked: true}
]};

test('MCP initialization, typed tool discovery and structured calls execute real constraint calculations', async () => {
  const post = transport(createMcpHandler()), headers = await initialize(post);
  const list = await post({jsonrpc: '2.0', id: 2, method: 'tools/list'}, headers);
  assert.equal(list.body.result.tools.length, 2);
  assert.equal(list.body.result.tools[0].annotations.readOnlyHint, true);
  const result = await post({jsonrpc: '2.0', id: 3, method: 'tools/call', params: {name: 'analyze_evening', arguments: schedule}}, headers);
  assert.equal(result.body.result.structuredContent.conflicts[0].shortfallMinutes, 20);
  assert.deepEqual(JSON.parse(result.body.result.content[0].text), result.body.result.structuredContent);
  const options = await post({jsonrpc: '2.0', id: 4, method: 'tools/call', params: {name: 'propose_evening_options', arguments: schedule}}, headers);
  assert.equal(options.body.result.structuredContent.status, 'needs_coordination');
  assert.equal(options.body.result.isError, false);
});
test('host, origin, protocol and lifecycle gates reject mismatched or premature requests', async () => {
  const post = transport(createMcpHandler());
  const request = {jsonrpc: '2.0', id: 2, method: 'tools/list'};
  assert.equal((await post(request)).status, 400);
  assert.equal((await post(request, {host: 'attacker.example:8787'})).status, 403);
  assert.equal((await post(request, {origin: 'https://attacker.example'})).status, 403);
  assert.equal((await post(request, {'mcp-protocol-version': '2025-03-26'})).status, 400);
  assert.equal((await post(request, {accept: 'application/json'})).status, 406);
  const init = await post({jsonrpc: '2.0', id: 1, method: 'initialize', params: {protocolVersion, capabilities: {}, clientInfo: {name: 'synthetic', version: '1'}}});
  const headers = {'mcp-session-id': init.headers['MCP-Session-Id'], 'mcp-protocol-version': protocolVersion};
  assert.equal((await post(request, headers)).status, 400);
  assert.equal((await post(undefined, headers, 'GET')).status, 405);
});
test('invalid tool arguments produce safe tool errors; malformed RPC and unknown tools produce protocol errors', async () => {
  const post = transport(createMcpHandler()), headers = await initialize(post);
  const bad = await post({jsonrpc: '2.0', id: 4, method: 'tools/call', params: {name: 'analyze_evening', arguments: {...schedule, email: 'FAKE_PRIVATE'}}}, headers);
  assert.equal(bad.body.result.isError, true);
  assert.ok(!JSON.stringify(bad.body).includes('FAKE_PRIVATE'));
  const unknown = await post({jsonrpc: '2.0', id: 5, method: 'tools/call', params: {name: 'delete_calendar', arguments: {}}}, headers);
  assert.equal(unknown.body.error.code, -32602);
  assert.equal((await post({}, headers, 'POST', '{')).body.error.code, -32700);
  assert.equal((await post([], headers)).body.error.code, -32600);
  assert.equal((await post({}, headers, 'POST', 'x'.repeat(17000))).status, 413);
});
test('sessions expire or close and traffic limits are enforced', async () => {
  let clock = 0;
  const post = transport(createMcpHandler({now: () => clock}));
  const headers = await initialize(post); clock = 900001;
  assert.equal((await post({jsonrpc: '2.0', id: 3, method: 'tools/list'}, headers)).status, 404);
  const fresh = await initialize(post);
  assert.equal((await post(undefined, fresh, 'DELETE')).status, 200);
  assert.equal((await post({jsonrpc: '2.0', id: 4, method: 'tools/list'}, fresh)).status, 404);
  const limited = transport(createMcpHandler({maxRequests: 1}));
  await limited({}); assert.equal((await limited({})).status, 429);
});
