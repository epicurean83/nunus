# 7문제 라운드 + 모드별 진도 회전 설계

- 날짜: 2026-07-12
- 대상 파일: `index.html` (수정 후 `public/index.html` 동일 복사)
- 선행 기능: 쌍받침 한 글자 채우기(2026-07-12-ssangbatchim-blank-fill)

## 배경 / 목표

문제가 31개라 한 번에 다 풀기 부담스럽다. 한 판을 **랜덤 7문제**로 끝내되, **풀었던(경험한) 문제를 모드별로 기록**해 다음 판에는 안 푼 문제를 우선 낸다. 그래서 **5판이면 31개를 모두 경험**하고(4판×7=28 + 5판째 남은 3 + 복습 4), 그 다음 판은 자동으로 새 사이클을 시작한다.

## 확정 결정 (사용자)

- 진도 기록: **모드별 따로** (객관식/주관식 각각 독립 순환).
- 저장: **localStorage 지속** — 앱을 껐다 켜도 이어감. 사이클 완료 시 자동 초기화.
- 마지막 라운드: **항상 7문제 유지** — 남은 새 문제 + 이미 푼 문제로 채움.

## 라운드 선택 (순수 로직, CORE)

문제 ID = **템플릿 문자열**(예 `물고기 [낚]시`). 편집기로 낱말이 바뀌어도 자연 재조정.

`pickRound(allTemplates, playedTemplates, size)` → `{ round, played, reset }`
- `all = allTemplates`, `cap = min(size, all.length)`.
- `playedSet` = playedTemplates 중 현재 all에 존재하는 것만(재조정).
- `unplayed = all - playedSet`. `unplayed`가 비었고 all이 있으면 → **reset=true**, playedSet 비우고 unplayed=all(새 사이클).
- shuffle(unplayed)에서 앞에서 cap개까지 round에 담고 담은 것을 playedSet에 추가(= 새로 경험).
- round가 cap 미만이면 shuffle(all − round)에서 채워 cap 맞춤(이미 푼 문제 = 복습).
- 반환: `round`(최종 셔플), `played`(갱신된 경험 집합 배열), `reset`.

성질(테스트):
- round 길이 = cap, 원소는 all의 부분집합, 서로 다름.
- 안 푼 문제 우선(안 푼 게 cap 이상이면 round는 전부 새 문제).
- 31개·size 7로 played=[]에서 5판 시뮬레이션 → 5판째 `played.length===31`, 매 판 length 7, 1~5판 reset=false; 6판째 reset=true & length 7.
- size>len이면 cap=len(전체 한 판).

`shuffle`는 CORE 것을 사용(테스트는 `Math.random=()=>0` 주입으로 결정적).

## 저장 (CORE 밖)

- `PROGRESS_KEY = "nachmal.progress.v1"`, 형태 `{ choice:[templates], type:[templates] }`.
- `loadProgress()` → 안전 파싱, 없으면 `{choice:[],type:[]}`. `saveProgress(p)`.
- 전역 `let PROGRESS = loadProgress();`
- `ROUND_SIZE = 7`(설정 상수).

## 흐름 배선

`startQuiz(mode)`:
```
const all = WORDS.map(w=>w.template);
const { round, played } = pickRound(all, PROGRESS[mode]||[], ROUND_SIZE);
PROGRESS[mode] = played; saveProgress(PROGRESS);
const idx = new Map(WORDS.map((w,i)=>[w.template,i]));
const order = round.map(t=>idx.get(t)).filter(i=>i!=null);
state = { mode, order, i:0, score:0, hintLevel:0, done:false, options:[],
          coverageDone: played.length === all.length };
$('q-total').textContent = order.length;  // 진행 바 자동으로 n/7
...(기존 렌더 흐름)
```
`currentWord()`/진행 바/힌트/채점은 그대로(라운드 길이만 7).

## UI / UX

### 결과 화면 (`showResult`)
- 점수 `n/7` 유지.
- 아래에 사이클 진도 한 줄 추가: `문제 경험 <PROGRESS[mode].length>/<WORDS.length>`.
- 버튼: `홈으로` / **`다음 7문제 →`**(주 버튼). `다음 7문제`는 기존 `btn-retry` 재활용(핸들러 `startQuiz(state.mode)` 그대로 — 이미 다음 라운드를 만듦), 라벨만 변경.
- `state.coverageDone`(이번 판으로 31개를 모두 채웠을 때)면 축하 표시: 이모지/타이틀을 `🏆 모든 문제를 한 번씩 다 만났어요!`로, 진도 줄은 `31/31`. `다음 7문제`는 다음 호출 시 pickRound가 reset하여 새 판 시작.

### 홈 화면
- 모드 카드 각각에 작은 진도 줄(`.mc-progress`, id `prog-choice`/`prog-type`):
  - 0개 경험: `새 판! 0/31`
  - 진행 중: `이번 판 14/31`
  - 완주(===total): `한 판 완주 🏆 · 다음 판 준비`
- 하단 `home-foot`에 `↺ 진도 초기화` 고스트 버튼 추가. 클릭 → `window.confirm('객관식·주관식 진도를 모두 초기화할까요?')` 확인 시 `PROGRESS={choice:[],type:[]}`, 저장, 홈 진도 갱신.
- `updateHomeProgress()`가 두 카드의 진도 줄을 갱신(홈 표시/저장 후/초기화 후 호출).

## 편집기 상호작용

편집기 저장 시 낱말이 바뀌면 `pickRound`의 재조정으로 안전(없어진 템플릿은 무시). 별도 강제 초기화는 하지 않음(자연 재조정). 홈 진도는 저장 후 `updateHomeProgress()`로 갱신.

## 영향 없는 부분

퀴즈 진행/힌트/채점/객관식 오답 생성/TTS/편집기 파싱은 그대로. 점수(첫 시도 +1)와 결과 등급도 그대로(총계가 7 기준).

## 파일 작업

1. `index.html` 수정.
2. `public/index.html` 동일 복사.
3. `test/logic.test.mjs`에 `pickRound` 테스트 추가. `artifact.html` 미변경.

## 검증

- Node: `pickRound` 단위 테스트(우선순위/채움/reset/개수/5판 커버리지).
- 브라우저(헤드리스): 한 판이 7문제로 끝나는지; 결과 화면 `다음 7문제`가 다른 문제 위주로 새 판을 여는지; 5판이면 31개 모두 경험 & 축하 표시; 홈 카드 진도 표시; 진도 초기화; 새로고침 후 진도 유지(localStorage); 객관식·주관식 진도가 독립인지.
