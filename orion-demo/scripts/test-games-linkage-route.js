#!/usr/bin/env node
'use strict';

const assert = require('assert');
const express = require('express');
const path = require('path');

const root = path.resolve(__dirname, '..');
const dbPath = path.join(root, 'server/db.js');
const middlewarePath = path.join(root, 'server/middleware.js');
const peopleHelpersPath = path.join(root, 'server/people-helpers.js');
const gamesRoutePath = path.join(root, 'server/routes/games.js');
const pointsPath = path.join(root, 'server/points.js');

const games = new Map();
const players = [
  { id: 'p1', name: '江山', number: '1', position: 'CF', aliases: JSON.stringify(['Jiang']) },
];
const tournaments = [
  { id: 't_test', name: '测试赛事', short_name: '测试杯', season: '2026', sport: 'softball' },
];
const auditLogs = [];

function parseJson(value, fallback) {
  if (value == null) return fallback;
  if (typeof value !== 'string') return value;
  try { return JSON.parse(value); } catch (_) { return fallback; }
}

function installMocks() {
  delete require.cache[dbPath];
  require.cache[dbPath] = {
    id: dbPath,
    filename: dbPath,
    loaded: true,
    exports: {
      q: async (sql, params = []) => {
        if (/INFORMATION_SCHEMA\.COLUMNS/.test(sql)) {
          return ['event_id', 'mvp_player_id', 'game_log', 'metadata'].map(COLUMN_NAME => ({ COLUMN_NAME }));
        }
        if (/INFORMATION_SCHEMA\.STATISTICS/.test(sql)) {
          return [{ INDEX_NAME: 'idx_game_event' }];
        }
        if (/SELECT id, name, number, position, aliases FROM players/.test(sql)) {
          return players;
        }
        if (/SELECT YEAR\(date\) AS year/.test(sql)) {
          const years = Array.from(new Set(Array.from(games.values())
            .filter(game => !game.is_aggregate && game.date)
            .map(game => String(game.date).slice(0, 4))
            .filter(year => /^\d{4}$/.test(year))));
          return years.sort((a, b) => b.localeCompare(a)).map(year => ({ year }));
        }
        if (/INSERT INTO games/.test(sql)) {
          const [
            id, tournamentId, eventId, sport, season, seasonName, cover, date, venue, innings,
            home, away, homeScore, awayScore, linescore, homeTotals, awayTotals,
            batting, oppBatting, pitching, oppPitching, mvpPlayerName, mvpPlayerId, mvpNote,
            gameLog, metadata, isAggregate,
          ] = params;
          games.set(id, {
            id,
            tournament_id: tournamentId,
            event_id: eventId,
            sport,
            season,
            season_name: seasonName,
            cover,
            date,
            venue,
            innings,
            home,
            away,
            home_score: homeScore,
            away_score: awayScore,
            linescore,
            home_totals: homeTotals,
            away_totals: awayTotals,
            batting,
            opp_batting: oppBatting,
            pitching,
            opp_pitching: oppPitching,
            mvp_player_name: mvpPlayerName,
            mvp_player_id: mvpPlayerId,
            mvp_note: mvpNote,
            game_log: gameLog,
            metadata,
            is_aggregate: isAggregate,
          });
          return { affectedRows: 1 };
        }
        if (/SELECT \* FROM games/.test(sql) && /event_id = \?/.test(sql)) {
          return Array.from(games.values()).filter(game => game.event_id === params[0]);
        }
        if (/SELECT \* FROM games/.test(sql)) {
          const pagingParamCount = /LIMIT \?/.test(sql) ? (/OFFSET \?/.test(sql) ? 2 : 1) : 0;
          const sqlParams = pagingParamCount ? params.slice(0, -pagingParamCount) : params;
          let paramIndex = 0;
          let rows = Array.from(games.values())
            .sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));
          if (/is_aggregate = FALSE/.test(sql)) {
            rows = rows.filter(game => !game.is_aggregate);
          }
          if (/\(tournament_id = \? OR/.test(sql)) {
            const tournamentId = sqlParams[paramIndex++];
            const season = sqlParams[paramIndex++];
            rows = rows.filter(game => game.tournament_id === tournamentId || (!game.tournament_id && game.season === season));
          } else if (/tournament_id = \?/.test(sql)) {
            const tournamentId = sqlParams[paramIndex++];
            rows = rows.filter(game => game.tournament_id === tournamentId);
          }
          if (/event_id = \?/.test(sql)) {
            const eventId = sqlParams[paramIndex++];
            rows = rows.filter(game => game.event_id === eventId);
          }
          if (!/\(tournament_id = \? OR/.test(sql) && /season = \?/.test(sql)) {
            const season = sqlParams[paramIndex++];
            rows = rows.filter(game => game.season === season);
          }
          if (/sport = \?/.test(sql)) {
            const sport = sqlParams[paramIndex++];
            rows = rows.filter(game => game.sport === sport);
          }
          if (/DATE_FORMAT\(date/.test(sql)) {
            const keyword = String(sqlParams[paramIndex++] || '').replace(/%/g, '').toLowerCase();
            paramIndex += 7;
            rows = rows.filter(game => [
              game.id,
              game.home,
              game.away,
              game.venue,
              game.season,
              game.season_name,
              game.sport,
              game.date,
            ].filter(Boolean).join(' ').toLowerCase().includes(keyword));
          }
          if (/LIMIT \?/.test(sql)) {
            const limit = Number(params[params.length - 2] || params[params.length - 1]) || 0;
            const offset = /OFFSET \?/.test(sql) ? Number(params[params.length - 1]) || 0 : 0;
            rows = rows.slice(offset, offset + limit);
          }
          return rows;
        }
        if (/DELETE FROM games WHERE id = \?/.test(sql)) {
          games.delete(params[0]);
          return { affectedRows: 1 };
        }
        throw new Error(`unexpected q: ${sql}`);
      },
      qOne: async (sql, params = []) => {
        if (/SELECT \* FROM games WHERE id = \?/.test(sql)) {
          return games.get(params[0]) || null;
        }
        if (/SELECT id, name, public_display_name, aliases FROM players WHERE id = \?/.test(sql)) {
          const player = players.find(item => item.id === params[0]);
          return player ? { ...player, public_display_name: '' } : null;
        }
        if (/SELECT id, name, short_name, season, sport FROM tournaments WHERE id = \?/.test(sql)) {
          return tournaments.find(item => item.id === params[0]) || null;
        }
        throw new Error(`unexpected qOne: ${sql}`);
      },
    },
  };

  delete require.cache[middlewarePath];
  require.cache[middlewarePath] = {
    id: middlewarePath,
    filename: middlewarePath,
    loaded: true,
    exports: {
      requirePermission: () => (req, _res, next) => {
        req.user = { id: 'u_admin' };
        next();
      },
      wrap: fn => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next),
    },
  };

  delete require.cache[peopleHelpersPath];
  require.cache[peopleHelpersPath] = {
    id: peopleHelpersPath,
    filename: peopleHelpersPath,
    loaded: true,
    exports: { logAudit: async log => { auditLogs.push(JSON.parse(JSON.stringify(log))); } },
  };
}

async function request(app, method, url, body) {
  const server = app.listen(0);
  try {
    const address = server.address();
    const res = await fetch(`http://127.0.0.1:${address.port}${url}`, {
      method,
      headers: { 'content-type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = await res.json();
    return { status: res.status, data };
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
}

async function main() {
  installMocks();
  delete require.cache[gamesRoutePath];
  const { router } = require(gamesRoutePath);
  const app = express();
  app.use(express.json());
  app.use('/games', router);

  const created = await request(app, 'POST', '/games', {
    id: 'g_link_test',
    tournamentId: 't_test',
    eventId: 'e_test',
    sport: 'softball',
    date: '2026-06-06',
    venue: 'Home',
    home: '猎户座',
    away: '测试队',
    homeScore: 8,
    awayScore: 3,
    batting: [{ name: 'Jiang', AB: 4, H: 2 }],
    pitching: [{ name: 'Jiang', IP: '2.0', SO: 3 }],
    mvpPlayerName: 'Jiang',
    gameLog: [{ gameId: 'g_link_test', playerId: 'p1', actionType: 'batting' }],
    metadata: {
      source: 'mini_scorebook',
      rosterEventId: 'e_test',
      relatedTournamentId: 't_test',
      lineupPlayerIds: ['p1'],
    },
  });

  assert.strictEqual(created.status, 201);
  assert.strictEqual(created.data.game.eventId, 'e_test');
  assert.strictEqual(created.data.game.tournamentId, 't_test');
  assert.strictEqual(created.data.game.mvpPlayerId, 'p1');
  assert.strictEqual(created.data.game.mvpPlayerName, '江山');
  assert.strictEqual(created.data.game.batting[0].playerId, 'p1');
  assert.strictEqual(created.data.game.batting[0].name, '江山');
  assert.strictEqual(created.data.game.pitching[0].playerId, 'p1');
  assert.strictEqual(games.get('g_link_test').event_id, 'e_test');
  assert.deepStrictEqual(parseJson(games.get('g_link_test').metadata, {}).lineupPlayerIds, ['p1']);

  const list = await request(app, 'GET', '/games?eventId=e_test&includeAggregate=false');
  assert.strictEqual(list.status, 200);
  assert.strictEqual(list.data.games.length, 1);
  assert.strictEqual(list.data.games[0].eventId, 'e_test');

  games.set('g_alias_manual', {
    id: 'g_alias_manual',
    tournament_id: 't_test',
    event_id: null,
    sport: 'softball',
    season: '2026',
    season_name: '',
    cover: null,
    date: '2026-06-07',
    venue: 'Home',
    home: '猎户座',
    away: '别名队',
    home_score: 7,
    away_score: 6,
    linescore: null,
    home_totals: null,
    away_totals: null,
    batting: JSON.stringify([{ name: 'Jiang', AB: 3, H: 1 }]),
    opp_batting: null,
    pitching: null,
    opp_pitching: null,
    mvp_player_name: '',
    mvp_player_id: '',
    mvp_note: '',
    game_log: null,
    metadata: null,
    is_aggregate: 0,
  });
  games.set('g_other', {
    id: 'g_other',
    tournament_id: 't_test',
    event_id: null,
    sport: 'softball',
    season: '2026',
    season_name: '',
    cover: null,
    date: '2026-06-08',
    venue: 'Home',
    home: '猎户座',
    away: '其他队',
    home_score: 1,
    away_score: 2,
    linescore: null,
    home_totals: null,
    away_totals: null,
    batting: JSON.stringify([{ name: '其他队员', AB: 3, H: 0 }]),
    opp_batting: null,
    pitching: null,
    opp_pitching: null,
    mvp_player_name: '',
    mvp_player_id: '',
    mvp_note: '',
    game_log: null,
    metadata: null,
    is_aggregate: 0,
  });
  games.set('g_legacy_tournament', {
    id: 'g_legacy_tournament',
    tournament_id: '',
    event_id: null,
    sport: 'softball',
    season: '2026',
    season_name: '',
    cover: null,
    date: '2026-06-09',
    venue: 'Home',
    home: '猎户座',
    away: '旧数据队',
    home_score: 4,
    away_score: 1,
    linescore: null,
    home_totals: null,
    away_totals: null,
    batting: JSON.stringify([{ name: '旧数据队员', AB: 3, H: 1 }]),
    opp_batting: null,
    pitching: null,
    opp_pitching: null,
    mvp_player_name: '',
    mvp_player_id: '',
    mvp_note: '',
    game_log: null,
    metadata: null,
    is_aggregate: 0,
  });
  games.set('g_foreign_tournament', {
    id: 'g_foreign_tournament',
    tournament_id: 't_other',
    event_id: null,
    sport: 'softball',
    season: '2026',
    season_name: '',
    cover: null,
    date: '2026-06-10',
    venue: 'Home',
    home: '别队',
    away: '外部队',
    home_score: 9,
    away_score: 9,
    linescore: null,
    home_totals: null,
    away_totals: null,
    batting: null,
    opp_batting: null,
    pitching: null,
    opp_pitching: null,
    mvp_player_name: '',
    mvp_player_id: '',
    mvp_note: '',
    game_log: null,
    metadata: null,
    is_aggregate: 0,
  });
  const tournamentScoped = await request(app, 'GET', '/games?tournamentId=t_test&includeAggregate=true&includeSeasonFallback=true');
  assert.strictEqual(tournamentScoped.status, 200);
  assert(tournamentScoped.data.games.some(game => game.id === 'g_legacy_tournament'), 'tournament scoped list should keep legacy season fallback games');
  assert(!tournamentScoped.data.games.some(game => game.id === 'g_foreign_tournament'), 'tournament scoped list should exclude other tournament games');
  const playerFiltered = await request(app, 'GET', '/games?playerId=p1&includeAggregate=true&limit=5');
  assert.strictEqual(playerFiltered.status, 200);
  assert.deepStrictEqual(playerFiltered.data.games.map(game => game.id), ['g_alias_manual', 'g_link_test']);
  const limited = await request(app, 'GET', '/games?includeAggregate=false&limit=1');
  assert.strictEqual(limited.status, 200);
  assert.strictEqual(limited.data.games.length, 1);
  assert.strictEqual(limited.data.hasMore, true);
  assert.strictEqual(limited.data.nextOffset, 1);
  const pagedSoftball = await request(app, 'GET', '/games?includeAggregate=false&sport=softball&limit=1&offset=1');
  assert.strictEqual(pagedSoftball.status, 200);
  assert.deepStrictEqual(pagedSoftball.data.games.map(game => game.id), ['g_legacy_tournament']);
  assert.strictEqual(pagedSoftball.data.hasMore, true);
  assert.strictEqual(pagedSoftball.data.nextOffset, 2);
  const keywordList = await request(app, 'GET', '/games?includeAggregate=false&keyword=%E6%97%A7%E6%95%B0%E6%8D%AE&limit=5');
  assert.strictEqual(keywordList.status, 200);
  assert.deepStrictEqual(keywordList.data.games.map(game => game.id), ['g_legacy_tournament']);
  assert.strictEqual(keywordList.data.hasMore, false);
  const seasons = await request(app, 'GET', '/games/seasons');
  assert.strictEqual(seasons.status, 200);
  assert.deepStrictEqual(seasons.data.seasons, [{ value: '2026', label: '2026 赛季' }]);

  const exported = await request(app, 'GET', '/games/g_link_test/export-pdf');
  assert.strictEqual(exported.status, 200);
  assert.strictEqual(exported.data.mimeType, 'application/pdf');
  assert(exported.data.filename.includes('比赛记录.pdf'));
  const pdf = Buffer.from(exported.data.pdfBase64, 'base64');
  assert.strictEqual(pdf.slice(0, 5).toString('utf8'), '%PDF-');
  assert(pdf.length > 1000, 'exported game record PDF should not be empty');

  delete require.cache[pointsPath];
  const { computePlayerPoints } = require(pointsPath);
  const points = computePlayerPoints('p1', {
    players: [{ id: 'p1', name: '江山', aliases: [] }],
	    games: [{
	      id: 'g_link_test',
	      tournament_id: 't_test',
	      date: '2026-06-06',
      home: '猎户座',
      away: '测试队',
	      batting: [{ playerId: 'p1', name: '旧名', AB: 4, H: 2 }],
	      pitching: [],
	      mvp_player_id: 'p1',
	    }, {
	      id: 'g_old',
	      tournament_id: 't_test',
	      date: '2025-06-06',
	      home: '猎户座',
	      away: '旧对手',
	      batting: [{ playerId: 'p1', name: '江山', AB: 3, H: 1 }],
	      pitching: [],
	      mvp_player_id: '',
	    }],
    tournaments: [{ id: 't_test', name: '测试赛事', short_name: '测试杯', type: 'league' }],
    events: [{ id: 'e_test', title: '测试比赛接龙' }],
    attendances: [{ player_id: 'p1', kind: 'training', ref_id: 'e_test', date: '2026-06-05', note: '准时到场' }],
    adjustments: [{ player_id: 'p1', delta: -2, reason: '录入修正', game_id: 'g_link_test', created_at: '2026-06-07T08:00:00Z' }],
    hof: [],
  });
  const gamePoint = points.timeline.find(item => item.source === 'game');
  assert(gamePoint, 'points timeline should include playerId-linked game record');
  assert.strictEqual(gamePoint.detail.gameId, 'g_link_test');
  assert.strictEqual(gamePoint.detail.tournamentId, 't_test');
  assert.strictEqual(gamePoint.detail.tournamentName, '测试杯');
  const trainingPoint = points.timeline.find(item => item.source === 'training');
  assert.strictEqual(trainingPoint.detail.eventId, 'e_test');
  assert.strictEqual(trainingPoint.detail.eventTitle, '测试比赛接龙');
	  const manualPoint = points.timeline.find(item => item.source === 'manual');
	  assert.strictEqual(manualPoint.detail.gameId, 'g_link_test');
	  const seasonPoints = computePlayerPoints('p1', {
	    players: [{ id: 'p1', name: '江山', aliases: [] }],
	    games: [{
	      id: 'g_2026',
	      tournament_id: 't_test',
	      date: '2026-06-06',
	      home: '猎户座',
	      away: '测试队',
	      batting: [{ playerId: 'p1', name: '江山', AB: 4, H: 2, RBI: 1 }],
	      pitching: [],
	    }, {
	      id: 'g_2025',
	      tournament_id: 't_test',
	      date: '2025-06-06',
	      home: '猎户座',
	      away: '旧对手',
	      batting: [{ playerId: 'p1', name: '江山', AB: 3, H: 1 }],
	      pitching: [],
	    }],
	    tournaments: [{ id: 't_test', name: '测试赛事', short_name: '测试杯', type: 'league' }],
	    events: [{ id: 'e_test', title: '测试比赛接龙' }],
	    attendances: [{ player_id: 'p1', kind: 'training', ref_id: 'e_test', date: '2026-06-05', note: '准时到场' }],
	    adjustments: [{ id: 'adj_2025', player_id: 'p1', delta: 9, reason: '旧赛季', created_at: '2025-06-07T08:00:00Z' }],
	    hof: [],
	  }, { season: '2026' });
	  assert(seasonPoints.timeline.every(item => String(item.date || '').startsWith('2026')), 'season points should only keep selected season timeline');
	  assert.strictEqual(seasonPoints.breakdown.base, 20);
	  assert.strictEqual(seasonPoints.breakdown.manual, 0);

	  const deleted = await request(app, 'DELETE', '/games/g_link_test');
  assert.strictEqual(deleted.status, 200);
  assert.strictEqual(games.has('g_link_test'), false);
  assert.strictEqual(auditLogs[0].action, 'delete_game');
  assert.strictEqual(auditLogs[0].targetType, 'game');
  assert.strictEqual(auditLogs[0].targetId, 'g_link_test');
  assert.strictEqual(auditLogs[0].metadata.before.eventId, 'e_test');

  console.log('Games linkage route regression passed');
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
