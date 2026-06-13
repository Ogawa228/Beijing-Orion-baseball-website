const LEGAL_URL = 'https://www.猎户座棒垒球.cn/legal.html';

Page({
  data: {
    url: LEGAL_URL,
  },

  onLoad(options = {}) {
    const url = options.url ? decodeURIComponent(options.url) : LEGAL_URL;
    this.setData({ url });
  },
});
