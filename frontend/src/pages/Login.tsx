import { Form, Input, Button, Card, message } from "antd";
import { UserOutlined, LockOutlined } from "@ant-design/icons";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../store/AuthContext";
import "../styles/auth.css";

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [form] = Form.useForm();

  const onFinish = async (values: { username: string; password: string }) => {
    try {
      await login(values.username, values.password);
      navigate("/declaration/dashboard");
    } catch {
      message.error("登录失败，请检查用户名和密码");
    }
  };

  return (
    <div className="authPage authPage--split">
      <div className="authSplitHero" aria-hidden />
      <div className="authSplitAside">
        <Card title="IF" className="authCard authCard--split">
          <Form form={form} onFinish={onFinish} size="large">
            <Form.Item
              name="username"
              rules={[{ required: true, message: "请输入用户名" }]}
            >
              <Input prefix={<UserOutlined />} placeholder="用户名" />
            </Form.Item>
            <Form.Item
              name="password"
              rules={[{ required: true, message: "请输入密码" }]}
            >
              <Input.Password prefix={<LockOutlined />} placeholder="密码" />
            </Form.Item>
            <Form.Item>
              <Button type="primary" htmlType="submit" block>
                登录
              </Button>
            </Form.Item>
          </Form>
          <div className="authFooter">
            没有账号？<Link to="/register">去注册</Link>
          </div>
        </Card>
      </div>
    </div>
  );
}
