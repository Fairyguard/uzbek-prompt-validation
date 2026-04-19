import Link from "next/link";
import { RoleName } from "@prisma/client";
import { LayoutDashboard, SearchCheck, ShieldAlert, Users } from "lucide-react";
import { requireUser } from "@/lib/rbac";
import { ROLE_LABELS } from "@/lib/constants";
import { SignOutButton } from "@/components/sign-out-button";

export default async function PortalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await requireUser();

  const links = [
    session.user.roles.includes(RoleName.ADMIN)
      ? { href: "/admin/dashboard", label: "Admin dashboard", icon: LayoutDashboard }
      : null,
    session.user.roles.includes(RoleName.REVIEWER)
      ? { href: "/reviewer/queue", label: "Review queue", icon: SearchCheck }
      : null,
    session.user.roles.includes(RoleName.INTENT_CHECKER)
      ? { href: "/intent-checker/queue", label: "Intent queue", icon: Users }
      : null,
    session.user.roles.includes(RoleName.SPOT_CHECKER)
      ? { href: "/spot-checker/queue", label: "Spot checks", icon: ShieldAlert }
      : null,
  ].filter(Boolean) as Array<{ href: string; label: string; icon: React.ComponentType<{ className?: string }> }>;

  return (
    <div className="min-h-screen">
      <header className="border-b border-slate-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex w-full max-w-7xl flex-col gap-4 px-6 py-5 lg:flex-row lg:items-center lg:justify-between">
          <div className="space-y-1">
            <Link href="/" className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-500">
              Uzbek Prompt Validation Platform
            </Link>
            <div className="flex flex-wrap gap-2">
              {session.user.roles.map((role) => (
                <span
                  key={role}
                  className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-medium text-slate-600"
                >
                  {ROLE_LABELS[role]}
                </span>
              ))}
            </div>
          </div>
          <div className="flex flex-col gap-3 lg:items-end">
            <div className="text-right text-sm text-slate-600">
              <p className="font-semibold text-slate-900">{session.user.name}</p>
              <p>{session.user.email}</p>
            </div>
            <SignOutButton />
          </div>
        </div>
        <nav className="mx-auto flex w-full max-w-7xl flex-wrap gap-2 px-6 pb-5">
          {links.map((link) => {
            const Icon = link.icon;
            return (
              <Link
                key={link.href}
                href={link.href}
                className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:border-slate-400 hover:text-slate-900"
              >
                <Icon className="h-4 w-4" />
                {link.label}
              </Link>
            );
          })}
        </nav>
      </header>
      <main className="mx-auto w-full max-w-7xl px-6 py-8">{children}</main>
    </div>
  );
}
