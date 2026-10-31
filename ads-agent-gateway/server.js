// 广告 Agent 管控网关 · 本地演示
// 零依赖：node server.js 即可运行。
//   - 管理后台：http://localhost:8787
//   - MCP 接入点：http://localhost:8787/mcp（Agent 用各自的 Bearer token 接入）

const http = require('http');
const fs = require('fs');
const path = require('path');
const { createState } = require('./src/store');
const { Gateway, TOOLS, ROLE_LABEL } = require('./src/gateway');

const PORT = Number(process.env.PORT) || 8787;
const PUBLIC_DIR = path.join(__dirname, 'public');
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml' };

let state = createState();
let gateway = new Gateway(state);

function send(res, status, body, headers = {}) {
  const data = typeof body === 'string' ? body : JSON.stringify(body);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', ...headers });
  res.end(data);
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

function snapshot() {
  return {
    ...state,
    tools: TOOLS,
    roleLabels: ROLE_LABEL,
    stats: gateway.stats(),
    effective: state.agents.map((ag) => ({
      agentId: ag.id,
      visibleTools: gateway.visibleTools(ag).map((t) => t.name),
      byAccount: Object.fromEntries(state.accounts.map((acc) => [
        acc.id,
        ag.accounts.includes(acc.id) ? gateway.effectiveRole(ag, acc).role : null,
      ])),
    })),
    activeBudget: Object.fromEntries(state.accounts.map((a) => [a.id, gateway.activeBudgetSum(a.id)])),
  };
}

// ---------- 管理后台 API ----------
async function handleApi(req, res, url) {
  const m = (re) => url.pathname.match(re);
  const body = req.method === 'GET' ? {} : await readBody(req);
  let r;

  if (req.method === 'GET' && url.pathname === '/api/state') return send(res, 200, snapshot());

  if (req.method === 'POST' && url.pathname === '/api/simulate') {
    const agent = state.agents.find((a) => a.id === body.agentId);
    const entry = gateway.handle({ token: agent?.token || 'invalid', tool: body.tool, args: body.args || {}, via: 'simulator' });
    return send(res, 200, entry);
  }

  if (req.method === 'POST' && (r = m(/^\/api\/approvals\/(\d+)\/(approve|reject)$/))) {
    return send(res, 200, gateway.decideApproval(Number(r[1]), r[2] === 'approve'));
  }

  if (req.method === 'POST' && (r = m(/^\/api\/audit\/(\d+)\/rollback$/))) {
    gateway.rollback(Number(r[1]));
    return send(res, 200, { ok: true });
  }

  if (req.method === 'POST' && (r = m(/^\/api\/agents\/([\w-]+)\/toggle$/))) {
    const ag = state.agents.find((a) => a.id === r[1]);
    if (!ag) return send(res, 404, { error: 'Agent 不存在' });
    ag.status = ag.status === 'active' ? 'suspended' : 'active';
    return send(res, 200, ag);
  }

  if (req.method === 'PUT' && (r = m(/^\/api\/policies\/([\w-]+)$/))) {
    const p = state.policies[r[1]];
    if (!p) return send(res, 404, { error: '账户不存在' });
    for (const k of ['maxIncreasePct', 'approvalAboveUsd', 'accountDailyCap', 'maxChangesPerHour']) {
      if (body[k] !== undefined) p[k] = Math.max(0, Number(body[k]) || 0);
    }
    for (const k of ['forbidDelete', 'requireApprovalForCreate']) if (body[k] !== undefined) p[k] = !!body[k];
    if (Array.isArray(body.protectedTags)) p.protectedTags = body.protectedTags.map(String).filter(Boolean);
    return send(res, 200, p);
  }

  if (req.method === 'PUT' && (r = m(/^\/api\/grants\/([\w-]+)$/))) {
    const g = state.grants.find((x) => x.id === r[1]);
    if (!g) return send(res, 404, { error: '授权不存在' });
    g.role = ['analyst', 'operator', 'manager'].includes(body.role) ? body.role : null;
    return send(res, 200, g);
  }

  if (req.method === 'POST' && url.pathname === '/api/reset') {
    state = createState();
    gateway = new Gateway(state);
    return send(res, 200, { ok: true });
  }

  return send(res, 404, { error: 'Not found' });
}

// ---------- MCP 接入点（Streamable HTTP，JSON 响应） ----------
async function handleMcp(req, res) {
  if (req.method !== 'POST') return send(res, 405, { error: 'MCP 接入点只接受 POST' }, { Allow: 'POST' });
  const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '').trim();
  const agent = state.agents.find((a) => a.token === token);
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
        tools: gateway.visibleTools(agent).map((t) => ({ name: t.name, description: t.title, inputSchema: t.inputSchema })),
      });
    case 'tools/call': {
      const e = gateway.handle({ token, tool: msg.params?.name, args: msg.params?.arguments || {}, via: 'mcp' });
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
    if (url.pathname.startsWith('/api/')) return await handleApi(req, res, url);
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
