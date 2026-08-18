/* AICoding 能力成熟度模型 - 图表逻辑 */
(function () {
  var style = getComputedStyle(document.documentElement);
  var accent = style.getPropertyValue('--accent').trim();
  var accent2 = style.getPropertyValue('--accent2').trim();
  var ink = style.getPropertyValue('--ink').trim();
  var muted = style.getPropertyValue('--muted').trim();
  var rule = style.getPropertyValue('--rule').trim();
  var bg2 = style.getPropertyValue('--bg2').trim();

  /* 雷达图：各实践域实践条目分级剖面（示例组织，15 个 PA） */
  var radarEl = document.getElementById('chart-radar');
  if (radarEl) {
    var radar = echarts.init(radarEl, null, { renderer: 'svg' });
    radar.setOption({
      animation: false,
      tooltip: { appendToBody: true },
      legend: {
        data: ['当前组织评估', '目标等级(ML3)'],
        top: 0,
        textStyle: { color: muted, fontSize: 12 }
      },
      radar: {
        indicator: [
          { name: 'AAR 需求分析', max: 3 },
          { name: 'AAD 辅助设计', max: 3 },
          { name: 'ACG 代码生成', max: 3 },
          { name: 'ACR 代码审查', max: 3 },
          { name: 'AAT 辅助测试', max: 3 },
          { name: 'APC 规划监控', max: 3 },
          { name: 'ARS 风险机会', max: 3 },
          { name: 'AGV 编码治理', max: 3 },
          { name: 'APT 提示词管理', max: 3 },
          { name: 'ATI 工具链集成', max: 3 },
          { name: 'AKM 知识管理', max: 3 },
          { name: 'ATE 培训赋能', max: 3 },
          { name: 'AMP 效能度量', max: 3 },
          { name: 'ACI 持续改进', max: 3 },
          { name: 'ACA 根因分析', max: 3 }
        ],
        center: ['50%', '55%'],
        radius: '62%',
        axisName: { color: ink, fontSize: 10 },
        splitLine: { lineStyle: { color: rule } },
        splitArea: { areaStyle: { color: ['transparent', bg2] } },
        axisLine: { lineStyle: { color: rule } }
      },
      series: [{
        type: 'radar',
        data: [
          {
            value: [1, 1, 2, 1, 1, 1, 0, 1, 1, 2, 0, 1, 1, 0, 0],
            name: '当前组织评估',
            areaStyle: { color: accent + '33' },
            lineStyle: { color: accent, width: 2 },
            itemStyle: { color: accent }
          },
          {
            value: [3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3],
            name: '目标等级(ML3)',
            areaStyle: { color: accent2 + '22' },
            lineStyle: { color: accent2, width: 2, type: 'dashed' },
            itemStyle: { color: accent2 }
          }
        ]
      }]
    });
    window.addEventListener('resize', function () { radar.resize(); });
  }

  /* 柱状图：关键指标目标值随等级变化 */
  var barEl = document.getElementById('chart-bar');
  if (barEl) {
    var bar = echarts.init(barEl, null, { renderer: 'svg' });
    bar.setOption({
      animation: false,
      tooltip: { appendToBody: true, trigger: 'axis' },
      legend: {
        data: ['AI代码采纳率(%)', 'AI代码贡献占比(%)', '开发周期缩短率(%)'],
        top: 0,
        textStyle: { color: muted, fontSize: 12 }
      },
      grid: { left: 50, right: 30, top: 50, bottom: 40 },
      xAxis: {
        type: 'category',
        data: ['ML2', 'ML3', 'ML4', 'ML5'],
        axisLine: { lineStyle: { color: rule } },
        axisLabel: { color: muted, fontSize: 12 }
      },
      yAxis: {
        type: 'value',
        max: 60,
        axisLine: { lineStyle: { color: rule } },
        axisLabel: { color: muted, fontSize: 11, formatter: '{value}%' },
        splitLine: { lineStyle: { color: rule } }
      },
      series: [
        {
          name: 'AI代码采纳率(%)',
          type: 'bar',
          data: [20, 35, 50, 55],
          itemStyle: { color: accent },
          barWidth: '18%'
        },
        {
          name: 'AI代码贡献占比(%)',
          type: 'bar',
          data: [8, 15, 30, 40],
          itemStyle: { color: accent2 },
          barWidth: '18%'
        },
        {
          name: '开发周期缩短率(%)',
          type: 'bar',
          data: [null, 15, 25, 35],
          itemStyle: { color: muted },
          barWidth: '18%'
        }
      ]
    });
    window.addEventListener('resize', function () { bar.resize(); });
  }

  /* 堆叠柱状图：各级别实践域覆盖数量 */
  var stackEl = document.getElementById('chart-stack');
  if (stackEl) {
    var stack = echarts.init(stackEl, null, { renderer: 'svg' });
    stack.setOption({
      animation: false,
      tooltip: { appendToBody: true, trigger: 'axis' },
      legend: {
        data: ['执行类', '管理类', '支撑类', '改进类'],
        top: 0,
        textStyle: { color: muted, fontSize: 12 }
      },
      grid: { left: 50, right: 30, top: 50, bottom: 40 },
      xAxis: {
        type: 'category',
        data: ['ML1', 'ML2', 'ML3', 'ML4', 'ML5'],
        axisLine: { lineStyle: { color: rule } },
        axisLabel: { color: muted, fontSize: 12 }
      },
      yAxis: {
        type: 'value',
        name: '实践条目数',
        nameTextStyle: { color: muted, fontSize: 11 },
        axisLine: { lineStyle: { color: rule } },
        axisLabel: { color: muted, fontSize: 11 },
        splitLine: { lineStyle: { color: rule } }
      },
      series: [
        { name: '执行类', type: 'bar', stack: 'total', data: [5, 10, 15, 15, 15], itemStyle: { color: accent } },
        { name: '管理类', type: 'bar', stack: 'total', data: [3, 6, 9, 9, 9], itemStyle: { color: accent2 } },
        { name: '支撑类', type: 'bar', stack: 'total', data: [4, 8, 12, 12, 12], itemStyle: { color: accent + '99' } },
        { name: '改进类', type: 'bar', stack: 'total', data: [3, 6, 9, 12, 14], itemStyle: { color: muted } }
      ]
    });
    window.addEventListener('resize', function () { stack.resize(); });
  }
})();
