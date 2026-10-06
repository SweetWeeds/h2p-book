# BranchBook · H2P 분기예측 교과서

최근 H2P(Hard-to-Predict branch) 논문 열두 편을 그림과 실험으로 읽는 한국어 인터랙티브 교과서입니다.

- 사이트: https://sweetweeds.github.io/h2p-book/
- 구성: 기초 3개 장, 범주별 논문 6개 장(A–F), 종합, 용어집
- 다루는 논문: BranchNet, Branch Runahead, TEA, RUNLTS, Whisper, LLBP, LLBP-X, PURE, Phelps, Alternate Path Fetch, SBRB, Ahead Prediction

## 읽기 전에

- 모든 실험은 원리를 보여 주는 축소 모델입니다. 논문의 측정 결과를 재현한 것이 아닙니다.
- 논문이 보고한 수치는 그 논문의 baseline과 workload 조건에서만 유효하며, 본문에 조건과 함께 표시했습니다.
- 구조도는 원문을 참고해 모두 새로 그렸습니다. 원문 링크는 11장 참고문헌에 있습니다.
- PURE와 SBRB는 공개 초록만 확인하고 썼습니다.

## 구조

빌드 과정이 없는 정적 사이트입니다.

```
index.html          홈
chapters/*.html     장별 페이지
css/style.css       공통 스타일
js/common.js        레이아웃, 실험 도우미, 축소 예측기(bimodal, gshare, TAGE)
js/papers.js        논문 자료(종합 장과 참고문헌이 함께 사용)
```

로컬에서 보려면 이 폴더에서 `python3 -m http.server`를 실행하고 브라우저로 엽니다.

책의 구성 방식은 [SensorBook](https://sensorbook.euiyun.com)에서 배웠습니다.
