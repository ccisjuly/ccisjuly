// 广告 Agent 管控网关 · 本地演示
// 零依赖：node server.js 即可运行。
//   - 管理后台：http://localhost:8787
//   - MCP 接入点：http://localhost:8787/mcp（Agent 用各自的 Bearer token 接入）

const http = require('http');
const fs = require('fs');
const path = require('path');
const { createApp, routeApi } = require('./src/api');

const PORT = Number(process.env.PORT) || 8787;
const PUBLIC_DIR = path.join(__dirname, 'public');
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml' };

const app = createApp();

function send(res, status, body, headers = {}) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', ...headers });
  res.end(JSON.stringify(body));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', (c) => {
      raw += c;
      if (raw.length > 1e6) req.destroy();
    });
    req.on('end', () => {
      if (!raw) return resolve({});
      try {
        resolve(JSON.parse(raw));
      } catch (e) {
        reject(new Error('请求体不是合法 JSON'));
      }
    });
  });
}

// ---------- MCP 接入点（Streamable HTTP，JSON 响应） ----------
async function handleMcp(req, res) {
  if (req.method !== 'POST') return send(res, 405, { error: 'MCP 接入点只接受 POST' }, { Allow: 'POST' });
  const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '').trim();
  const agent = app.state.agents.find((a) => a.token === token);
  let msg;
  try {
    msg = await readBody(req);
  } catch (e) {
    return send(res, 400, { jsonrpc: '2.0', id: null, error: { code: -32700, message: e.message } });
  }
  if (!agent) {
    return send(res, 401, { jsonrpc: '2.0', id: msg.id ?? null, error: { code: -32001, message: '缺少或无效的 Agent token' } });
  }
  if (msg.id === undefined || msg.id === null) {
    res.writeHead(202);
    return res.end();
  }
  const ok = (result) => send(res, 200, { jsonrpc: '2.0', id: msg.id, result });

  switch (msg.method) {
    case 'initialize':
      return ok({
        protocolVersion: msg.params?.protocolVersion || '2025-06-18',
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: 'ads-agent-gateway', version: '0.1.0' },
        instructions: `你正在通过广告 Agent 管控网关操作广告账户，身份：${agent.name}。所有操作都会经过权限与预算护栏检查，可能被拦截或转人工审批。`,
      });
    case 'ping':
      return ok({});
    case 'tools/list':
      return ok({
        tools: app.gateway.visibleTools(agent).map((t) => ({ name: t.name, description: t.title, inputSchema: t.inputSchema })),
      });
    case 'tools/call': {
      const e = app.gateway.handle({ token, tool: msg.params?.name, args: msg.params?.arguments || {}, via: 'mcp' });
      const failed = e.checks.find((c) => c.status === 'fail');
      let text;
      if (e.decision === 'allowed') text = `✅ 已执行：${e.description}\n${JSON.stringify(e.result, null, 2)}`;
      else if (e.decision === 'pending') text = `⏸ 已提交人工审批（审批单 #${e.approvalId}）：${e.description}\n原因：${e.checks.at(-1).detail}\n审批通过后网关会自动执行，请勿重复提交。`;
      else text = `⛔ 已被网关拦截：${e.description}\n原因：${failed?.detail || '未知'}`;
      return ok({ content: [{ type: 'text', text }], isError: e.decision === 'denied' });
    }
    default:
      return send(res, 200, { jsonrpc: '2.0', id: msg.id, error: { code: -32601, message: `不支持的方法 ${msg.method}` } });
  }
}

function serveStatic(req, res, url) {
  const rel = url.pathname === '/' ? 'index.html' : url.pathname.slice(1);
  const file = path.normalize(path.join(PUBLIC_DIR, rel));
  if (!file.startsWith(PUBLIC_DIR)) return send(res, 403, { error: 'Forbidden' });
  fs.readFile(file, (err, data) => {
    if (err) return send(res, 404, { error: 'Not found' });
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
    res.end(data);
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  try {
    if (url.pathname === '/mcp') return await handleMcp(req, res);
    if (url.pathname.startsWith('/api/')) {
      const body = req.method === 'GET' ? {} : await readBody(req);
      const r = routeApi(app, req.method, url.pathname, body);
      return send(res, r.status, r.body);
    }
    return serveStatic(req, res, url);
  } catch (e) {
    return send(res, 400, { error: e.message });
  }
});

server.listen(PORT, () => {
  console.log(`广告 Agent 管控网关已启动`);
  console.log(`  管理后台:   http://localhost:${PORT}`);
  console.log(`  MCP 接入点: http://localhost:${PORT}/mcp`);
});
