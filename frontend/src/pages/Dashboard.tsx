import { Card, Col, Row, Statistic } from 'antd'
import {
  ProjectOutlined,
  FileTextOutlined,
  AuditOutlined,
  UserOutlined,
} from '@ant-design/icons'
import { useAuth } from '../store/AuthContext'

export default function Dashboard() {
  const { user } = useAuth()

  return (
    <div>
      <h2>欢迎，{user?.name}</h2>
      <Row gutter={16} style={{ marginTop: 24 }}>
        <Col span={6}>
          <Card>
            <Statistic title="申报项目" value={0} prefix={<ProjectOutlined />} />
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic title="我的申报" value={0} prefix={<FileTextOutlined />} />
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic title="待审批" value={0} prefix={<AuditOutlined />} />
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic title="用户数" value={0} prefix={<UserOutlined />} />
          </Card>
        </Col>
      </Row>
    </div>
  )
}
