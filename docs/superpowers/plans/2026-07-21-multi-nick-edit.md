# 같이하기 이름 변경 + 간격 조정 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 같이하기 모드에서 내 칩을 탭해 언제든 이름을 바꿀 수 있게 하고, 이름 칩 목록과 교체 요청 카드의 간격을 정상화한다.

**Architecture:** 이름은 `presence/<uid>/name` 한 필드에만 있고 게임 로직과 분리되어 있으므로, 변경은 그 필드의 `update` 하나다. 전파는 이미 있는 presence 구독이 담당한다. UI는 기존 `#multi-nick` 블록을 `enter`/`edit` 두 모드로 재사용하고, `renderMulti()`가 편집 중 게임 입력창을 되살리지 못하도록 `MG.nickEditing` 플래그로 게이팅한다.

**Tech Stack:** 바닐라 JS 단일 파일(`public/index.html`), Firebase RTDB compat SDK, `node:test`(순수 로직), puppeteer(통합).

## Global Constraints

- 모든 코드는 `public/index.html` 한 파일 안에 있다. 빌드 단계 없음.
- 순수 로직은 반드시 `/* CORE:START */` ~ `/* CORE:END */`(611~820줄) 사이에 둔다. `test/logic.test.mjs`가 이 구간만 잘라내 평가한다.
- `test/logic.test.mjs`에서 새 함수를 쓰려면 파일 상단 `CORE_NAMES` 배열에 이름을 추가해야 한다. 추가하지 않으면 `undefined`가 반환된다.
- 사용자에게 보이는 문구는 모두 한국어 반말체(앱의 🦉 마스코트 화법)를 따른다.
- 닉네임 최대 길이는 12자. `maxlength="12"`와 `.slice(0,12)` 이중 방어를 유지한다.
- presence 쓰기는 `set`이 아니라 `update`를 쓴다. `set`은 `ts`를 지워 재접속 판정 데이터를 잃는다.
- 혼자하기 모드 코드는 건드리지 않는다.
- 기존 테스트 66개는 전부 통과 상태를 유지한다.

---

### Task 1: 간격 조정 + 내 칩 커서

**Files:**
- Modify: `public/index.html:255-258` (`.players`), `public/index.html:269-272` (`.swap-card`), `public/index.html:265` (`.pchip.me`)

**Interfaces:**
- Consumes: 없음
- Produces: `.pchip.me`에 `cursor:pointer` — Task 3의 클릭 가능 힌트가 여기에 의존한다.

CSS 값만 바꾸는 태스크다. 자동 테스트 대상이 아니므로 육안 확인으로 검증한다.

- [ ] **Step 1: `.players` 아래 여백 확보**

`.wrap`은 `gap`이 없어서 이 `padding-bottom`이 칩 목록과 문제 카드 사이의 유일한 간격이다.

```css
  .players{
    display:flex; gap:8px; overflow-x:auto; padding:10px 16px 12px;
    -webkit-overflow-scrolling:touch; scrollbar-width:none;
  }
```

- [ ] **Step 2: `.pchip.me`에 커서 추가**

```css
  .pchip.me{ outline:2px solid var(--sky); cursor:pointer }
```

- [ ] **Step 3: `.swap-card` 위아래 여백 확보**

`#multi-play`는 일반 블록이라 margin이 그대로 적용된다.

```css
  .swap-card{
    border:2px solid var(--coral); border-radius:var(--radius);
    background:var(--coral-soft); padding:16px; margin:14px 0 12px;
    display:flex; flex-direction:column; gap:12px; align-items:stretch; text-align:center;
  }
```

- [ ] **Step 4: 기존 테스트가 깨지지 않았는지 확인**

Run: `node test/logic.test.mjs`
Expected: `pass 66`, `fail 0`

- [ ] **Step 5: 육안 확인**

Run: `cd public && python3 -m http.server 8777`
브라우저에서 `http://localhost:8777` → 끝말잇기 → 같이하기 → 이름 입력 후 입장.
확인: 이름 칩 줄과 아래 흰 카드 사이에 눈에 띄는 여백이 있다. 교체 요청 카드는 Task 5 통합 테스트에서 함께 본다.

- [ ] **Step 6: 커밋**

```bash
git add public/index.html
git commit -m "Give the player chips and the swap card room to breathe"
```

---

### Task 2: `nickChange` 순수 함수

**Files:**
- Modify: `public/index.html` (CORE 블록 안, `swapOutcome` 함수 뒤 ~818줄)
- Test: `test/logic.test.mjs`

**Interfaces:**
- Consumes: `norm(s)` — 공백을 모두 제거하고 trim하는 기존 CORE 함수(626줄).
- Produces: `nickChange(current, raw) -> { ok: boolean, changed: boolean, name: string }`
  - `ok:false` = 입력이 비어 유효하지 않음. 이때 `name`은 `''`, `changed`는 `false`.
  - `ok:true, changed:false` = 정규화 결과가 현재 이름과 같음 → 쓰기를 건너뛴다.
  - `ok:true, changed:true` = 저장·전송할 새 이름이 `name`에 있다.
  - Task 4의 `submitNick`이 이 세 갈래를 그대로 분기에 쓴다.

- [ ] **Step 1: 실패하는 테스트 작성**

`test/logic.test.mjs` 맨 끝에 추가한다.

```js
test('nickChange: 앞뒤 공백을 지우고 받아들인다', () => {
  const { nickChange } = loadCore();
  assert.deepEqual(nickChange('가가', ' 나나 '), { ok:true, changed:true, name:'나나' });
});

test('nickChange: 12자를 넘으면 자른다', () => {
  const { nickChange } = loadCore();
  const r = nickChange('가가', '가나다라마바사아자차카타파하');
  assert.equal(r.ok, true);
  assert.equal(r.name, '가나다라마바사아자차카타');
  assert.equal(r.name.length, 12);
});

test('nickChange: 빈 값과 공백만 있는 입력은 거부한다', () => {
  const { nickChange } = loadCore();
  assert.deepEqual(nickChange('가가', ''),     { ok:false, changed:false, name:'' });
  assert.deepEqual(nickChange('가가', '   '),  { ok:false, changed:false, name:'' });
  assert.deepEqual(nickChange('가가', null),   { ok:false, changed:false, name:'' });
});

test('nickChange: 현재 이름과 같으면 changed=false', () => {
  const { nickChange } = loadCore();
  assert.deepEqual(nickChange('가가', '가가'),   { ok:true, changed:false, name:'가가' });
  assert.deepEqual(nickChange('가가', ' 가가 '), { ok:true, changed:false, name:'가가' });
});

test('nickChange: 최초 입장(현재 이름 없음)은 항상 changed=true', () => {
  const { nickChange } = loadCore();
  assert.deepEqual(nickChange('', '가가'),        { ok:true, changed:true, name:'가가' });
  assert.deepEqual(nickChange(undefined, '가가'), { ok:true, changed:true, name:'가가' });
});
```

- [ ] **Step 2: `CORE_NAMES`에 등록**

`test/logic.test.mjs` 상단 `CORE_NAMES` 배열의 마지막 줄을 바꾼다.

```js
  'pickHost','swapOutcome','nickChange'
```

- [ ] **Step 3: 실패 확인**

Run: `node test/logic.test.mjs 2>&1 | tail -20`
Expected: FAIL — `nickChange is not a function` (CORE에 없어 `undefined`가 반환된다). `fail 5`.

- [ ] **Step 4: 구현**

`public/index.html`의 `swapOutcome` 함수 바로 뒤, `/* CORE:END */` 앞에 추가한다.

```js
// 닉네임 입력 판정. ok=false면 유효하지 않은 입력(닫지 말고 다시 받는다),
// changed=false면 바뀐 게 없으니 저장·전송을 건너뛴다.
function nickChange(current, raw){
  const name = norm(raw).slice(0, 12);
  if(!name) return { ok:false, changed:false, name:'' };
  return { ok:true, changed: name !== (current || ''), name };
}
```

- [ ] **Step 5: 통과 확인**

Run: `node test/logic.test.mjs 2>&1 | tail -8`
Expected: `pass 71`, `fail 0`

- [ ] **Step 6: 커밋**

```bash
git add public/index.html test/logic.test.mjs
git commit -m "Add nickChange, the pure rule for accepting a new nickname"
```

---

### Task 3: 내 칩에 이름 표시

**Files:**
- Modify: `public/index.html:1701-1713` (`renderPlayers`)

**Interfaces:**
- Consumes: `MG.name`, `MG.uid`, `escapeHtml(s)`, Task 1의 `.pchip.me { cursor:pointer }`
- Produces: 내 칩 DOM에 `.pchip.me` 클래스와 `✏️` 접미사. Task 4가 이 칩에 클릭 핸들러를 붙인다.

이 태스크는 표시만 바꾼다. 탭해도 아직 아무 일도 일어나지 않는다.

- [ ] **Step 1: `renderPlayers` 교체**

```js
function renderPlayers(){
  const scores = (MG && MG.scoreCache) || {};
  const el = $('multi-players');
  el.innerHTML = '';
  for(const m of MG.members){
    const isMe = m.uid === MG.uid;
    const chip = document.createElement('div');
    chip.className = 'pchip' + (isMe ? ' me' : '');
    // 내 칩에는 실제 이름을 보여준다 — 남들에게 어떻게 보이는지 확인할 유일한 곳이고,
    // 이름을 바꾼 뒤 반영됐는지도 여기서 확인한다.
    const label = isMe
      ? (MG.name ? escapeHtml(MG.name) + '(나)' : '나') + ' ✏️'
      : escapeHtml(m.name || '?');
    chip.innerHTML = '<span>' + label + '</span><span class="pscore">' + (scores[m.uid]||0) + '</span>';
    el.appendChild(chip);
  }
  $('multi-myscore').textContent = scores[MG.uid] || 0;
}
```

- [ ] **Step 2: 회귀 확인**

Run: `node test/logic.test.mjs 2>&1 | tail -8`
Expected: `pass 71`, `fail 0`

- [ ] **Step 3: 육안 확인**

`cd public && python3 -m http.server 8777` 후 같이하기로 입장.
확인: 내 칩이 `가가(나) ✏️` 형태로 보이고, 마우스를 올리면 손가락 커서가 된다. 점수 숫자는 그대로다.

- [ ] **Step 4: 커밋**

```bash
git add public/index.html
git commit -m "Show my own name on my chip instead of just 나"
```

---

### Task 4: 이름 편집 UI와 저장

**Files:**
- Modify: `public/index.html:556-562` (`#multi-nick` 마크업)
- Modify: `public/index.html:1600-1634` (`startMulti`, `askNick`, `submitNick`)
- Modify: `public/index.html:1701-1713` (`renderPlayers` — 클릭 핸들러 부착)
- Modify: `public/index.html:1757` 이하 (`renderMulti`의 `play` 분기 게이팅)
- Modify: `public/index.html:1683-1690` (`onCon` 오프라인 분기)
- Modify: `public/index.html:2167-2168` (이벤트 바인딩)

**Interfaces:**
- Consumes: Task 2의 `nickChange(current, raw)`, Task 3이 만든 `.pchip.me` 칩
- Produces:
  - `askNick(mode)` — `mode`는 `'enter'` 또는 `'edit'`. 기존 무인자 호출을 대체한다.
  - `closeNick()` — 편집 상태를 걷고 화면을 정상 복귀시킨다.
  - `openNickEdit()` — 칩 클릭 핸들러. 차단 조건을 여기서 판단한다.
  - `MG.nickEditing: boolean` — Task 5의 통합 테스트가 이 값을 직접 읽는다.

- [ ] **Step 1: 취소 버튼 마크업 추가**

`#multi-nick` 블록을 교체한다.

```html
      <div id="multi-nick" class="hidden">
        <div class="type-input-row">
          <input class="type-input" id="multi-nick-input" type="text" maxlength="12"
                 autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="닉네임 (1~12자)">
          <button class="btn btn-sky" id="multi-nick-ok" style="flex:none; min-height:auto; padding:0 20px">입장</button>
          <button class="btn btn-soft hidden" id="multi-nick-cancel" style="flex:none; min-height:auto; padding:0 16px">취소</button>
        </div>
      </div>
```

- [ ] **Step 2: `MG`에 `nickEditing` 초기화 추가**

`startMulti`의 `MG = {...}` 한 줄을 교체한다.

```js
  MG = { mode, uid:null, name:loadNick(), ref:null, members:[], meta:null, hostUid:null, subs:[], allScores:{}, scoreCache:{}, nickEditing:false };
```

- [ ] **Step 3: `startMulti`의 `askNick` 호출에 모드 전달**

같은 함수 안 `fbInit().then(...)` 블록의 한 줄을 교체한다.

```js
    if(!MG.name){ askNick('enter'); } else { enterRoom(); }
```

- [ ] **Step 4: `askNick`/`submitNick`을 모드 지원으로 교체**

기존 두 함수(1622~1634줄)를 통째로 아래로 바꾼다.

```js
function askNick(mode){
  const edit = mode === 'edit';
  MG.nickEditing = edit;
  $('multi-nick').classList.remove('hidden');
  $('multi-nick-input').value = edit ? MG.name : '';
  $('multi-nick-ok').textContent = edit ? '바꾸기' : '입장';
  $('multi-nick-cancel').classList.toggle('hidden', !edit);
  mSay(edit ? '새 이름을 뭐라고 할까?' : '같이 하려면 이름이 필요해! 뭐라고 부를까?');
  if(edit){
    // 편집 중에는 게임 입력을 잠근다. renderMulti가 되살리지 못하도록 nickEditing으로 게이팅됨.
    $('multi-input').disabled = true;
    $('multi-submit').disabled = true;
  }
  $('multi-nick-input').focus();
  if(edit) $('multi-nick-input').select();
}

// 편집 상태를 걷고 화면을 원래대로 돌린다(확정·취소·오프라인 모두 이 경로).
function closeNick(){
  MG.nickEditing = false;
  $('multi-nick').classList.add('hidden');
  $('multi-nick-cancel').classList.add('hidden');
  if(MG.meta) renderMulti();
}

function submitNick(){
  const editing = MG.nickEditing;
  const r = nickChange(editing ? MG.name : '', $('multi-nick-input').value);
  if(!r.ok){ $('multi-nick-input').focus(); return; }
  if(r.changed){
    saveNick(r.name);
    MG.name = r.name;
    // set이 아니라 update — set은 ts를 지워 재접속 판정 데이터를 잃는다.
    if(editing) MG.ref.child('presence/' + MG.uid).update({ name: r.name });
  }
  closeNick();
  if(!editing) enterRoom();
}

function openNickEdit(){
  if(!MG || MG.nickEditing) return;
  if(MG.online === false) return;              // 쓰기가 조용히 버려진다
  if(MG.meta && MG.meta.swap) return;          // 교체 투표 중 — 이미 입력이 잠긴 구간
  askNick('edit');
}
```

- [ ] **Step 5: 칩에 클릭 핸들러 부착**

`renderPlayers`의 `el.appendChild(chip);` 바로 앞에 한 줄을 넣는다.

```js
    if(isMe) chip.addEventListener('click', openNickEdit);
    el.appendChild(chip);
```

- [ ] **Step 6: `renderMulti`의 `play` 분기 게이팅**

기존 `const online = MG.online !== false;`부터 `if(m.phase === 'play'){ if(online){` 까지를 교체한다.

```js
  const online = MG.online !== false;
  const editing = MG.nickEditing === true;
  if(m.phase === 'play'){
    if(online && !editing){
```

나머지 `play` 분기 본문과 `reveal`/`over` 분기는 그대로 둔다. `reveal`/`over`는 이미 입력을 잠그므로 게이팅이 필요 없다.

- [ ] **Step 7: 연결이 끊기면 편집을 닫는다**

`onCon`의 오프라인 분기에서 `swapSig = null;` 바로 앞에 한 줄을 넣는다.

```js
      $('multi-swap-card').classList.add('hidden');
      $('multi-swap-card').innerHTML = '';
      if(MG.nickEditing) closeNick();
      swapSig = null;
```

- [ ] **Step 8: 취소 버튼 바인딩**

`$('multi-nick-input').addEventListener('keydown', ...)` 줄 다음에 추가한다.

```js
$('multi-nick-cancel').addEventListener('click', closeNick);
```

- [ ] **Step 9: 회귀 확인**

Run: `node test/logic.test.mjs 2>&1 | tail -8`
Expected: `pass 71`, `fail 0`

- [ ] **Step 10: 브라우저 2개로 손 검증**

`cd public && python3 -m http.server 8777` 후 일반 창과 시크릿 창에서 각각 입장(이름 `가가`, `나나`).

확인 항목:
1. `가가` 창에서 내 칩을 탭하면 입력창이 열리고 값이 `가가`로 채워져 선택 상태다.
2. 열려 있는 동안 아래 게임 입력창이 비활성이다.
3. `다다`로 바꾸고 `바꾸기` → 내 칩이 `다다(나) ✏️`가 되고 게임 입력창이 다시 활성화된다.
4. `나나` 창의 칩 목록에도 `다다`가 나타난다.
5. 다시 열어 `취소` → 이름이 그대로고 게임 입력창이 살아난다.
6. 열어서 전부 지우고 `바꾸기` → 닫히지 않고 포커스가 유지된다.

- [ ] **Step 11: 커밋**

```bash
git add public/index.html
git commit -m "Let players rename themselves by tapping their own chip"
```

---

### Task 5: 통합 테스트 — 편집 중 게이팅

**Files:**
- Modify: `test/multi-race.mjs` (`/* 4) 호스트 승계` 블록 바로 앞에 새 블록 삽입)

**Interfaces:**
- Consumes: `A`, `B`(`{page, ctx, nick}`), `report(name, ok, detail)`, `info(msg)`, `waitFor(page, fn, args, opts)`, `waitPhase(page, phase, timeout)`, `need(page)`, `round(page)`(문자열 반환), `bub(page)`, `sleep(ms)`, 앱 전역 `MG` / `findHint` / `WORD_ALL`
- Produces: 없음(검증 전용)

이 테스트의 목적은 Task 4 Step 6의 게이팅을 fail-before/pass-after로 증명하는 것이다. 게이팅이 없으면 편집 중 라운드가 넘어가는 순간 게임 입력창이 되살아난다.

호스트 승계 블록은 A의 탭을 닫으므로 반드시 그 **앞**에 넣는다.

- [ ] **Step 1: 시나리오 블록 삽입**

`/* 4) 호스트 승계 — 호스트가 탭을 닫아도 남은 쪽이 진행 */` 주석 바로 위에 붙여넣는다.

```js
  /* 3.5) 이름 변경 — 편집 중 게임 입력이 잠기고, 상대에게 새 이름이 전파된다 */
  {
    info('이름 변경: A가 라운드 진행 중 칩을 탭해 이름을 바꾼다');
    await waitPhase(A.page, 'play', 8000).catch(() => {});

    const uidA = await A.page.evaluate(() => MG.uid);
    const oldName = await A.page.evaluate(() => MG.name);

    // 내 칩(.pchip.me)을 실제로 클릭한다 — 진입점 자체가 동작하는지 보기 위해
    // openNickEdit()를 직접 부르지 않는다.
    await A.page.click('.pchip.me');
    const opened = await waitFor(A.page,
      () => !document.getElementById('multi-nick').classList.contains('hidden'),
      [], { timeout: 3000, label: '이름 입력창이 열림' }).catch(() => false);
    report('내 칩을 탭하면 이름 입력창이 열림', !!opened);

    const prefilled = await A.page.$eval('#multi-nick-input', e => e.value);
    report('입력창에 현재 이름이 미리 채워짐', prefilled === oldName, prefilled + ' vs ' + oldName);

    // 게이팅 검증: 편집 중에 라운드가 넘어가도 게임 입력창이 되살아나면 안 된다.
    //
    // 그냥 기다리기만 하면 renderMulti를 부를 이벤트가 없어서 게이팅이 없어도 통과해
    // 버린다(리스너가 안 불리면 입력창을 되살릴 기회 자체가 없다). 그래서 B가 실제로
    // 정답을 제출해 meta를 바꾸고, A의 meta 리스너 → renderMulti → play 분기를
    // 확실히 태운 뒤에 확인한다.
    const roundBeforeEdit = await round(A.page);
    const needForB = await need(B.page);
    const usedForB = await B.page.evaluate(() => Object.values((MG.meta && MG.meta.chain) || {}));
    const wordForB = await B.page.evaluate((nn, u) => findHint(nn, WORD_ALL, u), needForB, usedForB);
    if (wordForB){
      await B.page.type('#multi-input', wordForB);
      await B.page.click('#multi-submit');
      // reveal(3초) → 다음 라운드까지 기다린다. A는 그동안 편집창을 연 채로 있다.
      await waitFor(A.page, (r) => String(MG.meta.round) !== r && MG.meta.phase === 'play',
        [roundBeforeEdit], { timeout: 12000, label: 'A가 다음 라운드 play를 봄' });
    } else {
      info('경고: B가 이을 낱말을 못 찾아 라운드 전환 없이 검사한다(게이팅 검증이 약해짐)');
      await sleep(3500);
    }

    const lockedDuringEdit = await A.page.$eval('#multi-input', e => e.disabled);
    report('편집 중에는 게임 입력창이 잠긴 채 유지됨(renderMulti가 되살리지 못함)',
      lockedDuringEdit === true, 'disabled=' + lockedDuringEdit);
    const stillOpen = await A.page.evaluate(
      () => !document.getElementById('multi-nick').classList.contains('hidden'));
    report('라운드가 넘어가도 편집창은 열린 채 유지됨', stillOpen === true);

    // 이름 변경
    const newName = '라라';
    await A.page.$eval('#multi-nick-input', e => { e.value = ''; });
    await A.page.type('#multi-nick-input', newName);
    await A.page.click('#multi-nick-ok');

    const closed = await waitFor(A.page,
      () => document.getElementById('multi-nick').classList.contains('hidden'),
      [], { timeout: 3000, label: '이름 입력창이 닫힘' }).catch(() => false);
    report('바꾸기를 누르면 입력창이 닫힘', !!closed);

    // 상대에게 전파됐는지는 UI 문구가 아니라 동기화된 presence 데이터로 확인한다.
    const seenByB = await waitFor(B.page,
      (u, n) => !!(MG.members || []).find(m => m.uid === u && m.name === n),
      [uidA, newName], { timeout: 5000, label: 'B가 새 이름을 봄' }).catch(() => false);
    report('바뀐 이름이 상대(B)에게 전파됨', !!seenByB,
      seenByB ? oldName + ' → ' + newName : 'B가 5초 내에 새 이름을 못 봄');

    const chipText = await A.page.$eval('.pchip.me', e => e.textContent);
    report('내 칩에 새 이름이 보임', chipText.includes(newName), chipText.trim());

    // ts가 살아 있어야 한다 — update가 아니라 set을 썼다면 여기서 사라진다.
    const tsAlive = await A.page.evaluate((u) => new Promise(res =>
      firebase.database().ref('nunus/chain/presence/' + u).once('value',
        s => res(!!(s.val() && s.val().ts)))), uidA);
    report('이름만 바뀌고 presence의 ts는 보존됨', tsAlive === true);

    // 편집을 닫은 뒤 실제로 다시 제출할 수 있어야 한다.
    await waitPhase(A.page, 'play', 8000).catch(() => {});
    const unlocked = await waitFor(A.page,
      () => document.getElementById('multi-input').disabled === false,
      [], { timeout: 6000, label: '게임 입력창 재활성화' }).catch(() => false);
    report('편집을 닫으면 게임 입력창이 다시 열림', !!unlocked);

    const n = await need(A.page);
    const chainArr = await A.page.evaluate(() => Object.values((MG.meta && MG.meta.chain) || {}));
    const word = await A.page.evaluate((nn, u) => findHint(nn, WORD_ALL, u), n, chainArr);
    if (word){
      await A.page.type('#multi-input', word);
      await A.page.click('#multi-submit');
      await sleep(1200);
      const b = await bub(A.page);
      report('이름 변경 후에도 실제 제출이 성공함', b.includes('이겼어요'), b.slice(0, 30));
    } else {
      report('이름 변경 후에도 실제 제출이 성공함', false, '이을 낱말을 못 찾음');
    }

    // 다음 블록(호스트 승계)이 nick으로 A를 식별하지 않도록 최신 값을 반영해 둔다.
    A.nick = newName;
    gameIdsUsed.add(await A.page.evaluate(() => MG.meta.gameId));
  }
```

- [ ] **Step 2: RTDB 방 비우기(전제조건)**

통합 테스트는 `nunus/chain`, `nunus/chosung`이 비어 있어야 시작한다. 현재 이전 세션의 `meta`가 남아 있다.

Run:
```bash
firebase database:get /nunus --shallow
```
값이 `null`이 아니면, 실제 플레이어가 없는지 먼저 확인한 뒤 지운다.

```bash
firebase database:get /nunus/chain/presence
firebase database:get /nunus/chosung/presence
```
둘 다 `null`이면(접속자 없음) 지운다.

```bash
firebase database:remove /nunus --force
firebase database:get /nunus --shallow
```
Expected: `null`

- [ ] **Step 3: 게이팅을 끄고 실패 확인 (fail-before)**

`public/index.html`의 `renderMulti`에서 게이팅을 일시적으로 되돌린다.

```js
    if(online){
```

터미널 1: `cd public && python3 -m http.server 8777`
터미널 2: `node test/multi-race.mjs`

Expected: `[FAIL] 편집 중에는 게임 입력창이 잠긴 채 유지됨(renderMulti가 되살리지 못함) — disabled=false`
(이 테스트가 게이팅의 부재를 실제로 잡아낸다는 증거다.)

- [ ] **Step 4: 게이팅 복구 후 통과 확인 (pass-after)**

```js
    if(online && !editing){
```

Run: `node test/multi-race.mjs`
Expected: 모든 `[PASS]`, 종료 코드 0. 특히 위 항목과 `이름 변경 후에도 실제 제출이 성공함`이 PASS.

Run: `echo $?`
Expected: `0`

- [ ] **Step 5: 전체 회귀**

Run: `node test/logic.test.mjs 2>&1 | tail -8`
Expected: `pass 71`, `fail 0`

Run: `bash test/rules-check.sh`
Expected: 규칙 검사 통과(변경 없음 확인)

- [ ] **Step 6: 남은 테스트 데이터 정리**

Run:
```bash
firebase database:get /nunus/chain/presence
firebase database:get /nunus/chosung/presence
```
둘 다 `null`(테스트 브라우저가 모두 닫혀 presence 자동 정리됨)이면 `meta`도 지운다.

```bash
firebase database:remove /nunus --force
```

- [ ] **Step 7: 커밋**

```bash
git add test/multi-race.mjs
git commit -m "Pin the rename gating with a two-browser integration test"
```

---

### Task 6: 배포와 기록

**Files:**
- Modify: `.superpowers/sdd/progress.md`
- Modify: `.firebase/hosting.cHVibGlj.cache` (배포 부산물)

**Interfaces:**
- Consumes: Task 1~5의 완료 상태
- Produces: 없음

- [ ] **Step 1: 배포 전 마지막 회귀**

Run: `node test/logic.test.mjs 2>&1 | tail -8`
Expected: `pass 71`, `fail 0`

- [ ] **Step 2: 혼자하기 무손상 확인**

Run: `git diff main --stat` 후 `git diff main -- public/index.html`을 읽는다.
확인: 삭제된 줄이 이 계획에서 교체하기로 한 블록(`.players`/`.pchip.me`/`.swap-card` CSS, `#multi-nick` 마크업, `askNick`/`submitNick`/`renderPlayers`/`renderMulti` 게이팅 한 줄, `onCon` 한 줄, `startMulti` 한 줄) 밖으로 나가지 않는다. 혼자하기 경로(`startChain`/`startChosung`/`submitTyped`)에 변경이 없다.

- [ ] **Step 3: 배포**

Run: `firebase deploy --only hosting`
Expected: `Deploy complete!`

(데이터베이스 규칙은 이번 작업에서 바뀌지 않았으므로 `--only hosting`으로 충분하다.)

- [ ] **Step 4: 라이브 검증**

Run:
```bash
curl -s https://nunus-1911.web.app/ | wc -c
wc -c < public/index.html
```
Expected: 두 값이 동일

브라우저에서 `https://nunus-1911.web.app/` → 같이하기 입장 → 칩 탭 → 이름 변경 동작 확인. 콘솔 에러 0.

- [ ] **Step 5: SDD 원장에 기록**

`.superpowers/sdd/progress.md` 끝에 추가한다.

```
=== 이름 변경 + 간격 조정 (2026-07-21) ===
- 내 칩(.pchip.me) 탭 -> #multi-nick 재사용 인라인 편집(enter/edit 모드).
  presence/<uid>/name을 update(set 아님 — ts 보존). 전파는 기존 presence 구독이 담당.
- nickChange(current, raw)를 CORE에 추가: ok/changed/name 3갈래. logic.test.mjs 5개 추가(71개).
- 게이팅: MG.nickEditing으로 renderMulti의 play 분기를 묶음. 없으면 편집 중 라운드 전환에
  게임 입력창이 되살아남 — multi-race.mjs에 fail-before/pass-after로 증명.
- 오프라인 진입 시 편집 자동 종료(onCon). 투표 중(meta.swap)에는 편집 진입 차단.
- 간격: .players padding-bottom 2px->12px, .swap-card margin 4px 0 2px -> 14px 0 12px.
```

- [ ] **Step 6: 커밋과 푸시**

```bash
git add .superpowers/sdd/progress.md .firebase/hosting.cHVibGlj.cache
git commit -m "Record the nickname editing work in the SDD ledger"
git push origin HEAD
```

---

## 검증 요약

| 항목 | 검증 방법 |
|---|---|
| `nickChange` 4갈래 판정 | `node test/logic.test.mjs` (5개 추가, 총 71개) |
| 칩 탭 → 편집창 열림 | `multi-race.mjs` — `.pchip.me` 실제 클릭 |
| 현재 이름 미리 채움 | `multi-race.mjs` — 입력값 비교 |
| **편집 중 입력창 잠금 유지** | `multi-race.mjs` — B가 제출해 라운드를 넘겨 `renderMulti`를 실제로 태운 뒤 확인. 게이팅 제거 시 FAIL 확인 후 복구 |
| 상대에게 전파 | `multi-race.mjs` — B의 `MG.members`에서 확인 |
| `ts` 보존(`update` vs `set`) | `multi-race.mjs` — RTDB 직접 조회 |
| 편집 후 실제 제출 성공 | `multi-race.mjs` — 말풍선 "이겼어요" |
| 취소·빈 값 거부 | Task 4 Step 10 손 검증 |
| 오프라인 시 편집 종료 | Task 4 Step 7 구현, 손 검증 |
| 간격 2건 | Task 1 Step 5 육안, Task 5 통합 실행 중 교체 카드 확인 |
| 혼자하기 무손상 | Task 6 Step 2 diff 검토 |
