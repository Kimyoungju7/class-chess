# CLAUDE.md

이 저장소는 **학급용 오목 대전 사이트**다. 교사 PC에서 Node 서버를 켜고, 같은 와이파이의 학생들이 브라우저로 접속하는 구조다.
사용자는 교사이고, 한국어로 소통한다. 화면 문구는 모두 초등·중학생 눈높이의 한국어로 쓴다.

## 실행
- `start.bat` 더블클릭. 처음이면 `npm install`을 자동 실행하고, 이어서 `node server.js`를 실행한다.
- 직접 실행: `npm start`
  - 포트: `PORT`, 기본 3000
  - 교사 비밀번호: `TEACHER_PIN`, 기본 `1234`
- 학생 화면은 `/student.html`, 교사 화면은 `/teacher.html`, 게임 방법은 `/tutorial.html`
- 서버 창에 학생 접속 주소(LAN IP)가 출력되고, `/api/info`도 같은 주소 목록을 돌려준다.

## 구조
| 파일 | 역할 |
|---|---|
| `server.js` | Express + Socket.IO. 모든 상태는 **메모리**에 둔다(players, games, queue, settings, competition). 매칭·대회 진행·판정을 모두 서버가 맡는다 |
| `public/js/common.js` | `window.Omok`: `OmokBoard`(canvas 판), `findWin`, 연습용 `AI`, `renderStandings`/`renderBracket`, `toast`, `store`(localStorage 래퍼) |
| `public/js/student.js` | 입장, 로비(자유 매칭/대회 상태), 대국, 결과 화면 |
| `public/js/teacher.js` | 실시간 관전, 학생 현황, 대회 운영, 기록 다시보기, CSV |
| `public/js/tutorial.js` | 규칙, 17수 해설 시뮬레이션, 패턴 7종, 문제 6개, 컴퓨터와 연습 |
| `public/css/style.css` | 모든 페이지가 함께 쓰는 스타일. 빌드 도구 없이 순수 HTML/JS |

### 주요 소켓 이벤트
- **학생 → 서버:** `student:join {name, token}`, `queue:join`, `queue:leave`, `game:move {x,y}`, `game:resign`
- **서버 → 학생:** `lobby`(공개 상태), `game:update`(내 경기), `kicked`, `replaced`
- **교사 → 서버:** 먼저 `teacher:auth`로 인증한 뒤 `teacher:settings`, `teacher:startCompetition`, `teacher:closeCompetition`, `teacher:endGame`, `teacher:matchResult`, `teacher:kick`, `teacher:resetAll`
- **서버 → 교사:** `teacher:state`(공개 상태 + 진행 중 경기 + 기록)
- 상태 방송은 `broadcast()`가 120ms 단위로 묶어서 보낸다. 테스트에서 상태를 확인하기 전에는 약간 기다려야 한다.

### 게임·대회 규칙
- 판은 15×15이고 흑이 먼저 둔다. **5개 이상** 이으면 승리이며 금수는 없다(사용자와 합의한 우리 반 규칙).
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
- 게임 방법 시뮬레이션 수순은 17수째에 처음 5목이 되고 겹치는 자리가 없음을 확인했다. AI가 상대의 4를 막는 것도 확인했다.
- 모든 페이지와 정적 파일이 HTTP 200을 돌려주고, JS 문법 검사도 통과했다.
- 테스트 스크립트(`test.js`, `test2.js`)는 세션 임시 폴더(scratchpad)에 있어서 **이미 사라졌을 수 있다**. 저장소에는 테스트가 없다.

## 남은 할 일
1. **실제 브라우저 확인(가장 우선):** 화면을 브라우저로 직접 본 적이 없다.
   - PC 한 대와 태블릿 한 대로 확인한다: 판 크기, 두 번 눌러 착수하기, 결과창, 교사 모달, 대진표 가로 스크롤, 모바일 레이아웃
   - 사용자는 Claude in Chrome 설치를 거절했다. 브라우저 확인은 사용자에게 부탁하고, 이 확장을 다시 권하지 않는다.
2. **테스트 추가:** 봇 테스트를 `test/`로 옮기고 `socket.io-client`를 devDependency로 추가한다.
3. 선택 사항(사용자가 원할 때만):
   - 3-3 금지 같은 렌주 규칙 옵션
   - 기록을 파일(JSON)에 저장해서 서버를 재시작해도 유지하기
   - 학생 명단 미리 등록
   - 외부 호스팅(Render 등) 배포
4. 이 폴더는 아직 git 저장소가 아니다. 버전 관리가 필요하면 `git init`을 제안한다(`node_modules`는 제외).

## 주의할 점
- **데이터는 메모리에만 있다.** 서버를 끄면 기록이 모두 사라지므로 교사에게 CSV 백업을 안내한다.
- **네트워크:** 학생과 교사 PC가 같은 네트워크에 있어야 한다. 처음 실행할 때 Windows 방화벽에서 Node를 허용해야 한다. 학교망이 기기끼리의 통신을 막으면 접속이 안 될 수 있다.
- **HTTP(비보안) 환경:** LAN 접속은 HTTP라서 `crypto.randomUUID` 같은 보안 컨텍스트 전용 API를 쓰면 안 된다. 토큰은 `Omok.randomToken()`을 쓴다. localStorage와 sessionStorage 접근은 항상 try/catch로 감싼다(`Omok.store`).
- **XSS 방지:** 학생 이름은 사용자가 입력한 값이다. innerHTML에 넣을 때는 반드시 `Omok.esc()`를 거친다.
- **교사 화면 재렌더링:** `teacher:state`를 받을 때마다 전체를 다시 그린다.
  - 확인이 필요한 버튼은 `armBtn`/`armActions`(두 번 눌러 확인) 방식을 써야 상태가 유지된다.
  - 대회 참가자 체크 상태는 `selected` Set에 보관한다.
- **OneDrive 경로:** 프로젝트 경로에 한글과 공백이 있다(`바탕 화면`). 셸 명령에서는 경로를 반드시 따옴표로 감싼다. `start.bat`은 `chcp 65001`과 `cd /d "%~dp0"`을 쓴다.
- **셸:** Windows 환경이다. Bash(Git Bash)와 PowerShell 5.1을 쓸 수 있으며 PowerShell에서는 `&&`를 쓸 수 없다.
- **서버 위치:** 서버 로직(매칭, 판정, 승패)은 반드시 서버에 둔다. 클라이언트는 표시와 입력만 맡는다. 착수 검증도 서버의 `game:move`에서 한다.
