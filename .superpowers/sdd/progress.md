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
Task 10: complete — 배포됨 (hosting + database)
  - firebase deploy --only hosting,database → https://nunus-1911.web.app/ (Deploy complete)
  - 라이브 == 로컬 확인: 바이트 동일(132854), diff 없음.
  - 실제 브라우저(claude-in-chrome)로 라이브 구동 확인:
    홈 → 끝말잇기 → [혼자/같이] 갈림길 뜸 → 같이하기 → 익명로그인 성공 →
    닉네임 입력 → 호스트 부트스트랩 → 첫 문제 "모자"/다음'자', 점수판 "나 0", 1R·0,
    🦉 중계, 문제 교체 요청 버튼(힌트/다른낱말 없음). 콘솔 에러 0.
  - 테스트 세션 후 presence 자동 정리됨(null). meta는 라운드1/0점 상태로 남김 —
    다음 플레이어가 이어받는 정상 시작점. 배포 후이므로 /nunus 통째 삭제 안 함.

=== 전 태스크 완료. feature/multiplayer 배포 완료. ===

=== 후속 개선 3건 (feature/multi-wiki-swap-ui) ===
1. 위키 폴백: submitMulti async화. 로컬 사전에 있으면 즉시 제출(레이스 속도 유지),
   없을 때만 wikiHasWord 확인 -> 있으면 addUserWord+통과. 위키 실제 네트워크 호출 확인(첨성대 통과).
2. 교체 요청 카드: 문제 영역에 강조 카드(#multi-swap-card, coral 테두리). "OO가 문제를 바꾸자고 해요!"
   + 초록 좋아요/빨강 싫어요(btn-danger). 투표 중 입력창 비활성. 요청자는 "기다리는 중" 카드.
   스크린샷으로 두 뷰 확인 완료.
3. 피드백 자동 클리어: input 이벤트 + reveal 진입 시 mFeedback('') (multiBusy 중엔 유지).
opus 리뷰: Important 1(오프라인 시 카드 미정리 회귀) + Minor 1(await 후 submit 무조건 재활성) 발견 -> 수정.
  fail-before/pass-after로 둘 다 증명. 66/66 유지. 솔로 무손상. commits 3b1de68, 24de347.
Minor(미해결, 기존/스코프밖): wikiHasWord가 일시적 네트워크 실패 시 false 캐시 -> 세션 내 실재어 거부(solo도 동일).

=== 이름 변경 + 간격 조정 (2026-07-21, feature/multi-nick-edit) ===
Task 1: complete (commits 8ef9e1f..b0dc346, review clean) — .players/.pchip.me/.swap-card CSS
Task 2: complete (commits b0dc346..8ded975, review clean) — nickChange를 CORE에 추가, 테스트 66->71
  리뷰가 TDD fail-first 증거를 의심 -> 컨트롤러가 직접 재현: 함수명을 바꾸면 정확히 5 fail/66 pass.
  테스트는 진짜로 구현을 검증함. 리포트 서술 문제였고 코드 결함 아님.
  Minor(미해결): nickChange는 current가 이미 정규화됐다고 가정. 호출부(MG.name)는 항상 norm된
  값만 담으므로 실질 무해.
Task 3: complete (commits 8ded975..255341f, review clean) — 내 칩에 이름+(나)+연필, escapeHtml 유지
Task 4: complete (commits 255341f..53c6fb5, 3 commits, review clean on 3rd pass)
  편집 UI(askNick enter/edit, closeNick, openNickEdit) + presence update(set 아님) + nickEditing 게이팅.
  opus 리뷰 1차 Critical 1: renderSwapUI의 idle 분기가 1초 tick에서 입력창을 직접 켜서 게이팅 우회
    (라운드 전환/쿨다운 만료 두 경로). 계획이 이 경로를 놓쳤음 -> 게이팅 추가. commit 1edadf9
  opus 리뷰 1차 Important 1: closeNick의 renderMulti가 오프라인 문구를 덮음 -> online 조건 추가.
  opus 리뷰 2차 Important 2: (a) 위키 조회 await 후 submit 재활성이 편집 무시 -> nickEditing 가드
    (b) 편집 중 투표 시작 시 swapSig 캐시 때문에 닫을 때 입력이 열린 채 남음 -> closeNick에서
    swapSig=null로 강제 재평가(오프라인 분기와 같은 기존 패턴). commit 53c6fb5
  입력창을 켜는 지점은 총 3곳(renderMulti play / submitMulti 위키 후 / renderSwapUI idle), 전부 게이팅됨.
  Minor(미해결, 최종 리뷰 트리아지 대상):
   1. 편집 중 reveal/over 렌더가 말풍선을 덮음(스펙 4절이 의도한 대로 게이팅 안 함)
   2. openNickEdit에 MG.ref/MG.uid 널가드 없음(현재 도달 불가)
   3. closeNick에 !MG 가드 없음(현재 도달 불가)
   4. 편집 중에도 교체 요청 버튼은 클릭 가능(스펙은 게임 입력만 잠그도록 요구)
   5. closeNick이 투표 진행 중이면 "20초 뒤" 문구를 경과 시간 무시하고 재공지
Task 5: complete (commits 53c6fb5..c7d0fcc, review clean) — multi-race.mjs에 이름변경 시나리오 추가
  fail-before(게이팅 제거): 정확히 1개 FAIL, 그 1개가 의도한 항목(disabled=false). pass-after: 전항목 PASS, exit 0.
  Minor: A.nick 갱신 주석이 부정확(호스트 승계 블록은 nick을 안 읽음). 무해.
컨트롤러 육안 검증(로컬 8777, claude-in-chrome): 최초 입장 모드(취소 숨김/라벨 "입장") 정상.
  칩 "가가(나) ✏️", cursor:pointer. 칩 탭 -> 편집 열림(값 미리채움, 라벨 "바꾸기", 취소 노출,
  게임 입력 disabled). 공백만 입력 후 바꾸기 -> 닫히지 않음. 취소 -> 이름 유지, 입력 복귀, 말풍선 복귀.
  간격: 칩 아래 여백 2px -> 12px 실측. 교체 카드 위 16px / 아래 12px 실측(스크린샷 확인).
  테스트 후 RTDB 정리 완료(null).
최종 whole-branch 리뷰(opus): SHIP. Important 2건 발견 -> 수정(commit 9d32569):
  1. renderPlayers가 매 이벤트마다 칩을 innerHTML로 재생성 -> 칩에 직접 붙인 클릭 리스너가
     탭 도중 사라질 수 있음(기능의 유일한 진입점). #multi-players에 위임 리스너 1개로 교체.
  2. closeNick의 swapSig=null(편집 중 시작된 투표를 닫을 때 재평가)에 테스트가 없었음 ->
     multi-race.mjs에 시나리오 추가. fail-before: 그 줄만 되돌리면 새 단언 1개만 FAIL(disabled=false).
  덤: 편집 중 🔄 교체 요청 버튼 클릭 차단(askSwap 조기 반환).
재리뷰(opus): 3건 모두 closed, 신규 결함 없음. SHIP.
Minor/Important(미해결, 후속 티켓 대상):
 - [Important, 기존 결함/스코프밖] renderMulti의 play 분기는 입력을 무조건 켜고 renderSwapUI는
   시그니처가 "바뀐" 경우에만 다시 잠근다 -> 투표 중 presence/scores 이벤트가 오면 남은 투표
   시간 동안 입력이 열린 채 남는다. closeNick 사례만 이번에 막았고 일반 케이스는 남아 있음.
   근본 해결책: 입력 잠금 판단을 syncInputLock() 한 곳으로 모으기(세 곳에 흩어져 있음).
 - Task 4 Minor 5건은 전부 "ship" 판정(도달 불가하거나 미관 문제). 상세는 위 Task 4 항목 참조.

=== 입력 잠금 단일 소유자 (2026-07-21, feature/input-lock-owner) ===
Task 1: complete (commits 66fb003..ac62749, review clean) — inputLock 순수함수, 테스트 71->79
  리뷰 Important: online:undefined 미테스트(래퍼가 boolean으로 정규화하지만 계약이 안 박혀 있었음)
  -> 테스트 추가, `online ?? true` 변이에서 실패함을 확인.
Task 2: complete (commits ac62749..4fccda9, review clean) — syncInputLock으로 8지점 전부 교체
  opus 리뷰가 지점별로 옛 상태 vs 새 계산을 대조: 6곳 동일, 2곳만 달라지고 둘 다 개선.
   (a) renderMulti play가 meta.swap을 보게 됨 = 목표 결함 수정
   (b) 위키 조회 중 presence 이벤트가 확인 버튼을 되살리던 것도 함께 막힘(무해했지만 시각적 오류)
  위키 조회 중 타이핑 유지 확인. renderMulti가 모든 phase에서 래퍼에 도달(over/오프라인 포함).
  renderMulti -> syncInputLock -> renderSwapUI -> syncInputLock 순서는 멱등(순수함수 + 무인자).
  Minor(미해결): syncInputLock에 DOM 널가드 없음(정적 요소라 도달 불가) / renderMulti의 !m 조기
   반환과 startMulti 리셋은 래퍼에 안 닿음(그 구간엔 #multi-play가 숨겨져 있음, 기존 동작).
Task 3 1차 시도: 서브에이전트가 올바르게 escalate. 계획의 fail-before 절차가 틀렸음 —
  play 분기에 옛 두 줄을 되살려도 같은 함수 끝의 syncInputLock()이 즉시 다시 잠가서 결함이
  재현되지 않음(pass 나옴). 정정: `git checkout ac62749 -- public/index.html`로 실제 결함
  코드를 꺼내 돌린다. 계획 문서도 같이 정정함.
  또 기존 플레이크 관측: 앞선 레이스 시나리오에서 이을 낱말을 못 찾아 스위트가 중단되는 경우 있음.
Task 3: complete (commit 570a645, review clean) — multi-race.mjs에 3.7 투표 잠금 시나리오
  fail-before는 실제 결함 파일(ac62749)로 돌려야 재현됨: [FAIL] disabled=false voteOpen=true.
  pass-after: 전항목 PASS, exit 0. 로직 79/0, rules-check 통과.
사고: 서브에이전트가 fail-before용으로 `git checkout ac62749 -- public/index.html`을 실행한 사이
  컨트롤러가 같은 워킹트리에서 계획 문서를 커밋 -> 그 명령이 인덱스도 쓰기 때문에 Task 2 수정이
  통째로 딸려 들어가 되돌려짐(6a02320). 서브에이전트가 커밋 직전에 발견해 escalate.
  복원 커밋 5a12aec. 이후 3커밋 범위 순효과가 0임을 리뷰가 독립 확인.
  교훈: 백그라운드 서브에이전트가 워킹트리를 조작하는 동안 커밋하지 않는다. 하더라도
  `git commit -- <path>`로 경로를 한정한다.
기존 플레이크 관측: 앞선 레이스 시나리오에서 이을 낱말을 못 찾아 스위트가 중단(3회 중 1회).
  3.7 자체는 사전을 안 쓰므로 영향 없음.
최종 whole-branch 리뷰(opus) 1차: SHIP + Important 2 -> 수정(commit 2cf7a9a)
  1. submitMulti가 여전히 5조건 중 2개만 보는 2차 게이트였음(online/editing/voting 미확인).
     DOM 잠금이 stale해지면 투표 중 답이 트랜잭션까지 도달. -> lockState() 헬퍼를 뽑아
     syncInputLock과 submitMulti가 같은 owner에게 묻게 함.
  2. enterRoom이 첫 meta 이벤트 전에 #multi-play를 보여주는데 markup에 disabled가 없어서
     방 입장 때마다 입력창이 잠깐 살아 있었음 -> markup에 disabled 추가.
  덤(Minor): startMulti에서 multiBusy=false 리셋(방을 나갔다 오면 확인 버튼이 잠긴 채 남던 문제).
2차 리뷰(opus): "fix first" — 위키 조회 재개 경로에 같은 2-of-5 게이트가 남아 있었음.
  투표가 await 중에 열리면 재개된 제출이 통과해 트랜잭션까지 가고 투표까지 지워버림.
  -> 재개 지점도 inputLock(lockState()).submit로 교체, multiBusy=false를 세션 체크 뒤로 이동.
  commit 64b4aef.
컨트롤러 통합 재실행: 전항목 PASS, exit 0 (알려진 사전 플레이크로 1회 중단 후 재실행).
라이브 검증: 입장 전 입력 잠김(true/true) -> 입장 후 열림(false/false) -> 실제 제출 성공("무응답").
미해결(후속 티켓):
 - 위키 조회 중에 투표가 열리는 인터리빙은 통합 테스트에 없음. 코드 추적으로만 확인됨.
   증명하려면 A가 미지의 낱말을 제출해 await 중일 때 B가 askSwap하는 시나리오가 필요.
 - multi-race.mjs 플레이크(끝말잇기 사전에 이을 낱말이 없어 스위트 중단): 3회 중 1회꼴.
   유일한 통합 게이트를 흔들므로 고칠 가치 있음.
Task 2: complete (commits aa84e52..461332a, review clean) — hostTick에서 chainRoundOutcome 판정,
  renderMulti over 문구를 round<MULTI_ROUNDS로 분기(규칙이 새 meta 필드를 막으므로 추론).
  opus 리뷰 Minor: 트랜잭션 콜백이 MG.mode를 읽는데 콜백이 재실행/지연되면 leaveMulti 이후
   MG가 null일 수 있음(기존에도 있었지만 이번 diff가 첫 참조를 앞당김) -> mode를 콜백 밖에서
   캡처. commit 461332a
  Minor(미해결): (1) 마지막 라운드에서 막다르면 "게임 끝!"로 표시됨(10라운드를 다 쳤으므로 타당)
   (2) newProblem의 `|| seeds[0]` 폴백은 이을 수 없는 seed를 낼 수 있고 그건 play 상태라
   hostTick이 안 봄. 현재 SEED_WORDS 15개는 모두 이을 수 있어 도달 불가.
Task 3: complete (commits 461332a..e331f9b, review clean) — acceptWord 막다른 분기에서 endChain(need),
  endChain은 인자 유무로 막다른 종료 / X 종료를 가름. 구현자가 실제 브라우저로 5개 항목 확인.
Task 4: complete (commits e331f9b..8ac82e3, review clean on 2nd pass) — 3.8 막다른 종료 시나리오 +
  기존 플레이크 제거(이을 낱말 없을 때 throw -> 방을 끝내고 재시작 경로로).
  fail-before: hostTick 판정만 손으로 되돌리면 의도한 단언이 FAIL(+연쇄 4건). pass-after: 전항목 PASS.
  리뷰 Important: 3.8이 round를 고정 안 해서, 앞 블록들이 라운드를 10까지 올려놓으면 종료는
   되지만 문구가 "게임 끝!"이 되어 정상 앱에서 단언이 실패(관측된 실행은 round=8, 여유 2).
   -> 스테이징 트랜잭션에서 round=1로 고정. commit 8ac82e3
  Minor(미해결): 후보 6글자 중 이을 수 없는 글자를 못 찾으면 skip이 아니라 6개 전부 FAIL 처리.
   사전이 늘어 후보가 모두 유효해지면 거짓 실패가 된다.
최종 whole-branch 리뷰(opus): SHIP. Critical 없음.
 [Important, 미해결 — 의도적으로 그대로 배포] 소형 사전 호스트가 남의 게임을 조기 종료시킬 수 있음.
   hostTick은 호스트의 WORD_ALL로 판정한다. 리뷰가 실측: 37k 사전에서 이을 수 있는 끝글자 789개 중
   238개(30%)가 4k 내장 사전에서는 막다르게 보인다. words.v1.txt fetch에 실패한 클라이언트가
   호스트가 되면 1~2라운드 만에 "더 이을 낱말이 없어!"로 방을 끝낼 수 있다.
   발생 조건은 (fetch 실패 x 호스트)로 드물고, 실패해도 "다시 시작"으로 복구되는 우아한 실패다.
   리뷰가 제시한 하드닝(window.__dictLoaded일 때만 over 판정)은 채택하지 않았다 — 그러면 사전이
   안 실린 호스트의 방은 진짜 막다름에서 예전처럼 멈추게 되어, 이 작업의 목적(정지 제거)과 상충한다.
   근본 해결은 사전 로드 실패 자체를 다루는 것(원장 상단에 기존 이슈로 기록됨).
 Minor(미해결): 호스트의 개인 등록 낱말(userWords/위키 폴백)로만 이을 수 있는 need는 'next'로
   판정되어 방이 정체될 수 있다(정지는 아님 — play 상태라 교체 투표가 열려 있다).
 Minor(미해결): 종료 화면에서 X(끝내기)를 누르면 endChain()이 인자 없이 불려 막다른 종료 문구가
   일반 문구로 덮인다. 기존 구조에서 온 것이고 미관 문제.
 확인된 것: meta.need를 쓰는 곳은 newProblem과 submitMulti 둘뿐이고 둘 다 판정 지점을 지난다.
   newProblem의 `|| seeds[0]` 폴백은 SEED_WORDS 15개가 두 사전 모두에서 이을 수 있어 도달 불가(실측).
   종료 사유 추론(round < MULTI_ROUNDS)은 모든 상태에서 성립. 혼자하기의 최고기록/등록 흐름 무손상.
   초성게임 무영향.
