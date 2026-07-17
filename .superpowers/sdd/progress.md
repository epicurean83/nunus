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
Task 7: complete (commits 3970397..370a979, opus 리뷰 → 7개 수정 → 재리뷰 Approved)
  - meta 트랜잭션 레이스 판정, 점수, hostTick, restartMulti. 65/65.
  - opus 리뷰가 Critical 1 + Important 4 발견, 전부 수정:
    * (C) 호스트가 reveal 중 나가면 방이 영구 정지 → presence 핸들러가 renderMulti() 호출
    * (I) 트랜잭션 로컬 선적용 탓에 진 사람이 "이겼어요" 깜빡임 → 모든 meta 트랜잭션 applyLocally=false
    * (I) 점수 콜백이 가변 전역 MG.meta.gameId 사용 → 커밋된 스냅샷 + myRef 세션 확인
    * (I) restartMulti에 phase 가드 없어 둘이 누르면 gameId 건너뜀 → phase!=='over'면 abort
    * (I) 재시작 후 점수칩이 옛 점수 유지 → MG.allScores + refreshScores() 단일 출처
  - 검증: 진짜 경쟁 레이스 3회(승자 Alice/Alice/Bob으로 갈림 = 진짜 경쟁), Critical은
    옛 커밋을 별도 포트에 띄워 fail-before(12.1s 정지)/pass-after(3.25s 복구) 증명.

  >>> TASK 9가 반드시 닫아야 할 구멍 (재리뷰 지적):
      레이스 하네스가 진 쪽의 트랜잭션 결과를 기록하지 않는다. 진 쪽 setTimeout이 이미 reveal로
      넘어간 뒤 발화하면 submitMulti가 phase!=='play'로 조기 리턴해 트랜잭션을 아예 안 건다 —
      그래도 "승자 1명"으로 통과한다. 즉 "서버 게이트가 동시 커밋을 거부했다"가 관찰이 아니라 추론.
      → multi-race.mjs는 진 쪽에서 committed===false를 실제로 관찰해 기록해야 한다.

  Minor(미해결, 최종리뷰에서 판단):
   - multi-input.value='' 가 세션 가드보다 위에 있어, 나간 방의 콜백이 새 방 입력을 지울 수 있음
   - applyLocally=false 탓에 제출 후 1 RTT 동안 입력창이 열려있음(중복 제출은 서버가 abort, 무해)
   - 7개 수정 중 어느 것도 회귀 테스트로 고정되지 않음(수동 브라우저 검증에만 의존)
Task 8: complete (commits 5542275..1a6e325, opus 리뷰 4라운드 → Approved)
  - 교체 투표. 66/66. 핵심 증명: B가 아무것도 안 해도 20.3s에 양쪽 문제 바뀜(침묵=동의).
  - 수정 3라운드, 각 라운드가 다음 구멍을 열었음:
    * R1 (Critical) 거부 후 1초 틱이 멈춰 유일한 탈출구 버튼이 영구 비활성 → 틱을 (swap||swapCool)로
    * R2 (Important×2) 넓힌 틱이 매초 버튼 노드를 재생성해 탭을 삼킴 + 매초 mSay가 라운드 안내 덮음
      → 구조 시그니처(swapSig)로 멱등 렌더, 카운트다운만 제자리 갱신
    * R3 (Critical) 오프라인 시 #multi-swap을 비우면서 swapSig를 안 지워, 재연결 때 "변화없음"으로
      판단해 버튼을 영영 안 그림 → 비울 때 swapSig=null
  - 교훈: R1~R2의 모든 검증이 "건강한 소켓"에서만 돌아서 R3 버그가 두 라운드를 살아남았다.
    setOfflineMode로 실제로 끊어보고서야 잡힘. 그리고 R1 검증은 탭을 새로고침해서 자기가 증명하려던
    결함을 가렸다 — 반증 테스트가 더 쌌는데.
  Minor(미해결, 최종리뷰 판단):
   - 틱이 MG.online을 안 봐서 끊긴 상태로도 투표 버튼이 다시 그려짐. 그 표는 조용히 버려짐.
     결과는 설계(침묵=동의)와 일치하므로 UI 정직성 문제이지 오동작은 아님.
   - 검증 공백: idle 상태에서 오프라인→재연결 경로는 실제로 커버 안 됨(probe b가 공허했을 수 있음 —
     idle엔 틱이 안 도니 버튼이 "돌아온" 게 아니라 "안 사라졌던" 것일 수 있음). 수정은 코드상 타당.
   - 미검증: 호스트가 투표 중 이탈, 쿨다운 중 나가기/모드전환, 요청자가 요청 중 오프라인
Task 9: complete (commits 3edf432..3e9c1f3, opus 리뷰 → 수정 → 재리뷰 Approved)
  - test/multi-race.mjs 커밋됨. 37체크 전부 통과. 단위 66/66 (섞이지 않음).
  - 처음 버전이 심각했음: innerHTML 디스크립터를 Element.prototype이 아닌 곳에서 찾아 set 트랩이
    던졌고, 그래서 앱의 클리어가 실패해 버튼이 안 지워지는데 테스트는 "지워졌다"고 초록불.
    검증하려던 바로 그 공허함을 스스로 만들어냈음. + 둘이 같은 낱말을 내서 가드를 지워도
    끝말잇기 자체 게이트가 진 쪽을 막아 테스트가 실패 불가능했음.
  - 수정 후 fail-proof 증명: 디스크립터 walk를 되돌리면 즉시 실패, phase 검사를 지우면 15/15 이중커밋 검출.
  - 알아낸 것: submitMulti의 phase/winner 가드는 상호 중복. 어느 하나만 지워도 다른 하나가 막는다.
    (winner는 defense-in-depth로 남길 가치 있음 — 미래에 phase='play'인데 winner가 안 지워지는 경로 대비)
  - 알아낸 것: 오프라인 중 presence 리스너 리렌더가 ~1ms 만에 교체 버튼을 되살림.
    Task 8의 "오프라인엔 투표 못 하게" 수정이 사실상 무력화됨. 결과는 설계(침묵=동의)와 일치해 무해.
  Minor(미해결, 최종리뷰 판단):
   - "재연결 후 버튼 클릭 가능" 체크는 실패 불가능(위 리렌더 탓). 사라짐 방향만 고정됨.
   - cleanupOwn 4개가 한 try에 묶여 있어 첫 번째가 던지면 나머지가 안 돌고 방이 더럽게 남음

=== 전체 브랜치 최종 리뷰 (opus) ===
1차: NO-GO — 블로커 1개
  * MG.online을 쓰기만 하고 아무도 안 읽음 → 오프라인 잠금이 ~2ms 만에 풀림.
    onPresence가 renderMulti를 불러 입력창을 도로 열고 말풍선을 덮어씀.
    실제 결과: 신호 끊긴 폰에서 화면은 멀쩡한데 제출이 아무 반응 없음(입력창도 안 비워짐).
  → 수정 20e787b: renderMulti의 play 분기와 renderSwapUI 호출을 online 조건으로 게이팅.
    fail-before(옛 커밋: 입력창 열림) / pass-after(잠김 유지, 재연결 시 복구+실제 제출 성공) 증명.
  → 스펙도 정정: 같이하기는 위키 폴백 없이 로컬 사전만 씀(레이스에서 네트워크 왕복 = 패배).
2차: GO
  - 솔로 무손상 확인(diff에서 삭제된 줄은 screens 맵과 모드카드 바인딩 단 2줄, 나머지 전부 추가)
  - 규칙은 /nunus 밖으로 아무것도 노출 안 함, 이미 배포·검증됨

배포 후 처리할 Minor:
 - renderMulti의 reveal/over 분기는 online 게이팅 안 됨 → reveal 중 끊기면 "연결 끊김" 문구가
   승자 문구로 덮임(입력은 여전히 잠겨 있어 무해, 문구만 사라짐)
 - 재연결 시 요청자에게 "교체 요청했어!"가 다시 announce됨(무해)
 - words.v1.txt fetch 실패 클라이언트: 호스트는 33k에서 출제하는데 본인은 4k로 검증 →
   그 세션이 사실상 플레이 불가, 진단 메시지 없음. 스펙에 명시했으나 진짜 고칠 가치 있음.
 - 백그라운드 호스트 탭이 3초 타이머 스로틀링 당하면 라운드당 최대 1분 지연(자가 치유됨)
 - 최종순위는 현재 접속자만 표시 — 중간에 나간 사람은 시상대에서 사라짐
