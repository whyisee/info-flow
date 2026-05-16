"""首次启动时写入 profile_field_catalog 种子（表为空时执行）。"""

from __future__ import annotations

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.module_codes import (
    DECLARATION_BASIC,
    DECLARATION_CONTACT,
    DECLARATION_SUPERVISOR,
    DECLARATION_TASK,
)
from app.models.profile_field_catalog import ProfileFieldCatalog


def _row(
    field_key: str,
    module_code: str,
    data_type: str,
    default_label: str,
    sort_order: int,
    *,
    dict_type_code: str | None = None,
    validation_json: dict | None = None,
    storage_hint: str | None = None,
    help_text: str | None = None,
) -> dict:
    return {
        "field_key": field_key,
        "module_code": module_code,
        "data_type": data_type,
        "default_label": default_label,
        "placeholder": None,
        "help_text": help_text,
        "dict_type_code": dict_type_code,
        "validation_json": validation_json or {"required_default": False},
        "sort_order": sort_order,
        "enabled": True,
        "storage_hint": storage_hint,
    }


def seed_rows() -> list[dict]:
    """与前端历史 profileModuleFields 键集合对齐（不含 form_status）。"""
    rows: list[dict] = []
    o = 0

    def add(**kwargs) -> None:
        nonlocal o
        o += 10
        kwargs["sort_order"] = kwargs.get("sort_order", o)
        rows.append(_row(**kwargs))

    # declaration_basic
    for fk, dt, lab in [
        ("recommend_school", "text", "推荐学校"),
        ("full_name", "text", "姓名"),
        ("project_name", "text", "项目名称"),
        ("gender", "select", "性别"),
        ("nationality", "select", "国籍地区"),
        ("birth_date", "date", "出生年月"),
        ("id_type_display", "select", "证件类型"),
        ("id_number", "text", "证件号码"),
        ("ethnicity", "select", "民族"),
        ("political_status", "select", "政治面貌"),
        ("id_pdf", "upload", "身份证件 PDF"),
        ("birth_proof_pdf", "upload", "出生证明 PDF"),
        ("highest_edu_country", "text", "最高学历国别/地区"),
        ("highest_edu_school", "text", "最高学历毕业院校"),
        ("highest_edu_level", "select", "最高学历层次"),
        ("highest_edu_proof_pdf", "upload", "最高学历证明 PDF"),
        ("highest_degree_country", "text", "最高学位国别/地区"),
        ("highest_degree_school", "text", "最高学位授予院校"),
        ("highest_degree_level", "select", "最高学位"),
        ("highest_degree_proof_pdf", "upload", "最高学位证明 PDF"),
        ("work_region", "text", "工作地区"),
        ("work_province", "text", "工作省份"),
        ("work_unit_detail", "text", "工作单位（详细）"),
        ("unit_attr_display", "select", "单位性质"),
        ("unit_level_display", "select", "单位层级"),
        ("work_unit_city", "text", "工作单位所在市(地)"),
        ("supervising_dept_city", "text", "中省直主管部门/市(地)"),
        ("industry_division", "select", "行业划分"),
        ("job_engaged", "text", "从事工作"),
        ("title_series_skill", "select", "职称系列/技能类型"),
        ("title_level_skill_rank", "select", "职称层级/技能等级"),
        ("tech_title", "text", "职称专业/技能名称"),
        ("admin_title", "text", "行政职务"),
        ("office_level", "select", "行政级别"),
        ("id_photo", "image", "电子照片"),
        ("mobile", "text", "手机号码"),
    ]:
        add(
            field_key=fk,
            module_code=DECLARATION_BASIC,
            data_type=dt,
            default_label=lab,
        )

    # declaration_task
    for fk, dt, lab in [
        ("task_pos1_a", "text", "岗位任务 A1"),
        ("task_pos1_b", "text", "岗位任务 B1"),
        ("task_pos2_a", "text", "岗位任务 A2"),
        ("task_pos2_b", "text", "岗位任务 B2"),
        ("subject_a1", "text", "学科/领域 A1"),
        ("subject_a2", "text", "学科/领域 A2"),
        ("subject_a3", "text", "学科/领域 A3"),
        ("subject_b1", "text", "学科/领域 B1"),
        ("subject_b2", "text", "学科/领域 B2"),
        ("subject_b3", "text", "学科/领域 B3"),
        ("task_desc", "textarea", "岗位任务描述"),
        ("kw_cat", "text", "关键词分类"),
        ("kw1", "text", "关键词1"),
        ("kw2", "text", "关键词2"),
        ("kw3", "text", "关键词3"),
        ("research_major", "text", "研究方向（主）"),
        ("research_sub", "text", "研究方向（副）"),
    ]:
        add(
            field_key=fk,
            module_code=DECLARATION_TASK,
            data_type=dt,
            default_label=lab,
        )

    # declaration_contact（mobile 仅在 basic 保留一份）
    for fk, dt, lab in [
        ("phone_home", "text", "家庭电话"),
        ("phone_office", "text", "办公电话"),
        ("fax", "text", "传真"),
        ("email", "text", "电子邮箱"),
        ("address", "textarea", "通讯地址"),
        ("postal_code", "text", "邮政编码"),
    ]:
        add(
            field_key=fk,
            module_code=DECLARATION_CONTACT,
            data_type=dt,
            default_label=lab,
        )

    for i in range(1, 4):
        add(
            field_key=f"master_sup_{i}",
            module_code=DECLARATION_SUPERVISOR,
            data_type="text",
            default_label=f"硕士导师{i}",
        )
        add(
            field_key=f"phd_sup_{i}",
            module_code=DECLARATION_SUPERVISOR,
            data_type="text",
            default_label=f"博士导师{i}",
        )
        add(
            field_key=f"postdoc_sup_{i}",
            module_code=DECLARATION_SUPERVISOR,
            data_type="text",
            default_label=f"博士后合作导师{i}",
        )
        add(
            field_key=f"family_rel_{i}",
            module_code=DECLARATION_SUPERVISOR,
            data_type="text",
            default_label=f"亲属关系{i}",
        )
        add(
            field_key=f"recuse_exp_{i}",
            module_code=DECLARATION_SUPERVISOR,
            data_type="textarea",
            default_label=f"回避说明{i}",
        )

    return rows


def seed_profile_field_catalog_if_empty(db: Session) -> None:
    n = db.execute(select(func.count()).select_from(ProfileFieldCatalog)).scalar_one()
    if int(n or 0) > 0:
        return
    for d in seed_rows():
        db.add(ProfileFieldCatalog(**d))
    db.commit()
