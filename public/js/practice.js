// 게임 방법 ⑤ 연습 게임: 컴퓨터와 두는 연습 대국.
// 기록에 남지 않는 혼자 연습이라 서버를 거치지 않고, 브라우저에서 chess.js로 규칙을 판정한다.
import { Chess } from '/vendor/chess.js';

const { ChessBoard } = Omok;
const $ = (id) => document.getElementById(id);

const game = new Chess();
let myColor = 'w';
let thinking = false;
let aiTimer = null;

const board = new ChessBoard($('aiBoard'), { onMove: humanMove });

// ── 컴퓨터 ──
const VALUE = { p: 100, n: 320, b: 330, r: 500, q: 900, k: 0 };
const MATE = 100000;

// 둘 차례인 쪽 기준 점수: 말 점수 + 가운데로 나온 폰·나이트·비숍에 작은 보너스
function evaluate(g) {
  if (g.isCheckmate()) return -MATE;
  if (g.isDraw()) return 0;
  const me = g.turn();
  let score = 0;
  g.board().forEach((row, r) => row.forEach((p, c) => {
    if (!p) return;
    let v = VALUE[p.type];
    if (p.type === 'n' || p.type === 'b' || p.type === 'p') v += 12 - 3 * (Math.abs(3.5 - r) + Math.abs(3.5 - c));
    if (p.type === 'p') v += (p.color === 'w' ? 6 - r : r - 1) * 4; // 앞으로 나간 폰
    score += p.color === me ? v : -v;
  }));
  return score;
}

function negamax(g, depth, alpha, beta) {
  if (depth === 0 || g.isGameOver()) return evaluate(g) - (g.isCheckmate() ? depth : 0);
  for (const m of g.moves()) {
    g.move(m);
    const v = -negamax(g, depth - 1, -beta, -alpha);
    g.undo();
    if (v >= beta) return v;
    if (v > alpha) alpha = v;
  }
  return alpha;
}

function chooseMove(level) {
  const moves = game.moves({ verbose: true });
  if (level === 'easy' && Math.random() < 0.45) return moves[Math.floor(Math.random() * moves.length)];
  const depth = level === 'easy' ? 1 : 2;
  let best = null, bestScore = -Infinity;
  for (const m of moves) {
    game.move(m);
    const s = -negamax(game, depth - 1, -Infinity, Infinity) + Math.random() * 15; // 같은 점수면 골고루
    game.undo();
    if (s > bestScore) { bestScore = s; best = m; }
  }
  return best;
}

function computerMove() {
  if (game.isGameOver() || game.turn() === myColor) return;
  thinking = true;
  render();
  aiTimer = setTimeout(() => { // 판이 먼저 그려지고 나서 생각하도록
    aiTimer = null;
    const m = chooseMove($('aiLevel').value);
    if (m) game.move(m);
    thinking = false;
    render();
  }, 350);
}

// ── 사람 ──
function humanMove(from, to, promotion) {
  if (thinking || game.turn() !== myColor) return;
  try { game.move({ from, to, promotion }); } catch { render(); return; }
  render();
  computerMove();
}

// ── 화면 ──
function message() {
  const mine = game.turn() === myColor;
  if (game.isCheckmate()) return mine ? ['😢 체크메이트… 컴퓨터가 이겼어요', 'check'] : ['🎉 체크메이트! 내가 이겼어요', 'mine'];
  if (game.isStalemate()) return ['🤝 스테일메이트 · 무승부', ''];
  if (game.isInsufficientMaterial()) return ['🤝 잡을 말이 부족해서 무승부', ''];
  if (game.isThreefoldRepetition()) return ['🤝 같은 모양 3번 반복 · 무승부', ''];
  if (game.isDraw()) return ['🤝 50수 규칙 · 무승부', ''];
  if (thinking) return [game.inCheck() ? '체크! 컴퓨터가 피할 방법을 찾는 중…' : '컴퓨터가 생각하는 중…', ''];
  if (game.inCheck()) return ['⚠️ 체크! 킹을 지켜야 해요', 'check'];
  return ['👉 내 차례예요! 말을 움직이세요', 'mine'];
}

function render() {
  const myTurn = !thinking && !game.isGameOver() && game.turn() === myColor;
  board.flipped = myColor === 'b';
  board.check = game.inCheck();
  board.setMoves(game.history({ verbose: true }).map((m) => m.lan));
  board.setLegal(myTurn ? game.moves({ verbose: true }).map((m) => m.lan) : []);
  board.setInteractive(myTurn);
  const [text, cls] = message();
  $('aiMsg').className = 'turn-msg' + (cls ? ' ' + cls : '');
  $('aiMsg').textContent = text;
  $('aiUndo').disabled = thinking || game.history().length === 0;
}

function newGame() {
  clearTimeout(aiTimer); aiTimer = null; thinking = false;
  myColor = $('aiColor').value;
  game.reset();
  render();
  computerMove(); // 내가 흑이면 컴퓨터(백)가 먼저
}

$('aiNew').addEventListener('click', newGame);
$('aiColor').addEventListener('change', newGame);
$('aiUndo').addEventListener('click', () => {
  if (thinking) return;
  game.undo(); // 컴퓨터 수
  if (game.turn() !== myColor) game.undo(); // 내 수
  render();
  computerMove();
});

newGame();
