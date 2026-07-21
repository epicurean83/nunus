# 입력 잠금 판단의 단일 소유자 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 같이하기 게임 입력의 잠금 여부를 순수 함수 하나가 판단하게 하고, 그 과정에서 교체 투표 중 입력이 풀리는 결함을 없앤다.

**Architecture:** 다섯 조건(phase·online·editing·busy·voting)을 받아 `{input, submit}`을 돌려주는 순수 함수 `inputLock`을 CORE에 두고, `MG`에서 값을 읽어 DOM에 반영하는 얇은 래퍼 `syncInputLock()`을 만든다. `disabled`를 직접 대입하던 여덟 지점을 전부 래퍼 호출로 바꾼다. 결함 수정은 별도 작업이 아니라 이 교체의 부산물이다 — `renderMulti`의 `play` 분기가 래퍼를 거치는 순간 `voting`을 보게 된다.

**Tech Stack:** 바닐라 JS 단일 파일(`public/index.html`), Firebase RTDB compat SDK, `node:test`(순수 로직), puppeteer(통합).

## Global Constraints

- 모든 앱 코드는 `public/index.html` 한 파일 안에 있다. 빌드 단계 없음, 새 파일 없음.
- 순수 로직은 반드시 `/* CORE:START */` ~ `/* CORE:END */` 사이에 둔다. `test/logic.test.mjs`가 이 구간만 잘라내 평가한다.
- `test/logic.test.mjs`에서 새 함수를 쓰려면 파일 상단 `CORE_NAMES` 배열에 이름을 추가해야 한다. 추가하지 않으면 `undefined`가 반환된다.
- `MG.online`은 첫 `.info/connected` 이벤트 전까지 `undefined`이며, 이는 온라인으로 취급한다(새 세션이 시작부터 잠기지 않게 하려는 기존 규칙). 판정식은 `MG.online !== false`다.
- 위키 조회 중(`multiBusy`)에는 확인 버튼만 잠기고 입력창은 열려 있어 계속 타이핑할 수 있다. 이 동작을 보존한다.
- 말풍선 문구 로직은 건드리지 않는다. 잠금과 문구는 별개다.
- 사용자에게 보이는 문구와 주석은 한국어 반말체(🦉 마스코트 화법)를 따른다.
- 혼자하기 모드 코드는 건드리지 않는다.
- 기존 로직 테스트 71개는 전부 통과 상태를 유지한다.

---

### Task 1: `inputLock` 순수 함수

**Files:**
- Modify: `public/index.html` (CORE 블록 안, `nickChange` 함수 뒤 ~826줄)
- Test: `test/logic.test.mjs`

**Interfaces:**
- Consumes: 없음(순수 함수, 다른 CORE 함수에 의존하지 않는다)
- Produces: `inputLock({ phase, online, editing, busy, voting }) -> { input: boolean, submit: boolean }`
  - 반환값은 "열려야 하는가"다. 호출부가 `disabled = !값`으로 뒤집는다.
  - Task 2의 `syncInputLock()`이 이 함수의 유일한 호출자다.

- [ ] **Step 1: 실패하는 테스트 작성**

`test/logic.test.mjs` 맨 끝에 추가한다.

```js
test('inputLock: 다섯 조건이 모두 통과하면 둘 다 열린다', () => {
  const { inputLock } = loadCore();
  assert.deepEqual(
    inputLock({ phase:'play', online:true, editing:false, busy:false, voting:false }),
    { input:true, submit:true });
});

test('inputLock: play가 아니면 다른 조건과 무관하게 둘 다 닫힌다', () => {
  const { inputLock } = loadCore();
  for(const phase of ['reveal','over',null,undefined]){
    assert.deepEqual(
      inputLock({ phase, online:true, editing:false, busy:false, voting:false }),
      { input:false, submit:false }, 'phase=' + phase);
  }
});

test('inputLock: 교체 투표 중이면 둘 다 닫힌다', () => {
  const { inputLock } = loadCore();
  assert.deepEqual(
    inputLock({ phase:'play', online:true, editing:false, busy:false, voting:true }),
    { input:false, submit:false });
});

test('inputLock: 이름 편집 중이면 둘 다 닫힌다', () => {
  const { inputLock } = loadCore();
  assert.deepEqual(
    inputLock({ phase:'play', online:true, editing:true, busy:false, voting:false }),
    { input:false, submit:false });
});

test('inputLock: 오프라인이면 둘 다 닫힌다', () => {
  const { inputLock } = loadCore();
  assert.deepEqual(
    inputLock({ phase:'play', online:false, editing:false, busy:false, voting:false }),
    { input:false, submit:false });
});

test('inputLock: 위키 조회 중에는 입력창만 열리고 확인 버튼은 닫힌다', () => {
  const { inputLock } = loadCore();
  assert.deepEqual(
    inputLock({ phase:'play', online:true, editing:false, busy:true, voting:false }),
    { input:true, submit:false });
});

test('inputLock: busy 말고는 input과 submit이 갈리지 않는다', () => {
  const { inputLock } = loadCore();
  // busy를 false로 고정하면 32가지 조합 어디서도 두 값이 달라지지 않아야 한다.
  for(const phase of ['play','reveal']) for(const online of [true,false])
  for(const editing of [true,false]) for(const voting of [true,false]){
    const r = inputLock({ phase, online, editing, busy:false, voting });
    assert.equal(r.input, r.submit,
      JSON.stringify({ phase, online, editing, voting }) + ' → ' + JSON.stringify(r));
  }
});
```

- [ ] **Step 2: `CORE_NAMES`에 등록**

`test/logic.test.mjs` 상단 `CORE_NAMES` 배열의 마지막 줄을 바꾼다.

```js
  'pickHost','swapOutcome','nickChange','inputLock'
```

- [ ] **Step 3: 실패 확인**

Run: `node test/logic.test.mjs 2>&1 | tail -20`
Expected: FAIL — `inputLock is not a function`. `fail 7`.

- [ ] **Step 4: 구현**

`public/index.html`의 `nickChange` 함수 바로 뒤, `/* CORE:END */` 앞에 추가한다.

```js
// 게임 입력이 열려야 하는지를 판단하는 유일한 자리. 이 판단이 여러 곳에 흩어져 있으면
// 조건이 늘 때마다 한 곳씩 빠뜨린다(실제로 세 번 그랬다). 조건은 여기서만 바꾼다.
// 입력창과 확인 버튼이 갈리는 경우는 위키 조회 중(busy)뿐이다 — 그때도 타이핑은 계속할 수 있다.
function inputLock({ phase, online, editing, busy, voting }){
  const on = phase === 'play' && !!online && !editing && !voting;
  return { input: on, submit: on && !busy };
}
```

- [ ] **Step 5: 통과 확인**

Run: `node test/logic.test.mjs 2>&1 | tail -8`
Expected: `pass 78`, `fail 0`

- [ ] **Step 6: 커밋**

```bash
git add public/index.html test/logic.test.mjs
git commit -m "Add inputLock, the one place that decides if the game input is open"
```

---

### Task 2: `syncInputLock` 래퍼와 여덟 지점 교체

**Files:**
- Modify: `public/index.html` — `syncInputLock` 신설(`renderPlayers` 앞), `askNick`, `onCon` 오프라인 분기, `renderMulti`, `submitMulti`, `renderSwapUI`

**Interfaces:**
- Consumes: Task 1의 `inputLock({phase, online, editing, busy, voting}) -> {input, submit}`
- Produces: `syncInputLock()` — 인자도 반환값도 없다. `MG`와 `multiBusy`를 읽어 `#multi-input`/`#multi-submit`의 `disabled`를 맞춘다. Task 3의 통합 테스트는 이 함수를 직접 부르지 않고 DOM 상태만 관찰한다.

이 태스크는 원자적이다. 일부만 교체하면 두 판단 주체가 공존해 상태가 어긋난다. 여덟 지점을 한 번에 바꾸고 한 번에 커밋한다.

- [ ] **Step 1: `syncInputLock` 추가**

`function renderPlayers(){` 바로 앞에 넣는다.

```js
// MG의 현재 상태를 읽어 게임 입력의 잠금을 맞춘다. disabled를 직접 건드리는 곳은 이 함수뿐이다.
function syncInputLock(){
  const m = MG && MG.meta;
  const st = inputLock({
    phase:   m ? m.phase : null,
    online:  !MG || MG.online !== false,   // 첫 .info/connected 전(undefined)은 온라인으로 본다
    editing: !!(MG && MG.nickEditing),
    busy:    multiBusy,
    voting:  !!(m && m.swap)
  });
  $('multi-input').disabled  = !st.input;
  $('multi-submit').disabled = !st.submit;
}
```

- [ ] **Step 2: `askNick`의 편집 진입 교체**

기존:

```js
  if(edit){
    // 편집 중에는 게임 입력을 잠근다. renderMulti가 되살리지 못하도록 nickEditing으로 게이팅됨.
    $('multi-input').disabled = true;
    $('multi-submit').disabled = true;
  }
```

바꾼 뒤 (`MG.nickEditing`은 이 함수 첫 줄에서 이미 설정돼 있다):

```js
  // 편집 중에는 게임 입력을 잠근다 — 판단은 syncInputLock이 한다.
  if(edit) syncInputLock();
```

- [ ] **Step 3: `onCon` 오프라인 분기 교체**

기존:

```js
      mSay('연결이 끊겼어! 다시 연결 중…');
      $('multi-input').disabled = true;
      $('multi-submit').disabled = true;
      $('multi-swap').innerHTML = '';
```

바꾼 뒤 (`MG.online`은 바로 위에서 이미 갱신돼 있다):

```js
      mSay('연결이 끊겼어! 다시 연결 중…');
      syncInputLock();
      $('multi-swap').innerHTML = '';
```

- [ ] **Step 4: `renderMulti`에서 두 지점을 걷어내고 한 번만 부른다**

`play` 분기에서 두 줄을 지운다. 남는 `if(online && !editing)`은 말풍선 문구 조건이므로 그대로 둔다.

```js
  if(m.phase === 'play'){
    if(online && !editing){
      if(MG.mode==='chain') mSay('자, ‘<b>' + escapeHtml(m.need||'') + '</b>’로 시작하는 낱말!');
      else mSay('이 초성으로 된 낱말은?');
    }
    // 오프라인이면 onCon이 이미 잠금 문구를 띄워놨다 — 여기서 문구를 되돌리지 않는다.
  }
```

`reveal` 분기에서도 두 줄을 지운다.

```js
  if(m.phase === 'reveal'){
    mFeedback('');
    if(m.winner === MG.uid) mSay('🎉 이겼어요! ‘<b>' + escapeHtml(m.answer||'') + '</b>’');
    else mSay(escapeHtml(m.winnerName||'누군가') + '가 ‘<b>' + escapeHtml(m.answer||'') + '</b>’로 먼저 맞혔어!');
    hostTick();
  }
```

그리고 함수 끝의 `if(online) renderSwapUI();` **바로 앞**에 한 줄을 넣는다. 분기와 무관하게 항상 상태를 맞추므로 어떤 phase에서도 빠지지 않는다.

```js
  // phase 분기마다 따로 잠그지 않는다 — 어떤 경로로 왔든 여기서 한 번에 맞춘다.
  syncInputLock();
  // 오프라인일 때는 교체 투표 버튼도 새로 그리지 않는다 — 눌러봤자 쓰기가 조용히
  // 버려질 컨트롤을 오프라인 플레이어에게 보여주지 않기 위해서다. onCon이 끊기는
  // 순간 이미 multi-swap을 비워놨으니 그대로 둔다.
  if(online) renderSwapUI();
```

- [ ] **Step 5: `submitMulti`의 위키 조회 구간 교체**

기존:

```js
    multiBusy = true;
    $('multi-submit').disabled = true;
    mFeedback('사전에서 찾는 중…');
```

바꾼 뒤:

```js
    multiBusy = true;
    syncInputLock();
    mFeedback('사전에서 찾는 중…');
```

그리고 조회가 끝난 뒤의 중복 판정을 지운다. 기존:

```js
    const _sig = swapSigOf();
    // 위키 확인하는 동안 닉네임 편집 폼이 열렸을 수 있다 — 그럴 땐 확인 버튼을 되살리면 안 된다.
    if(!MG.nickEditing && (_sig === 'idle' || _sig === 'cooldown' || _sig === 'inactive')) $('multi-submit').disabled = false;
```

바꾼 뒤 (조회하는 동안 편집이 열렸거나 투표가 시작됐을 수 있는데, 그 판단은 래퍼가 한다):

```js
    syncInputLock();
```

- [ ] **Step 6: `renderSwapUI`의 두 지점 교체**

idle 분기. 기존:

```js
        // renderSwapUI는 1초 tick에서도 불리므로 renderMulti의 활성화에 의존하지 말고 여기서 직접 켠다.
        // 단, 닉네임 편집 폼이 열려 있으면 여기서 풀면 안 된다 — nickEditing으로 게이팅한다.
        if(!MG.nickEditing){ $('multi-input').disabled = false; $('multi-submit').disabled = false; }
```

바꾼 뒤:

```js
        // renderSwapUI는 1초 tick에서도 불리므로 renderMulti에 의존하지 말고 여기서도 맞춘다.
        syncInputLock();
```

투표 진행 분기. 기존:

```js
  if(changed){
    el.innerHTML = '';
    $('multi-input').disabled = true;
    $('multi-submit').disabled = true;
    card.classList.remove('hidden');
```

바꾼 뒤:

```js
  if(changed){
    el.innerHTML = '';
    syncInputLock();
    card.classList.remove('hidden');
```

- [ ] **Step 7: 남은 직접 대입이 없는지 전수 확인**

Run:
```bash
grep -n "multi-input').disabled\|multi-submit').disabled" public/index.html
```
Expected: `syncInputLock` 함수 안의 두 줄만 나온다. 다른 줄이 나오면 교체가 덜 된 것이다.

- [ ] **Step 8: 회귀 확인**

Run: `node test/logic.test.mjs 2>&1 | tail -8`
Expected: `pass 78`, `fail 0`

- [ ] **Step 9: 커밋**

```bash
git add public/index.html
git commit -m "Route every input lock decision through syncInputLock"
```

---

### Task 3: 통합 테스트 — 투표 중 잠금이 풀리지 않는다

**Files:**
- Modify: `test/multi-race.mjs` (`/* 4) 호스트 승계` 블록 바로 앞, 기존 이름 변경 시나리오들 뒤)

**Interfaces:**
- Consumes: `A`, `B`(`{page, ctx, nick}`), `report(name, ok, detail)`, `info(msg)`, `waitFor(page, fn, args, opts)`, `waitPhase(page, phase, timeout)`, `sleep(ms)`, 앱 전역 `MG` / `askSwap` / `SWAP_VOTE_MS`
- Produces: 없음(검증 전용)

결함 경로를 그대로 재현한다. 편집 폼은 이 시나리오에 등장하지 않는다 — 투표 중 presence 이벤트만으로 잠금이 풀렸던 것이 요점이다.

- [ ] **Step 1: 시나리오 삽입**

`/* 4) 호스트 승계 — 호스트가 탭을 닫아도 남은 쪽이 진행 */` 주석 바로 위에 붙여넣는다.

```js
  /* 3.7) 투표 중에는 presence 이벤트가 와도 입력이 풀리지 않는다 */
  {
    info('투표 잠금: B가 교체 투표를 열고, 그동안 A가 presence 이벤트를 일으킨다');
    await waitPhase(A.page, 'play', 8000).catch(() => {});

    // 직전 시나리오의 쿨다운이 남아 있으면 askSwap이 조용히 거부된다 — 풀릴 때까지 기다린다.
    await waitFor(B.page, () => {
      const m = MG && MG.meta;
      return !!m && m.phase === 'play' && !m.swap && !(m.swapCool && Date.now() < m.swapCool);
    }, [], { timeout: 40000, label: 'B가 교체 요청 가능한 상태' });

    await B.page.evaluate(() => askSwap());
    const sawVote = await waitFor(A.page, () => !!(MG.meta && MG.meta.swap), [],
      { timeout: 5000, label: 'A가 투표를 인지함' }).catch(() => false);
    report('투표 잠금: A가 교체 투표를 인지함', !!sawVote);

    const lockedOnVote = await A.page.$eval('#multi-input', e => e.disabled);
    report('투표 잠금: 투표가 열리면 A의 입력이 잠김', lockedOnVote === true,
      'disabled=' + lockedOnVote);

    // 결함의 방아쇠: 투표가 진행되는 동안 presence 쓰기를 일으켜 A의 renderMulti를 태운다.
    // 예전에는 play 분기가 meta.swap을 보지 않고 입력을 되살렸고, renderSwapUI는 서명이
    // 안 바뀌었다며 다시 잠그지 않아, 남은 투표 시간 내내 A만 답할 수 있었다.
    await A.page.evaluate(() => MG.ref.child('presence/' + MG.uid)
      .update({ name: MG.name + '!' }));
    await waitFor(A.page, () => (MG.members || []).some(x => /!$/.test(x.name || '')), [],
      { timeout: 5000, label: 'A의 presence 갱신이 되돌아옴' });
    await sleep(400);   // renderMulti/renderSwapUI가 이벤트를 처리할 여유

    const stillLocked = await A.page.$eval('#multi-input', e => e.disabled);
    const voteStillOpen = await A.page.evaluate(() => !!(MG.meta && MG.meta.swap));
    report('투표 중 presence 이벤트가 와도 입력이 잠긴 채 유지됨',
      stillLocked === true && voteStillOpen === true,
      'disabled=' + stillLocked + ' voteOpen=' + voteStillOpen);

    // 뒷정리: 이름을 되돌리고 투표를 접어 다음 블록에 영향을 주지 않게 한다.
    await A.page.evaluate(() => MG.ref.child('presence/' + MG.uid)
      .update({ name: MG.name }));
    await B.page.evaluate(() => MG.ref.child('meta/swap').remove()).catch(() => {});
    await waitFor(A.page, () => !(MG.meta && MG.meta.swap), [],
      { timeout: 5000, label: '투표가 정리됨' }).catch(() => false);
    await sleep(600);
  }
```

- [ ] **Step 2: RTDB 방 비우기(전제조건)**

통합 테스트는 `nunus/chain`, `nunus/chosung`이 비어 있어야 시작한다.

Run: `firebase database:get /nunus --shallow`

`null`이 아니면 실제 플레이어가 없는지 먼저 확인한다.

```bash
firebase database:get /nunus/chain/presence
firebase database:get /nunus/chosung/presence
```

둘 다 `null`이면(접속자 없음) 지운다. 접속자가 있으면 **중단하고 사람에게 알린다** — 실제 플레이어의 방이다.

```bash
firebase database:remove /nunus --force
firebase database:get /nunus --shallow
```
Expected: `null`

- [ ] **Step 3: 게이팅을 되돌려 실패 확인 (fail-before)**

`public/index.html`의 `renderMulti` `play` 분기에 옛 동작을 임시로 되살린다. 말풍선 두 줄은 그대로 두고 앞에 두 줄만 넣는다.

```js
  if(m.phase === 'play'){
    if(online && !editing){
      $('multi-input').disabled = false;
      $('multi-submit').disabled = false;
      if(MG.mode==='chain') mSay('자, ‘<b>' + escapeHtml(m.need||'') + '</b>’로 시작하는 낱말!');
      else mSay('이 초성으로 된 낱말은?');
    }
  }
```

터미널 1: `cd public && python3 -m http.server 8777`
터미널 2: `node test/multi-race.mjs`

Expected: `[FAIL] 투표 중 presence 이벤트가 와도 입력이 잠긴 채 유지됨 — disabled=false voteOpen=true`

이 한 줄이 나오지 않으면 테스트가 결함을 잡지 못하는 것이다. 그 경우 계획대로 진행하지 말고 사람에게 알린다.

- [ ] **Step 4: 되돌린 두 줄을 지우고 통과 확인 (pass-after)**

Step 3에서 넣은 두 줄을 지워 Task 2 상태로 되돌린다.

Run: `git diff public/index.html`
Expected: 출력 없음(Task 2 커밋과 동일)

Run: `node test/multi-race.mjs`
Expected: 모든 `[PASS]`

Run: `echo $?`
Expected: `0`

- [ ] **Step 5: 전체 회귀**

Run: `node test/logic.test.mjs 2>&1 | tail -8`
Expected: `pass 78`, `fail 0`

Run: `bash test/rules-check.sh`
Expected: 규칙 검사 통과

- [ ] **Step 6: 테스트 데이터 정리**

```bash
firebase database:get /nunus/chain/presence
firebase database:get /nunus/chosung/presence
```
둘 다 `null`이면 지운다.

```bash
firebase database:remove /nunus --force
```

- [ ] **Step 7: 커밋**

```bash
git add test/multi-race.mjs
git commit -m "Pin that a vote keeps the input locked through presence events"
```

---

### Task 4: 배포와 기록

**Files:**
- Modify: `.superpowers/sdd/progress.md`
- Modify: `.firebase/hosting.cHVibGlj.cache` (배포 부산물)

**Interfaces:**
- Consumes: Task 1~3의 완료 상태
- Produces: 없음

- [ ] **Step 1: 배포 전 회귀**

Run: `node test/logic.test.mjs 2>&1 | tail -8`
Expected: `pass 78`, `fail 0`

- [ ] **Step 2: 혼자하기 무손상 확인**

Run: `git diff main -- public/index.html`

확인: 삭제된 줄이 이 계획에서 교체하기로 한 여덟 지점과 그 주석뿐이다. 혼자하기 경로(`startChain`/`startChosung`/`submitTyped`/`nextQuestion`)에 변경이 없다.

- [ ] **Step 3: main에 머지**

```bash
git checkout main
git merge --no-ff feature/input-lock-owner -m "Merge feature/input-lock-owner: one owner for the game input lock"
node test/logic.test.mjs 2>&1 | tail -4
```
Expected: `pass 78`, `fail 0`

- [ ] **Step 4: 배포**

Run: `firebase deploy --only hosting`
Expected: `Deploy complete!`

(데이터베이스 규칙은 이번 작업에서 바뀌지 않았으므로 `--only hosting`으로 충분하다.)

- [ ] **Step 5: 라이브 검증**

Run:
```bash
curl -s https://nunus-1911.web.app/ | wc -c
wc -c < public/index.html
```
Expected: 두 값이 동일

- [ ] **Step 6: SDD 원장에 기록**

`.superpowers/sdd/progress.md` 끝에 추가한다.

```
=== 입력 잠금 단일 소유자 (2026-07-21, feature/input-lock-owner) ===
- inputLock({phase,online,editing,busy,voting}) -> {input,submit} 를 CORE에 추가.
  input = play && online && !editing && !voting / submit = input && !busy.
  input과 submit이 갈리는 경우는 위키 조회(busy)뿐 — 그때도 타이핑은 계속 가능(기존 동작 보존).
- syncInputLock()이 MG에서 값을 읽어 DOM에 반영. disabled를 직접 대입하는 곳은 이 함수뿐.
- 교체한 여덟 지점: askNick(edit), onCon(offline), renderMulti(play/reveal -> 함수 끝 1회),
  submitMulti(위키 시작/종료), renderSwapUI(idle/투표중).
- 고친 결함: renderMulti의 play 분기가 meta.swap을 보지 않아, 투표 중 presence/scores 이벤트가
  오면 남은 투표 시간 내내 입력이 열린 채 남았다(혼자만 답할 수 있는 상태).
  multi-race.mjs에 fail-before/pass-after로 증명.
- 로직 테스트 71 -> 78.
```

- [ ] **Step 7: 커밋과 푸시**

```bash
git add .superpowers/sdd/progress.md .firebase/hosting.cHVibGlj.cache
git commit -m "Record the input lock consolidation in the SDD ledger"
git push origin main
git push origin feature/input-lock-owner
```

---

## 검증 요약

| 항목 | 검증 방법 |
|---|---|
| `inputLock` 조합 판정 | `node test/logic.test.mjs` (7개 추가, 총 78개) |
| `busy`만 두 값을 가른다 | 로직 테스트 — `busy:false`로 32조합 전수 확인 |
| 직접 대입 잔존 없음 | Task 2 Step 7의 `grep` — `syncInputLock` 안 두 줄만 |
| **투표 중 잠금 유지** | `multi-race.mjs` — 옛 동작 복원 시 FAIL 확인 후 제거 |
| 기존 시나리오 무손상 | `multi-race.mjs` 전량 PASS, exit 0 |
| 혼자하기 무손상 | Task 4 Step 2 diff 검토 |
