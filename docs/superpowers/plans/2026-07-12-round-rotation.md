# 7문제 라운드 + 모드별 진도 회전 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** 한 판을 랜덤 7문제로 끝내고, 모드별로 경험한 문제를 기록해 다음 판엔 안 푼 문제 위주로 내서 5판이면 31개를 모두 경험하게 한다.

**Architecture:** 순수 선택 로직 `pickRound`를 CORE 블록(`/* CORE:START */…/* CORE:END */`)에 넣어 Node로 단위 테스트. 진도 저장(localStorage)과 화면 배선은 CORE 밖. 단일 파일 유지(`index.html` → `public/index.html` 복사).

**Tech Stack:** 인라인 HTML/CSS/JS, Node 내장 `node:test`.

## Global Constraints

- 앱은 자립형 단일 파일 유지. 로직을 외부 `.js`로 분리하지 않는다. `index.html`만 수정 → `public/index.html` 동일 복사. `artifact.html` 미변경.
- 문제 ID = 템플릿 문자열. 진도 저장 키 `nachmal.progress.v1`, 형태 `{ choice:[templates], type:[templates] }`.
- `ROUND_SIZE = 7`. 진도는 **모드별 독립**. 안 푼 게 부족하면 이미 푼 문제로 채워 항상 라운드=min(7, 문제수). 안 푼 게 0이면 자동 초기화(새 사이클).
- 진도는 localStorage에 지속. 편집기로 낱말이 바뀌면 템플릿 기준 자연 재조정.
- 이 태스크들 동안 git 커밋하지 않음(작업트리). 각 태스크 게이트 = `node --test test/logic.test.mjs` 통과(pristine). node v22.
- 스펙: `docs/superpowers/specs/2026-07-12-round-rotation-design.md`

---

### Task 1: pickRound (CORE) + 테스트

라운드 선택 순수 함수.

**Files:**
- Modify: `index.html` — CORE `/* CORE:END */` 앞에 `pickRound` 추가
- Modify: `test/logic.test.mjs` — `CORE_NAMES`에 `'pickRound'` 추가 + 테스트 추가

**Interfaces:**
- Produces: `pickRound(allTemplates:string[], playedTemplates:string[], size:number) -> { round:string[], played:string[], reset:boolean }`. `round`=이번 판 템플릿(길이 min(size,len)), `played`=갱신된 경험 집합(재조정+새로추가, reset 반영), `reset`=사이클 재시작 여부. `shuffle`(CORE) 사용.

- [ ] **Step 1: 실패하는 테스트 추가**

먼저 `test/logic.test.mjs`의 `CORE_NAMES` 배열에 `'pickRound'`를 추가한다(기존 배열 끝에 항목 추가). 그리고 파일 끝에 아래 테스트를 추가:

```js
test('pickRound: 기본 라운드 7개, 새 문제 우선', () => {
  const { pickRound, DEFAULT_TEMPLATES } = loadCore();
  const all = DEFAULT_TEMPLATES;
  const r = pickRound(all, [], 7);
  assert.equal(r.round.length, 7);
  assert.equal(new Set(r.round).size, 7);
  assert.ok(r.round.every(t => all.includes(t)));
  assert.equal(r.reset, false);
  assert.equal(new Set(r.played).size, 7);
  assert.ok(r.round.every(t => r.played.includes(t)));
});
test('pickRound: 5판이면 31개 모두 경험, 매 판 7개, 6판째 reset', () => {
  const { pickRound, DEFAULT_TEMPLATES } = loadCore();
  const all = DEFAULT_TEMPLATES;              // 31개
  let played = [];
  const rounds = [];
  for(let i=0;i<5;i++){ const r = pickRound(all, played, 7); played = r.played; rounds.push(r); }
  assert.ok(rounds.every(r => r.round.length === 7));
  assert.ok(rounds.every(r => r.reset === false));
  assert.equal(new Set(played).size, 31);
  const r6 = pickRound(all, played, 7);
  assert.equal(r6.reset, true);
  assert.equal(r6.round.length, 7);
  assert.equal(new Set(r6.played).size, 7);
});
test('pickRound: 안 푼 게 부족하면 복습으로 채워 항상 cap', () => {
  const { pickRound, DEFAULT_TEMPLATES } = loadCore();
  const all = DEFAULT_TEMPLATES;
  const played = all.slice(0, 28);            // 28 경험, 3 남음
  const r = pickRound(all, played, 7);
  assert.equal(r.round.length, 7);
  assert.ok(all.slice(28).every(t => r.round.includes(t)));  // 남은 새 문제 우선 포함
  assert.equal(new Set(r.played).size, 31);
});
test('pickRound: 문제 수가 size보다 적으면 전체 한 판', () => {
  const { pickRound } = loadCore();
  const r = pickRound(['a','b','c'], [], 7);
  assert.equal(r.round.length, 3);
  assert.equal(new Set(r.round).size, 3);
});
```

- [ ] **Step 2: 실패 확인**

Run: `node --test test/logic.test.mjs`
Expected: 새 pickRound 테스트 FAIL(`pickRound` undefined → `r.round` 읽기 TypeError). 기존 테스트는 PASS.

- [ ] **Step 3: pickRound 구현**

`index.html`의 `/* CORE:END */` 바로 앞에 추가:

```js
function pickRound(allTemplates, playedTemplates, size){
  const all = allTemplates.slice();
  const cap = Math.min(size, all.length);
  const playedSet = new Set(playedTemplates.filter(t => all.includes(t)));
  let reset = false;
  let unplayed = all.filter(t => !playedSet.has(t));
  if(all.length > 0 && unplayed.length === 0){
    reset = true; playedSet.clear(); unplayed = all.slice();
  }
  const round = [];
  for(const t of shuffle(unplayed)){ if(round.length >= cap) break; round.push(t); playedSet.add(t); }
  if(round.length < cap){
    for(const t of shuffle(all.filter(x => !round.includes(x)))){ if(round.length >= cap) break; round.push(t); }
  }
  return { round: shuffle(round), played: Array.from(playedSet), reset };
}
```

- [ ] **Step 4: 통과 확인**

Run: `node --test test/logic.test.mjs`
Expected: PASS(모든 pickRound 테스트 포함).

- [ ] **Step 5: 체크포인트** — 전체 테스트 통과.

---

### Task 2: 진도 저장 + startQuiz 라운드 배선

**Files:**
- Modify: `index.html` — 진도 상수/함수 추가, `startQuiz` 재작성
- Modify: `test/logic.test.mjs` — 구조 검증 테스트 추가

**Interfaces:**
- Consumes: `pickRound`(CORE)
- Produces: 전역 `PROGRESS = {choice:[],type:[]}`, `ROUND_SIZE=7`, `loadProgress()`, `saveProgress()`. `startQuiz(mode)`가 라운드(≤7)만 `state.order`에 담고 `state.coverageDone` 설정.

- [ ] **Step 1: 진도 상수/함수 추가**

`index.html`에서 `saveWords` 함수:
```js
function saveWords(words){
  try{ localStorage.setItem(STORE_KEY_V2, JSON.stringify(words.map(w=>w.template))); }catch(e){}
}
```
바로 뒤에 추가:
```js
const PROGRESS_KEY = "nachmal.progress.v1";
const ROUND_SIZE = 7;
function loadProgress(){
  try{
    const raw = localStorage.getItem(PROGRESS_KEY);
    if(raw){ const o = JSON.parse(raw); return { choice: Array.isArray(o.choice)?o.choice:[], type: Array.isArray(o.type)?o.type:[] }; }
  }catch(e){}
  return { choice: [], type: [] };
}
function saveProgress(){ try{ localStorage.setItem(PROGRESS_KEY, JSON.stringify(PROGRESS)); }catch(e){} }
let PROGRESS = loadProgress();
```

- [ ] **Step 2: startQuiz 재작성**

기존 `startQuiz`(588–604행)를 교체:
```js
function startQuiz(mode){
  const all = WORDS.map(w=>w.template);
  const { round, played } = pickRound(all, PROGRESS[mode] || [], ROUND_SIZE);
  PROGRESS[mode] = played; saveProgress();
  const idx = new Map(WORDS.map((w,i)=>[w.template, i]));
  const order = round.map(t => idx.get(t)).filter(i => i != null);
  state = {
    mode, order, i:0, score:0, hintLevel:0, done:false, options:[],
    coverageDone: played.length === all.length
  };
  $('mode-title').textContent = mode==='choice' ? '객관식 모드' : '주관식 모드';
  $('q-total').textContent = state.order.length;
  $('type-area').classList.toggle('hidden', mode!=='type');
  $('options').classList.toggle('hidden', mode!=='choice');
  show('quiz');
  renderQuestion();
}
```

- [ ] **Step 3: 구조 검증 테스트 추가**

`test/logic.test.mjs` 끝에 추가:
```js
test('index.html: 라운드/진도 배선', () => {
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  assert.ok(html.includes('nachmal.progress.v1'));
  assert.ok(html.includes('const ROUND_SIZE = 7'));
  assert.ok(html.includes('pickRound(all, PROGRESS[mode]'));
  assert.ok(html.includes('coverageDone'));
});
```

- [ ] **Step 4: 통과 확인**

Run: `node --test test/logic.test.mjs`
Expected: PASS.

- [ ] **Step 5: 체크포인트** — 전체 통과.

---

### Task 3: 결과 화면 (진도 줄 + 다음 7문제 + 완주 축하)

**Files:**
- Modify: `index.html` — 결과 마크업(336, 340행), `showResult`(779–792행)
- Modify: `test/logic.test.mjs` — 구조 검증 테스트 추가

**Interfaces:**
- Consumes: `PROGRESS`, `WORDS`, `state.coverageDone`(Task 2)

- [ ] **Step 1: 결과 마크업 수정**

336행 `<div class="stat">한 번에 맞힌 낱말 …</div>` 바로 뒤에 진도 줄 추가:
```html
        <div class="stat">한 번에 맞힌 낱말 <b id="result-score">0</b> / <span id="result-total">0</span></div>
        <div class="stat" id="result-progress"></div>
```
340행 버튼 라벨 변경: `다시 풀기` → `다음 7문제 →`:
```html
        <button class="btn btn-primary" id="btn-retry">다음 7문제 →</button>
```
(핸들러 `$('btn-retry')…startQuiz(state.mode)`는 그대로 — 이미 다음 라운드를 만든다.)

- [ ] **Step 2: showResult 확장**

`showResult`에서 `$('result-title').textContent = title;`(791행) 바로 뒤, `show('result');`(792행) 앞에 추가:
```js
  const experienced = (PROGRESS[state.mode] || []).length;
  const totalWords = WORDS.length;
  $('result-progress').textContent = `문제 경험 ${experienced}/${totalWords}`;
  if(state.coverageDone){
    $('result-emoji').textContent = '🏆';
    $('result-title').textContent = '모든 문제를 한 번씩 다 만났어요!';
  }
```

- [ ] **Step 3: 구조 검증 테스트 추가**

```js
test('index.html: 결과 화면 진도/버튼', () => {
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  assert.ok(html.includes('id="result-progress"'));
  assert.ok(html.includes('다음 7문제'));
  assert.ok(html.includes('문제 경험 ${experienced}/${totalWords}'));
  assert.ok(!html.includes('다시 풀기'));
});
```

- [ ] **Step 4: 통과 확인**

Run: `node --test test/logic.test.mjs`
Expected: PASS.

- [ ] **Step 5: 체크포인트** — 전체 통과.

---

### Task 4: 홈 진도 표시 + 진도 초기화

**Files:**
- Modify: `index.html` — 모드 카드 마크업(261,268행), home-foot(273–275행), CSS(`.mc-desc`/`.home-foot` 인근), `updateHomeProgress` 추가 + 호출, 이벤트 바인딩
- Modify: `test/logic.test.mjs` — 구조 검증 테스트 추가

**Interfaces:**
- Consumes: `PROGRESS`, `WORDS`, `saveProgress`(Task 2)
- Produces: `updateHomeProgress()`; 홈 표시/저장/초기화 시 호출.

- [ ] **Step 1: 모드 카드 진도 줄 추가**

261행 `<div class="mc-desc">네 개의 …</div>` 바로 뒤에:
```html
          <div class="mc-desc">네 개의 보기 중에서 정답 고르기 · 틀리면 오답이 하나씩 사라져요</div>
          <div class="mc-progress" id="prog-choice"></div>
```
268행 `<div class="mc-desc">보기 없이 …</div>` 바로 뒤에:
```html
          <div class="mc-desc">보기 없이 직접 입력하기 · 틀릴 때마다 자음→모음→받침 힌트가 늘어나요</div>
          <div class="mc-progress" id="prog-type"></div>
```

- [ ] **Step 2: home-foot에 초기화 버튼**

273–275행 교체:
```html
    <div class="home-foot">
      <button class="ghostbtn" id="btn-edit">✎ 낱말 편집하기</button>
      <button class="ghostbtn" id="btn-reset-progress">↺ 진도 초기화</button>
    </div>
```

- [ ] **Step 3: CSS**

`.mode-card .mc-desc{…}` 규칙(104행) 뒤에 추가:
```css
  .mode-card .mc-progress{color:var(--green); font-weight:800; font-size:.8rem; margin-top:6px}
```
`.home-foot{margin-top:auto; padding-top:22px; text-align:center}`(106행)를 교체:
```css
  .home-foot{margin-top:auto; padding-top:22px; display:flex; flex-direction:column; gap:10px; align-items:center}
```

- [ ] **Step 4: updateHomeProgress + 호출 + 바인딩**

`updateHomeCount` 함수(827–829행) 바로 뒤에 추가:
```js
function updateHomeProgress(){
  const total = WORDS.length;
  [['choice','prog-choice'],['type','prog-type']].forEach(([mode,id])=>{
    const n = (PROGRESS[mode] || []).filter(t => WORDS.some(w => w.template === t)).length;
    let txt;
    if(n <= 0) txt = `새 판! 0/${total}`;
    else if(n >= total) txt = `한 판 완주 🏆 · 다음 판 준비`;
    else txt = `이번 판 ${n}/${total}`;
    $(id).textContent = txt;
  });
}
```
`saveEditor`의 `updateHomeCount();`(819행) 뒤에 `updateHomeProgress();` 추가.
초기화 호출: 파일 끝 `updateHomeCount();`(852행) 뒤에 `updateHomeProgress();` 추가.
이벤트 바인딩: `$('btn-reset').addEventListener('click', resetEditor);`(848행) 뒤에 추가:
```js
$('btn-reset-progress').addEventListener('click', ()=>{
  if(confirm('객관식·주관식 진도를 모두 초기화할까요?')){
    PROGRESS = { choice: [], type: [] }; saveProgress(); updateHomeProgress();
  }
});
```

- [ ] **Step 5: 구조 검증 테스트 추가**

```js
test('index.html: 홈 진도 표시 + 초기화', () => {
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  assert.ok(html.includes('id="prog-choice"'));
  assert.ok(html.includes('id="prog-type"'));
  assert.ok(html.includes('id="btn-reset-progress"'));
  assert.ok(html.includes('function updateHomeProgress'));
});
```

- [ ] **Step 6: 통과 확인**

Run: `node --test test/logic.test.mjs`
Expected: PASS.

- [ ] **Step 7: 체크포인트** — 전체 통과.

---

### Task 5: public 동기화 · 회귀 · E2E

**Files:**
- Modify: `public/index.html`(복사)

- [ ] **Step 1: 복사** — Run: `cp index.html public/index.html`
- [ ] **Step 2: 동일성** — Run: `diff -q index.html public/index.html` → 출력 없음.
- [ ] **Step 3: 전체 테스트** — Run: `node --test test/logic.test.mjs` → 전체 PASS.
- [ ] **Step 4: 브라우저 E2E(헤드리스)** — `public/`를 서빙해 실제 앱 구동, `window.confirm=()=>true`로 스텁하고:
  - localStorage 비운 뒤 객관식 시작 → 한 판이 **7문제**(진행 바 `x/7`)로 끝나는지.
  - 결과 화면에 `문제 경험 7/31`과 `다음 7문제 →` 버튼이 보이는지.
  - `다음 7문제`를 4번 더 → 5판째 결과에서 `문제 경험 31/31` + `🏆 모든 문제를 한 번씩 다 만났어요!` 축하가 뜨는지.
  - 5판 동안 만난 문제(템플릿)의 합집합이 31개 전부인지(중복 없이 커버).
  - 홈 카드에 `이번 판 N/31` 진도가 표시되고, `↺ 진도 초기화` 후 `새 판! 0/31`이 되는지.
  - 객관식·주관식 진도가 **독립**인지(객관식 몇 판 후에도 주관식은 `새 판! 0/31`).
  - 새로고침 후 진도가 유지되는지(localStorage `nachmal.progress.v1`).
- [ ] **Step 5: 체크포인트** — 두 파일 identical + 전체 테스트 통과 + E2E 시나리오 확인.

---

## Self-Review

**1. Spec coverage:**
- pickRound(우선순위/채움/reset/커버리지) → Task 1 ✓
- 진도 저장 + startQuiz 라운드 → Task 2 ✓
- 결과 진도/다음 7문제/완주 축하 → Task 3 ✓
- 홈 진도 표시 + 초기화 + 모드별 독립 → Task 4 ✓
- 지속성/재조정/E2E/public 동기화 → Task 2(저장), Task 5 ✓

**2. Placeholder scan:** 없음. 모든 스텝에 실제 코드.

**3. Type consistency:** `pickRound` 반환(`round`/`played`/`reset`)을 startQuiz가 소비. `PROGRESS[mode]`(choice/type) 키가 data-mode(choice/type)와 일치. `state.coverageDone`를 showResult가 사용. `updateHomeProgress`가 `PROGRESS`/`WORDS.template`로 재조정. `btn-retry` 핸들러 불변(라벨만 변경).
