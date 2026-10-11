import {createServer} from 'node:http';
import {randomUUID} from 'node:crypto';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {analyzeEvening, proposeEveningOptions, InputError} from './constraints.mjs';

export const protocolVersion = '2025-11-25';
const schema = {type: 'object', additionalProperties: false, required: ['tasks'], properties: {
  tasks: {type: 'array', minItems: 2, maxItems: 8, items: {
    type: 'object', additionalProperties: false,
    required: ['id', 'start', 'end', 'transitionMinutes', 'locked'],
    properties: {
      id: {type: 'string', pattern: '^[a-zA-Z0-9_-]{1,40}$'},
      start: {type: 'string', pattern: '^(?:[01][0-9]|2[0-3]):[0-5][0-9]$'},
      end: {type: 'string', pattern: '^(?:[01][0-9]|2[0-3]):[0-5][0-9]$'},
      transitionMinutes: {type: 'integer', minimum: 0, maximum: 180}, locked: {type: 'boolean'},
      windowStart: {type: 'string', description: 'Required for movable tasks, HH:MM.'},
      windowEnd: {type: 'string', description: 'Required for movable tasks, HH:MM. Task must end by this time.'}
    }
  }}
}};
const tools = [
  {name: 'analyze_evening', title: 'Check evening constraints', description: 'Find overlaps and missing transition time. Send anonymous task IDs and times only. Does not change anything.', execute: analyzeEvening},
  {name: 'propose_evening_options', title: 'Draft feasible evening options', description: 'Propose at most three one-task moves within explicit windows. Preserve locked appointments, duration and transition time. Return unresolved conflicts honestly; do not assume another person is available.', execute: proposeEveningOptions}
];
export const publicTools = tools.map(({execute, ...tool}) => ({...tool, inputSchema: schema,
  annotations: {readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false}}));
export function executeLocalTool(name, arguments_) {
  const tool = tools.find(value => value.name === name);
  if (!tool) throw new InputError('Unknown read-only tool.');
  return tool.execute(arguments_);
}
const record = value => value && typeof value === 'object' && !Array.isArray(value);

// Development-only local MCP endpoint. Remote hosting requires authentication,
// HTTPS and an origin/access design before any real household data is used.
export function createMcpHandler({now = Date.now, maxRequests = 60} = {}) {
  const sessions = new Map(); let windowStart = now(), count = 0;
  return async (request, response) => {
    const send = (status, data, headers = {}) => {
      response.writeHead(status, {'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', ...headers});
      response.end(data === undefined ? undefined : JSON.stringify(data));
    };
    const rpcError = (status, code, message, id = null) => send(status, {jsonrpc: '2.0', id, error: {code, message}});
    try {
      if (request.url !== '/mcp') return send(404, {error: 'Not found.'});
      const host = request.headers.host;
      if (typeof host !== 'string' || !/^(127\.0\.0\.1|localhost):[0-9]+$/.test(host)) return rpcError(403, -32000, 'Local host required.');
      if (request.headers.origin && request.headers.origin !== `http://${host}`) return rpcError(403, -32000, 'Origin rejected.');
      const timestamp = now();
      for (const [id, session] of sessions) if (session.expires <= timestamp) sessions.delete(id);
      if (timestamp - windowStart >= 60000) {windowStart = timestamp; count = 0;}
      if (++count > maxRequests) return rpcError(429, -32000, 'Wait before retrying.');
      if (request.method === 'GET') return send(405, undefined, {Allow: 'POST, DELETE'});
      if (!['POST', 'DELETE'].includes(request.method)) return send(405, undefined, {Allow: 'POST, DELETE'});
      const version = request.headers['mcp-protocol-version'];
      if (version !== undefined && version !== protocolVersion) return rpcError(400, -32000, 'Unsupported protocol version.');
      const sessionId = request.headers['mcp-session-id'], session = sessions.get(sessionId);
      if (sessionId && !session) return rpcError(404, -32000, 'Session expired or not found.');
      if (request.method === 'DELETE') {
        if (!session || version !== protocolVersion) return rpcError(400, -32000, 'Session and protocol headers required.');
        sessions.delete(sessionId); return send(200);
      }
      if (request.headers['content-type']?.split(';')[0].trim() !== 'application/json') return rpcError(415, -32600, 'Send JSON.');
      const accept = request.headers.accept ?? '';
      if (!accept.includes('application/json') || !accept.includes('text/event-stream')) return rpcError(406, -32600, 'Accept both JSON and event-stream responses.');
      let length = 0; const chunks = [];
      for await (const chunk of request) {
        length += chunk.length;
        if (length > 16384) return rpcError(413, -32600, 'Request too large.');
        chunks.push(chunk);
      }
      let message;
      try {message = JSON.parse(Buffer.concat(chunks).toString('utf8'));} catch {return rpcError(400, -32700, 'Invalid JSON.');}
      const hasId = Object.hasOwn(message ?? {}, 'id');
      if (!record(message) || message.jsonrpc !== '2.0' || typeof message.method !== 'string' ||
          (hasId && !(typeof message.id === 'string' || (typeof message.id === 'number' && Number.isFinite(message.id))))) return rpcError(400, -32600, 'Invalid request.');
      const id = message.id;
      if (message.method === 'initialize') {
        if (!hasId || sessionId || !record(message.params) || typeof message.params.protocolVersion !== 'string' ||
            !record(message.params.capabilities) || !record(message.params.clientInfo)) return rpcError(400, -32602, 'Invalid initialization.', id ?? null);
        if (sessions.size >= 20) return rpcError(503, -32000, 'Session capacity reached.', id);
        const token = randomUUID();
        sessions.set(token, {ready: false, expires: timestamp + 900000});
        return send(200, {jsonrpc: '2.0', id, result: {protocolVersion,
          capabilities: {tools: {listChanged: false}}, serverInfo: {name: 'calm-evening', version: '0.4.1'},
          instructions: 'Use anonymous task IDs. Analyze constraints before drafting options. Explain unresolved conflicts and ask the user to choose; never imply a calendar was changed.'}}, {'MCP-Session-Id': token});
      }
      if (!session || version !== protocolVersion) return rpcError(400, -32000, 'Initialize first and provide session and protocol headers.', id ?? null);
      if (!hasId) {
        if (message.method === 'notifications/initialized') session.ready = true;
        return send(202);
      }
      if (message.method === 'ping') return send(200, {jsonrpc: '2.0', id, result: {}});
      if (!session.ready) return rpcError(400, -32000, 'Send initialized notification first.', id);
      if (message.method === 'tools/list') return send(200, {jsonrpc: '2.0', id, result: {tools: publicTools}});
      if (message.method !== 'tools/call') return rpcError(200, -32601, 'Method not found.', id);
      const tool = tools.find(value => value.name === message.params?.name);
      if (!tool || !record(message.params?.arguments)) return rpcError(200, -32602, 'Unknown tool or invalid arguments.', id);
      try {
        const result = executeLocalTool(tool.name, message.params.arguments);
        return send(200, {jsonrpc: '2.0', id, result: {content: [{type: 'text', text: JSON.stringify(result)}], structuredContent: result, isError: false}});
      } catch (error) {
        return send(200, {jsonrpc: '2.0', id, result: {content: [{type: 'text', text: error instanceof InputError ? error.message : 'Could not calculate this schedule.'}], isError: true}});
      }
    } catch {return rpcError(500, -32603, 'Could not process request.');}
  };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PORT ?? 8787);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw Error('Invalid PORT.');
  const server = createServer(createMcpHandler()); server.requestTimeout = 10000;
  server.listen(port, '127.0.0.1', () => console.log(`Calm Evening MCP prototype: http://127.0.0.1:${port}/mcp`));
}
