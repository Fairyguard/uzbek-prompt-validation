import { redirect } from "next/navigation";
import { FlaskConical, ShieldCheck } from "lucide-react";
import { auth } from "@/lib/auth";
import { LoginForm } from "@/components/login-form";
import { firstRoleHome } from "@/lib/rbac";

export default async function LoginPage() {
  const session = await auth();

  if (session?.user) {
    redirect(firstRoleHome(session.user.roles));
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-6xl flex-col justify-center gap-10 px-6 py-12 lg:flex-row lg:items-center lg:px-10">
      <section className="max-w-xl space-y-6">
        <div className="inline-flex items-center gap-2 rounded-full border border-slate-300 bg-white/80 px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-slate-600">
          Uzbek Research Workflow
        </div>
        <h1 className="text-5xl leading-tight text-slate-900">
          Validate prompt translations without losing intent.
        </h1>
        <p className="max-w-lg text-lg leading-8 text-slate-600">
          A research annotation platform for MT draft review, blind intent recovery, safety-sensitive
          mismatch detection, and escalation-aware final decisions.
        </p>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="rounded-3xl border border-slate-200 bg-white/90 p-5 shadow-sm">
            <FlaskConical className="h-5 w-5 text-slate-700" />
            <p className="mt-3 text-sm font-semibold text-slate-900">Structured annotation</p>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              Review rubrics, blind intent checks, and research-ready XLSX import and export.
            </p>
          </div>
          <div className="rounded-3xl border border-slate-200 bg-white/90 p-5 shadow-sm">
            <ShieldCheck className="h-5 w-5 text-slate-700" />
            <p className="mt-3 text-sm font-semibold text-slate-900">Safety escalation</p>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              Low confidence, meaning drift, mismatch, and not-sure cases route to spot check.
            </p>
          </div>
        </div>
      </section>

      <section className="w-full max-w-md rounded-[2rem] border border-slate-200 bg-white/95 p-8 shadow-xl shadow-slate-300/30">
        <div className="space-y-2">
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-500">Sign in</p>
          <h2 className="text-3xl text-slate-900">Research portal access</h2>
          <p className="text-sm leading-6 text-slate-600">
            Demo accounts are seeded locally. Admins can create and manage users after login.
          </p>
        </div>
        <div className="mt-8">
          <LoginForm />
        </div>
      </section>
    </main>
  );
}
