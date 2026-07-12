# 쌍받침 한 글자 채우기 통합 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 낱말 문제를 "구절 안의 한 쌍받침 글자를 채우는" 형식으로 통합하고, 신규 낱말을 추가한다.

**Architecture:** 단일 자립형 `index.html`(인라인 `<script>`)을 유지한다. 순수 로직(파싱·채점·오답 생성)을 `/* CORE:START */`~`/* CORE:END */` 마커로 감싸고, Node 테스트가 이 구간을 추출·평가해 단위 테스트한다(빌드/프레임워크 없음, `index.html`이 단일 진실 원천). DOM/CSS 변경은 구조적 문자열 검증 + 브라우저 수동 확인.

**Tech Stack:** 순수 HTML/CSS/JS(인라인), Node 내장 `node:test`/`node:assert`(테스트 실행용), Firebase Hosting(`public/`).

## Global Constraints

- 앱은 자립형 단일 파일 유지. 로직/데이터를 외부 `.js`로 분리하지 않는다. (`index.html`만 수정 → `public/index.html`에 동일 복사)
- `artifact.html`(구버전)은 수정하지 않는다.
- 정답 글자는 모두 쌍받침(ㄲ/ㅆ 종성). 기본 문제 총 31개(기존 18 변환 + 신규 13).
- `손톱 [깎]이`는 표준 표기 `깎` 사용.
- 저장 키: 기존 `nachmal.words.v1` → 신규 `nachmal.words.v2`(template 문자열 배열). v1 데이터는 자동 마이그레이션.
- 이 디렉터리는 git 저장소가 아니다. 각 태스크의 마지막은 "커밋" 대신 "체크포인트(검증 통과 확인)"로 한다. 사용자가 원하면 이후 `git init`.
- 스펙: `docs/superpowers/specs/2026-07-12-ssangbatchim-blank-fill-design.md`

---

### Task 1: Node 확인 · CORE 마커 · 테스트 하네스

순수 로직 구간을 마커로 감싸고, 그 구간을 추출·평가하는 Node 테스트 하네스를 세운다. 이 태스크의 산출물은 "추출→평가→단언"이 동작함을 증명하는 sanity 테스트다.

**Files:**
- Modify: `index.html` — 기존 자모 헬퍼(약 368–421행: `DEFAULT_WORDS`, `CHO/JUNG/JONG`, `decompose`, `compose`, `hintLabel`)와 유틸(약 499–504행: `shuffle`, `norm`)을 하나의 CORE 블록으로 재배치
- Create: `test/logic.test.mjs`

**Interfaces:**
- Produces: `index.html` 안의 `/* CORE:START */ … /* CORE:END */` 구간에 DOM/localStorage에 의존하지 않는 순수 심볼: `CHO,JUNG,JONG,decompose,compose,norm,shuffle,hintLabel`. 테스트 하네스 함수 `loadCore()` → `{ decompose, compose, norm, ... }`.

- [ ] **Step 1: Node 사용 가능 확인**

Run: `node --version`
Expected: `v18.x` 이상 출력(내장 `node:test` 사용). 없으면 사용자에게 알리고 중단.

- [ ] **Step 2: 실패하는 sanity 테스트 작성**

Create `test/logic.test.mjs`:

```js
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

const CORE_NAMES = [
  'CHO','JUNG','JONG','decompose','compose','norm','shuffle','hintLabel',
  'parseTemplate','DEFAULT_TEMPLATES','DEFAULT_WORDS','buildAnswerBoxes',
  'isCorrectTyped','makeLetterDistractors','makeOptions','templateFromV1'
];

function loadCore(){
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  const start = html.indexOf('/* CORE:START */');
  const end = html.indexOf('/* CORE:END */');
  if(start < 0 || end < 0) throw new Error('CORE markers not found in index.html');
  const core = html.slice(start, end);
  // Math.random을 결정적으로 주입(오답 셔플 테스트 재현성)
  const seedMath = Object.assign(Object.create(Math), { random: () => 0 });
  const ret = '\nreturn {' +
    CORE_NAMES.map(n => `${n}: (typeof ${n}!=='undefined'?${n}:undefined)`).join(',') +
    '};';
  return new Function('Math', core + ret)(seedMath);
}

test('harness: decompose/compose 라운드트립', () => {
  const { decompose, compose } = loadCore();
  assert.deepEqual(decompose('낚'), { cho:'ㄴ', jung:'ㅏ', jong:'ㄲ' });
  assert.equal(compose('ㄴ','ㅏ','ㄲ'), '낚');
  assert.equal(compose('ㄴ','ㅏ',''), '나');
});

test('harness: norm 공백 제거', () => {
  const { norm } = loadCore();
  assert.equal(norm(' 낚 시 '), '낚시');
});
```

- [ ] **Step 3: 실패 확인**

Run: `node --test test/logic.test.mjs`
Expected: FAIL — `CORE markers not found in index.html`.

- [ ] **Step 4: CORE 블록으로 재배치**

`index.html`의 스크립트 상단에서 기존 `DEFAULT_WORDS`(368–375행), 자모 섹션(380–421행: `CHO/JUNG/JONG`, `decompose`, `compose`, `buildBoxes`, `hintLabel`)을 삭제하고, 그 자리에 아래 CORE 블록을 넣는다. 그리고 기존 `shuffle`(499–503행)·`norm`(504행) 정의를 삭제한다(CORE로 이동).

이 태스크에서는 CORE에 **자모·유틸만** 넣는다(`parseTemplate` 등은 이후 태스크에서 추가). 기존 `buildBoxes`는 제거하고 이후 `buildAnswerBoxes`로 대체한다.

```js
/* CORE:START */  /* 순수 로직 — DOM/localStorage 미의존. test/logic.test.mjs가 추출·평가 */
const CHO=['ㄱ','ㄲ','ㄴ','ㄷ','ㄸ','ㄹ','ㅁ','ㅂ','ㅃ','ㅅ','ㅆ','ㅇ','ㅈ','ㅉ','ㅊ','ㅋ','ㅌ','ㅍ','ㅎ'];
const JUNG=['ㅏ','ㅐ','ㅑ','ㅒ','ㅓ','ㅔ','ㅕ','ㅖ','ㅗ','ㅘ','ㅙ','ㅚ','ㅛ','ㅜ','ㅝ','ㅞ','ㅟ','ㅠ','ㅡ','ㅢ','ㅣ'];
const JONG=['','ㄱ','ㄲ','ㄳ','ㄴ','ㄵ','ㄶ','ㄷ','ㄹ','ㄺ','ㄻ','ㄼ','ㄽ','ㄾ','ㄿ','ㅀ','ㅁ','ㅂ','ㅄ','ㅅ','ㅆ','ㅇ','ㅈ','ㅊ','ㅋ','ㅌ','ㅍ','ㅎ'];

function decompose(ch){
  const c = ch.charCodeAt(0) - 0xAC00;
  if(c < 0 || c > 11171) return null;
  return { cho:CHO[Math.floor(c/588)], jung:JUNG[Math.floor((c%588)/28)], jong:JONG[c%28] };
}
function compose(choStr, jungStr, jongStr){
  const ci=CHO.indexOf(choStr), ji=JUNG.indexOf(jungStr), ki=JONG.indexOf(jongStr||'');
  if(ci<0 || ji<0) return choStr;
  return String.fromCharCode(0xAC00 + ci*588 + ji*28 + (ki<0?0:ki));
}
function norm(s){ return (s||'').replace(/\s+/g,'').trim(); }
function shuffle(a){
  const arr = a.slice();
  for(let i=arr.length-1;i>0;i--){ const j=Math.floor(Math.random()*(i+1)); [arr[i],arr[j]]=[arr[j],arr[i]]; }
  return arr;
}
function hintLabel(level){
  if(level<=0) return "";
  if(level===1) return "힌트 1단계: <b>자음(초성)</b>";
  if(level===2) return "힌트 2단계: <b>자음 + 모음</b>";
  return "힌트 3단계: <b>받침까지</b> 모두!";
}
/* CORE:END */
```

- [ ] **Step 5: 통과 확인**

Run: `node --test test/logic.test.mjs`
Expected: PASS (2 tests). `harness: decompose/compose 라운드트립`, `harness: norm 공백 제거`.

- [ ] **Step 6: 체크포인트**

`node --test test/logic.test.mjs`가 통과하고, `index.html`에 CORE 마커가 존재함을 확인. (git 저장소 아님 — 커밋 생략)

---

### Task 2: parseTemplate (구절 파싱)

`"물고기 [낚]시"` 같은 template 문자열을 `{template,before,answer,after,word,full}`로 파싱.

**Files:**
- Modify: `index.html` — CORE 블록 `/* CORE:END */` 바로 앞에 `parseTemplate` 추가
- Modify: `test/logic.test.mjs` — 테스트 추가

**Interfaces:**
- Produces: `parseTemplate(str) -> {template:string, before:string, answer:string, after:string, word:string, full:string} | null`. `word` = 빈칸이 포함된 공백 없는 낱말. `full` = before+answer+after.

- [ ] **Step 1: 실패하는 테스트 추가**

`test/logic.test.mjs` 끝에 추가:

```js
test('parseTemplate: 끝 빈칸', () => {
  const { parseTemplate } = loadCore();
  assert.deepEqual(parseTemplate('야채를 [볶]다'),
    { template:'야채를 [볶]다', before:'야채를 ', answer:'볶', after:'다', word:'볶다', full:'야채를 볶다' });
});
test('parseTemplate: 중간 빈칸(낱말 내부)', () => {
  const { parseTemplate } = loadCore();
  const w = parseTemplate('물고기 [낚]시');
  assert.equal(w.answer, '낚');
  assert.equal(w.word, '낚시');
  assert.equal(w.full, '물고기 낚시');
});
test('parseTemplate: 음절 사이 빈칸', () => {
  const { parseTemplate } = loadCore();
  const w = parseTemplate('급식을 먹[었]다');
  assert.equal(w.word, '먹었다');
  assert.equal(w.full, '급식을 먹었다');
});
test('parseTemplate: 앞 빈칸', () => {
  const { parseTemplate } = loadCore();
  const w = parseTemplate('[밖]에 나간다');
  assert.equal(w.before, '');
  assert.equal(w.word, '밖에');
  assert.equal(w.full, '밖에 나간다');
});
test('parseTemplate: 시작 빈칸+접미', () => {
  const { parseTemplate } = loadCore();
  assert.equal(parseTemplate('[볶]음밥').word, '볶음밥');
});
test('parseTemplate: 무효 입력', () => {
  const { parseTemplate } = loadCore();
  assert.equal(parseTemplate('대괄호 없음'), null);
  assert.equal(parseTemplate('[]빈정답'), null);
  assert.equal(parseTemplate('   '), null);
});
```

- [ ] **Step 2: 실패 확인**

Run: `node --test test/logic.test.mjs`
Expected: 새 테스트 FAIL(`L.parseTemplate is not a function` / TypeError). 기존 harness 테스트는 PASS 유지.

- [ ] **Step 3: parseTemplate 구현**

`index.html`의 `/* CORE:END */` 바로 앞에 추가:

```js
function parseTemplate(str){
  const s = (str||'').trim();
  const m = s.match(/^([\s\S]*)\[([^\]]+)\]([\s\S]*)$/);
  if(!m) return null;
  const before = m[1], answer = m[2], after = m[3];
  if(!answer) return null;
  const beforeWord = before.split(/\s/).pop();   // 마지막 공백 뒤 조각
  const afterWord  = after.split(/\s/)[0];        // 첫 공백 앞 조각
  return { template:s, before, answer, after, word: beforeWord + answer + afterWord, full: before + answer + after };
}
```

- [ ] **Step 4: 통과 확인**

Run: `node --test test/logic.test.mjs`
Expected: PASS (모든 parseTemplate 테스트 포함).

- [ ] **Step 5: 체크포인트** — 전체 테스트 통과 확인.

---

### Task 3: 기본 문제 데이터 (DEFAULT_TEMPLATES / DEFAULT_WORDS)

기존 18개 변환 + 신규 13개 = 31개 template과 파싱 배열 정의.

**Files:**
- Modify: `index.html` — CORE에 `DEFAULT_TEMPLATES`, `DEFAULT_WORDS` 추가(`parseTemplate` 뒤)
- Modify: `test/logic.test.mjs`

**Interfaces:**
- Produces: `DEFAULT_TEMPLATES: string[]`(길이 31), `DEFAULT_WORDS = DEFAULT_TEMPLATES.map(parseTemplate)`.

- [ ] **Step 1: 실패하는 테스트 추가**

```js
test('DEFAULT: 31개, 모두 파싱, 특정 항목 포함', () => {
  const { DEFAULT_TEMPLATES, DEFAULT_WORDS } = loadCore();
  assert.equal(DEFAULT_TEMPLATES.length, 31);
  assert.ok(DEFAULT_WORDS.every(w => w && w.answer.length >= 1));
  assert.ok(DEFAULT_TEMPLATES.includes('물고기 [낚]시'));
  assert.ok(DEFAULT_TEMPLATES.includes('[볶]음밥'));
  assert.ok(DEFAULT_TEMPLATES.includes('급식을 먹[었]다'));
  assert.ok(DEFAULT_TEMPLATES.includes('손톱 [깎]이'));   // 표준 표기 깎
  assert.ok(!DEFAULT_TEMPLATES.includes('손톱 [깍]이'));  // 오탈자 아님
});
test('DEFAULT: 정확 중복 없음(안경을 닦다 1회)', () => {
  const { DEFAULT_TEMPLATES } = loadCore();
  assert.equal(new Set(DEFAULT_TEMPLATES).size, DEFAULT_TEMPLATES.length);
  assert.equal(DEFAULT_TEMPLATES.filter(t => t === '안경을 [닦]다').length, 1);
});
```

- [ ] **Step 2: 실패 확인**

Run: `node --test test/logic.test.mjs`
Expected: 새 테스트 FAIL(`DEFAULT_TEMPLATES` undefined → length 읽기 TypeError).

- [ ] **Step 3: 데이터 추가**

`parseTemplate` 정의 바로 뒤(여전히 `/* CORE:END */` 앞)에 추가:

```js
const DEFAULT_TEMPLATES = [
  // 기존 18개(동사) 변환
  "야채를 [볶]다","밤에 잠을 [잤]다","꿈을 [꿨]다","꽃을 [꺾]다",
  "사과를 [깎]다","물고기를 [낚]다","끈을 [묶]다","안경을 [닦]다",
  "가방을 [쌌]다","마늘을 [깠]다","아침에 잠을 [깼]다","메달을 [땄]다",
  "달이 [떴]다","글씨를 [썼]다","벨트를 [맸]다","제기를 [찼]다",
  "불을 [껐]다","물감을 [짰]다",
  // 신규 13개
  "[밖]에 나간다","물고기 [낚]시","머리카락을 [묶]다","손톱 [깎]이",
  "떡 [볶]이","[볶]음밥","연필 [깎]이","이를 [닦]다",
  "리본을 [묶]다","급식을 먹[었]다","축구공을 [찼]다","학교에 [갔]다","물건을 [샀]다"
];
const DEFAULT_WORDS = DEFAULT_TEMPLATES.map(parseTemplate);
```

- [ ] **Step 4: 통과 확인**

Run: `node --test test/logic.test.mjs`
Expected: PASS.

- [ ] **Step 5: 체크포인트** — 전체 테스트 통과.

---

### Task 4: buildAnswerBoxes (빈칸 힌트 단계)

정답 글자를 힌트 단계별 표시 상태로 변환(기존 `buildBoxes`의 "마지막 글자 항상 고정" 규칙 없음).

**Files:**
- Modify: `index.html` — CORE에 `buildAnswerBoxes` 추가
- Modify: `test/logic.test.mjs`

**Interfaces:**
- Produces: `buildAnswerBoxes(answer:string, level:number) -> Array<{text:string, state:'empty'|'hint'|'revealed'|'fixed'}>`.

- [ ] **Step 1: 실패하는 테스트 추가**

```js
test('buildAnswerBoxes: 단계별 상태', () => {
  const { buildAnswerBoxes } = loadCore();
  assert.deepEqual(buildAnswerBoxes('낚', 0), [{ text:'', state:'empty' }]);
  assert.deepEqual(buildAnswerBoxes('낚', 1), [{ text:'ㄴ', state:'hint' }]);
  assert.deepEqual(buildAnswerBoxes('낚', 2), [{ text:'나', state:'hint' }]);
  assert.deepEqual(buildAnswerBoxes('낚', 3), [{ text:'낚', state:'revealed' }]);
});
test('buildAnswerBoxes: 비한글은 fixed', () => {
  const { buildAnswerBoxes } = loadCore();
  assert.deepEqual(buildAnswerBoxes('A', 0), [{ text:'A', state:'fixed' }]);
});
```

- [ ] **Step 2: 실패 확인**

Run: `node --test test/logic.test.mjs`
Expected: FAIL(`buildAnswerBoxes` 미정의).

- [ ] **Step 3: 구현**

`/* CORE:END */` 앞에 추가:

```js
function buildAnswerBoxes(answer, level){
  return [...answer].map(ch=>{
    const d = decompose(ch);
    if(!d) return { text:ch, state:'fixed' };
    if(level<=0) return { text:'', state:'empty' };
    if(level===1) return { text:d.cho, state:'hint' };
    if(level===2) return { text:compose(d.cho, d.jung, ''), state:'hint' };
    return { text:ch, state:'revealed' };
  });
}
```

- [ ] **Step 4: 통과 확인**

Run: `node --test test/logic.test.mjs`
Expected: PASS.

- [ ] **Step 5: 체크포인트** — 전체 통과.

---

### Task 5: isCorrectTyped (주관식 채점)

빈칸 글자 또는 전체 낱말을 정답으로 인정.

**Files:**
- Modify: `index.html` — CORE에 `isCorrectTyped` 추가
- Modify: `test/logic.test.mjs`

**Interfaces:**
- Consumes: `norm`(CORE)
- Produces: `isCorrectTyped(val:string, w:{answer:string, word:string}) -> boolean`.

- [ ] **Step 1: 실패하는 테스트 추가**

```js
test('isCorrectTyped: 글자/낱말 모두 인정, 공백 무시', () => {
  const { isCorrectTyped, parseTemplate } = loadCore();
  const w = parseTemplate('물고기 [낚]시');   // answer 낚, word 낚시
  assert.equal(isCorrectTyped('낚', w), true);
  assert.equal(isCorrectTyped('낚시', w), true);
  assert.equal(isCorrectTyped(' 낚 시 ', w), true);
  assert.equal(isCorrectTyped('낙', w), false);
  assert.equal(isCorrectTyped('', w), false);
});
test('isCorrectTyped: 앞 빈칸(밖/밖에)', () => {
  const { isCorrectTyped, parseTemplate } = loadCore();
  const w = parseTemplate('[밖]에 나간다');
  assert.equal(isCorrectTyped('밖', w), true);
  assert.equal(isCorrectTyped('밖에', w), true);
});
```

- [ ] **Step 2: 실패 확인**

Run: `node --test test/logic.test.mjs`
Expected: FAIL(`isCorrectTyped` 미정의).

- [ ] **Step 3: 구현**

`/* CORE:END */` 앞에 추가:

```js
function isCorrectTyped(val, w){
  const v = norm(val);
  if(!v) return false;
  return v === norm(w.answer) || v === norm(w.word);
}
```

- [ ] **Step 4: 통과 확인**

Run: `node --test test/logic.test.mjs`
Expected: PASS.

- [ ] **Step 5: 체크포인트** — 전체 통과.

---

### Task 6: 발음 혼동 오답 (makeLetterDistractors / makeOptions)

정답 한 글자에 초성·중성·종성 혼동을 적용해 발음이 비슷한 오답 3개 생성(받침 변형 우선).

**Files:**
- Modify: `index.html` — CORE에 혼동표 + `makeLetterDistractors` + `makeOptions` 추가
- Modify: `test/logic.test.mjs`

**Interfaces:**
- Consumes: `decompose,compose,shuffle`(CORE)
- Produces: `makeLetterDistractors(answerChar:string) -> string[3]`(정답 제외, 서로 다름), `makeOptions(answer:string) -> string[4]`(정답 포함).

- [ ] **Step 1: 실패하는 테스트 추가**

`loadCore()`는 `Math.random=()=>0`을 주입하므로 결과가 결정적이다.

```js
test('makeLetterDistractors: 3개, 정답 제외, 서로 다름', () => {
  const { makeLetterDistractors } = loadCore();
  for(const A of ['낚','었','밖','갔','볶','샀']){
    const d = makeLetterDistractors(A);
    assert.equal(d.length, 3, `${A} → 3개`);
    assert.equal(new Set(d).size, 3, `${A} → 중복 없음`);
    assert.ok(!d.includes(A), `${A} → 정답 미포함`);
  }
});
test('makeLetterDistractors: 홑받침 헷갈림 포함(ㄲ→ㄱ, ㅆ→ㅅ)', () => {
  const { makeLetterDistractors } = loadCore();
  assert.ok(makeLetterDistractors('낚').includes('낙'), '낚→낙');
  assert.ok(makeLetterDistractors('밖').includes('박'), '밖→박');
  assert.ok(makeLetterDistractors('갔').includes('갓'), '갔→갓');
  assert.ok(makeLetterDistractors('었').includes('엇'), '었→엇');
});
test('makeOptions: 4개, 정답 포함, 서로 다름', () => {
  const { makeOptions } = loadCore();
  const o = makeOptions('볶');
  assert.equal(o.length, 4);
  assert.equal(new Set(o).size, 4);
  assert.ok(o.includes('볶'));
});
```

- [ ] **Step 2: 실패 확인**

Run: `node --test test/logic.test.mjs`
Expected: FAIL(`makeLetterDistractors` 미정의).

- [ ] **Step 3: 구현**

`/* CORE:END */` 앞에 추가:

```js
const CHO_CONF = {
  'ㄱ':['ㄲ','ㅋ'],'ㄲ':['ㄱ','ㅋ'],'ㅋ':['ㄱ','ㄲ'],
  'ㄷ':['ㄸ','ㅌ'],'ㄸ':['ㄷ','ㅌ'],'ㅌ':['ㄷ','ㄸ'],
  'ㅂ':['ㅃ','ㅍ'],'ㅃ':['ㅂ','ㅍ'],'ㅍ':['ㅂ','ㅃ'],
  'ㅅ':['ㅆ'],'ㅆ':['ㅅ'],
  'ㅈ':['ㅉ','ㅊ'],'ㅉ':['ㅈ','ㅊ'],'ㅊ':['ㅈ','ㅉ']
};
const JUNG_CONF = {
  'ㅐ':['ㅔ','ㅒ'],'ㅔ':['ㅐ','ㅖ'],'ㅒ':['ㅐ','ㅖ'],'ㅖ':['ㅔ','ㅒ'],
  'ㅏ':['ㅑ','ㅓ'],'ㅑ':['ㅏ','ㅕ'],'ㅓ':['ㅕ','ㅗ'],'ㅕ':['ㅓ','ㅖ'],
  'ㅗ':['ㅜ','ㅓ'],'ㅜ':['ㅗ','ㅠ'],'ㅛ':['ㅗ','ㅠ'],'ㅠ':['ㅜ','ㅛ'],
  'ㅚ':['ㅙ','ㅞ'],'ㅙ':['ㅚ','ㅞ'],'ㅞ':['ㅚ','ㅙ'],'ㅘ':['ㅚ','ㅝ'],'ㅝ':['ㅘ','ㅞ'],
  'ㅡ':['ㅜ','ㅗ'],'ㅣ':['ㅢ','ㅟ']
};
const JONG_CONF = {
  'ㄲ':['ㄱ','','ㅆ'],'ㅆ':['ㅅ','','ㄲ'],
  'ㄱ':['ㄲ',''],'ㅅ':['ㅆ','']
};
const GENERIC_JONG = ['ㄱ','ㄲ','ㅅ','ㅆ',''];

function makeLetterDistractors(answerChar){
  const d = decompose(answerChar);
  if(!d) return shuffle(['가','나','다','라','마']).slice(0,3);
  const g1 = (JONG_CONF[d.jong] || GENERIC_JONG).map(j => compose(d.cho, d.jung, j)); // 받침(우선)
  const g2 = (CHO_CONF[d.cho] || []).map(c => compose(c, d.jung, d.jong));            // 초성
  const g3 = (JUNG_CONF[d.jung] || []).map(v => compose(d.cho, v, d.jong));           // 중성
  const ordered = [...shuffle(g1), ...shuffle(g2), ...shuffle(g3)];
  const out = [];
  const push = ch => { if(ch && ch !== answerChar && !out.includes(ch) && out.length < 3) out.push(ch); };
  ordered.forEach(push);
  // 부족분 보충: 목표 초/중성 + 일반 받침 → 그래도 부족하면 공통 글자
  GENERIC_JONG.map(j => compose(d.cho, d.jung, j)).forEach(push);
  ['가','나','다','라','마','바','사'].forEach(push);
  return out.slice(0, 3);
}
function makeOptions(answer){
  return shuffle([answer, ...makeLetterDistractors(answer)]);
}
```

- [ ] **Step 4: 통과 확인**

Run: `node --test test/logic.test.mjs`
Expected: PASS.

- [ ] **Step 5: 체크포인트** — 전체 통과.

---

### Task 7: templateFromV1 (v1 마이그레이션 헬퍼)

기존 `{prompt, answer}`를 신규 template 문자열로 변환하는 순수 헬퍼.

**Files:**
- Modify: `index.html` — CORE에 `templateFromV1` 추가
- Modify: `test/logic.test.mjs`

**Interfaces:**
- Produces: `templateFromV1(prompt:string, answer:string) -> string | null`. 규칙: 정답 첫 글자를 빈칸, 나머지는 접미. `("야채를","볶다") -> "야채를 [볶]다"`.

- [ ] **Step 1: 실패하는 테스트 추가**

```js
test('templateFromV1: 기존 동사 → template', () => {
  const { templateFromV1, parseTemplate } = loadCore();
  assert.equal(templateFromV1('야채를','볶다'), '야채를 [볶]다');
  assert.equal(templateFromV1('달이','떴다'), '달이 [떴]다');
  const w = parseTemplate(templateFromV1('물고기를','낚다'));
  assert.equal(w.answer, '낚');
  assert.equal(w.word, '낚다');
  assert.equal(templateFromV1('x',''), null);
});
```

- [ ] **Step 2: 실패 확인**

Run: `node --test test/logic.test.mjs`
Expected: FAIL(`templateFromV1` 미정의).

- [ ] **Step 3: 구현**

`/* CORE:END */` 앞에 추가:

```js
function templateFromV1(prompt, answer){
  const a = [...(answer||'')];
  if(!a.length) return null;
  return `${prompt} [${a[0]}]${a.slice(1).join('')}`;
}
```

- [ ] **Step 4: 통과 확인**

Run: `node --test test/logic.test.mjs`
Expected: PASS.

- [ ] **Step 5: 체크포인트** — 전체 통과.

---

### Task 8: 저장/로드 v2 + 마이그레이션 배선

CORE 밖의 상태/저장 코드를 신규 형식에 맞춘다.

**Files:**
- Modify: `index.html` — `STORE_KEY` 상수, `loadWords`, `saveWords`(약 377, 427–436행)

**Interfaces:**
- Consumes: `parseTemplate, templateFromV1, DEFAULT_WORDS`(CORE)
- Produces: `loadWords() -> parsedWord[]`, `saveWords(words:parsedWord[])`(template 문자열 배열로 저장). 전역 `WORDS`는 parsed word 객체 배열.

- [ ] **Step 1: 상수/함수 교체**

기존 `const STORE_KEY = "nachmal.words.v1";`(377행)을 아래로 교체:

```js
const STORE_KEY_V1 = "nachmal.words.v1";
const STORE_KEY_V2 = "nachmal.words.v2";
```

기존 `loadWords`/`saveWords`(427–436행)를 아래로 교체:

```js
function loadWords(){
  try{
    const raw = localStorage.getItem(STORE_KEY_V2);
    if(raw){
      const arr = JSON.parse(raw);
      if(Array.isArray(arr) && arr.length){
        const w = arr.map(parseTemplate).filter(Boolean);
        if(w.length) return w;
      }
    }
  }catch(e){}
  try{
    const rawV1 = localStorage.getItem(STORE_KEY_V1);   // v1 → v2 마이그레이션
    if(rawV1){
      const arr = JSON.parse(rawV1);
      if(Array.isArray(arr) && arr.length){
        const w = arr
          .map(o => (o && o.prompt && o.answer) ? templateFromV1(o.prompt, o.answer) : null)
          .filter(Boolean).map(parseTemplate).filter(Boolean);
        if(w.length){ saveWords(w); return w; }
      }
    }
  }catch(e){}
  return DEFAULT_WORDS.slice();
}
function saveWords(words){
  try{ localStorage.setItem(STORE_KEY_V2, JSON.stringify(words.map(w=>w.template))); }catch(e){}
}
```

- [ ] **Step 2: 구조 검증 테스트 추가**

`test/logic.test.mjs`에 파일 문자열 검사 추가:

```js
test('index.html: v2 저장키/마이그레이션 배선', () => {
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  assert.ok(html.includes('nachmal.words.v2'));
  assert.ok(html.includes('STORE_KEY_V1'));
  assert.ok(html.includes('templateFromV1(o.prompt, o.answer)'));
  assert.ok(html.includes('words.map(w=>w.template)'));
});
```

- [ ] **Step 3: 통과 확인**

Run: `node --test test/logic.test.mjs`
Expected: PASS.

- [ ] **Step 4: 체크포인트** — 전체 통과.

---

### Task 9: 화면 렌더링 재작성 (HTML/CSS/JS)

프롬프트+빈칸을 하나의 인라인 구절로 통합하고, 렌더/보기/TTS/애니메이션 참조를 갱신.

**Files:**
- Modify: `index.html` — 퀴즈 카드 마크업(289–300행), CSS(`.prompt-word`/`.boxes`/`.box` 인근), `renderQuestion`/`drawBoxes`/`renderOptions`/`chooseOption`/`submitTyped`/`onCorrect`/`skipQuestion`/`useHint`/TTS 바인딩

**Interfaces:**
- Consumes: `buildAnswerBoxes, makeOptions, hintLabel`(CORE), `currentWord()`가 반환하는 `{before,after,answer,word,full}`
- Produces: `renderPhrase()`(기존 `drawBoxes` 대체). 애니메이션 대상 엘리먼트 id `phrase`.

- [ ] **Step 1: 퀴즈 카드 마크업 교체**

`index.html` 289–300행의 `prompt-block` + `boxes` + `hint-note` 영역을 아래로 교체:

```html
      <div class="prompt-block">
        <div class="prompt-label">빈칸에 알맞은 글자를 넣어요</div>
        <div class="phrase" id="phrase"></div>
        <div class="hint-note" id="hint-note"></div>
        <div>
          <button class="ttsbtn" id="btn-tts">🔊 읽어주기</button>
        </div>
      </div>
```

(기존 `prompt-word`/`prompt-obj`/`prompt-blank`, 별도 `<div class="boxes" id="boxes">`, 그 자리의 `hint-note`는 제거됨.)

- [ ] **Step 2: CSS 추가/조정**

`.prompt-word{…}` 규칙(129–132행) 뒤에 인라인 구절 스타일 추가:

```css
  .phrase{
    font-size:2.3rem; font-weight:900; letter-spacing:-.02em; line-height:1.5;
    text-align:center; word-break:keep-all;
  }
  .phrase .ctx{ color:var(--ink); }
  .phrase .box{
    display:inline-grid; place-items:center; vertical-align:-.22em;
    min-width:1.35em; height:1.5em; padding:0 .12em; margin:0 .06em;
    font-size:.95em; border-radius:.28em; border:2px dashed var(--line); color:var(--ink);
    background:transparent;
  }
```

(색상 상태 `.box.hint`/`.box.revealed`/`.box.fixed`는 기존 규칙 재사용. 기존 블록형 `.boxes`/`.box` 규칙은 남겨두어도 무방하나 사용되지 않음.)

- [ ] **Step 3: renderPhrase 및 참조 교체**

기존 `drawBoxes` 함수(586–598행)를 아래 `renderPhrase`로 교체:

```js
function renderPhrase(){
  const w = currentWord();
  const cells = buildAnswerBoxes(w.answer, state.hintLevel);
  const p = $('phrase');
  p.innerHTML = '';
  if(w.before){ const s=document.createElement('span'); s.className='ctx'; s.textContent=w.before; p.appendChild(s); }
  cells.forEach(c=>{
    const el = document.createElement('span');
    el.className = 'box ' + (c.state==='hint'?'hint':c.state==='revealed'?'revealed':c.state==='fixed'?'fixed':'');
    el.textContent = c.text;
    p.appendChild(el);
  });
  if(w.after){ const s=document.createElement('span'); s.className='ctx'; s.textContent=w.after; p.appendChild(s); }
  $('hint-note').innerHTML = hintLabel(state.hintLevel);
}
```

`renderQuestion`(548–584행) 안에서:
- `$('prompt-obj').textContent = w.prompt + ' ';` 줄을 **삭제**.
- `drawBoxes();` 호출을 `renderPhrase();`로 교체.

나머지 `drawBoxes()` 호출을 모두 `renderPhrase()`로 교체: `useHint`, `skipQuestion`, `submitTyped`(오답분기), `onCorrect` 이전 `chooseOption`. 그리고 애니메이션/펄스 대상 `$('boxes')`를 `$('phrase')`로 교체:
- `chooseOption` 오답 분기: `$('boxes').classList.remove('shake'); void $('boxes').offsetWidth; $('boxes').classList.add('shake');` → `boxes`를 `phrase`로.
- `submitTyped` 정답 분기: `$('boxes').classList.add('pop');` → `phrase`.
- `submitTyped` 오답 분기: `$('boxes')…shake` → `phrase`.

- [ ] **Step 4: 객관식 보기 생성 교체**

`renderOptions`(601–617행)의 distractor 생성부를 `makeOptions`로 교체:

```js
function renderOptions(){
  const w = currentWord();
  const opts = makeOptions(w.answer);
  state.options = opts;
  const box = $('options');
  box.innerHTML = '';
  opts.forEach(ans=>{
    const b = document.createElement('button');
    b.className = 'opt'; b.textContent = ans; b.dataset.ans = ans;
    b.addEventListener('click', ()=>chooseOption(b, ans));
    box.appendChild(b);
  });
}
```

(`chooseOption`의 `ans === w.answer` 비교는 그대로 — 이제 한 글자 단위.)

- [ ] **Step 5: 정답 공개 · TTS · 입력 힌트 텍스트 교체**

- `onCorrect`(662–674행): `$('answer-reveal').textContent = \`${currentWord().prompt} ${currentWord().answer}\`;` → `$('answer-reveal').textContent = currentWord().full;`
- `skipQuestion`(700–720행): 주관식 분기 `$('type-input').value = w.answer;`는 유지(빈칸 글자). `$('answer-reveal').textContent = \`${w.prompt} ${w.answer}\`;` → `$('answer-reveal').textContent = w.full;`. 피드백 `정답은 "${w.answer}" 였어요.`는 유지.
- TTS 바인딩(789행): `$('btn-tts').addEventListener('click', ()=>{ const w=currentWord(); speak(w.prompt + ' 무엇을 했나요?'); });` → `$('btn-tts').addEventListener('click', ()=>{ speak(currentWord().full); });`
- 입력창 placeholder(306행): `placeholder="정답 입력 (다 생략 가능)"` → `placeholder="빈칸 글자 입력"`

- [ ] **Step 6: 구조 검증 테스트 추가**

```js
test('index.html: 렌더링 배선 정리', () => {
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  assert.ok(html.includes('id="phrase"'));
  assert.ok(html.includes('function renderPhrase'));
  assert.ok(html.includes('makeOptions(w.answer)'));
  assert.ok(html.includes('speak(currentWord().full)'));
  // 제거 확인
  assert.ok(!html.includes('id="prompt-obj"'));
  assert.ok(!html.includes('id="prompt-blank"'));
  assert.ok(!html.includes('id="boxes"'));
  assert.ok(!/function drawBoxes|drawBoxes\(\)/.test(html));
  assert.ok(!html.includes('무엇을 했나요'));
});
```

- [ ] **Step 7: 통과 확인**

Run: `node --test test/logic.test.mjs`
Expected: PASS(구조 검증 포함).

- [ ] **Step 8: 브라우저 수동 확인**

`index.html`을 브라우저로 열어(`open index.html`):
- 객관식/주관식 각각 몇 문제 진행.
- 앞/중간/끝 빈칸 문제(`[볶]음밥`, `물고기 [낚]시`, `급식을 먹[었]다`, `[밖]에 나간다`)가 문맥+빈칸으로 올바르게 인라인 표시되는지, 빈칸 박스 정렬이 자연스러운지.
- 💡 힌트 0→3단계가 빈칸→초성→초+중성→완성으로 뜨는지.
- 주관식에서 `낚`과 `낚시` 모두 정답 처리, 오답 시 힌트 증가·흔들림 애니메이션 동작.
- 객관식 보기 4개가 서로 다르고 정답 포함·발음 혼동형인지, 오답 클릭 시 하나 제거되는지.
- 🔊 읽어주기가 완성 구절을 읽는지.

- [ ] **Step 9: 체크포인트** — 자동 테스트 통과 + 수동 확인 완료.

---

### Task 10: 편집기 갱신

편집기 형식을 template 한 줄로 바꾸고 도움말/검증 갱신.

**Files:**
- Modify: `index.html` — 편집기 도움말 마크업(350–353행), `openEditor`/`parseEditor`/`saveEditor`/`resetEditor`(740–770행)

**Interfaces:**
- Consumes: `parseTemplate, DEFAULT_TEMPLATES`(CORE), `saveWords`(Task 8)
- Produces: `parseEditor(text) -> parsedWord[]`.

- [ ] **Step 1: 도움말 마크업 교체**

350–353행 `edit-help` 내용을 교체:

```html
    <p class="edit-help">
      한 줄에 한 구절씩, 정답 글자를 대괄호 <code>[ ]</code>로 감싸요.<br>
      예: <code>물고기 [낚]시</code> · <code>급식을 먹[었]다</code> · <code>[볶]음밥</code>
    </p>
```

- [ ] **Step 2: 편집기 함수 교체**

`openEditor`/`parseEditor`/`saveEditor`/`resetEditor`(740–770행)를 교체:

```js
function openEditor(){
  $('editor').value = WORDS.map(w=>w.template).join('\n');
  $('edit-msg').textContent=''; $('edit-msg').className='edit-msg';
  show('edit');
}
function parseEditor(text){
  const out=[];
  text.split('\n').forEach(line=>{
    const w = parseTemplate(line);
    if(w) out.push(w);
  });
  return out;
}
function saveEditor(){
  const arr = parseEditor($('editor').value);
  const msg = $('edit-msg');
  if(arr.length < 2){
    msg.textContent = '문제를 2개 이상 입력해 주세요. (형식: 정답 글자를 [ ]로 감싸기)';
    msg.className='edit-msg no'; return;
  }
  WORDS = arr; saveWords(arr);
  msg.textContent = `저장했어요! (${arr.length}개 문제)`;
  msg.className='edit-msg ok';
  updateHomeCount();
}
function resetEditor(){
  $('editor').value = DEFAULT_TEMPLATES.join('\n');
  $('edit-msg').textContent = '기본 문제로 되돌렸어요. "저장"을 눌러 적용하세요.';
  $('edit-msg').className='edit-msg ok';
}
```

- [ ] **Step 3: 구조 검증 테스트 추가**

```js
test('index.html: 편집기 template 형식', () => {
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  assert.ok(html.includes('WORDS.map(w=>w.template)'));
  assert.ok(html.includes('DEFAULT_TEMPLATES.join'));
  assert.ok(html.includes('const w = parseTemplate(line)'));
});
```

- [ ] **Step 4: 통과 확인**

Run: `node --test test/logic.test.mjs`
Expected: PASS.

- [ ] **Step 5: 브라우저 수동 확인**

- 홈 → "✎ 낱말 편집하기": 기존 문제들이 `물고기 [낚]시` 형식으로 채워지는지.
- 한 줄 추가(`책상을 [닦]다`) 후 저장 → "저장했어요! (32개 문제)".
- 새로고침 후에도 유지되는지(localStorage v2).
- "기본값 복원" → 31줄로 되돌아가는지.

- [ ] **Step 6: 체크포인트** — 자동/수동 확인 완료.

---

### Task 11: public 동기화 · 전체 회귀 확인

배포 대상(`public/index.html`)을 동기화하고 최종 점검.

**Files:**
- Modify: `public/index.html`(복사)

- [ ] **Step 1: 복사**

Run: `cp index.html public/index.html`

- [ ] **Step 2: 동일성 확인**

Run: `diff -q index.html public/index.html`
Expected: 출력 없음(identical).

- [ ] **Step 3: 전체 테스트 재실행**

Run: `node --test test/logic.test.mjs`
Expected: 전체 PASS.

- [ ] **Step 4: v1 마이그레이션 브라우저 확인(수동)**

DevTools 콘솔에서 예전 데이터를 심고 확인:
```js
localStorage.removeItem('nachmal.words.v2');
localStorage.setItem('nachmal.words.v1', JSON.stringify([{prompt:'야채를',answer:'볶다'},{prompt:'달이',answer:'떴다'}]));
location.reload();
```
Expected: 홈 하단 문제 수 2개, 편집기 열면 `야채를 [볶]다` / `달이 [떴]다`로 표시, `localStorage['nachmal.words.v2']`에 template 배열이 저장됨. 확인 후 `localStorage.clear()`로 정리.

- [ ] **Step 5: 최종 체크포인트** — 두 파일 identical + 전체 테스트 통과 + 수동 시나리오 확인.

---

## Self-Review

**1. Spec coverage:**
- 데이터 형식(before/answer/after/word/full) → Task 2 ✓
- 기본 문제 31개(변환+신규, 깎 표준, 중복 제외) → Task 3 ✓
- 인라인 표시 + 힌트 박스 → Task 4(상태), Task 9(렌더) ✓
- 읽어주기 완성 구절 → Task 9 Step5 ✓
- 주관식 채점(글자/낱말) → Task 5 ✓
- 객관식 발음 혼동 오답(초/중/종성, 받침 우선) → Task 6 ✓
- 편집기 template 형식 → Task 10 ✓
- 저장 v2 + v1 마이그레이션 → Task 7(헬퍼), Task 8(배선), Task 11 Step4(확인) ✓
- 파일 동기화(index→public), artifact.html 미변경 → Task 11 ✓, Global Constraints ✓

**2. Placeholder scan:** "TBD/TODO/적절히 처리" 없음. 모든 코드 스텝에 실제 코드 포함.

**3. Type consistency:** `parseTemplate` 반환 필드(`before/answer/after/word/full/template`)를 `isCorrectTyped`(answer,word), `renderPhrase`(before/after/answer), `loadWords/saveWords`(template), 편집기(template), TTS(full), 정답공개(full)에서 일관되게 사용. `makeOptions`→`renderOptions`→`chooseOption(w.answer)` 한 글자 단위 일관. `drawBoxes`는 전면 제거하고 `renderPhrase`로 통일(Task 9 구조 검증에서 잔존 여부 확인).
