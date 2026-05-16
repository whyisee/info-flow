import { useMemo } from "react";
import {
  Card,
  Collapse,
  DatePicker,
  Form,
  Input,
  Select,
  Space,
  Typography,
} from "antd";
import { QuestionCircleOutlined } from "@ant-design/icons";
import zhCN from "antd/es/locale/zh_CN";

import {
  HIGHEST_DEGREE_LEVEL_OPTIONS,
  HIGHEST_EDUCATION_LEVEL_OPTIONS,
} from "../../../../data/educationDegreeOptions";
import { useDictFlatItems } from "../../../../hooks/useDictFlatItems";
import {
  PROFILE_ETHNICITY_OPTIONS,
  PROFILE_INDUSTRY_DIVISION_OPTIONS,
  PROFILE_POLITICAL_STATUS_OPTIONS,
  PROFILE_TITLE_RANK_OPTIONS,
  PROFILE_TITLE_SERIES_OPTIONS,
  PROFILE_UNIT_LEVEL_OPTIONS,
} from "./profileBasicFieldOptions";
import BaseInfoProofAndEdu from "./BaseInfoProofAndEdu";

import "./BaseInfoSection.css";

const CHINA_REGION_PROVINCE_DICT = "china_region_province";

/** 工作单位属性：与原资料一致 */
const UNIT_ATTR_DISPLAY_OPTIONS = [
  { value: "本校", label: "本校" },
  { value: "直属/附属单位", label: "直属/附属单位" },
  { value: "外校（国内）", label: "外校（国内）" },
  { value: "国（境）外单位", label: "国（境）外单位" },
  { value: "其他", label: "其他" },
] as const;

const selectPlaceholder = { placeholder: "请选择" };

const OFFICE_LEVEL_OPTIONS = [
  { value: "none", label: "无" },
  { value: "provincial_minister", label: "省部级" },
  { value: "bureau", label: "厅局级" },
  { value: "county", label: "处级" },
  { value: "section", label: "科级" },
  { value: "staff", label: "科员及以下" },
] as const;

function HelpTip({ title }: { title: string }) {
  return (
    <QuestionCircleOutlined
      className="profileFieldHelp"
      title={title}
      aria-label={title}
    />
  );
}

type BaseInfoSectionProps = {
  editing: boolean;
};

const profileTextFieldProps = (editing: boolean) =>
  ({
    readOnly: !editing,
    variant: editing ? ("outlined" as const) : ("borderless" as const),
    className: editing ? undefined : "profileReadonlyInput",
  }) as const;

export default function BaseInfoSection({ editing }: BaseInfoSectionProps) {
  const form = Form.useFormInstance();
  const dictFlat = useDictFlatItems(CHINA_REGION_PROVINCE_DICT);
  const workRegion = Form.useWatch("work_region", form);
  const unitAttrDisplay = Form.useWatch("unit_attr_display", form);

  const regionOptions = useMemo(() => {
    return dictFlat
      .filter((x) => x.parent_id == null)
      .sort((a, b) => a.sort_order - b.sort_order || a.id - b.id)
      .map((x) => ({ value: x.value, label: x.label }));
  }, [dictFlat]);

  const provinceOptions = useMemo(() => {
    if (workRegion == null || workRegion === "") return [];
    const regionItem = dictFlat.find(
      (x) => x.parent_id == null && x.value === workRegion,
    );
    if (!regionItem) return [];
    return dictFlat
      .filter((x) => x.parent_id === regionItem.id)
      .sort((a, b) => a.sort_order - b.sort_order || a.id - b.id)
      .map((x) => ({ value: x.value, label: x.label }));
  }, [dictFlat, workRegion]);

  const unitAttrDisplayOptions = useMemo(() => {
    const base = UNIT_ATTR_DISPLAY_OPTIONS.map((o) => ({
      value: o.value,
      label: o.label,
    }));
    if (
      typeof unitAttrDisplay === "string" &&
      unitAttrDisplay.trim() &&
      !base.some((o) => o.value === unitAttrDisplay)
    ) {
      return [
        { value: unitAttrDisplay, label: `${unitAttrDisplay}（已存）` },
        ...base,
      ];
    }
    return base;
  }, [unitAttrDisplay]);

  const textProps = profileTextFieldProps(editing);

  return (
    <div className="profileBasicInfoCardWrap">
      <Form.Item name="recommend_school" hidden>
        <Input />
      </Form.Item>
      <Form.Item name="project_name" hidden>
        <Input />
      </Form.Item>
      <Form.Item name="nationality" hidden>
        <Input />
      </Form.Item>

      <Card
        className="profileBasicCard"
        title="个人基本信息"
        bordered
        styles={{ body: { padding: 0 } }}
      >
        <div className="profileExcelTable">
          <div className="profileExcelCell profileExcelSpan3">
            <Form.Item
              label="姓名"
              name="full_name"
              rules={[{ required: true, message: "请填写姓名" }]}
            >
              <Input {...textProps} />
            </Form.Item>
          </div>
          <div className="profileExcelCell profileExcelSpan2">
            <Form.Item
              label="性别"
              name="gender"
              rules={[{ required: true, message: "请选择性别" }]}
            >
              <Select
                options={[
                  { value: "male", label: "男" },
                  { value: "female", label: "女" },
                ]}
                {...selectPlaceholder}
              />
            </Form.Item>
          </div>
          <div className="profileExcelCell profileExcelSpan2">
            <Form.Item
              label="民族"
              name="ethnicity"
              rules={[{ required: true, message: "请选择民族" }]}
            >
              <Select
                allowClear
                showSearch
                optionFilterProp="label"
                options={[...PROFILE_ETHNICITY_OPTIONS]}
                {...selectPlaceholder}
              />
            </Form.Item>
          </div>
          <div className="profileExcelCell profileExcelSpan3">
            <Form.Item
              label="身份证号"
              name="id_number"
              rules={[{ required: true, message: "请输入身份证号" }]}
            >
              <Input placeholder="18 位身份证号" maxLength={18} {...textProps} />
            </Form.Item>
          </div>
          <div className="profileExcelCell profileExcelSpan2">
            <Form.Item
              label="出生年月"
              name="birth_date"
              rules={[{ required: true, message: "请选择出生年月" }]}
            >
              <DatePicker
                className="profilePickerFull"
                locale={zhCN.DatePicker}
                picker="month"
                placeholder="请选择年月"
              />
            </Form.Item>
          </div>
          <div className="profileExcelCell profileExcelSpan3">
            <Form.Item
              label="政治面貌"
              name="political_status"
              rules={[{ required: true, message: "请选择政治面貌" }]}
            >
              <Select
                options={[...PROFILE_POLITICAL_STATUS_OPTIONS]}
                {...selectPlaceholder}
              />
            </Form.Item>
          </div>
          <div className="profileExcelCell profileExcelSpan3">
            <Form.Item
              label="最高学历"
              name="highest_edu_level"
              rules={[{ required: true, message: "请选择最高学历" }]}
            >
              <Select
                options={[...HIGHEST_EDUCATION_LEVEL_OPTIONS]}
                {...selectPlaceholder}
              />
            </Form.Item>
          </div>
          <div className="profileExcelCell profileExcelSpan3">
            <Form.Item
              label="最高学位"
              name="highest_degree_level"
              rules={[{ required: true, message: "请选择最高学位" }]}
            >
              <Select
                options={[...HIGHEST_DEGREE_LEVEL_OPTIONS]}
                {...selectPlaceholder}
              />
            </Form.Item>
          </div>
          <div className="profileExcelCell profileExcelSpan3">
            <Form.Item
              label="手机号码"
              name="mobile"
              rules={[
                { required: true, message: "请填写手机号" },
                { pattern: /^1\d{10}$/, message: "请输入 11 位手机号" },
              ]}
            >
              <Input placeholder="11 位手机号" {...textProps} />
            </Form.Item>
          </div>
        </div>
      </Card>

      <Card
        className="profileBasicCard"
        title="工作单位"
        bordered
        styles={{ body: { padding: 0 } }}
      >
        <div className="profileExcelTable">
          <div className="profileExcelCell profileExcelSpan12">
            <Form.Item
              label="工作单位"
              name="work_unit_detail"
              rules={[{ required: true, message: "请填写工作单位" }]}
            >
              <Input placeholder="单位全称（可含院系、部门）" {...textProps} />
            </Form.Item>
          </div>
          <div className="profileExcelCell profileExcelSpan3">
            <Form.Item
              label="单位性质"
              name="unit_attr_display"
              rules={[{ required: true, message: "请选择" }]}
            >
              <Select
                options={unitAttrDisplayOptions}
                {...selectPlaceholder}
                showSearch
                optionFilterProp="label"
                allowClear={false}
                popupMatchSelectWidth={false}
              />
            </Form.Item>
          </div>
          <div className="profileExcelCell profileExcelSpan3">
            <Form.Item
              label="单位层级"
              name="unit_level_display"
              rules={[{ required: true, message: "请选择单位层级" }]}
            >
              <Select
                options={[...PROFILE_UNIT_LEVEL_OPTIONS]}
                {...selectPlaceholder}
              />
            </Form.Item>
          </div>
          <div className="profileExcelCell profileExcelSpan6">
            <Form.Item
              label="区域（省）"
              required
              className="profileFormItemLabelNarrow"
            >
              <Space wrap className="profileCompositeRow">
                <Typography.Text
                  type="secondary"
                  className="profileInlineRegionTag"
                >
                  中国
                </Typography.Text>
                <Form.Item
                  name="work_region"
                  noStyle
                  rules={[{ required: true, message: "请选择区域" }]}
                >
                  <Select
                    className="profileWorkUnitSelect"
                    options={regionOptions}
                    placeholder="区域"
                    showSearch
                    optionFilterProp="label"
                    allowClear
                    popupMatchSelectWidth={false}
                    onChange={() => {
                      if (editing) {
                        form.setFieldValue("work_province", undefined);
                      }
                    }}
                  />
                </Form.Item>
                <Form.Item
                  name="work_province"
                  noStyle
                  rules={[{ required: true, message: "请选择省份" }]}
                >
                  <Select
                    className="profileWorkUnitSelect"
                    options={provinceOptions}
                    placeholder="省份"
                    showSearch
                    optionFilterProp="label"
                    allowClear
                    popupMatchSelectWidth={false}
                    disabled={!editing || !workRegion}
                  />
                </Form.Item>
                <HelpTip title="人选库与统计用区域维度，请先选区域再选省" />
              </Space>
            </Form.Item>
          </div>
          <div className="profileExcelCell profileExcelSpan6">
            <Form.Item label="工作单位所在市(地)" name="work_unit_city">
              <Input placeholder="如：大庆市" {...textProps} />
            </Form.Item>
          </div>
          <div className="profileExcelCell profileExcelSpan6">
            <Form.Item label="中省直主管部门/市(地)" name="supervising_dept_city">
              <Input placeholder="主管部门或地级市" {...textProps} />
            </Form.Item>
          </div>
        </div>
      </Card>

      <Card
        className="profileBasicCard"
        title="行政职务与从业信息"
        bordered
        styles={{ body: { padding: 0 } }}
      >
        <div className="profileExcelTable">
          <div className="profileExcelCell profileExcelSpan3">
            <Form.Item
              label="行政职务"
              name="admin_title"
              rules={[{ required: true, message: "请填写，无则填「无」" }]}
            >
              <Input placeholder="无则填无" {...textProps} />
            </Form.Item>
          </div>
          <div className="profileExcelCell profileExcelSpan3">
            <Form.Item
              label="行政级别"
              name="office_level"
              rules={[{ required: true, message: "请选择" }]}
            >
              <Select
                options={[...OFFICE_LEVEL_OPTIONS]}
                allowClear={false}
                {...selectPlaceholder}
              />
            </Form.Item>
          </div>
          <div className="profileExcelCell profileExcelSpan3">
            <Form.Item
              label="行业划分"
              name="industry_division"
              rules={[{ required: true, message: "请选择行业" }]}
            >
              <Select
                options={[...PROFILE_INDUSTRY_DIVISION_OPTIONS]}
                {...selectPlaceholder}
                showSearch
                optionFilterProp="label"
              />
            </Form.Item>
          </div>
          <div className="profileExcelCell profileExcelSpan3">
            <Form.Item
              label="从事工作"
              name="job_engaged"
              rules={[{ required: true, message: "请简述从事工作" }]}
            >
              <Input placeholder="主要业务或岗位内容" {...textProps} />
            </Form.Item>
          </div>
          <div className="profileExcelCell profileExcelSpan4">
            <Form.Item label="职称系列/技能类型" name="title_series_skill">
              <Select
                allowClear
                options={[...PROFILE_TITLE_SERIES_OPTIONS]}
                {...selectPlaceholder}
              />
            </Form.Item>
          </div>
          <div className="profileExcelCell profileExcelSpan4">
            <Form.Item label="职称层级/技能等级" name="title_level_skill_rank">
              <Select
                allowClear
                options={[...PROFILE_TITLE_RANK_OPTIONS]}
                {...selectPlaceholder}
              />
            </Form.Item>
          </div>
          <div className="profileExcelCell profileExcelSpan4">
            <Form.Item
              label="职称专业/技能名称"
              name="tech_title"
              rules={[{ required: true, message: "请填写专业技术职务或技能名称" }]}
            >
              <Input placeholder="如：教授 / 高级工程师" {...textProps} />
            </Form.Item>
          </div>
        </div>
      </Card>

      <Collapse
        bordered={false}
        defaultActiveKey={["proof"]}
        className="profileCollapseProof profileBasicCard"
        items={[
          {
            key: "proof",
            label: "证明材料 · 证件与学历学位",
            children: <BaseInfoProofAndEdu editing={editing} />,
          },
        ]}
      />
    </div>
  );
}
