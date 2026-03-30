"use client";

import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  type TooltipProps,
  XAxis,
  YAxis,
} from "recharts";

type Point = {
  t: string;
  px: number;
  entry?: boolean;
  exit?: boolean;
};

const data: Point[] = [
  { t: "09:30", px: 102.1 },
  { t: "09:45", px: 104.4, entry: true },
  { t: "10:00", px: 103.7 },
  { t: "10:15", px: 106.2 },
  { t: "10:30", px: 105.5, exit: true },
  { t: "10:45", px: 107.8 },
  { t: "11:00", px: 109.3 },
];

function MarkerDot(props: { cx?: number; cy?: number; payload?: Point }) {
  const { cx, cy, payload } = props;
  if (!payload || cx == null || cy == null) return null;

  if (payload.entry) {
    return (
      <g>
        <circle cx={cx} cy={cy} r={5} fill="#2563EB" opacity={0.18} />
        <circle cx={cx} cy={cy} r={3} fill="#2563EB" />
      </g>
    );
  }

  if (payload.exit) {
    return (
      <g>
        <circle cx={cx} cy={cy} r={5} fill="#09090B" opacity={0.14} />
        <circle cx={cx} cy={cy} r={3} fill="#09090B" />
      </g>
    );
  }

  return <circle cx={cx} cy={cy} r={2} fill="#09090B" opacity={0.35} />;
}

function TinyTooltip({
  active,
  payload,
}: TooltipProps<number, string> & { payload?: { value?: number }[] }) {
  if (!active || !payload || !payload[0] || payload[0].value == null) return null;
  return (
    <div className="rounded-md border border-border bg-white px-3 py-2 text-xs text-foreground shadow-[0_4px_12px_rgba(0,0,0,0.08)]">
      <div className="font-semibold tracking-[-0.01em]">Price</div>
      <div className="text-muted-foreground">{payload[0].value.toFixed(1)}</div>
    </div>
  );
}

export function PriceChart() {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={data} margin={{ top: 8, right: 10, bottom: 0, left: 0 }}>
        <CartesianGrid stroke="#E4E4E7" strokeDasharray="4 6" />
        <XAxis
          dataKey="t"
          tickLine={false}
          axisLine={false}
          tick={{ fill: "#71717A", fontSize: 11 }}
          interval={1}
        />
        <YAxis hide domain={["dataMin - 1", "dataMax + 1"]} />
        <Tooltip content={<TinyTooltip />} />
        <Line
          type="monotone"
          dataKey="px"
          stroke="#09090B"
          strokeWidth={2}
          dot={<MarkerDot />}
          activeDot={{ r: 5, fill: "#2563EB", stroke: "#2563EB" }}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}

