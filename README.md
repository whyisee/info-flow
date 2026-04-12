# 教师评选申报材料管理系统

面向高校教师评选场景的申报材料在线管理平台，支持材料填报、文件上传、多级审批等功能。

## 技术栈

| 层级   | 技术                                        |
| ------ | ------------------------------------------- |
| 前端   | React 18 + Vite + Ant Design 5 + TypeScript |
| 后端   | Python 3.11 + FastAPI                       |
| 数据库 | MySQL 8.0                                   |
| ORM    | SQLAlchemy 2.0                              |
| 认证   | JWT                                         |

## 项目结构

```
info-flow/
├── backend/                 # 后端服务
│   ├── app/
│   │   ├── main.py          # FastAPI 入口
│   │   ├── config.py        # 配置
│   │   ├── database.py      # 数据库连接
│   │   ├── models/          # ORM 模型
│   │   ├── schemas/         # 请求/响应模型
│   │   ├── api/             # 路由
│   │   └── core/            # 认证与权限
│   ├── alembic/             # 数据库迁移
│   └── requirements.txt
├── frontend/                # 前端应用
│   └── src/
│       ├── pages/           # 页面
│       ├── layouts/         # 布局
│       ├── services/        # API 请求
│       ├── store/           # 状态管理
│       └── types/           # 类型定义
└── design.md                # 设计文档
```

## 快速开始

### 1. 数据库

```bash
mysql -u root -p -e "CREATE DATABASE info_flow DEFAULT CHARSET utf8mb4;"
```

### 2. 后端

```bash
cd backend
python -m venv venv
source venv/bin/activate    # Windows: venv\Scripts\activate
pip install -r requirements.txt

# 修改 .env 中的数据库连接信息
# 执行数据库迁移
# alembic upgrade head

# 启动服务
uvicorn app.main:app --reload
```

启动后访问 http://localhost:8000/docs 查看 API 文档。

### 3. 前端

```bash
cd frontend
npm install
npm run dev
```

访问 http://localhost:5173。

## 用户角色

| 角色         | 说明                                     |
| ------------ | ---------------------------------------- |
| teacher      | 教师，填报申报材料                       |
| dept_admin   | 部门管理员，部门级审批                   |
| school_admin | 学校管理员，项目/用户/模板管理，校级审批 |
| expert       | 专家评审，专家评审环节                   |

## API 模块

| 模块        | 前缀             | 说明         |
| ----------- | ---------------- | ------------ |
| Auth        | /api/auth        | 登录、注册   |
| Users       | /api/users       | 用户管理     |
| Projects    | /api/projects    | 申报项目管理 |
| Materials   | /api/materials   | 申报材料管理 |
| Attachments | /api/attachments | 文件上传下载 |
| Approvals   | /api/approvals   | 审批流程     |
| Templates   | /api/templates   | 模板管理     |
