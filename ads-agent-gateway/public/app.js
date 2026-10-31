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

// 控制项编号：网关检查链中每一步对应的内控点
const CONTROLS = {
  身份认证: 'IAM-01', 资产范围: 'IAM-02', 操作权限: 'IAM-03',
  受保护对象: 'AST-01', 禁止删除: 'AST-02',
  单次涨幅: 'SPD-01', 账户日预算上限: 'SPD-02', 频率限制: 'SPD-03',
  人工审批: 'CHG-01',
};

const RISK = { high: '高风险', medium: '中风险', low: '低风险' };

// 合规演练：每个场景都是一次真实的网关调用
const SCENARIO_GROUPS = [
  { key: 'spend', title: '花费风控', desc: '防止 Agent 因误操作或策略失控造成超支' },
  { key: 'access', title: '访问治理', desc: '跨组织授权、最小权限与 Agent 身份生命周期' },
  { key: 'asset', title: '资产保护', desc: '核心广告资产与不可逆操作的保护' },
  { key: 'change', title: '变更管理', desc: '分级审批：低风险自动放行，高风险人工确认' },
];

const SCENARIOS = [
  {
    key: 'ok', group: 'change', risk: 'low', control: 'CHG-01', expect: 'allowed',
    title: '低风险调价自动放行',
    story: '投放优化 Agent 将「冲锋衣-再营销」日预算由 $1,200 调至 $1,380（+15%）。',
    impact: '在策略范围内自动执行并完整留痕，不占用人工审批。',
    agentId: 'agt_optimizer', tool: 'update_budget', args: { campaign_id: 'cmp_1002', daily_budget: 1380 },
  },
  {
    key: 'typo', group: 'spend', risk: 'high', control: 'SPD-01', expect: 'denied',
    title: '预算误操作：多输两个零',
    story: '投放优化 Agent 将「冲锋衣-再营销」日预算改为 $120,000。',
    impact: '单次涨幅超过上限即拦截，在执行前阻止当日大额超支。',
    agentId: 'agt_optimizer', tool: 'update_budget', args: { campaign_id: 'cmp_1002', daily_budget: 120000 },
  },
  {
    key: 'cap', group: 'spend', risk: 'high', control: 'SPD-02', expect: 'denied',
    title: '突破账户日预算上限',
    story: '极光内部 Agent 将 TikTok「直播间引流」由 $1,100 调至 $1,600，账户活跃预算合计将超过 $2,400。',
    impact: '账户级预算硬上限：即使每次调整都不大，累计也不能突破上限。',
    agentId: 'agt_inhouse', tool: 'update_budget', args: { campaign_id: 'cmp_2002', daily_budget: 1600 },
  },
  {
    key: 'partner', group: 'access', risk: 'high', control: 'IAM-03', expect: 'denied',
    title: '代理商超出品牌授权',
    story: '投放优化 Agent 尝试修改星禾美妆「口红-新客」预算，而品牌方仅授予代理商只读权限。',
    impact: '有效权限取 Agent 角色与品牌授权的交集，代理商无法突破品牌方设定的边界。',
    agentId: 'agt_optimizer', tool: 'update_budget', args: { campaign_id: 'cmp_3001', daily_budget: 650 },
  },
  {
    key: 'unauth', group: 'access', risk: 'high', control: 'IAM-02', expect: 'denied',
    title: '访问未授权的品牌账户',
    story: '投放优化 Agent 尝试读取星禾美妆 TikTok 账户，品牌方未向代理商授权该账户。',
    impact: '未授权资产不可读取，不同客户之间的数据严格隔离。',
    agentId: 'agt_optimizer', tool: 'list_campaigns', args: { account_id: 'act_tt_stella_sea' },
  },
  {
    key: 'readonly', group: 'access', risk: 'medium', control: 'IAM-03', expect: 'denied',
    title: '只读 Agent 执行写操作',
    story: '数据日报 Agent（分析师角色）尝试暂停「直播间引流」。',
    impact: '最小权限原则：报表类 Agent 只能读取数据，不能改动投放。',
    agentId: 'agt_reporter', tool: 'pause_campaign', args: { campaign_id: 'cmp_2002' },
  },
  {
    key: 'offboard', group: 'access', risk: 'high', control: 'IAM-01', expect: 'denied',
    title: '离职人员遗留的 Agent',
    story: '负责人已离职的「历史投放 Agent」仍持有令牌，尝试修改「帐篷-新客拓展」预算。',
    impact: 'Agent 随负责人离职一并停用，遗留令牌立即失效。',
    agentId: 'agt_legacy', tool: 'update_budget', args: { campaign_id: 'cmp_1003', daily_budget: 1800 },
  },
  {
    key: 'brand', group: 'asset', risk: 'high', control: 'AST-01', expect: 'denied',
    title: '暂停品牌词广告',
    story: '投放优化 Agent 为节省预算，尝试暂停「品牌词-搜索保护」。',
    impact: '品牌词等核心资产受保护，避免品牌流量被竞品截获。',
    agentId: 'agt_optimizer', tool: 'pause_campaign', args: { campaign_id: 'cmp_1001' },
  },
  {
    key: 'delete', group: 'asset', risk: 'high', control: 'AST-02', expect: 'denied',
    title: '删除广告系列',
    story: '新品上架 Agent 尝试删除「黑五预热-测试」。',
    impact: '删除不可恢复且会丢失历史数据，策略要求改用暂停。',
    agentId: 'agt_launcher', tool: 'delete_campaign', args: { campaign_id: 'cmp_1004' },
  },
  {
    key: 'big', group: 'change', risk: 'medium', control: 'CHG-01', expect: 'pending',
    title: '大额调价进入审批',
    story: '投放优化 Agent 将「帐篷-新客拓展」日预算由 $1,500 调至 $2,200（+$700，超过 $500 审批阈值）。',
    impact: '生成审批单，由投放主管确认后网关代为执行；Agent 无法审批自己的请求。',
    agentId: 'agt_optimizer', tool: 'update_budget', args: { campaign_id: 'cmp_1003', daily_budget: 2200 },
  },
  {
    key: 'create', group: 'change', risk: 'medium', control: 'CHG-01', expect: 'pending',
    title: '新建广告系列需审批',
    story: '新品上架 Agent 申请新建「冲锋衣-黑五大促」，日预算 $400。',
    impact: '新增投放须经人工确认，避免计划外的预算流出。',
    agentId: 'agt_launcher', tool: 'create_campaign', args: { account_id: 'act_meta_aurora_us', name: '冲锋衣-黑五大促', daily_budget: 400 },
  },
];

const CAPABILITIES = [
  {
    code: 'IAM', title: 'Agent 身份与生命周期', link: 'access',
    summary: '每个 Agent 都是可识别、可追责、可回收的独立身份。',
    points: ['独立身份，绑定所属组织与责任人', '网关令牌接入，广告平台凭证集中托管', '一键停用，负责人离职即回收'],
  },
  {
    code: 'IAM', title: '跨组织授权', link: 'access',
    summary: '沿用 Business Center 模式，覆盖品牌方、代理商、Agent 三级授权。',
    points: ['品牌方按账户、按角色授权给代理商', '有效权限 = Agent 角色 ∩ 品牌授权，实时生效', '权限矩阵可视化，授权随时收回'],
  },
  {
    code: 'SPD', title: '业务语义策略引擎', link: 'policies',
    summary: '理解金额、涨幅与资产标签，而不只是工具名称。',
    points: ['单次涨幅、账户日预算上限、变更频率', '品牌词等核心资产保护，禁止不可逆操作', '按账户配置，保存后对所有 Agent 生效'],
  },
  {
    code: 'CHG', title: '分级审批与职责分离', link: 'approvals',
    summary: '低风险自动执行，高风险转人工确认。',
    points: ['按金额阈值与操作类型自动分级', 'Agent 不能审批自己的请求', '飞书 / 企业微信 / 钉钉审批推送（规划中）'],
  },
  {
    code: 'AUD', title: '审计、回滚与追责', link: 'audit',
    summary: '每一次调用都能追溯到 Agent、责任人和命中的控制项。',
    points: ['完整检查链与变更前后快照', '已执行的变更一键回滚', '审计导出与 SIEM 对接（规划中）'],
  },
  {
    code: 'INT', title: '标准接入与跨平台', link: 'mcp',
    summary: '一个接入点覆盖多个广告平台和任意 MCP Agent。',
    points: ['标准 MCP 协议，兼容 Claude 等 Agent', 'Meta、TikTok 已接入，Amazon、Google 规划中', '工具列表按权限裁剪，看不到就调不了'],
  },
];

const CONTROL_CHAIN = [
  ['IAM-01', '身份认证'], ['IAM-02', '资产范围'], ['IAM-03', '最小权限'],
  ['AST', '资产保护'], ['SPD', '花费策略'], ['CHG-01', '分级审批'], ['AUD', '审计留痕'],
];

const STAKEHOLDERS = [
  { role: '品牌方 · 市场负责人', value: '账户交给代理商和 AI 也不失控：授权边界由品牌方定义，可随时收回，所有变更可查。' },
  { role: '代理商 · 管理层', value: '在多客户、多平台上规模化使用 Agent，误操作在执行前被拦截，避免赔付和客户信任损失。' },
  { role: '安全 / IT 负责人', value: 'Agent 身份、最小权限、凭证托管与审计留痕，满足内控与合规审计要求。' },
  { role: '财务 / 预算负责人', value: '账户级预算硬上限加大额审批，广告花费不会因 Agent 失误突破预算。' },
];

const READINESS = [
  { area: '广告平台', items: [['Meta Ads', 1], ['TikTok Ads', 1], ['Amazon Ads', 0], ['Google Ads', 0]] },
  { area: 'Agent 接入', items: [['MCP（Streamable HTTP）', 1], ['Claude 及任意 MCP 客户端', 1], ['OAuth 2.1 授权', 0]] },
  { area: '审批协同', items: [['控制台审批', 1], ['飞书', 0], ['企业微信', 0], ['钉钉', 0]] },
  { area: '身份与安全', items: [['一键停用', 1], ['SSO（Okta / Entra ID / 飞书）', 0], ['SCIM 用户同步', 0], ['凭证加密托管（KMS）', 0]] },
  { area: '审计与合规', items: [['全量审计与回滚', 1], ['审计导出', 0], ['SIEM 对接', 0], ['等保 2.0 / SOC 2 对齐', 0]] },
  { area: '部署方式', items: [['SaaS', 0], ['私有化部署', 0], ['专属云 / 数据驻留', 0]] },
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
      <div><b>${CONTROLS[c.name] ? `<code class="ctl">${CONTROLS[c.name]}</code>` : ''}${esc(c.name)}</b><span>${esc(c.detail)}</span></div></li>`).join('')}</ol>`;
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

// 演练场景的精简结果：判定 + 是否符合预期 + 关键原因，完整检查链折叠
function renderDrillResult(sc, e) {
  if (!e) return '';
  const key = e.checks.find((c) => c.status !== 'pass') || e.checks.at(-1);
  const met = e.decision === sc.expect;
  return `
    <div class="drill-result">
      <div class="dr-head">${badge(e.decision)}
        <span class="${met ? 'met' : 'unmet'}">${met ? '✓ 符合预期' : '✕ 与预期不符'}</span>
        ${e.savedUsd ? `<span class="saved">拦下日预算增量 ${usd(e.savedUsd)}</span>` : ''}
      </div>
      <div class="dr-reason">${CONTROLS[key.name] ? `<code class="ctl">${CONTROLS[key.name]}</code>` : ''}${esc(key.name)}：${esc(key.detail)}</div>
      <details><summary>完整检查链（${e.checks.length} 步）</summary>${renderChecks(e.checks)}</details>
    </div>`;
}

function drillReport() {
  const done = SCENARIOS.filter((sc) => scenarioResults[sc.key]);
  if (!done.length) return '';
  const rs = done.map((sc) => scenarioResults[sc.key]);
  const n = (d) => rs.filter((e) => e.decision === d).length;
  const met = done.filter((sc) => scenarioResults[sc.key].decision === sc.expect).length;
  const saved = rs.reduce((s, e) => s + (e.savedUsd || 0), 0);
  return `
    <div class="report">
      <div class="report-title">演练报告 <span class="sub">${done.length} / ${SCENARIOS.length} 项已运行</span></div>
      <div class="report-grid">
        <div><b class="${met === done.length ? 'ok' : 'bad'}">${met} / ${done.length}</b><span>符合预期</span></div>
        <div><b class="bad">${n('denied')}</b><span>高风险操作被拦截</span></div>
        <div><b class="warn">${n('pending')}</b><span>转人工审批</span></div>
        <div><b class="ok">${n('allowed')}</b><span>低风险自动放行</span></div>
        <div><b class="brand">${usd(saved)}</b><span>拦下的日预算增量</span></div>
        <div><b>${rs.length} / ${rs.length}</b><span>调用已写入审计</span></div>
      </div>
    </div>`;
}

// ---------- 页面：首页 ----------
function pageHome() {
  const s = S.stats;
  const managedBudget = Object.values(S.policies).reduce((t, p) => t + p.accountDailyCap, 0);
  return `
  <section class="hero">
    <div class="hero-grid">
      <div>
        <div class="eyebrow">AI Agent 治理 · 广告投放</div>
        <h1>广告 AI Agent 的企业级治理平台</h1>
        <p class="lead">为品牌方与代理商提供 Agent 身份、跨组织授权、花费风控、分级审批与合规审计。让 AI 在可控边界内操作 Meta 与 TikTok 广告账户，每一次变更都可审批、可追溯、可回滚。</p>
        <div class="hero-actions">
          <button class="btn primary" data-runall>运行合规演练</button>
          <a class="btn" href="#audit">查看审计日志</a>
        </div>
        <div class="hero-note">${window.STATIC_DEMO ? '在线预览版：网关逻辑在浏览器内运行，刷新页面数据会重置。' : '本地演示环境。'}所有组织、账户与数据均为虚构。</div>
      </div>
      <div class="hero-panel">
        <div class="hp-title"><span class="live"></span>实时风控概览</div>
        <div class="hp-row"><span>受管 Agent</span><b>${s.activeAgents} 在线 / ${S.agents.length}</b></div>
        <div class="hp-row"><span>受管广告账户</span><b>${s.accounts} 个 · 2 个平台</b></div>
        <div class="hp-row"><span>受管日预算上限</span><b>${usd(managedBudget)}</b></div>
        <div class="hp-row"><span>网关处理调用</span><b>${s.total}</b></div>
        <div class="hp-row"><span>已拦截高风险操作</span><b class="bad">${s.denied}</b></div>
        <div class="hp-row"><span>待人工审批</span><b class="warn">${s.pending}</b></div>
        <div class="hp-row"><span>拦下的日预算增量</span><b class="good">${usd(s.savedUsd)}</b></div>
      </div>
    </div>
  </section>

  <section>
    <div class="eyebrow dark">核心能力</div>
    <h2>覆盖 Agent 从接入到追责的全链路治理</h2>
    <div class="caps">
      ${CAPABILITIES.map((c) => `
        <div class="cap">
          <span class="cap-code">${c.code}</span>
          <h3>${c.title}</h3>
          <p>${c.summary}</p>
          <ul>${c.points.map((p) => `<li>${p}</li>`).join('')}</ul>
          <a href="#${c.link}" class="cap-link">在演示中查看 →</a>
        </div>`).join('')}
    </div>
  </section>

  <section>
    <div class="eyebrow dark">工作方式</div>
    <h2>每一次调用都经过同一条控制链</h2>
    <div class="chain-wrap">
      <div class="chain-side"><b>AI Agent</b><span>Claude · 自研 Agent · 第三方工具</span><em>只持有网关令牌</em></div>
      <div class="chain">
        ${CONTROL_CHAIN.map(([code, label], i) => `
          <div class="link"><code>${code}</code><span>${label}</span></div>${i < CONTROL_CHAIN.length - 1 ? '<i>→</i>' : ''}`).join('')}
      </div>
      <div class="chain-side"><b>广告平台</b><span>${platformTag('meta')} ${platformTag('tiktok')} Amazon、Google 规划中</span><em>凭证集中托管</em></div>
    </div>
    <p class="muted small">任一控制项不通过即拦截；命中审批条件时生成审批单，不会执行变更；所有结果写入审计日志。</p>
  </section>

  <section id="drill">
    <div class="row-between">
      <div><div class="eyebrow dark">合规演练</div><h2>${SCENARIOS.length} 个典型风险场景</h2></div>
      <button class="btn primary" data-runall>运行全部演练</button>
    </div>
    <p class="muted">每项演练都是一次真实的网关调用，结果会写入审计日志、审批中心和广告账户。需要重来时，点左下角的「重置演示数据」。</p>
    ${drillReport()}
    ${SCENARIO_GROUPS.map((g) => `
      <div class="drill-group">
        <div class="dg-head"><h3>${g.title}</h3><span>${g.desc}</span></div>
        <div class="drills">${SCENARIOS.filter((sc) => sc.group === g.key).map((sc) => `
          <div class="drill">
            <div class="drill-main">
              <div class="drill-tags"><span class="risk risk-${sc.risk}">${RISK[sc.risk]}</span><code class="ctl">${sc.control}</code></div>
              <h4>${sc.title}</h4>
              <p>${sc.story}</p>
              <p class="impact"><b>控制价值</b>${sc.impact}</p>
              ${renderDrillResult(sc, scenarioResults[sc.key])}
            </div>
            <div class="drill-side">
              <span class="expect">预期 ${badge(sc.expect)}</span>
              <button class="btn small" data-run="${sc.key}">${scenarioResults[sc.key] ? '再次运行' : '运行'}</button>
            </div>
          </div>`).join('')}</div>
      </div>`).join('')}
  </section>

  <section>
    <div class="eyebrow dark">适用角色</div>
    <h2>为每个利益相关方解决不同的问题</h2>
    <div class="roles">
      ${STAKEHOLDERS.map((r) => `<div class="role-card"><h3>${r.role}</h3><p>${r.value}</p></div>`).join('')}
    </div>
  </section>

  <section>
    <div class="eyebrow dark">企业就绪度</div>
    <h2>集成、安全与部署</h2>
    <p class="muted small"><span class="chip on">演示可体验</span> 当前原型中已实现 &nbsp; <span class="chip">规划中</span> 产品路线图</p>
    <div class="ready">
      ${READINESS.map((r) => `
        <div class="ready-row"><div class="ready-area">${r.area}</div>
          <div class="ready-items">${r.items.map(([name, on]) => `<span class="chip ${on ? 'on' : ''}">${name}</span>`).join('')}</div>
        </div>`).join('')}
    </div>
  </section>`;
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
    } else if (t.dataset.runall !== undefined) {
      for (const sc of SCENARIOS) await runScenario(sc.key);
      await refresh();
      render();
      document.getElementById('drill').scrollIntoView({ behavior: 'smooth' });
      toast(`${SCENARIOS.length} 项合规演练已完成`);
      return;
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
