import { useMemo } from "react";
import {
  Col,
  DatePicker,
  Form,
  Image,
  Input,
  Row,
  Select,
  Space,
  Typography,
  Upload,
  message,
} from "antd";
import { QuestionCircleOutlined, UploadOutlined } from "@ant-design/icons";
import type { UploadFile } from "antd/es/upload/interface";
import type { UploadProps } from "antd";
import zhCN from "antd/es/locale/zh_CN";

import { useProfileImageSrc } from "../../../../hooks/useProfileImageSrc";
import {
  getProfileFileUrlFromUploadFile,
  uploadProfileImage,
} from "../../../../services/profileFile";
import {
  HIGHEST_DEGREE_LEVEL_OPTIONS,
  HIGHEST_EDUCATION_LEVEL_OPTIONS,
} from "../../../../data/educationDegreeOptions";
import { NATIONALITY_OPTIONS } from "../../../../data/nationalityOptions";
import { useDictFlatItems } from "../../../../hooks/useDictFlatItems";

/** 现任职单位：区域 + 省份，后台字典类型编码 */
const CHINA_REGION_PROVINCE_DICT = "china_region_province";

/** 现任职单位属性：与资料默认值「本校」等一致；不在列表中的已存值会临时加入选项以便展示 */
const UNIT_ATTR_DISPLAY_OPTIONS = [
  { value: "本校", label: "本校" },
  { value: "直属/附属单位", label: "直属/附属单位" },
  { value: "外校（国内）", label: "外校（国内）" },
  { value: "国（境）外单位", label: "国（境）外单位" },
  { value: "其他", label: "其他" },
] as const;

const selectPlaceholder = { placeholder: "请选择" };
const noopUpload: UploadProps["beforeUpload"] = () => false;

/** 必须作为 Form.Item 唯一直接子节点，才能正确绑定 fileList（勿在外层再包 div） */
function IdPhotoUpload({
  fileList,
  onChange,
  disabled,
  editing,
}: {
  fileList?: UploadFile[];
  onChange?: UploadProps["onChange"];
  disabled?: boolean;
  editing: boolean;
}) {
  const list = fileList ?? [];
  const first = list[0];
  const previewSrc = useProfileImageSrc(first);

  return (
    <div className="profilePhotoBox">
      <div
        className={
          previewSrc
            ? "profilePhotoPreviewArea profilePhotoPreviewAreaFilled"
            : "profilePhotoPreviewArea"
        }
      >
        {previewSrc ? (
          <Image
            src={previewSrc}
            alt="证件照"
            className="profilePhotoPreviewImg"
            preview={editing ? { mask: "预览" } : false}
          />
        ) : (
          <span className="profilePhotoEmptyHint">暂无图片</span>
        )}
      </div>
      <Upload
        fileList={list}
        onChange={onChange}
        beforeUpload={(file) => {
          const okExt =
            /\.(jpe?g|png)$/i.test(file.name) || file.type.startsWith("image/");
          if (!okExt) {
            message.error("请上传 JPG / PNG 图片");
            return Upload.LIST_IGNORE;
          }
          if (file.size > 3 * 1024 * 1024) {
            message.error("图片大小不超过 3MB");
            return Upload.LIST_IGNORE;
          }
          return true;
        }}
        customRequest={async (options) => {
          const { file, onError, onSuccess } = options;
          try {
            const res = await uploadProfileImage(file as File);
            onSuccess?.({ url: res.url });
          } catch (e) {
            onError?.(e as Error);
            message.error("上传失败，请重试");
          }
        }}
        maxCount={1}
        accept="image/jpeg,image/png"
        disabled={disabled}
        showUploadList={false}
      >
        <button
          type="button"
          className="profileUploadBtn profileUploadBtnBlock"
          disabled={disabled}
        >
          <UploadOutlined /> {list.length ? "更换图片" : "上传"}
        </button>
      </Upload>
    </div>
  );
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
  const idTypeOptions = [
    { value: "id_card", label: "居民身份证" },
    { value: "passport", label: "护照" },
    { value: "hk_macao_permit", label: "港澳居民来往内地通行证" },
    { value: "tw_permit", label: "台湾居民来往大陆通行证" },
    { value: "foreign_perm_residence", label: "外国人永久居留身份证" },
    { value: "other", label: "其他" },
  ] as const;

  return (
    <>
      <Row gutter={[24, 0]} wrap>
        <Col xs={24} lg={17} xl={18}>
          {/* 表单项过多时隐藏，仍参与保存（默认值见 Form initialValues） */}
          <Form.Item name="recommend_school" hidden>
            <Input />
          </Form.Item>
          <Form.Item name="project_name" hidden>
            <Input />
          </Form.Item>

          <Row gutter={[24, 16]} wrap className="profileFormGrid">
            <Col xs={24} lg={12} className="profileFormCol">
              <Form.Item
                label="姓名"
                name="full_name"
                rules={[{ required: true, message: "请填写姓名" }]}
              >
                <Input {...textProps} />
              </Form.Item>
            </Col>
            <Col xs={24} lg={12} className="profileFormCol">
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
            </Col>
            <Col xs={24} lg={12} className="profileFormCol">
              <Form.Item
                label="国籍"
                name="nationality"
                rules={[{ required: true, message: "请选择国籍" }]}
              >
                <Select
                  allowClear
                  showSearch
                  optionFilterProp="label"
                  options={NATIONALITY_OPTIONS}
                  {...selectPlaceholder}
                />
              </Form.Item>
            </Col>
            <Col xs={24} lg={12} className="profileFormCol">
              <Form.Item
                label="出生日期"
                name="birth_date"
                rules={[{ required: true, message: "请选择出生日期" }]}
              >
                <DatePicker
                  locale={zhCN.DatePicker}
                  placeholder="请选择日期"
                  style={{ width: "100%" }}
                />
              </Form.Item>
            </Col>
            <Col xs={24} lg={12} className="profileFormCol">
              <Form.Item
                label="证件类型"
                name="id_type_display"
                rules={[{ required: true, message: "请选择证件类型" }]}
              >
                <Select options={[...idTypeOptions]} {...selectPlaceholder} />
              </Form.Item>
            </Col>
            <Col xs={24} lg={12} className="profileFormCol">
              <Form.Item
                label="证件号码"
                name="id_number"
                rules={[{ required: true, message: "请输入证件号码" }]}
              >
                <Input placeholder="证件号码" maxLength={64} />
              </Form.Item>
            </Col>
          </Row>

          <Row gutter={[24, 16]} wrap className="profileFormGrid">
            <Col xs={24} lg={12} className="profileFormCol">
              <Form.Item
                required
                label="证件(pdf)"
                htmlFor=""
                name="id_pdf"
                valuePropName="fileList"
                getValueFromEvent={(e) => e?.fileList}
                rules={[
                  {
                    validator: async (
                      _,
                      fileList: UploadFile[] | undefined,
                    ) => {
                      if (!editing) return Promise.resolve();
                      const ok = fileList?.some(
                        (f) =>
                          f.status !== "removed" &&
                          (f.originFileObj != null ||
                            getProfileFileUrlFromUploadFile(f)),
                      );
                      if (!ok) {
                        throw new Error("请上传证件(pdf)");
                      }
                    },
                  },
                ]}
              >
                <Upload
                  className="profileUploadSameLine"
                  beforeUpload={noopUpload}
                  maxCount={1}
                >
                  <button type="button" className="profileUploadBtn">
                    <UploadOutlined /> 上传
                  </button>
                </Upload>
              </Form.Item>
            </Col>
            <Col xs={24} lg={12} className="profileFormCol">
              <Form.Item
                label={
                  <span className="profileLabelInlineTip">
                    <span className="profileLabelMultiline">特殊证明</span>
                    <HelpTip title="如需说明出生日期与证件不一致时上传" />
                  </span>
                }
              >
                <Form.Item
                  name="birth_proof_pdf"
                  noStyle
                  valuePropName="fileList"
                  getValueFromEvent={(e) => e?.fileList}
                >
                  <Upload
                    className="profileUploadSameLine"
                    beforeUpload={noopUpload}
                    maxCount={1}
                  >
                    <button type="button" className="profileUploadBtn">
                      <UploadOutlined /> 上传
                    </button>
                  </Upload>
                </Form.Item>
              </Form.Item>
            </Col>
          </Row>

          <Form.Item label="最高学历" required>
            <div className="profileEduBlock">
              <div className="profileEduLineTop">
                <div className="profileEduLineTier">
                  <Form.Item
                    name="highest_edu_level"
                    noStyle
                    rules={[{ required: true }]}
                  >
                    <Select
                      options={[...HIGHEST_EDUCATION_LEVEL_OPTIONS]}
                      placeholder="---学历---"
                    />
                  </Form.Item>
                </div>
                <span className="profileInlineText profileEduComma">
                  毕业于
                </span>
                <div className="profileEduLineCountry">
                  <Form.Item
                    name="highest_edu_country"
                    noStyle
                    rules={[{ required: true }]}
                  >
                    <Select
                      allowClear
                      showSearch
                      optionFilterProp="label"
                      options={[...NATIONALITY_OPTIONS]}
                      placeholder="---国家或地区---"
                    />
                  </Form.Item>
                </div>
                <div className="profileEduLineSchool">
                  <Form.Item
                    name="highest_edu_school"
                    noStyle
                    rules={[{ required: true }]}
                  >
                    <Input placeholder="学校名称" />
                  </Form.Item>
                </div>
              </div>
              <div className="profileEduLineProof">
                <div className="profileUploadInlineTip profileUploadSameLine">
                  <Upload beforeUpload={noopUpload} maxCount={1}>
                    <button type="button" className="profileUploadBtn">
                      上传最高学历
                    </button>
                  </Upload>
                  <HelpTip title="按申报要求上传学历证明材料" />
                </div>
              </div>
            </div>
          </Form.Item>

          <Form.Item label="最高学位" required>
            <div className="profileEduBlock">
              <div className="profileEduLineTop">
                <div className="profileEduLineTier">
                  <Form.Item
                    name="highest_degree_level"
                    noStyle
                    rules={[{ required: true }]}
                  >
                    <Select
                      options={[...HIGHEST_DEGREE_LEVEL_OPTIONS]}
                      placeholder="---学位---"
                    />
                  </Form.Item>
                </div>
                <span className="profileInlineText profileEduComma">
                  毕业于
                </span>
                <div className="profileEduLineCountry">
                  <Form.Item
                    name="highest_degree_country"
                    noStyle
                    rules={[{ required: true }]}
                  >
                    <Select
                      allowClear
                      showSearch
                      optionFilterProp="label"
                      options={[...NATIONALITY_OPTIONS]}
                      placeholder="---国家或地区---"
                    />
                  </Form.Item>
                </div>
                <div className="profileEduLineSchool">
                  <Form.Item
                    name="highest_degree_school"
                    noStyle
                    rules={[{ required: true }]}
                  >
                    <Input placeholder="学校名称" />
                  </Form.Item>
                </div>
              </div>
              <div className="profileEduLineProof">
                <div className="profileUploadInlineTip profileUploadSameLine">
                  <Upload beforeUpload={noopUpload} maxCount={1}>
                    <button type="button" className="profileUploadBtn">
                      上传最高学位
                    </button>
                  </Upload>
                  <HelpTip title="按申报要求上传学位证明材料" />
                </div>
              </div>
            </div>
          </Form.Item>

          <Form.Item label="现任职单位" required>
            <Space wrap className="profileCompositeRow">
              <Typography.Text type="secondary">[中国]</Typography.Text>
              <Form.Item
                name="work_region"
                noStyle
                rules={[{ required: true, message: "请选择区域" }]}
              >
                <Select
                  className="profileWorkUnitSelect"
                  options={regionOptions}
                  placeholder="---区域---"
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
                  placeholder="---省份---"
                  showSearch
                  optionFilterProp="label"
                  allowClear
                  popupMatchSelectWidth={false}
                  disabled={!editing || !workRegion}
                />
              </Form.Item>
              <Form.Item
                name="work_unit_detail"
                noStyle
                rules={[{ required: true, message: "请填写任职单位明细" }]}
              >
                <Input
                  placeholder="院系或部门"
                  className="profileWorkUnitDeptInput"
                />
              </Form.Item>
              <HelpTip title="填写当前人事关系所在单位" />
            </Space>
          </Form.Item>

          <Form.Item
            label="现任职单位属性"
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

          <Form.Item label="现任专业技术职务" required>
            <Space className="profileTaskPosRow" size={8}>
              <Form.Item
                name="tech_title"
                noStyle
                rules={[{ required: true, message: "请填写" }]}
              >
                <Input
                  placeholder="如：教授"
                  {...textProps}
                  className="profileTitleFreeInput"
                />
              </Form.Item>
              <HelpTip title="现聘专业技术职务" />
            </Space>
          </Form.Item>

          <Form.Item label="现任行政职务" required>
            <Space className="profileTaskPosRow" size={8}>
              <Form.Item
                name="admin_title"
                noStyle
                rules={[{ required: true, message: "请填写，无则填「无」" }]}
              >
                <Input
                  placeholder="无则填无"
                  {...textProps}
                  className="profileTitleFreeInput"
                />
              </Form.Item>
              <HelpTip title="如院长、系主任等，无则填无" />
            </Space>
          </Form.Item>

          <Form.Item
            label="现任职务级别"
            name="office_level"
            rules={[{ required: true, message: "请选择" }]}
          >
            <Select
              allowClear={false}
              options={[
                { value: "none", label: "无" },
                { value: "county", label: "处级" },
                { value: "bureau", label: "厅局级" },
              ]}
              {...selectPlaceholder}
            />
          </Form.Item>
        </Col>

        <Col xs={24} lg={7} xl={6}>
          <Form.Item
            label="证件照片"
            name="id_photo"
            valuePropName="fileList"
            getValueFromEvent={(e) => e?.fileList ?? []}
            labelCol={{ flex: "0 0 88px" }}
            extra={
              <Typography.Paragraph
                type="secondary"
                className="profilePhotoReq"
              >
                要求：jpg/jpeg/png 格式，分辨率不小于 413×626，文件大小不超过 3M
              </Typography.Paragraph>
            }
            rules={[
              {
                validator: async (_, fileList: UploadFile[] | undefined) => {
                  if (!editing) return Promise.resolve();
                  const ok = fileList?.some(
                    (f) =>
                      f.status !== "removed" &&
                      (f.originFileObj != null ||
                        f.thumbUrl ||
                        getProfileFileUrlFromUploadFile(f)),
                  );
                  if (!ok) {
                    throw new Error("请上传证件照");
                  }
                },
              },
            ]}
            className="profilePhotoField"
          >
            <IdPhotoUpload editing={editing} />
          </Form.Item>
        </Col>
      </Row>
    </>
  );
}
