(function () {
  'use strict';
  const { esc, REASONS, OmokBoard, renderStandings, renderBracket, toast, fmtTime } = Omok;
  const $ = (id) => document.getElementById(id);

  const socket = io();
  let S = null;
  let pin = null;
  try { pin = sessionStorage.getItem('omokPin'); } catch { /* 무시 */ }

  // ── 로그인 ──
  function auth(p, silent) {
    socket.emit('teacher:auth', p, (res) => {
      if (res && res.ok) {
        pin = p;
        try { sessionStorage.setItem('omokPin', p); } catch { /* 무시 */ }
        $('loginView').hidden = true; $('app').hidden = false;
      } else {
        pin = null;
        try { sessionStorage.removeItem('omokPin'); } catch { /* 무시 */ }
        $('loginView').hidden = false; $('app').hidden = true;
        if (!silent) $('pinError').textContent = '비밀번호가 맞지 않아요.';
      }
    });
  }
  socket.on('connect', () => { if (pin) auth(pin, true); });
  socket.on('disconnect', () => toast('서버와 연결이 끊겼어요. 서버 창이 켜져 있는지 확인하세요.', 'bad'));
  $('pinForm').addEventListener('submit', (e) => { e.preventDefault(); auth($('pinInput').value.trim(), false); });

  fetch('/api/info').then((r) => r.json()).then((info) => {
    const list = info.addresses && info.addresses.length ? info.addresses : [location.origin];
    $('addr').innerHTML = list.map((a) => `<b>${esc(a)}</b>`).join(' <span class="muted">또는</span> ');
  }).catch(() => { $('addr').innerHTML = `<b>${esc(location.origin)}</b>`; });

  const send = (ev, data) => new Promise((resolve) => socket.emit(ev, data, (res) => {
    if (!res || !res.ok) toast((res && res.error) || '처리하지 못했어요.', 'bad');
    resolve(res && res.ok);
  }));

  // ── 두 번 눌러 확인하는 버튼 ──
  let armed = null;
  const isArmed = (key) => armed && armed.key === key && Date.now() < armed.until;
  function armedClick(key, fn) {
    if (isArmed(key)) { armed = null; fn(); renderAll(); return; }
    armed = { key, until: Date.now() + 3000 };
    renderAll();
    setTimeout(() => { if (armed && armed.key === key && Date.now() >= armed.until) { armed = null; renderAll(); } }, 3050);
  }
  const armBtn = (key, label, cls = 'danger') =>
    `<button class="btn small ${cls} ${isArmed(key) ? 'armed' : ''}" data-arm="${esc(key)}">${isArmed(key) ? '한 번 더 누르면 실행' : label}</button>`;
  const armActions = new Map();
  document.addEventListener('click', (e) => {
    const b = e.target.closest('[data-arm]');
    if (!b) return;
    const key = b.dataset.arm, fn = armActions.get(key);
    if (fn) armedClick(key, fn);
  });

  // ── 탭 ──
  let tab = 'live';
  $('tabs').addEventListener('click', (e) => {
    const b = e.target.closest('.tab');
    if (b) showTab(b.dataset.tab);
  });
  function showTab(t) {
    tab = t;
    document.querySelectorAll('.tab').forEach((b) => b.classList.toggle('active', b.dataset.tab === t));
    document.querySelectorAll('[data-panel]').forEach((p) => { p.hidden = p.dataset.panel !== t; });
  }

  socket.on('teacher:state', (s) => { S = s; renderAll(); });

  function renderAll() {
    if (!S) return;
    armActions.clear();
    renderTop();
    renderLive();
    renderStudents();
    renderCompetition();
    renderHistory();
    updateModal();
  }

  const compKind = (c) => (c.type === 'league' ? '리그전' : '토너먼트');

  function renderTop() {
    const c = S.competition;
    const text = !c ? '자유 랜덤 매칭' : c.status === 'running' ? `${compKind(c)} 진행 중` : `${compKind(c)} 종료`;
    $('modeBadge').textContent = text;
    $('modeText').innerHTML = !c
      ? '자유 랜덤 매칭 <span class="muted small">(학생이 들어오면 기다리는 학생끼리 무작위로 대결)</span>'
      : c.status === 'running'
        ? `${compKind(c)} 진행 중 <span class="muted small">(대진표에 따라 자동 배정)</span>`
        : `${compKind(c)} 종료 <span class="muted small">('대회 운영'에서 대회를 닫으면 자유 매칭으로 돌아가요)</span>`;
    $('matchSwitch').checked = S.settings.matchingOpen;
    $('matchSwitch').disabled = !!c;
    $('matchSwitchWrap').style.opacity = c ? 0.5 : 1;
    if (document.activeElement !== $('moveTime')) $('moveTime').value = String(S.settings.moveTime);

    const online = S.players.filter((p) => p.online).length;
    $('stOnline').textContent = online;
    $('stQueue').textContent = S.queueCount;
    $('stLive').textContent = S.live.length;
    $('stDone').textContent = S.history.length;
  }
  $('matchSwitch').addEventListener('change', (e) => send('teacher:settings', { matchingOpen: e.target.checked }));
  $('moveTime').addEventListener('change', (e) => send('teacher:settings', { moveTime: Number(e.target.value) }));

  // ── 실시간 경기 ──
  const liveCards = new Map();
  function renderLive() {
    const grid = $('liveGrid');
    $('liveEmpty').hidden = S.live.length > 0;
    const ids = new Set(S.live.map((g) => g.id));
    for (const [id, c] of liveCards) if (!ids.has(id)) { c.el.remove(); liveCards.delete(id); }
    for (const g of S.live) {
      let c = liveCards.get(g.id);
      if (!c) {
        const el = document.createElement('div');
        el.className = 'live-card';
        el.innerHTML = '<canvas></canvas><div class="live-info"></div>';
        el.addEventListener('click', () => openGame(g.id));
        grid.appendChild(el);
        c = { el, board: new OmokBoard(el.querySelector('canvas'), { size: 15 }) };
        liveCards.set(g.id, c);
      }
      c.board.setMoves(g.moves);
      const off = [!g.blackOnline && g.blackName, !g.whiteOnline && g.whiteName].filter(Boolean);
      c.el.querySelector('.live-info').innerHTML = `
        <div class="vs"><span class="stone b"></span>${esc(g.blackName)} <span class="muted">vs</span> <span class="stone w"></span>${esc(g.whiteName)}</div>
        <div class="muted small">${esc(g.label)} · ${g.moves.length}수 · ${g.turn === 1 ? '흑' : '백'} 차례</div>
        ${off.length ? `<span class="badge bad">연결 끊김: ${off.map(esc).join(', ')}</span>` : ''}`;
    }
  }

  // ── 학생 현황 ──
  function statusText(p) {
    if (!p.online && p.status !== 'playing') return '<span class="muted">접속 안 함</span>';
    if (p.status === 'queue') return '<span class="badge warn">매칭 대기</span>';
    if (p.status === 'playing') {
      const g = S.live.find((x) => x.id === p.gameId);
      const opp = g ? (g.black === p.id ? g.whiteName : g.blackName) : '';
      return `<span class="badge blue">경기 중</span> vs ${esc(opp)}`;
    }
    return '<span class="badge">대기</span>';
  }

  function renderStudents() {
    const list = [...S.players].sort((a, b) => (b.online - a.online) || a.name.localeCompare(b.name, 'ko'));
    $('stuCount').textContent = `(접속 ${S.players.filter((p) => p.online).length} / 전체 ${S.players.length})`;
    $('stuBody').innerHTML = list.map((p) => {
      const n = p.wins + p.losses + p.draws;
      const rate = n ? Math.round((p.wins / n) * 100) + '%' : '-';
      const key = 'kick:' + p.id;
      armActions.set(key, () => send('teacher:kick', { playerId: p.id }));
      return `<tr>
        <td class="left"><a href="#" data-student="${p.id}">${esc(p.name)}</a></td>
        <td>${p.online ? '<span class="dot-online"></span>' : '<span class="dot-offline"></span>'}</td>
        <td class="left">${statusText(p)}</td>
        <td>${n}</td><td>${p.wins}</td><td>${p.losses}</td><td>${p.draws}</td><td>${rate}</td>
        <td>${p.status === 'playing' ? `<button class="btn small" data-watch="${p.gameId}">관전</button> ` : ''}${armBtn(key, '내보내기')}</td>
      </tr>`;
    }).join('') || '<tr><td colspan="9" class="muted">아직 접속한 학생이 없어요.</td></tr>';
  }
  $('stuBody').addEventListener('click', (e) => {
    const s = e.target.closest('[data-student]');
    if (s) { e.preventDefault(); histFilter = s.dataset.student; showTab('history'); renderHistory(); }
    const w = e.target.closest('[data-watch]');
    if (w) openGame(w.dataset.watch);
  });

  // ── 대회 ──
  const selected = new Set();
  const seen = new Set();

  function renderCompetition() {
    const c = S.competition;
    const box = $('compRunning');
    $('compSetup').hidden = !!(c && c.status === 'running');

    for (const p of S.players) {
      if (!seen.has(p.id)) { seen.add(p.id); if (p.online) selected.add(p.id); }
    }
    for (const id of [...selected]) if (!S.players.some((p) => p.id === id)) selected.delete(id);
    renderChecklist();

    if (!c) { box.innerHTML = ''; return; }
    const real = c.matches.filter((m) => !m.bye);
    const done = real.filter((m) => m.status === 'done').length;
    const pct = real.length ? Math.round((done / real.length) * 100) : 0;
    armActions.set('closeComp', () => send('teacher:closeCompetition'));

    let champ = '';
    if (c.status === 'done') {
      if (c.type === 'tournament') champ = `<div class="champ-banner"><div class="big-emoji">🏆</div><h2>우승: ${esc(c.championName)}</h2></div>`;
      else champ = `<div class="champ-banner"><div class="big-emoji">🏆</div>${c.groups.map((g) => g.standings[0] ? `<h3>${g.name === '전체' ? '' : esc(g.name) + ' '}1위: ${esc(g.standings[0].name)} (${g.standings[0].pts}점)</h3>` : '').join('')}</div>`;
    }

    box.innerHTML = `
      <div class="card">
        <div class="row" style="justify-content:space-between">
          <h2 style="margin:0">${compKind(c)} <span class="badge ${c.status === 'running' ? 'good' : ''}">${c.status === 'running' ? '진행 중' : '종료'}</span></h2>
          ${armBtn('closeComp', '대회 닫기 → 자유 매칭으로')}
        </div>
        <div class="row" style="margin:12px 0 4px"><span class="small muted">진행률 ${done} / ${real.length} 경기 (${pct}%)</span></div>
        <div class="progress"><div style="width:${pct}%"></div></div>
        ${champ ? `<div style="margin-top:16px">${champ}</div>` : ''}
        <div id="compView" style="margin-top:18px"></div>
      </div>
      <div class="card">
        <h3>경기 목록</h3>
        <p class="muted small">결석·연결 문제 등으로 경기를 못 하면 승자 버튼으로 판정할 수 있어요.</p>
        <div class="table-scroll"><table class="table">
          <thead><tr><th class="left">구분</th><th class="left">대결</th><th>상태</th><th>결과</th><th>관리</th></tr></thead>
          <tbody>${matchRows(c)}</tbody>
        </table></div>
      </div>`;
    const view = $('compView');
    if (c.type === 'league') renderStandings(view, c, null); else renderBracket(view, c, null);
  }

  function matchRows(c) {
    const order = { playing: 0, pending: 1, done: 2 };
    const list = c.matches.filter((m) => !m.bye && (m.p1 || m.p2))
      .sort((a, b) => order[a.status] - order[b.status] || a.round - b.round || a.index - b.index);
    return list.map((m) => {
      const st = m.status === 'playing' ? '<span class="badge blue">경기 중</span>' : m.status === 'done' ? '<span class="badge good">완료</span>' : '<span class="badge">대기</span>';
      let res = '';
      if (m.status === 'done') res = m.draw ? '무승부' : `<b>${esc(m.winner === m.p1 ? m.p1Name : m.p2Name)}</b> 승${m.note ? ` <span class="muted small">(${esc(m.note)})</span>` : ''}`;
      else if (m.note) res = `<span class="muted small">${esc(m.note)}</span>`;
      let act = '';
      if (m.status !== 'done' && m.p1 && m.p2) {
        const k1 = `mr:${m.id}:1`, k2 = `mr:${m.id}:2`;
        armActions.set(k1, () => send('teacher:matchResult', { matchId: m.id, winner: m.p1 }));
        armActions.set(k2, () => send('teacher:matchResult', { matchId: m.id, winner: m.p2 }));
        act = (m.gameId ? `<button class="btn small" data-watch="${m.gameId}">관전</button> ` : '')
          + armBtn(k1, `${esc(m.p1Name)} 승`, '') + ' ' + armBtn(k2, `${esc(m.p2Name)} 승`, '');
      }
      return `<tr><td class="left">${esc(m.label)}</td>
        <td class="left">${esc(m.p1Name || '미정')} vs ${esc(m.p2Name || '미정')}</td>
        <td>${st}</td><td>${res}</td><td>${act}</td></tr>`;
    }).join('');
  }
  $('compRunning').addEventListener('click', (e) => {
    const w = e.target.closest('[data-watch]');
    if (w) openGame(w.dataset.watch);
    const bm = e.target.closest('.b-match[data-match]');
    if (bm && S.competition) {
      const m = S.competition.matches.find((x) => x.id === bm.dataset.match);
      if (m && m.gameId) openGame(m.gameId);
    }
  });

  function renderChecklist() {
    const list = [...S.players].sort((a, b) => (b.online - a.online) || a.name.localeCompare(b.name, 'ko'));
    $('checklist').innerHTML = list.map((p) => `
      <label><input type="checkbox" data-pid="${p.id}" ${selected.has(p.id) ? 'checked' : ''}>
      ${p.online ? '<span class="dot-online"></span>' : '<span class="dot-offline"></span>'}${esc(p.name)}</label>`).join('')
      || '<span class="muted">접속한 학생이 없어요.</span>';
    $('selCount').textContent = `(${selected.size}명 선택)`;
    renderEstimate();
  }
  $('checklist').addEventListener('change', (e) => {
    const id = e.target.dataset.pid;
    if (!id) return;
    if (e.target.checked) selected.add(id); else selected.delete(id);
    $('selCount').textContent = `(${selected.size}명 선택)`;
    renderEstimate();
  });
  $('selOnline').addEventListener('click', () => { S.players.forEach((p) => { if (p.online) selected.add(p.id); }); renderChecklist(); });
  $('selNone').addEventListener('click', () => { selected.clear(); renderChecklist(); });

  const compType = () => document.querySelector('input[name=ctype]:checked').value;
  document.querySelectorAll('input[name=ctype]').forEach((r) => r.addEventListener('change', () => { $('groupRow').hidden = compType() !== 'league'; renderEstimate(); }));
  $('groupSize').addEventListener('change', renderEstimate);

  function renderEstimate() {
    const n = selected.size;
    const el = $('compEstimate');
    if (n < 2) { el.textContent = '참가 학생을 2명 이상 골라 주세요.'; return; }
    if (compType() === 'league') {
      const gs = Number($('groupSize').value);
      const k = gs >= 2 && n > gs ? Math.ceil(n / gs) : 1;
      const small = Math.floor(n / k), big = Math.ceil(n / k);
      const total = Array.from({ length: k }, (_, i) => (i < n % k ? big : small)).reduce((s, x) => s + (x * (x - 1)) / 2, 0);
      el.textContent = `${k > 1 ? `${k}개 조 (조당 ${small === big ? small : small + '~' + big}명)` : '한 조'} · 총 ${total}경기 · 학생 한 명당 ${small === big ? small - 1 : `${small - 1}~${big - 1}`}경기`;
    } else {
      let P = 1; while (P < n) P *= 2;
      const R = Math.log2(P);
      el.textContent = `총 ${R}라운드 (${n - 1}경기) · 부전승 ${P - n}명 · 우승하려면 최대 ${R}번 이겨야 해요`;
    }
  }

  $('startComp').addEventListener('click', async () => {
    const ok = await send('teacher:startCompetition', { type: compType(), players: [...selected], groupSize: Number($('groupSize').value) });
    if (ok) toast('대회를 시작했어요!', 'good');
  });

  // ── 경기 기록 ──
  let histFilter = '';
  $('histFilter').addEventListener('change', (e) => { histFilter = e.target.value; renderHistory(); });

  const resultText = (g) => g.reason === 'cancel' ? '무효' : g.winner === 0 ? '무승부'
    : g.winner === 1 ? `흑 승 (${g.blackName})` : `백 승 (${g.whiteName})`;

  function renderHistory() {
    const sel = $('histFilter');
    const opts = '<option value="">전체 학생</option>' + [...S.players].sort((a, b) => a.name.localeCompare(b.name, 'ko'))
      .map((p) => `<option value="${p.id}">${esc(p.name)}</option>`).join('');
    if (sel.innerHTML !== opts) sel.innerHTML = opts;
    sel.value = histFilter;
    const list = S.history.filter((g) => !histFilter || g.black === histFilter || g.white === histFilter);
    $('histEmpty').hidden = list.length > 0;
    $('histBody').innerHTML = list.map((g) => `
      <tr class="clickable" data-game="${g.id}">
        <td>${fmtTime(g.endedAt)}</td><td class="left">${esc(g.label)}</td>
        <td class="left">${esc(g.blackName)}</td><td class="left">${esc(g.whiteName)}</td>
        <td>${esc(resultText(g))}</td><td>${g.moves.length}</td><td>${esc(REASONS[g.reason] || '')}</td>
        <td><button class="btn small">다시보기</button></td>
      </tr>`).join('');
    const rb = $('resetAll');
    rb.classList.toggle('armed', isArmed('resetAll'));
    rb.textContent = isArmed('resetAll') ? '정말 모두 지울까요? 한 번 더 누르세요' : '기록 전체 초기화';
  }
  $('histBody').addEventListener('click', (e) => { const r = e.target.closest('[data-game]'); if (r) openGame(r.dataset.game); });

  $('resetAll').addEventListener('click', () => armedClick('resetAll', () => send('teacher:resetAll')));

  // ── CSV ──
  function download(name, rows) {
    const csv = '﻿' + rows.map((r) => r.map((v) => `"${String(v ?? '').replace(/"/g, '""')}"`).join(',')).join('\r\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }
  const today = () => new Date().toISOString().slice(0, 10);
  $('csvGames').addEventListener('click', () => {
    if (!S) return;
    download(`오목_경기기록_${today()}.csv`, [['종료시각', '구분', '흑', '백', '결과', '수', '사유'],
      ...S.history.map((g) => [new Date(g.endedAt).toLocaleString('ko-KR'), g.label, g.blackName, g.whiteName, resultText(g), g.moves.length, REASONS[g.reason] || ''])]);
  });
  $('csvStudents').addEventListener('click', () => {
    if (!S) return;
    download(`오목_학생전적_${today()}.csv`, [['이름', '경기', '승', '패', '무', '승률(%)'],
      ...S.players.map((p) => { const n = p.wins + p.losses + p.draws; return [p.name, n, p.wins, p.losses, p.draws, n ? Math.round((p.wins / n) * 100) : '']; })]);
  });

  // ── 관전 / 다시보기 ──
  const mBoard = new OmokBoard($('mCanvas'), { size: 15 });
  let modal = null;
  let playTimer = null;
  const findGame = (id) => S && (S.live.find((g) => g.id === id) || S.history.find((g) => g.id === id));

  function openGame(id) {
    if (!findGame(id)) return;
    modal = { gameId: id, step: null };
    $('modal').hidden = false;
    mBoard.resize();
    updateModal();
  }
  function closeModal() { modal = null; stopPlay(); $('modal').hidden = true; }
  $('mClose').addEventListener('click', closeModal);
  $('modal').addEventListener('click', (e) => { if (e.target === $('modal')) closeModal(); });

  function updateModal() {
    if (!modal) return;
    const g = findGame(modal.gameId);
    if (!g) { closeModal(); return; }
    const live = g.status === 'playing';
    $('mTitle').textContent = `${g.label} · ${g.blackName} vs ${g.whiteName}`;
    const turnRow = (c, name, online) => `<div class="player-row ${live && g.turn === c ? 'turn' : ''}"><span class="stone ${c === 1 ? 'b' : 'w'}"></span><span class="name">${esc(name)}</span>${online ? '' : '<span class="badge bad">연결 끊김</span>'}</div>`;
    $('mInfo').innerHTML = turnRow(1, g.blackName, g.blackOnline || !live) + turnRow(2, g.whiteName, g.whiteOnline || !live)
      + (live ? `<p class="muted small" style="margin-top:8px">${g.moves.length}수 진행 · 실시간으로 업데이트돼요</p>`
        : `<p style="margin-top:8px"><b>${esc(resultText(g))}</b> · ${esc(REASONS[g.reason] || '')} · ${g.moves.length}수</p>`);

    $('mReplay').hidden = live;
    mBoard.showNumbers = !live && $('mNumbers').checked;
    if (live) {
      modal.step = null;
      mBoard.winLine = null;
      mBoard.setMoves(g.moves);
      const kb = 'end:' + g.id + ':black', kw = 'end:' + g.id + ':white', kd = 'end:' + g.id + ':draw', kc = 'end:' + g.id + ':cancel';
      armActions.set(kb, () => send('teacher:endGame', { gameId: g.id, result: 'black' }));
      armActions.set(kw, () => send('teacher:endGame', { gameId: g.id, result: 'white' }));
      armActions.set(kd, () => send('teacher:endGame', { gameId: g.id, result: 'draw' }));
      armActions.set(kc, () => send('teacher:endGame', { gameId: g.id, result: 'cancel' }));
      $('mActions').innerHTML = `<h4>선생님 판정</h4>
        <div class="row">${armBtn(kb, `흑(${esc(g.blackName)}) 승`, '')}${armBtn(kw, `백(${esc(g.whiteName)}) 승`, '')}</div>
        <div class="row" style="margin-top:6px">${armBtn(kd, '무승부', '')}${armBtn(kc, '무효 (기록 안 함)')}</div>
        <p class="muted small" style="margin-top:6px">대회 경기를 무효로 하면 그 경기를 다시 치러요.</p>`;
    } else {
      $('mActions').innerHTML = '';
      const n = g.moves.length;
      if (modal.step == null) modal.step = n;
      modal.step = Math.max(0, Math.min(n, modal.step));
      $('mSlider').max = n;
      $('mSlider').value = modal.step;
      $('mStep').textContent = `${modal.step} / ${n}수`;
      mBoard.winLine = modal.step === n ? g.winLine : null;
      mBoard.setMoves(g.moves, modal.step);
    }
  }

  const step = (d) => { if (modal && modal.step != null) { modal.step += d; updateModal(); } };
  $('mSlider').addEventListener('input', (e) => { if (modal) { modal.step = Number(e.target.value); updateModal(); } });
  $('mFirst').addEventListener('click', () => { if (modal) { modal.step = 0; updateModal(); } });
  $('mLast').addEventListener('click', () => { if (modal) { modal.step = 1e9; updateModal(); } });
  $('mPrev').addEventListener('click', () => step(-1));
  $('mNext').addEventListener('click', () => step(1));
  $('mNumbers').addEventListener('change', updateModal);
  function stopPlay() { clearInterval(playTimer); playTimer = null; $('mPlay').textContent = '▶ 자동 재생'; }
  $('mPlay').addEventListener('click', () => {
    if (playTimer) return stopPlay();
    const g = modal && findGame(modal.gameId);
    if (!g) return;
    if (modal.step >= g.moves.length) modal.step = 0;
    $('mPlay').textContent = '⏸ 멈춤';
    playTimer = setInterval(() => {
      const gg = modal && findGame(modal.gameId);
      if (!gg || modal.step >= gg.moves.length) return stopPlay();
      step(1);
    }, 700);
  });
  document.addEventListener('keydown', (e) => {
    if (!modal) return;
    if (e.key === 'Escape') closeModal();
    if (e.key === 'ArrowLeft') step(-1);
    if (e.key === 'ArrowRight') step(1);
  });
})();
