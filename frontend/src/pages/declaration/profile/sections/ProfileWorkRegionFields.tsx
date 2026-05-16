import { Form, Select, Space, Typography } from "antd";
import { QuestionCircleOutlined } from "@ant-design/icons";
import { useMemo } from "react";

import { useDictFlatItems } from "../../../../hooks/useDictFlatItems";

const CHINA_REGION_PROVINCE_DICT = "china_region_province";

function HelpTip({ title }: { title: string }) {
  return (
    <QuestionCircleOutlined
      className="profileFieldHelp"
      title={title}
      aria-label={title}
    />
  );
}

/** 与旧 BaseInfoSection 一致：区域 → 省份联动（字典 china_region_province） */
export default function ProfileWorkRegionFields({
  editing,
}: {
  editing: boolean;
}) {
  const form = Form.useFormInstance();
  const dictFlat = useDictFlatItems(CHINA_REGION_PROVINCE_DICT);
  const workRegion = Form.useWatch("work_region", form);

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

  return (
    <Form.Item label="区域（省）" required className="profileFormItemLabelNarrow">
      <Space wrap className="profileCompositeRow">
        <Typography.Text type="secondary" className="profileInlineRegionTag">
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
            disabled={!editing}
            onChange={() => {
              if (editing) form.setFieldValue("work_province", undefined);
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
  );
}
