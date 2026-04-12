import { useCallback, useEffect, useState } from "react";
import { Navigate, useLocation, useNavigate, useParams } from "react-router-dom";
import {
  Button,
  Card,
  Form,
  Input,
  InputNumber,
  Modal,
  Popconfirm,
  Select,
  Space,
  Switch,
  Table,
  Tag,
  Tooltip,
  Typography,
  message,
} from "antd";
import { QuestionCircleOutlined } from "@ant-design/icons";
import type { ColumnsType } from "antd/es/table";
import {
  bulkCreateDictItems,
  createDictItem,
  deleteDictItem,
  getDictType,
  listDictItems,
  updateDictItem,
  type DataDictItemDTO,
  type DataDictTypeDTO,
} from "../../services/dataDict";
import "./DictMaintenance.css";

const DICT_BULK_IMPORT_HELP = (
  <div className="dictBulkHelpTooltip">
    <p>
      CSV：英文逗号分隔；字段含逗号时用英文双引号包裹。以 # 开头的整行为注释。首行若为「取值,显示名」或「value,label」等表头会自动跳过。
    </p>
    <p>
      列顺序：第 1 列取值（可留空则自动生成：优先用显示名的字母数字短码，否则为 v_
      加短码）、第 2 列显示名（必填）；第 3 列排序（整数，可空默认 0）；第 4 列是否启用（1/0、是/否等，可空默认启用）；第 5
      列上级取值（填上级行的「取值」；有层级时请给上级填好可预期的取值以便引用）；第 6 列扩展 JSON 对象（可空）。仅一列时整列为显示名，取值全部自动生成。
    </p>
  </div>
);

type BulkDictItemRow = {
  value: string;
  label: string;
  sort_order: number;
  is_enabled: boolean;
  parent_value: string | null;
  extra_json: Record<string, unknown> | null;
};

/** 支持双引号包裹字段，引号内逗号不拆列；`""` 表示一个双引号 */
function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inQuotes) {
      if (c === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cur += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ",") {
      out.push(cur.trim());
      cur = "";
    } else {
      cur += c;
    }
  }
  out.push(cur.trim());
  return out;
}

function parseBoolCell(s: string | undefined, lineNo: number, colName: string): boolean {
  const t = (s ?? "").trim().toLowerCase();
  if (!t) return true;
  if (["1", "true", "yes", "y", "是", "启用", "on"].includes(t)) return true;
  if (["0", "false", "no", "n", "否", "停用", "off"].includes(t)) return false;
  throw new Error(`第 ${lineNo} 行：${colName} 须为 1/0、是/否、true/false 或留空（默认启用）`);
}

function hashBase36(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
  return (h % 1_000_000_000).toString(36);
}

function slugAscii(label: string): string {
  return label
    .normalize("NFKC")
    .trim()
    .replace(/\s+/g, "_")
    .replace(/[^A-Za-z0-9_\-]/g, "")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "")
    .toLowerCase()
    .slice(0, 120);
}

/** 在 `used` 中登记并返回不与已有取值冲突的自动生成 value */
function allocateAutoValue(label: string, used: Set<string>): string {
  const slug = slugAscii(label);
  if (slug.length >= 1) {
    let v = slug;
    let n = 2;
    while (used.has(v)) {
      const suffix = `_${n}`;
      v = (slug + suffix).slice(0, 128);
      n++;
    }
    used.add(v);
    return v;
  }
  const h = hashBase36(label);
  let v = `v_${h}`;
  let n = 2;
  while (used.has(v)) {
    v = `v_${h}_${n}`.slice(0, 128);
    n++;
  }
  used.add(v);
  return v;
}

type BulkDictCsvParsed = Omit<BulkDictItemRow, "value"> & {
  explicitValue: string | null;
};

function looksLikeDictCsvHeader(parts: string[]): boolean {
  if (parts.length < 2) return false;
  const a = parts[0].trim().toLowerCase();
  const b = parts[1].trim().toLowerCase();
  const h0 = new Set(["value", "取值", "字典值", "key", "code"]);
  const h1 = new Set(["label", "显示名", "名称", "标题"]);
  return h0.has(a) && h1.has(b);
}

/** 去掉首条数据行若为表头（value,label / 取值,显示名 等） */
function stripLeadingDictCsvHeader(lines: string[]): string[] {
  const idx = lines.findIndex((l) => {
    const t = l.trim();
    return Boolean(t) && !t.startsWith("#");
  });
  if (idx < 0) return lines;
  const parts = parseCsvLine(lines[idx].trim());
  if (!looksLikeDictCsvHeader(parts)) return lines;
  const out = [...lines];
  out.splice(idx, 1);
  return out;
}

function parseBulkDictCsv(text: string): BulkDictCsvParsed[] {
  const raw = text.startsWith("\ufeff") ? text.slice(1) : text;
  const lines = stripLeadingDictCsvHeader(raw.split(/\r?\n/));
  const rows: BulkDictCsvParsed[] = [];
  for (let i = 0; i < lines.length; i++) {
    const lineNo = i + 1;
    const line = lines[i].trim();
    if (!line || line.startsWith("#")) continue;
    const parts = parseCsvLine(line);
    let explicitValue: string | null;
    let label: string;
    let sort_order = 0;
    let is_enabled = true;
    let parent_value: string | null = null;
    let extra_json: Record<string, unknown> | null = null;

    if (parts.length === 1) {
      explicitValue = null;
      label = parts[0];
    } else {
      const v0 = parts[0];
      explicitValue = v0 === "" ? null : v0;
      label = parts[1] ?? "";
      if (parts.length >= 3 && parts[2] !== "") {
        const so = Number(parts[2]);
        if (!Number.isFinite(so) || !Number.isInteger(so)) {
          throw new Error(`第 ${lineNo} 行：排序须为整数或留空`);
        }
        sort_order = so;
      }
      if (parts.length >= 4) {
        is_enabled = parseBoolCell(parts[3], lineNo, "是否启用");
      }
      if (parts.length >= 5 && parts[4] !== "") {
        parent_value = parts[4];
      }
      if (parts.length >= 6 && parts[5] !== "") {
        try {
          const parsed = JSON.parse(parts[5]) as unknown;
          if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
            throw new Error("须为 JSON 对象");
          }
          extra_json = parsed as Record<string, unknown>;
        } catch {
          throw new Error(`第 ${lineNo} 行：扩展 JSON 列解析失败（须为合法对象 JSON）`);
        }
      }
    }

    if (!label.trim()) {
      throw new Error(`第 ${lineNo} 行：显示名不能为空`);
    }

    rows.push({
      explicitValue,
      label: label.trim(),
      sort_order,
      is_enabled,
      parent_value,
      extra_json,
    });
  }
  if (!rows.length) throw new Error("没有有效数据行（空行与 # 注释除外）");
  return rows;
}

function resolveBulkValues(
  parsed: BulkDictCsvParsed[],
  existingValues: Set<string>,
): BulkDictItemRow[] {
  const used = new Set(existingValues);
  return parsed.map((p) => {
    const ev = p.explicitValue?.trim();
    let value: string;
    if (ev) {
      value = ev.slice(0, 128);
      if (used.has(value)) {
        throw new Error(`取值「${value}」重复（与已有项或本表其他行冲突）`);
      }
      used.add(value);
    } else {
      value = allocateAutoValue(p.label, used);
    }
    return {
      value,
      label: p.label,
      sort_order: p.sort_order,
      is_enabled: p.is_enabled,
      parent_value: p.parent_value,
      extra_json: p.extra_json,
    };
  });
}

function apiErrorDetail(e: unknown): string {
  if (e && typeof e === "object" && "response" in e) {
    const r = (e as { response?: { data?: { detail?: unknown } } }).response;
    const d = r?.data?.detail;
    if (typeof d === "string") return d;
    if (Array.isArray(d)) return JSON.stringify(d);
  }
  if (e instanceof Error) return e.message;
  return "未知错误";
}

export default function DictTypeItemsPage() {
  const { typeCode: typeCodeParam } = useParams<{ typeCode: string }>();
  const typeCode = typeCodeParam ? decodeURIComponent(typeCodeParam) : "";
  const navigate = useNavigate();
  const location = useLocation();

  const [typeInfo, setTypeInfo] = useState<DataDictTypeDTO | null>(null);
  const [typeLoading, setTypeLoading] = useState(true);
  const [items, setItems] = useState<DataDictItemDTO[]>([]);
  const [itemsLoading, setItemsLoading] = useState(false);

  const [itemModalOpen, setItemModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<DataDictItemDTO | null>(null);
  const [itemForm] = Form.useForm();

  const [batchModalOpen, setBatchModalOpen] = useState(false);
  const [batchText, setBatchText] = useState("");
  const [batchSubmitting, setBatchSubmitting] = useState(false);

  const loadType = useCallback(async () => {
    if (!typeCode) return;
    setTypeLoading(true);
    try {
      const t = await getDictType(typeCode);
      setTypeInfo(t);
    } catch {
      setTypeInfo(null);
      message.error("字典类型不存在或无权访问");
    } finally {
      setTypeLoading(false);
    }
  }, [typeCode]);

  const loadItems = useCallback(async () => {
    if (!typeCode) return;
    setItemsLoading(true);
    try {
      const rows = await listDictItems(typeCode, { include_disabled: true });
      setItems(rows);
    } catch {
      message.error("加载字典项失败");
      setItems([]);
    } finally {
      setItemsLoading(false);
    }
  }, [typeCode]);

  useEffect(() => {
    loadType();
  }, [loadType]);

  /** 无 navigate state 时（如刷新、直链）用接口名称更新标签标题 */
  useEffect(() => {
    if (!typeInfo?.name) return;
    const st = location.state as { dictTypeName?: string } | undefined;
    if (st?.dictTypeName === typeInfo.name) return;
    navigate(
      {
        pathname: location.pathname,
        search: location.search,
        hash: location.hash,
      },
      { replace: true, state: { dictTypeName: typeInfo.name } },
    );
  }, [
    typeInfo?.name,
    typeInfo,
    navigate,
    location.pathname,
    location.search,
    location.hash,
    location.state,
  ]);

  useEffect(() => {
    if (typeInfo) {
      loadItems();
    } else {
      setItems([]);
    }
  }, [typeInfo, loadItems]);

  if (!typeCodeParam || !typeCode) {
    return <Navigate to="/system/dict" replace />;
  }

  const openCreateItem = () => {
    setEditingItem(null);
    itemForm.resetFields();
    itemForm.setFieldsValue({
      sort_order: 0,
      is_enabled: true,
      parent_id: undefined,
    });
    setItemModalOpen(true);
  };

  const openEditItem = (row: DataDictItemDTO) => {
    setEditingItem(row);
    itemForm.setFieldsValue({
      value: row.value,
      label: row.label,
      parent_id: row.parent_id ?? undefined,
      sort_order: row.sort_order,
      is_enabled: row.is_enabled,
      extra_json:
        row.extra_json && Object.keys(row.extra_json).length
          ? JSON.stringify(row.extra_json, null, 2)
          : "",
    });
    setItemModalOpen(true);
  };

  const submitItem = async () => {
    if (!typeCode) return;
    try {
      const v = await itemForm.validateFields();
      let extra: Record<string, unknown> | null = null;
      const rawExtra = (v.extra_json as string)?.trim();
      if (rawExtra) {
        try {
          extra = JSON.parse(rawExtra) as Record<string, unknown>;
          if (extra === null || typeof extra !== "object" || Array.isArray(extra)) {
            throw new Error("must be object");
          }
        } catch {
          message.error("扩展 JSON 须为合法的对象 JSON");
          return;
        }
      }
      if (editingItem) {
        await updateDictItem(editingItem.id, {
          value: v.value,
          label: v.label,
          parent_id: v.parent_id ?? null,
          sort_order: v.sort_order,
          is_enabled: v.is_enabled,
          extra_json: extra,
        });
        message.success("已保存");
      } else {
        await createDictItem(typeCode, {
          value: v.value,
          label: v.label,
          parent_id: v.parent_id ?? null,
          sort_order: v.sort_order ?? 0,
          is_enabled: v.is_enabled ?? true,
          extra_json: extra,
        });
        message.success("已创建");
      }
      setItemModalOpen(false);
      await loadItems();
    } catch (e) {
      if ((e as { errorFields?: unknown })?.errorFields) return;
      message.error("保存失败");
    }
  };

  const onBulkImport = async () => {
    if (!typeCode) return;
    let parsed: BulkDictCsvParsed[];
    try {
      parsed = parseBulkDictCsv(batchText);
    } catch (err) {
      message.error(err instanceof Error ? err.message : "解析失败");
      return;
    }
    let rows: BulkDictItemRow[];
    try {
      rows = resolveBulkValues(parsed, new Set(items.map((i) => i.value)));
    } catch (err) {
      message.error(err instanceof Error ? err.message : "取值处理失败");
      return;
    }
    setBatchSubmitting(true);
    try {
      const res = await bulkCreateDictItems(typeCode, {
        items: rows.map((row) => ({
          value: row.value,
          label: row.label,
          sort_order: row.sort_order,
          is_enabled: row.is_enabled,
          extra_json: row.extra_json,
          parent_value: row.parent_value,
        })),
      });
      if (res.created > 0) {
        message.success(`成功导入 ${res.created} 条`);
      }
      if (res.failed.length > 0) {
        Modal.warning({
          title: `${res.failed.length} 条未导入`,
          width: 560,
          content: (
            <div className="dictBulkFailList">
              {res.failed.map((f, idx) => (
                <div key={`${f.value}-${idx}`}>
                  <Typography.Text strong>{f.value}</Typography.Text>
                  <Typography.Text type="secondary"> — {f.detail}</Typography.Text>
                </div>
              ))}
            </div>
          ),
        });
      }
      setBatchModalOpen(false);
      setBatchText("");
      await loadItems();
    } catch (e) {
      message.error(apiErrorDetail(e));
    } finally {
      setBatchSubmitting(false);
    }
  };

  const parentOptions = items
    .filter((i) => !editingItem || i.id !== editingItem.id)
    .map((i) => ({
      value: i.id,
      label: `${i.label} (${i.value})`,
    }));

  const itemColumns: ColumnsType<DataDictItemDTO> = [
    { title: "ID", dataIndex: "id", width: 72 },
    { title: "取值", dataIndex: "value", width: 140 },
    { title: "显示名", dataIndex: "label", ellipsis: true },
    {
      title: "上级",
      dataIndex: "parent_id",
      width: 120,
      render: (pid: number | null) => {
        if (pid == null) return "—";
        const p = items.find((x) => x.id === pid);
        return p ? p.label : `#${pid}`;
      },
    },
    { title: "排序", dataIndex: "sort_order", width: 80 },
    {
      title: "状态",
      dataIndex: "is_enabled",
      width: 80,
      render: (v: boolean) =>
        v ? <Tag color="success">启用</Tag> : <Tag>停用</Tag>,
    },
    {
      title: "扩展",
      dataIndex: "extra_json",
      width: 100,
      ellipsis: true,
      render: (ex: Record<string, unknown> | null) =>
        ex && Object.keys(ex).length ? (
          <span className="dictMaintenanceExtraJson" title={JSON.stringify(ex)}>
            {JSON.stringify(ex)}
          </span>
        ) : (
          "—"
        ),
    },
    {
      title: "操作",
      key: "ia",
      width: 140,
      render: (_, row) => (
        <Space size="small">
          <Button type="link" size="small" onClick={() => openEditItem(row)}>
            编辑
          </Button>
          <Popconfirm
            title="确定删除该字典项？"
            onConfirm={async () => {
              try {
                await deleteDictItem(row.id);
                message.success("已删除");
                await loadItems();
              } catch {
                message.error("删除失败");
              }
            }}
          >
            <Button type="link" size="small" danger>
              删除
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  const titleText = typeInfo
    ? `字典项 · ${typeInfo.name}（${typeInfo.code}）`
    : `字典项 · ${typeCode}`;

  return (
    <div className="dictMaintenance">
      <Card
        className="dictMaintenanceItemsCard"
        title={titleText}
        loading={typeLoading}
        extra={
          <Space>
            <Button disabled={!typeInfo} onClick={() => setBatchModalOpen(true)}>
              批量导入
            </Button>
            <Button type="primary" disabled={!typeInfo} onClick={openCreateItem}>
              新建项
            </Button>
          </Space>
        }
      >
        {!typeInfo && !typeLoading ? (
          <p className="dictMaintenanceHint">无法加载该字典类型。</p>
        ) : (
          <Table<DataDictItemDTO>
            rowKey="id"
            loading={itemsLoading}
            columns={itemColumns}
            dataSource={items}
            pagination={{ pageSize: 15, showSizeChanger: true }}
            size="small"
          />
        )}
      </Card>

      <Modal
        title={editingItem ? "编辑字典项" : "新建字典项"}
        open={itemModalOpen}
        onOk={submitItem}
        onCancel={() => setItemModalOpen(false)}
        destroyOnClose
        width={560}
      >
        <Form form={itemForm} layout="vertical">
          <Form.Item
            name="value"
            label="取值"
            rules={[{ required: true, message: "请输入取值" }]}
            extra="同一字典内唯一，用于存储与接口传参。"
          >
            <Input autoComplete="off" />
          </Form.Item>
          <Form.Item
            name="label"
            label="显示名"
            rules={[{ required: true, message: "请输入显示名" }]}
          >
            <Input />
          </Form.Item>
          <Form.Item name="parent_id" label="上级项">
            <Select
              allowClear
              placeholder="根级（无上级）"
              options={parentOptions}
              showSearch
              optionFilterProp="label"
            />
          </Form.Item>
          <Form.Item name="sort_order" label="排序">
            <InputNumber min={0} style={{ width: "100%" }} />
          </Form.Item>
          <Form.Item name="is_enabled" label="启用" valuePropName="checked">
            <Switch />
          </Form.Item>
          <Form.Item
            name="extra_json"
            label="扩展 JSON（对象）"
            extra="选填，供项目配置透传元数据。"
          >
            <Input.TextArea
              className="dictMaintenanceExtraJson"
              rows={4}
              placeholder='例如 {"code":"x"}'
            />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title={
          <Space size={6} align="center">
            <span>批量导入字典项</span>
            <Tooltip
              title={DICT_BULK_IMPORT_HELP}
              placement="bottomLeft"
              overlayStyle={{ maxWidth: 480 }}
              getPopupContainer={() => document.body}
            >
              <QuestionCircleOutlined className="dictBulkTitleHelpIcon" aria-label="格式说明" />
            </Tooltip>
          </Space>
        }
        open={batchModalOpen}
        onOk={onBulkImport}
        onCancel={() => setBatchModalOpen(false)}
        confirmLoading={batchSubmitting}
        okText="开始导入"
        width={640}
        destroyOnClose
      >
        <Typography.Paragraph type="secondary" className="dictBulkExample dictBulkModalExampleIntro">
          示例：
          <pre>
            {`取值,显示名,排序,是否启用,上级取值
cat1,一级,0,,
,二级,1,1,cat1`}
          </pre>
        </Typography.Paragraph>
        <Input.TextArea
          rows={12}
          value={batchText}
          onChange={(e) => setBatchText(e.target.value)}
          placeholder="粘贴 CSV。列说明请点标题旁问号。"
          className="dictBulkTextarea"
        />
      </Modal>
    </div>
  );
}
