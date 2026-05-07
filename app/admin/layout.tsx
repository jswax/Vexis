"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { useRouter } from "next/navigation";

const navItems = [
  { href: "/admin/users", label: "Users" },
  { href: "/admin/visitors", label: "Visitors" },
  { href: "/admin/revenue", label: "Revenue" },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    apiFetch<{ is_admin: boolean }>("/auth/me")
      .then((me) => {
        if (!me.is_admin) {
          router.replace("/dashboard");
        } else {
          setChecked(true);
        }
      })
      .catch(() => router.replace("/login"));
  }, [router]);

  if (!checked) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-accent border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="flex min-h-[calc(100vh-120px)]">
      {/* Sidebar */}
      <aside className="w-56 shrink-0 border-r border-border bg-surface">
        <div className="p-5">
          <p className="text-[10px] font-semibold tracking-[0.2em] text-muted-foreground">
            ADMIN
          </p>
          <nav className="mt-4 flex flex-col gap-1">
            {navItems.map((item) => {
              const active = pathname.startsWith(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`rounded-lg px-3 py-2 text-sm font-medium transition ${
                    active
                      ? "bg-accent/10 text-accent"
                      : "text-muted-foreground hover:bg-border/50 hover:text-foreground"
                  }`}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </div>
      </aside>

      {/* Content */}
      <div className="min-w-0 flex-1 overflow-auto p-8">{children}</div>
    </div>
  );
}
