import { Navigate } from "react-router-dom";
import type { RouteObject } from "react-router-dom";
import Dashboard from "../pages/Dashboard";
import ProjectList from "../pages/projects/ProjectList";
import ProjectDeclarationConfig from "../pages/projects/ProjectDeclarationConfig";
import MaterialList from "../pages/materials/MaterialList";
import MaterialForm from "../pages/materials/MaterialForm";
import ApprovalCenterPage from "../pages/approvals/ApprovalCenterPage";
import TemplateList from "../pages/templates/TemplateList";
import ProfileBasic from "../pages/declaration/ProfileBasic";
import UserList from "../pages/users/UserList";
import SurveyHome from "../pages/survey/SurveyHome";
import SurveyDesign from "../pages/survey/SurveyDesign";
import SurveyFill from "../pages/survey/SurveyFill";
import SurveyExport from "../pages/survey/SurveyExport";
import SystemSettings from "../pages/system/SystemSettings";
import DictMaintenance from "../pages/system/DictMaintenance";
import DictTypeItemsPage from "../pages/system/DictTypeItemsPage";
import PermissionCatalog from "../pages/system/PermissionCatalog";
import RolePermissionList from "../pages/system/RolePermissionList";
import RolePermissionEdit from "../pages/system/RolePermissionEdit";

/**
 * MainLayout 下子路由（与 createBrowserRouter 共用）。
 * 标签切换不 navigate 时，由 MainLayout 用 useRoutes(..., { pathname }) 按路径渲染缓存面板。
 */
export const mainLayoutChildRoutes: RouteObject[] = [
  { index: true, element: <Navigate to="/declaration/dashboard" replace /> },
  { path: "declaration/dashboard", element: <Dashboard /> },
  { path: "declaration/profile", element: <ProfileBasic /> },
  { path: "declaration/projects", element: <ProjectList /> },
  {
    path: "declaration/projects/:projectId/config",
    element: <ProjectDeclarationConfig />,
  },
  { path: "declaration/materials", element: <MaterialList /> },
  {
    path: "declaration/materials/approval-progress",
    element: <Navigate to="/declaration/approvals" replace />,
  },
  { path: "declaration/materials/new", element: <MaterialForm /> },
  { path: "declaration/materials/:id", element: <MaterialForm /> },
  { path: "declaration/approvals", element: <ApprovalCenterPage /> },
  { path: "declaration/templates", element: <TemplateList /> },
  { path: "survey", element: <SurveyHome /> },
  { path: "survey/design", element: <SurveyDesign /> },
  { path: "survey/fill", element: <SurveyFill /> },
  { path: "survey/export", element: <SurveyExport /> },
  { path: "system/users", element: <UserList /> },
  {
    path: "system/permissions",
    element: <Navigate to="/system/permissions/catalog" replace />,
  },
  { path: "system/permissions/catalog", element: <PermissionCatalog /> },
  { path: "system/permissions/roles/:roleCode", element: <RolePermissionEdit /> },
  { path: "system/permissions/roles", element: <RolePermissionList /> },
  { path: "system/settings", element: <SystemSettings /> },
  { path: "system/dict/:typeCode/items", element: <DictTypeItemsPage /> },
  { path: "system/dict", element: <DictMaintenance /> },
];
