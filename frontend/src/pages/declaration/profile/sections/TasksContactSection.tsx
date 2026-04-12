import { useMemo } from "react";
import { Col, Form, Input, Row, Select, Space } from "antd";
import { QuestionCircleOutlined } from "@ant-design/icons";

import { useDictFlatItems } from "../../../../hooks/useDictFlatItems";
import type { DataDictItemDTO } from "../../../../services/dataDict";

const { TextArea } = Input;

/** 与系统字典类型编码一致：一级岗位大类 + 二级具体岗位 */
const TASK_POST_DICT = "task_post";
/** 学科方向三级：根 → 二 → 三 */
const SUBJECT_DIRECTION_DICT = "subject_direction";
/** 关键词类别（一级字典项，parent 为空） */
const TASK_KEYWORD_DICT = "task_keyword";
/** 从事研究大类 */
const RESEARCH_CATEGORY_DICT = "research_category";
/** 科学研究分类（可与大类级联：字典内父项 value 与大类选项 value 一致） */
const SCI_RESEARCH_CLASS_DICT = "sci_research_class";

function dictRootOptions(flat: DataDictItemDTO[]) {
  return flat
    .filter((x) => x.parent_id == null)
    .sort((a, b) => a.sort_order - b.sort_order || a.id - b.id)
    .map((x) => ({ value: x.value, label: x.label }));
}

/** 按上级项的 value（在类型内唯一）取直接子级 */
function dictChildrenOptions(
  flat: DataDictItemDTO[],
  parentValue: string | undefined,
) {
  if (parentValue == null || parentValue === "") return [];
  const parent = flat.find((x) => x.value === parentValue);
  if (!parent) return [];
  return flat
    .filter((x) => x.parent_id === parent.id)
    .sort((a, b) => a.sort_order - b.sort_order || a.id - b.id)
    .map((x) => ({ value: x.value, label: x.label }));
}

function HelpTip({ title }: { title: string }) {
  return (
    <QuestionCircleOutlined
      className="profileFieldHelp"
      title={title}
      aria-label={title}
    />
  );
}

type TasksContactSectionProps = {
  editing: boolean;
};

export default function TasksContactSection({ editing }: TasksContactSectionProps) {
  const form = Form.useFormInstance();
  const taskDictFlat = useDictFlatItems(TASK_POST_DICT);
  const subjectDictFlat = useDictFlatItems(SUBJECT_DIRECTION_DICT);
  const keywordDictFlat = useDictFlatItems(TASK_KEYWORD_DICT);
  const researchCategoryFlat = useDictFlatItems(RESEARCH_CATEGORY_DICT);
  const sciResearchClassFlat = useDictFlatItems(SCI_RESEARCH_CLASS_DICT);

  const taskPos1A = Form.useWatch("task_pos1_a", form);
  const taskPos2A = Form.useWatch("task_pos2_a", form);
  const subjectA1 = Form.useWatch("subject_a1", form);
  const subjectA2 = Form.useWatch("subject_a2", form);
  const subjectB1 = Form.useWatch("subject_b1", form);
  const subjectB2 = Form.useWatch("subject_b2", form);
  const researchMajor = Form.useWatch("research_major", form);

  const taskRootOptions = useMemo(
    () => dictRootOptions(taskDictFlat),
    [taskDictFlat],
  );
  const taskPos1BOptions = useMemo(
    () => dictChildrenOptions(taskDictFlat, taskPos1A as string | undefined),
    [taskDictFlat, taskPos1A],
  );
  const taskPos2BOptions = useMemo(
    () => dictChildrenOptions(taskDictFlat, taskPos2A as string | undefined),
    [taskDictFlat, taskPos2A],
  );

  const subjectRootOptions = useMemo(
    () => dictRootOptions(subjectDictFlat),
    [subjectDictFlat],
  );
  const subjectA2Options = useMemo(
    () => dictChildrenOptions(subjectDictFlat, subjectA1 as string | undefined),
    [subjectDictFlat, subjectA1],
  );
  const subjectA3Options = useMemo(
    () => dictChildrenOptions(subjectDictFlat, subjectA2 as string | undefined),
    [subjectDictFlat, subjectA2],
  );
  const subjectB2Options = useMemo(
    () => dictChildrenOptions(subjectDictFlat, subjectB1 as string | undefined),
    [subjectDictFlat, subjectB1],
  );
  const subjectB3Options = useMemo(
    () => dictChildrenOptions(subjectDictFlat, subjectB2 as string | undefined),
    [subjectDictFlat, subjectB2],
  );

  const kwCategoryOptions = useMemo(
    () => dictRootOptions(keywordDictFlat),
    [keywordDictFlat],
  );

  const researchMajorOptions = useMemo(
    () => dictRootOptions(researchCategoryFlat),
    [researchCategoryFlat],
  );

  const sciResearchHasHierarchy = useMemo(
    () => sciResearchClassFlat.some((x) => x.parent_id != null),
    [sciResearchClassFlat],
  );

  const researchSubOptions = useMemo(() => {
    if (!sciResearchHasHierarchy) {
      return dictRootOptions(sciResearchClassFlat);
    }
    return dictChildrenOptions(
      sciResearchClassFlat,
      researchMajor as string | undefined,
    );
  }, [sciResearchClassFlat, sciResearchHasHierarchy, researchMajor]);

  const selectCommon = {
    className: "profileTaskPosSelect",
    placeholder: "请选择" as const,
    showSearch: true,
    optionFilterProp: "label" as const,
    allowClear: true,
    popupMatchSelectWidth: false as const,
  };

  const selectSubjectCommon = {
    className: "profileSubjectDirSelect",
    placeholder: "请选择" as const,
    showSearch: true,
    optionFilterProp: "label" as const,
    allowClear: true,
    popupMatchSelectWidth: false as const,
  };

  return (
    <>
      <div
        id="profile-section-tasks"
        className="profileSectionTitle profileSectionTitleSpaced profileAnchor"
      >
        任务（岗位）及关键词
      </div>

      <Row gutter={[24, 16]} wrap className="profileFormGrid">
        <Col xs={24} lg={12} className="profileFormCol">
          <Form.Item label="任务（岗位）一" required>
            <Space className="profileTaskPosRow" size={8}>
              <Form.Item
                name="task_pos1_a"
                noStyle
                rules={[{ required: true, message: "请选择岗位大类" }]}
              >
                <Select
                  {...selectCommon}
                  options={taskRootOptions}
                  onChange={() => {
                    if (editing) {
                      form.setFieldValue("task_pos1_b", undefined);
                    }
                  }}
                />
              </Form.Item>
              <Form.Item
                name="task_pos1_b"
                noStyle
                rules={[{ required: true, message: "请选择具体岗位" }]}
              >
                <Select
                  {...selectCommon}
                  options={taskPos1BOptions}
                  disabled={!editing || !taskPos1A}
                />
              </Form.Item>
              <HelpTip title="按申报岗位选择：先大类后具体岗位" />
            </Space>
          </Form.Item>
        </Col>
        <Col xs={24} lg={12} className="profileFormCol">
          <Form.Item label="学科方向 A" required>
            <Space className="profileSubjectDirRow" size={8}>
              <Form.Item
                name="subject_a1"
                noStyle
                rules={[{ required: true, message: "请选择一级学科" }]}
              >
                <Select
                  {...selectSubjectCommon}
                  options={subjectRootOptions}
                  onChange={() => {
                    if (editing) {
                      form.setFieldsValue({
                        subject_a2: undefined,
                        subject_a3: undefined,
                      });
                    }
                  }}
                />
              </Form.Item>
              <Form.Item
                name="subject_a2"
                noStyle
                rules={[{ required: true, message: "请选择二级学科" }]}
              >
                <Select
                  {...selectSubjectCommon}
                  options={subjectA2Options}
                  disabled={!editing || !subjectA1}
                />
              </Form.Item>
              <Form.Item
                name="subject_a3"
                noStyle
                rules={[{ required: true, message: "请选择三级方向" }]}
              >
                <Select
                  {...selectSubjectCommon}
                  options={subjectA3Options}
                  disabled={!editing || !subjectA2}
                />
              </Form.Item>
              <HelpTip title="学科方向三级选择" />
            </Space>
          </Form.Item>
        </Col>
      </Row>

      <Row gutter={[24, 16]} wrap className="profileFormGrid">
        <Col xs={24} lg={12} className="profileFormCol">
          <Form.Item label="任务（岗位）二">
            <Space className="profileTaskPosRow" size={8}>
              <Form.Item name="task_pos2_a" noStyle>
                <Select
                  {...selectCommon}
                  options={taskRootOptions}
                  onChange={() => {
                    if (editing) {
                      form.setFieldValue("task_pos2_b", undefined);
                    }
                  }}
                />
              </Form.Item>
              <Form.Item name="task_pos2_b" noStyle>
                <Select
                  {...selectCommon}
                  options={taskPos2BOptions}
                  disabled={!editing || !taskPos2A}
                />
              </Form.Item>
              <HelpTip title="可选第二岗位" />
            </Space>
          </Form.Item>
        </Col>
        <Col xs={24} lg={12} className="profileFormCol">
          <Form.Item label="学科方向 B">
            <Space className="profileSubjectDirRow" size={8}>
              <Form.Item name="subject_b1" noStyle>
                <Select
                  {...selectSubjectCommon}
                  options={subjectRootOptions}
                  onChange={() => {
                    if (editing) {
                      form.setFieldsValue({
                        subject_b2: undefined,
                        subject_b3: undefined,
                      });
                    }
                  }}
                />
              </Form.Item>
              <Form.Item name="subject_b2" noStyle>
                <Select
                  {...selectSubjectCommon}
                  options={subjectB2Options}
                  disabled={!editing || !subjectB1}
                />
              </Form.Item>
              <Form.Item name="subject_b3" noStyle>
                <Select
                  {...selectSubjectCommon}
                  options={subjectB3Options}
                  disabled={!editing || !subjectB2}
                />
              </Form.Item>
            </Space>
          </Form.Item>
        </Col>
      </Row>

      <Form.Item
        label="任务描述"
        name="task_desc"
        rules={[{ required: true, message: "请填写任务描述" }]}
      >
        <Space align="start" className="profileTaskDescRow">
          <TextArea
            rows={3}
            placeholder="请简要描述承担任务与工作计划"
            className="profileTaskDescTextarea"
          />
          <HelpTip title="简明扼要描述岗位任务" />
        </Space>
      </Form.Item>

      <Form.Item label="关键词" required>
        <Space className="profileKeywordRow" size={8}>
          <Form.Item
            name="kw_cat"
            noStyle
            rules={[{ required: true, message: "请选择关键词类别" }]}
          >
            <Select
              {...selectCommon}
              options={kwCategoryOptions}
              placeholder="请选择类别"
            />
          </Form.Item>
          <Form.Item name="kw1" noStyle rules={[{ required: true }]}>
            <Input placeholder="关键词1" style={{ width: 140 }} />
          </Form.Item>
          <Form.Item name="kw2" noStyle rules={[{ required: true }]}>
            <Input placeholder="关键词2" style={{ width: 140 }} />
          </Form.Item>
          <Form.Item name="kw3" noStyle rules={[{ required: true }]}>
            <Input placeholder="关键词3" style={{ width: 140 }} />
          </Form.Item>
          <HelpTip title="填写与本人研究方向相关的关键词" />
        </Space>
      </Form.Item>

      <Row gutter={[24, 16]} wrap className="profileFormGrid">
        <Col xs={24} lg={12} className="profileFormCol">
          <Form.Item label="从事研究大类" required>
            <Space className="profileResearchSelectRow" size={8}>
              <Form.Item
                name="research_major"
                noStyle
                rules={[{ required: true, message: "请选择" }]}
              >
                <Select
                  {...selectCommon}
                  options={researchMajorOptions}
                  onChange={() => {
                    if (editing) {
                      form.setFieldValue("research_sub", undefined);
                    }
                  }}
                />
              </Form.Item>
              <HelpTip title="研究大类分类" />
            </Space>
          </Form.Item>
        </Col>
        <Col xs={24} lg={12} className="profileFormCol">
          <Form.Item label="科学研究分类" required>
            <Space className="profileResearchSelectRow" size={8}>
              <Form.Item
                name="research_sub"
                noStyle
                rules={[{ required: true, message: "请选择" }]}
              >
                <Select
                  {...selectCommon}
                  options={researchSubOptions}
                  disabled={
                    !editing ||
                    (sciResearchHasHierarchy && !researchMajor)
                  }
                />
              </Form.Item>
              <HelpTip title="科研分类" />
            </Space>
          </Form.Item>
        </Col>
      </Row>

      <div
        id="profile-section-contact"
        className="profileSectionTitle profileSectionTitleSpaced profileAnchor"
      >
        联系方式
      </div>

      <Row gutter={[24, 16]} wrap className="profileFormGrid">
        <Col xs={24} lg={12} className="profileFormCol">
          <Form.Item
            label="手机号码"
            name="mobile"
            rules={[{ required: true, message: "请填写手机号" }]}
          >
            <Input placeholder="11 位手机号" />
          </Form.Item>
        </Col>
        <Col xs={24} lg={12} className="profileFormCol">
          <Form.Item label="家庭电话" name="phone_home">
            <Input placeholder="选填" />
          </Form.Item>
        </Col>
        <Col xs={24} lg={12} className="profileFormCol">
          <Form.Item
            label="办公电话"
            name="phone_office"
            rules={[{ required: true, message: "请填写" }]}
          >
            <Input />
          </Form.Item>
        </Col>
        <Col xs={24} lg={12} className="profileFormCol">
          <Form.Item label="传真" name="fax">
            <Input placeholder="选填" />
          </Form.Item>
        </Col>
      </Row>

      <Form.Item
        label="电子邮件"
        name="email"
        rules={[
          { required: true, message: "请填写邮箱" },
          { type: "email", message: "邮箱格式不正确" },
        ]}
      >
        <Input placeholder="name@example.com" style={{ maxWidth: 400 }} />
      </Form.Item>

      <Form.Item label="通讯地址" required>
        <Space wrap style={{ width: "100%" }}>
          <Form.Item name="address" noStyle rules={[{ required: true, message: "请填写地址" }]}>
            <Input placeholder="省市区街道门牌等" style={{ minWidth: 280, maxWidth: 560 }} />
          </Form.Item>
          <Form.Item name="postal_code" noStyle rules={[{ required: true, message: "请填写邮编" }]}>
            <Input placeholder="邮政编码" style={{ width: 120 }} />
          </Form.Item>
        </Space>
      </Form.Item>
    </>
  );
}
