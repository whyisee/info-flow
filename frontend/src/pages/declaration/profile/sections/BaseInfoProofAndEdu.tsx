import {
  Form,
  Input,
  Row,
  Col,
  Select,
  Typography,
  Upload,
  Image,
  message,
} from "antd";
import { QuestionCircleOutlined, UploadOutlined } from "@ant-design/icons";
import type { UploadFile } from "antd/es/upload/interface";
import type { UploadProps } from "antd";

import { useProfileImageSrc } from "../../../../hooks/useProfileImageSrc";
import {
  getProfileFileUrlFromUploadFile,
  uploadProfileImage,
  uploadProfilePdf,
} from "../../../../services/profileFile";
import { NATIONALITY_OPTIONS } from "../../../../data/nationalityOptions";

/** rc-upload：beforeUpload 返回 false 时…… PDF 必须返回 true */
const beforeUploadPdf: UploadProps["beforeUpload"] = (file) => {
  const ok = /\.pdf$/i.test(file.name) || file.type === "application/pdf";
  if (!ok) {
    message.error("请上传 PDF 文件");
    return Upload.LIST_IGNORE;
  }
  return true;
};

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
            onSuccess?.({ url: res.url }, file);
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

type Props = {
  editing: boolean;
};

export default function BaseInfoProofAndEdu({ editing }: Props) {
  return (
    <>
      <Row gutter={[24, 0]} wrap>
        <Col xs={24} lg={17} xl={18}>
          <Row gutter={[24, 16]} wrap className="profileFormGrid">
            <Col xs={24} lg={12} className="profileFormCol">
              <Form.Item
                label="证件(pdf)"
                htmlFor=""
                required
                name="id_pdf"
                valuePropName="fileList"
                getValueFromEvent={(e) => e?.fileList}
                rules={[
                  {
                    validator: async (
                      _: unknown,
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
                  beforeUpload={beforeUploadPdf}
                  maxCount={1}
                  accept="application/pdf,.pdf"
                  customRequest={async (options) => {
                    const { file, onError, onSuccess } = options;
                    try {
                      const f = file as File;
                      if (!/\.pdf$/i.test(f.name)) {
                        message.error("请上传 PDF 文件");
                        onError?.(new Error("invalid file"));
                        return;
                      }
                      const res = await uploadProfilePdf(f);
                      onSuccess?.({ url: res.url }, file);
                    } catch (e) {
                      onError?.(e as Error);
                      message.error("上传失败，请重试");
                    }
                  }}
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
                    beforeUpload={beforeUploadPdf}
                    maxCount={1}
                    accept="application/pdf,.pdf"
                    customRequest={async (options) => {
                      const { file, onError, onSuccess } = options;
                      try {
                        const f = file as File;
                        if (!/\.pdf$/i.test(f.name)) {
                          message.error("请上传 PDF 文件");
                          onError?.(new Error("invalid file"));
                          return;
                        }
                        const res = await uploadProfilePdf(f);
                        onSuccess?.({ url: res.url }, file);
                      } catch (e) {
                        onError?.(e as Error);
                        message.error("上传失败，请重试");
                      }
                    }}
                  >
                    <button type="button" className="profileUploadBtn">
                      <UploadOutlined /> 上传
                    </button>
                  </Upload>
                </Form.Item>
              </Form.Item>
            </Col>
          </Row>

          <Form.Item label="最高学历（毕业院校等）" required>
            <div className="profileEduBlock">
              <div className="profileEduLineTop profileEduLineTopCompact">
                <span className="profileInlineText profileEduComma">毕业于</span>
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
                  <Form.Item
                    name="highest_edu_proof_pdf"
                    noStyle
                    valuePropName="fileList"
                    getValueFromEvent={(e) => e?.fileList}
                    rules={[
                      {
                        validator: async (
                          _: unknown,
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
                            throw new Error("请上传最高学历证明材料");
                          }
                        },
                      },
                    ]}
                  >
                    <Upload
                      className="profileUploadSameLine"
                      beforeUpload={beforeUploadPdf}
                      maxCount={1}
                      accept="application/pdf,.pdf"
                      customRequest={async (options) => {
                        const { file, onError, onSuccess } = options;
                        try {
                          const f = file as File;
                          if (!/\.pdf$/i.test(f.name)) {
                            message.error("请上传 PDF 文件");
                            onError?.(new Error("invalid file"));
                            return;
                          }
                          const res = await uploadProfilePdf(f);
                          onSuccess?.({ url: res.url }, file);
                        } catch (e) {
                          onError?.(e as Error);
                          message.error("上传失败，请重试");
                        }
                      }}
                    >
                      <button type="button" className="profileUploadBtn">
                        <UploadOutlined /> 上传最高学历
                      </button>
                    </Upload>
                  </Form.Item>
                  <HelpTip title="按申报要求上传学历证明材料（PDF）" />
                </div>
              </div>
            </div>
          </Form.Item>

          <Form.Item label="最高学位（授予单位等）" required>
            <div className="profileEduBlock">
              <div className="profileEduLineTop profileEduLineTopCompact">
                <span className="profileInlineText profileEduComma">毕业于</span>
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
                    <Input placeholder="授予单位名称" />
                  </Form.Item>
                </div>
              </div>
              <div className="profileEduLineProof">
                <div className="profileUploadInlineTip profileUploadSameLine">
                  <Form.Item
                    name="highest_degree_proof_pdf"
                    noStyle
                    valuePropName="fileList"
                    getValueFromEvent={(e) => e?.fileList}
                    rules={[
                      {
                        validator: async (
                          _: unknown,
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
                            throw new Error("请上传最高学位证明材料");
                          }
                        },
                      },
                    ]}
                  >
                    <Upload
                      className="profileUploadSameLine"
                      beforeUpload={beforeUploadPdf}
                      maxCount={1}
                      accept="application/pdf,.pdf"
                      customRequest={async (options) => {
                        const { file, onError, onSuccess } = options;
                        try {
                          const f = file as File;
                          if (!/\.pdf$/i.test(f.name)) {
                            message.error("请上传 PDF 文件");
                            onError?.(new Error("invalid file"));
                            return;
                          }
                          const res = await uploadProfilePdf(f);
                          onSuccess?.({ url: res.url }, file);
                        } catch (e) {
                          onError?.(e as Error);
                          message.error("上传失败，请重试");
                        }
                      }}
                    >
                      <button type="button" className="profileUploadBtn">
                        <UploadOutlined /> 上传最高学位
                      </button>
                    </Upload>
                  </Form.Item>
                  <HelpTip title="按申报要求上传学位证明材料（PDF）" />
                </div>
              </div>
            </div>
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
