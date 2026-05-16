import {
  Card,
  DatePicker,
  Form,
  Input,
  InputNumber,
  Select,
  Spin,
  Typography,
  Upload,
  message,
} from "antd";
import type { UploadFile } from "antd/es/upload/interface";
import zhCN from "antd/es/locale/zh_CN";
import { UploadOutlined } from "@ant-design/icons";
import { useEffect, useMemo } from "react";

import { useDictFlatItems } from "../../../hooks/useDictFlatItems";
import type { ProfileFieldCatalogRow } from "../../../services/profileFieldCatalog";
import {
  uploadProfileImage,
  uploadProfilePdf,
} from "../../../services/profileFile";
import { useProfileImageSrc } from "../../../hooks/useProfileImageSrc";
import { PROFILE_MODULE, type ProfileModuleCode } from "./profileModuleFields";
import { PROFILE_MODULE_SECTIONS } from "./profileTocItems";
import ProfileWorkRegionFields from "./sections/ProfileWorkRegionFields";
import { debugProfileForm } from "./profileFormDebug";

import "./DynamicProfileSections.css";

function normalizeSelectValue(raw: unknown): string | undefined {
  if (raw == null || raw === "") return undefined;
  if (typeof raw === "string" || typeof raw === "number" || typeof raw === "bigint") {
    return String(raw);
  }
  if (typeof raw === "object" && "value" in raw) {
    const v = (raw as { value: unknown }).value;
    if (v == null || v === "") return undefined;
    if (typeof v === "string" || typeof v === "number" || typeof v === "bigint") {
      return String(v);
    }
  }
  return undefined;
}

function normalizeSelectArray(raw: unknown): string[] | undefined {
  const arr = Array.isArray(raw) ? raw : raw == null || raw === "" ? [] : [raw];
  const next = arr.flatMap((x) => {
    const v = normalizeSelectValue(x);
    return v === undefined ? [] : [v];
  });
  return next.length ? next : undefined;
}

function DictSelect({
  typeCode,
  fieldKey,
  disabled,
  mode,
  value,
  onChange,
}: {
  typeCode: string;
  /** 用于回填：字典异步返回前也需把当前已存取值并入 options，否则 Select 无法反显 */
  fieldKey: string;
  disabled?: boolean;
  mode?: "multiple";
  value?: unknown;
  onChange?: (value: unknown) => void;
}) {
  const dictFlat = useDictFlatItems(typeCode, { includeDisabled: true });
  const watchedVal = Form.useWatch(fieldKey);
  const rawVal = value ?? watchedVal;

  const options = useMemo(() => {
    const base = [...dictFlat]
      .sort((a, b) => a.sort_order - b.sort_order || a.id - b.id)
      .map((x) => ({ value: String(x.value), label: x.label }));

    const dictHas = (code: string) =>
      base.some((o) => o.value === code);

    const extras: { value: string; label: string }[] = [];
    const pushExtra = (code: string) => {
      if (!code || dictHas(code) || extras.some((e) => e.value === code)) return;
      extras.push({ value: code, label: code });
    };

    if (mode === "multiple") {
      const arr = Array.isArray(rawVal) ? rawVal : [];
      for (const x of arr) {
        if (x == null || x === "") continue;
        if (typeof x === "object" && x !== null && "value" in x) {
          const v = (x as { value: unknown }).value;
          if (v != null && v !== "") pushExtra(String(v));
        } else {
          pushExtra(String(x));
        }
      }
    } else if (rawVal != null && rawVal !== "") {
      if (typeof rawVal === "object" && "value" in (rawVal as object)) {
        const v = (rawVal as { value: unknown }).value;
        if (v != null && v !== "") pushExtra(String(v));
      } else {
        pushExtra(String(rawVal));
      }
    }

    return [...extras, ...base];
  }, [dictFlat, rawVal, mode]);

  useEffect(() => {
    const optVals = options.map((o) => o.value);
    debugProfileForm(`DictSelect mount/update field=${fieldKey} typeCode=${typeCode}`, {
      rawVal,
      rawValType: rawVal === undefined ? "undefined" : typeof rawVal,
      dictFlatCount: dictFlat.length,
      extrasThenBaseOptionCount: options.length,
      optionValuesSample: optVals.slice(0, 12),
      valueInOptions:
        mode === "multiple"
          ? Array.isArray(rawVal)
            ? (rawVal as unknown[]).every((v) => optVals.includes(String(v)))
            : false
          : rawVal == null || rawVal === ""
            ? null
            : optVals.includes(String(rawVal)),
    });
  }, [fieldKey, typeCode, rawVal, dictFlat.length, options, mode]);

  return (
    <Select
      mode={mode}
      options={options}
      placeholder="请选择"
      showSearch
      optionFilterProp="label"
      allowClear
      disabled={disabled}
      value={value as string | string[] | undefined}
      onChange={onChange}
    />
  );
}

function IdPhotoControl({
  fileList,
  onChange,
  editing,
}: {
  fileList?: UploadFile[];
  onChange?: (v: UploadFile[]) => void;
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
          <img
            src={previewSrc}
            className="profilePhotoPreviewImg"
            alt="证件照"
          />
        ) : (
          <span className="profilePhotoEmptyHint">暂无图片</span>
        )}
      </div>
      <Upload
        fileList={list}
        onChange={(info) => onChange?.(info.fileList)}
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
        disabled={!editing}
        showUploadList={false}
      >
        <button
          type="button"
          className="profilePhotoUploadBtn"
          disabled={!editing}
        >
          {editing ? "上传照片" : ""}
        </button>
      </Upload>
    </div>
  );
}

function fieldRules(row: ProfileFieldCatalogRow) {
  const v = row.validation_json as { required_default?: boolean } | null;
  const req = Boolean(v?.required_default);
  if (!req) return undefined;
  return [{ required: true, message: `请填写${row.default_label}` }];
}

function DynamicField({
  row,
  editing,
}: {
  row: ProfileFieldCatalogRow;
  editing: boolean;
}) {
  const textProps = {
    readOnly: !editing,
    variant: editing ? ("outlined" as const) : ("borderless" as const),
    className: editing ? undefined : "profileReadonlyInput",
  };

  const rules = fieldRules(row);

  if (row.dict_type_code) {
    const dictMode =
      row.data_type === "multi_select" ? ("multiple" as const) : undefined;
    return (
      <Form.Item
        key={row.field_key}
        label={row.default_label}
        name={row.field_key}
        rules={rules}
        extra={
          row.help_text ? (
            <Typography.Text type="secondary">{row.help_text}</Typography.Text>
          ) : undefined
        }
        normalize={
          row.data_type === "multi_select"
            ? (v) => {
                if (!Array.isArray(v)) return v;
                return v
                  .map((x) => {
                    if (x != null && typeof x === "object" && "value" in x) {
                      const z = (x as { value: unknown }).value;
                      return z == null ? "" : String(z);
                    }
                    return x == null ? "" : String(x);
                  })
                  .filter((s) => s !== "");
              }
            : (v) => (v == null || v === "" ? v : String(v))
        }
      >
        <DictSelect
          typeCode={row.dict_type_code}
          fieldKey={row.field_key}
          disabled={!editing}
          mode={dictMode}
        />
      </Form.Item>
    );
  }

  if (row.data_type === "select" || row.data_type === "multi_select") {
    return (
      <Form.Item
        key={row.field_key}
        label={row.default_label}
        name={row.field_key}
        rules={rules}
        extra={
          row.help_text ? (
            <Typography.Text type="secondary">{row.help_text}</Typography.Text>
          ) : undefined
        }
        normalize={
          row.data_type === "multi_select"
            ? normalizeSelectArray
            : normalizeSelectValue
        }
      >
        <Input
          {...textProps}
          placeholder={editing ? "未配置字典，按文本填写" : undefined}
        />
      </Form.Item>
    );
  }

  if (row.data_type === "textarea") {
    return (
      <Form.Item
        key={row.field_key}
        label={row.default_label}
        name={row.field_key}
        rules={rules}
      >
        <Input.TextArea
          rows={4}
          placeholder={row.placeholder ?? undefined}
          readOnly={!editing}
          variant={editing ? "outlined" : "borderless"}
          className={editing ? undefined : "profileReadonlyInput"}
        />
      </Form.Item>
    );
  }

  if (row.data_type === "number") {
    return (
      <Form.Item
        key={row.field_key}
        label={row.default_label}
        name={row.field_key}
        rules={rules}
      >
        <InputNumber className="profileDynamicFullWidth" disabled={!editing} />
      </Form.Item>
    );
  }

  if (row.data_type === "date") {
    const picker = row.field_key === "birth_date" ? "month" : "date";
    return (
      <Form.Item
        key={row.field_key}
        label={row.default_label}
        name={row.field_key}
        rules={rules}
      >
        <DatePicker
          className="profilePickerFull"
          locale={zhCN.DatePicker}
          picker={picker}
          disabled={!editing}
        />
      </Form.Item>
    );
  }

  if (row.data_type === "upload") {
    return (
      <Form.Item
        key={row.field_key}
        label={row.default_label}
        name={row.field_key}
        valuePropName="fileList"
        getValueFromEvent={(e) => e?.fileList}
        rules={rules}
      >
        <Upload
          accept="application/pdf"
          disabled={!editing}
          multiple={false}
          beforeUpload={(file) => {
            const ok =
              /\.pdf$/i.test(file.name) || file.type === "application/pdf";
            if (!ok) {
              message.error("请上传 PDF 文件");
              return Upload.LIST_IGNORE;
            }
            return true;
          }}
          customRequest={async (options) => {
            const { file, onError, onSuccess } = options;
            try {
              const res = await uploadProfilePdf(file as File);
              onSuccess?.({ url: res.url }, file);
            } catch (e) {
              onError?.(e as Error);
              message.error("上传失败");
            }
          }}
        >
          <button type="button" disabled={!editing}>
            <UploadOutlined /> 上传 PDF
          </button>
        </Upload>
      </Form.Item>
    );
  }

  if (row.data_type === "image") {
    return (
      <Form.Item
        key={row.field_key}
        label={row.default_label}
        name={row.field_key}
        rules={rules}
        valuePropName="fileList"
        getValueFromEvent={(e) => e?.fileList}
      >
        <IdPhotoControl editing={editing} />
      </Form.Item>
    );
  }

  return (
    <Form.Item
      key={row.field_key}
      label={row.default_label}
      name={row.field_key}
      rules={rules}
    >
      <Input placeholder={row.placeholder ?? undefined} {...textProps} />
    </Form.Item>
  );
}

type Props = {
  catalog: ProfileFieldCatalogRow[];
  editing: boolean;
  loading?: boolean;
};

export default function DynamicProfileSections({
  catalog,
  editing,
  loading,
}: Props) {
  const byModule = useMemo(() => {
    const m = new Map<ProfileModuleCode, ProfileFieldCatalogRow[]>();
    for (const s of PROFILE_MODULE_SECTIONS) {
      m.set(s.module_code, []);
    }
    for (const row of catalog) {
      const mc = row.module_code as ProfileModuleCode;
      if (!m.has(mc)) m.set(mc, []);
      m.get(mc)!.push(row);
    }
    for (const arr of m.values()) {
      arr.sort((a, b) => a.sort_order - b.sort_order || a.id - b.id);
    }
    return m;
  }, [catalog]);

  const keySet = useMemo(
    () => new Set(catalog.map((r) => r.field_key)),
    [catalog],
  );

  if (loading) {
    return (
      <div className="profileDynamicLoading">
        <Spin tip="加载字段配置…" />
      </div>
    );
  }

  return (
    <>
      {PROFILE_MODULE_SECTIONS.map((sec) => {
        const rows = byModule.get(sec.module_code) ?? [];
        if (rows.length === 0) return null;

        const skipProvince =
          sec.module_code === PROFILE_MODULE.BASIC &&
          keySet.has("work_region") &&
          keySet.has("work_province");

        return (
          <div
            key={sec.module_code}
            id={sec.anchorId}
            className="profileAnchor profileDynamicModuleWrap"
          >
            <Card title={sec.title} bordered className="profileBasicCard">
              <div className="profileDynamicFieldsCol">
                {skipProvince ? (
                  <ProfileWorkRegionFields editing={editing} />
                ) : null}
                {rows.map((row) => {
                  if (skipProvince && row.field_key === "work_province") {
                    return null;
                  }
                  if (skipProvince && row.field_key === "work_region") {
                    return null;
                  }
                  return (
                    <DynamicField
                      key={row.field_key}
                      row={row}
                      editing={editing}
                    />
                  );
                })}
              </div>
            </Card>
          </div>
        );
      })}
    </>
  );
}
