import { useCallback, useEffect, useState } from 'react'
import {
  Table,
  Tag,
  message,
  Button,
  Modal,
  Form,
  Input,
  Select,
  InputNumber,
  Space,
  Typography,
  Tooltip,
} from 'antd'
import type { User } from '../../types'
import { ROLE_LABELS } from '../../utils/constants'
import type { UserCreatePayload, UserListQuery, UserUpdatePayload } from '../../services/users'
import * as usersApi from '../../services/users'
import { DownOutlined, UpOutlined } from '@ant-design/icons'
import './UserList.css'

const roleOptions = Object.entries(ROLE_LABELS).map(([value, label]) => ({
  value,
  label,
}))

const ACCOUNT_STATUS_OPTIONS: { value: 'active' | 'deleted' | 'all'; label: string }[] = [
  { value: 'active', label: '仅正常' },
  { value: 'deleted', label: '仅已删除' },
  { value: 'all', label: '全部' },
]

const ACCOUNT_STATUS_LABEL: Record<string, string> = {
  active: '正常',
  deleted: '已删除',
}

function buildListQuery(values: {
  keyword?: string
  role?: string
  dept_id?: number | null
  user_status?: 'active' | 'deleted' | 'all'
}): UserListQuery {
  const q: UserListQuery = {}
  const kw = values.keyword?.trim()
  if (kw) q.keyword = kw
  if (values.role) q.role = values.role
  if (values.dept_id != null && values.dept_id !== undefined) {
    q.dept_id = values.dept_id
  }
  if (values.user_status) {
    q.user_status = values.user_status
  }
  return q
}

function parseBulkCsv(text: string): UserCreatePayload[] {
  const rows: UserCreatePayload[] = []
  const lines = text.split(/\r?\n/)
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim()
    if (!line || line.startsWith('#')) continue
    const parts = line.split(',').map((s) => s.trim())
    if (parts.length < 4) {
      throw new Error(`第 ${i + 1} 行：至少需要 4 列（用户名,密码,姓名,角色）`)
    }
    const username = parts[0]
    const password = parts[1]
    const name = parts[2]
    const role = parts[3]
    let dept_id: number | undefined
    if (parts.length >= 5 && parts[4] !== '') {
      const d = Number(parts[4])
      if (Number.isNaN(d)) {
        throw new Error(`第 ${i + 1} 行：部门 ID 无效`)
      }
      dept_id = d
    }
    let phone: string | undefined
    let email: string | undefined
    if (parts.length >= 6 && parts[5] !== '') {
      phone = parts[5]
    }
    if (parts.length >= 7 && parts[6] !== '') {
      email = parts[6]
    }
    rows.push({
      username,
      password,
      name,
      role,
      dept_id,
      phone,
      email,
      is_superuser: false,
    })
  }
  if (rows.length === 0) {
    throw new Error('没有有效数据行（空行与 # 注释除外）')
  }
  return rows
}

export default function UserList() {
  const [users, setUsers] = useState<User[]>([])
  const [loading, setLoading] = useState(false)
  const [appliedQuery, setAppliedQuery] = useState<UserListQuery>({
    user_status: 'active',
  })

  const [createOpen, setCreateOpen] = useState(false)
  const [createSubmitting, setCreateSubmitting] = useState(false)
  const [createForm] = Form.useForm<UserCreatePayload & { dept_id?: number | null }>()

  const [editOpen, setEditOpen] = useState(false)
  const [editSubmitting, setEditSubmitting] = useState(false)
  const [editing, setEditing] = useState<User | null>(null)
  const [editForm] = Form.useForm<UserUpdatePayload>()

  const [bulkOpen, setBulkOpen] = useState(false)
  const [bulkText, setBulkText] = useState('')
  const [bulkSubmitting, setBulkSubmitting] = useState(false)

  /** 展开后显示：部门 ID、账号状态（用样式隐藏以保留表单值） */
  const [filterMoreOpen, setFilterMoreOpen] = useState(false)

  const [filterForm] = Form.useForm()

  const loadUsers = useCallback(() => {
    setLoading(true)
    usersApi
      .listUsers(appliedQuery)
      .then(setUsers)
      .catch(() => message.error('获取用户列表失败'))
      .finally(() => setLoading(false))
  }, [appliedQuery])

  useEffect(() => {
    loadUsers()
  }, [loadUsers])

  const onFilterSearch = () => {
    const values = filterForm.getFieldsValue()
    setAppliedQuery(buildListQuery(values))
  }

  const onFilterReset = () => {
    filterForm.resetFields()
    filterForm.setFieldsValue({ user_status: 'active' })
    setAppliedQuery({ user_status: 'active' })
  }

  const openCreate = () => {
    createForm.resetFields()
    createForm.setFieldsValue({ role: 'teacher' })
    setCreateOpen(true)
  }

  const onCreate = async () => {
    try {
      const values = await createForm.validateFields()
      setCreateSubmitting(true)
      await usersApi.createUser({
        username: values.username,
        password: values.password,
        name: values.name,
        role: values.role,
        ...(values.roles?.length ? { roles: values.roles } : {}),
        dept_id: values.dept_id ?? null,
        is_superuser: false,
        phone: values.phone?.trim() || undefined,
        email: values.email?.trim() || undefined,
      })
      message.success('创建成功')
      setCreateOpen(false)
      loadUsers()
    } catch (e) {
      if (e && typeof e === 'object' && 'errorFields' in e) return
      message.error('创建失败，用户名可能已存在')
    } finally {
      setCreateSubmitting(false)
    }
  }

  const openEdit = (u: User) => {
    setEditing(u)
    editForm.setFieldsValue({
      name: u.name,
      roles: u.roles?.length ? u.roles : [u.role],
      dept_id: u.dept_id ?? undefined,
      phone: u.phone ?? undefined,
      email: u.email ?? undefined,
      status: (u.status === 'deleted' ? 'deleted' : 'active') as 'active' | 'deleted',
    })
    setEditOpen(true)
  }

  const onEdit = async () => {
    if (!editing) return
    try {
      const values = await editForm.validateFields()
      const payload: UserUpdatePayload = {
        name: values.name,
        roles: values.roles,
        dept_id: values.dept_id ?? null,
        phone: values.phone?.trim() || null,
        email: values.email?.trim() || null,
        status: values.status,
      }
      setEditSubmitting(true)
      await usersApi.updateUser(editing.id, payload)
      message.success('已保存')
      setEditOpen(false)
      setEditing(null)
      loadUsers()
    } catch (e) {
      if (e && typeof e === 'object' && 'errorFields' in e) return
      message.error('保存失败')
    } finally {
      setEditSubmitting(false)
    }
  }

  const onBulkImport = async () => {
    let items: UserCreatePayload[]
    try {
      items = parseBulkCsv(bulkText)
    } catch (err) {
      message.error(err instanceof Error ? err.message : '解析失败')
      return Promise.reject()
    }
    setBulkSubmitting(true)
    try {
      const res = await usersApi.bulkCreateUsers(items)
      message.success(`成功创建 ${res.created} 个用户`)
      if (res.failed.length > 0) {
        Modal.warning({
          title: `${res.failed.length} 条未导入`,
          width: 560,
          content: (
            <div className="userBulkFailList">
              {res.failed.map((f) => (
                <div key={f.username}>
                  <Typography.Text strong>{f.username}</Typography.Text>
                  <Typography.Text type="secondary"> — {f.detail}</Typography.Text>
                </div>
              ))}
            </div>
          ),
        })
      }
      setBulkOpen(false)
      setBulkText('')
      loadUsers()
    } catch {
      message.error('批量导入失败')
    } finally {
      setBulkSubmitting(false)
    }
  }

  const columns = [
    { title: 'ID', dataIndex: 'id', key: 'id', width: 72 },
    { title: '用户名', dataIndex: 'username', key: 'username', ellipsis: true },
    { title: '姓名', dataIndex: 'name', key: 'name', ellipsis: true },
    {
      title: '手机号',
      dataIndex: 'phone',
      key: 'phone',
      width: 120,
      ellipsis: true,
      render: (v: string | null | undefined) => v || '—',
    },
    {
      title: '邮箱',
      dataIndex: 'email',
      key: 'email',
      width: 180,
      ellipsis: true,
      render: (v: string | null | undefined) => v || '—',
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      width: 88,
      render: (s: string | undefined) => {
        const isDel = s === 'deleted'
        return (
          <Tag color={isDel ? 'default' : 'success'}>
            {ACCOUNT_STATUS_LABEL[s || 'active'] ?? s ?? '—'}
          </Tag>
        )
      },
    },
    {
      title: '主角色',
      dataIndex: 'role',
      key: 'role',
      width: 100,
      render: (role: string) => <Tag>{ROLE_LABELS[role] || role}</Tag>,
    },
    {
      title: '已绑定角色',
      dataIndex: 'roles',
      key: 'roles',
      render: (_: unknown, r: User) => (
        <span>
          {(r.roles?.length ? r.roles : [r.role]).map((c) => (
            <Tag key={c}>{ROLE_LABELS[c] || c}</Tag>
          ))}
        </span>
      ),
    },
    {
      title: '部门 ID',
      dataIndex: 'dept_id',
      key: 'dept_id',
      width: 88,
      render: (v: number | undefined) => v ?? '—',
    },
    {
      title: '操作',
      key: 'actions',
      width: 88,
      fixed: 'right' as const,
      render: (_: unknown, r: User) => (
        <Button type="link" size="small" onClick={() => openEdit(r)}>
          编辑
        </Button>
      ),
    },
  ]

  return (
    <div className="userListPage">
      <div className="userListToolbar">
        <h3 className="userListTitle">用户管理</h3>
      </div>

      <Form
        form={filterForm}
        layout="inline"
        className="userListFilters"
        onFinish={onFilterSearch}
        initialValues={{ user_status: 'active' }}
      >
        <div className="userListFiltersMain">
          <Form.Item name="keyword" label="关键词">
            <Input allowClear placeholder="用户名、姓名、手机、邮箱" style={{ width: 200 }} />
          </Form.Item>
          <Form.Item name="role" label="主角色">
            <Select
              allowClear
              placeholder="全部"
              options={roleOptions}
              style={{ width: 140 }}
            />
          </Form.Item>
          <Form.Item className="userListFilterActions">
            <Space wrap size="middle">
              <Tooltip title={filterMoreOpen ? '收起更多条件' : '更多筛选条件'}>
                <Button
                  type="text"
                  className="userListFilterMoreBtn"
                  icon={filterMoreOpen ? <UpOutlined /> : <DownOutlined />}
                  aria-expanded={filterMoreOpen}
                  onClick={() => setFilterMoreOpen((v) => !v)}
                />
              </Tooltip>
              <Button type="primary" htmlType="submit">
                查询
              </Button>
              <Button onClick={onFilterReset}>重置</Button>
              <Button type="primary" htmlType="button" onClick={openCreate}>
                新建用户
              </Button>
              <Button htmlType="button" onClick={() => setBulkOpen(true)}>
                批量导入
              </Button>
            </Space>
          </Form.Item>
        </div>
        <div
          className="userListFiltersExtra"
          style={{ display: filterMoreOpen ? 'flex' : 'none' }}
          aria-hidden={!filterMoreOpen}
        >
          <Form.Item name="dept_id" label="部门 ID">
            <InputNumber min={1} placeholder="可选" style={{ width: 120 }} />
          </Form.Item>
          <Form.Item name="user_status" label="账号状态">
            <Select options={ACCOUNT_STATUS_OPTIONS} style={{ width: 120 }} />
          </Form.Item>
        </div>
      </Form>

      <Table
        className="userListTable"
        columns={columns}
        dataSource={users}
        rowKey="id"
        loading={loading}
        scroll={{ x: 1220 }}
      />

      <Modal
        title="新建用户"
        open={createOpen}
        onOk={onCreate}
        onCancel={() => setCreateOpen(false)}
        confirmLoading={createSubmitting}
        destroyOnClose
        width={480}
      >
        <Form form={createForm} layout="vertical" className="userListForm">
          <Form.Item
            name="username"
            label="用户名"
            rules={[{ required: true, message: '请输入用户名' }]}
          >
            <Input autoComplete="off" />
          </Form.Item>
          <Form.Item
            name="password"
            label="密码"
            rules={[{ required: true, message: '请输入密码' }]}
          >
            <Input.Password autoComplete="new-password" />
          </Form.Item>
          <Form.Item name="name" label="姓名" rules={[{ required: true, message: '请输入姓名' }]}>
            <Input />
          </Form.Item>
          <Form.Item
            name="phone"
            label="手机号"
            rules={[
              {
                pattern: /^$|^1[3-9]\d{9}$/,
                message: '请输入11位中国大陆手机号或留空',
              },
            ]}
          >
            <Input placeholder="可选" maxLength={20} autoComplete="tel" />
          </Form.Item>
          <Form.Item
            name="email"
            label="邮箱"
            rules={[
              {
                validator: (_: unknown, v: string) => {
                  const s = v?.trim()
                  if (!s) return Promise.resolve()
                  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)) {
                    return Promise.reject(new Error('邮箱格式不正确'))
                  }
                  return Promise.resolve()
                },
              },
            ]}
          >
            <Input placeholder="可选" maxLength={120} autoComplete="email" />
          </Form.Item>
          <Form.Item name="role" label="主角色" rules={[{ required: true, message: '请选择角色' }]}>
            <Select options={roleOptions} placeholder="角色" />
          </Form.Item>
          <Form.Item name="roles" label="多角色（可选）">
            <Select mode="multiple" allowClear options={roleOptions} placeholder="不选则仅主角色" />
          </Form.Item>
          <Form.Item name="dept_id" label="部门 ID">
            <InputNumber style={{ width: '100%' }} min={1} placeholder="可选" />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title={`编辑用户${editing ? ` — ${editing.username}` : ''}`}
        open={editOpen}
        onOk={onEdit}
        onCancel={() => {
          setEditOpen(false)
          setEditing(null)
        }}
        confirmLoading={editSubmitting}
        destroyOnClose
        width={480}
      >
        <Form form={editForm} layout="vertical" className="userListForm">
          <Form.Item name="name" label="姓名" rules={[{ required: true, message: '请输入姓名' }]}>
            <Input />
          </Form.Item>
          <Form.Item
            name="phone"
            label="手机号"
            rules={[
              {
                pattern: /^$|^1[3-9]\d{9}$/,
                message: '请输入11位中国大陆手机号或留空',
              },
            ]}
          >
            <Input placeholder="可选" maxLength={20} autoComplete="tel" />
          </Form.Item>
          <Form.Item
            name="email"
            label="邮箱"
            rules={[
              {
                validator: (_: unknown, v: string) => {
                  const s = v?.trim()
                  if (!s) return Promise.resolve()
                  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)) {
                    return Promise.reject(new Error('邮箱格式不正确'))
                  }
                  return Promise.resolve()
                },
              },
            ]}
          >
            <Input placeholder="可选" maxLength={120} autoComplete="email" />
          </Form.Item>
          <Form.Item
            name="roles"
            label="角色"
            rules={[{ required: true, message: '请至少选择一个角色' }]}
          >
            <Select mode="multiple" options={roleOptions} placeholder="角色" />
          </Form.Item>
          <Form.Item name="dept_id" label="部门 ID">
            <InputNumber style={{ width: '100%' }} min={1} placeholder="可选" />
          </Form.Item>
          <Form.Item name="status" label="账号状态" rules={[{ required: true, message: '请选择状态' }]}>
            <Select
              options={[
                { value: 'active', label: '正常' },
                { value: 'deleted', label: '已删除（不可登录）' },
              ]}
            />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title="批量导入用户"
        open={bulkOpen}
        onOk={onBulkImport}
        onCancel={() => setBulkOpen(false)}
        confirmLoading={bulkSubmitting}
        okText="开始导入"
        width={640}
        destroyOnClose
      >
        <Typography.Paragraph type="secondary" className="userBulkHint">
          每行一个用户，英文逗号分隔。第 1–4 列必填：用户名、密码、姓名、主角色；第 5 列部门 ID（可空）；第 6 列手机号（可空）；第
          7 列邮箱（可空）。字段中请勿包含逗号。
        </Typography.Paragraph>
        <Typography.Paragraph type="secondary" className="userBulkExample">
          示例：
          <pre>
            {`wang,initPass123,王五,teacher,,13800138000,wang@example.com\nliu,initPass456,刘六,school_admin,100,,`}
          </pre>
        </Typography.Paragraph>
        <Input.TextArea
          rows={10}
          value={bulkText}
          onChange={(e) => setBulkText(e.target.value)}
          placeholder="# 以 # 开头的行为注释"
          className="userBulkTextarea"
        />
      </Modal>
    </div>
  )
}
