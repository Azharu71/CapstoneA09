import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { CONFIG } from "../lib/config";

/** Grafik "Tren konsumsi energi" (pengganti SVG statis prototipe). Warna dan ukuran mengikuti prototipe. */
export default function EnergyTrendChart({ data }: { data: { hour: number; kwh: number | null }[] }) {
  return (
    <div className="w-full h-[214px] block mt-4">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 12, right: 12, bottom: 0, left: 12 }}>
          <CartesianGrid vertical={false} stroke="#e8edf4" />
          <XAxis
            dataKey="hour" type="number" domain={[CONFIG.chartHours.from, CONFIG.chartHours.to]}
            ticks={CONFIG.chartTicks} tickFormatter={(h: number) => String(h).padStart(2, "0")}
            axisLine={false} tickLine={false} tick={{ fill: "#6d7d91", fontSize: 10 }}
          />
          <YAxis hide domain={[0, "auto"]} />
          <Tooltip
            formatter={(v) => [`${Number(v).toFixed(2)} kWh`, "Energi"]}
            labelFormatter={(h) => `Jam ${String(h).padStart(2, "0")}:00`}
          />
          <Line
            type="linear" dataKey="kwh" stroke="#3979e0" strokeWidth={3} connectNulls isAnimationActive={false}
            dot={{ r: 4, fill: "#3979e0", stroke: "#3979e0" }} activeDot={{ r: 5 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
