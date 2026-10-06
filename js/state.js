/* 6장: 결정적 합성 trace로 동작하는 설명용 실험. */
(function () {
"use strict";

const HISTORY_BIT_COUNT = 8;
const SAMPLE_COUNT = 400;
const OPERATORS = {
  and: { symbol: "AND", evaluate: (left, right) => left && right },
  or: { symbol: "OR", evaluate: (left, right) => left || right },
  implication: { symbol: "→", evaluate: (left, right) => !left || right },
  converse: { symbol: "↚", evaluate: (left, right) => !left && right },
};
const OPERATOR_NAMES = Object.keys(OPERATORS);
function evaluateFormula(formula, historyKey) {
  const bitAt = (position) => ((historyKey >> formula.bitIndexes[position]) & 1) === 1;
  let value = OPERATORS[formula.firstOperator].evaluate(bitAt(0), bitAt(1));
  if (formula.bitIndexes.length === 3) value = OPERATORS[formula.secondOperator].evaluate(value, bitAt(2));
  return formula.isInverted ? !value : value;
}
const GROUP_OF_BIT = [0, 1, 2, 0, 1, 2, 2, 1];
function buildProfile(kind, seed, noiseRate) {
  const random = BranchBook.createRandom(seed);
  const takenCounts = new Uint16Array(1 << HISTORY_BIT_COUNT);
  const notTakenCounts = new Uint16Array(1 << HISTORY_BIT_COUNT);
  let takenTotal = 0;
  const FLIP = 0.08;
  for (let sampleIndex = 0; sampleIndex < SAMPLE_COUNT; sampleIndex++) {
    const latent = [random() < 0.5, random() < 0.5, random() < 0.5];
    let historyKey = 0;
    for (let bitIndex = 0; bitIndex < HISTORY_BIT_COUNT; bitIndex++) {
      let value = latent[GROUP_OF_BIT[bitIndex]];
      if (random() < FLIP) value = !value;
      if (value) historyKey |= 1 << bitIndex;
    }
    let isTaken;
    if (kind === "correlated") {
      isTaken = (!latent[0] || latent[1]) && latent[2];
      if (random() < noiseRate) isTaken = !isTaken;
    } else {
      isTaken = random() < 0.4;
    }
    if (isTaken) { takenCounts[historyKey]++; takenTotal++; } else notTakenCounts[historyKey]++;
  }
  return { takenCounts, notTakenCounts, takenTotal, sampleCount: SAMPLE_COUNT };
}
function countMispredictions(formula, profile) {
  let mispredictionCount = 0;
  for (let historyKey = 0; historyKey < (1 << HISTORY_BIT_COUNT); historyKey++) {
    if (evaluateFormula(formula, historyKey)) mispredictionCount += profile.notTakenCounts[historyKey];
    else mispredictionCount += profile.takenCounts[historyKey];
  }
  return mispredictionCount;
}
function enumerateFormulas() {
  const formulas = [];
  for (let first = 0; first < HISTORY_BIT_COUNT; first++) for (let second = 0; second < HISTORY_BIT_COUNT; second++) {
    if (second === first) continue;
    for (const firstOperator of OPERATOR_NAMES) for (const isInverted of [false, true]) {
      formulas.push({ bitIndexes: [first, second], firstOperator, secondOperator: "and", isInverted });
      for (let third = 0; third < HISTORY_BIT_COUNT; third++) {
        if (third === first || third === second) continue;
        for (const secondOperator of OPERATOR_NAMES) formulas.push({ bitIndexes: [first, second, third], firstOperator, secondOperator, isInverted });
      }
    }
  }
  return formulas;
}

const CONTEXT_COUNT = 600;
const PATTERN_BUFFER_CAPACITY = 6;
const MINIMUM_STEADY_GAP = 2;
const MAXIMUM_STEADY_GAP = 4;
const BURST_GAP = 1;
const BURST_CONTEXT_COUNT = 5;
const WRONG_PATH_DURATION = 6;
const WRONG_PATH_REQUEST_COUNT = 3;
const STREAM_SEED = 31;

/** 문맥이 바뀌는 시각과 pipeline reset 위치를 정한다. 같은 씨앗이면 슬라이더를 움직여도 같은 흐름이 나온다. */
function buildStream(resetInterval) {
  const gapRandom = BranchBook.createRandom(STREAM_SEED);
  const resetRandom = BranchBook.createRandom(STREAM_SEED + 1);
  const contexts = [];
  let time = 0;
  let burstRemaining = 0;
  for (let contextIndex = 0; contextIndex < CONTEXT_COUNT; contextIndex++) {
    const steadyGap = MINIMUM_STEADY_GAP + Math.floor(gapRandom() * (MAXIMUM_STEADY_GAP - MINIMUM_STEADY_GAP + 1));
    const isAfterReset = contextIndex > 3 && resetRandom() < 1 / resetInterval;
    if (isAfterReset) { time += WRONG_PATH_DURATION; burstRemaining = BURST_CONTEXT_COUNT; }
    const duration = burstRemaining > 0 ? BURST_GAP : steadyGap;
    if (burstRemaining > 0) burstRemaining--;
    contexts.push({ contextIndex, startTime: time, endTime: time + duration, isAfterReset });
    time += duration;
  }
  return contexts;
}

function simulate(prefetchDistance, fetchLatency, resetInterval) {
  const contexts = buildStream(resetInterval);
  const requests = [];
  contexts.forEach((context) => {
    const sourceIndex = context.contextIndex - prefetchDistance;
    const issueTime = sourceIndex >= 0 ? contexts[sourceIndex].startTime : 0;
    requests.push({ contextIndex: context.contextIndex, issueTime, arrivalTime: issueTime + fetchLatency, isWrongPath: false, status: "pending" });
  });
  // reset 순간에 아직 날아오던 요청은 취소되고, 그때 다시 보낸다.
  contexts.forEach((context) => {
    if (!context.isAfterReset) return;
    const resetTime = context.startTime;
    requests.forEach((request) => {
      if (request.isWrongPath) return;
      if (request.contextIndex >= context.contextIndex && request.issueTime < resetTime && request.arrivalTime > resetTime) {
        request.issueTime = resetTime; request.arrivalTime = resetTime + fetchLatency; request.wasSquashed = true;
      }
    });
    for (let wrongIndex = 0; wrongIndex < WRONG_PATH_REQUEST_COUNT; wrongIndex++) {
      const issueTime = resetTime - WRONG_PATH_DURATION + 1 + wrongIndex * 2;
      requests.push({ contextIndex: -1, issueTime, arrivalTime: issueTime + fetchLatency, isWrongPath: true, hasArrived: issueTime + fetchLatency <= resetTime, resetTime, status: "wasted" });
    }
  });
  // 시간순으로 buffer를 흉내 낸다.
  const events = [];
  requests.forEach((request, requestIndex) => {
    if (request.isWrongPath && !request.hasArrived) return;
    events.push({ time: request.arrivalTime, order: 0, kind: "arrival", requestIndex });
  });
  contexts.forEach((context) => events.push({ time: context.startTime, order: 1, kind: "activation", contextIndex: context.contextIndex }));
  contexts.filter((context) => context.isAfterReset).forEach((context) => events.push({ time: context.startTime, order: -1, kind: "reset" }));
  events.sort((first, second) => first.time - second.time || first.order - second.order);
  const buffer = []; // { requestIndex, contextIndex, lastTouchTime }
  let activeContextIndex = -1;
  const outcomes = contexts.map(() => ({ status: "late", usableFrom: Infinity }));
  let extraRequestCount = 0; let evictedUnusedCount = 0;
  function insert(entry, time) {
    if (buffer.length >= PATTERN_BUFFER_CAPACITY) {
      let victimPosition = -1;
      let isVictimFinished = false;
      buffer.forEach((candidate, position) => {
        if (candidate.contextIndex === activeContextIndex) return;
        const isFinished = candidate.contextIndex >= 0 && candidate.contextIndex < activeContextIndex;
        if (victimPosition === -1) { victimPosition = position; isVictimFinished = isFinished; return; }
        if (isFinished && !isVictimFinished) { victimPosition = position; isVictimFinished = true; return; }
        if (isFinished === isVictimFinished && candidate.lastTouchTime < buffer[victimPosition].lastTouchTime) victimPosition = position;
      });
      const victim = buffer.splice(victimPosition, 1)[0];
      if (victim.contextIndex > activeContextIndex) { evictedUnusedCount++; requests[victim.requestIndex].status = "evicted"; }
    }
    buffer.push(entry);
  }
  
  const pending = events.slice();
  while (pending.length > 0) {
    const event = pending.shift();
    if (event.kind === "reset") {
      // 잘못된 경로의 이미 도착한 요청도 reset 때 buffer에서 제거한다.
      for (let position = buffer.length - 1; position >= 0; position--) {
        if (buffer[position].contextIndex < 0) buffer.splice(position, 1);
      }
    } else if (event.kind === "arrival") {
      const request = requests[event.requestIndex];
      if (request.isWrongPath) { insert({ requestIndex: event.requestIndex, contextIndex: -1 - event.requestIndex, lastTouchTime: event.time }, event.time); continue; }
      if (request.contextIndex < activeContextIndex) { request.status = "tooLate"; continue; }
      insert({ requestIndex: event.requestIndex, contextIndex: request.contextIndex, lastTouchTime: event.time }, event.time);
      if (request.contextIndex === activeContextIndex) { outcomes[activeContextIndex].usableFrom = event.time; request.status = "late"; }
    } else {
      // 직전 문맥은 방금까지 쓰였으므로 가장 최근에 건드린 것으로 친다.
      const previous = buffer.find((entry) => entry.contextIndex === activeContextIndex);
      if (previous) previous.lastTouchTime = event.time;
      activeContextIndex = event.contextIndex;
      const entry = buffer.find((candidate) => candidate.contextIndex === activeContextIndex);
      if (entry) {
        outcomes[activeContextIndex] = { status: "timely", usableFrom: event.time };
        entry.lastTouchTime = event.time; requests[entry.requestIndex].status = "timely";
      } else {
        const request = requests[activeContextIndex];
        const isInFlight = request.status === "pending" && request.arrivalTime > event.time;
        if (!isInFlight) {
          // buffer에서 밀려났거나 아직 요청하지 않았다: 지금 요청한다.
          extraRequestCount++;
          const demand = { contextIndex: activeContextIndex, issueTime: event.time, arrivalTime: event.time + fetchLatency, isWrongPath: false, status: "pending", isDemand: true };
          requests.push(demand);
          const arrivalEvent = { time: demand.arrivalTime, order: 0, kind: "arrival", requestIndex: requests.length - 1 };
          let position = pending.findIndex((candidate) => candidate.time > arrivalEvent.time || (candidate.time === arrivalEvent.time && candidate.order > 0));
          if (position === -1) position = pending.length;
          pending.splice(position, 0, arrivalEvent);
        }
      }
    }
  }
  let coveredTime = 0, totalTime = 0, timelyCount = 0;
  contexts.forEach((context, index) => {
    const duration = context.endTime - context.startTime;
    totalTime += duration;
    const outcome = outcomes[index];
    if (outcome.status === "timely") { timelyCount++; coveredTime += duration; }
    else if (outcome.usableFrom < context.endTime) coveredTime += context.endTime - outcome.usableFrom;
  });
  const wastedCount = requests.filter((request) => request.status === "wasted" || request.status === "evicted" || request.status === "tooLate").length;
  return { timelyShare: timelyCount / contexts.length, lateShare: 1 - timelyCount / contexts.length, wastedShare: wastedCount / requests.length, survivingGain: coveredTime / totalTime, requestCount: requests.length, evictedUnusedCount, contexts, requests, outcomes };
}

const DEPTH_LEVELS = [1, 2, 4, 8, 16, 32, 64];
const SHALLOW_LEVEL_INDEX = 1;
const DEEP_LEVEL_INDEX = 6;
const PATTERN_SET_LIMIT = 16;
const HALF_FULL_LIMIT = 8;
const SITE_COUNT = 160;
const HARD_SITE_SHARE = 0.14;
const PROGRAM_SEED = 5;

/** 설명용 프로그램: 코드 위치(site)마다 그곳에 이르는 호출 경로와, 필요한 패턴 수를 정한다. */
function buildProgram() {
  const random = BranchBook.createRandom(PROGRAM_SEED);
  const sites = [];
  for (let siteIndex = 0; siteIndex < SITE_COUNT; siteIndex++) {
    const isHard = random() < HARD_SITE_SHARE;
    const pathCount = isHard ? 24 + Math.floor(random() * 40) : 1 + Math.floor(random() * random() * 20);
    const shortPatternCount = 2 + Math.floor(random() * 5);
    const longPatternCount = isHard ? 60 + Math.floor(random() * 200) : Math.floor(random() * 5);
    // 경로마다 깊이 단계별 갈림 번호를 준다. 앞 단계까지의 번호가 같으면 그 깊이에서는 같은 문맥이다.
    const paths = [];
    for (let pathIndex = 0; pathIndex < pathCount; pathIndex++) {
      const forkCodes = [];
      for (let levelIndex = 1; levelIndex < DEPTH_LEVELS.length; levelIndex++) forkCodes.push(Math.floor(random() * 3));
      paths.push({ forkCodes, longPatternCount: 0 });
    }
    for (let patternIndex = 0; patternIndex < longPatternCount; patternIndex++) paths[Math.floor(random() * pathCount)].longPatternCount++;
    sites.push({ siteIndex, isHard, shortPatternCount, paths });
  }
  return sites;
}
/** 한 site의 경로들을 주어진 깊이 단계에서 문맥별로 묶는다. */
function groupPaths(paths, levelIndex) {
  const groups = new Map();
  paths.forEach((path) => {
    const key = path.forkCodes.slice(0, levelIndex).join("");
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(path);
  });
  return Array.from(groups.values());
}
function sumLongPatterns(paths) { return paths.reduce((total, path) => total + path.longPatternCount, 0); }

function number(id) { return Number(document.getElementById(id).value); }
function display(id, value) { document.getElementById(id).textContent = value; }
function ranges(identifiers, refresh, formats = {}) {
  identifiers.forEach((identifier) => BranchBook.bindRange(identifier, formats[identifier] || String, refresh));
}
function makeTrace(typeCount, noiseShare = 0) {
  const random = BranchBook.createRandom(7);
  const types = Array.from({ length: 12 }, () => Array.from({ length: 20 }, () => ({ address: 0x400 + Math.floor(random() * 6) * 4, taken: random() < 0.5, isNoisy: false })));
  const noiseRandom = BranchBook.createRandom(99);
  const trace = [];
  const noiseCount = Math.round(noiseShare / (1 - noiseShare) * 120);
  for (let phase = 0; phase < 72; phase++) {
    for (let noiseIndex = 0; noiseIndex < noiseCount; noiseIndex++) trace.push({ address: 0x800 + Math.floor(noiseRandom() * 4) * 4, taken: noiseRandom() < 0.5, isNoisy: true });
    for (let repetition = 0; repetition < 6; repetition++) trace.push(...types[phase % typeCount]);
  }
  return trace;
}
function runTrace(trace, bits, allocationFilter) {
  const predictor = BranchBook.predictors.createTage({ tableIndexBits: bits, baseIndexBits: 6, historyLengths: [4, 8, 16, 32], allocationFilter });
  return { ...BranchBook.runPredictor(predictor, trace), ...predictor.statistics() };
}
function drawLines(context, width, height, series, maximum, label) {
  const chart = BranchBook.drawChart(context, { x: 48, y: 20, width: width - 64, height: height - 70 }, { xMinimum: 0, xMaximum: Math.max(1, series[0].length - 1), yMinimum: 0, yMaximum: maximum, xTicks: 4, yTicks: 4, xLabel: label });
  series.forEach((values, seriesIndex) => BranchBook.drawLine(context, chart, values.map((value, index) => [index, value]), BranchBook.palette().series[seriesIndex]));
}
function bars(context, width, palette, rows, top = 20, maximum = null) {
  const limit = maximum || Math.max(1, ...rows.map((row) => row.value));
  rows.forEach((row, index) => {
    const y = top + index * 65;
    context.font = '12px ' + palette.font;
    context.fillStyle = palette.text;
    context.fillText(row.label + ': ' + row.value.toLocaleString('en-US', { maximumFractionDigits: 1 }), 12, y);
    context.fillStyle = row.color || palette.series[index % 4];
    context.fillRect(12, y + 10, (width - 24) * row.value / limit, 23);
  });
}

(function setupEviction() {
  let results = [];
  const canvas = BranchBook.createCanvas('eviction-canvas', (context, width, height, palette) => {
    if (!results.length) return;
    // 요청 A 구간을 음영으로 표시하고 20개 분기 단위 정확도를 그린다.
    const phaseCount = 72;
    for (let phase = 0; phase < phaseCount; phase += number('eviction-types')) {
      context.fillStyle = palette.accentSoft;
      context.fillRect(48 + phase / phaseCount * (width - 64), 20, (width - 64) / phaseCount, height - 70);
    }
    drawLines(context, width, height, results.map((result) => Array.from({ length: 432 }, (_, index) => result.isCorrectList.slice(index * 20, index * 20 + 20).reduce((sum, correct) => sum + correct, 0) * 5)), 100, '분기 20개씩 · 실행 순서');
  });
  function refresh() {
    const trace = makeTrace(number('eviction-types'));
    results = [runTrace(trace, number('eviction-size')), runTrace(trace, 8)];
    const selected = results[0];
    const recent = selected.isCorrectList.slice(4320);
    const first = [], settled = [];
    recent.forEach((correct, index) => (index % 120 < 40 ? first : settled).push(correct));
    const accuracy = (values) => BranchBook.formatPercent(values.reduce((sum, correct) => sum + correct, 0) / values.length);
    display('eviction-accuracy', BranchBook.formatPercent(selected.accuracy));
    display('eviction-revisit', accuracy(first)); display('eviction-settled', accuracy(settled));
    display('eviction-allocations', selected.allocationCount.toLocaleString());
    canvas.redraw();
  }
  ranges(['eviction-types', 'eviction-size'], refresh, { 'eviction-size': (value) => (2 ** value) + '칸 / 표' });
  refresh();
})();

(function setupFormula() {
  const formulas = enumerateFormulas();
  const searchRandom = BranchBook.createRandom(51);
  const shares = [0.001, 0.003, 0.01, 0.03, 0.1, 0.3, 1];
  let branchKind = 'correlated';
  let firstOperator = 'and', secondOperator = 'and';
  let currentRows = [];
  const inputs = ['first', 'second', 'third'].map((position, index) => {
    const select = document.getElementById('formula-input-' + position);
    select.innerHTML = (index === 2 ? '<option value="-1">사용 안 함</option>' : '') + Array.from({ length: 8 }, (_, bitIndex) => '<option value="' + bitIndex + '">h' + bitIndex + '</option>').join('');
    select.value = String([4, 5, -1][index]); select.addEventListener('change', refresh); return select;
  });
  function currentFormula() { return { bitIndexes: inputs.map((select) => Number(select.value)).filter((value) => value >= 0), firstOperator, secondOperator, isInverted: document.getElementById('formula-inverted').checked }; }
  const canvas = BranchBook.createCanvas('formula-canvas', (context, width, height, palette) => {
    currentRows.forEach((row, index) => {
      const y = 25 + index * 37;
      context.font = '12px ' + palette.mono; context.fillStyle = palette.text;
      context.fillText(row.bits + ' → ' + (row.prediction ? 'T' : 'N'), 8, y);
      const available = Math.max(20, width - 125);
      const total = row.taken + row.notTaken;
      if (!total) return;
      context.fillStyle = palette.taken; context.fillRect(112, y - 14, available * row.taken / 100, 21);
      context.fillStyle = palette.notTaken; context.fillRect(112 + available * row.taken / 100, y - 14, available * row.notTaken / 100, 21);
      const errors = row.prediction ? row.notTaken : row.taken;
      context.strokeStyle = palette.mispredict;
      if (errors) context.strokeRect(112 + (row.prediction ? available * row.taken / 100 : 0), y - 14, available * errors / 100, 21);
    });
  });
  function refresh() {
    const formula = currentFormula();
    const train = buildProfile(branchKind, 21, 0.06), test = buildProfile(branchKind, 77, 0.06);
    const baseline = Math.min(train.takenTotal, SAMPLE_COUNT - train.takenTotal);
    const testBaseline = Math.min(test.takenTotal, SAMPLE_COUNT - test.takenTotal);
    const cost = countMispredictions(formula, train), testCost = countMispredictions(formula, test);
    let expression = '(h' + formula.bitIndexes[0] + ' ' + OPERATORS[firstOperator].symbol + ' h' + formula.bitIndexes[1] + ')';
    if (formula.bitIndexes.length === 3) expression = '(' + expression + ' ' + OPERATORS[secondOperator].symbol + ' h' + formula.bitIndexes[2] + ')';
    display('formula-text', (formula.isInverted ? 'NOT ' : '') + expression);
    document.getElementById('formula-second-operator-control').hidden = formula.bitIndexes.length < 3;
    display('formula-baseline', baseline + ' / 400'); display('formula-cost', cost + ' / 400');
    display('formula-gain', BranchBook.formatPercent((baseline - cost) / baseline));
    display('formula-test-gain', BranchBook.formatPercent((testBaseline - testCost) / testBaseline));
    currentRows = Array.from({ length: 2 ** formula.bitIndexes.length }, (_, pattern) => ({ bits: pattern.toString(2).padStart(formula.bitIndexes.length, '0'), taken: 0, notTaken: 0, prediction: false }));
    for (let historyKey = 0; historyKey < 256; historyKey++) {
      const pattern = formula.bitIndexes.reduce((value, bitIndex) => value * 2 + ((historyKey >> bitIndex) & 1), 0);
      const row = currentRows[pattern]; row.taken += train.takenCounts[historyKey]; row.notTaken += train.notTakenCounts[historyKey]; row.prediction = evaluateFormula(formula, historyKey);
    }
    // 최대 줄의 표본 수로 막대 길이를 정규화한다.
    const maximum = Math.max(1, ...currentRows.map((row) => row.taken + row.notTaken));
    currentRows.forEach((row) => { row.taken = row.taken * 100 / maximum; row.notTaken = row.notTaken * 100 / maximum; });
    canvas.redraw();
  }
  const firstControl = BranchBook.bindSegmented('formula-first-operator', (value) => { firstOperator = value; refresh(); });
  const secondControl = BranchBook.bindSegmented('formula-second-operator', (value) => { secondOperator = value; refresh(); });
  BranchBook.bindSegmented('formula-branch', (value) => { branchKind = value; display('formula-report', ''); refresh(); });
  BranchBook.bindCheckbox('formula-inverted', refresh);
  ranges(['formula-share'], () => {}, { 'formula-share': (value) => BranchBook.formatPercent(shares[value]) });
  function search(exhaustive) {
    const train = buildProfile(branchKind, 21, 0.06);
    const pool = formulas.slice();
    if (!exhaustive) {
      for (let position = pool.length - 1; position > 0; position--) {
        const chosen = Math.floor(searchRandom() * (position + 1));
        [pool[position], pool[chosen]] = [pool[chosen], pool[position]];
      }
      pool.length = Math.max(1, Math.round(formulas.length * shares[number('formula-share')]));
    }
    let best = pool[0], bestCost = Infinity;
    pool.forEach((formula) => { const cost = countMispredictions(formula, train); if (cost < bestCost) { best = formula; bestCost = cost; } });
    inputs.forEach((select, index) => { select.value = String(best.bitIndexes[index] ?? -1); });
    firstOperator = best.firstOperator; secondOperator = best.secondOperator;
    firstControl.set(firstOperator); secondControl.set(secondOperator);
    document.getElementById('formula-inverted').checked = best.isInverted;
    display('formula-report', pool.length.toLocaleString() + '개 식을 비교했다. 다른 입력의 결과도 확인하자.'); refresh();
  }
  BranchBook.bindButton('formula-random-search', () => search(false));
  BranchBook.bindButton('formula-exhaustive-search', () => search(true));
  refresh();
})();

(function setupPrefetch() {
  let result = null;
  const canvas = BranchBook.createCanvas('prefetch-canvas', (context, width, height, palette) => {
    if (!result) return;
    const resetIndex = Math.max(3, result.contexts.findIndex((entry) => entry.isAfterReset));
    const shown = result.contexts.slice(resetIndex - 3, resetIndex + 8);
    const start = Math.max(0, shown[0].startTime - 12), end = shown[shown.length - 1].endTime + 12;
    const position = (time) => 42 + (time - start) / (end - start) * (width - 55);
    context.font = '11px ' + palette.mono;
    shown.forEach((entry, index) => {
      const request = result.requests[entry.contextIndex];
      const outcome = result.outcomes[entry.contextIndex];
      const y = 22 + index * 23;
      context.fillStyle = palette.text; context.fillText('C' + entry.contextIndex, 2, y + 8);
      context.fillStyle = palette.surfaceStrong; context.fillRect(position(entry.startTime), y, position(entry.endTime) - position(entry.startTime), 14);
      context.strokeStyle = request.wasSquashed ? palette.mispredict : palette.textFaint;
      context.beginPath(); context.moveTo(position(Math.max(start, request.issueTime)), y + 6); context.lineTo(position(request.arrivalTime), y + 6); context.stroke();
      context.fillStyle = outcome.status === 'timely' ? palette.series[0] : palette.series[1];
      context.fillRect(position(request.arrivalTime) - 2, y, 4, 14);
      if (entry.isAfterReset) { context.fillStyle = palette.mispredict; context.fillText('✕', position(entry.startTime) - 8, y - 2); }
    });
    context.fillStyle = palette.textDim; context.fillText('시간 → · 막대: 활성 문맥 / 점: 도착', 10, height - 12);
  });
  function refresh() {
    result = simulate(number('prefetch-distance'), number('prefetch-latency'), number('prefetch-reset'));
    display('prefetch-timely', BranchBook.formatPercent(result.timelyShare)); display('prefetch-late', BranchBook.formatPercent(result.lateShare));
    display('prefetch-wasted', BranchBook.formatPercent(result.wastedShare)); display('prefetch-gain', BranchBook.formatPercent(result.survivingGain)); canvas.redraw();
  }
  ranges(['prefetch-distance', 'prefetch-latency', 'prefetch-reset'], refresh); refresh();
})();

(function setupDepth() {
  const program = buildProgram();
  let mode = 'fixed', result = null;
  function evaluate(level, adaptive) {
    const sizes = []; let duplicates = 0;
    program.forEach((site) => {
      let shortCopies = 0;
      groupPaths(site.paths, adaptive ? SHALLOW_LEVEL_INDEX : level).forEach((paths) => {
        if (adaptive && site.shortPatternCount + sumLongPatterns(paths) > PATTERN_SET_LIMIT) {
          groupPaths(paths, DEEP_LEVEL_INDEX).forEach((group) => sizes.push(sumLongPatterns(group)));
        } else { sizes.push(site.shortPatternCount + sumLongPatterns(paths)); shortCopies++; }
      });
      duplicates += site.shortPatternCount * Math.max(0, shortCopies - 1);
    });
    return { sizes, duplicates, lost: sizes.reduce((sum, size) => sum + Math.max(0, size - PATTERN_SET_LIMIT), 0), overflow: sizes.filter((size) => size > PATTERN_SET_LIMIT).length };
  }
  const sweep = DEPTH_LEVELS.map((depth, index) => evaluate(index, false));
  const canvas = BranchBook.createCanvas('depth-canvas', (context, width, height, palette) => {
    if (!result) return;
    const sorted = result.sizes.slice().sort((first, second) => second - first);
    const chart = BranchBook.drawChart(context, { x: 45, y: 20, width: width - 85, height: 170 }, { xMinimum: 0, xMaximum: sorted.length, yMinimum: 0, yMaximum: Math.max(20, sorted[0]), xTicks: 3, yTicks: 4, xFormat: (value) => Math.round(value).toLocaleString(), xLabel: '문맥 (필요한 패턴 수 내림차순)' });
    BranchBook.drawLine(context, chart, sorted.map((size, index) => [index, size]), palette.series[0]);
    BranchBook.drawLine(context, chart, [[0, 16], [sorted.length, 16]], palette.mispredict, { dashed: true });
    bars(context, width, palette, [{ label: '✕ 넘쳐서 못 담은 패턴', value: result.lost }, { label: '중복 저장된 패턴', value: result.duplicates }], 265, Math.max(...sweep.flatMap((entry) => [entry.lost, entry.duplicates])));
  });
  function refresh() {
    result = evaluate(number('depth-level'), mode === 'adaptive');
    document.getElementById('depth-level').disabled = mode === 'adaptive';
    display('depth-contexts', result.sizes.length.toLocaleString()); display('depth-overflow', result.overflow.toLocaleString());
    display('depth-lost', result.lost.toLocaleString()); display('depth-duplicates', result.duplicates.toLocaleString()); canvas.redraw();
  }
  BranchBook.bindSegmented('depth-mode', (value) => { mode = value; refresh(); });
  ranges(['depth-level'], refresh, { 'depth-level': (value) => DEPTH_LEVELS[value] }); refresh();
})();

(function setupRejection() {
  let records = [];
  const canvas = BranchBook.createCanvas('rejection-canvas', (context, width, height, palette) => {
    if (!records.length) return;
    bars(context, width, palette, records.map((record, index) => ({ label: (index ? '거절 적용' : '보통 TAGE') + ' · 학습 가능 정확도 %', value: record.learnAccuracy * 100 })), 22, 100);
    bars(context, width, palette, records.map((record, index) => ({ label: (index ? '거절 적용' : '보통 TAGE') + ' · 할당 횟수', value: record.allocationCount })), 182, Math.max(...records.map((record) => record.allocationCount)));
    context.fillStyle = palette.mispredict; context.font = '12px ' + palette.font;
    context.fillText('✕ 거절한 할당: ' + records[1].rejectedAllocationCount, 12, height - 18);
  });
  function refresh() {
    const trace = makeTrace(6, number('rejection-share') / 100), errorCount = number('rejection-error');
    const filter = (address) => address < 0x800 ? (address - 0x400) / 4 >= errorCount : (address - 0x800) / 4 < Math.round(4 * errorCount / 6);
    records = [runTrace(trace, number('rejection-size')), runTrace(trace, number('rejection-size'), filter)].map((result) => {
      let learnCount = 0, learnCorrect = 0, noiseCount = 0, noiseCorrect = 0;
      trace.forEach((branch, index) => { if (branch.isNoisy) { noiseCount++; noiseCorrect += result.isCorrectList[index]; } else { learnCount++; learnCorrect += result.isCorrectList[index]; } });
      return { ...result, learnMisses: learnCount - learnCorrect, learnAccuracy: learnCorrect / learnCount, noiseAccuracy: noiseCount ? noiseCorrect / noiseCount : null };
    });
    display('rejection-normal-misses', records[0].learnMisses); display('rejection-filtered-misses', records[1].learnMisses);
    display('rejection-occupancy', records.map((record) => BranchBook.formatPercent(record.occupiedEntries.reduce((sum, count) => sum + count, 0) / (4 * record.tableSize))).join(' → '));
    display('rejection-noise-accuracy', records.map((record) => record.noiseAccuracy === null ? '해당 없음' : BranchBook.formatPercent(record.noiseAccuracy)).join(' → ')); canvas.redraw();
  }
  ranges(['rejection-share', 'rejection-size', 'rejection-error'], refresh, { 'rejection-share': (value) => value + '%', 'rejection-size': (value) => 2 ** value + '칸 / 표' }); refresh();
})();

BranchBook.renderQuiz('chapter-quiz', [
  { question: 'Whisper가 여러 history 패턴을 적는 방법은?', options: ['패턴마다 전용 코어를 둔다', 'Offline에서 찾은 Boolean 식을 hint로 전달한다', '분기 방향을 무작위로 고른다'], answerIndex: 1, explanation: '간결한 식으로 여러 패턴을 표현한다. Profile 수집과 코드 수정이 필요하다.' },
  { question: 'LLBP의 큰 저장소에 패턴이 있는데도 못 쓰는 이유는?', options: ['Pattern Buffer에 제때 도착하지 않았다', '큰 표는 항상 정확도가 낮다', '모든 분기가 값에 좌우된다'], answerIndex: 0, explanation: '용량뿐 아니라 prefetch의 적시성도 필요하다. 너무 일찍 오면 사용 전에 밀려날 수도 있다.' },
  { question: 'LLBP-X에서 문맥을 무조건 깊게 나누면?', options: ['비용이 없다', '모든 패턴이 사라진다', '짧은 패턴이 여러 문맥에 중복될 수 있다'], answerIndex: 2, explanation: '몰리는 문맥을 나누는 이득과 짧은 패턴을 복제하는 비용을 함께 고려한다.' },
  { question: '이 장의 PURE 실험에서 필터가 학습 가능한 분기를 잘못 거절하면?', options: ['학습 기회를 잃을 수 있다', '무조건 정확도가 오른다', '표 크기가 자동으로 늘어난다'], answerIndex: 0, explanation: '실험은 oracle 필터의 발상을 보여 준다. PURE의 실제 구현을 재현한 것이 아니다.' }
]);
})();
