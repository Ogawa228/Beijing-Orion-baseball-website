// 自定义 tabBar:活动中心 / 数据中心 / 签到(中央大钮) / 积分榜 / 我的
// 中央"签到"用凸起金色大圆钮,微信原生 tabBar 不支持该形态,故走 custom 组件。
// 各 tab 页 onShow 调 this.getTabBar().setActiveByRoute(this.route) 同步选中态。
const TABS = [
  { pagePath: '/pages/events/event-list/event-list', text: '活动中心', icon: '📅' },
  { pagePath: '/pages/home/home', text: '数据中心', icon: '📊' },
  { pagePath: '/pages/checkin/checkin', text: '签到', primary: true },
  { pagePath: '/pages/points/points', text: '积分榜', icon: '🏆' },
  { pagePath: '/pages/profile/profile', text: '我的', icon: '👤' },
];

Component({
  data: {
    active: 1,
    tabs: TABS,
  },

  methods: {
    setActiveByRoute(route) {
      const path = String(route || '').startsWith('/') ? String(route) : `/${route || ''}`;
      const index = TABS.findIndex(tab => tab.pagePath === path);
      if (index >= 0 && index !== this.data.active) {
        this.setData({ active: index });
      }
    },

    onTabTap(e) {
      const index = Number(e.currentTarget.dataset.index);
      const tab = TABS[index];
      if (!tab) return;
      if (index === this.data.active) return;
      wx.switchTab({ url: tab.pagePath });
    },
  },
});
