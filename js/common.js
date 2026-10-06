/* ==========================================================================
   BranchBook 공통 스크립트 — 전역 객체 BranchBook
   - 레이아웃(상단바, 챕터 서랍, 목차, 이전/다음, 테마, 검색)을 자동으로 만든다.
   - 실험 도우미: 캔버스, 차트, 슬라이더, 선택 버튼, 결과열, 퀴즈
   - 실제로 동작하는 축소 예측기: bimodal, gshare, TAGE
   이 파일은 <head>에서 defer 없이 불러온다. 페이지 스크립트는 </body> 바로 앞에 둔다.
   ========================================================================== */
(function () {
  "use strict";

  const CHAPTERS = [
    { slug: "basics", number: "01", group: "기초", title: "분기예측과 오예측 비용", description: "조건의 답이 나오기 전에 다음 명령을 가져와야 한다. 2-bit 카운터, 파이프라인 flush, MPKI와 IPC.", experimentCount: 4 },
    { slug: "history", number: "02", group: "기초", title: "History와 TAGE", description: "과거 방향 기록으로 다음 방향을 배운다. bimodal, gshare, TAGE를 같은 분기열에서 겨뤄 본다.", experimentCount: 3 },
    { slug: "h2p", number: "03", group: "기초", title: "H2P: 어려운 분기의 정체", description: "H2P는 분기의 영구적인 속성이 아니다. 오예측이 몇 개의 분기에 몰리는 모습과 여섯 범주.", experimentCount: 3 },
    { slug: "correlation", number: "04", group: "논문", category: "A", title: "묻힌 상관 찾기: BranchNet", description: "유용한 과거 분기가 noise 속에 묻힐 때, 위치가 흔들려도 특징을 세는 CNN의 발상.", experimentCount: 3 },
    { slug: "value", number: "05", group: "논문", category: "B", title: "값과 선행 계산: Branch Runahead, TEA, RUNLTS", description: "History에 없는 정보를 가져온다. 필요한 계산만 먼저 실행하거나, 이미 나온 register 값을 본다.", experimentCount: 4 },
    { slug: "state", number: "06", group: "논문", category: "C", title: "패턴의 표현·보관·선별: Whisper, LLBP, LLBP-X, PURE", description: "서버 프로그램은 기억할 패턴이 너무 많다. 규칙으로 줄이고, 계층으로 보관하고, 쓸모없는 할당을 막는다.", experimentCount: 5 },
    { slug: "loop", number: "07", group: "논문", category: "D", title: "서로 얽힌 루프 분기: Phelps", description: "어려운 분기가 다른 어려운 분기를 가로막는 루프. 조건값으로 바꿔 미리 계산하고 반복 단위로 맞춘다.", experimentCount: 3 },
    { slug: "recovery", number: "08", group: "논문", category: "E", title: "남은 오예측의 비용: APF, SBRB", description: "틀린 뒤의 손실을 줄인다. 반대 경로를 미리 준비하고, 취소된 분기의 결과를 다시 쓴다.", experimentCount: 3 },
    { slug: "latency", number: "09", group: "논문", category: "F", title: "늦게 오는 정답: Ahead Prediction", description: "정확한 예측기가 느리면 명령 공급이 끊긴다. 조회를 미리 시작하고 빠진 history는 나중에 고른다.", experimentCount: 3 },
    { slug: "synthesis", number: "10", group: "정리", title: "종합: 정보·상태·시간", description: "열두 편을 한 지도에 올린다. 무엇을 더 쓰고, 언제 개입하고, 어떤 비용을 치르는가.", experimentCount: 3 },
    { slug: "glossary", number: "11", group: "정리", title: "용어집, 종합 퀴즈, 참고문헌", description: "핵심 용어를 검색하고, 전체 내용을 퀴즈로 점검하고, 원문으로 이동한다.", experimentCount: 0 },
  ];

  const BranchBook = (window.BranchBook = {});
  BranchBook.chapters = CHAPTERS;

  /* ------------------------------------------------------------ 수치 도우미 */
  BranchBook.clamp = function (value, minimum, maximum) {
    return Math.min(maximum, Math.max(minimum, value));
  };
  BranchBook.interpolate = function (start, end, fraction) {
    return start + (end - start) * fraction;
  };
  BranchBook.mapRange = function (value, inputStart, inputEnd, outputStart, outputEnd) {
    return outputStart + ((value - inputStart) * (outputEnd - outputStart)) / (inputEnd - inputStart);
  };
  /** 유효 자릿수 기준 숫자 표기 */
  BranchBook.formatNumber = function (value, significantDigits = 3) {
    if (!isFinite(value)) return "—";
    if (value === 0) return "0";
    return Number(value.toPrecision(significantDigits)).toLocaleString("en-US", { maximumFractionDigits: 6 });
  };
  /** 0~1 비율을 백분율 문자열로 */
  BranchBook.formatPercent = function (fraction, decimalPlaces = 1) {
    if (!isFinite(fraction)) return "—";
    return (fraction * 100).toFixed(decimalPlaces) + "%";
  };
  /**
   * 씨앗값이 같으면 항상 같은 수열을 내는 난수 생성기.
   * 실험 결과가 새로 고칠 때마다 달라지면 설명과 화면이 어긋나므로 Math.random 대신 쓴다.
   */
  BranchBook.createRandom = function (seed = 1) {
    let state = seed >>> 0;
    return function nextRandom() {
      state = (state + 0x6d2b79f5) >>> 0;
      let mixed = state;
      mixed = Math.imul(mixed ^ (mixed >>> 15), mixed | 1);
      mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), mixed | 61);
      return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
    };
  };

  /* ------------------------------------------------------------ 테마 */
  const THEME_STORAGE_KEY = "branchbook-theme";
  const themeListeners = [];
  (function applyStoredTheme() {
    let storedTheme = null;
    try { storedTheme = localStorage.getItem(THEME_STORAGE_KEY); } catch (storageError) { storedTheme = null; }
    if (storedTheme === "light" || storedTheme === "dark") document.documentElement.dataset.theme = storedTheme;
  })();
  BranchBook.isDarkTheme = function () {
    const explicitTheme = document.documentElement.dataset.theme;
    if (explicitTheme) return explicitTheme === "dark";
    return window.matchMedia("(prefers-color-scheme: dark)").matches;
  };
  BranchBook.onThemeChange = function (listener) { themeListeners.push(listener); };
  function notifyThemeListeners() { themeListeners.forEach((listener) => listener()); }
  function toggleTheme() {
    const nextTheme = BranchBook.isDarkTheme() ? "light" : "dark";
    document.documentElement.dataset.theme = nextTheme;
    try { localStorage.setItem(THEME_STORAGE_KEY, nextTheme); } catch (storageError) { /* 저장 실패는 무시: 다음 방문 때 OS 설정을 따른다 */ }
    notifyThemeListeners();
  }
  window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", notifyThemeListeners);

  /** CSS 변수 값을 읽는다. 캔버스는 CSS 변수를 직접 못 쓰므로 그릴 때마다 읽어 온다. */
  BranchBook.color = function (variableName) {
    return getComputedStyle(document.documentElement).getPropertyValue("--" + variableName).trim();
  };
  BranchBook.palette = function () {
    const read = BranchBook.color;
    return {
      background: read("canvas-background"), elevated: read("elevated"), surface: read("surface"), surfaceStrong: read("surface-strong"),
      border: read("border"), text: read("text"), textDim: read("text-dim"), textFaint: read("text-faint"),
      accent: read("accent"), accentSoft: read("accent-soft"),
      taken: read("taken"), takenSoft: read("taken-soft"), notTaken: read("not-taken"), notTakenSoft: read("not-taken-soft"),
      mispredict: read("mispredict"), mispredictSoft: read("mispredict-soft"),
      series: [read("series-1"), read("series-2"), read("series-3"), read("series-4")],
      grid: read("grid"), axis: read("axis"),
      font: "'IBM Plex Sans KR', sans-serif", mono: "'IBM Plex Mono', monospace",
    };
  };
  BranchBook.prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ------------------------------------------------------------ 캔버스 */
  function resolveElement(elementOrId) {
    return typeof elementOrId === "string" ? document.getElementById(elementOrId) : elementOrId;
  }
  /**
   * 캔버스를 화면 배율과 부모 너비에 맞추고, 크기나 테마가 바뀌면 다시 그린다.
   * draw(context, width, height, palette) 안에서는 CSS 픽셀 단위로 그리면 된다.
   * 높이는 options.height, 없으면 canvas의 data-height, 그것도 없으면 300.
   */
  BranchBook.createCanvas = function (canvasOrId, draw, options = {}) {
    const canvas = resolveElement(canvasOrId);
    const context = canvas.getContext("2d");
    const fixedHeight = options.height || Number(canvas.dataset.height) || 300;
    let width = 0;
    let height = fixedHeight;
    function redraw() {
      if (width === 0) return;
      context.save();
      context.clearRect(0, 0, width, height);
      draw(context, width, height, BranchBook.palette());
      context.restore();
    }
    function resize() {
      const parentWidth = canvas.parentElement.clientWidth;
      const parentStyle = getComputedStyle(canvas.parentElement);
      const availableWidth = parentWidth - parseFloat(parentStyle.paddingLeft) - parseFloat(parentStyle.paddingRight);
      if (availableWidth <= 0) return;
      const pixelRatio = Math.min(window.devicePixelRatio || 1, 2.5);
      width = Math.floor(availableWidth);
      height = typeof options.heightForWidth === "function" ? options.heightForWidth(width) : fixedHeight;
      canvas.style.height = height + "px";
      canvas.width = Math.round(width * pixelRatio);
      canvas.height = Math.round(height * pixelRatio);
      context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
      redraw();
    }
    new ResizeObserver(resize).observe(canvas.parentElement);
    BranchBook.onThemeChange(redraw);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(redraw);
    resize();
    return {
      canvas, context, redraw,
      // 그릴 내용에 따라 높이가 달라지는 그림(heightForWidth)은 내용이 바뀐 뒤 직접 부른다.
      resize,
      get width() { return width; },
      get height() { return height; },
    };
  };

  /**
   * 화면에 보일 때만 도는 애니메이션 루프. 보이지 않는 실험이 CPU를 쓰지 않게 한다.
   * callback(deltaSeconds)를 프레임마다 부른다. 움직임 줄이기 설정이면 자동 시작하지 않는다.
   */
  BranchBook.createAnimationLoop = function (elementOrId, callback, options = {}) {
    const element = resolveElement(elementOrId);
    const MAXIMUM_DELTA_SECONDS = 0.1;
    let isVisible = false;
    let isPlaying = options.autoStart !== false && !BranchBook.prefersReducedMotion;
    let frameHandle = 0;
    let previousTimestamp = 0;
    function frame(timestamp) {
      frameHandle = 0;
      const deltaSeconds = previousTimestamp ? Math.min((timestamp - previousTimestamp) / 1000, MAXIMUM_DELTA_SECONDS) : 0;
      previousTimestamp = timestamp;
      callback(deltaSeconds);
      schedule();
    }
    function schedule() {
      if (isVisible && isPlaying && !frameHandle) frameHandle = requestAnimationFrame(frame);
    }
    function halt() {
      if (frameHandle) cancelAnimationFrame(frameHandle);
      frameHandle = 0;
      previousTimestamp = 0;
    }
    new IntersectionObserver((entries) => {
      isVisible = entries[0].isIntersecting;
      if (isVisible) schedule(); else halt();
    }).observe(element);
    return {
      play() { isPlaying = true; schedule(); },
      pause() { isPlaying = false; halt(); },
      get isPlaying() { return isPlaying; },
    };
  };

  /* ------------------------------------------------------------ 차트 */
  function buildTicks(minimum, maximum, tickCountOrList) {
    if (Array.isArray(tickCountOrList)) return tickCountOrList;
    const tickCount = tickCountOrList || 5;
    const ticks = [];
    for (let tickIndex = 0; tickIndex <= tickCount; tickIndex++) ticks.push(minimum + ((maximum - minimum) * tickIndex) / tickCount);
    return ticks;
  }
  /**
   * 축·격자·눈금 라벨을 그리고 좌표 변환 함수를 돌려준다.
   * bounds: {x, y, width, height} — 그림 영역(축 라벨 제외)
   * options: xMinimum, xMaximum, yMinimum, yMaximum, xTicks, yTicks(개수 또는 배열),
   *          xLabel, yLabel, xFormat, yFormat, hideXGrid
   */
  BranchBook.drawChart = function (context, bounds, options) {
    const palette = BranchBook.palette();
    const { xMinimum, xMaximum, yMinimum, yMaximum } = options;
    const toX = (value) => bounds.x + ((value - xMinimum) / (xMaximum - xMinimum)) * bounds.width;
    const toY = (value) => bounds.y + bounds.height - ((value - yMinimum) / (yMaximum - yMinimum)) * bounds.height;
    const xFormat = options.xFormat || ((value) => BranchBook.formatNumber(value));
    const yFormat = options.yFormat || ((value) => BranchBook.formatNumber(value));
    context.save();
    context.lineWidth = 1;
    context.font = "11px " + palette.mono;
    context.fillStyle = palette.textDim;
    context.strokeStyle = palette.grid;
    context.textAlign = "right";
    context.textBaseline = "middle";
    buildTicks(yMinimum, yMaximum, options.yTicks).forEach((tickValue) => {
      const y = Math.round(toY(tickValue)) + 0.5;
      context.beginPath(); context.moveTo(bounds.x, y); context.lineTo(bounds.x + bounds.width, y); context.stroke();
      context.fillText(yFormat(tickValue), bounds.x - 8, y);
    });
    context.textAlign = "center";
    context.textBaseline = "top";
    buildTicks(xMinimum, xMaximum, options.xTicks).forEach((tickValue) => {
      const x = Math.round(toX(tickValue)) + 0.5;
      if (!options.hideXGrid) { context.beginPath(); context.moveTo(x, bounds.y); context.lineTo(x, bounds.y + bounds.height); context.stroke(); }
      context.fillText(xFormat(tickValue), x, bounds.y + bounds.height + 8);
    });
    context.strokeStyle = palette.axis;
    context.beginPath();
    context.moveTo(bounds.x + 0.5, bounds.y);
    context.lineTo(bounds.x + 0.5, bounds.y + bounds.height + 0.5);
    context.lineTo(bounds.x + bounds.width, bounds.y + bounds.height + 0.5);
    context.stroke();
    context.font = "12px " + palette.font;
    context.fillStyle = palette.textDim;
    if (options.xLabel) {
      context.textAlign = "center"; context.textBaseline = "top";
      context.fillText(options.xLabel, bounds.x + bounds.width / 2, bounds.y + bounds.height + 26);
    }
    if (options.yLabel) {
      context.save();
      context.translate(bounds.x - 44, bounds.y + bounds.height / 2);
      context.rotate(-Math.PI / 2);
      context.textAlign = "center"; context.textBaseline = "bottom";
      context.fillText(options.yLabel, 0, 0);
      context.restore();
    }
    context.restore();
    return { toX, toY, bounds };
  };
  /** 꺾은선. points: [[x, y], ...] (데이터 좌표) */
  BranchBook.drawLine = function (context, chart, points, color, options = {}) {
    if (points.length === 0) return;
    context.save();
    context.beginPath();
    context.rect(chart.bounds.x, chart.bounds.y - 2, chart.bounds.width + 2, chart.bounds.height + 4);
    context.clip();
    context.strokeStyle = color;
    context.lineWidth = options.lineWidth || 2;
    context.lineJoin = "round";
    if (options.dashed) context.setLineDash([6, 5]);
    context.beginPath();
    points.forEach((point, pointIndex) => {
      const x = chart.toX(point[0]);
      const y = chart.toY(point[1]);
      if (pointIndex === 0) context.moveTo(x, y); else context.lineTo(x, y);
    });
    context.stroke();
    context.restore();
  };
  /** 위쪽 모서리만 둥근 막대. 값이 0인 기준선에 붙여 그린다. */
  BranchBook.drawBar = function (context, x, baselineY, barWidth, barHeight, color) {
    const cornerRadius = Math.min(4, barWidth / 2, Math.abs(barHeight));
    context.save();
    context.fillStyle = color;
    context.beginPath();
    context.moveTo(x, baselineY);
    context.lineTo(x, baselineY - barHeight + cornerRadius);
    context.quadraticCurveTo(x, baselineY - barHeight, x + cornerRadius, baselineY - barHeight);
    context.lineTo(x + barWidth - cornerRadius, baselineY - barHeight);
    context.quadraticCurveTo(x + barWidth, baselineY - barHeight, x + barWidth, baselineY - barHeight + cornerRadius);
    context.lineTo(x + barWidth, baselineY);
    context.closePath();
    context.fill();
    context.restore();
  };
  /** 둥근 사각형 경로 */
  BranchBook.roundedRectangle = function (context, x, y, width, height, cornerRadius) {
    const radius = Math.min(cornerRadius, width / 2, height / 2);
    context.beginPath();
    context.moveTo(x + radius, y);
    context.arcTo(x + width, y, x + width, y + height, radius);
    context.arcTo(x + width, y + height, x, y + height, radius);
    context.arcTo(x, y + height, x, y, radius);
    context.arcTo(x, y, x + width, y, radius);
    context.closePath();
  };
  /**
   * 캔버스 위에 마우스를 올리면 값을 보여 주는 말풍선.
   * resolve(x, y)는 CSS 픽셀 좌표를 받아 {x, y, html} 또는 null을 돌려준다.
   */
  BranchBook.attachTooltip = function (canvasOrId, resolve) {
    const canvas = resolveElement(canvasOrId);
    const container = canvas.parentElement;
    if (getComputedStyle(container).position === "static") container.style.position = "relative";
    const tooltip = document.createElement("div");
    tooltip.className = "chart-tooltip";
    container.appendChild(tooltip);
    function hide() { tooltip.classList.remove("visible"); }
    canvas.addEventListener("pointermove", (pointerEvent) => {
      const canvasRectangle = canvas.getBoundingClientRect();
      const containerRectangle = container.getBoundingClientRect();
      const result = resolve(pointerEvent.clientX - canvasRectangle.left, pointerEvent.clientY - canvasRectangle.top);
      if (!result) { hide(); return; }
      tooltip.innerHTML = result.html;
      const halfTooltipWidth = tooltip.offsetWidth / 2;
      const offsetLeft = canvasRectangle.left - containerRectangle.left;
      const offsetTop = canvasRectangle.top - containerRectangle.top;
      const clampedX = BranchBook.clamp(result.x + offsetLeft, halfTooltipWidth + 4, containerRectangle.width - halfTooltipWidth - 4);
      tooltip.style.left = clampedX + "px";
      tooltip.style.top = Math.max(result.y + offsetTop, tooltip.offsetHeight + 14) + "px";
      tooltip.classList.add("visible");
    });
    canvas.addEventListener("pointerleave", hide);
  };

  /* ------------------------------------------------------------ 조작 요소 */
  /** 슬라이더를 묶는다. <output id="{id}-output">가 있으면 format(value) 결과를 적는다. */
  BranchBook.bindRange = function (id, format, onInput) {
    const input = document.getElementById(id);
    const output = document.getElementById(id + "-output");
    function refresh() {
      const minimum = Number(input.min);
      const maximum = Number(input.max);
      const fillPercent = ((Number(input.value) - minimum) / (maximum - minimum)) * 100;
      input.style.setProperty("--fill-percent", fillPercent + "%");
      if (output) output.textContent = format ? format(Number(input.value)) : input.value;
    }
    input.addEventListener("input", () => { refresh(); if (onInput) onInput(Number(input.value)); });
    refresh();
    return {
      input,
      get value() { return Number(input.value); },
      set(value) { input.value = value; refresh(); },
    };
  };
  /** 여러 버튼 중 하나를 고르는 선택 버튼. 각 버튼은 data-value를 가진다. */
  BranchBook.bindSegmented = function (id, onChange) {
    const container = document.getElementById(id);
    const buttons = Array.from(container.querySelectorAll("button"));
    let currentValue = (buttons.find((button) => button.classList.contains("on")) || buttons[0]).dataset.value;
    function select(value, shouldNotify) {
      currentValue = value;
      buttons.forEach((button) => {
        const isSelected = button.dataset.value === value;
        button.classList.toggle("on", isSelected);
        button.setAttribute("aria-pressed", String(isSelected));
      });
      if (shouldNotify && onChange) onChange(value);
    }
    buttons.forEach((button) => button.addEventListener("click", () => select(button.dataset.value, true)));
    select(currentValue, false);
    return {
      get value() { return currentValue; },
      set(value) { select(value, false); },
    };
  };
  BranchBook.bindCheckbox = function (id, onChange) {
    const input = document.getElementById(id);
    input.addEventListener("change", () => { if (onChange) onChange(input.checked); });
    return {
      get checked() { return input.checked; },
      set(isChecked) { input.checked = isChecked; },
    };
  };
  BranchBook.bindButton = function (id, onClick) {
    const button = document.getElementById(id);
    button.addEventListener("click", onClick);
    return button;
  };
  /** id가 가리키는 요소의 내용을 바꾼다(주로 실험 아래 수치 칸). */
  BranchBook.setContent = function (id, html) {
    const element = document.getElementById(id);
    if (element) element.innerHTML = html;
  };

  /* ------------------------------------------------------------ 결과열 */
  /**
   * 분기 결과를 작은 칸의 줄로 그린다. 사이트 전체에서 같은 모양을 쓴다.
   * outcomes: [{ taken: true|false|null, isMispredicted, isHighlighted, title }]
   * options: { isSmall, showLetters }
   */
  BranchBook.renderOutcomeStrip = function (containerOrId, outcomes, options = {}) {
    const container = resolveElement(containerOrId);
    const fragment = document.createDocumentFragment();
    outcomes.forEach((outcome) => {
      const cell = document.createElement("span");
      let directionClass = "unknown";
      let letter = "?";
      if (outcome.taken === true) { directionClass = "taken"; letter = "T"; }
      if (outcome.taken === false) { directionClass = "not-taken"; letter = "N"; }
      cell.className = "outcome-cell " + directionClass;
      if (options.isSmall) cell.classList.add("small");
      if (outcome.isMispredicted) cell.classList.add("mispredicted");
      if (outcome.isHighlighted) cell.classList.add("highlighted");
      if (options.showLetters !== false && !options.isSmall) cell.textContent = letter;
      if (outcome.title) cell.title = outcome.title;
      fragment.appendChild(cell);
    });
    container.classList.add("outcome-strip");
    container.replaceChildren(fragment);
  };

  /* ------------------------------------------------------------ 퀴즈 */
  /** questions: [{ question, options: [문자열], answerIndex, explanation }] */
  BranchBook.renderQuiz = function (containerOrId, questions) {
    const container = resolveElement(containerOrId);
    questions.forEach((item, questionIndex) => {
      const block = document.createElement("div");
      block.className = "quiz-question";
      const prompt = document.createElement("p");
      prompt.innerHTML = "Q" + (questionIndex + 1) + ". " + item.question;
      const optionList = document.createElement("div");
      optionList.className = "quiz-options";
      const explanation = document.createElement("div");
      explanation.className = "quiz-explanation";
      explanation.innerHTML = item.explanation;
      item.options.forEach((optionText, optionIndex) => {
        const optionButton = document.createElement("button");
        optionButton.className = "quiz-option";
        optionButton.type = "button";
        optionButton.innerHTML = optionText;
        optionButton.addEventListener("click", () => {
          const allButtons = Array.from(optionList.children);
          allButtons.forEach((button) => { button.disabled = true; });
          allButtons[item.answerIndex].classList.add("right");
          if (optionIndex !== item.answerIndex) optionButton.classList.add("wrong");
          block.classList.add("answered");
          container.dispatchEvent(new CustomEvent("quizanswered", { detail: { questionIndex, isCorrect: optionIndex === item.answerIndex } }));
        });
        optionList.appendChild(optionButton);
      });
      block.append(prompt, optionList, explanation);
      container.appendChild(block);
    });
  };

  /* ------------------------------------------------------------ 축소 예측기
     원리를 보여 주기 위한 작은 구현이다. 실제 64KB TAGE-SC-L과 표 크기·hash·보조 구성요소가 다르다. */
  const COUNTER_MAXIMUM = 3;
  const COUNTER_WEAKLY_TAKEN = 2;
  const COUNTER_WEAKLY_NOT_TAKEN = 1;

  function updateSaturatingCounter(counter, taken, maximum) {
    if (taken) return Math.min(maximum, counter + 1);
    return Math.max(0, counter - 1);
  }

  const predictors = (BranchBook.predictors = {});

  /** 분기 주소마다 2-bit 카운터 하나. history를 쓰지 않는다. */
  predictors.createBimodal = function ({ indexBits = 10 } = {}) {
    const tableSize = 1 << indexBits;
    let counters;
    function reset() { counters = new Uint8Array(tableSize).fill(COUNTER_WEAKLY_NOT_TAKEN); }
    reset();
    return {
      name: "bimodal",
      reset,
      predict(address) {
        const counter = counters[address & (tableSize - 1)];
        return { taken: counter >= COUNTER_WEAKLY_TAKEN, counter };
      },
      update(address, taken) {
        const index = address & (tableSize - 1);
        counters[index] = updateSaturatingCounter(counters[index], taken, COUNTER_MAXIMUM);
      },
    };
  };

  /** 전역 history와 주소를 XOR해서 카운터 표를 찾는다. */
  predictors.createGshare = function ({ indexBits = 10, historyLength = 8 } = {}) {
    const tableSize = 1 << indexBits;
    const historyMask = historyLength >= 31 ? 0x7fffffff : (1 << historyLength) - 1;
    let counters;
    let history;
    function reset() { counters = new Uint8Array(tableSize).fill(COUNTER_WEAKLY_NOT_TAKEN); history = 0; }
    function indexFor(address) {
      // history가 표 색인보다 길면 접어서(XOR) 색인 폭에 맞춘다.
      let foldedHistory = 0;
      let remainingHistory = history;
      while (remainingHistory !== 0) {
        foldedHistory ^= remainingHistory & (tableSize - 1);
        remainingHistory >>>= indexBits;
      }
      return (address ^ foldedHistory) & (tableSize - 1);
    }
    reset();
    return {
      name: "gshare",
      reset,
      predict(address) {
        const counter = counters[indexFor(address)];
        return { taken: counter >= COUNTER_WEAKLY_TAKEN, counter };
      },
      update(address, taken) {
        const index = indexFor(address);
        counters[index] = updateSaturatingCounter(counters[index], taken, COUNTER_MAXIMUM);
        history = ((history << 1) | (taken ? 1 : 0)) & historyMask;
      },
    };
  };

  /**
   * 축소 TAGE: 기본 bimodal 표 + 서로 다른 history 길이를 쓰는 tag 표 여러 개.
   * 가장 긴 history로 tag가 맞는 표가 예측을 제공(provider)하고, 틀리면 더 긴 표에 새 entry를 할당한다.
   * options.allocationFilter(address, historyLength)가 false를 돌려주면 그 할당을 하지 않는다(6장 PURE 실험용).
   */
  predictors.createTage = function (options = {}) {
    const historyLengths = options.historyLengths || [4, 8, 16, 32, 64];
    const baseIndexBits = options.baseIndexBits || 10;
    const tableIndexBits = options.tableIndexBits || 8;
    const tagBits = options.tagBits || 9;
    const allocationFilter = options.allocationFilter || null;
    const TAGGED_COUNTER_MAXIMUM = 7;
    const TAGGED_COUNTER_WEAKLY_TAKEN = 4;
    const TAGGED_COUNTER_WEAKLY_NOT_TAKEN = 3;
    const USEFUL_MAXIMUM = 3;
    const USEFUL_DECAY_PERIOD = 4096;
    const baseSize = 1 << baseIndexBits;
    const tableSize = 1 << tableIndexBits;
    const maximumHistoryLength = Math.max(...historyLengths);
    let baseCounters;
    let tables;
    let historyBits;
    let historyHead;
    let allocationCount;
    let rejectedAllocationCount;
    let updateCount;

    function reset() {
      baseCounters = new Uint8Array(baseSize).fill(COUNTER_WEAKLY_NOT_TAKEN);
      tables = historyLengths.map(() => ({
        tags: new Int32Array(tableSize).fill(-1),
        counters: new Uint8Array(tableSize),
        useful: new Uint8Array(tableSize),
      }));
      historyBits = new Uint8Array(maximumHistoryLength);
      historyHead = 0;
      allocationCount = 0;
      rejectedAllocationCount = 0;
      updateCount = 0;
    }
    /** 최근 length개의 방향을 접어 hash 하나로 만든다. seed를 달리해 색인과 tag를 따로 뽑는다. */
    function hashHistory(address, length, seed) {
      let hash = (address * 0x9e3779b1 + seed * 0x85ebca6b) >>> 0;
      for (let offset = 0; offset < length; offset++) {
        const bit = historyBits[(historyHead - 1 - offset + maximumHistoryLength * 2) % maximumHistoryLength];
        hash = (Math.imul(hash ^ bit, 0x01000193) + offset) >>> 0;
      }
      return hash ^ (hash >>> 15);
    }
    function lookup(address) {
      const slots = historyLengths.map((length, tableNumber) => {
        const index = hashHistory(address, length, 1) & (tableSize - 1);
        const tag = hashHistory(address, length, 2) & ((1 << tagBits) - 1);
        return { tableNumber, index, tag, isHit: tables[tableNumber].tags[index] === tag };
      });
      let providerNumber = -1;
      let alternateNumber = -1;
      for (let tableNumber = slots.length - 1; tableNumber >= 0; tableNumber--) {
        if (!slots[tableNumber].isHit) continue;
        if (providerNumber === -1) providerNumber = tableNumber;
        else { alternateNumber = tableNumber; break; }
      }
      const basePrediction = baseCounters[address & (baseSize - 1)] >= COUNTER_WEAKLY_TAKEN;
      const takenFrom = (tableNumber) => tableNumber === -1
        ? basePrediction
        : tables[tableNumber].counters[slots[tableNumber].index] >= TAGGED_COUNTER_WEAKLY_TAKEN;
      return { slots, providerNumber, alternateNumber, providerTaken: takenFrom(providerNumber), alternateTaken: takenFrom(alternateNumber) };
    }
    reset();
    return {
      name: "TAGE",
      historyLengths,
      reset,
      predict(address) {
        const state = lookup(address);
        return {
          taken: state.providerTaken,
          providerTable: state.providerNumber,
          providerHistoryLength: state.providerNumber === -1 ? 0 : historyLengths[state.providerNumber],
        };
      },
      update(address, taken) {
        const state = lookup(address);
        const isCorrect = state.providerTaken === taken;
        updateCount++;
        if (state.providerNumber === -1) {
          const baseIndex = address & (baseSize - 1);
          baseCounters[baseIndex] = updateSaturatingCounter(baseCounters[baseIndex], taken, COUNTER_MAXIMUM);
        } else {
          const providerTable = tables[state.providerNumber];
          const providerIndex = state.slots[state.providerNumber].index;
          providerTable.counters[providerIndex] = updateSaturatingCounter(providerTable.counters[providerIndex], taken, TAGGED_COUNTER_MAXIMUM);
          // provider만 맞고 대안이 틀렸다면 이 entry는 쓸모가 있었다는 뜻이다.
          if (state.providerTaken !== state.alternateTaken) {
            providerTable.useful[providerIndex] = isCorrect
              ? Math.min(USEFUL_MAXIMUM, providerTable.useful[providerIndex] + 1)
              : Math.max(0, providerTable.useful[providerIndex] - 1);
          }
        }
        if (!isCorrect && state.providerNumber < historyLengths.length - 1) {
          // 더 긴 history 표를 짧은 쪽부터 훑어, useful이 0인 첫 자리에 새 entry를 둔다. 한 번의 오예측에 하나만 할당한다.
          let isAllocationSettled = false;
          for (let tableNumber = state.providerNumber + 1; tableNumber < historyLengths.length && !isAllocationSettled; tableNumber++) {
            const slot = state.slots[tableNumber];
            const table = tables[tableNumber];
            if (table.useful[slot.index] !== 0) { table.useful[slot.index]--; continue; }
            isAllocationSettled = true;
            if (allocationFilter && !allocationFilter(address, historyLengths[tableNumber])) { rejectedAllocationCount++; continue; }
            table.tags[slot.index] = slot.tag;
            table.counters[slot.index] = taken ? TAGGED_COUNTER_WEAKLY_TAKEN : TAGGED_COUNTER_WEAKLY_NOT_TAKEN;
            table.useful[slot.index] = 0;
            allocationCount++;
          }
        }
        // 오래된 useful 표시를 주기적으로 낮춰, 더는 쓰이지 않는 entry가 자리를 영원히 차지하지 않게 한다.
        if (updateCount % USEFUL_DECAY_PERIOD === 0) {
          tables.forEach((table) => { for (let index = 0; index < tableSize; index++) table.useful[index] >>= 1; });
        }
        historyBits[historyHead] = taken ? 1 : 0;
        historyHead = (historyHead + 1) % maximumHistoryLength;
      },
      statistics() {
        const occupiedEntries = tables.map((table) => table.tags.reduce((count, tag) => count + (tag !== -1 ? 1 : 0), 0));
        return { allocationCount, rejectedAllocationCount, occupiedEntries, tableSize };
      },
    };
  };

  /**
   * 분기열(trace)을 예측기에 차례로 먹이고 결과를 센다.
   * trace: [{ address, taken }]. 돌려주는 값: 전체·오예측 수, 분기 주소별 통계, 각 분기를 맞혔는지.
   */
  BranchBook.runPredictor = function (predictor, trace) {
    const perAddress = new Map();
    const isCorrectList = new Uint8Array(trace.length);
    let mispredictionCount = 0;
    trace.forEach((branch, branchIndex) => {
      const prediction = predictor.predict(branch.address);
      const isCorrect = prediction.taken === branch.taken;
      predictor.update(branch.address, branch.taken);
      if (!perAddress.has(branch.address)) perAddress.set(branch.address, { executionCount: 0, mispredictionCount: 0 });
      const record = perAddress.get(branch.address);
      record.executionCount++;
      if (isCorrect) isCorrectList[branchIndex] = 1;
      else { mispredictionCount++; record.mispredictionCount++; }
    });
    return {
      branchCount: trace.length,
      mispredictionCount,
      accuracy: trace.length === 0 ? 1 : 1 - mispredictionCount / trace.length,
      perAddress,
      isCorrectList,
    };
  };

  /* ------------------------------------------------------------ 레이아웃 */
  const ICONS = {
    menu: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 7h16M4 12h16M4 17h16"/></svg>',
    search: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg>',
    moon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z"/></svg>',
    sun: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="4"/><path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M5.6 18.4L7 17M17 7l1.4-1.4"/></svg>',
    // 로고: 한 줄기가 두 갈래로 갈리는 분기. 위 갈래는 taken, 아래 갈래는 not-taken 색이다.
    logo: '<svg class="logo-mark" viewBox="0 0 28 28" aria-hidden="true"><rect width="28" height="28" rx="7" fill="var(--accent)"/><path d="M6 14h7" stroke="#fff" stroke-width="2.4" stroke-linecap="round" fill="none"/><path d="M13 14c4 0 4-6 9-6" stroke="#7fe3d2" stroke-width="2.4" stroke-linecap="round" fill="none"/><path d="M13 14c4 0 4 6 9 6" stroke="#ffc766" stroke-width="2.4" stroke-linecap="round" fill="none"/></svg>',
  };

  function rootPath() { return document.body.dataset.root || ""; }
  function chapterUrl(chapter) { return rootPath() + "chapters/" + chapter.slug + ".html"; }
  function currentChapterIndex() {
    return CHAPTERS.findIndex((chapter) => chapter.slug === document.body.dataset.chapter);
  }
  function chapterLabel(chapter) { return Number(chapter.number) + "장"; }

  function buildTopbar() {
    const topbar = document.createElement("header");
    topbar.className = "topbar";
    topbar.innerHTML =
      '<button class="icon-button" id="drawer-toggle" aria-label="전체 챕터 열기">' + ICONS.menu + "</button>" +
      '<a class="logo" href="' + (rootPath() || "./") + (rootPath() ? "index.html" : "") + '">' + ICONS.logo + "<span>BranchBook</span><small>H2P 분기예측 교과서</small></a>" +
      '<div class="topbar-spacer"></div>' +
      '<div class="search" role="search">' + ICONS.search +
      '<input type="search" id="search-input" placeholder="이 책 검색" aria-label="이 책 검색" autocomplete="off">' +
      '<div class="search-results" id="search-results"></div></div>' +
      '<button class="icon-button" id="theme-toggle" aria-label="밝은 화면과 어두운 화면 바꾸기"></button>';
    document.body.prepend(topbar);
    const themeButton = document.getElementById("theme-toggle");
    function refreshThemeIcon() { themeButton.innerHTML = BranchBook.isDarkTheme() ? ICONS.sun : ICONS.moon; }
    themeButton.addEventListener("click", toggleTheme);
    BranchBook.onThemeChange(refreshThemeIcon);
    refreshThemeIcon();
  }

  function buildDrawer() {
    const activeIndex = currentChapterIndex();
    const backdrop = document.createElement("div");
    backdrop.className = "drawer-backdrop";
    const drawer = document.createElement("nav");
    drawer.className = "drawer";
    drawer.setAttribute("aria-label", "전체 챕터");
    const items = CHAPTERS.map((chapter, chapterIndex) => {
      const categoryPrefix = chapter.category ? chapter.category + " · " : "";
      return '<li><a href="' + chapterUrl(chapter) + '"' + (chapterIndex === activeIndex ? ' class="active" aria-current="page"' : "") + ">" +
        '<span class="chapter-number">' + chapter.number + "</span><span>" + categoryPrefix + chapter.title + "</span></a></li>";
    }).join("");
    drawer.innerHTML = "<h2>전체 챕터</h2><ul class=\"chapter-list\">" +
      '<li><a href="' + rootPath() + 'index.html"' + (activeIndex === -1 ? ' class="active"' : "") + '><span class="chapter-number">00</span><span>처음으로</span></a></li>' +
      items + "</ul>";
    document.body.append(backdrop, drawer);
    const toggleButton = document.getElementById("drawer-toggle");
    function setDrawerOpen(isOpen) { document.body.classList.toggle("drawer-open", isOpen); }
    toggleButton.addEventListener("click", () => setDrawerOpen(!document.body.classList.contains("drawer-open")));
    backdrop.addEventListener("click", () => setDrawerOpen(false));
    document.addEventListener("keydown", (keyboardEvent) => { if (keyboardEvent.key === "Escape") setDrawerOpen(false); });
  }

  function buildChapterFrame() {
    const main = document.querySelector("main.chapter");
    if (!main) return;
    const chapterIndex = currentChapterIndex();
    const chapter = CHAPTERS[chapterIndex];

    const kicker = main.querySelector(".chapter-kicker");
    if (kicker && chapter) {
      kicker.innerHTML = "<span>" + chapterLabel(chapter) + " · " + chapter.group + "</span>" +
        (chapter.category ? '<span class="category-badge">범주 ' + chapter.category + "</span>" : "");
    }

    // 절 번호와 오른쪽 목차는 본문의 h2에서 만든다. 본문만 고치면 목차가 따라온다.
    const sections = Array.from(main.querySelectorAll(":scope > section[id]"));
    const contents = document.createElement("aside");
    contents.className = "page-contents";
    contents.innerHTML = "<h2>이 페이지</h2>";
    const contentLinks = new Map();
    sections.forEach((section, sectionIndex) => {
      const heading = section.querySelector("h2");
      if (!heading) return;
      const headingText = heading.textContent;
      const isNumbered = !section.classList.contains("keypoints") && section.id !== "quiz";
      if (isNumbered) {
        const numberLabel = document.createElement("span");
        numberLabel.className = "section-number";
        numberLabel.textContent = String(sectionIndex + 1).padStart(2, "0");
        heading.prepend(numberLabel);
      }
      const link = document.createElement("a");
      link.href = "#" + section.id;
      link.textContent = headingText;
      contents.appendChild(link);
      contentLinks.set(section, link);
    });

    const layout = document.createElement("div");
    layout.className = "layout";
    main.replaceWith(layout);
    layout.append(main, contents);

    const sectionObserver = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        contentLinks.forEach((link) => link.classList.remove("active"));
        const activeLink = contentLinks.get(entry.target);
        if (activeLink) activeLink.classList.add("active");
      });
    }, { rootMargin: "-20% 0px -70% 0px" });
    sections.forEach((section) => sectionObserver.observe(section));

    if (chapter) {
      const pager = document.createElement("nav");
      pager.className = "pager";
      pager.setAttribute("aria-label", "이전 장과 다음 장");
      const previousChapter = CHAPTERS[chapterIndex - 1];
      const nextChapter = CHAPTERS[chapterIndex + 1];
      if (previousChapter) pager.innerHTML += '<a class="previous" href="' + chapterUrl(previousChapter) + '"><small>이전 · ' + chapterLabel(previousChapter) + "</small>" + previousChapter.title + "</a>";
      if (nextChapter) pager.innerHTML += '<a class="next" href="' + chapterUrl(nextChapter) + '"><small>다음 · ' + chapterLabel(nextChapter) + "</small>" + nextChapter.title + "</a>";
      main.appendChild(pager);
    }

    const progress = document.createElement("div");
    progress.className = "reading-progress";
    document.body.appendChild(progress);
    function refreshProgress() {
      const scrollableHeight = document.documentElement.scrollHeight - window.innerHeight;
      const fraction = scrollableHeight > 0 ? window.scrollY / scrollableHeight : 0;
      progress.style.width = fraction * 100 + "%";
    }
    window.addEventListener("scroll", refreshProgress, { passive: true });
    refreshProgress();
  }

  function buildFooter() {
    const footer = document.createElement("footer");
    footer.className = "footer";
    footer.innerHTML =
      "<p>BranchBook · 최근 H2P(Hard-to-Predict branch) 논문 12편을 실험으로 읽는 교과서</p>" +
      "<p>모든 실험은 원리를 보여 주는 축소 모델이며 논문의 측정 결과를 재현한 것이 아닙니다. 논문 수치는 각 논문이 밝힌 baseline과 workload 조건에서만 유효합니다.</p>" +
      '<p>책의 구성 방식은 <a href="https://sensorbook.euiyun.com" rel="noopener">SensorBook</a>에서 배웠습니다. 그림은 모두 새로 그렸고, 원문은 <a href="' + rootPath() + 'chapters/glossary.html#references">참고문헌</a>에서 볼 수 있습니다.</p>';
    document.body.appendChild(footer);
  }

  /* ------------------------------------------------------------ 검색
     색인을 따로 관리하지 않고, 검색창을 처음 쓸 때 각 장의 HTML에서 제목과 용어를 읽어 만든다. */
  let searchEntriesPromise = null;
  function loadSearchEntries() {
    if (searchEntriesPromise) return searchEntriesPromise;
    const requests = CHAPTERS.map((chapter) =>
      fetch(chapterUrl(chapter))
        .then((response) => (response.ok ? response.text() : ""))
        .catch(() => "")
        .then((html) => {
          const entries = [{ text: chapter.title, detail: chapterLabel(chapter) + " · " + chapter.description, url: chapterUrl(chapter) }];
          if (!html) return entries;
          const parsed = new DOMParser().parseFromString(html, "text/html");
          parsed.querySelectorAll("main section[id]").forEach((section) => {
            const sectionUrl = chapterUrl(chapter) + "#" + section.id;
            const heading = section.querySelector("h2");
            const headingText = heading ? heading.textContent.trim() : "";
            if (headingText) entries.push({ text: headingText, detail: chapterLabel(chapter) + " · " + chapter.title, url: sectionUrl });
            section.querySelectorAll("h3, .term, dt").forEach((element) => {
              const elementText = element.textContent.trim();
              if (elementText) entries.push({ text: elementText, detail: chapterLabel(chapter) + " · " + headingText, url: sectionUrl });
            });
          });
          return entries;
        })
    );
    searchEntriesPromise = Promise.all(requests).then((lists) => {
      const seenKeys = new Set();
      return lists.flat().filter((entry) => {
        const key = entry.text + "|" + entry.url;
        if (seenKeys.has(key)) return false;
        seenKeys.add(key);
        return true;
      });
    });
    return searchEntriesPromise;
  }
  function buildSearch() {
    const MAXIMUM_RESULT_COUNT = 12;
    const input = document.getElementById("search-input");
    const results = document.getElementById("search-results");
    function escapeHtml(text) {
      return text.replace(/[&<>"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[character]));
    }
    function refresh() {
      const query = input.value.trim().toLowerCase();
      if (!query) { results.classList.remove("open"); return; }
      loadSearchEntries().then((entries) => {
        if (input.value.trim().toLowerCase() !== query) return;
        const matches = entries.filter((entry) => entry.text.toLowerCase().includes(query)).slice(0, MAXIMUM_RESULT_COUNT);
        results.innerHTML = matches.length === 0
          ? '<div class="search-empty">찾는 내용이 없습니다. 영어 용어(예: TAGE, prefetch)로도 찾아보세요.</div>'
          : matches.map((entry) => '<a href="' + entry.url + '">' + escapeHtml(entry.text) + "<small>" + escapeHtml(entry.detail) + "</small></a>").join("");
        results.classList.add("open");
      });
    }
    input.addEventListener("input", refresh);
    input.addEventListener("focus", () => { loadSearchEntries(); refresh(); });
    input.addEventListener("keydown", (keyboardEvent) => {
      if (keyboardEvent.key === "Escape") { input.value = ""; results.classList.remove("open"); input.blur(); }
      if (keyboardEvent.key === "Enter") {
        const firstResult = results.querySelector("a");
        if (firstResult) window.location.href = firstResult.href;
      }
    });
    document.addEventListener("click", (mouseEvent) => {
      if (!mouseEvent.target.closest(".search")) results.classList.remove("open");
    });
  }

  /* ------------------------------------------------------------ 수식(KaTeX)
     수식이 있는 페이지에서만 불러온다. */
  function loadMathematics() {
    const hasMathematics = /\\\(|\$\$/.test(document.body.textContent);
    if (!hasMathematics) return;
    const KATEX_BASE_URL = "https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/";
    const stylesheet = document.createElement("link");
    stylesheet.rel = "stylesheet";
    stylesheet.href = KATEX_BASE_URL + "katex.min.css";
    document.head.appendChild(stylesheet);
    function loadScript(fileName) {
      return new Promise((resolve, reject) => {
        const script = document.createElement("script");
        script.src = KATEX_BASE_URL + fileName;
        script.onload = resolve;
        script.onerror = reject;
        document.head.appendChild(script);
      });
    }
    loadScript("katex.min.js")
      .then(() => loadScript("contrib/auto-render.min.js"))
      .then(() => {
        window.renderMathInElement(document.body, {
          delimiters: [{ left: "$$", right: "$$", display: true }, { left: "\\(", right: "\\)", display: false }],
          ignoredTags: ["script", "style", "textarea", "pre", "code", "canvas"],
          throwOnError: false,
        });
      })
      .catch(() => { /* CDN을 못 불러와도 본문은 읽을 수 있어야 하므로 조용히 넘어간다 */ });
  }

  document.addEventListener("DOMContentLoaded", () => {
    buildTopbar();
    buildDrawer();
    buildChapterFrame();
    buildFooter();
    buildSearch();
    loadMathematics();
  });
})();
