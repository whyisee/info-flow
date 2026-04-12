import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Table, Spin, Button, Tag, message, Empty } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import * as rbacApi from '../../services/rbac'
import type { RoleWithPermissions } from '../../services/rbac'
import './permissionPageCommon.css'
import './RolePermissionList.css'

export default function RolePermissionList() {
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [roles, setRoles] = useState<RoleWithPermissions[]>([])

  const load = useCallback(() => {
    setLoading(true)
    rbacApi
      .getRbacCatalog()
      .then((data) => setRoles(data.roles))
      .catch(() => message.error('加载角色列表失败'))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const columns: ColumnsType<RoleWithPermissions> = [
    {
      title: '角色名称',
      dataIndex: 'name',
      key: 'name',
    },
    {
      title: '角色编码',
      dataIndex: 'code',
      key: 'code',
      render: (code: string) => <Tag>{code}</Tag>,
    },
    {
      title: '已授权权限数',
      key: 'count',
      width: 140,
      render: (_, r) => r.permissions.length,
    },
    {
      title: '操作',
      key: 'action',
      width: 120,
      render: (_, r) => (
        <Button
          type="link"
          onClick={() =>
            navigate(`/system/permissions/roles/${encodeURIComponent(r.code)}`)
          }
        >
          配置权限
        </Button>
      ),
    },
  ]

  if (loading && roles.length === 0) {
    return (
      <div className="appCenter">
        <Spin />
      </div>
    )
  }

  return (
    <div className="permPageBlock rolePermList">
      <h3>角色授权</h3>
      <p className="permPageIntro">
        从列表进入某一角色，再勾选权限并保存；保存后对持有该角色的用户下次请求即生效。
      </p>
      <Table<RoleWithPermissions>
        className="rolePermListTable"
        size="small"
        rowKey="code"
        columns={columns}
        dataSource={roles}
        pagination={false}
        locale={{ emptyText: <Empty description="暂无角色" /> }}
      />
    </div>
  )
}
