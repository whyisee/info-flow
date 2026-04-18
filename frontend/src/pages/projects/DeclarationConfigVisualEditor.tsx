import { useEffect, useMemo, useRef, useState } from "react";
import {
  Button,
  Card,
  Form,
  Input,
  InputNumber,
  Select,
  Space,
  Spin,
  Switch,
  Tabs,
  Typography,
} from "antd";
import type { FormInstance } from "antd/es/form";
import {
  EditOutlined,
  MinusCircleOutlined,
  PlusOutlined,
} from "@ant-design/icons";
import type { DeclarationFormValues } from "./declarationConfigTransforms";
import { newDefaultToolbar } from "./declarationConfigTransforms";
import "./DeclarationConfigVisualEditor.css";
import {
  getSurveyTemplate,
  listSurveyTemplates,
  type SurveyTemplate,
} from "../../services/surveyTemplates";
import { getPublicVersion } from "../../services/surveyResponses";
import { SurveyPreview } from "../../pages/survey/SurveyPreview";

const WIDGET_OPTIONS = [
  { value: "input", label: "单行文本" },
  { value: "textarea", label: "多行文本" },
  { value: "number", label: "数字" },
  { value: "select", label: "下拉选择" },
];

const CELL_TYPES = [
  { value: "text", label: "文本" },
  { value: "number", label: "数字" },
  { value: "file", label: "附件" },
  { value: "date", label: "日期" },
  { value: "boolean", label: "是否" },
];

// FormDesignerPreview 已由 FormDesignerEditor 内置

const SECTION_KIND_OPTIONS = [
  { value: "map", label: "表单汇总 (map)" },
  { value: "list", label: "列表 (list)" },
  { value: "form_ref", label: "问卷模板引用 (form_ref)" },
] as const;

function FormRefTemplateSelectorInline({
  form,
  modName,
  subName,
  secName,
  templateOptions,
  templateOptionsMap,
}: {
  form: FormInstance<DeclarationFormValues>;
  modName: number;
  subName: number;
  secName: number;
  templateOptions: { value: number; label: string }[];
  templateOptionsMap: Record<number, SurveyTemplate>;
}) {
  const kind = Form.useWatch(
    ["modules", modName, "subModules", subName, "sections", secName, "kind"],
    { form, preserve: true },
  ) as string | undefined;

  const currentTemplateId = Form.useWatch(
    ["modules", modName, "subModules", subName, "sections", secName, "templateId"],
    { form, preserve: true },
  ) as number | undefined;

  const handleChange = (newTemplateId: number) => {
    const tpl = templateOptionsMap[newTemplateId];
    const ver = tpl?.published_version ?? 1;
    form.setFieldValue(["modules", modName, "subModules", subName, "sections", secName, "templateId"], newTemplateId);
    form.setFieldValue(["modules", modName, "subModules", subName, "sections", secName, "templateVersion"], ver);
  };

  if (kind !== "form_ref") return null;

  return (
    <Form.Item label="选择模板" name={[secName, "templateId"]}>
      <Select
        showSearch
        placeholder="请选择问卷模板"
        style={{ width: 200 }}
        options={templateOptions}
        optionFilterProp="label"
        value={currentTemplateId}
        onChange={handleChange}
      />
    </Form.Item>
  );
}

type Props = {
  form: FormInstance<DeclarationFormValues>;
};

function ModuleTabTitle({
  fieldName,
  form,
  editing,
  /** 由父组件根据 modules 快照传入；标签不在 Form.List 子树内，不能依赖对 title 的 useWatch */
  displayTitle,
  onStartEdit,
  onEndEdit,
}: {
  /** Form.List 子项 name，可能是 number 或 string */
  fieldName: number | string;
  form: FormInstance<DeclarationFormValues>;
  editing: boolean;
  displayTitle: string | undefined;
  onStartEdit: () => void;
  onEndEdit: () => void;
}) {
  /** 标签在 Tabs 内，不用 Form.Item 绑定 title（会与 Form.List 内字段冲突）；本地草稿提交时用 setFieldsValue 整段替换 modules */
  const [draft, setDraft] = useState("");
  const skipBlurCommitRef = useRef(false);

  useEffect(() => {
    if (!editing) return;
    skipBlurCommitRef.current = false;
    const modules = form.getFieldValue("modules") as
      | DeclarationFormValues["modules"]
      | undefined;
    const idx = Number(fieldName);
    const t = modules?.[idx]?.title;
    setDraft(typeof t === "string" ? t : "");
  }, [editing, fieldName, form]);

  const commitTitle = () => {
    const modules =
      (form.getFieldValue("modules") as DeclarationFormValues["modules"]) ?? [];
    const idx = Number(fieldName);
    if (!Number.isFinite(idx) || idx < 0 || idx >= modules.length) {
      onEndEdit();
      return;
    }
    const nextModules = modules.map((m, i) =>
      i === idx ? { ...m, title: draft } : m,
    );
    form.setFieldsValue({ modules: nextModules });
    onEndEdit();
  };

  if (editing) {
    return (
      <div
        className="declCfgVisualModuleTabEdit"
        onClick={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <Input
          placeholder="模块标题"
          className="declCfgVisualModuleTabInput"
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            /** editable-card 的 Tabs 会响应 Delete/Backspace 删除标签，须阻止冒泡 */
            e.stopPropagation();
          }}
          onBlur={() => {
            if (skipBlurCommitRef.current) {
              skipBlurCommitRef.current = false;
              return;
            }
            commitTitle();
          }}
          onPressEnter={(e) => {
            e.preventDefault();
            skipBlurCommitRef.current = true;
            commitTitle();
          }}
          onMouseDown={(e) => e.stopPropagation()}
        />
      </div>
    );
  }

  return (
    <span className="declCfgVisualModuleTabRead">
      {/** 标题区不 stopPropagation，点击可正常交给 Tabs 切换；仅铅笔按钮阻止冒泡 */}
      <span className="declCfgVisualModuleTabReadText">
        {displayTitle?.trim() ? displayTitle : "未命名模块"}
      </span>
      <button
        type="button"
        className="declCfgVisualModuleTabEditBtn"
        aria-label="编辑标题"
        onMouseDown={(e) => e.stopPropagation()}
        onClick={(e) => {
          e.stopPropagation();
          onStartEdit();
        }}
      >
        <EditOutlined />
      </button>
    </span>
  );
}

export function DeclarationConfigVisualEditor({ form }: Props) {
  const modulesWatch = Form.useWatch("modules", { form, preserve: true }) as
    | DeclarationFormValues["modules"]
    | undefined;

  const [activeTabKey, setActiveTabKey] = useState<string>("");
  const [titleEditIndex, setTitleEditIndex] = useState<number | null>(null);
  /** 点铅笔会先切到对应标签，onChange 里不应清掉刚进入的标题编辑态 */
  const skipClearTitleEditOnTabChangeRef = useRef(false);
  /** addMod 后表单可能晚一帧才有新模块 key，避免 useEffect 误把 activeKey 打回第一个标签 */
  const pendingNewTabKeyRef = useRef<string | null>(null);

  const moduleKeys = useMemo(() => {
    const list = modulesWatch ?? [];
    return list.map((m, i) =>
      typeof m?.key === "string" && m.key ? m.key : `__idx_${i}`,
    );
  }, [modulesWatch]);

  useEffect(() => {
    if (moduleKeys.length === 0) {
      if (activeTabKey !== "") setActiveTabKey("");
      pendingNewTabKeyRef.current = null;
      return;
    }

    const pending = pendingNewTabKeyRef.current;
    if (pending && moduleKeys.includes(pending)) {
      setActiveTabKey(pending);
      pendingNewTabKeyRef.current = null;
      return;
    }
    if (pending && !moduleKeys.includes(pending)) {
      return;
    }

    if (!activeTabKey || !moduleKeys.includes(activeTabKey)) {
      setActiveTabKey(moduleKeys[0] ?? "");
    }
  }, [moduleKeys, activeTabKey]);

  return (
    <div className="declCfgVisual">
      <Form.List name="modules">
        {(modFields, { add: addMod, remove: removeMod }) => (
          <>
            {modFields.length === 0 ? (
              <Button
                type="dashed"
                icon={<PlusOutlined />}
                onClick={() => {
                  const k = `module_${Date.now()}`;
                  pendingNewTabKeyRef.current = k;
                  addMod({
                    key: k,
                    title: "",
                    order: 0,
                    subModules: [],
                  });
                  setActiveTabKey(k);
                }}
              >
                添加模块
              </Button>
            ) : (
              <Tabs
                type="editable-card"
                className="declCfgVisualModuleTabs"
                size="small"
                destroyOnHidden={false}
                activeKey={activeTabKey}
                onChange={(key) => {
                  setActiveTabKey(key);
                  if (skipClearTitleEditOnTabChangeRef.current) {
                    skipClearTitleEditOnTabChangeRef.current = false;
                    return;
                  }
                  setTitleEditIndex(null);
                }}
                onEdit={(e, action) => {
                  if (action === "add") {
                    const k = `module_${Date.now()}`;
                    pendingNewTabKeyRef.current = k;
                    addMod({
                      key: k,
                      title: "",
                      order: modFields.length,
                      subModules: [],
                    });
                    setActiveTabKey(k);
                    setTitleEditIndex(null);
                    return;
                  }
                  if (action === "remove" && typeof e === "string") {
                    const idx = (modulesWatch ?? []).findIndex(
                      (m) => typeof m?.key === "string" && m.key === e,
                    );
                    if (idx >= 0) {
                      removeMod(idx);
                      setTitleEditIndex(null);
                    }
                  }
                }}
                items={modFields.map((mf) => {
                  const mod = modulesWatch?.[mf.name];
                  const storageKey =
                    typeof mod?.key === "string" && mod.key.length > 0
                      ? mod.key
                      : `__idx_${mf.name}`;
                  return {
                    key: storageKey,
                    closable: true,
                    label: (
                      <ModuleTabTitle
                        fieldName={mf.name}
                        form={form}
                        displayTitle={modulesWatch?.[mf.name]?.title}
                        editing={titleEditIndex === mf.name}
                        onStartEdit={() => {
                          if (activeTabKey !== storageKey) {
                            skipClearTitleEditOnTabChangeRef.current = true;
                            setActiveTabKey(storageKey);
                          }
                          setTitleEditIndex(mf.name);
                        }}
                        onEndEdit={() => setTitleEditIndex(null)}
                      />
                    ),
                    children: (
                      <div className="declCfgVisualModulePanel">
                        <Form.Item name={[mf.name, "title"]} hidden>
                          <Input />
                        </Form.Item>
                        <Form.Item name={[mf.name, "key"]} hidden>
                          <Input />
                        </Form.Item>

                        {/* <Typography.Text type="secondary" className="declCfgVisualSubTitle">
                          子模块
                        </Typography.Text> */}
                        <Form.List name={[mf.name, "subModules"]}>
                          {(subFields, { add: addSub, remove: removeSub }) => (
                            <>
                              {subFields.map((sf) => (
                                <SubModulePanel
                                  key={sf.key}
                                  form={form}
                                  modName={mf.name}
                                  subName={sf.name}
                                  onRemove={() => removeSub(sf.name)}
                                />
                              ))}
                              <Button
                                type="dashed"
                                block
                                icon={<PlusOutlined />}
                                onClick={() =>
                                  addSub({
                                    key: `sub_${Date.now()}`,
                                    title: "",
                                    order: subFields.length,
                                    helpText: "",
                                    sections: [
                                      {
                                        key: `sec_${Date.now()}`,
                                        title: "",
                                        kind: "map",
                                        order: 0,
                                        sentenceTemplate: "",
                                        fields: [],
                                        attachments: [],
                                        maxRows: 10,
                                        toolbar: newDefaultToolbar(),
                                        columns: [],
                                        formSchemaJson: "",
                                        formFieldsJson: "",
                                      },
                                    ],
                                  })
                                }
                              >
                                添加子模块
                              </Button>
                            </>
                          )}
                        </Form.List>
                      </div>
                    ),
                  };
                })}
              />
            )}
          </>
        )}
      </Form.List>
    </div>
  );
}

function SubModulePanel({
  form,
  modName,
  subName,
  onRemove,
}: {
  form: FormInstance<DeclarationFormValues>;
  modName: number;
  subName: number;
  onRemove: () => void;
}) {
  const [titleEditing, setTitleEditing] = useState(false);
  const [helpEditing, setHelpEditing] = useState(false);
  const [titleDraft, setTitleDraft] = useState("");
  const [helpDraft, setHelpDraft] = useState("");
  const [titleDisplay, setTitleDisplay] = useState("");
  const [helpDisplay, setHelpDisplay] = useState("");
  const [templateOptions, setTemplateOptions] = useState<{ value: number; label: string }[]>([]);
  const [templateOptionsMap, setTemplateOptionsMap] = useState<Record<number, SurveyTemplate>>({});

  const titleValue = Form.useWatch(
    ["modules", modName, "subModules", subName, "title"],
    form,
  ) as string | undefined;
  const helpValue = Form.useWatch(
    ["modules", modName, "subModules", subName, "helpText"],
    form,
  ) as string | undefined;

  const readSubField = (field: "title" | "helpText"): string => {
    const v = form.getFieldValue([
      "modules",
      modName,
      "subModules",
      subName,
      field,
    ]) as unknown;
    if (typeof v === "string") return v;
    return field === "title" ? titleDisplay : helpDisplay;
  };

  /**
   * 初始化展示值：避免 useWatch 在嵌套 Form.List 下短暂取空导致闪回“未命名”。
   * 后续展示以本地 display 为主；watch 仅在拿到有效 string 时用于同步覆盖。
   */
  useEffect(() => {
    const t = form.getFieldValue([
      "modules",
      modName,
      "subModules",
      subName,
      "title",
    ]) as unknown;
    const h = form.getFieldValue([
      "modules",
      modName,
      "subModules",
      subName,
      "helpText",
    ]) as unknown;
    setTitleDisplay(typeof t === "string" ? t : "");
    setHelpDisplay(typeof h === "string" ? h : "");
    setTitleEditing(false);
    setHelpEditing(false);
  }, [form, modName, subName]);

  useEffect(() => {
    if (titleEditing) return;
    if (typeof titleValue !== "string") return;
    setTitleDisplay(titleValue);
  }, [titleEditing, titleValue]);

  useEffect(() => {
    if (helpEditing) return;
    if (typeof helpValue !== "string") return;
    setHelpDisplay(helpValue);
  }, [helpEditing, helpValue]);

  const setSubField = (field: "title" | "helpText", value: string) => {
    const path: (string | number)[] = [
      "modules",
      modName,
      "subModules",
      subName,
      field,
    ];

    // 先更新本地展示，保证失焦后立刻可见
    if (field === "title") setTitleDisplay(value);
    else setHelpDisplay(value);

    // 优先用 setFields（对嵌套 Form.List 更稳定）
    try {
      form.setFields([{ name: path as any, value }]);
      return;
    } catch {
      // fallthrough
    }

    // 兼容：antd v5+ setFieldValue
    const anyForm = form as unknown as {
      setFieldValue?: (name: (string | number)[], val: unknown) => void;
    };
    if (typeof anyForm.setFieldValue === "function") {
      anyForm.setFieldValue(path, value);
      return;
    }

    // 最后兜底：整段 modules 更新
    const modules =
      (form.getFieldValue("modules") as DeclarationFormValues["modules"]) ?? [];
    const nextModules = modules.map((m, mi) => {
      if (mi !== modName) return m;
      const nextSubs = (m.subModules ?? []).map((sm, si) => {
        if (si !== subName) return sm;
        return { ...sm, [field]: value };
      });
      return { ...m, subModules: nextSubs };
    });
    form.setFieldsValue({ modules: nextModules });
  };

  const reindexSectionOrders = () => {
    const modules =
      (form.getFieldValue("modules") as DeclarationFormValues["modules"]) ?? [];
    const mod = modules?.[modName];
    const sub = mod?.subModules?.[subName];
    const secs = (sub?.sections ?? []).map((s, idx) => ({ ...s, order: idx }));
    const nextModules = modules.map((m, mi) => {
      if (mi !== modName) return m;
      const nextSubs = (m.subModules ?? []).map((sm, si) => {
        if (si !== subName) return sm;
        return { ...sm, sections: secs };
      });
      return { ...m, subModules: nextSubs };
});
    form.setFieldsValue({ modules: nextModules });
  };

  useEffect(() => {
    listSurveyTemplates().then((t) => {
      setTemplateOptions(t.map((x) => ({ value: x.id, label: x.name })));
      const map: Record<number, SurveyTemplate> = {};
      t.forEach((x) => { map[x.id] = x; });
      setTemplateOptionsMap(map);
    });
  }, []);

  return (
    <Card
      size="small"
      className="declCfgVisualSubCard declCfgVisualSubCardPreview"
      bordered={false}
      title={
        <div className="declCfgVisualSubHeaderTitle">
          {!titleEditing ? (
            <Space size={6} wrap>
              <span className="declCfgVisualSubHeaderTitleMain">
                {titleDisplay?.trim() ? titleDisplay : "未命名子模块"}
              </span>
              <Button
                type="text"
                size="small"
                icon={<EditOutlined />}
                onClick={(e) => {
                  e.stopPropagation();
                  setTitleEditing(true);
                  setHelpEditing(false);
                  setTitleDraft(readSubField("title"));
                }}
                aria-label="编辑子模块标题"
              />
            </Space>
          ) : (
            <Input
              size="small"
              value={titleDraft}
              onChange={(e) => setTitleDraft(e.target.value)}
              onPressEnter={() => {
                setSubField("title", titleDraft);
                setTitleEditing(false);
              }}
              onBlur={() => {
                setSubField("title", titleDraft);
                setTitleEditing(false);
              }}
              style={{ width: 260 }}
              placeholder="子模块标题"
              maxLength={200}
              onKeyDown={(e) => e.stopPropagation()}
            />
          )}

          {!helpEditing ? (
            <Space size={6} wrap>
              <span
                className="declCfgVisualSubHeaderHelp"
                title={helpDisplay}
                onClick={(e) => {
                  e.stopPropagation();
                  setHelpEditing(true);
                  setTitleEditing(false);
                  setHelpDraft(readSubField("helpText"));
                }}
              >
                {helpDisplay?.trim() ? helpDisplay : "（无说明）"}
              </span>
              <Button
                type="text"
                size="small"
                icon={<EditOutlined />}
                onClick={(e) => {
                  e.stopPropagation();
                  setHelpEditing(true);
                  setTitleEditing(false);
                  setHelpDraft(readSubField("helpText"));
                }}
                aria-label="编辑子模块说明"
              />
            </Space>
          ) : (
            <Input.TextArea
              size="small"
              value={helpDraft}
              onChange={(e) => setHelpDraft(e.target.value)}
              rows={1}
              autoSize={{ minRows: 1, maxRows: 2 }}
              onPressEnter={(e) => {
                e.preventDefault();
                setSubField("helpText", helpDraft);
                setHelpEditing(false);
              }}
              onBlur={() => {
                setSubField("helpText", helpDraft);
                setHelpEditing(false);
              }}
              className="declCfgVisualHelpInline"
              placeholder="说明（选填）"
              onKeyDown={(e) => e.stopPropagation()}
            />
          )}
        </div>
      }
      extra={
        <Space size={6} wrap>
          <Button
            type="text"
            danger
            size="small"
            icon={<MinusCircleOutlined />}
            onClick={onRemove}
            aria-label="删除子模块"
          />
        </Space>
      }
    >
      <Form.Item name={[subName, "key"]} hidden>
        <Input />
      </Form.Item>
      {/* <Typography.Text type="secondary" className="declCfgVisualSubTitle">
        内容块（可重复）
      </Typography.Text> */}
      <Form.List name={[subName, "sections"]}>
        {(secFields, { add: addSec, remove: removeSec, move: moveSec }) => (
          <>
            {secFields.map((sf, idx) => (
              <Card
                key={sf.key}
                size="small"
                className="declCfgVisualSubCard declCfgVisualSectionCard"
              >
                <div className="declCfgVisualSubHead">
                  <Form.Item name={[sf.name, "key"]} hidden>
                    <Input />
                  </Form.Item>
                  <Form.Item name={[sf.name, "order"]} hidden>
                    <InputNumber />
                  </Form.Item>
                  <Space wrap align="start">
                    <Form.Item label="块标题（选填）" name={[sf.name, "title"]}>
                      <Input
                        placeholder="如：基本情况、获奖明细"
                        className="declCfgVisualSectionTitleInput"
                      />
                    </Form.Item>
                    <Form.Item
                      label="块类型"
                      name={[sf.name, "kind"]}
                      rules={[{ required: true, message: "请选择块类型" }]}
                    >
                      <Select style={{ width: 160 }} options={[...SECTION_KIND_OPTIONS]} />
                    </Form.Item>
                    <FormRefTemplateSelectorInline
                      form={form}
                      modName={modName}
                      subName={subName}
                      secName={sf.name}
                      templateOptions={templateOptions}
                      templateOptionsMap={templateOptionsMap}
                    />
                  </Space>
                  <div className="declCfgVisualSectionActions">
                    <Button
                      size="small"
                      disabled={idx <= 0}
                      onClick={() => {
                        moveSec(sf.name, sf.name - 1);
                        setTimeout(reindexSectionOrders, 0);
                      }}
                    >
                      上移
                    </Button>
                    <Button
                      size="small"
                      disabled={idx >= secFields.length - 1}
                      onClick={() => {
                        moveSec(sf.name, sf.name + 1);
                        setTimeout(reindexSectionOrders, 0);
                      }}
                    >
                      下移
                    </Button>
                    <Button
                      type="link"
                      danger
                      size="small"
                      onClick={() => {
                        removeSec(sf.name);
                        setTimeout(reindexSectionOrders, 0);
                      }}
                      icon={<MinusCircleOutlined />}
                    >
                      删除块
                    </Button>
                  </div>
                </div>

                <SectionBody
                  form={form}
                  modName={modName}
                  subName={subName}
                  secName={sf.name}
                />
              </Card>
            ))}

            <Space wrap>
              <Button
                type="dashed"
                icon={<PlusOutlined />}
                onClick={() => (
                  addSec({
                    key: `sec_${Date.now()}`,
                    title: "",
                    kind: "map",
                    order: secFields.length,
                    sentenceTemplate: "",
                    fields: [],
                    attachments: [],
                    maxRows: 10,
                    toolbar: newDefaultToolbar(),
                    columns: [],
                    formSchemaJson: "",
                    formFieldsJson: "",
                  }),
                  setTimeout(reindexSectionOrders, 0)
                )}
              >
                添加表单块
              </Button>
              <Button
                type="dashed"
                icon={<PlusOutlined />}
                onClick={() => (
                  addSec({
                    key: `sec_${Date.now()}`,
                    title: "",
                    kind: "list",
                    order: secFields.length,
                    sentenceTemplate: "",
                    fields: [],
                    attachments: [],
                    maxRows: 10,
                    toolbar: newDefaultToolbar(),
                    columns: [],
                    formSchemaJson: "",
                    formFieldsJson: "",
                  }),
                  setTimeout(reindexSectionOrders, 0)
                )}
              >
                添加列表块
              </Button>
              <Button
                type="dashed"
                icon={<PlusOutlined />}
                onClick={() => (
                  addSec({
                    key: `sec_${Date.now()}`,
                    title: "",
                    kind: "form_ref",
                    order: secFields.length,
                    sentenceTemplate: "",
                    fields: [],
                    attachments: [],
                    maxRows: 10,
                    toolbar: newDefaultToolbar(),
                    columns: [],
                    templateId: null,
                    templateVersion: null,
                    formSchemaJson: "",
                    formFieldsJson: "",
                  }),
                  setTimeout(reindexSectionOrders, 0)
                )}
              >
                添加问卷模板块
              </Button>
            </Space>
          </>
        )}
      </Form.List>
    </Card>
  );
}

function SectionBody({
  form,
  modName,
  subName,
  secName,
}: {
  form: FormInstance<DeclarationFormValues>;
  modName: number;
  subName: number;
  secName: number;
}) {
  const kind = Form.useWatch(
    ["modules", modName, "subModules", subName, "sections", secName, "kind"],
    form,
  );
  const templateIdWatch = Form.useWatch(
    ["modules", modName, "subModules", subName, "sections", secName, "templateId"],
    form,
  ) as number | null | undefined;
  const templateVersionWatch = Form.useWatch(
    ["modules", modName, "subModules", subName, "sections", secName, "templateVersion"],
    form,
  ) as number | null | undefined;

  const [surveySchema, setSurveySchema] = useState<Record<string, unknown> | null>(null);
  const [surveyFields, setSurveyFields] = useState<Record<string, unknown> | null>(null);
  const [surveyLoading, setSurveyLoading] = useState(false);
  const [surveyError, setSurveyError] = useState<string | null>(null);

  useEffect(() => {
    if (templateIdWatch == null) {
      setSurveySchema(null);
      setSurveyFields(null);
      return;
    }
    setSurveyLoading(true);
    setSurveyError(null);
    const ver = templateVersionWatch && templateVersionWatch > 0 ? templateVersionWatch : 1;
    getPublicVersion(templateIdWatch, ver)
      .then((v) => {
        setSurveySchema(v.schema as Record<string, unknown>);
        setSurveyFields(v.fields as Record<string, unknown>);
      })
      .catch(() => setSurveyError("问卷加载失败"))
      .finally(() => setSurveyLoading(false));
  }, [templateIdWatch, templateVersionWatch]);

  const isList = kind === "list";
  const isMap = kind === "map";

  if (kind === "form_ref") {
    if (templateIdWatch == null) {
      return (
        <Typography.Text type="secondary" style={{ fontSize: 13 }}>
          请先在「块类型」后选择问卷模板
        </Typography.Text>
      );
    }
    if (surveyLoading) {
      return (
        <div style={{ textAlign: "center", padding: 16 }}>
          <Spin size="small" tip="加载问卷中…" />
        </div>
      );
    }
    if (surveyError || !surveySchema) {
      return (
        <Typography.Text type="danger" style={{ fontSize: 13 }}>
          {surveyError ?? "问卷不存在"}
        </Typography.Text>
      );
    }
    return (
      <SurveyPreview
        schemaJson={JSON.stringify(surveySchema)}
        fieldsJson={JSON.stringify(surveyFields)}
        readOnly
        showIndex={false}
        templateId={templateIdWatch}
        version={templateVersionWatch ?? 1}
      />
    );
  }

  if (isMap) {
    return (
      <>
        <Form.Item
          label="句式模板（选填）"
          name={[secName, "sentenceTemplate"]}
        >
          <Input.TextArea rows={2} placeholder="可用占位符引用字段名，选填" />
        </Form.Item>
        <Typography.Text type="secondary" className="declCfgVisualSubTitle">
          表单字段
        </Typography.Text>
        <Form.List name={[secName, "fields"]}>
          {(fields, { add, remove }) => (
            <div className="declCfgVisualBlock">
              <div className="declCfgVisualGridHeader declCfgVisualFieldGrid">
                <span>显示名称</span>
                <span>控件类型</span>
                <span>必填</span>
                <span className="declCfgVisualColAct">操作</span>
              </div>
              {fields.map((f) => (
                <div key={f.key}>
                  <Form.Item name={[f.name, "name"]} hidden>
                    <Input />
                  </Form.Item>
                  <div className="declCfgVisualFieldRow declCfgVisualFieldGrid">
                    <Form.Item name={[f.name, "label"]}>
                      <Input placeholder="教师看到的标签" />
                    </Form.Item>
                    <Form.Item name={[f.name, "widget"]}>
                      <Select
                        options={WIDGET_OPTIONS}
                        className="declCfgVisualSelectFull"
                      />
                    </Form.Item>
                    <Form.Item
                      name={[f.name, "required"]}
                      valuePropName="checked"
                    >
                      <Switch />
                    </Form.Item>
                    <div className="declCfgVisualColAct">
                      <Button
                        type="link"
                        danger
                        size="small"
                        onClick={() => remove(f.name)}
                      >
                        删除
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
              <Button
                type="dashed"
                block
                size="small"
                icon={<PlusOutlined />}
                className="declCfgVisualAddBtn"
                onClick={() =>
                  add({
                    name: `field_${Date.now()}`,
                    label: "",
                    widget: "input",
                    required: false,
                  })
                }
              >
                添加字段
              </Button>
            </div>
          )}
        </Form.List>

        <Typography.Text type="secondary" className="declCfgVisualSubTitle">
          附件要求
        </Typography.Text>
        <Form.List name={[secName, "attachments"]}>
          {(fields, { add, remove }) => (
            <div className="declCfgVisualBlock declCfgVisualAttachWrap">
              <div className="declCfgVisualGridHeader declCfgVisualAttachGrid">
                <span>说明</span>
                <span>允许类型</span>
                <span>最大字节</span>
                <span>模板 URL</span>
                <span>必填</span>
                <span className="declCfgVisualColAct">操作</span>
              </div>
              {fields.map((f) => (
                <div key={f.key}>
                  <Form.Item name={[f.name, "key"]} hidden>
                    <Input />
                  </Form.Item>
                  <div className="declCfgVisualAttachRow declCfgVisualAttachGrid">
                    <Form.Item name={[f.name, "label"]}>
                      <Input placeholder="说明文案" />
                    </Form.Item>
                    <Form.Item name={[f.name, "accept"]}>
                      <Input placeholder=".pdf" />
                    </Form.Item>
                    <Form.Item name={[f.name, "maxSize"]}>
                      <InputNumber
                        min={0}
                        placeholder="如 2097152"
                        className="declCfgVisualNumFull"
                      />
                    </Form.Item>
                    <Form.Item name={[f.name, "templateUrl"]}>
                      <Input placeholder="选填" />
                    </Form.Item>
                    <Form.Item
                      name={[f.name, "required"]}
                      valuePropName="checked"
                    >
                      <Switch checkedChildren="必填" unCheckedChildren="选填" />
                    </Form.Item>
                    <div className="declCfgVisualColAct">
                      <Button
                        type="link"
                        danger
                        size="small"
                        onClick={() => remove(f.name)}
                      >
                        删除
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
              <Button
                type="dashed"
                block
                size="small"
                icon={<PlusOutlined />}
                className="declCfgVisualAddBtn"
                onClick={() =>
                  add({
                    key: `file_${Date.now()}`,
                    label: "",
                    required: false,
                    accept: ".pdf",
                    maxSize: null,
                    templateUrl: "",
                  })
                }
              >
                添加附件项
              </Button>
            </div>
          )}
        </Form.List>
      </>
    );
  }

  if (!isList) return null;

  return (
    <>
      <Space wrap className="declCfgVisualRow">
        <Form.Item label="最大行数" name={[secName, "maxRows"]}>
          <InputNumber min={1} max={500} placeholder="10" />
        </Form.Item>
      </Space>
      <Typography.Text type="secondary">工具栏</Typography.Text>
      <Space wrap className="declCfgVisualToolbar">
        <Form.Item
          name={[secName, "toolbar", "add"]}
          valuePropName="checked"
          label="添加"
        >
          <Switch />
        </Form.Item>
        <Form.Item
          name={[secName, "toolbar", "edit"]}
          valuePropName="checked"
          label="编辑"
        >
          <Switch />
        </Form.Item>
        <Form.Item
          name={[secName, "toolbar", "remove"]}
          valuePropName="checked"
          label="删除"
        >
          <Switch />
        </Form.Item>
        <Form.Item
          name={[secName, "toolbar", "sort"]}
          valuePropName="checked"
          label="排序"
        >
          <Switch />
        </Form.Item>
      </Space>
      <Typography.Text type="secondary" className="declCfgVisualSubTitle">
        列定义
      </Typography.Text>
      <Form.List name={[secName, "columns"]}>
        {(fields, { add, remove }) => (
          <div className="declCfgVisualBlock">
            <div className="declCfgVisualGridHeader declCfgVisualColumnGrid">
              <span>列标题</span>
              <span>类型</span>
              <span>列宽(px)</span>
              <span className="declCfgVisualColAct">操作</span>
            </div>
            {fields.map((f) => (
              <div key={f.key}>
                <Form.Item name={[f.name, "name"]} hidden>
                  <Input />
                </Form.Item>
                <div className="declCfgVisualColumnRow declCfgVisualColumnGrid">
                  <Form.Item name={[f.name, "title"]}>
                    <Input placeholder="表头文字" />
                  </Form.Item>
                  <Form.Item name={[f.name, "cellType"]}>
                    <Select
                      options={CELL_TYPES}
                      className="declCfgVisualSelectFull"
                    />
                  </Form.Item>
                  <Form.Item name={[f.name, "width"]}>
                    <InputNumber
                      min={0}
                      placeholder="可选"
                      className="declCfgVisualNumFull"
                    />
                  </Form.Item>
                  <div className="declCfgVisualColAct">
                    <Button
                      type="link"
                      danger
                      size="small"
                      onClick={() => remove(f.name)}
                    >
                      删除
                    </Button>
                  </div>
                </div>
              </div>
            ))}
            <Button
              type="dashed"
              block
              size="small"
              icon={<PlusOutlined />}
              className="declCfgVisualAddBtn"
              onClick={() =>
                add({
                  name: `col_${Date.now()}`,
                  title: "",
                  cellType: "text",
                  width: null,
                })
              }
            >
              添加列
            </Button>
          </div>
        )}
      </Form.List>
    </>
  );
}
