// 管理后台 API 路由：纯函数实现，Node 服务端和浏览器内的在线预览版共用同一份逻辑。

const { createState } = require('./store');
const { Gateway, TOOLS, ROLE_LABEL } = require('./gateway');

function createApp() {
  const state = createState();
  return { state, gateway: new Gateway(state) };
}

function snapshot(app) {
  const { state, gateway } = app;
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

// 返回 { status, body }
function routeApi(app, method, pathname, body = {}) {
  const { state, gateway } = app;
  const m = (re) => pathname.match(re);
  let r;

  if (method === 'GET' && pathname === '/api/state') return { status: 200, body: snapshot(app) };

  if (method === 'POST' && pathname === '/api/simulate') {
    const agent = state.agents.find((a) => a.id === body.agentId);
    const entry = gateway.handle({ token: agent?.token || 'invalid', tool: body.tool, args: body.args || {}, via: 'simulator' });
    return { status: 200, body: entry };
  }

  if (method === 'POST' && (r = m(/^\/api\/approvals\/(\d+)\/(approve|reject)$/))) {
    return { status: 200, body: gateway.decideApproval(Number(r[1]), r[2] === 'approve') };
  }

  if (method === 'POST' && (r = m(/^\/api\/audit\/(\d+)\/rollback$/))) {
    gateway.rollback(Number(r[1]));
    return { status: 200, body: { ok: true } };
  }

  if (method === 'POST' && (r = m(/^\/api\/agents\/([\w-]+)\/toggle$/))) {
    const ag = state.agents.find((a) => a.id === r[1]);
    if (!ag) return { status: 404, body: { error: 'Agent 不存在' } };
    ag.status = ag.status === 'active' ? 'suspended' : 'active';
    return { status: 200, body: ag };
  }

  if (method === 'PUT' && (r = m(/^\/api\/policies\/([\w-]+)$/))) {
    const p = state.policies[r[1]];
    if (!p) return { status: 404, body: { error: '账户不存在' } };
    for (const k of ['maxIncreasePct', 'approvalAboveUsd', 'accountDailyCap', 'maxChangesPerHour']) {
      if (body[k] !== undefined) p[k] = Math.max(0, Number(body[k]) || 0);
    }
    for (const k of ['forbidDelete', 'requireApprovalForCreate']) if (body[k] !== undefined) p[k] = !!body[k];
    if (Array.isArray(body.protectedTags)) p.protectedTags = body.protectedTags.map(String).filter(Boolean);
    return { status: 200, body: p };
  }

  if (method === 'PUT' && (r = m(/^\/api\/grants\/([\w-]+)$/))) {
    const g = state.grants.find((x) => x.id === r[1]);
    if (!g) return { status: 404, body: { error: '授权不存在' } };
    g.role = ['analyst', 'operator', 'manager'].includes(body.role) ? body.role : null;
    return { status: 200, body: g };
  }

  if (method === 'POST' && pathname === '/api/reset') {
    Object.assign(app, createApp());
    return { status: 200, body: { ok: true } };
  }

  return { status: 404, body: { error: 'Not found' } };
}

module.exports = { createApp, snapshot, routeApi };
