# CLAUDE.md

이 저장소는 **학급용 체스 대전 사이트**다(2026-10-02에 오목에서 체스로 바꿈). 교사 PC에서 Node 서버를 켜고, 같은 와이파이의 학생들이 브라우저로 접속하는 구조다.
사용자는 교사이고, 한국어로 소통한다. 화면 문구는 모두 초등·중학생 눈높이의 한국어로 쓴다.

## 실행
- `start.bat` 더블클릭. 처음이면 `npm install`을 자동 실행하고, 이어서 `node server.js`를 실행한다.
- 직접 실행: `npm start`
  - 포트: `PORT`, 기본 3000
  - 교사 비밀번호: `TEACHER_PIN`, 기본 `1234`
- 학생 화면은 `/student.html`, 교사 화면은 `/teacher.html`, 게임 방법은 `/tutorial.html`
- 서버 창에 학생 접속 주소가 출력되고, `/api/info`는 `{ publicUrl, addresses }`를 돌려준다.
  - `PUBLIC_URL` 또는 `RENDER_EXTERNAL_URL`(Render가 자동 설정)이 있으면 그 공개 주소를 쓰고, 없으면 LAN IP 목록을 쓴다.
  - 교사 화면은 공개 주소 → (localhost로 열었을 때만) LAN IP → `location.origin` 순서로 학생 접속 주소를 고른다.
- 배포: `render.yaml`(Render Blueprint, 무료 요금제). 저장소는 https://github.com/Kimyoungju7/class-chess (공개, `main` 브랜치). 오목 앱은 별도 폴더 `claude-test\omok`와 저장소 `class-omok`에 그대로 있다.

## 구조
| 파일 | 역할 |
|---|---|
| `server.js` | Express + Socket.IO. 모든 상태는 **메모리**에 둔다(players, games, queue, settings, competition). 매칭·대회 진행·판정을 모두 서버가 맡는다. 체스 규칙은 `chess.js`(`g.chess`)로 판정하고, `legalMoves`/`chessResult`에 모여 있다 |
| `public/js/common.js` | `window.Omok`(이름은 예전 그대로): `ChessBoard`(canvas 8×8 판, 말 선택→갈 수 있는 칸 표시→이동), `renderStandings`/`renderBracket`, `toast`, `store`(localStorage 래퍼). `ChessBoard.setMoves`는 서버가 검사한 수를 판에 옮겨 그리기만 한다(규칙 판정 없음) |
| `public/js/student.js` | 입장, 로비(자유 매칭/대회 상태), 대국, 결과 화면 |
| `public/js/teacher.js` | 실시간 관전, 학생 현황, 대회 운영, 기록 다시보기, CSV |
| `public/js/tutorial.js` | 기본 규칙, 말 6종의 움직임, 체크/체크메이트/스테일메이트, 캐슬링·프로모션·앙파상 (그림 설명만, 연습 대국 없음) |
| `public/css/style.css` | 모든 페이지가 함께 쓰는 스타일. 빌드 도구 없이 순수 HTML/JS |

### 주요 소켓 이벤트
- **학생 → 서버:** `student:join {name, token}`, `queue:join`, `queue:leave`, `game:move {from, to, promotion?}` (예: e2→e4), `game:resign`
- **서버 → 학생:** `lobby`(공개 상태), `game:update`(내 경기), `kicked`, `replaced`
- 경기 정보(`gameView`): `moves`는 UCI 문자열 목록(`e2e4`, `e7e8q`), `inCheck`, `legal`(지금 둘 수 있는 수 목록), `turn`(1 = 흑, 2 = 백)
- **교사 → 서버:** 먼저 `teacher:auth`로 인증한 뒤 `teacher:settings`, `teacher:startCompetition`, `teacher:closeCompetition`, `teacher:endGame`, `teacher:matchResult`, `teacher:kick`, `teacher:resetAll`
- **서버 → 교사:** `teacher:state`(공개 상태 + 진행 중 경기 + 기록)
- 상태 방송은 `broadcast()`가 120ms 단위로 묶어서 보낸다. 테스트에서 상태를 확인하기 전에는 약간 기다려야 한다.

### 게임·대회 규칙
- 8×8 표준 체스이고 **백이 먼저** 둔다(`turn: 2`로 시작). 색 번호는 오목 때와 같이 1 = 흑, 2 = 백이다.
- 체크메이트면 승리. 스테일메이트·기물 부족·3회 반복·50수 규칙이면 무승부(`reason`: `checkmate`, `stalemate`, `insufficient`, `repetition`, `fifty`).
- 프로모션은 클라이언트가 항상 퀸(`q`)을 보낸다. 고르는 화면은 아직 없다.
- 경기 중 연결이 끊기면 60초 동안 기다린 뒤 기권 처리한다. 새로고침하면 하던 경기로 돌아간다.
- 같은 이름은 한 명만 접속할 수 있다. 같은 이름으로 들어오면 토큰으로 본인인지 확인한다.
- 대회에서 경기가 끝나면 5초 쉬고 다음 경기를 자동 배정한다.
- **자유 매칭:** 대기자를 1.5초 모았다가 무작위로 짝짓는다. 입장하면 자동으로 대기열에 들어간다.
- **리그전:** 조를 나눌 수 있고 승점은 승 3·무 1·패 0이다. 대진은 원형 로빈 방식이다.
- **토너먼트:** 부전승은 1라운드 앞쪽 경기에 몰리고, 무승부면 재경기한다. 퇴장한 학생의 경기는 상대 부전승이다.
- 대회가 끝나도 교사가 "대회 닫기"를 눌러야 자유 매칭으로 돌아간다.

## 지금까지 한 작업 (2026-09-29 기준)
- 위 기능을 모두 구현했고 `README.md`에 교사용 사용법을 정리했다.
- 서버 로직은 socket.io-client 봇으로 끝까지 돌려서 통과했다.
  - 매칭, 중복 이름 차단
  - 리그 4명(6경기, 승점 합계)
  - 토너먼트 5명(3라운드, 부전승 3명, 우승자 결정)
  - 교사 판정, 내보내기, 초기화
  - 15초 시간 초과 패배, 재접속 복귀
- 모든 페이지와 정적 파일이 HTTP 200을 돌려주고, JS 문법 검사도 통과했다.
- 테스트 스크립트(`test.js`, `test2.js`)는 세션 임시 폴더(scratchpad)에 있어서 **이미 사라졌을 수 있다**. 저장소에는 테스트가 없다.

## 체스 전환 (2026-10-02)
- 접속·매칭·대회·교사 기능은 그대로 두고 규칙, 판, 게임 방법만 바꿨다.
- 봇 테스트 통과: 바보 메이트(흑 승), 체크 중 합법 수 제한, 스테일메이트(무승부), 프로모션, 차례가 아닐 때나 잘못된 수는 무시, 기권. 무작위 300판으로 `ChessBoard` 판 복원이 chess.js와 일치함을 확인했다(캐슬링, 앙파상, 프로모션 포함).
- localStorage 키(`omokToken` 등), `window.Omok` 이름은 바꾸지 않았다. 패키지 이름과 Render 서비스 이름은 `class-chess`로 바꿨다.

## 남은 할 일
1. **실제 브라우저 확인(가장 우선):** 화면을 브라우저로 직접 본 적이 없다.
   - PC 한 대와 태블릿 한 대로 확인한다: 판 크기, 말 기호(♚ 등) 글꼴 표시, 말 고르기→이동, 체크 표시, 결과창, 교사 모달, 대진표 가로 스크롤, 모바일 레이아웃
   - 사용자는 Claude in Chrome 설치를 거절했다. 브라우저 확인은 사용자에게 부탁하고, 이 확장을 다시 권하지 않는다.
2. **테스트 추가:** 봇 테스트를 `test/`로 옮기고 `socket.io-client`를 devDependency로 추가한다.
3. 선택 사항(사용자가 원할 때만):
   - 프로모션 때 퀸·룩·비숍·나이트 고르기
   - 게임 방법에 컴퓨터와 연습하기(클라이언트용 체스 엔진 필요)
   - 기록 영구 저장: Render 무료 요금제는 디스크가 유지되지 않으므로, 파일 저장이 아니라 외부 무료 DB가 필요하다
   - 학생 명단 미리 등록
4. Render 배포 자체(가입, Blueprint 연결)는 사용자가 직접 한다. 배포 후 실제 주소에서 동작 확인이 필요하다.

## 주의할 점
- **데이터는 메모리에만 있다.** 서버를 끄면 기록이 모두 사라지므로 교사에게 CSV 백업을 안내한다. Render 무료 요금제는 15분 동안 접속이 없으면 잠들고, 이때도 기록이 사라진다.
- **GitHub:** `gh`는 Bash PATH에 없다. `"C:\Program Files\GitHub CLI\gh.exe"`로 실행한다(로그인 계정 Kimyoungju7). 저장소가 공개이므로 비밀번호·학생 정보·`.env`를 커밋하지 않는다.
- **네트워크:** 학생과 교사 PC가 같은 네트워크에 있어야 한다. 처음 실행할 때 Windows 방화벽에서 Node를 허용해야 한다. 학교망이 기기끼리의 통신을 막으면 접속이 안 될 수 있다.
- **HTTP(비보안) 환경:** LAN 접속은 HTTP라서 `crypto.randomUUID` 같은 보안 컨텍스트 전용 API를 쓰면 안 된다. 토큰은 `Omok.randomToken()`을 쓴다. localStorage와 sessionStorage 접근은 항상 try/catch로 감싼다(`Omok.store`).
- **XSS 방지:** 학생 이름은 사용자가 입력한 값이다. innerHTML에 넣을 때는 반드시 `Omok.esc()`를 거친다.
- **교사 화면 재렌더링:** `teacher:state`를 받을 때마다 전체를 다시 그린다.
  - 확인이 필요한 버튼은 `armBtn`/`armActions`(두 번 눌러 확인) 방식을 써야 상태가 유지된다.
  - 대회 참가자 체크 상태는 `selected` Set에 보관한다.
- **OneDrive 경로:** 프로젝트 경로에 한글과 공백이 있다(`바탕 화면`). 셸 명령에서는 경로를 반드시 따옴표로 감싼다. `start.bat`은 `chcp 65001`과 `cd /d "%~dp0"`을 쓴다.
- **셸:** Windows 환경이다. Bash(Git Bash)와 PowerShell 5.1을 쓸 수 있으며 PowerShell에서는 `&&`를 쓸 수 없다.
- **서버 위치:** 서버 로직(매칭, 판정, 승패)은 반드시 서버에 둔다. 클라이언트는 표시와 입력만 맡는다. 착수 검증도 서버의 `game:move`에서 한다.
