(function () {
  'use strict';
  const { esc, REASONS, OmokBoard, renderStandings, renderBracket, toast, randomToken, store } = Omok;
  const $ = (id) => document.getElementById(id);

  const socket = io();
  let token = store.get('omokToken');
  if (!token) { token = randomToken(); store.set('omokToken', token); }

  let myId = null, myName = store.get('omokName') || '';
  let lobby = null;
  let game = null, gameAt = 0;
  let dismissed = false;      // 끝난 경기에서 로비로 나갔는지
  let overlayHidden = false;  // 결과창을 잠시 닫고 판을 보는 중인지
  let resignArmedUntil = 0;
  let blocked = false;        // 퇴장/중복 접속으로 연결이 끊긴 상태

  const board = new OmokBoard($('board'), {
    size: 15,
    onPlace: (x, y) => socket.emit('game:move', { x, y }),
  });

  // ── 입장 ──
  function join(name, silent) {
    socket.emit('student:join', { name, token }, (res) => {
      if (!res || !res.ok) {
        myId = null;
        $('loginError').textContent = res ? res.error : '';
        if (silent) store.del('omokName');
        render();
        return;
      }
      myId = res.id; myName = res.name;
      store.set('omokName', myName);
      $('loginError').textContent = '';
      render();
    });
  }

  socket.on('connect', () => { if (myName && !blocked) join(myName, true); else render(); });
  socket.on('disconnect', () => { if (!blocked) toast('연결이 끊겼어요. 다시 연결하는 중…', 'bad'); });

  $('loginForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const name = $('nameInput').value.trim();
    if (name) join(name, false);
  });

  $('logoutBtn').addEventListener('click', () => {
    store.del('omokName');
    location.reload();
  });

  socket.on('kicked', () => {
    blocked = true; myId = null; store.del('omokName');
    $('loginError').textContent = '선생님이 퇴장 처리했어요. 다시 입장하려면 새로고침하세요.';
    render();
  });
  socket.on('replaced', () => {
    blocked = true; myId = null;
    $('loginError').textContent = '다른 창에서 같은 이름으로 접속해서 이 창은 연결이 끊겼어요.';
    render();
  });

  socket.on('lobby', (s) => { lobby = s; render(); });

  socket.on('game:update', (g) => {
    const isNew = !game || game.id !== g.id;
    if (isNew) {
      if (g.status !== 'playing') return;
      dismissed = false; overlayHidden = false;
      const opp = g.black === myId ? g.whiteName : g.blackName;
      toast(`대전 상대: ${opp}`, 'good');
    }
    game = g; gameAt = Date.now();
    render();
  });

  // ── 화면 전환 ──
  function render() {
    const inGame = myId && game && !dismissed;
    $('loginView').hidden = !!myId;
    $('lobbyView').hidden = !myId || inGame;
    $('gameView').hidden = !inGame;
    $('logoutBtn').hidden = !myId;
    const me = myId && lobby && lobby.players.find((p) => p.id === myId);
    $('meBox').innerHTML = myId ? `<b>${esc(myName)}</b>${me ? ` · ${me.wins}승 ${me.losses}패${me.draws ? ' ' + me.draws + '무' : ''}` : ''}` : '';
    if (!myId) { if (myName && !$('nameInput').value) $('nameInput').value = myName; return; }
    if (inGame) renderGame(); else renderLobby(me);
  }

  const isFreeMode = () => lobby && lobby.settings.mode === 'free' && !lobby.competition;

  function renderLobby(me) {
    if (!lobby || !me) return;
    const card = $('statusCard');
    const comp = lobby.competition;

    if (!comp) {
      if (me.status === 'queue') {
        card.innerHTML = `
          <div class="spinner"></div>
          <h2>상대를 찾고 있어요…</h2>
          <p class="muted">${lobby.settings.matchingOpen ? `지금 ${lobby.queueCount}명이 기다리는 중이에요.` : '⏸ 선생님이 매칭을 잠시 멈췄어요. 조금만 기다려 주세요.'}</p>
          <button class="btn" id="cancelQueue">그만 찾기</button>`;
        $('cancelQueue').onclick = () => socket.emit('queue:leave');
      } else {
        card.innerHTML = `
          <div class="big-emoji">⚫⚪</div>
          <h2>오목 한 판 할까요?</h2>
          <p class="muted">버튼을 누르면 기다리는 친구 중 한 명과 무작위로 짝이 지어져요.</p>
          <button class="btn primary big" id="findBtn">대전 찾기</button>`;
        $('findBtn').onclick = () => socket.emit('queue:join');
      }
      $('compCard').hidden = true;
    } else {
      card.innerHTML = competitionStatus(comp);
      $('compCard').hidden = false;
      $('compTitle').textContent = comp.type === 'league' ? '📋 리그전 순위' : '🏆 토너먼트 대진표';
      const body = $('compBody');
      if (comp.type === 'league') {
        renderStandings(body, comp, myId);
        const mine = comp.matches.filter((m) => m.p1 === myId || m.p2 === myId);
        if (mine.length) {
          body.insertAdjacentHTML('beforeend', `<h4 style="margin-top:16px">나의 경기</h4><div class="chips">${mine.map((m) => {
            const opp = m.p1 === myId ? m.p2Name : m.p1Name;
            const res = m.status !== 'done' ? (m.status === 'playing' ? '경기 중' : '예정') : m.draw ? '무' : m.winner === myId ? '승' : '패';
            return `<span class="chip ${m.status === 'playing' ? 'playing' : ''}">vs ${esc(opp)} · ${res}</span>`;
          }).join('')}</div>`);
        }
      } else {
        renderBracket(body, comp, myId);
      }
    }

    const online = lobby.players.filter((p) => p.online);
    $('friendCount').textContent = `(${online.length}명)`;
    $('friends').innerHTML = online.map((p) =>
      `<span class="chip ${p.status === 'playing' ? 'playing' : ''} ${p.id === myId ? 'me' : ''}">${esc(p.name)}${p.status === 'playing' ? ' 🎮' : p.status === 'queue' ? ' ⏳' : ''}</span>`).join('');
  }

  function competitionStatus(comp) {
    const kind = comp.type === 'league' ? '리그전' : '토너먼트';
    if (comp.status === 'done') {
      let extra = '';
      if (comp.type === 'tournament') extra = `<p>우승: <b>${esc(comp.championName || '')}</b> 🎉</p>`;
      else {
        extra = comp.groups.map((g) => g.standings[0] ? `<p>${g.name === '전체' ? '' : esc(g.name) + ' '}1위: <b>${esc(g.standings[0].name)}</b> 🎉</p>` : '').join('');
      }
      return `<div class="big-emoji">🏁</div><h2>${kind}가 끝났어요!</h2>${extra}<p class="muted">선생님의 안내를 기다려 주세요.</p>`;
    }
    const inComp = comp.participants.some((p) => p.id === myId);
    if (!inComp) {
      return `<div class="big-emoji">📣</div><h2>${kind} 진행 중</h2><p class="muted">이번 대회에는 참가하지 않아요. 친구들을 응원해 주세요!</p>`;
    }
    const mine = comp.matches.filter((m) => m.p1 === myId || m.p2 === myId);
    const lost = comp.type === 'tournament' && mine.some((m) => m.status === 'done' && m.winner && m.winner !== myId);
    if (lost) return `<div class="big-emoji">💪</div><h2>아쉽게 탈락했어요</h2><p class="muted">잘 싸웠어요! 대진표를 보며 친구들을 응원해 주세요.</p>`;

    const next = mine.filter((m) => m.status !== 'done').sort((a, b) => a.round - b.round)[0];
    if (!next) {
      if (comp.type === 'tournament') {
        return `<div class="big-emoji">⏳</div><h2>다음 상대를 기다리는 중</h2><p class="muted">다른 경기가 끝나면 상대가 정해지고 자동으로 시작돼요.</p>`;
      }
      return `<div class="big-emoji">👏</div><h2>내 경기를 모두 마쳤어요!</h2><p class="muted">다른 친구들의 경기가 끝나면 최종 순위가 나와요.</p>`;
    }
    const oppId = next.p1 === myId ? next.p2 : next.p1;
    const oppName = next.p1 === myId ? next.p2Name : next.p1Name;
    const opp = lobby.players.find((p) => p.id === oppId);
    let wait = '곧 자동으로 경기가 시작돼요!';
    if (!oppId) wait = '다른 경기가 끝나면 상대가 정해져요.';
    else if (!opp || !opp.online) wait = '상대가 아직 접속하지 않았어요.';
    else if (opp.status === 'playing') wait = '상대가 다른 경기를 하고 있어요. 끝나면 시작해요.';
    return `<div class="spinner"></div>
      <h2>${esc(next.label)} · 다음 상대: ${oppName ? esc(oppName) : '미정'}</h2>
      <p class="muted">${wait}</p>`;
  }

  // ── 게임 화면 ──
  function renderGame() {
    const g = game;
    const myColor = g.black === myId ? 1 : 2;
    const playing = g.status === 'playing';
    const myTurn = playing && g.turn === myColor;

    board.setMoves(g.moves);
    board.winLine = g.winLine;
    board.setInteractive(myTurn, myColor);

    $('gameLabel').textContent = g.label || '자유 대전';
    $('nameBlack').textContent = g.blackName + (myColor === 1 ? ' (나)' : '');
    $('nameWhite').textContent = g.whiteName + (myColor === 2 ? ' (나)' : '');
    $('rowBlack').classList.toggle('turn', playing && g.turn === 1);
    $('rowWhite').classList.toggle('turn', playing && g.turn === 2);
    $('offBlack').hidden = g.blackOnline;
    $('offWhite').hidden = g.whiteOnline;

    const tm = $('turnMsg');
    tm.className = 'turn-msg' + (myTurn ? ' mine' : '');
    tm.textContent = playing ? (myTurn ? '👉 내 차례예요! 돌을 놓으세요' : '상대가 생각하는 중…') : '경기 종료';

    const oppOnline = myColor === 1 ? g.whiteOnline : g.blackOnline;
    $('gameNotice').innerHTML = playing && !oppOnline
      ? '<div class="notice">상대의 연결이 끊겼어요. 1분 안에 돌아오지 않으면 승리로 처리돼요.</div>' : '';

    $('resignBtn').hidden = !playing;
    $('backResultBtn').hidden = playing || !overlayHidden;
    updateResignBtn();

    const ov = $('resultOverlay');
    ov.hidden = playing || overlayHidden;
    if (!playing) {
      let emoji, title;
      if (g.reason === 'cancel') { emoji = '🚫'; title = '무효 경기'; }
      else if (g.winner === 0) { emoji = '🤝'; title = '무승부'; }
      else if (g.winner === myColor) { emoji = '🎉'; title = '승리!'; }
      else { emoji = '😢'; title = '아쉬운 패배'; }
      $('resultEmoji').textContent = emoji;
      $('resultTitle').textContent = title;
      let desc = `${REASONS[g.reason] || ''} · ${g.moves.length}수`;
      if (!isFreeMode()) desc += '\n다음 경기는 잠시 후 자동으로 시작돼요.';
      $('resultDesc').innerText = desc;
      $('againBtn').hidden = !isFreeMode();
    }
    updateTimer();
  }

  function updateTimer() {
    const el = $('timer');
    if (!game || game.status !== 'playing' || game.remainingMs == null || dismissed) { el.hidden = true; return; }
    const rem = Math.max(0, game.remainingMs - (Date.now() - gameAt));
    const sec = Math.ceil(rem / 1000);
    const myTurn = game.turn === (game.black === myId ? 1 : 2);
    el.hidden = false;
    el.textContent = `⏱ ${sec}초`;
    el.classList.toggle('low', sec <= 5 && myTurn);
  }
  setInterval(updateTimer, 250);

  function updateResignBtn() {
    const armed = Date.now() < resignArmedUntil;
    const b = $('resignBtn');
    b.classList.toggle('armed', armed);
    b.textContent = armed ? '정말 기권할까요? 한 번 더 누르세요' : '기권하기';
  }
  $('resignBtn').addEventListener('click', () => {
    if (Date.now() < resignArmedUntil) { resignArmedUntil = 0; socket.emit('game:resign'); }
    else { resignArmedUntil = Date.now() + 3000; setTimeout(updateResignBtn, 3050); }
    updateResignBtn();
  });

  $('againBtn').addEventListener('click', () => { dismissed = true; game = null; socket.emit('queue:join'); render(); });
  $('lobbyBtn').addEventListener('click', () => { dismissed = true; game = null; render(); });
  $('viewBoardBtn').addEventListener('click', () => { overlayHidden = true; render(); });
  $('backResultBtn').addEventListener('click', () => { overlayHidden = false; render(); });

  render();
})();
