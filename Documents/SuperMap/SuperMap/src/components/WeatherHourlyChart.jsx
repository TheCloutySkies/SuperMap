import { Area, Bar, CartesianGrid, ComposedChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'

function ChartTip({ active, payload, label, tempUnit }) {
  if (!active || !payload?.length) return null
  const temp = payload.find((p) => p.dataKey === 'temp')
  const precip = payload.find((p) => p.dataKey === 'precip')
  return (
    <div className="weather-chart-tip">
      <strong>{label}</strong>
      <span>
        {temp?.value != null ? `${Math.round(temp.value)}°${tempUnit}` : '—'}
      </span>
      <span>
        {precip?.value != null ? `${Math.round(precip.value)}% precip` : ''}
      </span>
    </div>
  )
}

export default function WeatherHourlyChart({ data, tempUnit }) {
  if (!data?.length) {
    return <p className="weather-desk-status">No hourly series for this location.</p>
  }
  return (
    <div className="weather-hourly-chart">
      <ResponsiveContainer width="100%" height={188}>
        <ComposedChart data={data} margin={{ top: 10, right: 8, left: -18, bottom: 0 }}>
          <defs>
            <linearGradient id="wxTempFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#7ee0ad" stopOpacity={0.55} />
              <stop offset="100%" stopColor="#7ee0ad" stopOpacity={0.06} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke="rgba(120, 170, 140, 0.12)" vertical={false} strokeDasharray="3 6" />
          <XAxis
            dataKey="hour"
            tick={{ fill: '#8aa396', fontSize: 11 }}
            axisLine={false}
            tickLine={false}
            interval="preserveStartEnd"
            minTickGap={28}
          />
          <YAxis
            yAxisId="temp"
            tick={{ fill: '#8aa396', fontSize: 11 }}
            axisLine={false}
            tickLine={false}
            width={44}
            domain={[(min) => Math.floor(min - 3), (max) => Math.ceil(max + 3)]}
            tickFormatter={(v) => `${Math.round(v)}°`}
          />
          <YAxis yAxisId="precip" orientation="right" domain={[0, 100]} hide />
          <Tooltip
            content={<ChartTip tempUnit={tempUnit} />}
            cursor={{ stroke: 'rgba(126, 224, 173, 0.35)', strokeWidth: 1 }}
          />
          <Bar
            yAxisId="precip"
            dataKey="precip"
            fill="rgba(96, 168, 220, 0.32)"
            radius={[3, 3, 0, 0]}
            maxBarSize={16}
            name="Precip %"
          />
          <Area
            yAxisId="temp"
            type="monotone"
            dataKey="temp"
            stroke="#7ee0ad"
            fill="url(#wxTempFill)"
            strokeWidth={2.2}
            name="Temp"
            dot={false}
            activeDot={{ r: 4, fill: '#7ee0ad', stroke: '#06100c', strokeWidth: 2 }}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  )
}
