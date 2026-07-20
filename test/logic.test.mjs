import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

const CORE_NAMES = [
  'CHO','JUNG','JONG','decompose','compose','norm','shuffle','hintLabel',
  'parseTemplate','DEFAULT_TEMPLATES','DEFAULT_WORDS','buildAnswerBoxes',
  'isCorrectTyped','makeLetterDistractors','makeOptions','templateFromV1','pickRound',
  'chainCheck','WORD_DICT','isHangulSyllable','SEED_WORDS',
  'hintStages','hintDisplay','hasContinuation','findHint',
  'chosungOf','chosungHint',
  'pickHost','swapOutcome'
];

function loadCore(){
  const html = readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');
  const start = html.indexOf('/* CORE:START */');
  const end = html.indexOf('/* CORE:END */');
  if(start < 0 || end < 0) throw new Error('CORE markers not found in public/index.html');
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
  const html = readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');
  assert.ok(html.includes('nachmal.words.v2'));
  assert.ok(html.includes('STORE_KEY_V1'));
  assert.ok(html.includes('templateFromV1(o.prompt, o.answer)'));
  assert.ok(html.includes('words.map(w=>w.template)'));
});

test('index.html: 렌더링 배선 정리', () => {
  const html = readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');
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
  const html = readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');
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
  const html = readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');
  assert.ok(html.includes('nachmal.progress.v1'));
  assert.ok(html.includes('const ROUND_SIZE = 7'));
  assert.ok(html.includes('pickRound(all, PROGRESS[mode]'));
  assert.ok(html.includes('coverageDone'));
});
test('index.html: 결과 화면 진도/버튼', () => {
  const html = readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');
  assert.ok(html.includes('id="result-progress"'));
  assert.ok(html.includes('다음 7문제'));
  assert.ok(html.includes('문제 경험 ${experienced}/${totalWords}'));
  assert.ok(!html.includes('다시 풀기'));
});
test('index.html: 홈 진도 표시 + 초기화', () => {
  const html = readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');
  assert.ok(html.includes('id="prog-choice"'));
  assert.ok(html.includes('id="prog-type"'));
  assert.ok(html.includes('id="btn-reset-progress"'));
  assert.ok(html.includes('function updateHomeProgress'));
});

test('index.html: 홈 진입 시 진도 갱신', () => {
  const html = readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');
  assert.ok(html.includes("if(name==='home') updateHomeProgress()"));
});

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
test('chainCheck: 공백뿐인 이전 낱말이면 need는 빈 문자열', () => {
  const { chainCheck } = loadCore();
  const r = chainCheck('   ', '사과', []);
  assert.equal(r.need, '');
});
test('chainCheck: 한 글자 낱말도 허용', () => {
  const { chainCheck } = loadCore();
  const r = chainCheck('사과', '과', ['사과']);   // 과 = single-syllable, starts with need '과'
  assert.equal(r.ok, true);
});
test('index.html: 끝말잇기 화면/배선', () => {
  const html = readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');
  assert.ok(html.includes('id="screen-chain"'));
  assert.ok(html.includes('data-mode="chain"'));
  assert.ok(html.includes("chain:$('screen-chain')"));
  assert.ok(html.includes('function startChain'));
  assert.ok(html.includes('function submitChain'));
  assert.ok(html.includes("if(m==='chain'||m==='chosung') openModePick(m)"));
  assert.ok(html.includes("if(modePickMode==='chain') startChain()"));
  assert.ok(html.includes('nachmal.chain.best.v1'));
});
test('index.html: 최고 기록 체인 보기', () => {
  const html = readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');
  assert.ok(html.includes('id="chain-record-overlay"'));
  assert.ok(html.includes('id="chain-record-btn"'));
  assert.ok(html.includes('nachmal.chain.bestwords.v1'));
  assert.ok(html.includes('function openRecord'));
  assert.ok(html.includes('function renderWords'));
});
test('index.html: 끝말잇기 기록 초기화 버튼', () => {
  const html = readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');
  assert.ok(html.includes('id="btn-reset-chain"'));
  assert.ok(html.includes('끝말잇기 최고 기록을 초기화'));
  assert.ok(html.includes('removeItem(BEST_KEY)'));
});
test('chainCheck: 사전 켜짐이면 사전에 있는 낱말만 통과', () => {
  const { chainCheck } = loadCore();
  const dict = new Set(['사과','과자']);
  assert.equal(chainCheck('사과','과자',['사과'], dict).ok, true);
  const r = chainCheck('사과','과일',['사과'], dict);   // 과일은 이 작은 사전에 없음
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'notindict');
});
test('chainCheck: 사전 미지정이면 규칙만(기존 동작 유지)', () => {
  const { chainCheck } = loadCore();
  assert.equal(chainCheck('사과','과일',['사과']).ok, true);   // dict 없음 → 규칙만
});
test('WORD_DICT: 모두 한글 음절, 중복 없음, 시드 포함', () => {
  const { WORD_DICT, SEED_WORDS, isHangulSyllable } = loadCore();
  assert.ok(WORD_DICT.length >= 3000);
  assert.equal(new Set(WORD_DICT).size, WORD_DICT.length);
  assert.ok(WORD_DICT.every(w => [...w].length >= 1 && [...w].every(isHangulSyllable)));
  assert.ok(SEED_WORDS.every(s => WORD_DICT.includes(s)));
});
test('hintStages/hintDisplay: 자음→모음→받침 순 공개', () => {
  const { hintStages, hintDisplay } = loadCore();
  assert.equal(hintStages('사자').length, 4);           // 사(ㅅ,사) 자(ㅈ,자)
  assert.equal(hintDisplay('사자', 0), '__');
  assert.equal(hintDisplay('사자', 1), 'ㅅ_');
  assert.equal(hintDisplay('사자', 2), '사_');
  assert.equal(hintDisplay('사자', 3), '사ㅈ');
  assert.equal(hintDisplay('사자', 4), '사자');
  assert.equal(hintStages('사슴').length, 5);           // 슴에 받침 ㅁ → 3단계
  assert.equal(hintDisplay('사슴', 5), '사슴');
});
test('hasContinuation / findHint: 이어갈 사전 낱말 판정', () => {
  const { hasContinuation, findHint } = loadCore();
  const words = ['사과','과자','바나나'];
  assert.equal(hasContinuation('과', words, ['사과']), true);    // 과자
  assert.equal(hasContinuation('과', words, ['사과','과자']), false); // 과자 이미 씀
  assert.equal(hasContinuation('나', words, []), false);         // '나'로 시작하는 낱말 없음
  const h = findHint('과', words, ['사과']);
  assert.equal(h, '과자');
  assert.equal(findHint('과', words, ['사과','과자']), null);
});
test('index.html: 대화형 UI 배선(토글 제거)', () => {
  const html = readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');
  assert.ok(html.includes('id="chain-bubble"'));
  assert.ok(html.includes('id="register-ask"'));
  assert.ok(html.includes('id="chain-hint-btn"'));
  assert.ok(html.includes('id="chain-end-x"'));
  assert.ok(html.includes('nachmal.chain.userwords.v1'));
  assert.ok(html.includes('function confirmRegister'));
  assert.ok(!html.includes('id="chain-dict-toggle"'));   // 토글 제거됨
  assert.ok(!html.includes('id="chain-reroll"'));        // 다른 낱말 제거됨
});
test('chosungOf: 낱말의 초성열', () => {
  const { chosungOf } = loadCore();
  assert.equal(chosungOf('사과'), 'ㅅㄱ');
  assert.equal(chosungOf('학교'), 'ㅎㄱ');
  assert.equal(chosungOf('값'), 'ㄱ');            // 받침 있어도 초성만
  assert.equal(chosungOf('컴퓨터'), 'ㅋㅍㅌ');
  assert.equal(chosungOf('abc'), null);           // 비한글
  assert.equal(chosungOf('사a과'), null);
});
test('chosungHint: 초성→모음→받침 순 공개', () => {
  const { chosungHint } = loadCore();
  assert.equal(chosungHint('사과', 0), 'ㅅ ㄱ');   // 초성만(문제와 동일)
  assert.equal(chosungHint('사과', 1), '사 ㄱ');
  assert.equal(chosungHint('사과', 2), '사 과');
  assert.equal(chosungHint('강산', 0), 'ㄱ ㅅ');   // 받침 낱말
  assert.equal(chosungHint('강산', 4), '강 산');
});
test('index.html: 초성게임 배선', () => {
  const html = readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');
  assert.ok(html.includes('id="screen-chosung"'));
  assert.ok(html.includes('data-mode="chosung"'));
  assert.ok(html.includes("chosung:$('screen-chosung')"));
  assert.ok(html.includes('function startChosung'));
  assert.ok(html.includes('function submitChosung'));
  assert.ok(html.includes("if(m==='chain'||m==='chosung') openModePick(m)"));
  assert.ok(html.includes('else startChosung()'));
  assert.ok(html.includes('nachmal.chosung.best.v1'));
});

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

test('public/index.html: 같이하기 문제 출제/구독 배선', () => {
  const html = readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');
  assert.match(html, /function newProblem\(/, 'newProblem이 있어야');
  assert.match(html, /function bootstrapMeta\(/, 'bootstrapMeta가 있어야');
  assert.match(html, /function renderMulti\(/, 'renderMulti가 있어야');
  assert.match(html, /\.child\('meta'\)[\s\S]{0,80}\.on\('value'/, 'meta를 구독해야');
  // 정답을 DB에 올리면 안 된다: 출제 시 answer를 쓰지 않는지
  assert.doesNotMatch(html, /newProblem[\s\S]{0,400}answer:/, '출제 때 answer를 쓰면 안 됨');
});

test('public/index.html: 같이하기 승부/점수 배선', () => {
  const html = readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');
  assert.match(html, /function submitMulti\(/, 'submitMulti가 있어야');
  assert.match(html, /function hostTick\(/, 'hostTick이 있어야');
  assert.match(html, /function restartMulti\(/, 'restartMulti가 있어야');
  assert.match(html, /\.child\('meta'\)\.transaction\(/, '승부는 meta 트랜잭션이어야');
  assert.match(html, /scores\/'\s*\+\s*[\s\S]{0,60}gameId/, '점수는 gameId로 키잉해야');
  assert.match(html, /MULTI_ROUNDS/, '라운드 상한을 써야');
});

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
