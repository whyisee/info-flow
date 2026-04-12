import { useEffect, useMemo, useRef, useState } from "react";
import {
  Button,
  Card,
  Form,
  Input,
  InputNumber,
  Select,
  Space,
  Switch,
  Tabs,
  Typography,
} from "antd";
import type { FormInstance } from "antd/es/form";
import { EditOutlined, MinusCircleOutlined, PlusOutlined } from "@ant-design/icons";
import type { DeclarationFormValues } from "./declarationConfigTransforms";
import { newDefaultToolbar } from "./declarationConfigTransforms";
import "./DeclarationConfigVisualEditor.css";

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
    const modules = form.getFieldValue("modules") as DeclarationFormValues["modules"] | undefined;
    const idx = Number(fieldName);
    const t = modules?.[idx]?.title;
    setDraft(typeof t === "string" ? t : "");
  }, [editing, fieldName, form]);

  const commitTitle = () => {
    const modules = (form.getFieldValue("modules") as DeclarationFormValues["modules"]) ?? [];
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
    return list.map((m, i) => (typeof m?.key === "string" && m.key ? m.key : `__idx_${i}`));
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
                    typeof mod?.key === "string" && mod.key.length > 0 ? mod.key : `__idx_${mf.name}`;
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

                        <Typography.Text type="secondary" className="declCfgVisualSubTitle">
                          子模块
                        </Typography.Text>
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
                                    type: "map",
                                    order: subFields.length,
                                    helpText: "",
                                    sentenceTemplate: "",
                                    fields: [],
                                    attachments: [],
                                    maxRows: 10,
                                    toolbar: newDefaultToolbar(),
                                    columns: [],
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
  const type = Form.useWatch(
    ["modules", modName, "subModules", subName, "type"],
    form,
  );

  return (
    <Card size="small" className="declCfgVisualSubCard">
      <div className="declCfgVisualSubHead">
        <Space wrap align="start">
          <Form.Item
            label="子模块标题"
            name={[subName, "title"]}
            rules={[{ required: true, message: "填写标题" }]}
          >
            <Input placeholder="如：概述、获得荣誉" />
          </Form.Item>
          <Form.Item name={[subName, "key"]} hidden>
            <Input />
          </Form.Item>
          <Form.Item label="类型" name={[subName, "type"]} rules={[{ required: true }]}>
            <Select
              style={{ width: 120 }}
              options={[
                { value: "map", label: "表单汇总 (map)" },
                { value: "list", label: "列表 (list)" },
              ]}
            />
          </Form.Item>
        </Space>
        <Button type="link" danger size="small" onClick={onRemove} icon={<MinusCircleOutlined />}>
          删除
        </Button>
      </div>
      <Form.Item label="顶部说明" name={[subName, "helpText"]}>
        <Input.TextArea rows={2} placeholder="选填，显示在子模块上方" />
      </Form.Item>

      {type === "map" && (
        <>
          <Form.Item label="句式模板（选填）" name={[subName, "sentenceTemplate"]}>
            <Input.TextArea rows={2} placeholder="可用占位符引用字段名，选填" />
          </Form.Item>
          <Typography.Text type="secondary" className="declCfgVisualSubTitle">
            表单字段
          </Typography.Text>
          <Form.List name={[subName, "fields"]}>
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
                        <Select options={WIDGET_OPTIONS} className="declCfgVisualSelectFull" />
                      </Form.Item>
                      <Form.Item name={[f.name, "required"]} valuePropName="checked">
                        <Switch />
                      </Form.Item>
                      <div className="declCfgVisualColAct">
                        <Button type="link" danger size="small" onClick={() => remove(f.name)}>
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
          <Form.List name={[subName, "attachments"]}>
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
                        <InputNumber min={0} placeholder="如 2097152" className="declCfgVisualNumFull" />
                      </Form.Item>
                      <Form.Item name={[f.name, "templateUrl"]}>
                        <Input placeholder="选填" />
                      </Form.Item>
                      <Form.Item name={[f.name, "required"]} valuePropName="checked">
                        <Switch checkedChildren="必填" unCheckedChildren="选填" />
                      </Form.Item>
                      <div className="declCfgVisualColAct">
                        <Button type="link" danger size="small" onClick={() => remove(f.name)}>
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
      )}

      {type === "list" && (
        <>
          <Space wrap className="declCfgVisualRow">
            <Form.Item label="最大行数" name={[subName, "maxRows"]}>
              <InputNumber min={1} max={500} placeholder="10" />
            </Form.Item>
          </Space>
          <Typography.Text type="secondary">工具栏</Typography.Text>
          <Space wrap className="declCfgVisualToolbar">
            <Form.Item name={[subName, "toolbar", "add"]} valuePropName="checked" label="添加">
              <Switch />
            </Form.Item>
            <Form.Item name={[subName, "toolbar", "edit"]} valuePropName="checked" label="编辑">
              <Switch />
            </Form.Item>
            <Form.Item name={[subName, "toolbar", "remove"]} valuePropName="checked" label="删除">
              <Switch />
            </Form.Item>
            <Form.Item name={[subName, "toolbar", "sort"]} valuePropName="checked" label="排序">
              <Switch />
            </Form.Item>
          </Space>
          <Typography.Text type="secondary" className="declCfgVisualSubTitle">
            列定义
          </Typography.Text>
          <Form.List name={[subName, "columns"]}>
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
                        <Select options={CELL_TYPES} className="declCfgVisualSelectFull" />
                      </Form.Item>
                      <Form.Item name={[f.name, "width"]}>
                        <InputNumber min={0} placeholder="可选" className="declCfgVisualNumFull" />
                      </Form.Item>
                      <div className="declCfgVisualColAct">
                        <Button type="link" danger size="small" onClick={() => remove(f.name)}>
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
      )}
    </Card>
  );
}
