import { RoleName } from "@prisma/client";
import {
  createUserAction,
  resetPasswordAction,
  toggleUserActiveAction,
  updateUserRolesAction,
} from "@/app/actions";
import { NoticeBanner } from "@/components/notice-banner";
import { PendingButton } from "@/components/pending-button";
import { ROLE_LABELS } from "@/lib/constants";
import { requireRole } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
import { formatDateTime } from "@/lib/utils";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function AdminUsersPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  await requireRole("ADMIN");
  const params = await searchParams;

  const users = await prisma.user.findMany({
    include: {
      roles: {
        include: {
          role: true,
        },
      },
    },
    orderBy: {
      createdAt: "asc",
    },
  });

  return (
    <div className="space-y-8">
      <div className="space-y-2">
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-500">Users</p>
        <h1 className="text-4xl text-slate-900">User and role management</h1>
        <p className="max-w-3xl text-sm leading-7 text-slate-600">
          Create evaluators, assign multiple roles, deactivate accounts, and reset temporary
          passwords.
        </p>
      </div>

      <NoticeBanner
        notice={typeof params.notice === "string" ? params.notice : undefined}
        error={typeof params.error === "string" ? params.error : undefined}
      />

      <section className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-2xl text-slate-900">Create user</h2>
        <form action={createUserAction} className="mt-6 space-y-4">
          <input type="hidden" name="returnTo" value="/admin/users" />
          <div className="grid gap-4 md:grid-cols-3">
            <label className="space-y-2 text-sm font-medium text-slate-700">
              Name
              <input
                name="name"
                required
                className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none transition focus:border-slate-900"
              />
            </label>
            <label className="space-y-2 text-sm font-medium text-slate-700">
              Email
              <input
                name="email"
                type="email"
                required
                className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none transition focus:border-slate-900"
              />
            </label>
            <label className="space-y-2 text-sm font-medium text-slate-700">
              Temporary password
              <input
                name="password"
                type="password"
                required
                className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none transition focus:border-slate-900"
              />
            </label>
          </div>
          <div className="grid gap-3 md:grid-cols-4">
            {Object.values(RoleName).map((role) => (
              <label
                key={role}
                className="flex items-center gap-3 rounded-3xl border border-slate-200 bg-slate-50 px-4 py-4 text-sm font-medium text-slate-700"
              >
                <input type="checkbox" name="roles" value={role} />
                {ROLE_LABELS[role]}
              </label>
            ))}
          </div>
          <div className="flex justify-end">
            <PendingButton>Create user</PendingButton>
          </div>
        </form>
      </section>

      <div className="grid gap-4">
        {users.map((user) => (
          <article key={user.id} className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex flex-col gap-6 xl:flex-row xl:items-start xl:justify-between">
              <div className="space-y-3">
                <div>
                  <h2 className="text-2xl text-slate-900">{user.name}</h2>
                  <p className="text-sm text-slate-600">{user.email}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {user.roles.map((role) => (
                    <span
                      key={role.role.name}
                      className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-medium text-slate-600"
                    >
                      {ROLE_LABELS[role.role.name]}
                    </span>
                  ))}
                  <span
                    className={`rounded-full border px-3 py-1 text-xs font-medium ${
                      user.isActive
                        ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                        : "border-slate-200 bg-slate-50 text-slate-500"
                    }`}
                  >
                    {user.isActive ? "Active" : "Inactive"}
                  </span>
                </div>
                <p className="text-sm text-slate-500">Created {formatDateTime(user.createdAt)}</p>
              </div>

              <div className="grid gap-4 xl:min-w-[28rem]">
                <form action={updateUserRolesAction} className="rounded-3xl border border-slate-200 bg-slate-50 p-4">
                  <input type="hidden" name="returnTo" value="/admin/users" />
                  <input type="hidden" name="userId" value={user.id} />
                  <p className="text-sm font-semibold text-slate-900">Update roles</p>
                  <div className="mt-4 grid gap-2 md:grid-cols-2">
                    {Object.values(RoleName).map((role) => (
                      <label key={role} className="flex items-center gap-3 text-sm text-slate-700">
                        <input
                          type="checkbox"
                          name="roles"
                          value={role}
                          defaultChecked={user.roles.some((entry) => entry.role.name === role)}
                        />
                        {ROLE_LABELS[role]}
                      </label>
                    ))}
                  </div>
                  <div className="mt-4 flex justify-end">
                    <PendingButton>Save roles</PendingButton>
                  </div>
                </form>

                <div className="grid gap-4 md:grid-cols-2">
                  <form action={toggleUserActiveAction} className="rounded-3xl border border-slate-200 bg-slate-50 p-4">
                    <input type="hidden" name="returnTo" value="/admin/users" />
                    <input type="hidden" name="userId" value={user.id} />
                    <input type="hidden" name="isActive" value={String(user.isActive)} />
                    <p className="text-sm font-semibold text-slate-900">Account status</p>
                    <div className="mt-4 flex justify-end">
                      <PendingButton>{user.isActive ? "Deactivate" : "Reactivate"}</PendingButton>
                    </div>
                  </form>

                  <form action={resetPasswordAction} className="rounded-3xl border border-slate-200 bg-slate-50 p-4">
                    <input type="hidden" name="returnTo" value="/admin/users" />
                    <input type="hidden" name="userId" value={user.id} />
                    <p className="text-sm font-semibold text-slate-900">Reset password</p>
                    <input
                      name="password"
                      type="password"
                      placeholder="New password"
                      className="mt-4 w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none transition focus:border-slate-900"
                    />
                    <div className="mt-4 flex justify-end">
                      <PendingButton>Reset</PendingButton>
                    </div>
                  </form>
                </div>
              </div>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}
