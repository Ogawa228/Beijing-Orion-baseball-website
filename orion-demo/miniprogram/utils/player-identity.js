const DEFAULT_PUBLIC_PLAYER_AVATAR = '/assets/orion-default-player-avatar.png';

function maskPlayerName(name) {
  const chars = Array.from(String(name || '').trim());
  if (!chars.length) return '星X';
  if (chars.length === 1) return `${chars[0]}X`;
  return `${chars[0]}${chars.length >= 3 ? ' ' : ''}${'X'.repeat(Math.max(1, chars.length - 1))}`;
}

function maskPlayerIdentityName(player) {
  const candidates = [player?.name].concat(Array.isArray(player?.aliases) ? player.aliases : [])
    .map(value => String(value || '').trim())
    .filter(Boolean)
    .sort((a, b) => Array.from(b).length - Array.from(a).length);
  return maskPlayerName(candidates[0] || player?.name || '');
}

function playerLevel(player) {
  return player?.level || 'verified';
}

function userPermissions(user) {
  return Array.isArray(user?.permissions) ? user.permissions : [];
}

function viewerCanReveal(player, viewer = {}) {
  if (!player) return false;
  const user = viewer.user || null;
  const viewerPlayer = viewer.player || null;
  const permissions = userPermissions(user);
  if (user?.role === 'admin') return true;
  if (permissions.includes('players:write') || permissions.includes('players:display_write')) return true;
  const boundPlayerId = user?.boundPlayerId || user?.bound_player_id || '';
  if (boundPlayerId && boundPlayerId === player.id) return true;
  if (viewerPlayer?.id && viewerPlayer.id === player.id) return true;
  return !!(viewerPlayer && playerLevel(viewerPlayer) === 'verified');
}

function playerIdentity(player, viewer = {}) {
  if (!player) {
    return {
      displayName: '',
      avatar: DEFAULT_PUBLIC_PLAYER_AVATAR,
      isFrostedName: false,
      isFrostedAvatar: false,
      nameClass: '',
      avatarClass: '',
      accessibleName: '球员公开资料',
      photoAlt: '球员公开头像',
    };
  }
  const reveal = viewerCanReveal(player, viewer);
  const hasPublicName = !!String(player?.publicDisplayName || '').trim();
  const hasPublicAvatar = !!String(player?.publicAvatar || '').trim();
  const isFrostedName = !reveal && !hasPublicName;
  const isFrostedAvatar = !reveal && !hasPublicAvatar;
  const displayName = hasPublicName
    ? String(player.publicDisplayName).trim()
    : (player?.name || maskPlayerIdentityName(player) || '队员');
  const avatar = hasPublicAvatar
    ? String(player.publicAvatar).trim()
    : (player?.photo || DEFAULT_PUBLIC_PLAYER_AVATAR);
  const canExposeName = reveal || hasPublicName;
  return {
    displayName,
    avatar,
    isFrostedName,
    isFrostedAvatar,
    nameClass: isFrostedName ? 'identity-frosted-name' : '',
    avatarClass: isFrostedAvatar ? 'identity-frosted-avatar' : '',
    accessibleName: canExposeName ? displayName : '球员公开资料',
    photoAlt: canExposeName ? displayName : '球员公开头像',
  };
}

// 公开身份的唯一入口只保留 playerIdentity;maskPlayerName / viewerCanReveal 是内部实现,
// 不导出,避免页面绕过统一的公开展示/磨砂规则。
module.exports = {
  playerIdentity,
};
