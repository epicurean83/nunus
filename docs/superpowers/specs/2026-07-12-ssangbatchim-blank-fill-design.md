# 쌍받침 한 글자 채우기 통합 설계

- 날짜: 2026-07-12
- 대상 파일: `index.html` (수정 후 `public/index.html`에 동일 복사)
- 배포: Firebase Hosting, `public` 디렉터리

## 배경

기존 앱(`받침 낱말 맞히기`)은 문제를 `{prompt, answer}`로 표현하고, 프롬프트 뒤에 정답 동사 전체(예 `볶다`)를 맞히게 했다. 화면에는 프롬프트 + 고정 `＿다`가 붙었고, 채점은 `다` 유무 모두 인정했다. 모든 정답은 `동사 + 다` 형태였고 목표 글자는 항상 첫 음절이었다.

이번에 추가할 낱말은 이 모델을 벗어난다. 빈칸이 **낱말 전체의 끝**이 아니라 **구절 안의 한 쌍받침 음절**이며, 위치가 앞(`[볶]음밥`, `[밖]에 나간다`)·중간(`물고기 [낚]시`)·끝(`안경을 [닦]다`) 어디든 올 수 있다. 따라서 채점·표시·보기 생성을 그 한 글자 기준으로 재구성한다.

기존 18개, 신규 14개 모두 쌍받침(ㄲ 또는 ㅆ 종성) 글자다. 이 묶음은 앞으로 문제 단위로 계속 추가될 수 있으므로, 한 줄 추가만으로 확장 가능한 형식을 쓴다.

## 데이터 형식

문제 하나 = 정답 글자를 대괄호로 표시한 구절 문자열 한 줄. 대괄호 그룹은 정확히 하나.

```
"야채를 [볶]다"    "물고기 [낚]시"    "[볶]음밥"
"[밖]에 나간다"     "급식을 먹[었]다"   "손톱 [깎]이"
```

`parseTemplate(str)` → 파싱 결과:

| 필드 | 의미 | 예(`물고기 [낚]시`) |
|------|------|------|
| `template` | 원본 문자열(트림) — 편집기 왕복용 | `물고기 [낚]시` |
| `before` | 빈칸 앞 문맥(그대로 표시) | `물고기 ` |
| `answer` | 채점 대상 쌍받침 글자 | `낚` |
| `after` | 빈칸 뒤 문맥(그대로 표시) | `시` |
| `word` | 빈칸이 포함된 공백 없는 낱말(관대한 채점용) | `낚시` |
| `full` | `before+answer+after` — TTS·정답 공개용 | `물고기 낚시` |

- 정규식: `^(.*)\[([^\]]+)\]([\s\S]*)$` (라인 트림 후 적용). 매치 실패 또는 빈 `answer` → 무효 라인.
- `word` 계산: `before`의 마지막 공백 뒤 조각 + `answer` + `after`의 첫 공백 앞 조각.
  - `물고기 [낚]시` → `낚시`
  - `급식을 먹[었]다` → `먹었다`
  - `[밖]에 나간다` → `밖에`

## 기본 문제 (총 31개)

기존 18개를 새 형식으로 변환 + 신규 14개 중 중복 1개(`안경을 [닦]다`) 제외 = 13개 추가.

기존 변환:
```
"야채를 [볶]다", "밤에 잠을 [잤]다", "꿈을 [꿨]다", "꽃을 [꺾]다",
"사과를 [깎]다", "물고기를 [낚]다", "끈을 [묶]다", "안경을 [닦]다",
"가방을 [쌌]다", "마늘을 [깠]다", "아침에 잠을 [깼]다", "메달을 [땄]다",
"달이 [떴]다", "글씨를 [썼]다", "벨트를 [맸]다", "제기를 [찼]다",
"불을 [껐]다", "물감을 [짰]다",
```
신규 추가(13):
```
"[밖]에 나간다", "물고기 [낚]시", "머리카락을 [묶]다", "손톱 [깎]이",
"떡 [볶]이", "[볶]음밥", "연필 [깎]이", "이를 [닦]다",
"리본을 [묶]다", "급식을 먹[었]다", "축구공을 [찼]다",
"학교에 [갔]다", "물건을 [샀]다",
```
- `손톱 [깎]이`: 사용자 목록의 `깍`을 표준 표기 `깎`으로 수정(확인 완료).
- `안경을 [닦]다`는 기존과 완전 중복이라 신규에서 제외.

`DEFAULT_WORDS = DEFAULT_TEMPLATES.map(parseTemplate)`.

## 화면 표시

기존의 `프롬프트(큰 글씨) + ＿다`와 별도 `#boxes`(정답 힌트 박스)의 이중 표시를 **하나의 인라인 구절**로 통합한다.

`#screen-quiz` `.prompt-block` 구조:
```
<div class="prompt-label">빈칸에 알맞은 글자를 넣어요</div>
<div class="phrase" id="phrase"></div>
<div class="hint-note" id="hint-note"></div>
<div><button class="ttsbtn" id="btn-tts">🔊 읽어주기</button></div>
```
- `#phrase`: 매 문제마다 `before` 문맥 span + 정답 힌트 박스(`.box`) + `after` 문맥 span을 인라인으로 렌더.
- `.phrase`는 기존 `.prompt-word` 크기 계열을 재사용하되 `display:inline-flex; flex-wrap:wrap; align-items:baseline; gap:.12em; justify-content:center`. 문맥 글자는 `.ctx`(진한 잉크색), 빈칸은 `.box`(기존 hint/revealed/empty 상태 스타일 재사용, 인라인 크기로 조정).
- 기존 `#prompt-obj` / `#prompt-blank` / 별도 `#boxes` 컨테이너는 제거.

`renderPhrase()` (기존 `drawBoxes` + 프롬프트 렌더 대체):
1. `cells = buildAnswerBoxes(answer, hintLevel)`
2. `#phrase` 비우고 → `before` 있으면 `<span class="ctx">` 추가 → 각 cell을 `.box`(+상태 클래스)로 추가 → `after` 있으면 `<span class="ctx">` 추가
3. `#hint-note`에 `hintLabel(hintLevel)`

`buildAnswerBoxes(answer, level)` (기존 `buildBoxes`에서 "마지막 글자 항상 고정" 규칙 제거):
```
[...answer].map(ch => {
  d = decompose(ch)
  if(!d) return {text: ch, state:'fixed'}          // 비한글은 그대로
  if(level <= 0) return {text:'', state:'empty'}
  if(level === 1) return {text: d.cho, state:'hint'}       // 초성
  if(level === 2) return {text: compose(d.cho,d.jung,''), state:'hint'}  // 초+중성
  return {text: ch, state:'revealed'}              // 완성(받침)
})
```
정답이 1글자이므로 힌트 단계 0→1→2→3이 그대로 빈칸→초성→초+중성→완성으로 동작.

### 읽어주기(TTS)

`speak(currentWord().full)` — 정답이 채워진 완성 구절을 읽는다(예 "물고기 낚시"). 기존 `무엇을 했나요?` 접미사 제거. 소리를 듣고 쌍받침을 판단하는 것이 학습 의도(사용자 확인).

## 채점

### 주관식
```
isCorrectTyped(val, w):
  v = norm(val)                     // 공백 제거
  return v === norm(w.answer) || v === norm(w.word)
```
- 정답 글자(`낚`)와 낱말 전체(`낚시`) 모두 인정. 기존 "다 유무" 로직 제거(`다`는 이제 문맥).
- `skipQuestion` 주관식은 입력창에 `w.answer`를 채움. `onCorrect`/`skip`의 정답 공개는 `w.full` 표시.

### 객관식 오답 (발음 혼동 보기)
정답 글자에 초성/중성/종성 혼동표를 적용해 발음이 비슷한 한 글자 후보를 만들고 3개를 골라 정답과 섞는다. 쌍받침이 주제이므로 **받침 변형을 우선**하되 초성·중성 변형도 풀에 포함.

혼동표(대표):
```
CHO_CONF:  ㄱ↔ㄲ↔ㅋ, ㄷ↔ㄸ↔ㅌ, ㅂ↔ㅃ↔ㅍ, ㅅ↔ㅆ, ㅈ↔ㅉ↔ㅊ   // 굴→꿀, 방→빵
JUNG_CONF: ㅐ↔ㅔ, ㅏ↔ㅑ, ㅓ↔ㅕ↔ㅗ, ㅗ↔ㅜ, ㅚ↔ㅙ↔ㅞ, ㅘ↔ㅝ    // 갈→걀/골
JONG_CONF: ㄲ→[ㄱ,'',ㅆ], ㅆ→[ㅅ,'',ㄲ], (홑받침 fallback ㄱ→[ㄲ,''], ㅅ→[ㅆ,''])
```
`makeLetterDistractors(answerChar)`:
1. `d = decompose(answerChar)`. 비한글이면 공통 fallback 글자 집합에서 선택.
2. 후보 풀을 **받침 변형 → 초성 변형 → 중성 변형** 순서로 생성(각 그룹 내부는 셔플):
   - 받침: `(JONG_CONF[d.jong] || ['ㄱ','ㄲ','ㅅ','ㅆ','']).map(j => compose(d.cho,d.jung,j))`
   - 초성: `(CHO_CONF[d.cho]||[]).map(c => compose(c,d.jung,d.jong))`
   - 중성: `(JUNG_CONF[d.jung]||[]).map(v => compose(d.cho,v,d.jong))`
3. 중복 제거 + 정답과 동일한 글자 제거(모든 초/중/종성 조합은 유효 음절이라 합성 실패만 걸러내면 됨), 그룹 우선순위(받침 먼저) 유지하며 앞에서 3개 선택.
4. 3개 미만이면 목표 글자의 초/중성에 일반 받침 세트(`ㄱ ㄲ ㅅ ㅆ ''`)를 적용해 채우고, 그래도 부족하면 공통 글자 풀로 보충해 항상 정확히 3개 보장.

`makeOptions(answer) = shuffle([answer, ...makeLetterDistractors(answer)])` → 4개 버튼. 나머지 객관식 진행(오답 시 하나 제거 + 힌트 단계 상승)은 기존과 동일.

예) 정답 `낚`(ㄴ/ㅏ/ㄲ) → 받침 변형 `낙`(ㄱ)·`나`(무받침)·`났`(ㅆ)로 3개 충족 → 최종 `낚 / 낙 / 나 / 났`. 받침 그룹이 3개를 못 채우는 글자(예 초성 된소리 혼동 필요 시)는 초성·중성 변형이 이어서 채운다.

## 편집기

- 도움말: "한 줄에 한 구절씩, 정답 글자를 대괄호 `[ ]`로 감싸세요. 예: `물고기 [낚]시`"
- `openEditor`: `WORDS.map(w => w.template).join('\n')`
- `parseEditor(text)`: 각 비어있지 않은 줄 → `parseTemplate`, 무효 라인은 건너뜀. 유효 문제 2개 미만이면 저장 거부(기존 메시지 형식 유지, 문구만 갱신).
- `saveEditor`: 유효 template 문자열 배열을 저장, `WORDS = templates.map(parseTemplate)`.
- `resetEditor`: `DEFAULT_TEMPLATES.join('\n')`.

## 저장/마이그레이션

- 저장 키 `nachmal.words.v1` → `nachmal.words.v2`. v2에는 **template 문자열 배열**을 저장.
- `loadWords()`:
  1. v2 있으면 파싱해서 사용(유효 문제 ≥1).
  2. v2 없고 v1(`{prompt,answer}` 배열) 있으면 각 항목을 `"{prompt} [{answer[0]}]{answer.slice(1)}"` 템플릿으로 변환해 사용(그리고 v2로 저장).
  3. 둘 다 없으면 `DEFAULT_TEMPLATES`.

## 영향 없는 부분

결과 화면, 점수(첫 시도 정답 +1), 진행 바, 테마/전체화면, 힌트 버튼 단계 상승, 넘기기 흐름, `word-count-tag`는 기존 로직 유지(참조하는 함수명만 `drawBoxes`→`renderPhrase`, 정답 표시 `prompt+answer`→`full`로 교체).

## 파일 작업

1. `index.html` 수정.
2. `public/index.html`에 동일 내용 복사(두 파일 identical 유지).
3. `artifact.html`(구버전 735줄)은 수정하지 않음.

## 검증 방법

- 브라우저에서 로컬로 `index.html`을 열어 객관식/주관식 두 모드로 몇 문제 진행:
  - 빈칸이 앞/중간/끝인 문제(`[볶]음밥`, `물고기 [낚]시`, `급식을 먹[었]다`)가 올바르게 인라인 표시되는지.
  - 힌트 0→3 단계가 빈칸→초성→초+중성→완성으로 뜨는지.
  - 주관식에서 글자(`낚`)와 낱말(`낚시`) 모두 정답 처리되는지.
  - 객관식 보기 4개가 서로 다르고 정답 포함, 발음 혼동형인지.
  - 편집기 저장/복원/새로고침 후 유지(v2)와, 예전 v1 데이터가 있을 때 마이그레이션되는지.
