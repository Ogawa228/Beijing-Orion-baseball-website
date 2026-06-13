// 自定义 tabBar:活动中心 / 数据中心 / 签到(中央大钮) / 积分榜 / 我的
// 图标用内联 SVG data-uri(矢量高清,灰/金两态),中央"签到"金色凸起圆钮内嵌矢量对勾。
// 频闪修复:attached 即用 getCurrentPages() 取当前页 route 同步 active,首帧渲染就是正确选中态,
// 不再依赖页面 onShow 后置 setData 把选中态从默认值闪到目标值。
const INACTIVE = '#7f8ca6';
const ACTIVE = '#e4c77a';
const CHECK = '#0a1424';

const ICON_BODY = {
  events: '<rect x="3.5" y="5" width="17" height="15.5" rx="2.5"/><path d="M3.5 9.5h17"/><path d="M8 3v3.5"/><path d="M16 3v3.5"/>',
  data: '<rect x="4" y="13" width="3.4" height="7.5" rx="1.2"/><rect x="10.3" y="8" width="3.4" height="12.5" rx="1.2"/><rect x="16.6" y="10.5" width="3.4" height="10" rx="1.2"/>',
  trophy: '<path d="M6.5 4.5h11v3a5.5 5.5 0 0 1-11 0z"/><path d="M9.5 20.5h5"/><path d="M12 13.5v4"/><path d="M6.5 5.5H4.5v1A2.5 2.5 0 0 0 7 9"/><path d="M17.5 5.5h2v1A2.5 2.5 0 0 1 17 9"/>',
  user: '<circle cx="12" cy="8" r="3.4"/><path d="M5.5 20a6.5 6.5 0 0 1 13 0"/>',
};
const CHECK_BODY = '<path d="M5 12.4l4.3 4.3L19 7"/>';

function svgIcon(body, color, strokeWidth) {
  const sw = strokeWidth || 1.8;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;
  return 'data:image/svg+xml,' + encodeURIComponent(svg);
}

const TABS = [
  { pagePath: '/pages/events/event-list/event-list', text: '活动中心', icon: svgIcon(ICON_BODY.events, INACTIVE), iconActive: svgIcon(ICON_BODY.events, ACTIVE) },
  { pagePath: '/pages/home/home', text: '数据中心', icon: svgIcon(ICON_BODY.data, INACTIVE), iconActive: svgIcon(ICON_BODY.data, ACTIVE) },
  { pagePath: '/pages/checkin/checkin', text: '签到', primary: true },
  { pagePath: '/pages/points/points', text: '积分榜', icon: svgIcon(ICON_BODY.trophy, INACTIVE), iconActive: svgIcon(ICON_BODY.trophy, ACTIVE) },
  { pagePath: '/pages/profile/profile', text: '我的', icon: svgIcon(ICON_BODY.user, INACTIVE), iconActive: svgIcon(ICON_BODY.user, ACTIVE) },
];
const CHECKIN_ICON = svgIcon(CHECK_BODY, CHECK, 2.6);

Component({
  data: {
    active: 1,
    tabs: TABS,
    checkinIcon: CHECKIN_ICON,
  },

  lifetimes: {
    attached() {
      this.syncFromCurrentPage();
    },
  },

  methods: {
    // 组件挂载即按当前页定位选中态,避免首帧用默认值再 setData 造成选中态闪烁
    syncFromCurrentPage() {
      const pages = getCurrentPages();
      const cur = pages[pages.length - 1];
      if (cur && cur.route) this.setActiveByRoute(cur.route);
    },

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
      if (!tab || index === this.data.active) return;
      wx.switchTab({ url: tab.pagePath });
    },
  },
});
