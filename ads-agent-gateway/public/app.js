// 管理后台前端：原生 JS + hash 路由，数据全部来自 /api/state。

const NAV = [
  { path: 'home', label: '首页', icon: '◎' },
  { path: 'simulator', label: 'Agent 模拟器', icon: '▶' },
  { path: 'approvals', label: '审批中心', icon: '⏸' },
  { path: 'audit', label: '审计日志', icon: '☰' },
  { path: 'access', label: '组织与授权', icon: '⛓' },
  { path: 'policies', label: '规则护栏', icon: '⛨' },
  { path: 'accounts', label: '广告账户', icon: '▦' },
  { path: 'mcp', label: 'MCP 接入', icon: '⇄' },
];

const SCENARIOS = [
  {
    key: 'ok', title: '正常调价', expect: 'allowed',
    story: '优化 Agent 把「冲锋衣-再营销」日预算 $1,200 → $1,380（+15%）',
    agentId: 'agt_optimizer', tool: 'update_budget', args: { campaign_id: 'cmp_1002', daily_budget: 1380 },
  },
  {
    key: 'typo', title: '手滑多打两个零', expect: 'denied',
    story: '优化 Agent 把「冲锋衣-再营销」日预算改成 $120,000',
    agentId: 'agt_optimizer', tool: 'update_budget', args: { campaign_id: 'cmp_1002', daily_budget: 120000 },
  },
  {
    key: 'big', title: '大额调价要审批', expect: 'pending',
    story: '优化 Agent 把「帐篷-新客拓展」日预算 $1,500 → $2,200（+$700）',
    agentId: 'agt_optimizer', tool: 'update_budget', args: { campaign_id: 'cmp_1003', daily_budget: 2200 },
  },
  {
    key: 'cap', title: '突破账户日预算上限', expect: 'denied',
    story: '极光内部 Agent 把 TikTok「直播间引流」$1,100 → $1,600，账户合计将超过 $2,400 上限',
    agentId: 'agt_inhouse', tool: 'update_budget', args: { campaign_id: 'cmp_2002', daily_budget: 1600 },
  },
  {
    key: 'brand', title: '误关品牌词广告', expect: 'denied',
    story: '优化 Agent 想暂停「品牌词-搜索保护」',
    agentId: 'agt_optimizer', tool: 'pause_campaign', args: { campaign_id: 'cmp_1001' },
  },
  {
    key: 'partner', title: '代理商越权改预算', expect: 'denied',
    story: '优化 Agent 修改星禾美妆「口红-新客」预算，但品牌方只给代理商开了只读',
    agentId: 'agt_optimizer', tool: 'update_budget', args: { campaign_id: 'cmp_3001', daily_budget: 650 },
  },
  {
    key: 'unauth', title: '访问未授权账户', expect: 'denied',
    story: '优化 Agent 查看星禾美妆 TikTok 账户，品牌方没有授权给代理商',
    agentId: 'agt_optimizer', tool: 'list_campaigns', args: { account_id: 'act_tt_stella_sea' },
  },
  {
    key: 'readonly', title: '只读 Agent 越界', expect: 'denied',
    story: '数据日报 Agent（只读角色）试图暂停「直播间引流」',
    agentId: 'agt_reporter', tool: 'pause_campaign', args: { campaign_id: 'cmp_2002' },
  },
  {
    key: 'delete', title: '误删广告系列', expect: 'denied',
    story: '新品上架 Agent 要删除「黑五预热-测试」',
    agentId: 'agt_launcher', tool: 'delete_campaign', args: { campaign_id: 'cmp_1004' },
  },
  {
    key: 'create', title: '新建广告系列', expect: 'pending',
    story: '新品上架 Agent 新建「冲锋衣-黑五大促」，日预算 $400',
    agentId: 'agt_launcher', tool: 'create_campaign', args: { account_id: 'act_meta_aurora_us', name: '冲锋衣-黑五大促', daily_budget: 400 },
  },
];

const NEEDS = [
  {
    icon: '💸', title: '防止 Agent 乱花钱',
    pain: 'Agent 手滑多打两个零、连续加预算，钱当天就花出去了，追不回来。',
    solution: '广告语义级护栏：单次涨幅上限、账户日预算总上限、每小时变更次数上限。网关看得懂「改成多少钱、涨了多少」，不只是看工具名。',
    link: 'policies', linkText: '看规则护栏',
  },
  {
    icon: '✋', title: '高风险操作必须有人把关',
    pain: '大额调价、新建广告这类动作，全交给 Agent 不放心，全靠人工又失去了自动化的意义。',
    solution: '超过阈值自动转人工审批，批准后由网关执行；小额日常调整自动放行，不打扰人。',
    link: 'approvals', linkText: '看审批中心',
  },
  {
    icon: '⛓', title: '品牌方 × 代理商多方授权',
    pain: '品牌方把账户交给代理商，代理商又交给 Agent，谁能动哪个账户、能动到什么程度，说不清。',
    solution: '沿用 Business Center 的思路：品牌方把账户按角色授权给代理商，代理商再分配给 Agent，有效权限取两者交集，品牌方随时可收回。',
    link: 'access', linkText: '看组织与授权',
  },
  {
    icon: '🌐', title: '跨平台一套规则',
    pain: 'Meta、TikTok 各有各的权限设置，代理商同时投多个平台，规则散落在各处。',
    solution: '一个网关同时接入 Meta / TikTok（后续可接 Amazon、Google），权限、护栏、审批、审计统一管理。',
    link: 'accounts', linkText: '看广告账户',
  },
  {
    icon: '↺', title: '出了事说得清、改得回',
    pain: 'Agent 改了什么、谁授权的、什么时候改的，事后查不到；改错了只能手动一个个恢复。',
    solution: '每次调用都记录完整检查链和变更前后快照，放行的变更支持一键回滚；异常 Agent 可一键停用（Kill Switch）。',
    link: 'audit', linkText: '看审计日志',
  },
  {
    icon: '🔑', title: '平台凭证不交给 Agent',
    pain: '每个 Agent 都拿着广告平台的长期 token，泄露一个就全盘失守。',
    solution: 'Agent 只拿网关发的身份 token，平台凭证集中托管在网关；Agent 看到的工具列表也按权限过滤，看不到就调不了。',
    link: 'mcp', linkText: '看 MCP 接入',
  },
];

const ARG_TEMPLATES = {
  list_accounts: {},
  list_campaigns: { account_id: 'act_meta_aurora_us' },
  get_report: { account_id: 'act_meta_aurora_us' },
  update_budget: { campaign_id: 'cmp_1002', daily_budget: 1300 },
  pause_campaign: { campaign_id: 'cmp_1002' },
  resume_campaign: { campaign_id: 'cmp_1004' },
  create_campaign: { account_id: 'act_meta_aurora_us', name: '新广告系列', daily_budget: 300 },
  delete_campaign: { campaign_id: 'cmp_1004' },
};

const DECISION = {
  allowed: { label: '放行', cls: 'ok' },
  approved: { label: '审批通过·已执行', cls: 'ok' },
  denied: { label: '拦截', cls: 'bad' },
  pending: { label: '待审批', cls: 'warn' },
  rejected: { label: '已驳回', cls: 'muted' },
};
const PLATFORM = { meta: 'Meta', tiktok: 'TikTok' };
const STATUS = { ACTIVE: '投放中', PAUSED: '已暂停', DELETED: '已删除' };

let S = null; // 最新的服务端状态
const scenarioResults = {};
let simResult = null;

// ---------- 工具函数 ----------
const $ = (sel) => document.querySelector(sel);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const usd = (n) => '$' + Number(n || 0).toLocaleString('en-US', { maximumFractionDigits: 0 });
const time = (ts) => new Date(ts).toLocaleTimeString('zh-CN', { hour12: false });
const route = () => location.hash.replace(/^#\/?/, '').split('?')[0] || 'home';
const orgName = (id) => S.orgs.find((o) => o.id === id)?.name || id;
const accName = (id) => S.accounts.find((a) => a.id === id)?.name || id || '-';
const agentById = (id) => S.agents.find((a) => a.id === id);
const roleLabel = (r) => (r ? S.roleLabels[r] : '未授权');
const badge = (d) => `<span class="badge ${DECISION[d]?.cls || ''}">${DECISION[d]?.label || d}</span>`;
const platformTag = (p) => (p ? `<span class="pf pf-${p}">${PLATFORM[p]}</span>` : '');

async function api(path, opts = {}) {
  const res = await fetch(path, {
    method: opts.method || 'GET',
    headers: { 'Content-Type': 'application/json' },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || '请求失败');
  return data;
}

function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => t.classList.remove('show'), 2200);
}

async function refresh() {
  S = await api('/api/state');
}

function renderChecks(checks) {
  const icon = { pass: '✓', fail: '✕', review: '⏸' };
  return `<ol class="checks">${checks.map((c) => `
    <li class="ck-${c.status}"><span class="ck-icon">${icon[c.status]}</span>
      <div><b>${esc(c.name)}</b><span>${esc(c.detail)}</span></div></li>`).join('')}</ol>`;
}

function renderResult(e) {
  if (!e) return '';
  return `
    <div class="result">
      <div class="result-head">${badge(e.decision)}<span>${esc(e.description)}</span></div>
      ${renderChecks(e.checks)}
      ${e.decision === 'pending' ? `<div class="hint">已生成审批单 #${e.approvalId}，到 <a href="#approvals">审批中心</a> 处理。</div>` : ''}
      ${e.result ? `<details><summary>返回给 Agent 的数据</summary><pre>${esc(JSON.stringify(e.result, null, 2))}</pre></details>` : ''}
    </div>`;
}

// ---------- 页面：首页 ----------
function pageHome() {
  const s = S.stats;
  return `
  <section class="hero">
    <div class="hero-tag">${window.STATIC_DEMO ? '在线预览版 · 网关逻辑在浏览器内运行，刷新页面数据会重置' : '本地演示原型'} · 所有公司和数据均为虚构</div>
    <h1>让 AI Agent 安全地操作广告账户</h1>
    <p class="lead">一个放在 Agent 和 Meta / TikTok 广告平台之间的管控网关：每一次改预算、开关广告、新建删除，都先过 <b>权限</b>、<b>预算护栏</b> 和 <b>人工审批</b>，全程留痕，改错了 <b>一键回滚</b>。</p>
    <div class="hero-actions">
      <button class="btn primary" onclick="document.getElementById('scenarios').scrollIntoView({behavior:'smooth'})">一键体验典型场景 ↓</button>
      <a class="btn" href="#simulator">打开 Agent 模拟器</a>
    </div>
  </section>

  <div class="stats">
    <div class="stat"><div class="stat-n">${s.total}</div><div class="stat-l">网关处理的调用</div></div>
    <div class="stat ok"><div class="stat-n">${s.allowed}</div><div class="stat-l">放行执行</div></div>
    <div class="stat bad"><div class="stat-n">${s.denied}</div><div class="stat-l">拦截</div></div>
    <div class="stat warn"><div class="stat-n">${s.pending}</div><div class="stat-l">待人工审批</div></div>
    <div class="stat money"><div class="stat-n">${usd(s.savedUsd)}</div><div class="stat-l">拦下的日预算增量</div></div>
    <div class="stat"><div class="stat-n">${s.activeAgents}<small> / ${S.agents.length}</small></div><div class="stat-l">在线 Agent</div></div>
  </div>

  <h2>主要满足的需求</h2>
  <div class="needs">
    ${NEEDS.map((n, i) => `
      <div class="need">
        <div class="need-top"><span class="need-icon">${n.icon}</span><span class="need-no">需求 ${i + 1}</span></div>
        <h3>${n.title}</h3>
        <p class="pain"><b>痛点</b>${n.pain}</p>
        <p class="sol"><b>怎么解决</b>${n.solution}</p>
        <a href="#${n.link}" class="need-link">${n.linkText} →</a>
      </div>`).join('')}
  </div>

  <h2>它在哪里工作</h2>
  <div class="arch">
    <div class="arch-col">
      <div class="arch-title">AI Agent</div>
      <div class="arch-box">Claude / 自研 Agent</div>
      <div class="arch-box">代理商的投放 Agent</div>
      <div class="arch-box">第三方工具的 Agent</div>
      <div class="arch-note">只持有网关 token</div>
    </div>
    <div class="arch-arrow">MCP →</div>
    <div class="arch-col core">
      <div class="arch-title">管控网关</div>
      <div class="arch-step"><b>1</b> 身份认证 · Kill Switch</div>
      <div class="arch-step"><b>2</b> 资产范围（品牌 → 代理商 → Agent）</div>
      <div class="arch-step"><b>3</b> 操作权限（角色取交集）</div>
      <div class="arch-step"><b>4</b> 广告护栏（涨幅 / 总预算 / 频率 / 保护对象）</div>
      <div class="arch-step"><b>5</b> 超阈值转人工审批</div>
      <div class="arch-step"><b>6</b> 审计留痕 · 一键回滚</div>
    </div>
    <div class="arch-arrow">→</div>
    <div class="arch-col">
      <div class="arch-title">广告平台</div>
      <div class="arch-box">${platformTag('meta')} Meta Ads</div>
      <div class="arch-box">${platformTag('tiktok')} TikTok Ads</div>
      <div class="arch-box dim">Amazon Ads（规划中）</div>
      <div class="arch-box dim">Google Ads（规划中）</div>
      <div class="arch-note">平台凭证集中托管</div>
    </div>
  </div>

  <div class="row-between" id="scenarios">
    <h2>一键体验典型场景</h2>
    <button class="btn primary" id="run-all">全部运行</button>
  </div>
  <p class="muted">每个场景都是一次真实的网关调用，结果会写进审计日志、审批中心和广告账户。想重来可点左下角「重置演示数据」。</p>
  <div class="scenarios">
    ${SCENARIOS.map((sc) => `
      <div class="scenario">
        <div class="sc-head">
          <h3>${sc.title}</h3>
          <span class="expect">预期：${badge(sc.expect)}</span>
        </div>
        <p>${sc.story}</p>
        <button class="btn small" data-run="${sc.key}">运行</button>
        <div class="sc-result">${renderResult(scenarioResults[sc.key])}</div>
      </div>`).join('')}
  </div>

  <h2>适合谁</h2>
  <div class="audience">
    <div class="aud"><h3>出海广告代理商</h3><p>同时为多个品牌投 Meta / TikTok，Agent 花错客户的钱要代理商赔。需要按客户隔离、按角色授权、全程可追溯。</p></div>
    <div class="aud"><h3>跨境大卖家</h3><p>几十上百个广告账户，内部团队 + 外部代理商 + 各类 AI 工具一起操作，需要统一的规则和审批。</p></div>
    <div class="aud"><h3>多代理商的品牌方</h3><p>把账户分给不同代理商，想给每家开不同权限、随时收回，并看清每个 Agent 做了什么。</p></div>
  </div>`;
}

async function runScenario(key) {
  const sc = SCENARIOS.find((x) => x.key === key);
  scenarioResults[key] = await api('/api/simulate', { method: 'POST', body: { agentId: sc.agentId, tool: sc.tool, args: sc.args } });
}

// ---------- 页面：模拟器 ----------
function pageSimulator() {
  return `
  <h1>Agent 模拟器</h1>
  <p class="muted">模拟某个 Agent 通过网关调用广告工具，查看网关每一步的检查结果。真实场景中 Agent 通过 <a href="#mcp">MCP 接入点</a> 发起同样的调用。</p>
  <div class="sim">
    <div class="card">
      <label>以哪个 Agent 的身份调用</label>
      <select id="sim-agent">${S.agents.map((a) => `<option value="${a.id}">${esc(a.name)} · ${esc(orgName(a.orgId))} · ${esc(S.roleLabels[a.role])}${a.status !== 'active' ? '（已停用）' : ''}</option>`).join('')}</select>
      <label>调用的工具</label>
      <select id="sim-tool">${S.tools.map((t) => `<option value="${t.name}">${t.name} · ${t.title}</option>`).join('')}</select>
      <div id="sim-visibility" class="hint"></div>
      <label>参数（JSON）</label>
      <textarea id="sim-args" rows="5">${esc(JSON.stringify(ARG_TEMPLATES.list_accounts, null, 2))}</textarea>
      <button class="btn primary" id="sim-run">发起调用</button>
      <details class="camp-pick"><summary>可用的广告系列 ID（点击填入）</summary>
        <table class="tbl compact">${S.campaigns.filter((c) => c.status !== 'DELETED').map((c) => `
          <tr data-cid="${c.id}" class="pickable"><td><code>${c.id}</code></td><td>${platformTag(S.accounts.find((a) => a.id === c.accountId).platform)} ${esc(c.name)}</td><td>${usd(c.dailyBudget)}</td></tr>`).join('')}
        </table>
      </details>
    </div>
    <div class="card">
      <label>网关判定</label>
      <div id="sim-result">${simResult ? renderResult(simResult) : '<div class="empty">还没有调用，先在左侧发起一次。</div>'}</div>
    </div>
  </div>`;
}

function mountSimulator() {
  const agentSel = $('#sim-agent');
  const toolSel = $('#sim-tool');
  const updateHint = () => {
    const vis = S.effective.find((e) => e.agentId === agentSel.value)?.visibleTools || [];
    const ok = vis.includes(toolSel.value);
    $('#sim-visibility').innerHTML = ok
      ? '✓ 该工具出现在此 Agent 的 MCP 工具列表中'
      : '⚠ 该 Agent 的 MCP 工具列表里<b>看不到</b>这个工具；这里强行调用，用来演示网关在调用时的二次校验';
  };
  toolSel.onchange = () => {
    $('#sim-args').value = JSON.stringify(ARG_TEMPLATES[toolSel.value], null, 2);
    updateHint();
  };
  agentSel.onchange = updateHint;
  updateHint();
  document.querySelectorAll('[data-cid]').forEach((tr) => {
    tr.onclick = () => {
      let args = {};
      try { args = JSON.parse($('#sim-args').value || '{}'); } catch (e) { /* 覆盖无效 JSON */ }
      delete args.account_id;
      args.campaign_id = tr.dataset.cid;
      $('#sim-args').value = JSON.stringify(args, null, 2);
    };
  });
  $('#sim-run').onclick = async () => {
    let args;
    try { args = JSON.parse($('#sim-args').value || '{}'); } catch (e) { return toast('参数不是合法 JSON'); }
    simResult = await api('/api/simulate', { method: 'POST', body: { agentId: agentSel.value, tool: toolSel.value, args } });
    await refresh();
    $('#sim-result').innerHTML = renderResult(simResult);
    renderNav();
  };
}

// ---------- 页面：审批中心 ----------
function pageApprovals() {
  const pending = S.approvals.filter((a) => a.status === 'pending');
  const done = S.approvals.filter((a) => a.status !== 'pending');
  return `
  <h1>审批中心</h1>
  <p class="muted">超过阈值的变更不会直接执行，而是停在这里等人确认。真实产品中会同时推送到飞书 / 企业微信 / Slack。</p>
  ${pending.length ? pending.map((a) => `
    <div class="card approval">
      <div class="ap-main">
        <div class="ap-title">#${a.id} · ${esc(a.description)}</div>
        <div class="ap-meta">${esc(a.agentName)} · ${esc(accName(a.accountId))} · ${time(a.ts)}</div>
        <div class="ap-reason">触发原因：${esc(a.reason)}</div>
      </div>
      <div class="ap-actions">
        <button class="btn primary" data-approve="${a.id}">批准并执行</button>
        <button class="btn" data-reject="${a.id}">驳回</button>
      </div>
    </div>`).join('') : '<div class="empty card">暂无待审批事项。可以去首页运行「大额调价要审批」或「新建广告系列」场景。</div>'}
  ${done.length ? `<h2>处理记录</h2>
  <table class="tbl"><thead><tr><th>单号</th><th>内容</th><th>Agent</th><th>结果</th><th>处理人</th><th>时间</th></tr></thead><tbody>
    ${done.map((a) => `<tr><td>#${a.id}</td><td>${esc(a.description)}</td><td>${esc(a.agentName)}</td><td>${badge(a.status)}</td><td>${esc(a.decidedBy)}</td><td>${time(a.decidedAt)}</td></tr>`).join('')}
  </tbody></table>` : ''}`;
}

// ---------- 页面：审计日志 ----------
let auditFilter = 'all';
function pageAudit() {
  const rows = S.audit.filter((e) => auditFilter === 'all' || e.decision === auditFilter
    || (auditFilter === 'allowed' && e.decision === 'approved'));
  const via = { mcp: 'MCP', simulator: '模拟器', console: '后台' };
  return `
  <div class="row-between"><h1>审计日志</h1>
    <select id="audit-filter">
      ${[['all', '全部'], ['allowed', '放行'], ['denied', '拦截'], ['pending', '待审批'], ['rejected', '已驳回']].map(([v, l]) => `<option value="${v}" ${auditFilter === v ? 'selected' : ''}>${l}</option>`).join('')}
    </select>
  </div>
  <p class="muted">每一次调用都有记录：谁、通过什么入口、对哪个账户、做了什么、每一步检查的结果。放行的变更可以一键回滚。</p>
  ${rows.length ? `<table class="tbl audit"><thead><tr><th>#</th><th>时间</th><th>调用方</th><th>入口</th><th>操作</th><th>结果</th><th></th></tr></thead><tbody>
  ${rows.map((e) => `
    <tr class="${e.rolledBack ? 'rolled' : ''}">
      <td>${e.id}</td><td>${time(e.ts)}</td>
      <td>${esc(e.agentName)}<div class="sub">${esc(e.orgName)}</div></td>
      <td>${via[e.via] || e.via}</td>
      <td>${platformTag(e.platform)} ${esc(e.description)}
        ${e.checks.length ? `<details><summary>检查链</summary>${renderChecks(e.checks)}</details>` : ''}
        ${e.before || e.after ? `<div class="sub">变更：${e.before ? `${STATUS[e.before.status]} / ${usd(e.before.dailyBudget)}` : '（新建）'} → ${STATUS[e.after?.status]} / ${usd(e.after?.dailyBudget)}</div>` : ''}
      </td>
      <td>${e.tool === 'rollback' ? '<span class="badge muted">人工回滚</span>' : badge(e.decision)}${e.rolledBack ? '<div class="sub">已回滚</div>' : ''}</td>
      <td>${e.after && !e.rolledBack ? `<button class="btn small" data-rollback="${e.id}">回滚</button>` : ''}</td>
    </tr>`).join('')}
  </tbody></table>` : '<div class="empty card">还没有记录。去首页运行几个场景试试。</div>'}`;
}

// ---------- 页面：组织与授权 ----------
function pageAccess() {
  const roleOpts = (cur) => [['', '未授权'], ['analyst', S.roleLabels.analyst], ['operator', S.roleLabels.operator], ['manager', S.roleLabels.manager]]
    .map(([v, l]) => `<option value="${v}" ${(cur || '') === v ? 'selected' : ''}>${l}</option>`).join('');
  const cell = (r) => (r ? `<span class="role role-${r}">${S.roleLabels[r]}</span>` : '<span class="role none">—</span>');
  return `
  <h1>组织与授权</h1>
  <div class="callout">
    <b>和 TikTok Business Center 一样的思路：</b>品牌方拥有广告账户 → 按角色授权给代理商 → 代理商把账户分配给自己的 Agent。<br/>
    <b>Agent 的有效权限 = Agent 自身角色 ∩ 品牌方授予代理商的角色</b>，品牌方调低或收回授权，所有相关 Agent 立即生效。
  </div>

  <h2>资产授权（品牌方 → 代理商）</h2>
  <table class="tbl"><thead><tr><th>广告账户</th><th>品牌方</th><th>授权给</th><th>授予角色</th></tr></thead><tbody>
    ${S.grants.map((g) => {
      const acc = S.accounts.find((a) => a.id === g.accountId);
      return `<tr><td>${platformTag(acc.platform)} ${esc(acc.name)}</td><td>${esc(orgName(acc.ownerOrg))}</td><td>${esc(orgName(g.toOrg))}</td>
        <td><select data-grant="${g.id}">${roleOpts(g.role)}</select></td></tr>`;
    }).join('')}
  </tbody></table>

  <h2>Agent 身份</h2>
  <table class="tbl"><thead><tr><th>Agent</th><th>所属组织</th><th>角色</th><th>被分配账户</th><th>负责人</th><th>状态</th><th></th></tr></thead><tbody>
    ${S.agents.map((a) => `<tr class="${a.status !== 'active' ? 'rolled' : ''}">
      <td><b>${esc(a.name)}</b><div class="sub"><code>${a.id}</code></div></td>
      <td>${esc(orgName(a.orgId))}</td><td>${cell(a.role)}</td>
      <td>${a.accounts.map((id) => `<div class="sub">${esc(accName(id))}</div>`).join('')}</td>
      <td>${esc(a.sponsor)}</td>
      <td>${a.status === 'active' ? '<span class="badge ok">在线</span>' : '<span class="badge bad">已停用</span>'}</td>
      <td><button class="btn small ${a.status === 'active' ? 'danger' : ''}" data-toggle="${a.id}">${a.status === 'active' ? '一键停用' : '恢复'}</button></td>
    </tr>`).join('')}
  </tbody></table>

  <h2>有效权限矩阵</h2>
  <p class="muted">实时计算的结果。试着把上面「星禾美妆 · Meta」的授权从只读改成优化师，再看这里的变化。</p>
  <table class="tbl matrix"><thead><tr><th>Agent \\ 账户</th>${S.accounts.map((a) => `<th>${platformTag(a.platform)}<div>${esc(a.name.split(' · ')[0])}</div></th>`).join('')}</tr></thead><tbody>
    ${S.effective.map((e) => `<tr><td><b>${esc(agentById(e.agentId).name)}</b></td>${S.accounts.map((a) => `<td>${cell(e.byAccount[a.id])}</td>`).join('')}</tr>`).join('')}
  </tbody></table>`;
}

// ---------- 页面：规则护栏 ----------
function pagePolicies() {
  return `
  <h1>规则护栏</h1>
  <p class="muted">按广告账户配置。这些规则理解广告业务本身（预算、涨幅、品牌词），而不仅仅是「能不能调用某个工具」。修改后立即对所有 Agent 生效。</p>
  <div class="policies">
  ${S.accounts.map((acc) => {
    const p = S.policies[acc.id];
    const used = S.activeBudget[acc.id];
    const pct = Math.min(100, (used / p.accountDailyCap) * 100);
    return `
    <div class="card policy" data-acc="${acc.id}">
      <div class="pol-head">${platformTag(acc.platform)} <b>${esc(acc.name)}</b></div>
      <div class="bar"><div style="width:${pct}%" class="${pct > 85 ? 'hot' : ''}"></div></div>
      <div class="sub">当前活跃日预算 ${usd(used)} / 上限 ${usd(p.accountDailyCap)}</div>
      <div class="pol-grid">
        <label>单次加预算涨幅上限 <span>超过直接拦截</span><div class="inp"><input type="number" name="maxIncreasePct" value="${p.maxIncreasePct}"/><em>%</em></div></label>
        <label>审批阈值 <span>单次加预算超过此金额需审批</span><div class="inp"><em>$</em><input type="number" name="approvalAboveUsd" value="${p.approvalAboveUsd}"/></div></label>
        <label>账户日预算总上限 <span>所有投放中广告系列合计</span><div class="inp"><em>$</em><input type="number" name="accountDailyCap" value="${p.accountDailyCap}"/></div></label>
        <label>每小时变更次数上限 <span>每个 Agent</span><div class="inp"><input type="number" name="maxChangesPerHour" value="${p.maxChangesPerHour}"/><em>次</em></div></label>
        <label>受保护标签 <span>带这些标签的广告系列禁止 Agent 修改</span><div class="inp"><input type="text" name="protectedTags" value="${esc(p.protectedTags.join(', '))}"/></div></label>
        <div class="checks-col">
          <label class="cb"><input type="checkbox" name="forbidDelete" ${p.forbidDelete ? 'checked' : ''}/> 禁止 Agent 删除广告系列</label>
          <label class="cb"><input type="checkbox" name="requireApprovalForCreate" ${p.requireApprovalForCreate ? 'checked' : ''}/> 新建广告系列需审批</label>
        </div>
      </div>
      <button class="btn primary small" data-save="${acc.id}">保存</button>
    </div>`;
  }).join('')}
  </div>`;
}

// ---------- 页面：广告账户 ----------
function pageAccounts() {
  return `
  <h1>广告账户</h1>
  <p class="muted">模拟的 Meta / TikTok 广告账户实时状态。Agent 通过网关做的变更、审批执行和回滚都会反映在这里。</p>
  ${S.accounts.map((acc) => {
    const p = S.policies[acc.id];
    const used = S.activeBudget[acc.id];
    const pct = Math.min(100, (used / p.accountDailyCap) * 100);
    const cs = S.campaigns.filter((c) => c.accountId === acc.id);
    return `
    <div class="card account">
      <div class="row-between">
        <div>${platformTag(acc.platform)} <b>${esc(acc.name)}</b> <span class="sub">品牌方：${esc(orgName(acc.ownerOrg))} · <code>${acc.id}</code></span></div>
        <div class="sub">活跃日预算 ${usd(used)} / ${usd(p.accountDailyCap)}</div>
      </div>
      <div class="bar"><div style="width:${pct}%" class="${pct > 85 ? 'hot' : ''}"></div></div>
      <table class="tbl compact"><thead><tr><th>广告系列</th><th>ID</th><th>标签</th><th>状态</th><th>日预算</th></tr></thead><tbody>
        ${cs.map((c) => `<tr class="${c.status === 'DELETED' ? 'rolled' : ''}"><td>${esc(c.name)}</td><td><code>${c.id}</code></td>
          <td>${c.tags.map((t) => `<span class="tag ${p.protectedTags.includes(t) ? 'protected' : ''}">${esc(t)}${p.protectedTags.includes(t) ? ' 🔒' : ''}</span>`).join('')}</td>
          <td><span class="st st-${c.status}">${STATUS[c.status]}</span></td><td>${usd(c.dailyBudget)}</td></tr>`).join('')}
      </tbody></table>
    </div>`;
  }).join('')}`;
}

// ---------- 页面：MCP 接入 ----------
function pageMcp() {
  const origin = window.STATIC_DEMO ? 'http://localhost:8787' : location.origin;
  return `
  <h1>MCP 接入</h1>
  <div class="callout">
    所有 Agent 统一连接 <code>${origin}/mcp</code>，每个 Agent 用自己的身份 token。<br/>
    Agent <b>拿不到</b>任何广告平台凭证；调用 <code>tools/list</code> 时只会看到自己有权使用的工具，调用时网关还会再校验一次。
  </div>
  ${S.agents.map((a) => {
    const vis = S.effective.find((e) => e.agentId === a.id).visibleTools;
    return `
    <div class="card mcp">
      <div class="row-between"><div><b>${esc(a.name)}</b> <span class="sub">${esc(orgName(a.orgId))} · ${esc(S.roleLabels[a.role])}</span></div>
        ${a.status === 'active' ? '<span class="badge ok">在线</span>' : '<span class="badge bad">已停用</span>'}</div>
      <div class="sub">网关 token：<code>${a.token}</code></div>
      <div class="tools">${S.tools.map((t) => `<span class="tool ${vis.includes(t.name) ? 'on' : 'off'}">${t.name}</span>`).join('')}</div>
      <details><summary>接入 Claude Code</summary>
        <pre>claude mcp add --transport http ads-gateway ${origin}/mcp \\
  --header "Authorization: Bearer ${a.token}"</pre></details>
      <details><summary>用 curl 查看它能看到的工具</summary>
        <pre>curl -s ${origin}/mcp \\
  -H "Authorization: Bearer ${a.token}" \\
  -H "Content-Type: application/json" \\
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'</pre></details>
    </div>`;
  }).join('')}`;
}

// ---------- 路由与事件 ----------
const PAGES = {
  home: [pageHome], simulator: [pageSimulator, mountSimulator], approvals: [pageApprovals], audit: [pageAudit],
  access: [pageAccess], policies: [pagePolicies], accounts: [pageAccounts], mcp: [pageMcp],
};

function renderNav() {
  const r = route();
  const pending = S.stats.pending;
  $('#nav').innerHTML = NAV.map((n) => `
    <a href="#${n.path}" class="${r === n.path ? 'active' : ''}"><span class="ni">${n.icon}</span>${n.label}
      ${n.path === 'approvals' && pending ? `<span class="nb">${pending}</span>` : ''}</a>`).join('');
}

function render() {
  const [page, mount] = PAGES[route()] || PAGES.home;
  renderNav();
  $('#app').innerHTML = page();
  if (mount) mount();
}

document.addEventListener('click', async (ev) => {
  const t = ev.target.closest('button');
  if (!t) return;
  try {
    if (t.dataset.run) {
      await runScenario(t.dataset.run);
    } else if (t.id === 'run-all') {
      for (const sc of SCENARIOS) await runScenario(sc.key);
      toast('10 个场景已全部运行');
    } else if (t.dataset.approve) {
      await api(`/api/approvals/${t.dataset.approve}/approve`, { method: 'POST' });
      toast('已批准，网关已执行变更');
    } else if (t.dataset.reject) {
      await api(`/api/approvals/${t.dataset.reject}/reject`, { method: 'POST' });
      toast('已驳回');
    } else if (t.dataset.rollback) {
      await api(`/api/audit/${t.dataset.rollback}/rollback`, { method: 'POST' });
      toast('已回滚到变更前状态');
    } else if (t.dataset.toggle) {
      const a = await api(`/api/agents/${t.dataset.toggle}/toggle`, { method: 'POST' });
      toast(a.status === 'active' ? `${a.name} 已恢复` : `${a.name} 已停用，所有调用将被拒绝`);
    } else if (t.dataset.save) {
      const card = t.closest('.policy');
      const v = (n) => card.querySelector(`[name=${n}]`);
      await api(`/api/policies/${t.dataset.save}`, {
        method: 'PUT',
        body: {
          maxIncreasePct: v('maxIncreasePct').value, approvalAboveUsd: v('approvalAboveUsd').value,
          accountDailyCap: v('accountDailyCap').value, maxChangesPerHour: v('maxChangesPerHour').value,
          protectedTags: v('protectedTags').value.split(/[,，\s]+/).filter(Boolean),
          forbidDelete: v('forbidDelete').checked, requireApprovalForCreate: v('requireApprovalForCreate').checked,
        },
      });
      toast('规则已保存，立即生效');
    } else if (t.id === 'reset') {
      await api('/api/reset', { method: 'POST' });
      Object.keys(scenarioResults).forEach((k) => delete scenarioResults[k]);
      simResult = null;
      toast('演示数据已重置');
    } else {
      return;
    }
    await refresh();
    render();
  } catch (e) {
    toast(e.message);
  }
});

document.addEventListener('change', async (ev) => {
  const t = ev.target;
  if (t.dataset.grant) {
    await api(`/api/grants/${t.dataset.grant}`, { method: 'PUT', body: { role: t.value || null } });
    toast('授权已更新，相关 Agent 立即生效');
  } else if (t.id === 'audit-filter') {
    auditFilter = t.value;
  } else {
    return;
  }
  await refresh();
  render();
});

window.addEventListener('hashchange', () => {
  render();
  window.scrollTo(0, 0);
});

// 定时刷新，以便看到外部 Agent 通过 MCP 发起的调用
setInterval(async () => {
  const typing = document.activeElement && ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement.tagName);
  if (typing) return;
  const before = S && S.audit.length + S.stats.pending;
  await refresh();
  if (S.audit.length + S.stats.pending !== before) {
    if (['home', 'audit', 'approvals', 'accounts'].includes(route())) render();
    else renderNav();
  }
}, 3000);

refresh().then(render);
