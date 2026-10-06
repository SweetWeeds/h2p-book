/* 9장 실험: 논문 수치를 재현하지 않는 결정적 설명용 모형. */
(function () {
  'use strict';
  function number(identifier) { return Number(document.getElementById(identifier).value); }
  function display(identifier, value) { document.getElementById(identifier).textContent = value; }
  (function setupTiming() {
    const canvas = BranchBook.createCanvas('timing-canvas', (context, width, height, palette) => {
      const latency = number('timing-latency'), lead = number('timing-lead');
      const chart = BranchBook.drawChart(context, { x: 42, y: 45, width: width - 64, height: 185 }, { xMinimum: -6, xMaximum: 7, yMinimum: 0, yMaximum: 3, xTicks: [-6, -3, 0, 1, 3, 6], yTicks: [], xLabel: 'cycle · 빠른 답을 쓰는 시점 t = 1' });
      context.strokeStyle = palette.mispredict; context.setLineDash([4, 4]); context.beginPath(); context.moveTo(chart.toX(1), 35); context.lineTo(chart.toX(1), 230); context.stroke(); context.setLineDash([]);
      [{ label: '일반 조회', start: 0, finish: latency }, { label: '선행 조회', start: -lead, finish: latency - lead }].forEach((row, index) => {
        const y = 65 + index * 90;
        context.fillStyle = palette.text; context.font = '12px ' + palette.font; context.fillText(row.label, 42, y - 10);
        context.fillStyle = palette.series[index]; context.fillRect(chart.toX(row.start), y, chart.toX(row.finish) - chart.toX(row.start), 28);
        context.fillStyle = palette.textDim; context.fillText('도착 t=' + row.finish, Math.min(width - 85, chart.toX(row.finish)), y + 48);
      });
    });
    function refresh() {
      const remaining = Math.max(0, number('timing-latency') - number('timing-lead') - 1);
      display('timing-remaining', remaining + ' cycle');
      display('timing-baseline', number('timing-disagreement') * (number('timing-latency') - 1) + ' cycle');
      display('timing-ahead', number('timing-disagreement') * remaining + ' cycle'); canvas.redraw();
    }
    ['timing-latency', 'timing-lead', 'timing-disagreement'].forEach((identifier) => BranchBook.bindRange(identifier, (value) => value + (identifier.endsWith('disagreement') ? '%' : ' cycle'), refresh)); refresh();
  })();
  (function setupPatterns() {
    let counts = [];
    const randomControl = BranchBook.bindRange('patterns-random', String, refresh);
    const canvas = BranchBook.createCanvas('patterns-canvas', (context, width, height, palette) => {
      if (!counts.length) return;
      const columns = Math.min(16, Math.max(2, Math.floor((width - 20) / 35)));
      const rows = Math.ceil(counts.length / columns);
      const cellWidth = (width - 20) / columns, cellHeight = Math.min(48, (height - 40) / rows);
      counts.forEach((count, index) => {
        const x = 10 + (index % columns) * cellWidth, y = 10 + Math.floor(index / columns) * cellHeight;
        context.fillStyle = count ? palette.accent : palette.surfaceStrong; context.fillRect(x + 1, y + 1, cellWidth - 2, cellHeight - 2);
        if (cellHeight >= 20) { context.fillStyle = count ? palette.elevated : palette.textDim; context.font = '11px ' + palette.mono; context.textAlign = 'center'; context.fillText(String(count), x + cellWidth / 2, y + cellHeight / 2 + 4); }
      });
      context.textAlign = 'left'; context.fillStyle = palette.textDim; context.font = '12px ' + palette.font; context.fillText('색 있는 칸: 관찰된 방향 조합', 10, height - 8);
    }, { heightForWidth: (width) => Math.max(300, Math.ceil(256 / Math.min(16, Math.max(2, Math.floor((width - 20) / 35)))) * 10 + 40) });
    function refresh() {
      const distance = number('patterns-distance');
      randomControl.input.max = String(distance); randomControl.set(Math.min(randomControl.value, distance));
      const uncertain = randomControl.value, random = BranchBook.createRandom(19);
      counts = new Array(2 ** distance).fill(0);
      for (let sample = 0; sample < 512; sample++) {
        let pattern = 0;
        for (let branchIndex = 0; branchIndex < distance; branchIndex++) pattern = pattern * 2 + (branchIndex < uncertain ? Number(random() < 0.5) : branchIndex % 2);
        counts[pattern]++;
      }
      const observed = counts.filter((count) => count > 0).length;
      display('patterns-possible', counts.length); display('patterns-observed', observed); display('patterns-share', BranchBook.formatPercent(observed / counts.length)); canvas.redraw();
    }
    BranchBook.bindRange('patterns-distance', String, refresh); refresh();
  })();
  (function setupTags() {
    const entries = [
      { table: 'T1', length: 4, primary: true, secondary: '00', taken: true },
      { table: 'T2', length: 8, primary: true, secondary: '01', taken: false },
      { table: 'T3', length: 16, primary: true, secondary: '11', taken: false },
      { table: 'T4', length: 32, primary: false, secondary: '11', taken: true },
      { table: 'T5', length: 64, primary: true, secondary: '00', taken: false },
    ];
    let history = '00';
    function refresh() {
      const changed = document.getElementById('tags-primary').checked;
      const matching = entries.filter((entry) => !changed && entry.primary && entry.secondary === history);
      const provider = matching[matching.length - 1];
      document.getElementById('tags-rows').innerHTML = entries.map((entry) => {
        const status = changed || !entry.primary ? '앞쪽 문맥 불일치' : entry.secondary !== history ? '중간 경로 불일치' : entry === provider ? '✓ 선택' : '더 긴 후보가 있음';
        return '<tr' + (entry === provider ? ' style="background:var(--accent-soft)"' : '') + '><td>' + entry.table + '</td><td>' + entry.length + '</td><td>' + (!changed && entry.primary ? '일치' : '불일치') + '</td><td>' + entry.secondary + '</td><td>' + (entry.taken ? 'T' : 'N') + '</td><td>' + status + '</td></tr>';
      }).join('');
      display('tags-provider', provider ? provider.table : 'T0 (기본)'); display('tags-result', provider ? (provider.taken ? 'T · taken' : 'N · not-taken') : 'T · taken');
    }
    BranchBook.bindSegmented('tags-history', (value) => { history = value; refresh(); }); BranchBook.bindCheckbox('tags-primary', refresh); refresh();
  })();
  BranchBook.renderQuiz('chapter-quiz', [
    { question: '선행 조회를 시작할 때 모르는 정보는?', options: ['이미 지나간 전체 history', '조회 시작과 목표 분기 사이의 경로', '예측기의 표 크기'], answerIndex: 1, explanation: 'Missing history를 모르므로 여러 후보를 준비하고 나중에 선택한다.' },
    { question: 'Secondary tag가 일치하지만 primary tag가 틀린 entry는?', options: ['가장 긴 history면 쓴다', 'Taken일 때만 쓴다', '다른 앞쪽 문맥의 entry이므로 제외한다'], answerIndex: 2, explanation: '두 tag가 모두 맞아야 현재 문맥과 중간 경로에 맞는 후보가 된다.' },
    { question: '가능한 조합이 32개에서 관찰된 2개로 줄면 에너지도 정확히 1/16인가?', options: ['아니다. 표 읽기 외에 tag·선택 회로·queue 비용도 있다', '항상 그렇다', 'IPC가 정확히 16배 오른다'], answerIndex: 0, explanation: '경로의 희소성은 설계의 기회다. 에너지와 성능은 전체 구현과 workload로 평가해야 한다.' }
  ]);
})();
