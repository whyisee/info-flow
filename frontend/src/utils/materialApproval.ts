import type { Material } from "../types";

export function materialStepCount(m: Pick<Material, "approval_snapshot">): number {
  const raw = m.approval_snapshot as { steps?: unknown[] } | null | undefined;
  const n = raw?.steps && Array.isArray(raw.steps) ? raw.steps.length : 0;
  return n > 0 ? n : 3;
}

export function isMaterialDone(m: Pick<Material, "status" | "approval_snapshot">): boolean {
  const n = materialStepCount(m);
  return m.status === n + 1;
}

export function isMaterialInReview(
  m: Pick<Material, "status" | "approval_snapshot">,
): boolean {
  if (m.status === 0 || m.status === 5) return false;
  return !isMaterialDone(m);
}

export function materialStatusLabel(
  status: number,
  stepCount: number,
): string {
  const n = stepCount > 0 ? stepCount : 3;
  if (status === 0) return "草稿";
  if (status === 5) return "已驳回";
  if (status === n + 1) return "已通过";
  if (status >= 1 && status <= n) return `第 ${status}/${n} 环节`;
  return `状态 ${status}`;
}
