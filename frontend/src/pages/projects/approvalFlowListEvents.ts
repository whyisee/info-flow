/** MainLayout 各 Tab 的 location 与全局解耦，保存后通过事件让列表页刷新 */
export const APPROVAL_FLOW_LIST_REFRESH = 'infoflow:approval-flow-list-refresh'

export function notifyApprovalFlowListRefresh(projectId: number) {
  window.dispatchEvent(
    new CustomEvent(APPROVAL_FLOW_LIST_REFRESH, { detail: { projectId } }),
  )
}
