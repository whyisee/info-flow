/** 排查资料表单回填 / 下拉反显时在控制台打印。生产可加 localStorage.DEBUG_PROFILE_FORM=1 */
export function isProfileFormDebugEnabled(): boolean {
  if (import.meta.env.DEV) return true;
  try {
    return globalThis.localStorage?.getItem("DEBUG_PROFILE_FORM") === "1";
  } catch {
    return false;
  }
}

export function debugProfileForm(tag: string, data?: unknown): void {
  if (!isProfileFormDebugEnabled()) return;
  const prefix = "[profile-form]";
  if (data !== undefined) {
    console.log(`${prefix} ${tag}`, data);
  } else {
    console.log(`${prefix} ${tag}`);
  }
}
