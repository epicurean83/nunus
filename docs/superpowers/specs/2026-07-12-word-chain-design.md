# 끝말잇기(자유 이어가기) 설계

- 날짜: 2026-07-12
- 대상 파일: `index.html` (수정 후 `public/index.html` 동일 복사)
- 앱 컨텍스트: 단일 파일, 홈에 모드 카드, CORE 순수 로직 블록 + Node 테스트, localStorage

## 목표 / 결정

새 게임 모드 "끝말잇기". 사전이 없으므로 **자유 이어가기**: 아이가 직접 입력하고 앱은 **규칙만** 확인(진짜 낱말인지 검사 안 함). 주제는 일반 어린이 낱말. 혼자 최대한 길게 잇고 최고 기록 갱신.

확정 기본값:
1. 규칙 위반은 **게임오버가 아니라 부드럽게 재시도**(피드백 후 다시 입력).
2. **끝내기** 버튼으로 한 판 종료 → 이어진 낱말 개수가 점수, 최고 기록 갱신 시 축하.
3. 시작 낱말은 **앱이 제시**(내장 `SEED_WORDS`에서 랜덤), `🔄 다른 낱말`로 새 시작.

## 규칙 (순수 로직, CORE)

문제 검증은 순수 함수로 CORE에 넣어 단위 테스트.

`isHangulSyllable(ch)` → 한글 완성형 음절(AC00–D7A3) 여부.

`chainCheck(prevWord, input, usedWords)` → `{ ok, reason, need }`
- `need` = `prevWord`의 마지막 글자(직전 낱말 끝 글자; UI 힌트용). `prevWord` 없으면 `''`.
- `v = norm(input)`(공백 제거). 빈 값 → `{ok:false, reason:'empty', need}`.
- `v`의 모든 글자가 한글 음절이 아니면 → `reason:'notword'`.
- `v`의 첫 글자 !== `need` → `reason:'start'`.
- `usedWords` 중 `norm` 일치가 있으면 → `reason:'reuse'`.
- 통과 → `{ok:true, reason:'ok', need}`.
- 두음법칙 없음(정확 일치). 한 글자 낱말 허용.

`SEED_WORDS` (일반 어린이 낱말 15개, CORE 데이터):
```
["사과","기차","나무","우산","가방","모자","우유","오이","다리","포도","하마","노래","두부","소라","비누"]
```

테스트: ok / start(끝글자 불일치) / reuse / notword(비한글) / empty; `need`가 직전 낱말 끝 글자인지; 공백 무시; SEED_WORDS 모두 한글 음절 & 길이≥2.

## 상태 / 저장 (CORE 밖)

- `BEST_KEY = "nachmal.chain.best.v1"`(정수). `loadBest()`→int(기본 0), `saveBest(n)`.
- 전역: `let chainWords = []`(현재 체인, 시드 포함), `let chainBest = loadBest()`.
- 점수 = `chainWords.length`(시드 포함, 프리뷰의 "지금 4"와 일치). 최고 = `chainBest`.
- `finalizeBest()`: `if(chainWords.length > chainBest){ chainBest = chainWords.length; saveBest(chainBest); return true; } return false;` (끝내기/홈 이동 시 호출).

## 화면 UX

홈에 세 번째 모드 카드 추가:
```html
<button class="mode-card chain" data-mode="chain">
  <div class="emoji">🔤</div>
  <div>
    <div class="mc-title">끝말잇기</div>
    <div class="mc-desc">낱말의 끝 글자로 새 낱말 잇기 · 최대한 길게 이어 보세요</div>
  </div>
</button>
```
모드 카드 클릭 바인딩을 분기: `data-mode==='chain'` → `startChain()`, else `startQuiz(mode)`.

새 화면 `screen-chain`을 `screens` 맵에 등록(`chain:$('screen-chain')`). 구성:
- topbar: `←`(홈), 제목 `🔤 끝말잇기`, score-pill `🔗 <chain-count> · 최고 <chain-best>`.
- `.card`:
  - `#chain-flow`: 체인을 `낱말 → 낱말 → …`로 흐르게, 최신 낱말 강조.
  - `#chain-need`: `다음은 ‘<b>거</b>’로 시작!`
  - 입력 행: `#chain-input`(text) + `#chain-submit`(확인). Enter로도 제출.
  - `#chain-feedback`.
  - 액션(플레이): `🔄 다른 낱말`(`#chain-reroll`), `끝내기`(`#chain-end`).
  - 종료 상태 박스 `#chain-endbox`(hidden): 요약 `🔗 N개 이어봤어요!`(+신기록 🏆), 액션 `다시 시작`(`#chain-restart`) / `홈으로`(`#chain-home2`).

플레이/종료 상태는 요소 hidden 토글로 전환.

피드백 문구:
- ok → `좋아요! 이어졌어요 👏`
- start → `‘${need}’로 시작하는 낱말이에요!`
- reuse → `이미 쓴 낱말이에요`
- notword → `한글 낱말을 입력해요`
- empty → 무시(입력창 포커스)

## JS 함수

- `startChain()`: `chainWords = [ shuffle(SEED_WORDS)[0] ]`; 종료박스 숨기고 플레이 UI 표시; `renderChain()`; `show('chain')`; 입력 포커스.
- `rerollChain()`: `startChain()`과 동일(새 시드).
- `renderChain()`: `#chain-flow`에 낱말들(→ 구분, 마지막 `.last`), `#chain-need`에 `다음은 ‘need’로 시작!`(need = 마지막 낱말 끝 글자), `#chain-count`=`chainWords.length`, `#chain-best`=`chainBest`.
- `submitChain()`: `prev = chainWords[chainWords.length-1]`; `res = chainCheck(prev, val, chainWords)`; ok면 `chainWords.push(norm(val))`, 입력 비우기, `renderChain()`, 성공 피드백; 아니면 reason별 피드백(재시도, 종료 아님). 빈 값은 포커스만.
- `finalizeBest()`: 위 정의.
- `endChain()`: `const rec = finalizeBest();` 플레이 UI 숨기고 `#chain-endbox` 표시(`🔗 ${chainWords.length}개 이어봤어요!` + `rec`면 `🏆 최고 기록!`), `#chain-best` 갱신.
- 홈 이동(`#btn-chain-home`, `#chain-home2`): `finalizeBest()` 후 `show('home')`.
- 바인딩: submit(클릭/Enter), reroll, end, restart(→startChain), 홈 버튼들.

## 영향 없는 부분

받침 퀴즈(객관식/주관식)·라운드 회전·편집기·테마는 그대로. `screens` 맵에 `chain` 추가와 모드-카드 클릭 분기만 기존 코드와 접점.

## 파일

1. `index.html` 수정. 2. `public/index.html` 복사. 3. `test/logic.test.mjs`에 `chainCheck`/SEED 테스트 추가. `artifact.html` 미변경.

## 검증

- Node: `chainCheck`(ok/start/reuse/notword/empty/need/공백), SEED 유효성.
- 브라우저(헤드리스): 홈 `🔤 끝말잇기` → 시드 제시 → 끝 글자로 시작하는 낱말 입력 시 이어짐, 틀린 시작/중복/비한글은 재시도 피드백; `지금`/`최고` 표시; `끝내기`시 요약·신기록; 새로고침 후 최고 기록 유지; `🔄 다른 낱말`로 새 시드; 받침 퀴즈 두 모드가 여전히 정상.
