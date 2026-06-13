// 共享导航工具:tabBar 页必须用 wx.switchTab(且不能带 query),普通页走 wx.navigateTo。
// 5 个 tab 页清单与 app.json tabBar.list 保持一致;改 tab 结构时两处同步。
const TAB_PATHS = [
  '/pages/events/event-list/event-list',
  '/pages/home/home',
  '/pages/checkin/checkin',
  '/pages/points/points',
  '/pages/profile/profile',
];

function isTabPath(url) {
  return TAB_PATHS.indexOf(String(url || '').split('?')[0]) >= 0;
}

function go(url) {
  const target = String(url || '');
  if (!target) return;
  if (isTabPath(target)) {
    wx.switchTab({ url: target.split('?')[0] });
    return;
  }
  wx.navigateTo({ url: target });
}

// tab 页 onShow 调用,保持自定义 tabBar 选中态与当前页一致
function syncTabBar(page) {
  if (!page || typeof page.getTabBar !== 'function') return;
  const bar = page.getTabBar();
  if (bar && typeof bar.setActiveByRoute === 'function') {
    bar.setActiveByRoute(page.route);
  }
}

module.exports = { TAB_PATHS, isTabPath, go, syncTabBar };
