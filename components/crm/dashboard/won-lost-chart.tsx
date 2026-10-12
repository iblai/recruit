"use client";

import { Bar, BarChart, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { formatCurrency } from "@/lib/crm/format";

export interface MonthDatum {
  key: string;
  label: string;
  won: number;
  lost: number;
  wonValue: number;
  lostValue: number;
}

/** Closed applications of the last six months, enrolled beside withdrawn. */
export function WonLostChart({ data, currency }: { data: MonthDatum[]; currency: string }) {
  const empty = data.every((d) => d.won === 0 && d.lost === 0);
  if (empty) {
    return (
      <p className="text-muted-foreground flex h-56 items-center justify-center text-sm">
        No enrollments or withdrawals in the last six months.
      </p>
    );
  }
  return (
    <div className="h-56 w-full min-w-0 overflow-hidden">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -20 }} barGap={4}>
          <XAxis
            dataKey="label"
            tickLine={false}
            axisLine={false}
            tick={{ fontSize: 11, fill: "#6b7280" }}
          />
          <YAxis
            allowDecimals={false}
            tickLine={false}
            axisLine={false}
            tick={{ fontSize: 11, fill: "#9ca3af" }}
            width={40}
          />
          <Tooltip
            cursor={{ fill: "rgba(0,88,204,0.06)" }}
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const d = payload[0].payload as MonthDatum;
              return (
                <div className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs shadow-md">
                  <p className="font-medium text-gray-900">{d.label}</p>
                  <p className="text-emerald-600">
                    Enrolled {d.won}
                    {d.wonValue > 0 ? ` · ${formatCurrency(d.wonValue, currency)}` : ""}
                  </p>
                  <p className="text-rose-600">
                    Withdrawn {d.lost}
                    {d.lostValue > 0 ? ` · ${formatCurrency(d.lostValue, currency)}` : ""}
                  </p>
                </div>
              );
            }}
          />
          <Legend
            verticalAlign="top"
            align="right"
            height={24}
            iconType="circle"
            iconSize={8}
            wrapperStyle={{ fontSize: 11, color: "#6b7280" }}
          />
          <Bar
            isAnimationActive={false}
            dataKey="won"
            name="Enrolled"
            fill="#10b981"
            radius={[4, 4, 0, 0]}
            maxBarSize={22}
          />
          <Bar
            isAnimationActive={false}
            dataKey="lost"
            name="Withdrawn"
            fill="#fb7185"
            radius={[4, 4, 0, 0]}
            maxBarSize={22}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
