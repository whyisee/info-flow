import { useCallback, useEffect, useMemo, useState } from 'react'
import { Card, Spin, Table, Empty, message } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import * as rbacApi from '../../services/rbac'
import type { PermissionItem } from '../../services/rbac'
import { MODULE_LABEL } from './permissionShared'
import './permissionPageCommon.css'
import './PermissionCatalog.css'

export default function PermissionCatalog() {
  const [loading, setLoading] = useState(true)
  const [permissions, setPermissions] = useState<PermissionItem[]>([])

  const load = useCallback(() => {
    setLoading(true)
    rbacApi
      .getRbacCatalog()
      .then((data) => setPermissions(data.permissions))
      .catch(() => message.error('加载权限数据失败'))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const columns: ColumnsType<PermissionItem> = useMemo(
    () => [
      {
        title: '模块',
        dataIndex: 'module',
        key: 'module',
        width: 100,
        render: (m: string) => MODULE_LABEL[m] ?? m,
      },
      { title: '权限码', dataIndex: 'code', key: 'code', ellipsis: true },
      { title: '说明', dataIndex: 'name', key: 'name', ellipsis: true },
    ],
    [],
  )

  if (loading && permissions.length === 0) {
    return (
      <div className="appCenter">
        <Spin />
      </div>
    )
  }

  return (
    <div className="permPageBlock permCatalog">
      <h3>权限目录</h3>
      <p className="permPageIntro">
        系统预置权限点清单（只读），与接口鉴权、菜单可见性使用的编码一致。
      </p>
      <Card className="permCatalogTableCard">
        <Table<PermissionItem>
          size="small"
          rowKey="code"
          columns={columns}
          dataSource={permissions}
          pagination={false}
          locale={{ emptyText: <Empty description="暂无数据" /> }}
        />
      </Card>
    </div>
  )
}
