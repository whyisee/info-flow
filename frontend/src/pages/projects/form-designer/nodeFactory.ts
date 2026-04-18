import type { FormNode } from "../../../features/form-designer/types";

export function uid(prefix: string) {
  return `${prefix}_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

function newField(name = "field", fieldType = "input", title = "") {
  return { id: uid("field"), kind: "Field", name, fieldType, title } as FormNode;
}

// 问卷题型
export const QUESTION_TYPES = [
  { fieldType: "radio", label: "单选题", title: "单选题" },
  { fieldType: "checkbox", label: "多选题", title: "多选题" },
  { fieldType: "input", label: "单行文本", title: "单行文本" },
  { fieldType: "textarea", label: "多行文本", title: "多行文本" },
  { fieldType: "select", label: "下拉选择", title: "下拉选择" },
  { fieldType: "date", label: "日期", title: "日期" },
  { fieldType: "switch", label: "是否", title: "是否" },
  { fieldType: "rating", label: "评分", title: "评分" },
] as const;

// 快速创建各题型
export const newRadio = () => newField(`q_${uid("")}`, "radio", "单选题");
export const newCheckbox = () => newField(`q_${uid("")}`, "checkbox", "多选题");
export const newTextInput = () => newField(`q_${uid("")}`, "input", "单行文本");
export const newTextArea = () => newField(`q_${uid("")}`, "textarea", "多行文本");
export const newSelect = () => newField(`q_${uid("")}`, "select", "下拉选择");
export const newDate = () => newField(`q_${uid("")}`, "date", "日期");
export const newSwitch = () => newField(`q_${uid("")}`, "switch", "是否");
export const newRating = () => newField(`q_${uid("")}`, "rating", "评分");

// 布局类（保留但简化）
export function newGroup(): FormNode {
  return { id: uid("group"), kind: "Group", title: "分组", children: [] };
}
export function newRow(): FormNode {
  return { id: uid("row"), kind: "Row", children: [] };
}
export function newCol(): FormNode {
  return { id: uid("col"), kind: "Col", span: 12, children: [] };
}
export function newText(): FormNode {
  return { id: uid("text"), kind: "Text", text: "说明文字" };
}
export function newDivider(): FormNode {
  return { id: uid("div"), kind: "Divider" };
}
export function newRepeater(): FormNode {
  return { id: uid("rep"), kind: "Repeater", name: "items", min: 1, max: 10, itemSchema: newGroup() };
}
