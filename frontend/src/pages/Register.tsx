import { Form, Input, Button, Card, message, Select } from 'antd'
import { UserOutlined, LockOutlined, IdcardOutlined } from '@ant-design/icons'
import { Link, useNavigate } from 'react-router-dom'
import * as authService from '../services/auth'
import { useAuth } from '../store/AuthContext'
import { ROLE_LABELS } from '../utils/constants'
import type { User } from '../types'
import '../styles/auth.css'

const roleOptions = Object.entries(ROLE_LABELS).map(([value, label]) => ({
  value,
  label,
}))

export default function Register() {
  const { login } = useAuth()
  const navigate = useNavigate()
  const [form] = Form.useForm()

  const onFinish = async (values: {
    username: string
    password: string
    name: string
    role: User['role']
  }) => {
    try {
      await authService.register({
        username: values.username,
        password: values.password,
        name: values.name,
        role: values.role,
      })
      await login(values.username, values.password)
      message.success('注册成功')
      navigate('/declaration/dashboard')
    } catch {
      message.error('注册失败，用户名可能已存在')
    }
  }

  return (
    <div className="authPage">
      <Card title="创建账号" className="authCard">
        <Form form={form} onFinish={onFinish} size="large" initialValues={{ role: 'teacher' }}>
          <Form.Item name="name" rules={[{ required: true, message: '请输入姓名' }]}>
            <Input prefix={<IdcardOutlined />} placeholder="姓名" />
          </Form.Item>
          <Form.Item name="username" rules={[{ required: true, message: '请输入用户名' }]}>
            <Input prefix={<UserOutlined />} placeholder="用户名" autoComplete="username" />
          </Form.Item>
          <Form.Item name="password" rules={[{ required: true, message: '请输入密码' }]}>
            <Input.Password prefix={<LockOutlined />} placeholder="密码" autoComplete="new-password" />
          </Form.Item>
          <Form.Item
            name="confirm"
            dependencies={['password']}
            rules={[
              { required: true, message: '请再次输入密码' },
              ({ getFieldValue }) => ({
                validator(_, value) {
                  if (!value || getFieldValue('password') === value) {
                    return Promise.resolve()
                  }
                  return Promise.reject(new Error('两次输入的密码不一致'))
                },
              }),
            ]}
          >
            <Input.Password prefix={<LockOutlined />} placeholder="确认密码" autoComplete="new-password" />
          </Form.Item>
          <Form.Item name="role" label="角色" rules={[{ required: true, message: '请选择角色' }]}>
            <Select options={roleOptions} placeholder="选择角色" />
          </Form.Item>
          <Form.Item>
            <Button type="primary" htmlType="submit" block>
              注册
            </Button>
          </Form.Item>
        </Form>
        <div className="authFooter">
          已有账号？<Link to="/login">去登录</Link>
        </div>
      </Card>
    </div>
  )
}
