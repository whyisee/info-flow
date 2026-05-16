# InfoFlow 帮助文档

采集日期：2026-05-11  
采集入口：http://127.0.0.1:5173/declaration/dashboard  
截图账号：帮助文档采集账号（school_admin / superuser）

本目录按“一个功能页面一份文档”的方式组织，截图统一存放在 `screenshots/`。后续如需在项目内渲染帮助中心，可优先使用本文档索引或 `manifest.json` 建立路由与文档的对应关系。

## 文档索引

### 登录与申报

- [登录页](login.md)
- [申报首页](declaration-dashboard.md)
- [我的资料 - 基本信息](declaration-profile.md)
- [项目管理](declaration-projects.md)
- [我的申报](declaration-materials.md)
- [审批中心](declaration-approvals.md)
- [模板管理](declaration-templates.md)

### 问卷

- [问卷概览](survey-home.md)
- [问卷设计](survey-design.md)
- [问卷数据](survey-export.md)

### 系统

- [用户管理](system-users.md)
- [权限目录](system-permission-catalog.md)
- [角色授权](system-permission-roles.md)
- [系统设置](system-settings.md)
- [字典维护](system-dict.md)
- [基本信息字段](system-profile-fields.md)

## 使用说明

- 文档中的“入口路径”均为前端路由路径，可拼接系统域名访问。
- 截图反映采集时测试数据库中的实际状态，列表数据可能随环境变化。
- 页面中的按钮权限受当前登录角色影响；普通教师、部门管理员、专家看到的菜单可能少于本账号截图。
- `capture-screenshots.mjs` 是本次截图采集脚本，用于复用同一批页面入口重新生成截图。
