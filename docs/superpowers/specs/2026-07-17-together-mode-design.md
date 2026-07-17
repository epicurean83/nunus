# 같이하기(실시간 멀티플레이) 설계

- 날짜: 2026-07-17
- 대상 파일: `public/index.html` (**단일본** — 루트 `index.html`은 이번 작업에서 삭제)
- 앱 컨텍스트: 단일 파일, 홈에 모드 카드, CORE 순수 로직 블록 + Node 테스트, localStorage
- 선행 완료: RTDB 인스턴스(`nearby-58e2d-default-rtdb`, `asia-southeast1`) 생성, 익명 로그인 활성화, 1차 `database.rules.json` 배포 및 규칙 검증 완료 (**단, 문제 교체 요청용 규칙 추가·재배포가 이번 작업에 포함됨** — 아래 데이터 모델 참조)

## 목표 / 결정

끝말잇기·초성게임에 **같이하기**(실시간 멀티) 추가. 기존 혼자하기는 **손대지 않는다**.

확정 결정:
1. **모드 완전 분리.** 게임 카드를 누르면 `혼자 하기` / `같이 하기` 선택. 혼자하기 코드 경로 무변경.
2. **혼자하기는 현행 유지** — 최고 기록, `🔄 다른 낱말`, `💡 힌트` 전부 그대로.
3. **같이하기는 신설 화면 1개**(`screen-multi`)를 두 게임이 공용. 문제 영역만 교체.
4. 같이하기: 최고 기록 없음, `🔄 다른 낱말` 없음, **`💡 힌트` 없음** — 순수 실력 레이스. (혼자하기에는 셋 다 그대로 남는다.)
5. 닉네임은 **같이하기 첫 진입 때만** 🦉가 묻고 기기 저장. 혼자만 하는 사용자는 끝까지 안 물어봄.
6. 상시 공용방 1개/게임. 입장 = 참가. **1게임 = 10라운드**, 라운드마다 같은 문제, **선착순 1명 +1점**.
7. 라운드 승패는 **🦉 말풍선이 중계**. 별도 오버레이 없음. 3초 후 자동 다음 라운드.
8. 10라운드 후 **최종순위 띄우고 대기**. 아무나 `다시 시작` → 방 전체 새 게임.
9. 막혔을 때는 **시간이 아니라 사람이 넘긴다.** 누구든 `🔄 문제 교체 요청` → 모두 동의하거나 **20초 안에 아무도 거부하지 않으면 묵시적 동의**로 교체. 타이머 워치독 없음.

## 모드 분기 (홈)

홈 카드 4개 중 `chain`/`chosung`만 분기. `choice`/`type`(받침 퀴즈)은 무변경.

```
data-mode==='chain'|'chosung'  → openModePick(mode)   // 신설
그 외                          → startQuiz(mode)      // 기존
```

`openModePick(mode)`: 기존 `.overlay` / `.overlay-card` 패턴 재사용한 시트.

```html
<div id="modepick-overlay" class="overlay hidden">
  <div class="overlay-card">
    <div class="overlay-title" id="modepick-title"></div>   <!-- 🔤 끝말잇기 -->
    <button class="btn btn-soft"    id="modepick-solo">👤 혼자 하기</button>
    <button class="btn btn-primary" id="modepick-multi">👥 같이 하기</button>
    <button class="ghostbtn"        id="modepick-close">닫기</button>
  </div>
</div>
```

- `혼자 하기` → 기존 `startChain()` / `startChosung()` 그대로 호출.
- `같이 하기` → `startMulti(mode)`.

## 같이하기 화면 (`screen-multi`, 신설)

`screens` 맵에 `multi:$('screen-multi')` 등록.

```
[←] 🔤 끝말잇기 · 같이            [🎯 3R · 2] [✕]
──────────────────────────────────────────────
 🟢나 2   🟡팝다니샤 1   ⚪부엉이 0   →       ← #multi-players (가로 스크롤)
──────────────────────────────────────────────
┌─ .card ────────────────────────────────────┐
│ 🦉  #multi-bubble                          │
│                                            │
│ #multi-problem                             │
│   chain   → .chain-flow + .chain-need      │
│   chosung → .chosung-pattern + 안내문       │
│                                            │
│ [#multi-input          ] [#multi-submit]   │
│ #multi-feedback        ← 재시도 안내(나만)   │
│                                            │
│ #multi-swap — 아래 셋 중 하나만 보임         │
│   [🔄 문제 교체 요청]  #multi-swap-ask      │
│   투표 중: [👍 동의][👎 거부] #multi-swap-vote│
│   쿨다운: 비활성                            │
│                                            │
│ #multi-endbox (hidden) — 최종순위 + 다시 시작│
└────────────────────────────────────────────┘
```

- topbar: `←`(홈), 제목 `#multi-title`, score-pill `🎯 <#multi-round>R · <#multi-myscore>`, `✕`.
- `#multi-players`: 접속자 칩. 내 칩은 `.me` 강조. 승자 칩은 `.bump` 애니메이션(기존 `shake` 옆에 추가).
- `#multi-nick`(hidden): 닉네임 입력 행. 첫 진입 때만 표시하고 나머지 UI는 감춤.
- `#multi-endbox`: `🥇🥈🥉` 최종순위 + `[홈으로] [다시 시작]`.

문제 영역은 게임별로 하나만 보이게 토글(`#multi-problem-chain` / `#multi-problem-chosung`).

## 재사용 (CORE, 무변경)

같이하기는 **CORE 순수 함수를 그대로 재사용**한다. CORE는 건드리지 않는다.

| 함수 | 용도 |
|---|---|
| `chainCheck(prev, input, used, dict)` | 끝말잇기 답 검증 |
| `chosungOf(word)` | 초성 패턴 대조 |
| `hasContinuation(need, words, used)` | 시드 고르기: 이어질 낱말이 있는 시드만 |
| `norm`, `shuffle`, `isHangulSyllable`, `SEED_WORDS` | 공용 |

`findHint` / `hintDisplay` / `chosungHint`는 혼자하기 전용이라 같이하기에서 쓰지 않는다. (타이머 워치독을 문제 교체 요청으로 대체하면서 🦉가 답을 대신 채울 일이 없어졌다.)

CORE 밖 재사용: `WORD_ALL` / `WORD_SET`(words.v1.txt 로드분 포함), `chosungIndex()` → `{map, easy}`(초성 20개↑ 패턴 풀), 위키 폴백 검증.

## 데이터 모델 (`/nunus/{chain|chosung}/`)

문제 교체 요청 때문에 **`database.rules.json`을 고쳐 재배포해야 한다** — 아래 `swap`/`swapCool`/`vote` 세 자리가 현재 규칙에 없어서, 지금 그대로면 쓰기가 전부 거부된다.

```
meta/
  gameId      int    게임 회차. 점수를 gameId로 키잉하므로, 이 값이 오르면
                     지난 점수를 지우는 쓰기 없이 새 판이 0점부터 시작
  round       int    1..10
  phase       'play' | 'reveal' | 'over'
  winner      uid | null
  winnerName  string
  answer      string  reveal 때만 채움
  startedAt   int
  need        string  chain 전용 — 다음 시작 글자
  chain       {}      chain 전용 — 지금까지 이어진 낱말
  used        {}      chain 전용 — 사용 낱말 집합
  pattern     string  chosung 전용 — 초성열
  swap        {by, round, until} | null         ← 신설. 진행 중인 교체 요청
                                                  (until = 투표 마감 시각. 죽은 meta.deadline과
                                                   헷갈리지 않도록 일부러 다른 이름)
  swapCool    int                               ← 신설. 거부 후 재요청 가능 시각
presence/{uid}   {name, ts, vote?}   onDisconnect().remove()
                 vote = {round, ok}             ← 신설. 이 라운드 교체에 찬/반
scores/{gameId}/{uid}  int     본인만 +1씩
```

`deadline`(옛 45초 워치독 기준)은 더 이상 쓰지 않는다. 규칙에는 남아 있으나 아무도 안 쓴다 — 규칙에서 빼면 기존 배포와 어긋나므로 그대로 둔다.

**투표는 반드시 `presence/{uid}` 안에 둔다.** `meta`는 인증된 누구나 쓸 수 있어서 거기 두면 남의 표를 위조할 수 있다. `presence/{uid}`는 규칙이 이미 `auth.uid === $pid`로 소유권을 강제하므로, **남이 내 표를 대신 던질 수 없고** 접속이 끊기면 표도 같이 사라진다.

`vote.round`를 같이 저장하는 이유: 라운드가 넘어가면 지난 표는 `round` 불일치로 **저절로 무효**가 된다. 라운드마다 표를 지우는 쓰기가 필요 없다.

규칙 추가분:
```json
"meta": {
  "swap": {
    ".validate": "newData.hasChildren(['by','round','until']) || !newData.exists()",
    "by":    { ".validate": "newData.isString() && newData.val().length <= 64" },
    "round": { ".validate": "newData.isNumber()" },
    "until": { ".validate": "newData.isNumber()" },
    "$o":    { ".validate": false }
  },
  "swapCool": { ".validate": "newData.isNumber()" }
},
"presence": {
  "$pid": {
    "vote": {
      ".validate": "newData.hasChildren(['round','ok']) || !newData.exists()",
      "round": { ".validate": "newData.isNumber()" },
      "ok":    { ".validate": "newData.isBoolean()" },
      "$o":    { ".validate": false }
    }
  }
}
```
`meta.$other` / `presence.$pid.$o`의 `".validate": false`는 그대로 두고 위 필드만 뚫는다 — 그 외 임의 필드는 계속 막힌다.

**정답은 DB에 저장하지 않는다.** 초성은 `pattern`만, 끝말잇기는 `need`만 올린다. `answer`는 이미 승부가 난 `reveal` 단계에서만 채워진다. DB를 훔쳐봐도 미리 답을 알 수 없다.

## 승부 판정 — `meta` 트랜잭션

```
1. 로컬 검증 (CORE + WORD_SET + 위키 폴백)  — 실패면 전송 안 함, 재시도 피드백
2. runTransaction(meta):
     if (m.phase !== 'play')        return abort   // 이미 끝난 라운드
     if (m.winner)                  return abort   // 남이 먼저
     if (game === 'chain') {
         if (first(word) !== m.need) return abort
         if (m.used[word])          return abort
     } else {
         if (chosungOf(word) !== m.pattern) return abort
     }
     m.winner = uid; m.winnerName = myName; m.answer = word; m.phase = 'reveal'
     if (game === 'chain') { m.chain.push(word); m.used[word] = true; m.need = last(word) }
     return m
3. 커밋 성공한 사람만 scores/{gameId}/{uid} 를 +1
```

트랜잭션이 **정확히 한 명만** 통과시킨다. 동시 제출 레이스는 여기서 해소된다.

## 호스트

접속자(`presence`) 중 **uid 사전순 최소**가 자동 호스트. 나가면 다음 사람이 승계(별도 선출 없음 — 각자 계산).

호스트만 하는 일:
- `meta` 부트스트랩(없으면 트랜잭션으로 생성)
- `reveal` 진입 후 **3초** → 다음 라운드(`round+1`, `phase='play'`, `winner=null`, 새 문제)
- **교체 요청 집계·확정** (아래 참조)
- `round > 10`이면 `phase='over'`

타이머 워치독은 없다. 라운드는 누가 맞히거나 문제가 교체될 때만 넘어간다. 아무도 안 맞히고 아무도 교체 요청도 안 하면 라운드는 그냥 머물러 있는다 — 재촉하지 않는 게 맞다고 본다.

`다시 시작`은 **아무나** 가능: 트랜잭션으로 `gameId+1`, `round=1`, `phase='play'`, 새 문제.

## 문제 교체 요청

막혔을 때 빠져나오는 유일한 길. **침묵을 동의로 친다** — 그래서 탭만 켜두고 자리를 비운 사람이 방을 잠그지 못한다.

**요청**: `phase==='play'`이고 `swap`이 없고 `now >= swapCool`일 때, 누구나 트랜잭션으로
`swap = {by: uid, round: 현재 라운드, until: now + 20000}`. 요청자는 자기 `presence/{uid}/vote = {round, ok:true}`도 같이 쓴다(자동 찬성).

**투표**: 나머지는 `👍 동의` / `👎 거부` → 자기 `presence/{uid}/vote = {round, ok}`.

**집계** (호스트가 `presence` + `meta` 변화마다 재평가):
```
유효표 = presence 중 vote.round === meta.round 인 것

if (거부 하나라도 있음)          → 취소: swap=null, swapCool = now + 30000
else if (찬성 수 === 접속자 수)   → 즉시 교체
else if (now > swap.until)       → 묵시적 동의로 교체
else                             → 대기
```

**교체 동작** (`phase`는 `play` 유지, `round`도 **그대로** — 아직 아무도 못 이긴 라운드니까):
- chain: **새 시드로 체인 재시작.** `chain=[seed]`, `used={seed}`, `need=last(seed)`. 이어온 체인은 버린다 — 아무도 못 잇는 글자에서 빠져나오는 유일한 길이다.
- chosung: 새 `pattern` (이번 게임에서 쓴 패턴 제외)
- 공통: `swap=null`, `startedAt=now`, 모든 `vote`는 `round`가 안 바뀌었으므로 **호스트가 직접 지운다**(교체 후 표가 남아 있으면 안 되므로 — 라운드 자동 무효화가 안 먹는 유일한 경우)

**거부 후**: 30초 쿨다운(`swapCool`). 그동안 요청 버튼 비활성 + 🦉 `방금 거부됐어. 조금만 더 생각해보자!`. 지나면 다시 요청 가능.

**UI**:
```
요청 전:        [🔄 문제 교체 요청]
내가 요청함:    🦉 교체 요청했어! 다들 괜찮으면 20초 뒤 바뀐다
                   동의 1/3 · 17초
남이 요청함:    🦉 부엉이가 문제를 바꾸재. 싫으면 20초 안에 거부해!
                   [👍 동의]  [👎 거부]      동의 1/3 · 17초
거부됨:         🦉 팝다니샤가 거부했어. 조금만 더 생각해보자!
```

혼자 있을 때 요청하면 접속자 1명 = 찬성 1명이라 **즉시 교체**된다. 혼자하기의 `🔄 다른 낱말`과 사실상 같게 동작한다.

## 문제 출제

- **chain**: 첫 라운드는 `shuffle(SEED_WORDS)` 중 `hasContinuation`이 true인 것. 이후 라운드의 문제 = 직전 승자 낱말의 끝 글자(`need`).
- **chosung**: 매 라운드 `chosungIndex().easy`(같은 초성 20개↑ 패턴)에서 랜덤. 이번 게임에서 쓴 패턴은 제외.

## 닉네임

- 키: `NICK_KEY = "nachmal.multi.nick.v1"`.
- 없으면 `#multi-nick` 표시, 🦉 `같이 하려면 이름이 필요해! 뭐라고 부를까?`
- 1~12자, 공백 `norm` 처리, 빈 값 거부. 중복 허용(uid로 구분).
- 저장 후 `presence/{uid}` 등록하고 게임 UI 표시.

## 에러 처리

| 상황 | 동작 |
|---|---|
| 익명 로그인 실패 | 🦉 `지금은 같이 하기가 안 돼. 혼자 하기로 놀자!` + 홈 복귀 버튼 |
| 연결 끊김 (`.info/connected` false) | 🦉 `연결이 끊겼어! 다시 연결 중…`, 입력창 잠금. 복구되면 자동 재개 |
| 트랜잭션 abort(남이 먼저) | 조용히 무시 — `reveal` 중계가 이미 설명함 |
| 로컬 검증 실패 | 기존 혼자하기와 같은 문구로 재시도 (게임오버 아님) |
| 위키 폴백 타임아웃 | 사전에 없는 것으로 처리, 재시도 피드백 |
| 혼자만 접속 | 정상 동작 — 내가 호스트, 모든 라운드 내가 이김. 교체 요청은 즉시 통과 |
| 교체 투표 중 라운드가 넘어감 | `vote.round` 불일치로 표가 저절로 무효. `swap`은 호스트가 정리 |
| 교체 투표 중 요청자가 나감 | 남은 표로 그대로 집계 — 요청자 존재는 조건이 아님 |
| 모두 나가고 방이 빈 채로 남음 | `meta`는 남지만 무해. 다음 입장자가 호스트가 되어 그 라운드부터 이어감 |

## 수용하는 한계

서버 심판이 없다. 작정한 사용자는 **로컬 검증을 건너뛰고 아무 낱말이나 승자로 등록**할 수 있다(트랜잭션은 `need`/`pattern` 구조만 보고 사전 등재 여부는 못 본다). 점수 조작·타인 점수 쓰기·타인 presence 위조는 규칙으로 차단 확인 완료. 가족·지인 대상 앱이므로 수용하고, 막으려면 Cloud Functions 심판이 필요하다.

부수 사항: `scores/{gameId}`는 증분 전용 규칙 때문에 클라이언트가 삭제할 수 없어 지난 게임 점수가 DB에 누적된다. 게임당 플레이어당 ~50B로 무해하여 방치한다.

## 파일 변경

1. **삭제**: 루트 `index.html` — `public/index.html`과 105KB 중복본. 양쪽 수정 누락으로 조용히 어긋날 위험 제거.
2. **수정**: `test/logic.test.mjs` — `../index.html` → `../public/index.html` (**13곳**). CORE 추출·배선 검사 대상이 유일본을 가리키게.
3. **수정**: `public/index.html` — Firebase SDK(compat, CDN) + `screen-multi` + `#modepick-overlay` + 멀티 로직. CORE 블록·혼자하기 경로 무변경.
4. **수정 + 재배포**: `database.rules.json` — `meta.swap` / `meta.swapCool` / `presence.$pid.vote` 추가. 이거 없이는 교체 요청 쓰기가 전부 거부된다. `firebase deploy --only database`.
5. `artifact.html`, `firebase.json` 미변경.

Firebase 설정(웹 앱 `nearby server` 것 재사용):
```
apiKey: "AIzaSyBXr59xkIb_l90kMdErron_5oqCMBZZj1E"
authDomain: "nearby-58e2d.firebaseapp.com"
databaseURL: "https://nearby-58e2d-default-rtdb.asia-southeast1.firebasedatabase.app"
projectId: "nearby-58e2d"
appId: "1:952923689342:web:4dd6eff3df360fe5a2e32f"
```

## 검증

환경: 이 머신에 JS 런타임이 없다. **nvm으로 node 설치**(sudo 불필요, `~/.nvm`)가 선행 작업.

1. **회귀 (필수)**: `node --test test/` 전체 통과 — 혼자하기 무손상 증명. 경로 수정 후에도 CORE 추출이 되는지 포함.
2. **멀티 레이스 (핵심)**: puppeteer로 브라우저 2개 동시 접속.
   - 두 브라우저가 **같은 문제**를 본다
   - 동시 제출 시 **정확히 한 명만** 승자, 점수 +1도 한 명만
   - 진 쪽은 🦉 중계로 승자·정답을 본다
   - 3초 후 두 브라우저가 **같이** 다음 라운드로 간다
   - 한쪽을 닫으면 `presence`에서 사라지고, 호스트였으면 남은 쪽이 승계해 진행이 멈추지 않는다
   - 10라운드 후 양쪽 다 최종순위, 한쪽이 `다시 시작`하면 양쪽 다 새 게임
3. **교체 요청 (핵심)**: 브라우저 2개로
   - A가 요청 → B가 동의 → **즉시** 양쪽 다 새 문제
   - A가 요청 → B가 **아무것도 안 함** → 20초 뒤 묵시적 동의로 교체 (← 자리 비운 사람이 방을 못 잠근다는 증명)
   - A가 요청 → B가 거부 → 교체 안 됨, 30초간 A의 요청 버튼 비활성
   - 끝말잇기에서 교체되면 체인이 새 시드로 리셋되고 라운드·점수는 유지
   - 교체 직후 양쪽에 이전 표가 남아 있지 않다(다음 요청이 오염되지 않는다)
4. **규칙 (필수)**: 재배포한 규칙을 실제 토큰으로 찔러 확인 — 남의 `presence/{uid}/vote` 쓰기가 401로 막히는지(표 위조 차단), `meta`에 임의 필드 추가가 여전히 막히는지.
5. **혼자 (수동)**: 브라우저 1개로 같이하기 — 호스트 부트스트랩, 교체 요청 즉시 통과.
6. **혼자하기 (수동)**: 끝말잇기·초성게임 혼자하기가 최고기록·다른낱말·힌트까지 예전 그대로.

DB 정리: 테스트로 생긴 `/nunus` 데이터는 증분 규칙 때문에 클라이언트가 못 지우므로 `firebase database:remove /nunus`(관리자)로 정리한 뒤 배포한다.
