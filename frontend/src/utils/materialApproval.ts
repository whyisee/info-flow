import type { Material } from "../types";

export function materialStepCount(m: Pick<Material, "approval_snapshot">): number {
  const raw = m.approval_snapshot as { steps?: unknown[] } | null | undefined;
  const n = raw?.steps && Array.isArray(raw.steps) ? raw.steps.length : 0;
  return n > 0 ? n : 3;
}

export function isMaterialDone(
  m: Pick<Material, "status" | "approval_snapshot" | "workflow_status">,
): boolean {
  if (m.workflow_status === "approved") return true;
  const n = materialStepCount(m);
  return m.status === n + 1;
}

export function isMaterialInReview(
  m: Pick<Material, "status" | "approval_snapshot" | "workflow_status">,
): boolean {
  if (m.workflow_status != null) return m.workflow_status === "reviewing";
  if (m.status === 0 || m.status === 5) return false;
  return !isMaterialDone(m);
}

export function materialStatusLabel(
  status: number,
  stepCount: number,
  workflowStatus?: string | null,
  currentStepIndex?: number | null,
): string {
  if (workflowStatus === "draft") return "草稿";
  if (workflowStatus === "returned") return "已退回";
  if (workflowStatus === "rejected") return "已驳回";
  if (workflowStatus === "cancelled") return "已取消";
  if (workflowStatus === "approved") return "已通过";
  if (workflowStatus === "reviewing") {
    const idx = typeof currentStepIndex === "number" ? currentStepIndex : Math.max(0, status - 1);
    return `第 ${idx + 1}/${stepCount > 0 ? stepCount : 3} 环节`;
  }
  const n = stepCount > 0 ? stepCount : 3;
  if (status === 0) return "草稿";
  if (status === 5) return "已驳回";
  if (status === n + 1) return "已通过";
  if (status >= 1 && status <= n) return `第 ${status}/${n} 环节`;
  return `状态 ${status}`;
}
