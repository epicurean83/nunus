# 같이하기(멀티) 실행 기록

Plan: docs/superpowers/plans/2026-07-17-together-mode.md
Spec: docs/superpowers/specs/2026-07-17-together-mode-design.md
Branch: feature/multiplayer   merge-base(main): 10fad8c
시작 시점 HEAD: 3d0e3d2 (사전점검 수정 포함)

## 사전 점검에서 고친 것
- 스펙 "CORE 블록 무변경" ↔ 계획 Task 3(CORE에 pickHost/swapOutcome 추가) 모순 → 스펙을 계획에 맞춤
- Task 2 rules-check.sh가 meta 없이 meta/swap부터 써서 불안정 → 정상 meta 부트스트랩 먼저

## 태스크
(완료되면 여기에 한 줄씩 추가)
Task 1: complete (commits 1e94b01..3337e88, review clean)
  - node v24.18.0 via nvm (~/.nvm). 매 셸에서 소스 필요:
      export NVM_DIR="$HOME/.nvm"; [ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"
  - 테스트 명령: `node --test test/logic.test.mjs` (계획의 `node --test test/`는 Node24에서 깨짐 → 계획 17곳 수정)
  - 기준선 53/53 통과. 루트 index.html 삭제됨, public/index.html이 유일본.
Task 2: complete (commits cafb90c..523b1b7, review clean)
  - 규칙 배포됨(라이브 확인: rules-check.sh 11/11). meta.swap/swapCool, presence.$pid.vote={req,ok}
  - 배운 것: RTDB .validate는 상위로 전파된다 → presence/$pid/vote를 쓰려면 name/ts가 먼저 있어야 함.
    실제 클라이언트는 입장 시 presence를 먼저 쓰므로 문제 없음. Task 8 구현 시 순서 주의.
  - Minor(미해결, 최종리뷰에서 판단): swapCool의 isNumber()가 정수뿐 아니라 실수도 허용 — 스펙에서 온 느슨함, 무해.
Task 3: complete (commit 8bb143e, review clean)
  - CORE에 pickHost/swapOutcome 추가, CORE_NAMES 등록. 테스트 60/60 (기존 53 + 신규 7)
  - 리뷰어가 precedence 손으로 추적해 확인: stale > cancel > 만장일치 > 타임아웃
  - Minor(미해결): memberCount===0이면 즉시 'swap' 반환(빈 방). 요청자가 항상 멤버라 실제로 안 걸림.
