"use client";

import { Container } from "@/components/Container";
import { PageHeader } from "@/components/PageHeader";
import { apiFetch } from "@/lib/api";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

type Me = {
  email: string;
  phone_number: string;
  tradingview_username: string;
  plan: string;
  created_at: string;
};

export default function ProfilePage() {
  const router = useRouter();
  const [me, setMe] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);

  const [curPass, setCurPass] = useState("");
  const [newPass, setNewPass] = useState("");
  const [confPass, setConfPass] = useState("");
  const [pwMsg, setPwMsg] = useState<string | null>(null);
  const [pwErr, setPwErr] = useState<string | null>(null);
  const [pwLoading, setPwLoading] = useState(false);

  const [newPhone, setNewPhone] = useState("");
  const [phoneOtp, setPhoneOtp] = useState("");
  const [phonePhase, setPhonePhase] = useState<"idle" | "sent">("idle");
  const [phMsg, setPhMsg] = useState<string | null>(null);
  const [phErr, setPhErr] = useState<string | null>(null);

  const [tvUser, setTvUser] = useState("");
  const [tvMsg, setTvMsg] = useState<string | null>(null);
  const [tvErr, setTvErr] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const data = await apiFetch<Me>("/auth/me");
        setMe(data);
        setTvUser(data.tradingview_username ?? "");
      } catch {
        router.replace("/login");
      } finally {
        setLoading(false);
      }
    })();
  }, [router]);

  if (loading || !me) {
    return (
      <div>
        <PageHeader eyebrow="PROFILE" title="Your account." description="Loading…" />
        <Container>
          <div className="py-12 text-sm text-muted-foreground">Loading…</div>
        </Container>
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        eyebrow="PROFILE"
        title="Your account."
        description="Manage sign-in, contact details, and TradingView."
      />
      <Container>
        <div className="grid gap-8 py-12">
          <section className="rounded-2xl border border-border bg-white p-6 shadow-sm">
            <div className="text-xs font-semibold tracking-[0.22em] text-muted-foreground">
              ACCOUNT
            </div>
            <div className="mt-4 grid gap-3 text-sm">
              <div>
                <span className="text-muted-foreground">Email</span>
                <div className="mt-1 font-medium text-foreground">{me.email}</div>
              </div>
              <div>
                <span className="text-muted-foreground">Phone</span>
                <div className="mt-1 font-medium text-foreground">
                  {me.phone_number}
                </div>
              </div>
              <div>
                <span className="text-muted-foreground">TradingView</span>
                <div className="mt-1 font-medium text-foreground">
                  {me.tradingview_username || "—"}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground">Plan</span>
                <span
                  className={[
                    "rounded-full px-2 py-0.5 text-xs font-semibold",
                    me.plan === "pro"
                      ? "bg-foreground text-white"
                      : "border border-border bg-surface text-foreground",
                  ].join(" ")}
                >
                  {me.plan === "pro" ? "Pro" : "Free"}
                </span>
              </div>
              <div>
                <span className="text-muted-foreground">Member since</span>
                <div className="mt-1 text-foreground">
                  {new Date(me.created_at).toLocaleDateString()}
                </div>
              </div>
            </div>
          </section>

          <section className="rounded-2xl border border-border bg-white p-6 shadow-sm">
            <div className="text-xs font-semibold tracking-[0.22em] text-muted-foreground">
              CHANGE PASSWORD
            </div>
            <form
              className="mt-4 grid max-w-md gap-3"
              onSubmit={async (e) => {
                e.preventDefault();
                setPwErr(null);
                setPwMsg(null);
                if (newPass.length < 8) {
                  setPwErr("New password must be at least 8 characters.");
                  return;
                }
                if (newPass !== confPass) {
                  setPwErr("Passwords do not match.");
                  return;
                }
                setPwLoading(true);
                try {
                  await apiFetch("/auth/change-password", {
                    method: "POST",
                    body: JSON.stringify({
                      current_password: curPass,
                      new_password: newPass,
                      confirm_password: confPass,
                    }),
                  });
                  setPwMsg("Password updated.");
                  setCurPass("");
                  setNewPass("");
                  setConfPass("");
                  window.dispatchEvent(new Event("vexis-auth-changed"));
                } catch (err) {
                  setPwErr(
                    err instanceof Error ? err.message : "Update failed",
                  );
                } finally {
                  setPwLoading(false);
                }
              }}
            >
              <input
                type="password"
                placeholder="Current password"
                value={curPass}
                onChange={(e) => setCurPass(e.target.value)}
                className="h-11 rounded-md border border-border px-3 text-sm"
              />
              <input
                type="password"
                placeholder="New password"
                value={newPass}
                onChange={(e) => setNewPass(e.target.value)}
                className="h-11 rounded-md border border-border px-3 text-sm"
              />
              <input
                type="password"
                placeholder="Confirm new password"
                value={confPass}
                onChange={(e) => setConfPass(e.target.value)}
                className="h-11 rounded-md border border-border px-3 text-sm"
              />
              {pwErr ? (
                <div className="text-sm text-red-600">{pwErr}</div>
              ) : null}
              {pwMsg ? (
                <div className="text-sm text-emerald-700">{pwMsg}</div>
              ) : null}
              <button
                type="submit"
                disabled={pwLoading}
                className="inline-flex h-10 items-center justify-center rounded-full bg-foreground px-4 text-sm font-semibold text-white"
              >
                {pwLoading ? "Saving…" : "Update password"}
              </button>
            </form>
          </section>

          <section className="rounded-2xl border border-border bg-white p-6 shadow-sm">
            <div className="text-xs font-semibold tracking-[0.22em] text-muted-foreground">
              CHANGE PHONE
            </div>
            <div className="mt-4 grid max-w-md gap-3">
              <input
                type="tel"
                placeholder="+15551234567"
                value={newPhone}
                onChange={(e) => setNewPhone(e.target.value)}
                className="h-11 rounded-md border border-border px-3 text-sm"
              />
              <button
                type="button"
                onClick={async () => {
                  setPhErr(null);
                  setPhMsg(null);
                  try {
                    const pres = await apiFetch<{ dev_otp?: string }>(
                      "/auth/profile/phone-request",
                      {
                        method: "POST",
                        body: JSON.stringify({ phone_number: newPhone }),
                      },
                    );
                    setPhonePhase("sent");
                    setPhMsg(
                      pres.dev_otp
                        ? `SMS bypass: use code ${pres.dev_otp}`
                        : "Code sent to the new number.",
                    );
                  } catch (err) {
                    setPhErr(
                      err instanceof Error ? err.message : "Request failed",
                    );
                  }
                }}
                className="inline-flex h-10 items-center justify-center rounded-full border border-border px-4 text-sm font-semibold"
              >
                Send verification code
              </button>
              {phonePhase === "sent" ? (
                <>
                  <input
                    type="text"
                    inputMode="numeric"
                    maxLength={6}
                    placeholder="6-digit code"
                    value={phoneOtp}
                    onChange={(e) =>
                      setPhoneOtp(e.target.value.replace(/\D/g, "").slice(0, 6))
                    }
                    className="h-11 rounded-md border border-border px-3 text-sm"
                  />
                  <button
                    type="button"
                    onClick={async () => {
                      setPhErr(null);
                      setPhMsg(null);
                      try {
                        await apiFetch("/auth/profile/phone-verify", {
                          method: "POST",
                          body: JSON.stringify({ otp: phoneOtp }),
                        });
                        const data = await apiFetch<Me>("/auth/me");
                        setMe(data);
                        setPhonePhase("idle");
                        setPhoneOtp("");
                        setNewPhone("");
                        setPhMsg("Phone number updated.");
                      } catch (err) {
                        setPhErr(
                          err instanceof Error ? err.message : "Invalid code",
                        );
                      }
                    }}
                    className="inline-flex h-10 items-center justify-center rounded-full bg-accent px-4 text-sm font-semibold text-white"
                  >
                    Confirm new phone
                  </button>
                </>
              ) : null}
              {phErr ? (
                <div className="text-sm text-red-600">{phErr}</div>
              ) : null}
              {phMsg ? (
                <div className="text-sm text-emerald-700">{phMsg}</div>
              ) : null}
            </div>
          </section>

          <section className="rounded-2xl border border-border bg-white p-6 shadow-sm">
            <div className="text-xs font-semibold tracking-[0.22em] text-muted-foreground">
              TRADINGVIEW USERNAME
            </div>
            <form
              className="mt-4 flex max-w-md flex-col gap-3 sm:flex-row sm:items-center"
              onSubmit={async (e) => {
                e.preventDefault();
                setTvErr(null);
                setTvMsg(null);
                try {
                  await apiFetch("/auth/profile/tradingview", {
                    method: "POST",
                    body: JSON.stringify({
                      tradingview_username: tvUser.trim() || null,
                    }),
                  });
                  setTvMsg("Saved.");
                  const data = await apiFetch<Me>("/auth/me");
                  setMe(data);
                } catch (err) {
                  setTvErr(
                    err instanceof Error ? err.message : "Save failed",
                  );
                }
              }}
            >
              <input
                type="text"
                value={tvUser}
                onChange={(e) => setTvUser(e.target.value)}
                className="h-11 flex-1 rounded-md border border-border px-3 text-sm"
              />
              <button
                type="submit"
                className="inline-flex h-11 items-center justify-center rounded-full bg-foreground px-5 text-sm font-semibold text-white"
              >
                Save
              </button>
            </form>
            {tvErr ? <div className="mt-2 text-sm text-red-600">{tvErr}</div> : null}
            {tvMsg ? (
              <div className="mt-2 text-sm text-emerald-700">{tvMsg}</div>
            ) : null}
          </section>
        </div>
      </Container>
    </div>
  );
}
