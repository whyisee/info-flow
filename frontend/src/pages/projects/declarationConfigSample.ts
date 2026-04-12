/** 与 doc/project-declaration-config-design.md 一致的空配置与示例骨架 */

export const EMPTY_DECLARATION_CONFIG: Record<string, unknown> = {
  modules: [],
};

/** 示例：立德树人模块 + map 子模块 + list 子模块（仅结构示意） */
export const SAMPLE_DECLARATION_CONFIG: Record<string, unknown> = {
  modules: [
    {
      key: "lide_shuren",
      title: "立德树人",
      order: 0,
      subModules: [
        {
          key: "overview",
          title: "概述",
          type: "map",
          order: 0,
          helpText: "请按说明上传材料。",
          fields: [
            {
              name: "summary_note",
              label: "简要说明",
              widget: "textarea",
              validation: { required: false },
            },
          ],
          sentenceTemplate: "",
          attachments: [
            {
              key: "main_pdf",
              label: "上传材料（PDF，不超过 2MB）",
              required: true,
              accept: ".pdf",
              maxSize: 2097152,
              templateUrl: "",
            },
          ],
        },
        {
          key: "honors",
          title: "获得荣誉",
          type: "list",
          order: 1,
          helpText: "不超过 10 项。",
          maxRows: 10,
          toolbar: { add: true, edit: true, remove: true, sort: true },
          columns: [
            { name: "year", title: "获得荣誉年度", cellType: "number", width: 120 },
            { name: "title", title: "荣誉称号", cellType: "text" },
            { name: "proof", title: "证明文件", cellType: "file" },
            { name: "sortOrder", title: "列表排序", cellType: "number", width: 100 },
          ],
        },
      ],
    },
  ],
};
