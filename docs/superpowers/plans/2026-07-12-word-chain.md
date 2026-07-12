# 끝말잇기(자유 이어가기) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** 사전 없이 규칙만 확인하는 "끝말잇기" 게임 모드를 추가한다(자유 이어가기, 최고 기록).

**Architecture:** 규칙 검증 순수 함수 `chainCheck`를 CORE 블록에 넣어 Node로 단위 테스트. 화면·상태·저장은 CORE 밖의 새 `screen-chain`. 단일 파일 유지(`index.html` → `public/index.html`).

**Tech Stack:** 인라인 HTML/CSS/JS, Node 내장 `node:test`.

## Global Constraints

- 자립형 단일 파일 유지. `index.html`만 수정 → `public/index.html` 동일 복사. `artifact.html` 미변경.
- 사전 검증 없음: `chainCheck`는 규칙만(끝 글자=다음 첫 글자, 한글 음절, 중복 금지, 두음법칙 없음). 한 글자 낱말 허용.
- 규칙 위반은 게임오버가 아니라 재시도. 종료는 `끝내기`. 점수 = `chainWords.length`(시드 포함). 최고 기록 `localStorage: nachmal.chain.best.v1`.
- DOM에 사용자 입력을 넣을 때 `textContent`만 사용(innerHTML로 보간 금지).
- 각 태스크 게이트 = `node --test test/logic.test.mjs` 통과(pristine). node v22. 태스크 동안 git 커밋 안 함.
- 스펙: `docs/superpowers/specs/2026-07-12-word-chain-design.md`

---

### Task 1: chainCheck + SEED_WORDS (CORE) + 테스트

**Files:**
- Modify: `index.html` — CORE `/* CORE:END */` 앞에 `isHangulSyllable`, `chainCheck`, `SEED_WORDS` 추가
- Modify: `test/logic.test.mjs` — `CORE_NAMES`에 `'chainCheck','isHangulSyllable','SEED_WORDS'` 추가 + 테스트

**Interfaces:**
- Produces: `isHangulSyllable(ch)->bool`; `chainCheck(prevWord, input, usedWords)->{ok, reason, need}` (reason ∈ empty/notword/start/reuse/ok; `need`=prevWord 끝 글자); `SEED_WORDS: string[]`. `norm`(CORE) 사용.

- [ ] **Step 1: 실패하는 테스트 추가**

`test/logic.test.mjs`의 `CORE_NAMES` 배열에 `'chainCheck'`, `'isHangulSyllable'`, `'SEED_WORDS'`를 추가하고, 파일 끝에 추가:
```js
test('chainCheck: 끝 글자로 시작하면 통과', () => {
  const { chainCheck } = loadCore();
  const r = chainCheck('사과', '과자', ['사과']);
  assert.equal(r.ok, true);
  assert.equal(r.need, '과');
});
test('chainCheck: 끝 글자 불일치는 start', () => {
  const { chainCheck } = loadCore();
  const r = chainCheck('사과', '나무', ['사과']);
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'start');
  assert.equal(r.need, '과');
});
test('chainCheck: 이미 쓴 낱말은 reuse', () => {
  const { chainCheck } = loadCore();
  const r = chainCheck('모자', '자두', ['모자','자두']);
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'reuse');
});
test('chainCheck: 비한글은 notword, 빈값은 empty', () => {
  const { chainCheck } = loadCore();
  assert.equal(chainCheck('사과','apple',['사과']).reason, 'notword');
  assert.equal(chainCheck('사과','12',['사과']).reason, 'notword');
  assert.equal(chainCheck('사과','',['사과']).reason, 'empty');
});
test('chainCheck: 공백 무시', () => {
  const { chainCheck } = loadCore();
  assert.equal(chainCheck('사과',' 과 자 ',['사과']).ok, true);
});
test('SEED_WORDS: 모두 한글 음절, 길이>=2', () => {
  const { SEED_WORDS, isHangulSyllable } = loadCore();
  assert.ok(SEED_WORDS.length >= 10);
  assert.ok(SEED_WORDS.every(w => [...w].length >= 2 && [...w].every(isHangulSyllable)));
});
```

- [ ] **Step 2: 실패 확인**

Run: `node --test test/logic.test.mjs`
Expected: 새 chainCheck/SEED 테스트 FAIL(undefined). 기존 테스트 PASS.

- [ ] **Step 3: 구현**

`index.html`의 `/* CORE:END */` 바로 앞에 추가:
```js
function isHangulSyllable(ch){ const c = ch.charCodeAt(0); return c >= 0xAC00 && c <= 0xD7A3; }
const SEED_WORDS = ["사과","기차","나무","우산","가방","모자","우유","오이","다리","포도","하마","노래","두부","소라","비누"];
function chainCheck(prevWord, input, usedWords){
  const v = norm(input);
  const need = prevWord ? [...norm(prevWord)].pop() : '';
  if(!v) return { ok:false, reason:'empty', need };
  const chars = [...v];
  if(!chars.every(isHangulSyllable)) return { ok:false, reason:'notword', need };
  if(chars[0] !== need) return { ok:false, reason:'start', need };
  if(usedWords.some(w => norm(w) === v)) return { ok:false, reason:'reuse', need };
  return { ok:true, reason:'ok', need };
}
```

- [ ] **Step 4: 통과 확인**

Run: `node --test test/logic.test.mjs`
Expected: PASS(모든 chainCheck/SEED 테스트 포함).

- [ ] **Step 5: 체크포인트** — 전체 통과.

---

### Task 2: 끝말잇기 화면 (HTML/CSS/JS)

**Files:**
- Modify: `index.html` — 홈 모드 카드 추가(273행 뒤), `screen-chain` 마크업(366행 `screen-edit` 뒤), CSS, `screens` 맵(550–552행), 모드 카드 클릭 분기(886–888행), 끝말잇기 JS + 바인딩
- Modify: `test/logic.test.mjs` — 구조 검증 테스트

**Interfaces:**
- Consumes: `chainCheck`, `SEED_WORDS`, `norm`, `shuffle`(CORE); `show`, `screens`
- Produces: 전역 `chainWords`, `chainBest`; `startChain/renderChain/submitChain/finalizeBest/endChain/leaveChain`; 새 화면 `screen-chain`.

- [ ] **Step 1: 홈 모드 카드 추가**

273행 주관식 카드의 닫는 `</button>` 바로 뒤(모드 카드 `</div>` 앞)에 추가:
```html
      </button>
      <button class="mode-card chain" data-mode="chain">
        <div class="emoji">🔤</div>
        <div>
          <div class="mc-title">끝말잇기</div>
          <div class="mc-desc">낱말의 끝 글자로 새 낱말 잇기 · 최대한 길게 이어 보세요</div>
        </div>
      </button>
```

- [ ] **Step 2: screen-chain 마크업**

366행 `screen-edit`의 `</section>` 바로 뒤에 추가:
```html

  <!-- ============ WORD CHAIN ============ -->
  <section id="screen-chain" class="hidden">
    <div class="topbar">
      <button class="iconbtn" id="btn-chain-home" title="홈으로">←</button>
      <div class="title">🔤 끝말잇기</div>
      <div class="spacer"></div>
      <div class="score-pill">🔗 <span id="chain-count">0</span> · 최고 <span id="chain-best">0</span></div>
    </div>
    <div class="card">
      <div class="chain-flow" id="chain-flow"></div>
      <div class="chain-need" id="chain-need"></div>
      <div id="chain-play">
        <div class="type-input-row">
          <input class="type-input" id="chain-input" type="text" inputmode="text"
                 autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="낱말 입력">
          <button class="btn btn-sky" id="chain-submit" style="flex:none; min-height:auto; padding:0 20px">확인</button>
        </div>
        <div class="feedback" id="chain-feedback"></div>
        <div class="actions">
          <button class="btn btn-soft" id="chain-reroll">🔄 다른 낱말</button>
          <button class="btn btn-primary" id="chain-end">끝내기</button>
        </div>
      </div>
      <div id="chain-endbox" class="chain-endbox hidden">
        <div class="big" id="chain-endtext"></div>
        <div id="chain-record" class="hidden">🏆 최고 기록!</div>
        <div class="actions">
          <button class="btn btn-soft" id="chain-home2">홈으로</button>
          <button class="btn btn-primary" id="chain-restart">다시 시작</button>
        </div>
      </div>
    </div>
  </section>
```

- [ ] **Step 3: CSS**

`<style>` 블록에 추가(예: `.footer-tag` 규칙 뒤):
```css
  /* ---------- 끝말잇기 ---------- */
  .mode-card.chain .emoji{background:var(--coral-soft)}
  .chain-flow{display:flex; flex-wrap:wrap; gap:6px 4px; align-items:center; font-size:1.4rem; font-weight:800; line-height:1.5; min-height:2em}
  .chain-flow .cw{color:var(--ink-soft)}
  .chain-flow .cw.last{color:var(--green)}
  .chain-flow .arr{color:var(--line); font-weight:700}
  .chain-need{text-align:center; font-size:1.1rem; font-weight:800; color:var(--ink); margin:8px 0 2px; min-height:1.4em}
  .chain-endbox{text-align:center; padding:8px 0}
  .chain-endbox .big{font-size:1.9rem; font-weight:900; margin-bottom:4px}
  #chain-record{color:var(--gold); font-weight:800; margin-bottom:6px}
```

- [ ] **Step 4: screens 등록 + 모드 카드 분기**

`screens` 맵(550–552행)에 `chain` 추가:
```js
const screens = {
  home:$('screen-home'), quiz:$('screen-quiz'), result:$('screen-result'), edit:$('screen-edit'), chain:$('screen-chain')
};
```
모드 카드 클릭 바인딩(886–888행)을 분기로 교체:
```js
document.querySelectorAll('.mode-card').forEach(c=>{
  c.addEventListener('click', ()=>{ const m=c.dataset.mode; if(m==='chain') startChain(); else startQuiz(m); });
});
```

- [ ] **Step 5: 끝말잇기 JS**

이벤트 바인딩 섹션(`/* ===== 이벤트 바인딩 ===== */`, 885행) 바로 앞에 추가:
```js
/* ================= 끝말잇기 ================= */
const BEST_KEY = "nachmal.chain.best.v1";
function loadBest(){ try{ const n = parseInt(localStorage.getItem(BEST_KEY),10); return Number.isFinite(n) && n>0 ? n : 0; }catch(e){ return 0; } }
function saveBest(n){ try{ localStorage.setItem(BEST_KEY, String(n)); }catch(e){} }
let chainWords = [];
let chainBest = loadBest();

function renderChain(){
  const flow = $('chain-flow'); flow.innerHTML = '';
  chainWords.forEach((w,i)=>{
    if(i>0){ const a=document.createElement('span'); a.className='arr'; a.textContent='→'; flow.appendChild(a); }
    const s=document.createElement('span'); s.className='cw'+(i===chainWords.length-1?' last':''); s.textContent=w; flow.appendChild(s);
  });
  const need = chainWords.length ? [...chainWords[chainWords.length-1]].pop() : '';
  $('chain-need').textContent = need ? `다음은 ‘${need}’로 시작!` : '';
  $('chain-count').textContent = chainWords.length;
  $('chain-best').textContent = chainBest;
}
function chainFeedback(ok, msg){ const f=$('chain-feedback'); f.textContent=msg; f.className='feedback '+(ok?'ok':'no'); }
function startChain(){
  chainWords = [ shuffle(SEED_WORDS)[0] ];
  $('chain-endbox').classList.add('hidden');
  $('chain-play').classList.remove('hidden');
  $('chain-record').classList.add('hidden');
  chainFeedback(false, ''); $('chain-feedback').className='feedback';
  $('chain-input').value='';
  renderChain();
  show('chain');
  setTimeout(()=>$('chain-input').focus(), 60);
}
function submitChain(){
  const val = $('chain-input').value;
  if(!norm(val)){ $('chain-input').focus(); return; }
  const prev = chainWords[chainWords.length-1];
  const res = chainCheck(prev, val, chainWords);
  if(res.ok){
    chainWords.push(norm(val));
    $('chain-input').value='';
    renderChain();
    chainFeedback(true, '좋아요! 이어졌어요 👏');
  }else{
    let msg = '한글 낱말을 입력해요';
    if(res.reason==='start') msg = `‘${res.need}’로 시작하는 낱말이에요!`;
    else if(res.reason==='reuse') msg = '이미 쓴 낱말이에요';
    chainFeedback(false, msg);
    $('chain-input').select();
  }
}
function finalizeBest(){ if(chainWords.length > chainBest){ chainBest = chainWords.length; saveBest(chainBest); return true; } return false; }
function endChain(){
  const rec = finalizeBest();
  $('chain-play').classList.add('hidden');
  $('chain-endbox').classList.remove('hidden');
  $('chain-endtext').textContent = `🔗 ${chainWords.length}개 이어봤어요!`;
  $('chain-record').classList.toggle('hidden', !rec);
  $('chain-best').textContent = chainBest;
}
function leaveChain(){ finalizeBest(); show('home'); }
```

- [ ] **Step 6: 바인딩 추가**

이벤트 바인딩 섹션에서 `$('btn-reset-progress')…` 블록 뒤에 추가:
```js
$('chain-submit').addEventListener('click', submitChain);
$('chain-input').addEventListener('keydown', e=>{ if(e.key==='Enter') submitChain(); });
$('chain-reroll').addEventListener('click', startChain);
$('chain-end').addEventListener('click', endChain);
$('chain-restart').addEventListener('click', startChain);
$('btn-chain-home').addEventListener('click', leaveChain);
$('chain-home2').addEventListener('click', leaveChain);
```

- [ ] **Step 7: 구조 검증 테스트 추가**

```js
test('index.html: 끝말잇기 화면/배선', () => {
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  assert.ok(html.includes('id="screen-chain"'));
  assert.ok(html.includes('data-mode="chain"'));
  assert.ok(html.includes("chain:$('screen-chain')"));
  assert.ok(html.includes('function startChain'));
  assert.ok(html.includes('function submitChain'));
  assert.ok(html.includes("if(m==='chain') startChain()"));
  assert.ok(html.includes('nachmal.chain.best.v1'));
});
```

- [ ] **Step 8: 통과 확인**

Run: `node --test test/logic.test.mjs`
Expected: PASS(구조 검증 포함).

- [ ] **Step 9: 브라우저 수동 확인(가능하면)**

`index.html`을 열어: 홈 `🔤 끝말잇기` → 시드 낱말 표시 → 끝 글자로 시작하는 낱말 입력 시 체인이 이어지고 `지금`이 증가; 틀린 시작/중복/영문은 피드백 후 재시도(게임오버 아님); `끝내기` → `N개 이어봤어요!`(신기록이면 🏆); `다시 시작`으로 새 시드; `🔄 다른 낱말`로 새 시드. 브라우저를 못 열면 자동 결과만 보고.

- [ ] **Step 10: 체크포인트** — 자동 테스트 통과 + (가능시)수동 확인.

---

### Task 3: public 동기화 · 회귀 · E2E

**Files:**
- Modify: `public/index.html`(복사)

- [ ] **Step 1: 복사** — Run: `cp index.html public/index.html`
- [ ] **Step 2: 동일성** — Run: `diff -q index.html public/index.html` → 출력 없음.
- [ ] **Step 3: 전체 테스트** — Run: `node --test test/logic.test.mjs` → 전체 PASS.
- [ ] **Step 4: 브라우저 E2E(헤드리스)** — `public/` 서빙 후 실제 구동:
  - 홈에 3번째 카드 `🔤 끝말잇기`가 보이고 클릭 시 끝말잇기 화면으로 이동, 시드 낱말 1개가 체인에 표시.
  - `#chain-need`가 시드의 끝 글자를 요구; 그 글자로 시작하는 낱말 입력 → 체인 길이 증가, `#chain-count` 증가, 성공 피드백.
  - 틀린 시작 낱말/이미 쓴 낱말/영문 입력 → 각각 재시도 피드백(체인 유지, 게임오버 아님).
  - `끝내기` → `N개 이어봤어요!`; 신기록이면 `🏆 최고 기록!`; `#chain-best`가 갱신되고 `localStorage['nachmal.chain.best.v1']`에 저장; 새로고침 후 최고 기록 유지.
  - `다시 시작`/`🔄 다른 낱말`로 새 시드 시작.
  - 회귀: 받침 퀴즈 객관식·주관식 모드가 여전히 정상 시작·진행되는지(모드 카드 분기 정상).
  - 콘솔 JS 에러 없음.
- [ ] **Step 5: 체크포인트** — 두 파일 identical + 전체 테스트 통과 + E2E 확인.

---

## Self-Review

**1. Spec coverage:**
- chainCheck 규칙(끝글자/한글/중복/need) + SEED → Task 1 ✓
- 화면/모드 카드/상태/저장/피드백/끝내기·신기록 → Task 2 ✓
- 지속성/회귀/E2E/public 동기화 → Task 2(저장), Task 3 ✓

**2. Placeholder scan:** 없음. 모든 스텝 실제 코드.

**3. Type consistency:** `chainCheck` 반환(`ok/reason/need`)을 `submitChain`이 소비; `SEED_WORDS`를 `startChain`이 `shuffle`로 사용; 점수=`chainWords.length`가 render/score-pill/finalizeBest에서 일관; DOM 사용자 데이터는 `textContent`만(innerHTML 보간 없음). `screens.chain`/모드 카드 분기가 기존 `startQuiz`와 충돌 없음(chain만 분기).
