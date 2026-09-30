(function () {
  'use strict';
  const { OmokBoard, AI, findWin } = Omok;
  const $ = (id) => document.getElementById(id);
  const RED = '#e53935', GREEN = '#16a34a';

  // ── 탭 ──
  let tab = 'rules';
  function showTab(t) {
    tab = t;
    document.querySelectorAll('#lessonTabs .tab').forEach((b) => b.classList.toggle('active', b.dataset.tab === t));
    document.querySelectorAll('[data-panel]').forEach((p) => { p.hidden = p.dataset.panel !== t; });
    stopSim();
    window.scrollTo({ top: 0 });
  }
  $('lessonTabs').addEventListener('click', (e) => { const b = e.target.closest('.tab'); if (b) showTab(b.dataset.tab); });
  document.querySelectorAll('[data-go]').forEach((b) => b.addEventListener('click', () => showTab(b.dataset.go)));

  const stones = (black = [], white = []) => [...black.map(([x, y]) => ({ x, y, c: 1 })), ...white.map(([x, y]) => ({ x, y, c: 2 }))];
  function mini(canvas, black, white, opts = {}) {
    const b = new OmokBoard(canvas, { size: 9 });
    b.setStones(stones(black, white));
    b.winLine = opts.win || null;
    b.marks = opts.marks || [];
    b.draw();
    return b;
  }

  // ── ① 규칙 그림 ──
  const H = [[2, 4], [3, 4], [4, 4], [5, 4], [6, 4]];
  mini($('ruleH'), H, [[2, 3], [3, 5], [5, 3], [4, 5]], { win: H });
  const V = [[4, 2], [4, 3], [4, 4], [4, 5], [4, 6]];
  mini($('ruleV'), V, [[3, 3], [5, 4], [3, 5], [5, 6]], { win: V });
  const D = [[2, 2], [3, 3], [4, 4], [5, 5], [6, 6]];
  mini($('ruleD'), D, [[3, 2], [4, 3], [5, 4], [2, 6]], { win: D });
  mini($('ruleX'), [[2, 4], [3, 4], [4, 4], [5, 4]], [[1, 4], [6, 4], [3, 3]], { marks: [{ x: 1, y: 4, type: 'ring', color: RED }, { x: 6, y: 4, type: 'ring', color: RED }] });

  // ── ② 한 판 따라보기 ──
  const dot = (x, y, color) => ({ x, y, type: 'dot', color });
  const SCRIPT = [
    { m: [7, 7], t: '흑이 먼저 판의 한가운데에 둡니다. 가운데는 사방으로 뻗어 나갈 수 있어 좋은 자리예요.' },
    { m: [8, 7], t: '백은 흑 바로 옆에 붙여서 흑이 쉽게 뻗어 나가지 못하게 해요.' },
    { m: [7, 8], t: '흑은 아래로 한 칸! 돌 2개를 세로로 이었어요.' },
    { m: [7, 6], t: '백이 흑의 세로줄 위쪽을 미리 막았어요.' },
    { m: [8, 8], t: '흑이 오른쪽에 두어 가로로 2개, 대각선으로도 2개를 만들었어요. 한 수로 두 방향을 노리는 좋은 수예요.' },
    { m: [9, 9], t: '백이 대각선 방향을 막았어요.' },
    { m: [9, 8], t: '흑이 가로로 3개를 만들었어요! 양쪽 끝(파란 점)이 모두 비어 있는 <b>"열린 3"</b>이에요. 그냥 두면 다음 수에 막을 수 없는 "열린 4"가 돼요.', marks: [dot(6, 8), dot(10, 8)] },
    { m: [10, 8], t: '백이 열린 3의 한쪽 끝을 막았어요. <b>열린 3은 꼭 막아야 해요.</b> 이제 흑의 가로줄은 한쪽이 막힌 "닫힌 3"이에요.' },
    { m: [6, 10], t: '흑은 조용히 다른 곳에 돌을 놓아 준비를 해요. 이 돌이 나중에 큰 역할을 해요!' },
    { m: [9, 7], t: '백도 가로로 돌 2개를 이어 공격을 준비해요.' },
    { m: [6, 9], t: '흑이 세로로 2개를 만들었어요. 흑의 <b>가로줄과 세로줄이 만나는 자리</b>(파란 동그라미)가 보이나요?', marks: [{ x: 6, y: 8, type: 'ring' }] },
    { m: [8, 6], t: '백은 위쪽에 두어 자기 돌을 이어요. 하지만 흑의 속셈을 알아채지 못했어요.' },
    { m: [6, 8], t: '바로 이 수! <b>가로 4개</b>와 <b>세로 열린 3</b>을 한 번에 만들었어요. 이것을 <b>"4-3(사삼)"</b>이라고 해요. 백은 두 곳을 한꺼번에 막을 수 없어요.', marks: [{ x: 5, y: 8, type: 'text', text: '4', color: RED }, dot(6, 7), dot(6, 11)] },
    { m: [5, 8], t: '4개는 당장 막지 않으면 바로 지기 때문에, 백은 가로줄 끝을 막을 수밖에 없어요.' },
    { m: [6, 7], t: '이제 흑은 세로로 4개! 양쪽 끝이 모두 비어 있는 <b>"열린 4"</b>예요. 백은 한 곳만 막을 수 있어요.', marks: [dot(6, 6, RED), dot(6, 11, RED)] },
    { m: [6, 6], t: '백이 위쪽을 막았지만…' },
    { m: [6, 11], t: '흑이 아래쪽에 두어 <b>세로 5개 완성! 흑의 승리</b>입니다 🎉<br>열린 3 → 4-3 → 열린 4 순서로 이기는 흐름을 기억하세요.' },
  ];
  const INTRO = '오목 한 판이 어떻게 진행되는지 따라가 봐요.<br><b>"다음 ▶"</b> 버튼을 눌러 한 수씩 넘겨 보세요.';
  const simMoves = SCRIPT.map((s) => s.m);
  const simBoard = new OmokBoard($('simBoard'), { size: 15 });
  let simStep = 0, simTimer = null;
  $('simSlider').max = SCRIPT.length;

  function renderSim() {
    const s = simStep > 0 ? SCRIPT[simStep - 1] : null;
    simBoard.showNumbers = $('simNumbers').checked;
    simBoard.marks = s && s.marks ? s.marks : [];
    simBoard.winLine = null;
    simBoard.setMoves(simMoves, simStep);
    if (simStep === SCRIPT.length) {
      const [x, y] = simMoves[simStep - 1];
      simBoard.winLine = findWin(simBoard.stones, 15, x, y, 1);
      simBoard.draw();
    }
    const who = simStep === 0 ? '' : simStep % 2 === 1 ? '⚫ 흑' : '⚪ 백';
    $('simText').innerHTML = `<div class="step">${simStep === 0 ? '시작' : `${simStep}수째 · ${who}`}</div>${s ? s.t : INTRO}`;
    $('simSlider').value = simStep;
    $('simPrev').disabled = simStep === 0;
    $('simNext').disabled = simStep === SCRIPT.length;
  }
  const simGo = (n) => { simStep = Math.max(0, Math.min(SCRIPT.length, n)); renderSim(); };
  function stopSim() { clearInterval(simTimer); simTimer = null; $('simPlay').textContent = '자동 재생'; }
  $('simFirst').addEventListener('click', () => { stopSim(); simGo(0); });
  $('simPrev').addEventListener('click', () => { stopSim(); simGo(simStep - 1); });
  $('simNext').addEventListener('click', () => { stopSim(); simGo(simStep + 1); });
  $('simSlider').addEventListener('input', (e) => { stopSim(); simGo(Number(e.target.value)); });
  $('simNumbers').addEventListener('change', renderSim);
  $('simPlay').addEventListener('click', () => {
    if (simTimer) return stopSim();
    if (simStep === SCRIPT.length) simGo(0);
    $('simPlay').textContent = '⏸ 멈춤';
    simTimer = setInterval(() => { if (simStep >= SCRIPT.length) return stopSim(); simGo(simStep + 1); }, 3200);
  });
  document.addEventListener('keydown', (e) => {
    if (tab !== 'sim') return;
    if (e.key === 'ArrowRight') { stopSim(); simGo(simStep + 1); }
    if (e.key === 'ArrowLeft') { stopSim(); simGo(simStep - 1); }
  });
  renderSim();

  // ── ③ 이기는 모양 ──
  const PATTERNS = [
    {
      title: '열린 3', tag: '꼭 막기',
      black: [[3, 4], [4, 4], [5, 4]], white: [[4, 2], [3, 6]],
      marks: [dot(2, 4), dot(6, 4)],
      text: '돌 3개가 나란히 있고 <b>양쪽 끝이 모두 비어</b> 있어요. 한 수만 더 두면 막을 수 없는 열린 4가 되니까, 상대의 열린 3은 <b>파란 점 중 한 곳을 꼭 막아야</b> 해요.',
    },
    {
      title: '띈 3', tag: '놓치기 쉬움',
      black: [[2, 4], [3, 4], [5, 4]], white: [[4, 6], [6, 2]],
      marks: [dot(1, 4), dot(4, 4), dot(6, 4)],
      text: '가운데가 한 칸 떨어져 있어도 <b>열린 3</b>과 같아요. 빈칸(가운데)을 채우면 열린 4가 되니 조심! 가운데나 양 끝을 막아요.',
    },
    {
      title: '열린 4', tag: '이미 승리',
      black: [[2, 4], [3, 4], [4, 4], [5, 4]], white: [[3, 3], [4, 5], [5, 3]],
      marks: [{ x: 1, y: 4, type: 'text', text: '5', color: RED }, { x: 6, y: 4, type: 'text', text: '5', color: RED }],
      text: '4개가 나란히 있고 양쪽 끝이 비어 있어요. 어느 쪽에 두어도 5개가 되고, 상대는 한 곳만 막을 수 있으니 <b>이미 이긴 것</b>이에요.',
    },
    {
      title: '닫힌 4', tag: '바로 막기',
      black: [[2, 4], [3, 4], [4, 4], [5, 4]], white: [[1, 4], [3, 3], [5, 5]],
      marks: [dot(6, 4, RED)],
      text: '한쪽이 막혔어도 4개예요. 남은 한 곳(빨간 점)에 두면 5개가 되니까, 상대는 <b>무조건 그 자리를 막아야</b> 해요. 공격의 주도권을 잡는 수예요.',
    },
    {
      title: '4-3 (사삼)', tag: '필승 공격',
      black: [[2, 4], [3, 4], [4, 4], [5, 5], [5, 6]], white: [[1, 4], [3, 5], [6, 6]],
      marks: [{ x: 5, y: 4, type: 'text', text: '★', color: RED }],
      text: '★에 두면 <b>가로 4개</b>와 <b>세로 열린 3</b>이 동시에 생겨요. 상대가 4를 막으면 3을 열린 4로 만들어 이겨요. 오목의 대표적인 필승 공격!',
    },
    {
      title: '3-3 (삼삼)', tag: '두 방향 공격',
      black: [[3, 4], [4, 4], [5, 2], [5, 3]], white: [[2, 2], [6, 5], [3, 6]],
      marks: [{ x: 5, y: 4, type: 'text', text: '★', color: RED }],
      text: '★에 두면 <b>열린 3이 두 개</b> 생겨요. 상대는 한쪽만 막을 수 있어요. (정식 대회에서는 흑의 3-3을 금지하기도 하지만, 우리 반 규칙에서는 허용해요.)',
    },
    {
      title: '막는 요령', tag: '수비',
      black: [[6, 5]], white: [[3, 4], [4, 4], [5, 4]],
      marks: [dot(2, 4, GREEN), dot(6, 4, GREEN)],
      text: '상대(백)의 열린 3은 양 끝(초록 점) 중 한 곳을 막아요. 이왕이면 <b>내 돌과 이어지는 쪽</b>(오른쪽)을 막으면 수비하면서 공격도 준비할 수 있어요.',
    },
  ];
  $('patternGrid').innerHTML = PATTERNS.map((p, i) => `
    <div class="card"><canvas id="pat${i}"></canvas>
      <h3>${p.title} <span class="badge warn">${p.tag}</span></h3>
      <p>${p.text}</p></div>`).join('');
  PATTERNS.forEach((p, i) => mini($('pat' + i), p.black, p.white, { marks: p.marks }));

  // ── ④ 문제 풀기 ──
  const QUIZ = [
    {
      title: '한 수로 이기기 ①', desc: '흑이 한 수만 더 두면 이겨요. 어디일까요?',
      black: [[2, 4], [3, 4], [4, 4], [5, 4]], white: [[1, 4], [3, 3], [4, 5], [5, 5]],
      type: 'win', hint: [[6, 4]], ok: '정답! 가로로 5개를 완성했어요. 왼쪽이 막혀 있으니 오른쪽 끝이 정답이에요.',
    },
    {
      title: '한 수로 이기기 ②', desc: '이번엔 대각선이에요. 빈틈을 찾아보세요!',
      black: [[1, 1], [2, 2], [4, 4], [5, 5]], white: [[3, 2], [5, 4], [2, 6], [6, 6]],
      type: 'win', hint: [[3, 3]], ok: '정답! 가운데 빈칸을 채워 대각선 5개를 완성했어요.',
    },
    {
      title: '꼭 막아야 해요 ①', desc: '백이 4개를 만들었어요! 어디를 막아야 할까요?',
      black: [[1, 6], [3, 5], [4, 4], [6, 3]], white: [[2, 6], [3, 6], [4, 6], [5, 6]],
      type: 'answers', answers: [[6, 6]], ok: '정답! 4개는 바로 막지 않으면 다음 수에 져요. 가장 먼저 확인해야 해요.',
    },
    {
      title: '꼭 막아야 해요 ②', desc: '백이 대각선으로 열린 3을 만들었어요. 어디를 막을까요? (정답 2개)',
      black: [[4, 3], [5, 4], [2, 5]], white: [[3, 3], [4, 4], [5, 5]],
      type: 'answers', answers: [[2, 2], [6, 6]], ok: '정답! 열린 3의 바로 옆 끝을 막으면 백은 열린 4를 만들 수 없어요.',
    },
    {
      title: '열린 4 만들기', desc: '흑 3개가 나란히 있어요. 어디에 두면 상대가 막을 수 없는 "열린 4"가 될까요?',
      black: [[3, 4], [4, 4], [5, 4]], white: [[4, 3], [4, 5], [3, 5]],
      type: 'answers', answers: [[2, 4], [6, 4]], ok: '정답! 양쪽 끝이 비어 있는 4개가 되었어요. 이제 백이 어디를 막아도 흑이 이겨요.',
    },
    {
      title: '4-3 만들기 (도전!)', desc: '한 수로 "4개"와 "열린 3"을 동시에 만드는 자리를 찾아보세요.',
      black: [[2, 4], [3, 4], [4, 4], [5, 5], [5, 6]], white: [[1, 4], [3, 5], [6, 6]],
      type: 'answers', answers: [[5, 4]], ok: '대단해요! 가로 4개와 세로 열린 3을 동시에 만든 4-3이에요. 이제 이길 수 있어요!',
    },
  ];
  const quizBoard = new OmokBoard($('quizBoard'), { size: 9, onPlace: quizPlace, confirmTouch: false });
  let qi = 0, qSolved = false;
  const solved = new Set();

  function loadQuiz(i) {
    qi = (i + QUIZ.length) % QUIZ.length;
    const q = QUIZ[qi];
    qSolved = false;
    quizBoard.setStones(stones(q.black, q.white));
    quizBoard.marks = []; quizBoard.winLine = null; quizBoard.last = null;
    quizBoard.setInteractive(true, 1);
    $('quizNo').textContent = `문제 ${qi + 1} / ${QUIZ.length}`;
    $('quizTitle').textContent = q.title;
    $('quizDesc').textContent = q.desc;
    $('quizFeedback').innerHTML = '';
    $('quizScore').textContent = `맞힌 문제 ${solved.size} / ${QUIZ.length}`;
  }
  function quizPlace(x, y) {
    if (qSolved) return;
    const q = QUIZ[qi];
    const st = [...quizBoard.stones];
    st[y * 9 + x] = 1;
    const line = findWin(st, 9, x, y, 1);
    const correct = q.type === 'win' ? !!line : q.answers.some(([ax, ay]) => ax === x && ay === y);
    if (correct) {
      qSolved = true;
      solved.add(qi);
      quizBoard.stones[y * 9 + x] = 1;
      quizBoard.last = [x, y];
      quizBoard.winLine = line;
      quizBoard.marks = [];
      quizBoard.setInteractive(false);
      $('quizFeedback').innerHTML = `<div class="feedback good">⭕ ${q.ok}</div>`;
      $('quizScore').textContent = `맞힌 문제 ${solved.size} / ${QUIZ.length}`;
      if (solved.size === QUIZ.length) $('quizFeedback').insertAdjacentHTML('beforeend', '<div class="feedback info">🏅 모든 문제를 풀었어요! 이제 친구와 대전해 보세요.</div>');
    } else {
      quizBoard.marks = [{ x, y, type: 'x', color: RED }];
      quizBoard.draw();
      $('quizFeedback').innerHTML = '<div class="feedback bad">❌ 아쉬워요. 다시 생각해 보세요! 막히면 💡 힌트를 눌러 보세요.</div>';
    }
  }
  $('quizHint').addEventListener('click', () => {
    if (qSolved) return;
    const q = QUIZ[qi];
    const pts = q.hint || q.answers;
    quizBoard.marks = pts.map(([x, y]) => ({ x, y, type: 'ring' }));
    quizBoard.draw();
    $('quizFeedback').innerHTML = '<div class="feedback info">💡 파란 동그라미 근처를 살펴보세요.</div>';
  });
  $('quizRetry').addEventListener('click', () => loadQuiz(qi));
  $('quizPrev').addEventListener('click', () => loadQuiz(qi - 1));
  $('quizNext').addEventListener('click', () => loadQuiz(qi + 1));
  loadQuiz(0);

  // ── ⑤ 컴퓨터와 연습 ──
  const aiBoard = new OmokBoard($('aiBoard'), { size: 15, onPlace: humanMove });
  let aiMoves = [], myColor = 1, over = false, aiTimer = null;
  const aiTurn = () => (aiMoves.length % 2 === 0 ? 1 : 2);

  function aiNew() {
    clearTimeout(aiTimer);
    aiMoves = []; over = false;
    myColor = Number($('aiColor').value);
    aiRender();
    if (myColor === 2) aiTimer = setTimeout(computerMove, 400);
  }
  function aiPlace(x, y) {
    aiMoves.push([x, y]);
    const st = new Array(225).fill(0);
    aiMoves.forEach(([mx, my], i) => { st[my * 15 + mx] = i % 2 === 0 ? 1 : 2; });
    const c = st[y * 15 + x];
    const line = findWin(st, 15, x, y, c);
    if (line) { over = true; aiBoard.winLine = line; }
    else if (aiMoves.length === 225) over = true;
  }
  function humanMove(x, y) {
    if (over || aiTurn() !== myColor) return;
    aiPlace(x, y);
    aiRender();
    if (!over) aiTimer = setTimeout(computerMove, 350);
  }
  function computerMove() {
    if (over || aiTurn() === myColor) return;
    const [x, y] = AI.choose(aiBoard.stones, 15, 3 - myColor, $('aiLevel').value);
    aiPlace(x, y);
    aiRender();
  }
  function aiRender() {
    if (!over) aiBoard.winLine = null;
    aiBoard.marks = [];
    aiBoard.setMoves(aiMoves);
    const mine = !over && aiTurn() === myColor;
    aiBoard.setInteractive(mine, myColor);
    const msg = $('aiMsg');
    msg.className = 'turn-msg' + (mine ? ' mine' : '');
    if (over) {
      const winner = aiBoard.winLine ? 3 - aiTurn() : 0;
      msg.textContent = winner === myColor ? '🎉 이겼어요! 대단해요!' : winner ? '😢 컴퓨터가 이겼어요. 무르기로 다시 해 보세요!' : '🤝 무승부예요.';
    } else msg.textContent = mine ? '👉 내 차례예요' : '컴퓨터가 생각 중…';
    showWarnings();
  }
  function showWarnings() {
    const box = $('aiWarnBox');
    box.innerHTML = '';
    if (over || !$('aiWarn').checked || aiTurn() !== myColor) return;
    const cand = AI.evaluate(aiBoard.stones, 15, 3 - myColor);
    const five = cand.filter((c) => c.a >= 1e6);
    const four = cand.filter((c) => c.a >= 1e5 && c.a < 1e6);
    if (five.length) {
      aiBoard.marks = five.map((c) => dot(c.x, c.y, RED));
      box.innerHTML = '<div class="feedback bad">⚠ 컴퓨터가 4개를 만들었어요! 빨간 점을 막지 않으면 져요.</div>';
    } else if (four.length) {
      aiBoard.marks = four.map((c) => dot(c.x, c.y, '#d97706'));
      box.innerHTML = '<div class="feedback info">⚠ 컴퓨터에게 열린 3이 있어요. 주황 점 중 한 곳을 막는 게 좋아요.</div>';
    }
    aiBoard.draw();
  }
  $('aiNew').addEventListener('click', aiNew);
  $('aiLevel').addEventListener('change', aiNew);
  $('aiColor').addEventListener('change', aiNew);
  $('aiWarn').addEventListener('change', aiRender);
  $('aiUndo').addEventListener('click', () => {
    clearTimeout(aiTimer);
    if (!aiMoves.length) return;
    aiMoves.pop();
    while (aiMoves.length && aiTurn() !== myColor) aiMoves.pop();
    over = false; aiBoard.winLine = null;
    aiRender();
    if (aiTurn() !== myColor) aiTimer = setTimeout(computerMove, 400);
  });
  $('aiHint').addEventListener('click', () => {
    if (over || aiTurn() !== myColor) return;
    const [x, y] = AI.choose(aiBoard.stones, 15, myColor, 'normal');
    aiBoard.marks = [...aiBoard.marks, { x, y, type: 'ring', color: GREEN }];
    aiBoard.draw();
  });
  aiNew();
})();
