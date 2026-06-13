function scoreText(game) {
  if (!game) return '';
  return `${game.away || '-'} ${game.awayScore ?? '-'} : ${game.homeScore ?? '-'} ${game.home || '-'}`;
}

function toast(title, icon = 'none') {
  wx.showToast({ title, icon });
}

function showError(err, fallback = '操作失败') {
  const msg = (err && err.message) || fallback;
  wx.showToast({ title: msg.slice(0, 18), icon: 'none' });
}

module.exports = {
  scoreText,
  toast,
  showError,
};
