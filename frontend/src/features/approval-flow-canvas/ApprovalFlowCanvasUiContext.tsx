import { createContext, useContext, type ReactNode } from 'react'

export type ApprovalFlowCanvasUiContextValue = {
  /** 删除可执行环节节点（审批 / 并行网关） */
  deleteNodeById: (id: string) => void
}

const Ctx = createContext<ApprovalFlowCanvasUiContextValue | null>(null)

export function ApprovalFlowCanvasUiProvider({
  value,
  children,
}: {
  value: ApprovalFlowCanvasUiContextValue
  children: ReactNode
}) {
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useApprovalFlowCanvasUi(): ApprovalFlowCanvasUiContextValue | null {
  return useContext(Ctx)
}
