"use client";

import { apiFetch } from "@/lib/api";
import { useEffect, useState } from "react";

type RevenueResponse = {
  standard_count: number;
  premium_count: number;
  free_count: number;
  standard_price: number;
  premium_price: number;
  standard_revenue: number;
  premium_revenue: number;
  monthly_revenue: number;
};

function StatCard({
  label,
  value,
  sub,
  highlight,
}: {
  label: string;
  value: string;
  sub?: string;
  highlight?: boolean;
}) {
  return (
    <div
      className={`rounded-2xl border p-5 shadow-sm ${
        highlight
          ? "border-accent/30 bg-accent/5"
          : "border-border bg-white"
      }`}
    >
      <p className="text-xs font-semibold tracking-[0.2em] text-muted-foreground">
        {label}
      </p>
      <p
        className={`mt-2 text-3xl font-semibold ${
          highlight ? "text-accent" : "text-foreground"
        }`}
      >
        {value}
      </p>
      {sub && <p className="mt-1 text-xs text-muted-foreground">{sub}</p>}
    </div>
  );
}

function fmt(n: number) {
  return "$" + n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function AdminRevenuePage() {
  const [data, setData] = useState<RevenueResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiFetch<RevenueResponse>("/admin/revenue")
      .then(setData)
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

  if (!data) return <p className="text-muted-foreground">Failed to load revenue data.</p>;

  const payingUsers = Number(data.standard_count) + Number(data.premium_count);
  const totalUsers = payingUsers + Number(data.free_count);
  const conversionRate = totalUsers > 0 ? ((payingUsers / totalUsers) * 100).toFixed(1) : "0.0";

  const noPricesSet = data.standard_price === 0 && data.premium_price === 0;

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-foreground">Revenue</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">Monthly recurring revenue</p>
      </div>

      {noPricesSet && (
        <div className="mb-5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
          Plan prices are not configured. Set{" "}
          <code className="font-mono">STANDARD_PLAN_PRICE</code> and{" "}
          <code className="font-mono">PREMIUM_PLAN_PRICE</code> in your backend
          environment to calculate revenue.
        </div>
      )}

      {/* Top stat cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="MONTHLY REVENUE"
          value={fmt(data.monthly_revenue)}
          sub="standard + premium"
          highlight
        />
        <StatCard
          label="PAYING USERS"
          value={payingUsers.toLocaleString()}
          sub={`${conversionRate}% conversion`}
        />
        <StatCard
          label="STANDARD"
          value={Number(data.standard_count).toLocaleString()}
          sub={data.standard_price > 0 ? `${fmt(data.standard_price)}/mo each` : "price not set"}
        />
        <StatCard
          label="PREMIUM"
          value={Number(data.premium_count).toLocaleString()}
          sub={data.premium_price > 0 ? `${fmt(data.premium_price)}/mo each` : "price not set"}
        />
      </div>

      {/* Breakdown table */}
      <div className="mt-6 overflow-hidden rounded-2xl border border-border bg-white shadow-sm">
        <div className="border-b border-border px-5 py-4">
          <p className="text-xs font-semibold tracking-[0.2em] text-muted-foreground">
            REVENUE BREAKDOWN
          </p>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-surface text-left text-xs font-semibold tracking-wider text-muted-foreground">
              <th className="px-5 py-3">Plan</th>
              <th className="px-5 py-3">Subscribers</th>
              <th className="px-5 py-3">Price / mo</th>
              <th className="px-5 py-3 text-right">Monthly Revenue</th>
            </tr>
          </thead>
          <tbody>
            <tr className="border-b border-border">
              <td className="px-5 py-4 font-medium text-foreground">
                <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs font-semibold text-blue-700">
                  Standard
                </span>
              </td>
              <td className="px-5 py-4 text-foreground">
                {Number(data.standard_count).toLocaleString()}
              </td>
              <td className="px-5 py-4 text-foreground">
                {data.standard_price > 0 ? fmt(data.standard_price) : "—"}
              </td>
              <td className="px-5 py-4 text-right font-semibold text-foreground">
                {data.standard_price > 0 ? fmt(data.standard_revenue) : "—"}
              </td>
            </tr>
            <tr className="border-b border-border">
              <td className="px-5 py-4 font-medium text-foreground">
                <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-700">
                  Premium
                </span>
              </td>
              <td className="px-5 py-4 text-foreground">
                {Number(data.premium_count).toLocaleString()}
              </td>
              <td className="px-5 py-4 text-foreground">
                {data.premium_price > 0 ? fmt(data.premium_price) : "—"}
              </td>
              <td className="px-5 py-4 text-right font-semibold text-foreground">
                {data.premium_price > 0 ? fmt(data.premium_revenue) : "—"}
              </td>
            </tr>
            <tr className="bg-surface/60">
              <td className="px-5 py-4 font-semibold text-foreground">Total</td>
              <td className="px-5 py-4 font-semibold text-foreground">
                {payingUsers.toLocaleString()}
              </td>
              <td className="px-5 py-4 text-muted-foreground">—</td>
              <td className="px-5 py-4 text-right text-lg font-bold text-accent">
                {noPricesSet ? "—" : fmt(data.monthly_revenue)}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* ARR card */}
      {!noPricesSet && (
        <div className="mt-4 rounded-2xl border border-border bg-white p-5 shadow-sm">
          <p className="text-xs font-semibold tracking-[0.2em] text-muted-foreground">
            ANNUALIZED (ARR ESTIMATE)
          </p>
          <p className="mt-2 text-2xl font-semibold text-foreground">
            {fmt(data.monthly_revenue * 12)}
            <span className="ml-2 text-sm font-normal text-muted-foreground">/ year</span>
          </p>
        </div>
      )}
    </div>
  );
}
