import { useCallback, useEffect, useMemo, useState } from "react";
import { Card, Form, Spin } from "antd";
import { listMyModuleConfigs } from "../../services/moduleConfig";
import { listDictItems } from "../../services/dataDict";
import {
  listEnabledProfileFieldCatalog,
  type ProfileFieldCatalogRow,
} from "../../services/profileFieldCatalog";
import DynamicProfileSections from "../declaration/profile/DynamicProfileSections";
import { applyCatalogNormalize } from "../declaration/profile/profileCatalogSerialize";
import {
  PROFILE_MODULE,
  mergeModulesIntoFormValues,
  normalizeLoadedProfile,
  stripFormStatusFromValues,
} from "../declaration/profile/profileModuleFields";
import "../declaration/profile/ProfileBasicConfig.css";
import "../../features/declaration-config-render/DeclarationConfigRenderer.css";
import "./MaterialBasicInfoFromProfile.css";

const PROFILE_LOAD_MODULES = [
  PROFILE_MODULE.BASIC,
  PROFILE_MODULE.TASK,
  PROFILE_MODULE.CONTACT,
  PROFILE_MODULE.SUPERVISOR,
] as const;

interface Props {
  onFieldsLoaded?: (values: Record<string, unknown>) => void;
  profileBinding?: Record<string, unknown> | null;
  framed?: boolean;
}

type ProfileBindingField = {
  field_key: string;
  required_in_project: boolean;
  visible_label: string;
  group: string;
};

type ProfileTableCell = {
  field_key: string;
  label: string;
  label_span: number;
  value_span: number;
  col_span: number;
};

type ProfileTableLayout = {
  columns: number;
  rows: { cells: ProfileTableCell[] }[];
};

function parseProfileBindingFields(raw: unknown): ProfileBindingField[] {
  if (!raw || typeof raw !== "object") return [];
  const fields = (raw as Record<string, unknown>).fields;
  if (!Array.isArray(fields)) return [];
  return fields.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const o = item as Record<string, unknown>;
    const fieldKey = typeof o.field_key === "string" ? o.field_key : "";
    if (!fieldKey) return [];
    return [
      {
        field_key: fieldKey,
        required_in_project: o.required_in_project === true,
        visible_label: typeof o.visible_label === "string" ? o.visible_label : "",
        group: typeof o.group === "string" ? o.group : "",
      },
    ];
  });
}

function applyProjectProfileBinding(
  catalog: ProfileFieldCatalogRow[],
  binding: Record<string, unknown> | null | undefined,
): ProfileFieldCatalogRow[] {
  const fields = parseProfileBindingFields(binding);
  if (fields.length === 0) return catalog;
  const byKey = new Map(catalog.map((row) => [row.field_key, row]));
  return fields.flatMap((field, index) => {
    const row = byKey.get(field.field_key);
    if (!row) return [];
    const validation_json = {
      ...(row.validation_json ?? {}),
      required_default: field.required_in_project,
    };
    return [
      {
        ...row,
        default_label: field.visible_label.trim() || row.default_label,
        help_text: field.group.trim() ? field.group.trim() : row.help_text,
        validation_json,
        sort_order: index,
      },
    ];
  });
}

function parseProfileTableLayout(raw: unknown): ProfileTableLayout | null {
  if (!raw || typeof raw !== "object") return null;
  const binding = raw as Record<string, unknown>;
  const table = binding.table_layout ?? binding.tableLayout;
  if (!table || typeof table !== "object" || Array.isArray(table)) return null;
  const tableObj = table as Record<string, unknown>;
  const rowsRaw = Array.isArray(tableObj.rows) ? tableObj.rows : [];
  const rows = rowsRaw.flatMap((row) => {
    if (!row || typeof row !== "object" || Array.isArray(row)) return [];
    const cellsRaw = (row as Record<string, unknown>).cells;
    if (!Array.isArray(cellsRaw)) return [];
    const cells = cellsRaw.flatMap((cell) => {
      if (!cell || typeof cell !== "object" || Array.isArray(cell)) return [];
      const o = cell as Record<string, unknown>;
      const fieldKey = typeof o.field_key === "string" ? o.field_key : "";
      if (!fieldKey) return [];
      const rawSpan = o.col_span ?? o.colSpan;
      const rawLabelSpan = o.label_span ?? o.labelSpan;
      const rawValueSpan = o.value_span ?? o.valueSpan;
      const colSpan = typeof rawSpan === "number" && rawSpan > 0 ? rawSpan : 3;
      const labelSpan =
        typeof rawLabelSpan === "number" && rawLabelSpan > 0 ? rawLabelSpan : 1;
      return [
        {
          field_key: fieldKey,
          label: typeof o.label === "string" ? o.label : "",
          label_span: labelSpan,
          value_span:
            typeof rawValueSpan === "number" && rawValueSpan > 0
              ? rawValueSpan
              : Math.max(1, colSpan - labelSpan),
          col_span: colSpan,
        },
      ];
    });
    return cells.length ? [{ cells }] : [];
  });
  if (rows.length === 0) return null;
  const columns = tableObj.columns;
  return {
    columns: typeof columns === "number" && columns > 0 ? columns : 12,
    rows,
  };
}

type DictLabelMapByField = Record<string, Record<string, string>>;

function formatProfileValue(
  value: unknown,
  dictLabels?: Record<string, string>,
): string {
  if (value == null || value === "") return "";
  if (Array.isArray(value)) {
    return value
      .map((item) => {
        if (item && typeof item === "object" && "name" in item) {
          return String((item as { name?: unknown }).name ?? "");
        }
        const raw = String(item ?? "");
        return dictLabels?.[raw] ?? raw;
      })
      .filter(Boolean)
      .join("、");
  }
  if (typeof value === "object") {
    if ("label" in value) return String((value as { label?: unknown }).label ?? "");
    if ("value" in value) {
      const raw = String((value as { value?: unknown }).value ?? "");
      return dictLabels?.[raw] ?? raw;
    }
    return "";
  }
  const raw = String(value);
  return dictLabels?.[raw] ?? raw;
}

function ProfileTablePreview({
  layout,
  values,
  catalog,
  dictLabelsByField,
}: {
  layout: ProfileTableLayout;
  values: Record<string, unknown>;
  catalog: ProfileFieldCatalogRow[];
  dictLabelsByField: DictLabelMapByField;
}) {
  const labelByKey = new Map(catalog.map((row) => [row.field_key, row.default_label]));
  return (
    <div
      className="materialProfileTable"
      style={{ gridTemplateColumns: `repeat(${layout.columns}, minmax(0, 1fr))` }}
    >
      {layout.rows.flatMap((row, rowIndex) =>
        row.cells.flatMap((cell, cellIndex) => {
          const labelSpan = cell.label_span || 1;
          const valueSpan =
            cell.value_span || Math.max(1, (cell.col_span || 3) - labelSpan);
          return [
            <div
              key={`${rowIndex}_${cellIndex}_label`}
              className="materialProfileTableLabel"
              style={{ gridColumn: `span ${Math.max(1, labelSpan)}` }}
            >
              {cell.label.trim() || labelByKey.get(cell.field_key) || cell.field_key}
            </div>,
            <div
              key={`${rowIndex}_${cellIndex}_value`}
              className="materialProfileTableValue"
              style={{ gridColumn: `span ${Math.max(1, valueSpan)}` }}
            >
              {formatProfileValue(values[cell.field_key], dictLabelsByField[cell.field_key])}
            </div>,
          ];
        }),
      )}
    </div>
  );
}

export default function MaterialBasicInfoFromProfile({
  onFieldsLoaded,
  profileBinding,
  framed = true,
}: Props) {
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(true);
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [hasConfig, setHasConfig] = useState(false);
  const [catalog, setCatalog] = useState<ProfileFieldCatalogRow[]>([]);
  const [profileValues, setProfileValues] = useState<Record<string, unknown>>({});
  const [dictLabelsByField, setDictLabelsByField] = useState<DictLabelMapByField>({});

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const rows = await listMyModuleConfigs();
      const basic = rows.find((r) => r.module === PROFILE_MODULE.BASIC);
      const basicCfg = basic?.config;
      if (!basicCfg || typeof basicCfg !== "object") {
        form.resetFields();
        setProfileValues({});
        setHasConfig(false);
        onFieldsLoaded?.({});
        return;
      }
      const merged = mergeModulesIntoFormValues(
        PROFILE_LOAD_MODULES.map((module) => {
          const row = rows.find((r) => r.module === module);
          const c = row?.config;
          return {
            module,
            config:
              c && typeof c === "object" ? (c as Record<string, unknown>) : {},
          };
        }),
      );
      const { rest } = stripFormStatusFromValues(merged);
      let normalized = normalizeLoadedProfile(rest);
      if (catalog.length) {
        normalized = applyCatalogNormalize(normalized, catalog);
      }
      if (Object.keys(normalized).length === 0) {
        form.resetFields();
        setProfileValues({});
        setHasConfig(false);
        onFieldsLoaded?.({});
        return;
      }
      form.setFieldsValue(normalized);
      setProfileValues(normalized);
      setHasConfig(true);
      onFieldsLoaded?.(normalized);
    } catch {
      form.resetFields();
      setProfileValues({});
      setHasConfig(false);
      onFieldsLoaded?.({});
    } finally {
      setLoading(false);
    }
  }, [catalog, form, onFieldsLoaded]);

  useEffect(() => {
    let cancelled = false;
    setCatalogLoading(true);
    listEnabledProfileFieldCatalog()
      .then((rows) => {
        if (!cancelled) setCatalog(rows);
      })
      .catch(() => {
        if (!cancelled) setCatalog([]);
      })
      .finally(() => {
        if (!cancelled) setCatalogLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!catalogLoading) void load();
  }, [catalogLoading, load]);

  const displayCatalog = useMemo(
    () => applyProjectProfileBinding(catalog, profileBinding),
    [catalog, profileBinding],
  );
  const tableLayout = parseProfileTableLayout(profileBinding);

  useEffect(() => {
    let cancelled = false;
    const dictFields = displayCatalog.filter((row) => row.dict_type_code);
    if (dictFields.length === 0) {
      setDictLabelsByField({});
      return () => {
        cancelled = true;
      };
    }

    (async () => {
      const pairs = await Promise.all(
        dictFields.map(async (row) => {
          try {
            const items = await listDictItems(row.dict_type_code as string, {
              include_disabled: true,
            });
            return [
              row.field_key,
              Object.fromEntries(items.map((item) => [String(item.value), item.label])),
            ] as const;
          } catch {
            return [row.field_key, {}] as const;
          }
        }),
      );
      if (!cancelled) setDictLabelsByField(Object.fromEntries(pairs));
    })();

    return () => {
      cancelled = true;
    };
  }, [displayCatalog]);

  const content = (
    <Spin spinning={loading || catalogLoading}>
      {hasConfig ? (
        <div className="profileBasicConfigMain">
          {tableLayout ? (
            <ProfileTablePreview
              layout={tableLayout}
              values={profileValues}
              catalog={displayCatalog}
              dictLabelsByField={dictLabelsByField}
            />
          ) : (
            <Form
              form={form}
              disabled
              layout="horizontal"
              labelAlign="right"
              colon={false}
              className="profileBasicForm"
              labelCol={{ flex: "0 0 160px" }}
              wrapperCol={{ flex: "1" }}
            >
              <DynamicProfileSections
                catalog={displayCatalog}
                editing={false}
                loading={catalogLoading}
              />
            </Form>
          )}
        </div>
      ) : null}
    </Spin>
  );

  return (
    <div className="materialBasicInfoFromProfile">
      {framed ? <Card size="small" className="declCfgRenderSubCard">{content}</Card> : content}
    </div>
  );
}
