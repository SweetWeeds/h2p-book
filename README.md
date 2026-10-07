# BranchBook · H2P 분기예측 교과서

최근 H2P(Hard-to-Predict branch) 논문 열두 편을 그림과 실험으로 읽는 한국어 인터랙티브 교과서입니다.

- 사이트: https://sweetweeds.github.io/h2p-book/
- 구성: 기초 3개 장, 범주별 논문 6개 장(A–F), 종합, 연구 계획, 용어집
- 장별 인터랙티브 실험 34개와 확인 퀴즈
- 다루는 논문: BranchNet, Branch Runahead, TEA, RUNLTS, Whisper, LLBP, LLBP-X, PURE, Phelps, Alternate Path Fetch, SBRB, Ahead Prediction

## 읽기 전에

- 모든 실험은 원리를 보여 주는 축소 모델입니다. 논문의 측정 결과를 재현한 것이 아닙니다.
- 논문이 보고한 수치는 그 논문의 baseline과 workload 조건에서만 유효하며, 본문에 조건과 함께 표시했습니다.
- 구조도는 원문을 참고해 모두 새로 그렸습니다. 원문 링크는 12장 참고문헌에 있습니다.
- PURE와 SBRB는 공개 초록만 확인하고 썼습니다.

## 구조

빌드 과정이 없는 정적 사이트입니다.

```
index.html          홈
chapters/*.html     장별 페이지
css/style.css       공통 스타일
js/common.js        레이아웃, 실험 도우미, 축소 예측기(bimodal, gshare, TAGE)
js/papers.js        논문 자료(종합 장과 참고문헌이 함께 사용)
js/state.js         6장 실험 5개와 퀴즈
```

로컬에서 보려면 이 폴더에서 `python3 -m http.server`를 실행하고 브라우저로 엽니다.

## 검증과 배포

저장소 루트에서 실행합니다. 브라우저 검사는 Python `playwright`와 `/usr/bin/google-chrome`이 필요합니다.

```bash
python3 site/tools/audit_site.py
python3 site/tools/check_pages.py /tmp/branchbook-check
python3 site/tools/check_interactions.py
```

정적 검사는 내부 링크, 장·실험 수, 미완성 스크립트, 공개 제외 표현을 확인합니다.
화면 검사는 밝은/어두운 데스크톱 및 모바일 스크린샷과 실행 오류를 확인합니다.
상호작용 검사는 실험 캔버스 초기화, 슬라이더 경계값, 버튼, 퀴즈, 검색과 동적으로 생성된 링크를 확인합니다.
6장·9장은 noise가 없는 경우의 동등성, 후보 선택과 지연 계산도 검사합니다.

검증 후 `bash site/tools/deploy.sh "사이트 갱신"`으로 전용 공개 저장소 `SweetWeeds/h2p-book`에 배포합니다.
배포 스크립트는 정적 검사를 통과한 `site/`만 복사하며 `tools/`는 제외합니다.

책의 구성 방식은 [SensorBook](https://sensorbook.euiyun.com)에서 배웠습니다.

## 연구 계획 공개 요약

11장은 2026-10-07 기준 연구 목표, 현재 범위, 검증 순서와 평가 기준을 설명합니다.
컴파일러 기반 분기 관계 그래프는 추가 검토 후보로 구분하며, 신규 성능 실험 결과는 아직 없습니다.
내부 리뷰 원문 대신 설명형 이름을 사용한 공개 요약만 포함합니다.
