/* 공통: 오목판 그리기, 승리 판정, 연습용 AI, 대진표/순위표 그리기 */
(function (global) {
  'use strict';

  const DIRS = [[1, 0], [0, 1], [1, 1], [1, -1]];

  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  const REASONS = {
    five: '오목 완성', timeout: '시간 초과', resign: '기권', disconnect: '연결 끊김',
    teacher: '선생님 판정', kick: '퇴장', full: '판이 가득 참', cancel: '무효 처리',
  };

  function findWin(stones, size, x, y, c) {
    for (const [dx, dy] of DIRS) {
      const line = [[x, y]];
      for (const s of [1, -1]) {
        let cx = x + dx * s, cy = y + dy * s;
        while (cx >= 0 && cy >= 0 && cx < size && cy < size && stones[cy * size + cx] === c) {
          line.push([cx, cy]);
          cx += dx * s; cy += dy * s;
        }
      }
      if (line.length >= 5) return line;
    }
    return null;
  }

  // ───────────── 오목판 (canvas) ─────────────
  class OmokBoard {
    constructor(canvas, opts = {}) {
      this.canvas = canvas;
      this.ctx = canvas.getContext('2d');
      this.size = opts.size || 15;
      this.onPlace = opts.onPlace || null;
      this.confirmTouch = opts.confirmTouch !== false;
      this.interactive = false;
      this.nextColor = 1;
      this.showNumbers = false;
      this.clear(false);

      canvas.style.touchAction = 'manipulation';
      canvas.addEventListener('pointerdown', (e) => { this._ptype = e.pointerType; });
      canvas.addEventListener('pointermove', (e) => {
        if (!this.interactive || e.pointerType !== 'mouse') return;
        const c = this._cell(e);
        if (!same(c, this.hover)) { this.hover = c; this.draw(); }
      });
      canvas.addEventListener('pointerleave', () => { if (this.hover) { this.hover = null; this.draw(); } });
      canvas.addEventListener('click', (e) => this._click(e));

      if (global.ResizeObserver) new ResizeObserver(() => this.resize()).observe(canvas);
      global.addEventListener('resize', () => this.resize());
      this.resize();
    }

    clear(redraw = true) {
      this.stones = new Array(this.size * this.size).fill(0);
      this.order = new Array(this.size * this.size).fill(0);
      this.last = null; this.winLine = null; this.marks = []; this.hover = null; this.pending = null;
      if (redraw) this.draw();
    }

    setMoves(moves, upto = moves.length) {
      this.stones.fill(0); this.order.fill(0);
      for (let i = 0; i < upto && i < moves.length; i++) {
        const [x, y] = moves[i];
        this.stones[y * this.size + x] = i % 2 === 0 ? 1 : 2;
        this.order[y * this.size + x] = i + 1;
      }
      this.last = upto > 0 ? moves[upto - 1] : null;
      if (this.pending && this.stones[this.pending[1] * this.size + this.pending[0]]) this.pending = null;
      this.draw();
    }

    setStones(list) { // [{x,y,c}]
      this.stones.fill(0); this.order.fill(0);
      for (const s of list) this.stones[s.y * this.size + s.x] = s.c;
      this.draw();
    }

    get(x, y) { return this.stones[y * this.size + x]; }

    setInteractive(on, color) {
      this.interactive = on;
      if (color) this.nextColor = color;
      if (!on) { this.hover = null; this.pending = null; }
      this.canvas.style.cursor = on ? 'pointer' : 'default';
      this.draw();
    }

    resize() {
      const dpr = global.devicePixelRatio || 1;
      const w = Math.round(this.canvas.clientWidth * dpr);
      if (w && w !== this.canvas.width) { this.canvas.width = w; this.canvas.height = w; }
      this.draw();
    }

    _cell(e) {
      const r = this.canvas.getBoundingClientRect();
      const g = r.width / (this.size + 1);
      const x = Math.round((e.clientX - r.left) / g - 1), y = Math.round((e.clientY - r.top) / g - 1);
      if (x < 0 || y < 0 || x >= this.size || y >= this.size) return null;
      return [x, y];
    }

    _click(e) {
      if (!this.interactive) return;
      const c = this._cell(e);
      if (!c || this.get(c[0], c[1])) return;
      // 태블릿·휴대폰: 같은 자리를 한 번 더 눌러야 착수 (실수 방지)
      if (this.confirmTouch && this._ptype && this._ptype !== 'mouse') {
        if (same(c, this.pending)) { this.pending = null; this.draw(); this.onPlace && this.onPlace(c[0], c[1]); }
        else { this.pending = c; this.draw(); }
        return;
      }
      this.hover = null;
      this.onPlace && this.onPlace(c[0], c[1]);
    }

    _stars() {
      if (this.size === 15) return [[3, 3], [11, 3], [3, 11], [11, 11], [7, 7]];
      if (this.size === 9) return [[2, 2], [6, 2], [2, 6], [6, 6], [4, 4]];
      const m = Math.floor(this.size / 2);
      return [[m, m]];
    }

    _pos(x, y) { return [this.gap * (x + 1), this.gap * (y + 1)]; }

    _stone(x, y, c, alpha = 1) {
      const ctx = this.ctx, [cx, cy] = this._pos(x, y), r = this.gap * 0.46;
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.shadowColor = 'rgba(0,0,0,.35)';
      ctx.shadowBlur = r * 0.35; ctx.shadowOffsetX = r * 0.08; ctx.shadowOffsetY = r * 0.12;
      const grd = ctx.createRadialGradient(cx - r * 0.35, cy - r * 0.35, r * 0.1, cx, cy, r);
      if (c === 1) { grd.addColorStop(0, '#6a6a6a'); grd.addColorStop(1, '#0d0d0d'); }
      else { grd.addColorStop(0, '#ffffff'); grd.addColorStop(1, '#d2d2d2'); }
      ctx.fillStyle = grd;
      ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }

    draw() {
      const ctx = this.ctx, W = this.canvas.width, n = this.size;
      if (!W) return;
      const g = (this.gap = W / (n + 1));

      const bg = ctx.createLinearGradient(0, 0, W, W);
      bg.addColorStop(0, '#f0ca8a'); bg.addColorStop(1, '#dcaa5e');
      ctx.fillStyle = bg; ctx.fillRect(0, 0, W, W);

      ctx.strokeStyle = 'rgba(70,45,10,.8)';
      ctx.lineWidth = Math.max(1, W / 650);
      ctx.beginPath();
      for (let i = 0; i < n; i++) {
        const p = g * (i + 1);
        ctx.moveTo(g, p); ctx.lineTo(g * n, p);
        ctx.moveTo(p, g); ctx.lineTo(p, g * n);
      }
      ctx.stroke();
      ctx.fillStyle = 'rgba(70,45,10,.9)';
      for (const [x, y] of this._stars()) {
        const [cx, cy] = this._pos(x, y);
        ctx.beginPath(); ctx.arc(cx, cy, Math.max(2, g * 0.12), 0, Math.PI * 2); ctx.fill();
      }

      for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
        const c = this.stones[y * n + x];
        if (c) this._stone(x, y, c);
      }

      if (this.showNumbers) {
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.font = `bold ${Math.round(g * 0.4)}px system-ui, sans-serif`;
        for (let i = 0; i < n * n; i++) {
          if (!this.order[i]) continue;
          const [cx, cy] = this._pos(i % n, Math.floor(i / n));
          ctx.fillStyle = this.stones[i] === 1 ? '#fff' : '#111';
          ctx.fillText(String(this.order[i]), cx, cy + 1);
        }
      }

      if (this.last && !this.showNumbers) {
        const [cx, cy] = this._pos(this.last[0], this.last[1]);
        ctx.fillStyle = '#e53935';
        ctx.beginPath(); ctx.arc(cx, cy, g * 0.13, 0, Math.PI * 2); ctx.fill();
      }

      if (this.winLine && this.winLine.length) {
        const pts = [...this.winLine].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
        const [x1, y1] = this._pos(...pts[0]), [x2, y2] = this._pos(...pts[pts.length - 1]);
        ctx.save();
        ctx.strokeStyle = 'rgba(229,57,53,.75)'; ctx.lineWidth = g * 0.18; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
        ctx.restore();
      }

      for (const m of this.marks) this._mark(m);

      if (this.interactive) {
        const h = this.pending || this.hover;
        if (h && !this.get(h[0], h[1])) {
          this._stone(h[0], h[1], this.nextColor, this.pending ? 0.75 : 0.4);
          if (this.pending) {
            const [cx, cy] = this._pos(h[0], h[1]);
            ctx.strokeStyle = '#1e6ae1'; ctx.lineWidth = g * 0.08;
            ctx.beginPath(); ctx.arc(cx, cy, g * 0.52, 0, Math.PI * 2); ctx.stroke();
          }
        }
      }
    }

    _mark(m) {
      const ctx = this.ctx, g = this.gap, [cx, cy] = this._pos(m.x, m.y);
      const color = m.color || '#1e6ae1';
      ctx.save();
      ctx.strokeStyle = color; ctx.fillStyle = color; ctx.lineWidth = g * 0.09; ctx.lineCap = 'round';
      if (m.type === 'x') {
        const r = g * 0.25;
        ctx.beginPath(); ctx.moveTo(cx - r, cy - r); ctx.lineTo(cx + r, cy + r); ctx.moveTo(cx + r, cy - r); ctx.lineTo(cx - r, cy + r); ctx.stroke();
      } else if (m.type === 'ring') {
        ctx.beginPath(); ctx.arc(cx, cy, g * 0.5, 0, Math.PI * 2); ctx.stroke();
      } else if (m.type === 'text') {
        ctx.beginPath(); ctx.arc(cx, cy, g * 0.36, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.font = `bold ${Math.round(g * 0.42)}px system-ui, sans-serif`;
        ctx.fillText(m.text, cx, cy + 1);
      } else {
        ctx.globalAlpha = 0.85;
        ctx.beginPath(); ctx.arc(cx, cy, g * 0.2, 0, Math.PI * 2); ctx.fill();
      }
      ctx.restore();
    }
  }

  const same = (a, b) => !!a && !!b && a[0] === b[0] && a[1] === b[1];

  // ───────────── 연습용 컴퓨터 ─────────────
  function shapeScore(n, open) {
    if (n >= 5) return 1e6;
    if (open === 0) return 0;
    if (n === 4) return open === 2 ? 1e5 : 1.2e4;
    if (n === 3) return open === 2 ? 6e3 : 600;
    if (n === 2) return open === 2 ? 250 : 40;
    return open === 2 ? 12 : 4;
  }

  function pointScore(st, size, x, y, c) {
    let total = 0;
    for (const [dx, dy] of DIRS) {
      let count = 1, open = 0;
      for (const s of [1, -1]) {
        let cx = x + dx * s, cy = y + dy * s;
        while (cx >= 0 && cy >= 0 && cx < size && cy < size && st[cy * size + cx] === c) { count++; cx += dx * s; cy += dy * s; }
        if (cx >= 0 && cy >= 0 && cx < size && cy < size && st[cy * size + cx] === 0) open++;
      }
      total += shapeScore(count, open);
    }
    return total;
  }

  function nearStone(st, size, x, y, d) {
    for (let yy = Math.max(0, y - d); yy <= Math.min(size - 1, y + d); yy++)
      for (let xx = Math.max(0, x - d); xx <= Math.min(size - 1, x + d); xx++)
        if (st[yy * size + xx]) return true;
    return false;
  }

  const AI = {
    evaluate(st, size, color) {
      const opp = 3 - color, list = [];
      for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
        if (st[y * size + x] || !nearStone(st, size, x, y, 2)) continue;
        const a = pointScore(st, size, x, y, color), d = pointScore(st, size, x, y, opp);
        list.push({ x, y, a, d, s: a * 1.1 + d });
      }
      return list.sort((p, q) => q.s - p.s);
    },
    choose(st, size, color, level = 'normal') {
      const cand = this.evaluate(st, size, color);
      const mid = Math.floor(size / 2);
      if (!cand.length) return st[mid * size + mid] ? [mid + 1, mid] : [mid, mid];
      const win = cand.find((c) => c.a >= 1e6);
      if (win) return [win.x, win.y];
      if (level === 'easy') {
        const block = cand.find((c) => c.d >= 1e6);
        if (block && Math.random() < 0.75) return [block.x, block.y];
        const top = cand.slice(0, 6);
        const p = top[Math.floor(Math.random() * top.length)];
        return [p.x, p.y];
      }
      const best = cand[0].s;
      const ties = cand.filter((c) => c.s >= best * 0.97);
      const p = ties[Math.floor(Math.random() * ties.length)];
      return [p.x, p.y];
    },
  };

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

  global.Omok = { esc, REASONS, findWin, OmokBoard, AI, roundName, renderStandings, renderBracket, toast, fmtTime, randomToken, store };
})(window);
