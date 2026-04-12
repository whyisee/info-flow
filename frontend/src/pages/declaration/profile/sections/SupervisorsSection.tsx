import { Alert, Form, Input, Space } from "antd";

function ThreeNameInputs({
  baseName,
  placeholders,
  required,
}: {
  baseName: string;
  placeholders: [string, string, string];
  required?: boolean;
}) {
  return (
    <Space wrap className="profileThreeInputs">
      <Form.Item
        name={`${baseName}_1`}
        noStyle
        rules={required ? [{ required: true, message: "请填写" }] : undefined}
      >
        <Input placeholder={placeholders[0]} style={{ width: 200 }} />
      </Form.Item>
      <Form.Item name={`${baseName}_2`} noStyle>
        <Input placeholder={placeholders[1]} style={{ width: 200 }} />
      </Form.Item>
      <Form.Item name={`${baseName}_3`} noStyle>
        <Input placeholder={placeholders[2]} style={{ width: 200 }} />
      </Form.Item>
    </Space>
  );
}

export default function SupervisorsSection() {
  return (
    <>
      <div
        id="profile-section-supervisors"
        className="profileSectionTitle profileSectionTitleSpaced profileAnchor"
      >
        导师与回避信息
      </div>

      <Form.Item label="硕士导师姓名" required>
        <div>
          <ThreeNameInputs
            baseName="master_sup"
            required
            placeholders={["硕士导师姓名1", "硕士导师姓名2", "硕士导师姓名3"]}
          />
          <Alert
            className="profileFieldAlert"
            type="warning"
            showIcon
            message="注意：每个输入框只能填写一位硕士导师姓名全名，不填写单位、职称等信息，直博的填写博士导师姓名。"
          />
        </div>
      </Form.Item>

      <Form.Item label="博士导师姓名" required>
        <div>
          <ThreeNameInputs
            baseName="phd_sup"
            required
            placeholders={["博士导师姓名1", "博士导师姓名2", "博士导师姓名3"]}
          />
          <Alert
            className="profileFieldAlert"
            type="warning"
            showIcon
            message="注意：每个输入框只能填写一位博士导师姓名全名，不填写单位、职称等信息。"
          />
        </div>
      </Form.Item>

      <Form.Item label="博士后合作导师姓名" required>
        <div>
          <ThreeNameInputs
            baseName="postdoc_sup"
            required
            placeholders={[
              "博士后合作导师姓名1",
              "博士后合作导师姓名2",
              "博士后合作导师姓名3",
            ]}
          />
          <Alert
            className="profileFieldAlert"
            type="warning"
            showIcon
            message="注意：每个输入框只能填写一位博士后合作导师姓名全名，不填写单位、职称等信息。"
          />
        </div>
      </Form.Item>

      <Form.Item label="从事该领域研究的直系亲属姓名">
        <div>
          <ThreeNameInputs
            baseName="family_rel"
            placeholders={[
              "从事该领域研究的直系亲属姓名1",
              "从事该领域研究的直系亲属姓名2",
              "从事该领域研究的直系亲属姓名3",
            ]}
          />
          <Alert
            className="profileFieldAlert"
            type="warning"
            showIcon
            message="注意：每个输入框只能填写一位直系亲属姓名全名，不填写单位、职称等信息。"
          />
        </div>
      </Form.Item>

      <Form.Item label="需要回避的专家姓名（不超过三位）">
        <div>
          <ThreeNameInputs
            baseName="recuse_exp"
            placeholders={[
              "需要回避的专家姓名1",
              "需要回避的专家姓名2",
              "需要回避的专家姓名3",
            ]}
          />
          <Alert
            className="profileFieldAlert"
            type="warning"
            showIcon
            message="注意：每个输入框只能填写一位专家姓名的全名，不填写单位、职称等信息。"
          />
        </div>
      </Form.Item>
    </>
  );
}
