// DS 帧率卡顿定位看板 - 示意图表
(function () {
  var style = getComputedStyle(document.documentElement);
  var accent = style.getPropertyValue('--accent').trim();
  var accent2 = style.getPropertyValue('--accent2').trim();
  var ink = style.getPropertyValue('--ink').trim();
  var muted = style.getPropertyValue('--muted').trim();
  var rule = style.getPropertyValue('--rule').trim();
  var bg2 = style.getPropertyValue('--bg2').trim();

  var baseGrid = { left: 48, right: 20, top: 36, bottom: 30 };
  var axisText = { color: muted, fontSize: 11 };
  var splitLine = { lineStyle: { color: rule, type: 'dashed' } };

  function tmSeq(n, start, stepSec) {
    var arr = [];
    var t0 = new Date('2026-07-13T20:00:00').getTime();
    for (var i = 0; i < n; i++) {
      var d = new Date(t0 + i * stepSec * 1000);
      arr.push(('0' + d.getHours()).slice(-2) + ':' + ('0' + d.getMinutes()).slice(-2) + ':' + ('0' + d.getSeconds()).slice(-2));
    }
    return arr;
  }

  // --- 图1: 帧率 + 帧时分位 组合面板 ---
  (function () {
    var el = document.getElementById('chart-framerate');
    if (!el) return;
    var chart = echarts.init(el, null, { renderer: 'svg' });
    var x = tmSeq(30, 0, 10);
    var fps = [30, 30, 29, 30, 28, 22, 18, 25, 30, 30, 29, 27, 15, 12, 20, 28, 30, 30, 29, 30, 26, 19, 14, 24, 29, 30, 30, 28, 30, 29];
    var p99 = [34, 34, 36, 34, 40, 62, 95, 55, 34, 35, 38, 45, 120, 145, 70, 40, 33, 34, 36, 34, 48, 78, 130, 58, 36, 34, 34, 44, 33, 35];
    var p95 = [33, 33, 34, 33, 36, 45, 60, 42, 33, 34, 35, 40, 72, 88, 52, 36, 33, 33, 34, 33, 40, 55, 82, 44, 34, 33, 33, 40, 33, 34];
    chart.setOption({
      animation: false,
      grid: baseGrid,
      legend: { data: ['帧率(fps)', 'P95帧时(ms)', 'P99帧时(ms)'], textStyle: { color: muted, fontSize: 11 }, top: 4 },
      tooltip: { trigger: 'axis', appendToBody: true },
      xAxis: { type: 'category', data: x, axisLabel: axisText, axisLine: { lineStyle: { color: rule } } },
      yAxis: [
        { type: 'value', name: 'fps', nameTextStyle: axisText, axisLabel: axisText, splitLine: splitLine, min: 0, max: 35 },
        { type: 'value', name: 'ms', nameTextStyle: axisText, axisLabel: axisText, splitLine: { show: false }, position: 'right' }
      ],
      series: [
        { name: '帧率(fps)', type: 'line', smooth: true, data: fps, itemStyle: { color: accent }, areaStyle: { color: accent + '22' }, lineStyle: { width: 2 } },
        { name: 'P95帧时(ms)', type: 'line', smooth: true, yAxisIndex: 1, data: p95, itemStyle: { color: accent2 }, lineStyle: { width: 1.5 } },
        { name: 'P99帧时(ms)', type: 'line', smooth: true, yAxisIndex: 1, data: p99, itemStyle: { color: '#e2504f' }, lineStyle: { width: 1.5 } }
      ]
    });
    window.addEventListener('resize', function () { chart.resize(); });
  })();

  // --- 图2: 卡顿分档堆叠柱 ---
  (function () {
    var el = document.getElementById('chart-hitch');
    if (!el) return;
    var chart = echarts.init(el, null, { renderer: 'svg' });
    var x = tmSeq(20, 0, 10);
    function gen(base, spike) { return x.map(function (_, i) { return (i === 6 || i === 12) ? spike : Math.round(base * Math.random()); }); }
    chart.setOption({
      animation: false,
      grid: baseGrid,
      legend: { data: ['>50ms', '>70ms', '>100ms', '>150ms', '>200ms'], textStyle: { color: muted, fontSize: 11 }, top: 4 },
      tooltip: { trigger: 'axis', appendToBody: true, axisPointer: { type: 'shadow' } },
      xAxis: { type: 'category', data: x, axisLabel: axisText, axisLine: { lineStyle: { color: rule } } },
      yAxis: { type: 'value', name: '帧数', nameTextStyle: axisText, axisLabel: axisText, splitLine: splitLine },
      series: [
        { name: '>50ms', type: 'bar', stack: 'h', data: gen(3, 12), itemStyle: { color: accent + '88' } },
        { name: '>70ms', type: 'bar', stack: 'h', data: gen(2, 8), itemStyle: { color: accent } },
        { name: '>100ms', type: 'bar', stack: 'h', data: gen(1, 6), itemStyle: { color: accent2 } },
        { name: '>150ms', type: 'bar', stack: 'h', data: gen(1, 4), itemStyle: { color: '#e0873a' } },
        { name: '>200ms', type: 'bar', stack: 'h', data: gen(1, 3), itemStyle: { color: '#e2504f' } }
      ]
    });
    window.addEventListener('resize', function () { chart.resize(); });
  })();

  // --- 图3: GC 暂停 与 帧时 关联 ---
  (function () {
    var el = document.getElementById('chart-gc');
    if (!el) return;
    var chart = echarts.init(el, null, { renderer: 'svg' });
    var x = tmSeq(24, 0, 10);
    var gcPause = x.map(function (_, i) { return (i === 6 || i === 13 || i === 19) ? [95, 132, 78][[6, 13, 19].indexOf(i)] : Math.round(Math.random() * 12); });
    var p99 = x.map(function (_, i) { return (i === 6 || i === 13 || i === 19) ? [110, 150, 92][[6, 13, 19].indexOf(i)] : 32 + Math.round(Math.random() * 8); });
    chart.setOption({
      animation: false,
      grid: baseGrid,
      legend: { data: ['GC最大暂停(ms)', 'P99帧时(ms)'], textStyle: { color: muted, fontSize: 11 }, top: 4 },
      tooltip: { trigger: 'axis', appendToBody: true },
      xAxis: { type: 'category', data: x, axisLabel: axisText, axisLine: { lineStyle: { color: rule } } },
      yAxis: { type: 'value', name: 'ms', nameTextStyle: axisText, axisLabel: axisText, splitLine: splitLine },
      series: [
        { name: 'GC最大暂停(ms)', type: 'bar', data: gcPause, itemStyle: { color: accent2 } },
        { name: 'P99帧时(ms)', type: 'line', smooth: true, data: p99, itemStyle: { color: '#e2504f' }, lineStyle: { width: 1.5 } }
      ]
    });
    window.addEventListener('resize', function () { chart.resize(); });
  })();

  // --- 图4: 负载对象数与帧率 双轴 ---
  (function () {
    var el = document.getElementById('chart-load');
    if (!el) return;
    var chart = echarts.init(el, null, { renderer: 'svg' });
    var x = tmSeq(24, 0, 10);
    var chars = [20, 22, 25, 30, 38, 55, 78, 92, 96, 90, 70, 50, 60, 85, 110, 120, 95, 60, 40, 45, 58, 72, 66, 40];
    var fps = chars.map(function (c) { return Math.max(10, Math.round(30 - Math.max(0, c - 60) * 0.28)); });
    chart.setOption({
      animation: false,
      grid: baseGrid,
      legend: { data: ['敌人角色数', '帧率(fps)'], textStyle: { color: muted, fontSize: 11 }, top: 4 },
      tooltip: { trigger: 'axis', appendToBody: true },
      xAxis: { type: 'category', data: x, axisLabel: axisText, axisLine: { lineStyle: { color: rule } } },
      yAxis: [
        { type: 'value', name: '数量', nameTextStyle: axisText, axisLabel: axisText, splitLine: splitLine },
        { type: 'value', name: 'fps', nameTextStyle: axisText, axisLabel: axisText, splitLine: { show: false }, position: 'right', min: 0, max: 35 }
      ],
      series: [
        { name: '敌人角色数', type: 'line', smooth: true, data: chars, itemStyle: { color: accent2 }, areaStyle: { color: accent2 + '22' } },
        { name: '帧率(fps)', type: 'line', smooth: true, yAxisIndex: 1, data: fps, itemStyle: { color: accent }, lineStyle: { width: 2 } }
      ]
    });
    window.addEventListener('resize', function () { chart.resize(); });
  })();

  // --- 图5: CPU vs 人数 散点 + 分桶均值 ---
  (function () {
    var el = document.getElementById('chart-cpu-scatter');
    if (!el) return;
    var chart = echarts.init(el, null, { renderer: 'svg' });
    // 生成散点：人数 0~20，CPU 大致随人数线性上升 + 噪声
    var pts = [];
    for (var k = 0; k < 220; k++) {
      var n = Math.floor(Math.random() * 21);
      var cpu = 60 + n * 14 + (Math.random() - 0.5) * 40;
      pts.push([n, Math.max(30, Math.round(cpu))]);
    }
    // 分桶均值（每个整数人数的平均 CPU）
    var buckets = {};
    pts.forEach(function (p) { (buckets[p[0]] = buckets[p[0]] || []).push(p[1]); });
    var avgLine = Object.keys(buckets).map(function (k) {
      var arr = buckets[k]; var s = arr.reduce(function (a, b) { return a + b; }, 0);
      return [Number(k), Math.round(s / arr.length)];
    }).sort(function (a, b) { return a[0] - b[0]; });
    chart.setOption({
      animation: false,
      grid: { left: 52, right: 20, top: 36, bottom: 40 },
      legend: { data: ['采样点(人数,CPU)', '分桶平均CPU'], textStyle: { color: muted, fontSize: 11 }, top: 4 },
      tooltip: { trigger: 'item', appendToBody: true, formatter: function (p) { return '人数 ' + p.value[0] + ' → CPU ' + p.value[1] + '%'; } },
      xAxis: { type: 'value', name: '真人玩家数', nameLocation: 'middle', nameGap: 26, nameTextStyle: axisText, axisLabel: axisText, splitLine: splitLine, min: 0, max: 20 },
      yAxis: { type: 'value', name: 'CPU %', nameTextStyle: axisText, axisLabel: axisText, splitLine: splitLine },
      series: [
        { name: '采样点(人数,CPU)', type: 'scatter', data: pts, symbolSize: 7, itemStyle: { color: accent2 + '66' } },
        { name: '分桶平均CPU', type: 'line', data: avgLine, smooth: true, itemStyle: { color: '#e2504f' }, lineStyle: { width: 2.5 }, symbol: 'circle', symbolSize: 6 }
      ]
    });
    window.addEventListener('resize', function () { chart.resize(); });
  })();
})();
