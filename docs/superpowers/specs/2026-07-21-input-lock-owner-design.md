# 같이하기 입력 잠금 판단의 단일 소유자 — 설계

작성일: 2026-07-21
대상: `public/index.html` (같이하기 멀티플레이 모드)

## 배경

같이하기의 게임 입력(`#multi-input`, `#multi-submit`)이 열려야 하는지는 다섯 가지 조건에 달려
있는데, 그 판단이 여섯 군데에 흩어져 있다. 조건이 하나 늘 때마다 여섯 곳을 모두 고쳐야 하고,
실제로 이름 변경 기능(2026-07-21)을 넣으면서 세 번 연속으로 한 곳씩 빠뜨렸다 — 매번 코드
리뷰가 잡았다.

같은 부류의 결함이 아직 하나 남아 있다. `renderMulti`의 `play` 분기는 교체 투표 진행 여부를
보지 않고 입력을 켠다. `renderSwapUI`는 서명이 "바뀐" 경우에만 다시 잠그므로, 투표 중에
presence나 scores 이벤트가 도착하면 남은 투표 시간 내내 입력이 열린 채로 남는다. 혼자만 답을
낼 수 있는 상태가 된다.

## 목표

1. 입력 잠금 판단을 한 곳으로 모아, 조건이 바뀔 때 고칠 자리가 하나가 되게 한다.
2. 그 과정에서 위 결함을 없앤다.

## 비목표

- 말풍선 문구 로직은 건드리지 않는다. 잠금과 문구는 별개이고, 함께 손대면 이번 변경의 위험이
  커진다.
- 교체 투표 자체의 규칙(누가 투표하는가, 언제 성립하는가)은 그대로 둔다.
- 혼자하기 모드는 건드리지 않는다.

## 1. 순수 함수 — 잠금 규칙의 유일한 소유자

CORE 블록에 둔다. DOM에도 `MG`에도 의존하지 않으므로 조합을 전수 테스트할 수 있다.

```
inputLock({ phase, online, editing, busy, voting }) -> { input: boolean, submit: boolean }
```

```
input  = phase === 'play' && online && !editing && !voting
submit = input && !busy
```

반환값은 "열려야 하는가"다. 호출부가 `disabled = !값`으로 뒤집는다.

`input`과 `submit`이 갈리는 경우는 하나뿐이다 — 위키 조회 중(`busy`)에는 확인 버튼만 잠기고
입력창은 열려 있어 계속 타이핑할 수 있다. 현재 동작이며 그대로 보존한다.

## 2. 래퍼

```js
function syncInputLock(){
  const m = MG && MG.meta;
  const st = inputLock({
    phase:   m ? m.phase : null,
    online:  !MG || MG.online !== false,
    editing: !!(MG && MG.nickEditing),
    busy:    multiBusy,
    voting:  !!(m && m.swap)
  });
  $('multi-input').disabled  = !st.input;
  $('multi-submit').disabled = !st.submit;
}
```

`MG`나 `MG.meta`가 없으면 `phase`가 `null`이라 자동으로 잠긴다.

`online`의 기본값에 주의한다. `MG.online`은 첫 `.info/connected` 이벤트 전까지 `undefined`이며,
기존 코드는 이를 온라인으로 취급해 새 세션이 시작부터 잠기지 않게 한다. `MG.online !== false`가
그 규칙을 그대로 옮긴 것이다.

## 3. 교체 대상

`disabled`를 직접 대입하는 곳 전부를 래퍼 호출로 바꾼다. 빠뜨린 곳이 없어야 하므로
`grep -n "multi-input').disabled\|multi-submit').disabled"`로 전수 확인한다.

| 위치 | 현재 동작 | 바뀐 뒤 |
|---|---|---|
| `askNick` 편집 진입 | 둘 다 잠금 | `syncInputLock()` |
| `onCon` 오프라인 분기 | 둘 다 잠금 | `syncInputLock()` |
| `renderMulti` `play` 분기 | **`swap`을 보지 않고 켬 ← 결함** | `syncInputLock()` |
| `renderMulti` `reveal` 분기 | 둘 다 잠금 | `syncInputLock()` |
| `submitMulti` 위키 조회 시작 | `submit`만 잠금 | `syncInputLock()` |
| `submitMulti` 위키 조회 종료 | 조건 중복 판정 후 `submit` 해제 | `syncInputLock()` |
| `renderSwapUI` `idle` 분기 | 둘 다 켬 | `syncInputLock()` |
| `renderSwapUI` 투표 진행 분기 | 둘 다 잠금 | `syncInputLock()` |

결함 수정은 별도 작업이 아니라 이 교체의 부산물이다. `play` 분기가 래퍼를 거치는 순간
`voting`을 보게 된다.

`submitMulti`의 위키 조회 종료 지점에 있던 `nickEditing`·`swapSigOf()` 중복 판정은 삭제한다.
래퍼가 같은 판단을 이미 한다.

## 4. 호출 시점

교체 지점들이 곧 호출 시점이다. 추가로 부를 곳은 없다 — 상태를 바꾸는 모든 경로가 이미 위
여덟 곳 중 하나를 지난다.

## 5. 검증

**로직 테스트** — `test/logic.test.mjs`

`inputLock`은 순수 함수이므로 조합을 전수로 확인한다.

- `phase !== 'play'`면 다른 조건과 무관하게 둘 다 닫힘.
- `voting`이 참이면 다른 조건과 무관하게 둘 다 닫힘.
- `editing`이 참이면 둘 다 닫힘.
- `online`이 거짓이면 둘 다 닫힘.
- `busy`만 참이면 `input`은 열리고 `submit`만 닫힘 — 유일하게 둘이 갈리는 경우.
- 다섯 조건이 모두 통과하면 둘 다 열림.

**통합 1건** — `test/multi-race.mjs`

결함 경로를 그대로 재현한다.

1. A와 B가 `play` 상태로 들어간다.
2. B가 교체 투표를 시작한다(`askSwap()`).
3. A가 투표를 인지하고 입력이 잠긴 것을 확인한다.
4. 투표가 진행되는 동안 presence 이벤트를 일으켜 A의 `renderMulti`를 태운다.
5. A의 입력이 여전히 잠겨 있는지 확인한다.

현재 코드에서는 5번이 실패한다. 교체 전 상태로 되돌려 fail-before를 먼저 보이고 고친다.

**회귀**: 기존 로직 테스트 71개 전량 통과, `multi-race.mjs`의 기존 시나리오 전량 통과,
혼자하기 무손상.

## 6. 변경 범위

- `public/index.html` — CORE에 `inputLock` 추가, `syncInputLock` 추가, 여덟 지점 교체.
- `test/logic.test.mjs` — `CORE_NAMES`에 `inputLock` 등록, 조합 테스트 추가.
- `test/multi-race.mjs` — 통합 시나리오 1건 추가.
