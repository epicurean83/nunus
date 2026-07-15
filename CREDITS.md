# Credits / 출처

## 낱말 검증 사전 (`public/words.v1.txt`)

낱말 맞히기 게임의 **정답 검증용 낱말 목록**은 아래 개방형 데이터를 기반으로 만들어졌습니다.

- **국립국어원 개방형 한국어 지식 대사전(우리말샘) / 한국어기초사전** 데이터
- **spellcheck-ko / hunspell-dict-ko** (`dict-ko-data.yaml`)의 명사 표제어에서 추출
  - https://github.com/spellcheck-ko/hunspell-dict-ko

이 낱말 데이터는 **CC BY-SA 2.0 KR**(저작자표시-동일조건변경허락) 라이선스를 따릅니다.
- 라이선스 전문: https://creativecommons.org/licenses/by-sa/2.0/kr/
- 본 저장소에서 파생된 낱말 목록(`public/words.v1.txt`) 역시 동일 조건(CC BY-SA 2.0 KR)으로 제공됩니다.

가공 내용: 명사 품사의 한글 음절 표제어만 추출하고, 기존 큐레이션 낱말 목록과 합쳐 중복을 제거했습니다. (약 33,000개)

## 출제용 낱말 목록 (`WORD_DICT`, 앱 내장)

문제 출제에 쓰이는 흔한 명사 목록은 기존 큐레이션(han-dle/pd-korean-noun-list 계열, CC0 및 직접 큐레이션)을 사용합니다.
