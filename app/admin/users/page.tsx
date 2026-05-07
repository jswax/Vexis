"use client";

import { apiFetch } from "@/lib/api";
import { useCallback, useEffect, useState } from "react";

type User = {
  id: number;
  email: string;
  phone_number: string;
  plan: string;
  is_admin: boolean;
  email_verified: boolean;
  phone_verified: boolean;
  tradingview_username: string | null;
  created_at: string;
  last_login_at: string | null;
};

type UsersResponse = {
  users: User[];
  total: number;
  page: number;
  pages: number;
};

const PLAN_COLORS: Record<string, string> = {
  free: "bg-border text-muted-foreground",
  standard: "bg-blue-100 text-blue-700",
  premium: "bg-amber-100 text-amber-700",
};

function EditModal({
  user,
  onClose,
  onSave,
}: {
  user: User;
  onClose: () => void;
  onSave: (updated: Partial<User>) => void;
}) {
  const [plan, setPlan] = useState(user.plan);
  const [email, setEmail] = useState(user.email);
  const [tv, setTv] = useState(user.tradingview_username ?? "");
  const [isAdmin, setIsAdmin] = useState(user.is_admin);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      await apiFetch(`/admin/users/${user.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          plan,
          email,
          tradingview_username: tv,
          is_admin: isAdmin,
        }),
      });
      onSave({ plan, email, tradingview_username: tv || null, is_admin: isAdmin });
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/20 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-2xl border border-border bg-white p-6 shadow-xl">
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-base font-semibold text-foreground">Edit User</h2>
          <button
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground"
          >
            ✕
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">
              Email
            </label>
            <input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="h-9 w-full rounded-lg border border-border bg-surface px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">
              Plan
            </label>
            <select
              value={plan}
              onChange={(e) => setPlan(e.target.value)}
              className="h-9 w-full rounded-lg border border-border bg-surface px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            >
              <option value="free">Free</option>
              <option value="standard">Standard</option>
              <option value="premium">Premium</option>
            </select>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">
              TradingView Username
            </label>
            <input
              value={tv}
              onChange={(e) => setTv(e.target.value)}
              placeholder="(none)"
              className="h-9 w-full rounded-lg border border-border bg-surface px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>

          <div className="flex items-center gap-3">
            <input
              id="is_admin"
              type="checkbox"
              checked={isAdmin}
              onChange={(e) => setIsAdmin(e.target.checked)}
              className="h-4 w-4 rounded border-border accent-accent"
            />
            <label htmlFor="is_admin" className="text-sm text-foreground">
              Admin access
            </label>
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <div className="flex gap-3 pt-2">
            <button
              onClick={handleSave}
              disabled={saving}
              className="inline-flex h-9 flex-1 items-center justify-center rounded-full bg-foreground text-sm font-semibold text-white disabled:opacity-60"
            >
              {saving ? "Saving…" : "Save"}
            </button>
            <button
              onClick={onClose}
              disabled={saving}
              className="inline-flex h-9 flex-1 items-center justify-center rounded-full border border-border bg-white text-sm font-semibold text-foreground"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function AdminUsersPage() {
  const [data, setData] = useState<UsersResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [planFilter, setPlanFilter] = useState("");
  const [page, setPage] = useState(1);
  const [editUser, setEditUser] = useState<User | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), limit: "20" });
      if (search) params.set("search", search);
      if (planFilter) params.set("plan", planFilter);
      const res = await apiFetch<UsersResponse>(`/admin/users?${params}`);
      setData(res);
    } finally {
      setLoading(false);
    }
  }, [page, search, planFilter]);

  useEffect(() => { void load(); }, [load]);

  const handleUserSaved = (userId: number, updates: Partial<User>) => {
    setData((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        users: prev.users.map((u) =>
          u.id === userId ? { ...u, ...updates } : u
        ),
      };
    });
  };

  return (
    <div>
      <div className="mb-6 flex items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Users</h1>
          {data && (
            <p className="mt-0.5 text-sm text-muted-foreground">
              {data.total.toLocaleString()} total
            </p>
          )}
        </div>

        <div className="flex gap-3">
          <input
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            placeholder="Search email…"
            className="h-9 w-52 rounded-lg border border-border bg-surface px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          />
          <select
            value={planFilter}
            onChange={(e) => { setPlanFilter(e.target.value); setPage(1); }}
            className="h-9 rounded-lg border border-border bg-surface px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          >
            <option value="">All plans</option>
            <option value="free">Free</option>
            <option value="standard">Standard</option>
            <option value="premium">Premium</option>
          </select>
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-border bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-surface text-left text-xs font-semibold tracking-wider text-muted-foreground">
              <th className="px-4 py-3">ID</th>
              <th className="px-4 py-3">Email</th>
              <th className="px-4 py-3">Plan</th>
              <th className="px-4 py-3">Phone</th>
              <th className="px-4 py-3">TradingView</th>
              <th className="px-4 py-3">Joined</th>
              <th className="px-4 py-3">Last Login</th>
              <th className="px-4 py-3">Flags</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              Array.from({ length: 8 }).map((_, i) => (
                <tr key={i} className="border-b border-border last:border-0">
                  {Array.from({ length: 9 }).map((_, j) => (
                    <td key={j} className="px-4 py-3">
                      <div className="h-4 w-full animate-pulse rounded-md bg-foreground/8" />
                    </td>
                  ))}
                </tr>
              ))
            ) : data?.users.length === 0 ? (
              <tr>
                <td colSpan={9} className="px-4 py-10 text-center text-muted-foreground">
                  No users found.
                </td>
              </tr>
            ) : (
              data?.users.map((u) => (
                <tr
                  key={u.id}
                  className="border-b border-border last:border-0 hover:bg-surface/60"
                >
                  <td className="px-4 py-3 font-mono text-xs text-muted-foreground">
                    {u.id}
                  </td>
                  <td className="px-4 py-3 font-medium text-foreground">
                    {u.email}
                    {u.is_admin && (
                      <span className="ml-2 rounded-full bg-purple-100 px-1.5 py-0.5 text-[10px] font-semibold text-purple-700">
                        ADMIN
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-semibold ${PLAN_COLORS[u.plan] ?? ""}`}
                    >
                      {u.plan}
                    </span>
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-muted-foreground">
                    {u.phone_number}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {u.tradingview_username ?? "—"}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {new Date(u.created_at).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {u.last_login_at
                      ? new Date(u.last_login_at).toLocaleDateString()
                      : "—"}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-1">
                      {u.email_verified && (
                        <span className="rounded-full bg-green-100 px-1.5 py-0.5 text-[10px] font-semibold text-green-700">
                          email
                        </span>
                      )}
                      {u.phone_verified && (
                        <span className="rounded-full bg-green-100 px-1.5 py-0.5 text-[10px] font-semibold text-green-700">
                          phone
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() => setEditUser(u)}
                      className="rounded-lg border border-border bg-surface px-3 py-1 text-xs font-medium text-foreground transition hover:bg-border"
                    >
                      Edit
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {data && data.pages > 1 && (
        <div className="mt-4 flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            Page {data.page} of {data.pages}
          </p>
          <div className="flex gap-2">
            <button
              disabled={page <= 1}
              onClick={() => setPage((p) => p - 1)}
              className="inline-flex h-8 items-center justify-center rounded-lg border border-border bg-white px-3 text-xs font-medium text-foreground disabled:opacity-40"
            >
              Previous
            </button>
            <button
              disabled={page >= data.pages}
              onClick={() => setPage((p) => p + 1)}
              className="inline-flex h-8 items-center justify-center rounded-lg border border-border bg-white px-3 text-xs font-medium text-foreground disabled:opacity-40"
            >
              Next
            </button>
          </div>
        </div>
      )}

      {editUser && (
        <EditModal
          user={editUser}
          onClose={() => setEditUser(null)}
          onSave={(updates) => {
            handleUserSaved(editUser.id, updates);
            setEditUser(null);
          }}
        />
      )}
    </div>
  );
}
