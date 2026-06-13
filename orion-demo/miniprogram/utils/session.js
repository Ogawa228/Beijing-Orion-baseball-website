const SESSION_KEY = 'orionSessionToken';

function getSession() {
  return wx.getStorageSync(SESSION_KEY) || '';
}

function setSession(token) {
  if (!token) return;
  wx.setStorageSync(SESSION_KEY, token);
}

function clearSession() {
  wx.removeStorageSync(SESSION_KEY);
}

module.exports = {
  getSession,
  setSession,
  clearSession,
};
