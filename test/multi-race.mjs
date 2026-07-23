// 같이하기(멀티) 통합 검증 — 실 브라우저 여러 개, 실 RTDB.
//
// 실행법:
//   1) public/ 에서 서버를 띄운다:  cd public && python3 -m http.server 8777
//   2) 다른 터미널에서:              node test/multi-race.mjs
//
// 이 스크립트는:
//   - puppeteer로 완전히 분리된 브라우저 컨텍스트(별도 프로필) 네 개를 띄워 실제
//     nearby-58e2d 프로젝트의 실 RTDB(nunus/chain, nunus/chosung)에 붙는다. 모킹 없음.
//   - 시작 전 nunus/chain, nunus/chosung 이 비어 있는지 확인하고(다른 진짜 플레이어가
//     쓰고 있을 수 있는 영구 방이므로), 끝나면 자신이 쓴 데이터만 지운다 — 단, 실행 중
//     실제 플레이어가 들어왔다면(presence에 낯선 uid) meta는 지우지 않고 경고만 남긴다.
//   - 소요 시간: 대략 2~4분.
//   - 실패하면 비정상 종료 코드(1)를 반환한다.
//
// 왜 별도 브라우저 컨텍스트인가:
//   browser.newPage()로 만든 두 탭은 기본적으로 같은 프로필(localStorage/IndexedDB)을
//   공유한다. Firebase 익명 로그인은 그 저장소에 세션을 남기므로, 컨텍스트를 분리하지
//   않으면 "두 브라우저"가 사실 같은 uid로 로그인된 하나의 사용자가 되어 버려서 애초에
//   경쟁이라는 게 성립하지 않는다(직접 확인함 — 분리 전엔 uidA === uidB였다).
//   그래서 각 참가자를 browser.createBrowserContext()로 완전히 격리한다.
//
// GAP 1 (레이스가 실제로 경합했다는 증거 없음): 두 클라이언트의 제출을
//   Promise.all(a.click(), b.click())로 걸면 CDP가 두 명령을 직렬로 보내므로 항상 같은
//   쪽이 이긴다. 그리고 진 쪽이 그냥 phase 가드에서 조용히 리턴해버려도(트랜잭션을 아예
//   호출 안 해도) "승자 한 명"이라는 결과만 보면 통과처럼 보인다. 그래서 여기서는 각
//   페이지 안에서 동일한 절대 시각(t = Date.now()+N)에 setTimeout으로 submitMulti()를
//   걸고, Reference.prototype.transaction을 몽키패치해 meta 트랜잭션이 실제로 호출됐는지와
//   completion 콜백의 committed 값을 기록한다. 두 쪽 다 트랜잭션을 호출했는데 한쪽만
//   committed:true인 경우만 "유효한 레이스"로 센다. 한쪽이 가드에서 새버린 시도는 버리고
//   재시도한다(라운드가 진행되므로 다음 라운드에서 다시 시도).
//   끝말잇기에서는 같은 낱말을 동시에 제출해도 cur.used[word]/cur.need 전진이라는 독립
//   게이트가 있어서, submitMulti의 winner 가드(`|| cur.winner`)가 없어도 진 쪽이 걸린다
//   — 즉 그 가드가 끝말잇기에서는 안 걸려도 티가 안 난다. 초성게임은 다르다: 승리해도
//   pattern이 안 바뀌므로(라운드가 진행될 때만 바뀜) `chosungOf(word)!==cur.pattern` 게이트
//   만으로는 두 명 다 통과한다 — winner 가드가 유일한 방어선이다. 그래서 초성 레이스도
//   따로 두 번 돌려서, 그 가드가 실제로 결과를 좌우하는지 검증한다.
//
// GAP 2 (재연결을 실제로 끊어본 적 없음): page.setOfflineMode으로 소켓을 진짜 끊는다.
//   재연결 후 버튼이 "돌아왔다"는 것만 보면, 애초에 안 사라졌던 것과 구분이 안 된다.
//   그래서 #multi-swap의 innerHTML 세터 자체를 가로채 모든 대입을 타임스탬프와 함께
//   기록하고, 오프라인 동안 빈 문자열로의 SET이 최소 한 번 실제로 일어났는지를 증거로
//   확인 — 그리고 그 증거만으로는 "세터가 호출됐다"만 알 수 있지 "실제로 지워졌다"는
//   보장이 안 되므로(가로챈 세터가 원래 세터 호출에 실패하면 로그만 찍히고 DOM은 안
//   바뀔 수 있다 — 실제로 이런 버그가 있었다: innerHTML 접근자가 HTMLDivElement.prototype/
//   HTMLElement.prototype이 아니라 Element.prototype 소유라서, 체인을 잘못 걸으면 세터가
//   던지고 원래 세터는 절대 안 불림), 오프라인 동안 버튼이 실제로 안 보이거나 클릭
//   불가능한지도 직접 관측한다. 그 다음에만 "재연결 후 버튼이 클릭 가능하다"를 검사한다.

import puppeteer from 'puppeteer';

const URL_ = 'http://localhost:8777/';
const PROJECT = 'nearby-58e2d';
const REVEAL_MS = 3000, SWAP_VOTE_MS = 20000;

const sleep = ms => new Promise(r => setTimeout(r, ms));

/* ---------- 리포트 ---------- */
const results = [];
function report(name, ok, detail){
  results.push({ name, ok, detail });
  console.log((ok ? '[PASS] ' : '[FAIL] ') + name + (detail ? ' — ' + detail : ''));
}
function info(msg){ console.log('       ' + msg); }

/* ---------- puppeteer 헬퍼 ---------- */
async function join(browser, nick, mode = 'chain'){
  const ctx = await browser.createBrowserContext();     // 프로필 격리 — 위 설명 참조
  const p = await ctx.newPage();
  await p.goto(URL_, { waitUntil: 'networkidle2' });
  await p.evaluate(() => localStorage.clear());
  await p.reload({ waitUntil: 'networkidle2' });
  await p.click('.mode-card.' + mode);
  await p.waitForSelector('#modepick-multi', { visible: true });
  await p.click('#modepick-multi');
  await p.waitForSelector('#multi-nick-input', { visible: true });
  await p.type('#multi-nick-input', nick);
  await p.click('#multi-nick-ok');
  await p.waitForSelector('#multi-play:not(.hidden)');
  await p.waitForFunction(() => window.__dictLoaded === true, { timeout: 10000 }).catch(() => {});
  return { page: p, ctx, nick };
}

const need  = p => p.$eval('#multi-need b', e => e.textContent);
const bub   = p => p.$eval('#multi-bubble', e => e.textContent);
const round = p => p.$eval('#multi-round', e => e.textContent);

async function waitFor(page, fn, args = [], { timeout = 8000, interval = 150, label = 'condition' } = {}){
  const start = Date.now();
  while (Date.now() - start < timeout){
    const v = await page.evaluate(fn, ...args);
    if (v) return v;
    await sleep(interval);
  }
  throw new Error('timeout waiting for ' + label);
}
const waitPhase = (page, phase, timeout = 8000) =>
  // MG는 앱에서 `let`으로 선언돼 전역 렉시컬 환경에만 있다 — window에는 안 붙으므로
  // window.MG로 보면 영원히 undefined다. 맨 이름으로 봐야 한다.
  waitFor(page, (ph) => typeof MG !== 'undefined' && MG && MG.meta && MG.meta.phase === ph,
          [phase], { timeout, label: 'phase=' + phase });

async function readScores(page, gameId, mode = 'chain'){
  return page.evaluate((gid, m) => new Promise(res => {
    firebase.database().ref('nunus/' + m + '/scores/' + gid).once('value', s => res(s.val() || {}));
  }), gameId, mode);
}

// meta.transaction 을 몽키패치해 호출 여부와 committed 결과를 window.__txnLog에 남긴다.
// (GAP 1 계측 — 위 헤더 설명 참조)
//
// 태그가 필요한 이유: hostTick(라운드 진행)도, askSwap도, restartMulti도 전부 meta에
// 트랜잭션을 건다(key==='meta'는 전부 같다). 특히 hostTick은 reveal+3000ms에 걸리는데,
// 그게 우리가 레이스 결과를 기다리는 t+4000ms 창 안에 들어올 수 있다 — 진 쪽이 phase
// 가드에서 새버렸는데(트랜잭션을 아예 안 검) 마침 진 쪽이 호스트라서 hostTick의 커밋이
// 로그에 잡히면 committedA===committedB===true로 오판해 멀쩡한 코드를 "트랜잭션 게이트
// 이상"으로 잘못 FAIL 처리하게 된다. 그래서 제출을 걸 때만 window.__txnTag='submit'을
// 세워 그 트랜잭션 호출에 태그를 남기고(호출 "시점"에 캡쳐 — 완료 콜백은 비동기라 그때
// 읽으면 이미 지워졌을 수 있다), 로그를 읽을 때 tag==='submit'인 것만 본다.
async function installTxnHook(page){
  await page.evaluate(() => {
    if (window.__txnPatched) return;
    window.__txnPatched = true;
    window.__txnLog = [];
    window.__txnTag = null;
    const proto = Object.getPrototypeOf(firebase.database().ref('nunus'));
    const orig = proto.transaction;
    proto.transaction = function(updateFn, onComplete, applyLocally){
      const key = this.key;
      const tag = window.__txnTag || null;
      const wrapped = (err, committed, snap) => {
        window.__txnLog.push({ key, committed: !!committed, err: err ? String(err) : null, t: Date.now(), tag });
        if (onComplete) onComplete(err, committed, snap);
      };
      return orig.call(this, updateFn, wrapped, applyLocally);
    };
  });
}
const clearTxnLog = page => page.evaluate(() => { window.__txnLog = []; });
const metaTxnLog = page => page.evaluate(() => window.__txnLog.filter(e => e.key === 'meta' && e.tag === 'submit'));

// 입력창에 word를 채우고, 공유된 절대시각 t에 태그를 세운 채로 submitMulti()를 건다.
function scheduleTaggedSubmit(page, word, t){
  return page.evaluate((t, w) => {
    document.getElementById('multi-input').value = w;
    setTimeout(() => {
      window.__txnTag = 'submit';
      try { submitMulti(); } finally { window.__txnTag = null; }
    }, Math.max(0, t - Date.now()));
  }, t, word);
}

// #multi-swap 의 innerHTML setter를 가로채 모든 SET을 기록한다. (GAP 2 계측)
async function installSwapWatch(page){
  await page.evaluate(() => {
    if (window.__swapWatchInstalled) return;
    window.__swapWatchInstalled = true;
    window.__swapSetLog = [];
    const el = document.getElementById('multi-swap');
    // innerHTML의 진짜 소유자는 실제로 Element.prototype이다 — HTMLDivElement.prototype도
    // HTMLElement.prototype도 아니다(직접 확인함: {onDiv:false, onHTMLElement:false,
    // onElement:true}). 체인을 두 단계만 보고 멈추면 desc가 undefined인 채로 트랩이
    // 설치되고, 실제 SET이 일어날 때 desc.set에서 던진다 — 그러면 앱의 진짜 클리어
    // (`$('multi-swap').innerHTML=''`)가 실패해 버튼이 실제로는 안 사라지는데, 우리 로그엔
    // "빈 문자열로 SET을 시도했다"는 기록만 남아 "지워졌다"는 착각을 준다. 그래서 여기서는
    // 체인을 끝까지 걸어 올라가며 진짜 접근자를 찾고, 못 찾으면 깨진 트랩을 몰래 설치하는
    // 대신 즉시 던진다 — 앱을 조용히 부수는 프로브는 프로브가 없는 것보다 나쁘다.
    let proto = Object.getPrototypeOf(el);
    let desc;
    while (proto){
      desc = Object.getOwnPropertyDescriptor(proto, 'innerHTML');
      if (desc && desc.get && desc.set) break;
      desc = undefined;
      proto = Object.getPrototypeOf(proto);
    }
    if (!desc){
      throw new Error('installSwapWatch: #multi-swap의 innerHTML 접근자를 프로토타입 체인' +
        '에서 못 찾음 — 트랩을 설치하지 않고 중단함(깨진 트랩은 없는 것보다 나쁨)');
    }
    // "SET이 시도됐다"만으로는 부족하다 — 원래 버그처럼 desc가 잘못 잡히면 desc.set 호출이
    // 던져서 실제 DOM은 안 바뀌었는데도 로그엔 ''로 SET한 기록이 남는다(진짜 evidence
    // fabrication). 그래서 실제 대입을 마친 "바로 그 동기 실행 안"에서 버튼이 정말
    // DOM에서 사라졌는지(#multi-swap-ask가 없는지)를 같이 기록한다. 이건 나중에 다른
    // (연결 상태 전환에 따른 무관한) 렌더 호출이 버튼을 되살리는 것과는 무관하다 — 그건
    // 이 동기 구간이 끝난 "다음" 이벤트에서 벌어지므로 여기서 잡히지 않는다.
    Object.defineProperty(el, 'innerHTML', {
      configurable: true,
      get(){ return desc.get.call(this); },
      set(v){
        try{
          return desc.set.call(this, v);
        } finally {
          const reallyGone = (v === '') ? !document.getElementById('multi-swap-ask') : null;
          window.__swapSetLog.push({ t: Date.now(), html: v, reallyGone });
        }
      }
    });
  });
}
const clearSwapWatch = page => page.evaluate(() => { window.__swapSetLog = []; });
const swapWasClearedToEmpty = page => page.evaluate(() => window.__swapSetLog.some(e => e.html === ''));
// html==='' 로 SET이 "시도"됐을 뿐 아니라, 그 SET이 끝난 바로 그 동기 구간에서 버튼이
// 실제로 DOM에서 사라졌음을 확인한 적이 있는지 — Finding 1(b)가 요구하는 "진짜 증거".
const swapReallyWentEmpty = page => page.evaluate(() => window.__swapSetLog.some(e => e.reallyGone === true));

function visibleClickable(page, id){
  return page.evaluate((id) => {
    const el = document.getElementById(id);
    if (!el) return { exists: false };
    const r = el.getBoundingClientRect();
    return { exists: true, visible: r.width > 0 && r.height > 0, disabled: !!el.disabled };
  }, id);
}

// 실행 중 실제 플레이어가 들어왔을 수 있으므로(영구 공유 방), 자기 몫을 지운 뒤
// presence에 남이 있으면 meta는 절대 지우지 않는다 — 남이 있다면 meta는 그 사람의
// 진행 중인 게임 상태이기 때문이다.
async function removeMetaIfNoStranger(page, mode){
  try{
    // .once('value')는 그 경로에 이미 활성 리스너가 있으면(우리 자신의 onPresence
    // 구독) 서버 왕복 없이 그 리스너의 로컬 캐시를 돌려줄 수 있다 — 우리가 방금
    // 다른 클라이언트에서 지운 presence 항목이 아직 이 리스너에 반영되기 전 찰나를
    // 잡으면 "낯선 uid"로 오판할 수 있다(실측함). 그래서 즉시 포기하지 않고 짧게
    // 몇 번 재확인한다 — 진짜 낯선 uid는 재확인해도 안 사라지지만, 우리 자신의 방금
    // 지운 항목의 전파 지연은 한두 번 안에 사라진다.
    let presence = {};
    for (let i = 0; i < 5; i++){
      presence = await page.evaluate((m) => new Promise(res =>
        firebase.database().ref('nunus/' + m + '/presence').once('value', s => res(s.val() || {}))
      ), mode);
      if (!Object.keys(presence || {}).length) break;
      await sleep(400);
    }
    const strangers = Object.keys(presence || {});
    if (strangers.length){
      console.log('       [경고] nunus/' + mode + '/presence 에 우리 것이 아닌 uid가 남아있어' +
        ' meta를 지우지 않고 건너뜀: ' + strangers.join(', ') + ' — 테스트 도중 실제 플레이어가' +
        ' 들어온 것으로 보인다. meta는 그 사람의 진행 중인 게임 상태일 수 있으므로 자동으로' +
        ' 지우지 않는다. 필요하면 수동으로 확인할 것.');
      return false;
    }
    await page.evaluate((m) => firebase.database().ref('nunus/' + m + '/meta').remove(), mode);
    return true;
  }catch(e){
    console.log('       [경고] ' + mode + ' meta 정리 확인 중 오류(안전을 위해 삭제는 건너뜀): ' + e);
    return false;
  }
}

/* ---------- 전제조건: 영구 방이 비어 있는지 확인 ---------- */
// nunus/chain, nunus/chosung 은 배포 후 실제 플레이어들이 쓰는 영구 방이다. 우리가
// 시작하기 전에 이미 뭔가 들어있다면(다른 세션이 진행 중이라면) 절대 건드리지 않고
// 중단한다 — 이 스크립트의 정리 단계는 "시작 전엔 비어 있었다"는 전제 위에서만 안전하다.
async function preflightEmpty(browser){
  const ctx = await browser.createBrowserContext();
  const p = await ctx.newPage();
  await p.goto(URL_, { waitUntil: 'networkidle2' });
  const state = await p.evaluate(() => fbInit().then(() =>
    Promise.all(['chain', 'chosung'].map(m =>
      new Promise((res) => firebase.database().ref('nunus/' + m).once('value', s => res(s.val())))
    ))
  ));
  await ctx.close();
  return { chain: state[0], chosung: state[1] };
}

/* ================= 메인 ================= */
const browser = await puppeteer.launch({ headless: true, args: [
  '--no-sandbox',
  // 공유 절대시각(setTimeout) 레이스가 성립하려면 백그라운드/렌더러 스로틀링 없이
  // 타이머가 제때 발화해야 한다.
  '--disable-background-timer-throttling',
  '--disable-renderer-backgrounding'
] });
const gameIdsUsed = new Set();
const chosungGameIdsUsed = new Set();
let A = null, B = null;   // { page, ctx, nick } — 끝말잇기(nunus/chain)
let C = null, D = null;   // { page, ctx, nick } — 초성게임(nunus/chosung)

try{
  info('전제조건 확인: nunus/chain, nunus/chosung 이 비어 있어야 함 (실 플레이어 방 보호)');
  const pre = await preflightEmpty(browser);
  if (pre.chain !== null || pre.chosung !== null){
    report('전제조건: 영구 방이 비어 있음', false,
      '이미 데이터가 있어 중단함(다른 세션이 쓰고 있을 수 있음) — chain=' +
      JSON.stringify(pre.chain) + ' chosung=' + JSON.stringify(pre.chosung));
    process.exitCode = 1;
    await browser.close();
    process.exit(1);
  }
  report('전제조건: 영구 방이 비어 있음', true);

  A = await join(browser, '가가', 'chain');
  B = await join(browser, '나나', 'chain');
  await installTxnHook(A.page); await installTxnHook(B.page);
  await installSwapWatch(A.page); await installSwapWatch(B.page);
  await sleep(800);

  const uidA = await A.page.evaluate(() => MG.uid);
  const uidB = await B.page.evaluate(() => MG.uid);
  report('두 클라이언트가 서로 다른 uid로 로그인함', uidA !== uidB, uidA + ' vs ' + uidB);
  gameIdsUsed.add(await A.page.evaluate(() => MG.meta.gameId));

  /* 1) 같은 문제를 보는지 */
  {
    const nA = await need(A.page), nB = await need(B.page);
    report('두 브라우저가 같은 문제를 봄', nA === nB, nA + ' vs ' + nB);
  }

  /* 2) GAP 1 — 진짜 경합하는 동시 제출을 5번, 재시도 포함 (끝말잇기) */
  const raceResults = [];
  let attempts = 0;
  const MAX_ATTEMPTS = 20;
  let timedFirstAdvance = false;

  while (raceResults.length < 5 && attempts < MAX_ATTEMPTS){
    attempts++;
    // 라운드가 다 돌아 'over'가 됐으면 재시작해서 계속 시도할 수 있게 한다.
    let phase = await A.page.evaluate(() => MG.meta.phase);
    if (phase === 'over'){
      await A.page.evaluate(() => restartMulti());
      await waitPhase(A.page, 'play');
      await waitPhase(B.page, 'play');
      gameIdsUsed.add(await A.page.evaluate(() => MG.meta.gameId));
    } else {
      await waitPhase(A.page, 'play');
      await waitPhase(B.page, 'play');
    }

    const needBefore = await need(A.page);
    const needBeforeB = await need(B.page);
    if (needBefore !== needBeforeB){
      info('시도 ' + attempts + ': 두 쪽 need 불일치(' + needBefore + '/' + needBeforeB + '), 재시도');
      await sleep(300);
      continue;
    }
    const chainArr = await A.page.evaluate(() => Object.values((MG.meta && MG.meta.chain) || {}));
    const word = await A.page.evaluate((n, u) => findHint(n, WORD_ALL, u), needBefore, chainArr);
    if (!word){
      // 이을 낱말이 없는 문제다 — 앱에서는 호스트가 라운드를 넘길 때 게임을 끝낸다.
      // 여기서는 레이스 표본을 계속 모으려고 방을 끝내고 위쪽 재시작 경로로 보낸다.
      info('시도 ' + attempts + ': "' + needBefore + '"로 이을 낱말이 없어 방을 끝내고 재시작');
      await A.page.evaluate(() => MG.ref.child('meta').transaction(cur => {
        if(!cur) return;
        cur.phase = 'over';
        return cur;
      }));
      await waitPhase(A.page, 'over', 5000).catch(() => {});
      continue;
    }

    const gameId = await A.page.evaluate(() => MG.meta.gameId);
    const scoresBefore = await readScores(A.page, gameId, 'chain');
    const roundBefore = await round(A.page);
    await clearTxnLog(A.page); await clearTxnLog(B.page);

    const t = Date.now() + 1200;
    await Promise.all([A.page, B.page].map(p => scheduleTaggedSubmit(p, word, t)));

    // 두 쪽 다 트랜잭션 로그가 찍힐 때까지 기다림(최대 t+4s)
    let logA = [], logB = [];
    while (Date.now() < t + 4000){
      logA = await metaTxnLog(A.page);
      logB = await metaTxnLog(B.page);
      if (logA.length && logB.length) break;
      await sleep(150);
    }

    if (!logA.length || !logB.length){
      info('시도 ' + attempts + ': 무효 — 한쪽이 트랜잭션을 아예 안 걺(phase 가드에서 샘) A=' +
        logA.length + ' B=' + logB.length + ' — 재시도');
      await waitPhase(A.page, 'reveal', 3000).catch(() => {});
      await sleep(REVEAL_MS + 1200);
      continue;
    }

    const committedA = logA.some(e => e.committed);
    const committedB = logB.some(e => e.committed);

    // 라운드 진행 타이밍의 기준점 — reveal이 실제로 관측된 시각. 이후 sleep/readScores로
    // 흘러간 ~850ms를 기준점으로 오인해 여유 150ms만 남기고 FAIL내는 일을 막는다.
    const revealAt = await waitFor(A.page, () => MG.meta && MG.meta.phase === 'reveal', [],
      { timeout: 4000, label: 'phase=reveal(라운드 진행 타이밍 기준점)' })
      .then(() => Date.now()).catch(() => null);

    await sleep(600);
    const scoresAfter = await readScores(A.page, gameId, 'chain');
    const deltaA = (scoresAfter[uidA] || 0) - (scoresBefore[uidA] || 0);
    const deltaB = (scoresAfter[uidB] || 0) - (scoresBefore[uidB] || 0);

    if (committedA === committedB){
      // 둘 다 true면 트랜잭션 설계가 깨진 것 — 진짜 실패로 보고. 둘 다 false면 이례적이나
      // 마찬가지로 실패로 보고한다(치명적일 수 있으므로 조용히 재시도하지 않는다).
      report('시도 ' + attempts + ': 레이스에서 정확히 한 명만 커밋됨', false,
        'committedA=' + committedA + ' committedB=' + committedB + ' (둘 다 같은 값 — 트랜잭션 게이트 이상)');
    } else {
      const winner = committedA ? A.nick : B.nick;
      raceResults.push({ idx: raceResults.length + 1, winner, committedA, committedB, deltaA, deltaB });
      report('레이스 ' + raceResults.length + '/5: 진짜로 경합해서 정확히 한 명만 커밋됨', true,
        '승자=' + winner + ' committedA=' + committedA + ' committedB=' + committedB);
      const okScore = (deltaA === 1 && deltaB === 0) || (deltaA === 0 && deltaB === 1);
      report('레이스 ' + raceResults.length + '/5: 점수는 승자만 정확히 +1', okScore,
        'deltaA=' + deltaA + ' deltaB=' + deltaB);
    }

    // reveal 후 약 3초 뒤 라운드 진행 확인 (첫 유효 레이스에서만 타이밍까지 체크)
    const advanceStart = revealAt || Date.now();
    await waitFor(A.page, () => MG.meta && (MG.meta.phase === 'play' || MG.meta.phase === 'over'), [],
      { timeout: REVEAL_MS + 3000, label: '다음 라운드 진행(A)' }).catch(() => {});
    await waitFor(B.page, () => MG.meta && (MG.meta.phase === 'play' || MG.meta.phase === 'over'), [],
      { timeout: REVEAL_MS + 3000, label: '다음 라운드 진행(B)' }).catch(() => {});
    const elapsed = Date.now() - advanceStart;
    const roundAfterA = await round(A.page), roundAfterB = await round(B.page);
    if (!timedFirstAdvance){
      timedFirstAdvance = true;
      const withinWindow = elapsed >= 2000 && elapsed <= 8000;
      report('reveal 후 약 3초 뒤 양쪽 다 다음 라운드로 진행', withinWindow && roundAfterA === roundAfterB,
        '경과=' + elapsed + 'ms(reveal 관측 기준' + (revealAt ? '' : ' — 관측 실패, Date.now() 대체') +
        ') 이전라운드=' + roundBefore + ' A=' + roundAfterA + ' B=' + roundAfterB);
    } else {
      report('라운드 ' + attempts + ': 양쪽이 같은 라운드를 봄', roundAfterA === roundAfterB,
        'A=' + roundAfterA + ' B=' + roundAfterB);
    }
  }

  if (raceResults.length < 5){
    report('5회의 유효한(진짜 경합한) 레이스 수집', false,
      raceResults.length + '/5만 수집됨 (시도 ' + attempts + '회)');
  } else {
    report('5회의 유효한(진짜 경합한) 레이스 수집', true, attempts + '번 시도해서 5번 성공');
  }
  console.log('       레이스 결과 5회:');
  raceResults.forEach(r => console.log('         #' + r.idx + ' 승자=' + r.winner +
    ' committedA=' + r.committedA + ' committedB=' + r.committedB));
  if (raceResults.length === 5){
    const allSameWinner = raceResults.every(r => r.winner === raceResults[0].winner);
    if (allSameWinner){
      console.log('       [경고] 5번 다 ' + raceResults[0].winner + '가 이겼다 — 표본이 작아 우연일 수' +
        ' 있지만, 여전히 한쪽으로 치우친 경합이라는 신호이지 "성공의 증거"는 아니다.');
    } else {
      info('승자가 5회 동안 갈렸음 — 편향 신호 없음: ' + raceResults.map(r => r.winner).join(', '));
    }
  }

  /* 2.5) GAP 1 — 초성게임 레이스: submitMulti의 winner 가드(`|| cur.winner`)는 끝말잇기에서는
        cur.used/cur.need라는 독립 게이트 덕에 없어도 안 걸린다. 초성은 pattern이 승리로는
        안 바뀌므로(라운드 진행 때만 바뀜) 그 가드가 유일한 방어선이다 — 여기서 따로 검증한다. */
  const chosungRaceResults = [];
  {
    C = await join(browser, '다다', 'chosung');
    D = await join(browser, '라라', 'chosung');
    await installTxnHook(C.page); await installTxnHook(D.page);
    await sleep(800);

    const uidC = await C.page.evaluate(() => MG.uid);
    const uidD = await D.page.evaluate(() => MG.uid);
    report('초성게임: 두 클라이언트가 서로 다른 uid로 로그인함', uidC !== uidD, uidC + ' vs ' + uidD);
    chosungGameIdsUsed.add(await C.page.evaluate(() => MG.meta.gameId));

    {
      const patC = await C.page.evaluate(() => MG.meta.pattern);
      const patD = await D.page.evaluate(() => MG.meta.pattern);
      report('초성게임: 두 브라우저가 같은 패턴을 봄', patC === patD, patC + ' vs ' + patD);
    }

    let chosungAttempts = 0;
    const MAX_CHOSUNG_ATTEMPTS = 15;
    while (chosungRaceResults.length < 2 && chosungAttempts < MAX_CHOSUNG_ATTEMPTS){
      chosungAttempts++;
      let phase = await C.page.evaluate(() => MG.meta.phase);
      if (phase === 'over'){
        await C.page.evaluate(() => restartMulti());
        await waitPhase(C.page, 'play');
        await waitPhase(D.page, 'play');
        chosungGameIdsUsed.add(await C.page.evaluate(() => MG.meta.gameId));
      } else {
        await waitPhase(C.page, 'play');
        await waitPhase(D.page, 'play');
      }

      const patC = await C.page.evaluate(() => MG.meta.pattern);
      const patD = await D.page.evaluate(() => MG.meta.pattern);
      if (patC !== patD){
        info('초성 시도 ' + chosungAttempts + ': 두 쪽 pattern 불일치(' + patC + '/' + patD + '), 재시도');
        await sleep(300);
        continue;
      }

      const candidates = await C.page.evaluate((p) => (chosungIndex().map.get(p) || []), patC);
      const word = candidates[0];
      if (!word) throw new Error('패턴 "' + patC + '"에 대한 사전 후보가 없음 — 사전 문제, 동시성 문제 아님');

      const gameId = await C.page.evaluate(() => MG.meta.gameId);
      const scoresBefore = await readScores(C.page, gameId, 'chosung');
      await clearTxnLog(C.page); await clearTxnLog(D.page);

      const t = Date.now() + 1200;
      await Promise.all([C.page, D.page].map(p => scheduleTaggedSubmit(p, word, t)));

      let logC = [], logD = [];
      while (Date.now() < t + 4000){
        logC = await metaTxnLog(C.page);
        logD = await metaTxnLog(D.page);
        if (logC.length && logD.length) break;
        await sleep(150);
      }

      if (!logC.length || !logD.length){
        info('초성 시도 ' + chosungAttempts + ': 무효 — 한쪽이 트랜잭션을 아예 안 걺 C=' +
          logC.length + ' D=' + logD.length + ' — 재시도');
        await waitPhase(C.page, 'reveal', 3000).catch(() => {});
        await sleep(REVEAL_MS + 1200);
        continue;
      }

      const committedC = logC.some(e => e.committed);
      const committedD = logD.some(e => e.committed);

      await sleep(600);
      const scoresAfter = await readScores(C.page, gameId, 'chosung');
      const deltaC = (scoresAfter[uidC] || 0) - (scoresBefore[uidC] || 0);
      const deltaD = (scoresAfter[uidD] || 0) - (scoresBefore[uidD] || 0);

      if (committedC === committedD){
        report('초성 시도 ' + chosungAttempts + ': 레이스에서 정확히 한 명만 커밋됨', false,
          'committedC=' + committedC + ' committedD=' + committedD +
          ' (둘 다 같은 값 — 초성은 pattern이 승리로 안 바뀌므로 winner 가드가 유일한 방어선인데 그게 안 걸림)');
      } else {
        const winner = committedC ? C.nick : D.nick;
        chosungRaceResults.push({ idx: chosungRaceResults.length + 1, winner, committedC, committedD, deltaC, deltaD });
        report('초성 레이스 ' + chosungRaceResults.length + '/2: 진짜로 경합해서 정확히 한 명만 커밋됨', true,
          '승자=' + winner + ' committedC=' + committedC + ' committedD=' + committedD);
        const okScore = (deltaC === 1 && deltaD === 0) || (deltaC === 0 && deltaD === 1);
        report('초성 레이스 ' + chosungRaceResults.length + '/2: 점수는 승자만 정확히 +1', okScore,
          'deltaC=' + deltaC + ' deltaD=' + deltaD);
      }

      await waitFor(C.page, () => MG.meta && (MG.meta.phase === 'play' || MG.meta.phase === 'over'), [],
        { timeout: REVEAL_MS + 3000, label: '다음 라운드 진행(C)' }).catch(() => {});
      await waitFor(D.page, () => MG.meta && (MG.meta.phase === 'play' || MG.meta.phase === 'over'), [],
        { timeout: REVEAL_MS + 3000, label: '다음 라운드 진행(D)' }).catch(() => {});
    }

    if (chosungRaceResults.length < 2){
      report('초성게임 2회의 유효한(진짜 경합한) 레이스 수집', false,
        chosungRaceResults.length + '/2만 수집됨 (시도 ' + chosungAttempts + '회)');
    } else {
      report('초성게임 2회의 유효한(진짜 경합한) 레이스 수집', true, chosungAttempts + '번 시도해서 2번 성공');
    }
    console.log('       초성 레이스 결과 2회:');
    chosungRaceResults.forEach(r => console.log('         #' + r.idx + ' 승자=' + r.winner +
      ' committedC=' + r.committedC + ' committedD=' + r.committedD));
  }

  /* 3) GAP 2 — 재연결: idle 상태에서 소켓을 진짜 끊었다가 복구, 버튼이 실제로
        사라졌었는지 증명한 뒤에만 "돌아왔고 클릭 가능하다"를 확인한다.
        같은 김에 교체 요청을 걸어 20초 침묵 → 묵시적 동의로 라운드/점수는 그대로,
        문제만 바뀌는지도 함께 확인한다(끝말잇기 교체 재출제). */
  {
    await waitFor(A.page, () => MG.meta && MG.meta.phase === 'play' &&
      !MG.meta.swap && (!MG.meta.swapCool || Date.now() > MG.meta.swapCool), [],
      { timeout: 8000, label: 'idle 상태(교체 없음, 쿨다운 없음)' });

    const before = await visibleClickable(A.page, 'multi-swap-ask');
    report('오프라인 전: 교체 요청 버튼이 idle 상태로 보임', before.exists && before.visible && !before.disabled,
      JSON.stringify(before));

    // 오프라인 구간 동안 앱이 조용히 에러를 던지지 않는지 감시한다 — 트랩이 앱을 깨면
    // (Finding 1의 원래 버그처럼) 여기서 잡힌다.
    const pageErrors = [];
    const onPageError = (err) => pageErrors.push(String((err && err.message) || err));
    A.page.on('pageerror', onPageError);

    await clearSwapWatch(A.page);
    await A.page.setOfflineMode(true);
    await waitFor(A.page, () => MG.online === false, [], { timeout: 8000, label: 'MG.online===false' });

    // 오프라인 핸들러가 실제로 UI를 잠그려고 "시도"했는지(빈 문자열로 SET)를 증거로 확인.
    let clearedSeen = false;
    for (let i = 0; i < 15; i++){
      clearedSeen = await swapWasClearedToEmpty(A.page);
      if (clearedSeen) break;
      await sleep(150);
    }
    report('오프라인 동안 교체 버튼이 실제로 사라졌다(빈 문자열로 SET됨을 관측)', clearedSeen,
      clearedSeen ? '#multi-swap innerHTML이 오프라인 중 \'\'로 SET됨을 확인' :
        '오프라인 중 단 한 번도 비워지지 않음 — 연결 끊김 잠금이 걸리지 않는 것으로 보임');

    // "돌아왔다"와 "애초에 안 없어졌다"를 구분하는 진짜 관측. 여기서 Node 쪽에서
    // visibleClickable을 폴링해 '없어짐'을 잡으려는 시도는 실측 결과 성립하지 않는다 —
    // 실제 앱에서는 disconnect 핸들러가 지운 바로 그 동기 구간 안에서(같은 이벤트 배치로)
    // presence 리스너의 무관한 renderMulti() 호출이 거의 즉시(＜2ms) 버튼을 다시 그려서,
    // Node→브라우저 왕복이 있는 어떤 폴링도 "없어진 순간"을 절대 못 잡는다(직접 확인함:
    // 같은 브라우저 하나만 띄워도 재현되고, 스택트레이스가 onPresence의 renderMulti()
    // 호출을 정확히 가리킨다 — 이건 이 테스트가 고치라고 지시받은 앱 버그가 아니라 그냥
    // 원래 그런 타이밍이다). 그래서 실제 클리어가 "성립했었다"는 증거는 세터가 실제
    // 대입을 마친 바로 그 동기 실행 안에서(다른 어떤 렌더도 끼어들 수 없는 지점에서)
    // 버튼이 DOM에서 없어졌는지를 확인해서 남긴다(installSwapWatch의 reallyGone) —
    // desc가 잘못 잡혀 세터가 던지면(원래 버그) 실제 대입이 실패해 reallyGone은 절대
    // true가 될 수 없으므로, "SET을 시도했다"는 로그만으로는 못 잡는 vacuity를 잡는다.
    let reallyGone = false;
    for (let i = 0; i < 15; i++){
      reallyGone = await swapReallyWentEmpty(A.page);
      if (reallyGone) break;
      await sleep(150);
    }
    report('오프라인 동안: 버튼이 실제로 DOM에서 사라진 순간이 관측됨(SET 시도가 아니라 진짜 제거)',
      reallyGone, reallyGone ?
        'SET 직후 동기 구간에서 #multi-swap-ask가 실제로 없었음을 확인' :
        '단 한 번도 실제로 제거되지 않음 — SET은 시도됐어도 원래 세터가 안 불렸을 수 있음(원래 버그와 동일 증상)');

    await A.page.setOfflineMode(false);
    await waitFor(A.page, () => MG.online === true, [], { timeout: 10000, label: 'MG.online===true' });
    await sleep(700);   // 재연결 렌더가 자리잡을 시간

    A.page.off('pageerror', onPageError);
    report('오프라인 구간에서 페이지가 에러 없이 동작함(트랩이 앱을 깨지 않았음)',
      pageErrors.length === 0, pageErrors.length ? pageErrors.join(' | ') : '에러 없음');

    const after = await visibleClickable(A.page, 'multi-swap-ask');
    report('재연결 후: 교체 요청 버튼이 다시 보이고 클릭 가능함', after.exists && after.visible && !after.disabled,
      JSON.stringify(after));

    if (after.exists && after.visible && !after.disabled){
      const roundBefore = await round(A.page);
      const gameId = await A.page.evaluate(() => MG.meta.gameId);
      const scoresBefore = await readScores(A.page, gameId, 'chain');
      const needBefore = await need(A.page);

      await A.page.click('#multi-swap-ask');

      // "상대가 보는가"는 흔들리는 버블 문구 대신 동기화된 meta 데이터로 확인한다
      // (부탁 직후 요청자 자신의 auto-vote presence 쓰기가 뒤따라 renderMulti()를
      //  다시 태우는데, 그 경로에서 문구가 원래 안내문으로 되돌아가는 걸 실제로
      //  관측했다 — UI 문구는 이 타이밍에 신뢰할 수 없어서 데이터 레벨로 확인함).
      const swapSeenByB = await waitFor(B.page, () => !!(MG.meta && MG.meta.swap), [],
        { timeout: 5000, label: 'B가 교체 요청을 인지함' }).catch(() => false);
      report('클릭한 교체 요청이 상대(B)에게 동기화됨', !!swapSeenByB,
        swapSeenByB ? 'B의 MG.meta.swap이 채워짐' : 'B가 5초 내에 교체 요청을 못 봄');

      // 아무도 투표하지 않고 20초 침묵 → 묵시적 동의로 재출제돼야 함(round/score는 불변)
      info('B가 침묵 — 묵시적 동의까지 ' + Math.ceil(SWAP_VOTE_MS / 1000) + '초 대기');
      await sleep(SWAP_VOTE_MS + 2000);

      const needAfter = await need(A.page);
      const roundAfter = await round(A.page);
      const scoresAfter = await readScores(A.page, gameId, 'chain');
      const scoresIntact = JSON.stringify(scoresBefore) === JSON.stringify(scoresAfter);
      report('20초 침묵 후 묵시적 동의로 문제가 바뀜(끝말잇기 재출제)', needAfter !== needBefore,
        needBefore + ' → ' + needAfter);
      report('교체 후에도 라운드/점수는 그대로', roundAfter === roundBefore && scoresIntact,
        '라운드 ' + roundBefore + '→' + roundAfter + ', 점수동일=' + scoresIntact);
    } else {
      report('클릭한 교체 요청이 상대(B)에게 동기화됨', false, '버튼이 클릭 불가능해 시도 자체를 못함');
      report('20초 침묵 후 묵시적 동의로 문제가 바뀜(끝말잇기 재출제)', false, '위와 동일한 이유로 건너뜀');
      report('교체 후에도 라운드/점수는 그대로', false, '위와 동일한 이유로 건너뜀');
    }
  }

  /* 3.5) 이름 변경 — 편집 중 게임 입력이 잠기고, 상대에게 새 이름이 전파된다 */
  {
    info('이름 변경: A가 라운드 진행 중 칩을 탭해 이름을 바꾼다');
    await waitPhase(A.page, 'play', 8000).catch(() => {});

    const uidA = await A.page.evaluate(() => MG.uid);
    const oldName = await A.page.evaluate(() => MG.name);

    // 내 칩(.pchip.me)을 실제로 클릭한다 — 진입점 자체가 동작하는지 보기 위해
    // openNickEdit()를 직접 부르지 않는다.
    await A.page.click('.pchip.me');
    const opened = await waitFor(A.page,
      () => !document.getElementById('multi-nick').classList.contains('hidden'),
      [], { timeout: 3000, label: '이름 입력창이 열림' }).catch(() => false);
    report('내 칩을 탭하면 이름 입력창이 열림', !!opened);

    const prefilled = await A.page.$eval('#multi-nick-input', e => e.value);
    report('입력창에 현재 이름이 미리 채워짐', prefilled === oldName, prefilled + ' vs ' + oldName);

    // 게이팅 검증: 편집 중에 라운드가 넘어가도 게임 입력창이 되살아나면 안 된다.
    //
    // 그냥 기다리기만 하면 renderMulti를 부를 이벤트가 없어서 게이팅이 없어도 통과해
    // 버린다(리스너가 안 불리면 입력창을 되살릴 기회 자체가 없다). 그래서 B가 실제로
    // 정답을 제출해 meta를 바꾸고, A의 meta 리스너 → renderMulti → play 분기를
    // 확실히 태운 뒤에 확인한다.
    const roundBeforeEdit = await round(A.page);
    const needForB = await need(B.page);
    const usedForB = await B.page.evaluate(() => Object.values((MG.meta && MG.meta.chain) || {}));
    const wordForB = await B.page.evaluate((nn, u) => findHint(nn, WORD_ALL, u), needForB, usedForB);
    if (wordForB){
      await B.page.type('#multi-input', wordForB);
      await B.page.click('#multi-submit');
      // reveal(3초) → 다음 라운드까지 기다린다. A는 그동안 편집창을 연 채로 있다.
      await waitFor(A.page, (r) => String(MG.meta.round) !== r && MG.meta.phase === 'play',
        [roundBeforeEdit], { timeout: 12000, label: 'A가 다음 라운드 play를 봄' });
    } else {
      info('경고: B가 이을 낱말을 못 찾아 라운드 전환 없이 검사한다(게이팅 검증이 약해짐)');
      await sleep(3500);
    }

    const lockedDuringEdit = await A.page.$eval('#multi-input', e => e.disabled);
    report('편집 중에는 게임 입력창이 잠긴 채 유지됨(renderMulti가 되살리지 못함)',
      lockedDuringEdit === true, 'disabled=' + lockedDuringEdit);
    const stillOpen = await A.page.evaluate(
      () => !document.getElementById('multi-nick').classList.contains('hidden'));
    report('라운드가 넘어가도 편집창은 열린 채 유지됨', stillOpen === true);

    // 이름 변경
    const newName = '라라';
    await A.page.$eval('#multi-nick-input', e => { e.value = ''; });
    await A.page.type('#multi-nick-input', newName);
    await A.page.click('#multi-nick-ok');

    const closed = await waitFor(A.page,
      () => document.getElementById('multi-nick').classList.contains('hidden'),
      [], { timeout: 3000, label: '이름 입력창이 닫힘' }).catch(() => false);
    report('바꾸기를 누르면 입력창이 닫힘', !!closed);

    // 상대에게 전파됐는지는 UI 문구가 아니라 동기화된 presence 데이터로 확인한다.
    const seenByB = await waitFor(B.page,
      (u, n) => !!(MG.members || []).find(m => m.uid === u && m.name === n),
      [uidA, newName], { timeout: 5000, label: 'B가 새 이름을 봄' }).catch(() => false);
    report('바뀐 이름이 상대(B)에게 전파됨', !!seenByB,
      seenByB ? oldName + ' → ' + newName : 'B가 5초 내에 새 이름을 못 봄');

    const chipText = await A.page.$eval('.pchip.me', e => e.textContent);
    report('내 칩에 새 이름이 보임', chipText.includes(newName), chipText.trim());

    // ts가 살아 있어야 한다 — update가 아니라 set을 썼다면 여기서 사라진다.
    const tsAlive = await A.page.evaluate((u) => new Promise(res =>
      firebase.database().ref('nunus/chain/presence/' + u).once('value',
        s => res(!!(s.val() && s.val().ts)))), uidA);
    report('이름만 바뀌고 presence의 ts는 보존됨', tsAlive === true);

    // 편집을 닫은 뒤 실제로 다시 제출할 수 있어야 한다.
    await waitPhase(A.page, 'play', 8000).catch(() => {});
    const unlocked = await waitFor(A.page,
      () => document.getElementById('multi-input').disabled === false,
      [], { timeout: 6000, label: '게임 입력창 재활성화' }).catch(() => false);
    report('편집을 닫으면 게임 입력창이 다시 열림', !!unlocked);

    const n = await need(A.page);
    const chainArr = await A.page.evaluate(() => Object.values((MG.meta && MG.meta.chain) || {}));
    const word = await A.page.evaluate((nn, u) => findHint(nn, WORD_ALL, u), n, chainArr);
    if (word){
      await A.page.type('#multi-input', word);
      await A.page.click('#multi-submit');
      await sleep(1200);
      const b = await bub(A.page);
      report('이름 변경 후에도 실제 제출이 성공함', b.includes('이겼어요'), b.slice(0, 30));
    } else {
      report('이름 변경 후에도 실제 제출이 성공함', false, '이을 낱말을 못 찾음');
    }

    // 다음 블록(호스트 승계)이 nick으로 A를 식별하지 않도록 최신 값을 반영해 둔다.
    A.nick = newName;
    gameIdsUsed.add(await A.page.evaluate(() => MG.meta.gameId));
  }

  /* 3.6) 편집 폼이 열린 채로 시작된 교체 투표 — 폼을 닫아도 투표 잠금이 살아있어야 한다 */
  {
    info('편집 폼을 연 뒤에 교체 투표가 시작되면, 폼을 닫을 때 잠금이 되살아나는지 확인');
    await waitPhase(A.page, 'play', 8000).catch(() => {});
    await waitPhase(B.page, 'play', 8000).catch(() => {});

    // 진짜 클릭으로 편집 폼을 연다 — 위임 리스너 경유로도 진입점이 살아있는지 재확인한다.
    await A.page.click('.pchip.me');
    const editOpened = await waitFor(A.page,
      () => !document.getElementById('multi-nick').classList.contains('hidden'),
      [], { timeout: 3000, label: '이름 입력창이 열림(투표 잠금 시나리오)' }).catch(() => false);
    report('교체 투표 잠금 시나리오: 칩 탭으로 편집 폼이 열림', !!editOpened);

    // 편집 폼이 열려 있는 동안 B가 교체 투표를 시작한다 — UI를 거치지 않고 직접 호출한다.
    await B.page.evaluate(() => askSwap());

    const swapSeenWhileEditing = await waitFor(A.page, () => !!(MG.meta && MG.meta.swap), [],
      { timeout: 5000, label: '편집 중인 A가 교체 투표를 인지함' }).catch(() => false);
    report('편집 폼이 열린 채로도 A가 교체 투표를 인지함', !!swapSeenWhileEditing);

    // 이름을 바꾸고 폼을 닫는다 — closeNick()이 swapSig를 지워야 renderSwapUI가
    // "구조 안 바뀜"으로 착각해 잠금을 되살리지 못하는 사고가 없다(이 리셋이 없으면,
    // 편집 중 이미 한 번 그려진 voter 서명과 지금 서명이 같아 보여 재렌더를 건너뛰고
    // 위쪽 phase==='play' 분기가 켜놓은 입력이 그대로 살아남는다).
    await A.page.$eval('#multi-nick-input', e => { e.value = ''; });
    await A.page.type('#multi-nick-input', '모모');
    await A.page.click('#multi-nick-ok');

    const editClosed = await waitFor(A.page,
      () => document.getElementById('multi-nick').classList.contains('hidden'),
      [], { timeout: 3000, label: '이름 입력창이 닫힘(투표 잠금 시나리오)' }).catch(() => false);
    report('투표 중에도 바꾸기를 누르면 편집 폼이 닫힘', !!editClosed);

    const lockedAfterClose = await A.page.$eval('#multi-input', e => e.disabled);
    report('편집 폼을 닫아도 진행 중인 교체 투표가 게임 입력을 계속 잠금(swapSig 리셋 검증)',
      lockedAfterClose === true, 'disabled=' + lockedAfterClose);

    // 뒷 블록(호스트 승계)이 깨끗한 상태에서 시작하도록 투표를 정리한다 — A가 명시적으로
    // 거부해 'cancel'로 즉시 끝낸다(20초 묵시적 동의를 기다리지 않는다).
    await A.page.evaluate(() => voteSwap(false));
    await waitFor(A.page, () => !(MG.meta && MG.meta.swap), [],
      { timeout: 5000, label: '투표 정리(거부) 반영' }).catch(() => {});

    A.nick = '모모';
    gameIdsUsed.add(await A.page.evaluate(() => MG.meta.gameId));
  }

  /* 3.7) 투표 중에는 presence 이벤트가 와도 입력이 풀리지 않는다 */
  {
    info('투표 잠금: B가 교체 투표를 열고, 그동안 A가 presence 이벤트를 일으킨다');
    await waitPhase(A.page, 'play', 8000).catch(() => {});

    // 직전 시나리오의 쿨다운이 남아 있으면 askSwap이 조용히 거부된다 — 풀릴 때까지 기다린다.
    await waitFor(B.page, () => {
      const m = MG && MG.meta;
      return !!m && m.phase === 'play' && !m.swap && !(m.swapCool && Date.now() < m.swapCool);
    }, [], { timeout: 40000, label: 'B가 교체 요청 가능한 상태' });

    await B.page.evaluate(() => askSwap());
    const sawVote = await waitFor(A.page, () => !!(MG.meta && MG.meta.swap), [],
      { timeout: 5000, label: 'A가 투표를 인지함' }).catch(() => false);
    report('투표 잠금: A가 교체 투표를 인지함', !!sawVote);

    const lockedOnVote = await A.page.$eval('#multi-input', e => e.disabled);
    report('투표 잠금: 투표가 열리면 A의 입력이 잠김', lockedOnVote === true,
      'disabled=' + lockedOnVote);

    // 결함의 방아쇠: 투표가 진행되는 동안 presence 쓰기를 일으켜 A의 renderMulti를 태운다.
    // 예전에는 play 분기가 meta.swap을 보지 않고 입력을 되살렸고, renderSwapUI는 서명이
    // 안 바뀌었다며 다시 잠그지 않아, 남은 투표 시간 내내 A만 답할 수 있었다.
    await A.page.evaluate(() => MG.ref.child('presence/' + MG.uid)
      .update({ name: MG.name + '!' }));
    await waitFor(A.page, () => (MG.members || []).some(x => /!$/.test(x.name || '')), [],
      { timeout: 5000, label: 'A의 presence 갱신이 되돌아옴' });
    await sleep(400);   // renderMulti/renderSwapUI가 이벤트를 처리할 여유

    const stillLocked = await A.page.$eval('#multi-input', e => e.disabled);
    const voteStillOpen = await A.page.evaluate(() => !!(MG.meta && MG.meta.swap));
    report('투표 중 presence 이벤트가 와도 입력이 잠긴 채 유지됨',
      stillLocked === true && voteStillOpen === true,
      'disabled=' + stillLocked + ' voteOpen=' + voteStillOpen);

    // 뒷정리: 이름을 되돌리고 투표를 접어 다음 블록에 영향을 주지 않게 한다.
    await A.page.evaluate(() => MG.ref.child('presence/' + MG.uid)
      .update({ name: MG.name }));
    await B.page.evaluate(() => MG.ref.child('meta/swap').remove()).catch(() => {});
    await waitFor(A.page, () => !(MG.meta && MG.meta.swap), [],
      { timeout: 5000, label: '투표가 정리됨' }).catch(() => false);
    await sleep(600);
  }

  /* 3.8) 막다른 낱말 — 같이하기는 자동으로 끝내지 않는다(형평성). 탈출구는 교체 투표다. */
  {
    info('막다른 낱말: 이을 낱말이 없는 need를 심어도 게임이 끝나지 않아야 한다');
    await waitPhase(A.page, 'play', 8000).catch(() => {});

    // 사전에 없는 첫 글자를 고른다 — 후보 중 findHint가 null을 주는 것.
    const deadNeed = await A.page.evaluate(() =>
      ['슭','뷁','쭑','촽','옭','릙'].find(c => !findHint(c, WORD_ALL, [])) || null);
    report('막다른 낱말: 이을 수 없는 글자를 찾음', !!deadNeed, String(deadNeed));

    if (deadNeed){
      // 호스트가 라운드를 넘기는 시점(reveal → play)에 판정하므로 reveal로 만들어 태운다.
      // 라운드는 1로 못박아 '라운드 소진' 종료와 헷갈리지 않게 한다.
      await A.page.evaluate((n) => MG.ref.child('meta').transaction(cur => {
        if(!cur) return;
        cur.need = n; cur.phase = 'reveal'; cur.round = 1;
        cur.winner = MG.uid; cur.winnerName = MG.name; cur.answer = '테스트';
        return cur;
      }), deadNeed);

      // 호스트의 hostTick이 reveal 뒤 라운드를 넘긴다. 자동 종료를 없앴으므로 게임이
      // 끝나지 않고(over 아님) 다음 라운드로 진행돼야 한다 — need는 여전히 막힌 글자다.
      const advanced = await waitFor(A.page, (n) =>
        MG.meta && MG.meta.phase === 'play' && MG.meta.round === 2 && MG.meta.need === n,
        [deadNeed], { timeout: 12000, label: 'A가 다음 라운드 play로 진행' }).catch(() => false);
      report('막다른 낱말: 게임이 끝나지 않고 다음 라운드로 진행됨', !!advanced);

      const notOverA = await A.page.evaluate(() => MG.meta && MG.meta.phase !== 'over');
      report('막다른 낱말: A의 게임이 over로 끝나지 않음', notOverA === true);

      const notOverB = await waitFor(B.page, () =>
        MG.meta && MG.meta.phase === 'play' && MG.meta.round === 2, [],
        { timeout: 8000, label: 'B도 다음 라운드 play를 봄' }).catch(() => false);
      report('막다른 낱말: 상대(B)의 게임도 끝나지 않음', !!notOverB);

      // 탈출구는 교체 투표다 — 막힌 상태에서도 '문제 교체 요청' 버튼이 있어야 한다.
      const hasSwapBtn = await waitFor(A.page,
        () => !!document.getElementById('multi-swap-ask'), [],
        { timeout: 5000, label: '교체 요청 버튼이 보임' }).catch(() => false);
      report('막다른 낱말: 탈출구인 교체 요청 버튼이 있음', !!hasSwapBtn);

      // 뒷정리: 다음 블록(호스트 승계)이 이을 수 있는 문제를 필요로 하므로,
      // 방을 끝내고 restartMulti로 새(이을 수 있는) 문제를 뽑아 깨끗한 상태로 넘긴다.
      await A.page.evaluate(() => MG.ref.child('meta').transaction(cur => {
        if(!cur) return; cur.phase = 'over'; return cur;
      }));
      await waitPhase(A.page, 'over', 5000).catch(() => {});
      await A.page.evaluate(() => restartMulti());
      await waitFor(A.page, (r) =>
        MG.meta && MG.meta.phase === 'play' && MG.meta.need !== r,
        [deadNeed], { timeout: 8000, label: '새 게임이 이을 수 있는 문제로 시작' }).catch(() => false);
      gameIdsUsed.add(await A.page.evaluate(() => MG.meta.gameId));
    } else {
      report('막다른 낱말: 게임이 끝나지 않고 다음 라운드로 진행됨', false, '이을 수 없는 글자를 못 찾아 건너뜀');
      report('막다른 낱말: A의 게임이 over로 끝나지 않음', false, '위와 동일');
      report('막다른 낱말: 상대(B)의 게임도 끝나지 않음', false, '위와 동일');
      report('막다른 낱말: 탈출구인 교체 요청 버튼이 있음', false, '위와 동일');
    }
  }

  /* 4) 호스트 승계 — 호스트가 탭을 닫아도 남은 쪽이 진행 */
  {
    const hostIsA = await A.page.evaluate(() => isHost());
    const hostIsB = await B.page.evaluate(() => isHost());
    report('둘 중 정확히 한 명만 호스트임', hostIsA !== hostIsB, 'hostA=' + hostIsA + ' hostB=' + hostIsB);

    const hostSide = hostIsA ? A : B;
    const survivor = hostIsA ? B : A;

    // 닫기 전에 호스트 쪽 자신의 presence/점수를 정리해둔다 — 탭을 닫아버리면 그 uid로는
    // 다시는 인증할 수 없어서(익명 세션이 그 프로필과 함께 사라짐) 이후엔 지울 방법이
    // 없기 때문에, 반드시 닫기 직전에 자기 몫을 치운다.
    await cleanupOwn(hostSide.page, gameIdsUsed, 'chain');
    await hostSide.ctx.close();
    if (hostSide === A) A = null; else B = null;

    // 남은 쪽이 새 호스트가 되는지 확인 (presence 갱신 반영 대기)
    const becameHost = await waitFor(survivor.page, () => isHost(), [],
      { timeout: 6000, label: '생존자가 새 호스트가 됨' }).catch(() => false);
    report('호스트가 나가면 남은 쪽이 새 호스트가 됨', !!becameHost);

    // 게임이 이미 끝났으면(라운드 소진) 다시 시작해서라도 승계 후 진행을 확인한다
    let phase = await survivor.page.evaluate(() => MG.meta.phase);
    if (phase === 'over'){
      await survivor.page.evaluate(() => restartMulti());
      await waitPhase(survivor.page, 'play');
    } else if (phase !== 'play'){
      await waitPhase(survivor.page, 'play', 6000).catch(() => {});
    }

    const n = await need(survivor.page);
    const chainArr = await survivor.page.evaluate(() => Object.values((MG.meta && MG.meta.chain) || {}));
    const word = await survivor.page.evaluate((nn, u) => findHint(nn, WORD_ALL, u), n, chainArr);
    if (word){
      await survivor.page.type('#multi-input', word);
      await survivor.page.click('#multi-submit');
      await sleep(1200);
      const b = await bub(survivor.page);
      report('호스트 이탈 후에도 남은 쪽이 혼자 진행할 수 있음', b.includes('이겼어요'), b.slice(0, 30));
    } else {
      report('호스트 이탈 후에도 남은 쪽이 혼자 진행할 수 있음', false, '이을 낱말을 못 찾음');
    }
    gameIdsUsed.add(await survivor.page.evaluate(() => MG.meta.gameId));
  }

}catch(e){
  report('예외 없이 끝까지 실행됨', false, String(e && e.stack || e));
}finally{
  /* ---------- 정리 ---------- */
  // nunus 전체를 지우지 않는다 — 배포 후에는 이 경로가 실제 플레이어들의 게임 상태를
  // 담을 수 있는 영구 방이라서(설계 문서: 방 하나 = 모드 하나, 계속 재사용됨), 우리가
  // 이번 실행에서 만든 것만 정확히 지운다: 우리 uid들의 presence/점수, 그리고 meta —
  // 단 meta는 자기 몫을 지운 뒤에도 presence에 낯선 uid가 남아있으면(실행 중 실제
  // 플레이어가 들어왔다면) 지우지 않는다(removeMetaIfNoStranger, Finding 4).
  try{
    // 정상 종료라면 섹션 4에서 호스트 쪽 자신의 몫은 이미 지워놓고 컨텍스트를 닫았을
    // 것이므로(A/B 중 하나가 null) 여기선 생존자만 지우면 된다. 하지만 그 전에 예외가
    // 나면(예: 레이스 도중 사전 문제로 throw) A와 B가 둘 다 아직 열려 있는 채로 여기로
    // 온다 — 그때 "생존자 하나만" 지우면 나머지 한쪽의 presence가 그대로 남아서,
    // removeMetaIfNoStranger가 그걸 "낯선 uid"로 오판해 meta를 못 지우고 방을 지저분한
    // 채로 남긴다(실제로 겪음). 그래서 A/B 둘 다 아직 열려 있으면 둘 다 지운다 —
    // cleanupOwn은 이미 지워진 쪽에 다시 호출해도 안전하다(각자 자기 uid만 지움).
    if (A) await cleanupOwn(A.page, gameIdsUsed, 'chain');
    if (B) await cleanupOwn(B.page, gameIdsUsed, 'chain');
    const chainSurvivor = A || B;
    if (chainSurvivor) await removeMetaIfNoStranger(chainSurvivor.page, 'chain');

    if (C) await cleanupOwn(C.page, chosungGameIdsUsed, 'chosung');
    if (D) await cleanupOwn(D.page, chosungGameIdsUsed, 'chosung');
    const chosungSurvivor = C || D;
    if (chosungSurvivor) await removeMetaIfNoStranger(chosungSurvivor.page, 'chosung');
  }catch(e){ console.log('       정리 중 오류(무시하지 않고 보고): ' + e); }

  try{ if (A) await A.ctx.close(); }catch(e){}
  try{ if (B) await B.ctx.close(); }catch(e){}
  try{ if (C) await C.ctx.close(); }catch(e){}
  try{ if (D) await D.ctx.close(); }catch(e){}
  await browser.close();

  console.log('\n===== 요약 =====');
  const fails = results.filter(r => !r.ok);
  for (const r of results) console.log((r.ok ? 'PASS' : 'FAIL') + '  ' + r.name);
  console.log(fails.length ? ('\n' + fails.length + '개 실패') : '\n전부 통과');
  process.exitCode = fails.length ? 1 : 0;
}

// 자기 uid 몫의 presence/점수만 지운다(규칙상 auth.uid===$pid인 것만 쓸 수 있어서
// 상대방 몫은 못 지운다 — 그건 상대방 자신의 cleanupOwn 호출이 지운다).
async function cleanupOwn(page, gameIds, mode = 'chain'){
  await page.evaluate((gids, m) => {
    const uid = MG.uid;
    const ops = [firebase.database().ref('nunus/' + m + '/presence/' + uid).remove()];
    for (const gid of gids){
      ops.push(firebase.database().ref('nunus/' + m + '/scores/' + gid + '/' + uid).remove());
    }
    return Promise.all(ops.map(p => p.catch(() => {})));
  }, [...gameIds], mode);
}
