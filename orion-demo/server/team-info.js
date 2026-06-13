const TEAM_INFO = [
  { icon: '📍', label: '主场', value: '北京 · 奥体中心棒垒球场', copyValue: '北京 奥体中心棒垒球场' },
  { icon: '🗓', label: '训练时间', value: '每周三、周五、周日 20:00 - 22:00（具体看群）', copyValue: '每周三、周五、周日 20:00 - 22:00（具体看群）' },
  { icon: '⭐', label: '成立时间', value: '2013 年 9 月', copyValue: '2013 年 9 月' },
  { icon: '📕', label: '官方小红书', value: '@北京猎户座棒垒球俱乐部', copyValue: '@北京猎户座棒垒球俱乐部' },
  { icon: '✉', label: '邮箱', value: 'orion@beijing-orion.com', copyValue: 'orion@beijing-orion.com' },
];

function getTeamInfo() {
  return TEAM_INFO.map(item => ({ ...item }));
}

module.exports = { getTeamInfo };
