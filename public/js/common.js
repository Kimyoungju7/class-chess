/* 공통: 체스판 그리기, 대진표/순위표 그리기 */
(function (global) {
  'use strict';

  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  const REASONS = {
    checkmate: '체크메이트', stalemate: '스테일메이트', insufficient: '잡을 말이 부족함',
    repetition: '같은 모양 3번 반복', fifty: '50수 규칙',
    timeout: '시간 초과', resign: '기권', disconnect: '연결 끊김',
    teacher: '선생님 판정', kick: '퇴장', cancel: '무효 처리',
  };

  // ───────────── 체스판 (canvas) ─────────────
  // 판 배열은 64칸, 0번이 a8(왼쪽 위)이고 63번이 h1. 말은 FEN 글자(대문자 = 백, 소문자 = 흑).
  // 규칙 판정은 서버(chess.js)가 하고, 여기서는 받은 수를 판에 옮겨 그리기만 한다.
  const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w';
  const FILES = 'abcdefgh';
  const sqIndex = (sq) => (8 - Number(sq[1])) * 8 + FILES.indexOf(sq[0]);
  const sqName = (i) => FILES[i % 8] + (8 - Math.floor(i / 8));
  const GLYPH = { k: '♚', q: '♛', r: '♜', b: '♝', n: '♞', p: '♟' };

  function parsePlacement(fen) {
    const cells = [];
    for (const ch of fen.split(' ')[0].replace(/\//g, '')) {
      if (/\d/.test(ch)) for (let i = 0; i < Number(ch); i++) cells.push('');
      else cells.push(ch);
    }
    return cells;
  }

  // 서버가 이미 검사한 수(예: e2e4, e7e8q)를 판에 옮긴다. 캐슬링·앙파상·프로모션도 함께 반영한다.
  function applyMove(cells, uci) {
    const f = sqIndex(uci.slice(0, 2)), t = sqIndex(uci.slice(2, 4));
    const piece = cells[f], kind = piece.toLowerCase(), white = piece === piece.toUpperCase();
    const df = (t % 8) - (f % 8);
    if (kind === 'p' && df !== 0 && !cells[t]) cells[Math.floor(f / 8) * 8 + (t % 8)] = ''; // 앙파상
    if (kind === 'k' && Math.abs(df) === 2) { // 캐슬링: 룩도 함께 옮긴다
      const row = Math.floor(f / 8) * 8;
      const [rf, rt] = df > 0 ? [7, 5] : [0, 3];
      cells[row + rt] = cells[row + rf]; cells[row + rf] = '';
    }
    const promo = uci[4];
    cells[t] = promo ? (white ? promo.toUpperCase() : promo) : piece;
    cells[f] = '';
  }

  // 프로모션 고르기 창. 고르면 done('q'|'r'|'b'|'n'), 취소하면 done(null). 닫는 함수를 돌려준다.
  const PROMOS = [['q', '퀸'], ['r', '룩'], ['b', '비숍'], ['n', '나이트']];
  function pickPromotion(white, done) {
    const box = document.createElement('div');
    box.className = 'modal';
    box.innerHTML = `<div class="promo-box">
      <h3>폰이 무엇으로 변신할까요?</h3>
      <div class="promo-list">${PROMOS.map(([p, n]) =>
        `<button class="promo-btn" data-p="${p}"><span class="piece ${white ? 'w' : 'b'}">${GLYPH[p]}&#xFE0E;</span>${n}</button>`).join('')}</div>
      <button class="btn small ghost" data-p="">취소</button>
    </div>`;
    let closed = false;
    const close = (p) => { if (closed) return; closed = true; box.remove(); done(p); };
    box.addEventListener('click', (e) => {
      const b = e.target.closest('[data-p]');
      if (b) close(b.dataset.p || null);
      else if (e.target === box) close(null);
    });
    document.body.appendChild(box);
    return () => close(null);
  }

  class ChessBoard {
    constructor(canvas, opts = {}) {
      this.canvas = canvas;
      this.ctx = canvas.getContext('2d');
      this.onMove = opts.onMove || null;
      this.flipped = !!opts.flipped;
      this.coords = opts.coords !== false;
      this.interactive = false;
      this.legal = [];        // 지금 둘 수 있는 수 목록 (서버가 보내 줌)
      this.selected = null;   // 고른 말의 칸 이름
      this.check = false;     // 둘 차례인 쪽 킹이 체크 상태인지
      this.marks = [];        // 설명용 표시 [{sq, type: 'dot'|'ring'|'x'|'king', color}]
      this.setPosition(START, false);

      canvas.style.touchAction = 'manipulation';
      canvas.addEventListener('pointermove', (e) => {
        if (!this.interactive || e.pointerType !== 'mouse') return;
        const sq = this._square(e);
        const can = sq && (this.legal.some((m) => m.startsWith(sq)) || (this.selected && this._find(this.selected, sq)));
        canvas.style.cursor = can ? 'pointer' : 'default';
      });
      canvas.addEventListener('click', (e) => this._click(e));

      if (global.ResizeObserver) new ResizeObserver(() => this.resize()).observe(canvas);
      global.addEventListener('resize', () => this.resize());
      this.resize();
    }

    setPosition(fen, redraw = true) {
      this.cells = parsePlacement(fen);
      this.whiteToMove = fen.split(' ')[1] !== 'b';
      this.last = null;
      if (redraw) this.draw();
    }

    setMoves(moves, upto = moves.length) {
      this.cells = parsePlacement(START);
      const n = Math.min(upto, moves.length);
      for (let i = 0; i < n; i++) applyMove(this.cells, moves[i]);
      this.whiteToMove = n % 2 === 0;
      this.last = n > 0 ? moves[n - 1] : null;
      this.draw();
    }

    setLegal(list) {
      this.legal = list || [];
      if (this.selected && !this.legal.some((m) => m.startsWith(this.selected))) this.selected = null;
      this.draw();
    }

    setInteractive(on) {
      this.interactive = on;
      if (!on) {
        this.selected = null;
        if (this._closePicker) this._closePicker(); // 고르는 중에 경기가 끝나거나 시간이 지나면 닫는다
      }
      this.canvas.style.cursor = 'default';
      this.draw();
    }

    resize() {
      const dpr = global.devicePixelRatio || 1;
      const w = Math.round(this.canvas.clientWidth * dpr);
      if (w && w !== this.canvas.width) { this.canvas.width = w; this.canvas.height = w; }
      this.draw();
    }

    _find(from, to) { return this.legal.find((m) => m.startsWith(from + to)); }

    // 화면의 칸(col, row: 왼쪽 위가 0,0) ↔ 칸 이름
    _toSq(col, row) { return this.flipped ? FILES[7 - col] + (row + 1) : FILES[col] + (8 - row); }
    _toCell(sq) {
      const c = FILES.indexOf(sq[0]), r = Number(sq[1]);
      return this.flipped ? [7 - c, r - 1] : [c, 8 - r];
    }

    _square(e) {
      const r = this.canvas.getBoundingClientRect();
      const k = r.width / this.canvas.width;
      const col = Math.floor(((e.clientX - r.left) / k - this.m) / this.s);
      const row = Math.floor(((e.clientY - r.top) / k - this.m) / this.s);
      if (col < 0 || row < 0 || col > 7 || row > 7) return null;
      return this._toSq(col, row);
    }

    _click(e) {
      if (!this.interactive) return;
      const sq = this._square(e);
      if (!sq) return;
      const mv = this.selected && this._find(this.selected, sq);
      if (mv) {
        const from = this.selected;
        if (mv.length > 4) { // 프로모션: 무엇으로 변신할지 고른 뒤에 둔다
          const white = this.cells[sqIndex(from)] === this.cells[sqIndex(from)].toUpperCase();
          this._closePicker = pickPromotion(white, (p) => {
            this._closePicker = null;
            if (p && this.interactive && this.selected === from) this._send(from, sq, p);
            else { this.selected = null; this.draw(); }
          });
          return;
        }
        this._send(from, sq);
        return;
      }
      this.selected = sq !== this.selected && this.legal.some((m) => m.startsWith(sq)) ? sq : null;
      this.draw();
    }

    _send(from, to, promotion) {
      this.selected = null;
      this.interactive = false; // 응답이 올 때까지 다시 두지 못하게
      this.draw();
      if (this.onMove) this.onMove(from, to, promotion);
    }

    _rect(sq) {
      const [c, r] = this._toCell(sq);
      return [this.m + c * this.s, this.m + r * this.s];
    }

    _fillSq(sq, color) {
      const [x, y] = this._rect(sq);
      this.ctx.fillStyle = color;
      this.ctx.fillRect(x, y, this.s, this.s);
    }

    // 말은 오목돌처럼 둥근 돌 위에 기호를 얹어 그린다.
    _piece(sq, p) {
      const ctx = this.ctx, [x, y] = this._rect(sq), s = this.s;
      const cx = x + s / 2, cy = y + s / 2, r = s * 0.42;
      const white = p === p.toUpperCase();
      ctx.save();
      ctx.shadowColor = 'rgba(0,0,0,.35)';
      ctx.shadowBlur = r * 0.35; ctx.shadowOffsetX = r * 0.08; ctx.shadowOffsetY = r * 0.12;
      const grd = ctx.createRadialGradient(cx - r * 0.35, cy - r * 0.35, r * 0.1, cx, cy, r);
      if (white) { grd.addColorStop(0, '#ffffff'); grd.addColorStop(1, '#d2d2d2'); }
      else { grd.addColorStop(0, '#6a6a6a'); grd.addColorStop(1, '#0d0d0d'); }
      ctx.fillStyle = grd;
      ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
      ctx.fillStyle = white ? '#26221c' : '#f5f1e8';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.font = `${Math.round(s * 0.56)}px "Segoe UI Symbol", "Noto Sans Symbols 2", "Apple Symbols", "DejaVu Sans", serif`;
      ctx.fillText(GLYPH[p.toLowerCase()] + '︎', cx, cy + s * 0.03);
    }

    _kingSq(white) {
      const i = this.cells.indexOf(white ? 'K' : 'k');
      return i < 0 ? null : sqName(i);
    }

    draw() {
      const ctx = this.ctx, W = this.canvas.width;
      if (!W) return;
      const m = (this.m = this.coords ? W * 0.055 : W * 0.02);
      const s = (this.s = (W - m * 2) / 8);

      // 나무판 (오목판과 같은 색)
      const bg = ctx.createLinearGradient(0, 0, W, W);
      bg.addColorStop(0, '#f0ca8a'); bg.addColorStop(1, '#dcaa5e');
      ctx.fillStyle = bg; ctx.fillRect(0, 0, W, W);

      for (let row = 0; row < 8; row++) for (let col = 0; col < 8; col++) {
        ctx.fillStyle = (row + col) % 2 ? 'rgba(122,78,28,.55)' : 'rgba(255,240,205,.55)';
        ctx.fillRect(m + col * s, m + row * s, s, s);
      }
      ctx.strokeStyle = 'rgba(70,45,10,.8)';
      ctx.lineWidth = Math.max(1, W / 400);
      ctx.strokeRect(m, m, s * 8, s * 8);

      if (this.coords) {
        ctx.fillStyle = 'rgba(70,45,10,.85)';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.font = `bold ${Math.round(m * 0.6)}px system-ui, sans-serif`;
        for (let i = 0; i < 8; i++) {
          const sq = this._toSq(i, i);
          ctx.fillText(sq[0], m + (i + 0.5) * s, W - m / 2);
          ctx.fillText(sq[1], m / 2, m + (i + 0.5) * s);
        }
      }

      if (this.last) {
        this._fillSq(this.last.slice(0, 2), 'rgba(255,214,10,.38)');
        this._fillSq(this.last.slice(2, 4), 'rgba(255,214,10,.5)');
      }
      if (this.selected) this._fillSq(this.selected, 'rgba(30,106,225,.38)');

      // 체크: 둘 차례인 쪽 킹 칸을 빨갛게
      const kings = this.marks.filter((k) => k.type === 'king').map((k) => k.sq);
      if (this.check) { const k = this._kingSq(this.whiteToMove); if (k) kings.push(k); }
      for (const k of kings) {
        const [x, y] = this._rect(k);
        const grd = ctx.createRadialGradient(x + s / 2, y + s / 2, s * 0.1, x + s / 2, y + s / 2, s * 0.72);
        grd.addColorStop(0, 'rgba(229,57,53,.95)'); grd.addColorStop(1, 'rgba(229,57,53,0)');
        ctx.fillStyle = grd; ctx.fillRect(x, y, s, s);
      }

      this.cells.forEach((p, i) => { if (p) this._piece(sqName(i), p); });

      // 고른 말이 갈 수 있는 칸: 빈칸은 점, 잡을 수 있는 칸은 고리
      const targets = this.selected
        ? this.legal.filter((mv) => mv.startsWith(this.selected)).map((mv) => ({ sq: mv.slice(2, 4) }))
        : [];
      for (const t of [...targets, ...this.marks]) this._mark(t);
    }

    _mark(mk) {
      if (mk.type === 'king') return;
      const ctx = this.ctx, s = this.s, [x, y] = this._rect(mk.sq);
      const cx = x + s / 2, cy = y + s / 2;
      const color = mk.color || '#1e6ae1';
      const occupied = !!this.cells[sqIndex(mk.sq)];
      ctx.save();
      ctx.strokeStyle = color; ctx.fillStyle = color; ctx.lineCap = 'round';
      if (mk.type === 'x') {
        const r = s * 0.22;
        ctx.lineWidth = s * 0.09;
        ctx.beginPath(); ctx.moveTo(cx - r, cy - r); ctx.lineTo(cx + r, cy + r); ctx.moveTo(cx + r, cy - r); ctx.lineTo(cx - r, cy + r); ctx.stroke();
      } else if (mk.type === 'ring' || occupied) {
        ctx.lineWidth = s * 0.08;
        ctx.beginPath(); ctx.arc(cx, cy, s * 0.46, 0, Math.PI * 2); ctx.stroke();
      } else {
        ctx.globalAlpha = 0.85;
        ctx.beginPath(); ctx.arc(cx, cy, s * 0.16, 0, Math.PI * 2); ctx.fill();
      }
      ctx.restore();
    }
  }

  // ───────────── 대회 화면 ─────────────
  function roundName(R, r) {
    const n = 2 ** (R - r + 1);
    return n === 2 ? '결승' : n === 4 ? '4강' : `${n}강`;
  }

  function renderStandings(el, comp, meId) {
    el.innerHTML = comp.groups.map((g) => `
      <div class="standing">
        <h4>${g.name === '전체' ? '리그 순위' : esc(g.name) + ' 순위'}</h4>
        <div class="table-scroll"><table class="table">
          <thead><tr><th>순위</th><th class="left">이름</th><th>경기</th><th>승</th><th>무</th><th>패</th><th>승점</th></tr></thead>
          <tbody>${g.standings.map((r, i) => `
            <tr class="${r.id === meId ? 'me' : ''}">
              <td>${i === 0 && r.played ? '🥇' : i === 1 && r.played ? '🥈' : i === 2 && r.played ? '🥉' : i + 1}</td>
              <td class="left">${esc(r.name)}</td><td>${r.played}</td><td>${r.w}</td><td>${r.d}</td><td>${r.l}</td><td><b>${r.pts}</b></td>
            </tr>`).join('')}</tbody>
        </table></div>
      </div>`).join('') + '<p class="muted small">승 3점 · 무 1점 · 패 0점, 승점이 같으면 승수가 많은 순서</p>';
  }

  function renderBracket(el, comp, meId) {
    const R = comp.rounds;
    const slot = (m, k) => {
      const id = m[k], name = m[k + 'Name'];
      let cls = 'b-slot';
      if (!id) return `<div class="${cls} empty">${m.bye && k === 'p2' ? '부전승' : '미정'}</div>`;
      if (m.status === 'done') cls += m.winner === id ? ' win' : ' lose';
      if (id === meId) cls += ' me';
      return `<div class="${cls}">${esc(name)}</div>`;
    };
    let html = '<div class="bracket">';
    for (let r = 1; r <= R; r++) {
      const ms = comp.matches.filter((m) => m.round === r).sort((a, b) => a.index - b.index);
      html += `<div class="b-round"><div class="b-title">${roundName(R, r)}</div><div class="b-matches">`;
      for (const m of ms) {
        html += `<div class="b-match ${m.status}" data-match="${m.id}">${slot(m, 'p1')}${slot(m, 'p2')}${m.status === 'playing' ? '<span class="b-live">경기 중</span>' : ''}</div>`;
      }
      html += '</div></div>';
    }
    html += `<div class="b-round"><div class="b-title">우승</div><div class="b-matches"><div class="b-champ">${comp.championName ? '🏆 ' + esc(comp.championName) : '?'}</div></div></div>`;
    el.innerHTML = html + '</div>';
  }

  function toast(msg, type = '') {
    let box = document.getElementById('toastBox');
    if (!box) { box = document.createElement('div'); box.id = 'toastBox'; document.body.appendChild(box); }
    const t = document.createElement('div');
    t.className = 'toast ' + type;
    t.textContent = msg;
    box.appendChild(t);
    setTimeout(() => t.classList.add('hide'), 2600);
    setTimeout(() => t.remove(), 3100);
  }

  const fmtTime = (ts) => {
    const d = new Date(ts);
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  };

  function randomToken() {
    let s = '';
    for (let i = 0; i < 24; i++) s += Math.floor(Math.random() * 36).toString(36);
    return s;
  }

  const store = {
    get(k) { try { return localStorage.getItem(k); } catch { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch { /* 저장 불가 환경 */ } },
    del(k) { try { localStorage.removeItem(k); } catch { /* 저장 불가 환경 */ } },
  };

  global.Omok = { esc, REASONS, ChessBoard, roundName, renderStandings, renderBracket, toast, fmtTime, randomToken, store };
})(window);
