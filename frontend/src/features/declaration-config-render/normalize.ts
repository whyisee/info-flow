/** 接口 / 存储偶发字符串 JSON 时归一化为对象 */
export function normalizeDeclarationConfig(raw: unknown): Record<string, unknown> {
  if (raw == null) return { modules: [] };
  if (typeof raw === "string") {
    try {
      const p = JSON.parse(raw) as unknown;
      if (typeof p === "object" && p !== null && !Array.isArray(p)) {
        return p as Record<string, unknown>;
      }
    } catch {
      /* fallthrough */
    }
    return { modules: [] };
  }
  if (typeof raw === "object" && !Array.isArray(raw)) {
    return raw as Record<string, unknown>;
  }
  return { modules: [] };
}
