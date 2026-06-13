const SPORT_LABELS = {
  softball: '🥎 慢垒',
  baseball: '⚾ 棒球',
  mixed: '⚾🥎 综合',
};

const EVENT_TAG_LABELS = {
  training: '🏋️ 训练',
  'training · 训练': '🏋️ 训练',
  '🏋️ 训练': '🏋️ 训练',
  game: '⚾ 比赛',
  'game · 比赛': '⚾ 比赛',
  '⚾ 比赛': '⚾ 比赛',
  scrimmage: '🧢 队内赛',
  'scrimmage · 队内赛': '🧢 队内赛',
  '🧢 队内赛': '🧢 队内赛',
  tryout: '🌟 试训',
  'tryout · 试训': '🌟 试训',
  '🌟 试训': '🌟 试训',
  team: '🤝 团队活动',
  'team · 团队活动': '🤝 团队活动',
  '🤝 团队活动': '🤝 团队活动',
  event: '📅 活动',
  '📅 活动': '📅 活动',
};

function normalizeKey(value) {
  return String(value || '').trim().toLowerCase();
}

function hasLatinText(value) {
  return /[A-Za-z]/.test(String(value || ''));
}

function sportLabel(sport) {
  const key = normalizeKey(sport);
  return SPORT_LABELS[key] || SPORT_LABELS.mixed;
}

function eventTagLabel(tag) {
  const key = normalizeKey(tag);
  if (EVENT_TAG_LABELS[key]) return EVENT_TAG_LABELS[key];
  return tag && !hasLatinText(tag) ? `📅 ${tag}` : EVENT_TAG_LABELS.event;
}

module.exports = {
  sportLabel,
  eventTagLabel,
};
