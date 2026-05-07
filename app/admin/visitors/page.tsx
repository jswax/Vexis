"use client";

import { apiFetch } from "@/lib/api";
import { useEffect, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

type PlanCount = { plan: string; count: number };
type DayStat = { day: string; count: number };

type StatsResponse = {
  total_users: number;
  plan_counts: PlanCount[];
  total_sessions: number;
  active_sessions: number;
  daily_signups: DayStat[];
  new_today: number;
};

const PLAN_COLORS_HEX: Record<string, string> = {
  free: "#e4e4e7",
  standard: "#93c5fd",
  premium: "#fcd34d",
};

function StatCard({
  label,
  value,
  sub,
}: {
  label: string;
  value: string | number;
  sub?: string;
}) {
  return (
    <div className="rounded-2xl border border-border bg-white p-5 shadow-sm">
      <p className="text-xs font-semibold tracking-[0.2em] text-muted-foreground">
        {label}
      </p>
      <p className="mt-2 text-3xl font-semibold text-foreground">{value}</p>
      {sub && <p className="mt-1 text-xs text-muted-foreground">{sub}</p>}
    </div>
  );
}

export default function AdminVisitorsPage() {
  const [stats, setStats] = useState<StatsResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiFetch<StatsResponse>("/admin/stats")
      .then(setStats)
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="h-28 animate-pulse rounded-2xl border border-border bg-foreground/5"
          />
        ))}
      </div>
    );
  }

  if (!stats) return <p className="text-muted-foreground">Failed to load stats.</p>;

  const pieData = (stats.plan_counts ?? []).map((pc) => ({
    name: pc.plan,
    value: Number(pc.count),
  }));

  const barData = (stats.daily_signups ?? []).map((d) => ({
    day: d.day.slice(5), // MM-DD
    signups: Number(d.count),
  }));

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-foreground">Visitors & Growth</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">User activity and signup trends</p>
      </div>

      {/* Stats cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="TOTAL USERS"
          value={stats.total_users.toLocaleString()}
        />
        <StatCard
          label="NEW TODAY"
          value={stats.new_today.toLocaleString()}
          sub="registered in the last 24h"
        />
        <StatCard
          label="ACTIVE SESSIONS"
          value={stats.active_sessions.toLocaleString()}
          sub={`${stats.total_sessions.toLocaleString()} total`}
        />
        <StatCard
          label="PAYING USERS"
          value={(
            (stats.plan_counts ?? [])
              .filter((p) => p.plan !== "free")
              .reduce((sum, p) => sum + Number(p.count), 0)
          ).toLocaleString()}
          sub="standard + premium"
        />
      </div>

      {/* Charts row */}
      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        {/* Signups bar chart */}
        <div className="lg:col-span-2 rounded-2xl border border-border bg-white p-5 shadow-sm">
          <p className="text-xs font-semibold tracking-[0.2em] text-muted-foreground">
            SIGNUPS — LAST 30 DAYS
          </p>
          <div className="mt-4 h-52">
            {barData.length === 0 ? (
              <p className="flex h-full items-center justify-center text-sm text-muted-foreground">
                No data yet
              </p>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={barData} barSize={10}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e4e4e7" />
                  <XAxis
                    dataKey="day"
                    tick={{ fontSize: 10, fill: "#71717a" }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    tick={{ fontSize: 10, fill: "#71717a" }}
                    axisLine={false}
                    tickLine={false}
                    allowDecimals={false}
                  />
                  <Tooltip
                    contentStyle={{
                      borderRadius: "8px",
                      border: "1px solid #e4e4e7",
                      fontSize: "12px",
                    }}
                  />
                  <Bar dataKey="signups" fill="#2563eb" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* Plan distribution pie */}
        <div className="rounded-2xl border border-border bg-white p-5 shadow-sm">
          <p className="text-xs font-semibold tracking-[0.2em] text-muted-foreground">
            PLAN DISTRIBUTION
          </p>
          <div className="mt-4 h-52">
            {pieData.length === 0 ? (
              <p className="flex h-full items-center justify-center text-sm text-muted-foreground">
                No data yet
              </p>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={pieData}
                    cx="50%"
                    cy="50%"
                    innerRadius={50}
                    outerRadius={75}
                    paddingAngle={3}
                    dataKey="value"
                  >
                    {pieData.map((entry) => (
                      <Cell
                        key={entry.name}
                        fill={PLAN_COLORS_HEX[entry.name] ?? "#e4e4e7"}
                      />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{
                      borderRadius: "8px",
                      border: "1px solid #e4e4e7",
                      fontSize: "12px",
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
            )}
          </div>
          {/* Legend */}
          <div className="mt-2 flex flex-col gap-1.5">
            {pieData.map((entry) => (
              <div key={entry.name} className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div
                    className="h-2.5 w-2.5 rounded-full"
                    style={{ background: PLAN_COLORS_HEX[entry.name] ?? "#e4e4e7" }}
                  />
                  <span className="text-xs capitalize text-muted-foreground">
                    {entry.name}
                  </span>
                </div>
                <span className="text-xs font-medium text-foreground">
                  {entry.value.toLocaleString()}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
