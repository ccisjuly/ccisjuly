// 演示用的内存数据：品牌方、代理商、广告账户、授权关系、Agent、规则护栏。
// 所有公司、账户、人名均为虚构。

function createState() {
  const orgs = [
    { id: 'brand_aurora', name: '极光户外', type: 'brand' },
    { id: 'brand_stella', name: '星禾美妆', type: 'brand' },
    { id: 'agency_voyage', name: '远航出海代理', type: 'agency' },
  ];

  const accounts = [
    { id: 'act_meta_aurora_us', platform: 'meta', name: '极光户外 · Meta · 美国站', ownerOrg: 'brand_aurora' },
    { id: 'act_tt_aurora_us', platform: 'tiktok', name: '极光户外 · TikTok · 美国站', ownerOrg: 'brand_aurora' },
    { id: 'act_meta_stella_sea', platform: 'meta', name: '星禾美妆 · Meta · 东南亚', ownerOrg: 'brand_stella' },
    { id: 'act_tt_stella_sea', platform: 'tiktok', name: '星禾美妆 · TikTok · 东南亚', ownerOrg: 'brand_stella' },
  ];

  const campaigns = [
    { id: 'cmp_1001', accountId: 'act_meta_aurora_us', name: '品牌词-搜索保护', tags: ['brand'], status: 'ACTIVE', dailyBudget: 800 },
    { id: 'cmp_1002', accountId: 'act_meta_aurora_us', name: '冲锋衣-再营销', tags: [], status: 'ACTIVE', dailyBudget: 1200 },
    { id: 'cmp_1003', accountId: 'act_meta_aurora_us', name: '帐篷-新客拓展', tags: [], status: 'ACTIVE', dailyBudget: 1500 },
    { id: 'cmp_1004', accountId: 'act_meta_aurora_us', name: '黑五预热-测试', tags: ['test'], status: 'PAUSED', dailyBudget: 300 },
    { id: 'cmp_2001', accountId: 'act_tt_aurora_us', name: '达人素材-冲锋衣', tags: [], status: 'ACTIVE', dailyBudget: 900 },
    { id: 'cmp_2002', accountId: 'act_tt_aurora_us', name: '直播间引流', tags: [], status: 'ACTIVE', dailyBudget: 1100 },
    { id: 'cmp_3001', accountId: 'act_meta_stella_sea', name: '口红-新客', tags: [], status: 'ACTIVE', dailyBudget: 600 },
    { id: 'cmp_3002', accountId: 'act_meta_stella_sea', name: '品牌词', tags: ['brand'], status: 'ACTIVE', dailyBudget: 400 },
    { id: 'cmp_4001', accountId: 'act_tt_stella_sea', name: '粉底液-Spark Ads', tags: [], status: 'ACTIVE', dailyBudget: 700 },
  ];

  // 品牌方把自己的广告账户授权给代理商（类似 TikTok Business Center 的合作伙伴授权）
  const grants = [
    { id: 'g1', accountId: 'act_meta_aurora_us', toOrg: 'agency_voyage', role: 'manager' },
    { id: 'g2', accountId: 'act_tt_aurora_us', toOrg: 'agency_voyage', role: 'operator' },
    { id: 'g3', accountId: 'act_meta_stella_sea', toOrg: 'agency_voyage', role: 'analyst' },
    { id: 'g4', accountId: 'act_tt_stella_sea', toOrg: 'agency_voyage', role: null }, // 未授权
  ];

  // 每个 Agent 是一个独立身份：所属组织、角色、被分配的账户、负责人、网关 token
  const agents = [
    {
      id: 'agt_optimizer', name: '投放优化 Agent', orgId: 'agency_voyage', role: 'operator',
      accounts: ['act_meta_aurora_us', 'act_tt_aurora_us', 'act_meta_stella_sea', 'act_tt_stella_sea'],
      sponsor: '王敏（投放主管）', token: 'agt_tok_optimizer_7f3a', status: 'active',
    },
    {
      id: 'agt_reporter', name: '数据日报 Agent', orgId: 'agency_voyage', role: 'analyst',
      accounts: ['act_meta_aurora_us', 'act_tt_aurora_us', 'act_meta_stella_sea'],
      sponsor: '李想（数据分析）', token: 'agt_tok_reporter_2b9c', status: 'active',
    },
    {
      id: 'agt_launcher', name: '新品上架 Agent', orgId: 'agency_voyage', role: 'manager',
      accounts: ['act_meta_aurora_us'],
      sponsor: '王敏（投放主管）', token: 'agt_tok_launcher_5d1e', status: 'active',
    },
    {
      id: 'agt_inhouse', name: '极光内部 Agent', orgId: 'brand_aurora', role: 'manager',
      accounts: ['act_meta_aurora_us', 'act_tt_aurora_us'],
      sponsor: '陈晨（极光市场部）', token: 'agt_tok_inhouse_9a04', status: 'active',
    },
  ];

  const basePolicy = {
    maxIncreasePct: 50, // 单次加预算的最大涨幅
    approvalAboveUsd: 500, // 单次加预算超过该金额需人工审批
    maxChangesPerHour: 20, // 每个 Agent 每小时最多变更次数
    forbidDelete: true, // 禁止 Agent 删除广告系列
    requireApprovalForCreate: true, // 新建广告系列需审批
    protectedTags: ['brand'], // 带这些标签的广告系列禁止 Agent 修改
  };
  const policies = {
    act_meta_aurora_us: { ...basePolicy, accountDailyCap: 5000 },
    act_tt_aurora_us: { ...basePolicy, accountDailyCap: 2400 },
    act_meta_stella_sea: { ...basePolicy, accountDailyCap: 1500 },
    act_tt_stella_sea: { ...basePolicy, accountDailyCap: 1200 },
  };

  return {
    orgs, accounts, campaigns, grants, agents, policies,
    audit: [],
    approvals: [],
    seq: { audit: 0, approval: 0, campaign: 5000 },
  };
}

module.exports = { createState };
