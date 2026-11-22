import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { CONFIG } from "../lib/config";
import type { DashboardEnergyPeriod, EnergyTrendPoint } from "../data/energy";

interface EnergyTrendChartProps {
  data: EnergyTrendPoint[];
  period?: DashboardEnergyPeriod;
}

/** Grafik "Tren konsumsi energi" dashboard dengan dukungan per hari, per minggu, dan per bulan. */
export default function EnergyTrendChart({ data, period = "day" }: EnergyTrendChartProps) {
  if (data.length === 0) {
    return (
      <div className="w-full h-[214px] flex flex-col items-center justify-center text-muted text-xs border border-dashed border-[#e2e8f0] rounded-lg mt-4">
        <span>Belum ada data energi untuk periode ini.</span>
      </div>
    );
  }

  return (
    <div className="w-full h-[214px] block mt-4">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 12, right: 12, bottom: 0, left: 12 }}>
          <CartesianGrid vertical={false} stroke="#e8edf4" />
          {period === "day" ? (
            <XAxis
              dataKey="hour"
              type="number"
              domain={[CONFIG.chartHours.from, CONFIG.chartHours.to]}
              ticks={CONFIG.chartTicks}
              tickFormatter={(h: number) => String(h).padStart(2, "0")}
              axisLine={false}
              tickLine={false}
              tick={{ fill: "#6d7d91", fontSize: 10 }}
            />
          ) : (
            <XAxis
              dataKey="label"
              axisLine={false}
              tickLine={false}
              tick={{ fill: "#6d7d91", fontSize: 10 }}
            />
          )}
          <YAxis hide domain={[0, "auto"]} />
          <Tooltip
            formatter={(v) => [`${Number(v ?? 0).toFixed(2)} kWh`, "Energi"]}
            labelFormatter={(label, payload) => {
              const item = payload?.[0]?.payload as EnergyTrendPoint | undefined;
              if (item?.tooltipLabel) return item.tooltipLabel;
              if (period === "day" && typeof label === "number") {
                return `Jam ${String(label).padStart(2, "0")}:00`;
              }
              return String(label ?? "");
            }}
          />
          <Line
            type="linear"
            dataKey="kwh"
            stroke="#3979e0"
            strokeWidth={3}
            connectNulls
            isAnimationActive={false}
            dot={{ r: 4, fill: "#3979e0", stroke: "#3979e0" }}
            activeDot={{ r: 5 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
