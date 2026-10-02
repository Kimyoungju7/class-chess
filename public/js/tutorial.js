(function () {
  'use strict';
  const { ChessBoard } = Omok;
  const $ = (id) => document.getElementById(id);
  const RED = '#e53935';
  const FILES = 'abcdefgh';

  // ── 탭 ──
  function showTab(t) {
    document.querySelectorAll('#lessonTabs .tab').forEach((b) => b.classList.toggle('active', b.dataset.tab === t));
    document.querySelectorAll('[data-panel]').forEach((p) => { p.hidden = p.dataset.panel !== t; });
    window.scrollTo({ top: 0 });
  }
  $('lessonTabs').addEventListener('click', (e) => { const b = e.target.closest('.tab'); if (b) showTab(b.dataset.tab); });
  document.querySelectorAll('[data-go]').forEach((b) => b.addEventListener('click', () => showTab(b.dataset.go)));

  // 설명용 판: fen(말 배치) + 표시
  function mini(canvas, fen, marks = [], last = null) {
    const b = new ChessBoard(canvas);
    b.setPosition(fen, false);
    b.marks = marks;
    b.last = last;
    b.draw();
    return b;
  }

  function card(grid, id, title, html) {
    grid.insertAdjacentHTML('beforeend', `<div class="card"><canvas id="${id}"></canvas><h3>${title}</h3><p>${html}</p></div>`);
    return $(id);
  }

  // 빈 판에서 말이 갈 수 있는 칸 (설명 그림용). 같은 편 말 앞에서 멈추고, 상대 말은 잡을 수 있다.
  function reach(fen, sq, dirs, slide) {
    const cells = [];
    for (const ch of fen.split(' ')[0].replace(/\//g, '')) {
      if (/\d/.test(ch)) for (let i = 0; i < Number(ch); i++) cells.push('');
      else cells.push(ch);
    }
    const at = (f, r) => cells[(8 - r) * 8 + f];
    const white = (p) => p === p.toUpperCase();
    const me = at(FILES.indexOf(sq[0]), Number(sq[1]));
    const out = [];
    for (const [df, dr] of dirs) {
      let f = FILES.indexOf(sq[0]) + df, r = Number(sq[1]) + dr;
      while (f >= 0 && f < 8 && r >= 1 && r <= 8) {
        const p = at(f, r);
        if (p && white(p) === white(me)) break;
        out.push({ sq: FILES[f] + r });
        if (p || !slide) break;
        f += df; r += dr;
      }
    }
    return out;
  }
  const ROOK = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  const BISHOP = [[1, 1], [1, -1], [-1, 1], [-1, -1]];
  const KNIGHT = [[1, 2], [2, 1], [2, -1], [1, -2], [-1, -2], [-2, -1], [-2, 1], [-1, 2]];
  const x = (sq) => ({ sq, type: 'x', color: RED });

  // ── ① 처음 배치 ──
  mini($('startBoard'), 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR');
  const NAMES = [
    ['♚', '킹 (1개)', '가장 중요한 말! 잡히면 지는 것과 같아요.'],
    ['♛', '퀸 (1개)', '가장 강한 말이에요.'],
    ['♜', '룩 (2개)', '판의 네 귀퉁이에서 시작해요.'],
    ['♝', '비숍 (2개)', '킹과 퀸 옆에 하나씩 있어요.'],
    ['♞', '나이트 (2개)', '말 모양이에요. 다른 말을 뛰어넘을 수 있어요.'],
    ['♟', '폰 (8개)', '맨 앞줄에 늘어선 병사들이에요.'],
  ];
  $('pieceNames').innerHTML = NAMES.map(([g, n, t]) => `<li><span class="num">${g}&#xFE0E;</span><div><b>${n}</b> ${t}</div></li>`).join('');

  // ── ② 말의 움직임 ──
  const pg = $('pieceGrid');
  let fen = '8/8/8/8/4K3/8/8/8';
  mini(card(pg, 'pK', '♚ 킹', '<b>모든 방향으로 한 칸</b>씩 움직여요. 공격받는 칸으로는 갈 수 없어요.'), fen, reach(fen, 'e4', [...ROOK, ...BISHOP], false));
  fen = '8/8/8/8/3Q4/8/8/8';
  mini(card(pg, 'pQ', '♛ 퀸', '<b>가로·세로·대각선</b>으로 원하는 만큼 갈 수 있어요. 가장 강한 말이라 잃지 않도록 조심해요.'), fen, reach(fen, 'd4', [...ROOK, ...BISHOP], true));
  fen = '8/3p4/8/8/3R2P1/8/8/8';
  mini(card(pg, 'pR', '♜ 룩', '<b>가로·세로</b>로 원하는 만큼 가요. 다른 말을 뛰어넘을 수는 없어요. 내 말(g4) 앞에서 멈추고, 상대 말(d7)은 잡을 수 있어요.'), fen, reach(fen, 'd4', ROOK, true));
  fen = '8/8/8/8/3B4/8/8/8';
  mini(card(pg, 'pB', '♝ 비숍', '<b>대각선</b>으로 원하는 만큼 가요. 그래서 처음 시작한 칸과 <b>같은 색 칸</b>으로만 다녀요.'), fen, reach(fen, 'd4', BISHOP, true));
  fen = '8/8/8/3P4/2PNP3/3P4/8/8';
  mini(card(pg, 'pN', '♞ 나이트', '<b>L자 모양</b>(한 방향으로 두 칸 + 옆으로 한 칸)으로 움직여요. 체스에서 유일하게 <b>다른 말을 뛰어넘을 수</b> 있어요.'), fen, reach(fen, 'd4', KNIGHT, false));
  fen = '8/8/2p5/1P6/8/8/4P3/8';
  mini(card(pg, 'pP', '♟ 폰', '<b>앞으로 한 칸</b>씩 가요. 처음 움직일 때만 <b>두 칸</b>까지 갈 수 있어요. 잡을 때는 <b>대각선 앞 한 칸</b>의 말만 잡고, 뒤로는 못 가요.'), fen,
    [{ sq: 'e3' }, { sq: 'e4' }, { sq: 'b6' }, { sq: 'c6' }]);

  // ── ③ 체크·체크메이트·스테일메이트 ──
  const cg = $('checkGrid');
  mini(card(cg, 'cCheck', '체크', '백 룩이 흑 킹을 공격하고 있어요. 이것이 <b>체크</b>예요. 체크를 받으면 바로 피해야 해요.<br>① 킹을 안전한 칸으로 옮기기 ② 사이에 내 말을 놓아 막기 ③ 공격하는 말을 잡기<br>이 판에서 흑 킹은 파란 점으로 피할 수 있어요. e7은 룩이 지키고 있어서 갈 수 없어요.'),
    '4k3/8/8/8/8/8/8/K3R3 b', [{ sq: 'e8', type: 'king' }, { sq: 'd8' }, { sq: 'f8' }, { sq: 'd7' }, { sq: 'f7' }, x('e7')]);
  mini(card(cg, 'cMate', '체크메이트 → 승리!', '흑 킹이 체크를 받았어요. 옆 칸(f8, h8)은 백 룩이 지키고, 앞은 자기 폰이 막고 있어요. <b>피할 방법이 하나도 없으니 체크메이트!</b> 백이 이겨요.'),
    '4R1k1/5ppp/8/8/8/8/8/6K1 b', [{ sq: 'g8', type: 'king' }, x('f8'), x('h8')]);
  mini(card(cg, 'cStale', '스테일메이트 → 무승부', '흑 차례예요. 흑 킹은 체크가 아니지만, 갈 수 있는 칸(g8, g7, h7)을 모두 백 퀸이 지키고 있어요. 다른 말도 없어서 <b>움직일 수 있는 수가 없으니 무승부</b>예요.<br>이기고 있을 때는 상대 킹에게 도망칠 칸을 남겨 주며 체크메이트를 노려요!'),
    '7k/8/6Q1/8/8/8/8/K7 b', [x('g8'), x('g7'), x('h7')]);

  // ── ④ 특별한 규칙 ──
  const sg = $('specialGrid');
  mini(card(sg, 'sCastle', '캐슬링 (킹 지키기)', '킹과 룩이 <b>한 번도 움직이지 않았고</b>, 사이에 말이 없으면 한 번에 둘을 함께 움직일 수 있어요. 킹이 룩 쪽으로 <b>두 칸</b> 가고, 룩이 킹을 넘어 바로 옆에 와요.<br>킹이 체크를 받고 있거나, 지나가는 칸이 공격받고 있으면 할 수 없어요. 킹을 누르고 두 칸 옆 파란 점을 누르면 돼요.'),
    'r3k2r/8/8/8/8/8/8/R3K2R', [{ sq: 'g1' }, { sq: 'c1' }]);
  mini(card(sg, 'sPromo', '프로모션 (폰의 변신)', '폰이 상대 쪽 <b>맨 끝 줄</b>에 도착하면 퀸·룩·비숍·나이트 중 하나로 변신해요. <b>우리 사이트에서는 가장 강한 퀸으로 자동 변신</b>해요.'),
    '8/1P6/8/8/8/8/8/8', [{ sq: 'b8' }]);
  mini(card(sg, 'sEp', '앙파상 (지나가는 폰 잡기)', '상대 폰이 처음에 <b>두 칸</b> 움직여(노란 칸) 내 폰 바로 옆에 오면, <b>바로 다음 차례에만</b> 한 칸 움직인 것처럼 대각선으로 가서 잡을 수 있어요. 빨간 동그라미 폰이 잡혀요.'),
    '8/8/8/3pP3/8/8/8/8', [{ sq: 'd6' }, { sq: 'd5', type: 'ring', color: RED }], 'd7d5');
})();
