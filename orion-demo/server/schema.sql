-- 北京猎户座 · 数据库 schema（MySQL 5.7）
-- 字符集：utf8mb4（必须，否则存不了 emoji 和 CJK 部首字符）
-- 排序规则：utf8mb4_unicode_ci（中文/英文/emoji 都能正常排序）
--
-- 跑一次 scripts/initdb.js 自动建库 + 建所有表
-- 之后可以反复跑同一个脚本（CREATE TABLE IF NOT EXISTS 幂等）

-- ============== 1. 用户与身份（identities）==============
-- users 表是"账号实体"，一个真实人 = 一个 user
-- user_identities 是"登录方式"，一个 user 可以有 email + wx_openid 多条 identity
CREATE TABLE IF NOT EXISTS users (
  id VARCHAR(64) PRIMARY KEY,
  display_name VARCHAR(80) NOT NULL,
  avatar VARCHAR(500) DEFAULT NULL,                 -- 用户自定义头像 URL（与 player.photo 分离）
  role ENUM('admin','player') NOT NULL DEFAULT 'player',
  admin_level ENUM('A','B','C') DEFAULT NULL,        -- A 全站级 / B 队长级 / C 组员级；NULL = 普通用户
  admin_permission_groups JSON DEFAULT NULL,         -- C 组员级权限包：['data'] 数据组 / ['ops'] 运营组；B/A 默认包含全部
  admin_granted_by VARCHAR(64) DEFAULT NULL,
  admin_granted_at DATETIME DEFAULT NULL,
  bound_player_id VARCHAR(64) DEFAULT NULL,
  app_connect_code VARCHAR(40) DEFAULT NULL,
  app_connect_code_expires_at DATETIME DEFAULT NULL,
  last_active_at DATETIME DEFAULT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_admin_level (admin_level),
  INDEX idx_bound_player (bound_player_id),
  INDEX idx_app_connect_code (app_connect_code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS user_identities (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  user_id VARCHAR(64) NOT NULL,
  type ENUM('email','wx_openid','wx_unionid') NOT NULL,
  value VARCHAR(255) NOT NULL,
  password_hash VARCHAR(120) DEFAULT NULL,    -- bcrypt 哈希，仅 email 类型
  app_id VARCHAR(64) DEFAULT NULL,            -- 关联的微信 AppID（wx_openid 类型用）
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_type_value (type, value),
  INDEX idx_user_id (user_id),
  CONSTRAINT fk_identity_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============== 2. 球员（player pool）==============
-- level: 'casual' = 试训，'verified' = 正式
CREATE TABLE IF NOT EXISTS players (
  id VARCHAR(64) PRIMARY KEY,
  name VARCHAR(80) NOT NULL,
  number VARCHAR(8) DEFAULT '',
  position VARCHAR(80) DEFAULT '',
  photo MEDIUMTEXT DEFAULT NULL,             -- data: URL 或 assets/img/players/xxx.jpg
  public_display_name VARCHAR(80) DEFAULT '',-- 球员页公开展示名；空值则前端脱敏真实姓名
  public_avatar MEDIUMTEXT DEFAULT NULL,     -- 球员页公开展示头像；空值则前端使用默认星云头像
  slogan VARCHAR(50) DEFAULT '',
  bats CHAR(1) DEFAULT '',                   -- L/R/S
  throws_ CHAR(1) DEFAULT '',                -- throws 是 MySQL 关键字，加下划线
  join_year INT DEFAULT NULL,
  titles JSON DEFAULT NULL,                  -- ['队长','金手套'] 这种
  aliases JSON DEFAULT NULL,                 -- ['靳江山'] 用于 GameChanger 名字归一化
  level ENUM('casual','verified') NOT NULL DEFAULT 'verified',
  upgraded_at DATETIME DEFAULT NULL,
  upgraded_by VARCHAR(20) DEFAULT NULL,      -- 'auto' / 'admin' / 'bindcode'
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_level (level),
  INDEX idx_name (name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============== 3. 赛事（tournaments）==============
CREATE TABLE IF NOT EXISTS tournaments (
  id VARCHAR(64) PRIMARY KEY,
  type ENUM('cup','league','training','friendly') NOT NULL,
  name VARCHAR(120) NOT NULL,
  short_name VARCHAR(60) DEFAULT '',
  season VARCHAR(20) DEFAULT '',
  sport ENUM('softball','baseball','mixed') DEFAULT 'mixed',
  start_date DATE DEFAULT NULL,
  end_date DATE DEFAULT NULL,
  cover MEDIUMTEXT DEFAULT NULL,
  description TEXT DEFAULT NULL,
  location VARCHAR(120) DEFAULT '',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_season (season),
  INDEX idx_type (type)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============== 4. 比赛（games）==============
-- batting/oppBatting/pitching/oppPitching/linescore/totals 都是 JSON 字段，
-- 完整保留 GameChanger 解析后的结构，前端不用改取数逻辑
CREATE TABLE IF NOT EXISTS games (
  id VARCHAR(64) PRIMARY KEY,
  tournament_id VARCHAR(64) DEFAULT NULL,
  sport VARCHAR(20) DEFAULT '',
  season VARCHAR(20) DEFAULT '',
  season_name VARCHAR(80) DEFAULT '',
  cover MEDIUMTEXT DEFAULT NULL,
  date DATE DEFAULT NULL,
  venue VARCHAR(20) DEFAULT NULL,    -- 不用 ENUM：聚合行的 venue 是 'Season' 不在枚举里
  innings INT DEFAULT NULL,
  home VARCHAR(80) DEFAULT '',
  away VARCHAR(80) DEFAULT '',
  home_score INT DEFAULT NULL,
  away_score INT DEFAULT NULL,
  linescore JSON DEFAULT NULL,
  home_totals JSON DEFAULT NULL,
  away_totals JSON DEFAULT NULL,
  batting JSON DEFAULT NULL,
  opp_batting JSON DEFAULT NULL,
  pitching JSON DEFAULT NULL,
  opp_pitching JSON DEFAULT NULL,
  mvp_player_name VARCHAR(80) DEFAULT '',
  mvp_note VARCHAR(255) DEFAULT '',
  is_aggregate BOOLEAN DEFAULT FALSE,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_tournament (tournament_id),
  INDEX idx_date (date),
  INDEX idx_aggregate (is_aggregate),
  CONSTRAINT fk_game_tournament FOREIGN KEY (tournament_id) REFERENCES tournaments(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============== 5. 活动（events）==============
CREATE TABLE IF NOT EXISTS events (
  id VARCHAR(64) PRIMARY KEY,
  tag VARCHAR(60) DEFAULT '',
  title VARCHAR(120) NOT NULL,
  cover MEDIUMTEXT DEFAULT NULL,
  date VARCHAR(80) DEFAULT '',
  location VARCHAR(120) DEFAULT '',
  body TEXT DEFAULT NULL,
  images JSON DEFAULT NULL,
  source_link VARCHAR(255) DEFAULT '',
  created_at DATE DEFAULT NULL,
  INDEX idx_date (date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============== 6. 名人堂（hall_of_fame）==============
-- 一个 player 最多一条入选记录
CREATE TABLE IF NOT EXISTS hall_of_fame (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  player_id VARCHAR(64) NOT NULL,
  inducted_year INT DEFAULT NULL,
  reason TEXT DEFAULT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_player (player_id),
  CONSTRAINT fk_hof_player FOREIGN KEY (player_id) REFERENCES players(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============== 7. 高光视频（highlights）==============
CREATE TABLE IF NOT EXISTS highlights (
  id VARCHAR(64) PRIMARY KEY,
  game_id VARCHAR(64) DEFAULT NULL,
  player_name VARCHAR(80) DEFAULT '',
  title VARCHAR(255) DEFAULT '',
  url VARCHAR(500) DEFAULT '',
  cover MEDIUMTEXT DEFAULT NULL,
  uploader VARCHAR(64) DEFAULT '',
  status VARCHAR(20) DEFAULT 'pending',    -- pending / approved / published / rejected 等都允许
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_game (game_id),
  INDEX idx_player_name (player_name),
  INDEX idx_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============== 8. 绑定码（bind_codes）==============
-- admin 给预制球员生成，球员注册账号后输入码绑定到 player
CREATE TABLE IF NOT EXISTS bind_codes (
  code VARCHAR(40) PRIMARY KEY,
  player_id VARCHAR(64) NOT NULL,
  used BOOLEAN DEFAULT FALSE,
  used_by VARCHAR(64) DEFAULT NULL,
  used_at DATE DEFAULT NULL,
  created_at DATE DEFAULT NULL,
  INDEX idx_player (player_id),
  INDEX idx_used (used),
  CONSTRAINT fk_bindcode_player FOREIGN KEY (player_id) REFERENCES players(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============== 9. 训练 / 活动签到（attendances）==============
-- 每次签到一行；积分系统按 player_id + kind 聚合算 +5 分
CREATE TABLE IF NOT EXISTS attendances (
  id VARCHAR(64) PRIMARY KEY,
  player_id VARCHAR(64) NOT NULL,
  kind ENUM('training','event') NOT NULL,
  ref_id VARCHAR(64) DEFAULT NULL,
  date DATE NOT NULL,
  note TEXT DEFAULT NULL,
  created_by VARCHAR(64) DEFAULT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_player_kind (player_id, kind),
  INDEX idx_date (date),
  CONSTRAINT fk_att_player FOREIGN KEY (player_id) REFERENCES players(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============== 10. 手动积分调整（points_adjustments）==============
CREATE TABLE IF NOT EXISTS points_adjustments (
  id VARCHAR(64) PRIMARY KEY,
  player_id VARCHAR(64) NOT NULL,
  delta INT NOT NULL,
  reason TEXT DEFAULT NULL,
  game_id VARCHAR(64) DEFAULT NULL,        -- 关联到具体某场比赛（可选，admin 标注哪场比赛的安打/失误）
  created_by VARCHAR(64) DEFAULT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_player (player_id),
  INDEX idx_game_id (game_id),
  CONSTRAINT fk_padj_player FOREIGN KEY (player_id) REFERENCES players(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============== 11. 后台操作记录（admin_audit_logs）==============
CREATE TABLE IF NOT EXISTS admin_audit_logs (
  id VARCHAR(64) PRIMARY KEY,
  actor_user_id VARCHAR(64) DEFAULT NULL,
  action VARCHAR(60) NOT NULL,
  target_type VARCHAR(40) DEFAULT '',
  target_id VARCHAR(64) DEFAULT '',
  summary VARCHAR(255) DEFAULT '',
  metadata JSON DEFAULT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_created_at (created_at),
  INDEX idx_actor (actor_user_id),
  INDEX idx_target (target_type, target_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============== 12. 用户站内信（user_notifications）==============
CREATE TABLE IF NOT EXISTS user_notifications (
  id VARCHAR(64) PRIMARY KEY,
  user_id VARCHAR(64) NOT NULL,
  type VARCHAR(40) NOT NULL,
  title VARCHAR(120) NOT NULL,
  body TEXT DEFAULT NULL,
  payload JSON DEFAULT NULL,
  read_at DATETIME DEFAULT NULL,
  created_by VARCHAR(64) DEFAULT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_user_read (user_id, read_at),
  INDEX idx_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============== 13. 球员绑定申请（player_bind_requests）==============
-- Web / 小程序共用：用户可选择申请绑定正式球员档案，必须由 admin 审批
CREATE TABLE IF NOT EXISTS player_bind_requests (
  id VARCHAR(64) PRIMARY KEY,
  user_id VARCHAR(64) NOT NULL,
  requested_player_id VARCHAR(64) NOT NULL,
  status ENUM('pending','approved','rejected') NOT NULL DEFAULT 'pending',
  real_name VARCHAR(80) NOT NULL,
  nickname VARCHAR(80) DEFAULT '',
  jersey_number VARCHAR(8) DEFAULT '',
  contact_tail VARCHAR(40) DEFAULT '',
  note TEXT DEFAULT NULL,
  source VARCHAR(20) DEFAULT 'web',
  reviewed_by VARCHAR(64) DEFAULT NULL,
  reviewed_at DATETIME DEFAULT NULL,
  review_note TEXT DEFAULT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_user_status (user_id, status),
  INDEX idx_player_status (requested_player_id, status),
  INDEX idx_status_created (status, created_at),
  CONSTRAINT fk_pbr_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_pbr_player FOREIGN KEY (requested_player_id) REFERENCES players(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============== 14. 站点级配置（site_settings）==============
-- 公开页面可读取，管理员发布后全站生效；例如球员页星阵配置
CREATE TABLE IF NOT EXISTS site_settings (
  setting_key VARCHAR(80) PRIMARY KEY,
  value_json JSON NOT NULL,
  updated_by VARCHAR(64) DEFAULT NULL,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_updated_at (updated_at),
  INDEX idx_updated_by (updated_by)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============== 15. 系统迁移记录（_migrations）==============
-- schema 版本控制，避免重复执行迁移
CREATE TABLE IF NOT EXISTS _migrations (
  name VARCHAR(120) PRIMARY KEY,
  applied_at DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
