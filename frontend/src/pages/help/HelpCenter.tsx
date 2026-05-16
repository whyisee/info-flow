import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  Button,
  Empty,
  Form,
  Input,
  Modal,
  Popconfirm,
  Space,
  Spin,
  Tag,
  Typography,
  message,
} from "antd";
import {
  SearchOutlined,
  DeleteOutlined,
  EditOutlined,
  FileTextOutlined,
  PlusOutlined,
  ReloadOutlined,
} from "@ant-design/icons";
import { useAuth } from "../../store/AuthContext";
import {
  deleteHelpDoc,
  getHelpDoc,
  listHelpDocs,
  resolveHelpAssetUrl,
  saveHelpDoc,
  type HelpDocDetail,
  type HelpDocSavePayload,
  type HelpDocSummary,
} from "../../services/helpCenter";
import "./HelpCenter.css";

const { Text, Title } = Typography;

const DEFAULT_DOC = `# 新帮助文档

入口路径：\`/example/path\`

## 页面用途

请在这里描述本页面的用途。

## 操作步骤

1. 第一步。
2. 第二步。
3. 第三步。

## 注意事项

- 请补充使用限制或常见问题。
`;

function isHeading(line: string, level: number) {
  return line.startsWith(`${"#".repeat(level)} `);
}

function inlineText(text: string, keyPrefix: string): ReactNode[] {
  const out: ReactNode[] = [];
  const re = /`([^`]+)`|\[([^\]]+)\]\(([^)]+)\)/g;
  let last = 0;
  let idx = 0;
  for (const match of text.matchAll(re)) {
    if (match.index > last) out.push(text.slice(last, match.index));
    if (match[1]) {
      out.push(<code key={`${keyPrefix}-code-${idx}`}>{match[1]}</code>);
    } else if (match[2] && match[3]) {
      out.push(
        <a key={`${keyPrefix}-link-${idx}`} href={match[3]}>
          {match[2]}
        </a>,
      );
    }
    last = match.index + match[0].length;
    idx += 1;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

function MarkdownPreview({ content }: { content: string }) {
  const nodes: ReactNode[] = [];
  const lines = content.split(/\r?\n/);
  let i = 0;

  while (i < lines.length) {
    const line = lines[i].trimEnd();
    const trimmed = line.trim();
    if (!trimmed) {
      i += 1;
      continue;
    }

    const image = trimmed.match(/^!\[([^\]]*)\]\(([^)]+)\)$/);
    if (image) {
      nodes.push(
        <figure className="helpMarkdownFigure" key={`img-${i}`}>
          <img src={resolveHelpAssetUrl(image[2])} alt={image[1]} />
        </figure>,
      );
      i += 1;
      continue;
    }

    if (isHeading(trimmed, 1)) {
      nodes.push(<h1 key={i}>{trimmed.slice(2)}</h1>);
    } else if (isHeading(trimmed, 2)) {
      nodes.push(<h2 key={i}>{trimmed.slice(3)}</h2>);
    } else if (isHeading(trimmed, 3)) {
      nodes.push(<h3 key={i}>{trimmed.slice(4)}</h3>);
    } else if (trimmed.startsWith("- ")) {
      const items: string[] = [];
      while (i < lines.length && lines[i].trim().startsWith("- ")) {
        items.push(lines[i].trim().slice(2));
        i += 1;
      }
      nodes.push(
        <ul key={`ul-${i}`}>
          {items.map((item, idx) => (
            <li key={idx}>{inlineText(item, `ul-${i}-${idx}`)}</li>
          ))}
        </ul>,
      );
      continue;
    } else if (/^\d+\.\s+/.test(trimmed)) {
      const items: string[] = [];
      while (i < lines.length && /^\d+\.\s+/.test(lines[i].trim())) {
        items.push(lines[i].trim().replace(/^\d+\.\s+/, ""));
        i += 1;
      }
      nodes.push(
        <ol key={`ol-${i}`}>
          {items.map((item, idx) => (
            <li key={idx}>{inlineText(item, `ol-${i}-${idx}`)}</li>
          ))}
        </ol>,
      );
      continue;
    } else {
      nodes.push(<p key={i}>{inlineText(trimmed, `p-${i}`)}</p>);
    }
    i += 1;
  }

  return <article className="helpMarkdown">{nodes}</article>;
}

function slugFromTitle(title: string) {
  const base = title
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return base || "new-help-doc";
}

export default function HelpCenter() {
  const { user } = useAuth();
  const [docs, setDocs] = useState<HelpDocSummary[]>([]);
  const [docIndex, setDocIndex] = useState<Record<string, string>>({});
  const [docsLoading, setDocsLoading] = useState(false);
  const [searchKeyword, setSearchKeyword] = useState("");
  const [activeSlug, setActiveSlug] = useState<string | null>(null);
  const [activeDoc, setActiveDoc] = useState<HelpDocDetail | null>(null);
  const [docLoading, setDocLoading] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingDoc, setEditingDoc] = useState<HelpDocDetail | null>(null);
  const [form] = Form.useForm<HelpDocSavePayload>();

  const canManage = Boolean(user?.permissions?.includes("system:help:manage"));

  const loadDocs = useCallback(async () => {
    setDocsLoading(true);
    try {
      const rows = await listHelpDocs();
      setDocs(rows);
      setActiveSlug((prev) => prev ?? rows[0]?.slug ?? null);
      const details = await Promise.all(
        rows.map(async (row) => {
          try {
            const detail = await getHelpDoc(row.slug);
            return [row.slug, detail.content] as const;
          } catch {
            return [row.slug, ""] as const;
          }
        }),
      );
      setDocIndex(Object.fromEntries(details));
    } catch {
      message.error("加载帮助文档失败");
    } finally {
      setDocsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadDocs();
  }, [loadDocs]);

  const loadDoc = useCallback(async (slug: string) => {
    setDocLoading(true);
    try {
      const row = await getHelpDoc(slug);
      setActiveDoc(row);
    } catch {
      message.error("加载文档内容失败");
    } finally {
      setDocLoading(false);
    }
  }, []);

  useEffect(() => {
    if (activeSlug) loadDoc(activeSlug);
    else setActiveDoc(null);
  }, [activeSlug, loadDoc]);

  const activeSummary = useMemo(
    () => docs.find((row) => row.slug === activeSlug) ?? null,
    [docs, activeSlug],
  );
  const filteredDocs = useMemo(() => {
    const keyword = searchKeyword.trim().toLowerCase();
    if (!keyword) return docs;
    return docs.filter((doc) => {
      const hay = [
        doc.title,
        doc.slug,
        doc.path ?? "",
        docIndex[doc.slug] ?? "",
      ]
        .join("\n")
        .toLowerCase();
      return hay.includes(keyword);
    });
  }, [docIndex, docs, searchKeyword]);

  const openCreate = () => {
    setEditingDoc(null);
    form.setFieldsValue({
      slug: "new-help-doc",
      title: "新帮助文档",
      path: "",
      screenshot: "",
      content: DEFAULT_DOC,
    });
    setEditorOpen(true);
  };

  const openEdit = () => {
    if (!activeDoc) return;
    setEditingDoc(activeDoc);
    form.setFieldsValue({
      slug: activeDoc.slug,
      title: activeDoc.title,
      path: activeDoc.path ?? "",
      screenshot: activeDoc.screenshot ?? "",
      content: activeDoc.content,
    });
    setEditorOpen(true);
  };

  const submitDoc = async () => {
    try {
      const values = await form.validateFields();
      const payload = {
        ...values,
        slug: values.slug.trim(),
        title: values.title.trim(),
        path: values.path?.trim() || null,
        screenshot: values.screenshot?.trim() || null,
      };
      const saved = await saveHelpDoc(payload.slug, payload);
      message.success("帮助文档已保存");
      setEditorOpen(false);
      setActiveSlug(saved.slug);
      setDocIndex((prev) => ({ ...prev, [saved.slug]: saved.content }));
      await loadDocs();
      await loadDoc(saved.slug);
    } catch (e) {
      if ((e as { errorFields?: unknown })?.errorFields) return;
      message.error("保存帮助文档失败");
    }
  };

  const removeActiveDoc = async () => {
    if (!activeDoc) return;
    try {
      await deleteHelpDoc(activeDoc.slug);
      message.success("帮助文档已删除");
      setDocIndex((prev) => {
        const next = { ...prev };
        delete next[activeDoc.slug];
        return next;
      });
      setActiveDoc(null);
      setActiveSlug(null);
      await loadDocs();
    } catch {
      message.error("删除帮助文档失败");
    }
  };

  return (
    <div className="helpCenter">
      <aside className="helpCenterNav">
        <div className="helpCenterNavHeader">
          <div>
            <Title level={4}>帮助中心</Title>
            <Text type="secondary">系统操作说明与截图</Text>
          </div>
          <Button icon={<ReloadOutlined />} onClick={loadDocs} />
        </div>
        {canManage ? (
          <Button
            block
            type="primary"
            icon={<PlusOutlined />}
            onClick={openCreate}
            className="helpCenterCreateButton"
          >
            新建文档
          </Button>
        ) : null}
        <Input
          allowClear
          prefix={<SearchOutlined />}
          placeholder="搜索标题、路径或正文"
          value={searchKeyword}
          onChange={(event) => setSearchKeyword(event.target.value)}
          className="helpCenterSearch"
        />
        <Spin spinning={docsLoading}>
          <div className="helpCenterDocList">
            {filteredDocs.map((doc) => (
              <button
                type="button"
                key={doc.slug}
                className={
                  doc.slug === activeSlug
                    ? "helpCenterDocItem helpCenterDocItemActive"
                    : "helpCenterDocItem"
                }
                onClick={() => setActiveSlug(doc.slug)}
              >
                <FileTextOutlined />
                <span>{doc.title}</span>
              </button>
            ))}
            {!docsLoading && docs.length === 0 ? <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} /> : null}
            {!docsLoading && docs.length > 0 && filteredDocs.length === 0 ? (
              <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="没有匹配的帮助文档" />
            ) : null}
          </div>
        </Spin>
      </aside>

      <main className="helpCenterMain">
        {activeDoc ? (
          <>
            <div className="helpCenterToolbar">
              <div>
                <Title level={3}>{activeDoc.title}</Title>
                <Space size="small" wrap>
                  <Tag>{activeDoc.slug}</Tag>
                  {activeSummary?.path ? <Tag color="blue">{activeSummary.path}</Tag> : null}
                </Space>
              </div>
              {canManage ? (
                <Space>
                  <Button icon={<EditOutlined />} onClick={openEdit}>
                    编辑
                  </Button>
                  <Popconfirm title="确定删除这份帮助文档？" onConfirm={removeActiveDoc}>
                    <Button danger icon={<DeleteOutlined />}>
                      删除
                    </Button>
                  </Popconfirm>
                </Space>
              ) : null}
            </div>
            <Spin spinning={docLoading}>
              <MarkdownPreview content={activeDoc.content} />
            </Spin>
          </>
        ) : (
          <div className="helpCenterEmpty">
            <Empty description="暂无帮助文档" />
          </div>
        )}
      </main>

      <Modal
        title={editingDoc ? "编辑帮助文档" : "新建帮助文档"}
        open={editorOpen}
        onCancel={() => setEditorOpen(false)}
        onOk={submitDoc}
        width={980}
        destroyOnClose
      >
        <Form
          form={form}
          layout="vertical"
          onValuesChange={(changed) => {
            if (!editingDoc && changed.title && form.getFieldValue("slug") === "new-help-doc") {
              form.setFieldValue("slug", slugFromTitle(changed.title));
            }
          }}
        >
          <Space className="helpCenterEditorMeta" align="start">
            <Form.Item
              name="slug"
              label="文档标识"
              rules={[
                { required: true, message: "请输入文档标识" },
                {
                  pattern: /^[a-z0-9][a-z0-9-]{0,79}$/,
                  message: "仅支持小写字母、数字和短横线",
                },
              ]}
            >
              <Input disabled={Boolean(editingDoc)} placeholder="system-users" />
            </Form.Item>
            <Form.Item name="title" label="标题" rules={[{ required: true, message: "请输入标题" }]}>
              <Input placeholder="用户管理" />
            </Form.Item>
            <Form.Item name="path" label="入口路径">
              <Input placeholder="/system/users" />
            </Form.Item>
          </Space>
          <Form.Item name="screenshot" label="截图路径">
            <Input placeholder="screenshots/system-users.png" />
          </Form.Item>
          <Form.Item name="content" label="Markdown 内容" rules={[{ required: true, message: "请输入文档内容" }]}>
            <Input.TextArea rows={18} spellCheck={false} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
