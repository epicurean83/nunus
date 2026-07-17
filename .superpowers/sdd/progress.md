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
Task 4: complete (commits e7a7b8f..bba0228, review clean + 브라우저 스모크 8/8)
  - #modepick-overlay 신설. chain/chosung만 분기, choice/type은 직행.
  - 기존 테스트 2개(끝말잇기/초성 배선)는 옛 핸들러 문자열을 하드코딩하고 있어 수정 불가피.
    리뷰어가 독립 검증: 치환 문자열이 유일하고 솔로 도달을 여전히 못 박음.
  - puppeteer 앞당겨 설치(Task 9 Step 1). 이후 태스크는 실제 브라우저로 검증 가능.
  - 스모크 확인: 오버레이 열림/닫힘, 솔로 실제 한 턴 플레이해 점수 증가, 다른낱말/힌트/최고기록 살아있음,
    choice는 오버레이 없이 직행, 같이하기는 stub alert. 콘솔 에러 0.
Task 5: complete (commits f0471ce..4b681f1, review clean 재리뷰 통과 + 브라우저 확인)
  - screen-multi, 익명로그인, 닉네임(nachmal.multi.nick.v1), presence, .info/connected. 63/63.
  - 브라우저 확인: 두 컨텍스트가 서로 보임, 한쪽 닫으면 사라짐, 콘솔에러 0.
  - 수정됨(Important): onPresence에 !MG 가드 없어 방 전환 시 옛 방 멤버가 새 세션에 유입될 수 있었음.
    → 두 핸들러 모두 `if(!MG || MG.ref !== myRef) return`. 근거는 정적 분석(브라우저 체크는 이 레이스를
    재현하지 못함 — 리뷰어 지적, 정직하게 기록).
  - Minor(미해결): 모드 전환 시 옛 onDisconnect 등록이 남음. 모드 2개로 유한, 무해한 no-op.
  - 안전장치 추가: 배포 후 /nunus 통째 삭제 금지(전역 제약에 명시). 지금은 RTDB 루트가 null이라 안전.
Task 6: complete (commit 16bda9c, review clean + 브라우저 확인)
  - newProblem/bootstrapMeta/renderMulti. 64/64.
  - 브라우저 확인: 두 컨텍스트가 같은 문제(끝말잇기 '마'/하마, 초성 'ㅁㄴ'). 콘솔에러 0.
  - 보안 속성 실증: 라이브 meta를 페이지에서 읽어 phase='play'일 때 answer 키 없음 확인.
  - Minor(미해결): newProblem의 chosung 분기에 idx.easy가 빈 경우 폴백 없음 → pattern undefined 가능.
    스펙 스니펫에서 온 것. WORD_DICT(4k)가 20+ 임계를 이미 넘겨 솔로에서 잘 도는 중이라 실제론 안 걸림.
