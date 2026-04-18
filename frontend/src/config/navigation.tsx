import type { MenuProps } from "antd";
import type { ReactNode } from "react";
import {
  DashboardOutlined,
  ProjectOutlined,
  FileTextOutlined,
  AuditOutlined,
  SnippetsOutlined,
  UserOutlined,
  FormOutlined,
  EditOutlined,
  FileDoneOutlined,
  DownloadOutlined,
  SettingOutlined,
  FolderOpenOutlined,
  PieChartOutlined,
  LineChartOutlined,
  TeamOutlined,
  BookOutlined,
  KeyOutlined,
  IdcardOutlined,
  DatabaseOutlined,
} from "@ant-design/icons";

export type TopMenuKey = "declaration" | "survey" | "system";

/** 侧栏叶子：对应具体路由 */
export interface SideMenuLeaf {
  path: string;
  label: string;
  icon: ReactNode;
  /** 具备任一权限码即可显示（与后端 RBAC 一致） */
  permissions: string[];
}

/** 侧栏分组（二级菜单父级） */
export interface SideMenuGroup {
  key: string;
  label: string;
  icon: ReactNode;
  children: SideMenuLeaf[];
}

/** 侧栏一项：顶层叶子（一层菜单）或带子项的分组 */
export type SideMenuEntry = SideMenuLeaf | SideMenuGroup;

export const TOP_MENUS: { key: TopMenuKey; label: string }[] = [
  { key: "declaration", label: "申报" },
  { key: "survey", label: "问卷" },
  { key: "system", label: "系统" },
];

const SIDE_MENUS: Record<TopMenuKey, SideMenuEntry[]> = {
  declaration: [
    {
      path: "/declaration/dashboard",
      label: "首页",
      icon: <DashboardOutlined />,
      permissions: ["declaration:dashboard:view"],
    },
    {
      key: "decl-profile",
      label: "我的资料",
      icon: <IdcardOutlined />,
      children: [
        {
          path: "/declaration/profile",
          label: "基本信息",
          icon: <UserOutlined />,
          permissions: ["declaration:dashboard:view"],
        },
      ],
    },
    {
      key: "decl-biz",
      label: "申报业务",
      icon: <FolderOpenOutlined />,
      children: [
        {
          path: "/declaration/projects",
          label: "项目管理",
          icon: <ProjectOutlined />,
          permissions: ["declaration:project:manage"],
        },
        {
          path: "/declaration/materials",
          label: "我的申报",
          icon: <FileTextOutlined />,
          permissions: ["declaration:material:fill"],
        },
        {
          path: "/declaration/approvals",
          label: "审批中心",
          icon: <AuditOutlined />,
          permissions: [
            "declaration:material:fill",
            "declaration:approval:process",
          ],
        },
        {
          path: "/declaration/templates",
          label: "模板管理",
          icon: <SnippetsOutlined />,
          permissions: ["declaration:template:manage"],
        },
      ],
    },
  ],
  survey: [
    {
      key: "survey-overview",
      label: "概览",
      icon: <PieChartOutlined />,
      children: [
        {
          path: "/survey",
          label: "问卷概览",
          icon: <FormOutlined />,
          permissions: ["survey:overview:view"],
        },
      ],
    },
    {
      key: "survey-app",
      label: "问卷应用",
      icon: <LineChartOutlined />,
      children: [
        {
          path: "/survey/design",
          label: "问卷设计",
          icon: <EditOutlined />,
          permissions: ["survey:design:manage"],
        },
        {
          path: "/survey/export",
          label: "问卷数据",
          icon: <DownloadOutlined />,
          permissions: ["survey:data:export"],
        },
      ],
    },
  ],
  system: [
    {
      key: "sys-access",
      label: "用户与安全",
      icon: <TeamOutlined />,
      children: [
        {
          path: "/system/users",
          label: "用户管理",
          icon: <UserOutlined />,
          permissions: ["system:user:manage"],
        },
        {
          path: "/system/permissions/catalog",
          label: "权限目录",
          icon: <BookOutlined />,
          permissions: ["system:user:manage"],
        },
        {
          path: "/system/permissions/roles",
          label: "角色授权",
          icon: <KeyOutlined />,
          permissions: ["system:user:manage"],
        },
      ],
    },
    {
      key: "sys-config",
      label: "系统配置",
      icon: <SettingOutlined />,
      children: [
        {
          path: "/system/settings",
          label: "系统设置",
          icon: <SettingOutlined />,
          permissions: ["system:settings:view"],
        },
        {
          path: "/system/dict",
          label: "字典维护",
          icon: <DatabaseOutlined />,
          permissions: ["system:dict:manage"],
        },
      ],
    },
  ],
};

export function getSideMenuForTop(top: TopMenuKey): SideMenuEntry[] {
  return SIDE_MENUS[top];
}

export function getTopFromPath(pathname: string): TopMenuKey {
  if (pathname.startsWith("/survey")) return "survey";
  if (pathname.startsWith("/system")) return "system";
  return "declaration";
}

function hasAnyPermission(userPerms: string[], required: string[]): boolean {
  const set = new Set(userPerms);
  return required.some((c) => set.has(c));
}

/** 按权限过滤：顶层叶子按自身权限；分组无可见子项时移除 */
export function filterSideMenuEntries(
  entries: SideMenuEntry[],
  permissions: string[],
): SideMenuEntry[] {
  const out: SideMenuEntry[] = [];
  for (const e of entries) {
    if ("path" in e) {
      if (hasAnyPermission(permissions, e.permissions)) {
        out.push(e);
      }
    } else {
      const children = e.children.filter((c) =>
        hasAnyPermission(permissions, c.permissions),
      );
      if (children.length > 0) {
        out.push({ ...e, children });
      }
    }
  }
  return out;
}

/** 某顶栏分区下至少有一个侧栏入口可见时，才展示该顶栏项 */
export function getVisibleTopMenus(
  permissions: string[],
): { key: TopMenuKey; label: string }[] {
  return TOP_MENUS.filter((m) => {
    const entries = filterSideMenuEntries(SIDE_MENUS[m.key], permissions);
    return entries.length > 0;
  });
}

/** 转为 Ant Design Menu `items`（含顶层叶子与分组子菜单） */
export function toAntdSideMenuItems(entries: SideMenuEntry[]): MenuProps["items"] {
  return entries.map((e) => {
    if ("path" in e) {
      return {
        key: e.path,
        icon: e.icon,
        label: e.label,
      };
    }
    return {
      key: e.key,
      icon: e.icon,
      label: e.label,
      children: e.children.map((c) => ({
        key: c.path,
        icon: c.icon,
        label: c.label,
      })),
    };
  });
}

function firstAccessiblePathFromEntries(entries: SideMenuEntry[]): string | null {
  for (const e of entries) {
    if ("path" in e) return e.path;
    if (e.children.length > 0) return e.children[0].path;
  }
  return null;
}

/** 切换顶部菜单时进入的第一个可访问页 */
export function getDefaultPathForTop(
  top: TopMenuKey,
  permissions: string[],
): string {
  const path = firstAccessiblePathFromEntries(
    filterSideMenuEntries(SIDE_MENUS[top], permissions),
  );
  if (path) return path;
  const fb = firstAccessiblePathFromEntries(
    filterSideMenuEntries(SIDE_MENUS.declaration, permissions),
  );
  if (fb) return fb;
  return "/declaration/dashboard";
}
