# 같이하기(실시간 멀티) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 끝말잇기·초성게임에 실시간 같이하기 모드를 추가하되, 기존 혼자하기는 한 줄도 바꾸지 않는다.

**Architecture:** 홈 카드를 누르면 혼자/같이를 고르는 오버레이가 뜬다. 혼자는 기존 `startChain()`/`startChosung()`을 그대로 부른다. 같이는 신설 `screen-multi` 하나가 두 게임을 공용으로 처리하며, Firebase RTDB(익명 인증)로 상시 공용방 1개/게임을 굴린다. 승부는 `meta` 트랜잭션으로 정확히 한 명만 통과시킨다. 순수 로직(`pickHost`, `swapOutcome`)만 CORE에 추가해 Node로 단위 테스트한다.

**Tech Stack:** 단일 HTML 파일(`public/index.html`), Firebase compat SDK(CDN), RTDB, 익명 인증, `node --test`(내장), puppeteer(브라우저 2개 검증), python3 http.server(로컬 서빙)

**Spec:** `docs/superpowers/specs/2026-07-17-together-mode-design.md`

## Global Constraints

- **혼자하기 무변경.** `startChain`/`startChosung`/`renderChain`/`renderChosung`/`showHint`/`showChosungHint` 및 그 호출 경로를 수정하지 않는다. 최고기록·`🔄 다른 낱말`·`💡 힌트` 전부 유지.
- **CORE 기존 함수 무변경.** `/* CORE:START */`~`/* CORE:END */` 안의 기존 함수는 건드리지 않는다. 새 순수 함수 `pickHost`/`swapOutcome`만 `/* CORE:END */` **바로 앞에 추가**하고 `test/logic.test.mjs`의 `CORE_NAMES`에 이름을 넣는다. (스펙의 "CORE 무변경"은 기존 로직 보존이 취지이며, 저장소 관례상 새 순수 로직은 CORE에 넣어 테스트한다.)
- **같이하기 화면 파일은 `public/index.html` 하나.** 루트 `index.html`은 Task 1에서 삭제된다. 이후 어떤 태스크도 루트 `index.html`을 만들거나 참조하지 않는다.
- **같이하기에 힌트 없음.** `💡 힌트`, `🔄 다른 낱말` 버튼을 `screen-multi`에 넣지 않는다.
- **정답은 DB에 쓰지 않는다.** `meta.answer`는 `phase==='reveal'`(이미 승부가 남)에서만 채운다. 초성은 `pattern`만, 끝말잇기는 `need`만 올린다.
- **투표는 `presence/{uid}` 안에만.** `meta`에 표를 두지 않는다(위조 가능).
- Firebase 설정(웹 앱 `nearby server` 재사용):
  ```
  apiKey: "AIzaSyBXr59xkIb_l90kMdErron_5oqCMBZZj1E"
  authDomain: "nearby-58e2d.firebaseapp.com"
  databaseURL: "https://nearby-58e2d-default-rtdb.asia-southeast1.firebasedatabase.app"
  projectId: "nearby-58e2d"
  appId: "1:952923689342:web:4dd6eff3df360fe5a2e32f"
  ```
- localStorage 키: `NICK_KEY = "nachmal.multi.nick.v1"` (기존 `nachmal.*` 관례).
- 라운드 수 `MULTI_ROUNDS = 10`, reveal 대기 `REVEAL_MS = 3000`, 교체 투표 `SWAP_VOTE_MS = 20000`, 거부 쿨다운 `SWAP_COOL_MS = 30000`.

---

## Task 1: node 설치 · 테스트를 public/으로 이전 · 루트 index.html 삭제

기존 테스트 스위트가 "혼자하기 안 깨졌음"을 증명할 유일한 수단인데 이 머신에 JS 런타임이 없다. 먼저 돌아가게 만들고, 중복 105KB를 없앤다. 이 태스크는 앱 코드를 하나도 안 바꾸므로 **테스트가 전후로 똑같이 통과해야 한다.**

**Files:**
- Modify: `test/logic.test.mjs` — `../index.html` → `../public/index.html` (13곳)
- Delete: `index.html` (루트)

**Interfaces:**
- Consumes: 없음 (첫 태스크)
- Produces: `node`/`npx` 사용 가능. `test/logic.test.mjs`가 `public/index.html`을 유일본으로 읽음. 이후 모든 태스크는 `public/index.html`만 수정.

- [ ] **Step 1: nvm + node 설치**

sudo 불필요. `~/.nvm`에만 설치된다.

```bash
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"
nvm install --lts
node -v
```
Expected: `v22.x.x` 같은 버전 출력.

- [ ] **Step 2: 기존 테스트가 지금 통과하는지 먼저 확인 (기준선)**

```bash
cd /home/epicurean/homespace/nunus
export NVM_DIR="$HOME/.nvm"; [ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"
node --test test/
```
Expected: PASS. **여기서 실패하면 멈추고 보고할 것** — 기준선이 깨진 상태에서 진행하면 이후 실패의 원인을 알 수 없다.

- [ ] **Step 3: 테스트가 읽는 파일을 public/으로 변경**

```bash
sed -i "s|'\.\./index\.html'|'../public/index.html'|g" test/logic.test.mjs
grep -c "'\.\./public/index\.html'" test/logic.test.mjs
grep -c "'\.\./index\.html'" test/logic.test.mjs || true
```
Expected: 첫 `grep -c` → `13`, 둘째 → `0`.

- [ ] **Step 4: 에러 메시지의 파일명도 정정**

`test/logic.test.mjs:18` 부근:
```js
if(start < 0 || end < 0) throw new Error('CORE markers not found in index.html');
```
을 다음으로:
```js
if(start < 0 || end < 0) throw new Error('CORE markers not found in public/index.html');
```

- [ ] **Step 5: 테스트 재실행 — 루트 삭제 전에 public/ 기준으로 통과 확인**

```bash
node --test test/
```
Expected: PASS (Step 2와 동일한 결과). 두 파일이 identical이므로 결과가 같아야 정상.

- [ ] **Step 6: 루트 index.html 삭제**

```bash
git rm index.html
```

- [ ] **Step 7: 삭제 후에도 테스트 통과 확인**

```bash
node --test test/
```
Expected: PASS. 이제 `public/index.html`만 읽으므로 루트가 없어도 통과해야 한다.

- [ ] **Step 8: 커밋**

```bash
git add test/logic.test.mjs
git commit -m "$(cat <<'EOF'
Make public/index.html the only copy and point tests at it

The root and public copies were identical 105KB files that had to be edited in
lockstep by hand; the next change adds multiplayer to both, which is exactly
where they would drift. test/logic.test.mjs read the root one, so it moves with
it — same 13 reads, now of the single remaining file.

No app code changes: the suite passes identically before and after.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: RTDB 규칙에 교체 투표 자리 추가 · 재배포 · 실제 토큰으로 검증

현재 규칙은 `meta`에 정해진 필드만, `presence`에 `{name, ts}`만 허용한다. `swap`/`swapCool`/`vote`는 **쓰면 전부 거부된다.** 클라이언트 코드보다 먼저 뚫어야 이후 태스크가 진행된다.

**Files:**
- Modify: `database.rules.json`
- Create: `test/rules-check.sh`

**Interfaces:**
- Consumes: 없음 (Task 1과 독립)
- Produces: RTDB가 `meta.swap = {by, round, until}`, `meta.swapCool = int`, `presence/{uid}/vote = {req, ok}` 쓰기를 허용(`req` = 그 표가 향하는 요청의 `swap.until`). 그 외 임의 필드는 계속 거부.

- [ ] **Step 1: 규칙에 세 자리 추가**

`database.rules.json`의 `meta` 블록에서 `"$other": { ".validate": false }` **바로 앞에** 추가:
```json
        "swap": {
          ".validate": "newData.hasChildren(['by','round','until']) || !newData.exists()",
          "by":    { ".validate": "newData.isString() && newData.val().length <= 64" },
          "round": { ".validate": "newData.isNumber()" },
          "until": { ".validate": "newData.isNumber()" },
          "$o":    { ".validate": false }
        },
        "swapCool": { ".validate": "newData.isNumber()" },
```

같은 파일 `presence.$pid` 블록에서 `"$o": { ".validate": false }` **바로 앞에** 추가:
```json
            "vote": {
              ".validate": "newData.hasChildren(['req','ok']) || !newData.exists()",
              "req": { ".validate": "newData.isNumber()" },
              "ok":  { ".validate": "newData.isBoolean()" },
              "$o":  { ".validate": false }
            },
```

- [ ] **Step 2: 검증 스크립트 작성**

`test/rules-check.sh` 생성:
```bash
#!/usr/bin/env bash
# 배포된 RTDB 규칙을 실제 익명 토큰으로 검증한다.
# 사용법: bash test/rules-check.sh
set -u
KEY="AIzaSyBXr59xkIb_l90kMdErron_5oqCMBZZj1E"
DB="https://nearby-58e2d-default-rtdb.asia-southeast1.firebasedatabase.app"
SIGNUP="https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=$KEY"

mk(){ curl -s -X POST "$SIGNUP" -H 'Content-Type: application/json' -d '{"returnSecureToken":true}'; }
A=$(mk); B=$(mk)
TA=$(echo "$A" | grep -o '"idToken": "[^"]*"' | cut -d'"' -f4)
UA=$(echo "$A" | grep -o '"localId": "[^"]*"' | cut -d'"' -f4)
UB=$(echo "$B" | grep -o '"localId": "[^"]*"' | cut -d'"' -f4)

code(){ curl -s -o /dev/null -w "%{http_code}" "$@"; }
fail=0
chk(){ # chk <라벨> <기대코드> <실제코드>
  if [ "$2" = "$3" ]; then echo "  ok   $1 ($3)"; else echo "  FAIL $1 — 기대 $2, 실제 $3"; fail=1; fi
}

echo "규칙 검증 (uid A=$UA)"
chk "내 vote 쓰기 허용" 200 \
  "$(code -X PUT "$DB/nunus/chain/presence/$UA/vote.json?auth=$TA" -d '{"req":1,"ok":true}')"
chk "남의 vote 쓰기 차단" 401 \
  "$(code -X PUT "$DB/nunus/chain/presence/$UB/vote.json?auth=$TA" -d '{"req":1,"ok":true}')"
chk "vote 임의필드 차단" 401 \
  "$(code -X PUT "$DB/nunus/chain/presence/$UA/vote.json?auth=$TA" -d '{"req":1,"ok":true,"x":1}')"
chk "meta.swap 쓰기 허용" 200 \
  "$(code -X PUT "$DB/nunus/chain/meta/swap.json?auth=$TA" -d "{\"by\":\"$UA\",\"round\":1,\"until\":123}")"
chk "meta.swap 필드누락 차단" 401 \
  "$(code -X PUT "$DB/nunus/chain/meta/swap.json?auth=$TA" -d '{"by":"x"}')"
chk "meta.swapCool 쓰기 허용" 200 \
  "$(code -X PUT "$DB/nunus/chain/meta/swapCool.json?auth=$TA" -d '99')"
chk "meta 임의필드 차단" 401 \
  "$(code -X PUT "$DB/nunus/chain/meta/bogus.json?auth=$TA" -d '1')"
chk "루트 읽기 차단" 401 "$(code "$DB/.json?auth=$TA")"
chk "비로그인 읽기 차단" 401 "$(code "$DB/nunus.json")"

echo "정리: 이 스크립트가 만든 노드는 관리자로 지운다"
echo "  firebase database:remove /nunus/chain/presence/$UA --force"
echo "  firebase database:remove /nunus/chain/meta --force"
[ "$fail" = 0 ] && echo "전부 통과" || { echo "실패 있음"; exit 1; }
```

- [ ] **Step 3: 규칙 배포 전에 실행해서 실패를 먼저 확인**

```bash
cd /home/epicurean/homespace/nunus
bash test/rules-check.sh
```
Expected: FAIL — "내 vote 쓰기 허용"과 "meta.swap 쓰기 허용"이 401로 떨어진다(아직 규칙이 없으므로). 이게 규칙 변경이 실제로 필요하다는 증거다.

- [ ] **Step 4: 규칙 배포**

```bash
firebase deploy --only database --project nearby-58e2d
```
Expected: `rules for database nearby-58e2d-default-rtdb released successfully`

- [ ] **Step 5: 재실행해서 전부 통과 확인**

```bash
bash test/rules-check.sh
```
Expected: `전부 통과`. 특히 **"남의 vote 쓰기 차단"이 401**이어야 한다 — 표 위조가 막힌다는 핵심 증거.

- [ ] **Step 6: 테스트가 남긴 데이터 정리**

Step 5 출력이 알려준 명령을 실행한다(uid는 매 실행마다 다르다):
```bash
firebase database:remove /nunus/chain/presence --force --project nearby-58e2d
firebase database:remove /nunus/chain/meta --force --project nearby-58e2d
```
확인:
```bash
firebase database:get /nunus --project nearby-58e2d
```
Expected: `null`

- [ ] **Step 7: 커밋**

```bash
git add database.rules.json test/rules-check.sh
git commit -m "$(cat <<'EOF'
Open RTDB rules for the problem-swap vote

meta.swap, meta.swapCool, and presence/$pid/vote had nowhere to live: meta
allowed a fixed field list and presence allowed only {name, ok}, so every swap
write would have been rejected. Adds exactly those three and nothing else —
$other/$o stay ".validate": false.

Votes go under presence/$pid, where auth.uid === $pid is already enforced, so
nobody can cast a vote for someone else. rules-check.sh proves that with real
anonymous tokens: it fails against the old rules and passes against these.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: 순수 로직 `pickHost` / `swapOutcome` (CORE) + 단위 테스트

같이하기에서 제일 틀리기 쉬운 건 교체 투표 집계다. DOM·네트워크 없이 순수 함수로 떼어내 Node로 테스트한다. **TDD: 테스트 먼저.**

**Files:**
- Modify: `test/logic.test.mjs` — `CORE_NAMES`에 두 이름 추가 + 테스트 추가
- Modify: `public/index.html` — `/* CORE:END */` 바로 앞에 두 함수 추가

**Interfaces:**
- Consumes: Task 1 (테스트가 `public/index.html`을 읽음)
- Produces:
  - `pickHost(uids: string[]) -> string|null` — 사전순 최소 uid. 빈 배열이면 `null`.
  - `swapOutcome(swap, votes, memberCount, now, round) -> 'none'|'stale'|'cancel'|'swap'|'wait'`
    - `swap`: `{by, round, until}` 또는 `null`
    - `votes`: 접속자들의 `vote` 값 배열 `[{req, ok}, ...]` (표 없는 사람은 빠짐).
      `req`는 그 표가 어느 **요청**에 대한 것인지 — 값은 그 요청의 `swap.until`
    - `memberCount`: 현재 접속자 수
    - `now`, `round`: 숫자

- [ ] **Step 1: 실패하는 테스트 작성**

`test/logic.test.mjs`의 `CORE_NAMES` 배열 마지막 항목 `'chosungOf','chosungHint'` 뒤에 추가:
```js
  'pickHost','swapOutcome'
```

파일 맨 끝에 추가:
```js
test('pickHost: 사전순 최소 uid가 호스트', () => {
  const { pickHost } = loadCore();
  assert.equal(pickHost(['zeta','alpha','mid']), 'alpha');
  assert.equal(pickHost(['only']), 'only');
  assert.equal(pickHost([]), null);
  assert.equal(pickHost(null), null);
});

test('swapOutcome: 요청 없으면 none, 지난 라운드 요청은 stale', () => {
  const { swapOutcome } = loadCore();
  assert.equal(swapOutcome(null, [], 3, 1000, 5), 'none');
  const stale = { by:'a', round:4, until:9999 };            // 4라운드 요청인데 지금 5라운드
  assert.equal(swapOutcome(stale, [], 3, 1000, 5), 'stale');
});

test('swapOutcome: 거부 한 명이면 즉시 취소 (마감 지나도 거부 우선)', () => {
  const { swapOutcome } = loadCore();
  const swap = { by:'a', round:5, until:2000 };
  const votes = [{req:2000,ok:true},{req:2000,ok:false}];
  assert.equal(swapOutcome(swap, votes, 3, 1000, 5), 'cancel');
  assert.equal(swapOutcome(swap, votes, 3, 9999, 5), 'cancel');
});

test('swapOutcome: 전원 찬성이면 마감 전이라도 즉시 교체', () => {
  const { swapOutcome } = loadCore();
  const swap = { by:'a', round:5, until:9999 };
  const votes = [{req:9999,ok:true},{req:9999,ok:true},{req:9999,ok:true}];
  assert.equal(swapOutcome(swap, votes, 3, 1000, 5), 'swap');
});

test('swapOutcome: 20초 지나면 묵시적 동의로 교체 (자리 비운 사람이 못 막음)', () => {
  const { swapOutcome } = loadCore();
  const swap = { by:'a', round:5, until:2000 };
  const votes = [{req:2000,ok:true}];          // 3명 중 1명만 투표
  assert.equal(swapOutcome(swap, votes, 3, 1999, 5), 'wait');
  assert.equal(swapOutcome(swap, votes, 3, 2001, 5), 'swap');
});

test('swapOutcome: 혼자면 자기 찬성만으로 즉시 교체', () => {
  const { swapOutcome } = loadCore();
  const swap = { by:'a', round:5, until:9999 };
  assert.equal(swapOutcome(swap, [{req:9999,ok:true}], 1, 1000, 5), 'swap');
});

test('swapOutcome: 지난 요청의 표는 새 요청에 안 딸려온다', () => {
  const { swapOutcome } = loadCore();
  // 같은 5라운드에서 두 번째 요청(until=8888). 첫 요청(until=5555) 때 받은 찬성표는
  // req가 안 맞으므로 무효 — 안 그러면 남들이 거부할 새도 없이 즉시 통과해버린다.
  const swap2 = { by:'a', round:5, until:8888 };
  const old   = [{req:5555,ok:true},{req:5555,ok:true},{req:5555,ok:true}];
  assert.equal(swapOutcome(swap2, old, 3, 1000, 5), 'wait');
  // 요청자 본인 표(새 req)만 있으면 여전히 대기
  assert.equal(swapOutcome(swap2, [{req:8888,ok:true}], 3, 1000, 5), 'wait');
});
```

- [ ] **Step 2: 실패 확인**

```bash
cd /home/epicurean/homespace/nunus
export NVM_DIR="$HOME/.nvm"; [ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"
node --test test/
```
Expected: FAIL — `pickHost is not defined` 계열. (`loadCore`가 `typeof` 가드로 `undefined`를 반환하므로 `pickHost(...)` 호출에서 "is not a function"으로 뜰 수도 있다. 둘 다 정상적인 실패다.)

- [ ] **Step 3: CORE에 두 함수 추가**

`public/index.html`의 `/* CORE:END */` **바로 앞 줄**에 삽입:
```js
/* ----- 같이하기(멀티) 순수 로직 ----- */
// 접속자 중 사전순 최소 uid가 호스트. 별도 선출 없이 각자 같은 답을 계산한다.
function pickHost(uids){
  if(!uids || !uids.length) return null;
  return [...uids].sort()[0];
}
// 문제 교체 요청 집계. 침묵 = 동의(자리 비운 사람이 방을 잠그지 못하게).
// swap:{by,round,until}|null, votes:[{req,ok}], memberCount:접속자수, now/round:숫자
// 표는 라운드가 아니라 요청(req === swap.until)으로 묶는다. 그래야 같은 라운드의
// 두 번째 요청에 첫 요청 표가 재활용되지 않고, 지난 표를 지우는 쓰기도 필요 없다.
function swapOutcome(swap, votes, memberCount, now, round){
  if(!swap) return 'none';
  if(swap.round !== round) return 'stale';
  const v = (votes || []).filter(x => x && x.req === swap.until);
  if(v.some(x => x.ok === false)) return 'cancel';       // 거부는 마감보다 우선
  if(v.filter(x => x.ok === true).length >= memberCount) return 'swap';
  if(now > swap.until) return 'swap';                    // 묵시적 동의
  return 'wait';
}
```

- [ ] **Step 4: 통과 확인**

```bash
node --test test/
```
Expected: PASS (신규 7개 포함 전부).

- [ ] **Step 5: 커밋**

```bash
git add test/logic.test.mjs public/index.html
git commit -m "$(cat <<'EOF'
Add pickHost/swapOutcome as pure CORE logic

The swap tally is the easiest thing here to get wrong — reject-vs-timeout
precedence, stale votes from a finished round, the solo case — and none of it
needs the DOM or the network. Pulling it into CORE puts it under node --test
alongside chainCheck/pickRound, same as the repo already does.

Silence counts as consent once swap.until passes, so the tests pin that an
idle player cannot stall a swap, while a single reject cancels it even after
the deadline.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: 모드 선택 오버레이 (혼자 / 같이)

홈 카드를 누르면 갈림길을 띄운다. 이 태스크까지는 `같이 하기`가 아직 아무것도 안 한다(다음 태스크에서 붙인다). **혼자하기 경로가 예전과 똑같이 동작해야 한다.**

**Files:**
- Modify: `public/index.html` — `#modepick-overlay` HTML, `openModePick()`, 모드카드 바인딩(`:1451`)
- Modify: `test/logic.test.mjs` — 배선 테스트 추가

**Interfaces:**
- Consumes: Task 1
- Produces: `openModePick(mode)` — `mode`는 `'chain'|'chosung'`. `혼자 하기` → 기존 `startChain()`/`startChosung()`. `같이 하기` → `startMulti(mode)` (Task 5에서 정의; 이 태스크에서는 임시 스텁).

- [ ] **Step 1: 배선 테스트 작성 (실패 확인용)**

`test/logic.test.mjs` 끝에 추가:
```js
test('public/index.html: 모드 선택 오버레이 배선', () => {
  const html = readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');
  assert.match(html, /id="modepick-overlay"/, '모드 선택 오버레이가 있어야');
  assert.match(html, /id="modepick-solo"/, '혼자 하기 버튼이 있어야');
  assert.match(html, /id="modepick-multi"/, '같이 하기 버튼이 있어야');
  assert.match(html, /function openModePick\(/, 'openModePick이 있어야');
  // 카드 클릭이 곧바로 startChain/startChosung을 부르지 않고 갈림길을 거쳐야
  assert.match(html, /dataset\.mode[\s\S]{0,200}openModePick\(/,
    '모드카드 클릭은 openModePick을 거쳐야');
  // 혼자하기 진입점은 살아 있어야
  assert.match(html, /function startChain\(/, 'startChain은 그대로 남아야');
  assert.match(html, /function startChosung\(/, 'startChosung은 그대로 남아야');
});
```

- [ ] **Step 2: 실패 확인**

```bash
node --test test/
```
Expected: FAIL — `모드 선택 오버레이가 있어야`

- [ ] **Step 3: 오버레이 HTML 추가**

`public/index.html`의 `<div id="chain-record-overlay" class="overlay hidden">` **바로 앞**에 삽입:
```html
  <!-- ============ 모드 선택 (혼자 / 같이) ============ -->
  <div id="modepick-overlay" class="overlay hidden">
    <div class="overlay-card">
      <div class="overlay-title" id="modepick-title"></div>
      <button class="btn btn-soft" id="modepick-solo">👤 혼자 하기</button>
      <button class="btn btn-primary" id="modepick-multi">👥 같이 하기</button>
      <button class="ghostbtn" id="modepick-close">닫기</button>
    </div>
  </div>
```

- [ ] **Step 4: `openModePick` + 바인딩 추가**

`/* ================= 이벤트 바인딩 ================= */` **바로 앞**에 삽입:
```js
/* ---------- 모드 선택 (혼자 / 같이) ---------- */
let modePickMode = null;
const MODE_LABEL = { chain:'🔤 끝말잇기', chosung:'🔡 초성게임' };
function openModePick(mode){
  modePickMode = mode;
  $('modepick-title').textContent = MODE_LABEL[mode] || '';
  $('modepick-overlay').classList.remove('hidden');
}
function closeModePick(){ $('modepick-overlay').classList.add('hidden'); }
```

- [ ] **Step 5: 모드카드 클릭을 갈림길로 변경**

`public/index.html:1451` 부근 현재:
```js
  c.addEventListener('click', ()=>{ const m=c.dataset.mode; if(m==='chain') startChain(); else if(m==='chosung') startChosung(); else startQuiz(m); });
```
을 다음으로 교체:
```js
  c.addEventListener('click', ()=>{ const m=c.dataset.mode; if(m==='chain'||m==='chosung') openModePick(m); else startQuiz(m); });
```

같은 바인딩 블록 끝(`$('record-close').addEventListener(...)` 근처)에 추가:
```js
$('modepick-solo').addEventListener('click', ()=>{
  closeModePick();
  if(modePickMode==='chain') startChain(); else startChosung();
});
$('modepick-multi').addEventListener('click', ()=>{
  closeModePick();
  startMulti(modePickMode);
});
$('modepick-close').addEventListener('click', closeModePick);
$('modepick-overlay').addEventListener('click', e=>{ if(e.target === $('modepick-overlay')) closeModePick(); });
```

- [ ] **Step 6: `startMulti` 임시 스텁 추가**

Task 5에서 진짜 구현으로 교체된다. `openModePick` 정의 바로 아래에 추가:
```js
function startMulti(mode){ alert('같이 하기는 아직 준비 중이야! (' + mode + ')'); }
```

- [ ] **Step 7: 통과 확인**

```bash
node --test test/
```
Expected: PASS

- [ ] **Step 8: 브라우저로 혼자하기 무손상 확인**

```bash
cd /home/epicurean/homespace/nunus/public && python3 -m http.server 8777 &
sleep 1
google-chrome --new-window http://localhost:8777/ >/dev/null 2>&1 &
```
직접 확인할 것:
- 홈 → `🔤 끝말잇기` → 갈림길이 뜬다 → `👤 혼자 하기` → **예전 그대로** 동작(시드 제시, 입력, `🔗 N · 최고 M`, `🔄 다른 낱말`, `💡 힌트`)
- 홈 → `🔡 초성게임` → `👤 혼자 하기` → 예전 그대로
- 홈 → `✅ 객관식` / `✏️ 주관식` → **갈림길 없이** 바로 시작(변경 없어야)
- `👥 같이 하기` → 준비 중 alert

확인 후:
```bash
kill %1
```

- [ ] **Step 9: 커밋**

```bash
git add public/index.html test/logic.test.mjs
git commit -m "$(cat <<'EOF'
Add the 혼자/같이 fork to 끝말잇기 and 초성게임 cards

Tapping either card now opens a mode sheet instead of starting solo directly;
같이 하기 is a stub until the next task. Solo reaches startChain/startChosung
unchanged, and the 받침 quiz cards skip the fork entirely.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: `screen-multi` 뼈대 · 익명 로그인 · 닉네임 · presence

같이하기 화면을 띄우고 방에 들어가 접속자 목록까지 뜨게 한다. 아직 문제/승부는 없다.

**Files:**
- Modify: `public/index.html` — Firebase SDK, `screen-multi` HTML/CSS, `screens` 맵(`:763`), 인증·닉네임·presence 로직
- Modify: `test/logic.test.mjs` — 배선 테스트

**Interfaces:**
- Consumes: Task 3 (`pickHost`), Task 4 (`startMulti(mode)` 스텁 교체)
- Produces:
  - `startMulti(mode)` — `screen-multi`로 전환, 익명 로그인, 닉네임 확보, presence 등록, 구독 시작
  - `leaveMulti()` — 구독 해제, presence 제거, `show('home')`
  - 전역: `MG = { mode, uid, name, ref, members:[], meta:null, hostUid:null }`

- [ ] **Step 1: 배선 테스트 작성**

`test/logic.test.mjs` 끝에 추가:
```js
test('public/index.html: 같이하기 화면 배선', () => {
  const html = readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');
  assert.match(html, /id="screen-multi"/, 'screen-multi가 있어야');
  assert.match(html, /id="multi-players"/, '접속자 점수판이 있어야');
  assert.match(html, /id="multi-bubble"/, '🦉 말풍선이 있어야');
  assert.match(html, /id="multi-nick"/, '닉네임 입력이 있어야');
  assert.match(html, /multi:\$\('screen-multi'\)/, 'screens 맵에 multi 등록되어야');
  assert.match(html, /signInAnonymously/, '익명 로그인을 써야');
  assert.match(html, /onDisconnect\(\)/, 'presence 자동 정리를 써야');
  assert.match(html, /nachmal\.multi\.nick\.v1/, '닉네임 저장키가 있어야');
});

test('public/index.html: 같이하기에는 힌트/다른낱말 버튼이 없다', () => {
  const html = readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');
  const m = html.match(/<section id="screen-multi"[\s\S]*?<\/section>/);
  assert.ok(m, 'screen-multi 섹션을 찾아야');
  assert.doesNotMatch(m[0], /multi-hint-btn/, '같이하기엔 힌트 버튼이 없어야');
  assert.doesNotMatch(m[0], /다른 낱말/, '같이하기엔 다른 낱말 버튼이 없어야');
});
```

- [ ] **Step 2: 실패 확인**

```bash
node --test test/
```
Expected: FAIL — `screen-multi가 있어야`

- [ ] **Step 3: Firebase SDK 추가**

`public/index.html`의 `</body>` 앞, 기존 `<script>` **바로 앞**에 삽입:
```html
<script src="https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js"></script>
<script src="https://www.gstatic.com/firebasejs/10.12.2/firebase-auth-compat.js"></script>
<script src="https://www.gstatic.com/firebasejs/10.12.2/firebase-database-compat.js"></script>
```

- [ ] **Step 4: `screen-multi` HTML 추가**

`<!-- ============ RECORD OVERLAY ============ -->` **바로 앞**에 삽입:
```html
  <!-- ============ 같이하기 (멀티) ============ -->
  <section id="screen-multi" class="hidden">
    <div class="topbar">
      <button class="iconbtn" id="btn-multi-home" title="홈으로">←</button>
      <div class="title" id="multi-title"></div>
      <div class="spacer"></div>
      <div class="score-pill">🎯 <span id="multi-round">-</span>R · <span id="multi-myscore">0</span></div>
      <button class="iconbtn" id="multi-end-x" title="나가기">✕</button>
    </div>
    <div class="players" id="multi-players"></div>
    <div class="card">
      <div class="assistant">
        <div class="mascot">🦉</div>
        <div class="bubble" id="multi-bubble"></div>
      </div>

      <div id="multi-nick" class="hidden">
        <div class="type-input-row">
          <input class="type-input" id="multi-nick-input" type="text" maxlength="12"
                 autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="닉네임 (1~12자)">
          <button class="btn btn-sky" id="multi-nick-ok" style="flex:none; min-height:auto; padding:0 20px">입장</button>
        </div>
      </div>

      <div id="multi-play" class="hidden">
        <div id="multi-problem-chain" class="hidden">
          <div class="chain-flow" id="multi-flow"></div>
          <div class="chain-need" id="multi-need"></div>
        </div>
        <div id="multi-problem-chosung" class="hidden">
          <div class="chosung-pattern" id="multi-pattern"></div>
          <div class="chain-need">이 초성으로 된 낱말은?</div>
        </div>
        <div class="type-input-row">
          <input class="type-input" id="multi-input" type="text" inputmode="text"
                 autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="낱말 입력">
          <button class="btn btn-sky" id="multi-submit" style="flex:none; min-height:auto; padding:0 20px">확인</button>
        </div>
        <div class="chain-hint" id="multi-feedback"></div>
        <div class="actions" id="multi-swap"></div>
      </div>

      <div id="multi-endbox" class="chain-endbox hidden">
        <div class="big" id="multi-endtext"></div>
        <div id="multi-standings"></div>
        <div class="actions">
          <button class="btn btn-soft" id="multi-home2">홈으로</button>
          <button class="btn btn-primary" id="multi-restart">다시 시작</button>
        </div>
      </div>
    </div>
  </section>
```

- [ ] **Step 5: 점수판 CSS 추가**

`.chosung-pattern{` 규칙 **바로 앞**에 삽입:
```css
  .players{
    display:flex; gap:8px; overflow-x:auto; padding:10px 16px 2px;
    -webkit-overflow-scrolling:touch; scrollbar-width:none;
  }
  .players::-webkit-scrollbar{display:none}
  .pchip{
    flex:none; display:flex; align-items:center; gap:6px;
    background:var(--card); border-radius:999px; padding:6px 12px;
    box-shadow:var(--shadow); font-size:.82rem; white-space:nowrap;
  }
  .pchip.me{ outline:2px solid var(--sky) }
  .pchip .pscore{ font-weight:700 }
  .pchip.bump{ animation:bump .45s ease }
  @keyframes bump{ 0%{transform:scale(1)} 40%{transform:scale(1.18)} 100%{transform:scale(1)} }
```

- [ ] **Step 6: `screens` 맵에 등록**

`public/index.html:762-764` 현재:
```js
const screens = {
  home:$('screen-home'), quiz:$('screen-quiz'), result:$('screen-result'), edit:$('screen-edit'), chain:$('screen-chain'), chosung:$('screen-chosung')
};
```
을 다음으로:
```js
const screens = {
  home:$('screen-home'), quiz:$('screen-quiz'), result:$('screen-result'), edit:$('screen-edit'), chain:$('screen-chain'), chosung:$('screen-chosung'), multi:$('screen-multi')
};
```

- [ ] **Step 7: 인증·닉네임·presence 로직 추가 (`startMulti` 스텁 교체)**

Task 4에서 넣은 스텁
```js
function startMulti(mode){ alert('같이 하기는 아직 준비 중이야! (' + mode + ')'); }
```
을 통째로 다음으로 교체:
```js
/* ---------- 같이하기: 연결 · 닉네임 · presence ---------- */
const NICK_KEY = "nachmal.multi.nick.v1";
const MULTI_ROUNDS = 10, REVEAL_MS = 3000, SWAP_VOTE_MS = 20000, SWAP_COOL_MS = 30000;
const FB_CONFIG = {
  apiKey: "AIzaSyBXr59xkIb_l90kMdErron_5oqCMBZZj1E",
  authDomain: "nearby-58e2d.firebaseapp.com",
  databaseURL: "https://nearby-58e2d-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "nearby-58e2d",
  appId: "1:952923689342:web:4dd6eff3df360fe5a2e32f"
};
let MG = null;           // 현재 같이하기 세션
let fbReady = null;      // 익명 로그인 Promise (한 번만)

function mSay(t){ $('multi-bubble').innerHTML = t; }
function loadNick(){ return localStorage.getItem(NICK_KEY) || ''; }
function saveNick(n){ localStorage.setItem(NICK_KEY, n); }

function fbInit(){
  if(fbReady) return fbReady;
  fbReady = new Promise((resolve, reject)=>{
    try{
      if(!firebase.apps.length) firebase.initializeApp(FB_CONFIG);
      firebase.auth().signInAnonymously()
        .then(()=> resolve(firebase.auth().currentUser.uid))
        .catch(reject);
    }catch(e){ reject(e); }
  });
  return fbReady;
}

function startMulti(mode){
  MG = { mode, uid:null, name:loadNick(), ref:null, members:[], meta:null, hostUid:null, subs:[] };
  $('multi-title').textContent = (MODE_LABEL[mode]||'') + ' · 같이';
  $('multi-problem-chain').classList.toggle('hidden', mode!=='chain');
  $('multi-problem-chosung').classList.toggle('hidden', mode!=='chosung');
  $('multi-play').classList.add('hidden');
  $('multi-endbox').classList.add('hidden');
  $('multi-nick').classList.add('hidden');
  $('multi-players').innerHTML = '';
  mSay('연결 중이야…');
  show('multi');

  fbInit().then(uid=>{
    MG.uid = uid;
    MG.ref = firebase.database().ref('nunus/' + mode);
    if(!MG.name){ askNick(); } else { enterRoom(); }
  }).catch(()=>{
    mSay('지금은 같이 하기가 안 돼. 혼자 하기로 놀자!');
  });
}

function askNick(){
  $('multi-nick').classList.remove('hidden');
  mSay('같이 하려면 이름이 필요해! 뭐라고 부를까?');
  $('multi-nick-input').value = '';
  $('multi-nick-input').focus();
}
function submitNick(){
  const v = norm($('multi-nick-input').value).slice(0,12);
  if(!v){ $('multi-nick-input').focus(); return; }
  saveNick(v); MG.name = v;
  $('multi-nick').classList.add('hidden');
  enterRoom();
}

function enterRoom(){
  const me = MG.ref.child('presence/' + MG.uid);
  me.onDisconnect().remove();
  me.set({ name: MG.name, ts: firebase.database.ServerValue.TIMESTAMP });
  $('multi-play').classList.remove('hidden');
  mSay('들어왔다! 잠깐만…');

  const onPresence = MG.ref.child('presence').on('value', snap=>{
    const v = snap.val() || {};
    MG.members = Object.keys(v).map(uid => ({ uid, ...v[uid] }));
    MG.hostUid = pickHost(MG.members.map(m=>m.uid));
    renderPlayers();
  });
  MG.subs.push(()=> MG.ref.child('presence').off('value', onPresence));

  // 연결 끊김: 끊기면 입력을 잠그고 알린다. 복구되면 presence를 다시 심고 재개한다.
  // (onDisconnect().remove()가 서버에서 우리를 지웠을 수 있으므로 set을 다시 해야 한다.)
  const conRef = firebase.database().ref('.info/connected');
  const onCon = conRef.on('value', s=>{
    if(!MG) return;
    MG.online = !!s.val();
    if(!MG.online){
      mSay('연결이 끊겼어! 다시 연결 중…');
      $('multi-input').disabled = true;
      $('multi-submit').disabled = true;
    }else{
      const me2 = MG.ref.child('presence/' + MG.uid);
      me2.onDisconnect().remove();
      me2.set({ name: MG.name, ts: firebase.database.ServerValue.TIMESTAMP });
      renderMulti();
    }
  });
  MG.subs.push(()=> conRef.off('value', onCon));
}

function renderPlayers(){
  const scores = (MG && MG.scoreCache) || {};
  const el = $('multi-players');
  el.innerHTML = '';
  for(const m of MG.members){
    const chip = document.createElement('div');
    chip.className = 'pchip' + (m.uid===MG.uid ? ' me' : '');
    chip.innerHTML = '<span>' + (m.uid===MG.uid ? '나' : escapeHtml(m.name||'?')) +
                     '</span><span class="pscore">' + (scores[m.uid]||0) + '</span>';
    el.appendChild(chip);
  }
  $('multi-myscore').textContent = scores[MG.uid] || 0;
}
function escapeHtml(s){ const d=document.createElement('div'); d.textContent=s; return d.innerHTML; }

function renderMulti(){ /* Task 6에서 채운다 */ }

function leaveMulti(){
  if(MG){
    MG.subs.forEach(off=>{ try{ off(); }catch(e){} });
    if(MG.ref && MG.uid) MG.ref.child('presence/' + MG.uid).remove();
    MG = null;
  }
  show('home');
}
```

- [ ] **Step 8: 바인딩 추가**

`$('modepick-close').addEventListener('click', closeModePick);` 아래에 추가:
```js
$('multi-nick-ok').addEventListener('click', submitNick);
$('multi-nick-input').addEventListener('keydown', e=>{ if(e.key==='Enter') submitNick(); });
$('btn-multi-home').addEventListener('click', leaveMulti);
$('multi-end-x').addEventListener('click', leaveMulti);
$('multi-home2').addEventListener('click', leaveMulti);
```

- [ ] **Step 9: 통과 확인**

```bash
node --test test/
```
Expected: PASS

- [ ] **Step 10: 브라우저 2개로 presence 확인**

```bash
cd /home/epicurean/homespace/nunus/public && python3 -m http.server 8777 &
sleep 1
google-chrome --new-window http://localhost:8777/ >/dev/null 2>&1 &
google-chrome --incognito http://localhost:8777/ >/dev/null 2>&1 &
```
직접 확인할 것: 두 창 모두 `🔤 끝말잇기` → `👥 같이 하기` → 각각 다른 닉네임 입력 → **양쪽 점수판에 두 명이 다 보인다**. 한 창을 닫으면 다른 창에서 그 사람이 사라진다.

```bash
kill %1
firebase database:remove /nunus --force --project nearby-58e2d
```

- [ ] **Step 11: 커밋**

```bash
git add public/index.html test/logic.test.mjs
git commit -m "$(cat <<'EOF'
Add the 같이하기 screen: anonymous auth, nickname, presence

One screen serves both games; the problem area swaps by mode. Nickname is asked
only here and only once — someone who never opens 같이 하기 is never asked for
a name. presence uses onDisconnect().remove() so a closed tab leaves the room
on its own, and pickHost derives the host from the member list with no election.

No problems or scoring yet.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: 문제 출제 · meta 부트스트랩 · 렌더링

호스트가 첫 문제를 만들고 모두가 같은 문제를 본다. 아직 답 제출은 없다.

**Files:**
- Modify: `public/index.html`
- Modify: `test/logic.test.mjs`

**Interfaces:**
- Consumes: Task 5 (`MG`, `enterRoom`), Task 3 (`pickHost`)
- Produces:
  - `newProblem(mode, meta)` → chain: `{need, chain, used}` / chosung: `{pattern}` — 다음 문제 조각
  - `bootstrapMeta()` — 호스트만. `meta` 없으면 트랜잭션으로 1라운드 생성
  - `renderMulti()` — `MG.meta` 기준으로 문제/말풍선/라운드 표시

- [ ] **Step 1: 배선 테스트 작성**

`test/logic.test.mjs` 끝에 추가:
```js
test('public/index.html: 같이하기 문제 출제/구독 배선', () => {
  const html = readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');
  assert.match(html, /function newProblem\(/, 'newProblem이 있어야');
  assert.match(html, /function bootstrapMeta\(/, 'bootstrapMeta가 있어야');
  assert.match(html, /function renderMulti\(/, 'renderMulti가 있어야');
  assert.match(html, /\.child\('meta'\)[\s\S]{0,80}\.on\('value'/, 'meta를 구독해야');
  // 정답을 DB에 올리면 안 된다: 출제 시 answer를 쓰지 않는지
  assert.doesNotMatch(html, /newProblem[\s\S]{0,400}answer:/, '출제 때 answer를 쓰면 안 됨');
});
```

- [ ] **Step 2: 실패 확인**

```bash
node --test test/
```
Expected: FAIL — `newProblem이 있어야`

- [ ] **Step 3: 출제 + 부트스트랩 + 렌더 구현**

Task 5에서 넣은 스텁
```js
function renderMulti(){ /* Task 6에서 채운다 */ }
```
을 통째로 다음으로 교체:
```js
/* ---------- 같이하기: 출제 · meta · 렌더 ---------- */
// 새 문제 조각을 만든다. 정답은 절대 넣지 않는다(DB에 올라가므로).
function newProblem(mode, meta){
  if(mode === 'chain'){
    const seeds = shuffle(SEED_WORDS.slice());
    const seed = seeds.find(s => hasContinuation([...s].pop(), WORD_ALL, [s])) || seeds[0];
    const used = {}; used[seed] = true;
    return { need: [...seed].pop(), chain: [seed], used };
  }
  const idx = chosungIndex();
  // 규칙이 허용하는 meta 필드는 정해져 있다. 초성도 'used'를 쓴다(끝말잇기는 낱말,
  // 초성은 패턴을 담는다 — 방 하나는 게임 하나라 섞이지 않는다). usedPat 같은 새 이름은
  // meta.$other가 막아서 쓰기가 거부된다.
  const seen = (meta && meta.used) ? meta.used : {};
  const pool = idx.easy.filter(p => !seen[p]);
  const pick = shuffle((pool.length ? pool : idx.easy).slice())[0];
  return { pattern: pick };
}

function isHost(){ return MG && MG.hostUid === MG.uid; }

function bootstrapMeta(){
  if(!isHost()) return;
  MG.ref.child('meta').transaction(m=>{
    if(m) return;                                   // 이미 있으면 손대지 않음
    const p = newProblem(MG.mode, null);
    return Object.assign({
      gameId: 1, round: 1, phase: 'play',
      startedAt: firebase.database.ServerValue.TIMESTAMP
    }, p);
  });
}

function renderMulti(){
  const m = MG && MG.meta;
  if(!m){ mSay('첫 문제를 준비 중이야…'); return; }
  $('multi-round').textContent = m.round;
  $('multi-endbox').classList.toggle('hidden', m.phase !== 'over');
  $('multi-play').classList.toggle('hidden', m.phase === 'over');

  if(MG.mode === 'chain'){
    const words = m.chain ? Object.values(m.chain) : [];
    $('multi-flow').innerHTML = words.map((w,i)=>
      '<span class="' + (i===words.length-1 ? 'last' : '') + '">' + escapeHtml(w) + '</span>'
    ).join(' → ');
    $('multi-need').innerHTML = '다음은 ‘<b>' + escapeHtml(m.need||'') + '</b>’로 시작!';
  }else{
    $('multi-pattern').textContent = [...(m.pattern||'')].join(' ');
  }

  if(m.phase === 'play'){
    $('multi-input').disabled = false;
    $('multi-submit').disabled = false;
    if(MG.mode==='chain') mSay('자, ‘<b>' + escapeHtml(m.need||'') + '</b>’로 시작하는 낱말!');
    else mSay('이 초성으로 된 낱말은?');
  }
  renderSwapUI();
}
function renderSwapUI(){ /* Task 8에서 채운다 */ }
```

- [ ] **Step 4: `enterRoom`에 meta 구독 추가**

`enterRoom()` 안의 `MG.subs.push(()=> MG.ref.child('presence').off('value', onPresence));` **바로 뒤**에 추가:
```js
  const onMeta = MG.ref.child('meta').on('value', snap=>{
    MG.meta = snap.val();
    if(!MG.meta) bootstrapMeta();
    renderMulti();
  });
  MG.subs.push(()=> MG.ref.child('meta').off('value', onMeta));
```

`onPresence` 콜백의 `renderPlayers();` **바로 뒤**에 추가(호스트가 된 순간 부트스트랩):
```js
    if(!MG.meta) bootstrapMeta();
```

- [ ] **Step 5: 통과 확인**

```bash
node --test test/
```
Expected: PASS

- [ ] **Step 6: 브라우저 2개로 같은 문제 확인**

```bash
cd /home/epicurean/homespace/nunus/public && python3 -m http.server 8777 &
sleep 1
google-chrome --new-window http://localhost:8777/ >/dev/null 2>&1 &
google-chrome --incognito http://localhost:8777/ >/dev/null 2>&1 &
```
확인할 것: 두 창이 `👥 같이 하기` 입장 → **양쪽에 똑같은 문제**가 뜬다. 초성게임도 같은 초성이 뜬다.

```bash
kill %1
firebase database:remove /nunus --force --project nearby-58e2d
```

- [ ] **Step 7: 커밋**

```bash
git add public/index.html test/logic.test.mjs
git commit -m "$(cat <<'EOF'
Pose the shared problem: meta bootstrap, rendering

The host creates round 1 through a transaction so two clients arriving together
cannot both seed the room. newProblem returns only the pieces that are safe to
publish — need/chain for 끝말잇기, pattern for 초성 — and never the answer,
since anything in meta is readable by every player in the room.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: 답 제출 · 레이스 판정 · 점수 · 라운드 진행 · 게임 종료

같이하기의 심장. `meta` 트랜잭션으로 정확히 한 명만 승자가 된다.

**Files:**
- Modify: `public/index.html`
- Modify: `test/logic.test.mjs`

**Interfaces:**
- Consumes: Task 6 (`renderMulti`, `MG.meta`)
- Produces:
  - `submitMulti()` — 로컬 검증 → `meta` 트랜잭션 → 이긴 경우만 점수 +1
  - `hostTick()` — 호스트: reveal 3초 후 다음 라운드, `round > MULTI_ROUNDS`면 `phase='over'`
  - `restartMulti()` — 아무나. `gameId+1`, `round=1`

- [ ] **Step 1: 배선 테스트 작성**

`test/logic.test.mjs` 끝에 추가:
```js
test('public/index.html: 같이하기 승부/점수 배선', () => {
  const html = readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');
  assert.match(html, /function submitMulti\(/, 'submitMulti가 있어야');
  assert.match(html, /function hostTick\(/, 'hostTick이 있어야');
  assert.match(html, /function restartMulti\(/, 'restartMulti가 있어야');
  assert.match(html, /\.child\('meta'\)\.transaction\(/, '승부는 meta 트랜잭션이어야');
  assert.match(html, /scores\/'\s*\+\s*[\s\S]{0,60}gameId/, '점수는 gameId로 키잉해야');
  assert.match(html, /MULTI_ROUNDS/, '라운드 상한을 써야');
});
```

- [ ] **Step 2: 실패 확인**

```bash
node --test test/
```
Expected: FAIL — `submitMulti가 있어야`

- [ ] **Step 3: 제출·판정·진행 구현**

`function renderSwapUI(){ /* Task 8에서 채운다 */ }` **바로 앞**에 삽입:
```js
/* ---------- 같이하기: 제출 · 판정 · 진행 ---------- */
function mFeedback(t){ $('multi-feedback').textContent = t; }

// 로컬 검증. 통과해야만 트랜잭션을 건다.
function checkMultiAnswer(word){
  const m = MG.meta;
  if(MG.mode === 'chain'){
    const used = m.used ? Object.keys(m.used) : [];
    const r = chainCheck(m.chain ? Object.values(m.chain).pop() : '', word, used, WORD_SET);
    if(!r.ok) return r.reason;
    return null;
  }
  if(!word || [...word].some(c=>!isHangulSyllable(c))) return 'notword';
  if(chosungOf(word) !== m.pattern) return 'pattern';
  if(!WORD_SET.has(word)) return 'notindict';   // chainCheck가 쓰는 코드와 같은 이름으로
  return null;
}

function submitMulti(){
  const m = MG && MG.meta;
  if(!m || m.phase !== 'play') return;
  const word = norm($('multi-input').value);
  if(!word){ $('multi-input').focus(); return; }

  const bad = checkMultiAnswer(word);
  if(bad){
    // 코드 이름은 CORE의 chainCheck가 돌려주는 것과 같아야 한다:
    // empty | notword | start | reuse | notindict (+ 초성 전용 pattern)
    mFeedback({
      start:'‘' + (m.need||'') + '’로 시작하는 낱말이에요!',
      reuse:'이미 쓴 낱말이에요',
      notword:'한글 낱말을 입력해요',
      pattern:'초성이 달라요',
      notindict:'사전에 없는 낱말이에요',
      empty:''
    }[bad] || '다시 해볼까요?');
    return;
  }

  const myName = MG.name, myUid = MG.uid, mode = MG.mode;
  MG.ref.child('meta').transaction(cur=>{
    if(!cur || cur.phase !== 'play' || cur.winner) return;      // 남이 먼저 → abort
    if(mode === 'chain'){
      if([...word][0] !== cur.need) return;
      if(cur.used && cur.used[word]) return;
      cur.chain = cur.chain || []; cur.chain.push(word);
      cur.used = cur.used || {}; cur.used[word] = true;
      cur.need = [...word].pop();
    }else{
      if(chosungOf(word) !== cur.pattern) return;
      cur.used = cur.used || {}; cur.used[cur.pattern] = true;   // 규칙 허용 필드는 used뿐
    }
    cur.winner = myUid; cur.winnerName = myName; cur.answer = word; cur.phase = 'reveal';
    cur.swap = null;
    return cur;
  }, (err, committed)=>{
    $('multi-input').value = '';
    if(err || !committed) return;                                // 졌으면 조용히
    MG.ref.child('scores/' + MG.meta.gameId + '/' + myUid)
      .transaction(s => (s||0) + 1);
  });
}

// 호스트만: reveal 3초 후 다음 라운드 / 10라운드 후 종료
let hostTimer = null;
function hostTick(){
  if(!MG || !isHost() || !MG.meta) return;
  const m = MG.meta;
  if(m.phase !== 'reveal') return;
  if(hostTimer) return;
  hostTimer = setTimeout(()=>{
    hostTimer = null;
    if(!MG || !isHost() || !MG.meta || MG.meta.phase !== 'reveal') return;
    MG.ref.child('meta').transaction(cur=>{
      if(!cur || cur.phase !== 'reveal') return;
      if(cur.round >= MULTI_ROUNDS){ cur.phase = 'over'; return cur; }
      cur.round = cur.round + 1;
      cur.phase = 'play'; cur.winner = null; cur.winnerName = null; cur.answer = null;
      cur.startedAt = Date.now(); cur.swap = null;
      if(MG.mode === 'chosung') Object.assign(cur, newProblem('chosung', cur));
      return cur;                                                // chain은 need가 이미 이어짐
    });
  }, REVEAL_MS);
}

function restartMulti(){
  MG.ref.child('meta').transaction(cur=>{
    if(!cur) return;
    const p = newProblem(MG.mode, null);
    return Object.assign({
      gameId: (cur.gameId||1) + 1, round: 1, phase: 'play',
      startedAt: Date.now()
    }, p);
  });
}
```

- [ ] **Step 4: `renderMulti`에 reveal 중계 · 종료 순위 추가**

`renderMulti()` 안의 `if(m.phase === 'play'){ ... }` 블록 **바로 뒤**에 삽입:
```js
  if(m.phase === 'reveal'){
    $('multi-input').disabled = true;
    $('multi-submit').disabled = true;
    if(m.winner === MG.uid) mSay('🎉 이겼어요! ‘<b>' + escapeHtml(m.answer||'') + '</b>’');
    else mSay(escapeHtml(m.winnerName||'누군가') + '가 ‘<b>' + escapeHtml(m.answer||'') + '</b>’로 먼저 맞혔어!');
    hostTick();
  }
  if(m.phase === 'over'){
    const rank = MG.members.map(x=>({ name: x.uid===MG.uid?'나':(x.name||'?'),
                                      score: (MG.scoreCache||{})[x.uid]||0 }))
                           .sort((a,b)=> b.score - a.score);
    const medal = ['🥇','🥈','🥉'];
    $('multi-endtext').textContent = '게임 끝!';
    $('multi-standings').innerHTML = rank.map((r,i)=>
      (medal[i]||'　') + ' ' + escapeHtml(r.name) + ' — ' + r.score).join('<br>');
    mSay(rank.length ? (escapeHtml(rank[0].name) + ' 우승! 다시 할까?') : '게임 끝!');
  }
```

- [ ] **Step 5: `enterRoom`에 점수 구독 추가**

`enterRoom()` 안 `MG.subs.push(()=> MG.ref.child('meta').off('value', onMeta));` **바로 뒤**에 추가:
```js
  const onScores = MG.ref.child('scores').on('value', snap=>{
    const all = snap.val() || {};
    MG.scoreCache = (MG.meta && all[MG.meta.gameId]) || {};
    renderPlayers();
    if(MG.meta && MG.meta.phase === 'over') renderMulti();
  });
  MG.subs.push(()=> MG.ref.child('scores').off('value', onScores));
```

- [ ] **Step 6: 바인딩 추가**

`$('multi-home2').addEventListener('click', leaveMulti);` 아래에 추가:
```js
$('multi-submit').addEventListener('click', submitMulti);
$('multi-input').addEventListener('keydown', e=>{ if(e.key==='Enter') submitMulti(); });
$('multi-restart').addEventListener('click', restartMulti);
```

- [ ] **Step 7: 통과 확인**

```bash
node --test test/
```
Expected: PASS

- [ ] **Step 8: 커밋**

```bash
git add public/index.html test/logic.test.mjs
git commit -m "$(cat <<'EOF'
Resolve the round race through a meta transaction

Both players validate locally, then race a transaction that only commits if
phase is still 'play' and winner is still null — so simultaneous correct
answers produce exactly one winner, and only that client writes its own +1.
Scores are keyed by gameId, so 다시 시작 starts everyone at zero without a
reset write that the increment-only rules would reject anyway.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 8: 문제 교체 요청 (투표)

막혔을 때 빠져나오는 유일한 길. 침묵을 동의로 친다.

**Files:**
- Modify: `public/index.html`
- Modify: `test/logic.test.mjs`

**Interfaces:**
- Consumes: Task 3 (`swapOutcome`), Task 7 (`renderMulti`)
- Produces:
  - `askSwap()` / `voteSwap(ok)` / `tallySwap()` / `renderSwapUI()`

- [ ] **Step 1: 배선 테스트 작성**

`test/logic.test.mjs` 끝에 추가:
```js
test('public/index.html: 문제 교체 요청 배선', () => {
  const html = readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');
  assert.match(html, /function askSwap\(/, 'askSwap이 있어야');
  assert.match(html, /function voteSwap\(/, 'voteSwap이 있어야');
  assert.match(html, /function tallySwap\(/, 'tallySwap이 있어야');
  assert.match(html, /swapOutcome\(/, 'CORE의 swapOutcome을 써야');
  assert.match(html, /SWAP_VOTE_MS/, '투표 마감 상수를 써야');
  assert.match(html, /SWAP_COOL_MS/, '거부 쿨다운 상수를 써야');
  // 표는 presence 아래에만
  assert.match(html, /presence\/'\s*\+\s*MG\.uid\s*\+\s*'\/vote/, '표는 내 presence 아래에 써야');
});
```

- [ ] **Step 2: 실패 확인**

```bash
node --test test/
```
Expected: FAIL — `askSwap이 있어야`

- [ ] **Step 3: `renderSwapUI` 스텁을 실제 구현으로 교체**

`function renderSwapUI(){ /* Task 8에서 채운다 */ }` 를 통째로 다음으로 교체:
```js
/* ---------- 같이하기: 문제 교체 요청 ---------- */
function myVote(){
  const me = MG.members.find(x=>x.uid===MG.uid);
  return me && me.vote ? me.vote : null;
}
function askSwap(){
  const m = MG.meta; if(!m || m.phase!=='play') return;
  if(m.swapCool && Date.now() < m.swapCool) return;
  // 요청을 먼저 확정하고, 확정된 until을 req로 삼아 자동 찬성표를 던진다.
  MG.ref.child('meta').transaction(cur=>{
    if(!cur || cur.phase!=='play' || cur.swap) return;
    if(cur.swapCool && Date.now() < cur.swapCool) return;
    cur.swap = { by: MG.uid, round: cur.round, until: Date.now() + SWAP_VOTE_MS };
    return cur;
  }, (err, committed, snap)=>{
    if(err || !committed) return;
    const s = snap.val();
    if(s && s.swap) MG.ref.child('presence/' + MG.uid + '/vote')
                          .set({ req: s.swap.until, ok: true });
  });
}
function voteSwap(ok){
  const m = MG.meta; if(!m || !m.swap) return;
  MG.ref.child('presence/' + MG.uid + '/vote').set({ req: m.swap.until, ok: !!ok });
}

// 호스트만 집계·확정한다. presence/meta가 바뀔 때마다 재평가 + 마감용 타이머 1개.
let swapTimer = null;
function tallySwap(){
  if(!MG || !isHost() || !MG.meta) return;
  const m = MG.meta;
  const votes = MG.members.map(x=>x.vote).filter(Boolean);
  const out = swapOutcome(m.swap, votes, MG.members.length, Date.now(), m.round);

  if(out === 'wait'){
    if(!swapTimer){
      const ms = Math.max(250, (m.swap.until - Date.now()) + 250);
      swapTimer = setTimeout(()=>{ swapTimer = null; tallySwap(); }, ms);
    }
    return;
  }
  if(swapTimer){ clearTimeout(swapTimer); swapTimer = null; }

  if(out === 'cancel'){
    MG.ref.child('meta').update({ swap: null, swapCool: Date.now() + SWAP_COOL_MS });
    return;
  }
  if(out === 'swap'){
    MG.ref.child('meta').transaction(cur=>{
      if(!cur || !cur.swap || cur.swap.round !== cur.round) return;
      // 버린 패턴도 used에 넣는다 — 안 그러면 바로 다시 뽑혀 나올 수 있다
      if(MG.mode === 'chosung' && cur.pattern){
        cur.used = cur.used || {}; cur.used[cur.pattern] = true;
      }
      Object.assign(cur, newProblem(MG.mode, cur));
      cur.swap = null; cur.startedAt = Date.now();
      return cur;
    });
    return;
  }
  if(out === 'stale'){ MG.ref.child('meta').update({ swap: null }); }
}
// 표를 지우는 함수는 없다. 표는 req(=그 요청의 until)로 묶여 있어서 다음 요청에는
// 애초에 안 딸려온다. 게다가 규칙상 남의 표는 지울 수도 없다.

function renderSwapUI(){
  const el = $('multi-swap'); if(!el) return;
  const m = MG && MG.meta;
  if(!m || m.phase !== 'play'){ el.innerHTML = ''; return; }

  const mv = myVote();
  const now = Date.now();
  if(!m.swap){
    if(m.swapCool && now < m.swapCool){
      el.innerHTML = '<button class="btn btn-soft" disabled>🔄 문제 교체 요청</button>';
      mSay('방금 거부됐어. 조금만 더 생각해보자!');
    }else{
      el.innerHTML = '<button class="btn btn-soft" id="multi-swap-ask">🔄 문제 교체 요청</button>';
      $('multi-swap-ask').addEventListener('click', askSwap);
    }
    tallySwap();
    return;
  }

  const votes = MG.members.map(x=>x.vote).filter(v=>v && v.req===m.swap.until);
  const yes = votes.filter(v=>v.ok===true).length;
  const left = Math.max(0, Math.ceil((m.swap.until - now)/1000));
  const tally = '동의 ' + yes + '/' + MG.members.length + ' · ' + left + '초';

  if(m.swap.by === MG.uid){
    el.innerHTML = '<span class="chain-hint">' + tally + '</span>';
    mSay('교체 요청했어! 다들 괜찮으면 ' + Math.ceil(SWAP_VOTE_MS/1000) + '초 뒤 바뀐다');
  }else if(mv && mv.req === m.swap.until){
    el.innerHTML = '<span class="chain-hint">' + (mv.ok ? '👍 동의함' : '👎 거부함') + ' · ' + tally + '</span>';
  }else{
    el.innerHTML = '<button class="btn btn-soft" id="multi-swap-yes">👍 동의</button>' +
                   '<button class="btn btn-soft" id="multi-swap-no">👎 거부</button>' +
                   '<span class="chain-hint">' + tally + '</span>';
    $('multi-swap-yes').addEventListener('click', ()=>voteSwap(true));
    $('multi-swap-no').addEventListener('click', ()=>voteSwap(false));
    const who = (MG.members.find(x=>x.uid===m.swap.by)||{}).name || '누군가';
    mSay(escapeHtml(who) + '가 문제를 바꾸재. 싫으면 ' + left + '초 안에 거부해!');
  }
  tallySwap();
}
```

- [ ] **Step 4: 초 단위 카운트다운을 위해 주기 리렌더 추가**

`enterRoom()` 끝(`MG.subs.push(()=> MG.ref.child('scores').off('value', onScores));` 뒤)에 추가:
```js
  const tick = setInterval(()=>{ if(MG && MG.meta && MG.meta.swap) renderSwapUI(); }, 1000);
  MG.subs.push(()=> clearInterval(tick));
```

- [ ] **Step 5: 통과 확인**

```bash
node --test test/
```
Expected: PASS

- [ ] **Step 6: 커밋**

```bash
git add public/index.html test/logic.test.mjs
git commit -m "$(cat <<'EOF'
Add the problem-swap vote

Anyone stuck can request a swap; it carries when everyone agrees or when 20s
pass with no objection. Silence is consent on purpose — that is what keeps an
idle tab from freezing the round, which is the failure mode a unanimous vote
would have had. A single reject cancels it and starts a 30s cooldown.

Votes are written to presence/{uid}/vote, the one place the rules already tie
to auth.uid, and carry their round so they expire on their own. The host tallies
via the CORE swapOutcome that Task 3 put under test.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 9: 브라우저 2개 실제 검증 (레이스 · 교체 · 승계)

단위 테스트로는 못 잡는 것들 — 동시 제출, 묵시적 동의, 호스트 승계 — 을 진짜 브라우저 두 개로 확인한다.

**Files:**
- Create: `test/multi-race.mjs`

**Interfaces:**
- Consumes: Task 5~8 전부
- Produces: `node test/multi-race.mjs` 로 돌리는 통합 검증

- [ ] **Step 1: puppeteer 설치**

```bash
cd /home/epicurean/homespace/nunus
export NVM_DIR="$HOME/.nvm"; [ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"
npm init -y >/dev/null
npm i -D puppeteer
```
Expected: 설치 완료. `node_modules/`는 커밋하지 않는다(다음 스텝에서 `.gitignore` 처리).

- [ ] **Step 2: `.gitignore` 추가**

`.gitignore` 생성(없으면):
```
node_modules/
package-lock.json
```

- [ ] **Step 3: 통합 검증 스크립트 작성**

`test/multi-race.mjs` 생성:
```js
// 브라우저 2개로 같이하기를 실제로 굴려 본다.
// 사용법: python3 -m http.server 8777 (public/에서) 후 node test/multi-race.mjs
import puppeteer from 'puppeteer';
import assert from 'node:assert/strict';

const URL_ = 'http://localhost:8777/';
const sleep = ms => new Promise(r=>setTimeout(r, ms));

async function join(browser, nick){
  const p = await browser.newPage();
  await p.goto(URL_, { waitUntil:'networkidle2' });
  await p.evaluate(()=> localStorage.clear());
  await p.reload({ waitUntil:'networkidle2' });
  await p.click('.mode-card.chain');
  await p.waitForSelector('#modepick-multi', { visible:true });
  await p.click('#modepick-multi');
  await p.waitForSelector('#multi-nick-input', { visible:true });
  await p.type('#multi-nick-input', nick);
  await p.click('#multi-nick-ok');
  await p.waitForSelector('#multi-play:not(.hidden)');
  return p;
}
const need  = p => p.$eval('#multi-need b', e=>e.textContent);
const bub   = p => p.$eval('#multi-bubble', e=>e.textContent);
const round = p => p.$eval('#multi-round', e=>e.textContent);

const browser = await puppeteer.launch({ headless:'new', args:['--no-sandbox'] });
try{
  const A = await join(browser, '가가');
  const B = await join(browser, '나나');
  await sleep(1500);

  // 1) 같은 문제
  const nA = await need(A), nB = await need(B);
  assert.equal(nA, nB, '두 브라우저가 같은 문제를 봐야');
  console.log('ok   같은 문제:', nA);

  // 2) 동시 제출 → 정확히 한 명만 승자
  const word = await A.evaluate(n => findHint(n, WORD_ALL, []), nA);
  assert.ok(word, '이을 낱말이 있어야');
  await Promise.all([
    A.type('#multi-input', word).then(()=>A.click('#multi-submit')),
    B.type('#multi-input', word).then(()=>B.click('#multi-submit')),
  ]);
  await sleep(1500);
  const [ba, bb] = [await bub(A), await bub(B)];
  const wins = [ba, bb].filter(t=>t.includes('이겼어요')).length;
  assert.equal(wins, 1, '동시 제출 시 승자는 정확히 한 명이어야 (실제: ' + wins + ')');
  console.log('ok   승자 한 명 —', ba.slice(0,24), '|', bb.slice(0,24));

  // 3) 3초 후 둘 다 다음 라운드
  await sleep(3500);
  assert.equal(await round(A), '2', 'A가 2라운드여야');
  assert.equal(await round(B), '2', 'B가 2라운드여야');
  console.log('ok   3초 후 양쪽 다 2라운드');

  // 4) 교체 요청 — B가 침묵해도 20초 뒤 묵시적 동의
  const before = await need(A);
  await A.click('#multi-swap-ask');
  await sleep(1500);
  assert.ok((await bub(B)).includes('바꾸재'), 'B에게 교체 요청이 보여야');
  console.log('ok   교체 요청이 상대에게 보임');
  await sleep(21000);                       // B는 아무것도 안 함
  const after = await need(A);
  assert.notEqual(after, before, '20초 침묵 후 문제가 바뀌어야 (묵시적 동의)');
  console.log('ok   침묵 20초 → 교체됨:', before, '→', after);

  // 5) 호스트가 나가도 남은 쪽이 진행
  await A.close();
  await sleep(2000);
  const w2 = await B.evaluate(n => findHint(n, WORD_ALL, []), await need(B));
  await B.type('#multi-input', w2); await B.click('#multi-submit');
  await sleep(1500);
  assert.ok((await bub(B)).includes('이겼어요'), '호스트 이탈 후에도 진행돼야');
  console.log('ok   호스트 이탈 후 승계 정상');

  console.log('\n전부 통과');
}finally{
  await browser.close();
}
```

- [ ] **Step 4: 서버 띄우고 실행**

```bash
cd /home/epicurean/homespace/nunus/public && python3 -m http.server 8777 >/dev/null 2>&1 &
sleep 1
cd /home/epicurean/homespace/nunus
export NVM_DIR="$HOME/.nvm"; [ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"
node test/multi-race.mjs
```
Expected: `전부 통과`.

**실패하면 고칠 것.** 특히 "승자는 정확히 한 명"이 깨지면 트랜잭션 설계가 잘못된 것이니 멈추고 보고할 것.

- [ ] **Step 5: 정리**

```bash
kill %1
firebase database:remove /nunus --force --project nearby-58e2d
firebase database:get /nunus --project nearby-58e2d
```
Expected: `null`

- [ ] **Step 6: 전체 회귀 재확인**

```bash
node --test test/
```
Expected: PASS — 혼자하기 무손상 최종 확인.

- [ ] **Step 7: 커밋**

```bash
git add test/multi-race.mjs .gitignore package.json
git commit -m "$(cat <<'EOF'
Verify the race and the swap vote with two real browsers

The two claims that matter cannot be unit tested: that simultaneous identical
answers produce exactly one winner, and that a swap carries when the other
player stays silent for 20s. This drives both in real Chrome instances against
the real database, plus host handover when the host closes their tab.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 10: 배포

**Files:** 없음 (배포만)

- [ ] **Step 1: DB가 비어 있는지 확인**

```bash
firebase database:get /nunus --project nearby-58e2d
```
Expected: `null`. 아니면 `firebase database:remove /nunus --force`.

- [ ] **Step 2: 배포**

```bash
cd /home/epicurean/homespace/nunus
firebase deploy --only hosting,database --project nearby-58e2d
```
Expected: `Deploy complete!`

- [ ] **Step 3: 실제 URL에서 확인**

`https://nunus-1911.web.app/` 를 폰과 PC에서 각각 열어 `👥 같이 하기`로 같은 방에 들어가 한 라운드를 겨뤄 본다. 혼자하기도 예전 그대로인지 확인.

---

## 검증 요약

| 무엇을 | 어떻게 | 어느 태스크 |
|---|---|---|
| 혼자하기 무손상 | `node --test test/` (기존 스위트 전부) | 1, 매 태스크 |
| 교체 투표 집계 | CORE 단위 테스트 7개 | 3 |
| 표 위조 차단 | `bash test/rules-check.sh` — 남의 vote 쓰기 401 | 2 |
| 동시 제출 → 승자 1명 | `node test/multi-race.mjs` | 9 |
| 침묵 20초 → 묵시적 동의 | `node test/multi-race.mjs` | 9 |
| 호스트 승계 | `node test/multi-race.mjs` | 9 |
| 같은 문제 공유 | `node test/multi-race.mjs` + 수동 | 6, 9 |
