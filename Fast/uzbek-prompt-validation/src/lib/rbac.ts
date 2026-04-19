import { RoleName, TaskType } from "@prisma/client";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { TASK_ROLE_MAP } from "@/lib/constants";

export async function requireUser() {
  const session = await auth();

  if (!session?.user?.id || !session.user.isActive) {
    redirect("/login");
  }

  return session;
}

export async function requireRole(role: RoleName | `${RoleName}`) {
  const session = await requireUser();

  if (!session.user.roles.includes(role as RoleName)) {
    redirect("/");
  }

  return session;
}

export function hasRole(roles: RoleName[], role: RoleName) {
  return roles.includes(role);
}

export function roleForTaskType(taskType: TaskType) {
  return TASK_ROLE_MAP[taskType];
}

export function firstRoleHome(roles: RoleName[]) {
  if (roles.includes(RoleName.ADMIN)) {
    return "/admin/dashboard";
  }

  if (roles.includes(RoleName.REVIEWER)) {
    return "/reviewer/queue";
  }

  if (roles.includes(RoleName.INTENT_CHECKER)) {
    return "/intent-checker/queue";
  }

  if (roles.includes(RoleName.SPOT_CHECKER)) {
    return "/spot-checker/queue";
  }

  return "/login";
}
