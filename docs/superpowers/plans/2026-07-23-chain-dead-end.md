# 끝말잇기 막다른 낱말 처리 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 끝말잇기에서 이을 낱말이 없는 글자에 도달하면 게임을 끝내고 그 사실을 알린 뒤, 사용자가 새 게임을 시작할 수 있게 한다.

**Architecture:** 라운드 전환 판정을 순수 함수 `chainRoundOutcome`으로 뽑아 CORE에 두고, 같이하기는 호스트가 `hostTick`의 라운드 전환 트랜잭션에서 그 함수로 판단해 `phase`를 `over`로 보낸다. 혼자하기는 이미 있는 `hasContinuation` 검사 자리에서 `endChain()`을 부른다. 종료 사유는 RTDB에 새 필드를 쓰지 않고 `round < MULTI_ROUNDS`로 추론한다.

**Tech Stack:** 바닐라 JS 단일 파일(`public/index.html`), Firebase RTDB compat SDK, `node:test`(순수 로직), puppeteer(통합).

## Global Constraints

- 모든 앱 코드는 `public/index.html` 한 파일 안에 있다. 빌드 단계 없음, 새 파일 없음.
- 순수 로직은 반드시 `/* CORE:START */` ~ `/* CORE:END */` 사이에 둔다. `test/logic.test.mjs`가 이 구간만 잘라내 평가한다.
- `test/logic.test.mjs`에서 새 함수를 쓰려면 파일 상단 `CORE_NAMES` 배열에 이름을 추가해야 한다. 추가하지 않으면 `undefined`가 반환된다.
- `database.rules.json`은 고치지 않는다. `meta`에 `"$other": { ".validate": false }`가 걸려 있어 새 필드를 쓰면 쓰기가 거부되므로, 종료 사유는 `phase === 'over' && round < MULTI_ROUNDS`로 추론한다.
- 초성게임(`chosung`)의 동작은 바뀌지 않는다. 패턴은 매 라운드 새로 뽑히므로 막다를 일이 없다.
- 혼자하기에서 사전에 없는 낱말을 제출했을 때의 등록 경로(`showRegisterAsk`)는 건드리지 않는다.
- 사용자에게 보이는 문구와 주석은 한국어 반말체(🦉 마스코트 화법)를 따른다.
- 기존 로직 테스트 79개는 전부 통과 상태를 유지한다.

---

### Task 1: `chainRoundOutcome` 순수 함수

**Files:**
- Modify: `public/index.html` (CORE 블록 안, `inputLock` 함수 뒤 ~836줄)
- Test: `test/logic.test.mjs`

**Interfaces:**
- Consumes: `hasContinuation(need, words, used)` — 기존 CORE 함수(769줄). `used`는 낱말 **배열**을 받는다.
- Produces: `chainRoundOutcome({ mode, round, maxRounds, need, used, words }) -> 'over' | 'next'`
  - `used`는 낱말 배열이다. 같이하기의 `meta.used`는 `{낱말: true}` 객체이므로 Task 2가 `Object.keys()`로 바꿔 넘긴다.
  - Task 2의 `hostTick`이 이 함수의 유일한 호출자다.

- [ ] **Step 1: 실패하는 테스트 작성**

`test/logic.test.mjs` 맨 끝에 추가한다.

```js
test('chainRoundOutcome: 초성게임은 이을 낱말과 무관하게 라운드 수로만 끝난다', () => {
  const { chainRoundOutcome } = loadCore();
  const base = { mode:'chosung', maxRounds:10, need:'슭', used:[], words:['가지','나비'] };
  assert.equal(chainRoundOutcome({ ...base, round:3 }),  'next');
  assert.equal(chainRoundOutcome({ ...base, round:10 }), 'over');
});

test('chainRoundOutcome: 끝말잇기에서 라운드가 남고 이을 낱말이 있으면 계속한다', () => {
  const { chainRoundOutcome } = loadCore();
  assert.equal(chainRoundOutcome({
    mode:'chain', round:3, maxRounds:10, need:'나', used:['가나'], words:['가나','나비']
  }), 'next');
});

test('chainRoundOutcome: 끝말잇기에서 이을 낱말이 없으면 라운드가 남아도 끝낸다', () => {
  const { chainRoundOutcome } = loadCore();
  assert.equal(chainRoundOutcome({
    mode:'chain', round:3, maxRounds:10, need:'슭', used:['가나'], words:['가나','나비']
  }), 'over');
});

test('chainRoundOutcome: 이미 쓴 낱말밖에 없으면 이을 수 없는 것으로 본다', () => {
  const { chainRoundOutcome } = loadCore();
  assert.equal(chainRoundOutcome({
    mode:'chain', round:3, maxRounds:10, need:'나', used:['나비'], words:['가나','나비']
  }), 'over');
});

test('chainRoundOutcome: 마지막 라운드는 이을 낱말이 있어도 끝낸다', () => {
  const { chainRoundOutcome } = loadCore();
  assert.equal(chainRoundOutcome({
    mode:'chain', round:10, maxRounds:10, need:'나', used:['가나'], words:['가나','나비']
  }), 'over');
});

test('chainRoundOutcome: round가 maxRounds를 넘어서도 끝낸다', () => {
  const { chainRoundOutcome } = loadCore();
  assert.equal(chainRoundOutcome({
    mode:'chain', round:11, maxRounds:10, need:'나', used:[], words:['나비']
  }), 'over');
});
```

- [ ] **Step 2: `CORE_NAMES`에 등록**

`test/logic.test.mjs` 상단 `CORE_NAMES` 배열의 마지막 줄을 바꾼다.

```js
  'pickHost','swapOutcome','nickChange','inputLock','chainRoundOutcome'
```

- [ ] **Step 3: 실패 확인**

Run: `node test/logic.test.mjs 2>&1 | tail -20`
Expected: FAIL — `chainRoundOutcome is not a function`. `fail 6`.

- [ ] **Step 4: 구현**

`public/index.html`의 `inputLock` 함수 바로 뒤, `/* CORE:END */` 앞에 추가한다.

```js
// 라운드를 넘길지 게임을 끝낼지. 끝말잇기는 이을 낱말이 없으면 라운드가 남아도 끝낸다
// — 아무도 답할 수 없는 문제를 걸어두면 방이 그대로 멈춰버리기 때문이다.
function chainRoundOutcome({ mode, round, maxRounds, need, used, words }){
  if(round >= maxRounds) return 'over';
  if(mode !== 'chain') return 'next';
  return hasContinuation(need, words, used) ? 'next' : 'over';
}
```

- [ ] **Step 5: 통과 확인**

Run: `node test/logic.test.mjs 2>&1 | tail -8`
Expected: `pass 85`, `fail 0`

- [ ] **Step 6: 커밋**

```bash
git add public/index.html test/logic.test.mjs
git commit -m "Add chainRoundOutcome, which ends the game at a dead end"
```

---

### Task 2: 같이하기 — 막다르면 끝내고 알린다

**Files:**
- Modify: `public/index.html` — `hostTick`의 라운드 전환 트랜잭션, `renderMulti`의 `over` 분기

**Interfaces:**
- Consumes: Task 1의 `chainRoundOutcome({mode, round, maxRounds, need, used, words}) -> 'over'|'next'`, 기존 전역 `WORD_ALL`(낱말 배열), `MULTI_ROUNDS`(10)
- Produces: `phase === 'over' && round < MULTI_ROUNDS`라는 막다른 종료 신호. Task 4의 통합 테스트가 이 조건과 화면 문구를 관찰한다.

- [ ] **Step 1: `hostTick`의 라운드 전환 판정 교체**

기존 트랜잭션 본문:

```js
    MG.ref.child('meta').transaction(cur=>{
      if(!cur || cur.phase !== 'reveal') return;
      if(cur.round >= MULTI_ROUNDS){ cur.phase = 'over'; return cur; }
      cur.round = cur.round + 1;
```

바꾼 뒤:

```js
    MG.ref.child('meta').transaction(cur=>{
      if(!cur || cur.phase !== 'reveal') return;
      // 이을 낱말이 없으면 라운드가 남아도 여기서 끝낸다. 판단은 호스트 한 명만 한다 —
      // 참가자마다 사전이 다를 수 있어서(대용량 사전 로드 실패), 각자 판단하면 갈린다.
      const outcome = chainRoundOutcome({
        mode: MG.mode, round: cur.round, maxRounds: MULTI_ROUNDS,
        need: cur.need, used: Object.keys(cur.used || {}), words: WORD_ALL
      });
      if(outcome === 'over'){ cur.phase = 'over'; return cur; }
      cur.round = cur.round + 1;
```

나머지 본문(`cur.phase = 'play'` 이하)은 그대로 둔다.

- [ ] **Step 2: `renderMulti`의 `over` 문구 분기**

기존 한 줄:

```js
    $('multi-endtext').textContent = '게임 끝!';
```

바꾼 뒤 (라운드를 다 채우지 못하고 끝났다면 막다른 종료다 — RTDB 규칙이 새 필드를 막아서 사유를 저장하는 대신 이렇게 추론한다):

```js
    const deadEnd = MG.mode === 'chain' && m.round < MULTI_ROUNDS;
    $('multi-endtext').textContent = deadEnd ? '더 이을 낱말이 없어!' : '게임 끝!';
```

순위표와 우승자 말풍선은 그대로 둔다.

- [ ] **Step 3: 회귀 확인**

Run: `node test/logic.test.mjs 2>&1 | tail -8`
Expected: `pass 85`, `fail 0`

- [ ] **Step 4: 손으로 확인**

Run: `cd public && python3 -m http.server 8777`

브라우저에서 `http://localhost:8777` → 끝말잇기 → 같이하기 → 이름 입력 후 입장. 개발자 콘솔에서 막다른 상황을 만든다.

```js
MG.ref.child('meta').transaction(cur => {
  if(!cur) return;
  cur.need = '슭'; cur.phase = 'reveal';
  cur.winner = MG.uid; cur.winnerName = MG.name; cur.answer = '테스트';
  return cur;
});
```

확인: 약 3초 뒤 종료 화면이 뜨고 `더 이을 낱말이 없어!`가 보인다. "다시 시작"을 누르면 새 문제가 나오고 게임이 이어진다.

(`슭`으로 시작하는 낱말은 사전에 없다. 만약 있다면 `findHint('슭', WORD_ALL, [])`가 `null`을 돌려주는 다른 글자를 쓴다.)

- [ ] **Step 5: 테스트 데이터 정리**

Run:
```bash
firebase database:get /nunus/chain/presence
```
`null`이면(브라우저 탭을 모두 닫은 뒤) 지운다.

```bash
firebase database:remove /nunus --force
```

- [ ] **Step 6: 커밋**

```bash
git add public/index.html
git commit -m "End the multiplayer game when no word can follow"
```

---

### Task 3: 혼자하기 — 막다르면 끝내고 알린다

**Files:**
- Modify: `public/index.html` — `acceptWord`의 막다른 분기, `endChain`

**Interfaces:**
- Consumes: 기존 `hasContinuation(need, WORD_ALL, chainWords)`, 기존 `endChain()`
- Produces: `endChain(deadEndNeed)` — 인자가 있으면 막다른 종료, 없으면 사용자가 ✕로 끝낸 것.

- [ ] **Step 1: `endChain`이 막힌 글자를 받도록 바꾼다**

기존:

```js
function endChain(){
  const rec = finalizeBest();
  $('chain-play').classList.add('hidden');
  $('chain-endbox').classList.remove('hidden');
  $('chain-endtext').textContent = `🔗 ${chainWords.length}개 이어봤어요!`;
  $('chain-record').classList.toggle('hidden', !rec);
  $('chain-best').textContent = chainBest;
  say('ok', '재밌었어요! 또 해요 😊');
}
```

바꾼 뒤:

```js
// deadEnd가 있으면 이을 낱말이 없어서 끝난 것이다(✕로 끝낸 경우는 인자가 없다).
function endChain(deadEnd){
  const rec = finalizeBest();
  $('chain-play').classList.add('hidden');
  $('chain-endbox').classList.remove('hidden');
  $('chain-endtext').textContent = deadEnd
    ? `🔗 ${chainWords.length}개까지 이어봤어요!`
    : `🔗 ${chainWords.length}개 이어봤어요!`;
  $('chain-record').classList.toggle('hidden', !rec);
  $('chain-best').textContent = chainBest;
  say('ok', deadEnd
    ? `‘${deadEnd}’로 시작하는 낱말은 나도 모르겠어! 다시 할까?`
    : '재밌었어요! 또 해요 😊');
}
```

`$('chain-end-x')`의 바인딩은 이미 `()=>endChain()`이라 인자 없이 부른다 — 그대로 둔다.

- [ ] **Step 2: `acceptWord`의 막다른 분기를 종료로 바꾼다**

기존:

```js
  const need = [...v].pop();
  if(!hasContinuation(need, WORD_ALL, chainWords)){
    say('think', `‘${need}’로 시작하는 낱말을 제가 잘 몰라요. 아는 낱말을 입력해 주세요!`);
  } else {
    say('ok', msg);
  }
  setTimeout(()=>$('chain-input').focus(), 30);
```

바꾼 뒤 (게임이 끝났으니 입력창에 포커스를 주지 않는다):

```js
  const need = [...v].pop();
  if(!hasContinuation(need, WORD_ALL, chainWords)){
    endChain(need);
    return;
  }
  say('ok', msg);
  setTimeout(()=>$('chain-input').focus(), 30);
```

- [ ] **Step 3: 회귀 확인**

Run: `node test/logic.test.mjs 2>&1 | tail -8`
Expected: `pass 85`, `fail 0`

- [ ] **Step 4: 손으로 확인**

Run: `cd public && python3 -m http.server 8777`

브라우저에서 끝말잇기 → 혼자하기. 개발자 콘솔에서 막다른 낱말을 직접 이어본다.

```js
// 지금 이어야 할 글자로 시작하면서, 그 끝 글자로는 더 이을 수 없는 낱말을 찾는다
(() => {
  const need = [...chainWords[chainWords.length - 1]].pop();
  return WORD_ALL.find(w =>
    [...w][0] === need &&
    !chainWords.includes(w) &&
    !hasContinuation([...w].pop(), WORD_ALL, chainWords.concat([w])));
})()
```

나온 낱말을 입력창에 넣고 확인을 누른다. `undefined`가 나오면 아무 낱말이나 이어서 게임을
한두 수 진행한 뒤 다시 실행한다.

확인 항목:
1. 종료 화면이 뜨고 `🔗 N개까지 이어봤어요!`가 보인다.
2. 말풍선에 `‘X’로 시작하는 낱말은 나도 모르겠어! 다시 할까?`가 보인다.
3. "다시 시작"을 누르면 새 낱말로 게임이 시작된다.
4. ✕(끝내기)로 끝내면 기존 문구 `🔗 N개 이어봤어요!` / `재밌었어요! 또 해요 😊`가 나온다.
5. 사전에 없는 낱말(예: `쿠쿠쿠`)을 제출하면 등록을 묻는 기존 동작이 그대로다.

- [ ] **Step 5: 커밋**

```bash
git add public/index.html
git commit -m "End the solo game when no word can follow"
```

---

### Task 4: 통합 테스트 — 막다른 종료와 재시작

**Files:**
- Modify: `test/multi-race.mjs` — 레이스 루프의 예외 지점(339줄 부근), `/* 4) 호스트 승계` 블록 앞에 새 시나리오

**Interfaces:**
- Consumes: `A`, `B`(`{page, ctx, nick}`), `report`, `info`, `waitFor`, `waitPhase`, `need(page)`, `round(page)`, `sleep`, 앱 전역 `MG` / `findHint` / `WORD_ALL` / `restartMulti` / `MULTI_ROUNDS`
- Produces: 없음(검증 전용)

이 태스크는 두 가지를 한다. 막다른 종료를 결정적으로 검증하고, 같은 원인으로 스위트를 죽이던 기존 플레이크를 없앤다.

- [ ] **Step 1: 레이스 루프의 예외를 제거한다**

기존 (이을 낱말을 못 찾으면 스위트 전체가 중단된다 — 2026-07-22 기준 3회 중 1회):

```js
    if (!word) throw new Error('사전에서 "' + needBefore + '"로 이을 낱말을 못 찾음 — 사전 문제, 동시성 문제 아님');
```

바꾼 뒤 (이제 이것은 앱이 게임을 끝내야 하는 정상 상황이다. 방을 끝내고 루프 위쪽의 재시작 경로를 타게 한다):

```js
    if (!word){
      // 이을 낱말이 없는 문제다 — 앱에서는 호스트가 라운드를 넘길 때 게임을 끝낸다.
      // 여기서는 레이스 표본을 계속 모으려고 방을 끝내고 위쪽 재시작 경로로 보낸다.
      info('시도 ' + attempts + ': "' + needBefore + '"로 이을 낱말이 없어 방을 끝내고 재시작');
      await A.page.evaluate(() => MG.ref.child('meta').transaction(cur => {
        if(!cur) return;
        cur.phase = 'over';
        return cur;
      }));
      await waitPhase(A.page, 'over', 5000).catch(() => {});
      continue;
    }
```

- [ ] **Step 2: 막다른 종료 시나리오 삽입**

`/* 4) 호스트 승계 — 호스트가 탭을 닫아도 남은 쪽이 진행 */` 주석 바로 위에 붙여넣는다.

```js
  /* 3.8) 막다른 낱말 — 게임이 끝나고 그 사실을 알린 뒤 다시 시작할 수 있다 */
  {
    info('막다른 낱말: 이을 낱말이 없는 need를 심고 라운드 전환을 태운다');
    await waitPhase(A.page, 'play', 8000).catch(() => {});

    // 사전에 없는 첫 글자를 고른다 — 후보 중 findHint가 null을 주는 것.
    const deadNeed = await A.page.evaluate(() =>
      ['슭','뷁','쭑','촽','옭','릙'].find(c => !findHint(c, WORD_ALL, [])) || null);
    report('막다른 낱말: 이을 수 없는 글자를 찾음', !!deadNeed, String(deadNeed));

    if (deadNeed){
      const roundBefore = Number(await round(A.page));
      // 호스트가 라운드를 넘기는 시점(reveal → play)에 판정하므로 reveal로 만들어 태운다.
      await A.page.evaluate((n) => MG.ref.child('meta').transaction(cur => {
        if(!cur) return;
        cur.need = n; cur.phase = 'reveal';
        cur.winner = MG.uid; cur.winnerName = MG.name; cur.answer = '테스트';
        return cur;
      }), deadNeed);

      const wentOver = await waitFor(A.page, () => MG.meta && MG.meta.phase === 'over', [],
        { timeout: 12000, label: 'A가 over로 넘어감' }).catch(() => false);
      report('막다른 낱말: 라운드가 남아 있어도 게임이 끝남', !!wentOver);

      const overB = await waitFor(B.page, () => MG.meta && MG.meta.phase === 'over', [],
        { timeout: 8000, label: 'B도 over를 봄' }).catch(() => false);
      report('막다른 낱말: 상대(B)도 종료를 봄', !!overB);

      const roundAtOver = Number(await A.page.evaluate(() => MG.meta.round));
      report('막다른 낱말: 종료 시 라운드는 올라가지 않음', roundAtOver === roundBefore,
        roundBefore + ' → ' + roundAtOver);

      const endText = await A.page.$eval('#multi-endtext', e => e.textContent);
      report('막다른 낱말: 종료 화면이 이유를 알려줌', endText.includes('더 이을 낱말이 없어'),
        endText);

      // 다시 시작 — 새 문제는 반드시 이을 낱말이 있어야 한다.
      await A.page.click('#multi-restart');
      const restarted = await waitFor(A.page, (r) =>
        MG.meta && MG.meta.phase === 'play' && MG.meta.round === 1 && MG.meta.need !== r,
        [deadNeed], { timeout: 8000, label: '새 게임이 시작됨' }).catch(() => false);
      report('막다른 낱말: 다시 시작하면 새 게임이 열림', !!restarted);

      const freshNeed = await need(A.page);
      const canContinue = await A.page.evaluate((n) => {
        const used = Object.values((MG.meta && MG.meta.chain) || {});
        return !!findHint(n, WORD_ALL, used);
      }, freshNeed);
      report('막다른 낱말: 새 문제는 이을 낱말이 있음', canContinue === true, 'need=' + freshNeed);

      gameIdsUsed.add(await A.page.evaluate(() => MG.meta.gameId));
    } else {
      report('막다른 낱말: 라운드가 남아 있어도 게임이 끝남', false, '이을 수 없는 글자를 못 찾아 건너뜀');
      report('막다른 낱말: 상대(B)도 종료를 봄', false, '위와 동일');
      report('막다른 낱말: 종료 시 라운드는 올라가지 않음', false, '위와 동일');
      report('막다른 낱말: 종료 화면이 이유를 알려줌', false, '위와 동일');
      report('막다른 낱말: 다시 시작하면 새 게임이 열림', false, '위와 동일');
      report('막다른 낱말: 새 문제는 이을 낱말이 있음', false, '위와 동일');
    }
  }
```

- [ ] **Step 3: RTDB 방 비우기(전제조건)**

Run: `firebase database:get /nunus --shallow`

`null`이 아니면 실제 플레이어가 없는지 먼저 확인한다.

```bash
firebase database:get /nunus/chain/presence
firebase database:get /nunus/chosung/presence
```

둘 다 `null`이면 지운다. 접속자가 있으면 **중단하고 사람에게 알린다** — 실제 플레이어의 방이다.

```bash
firebase database:remove /nunus --force
firebase database:get /nunus --shallow
```
Expected: `null`

- [ ] **Step 4: 실패 확인 (fail-before)**

Task 2의 판정이 없으면 게임이 끝나지 않아야 한다. `hostTick`의 판정을 옛 코드로 임시로 되돌린다.
`hostTick`이 라운드 종료를 판정하는 **유일한** 자리이므로, 이 한 곳만 되돌리면 결함이 그대로
재현된다.

**`git checkout <commit> -- <path>`나 `git stash`를 쓰지 말 것.** 전자는 인덱스도 바꿔서 다른
커밋에 딸려 들어간 사고가 이 저장소에서 실제로 있었고, 후자는 되돌릴 워킹트리 변경이 없어서
아무 일도 하지 않는다. 손으로 편집한다.

Task 2 Step 1에서 넣은 `const outcome = ...` 블록과 `if(outcome === 'over')` 줄을 지우고 옛
한 줄로 바꾼다.

```js
      if(cur.round >= MULTI_ROUNDS){ cur.phase = 'over'; return cur; }
```

Run: `grep -c chainRoundOutcome public/index.html`
Expected: `1` (CORE의 정의만 남고 `hostTick`의 호출은 사라졌다)

터미널 1: `cd public && python3 -m http.server 8777`
터미널 2: `node test/multi-race.mjs`

Expected: `[FAIL] 막다른 낱말: 라운드가 남아 있어도 게임이 끝남`

이 줄이 나오지 않으면 테스트가 결함을 잡지 못하는 것이다. 그 경우 진행하지 말고 사람에게 알린다.

참고: `test/multi-race.mjs`에는 이 작업과 무관한 기존 플레이크가 있었지만 Step 1이 그것을
없앴다. 그래도 중단되는 일이 생기면 몇 번 만에 성공했는지 보고에 남긴다.

- [ ] **Step 5: 통과 확인 (pass-after)**

Step 4에서 손으로 되돌린 부분을 Task 2 Step 1의 코드로 되돌린다.

```bash
git diff public/index.html
```
Expected: 출력 없음(Task 3 커밋과 동일한 상태)

Run: `node test/multi-race.mjs`
Expected: 모든 `[PASS]`

Run: `echo $?`
Expected: `0`

- [ ] **Step 6: 전체 회귀**

Run: `node test/logic.test.mjs 2>&1 | tail -8`
Expected: `pass 85`, `fail 0`

Run: `bash test/rules-check.sh`
Expected: 규칙 검사 통과

- [ ] **Step 7: 테스트 데이터 정리**

```bash
firebase database:get /nunus/chain/presence
firebase database:get /nunus/chosung/presence
```
둘 다 `null`이면 지운다.

```bash
firebase database:remove /nunus --force
```

- [ ] **Step 8: 커밋**

```bash
git add test/multi-race.mjs
git commit -m "Pin the dead-end ending and stop the suite dying on it"
```

---

### Task 5: 배포와 기록

**Files:**
- Modify: `.superpowers/sdd/progress.md`
- Modify: `.firebase/hosting.cHVibGlj.cache` (배포 부산물)

**Interfaces:**
- Consumes: Task 1~4의 완료 상태
- Produces: 없음

- [ ] **Step 1: 배포 전 회귀**

Run: `node test/logic.test.mjs 2>&1 | tail -8`
Expected: `pass 85`, `fail 0`

- [ ] **Step 2: 초성게임 무손상 확인**

Run: `git diff main -- public/index.html`

확인: 초성 관련 코드(`chosungIndex`, `chosungOf`, `newProblem`의 `chosung` 분기)에 변경이 없다. `hostTick`의 변경은 `chainRoundOutcome`이 `mode !== 'chain'`이면 라운드 수로만 판단하므로 초성게임의 동작을 바꾸지 않는다.

- [ ] **Step 3: main에 머지**

```bash
git checkout main
git merge --no-ff feature/chain-dead-end -m "Merge feature/chain-dead-end: end the game at a dead-end word"
node test/logic.test.mjs 2>&1 | tail -4
```
Expected: `pass 85`, `fail 0`

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
=== 끝말잇기 막다른 낱말 처리 (2026-07-23, feature/chain-dead-end) ===
- chainRoundOutcome({mode,round,maxRounds,need,used,words}) -> 'over'|'next' 를 CORE에 추가.
  round >= maxRounds면 over / chain이 아니면 next / 이을 낱말 없으면 over.
- 같이하기: hostTick의 라운드 전환 트랜잭션에서 판정. 호스트 한 명만 판단한다 —
  참가자마다 사전이 다를 수 있어(대용량 사전 로드 실패) 각자 판단하면 결과가 갈린다.
- 혼자하기: acceptWord의 막다른 분기에서 endChain(need) 호출. endChain은 인자가 있으면
  막다른 종료, 없으면 사용자가 X로 끝낸 것.
- 종료 사유는 RTDB에 저장하지 않는다. 규칙의 meta.$other가 새 필드를 막으므로
  phase==='over' && round < MULTI_ROUNDS 로 추론한다.
- 통합 테스트의 기존 플레이크 제거: 이을 낱말을 못 찾으면 예외를 던져 스위트가 죽던 것을,
  방을 끝내고 재시작 경로로 보내도록 바꿈. 막다른 종료 시나리오는 별도로 추가(3.8).
- 로직 테스트 79 -> 85.
```

- [ ] **Step 7: 커밋과 푸시**

```bash
git add .superpowers/sdd/progress.md .firebase/hosting.cHVibGlj.cache
git commit -m "Record the dead-end handling in the SDD ledger"
git push origin main
git push origin feature/chain-dead-end
```

---

## 검증 요약

| 항목 | 검증 방법 |
|---|---|
| `chainRoundOutcome` 판정 | `node test/logic.test.mjs` (6개 추가, 총 85개) |
| 초성게임 무영향 | 로직 테스트 + Task 5 Step 2 diff 검토 |
| **같이하기 막다른 종료** | `multi-race.mjs` 3.8 — 수정 전 FAIL 확인 후 복구 |
| 종료 시 라운드 미증가 | `multi-race.mjs` 3.8 |
| 종료 문구 | `multi-race.mjs` 3.8 |
| 재시작 후 새 문제가 이을 수 있음 | `multi-race.mjs` 3.8 |
| 기존 플레이크 제거 | Task 4 Step 1 — 예외 대신 재시작 |
| 혼자하기 막다른 종료 | Task 3 Step 4 손 검증 |
| ✕ 종료 문구 무손상 | Task 3 Step 4 손 검증 |
| 낱말 등록 경로 무손상 | Task 3 Step 4 손 검증 |
