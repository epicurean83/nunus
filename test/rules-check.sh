#!/usr/bin/env bash
# 배포된 RTDB 규칙을 실제 익명 토큰으로 검증한다.
# 사용법: bash test/rules-check.sh
set -u
KEY="AIzaSyBXr59xkIb_l90kMdErron_5oqCMBZZj1E"
DB="https://nearby-58e2d-default-rtdb.asia-southeast1.firebasedatabase.app"
SIGNUP="https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=$KEY"

mk(){ curl -s -X POST "$SIGNUP" -H 'Content-Type: application/json' -d '{"returnSecureToken":true}'; }
A=$(mk); B=$(mk)
TA=$(echo "$A" | grep -o '"idToken": "[^"]*"' | cut -d'"' -f4)
UA=$(echo "$A" | grep -o '"localId": "[^"]*"' | cut -d'"' -f4)
UB=$(echo "$B" | grep -o '"localId": "[^"]*"' | cut -d'"' -f4)

code(){ curl -s -o /dev/null -w "%{http_code}" "$@"; }
fail=0
chk(){ # chk <라벨> <기대코드> <실제코드>
  if [ "$2" = "$3" ]; then echo "  ok   $1 ($3)"; else echo "  FAIL $1 — 기대 $2, 실제 $3"; fail=1; fi
}

echo "규칙 검증 (uid A=$UA)"
# meta 하위 필드를 시험하려면 meta가 먼저 정상 상태여야 한다
# (meta는 gameId/round/phase를 필수로 요구한다).
chk "meta 부트스트랩 허용" 200 \
  "$(code -X PUT "$DB/nunus/chain/meta.json?auth=$TA" -d '{"gameId":1,"round":1,"phase":"play"}')"
chk "내 vote 쓰기 허용" 200 \
  "$(code -X PUT "$DB/nunus/chain/presence/$UA/vote.json?auth=$TA" -d '{"req":1,"ok":true}')"
chk "남의 vote 쓰기 차단" 401 \
  "$(code -X PUT "$DB/nunus/chain/presence/$UB/vote.json?auth=$TA" -d '{"req":1,"ok":true}')"
chk "vote 임의필드 차단" 401 \
  "$(code -X PUT "$DB/nunus/chain/presence/$UA/vote.json?auth=$TA" -d '{"req":1,"ok":true,"x":1}')"
chk "meta.swap 쓰기 허용" 200 \
  "$(code -X PUT "$DB/nunus/chain/meta/swap.json?auth=$TA" -d "{\"by\":\"$UA\",\"round\":1,\"until\":123}")"
chk "meta.swap 필드누락 차단" 401 \
  "$(code -X PUT "$DB/nunus/chain/meta/swap.json?auth=$TA" -d '{"by":"x"}')"
chk "meta.swapCool 쓰기 허용" 200 \
  "$(code -X PUT "$DB/nunus/chain/meta/swapCool.json?auth=$TA" -d '99')"
chk "meta 임의필드 차단" 401 \
  "$(code -X PUT "$DB/nunus/chain/meta/bogus.json?auth=$TA" -d '1')"
chk "루트 읽기 차단" 401 "$(code "$DB/.json?auth=$TA")"
chk "비로그인 읽기 차단" 401 "$(code "$DB/nunus.json")"

echo "정리: 이 스크립트가 만든 노드는 관리자로 지운다"
echo "  firebase database:remove /nunus/chain/presence/$UA --force"
echo "  firebase database:remove /nunus/chain/meta --force"
[ "$fail" = 0 ] && echo "전부 통과" || { echo "실패 있음"; exit 1; }
