export type Expr =
  | { op: "and"; items: Expr[] }
  | { op: "or"; items: Expr[] }
  | { op: "not"; item: Expr }
  | { op: "eq" | "ne"; left: ValueRef; right: unknown }
  | { op: "in"; left: ValueRef; right: unknown[] };

export type ValueRef = { var: string };

export type FieldType =
  | "input"
  | "textarea"
  | "number"
  | "select"
  | "radio"
  | "checkbox"
  | "date"
  | "time"
  | "datetime"
  | "switch"
  | "slider"
  | "rating"
  | "attachment"
  | "image"
  | "phone"
  | "email"
  | "cascader"
  | "treeSelect"
  | "list";

export type FieldRule = {
  required?: boolean;
  showWhen?: Expr;
  requiredWhen?: Expr;
};

export type FieldDef = {
  name: string;
  label: string;
  /** 题目的补充说明/提示文字 */
  description?: string;
  type: FieldType;
  rules?: FieldRule;
  options?: { label: string; value: string }[];
  attachment?: {
    accept?: string;
    maxSize?: number;
    maxCount?: number;
    templateUrl?: string;
  };
  slider?: { min?: number; max?: number; step?: number };
  count?: number;
  list?: {
    /** 每行显示哪些子字段类型，默认 ['input'] */
    fieldTypes?: FieldType[];
    /** 最大行数 */
    maxRows?: number;
  };
};

export type FormNodeBase = {
  id: string;
  kind: string;
};

export type FormNode =
  | (FormNodeBase & { kind: "Row"; children: FormNode[] })
  | (FormNodeBase & { kind: "Col"; span?: number; children: FormNode[] })
  | (FormNodeBase & { kind: "Group"; title?: string; children: FormNode[] })
  | (FormNodeBase & { kind: "Text"; text: string })
  | (FormNodeBase & { kind: "Divider" })
  | (FormNodeBase & {
      kind: "Repeater";
      name: string;
      min?: number;
      max?: number;
      itemSchema: FormNode;
    })
  | (FormNodeBase & {
      kind: "Field";
      name: string;
      /** 问卷题型：radio|checkbox|input|textarea|select|date|switch|rating */
      fieldType?: string;
      /** 题目标题 */
      title?: string;
    });

export type FormSectionConfig = {
  schema: FormNode;
  fields: Record<string, FieldDef>;
};

