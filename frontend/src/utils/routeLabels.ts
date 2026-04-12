import { getTopFromPath } from "../config/navigation";
import { ROLE_LABELS } from "./constants";

/** 字典项页 `navigate(..., { state })` 使用，供标签标题显示字典类型中文名 */
export type DictItemsTabState = {
  dictTypeName?: string;
};

function dictTypeCodeFromItemsPath(pathname: string): string | null {
  const m = pathname.match(/^\/system\/dict\/([^/]+)\/items$/);
  return m ? decodeURIComponent(m[1]) : null;
}

/** 结合 location.state 解析标签文案（如字典项页用中文类型名） */
export function resolveTabLabel(pathname: string, state: unknown): string {
  const dictCode = dictTypeCodeFromItemsPath(pathname);
  if (dictCode !== null) {
    const name = (state as DictItemsTabState | null)?.dictTypeName?.trim();
    if (name) return name;
    return dictCode;
  }
  return getTabLabel(pathname);
}

const PATH_LABELS: Record<string, string> = {
  "/declaration/dashboard": "首页",
  "/declaration/profile": "基本信息",
  "/declaration/projects": "项目管理",
  "/declaration/materials": "我的申报",
  "/declaration/approvals": "审批中心",
  "/declaration/templates": "模板管理",
  "/survey": "问卷概览",
  "/survey/design": "问卷设计",
  "/survey/fill": "问卷填写",
  "/survey/export": "数据导出",
  "/system/users": "用户管理",
  "/system/permissions/catalog": "权限目录",
  "/system/permissions/roles": "角色授权",
  "/system/settings": "系统设置",
  "/system/dict": "字典维护",
};

export function getTabLabel(pathname: string): string {
  if (pathname === "/system/permissions") return "权限目录";
  const dictCode = dictTypeCodeFromItemsPath(pathname);
  if (dictCode !== null) {
    return dictCode;
  }
  const roleEdit = pathname.match(/^\/system\/permissions\/roles\/([^/]+)$/);
  if (roleEdit) {
    const code = decodeURIComponent(roleEdit[1]);
    const name = ROLE_LABELS[code] ?? code;
    return `授权 · ${name}`;
  }
  if (PATH_LABELS[pathname]) return PATH_LABELS[pathname];
  if (pathname === "/declaration/materials/new") return "新建申报";
  const m = pathname.match(/^\/declaration\/materials\/(\d+)$/);
  if (m) return `申报 #${m[1]}`;
  const cfg = pathname.match(/^\/declaration\/projects\/(\d+)\/config$/);
  if (cfg) return `申报配置 · 项目${cfg[1]}`;
  return pathname;
}

/** 侧栏选中项：带子路由的菜单用前缀匹配 */
export function getMenuSelectedKey(pathname: string): string {
  if (pathname.startsWith("/declaration/materials")) {
    return "/declaration/materials";
  }
  if (pathname.startsWith("/declaration/profile")) {
    return "/declaration/profile";
  }
  if (pathname.startsWith("/declaration/projects")) {
    return "/declaration/projects";
  }
  if (pathname.startsWith("/system/permissions/roles")) {
    return "/system/permissions/roles";
  }
  if (pathname.startsWith("/system/permissions")) {
    return "/system/permissions/catalog";
  }
  if (pathname.startsWith("/system/dict")) {
    return "/system/dict";
  }
  return pathname;
}

/** 顶部「申报 | 问卷 | 系统」当前高亮 */
export function getTopMenuSelectedKey(pathname: string): string {
  return getTopFromPath(pathname);
}
