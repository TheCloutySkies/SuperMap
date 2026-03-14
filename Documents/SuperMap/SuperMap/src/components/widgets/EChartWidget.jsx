import * as echarts from 'echarts'
import { useEffect, useRef } from 'react'
import './EChartWidget.css'

const DARK_THEME = {
  backgroundColor: 'transparent',
  textStyle: { color: 'var(--y2k-text-muted)' },
  title: { textStyle: { color: 'var(--y2k-text)' } },
  line: { itemStyle: { borderColor: 'var(--y2k-surface)' }, lineStyle: {}, areaStyle: {} },
  bar: { itemStyle: {} },
  categoryAxis: { axisLine: { lineStyle: { color: 'var(--y2k-border)' } }, axisLabel: { color: 'var(--y2k-text-muted)' }, splitLine: { show: false } },
  valueAxis: { axisLine: { show: false }, axisLabel: { color: 'var(--y2k-text-muted)' }, splitLine: { lineStyle: { color: 'var(--y2k-border)', type: 'dashed' } } },
}

function mergeWithDark(option) {
  return {
    backgroundColor: 'transparent',
    textStyle: { color: 'var(--y2k-text-muted)', fontSize: 11 },
    grid: { left: 40, right: 16, top: 16, bottom: 28, containLabel: false },
    xAxis: { type: 'category', axisLine: { lineStyle: { color: 'var(--y2k-border)' } }, axisLabel: { color: 'var(--y2k-text-muted)', fontSize: 10 }, ...option.xAxis },
    yAxis: { type: 'value', axisLine: { show: false }, axisLabel: { color: 'var(--y2k-text-muted)', fontSize: 10 }, splitLine: { lineStyle: { color: 'var(--y2k-border)', type: 'dashed', opacity: 0.5 } }, ...option.yAxis },
    series: Array.isArray(option.series) ? option.series.map((s) => ({
      ...s,
      lineStyle: s.lineStyle || { color: 'var(--y2k-accent)' },
      itemStyle: s.itemStyle || { borderColor: 'var(--y2k-surface)' },
      areaStyle: s.areaStyle || { opacity: 0.15 },
    })) : [{ ...option.series, lineStyle: { color: 'var(--y2k-accent)' }, itemStyle: { borderColor: 'var(--y2k-surface)' } }],
    ...option,
  }
}

export default function EChartWidget({ option, height = '180px' }) {
  const chartRef = useRef(null)

  useEffect(() => {
    if (!chartRef.current || !option) return
    const chart = echarts.init(chartRef.current, null, { renderer: 'canvas' })
    const merged = mergeWithDark(option)
    chart.setOption(merged)

    const onResize = () => chart.resize()
    window.addEventListener('resize', onResize)
    return () => {
      window.removeEventListener('resize', onResize)
      chart.dispose()
    }
  }, [option])

  return <div ref={chartRef} className="echart-widget" style={{ height }} />
}
