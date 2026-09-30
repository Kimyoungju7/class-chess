'use strict';
/**
 * 우리 반 오목 대전 서버
 * - 학생: 이름으로 입장 → 자유 모드에서는 자동 랜덤 매칭, 대회 모드에서는 대진표에 따라 자동 배정
 * - 교사: 실시간 경기 관전, 학생 현황, 리그전/토너먼트 운영, 경기 기록 다시보기
 * 모든 데이터는 메모리에 저장되며 서버를 끄면 초기화됩니다.
 */
const express = require('express');
const http = require('http');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const { Server } = require('socket.io');

const PORT = Number(process.env.PORT) || 3000;
const TEACHER_PIN = String(process.env.TEACHER_PIN || '1234');
const SIZE = 15;
const DISCONNECT_GRACE_MS = 60 * 1000; // 경기 중 연결이 끊긴 뒤 기권 처리까지 기다리는 시간
const NEXT_MATCH_DELAY_MS = 5000;      // 대회에서 경기 종료 후 다음 경기까지 쉬는 시간
const MATCH_GATHER_MS = 1500;          // 자유 매칭 시 대기자를 모았다가 무작위로 짝짓는 시간
const HISTORY_LIMIT = 500;
const MOVE_TIME_OPTIONS = [0, 15, 20, 30, 45, 60];

const app = express();
app.use(express.static(path.join(__dirname, 'public')));
app.get('/api/info', (req, res) => res.json({ addresses: lanAddresses() }));

const server = http.createServer(app);
const io = new Server(server);

function lanAddresses() {
  const list = [];
  for (const ifaces of Object.values(os.networkInterfaces())) {
    for (const i of ifaces || []) {
      if ((i.family === 'IPv4' || i.family === 4) && !i.internal) list.push(`http://${i.address}:${PORT}`);
    }
  }
  return list;
}

// ───────────────────────── 상태 ─────────────────────────
const players = new Map();   // id → player
const games = new Map();     // id → game
let queue = [];              // 자유 매칭 대기열 (player id)
let matchTimer = null;
let schedTimer = null;
const settings = { mode: 'free', matchingOpen: true, moveTime: 0 };
let competition = null;

const newId = () => crypto.randomBytes(5).toString('hex');
function shuffle(a) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function findWin(board, x, y, color) {
  for (const [dx, dy] of [[1, 0], [0, 1], [1, 1], [1, -1]]) {
    const line = [[x, y]];
    for (const s of [1, -1]) {
      let cx = x + dx * s, cy = y + dy * s;
      while (cx >= 0 && cy >= 0 && cx < SIZE && cy < SIZE && board[cy * SIZE + cx] === color) {
        line.push([cx, cy]);
        cx += dx * s; cy += dy * s;
      }
    }
    if (line.length >= 5) return line;
  }
  return null;
}

function roundName(totalRounds, r) {
  const n = 2 ** (totalRounds - r + 1);
  return n === 2 ? '결승' : n === 4 ? '4강' : `${n}강`;
}

function matchLabel(m) {
  if (!competition) return '';
  if (competition.type === 'tournament') return `토너먼트 ${roundName(competition.rounds, m.round)}`;
  return `리그 ${m.group && m.group !== '전체' ? m.group + ' ' : ''}${m.round}라운드`;
}

// ───────────────────────── 전송 ─────────────────────────
function sendTo(p, ev, data) {
  if (p && p.online && p.socketId) io.to(p.socketId).emit(ev, data);
}

function gameView(g) {
  const b = players.get(g.black), w = players.get(g.white);
  return {
    id: g.id, black: g.black, white: g.white, blackName: g.blackName, whiteName: g.whiteName,
    blackOnline: !!(b && b.online), whiteOnline: !!(w && w.online),
    moves: g.moves, turn: g.turn, status: g.status, winner: g.winner, reason: g.reason, winLine: g.winLine,
    startedAt: g.startedAt, endedAt: g.endedAt, moveTime: g.moveTime, label: g.label, matchId: g.matchId,
    remainingMs: g.deadline ? Math.max(0, g.deadline - Date.now()) : null,
  };
}

function emitGame(g) {
  const v = gameView(g);
  sendTo(players.get(g.black), 'game:update', v);
  sendTo(players.get(g.white), 'game:update', v);
}

function publicCompetition() {
  const c = competition;
  if (!c) return null;
  const name = (id) => (id ? c.names[id] : null);
  return {
    id: c.id, type: c.type, status: c.status, rounds: c.rounds,
    champion: c.champion, championName: name(c.champion),
    participants: c.participants.map((id) => ({ id, name: c.names[id] })),
    groups: c.groups.map((g) => ({ name: g.name, standings: g.standings })),
    matches: c.matches.map((m) => ({
      id: m.id, round: m.round, index: m.index, group: m.group,
      p1: m.p1, p2: m.p2, p1Name: name(m.p1), p2Name: name(m.p2),
      status: m.status, winner: m.winner, draw: m.draw, bye: m.bye, note: m.note,
      gameId: m.gameId, label: matchLabel(m),
    })),
  };
}

function publicState() {
  const list = [...games.values()];
  return {
    settings,
    players: [...players.values()]
      .map((p) => ({ id: p.id, name: p.name, online: p.online, status: p.status, gameId: p.gameId, wins: p.wins, losses: p.losses, draws: p.draws }))
      .sort((a, b) => a.name.localeCompare(b.name, 'ko')),
    queueCount: queue.length,
    liveCount: list.filter((g) => g.status === 'playing').length,
    doneCount: list.filter((g) => g.status === 'done').length,
    competition: publicCompetition(),
  };
}

function teacherState() {
  const list = [...games.values()];
  return {
    ...publicState(),
    live: list.filter((g) => g.status === 'playing').sort((a, b) => a.startedAt - b.startedAt).map(gameView),
    history: list.filter((g) => g.status === 'done').sort((a, b) => b.endedAt - a.endedAt).map(gameView),
  };
}

let bTimer = null;
function broadcast() {
  if (bTimer) return;
  bTimer = setTimeout(() => {
    bTimer = null;
    io.to('students').emit('lobby', publicState());
    io.to('teachers').emit('teacher:state', teacherState());
  }, 120);
}

// ───────────────────────── 경기 ─────────────────────────
function startGame(aId, bId, match) {
  const [blackId, whiteId] = Math.random() < 0.5 ? [aId, bId] : [bId, aId];
  const bp = players.get(blackId), wp = players.get(whiteId);
  const g = {
    id: newId(), black: blackId, white: whiteId, blackName: bp.name, whiteName: wp.name,
    board: new Array(SIZE * SIZE).fill(0), moves: [], turn: 1, status: 'playing',
    winner: 0, reason: '', winLine: null, startedAt: Date.now(), endedAt: null,
    deadline: null, timer: null, moveTime: settings.moveTime,
    matchId: match ? match.id : null, label: match ? matchLabel(match) : '자유 대전',
  };
  games.set(g.id, g);
  for (const p of [bp, wp]) { p.status = 'playing'; p.gameId = g.id; }
  queue = queue.filter((id) => id !== aId && id !== bId);
  if (match) { match.status = 'playing'; match.gameId = g.id; }
  resetTimer(g);
  emitGame(g);
  broadcast();
}

function resetTimer(g) {
  clearTimeout(g.timer);
  g.timer = null; g.deadline = null;
  if (g.status !== 'playing' || !g.moveTime) return;
  g.deadline = Date.now() + g.moveTime * 1000;
  g.timer = setTimeout(() => endGame(g, 3 - g.turn, 'timeout'), g.moveTime * 1000 + 300);
}

function endGame(g, winner, reason, line = null) {
  if (!g || g.status !== 'playing') return;
  clearTimeout(g.timer);
  g.timer = null; g.deadline = null;
  g.status = 'done'; g.winner = winner; g.reason = reason; g.winLine = line; g.endedAt = Date.now();

  const bp = players.get(g.black), wp = players.get(g.white);
  if (reason !== 'cancel') {
    if (winner === 1) { if (bp) bp.wins++; if (wp) wp.losses++; }
    else if (winner === 2) { if (wp) wp.wins++; if (bp) bp.losses++; }
    else { if (bp) bp.draws++; if (wp) wp.draws++; }
  }
  for (const p of [bp, wp]) {
    if (p && p.gameId === g.id) {
      p.status = 'idle'; p.gameId = null;
      p.readyAt = Date.now() + NEXT_MATCH_DELAY_MS;
      clearTimeout(p.offlineTimer); p.offlineTimer = null;
    }
  }
  if (g.matchId) onMatchGameEnd(g);
  pruneHistory();
  emitGame(g);
  broadcast();
  setTimeout(scheduleCompetition, NEXT_MATCH_DELAY_MS + 100);
}

function pruneHistory() {
  const done = [...games.values()].filter((g) => g.status === 'done').sort((a, b) => a.endedAt - b.endedAt);
  while (done.length > HISTORY_LIMIT) games.delete(done.shift().id);
}

// ───────────────────────── 자유 매칭 ─────────────────────────
function freeMatchingActive() {
  return settings.mode === 'free' && !competition;
}

function enqueue(p) {
  if (!freeMatchingActive() || !p.online || p.status !== 'idle') return;
  p.status = 'queue';
  queue.push(p.id);
  scheduleMatch();
  broadcast();
}

function dequeue(p) {
  if (p.status === 'queue') p.status = 'idle';
  queue = queue.filter((id) => id !== p.id);
}

function scheduleMatch() {
  if (matchTimer) return;
  matchTimer = setTimeout(() => { matchTimer = null; tryMatch(); }, MATCH_GATHER_MS);
}

function tryMatch() {
  if (!freeMatchingActive() || !settings.matchingOpen) return;
  queue = queue.filter((id) => { const p = players.get(id); return p && p.online && p.status === 'queue'; });
  while (queue.length >= 2) {
    const a = queue.splice(Math.floor(Math.random() * queue.length), 1)[0];
    const b = queue.splice(Math.floor(Math.random() * queue.length), 1)[0];
    startGame(a, b, null);
  }
  broadcast();
}

// ───────────────────────── 대회 (리그 / 토너먼트) ─────────────────────────
function roundRobin(ids) {
  const arr = [...ids];
  if (arr.length % 2) arr.push(null);
  const n = arr.length, out = [];
  for (let r = 0; r < n - 1; r++) {
    for (let i = 0; i < n / 2; i++) {
      const a = arr[i], b = arr[n - 1 - i];
      if (a && b) out.push([r + 1, a, b]);
    }
    arr.splice(1, 0, arr.pop());
  }
  return out;
}

const makeMatch = (o) => ({
  id: newId(), group: null, status: 'pending', winner: null, draw: false,
  gameId: null, games: [], bye: false, note: '', ...o,
});

function startCompetition(type, ids, groupSize) {
  ids = [...new Set(ids)].filter((id) => players.has(id));
  if (ids.length < 2) return '참가자는 2명 이상이어야 해요.';

  for (const id of queue) { const p = players.get(id); if (p && p.status === 'queue') p.status = 'idle'; }
  queue = [];
  shuffle(ids);

  const names = {};
  ids.forEach((id) => { names[id] = players.get(id).name; });
  const comp = {
    id: newId(), type, status: 'running', participants: ids, names,
    matches: [], groups: [], champion: null, rounds: 0, createdAt: Date.now(),
  };

  if (type === 'league') {
    let groups = [ids];
    if (groupSize >= 2 && ids.length > groupSize) {
      const k = Math.ceil(ids.length / groupSize);
      groups = Array.from({ length: k }, () => []);
      ids.forEach((id, i) => groups[i % k].push(id));
    }
    groups.forEach((members, gi) => {
      const name = groups.length > 1 ? String.fromCharCode(65 + gi) + '조' : '전체';
      comp.groups.push({ name, members, standings: [] });
      roundRobin(members).forEach(([round, a, b], i) => {
        comp.matches.push(makeMatch({ group: name, round, index: i, p1: a, p2: b }));
        comp.rounds = Math.max(comp.rounds, round);
      });
    });
  } else {
    let P = 1;
    while (P < ids.length) P *= 2;
    const R = Math.log2(P), byes = P - ids.length, half = P / 2;
    comp.rounds = R;
    for (let i = 0; i < half; i++) {
      comp.matches.push(makeMatch({ round: 1, index: i, p1: ids[i], p2: i < byes ? null : ids[half + i - byes] }));
    }
    for (let r = 2; r <= R; r++) {
      for (let i = 0; i < P / 2 ** r; i++) comp.matches.push(makeMatch({ round: r, index: i, p1: null, p2: null }));
    }
  }

  competition = comp;
  settings.mode = type;
  if (type === 'tournament') {
    for (const m of comp.matches.filter((m) => m.round === 1 && !m.p2)) {
      m.bye = true;
      resolveMatch(m, m.p1, '부전승');
    }
  }
  computeStandings();
  broadcast();
  scheduleCompetition();
  return null;
}

function resolveMatch(m, winnerId, note) {
  m.status = 'done'; m.winner = winnerId; m.draw = false;
  if (note) m.note = note;
  if (competition.type === 'tournament') advance(m);
  afterMatchChange();
}

function advance(m) {
  const next = competition.matches.find((n) => n.round === m.round + 1 && n.index === Math.floor(m.index / 2));
  if (!next) { competition.champion = m.winner; return; }
  if (m.index % 2 === 0) next.p1 = m.winner; else next.p2 = m.winner;
}

function afterMatchChange() {
  if (!competition) return;
  computeStandings();
  if (competition.matches.every((m) => m.status === 'done')) competition.status = 'done';
  broadcast();
}

function onMatchGameEnd(g) {
  if (!competition) return;
  const m = competition.matches.find((m) => m.id === g.matchId);
  if (!m || m.gameId !== g.id) return;
  m.gameId = null;
  m.games.push(g.id);
  if (g.reason === 'cancel') {
    m.status = 'pending';
  } else if (g.winner === 0) {
    if (competition.type === 'tournament') { m.status = 'pending'; m.note = '무승부 → 재경기'; }
    else { m.status = 'done'; m.winner = null; m.draw = true; }
  } else {
    resolveMatch(m, g.winner === 1 ? g.black : g.white);
    return;
  }
  afterMatchChange();
}

function computeStandings() {
  if (!competition || competition.type !== 'league') return;
  for (const grp of competition.groups) {
    const rows = new Map(grp.members.map((id) => [id, { id, name: competition.names[id], played: 0, w: 0, d: 0, l: 0, pts: 0 }]));
    for (const m of competition.matches) {
      if (m.group !== grp.name || m.status !== 'done') continue;
      const a = rows.get(m.p1), b = rows.get(m.p2);
      a.played++; b.played++;
      if (m.draw) { a.d++; b.d++; a.pts += 1; b.pts += 1; }
      else {
        const [w, l] = m.winner === m.p1 ? [a, b] : [b, a];
        w.w++; w.pts += 3; l.l++;
      }
    }
    grp.standings = [...rows.values()].sort((x, y) => y.pts - x.pts || y.w - x.w || x.l - y.l || x.name.localeCompare(y.name, 'ko'));
  }
}

function scheduleCompetition() {
  if (!competition || competition.status !== 'running') return;
  const now = Date.now();
  let waitUntil = Infinity, changed = false;
  const list = competition.matches
    .filter((m) => m.status === 'pending' && m.p1 && m.p2)
    .sort((a, b) => a.round - b.round || a.index - b.index);

  for (const m of list) {
    if (m.status !== 'pending') continue;
    const a = players.get(m.p1), b = players.get(m.p2);
    if (!a || !b) { // 퇴장한 학생이 있으면 상대의 부전승
      resolveMatch(m, a ? m.p1 : b ? m.p2 : m.p1, '부전승(퇴장)');
      changed = true;
      continue;
    }
    if (!a.online || !b.online || a.status !== 'idle' || b.status !== 'idle') continue;
    if ((a.readyAt || 0) > now || (b.readyAt || 0) > now) {
      waitUntil = Math.min(waitUntil, Math.max(a.readyAt || 0, b.readyAt || 0));
      continue;
    }
    startGame(a.id, b.id, m);
  }
  if (changed) setImmediate(scheduleCompetition);
  if (waitUntil < Infinity) {
    clearTimeout(schedTimer);
    schedTimer = setTimeout(scheduleCompetition, waitUntil - now + 50);
  }
}

function closeCompetition() {
  if (!competition) return;
  for (const g of games.values()) {
    if (g.status === 'playing' && g.matchId) g.matchId = null; // 진행 중이던 경기는 일반 경기로 마저 진행
  }
  competition = null;
  settings.mode = 'free';
  clearTimeout(schedTimer);
  for (const p of players.values()) enqueue(p);
  broadcast();
}

// ───────────────────────── 소켓 ─────────────────────────
io.on('connection', (socket) => {
  const me = () => players.get(socket.data.playerId);
  const ack = (cb) => (typeof cb === 'function' ? cb : () => {});

  // ── 학생 ──
  socket.on('student:join', (data, cb) => {
    cb = ack(cb);
    const name = String((data && data.name) || '').trim().replace(/\s+/g, ' ').slice(0, 12);
    const token = String((data && data.token) || '').slice(0, 64);
    if (!name) return cb({ ok: false, error: '이름을 입력해 주세요.' });

    let p = [...players.values()].find((x) => x.name === name);
    if (p && p.online && p.token !== token) {
      return cb({ ok: false, error: '같은 이름으로 이미 접속한 친구가 있어요. 다른 이름(예: 번호+이름)을 써 주세요.' });
    }
    if (!p) {
      p = {
        id: newId(), name, token, socketId: null, online: false, status: 'idle', gameId: null,
        wins: 0, losses: 0, draws: 0, readyAt: 0, offlineTimer: null,
      };
      players.set(p.id, p);
    }
    if (p.online && p.socketId !== socket.id) { // 같은 기기에서 새로고침한 경우 이전 연결 정리
      const old = io.sockets.sockets.get(p.socketId);
      if (old) { old.data.playerId = null; old.emit('replaced'); old.disconnect(true); }
    }
    p.token = token; p.socketId = socket.id; p.online = true;
    clearTimeout(p.offlineTimer); p.offlineTimer = null;
    socket.data.playerId = p.id;
    socket.join('students');
    cb({ ok: true, id: p.id, name: p.name });
    socket.emit('lobby', publicState());

    const g = p.gameId && games.get(p.gameId);
    if (g && g.status === 'playing') emitGame(g);
    else if (p.status === 'idle') enqueue(p);
    scheduleCompetition();
    broadcast();
  });

  socket.on('queue:join', () => { const p = me(); if (p) enqueue(p); });
  socket.on('queue:leave', () => { const p = me(); if (p) { dequeue(p); broadcast(); } });

  socket.on('game:move', (data) => {
    const p = me();
    if (!p || !data) return;
    const g = games.get(p.gameId);
    if (!g || g.status !== 'playing') return;
    const color = g.black === p.id ? 1 : g.white === p.id ? 2 : 0;
    if (color !== g.turn) return;
    const x = Number(data.x), y = Number(data.y);
    if (!Number.isInteger(x) || !Number.isInteger(y) || x < 0 || y < 0 || x >= SIZE || y >= SIZE) return;
    if (g.board[y * SIZE + x]) return;

    g.board[y * SIZE + x] = color;
    g.moves.push([x, y]);
    const line = findWin(g.board, x, y, color);
    if (line) return endGame(g, color, 'five', line);
    if (g.moves.length === SIZE * SIZE) return endGame(g, 0, 'full');
    g.turn = 3 - color;
    resetTimer(g);
    emitGame(g);
    broadcast();
  });

  socket.on('game:resign', () => {
    const p = me();
    const g = p && games.get(p.gameId);
    if (!g || g.status !== 'playing') return;
    endGame(g, g.black === p.id ? 2 : 1, 'resign');
  });

  socket.on('disconnect', () => {
    const p = me();
    if (!p || p.socketId !== socket.id) return;
    p.online = false;
    dequeue(p);
    const g = p.gameId && games.get(p.gameId);
    if (g && g.status === 'playing') {
      emitGame(g);
      p.offlineTimer = setTimeout(() => {
        if (!p.online && g.status === 'playing' && p.gameId === g.id) endGame(g, g.black === p.id ? 2 : 1, 'disconnect');
      }, DISCONNECT_GRACE_MS);
    }
    broadcast();
  });

  // ── 교사 ──
  socket.on('teacher:auth', (pin, cb) => {
    cb = ack(cb);
    if (String(pin) !== TEACHER_PIN) return cb({ ok: false });
    socket.data.teacher = true;
    socket.join('teachers');
    cb({ ok: true });
    socket.emit('teacher:state', teacherState());
  });

  const teacherOn = (ev, fn) => socket.on(ev, (data, cb) => {
    cb = ack(cb);
    if (!socket.data.teacher) return cb({ ok: false, error: '교사 인증이 필요해요.' });
    try {
      const err = fn(data || {});
      cb(err ? { ok: false, error: err } : { ok: true });
    } catch (e) {
      console.error(e);
      cb({ ok: false, error: '처리 중 오류가 발생했어요.' });
    }
  });

  teacherOn('teacher:settings', (d) => {
    if (typeof d.matchingOpen === 'boolean') settings.matchingOpen = d.matchingOpen;
    if (d.moveTime !== undefined && MOVE_TIME_OPTIONS.includes(Number(d.moveTime))) settings.moveTime = Number(d.moveTime);
    if (settings.matchingOpen) scheduleMatch();
    broadcast();
  });

  teacherOn('teacher:startCompetition', (d) => {
    if (competition && competition.status === 'running') return '진행 중인 대회가 있어요. 먼저 대회를 닫아 주세요.';
    if (!['league', 'tournament'].includes(d.type)) return '대회 방식을 골라 주세요.';
    const ids = Array.isArray(d.players) ? d.players.map(String) : [];
    return startCompetition(d.type, ids, Number(d.groupSize) || 0);
  });

  teacherOn('teacher:closeCompetition', () => { closeCompetition(); });

  teacherOn('teacher:endGame', (d) => {
    const g = games.get(String(d.gameId));
    if (!g || g.status !== 'playing') return '이미 끝난 경기예요.';
    const map = { black: [1, 'teacher'], white: [2, 'teacher'], draw: [0, 'teacher'], cancel: [0, 'cancel'] };
    const r = map[d.result];
    if (!r) return '결과를 골라 주세요.';
    endGame(g, r[0], r[1]);
  });

  teacherOn('teacher:matchResult', (d) => {
    if (!competition) return '진행 중인 대회가 없어요.';
    const m = competition.matches.find((x) => x.id === d.matchId);
    if (!m || !m.p1 || !m.p2 || (d.winner !== m.p1 && d.winner !== m.p2)) return '경기를 찾을 수 없어요.';
    if (m.status === 'playing') {
      const g = games.get(m.gameId);
      endGame(g, g.black === d.winner ? 1 : 2, 'teacher');
    } else if (m.status === 'pending') {
      resolveMatch(m, d.winner, '선생님 판정');
      scheduleCompetition();
    } else return '이미 끝난 경기예요.';
  });

  teacherOn('teacher:kick', (d) => {
    const p = players.get(String(d.playerId));
    if (!p) return '학생을 찾을 수 없어요.';
    const g = p.gameId && games.get(p.gameId);
    if (g && g.status === 'playing') endGame(g, g.black === p.id ? 2 : 1, 'kick');
    dequeue(p);
    clearTimeout(p.offlineTimer);
    const s = p.socketId && io.sockets.sockets.get(p.socketId);
    if (s) { s.data.playerId = null; s.emit('kicked'); s.disconnect(true); }
    players.delete(p.id);
    scheduleCompetition();
    broadcast();
  });

  teacherOn('teacher:resetAll', () => {
    for (const g of games.values()) if (g.status === 'playing') endGame(g, 0, 'cancel');
    games.clear();
    competition = null;
    settings.mode = 'free';
    clearTimeout(schedTimer);
    for (const p of players.values()) {
      p.wins = 0; p.losses = 0; p.draws = 0; p.readyAt = 0;
      enqueue(p);
    }
    broadcast();
  });
});

server.listen(PORT, '0.0.0.0', () => {
  const line = '─'.repeat(52);
  console.log(line);
  console.log(' 우리 반 오목 대전 서버가 켜졌어요!');
  console.log(line);
  console.log(' 학생 접속 주소 (같은 와이파이/네트워크):');
  const addrs = lanAddresses();
  if (addrs.length) addrs.forEach((a) => console.log('   ' + a));
  else console.log(`   http://localhost:${PORT}`);
  console.log(` 교사 화면: http://localhost:${PORT}/teacher.html`);
  console.log(` 교사 비밀번호: ${TEACHER_PIN}  (바꾸려면 TEACHER_PIN 환경변수 사용)`);
  console.log(' 끄려면 이 창에서 Ctrl + C');
  console.log(line);
});
