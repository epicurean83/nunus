import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

const CORE_NAMES = [
  'CHO','JUNG','JONG','decompose','compose','norm','shuffle','hintLabel',
  'parseTemplate','DEFAULT_TEMPLATES','DEFAULT_WORDS','buildAnswerBoxes',
  'isCorrectTyped','makeLetterDistractors','makeOptions','templateFromV1','pickRound'
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
test('DEFAULT: 모든 정답이 쌍받침(ㄲ/ㅆ)', () => {   // 이 카테고리 확장 시 회귀 방지
  const { DEFAULT_WORDS, decompose } = loadCore();
  assert.ok(DEFAULT_WORDS.every(w => ['ㄲ','ㅆ'].includes(decompose(w.answer).jong)));
});

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

test('templateFromV1: 기존 동사 → template', () => {
  const { templateFromV1, parseTemplate } = loadCore();
  assert.equal(templateFromV1('야채를','볶다'), '야채를 [볶]다');
  assert.equal(templateFromV1('달이','떴다'), '달이 [떴]다');
  const w = parseTemplate(templateFromV1('물고기를','낚다'));
  assert.equal(w.answer, '낚');
  assert.equal(w.word, '낚다');
  assert.equal(templateFromV1('x',''), null);
});

test('index.html: v2 저장키/마이그레이션 배선', () => {
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  assert.ok(html.includes('nachmal.words.v2'));
  assert.ok(html.includes('STORE_KEY_V1'));
  assert.ok(html.includes('templateFromV1(o.prompt, o.answer)'));
  assert.ok(html.includes('words.map(w=>w.template)'));
});

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

test('index.html: 편집기 template 형식', () => {
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  assert.ok(html.includes('WORDS.map(w=>w.template)'));
  assert.ok(html.includes('DEFAULT_TEMPLATES.join'));
  assert.ok(html.includes('const w = parseTemplate(line)'));
});

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
test('pickRound: 중복 템플릿 입력이어도 라운드는 서로 다름', () => {
  const { pickRound } = loadCore();
  const r = pickRound(['a','a','b','c'], [], 7);
  assert.equal(r.round.length, 3);                 // 고유 3개
  assert.equal(new Set(r.round).size, r.round.length);
});
test('pickRound: 현재 목록에 없는 옛 진도는 무시', () => {
  const { pickRound } = loadCore();
  const r = pickRound(['a','b','c'], ['a','x','y'], 2);
  assert.ok(!r.played.includes('x'));
  assert.ok(!r.played.includes('y'));
  assert.ok(r.round.every(t => ['a','b','c'].includes(t)));
});
test('pickRound: 빈 목록은 빈 라운드', () => {
  const { pickRound } = loadCore();
  const r = pickRound([], [], 7);
  assert.deepEqual(r, { round: [], played: [], reset: false });
});
test('index.html: 라운드/진도 배선', () => {
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  assert.ok(html.includes('nachmal.progress.v1'));
  assert.ok(html.includes('const ROUND_SIZE = 7'));
  assert.ok(html.includes('pickRound(all, PROGRESS[mode]'));
  assert.ok(html.includes('coverageDone'));
});
test('index.html: 결과 화면 진도/버튼', () => {
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  assert.ok(html.includes('id="result-progress"'));
  assert.ok(html.includes('다음 7문제'));
  assert.ok(html.includes('문제 경험 ${experienced}/${totalWords}'));
  assert.ok(!html.includes('다시 풀기'));
});
test('index.html: 홈 진도 표시 + 초기화', () => {
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  assert.ok(html.includes('id="prog-choice"'));
  assert.ok(html.includes('id="prog-type"'));
  assert.ok(html.includes('id="btn-reset-progress"'));
  assert.ok(html.includes('function updateHomeProgress'));
});

test('index.html: 홈 진입 시 진도 갱신', () => {
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  assert.ok(html.includes("if(name==='home') updateHomeProgress()"));
});
