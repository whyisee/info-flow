import type { PermissionItem } from '../../services/rbac'

export const MODULE_LABEL: Record<string, string> = {
  declaration: '申报',
  survey: '问卷',
  system: '系统',
}

export const MODULE_ORDER = ['declaration', 'survey', 'system'] as const

export function mergeModuleSelection(
  current: string[],
  moduleKey: (typeof MODULE_ORDER)[number],
  catalog: PermissionItem[],
  checked: string[],
): string[] {
  const inModule = new Set(
    catalog.filter((p) => p.module === moduleKey).map((p) => p.code),
  )
  const rest = current.filter((c) => !inModule.has(c))
  return [...rest, ...checked]
}
