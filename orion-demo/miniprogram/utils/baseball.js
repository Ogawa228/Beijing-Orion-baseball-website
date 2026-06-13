const POSITIONS = [
  'P', 'C', '1B', '2B', '3B', 'SS', 'LF', 'CF', 'RF', 'SF', 'EH'
];

function orionTeamName(sport) {
  return sport === 'baseball' ? '猎户星' : '猎户座';
}

function createBatter(player, order) {
  return {
    playerId: player.id,
    name: player.name,
    pos: player.slot || '',
    order,
    AB: 0,
    R: 0,
    H: 0,
    RBI: 0,
    BB: 0,
    SO: 0,
    E: 0,
    _1B: 0,
    _2B: 0,
    _3B: 0,
    HR: 0,
  };
}

function sum(list, key) {
  return (list || []).reduce((total, item) => total + Number(item[key] || 0), 0);
}

function emptyLine(innings) {
  return Array.from({ length: Math.max(Number(innings || 1), 1) }, () => 0);
}

module.exports = {
  POSITIONS,
  orionTeamName,
  createBatter,
  sum,
  emptyLine,
};
