"use client";

import { Bar, BarChart, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { formatCompactCurrency, formatCurrency, pluralize } from "@/lib/crm/format";

export interface StageDatum {
  name: string;
  count: number;
  value: number;
}

const SERIES = ["#0058cc", "#0a72e0", "#00b0ef", "#6cc4f5", "#93C5FD"];

/** Open applications and their est. net tuition per stage of the default funnel. */
export function DealsByStageChart({ data, currency }: { data: StageDatum[]; currency: string }) {
  if (data.every((d) => d.count === 0)) {
    return (
      <p className="text-muted-foreground flex h-56 items-center justify-center text-sm">
        No open applications in this funnel yet.
      </p>
    );
  }
  return (
    <div className="h-56 w-full min-w-0 overflow-hidden">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ top: 4, right: 56, bottom: 4, left: 4 }}>
          <XAxis type="number" hide />
          <YAxis
            type="category"
            dataKey="name"
            width={110}
            tickLine={false}
            axisLine={false}
            tick={{ fontSize: 11, fill: "#6b7280" }}
          />
          <Tooltip
            cursor={{ fill: "rgba(0,88,204,0.06)" }}
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const d = payload[0].payload as StageDatum;
              return (
                <div className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs shadow-md">
                  <p className="font-medium text-gray-900">{d.name}</p>
                  <p className="text-muted-foreground">
                    {pluralize(d.count, "application")}
                    {d.value > 0 ? ` · ${formatCurrency(d.value, currency)}` : ""}
                  </p>
                </div>
              );
            }}
          />
          <Bar
            isAnimationActive={false}
            dataKey="value"
            radius={[0, 6, 6, 0]}
            barSize={18}
            label={{
              position: "right",
              fontSize: 11,
              fill: "#6b7280",
              formatter: (v: number) => formatCompactCurrency(Number(v), currency),
            }}
          >
            {data.map((d, i) => (
              <Cell key={d.name} fill={SERIES[i % SERIES.length]} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
