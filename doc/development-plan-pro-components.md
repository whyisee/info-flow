# 前端 ProComponents 接入与封装 — 开发计划

## 1. 背景与目标

- **背景**：后台页（列表、弹窗表单、详情）与 Ant Design 手写样板代码多；申报结构「可视化配置」依赖嵌套 `Form.List`，维护成本高。
- **目标**：引入 [@ant-design/pro-components](https://github.com/ant-design/pro-components)，在 **不推翻现有业务** 的前提下，通过 **薄封装 + 分阶段替换**，降低后续页面开发量、统一交互与请求模式。
- **非目标（本阶段）**：用 Pro 一次性替换申报配置可视化编辑器；不引入 Umi / Ant Design Pro 脚手架整站迁移。

## 2. 约束与前提

| 项 | 说明 |
|----|------|
| 技术栈 | React 19、Vite、Ant Design 6、现有 `axios` 封装 |
| 后端 | FastAPI，接口路径与权限保持现状 |
| 兼容 | 接入前以 npm 上 **peerDependencies** 为准，选用支持 **antd 6** 的 `@ant-design/pro-components` 主版本 |
| 样式 | 与现有 `MainLayout`、主题色一致；新样式尽量进独立 CSS 文件 |

## 3. 阶段划分

### 阶段 A — 依赖与工程基线（0.5～1 天）

- [ ] 安装 `@ant-design/pro-components`（及文档要求的对等依赖），解决 Vite 下可能的 `rc-field-form` 等解析问题。
- [ ] 本地 `npm run build` / `npm run dev` 通过，无类型与打包告警阻塞。
- [ ] 在 `doc/` 或 README 片段中记录 **锁定版本号**，便于团队对齐。

**产出**：可运行的依赖基线、简短「安装与版本」说明（可合并进本文附录）。

### 阶段 B — 目录与薄封装约定（0.5～1 天）

建议目录（可按项目习惯微调）：

```
frontend/src/components/pro/
  InfoProTable.tsx      # 统一 request、分页、loading、空态
  InfoModalForm.tsx     # 可选：ModalForm 默认宽度、footer、与 message 联动
  index.ts
```

约定：

- 数据请求仍走现有 `services/*` + `request`，**不在封装层写死业务 URL**。
- 封装只处理：**默认 pagination、scroll、toolBar、错误提示钩子**；业务列定义仍在页面内。

**产出**：1～2 个可复用组件 + 一处示例用法（见阶段 C）。

### 阶段 C — 试点页面改造（1～2 天）

选 **改造成本低、重复模式明显** 的页面先行（建议二选一或并行小步）：

| 试点 | 改造内容 | 验收 |
|------|----------|------|
| **项目管理列表**（若存在独立列表页） | `Table` → `ProTable`（或封装后的 `InfoProTable`） | 分页、加载、列与操作与现网一致 |
| **申报配置 — 版本列表**（`ProjectDeclarationConfig` 中表格） | 同上 | 与现网一致；编辑弹窗行为不变 |

**明确不改动**：`DeclarationConfigEditModal` 内复杂表单逻辑本阶段 **仅可** 将外层容器与按钮区与 Pro 对齐（可选），**不强制**重写 `DeclarationConfigVisualEditor`。

**产出**：至少 **1 个** 页面完成替换并通过自测；团队对封装 API 达成共识。

### 阶段 D — 扩展与表单场景（按需，每处 0.5～1 天）

- 对「新建 / 编辑」弹窗较多的模块，引入 **`ModalForm` + `ProFormText` / `ProFormSelect` 等**，抽 **InfoModalForm**（若阶段 B 未做）。
- 只读详情页可评估 **`ProDescriptions`**。

**产出**：2+ 页面使用统一封装；更新本文「已落地页面」清单。

### 阶段 E — 申报配置编辑器（长期，独立评估）

- 评估是否用 **`ProFormList` + `renderFormItem`** 分段替换手写 `Form.List`（按模块 / 子模块拆分）。
- 需单独 **技术方案 + 里程碑**（与 `doc/project-declaration-config-design.md` 对齐），**不在本计划内排死工期**。

## 4. 风险与应对

| 风险 | 应对 |
|------|------|
| antd 6 与 Pro 版本不匹配 | 严格按官方 peer 范围锁定版本；升级前在分支验证 |
| 包体积增大 | 按需 import；路由级 code-split 可后续再做 |
| 封装过度导致难定制 | 坚持「薄封装」；复杂页允许直接使用 Pro 底层 API |

## 5. 验收标准（整项）

- 试点页面功能与改造前一致（含权限、错误提示）。
- 新增同类列表/表单页时，**优先**复用 `components/pro` 而非复制粘贴 Table 样板。
- 文档：本文 + 版本号可追溯。

## 6. 附录 — 建议跟踪字段

| 日期 | 内容 |
|------|------|
| | 依赖版本：`@ant-design/pro-components` ______，`antd` ______ |
| | 试点页面：________ |
| | 负责人：________ |

---

*文档随迭代更新；重大范围变更请同步修改阶段 E 与验收标准。*
