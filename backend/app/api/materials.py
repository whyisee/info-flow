import os
from datetime import datetime, timezone
from io import BytesIO
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import StreamingResponse
from sqlalchemy import select

from app.core.deps import CurrentUser, DbSession, get_active_role_code
from app.core.rbac_service import get_effective_legacy_role
from app.models.attachment import FileAttachment
from app.models.data_dict import DataDictItem, DataDictType
from app.models.material import ApplyMaterial
from app.models.project import ApplyProject
from app.models.project_declaration_config import ProjectDeclarationConfig
from app.models.user import User
from app.models.user_module_config import UserModuleConfig
from app.models.user_profile_version import UserProfileVersion
from app.config import get_settings
from app.schemas.material import MaterialCreate, MaterialOut, MaterialUpdate
from app.schemas.project import parse_project_flow
from app.services.approval_flow_display import build_flow_step_displays
from app.services.project_effective_approval_flow import get_effective_project_flow_dict
from app.services.profile_version_service import (
    PROFILE_VERSION_STATUS_PUBLISHED,
    ensure_initial_draft_version,
    get_profile_for_material,
    publish_draft_version,
)

router = APIRouter()

ActiveRoleCode = Annotated[str | None, Depends(get_active_role_code)]


def _snapshot_display(db, material: ApplyMaterial):
    flow = parse_project_flow(material.approval_snapshot)
    if not flow:
        return None
    return build_flow_step_displays(db, flow, applicant_user_id=material.user_id)


def _material_to_out(db, material: ApplyMaterial) -> MaterialOut:
    disp = _snapshot_display(db, material)
    base = MaterialOut.model_validate(material)
    return base.model_copy(update={"approval_snapshot_display": disp})


@router.get("/", response_model=list[MaterialOut])
def list_materials(
    db: DbSession,
    current_user: CurrentUser,
    active_role: ActiveRoleCode,
):
    query = select(ApplyMaterial)
    eff = get_effective_legacy_role(db, current_user, active_role)
    if eff == "teacher":
        query = query.where(ApplyMaterial.user_id == current_user.id)
    materials = db.execute(query).scalars().all()
    return [_material_to_out(db, m) for m in materials]


@router.post("/", response_model=MaterialOut, status_code=status.HTTP_201_CREATED)
def create_material(data: MaterialCreate, db: DbSession, current_user: CurrentUser):
    existing = db.execute(
        select(ApplyMaterial).where(
            ApplyMaterial.user_id == current_user.id,
            ApplyMaterial.project_id == data.project_id,
        )
    ).scalar_one_or_none()
    if existing:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="已存在该项目的申报材料")

    material = ApplyMaterial(user_id=current_user.id, **data.model_dump())
    db.add(material)
    db.commit()
    db.refresh(material)
    return _material_to_out(db, material)


@router.get("/{material_id}", response_model=MaterialOut)
def get_material(
    material_id: int,
    db: DbSession,
    current_user: CurrentUser,
    active_role: ActiveRoleCode,
):
    material = db.get(ApplyMaterial, material_id)
    if not material:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="材料不存在")
    eff = get_effective_legacy_role(db, current_user, active_role)
    if eff == "teacher" and material.user_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="无权限")
    return _material_to_out(db, material)


@router.get("/{material_id}/preview-pdf")
def preview_material_pdf(
    material_id: int,
    db: DbSession,
    current_user: CurrentUser,
    active_role: ActiveRoleCode,
):
    """
    生成「填报信息 PDF（个人信息 + 申报内容摘要）」并合并 PDF 附件，
    将申报材料中的 PDF 附件与个人档案中的证件/证明类 PDF 按顺序拼接到末尾，
    返回合并后的 PDF 供整体预览。
    """
    material = db.get(ApplyMaterial, material_id)
    if not material:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="材料不存在")
    eff = get_effective_legacy_role(db, current_user, active_role)
    if eff == "teacher" and material.user_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="无权限")

    rows = (
        db.execute(select(FileAttachment).where(FileAttachment.material_id == material_id))
        .scalars()
        .all()
    )
    pdfs = [
        r
        for r in rows
        if (r.file_type or "").lower() == ".pdf" or (r.file_name or "").lower().endswith(".pdf")
    ]

    profile_payload = get_profile_for_material(db, material)
    profile_merged: dict = (
        profile_payload.get("merged")
        if isinstance(profile_payload, dict) and isinstance(profile_payload.get("merged"), dict)
        else {}
    )

    decl = {}
    if isinstance(material.content, dict):
        raw = material.content.get("declaration")
        if isinstance(raw, dict):
            decl = raw

    try:
        from reportlab.lib import colors
        from reportlab.lib.pagesizes import A4
        from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
        from reportlab.lib.units import mm
        from reportlab.pdfbase import pdfmetrics
        from reportlab.pdfbase.ttfonts import TTFont
        from reportlab.platypus import (
            Image as RLImage,
            PageBreak,
            Paragraph,
            SimpleDocTemplate,
            Spacer,
            Table,
            TableStyle,
        )
        from reportlab.pdfbase import pdfmetrics
        from reportlab.pdfbase.ttfonts import TTFont
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"PDF 生成依赖缺失: {e}")

    # ---- helpers: font / styles / translations ----
    # 注册中文字体（优先系统字体；失败则退回默认字体，可能中文乱码）
    font_name = "Helvetica"
    try:
        candidates = [
            "/System/Library/Fonts/PingFang.ttc",
            "/System/Library/Fonts/PingFang-SC-Regular.ttf",
            "/System/Library/Fonts/STHeiti Light.ttc",
            "/Library/Fonts/Arial Unicode.ttf",
            # Linux
            "/usr/share/fonts/truetype/wqy/wqy-microhei.ttc",
            "/usr/share/fonts/truetype/arphic/uming.ttc",
            "/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc",
            "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
            "/usr/share/fonts/truetype/droid/DroidSansFallbackFull.ttf",
        ]
        for p in candidates:
            try:
                pdfmetrics.registerFont(TTFont("CJKFont", p))
                font_name = "CJKFont"
                break
            except Exception:
                continue
    except Exception:
        pass

    styles = getSampleStyleSheet()
    style_h1 = ParagraphStyle(
        "h1",
        parent=styles["Heading1"],
        fontName=font_name,
        fontSize=16,
        leading=20,
        spaceAfter=10,
    )
    style_h2 = ParagraphStyle(
        "h2",
        parent=styles["Heading2"],
        fontName=font_name,
        fontSize=13,
        leading=16,
        spaceBefore=10,
        spaceAfter=6,
    )
    style_body = ParagraphStyle(
        "body",
        parent=styles["BodyText"],
        fontName=font_name,
        fontSize=10,
        leading=14,
    )
    style_small = ParagraphStyle(
        "small",
        parent=styles["BodyText"],
        fontName=font_name,
        fontSize=9,
        leading=12,
        textColor=colors.grey,
    )
    style_toc = ParagraphStyle(
        "toc",
        parent=styles["BodyText"],
        fontName=font_name,
        fontSize=11,
        leading=16,
        tabs=[(170 * mm, "RIGHT")],
    )

    def _safe_str(v: object) -> str:
        if v is None:
            return "—"
        if isinstance(v, str):
            t = v.strip()
            return t if t else "—"
        if isinstance(v, (int, float, bool)):
            return str(v)
        try:
            import json

            return json.dumps(v, ensure_ascii=False, indent=2)
        except Exception:
            return str(v)

    def _to_para(text: object, style: ParagraphStyle = style_body) -> Paragraph:
        from xml.sax.saxutils import escape

        s = _safe_str(text)
        # ReportLab Paragraph 是 XML 子集，需转义并保留换行
        safe = escape(s).replace("\n", "<br/>")
        return Paragraph(safe, style)

    # dict maps used by profile page
    DICT_CODES = [
        "china_region_province",
        "task_post",
        "subject_direction",
        "task_keyword",
        "research_category",
        "sci_research_class",
    ]

    def _load_dict_value_label_map(type_code: str) -> dict[str, str]:
        t = db.execute(select(DataDictType).where(DataDictType.code == type_code)).scalar_one_or_none()
        if not t:
            return {}
        items = (
            db.execute(
                select(DataDictItem.value, DataDictItem.label).where(
                    DataDictItem.type_id == t.id,
                    DataDictItem.is_enabled.is_(True),
                )
            )
            .all()
        )
        return {str(v): str(l) for v, l in items if v is not None and l is not None}

    dict_maps: dict[str, dict[str, str]] = {code: _load_dict_value_label_map(code) for code in DICT_CODES}

    ID_TYPE_LABELS: dict[str, str] = {
        "id_card": "居民身份证",
        "passport": "护照",
        "hk_macao_permit": "港澳居民来往内地通行证",
        "tw_permit": "台湾居民来往大陆通行证",
        "foreign_perm_residence": "外国人永久居留身份证",
        "other": "其他",
    }
    GENDER_LABELS: dict[str, str] = {"male": "男", "female": "女"}
    OFFICE_LEVEL_LABELS: dict[str, str] = {"none": "无", "county": "处级", "bureau": "厅局级"}
    NATIONALITY_LABELS: dict[str, str] = {"CN": "中国", "CHN": "中国"}

    def _translate_profile_value(key: str, v: object) -> str:
        if not isinstance(v, str):
            return _safe_str(v)
        s = v.strip()
        if not s:
            return "—"
        if key == "gender":
            return GENDER_LABELS.get(s, s)
        if key == "id_type_display":
            return ID_TYPE_LABELS.get(s, s)
        if key == "office_level":
            return OFFICE_LEVEL_LABELS.get(s, s)
        if key in ("nationality", "highest_edu_country", "highest_degree_country"):
            return NATIONALITY_LABELS.get(s, s)
        if key in ("work_region", "work_province"):
            return dict_maps.get("china_region_province", {}).get(s, s)
        if key.startswith("task_pos"):
            return dict_maps.get("task_post", {}).get(s, s)
        if key.startswith("subject_"):
            return dict_maps.get("subject_direction", {}).get(s, s)
        if key == "kw_cat":
            return dict_maps.get("task_keyword", {}).get(s, s)
        if key == "research_major":
            return dict_maps.get("research_category", {}).get(s, s)
        if key == "research_sub":
            return dict_maps.get("sci_research_class", {}).get(s, s)
        return s

    PROFILE_LABELS: dict[str, str] = {
        # 基本信息
        "full_name": "姓名",
        "gender": "性别",
        "nationality": "国籍",
        "birth_date": "出生日期",
        "id_type_display": "身份证件类型",
        "id_number": "证件号码",
        "id_pdf": "证件(pdf)",
        "birth_proof_pdf": "特殊证明",
        "id_photo": "证件照",
        "recommend_school": "推荐单位",
        "project_name": "申报项目",
        "highest_edu_level": "最高学历",
        "highest_edu_school": "毕业院校（最高学历）",
        "highest_edu_major": "专业（最高学历）",
        "highest_edu_grad_date": "毕业时间（最高学历）",
        "highest_edu_country": "国家/地区（最高学历）",
        "highest_edu_proof_pdf": "最高学历证明",
        "highest_degree_level": "最高学位",
        "highest_degree_school": "授予单位（最高学位）",
        "highest_degree_major": "专业（最高学位）",
        "highest_degree_grad_date": "授予时间（最高学位）",
        "highest_degree_country": "国家/地区（最高学位）",
        "highest_degree_proof_pdf": "最高学位证明",
        "work_unit_detail": "现任职单位",
        "unit_attr_display": "单位属性",
        "work_region": "现任职单位区域",
        "work_province": "现任职单位省份",
        "work_unit": "单位名称",
        "work_dept": "部门",
        "work_job": "岗位",
        "work_start_date": "任现职时间",
        "tech_title": "职称",
        "tech_title_date": "取得职称时间",
        "admin_title": "行政职务",
        "office_level": "行政级别",
        "office_level_date": "任现行政级别时间",
        # 联系方式
        "mobile": "手机号",
        "email": "邮箱",
        "phone_home": "家庭电话",
        "phone_office": "单位电话",
        "fax": "传真",
        "address": "通讯地址",
        "postal_code": "邮编",
        # 任务/岗位
        "task_pos1_a": "任务（岗位）一 · 大类",
        "task_pos1_b": "任务（岗位）一 · 具体岗位",
        "task_pos2_a": "任务（岗位）二 · 大类",
        "task_pos2_b": "任务（岗位）二 · 具体岗位",
        "subject_a1": "学科方向 A · 一级",
        "subject_a2": "学科方向 A · 二级",
        "subject_a3": "学科方向 A · 三级",
        "subject_b1": "学科方向 B · 一级",
        "subject_b2": "学科方向 B · 二级",
        "subject_b3": "学科方向 B · 三级",
        "task_desc": "任务描述",
        "kw_cat": "关键词类别",
        "kw1": "关键词 1",
        "kw2": "关键词 2",
        "kw3": "关键词 3",
        "research_major": "从事研究大类",
        "research_sub": "科学研究分类",
        "research_desc": "研究方向说明",
        # 导师与回避
        "master_sup_1": "硕士导师姓名 1",
        "master_sup_2": "硕士导师姓名 2",
        "master_sup_3": "硕士导师姓名 3",
        "phd_sup_1": "博士导师姓名 1",
        "phd_sup_2": "博士导师姓名 2",
        "phd_sup_3": "博士导师姓名 3",
        "postdoc_sup_1": "博士后合作导师姓名 1",
        "postdoc_sup_2": "博士后合作导师姓名 2",
        "postdoc_sup_3": "博士后合作导师姓名 3",
        "family_rel_1": "直系亲属（同领域）1",
        "family_rel_2": "直系亲属（同领域）2",
        "family_rel_3": "直系亲属（同领域）3",
        "recuse_exp_1": "回避专家 1",
        "recuse_exp_2": "回避专家 2",
        "recuse_exp_3": "回避专家 3",
    }

    PROFILE_EXCLUDE_KEYS: set[str] = {
        # 用户要求：不在 PDF 个人信息里展示
        "project_name",
        "recommend_school",
        # 证件照已在右上角渲染，避免下方重复显示 url/json
        "id_photo",
    }

    def _profile_groups() -> list[tuple[str, list[str]]]:
        return [
            (
                "基本信息",
                [
                    # 与前端审批页「个人信息」预览顺序一致
                    "full_name",
                    "gender",
                    "nationality",
                    "birth_date",
                    "id_type_display",
                    "id_number",
                    "id_pdf",
                    "birth_proof_pdf",
                    "highest_edu_country",
                    "highest_edu_school",
                    "highest_edu_level",
                    "highest_edu_proof_pdf",
                    "highest_degree_country",
                    "highest_degree_school",
                    "highest_degree_level",
                    "highest_degree_proof_pdf",
                    "work_region",
                    "work_province",
                    "mobile",
                    "phone_home",
                    "phone_office",
                    "fax",
                    "email",
                    "address",
                    "postal_code",
                    "work_unit_detail",
                    "unit_attr_display",
                    "highest_edu_major",
                    "highest_edu_grad_date",
                    "highest_degree_major",
                    "highest_degree_grad_date",
                    "work_unit",
                    "work_dept",
                    "work_job",
                    "work_start_date",
                    "tech_title",
                    "tech_title_date",
                    "admin_title",
                    "office_level",
                    "office_level_date",
                ],
            ),
            (
                "任务（岗位）及关键词",
                [
                    "task_pos1_a",
                    "task_pos1_b",
                    "task_pos2_a",
                    "task_pos2_b",
                    "subject_a1",
                    "subject_a2",
                    "subject_a3",
                    "subject_b1",
                    "subject_b2",
                    "subject_b3",
                    "task_desc",
                    "kw_cat",
                    "kw1",
                    "kw2",
                    "kw3",
                    "research_major",
                    "research_sub",
                    "research_desc",
                ],
            ),
            (
                "导师与回避信息",
                [
                    "master_sup_1",
                    "master_sup_2",
                    "master_sup_3",
                    "phd_sup_1",
                    "phd_sup_2",
                    "phd_sup_3",
                    "postdoc_sup_1",
                    "postdoc_sup_2",
                    "postdoc_sup_3",
                    "family_rel_1",
                    "family_rel_2",
                    "family_rel_3",
                    "recuse_exp_1",
                    "recuse_exp_2",
                    "recuse_exp_3",
                ],
            ),
        ]

    # ---- declaration config + renderer (map/list) ----
    decl_cfg_row = db.execute(
        select(ProjectDeclarationConfig)
        .where(
            ProjectDeclarationConfig.project_id == material.project_id,
            ProjectDeclarationConfig.status == "published",
        )
        .order_by(ProjectDeclarationConfig.version.desc())
        .limit(1)
    ).scalar_one_or_none()
    decl_cfg = decl_cfg_row.config if decl_cfg_row and isinstance(decl_cfg_row.config, dict) else None

    def _decl_get_map(module_key: str, sub_key: str) -> dict:
        mod = decl.get("modules", {}).get(module_key, {})
        sub = mod.get(sub_key, {})
        if isinstance(sub, dict) and isinstance(sub.get("map"), dict):
            return sub.get("map")
        return {}

    def _decl_get_list_rows(module_key: str, sub_key: str) -> list[dict] | None:
        mod = decl.get("modules", {}).get(module_key, {})
        sub = mod.get(sub_key, {})
        if isinstance(sub, dict) and isinstance(sub.get("list"), dict):
            rows = sub["list"].get("rows")
            if isinstance(rows, list):
                return [r for r in rows if isinstance(r, dict)]
        return None

    def _parse_select_options(raw_field: dict) -> list[tuple[str, str]]:
        opt = raw_field.get("options")
        if not isinstance(opt, list):
            return []
        out: list[tuple[str, str]] = []
        for x in opt:
            if isinstance(x, dict):
                v = x.get("value", x.get("label"))
                l = x.get("label", v)
                if v is None or l is None:
                    continue
                out.append((str(v), str(l)))
            else:
                out.append((str(x), str(x)))
        return out

    def _render_decl_value(widget: str, raw_field: dict, v: object) -> str:
        if v is None or v == "":
            return "—"
        if widget == "select":
            opts = _parse_select_options(raw_field)
            if isinstance(v, str):
                for ov, ol in opts:
                    if ov == v:
                        return ol
        return _safe_str(v)

    def _table_kv(rows_kv: list[tuple[str, str]]) -> Table:
        data = [["字段", "值"]]
        for k, v in rows_kv:
            data.append([_to_para(k, style_body), _to_para(v, style_body)])
        tbl = Table(data, colWidths=[48 * mm, 130 * mm])
        tbl.setStyle(
            TableStyle(
                [
                    ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#f5f5f5")),
                    ("TEXTCOLOR", (0, 0), (-1, 0), colors.HexColor("#333333")),
                    ("FONTNAME", (0, 0), (-1, -1), font_name),
                    ("FONTSIZE", (0, 0), (-1, -1), 10),
                    ("ALIGN", (0, 0), (-1, 0), "LEFT"),
                    ("VALIGN", (0, 0), (-1, -1), "TOP"),
                    ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#dddddd")),
                    ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#fcfcfc")]),
                    ("TOPPADDING", (0, 0), (-1, -1), 4),
                    ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
                    ("LEFTPADDING", (0, 0), (-1, -1), 6),
                    ("RIGHTPADDING", (0, 0), (-1, -1), 6),
                ]
            )
        )
        return tbl

    def _table_desc_2col(
        items: list[tuple[str, str]],
        col_widths: tuple[float, float, float, float] | None = None,
    ) -> Table:
        """类似前端 Descriptions：两列 label-value（每行两个条目）。"""
        rows: list[list[object]] = []
        i = 0
        while i < len(items):
            a = items[i]
            b = items[i + 1] if i + 1 < len(items) else ("", "")
            rows.append(
                [
                    _to_para(a[0], style_body),
                    _to_para(a[1], style_body),
                    _to_para(b[0], style_body) if b[0] else _to_para("", style_body),
                    _to_para(b[1], style_body) if b[0] else _to_para("", style_body),
                ]
            )
            i += 2
        cw = col_widths or (26 * mm, 65 * mm, 26 * mm, 65 * mm)
        tbl = Table(rows, colWidths=list(cw))
        tbl.setStyle(
            TableStyle(
                [
                    ("FONTNAME", (0, 0), (-1, -1), font_name),
                    ("FONTSIZE", (0, 0), (-1, -1), 10),
                    ("VALIGN", (0, 0), (-1, -1), "TOP"),
                    ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#dddddd")),
                    ("BACKGROUND", (0, 0), (0, -1), colors.HexColor("#fafafa")),
                    ("BACKGROUND", (2, 0), (2, -1), colors.HexColor("#fafafa")),
                    ("TEXTCOLOR", (0, 0), (0, -1), colors.HexColor("#666666")),
                    ("TEXTCOLOR", (2, 0), (2, -1), colors.HexColor("#666666")),
                    ("TOPPADDING", (0, 0), (-1, -1), 4),
                    ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
                    ("LEFTPADDING", (0, 0), (-1, -1), 6),
                    ("RIGHTPADDING", (0, 0), (-1, -1), 6),
                ]
            )
        )
        return tbl

    def _build_pdf(flowables: list, title: str) -> BytesIO:
        buf = BytesIO()
        doc = SimpleDocTemplate(
            buf,
            pagesize=A4,
            leftMargin=18 * mm,
            rightMargin=18 * mm,
            topMargin=18 * mm,
            bottomMargin=18 * mm,
            title=title,
        )
        doc.build(flowables)
        buf.seek(0)
        return buf

    def _fmt_dt(v: object) -> str:
        if isinstance(v, datetime):
            return v.strftime("%Y-%m-%d %H:%M:%S")
        return _safe_str(v)

    project = db.get(ApplyProject, material.project_id)
    applicant = db.get(User, material.user_id)
    project_name = (project.name if project else "").strip() or "—"
    applicant_name = (applicant.name if applicant else "").strip() or "—"

    # ---- section pdf: cover ----
    cover_flows = [
        Paragraph("申报材料预览", style_h1),
        Spacer(1, 12 * mm),
        Paragraph(f"项目名称：{_safe_str(project_name)}", style_body),
        Paragraph(f"项目ID：{_safe_str(material.project_id)}", style_body),
        Spacer(1, 8 * mm),
        Paragraph(f"申请人：{_safe_str(applicant_name)}", style_body),
        Paragraph(f"提交时间：{_fmt_dt(material.submitted_at)}", style_body),
        Spacer(1, 14 * mm),
        Paragraph(
            "说明：本 PDF 由系统动态生成，包含个人信息、申报内容；"
            "申报材料中的 PDF 附件与个人档案中的证件/证明 PDF 均合并于文档末尾。",
            style_small,
        ),
        PageBreak(),
    ]
    cover_pdf = _build_pdf(cover_flows, f"material-{material_id}-cover")

    # ---- section pdf: personal info ----
    def _extract_upload_urls(v: object) -> list[tuple[str, str]]:
        """
        尝试从多种形态（string / [{name,url}] / [{uid,name,status,url}]）提取 url 列表。
        返回 (name, url)。
        """
        out: list[tuple[str, str]] = []
        if isinstance(v, str) and v.strip():
            out.append((v.strip().split("/")[-1] or "文件", v.strip()))
            return out
        if isinstance(v, dict):
            url = v.get("url")
            name = v.get("name") or "文件"
            if isinstance(url, str) and url.strip():
                out.append((str(name), url.strip()))
            return out
        if isinstance(v, list):
            for item in v:
                if isinstance(item, dict):
                    url = item.get("url")
                    name = item.get("name") or item.get("uid") or "文件"
                    if isinstance(url, str) and url.strip():
                        out.append((str(name), url.strip()))
        return out

    def _profile_file_url_to_local_path(user_id: int, url: str) -> str | None:
        """
        profile_files.py 保存路径：{UPLOAD_DIR}/profile/{user_id}/{filename}
        url 形如：uploads/profile-file/{user_id}/{filename}
        """
        try:
            parts = url.split("uploads/profile-file/", 1)
            if len(parts) != 2:
                return None
            tail = parts[1].lstrip("/")
            seg = tail.split("/", 1)
            if len(seg) != 2:
                return None
            uid_str, filename = seg
            if int(uid_str) != int(user_id):
                return None
            settings = get_settings()

            return os.path.join(settings.UPLOAD_DIR, "profile", str(user_id), filename)
        except Exception:
            return None

    def _format_profile_upload_filenames(v: object) -> str:
        """上传类字段在表内仅展示文件名（与前端审批预览一致），多文件以「、」连接。"""
        pairs = _extract_upload_urls(v)
        if not pairs:
            return "—"
        return "、".join(_safe_str(n) for n, _ in pairs)

    _PDF_FIELD_KEYS = frozenset(
        {
            "id_pdf",
            "birth_proof_pdf",
            "highest_edu_proof_pdf",
            "highest_degree_proof_pdf",
        }
    )
    used_keys: set[str] = set()

    id_photo_urls = _extract_upload_urls(profile_merged.get("id_photo"))
    id_photo_path = (
        _profile_file_url_to_local_path(material.user_id, id_photo_urls[0][1])
        if id_photo_urls
        else None
    )
    if "id_photo" in profile_merged:
        used_keys.add("id_photo")
    if "project_name" in profile_merged:
        used_keys.add("project_name")
    if "recommend_school" in profile_merged:
        used_keys.add("recommend_school")

    id_pdf_files = _extract_upload_urls(profile_merged.get("id_pdf"))
    birth_proof_files = _extract_upload_urls(profile_merged.get("birth_proof_pdf"))
    highest_edu_proof_files = _extract_upload_urls(
        profile_merged.get("highest_edu_proof_pdf")
    )
    highest_degree_proof_files = _extract_upload_urls(
        profile_merged.get("highest_degree_proof_pdf")
    )
    for _fk in _PDF_FIELD_KEYS:
        if _fk in profile_merged:
            used_keys.add(_fk)

    profile_flows: list = []
    profile_flows.append(Paragraph("个人信息", style_h1))
    profile_flows.append(Spacer(1, 2 * mm))

    for group_title, keys in _profile_groups():
        group_rows: list[tuple[str, str]] = []
        for k in keys:
            if k not in profile_merged:
                continue
            if k in PROFILE_EXCLUDE_KEYS:
                continue
            v = profile_merged.get(k)
            if v is None or v == "":
                continue
            used_keys.add(k)
            label = PROFILE_LABELS.get(k, k)
            if k in _PDF_FIELD_KEYS:
                group_rows.append((label, _format_profile_upload_filenames(v)))
                continue
            if k == "id_photo":
                continue
            if k in ("form_status", "submitted"):
                continue
            group_rows.append((label, _translate_profile_value(k, v)))
        if not group_rows:
            continue
        profile_flows.append(Paragraph(group_title, style_h2))
        if group_title == "基本信息" and id_photo_path and os.path.isfile(id_photo_path):
            try:
                img = RLImage(id_photo_path)
                img.drawHeight = 36 * mm
                img.drawWidth = 28 * mm
                photo_row = Table(
                    [[Spacer(1, 38 * mm), img]],
                    colWidths=[130 * mm, 40 * mm],
                )
                photo_row.setStyle(
                    TableStyle(
                        [
                            ("VALIGN", (0, 0), (-1, -1), "TOP"),
                            ("ALIGN", (1, 0), (1, 0), "RIGHT"),
                            ("LEFTPADDING", (0, 0), (-1, -1), 0),
                            ("RIGHTPADDING", (0, 0), (-1, -1), 0),
                            ("TOPPADDING", (0, 0), (-1, -1), 0),
                            ("BOTTOMPADDING", (0, 0), (-1, -1), 2),
                        ]
                    )
                )
                profile_flows.append(photo_row)
                profile_flows.append(Spacer(1, 2 * mm))
            except Exception:
                pass
        profile_flows.append(_table_desc_2col(group_rows))
        profile_flows.append(Spacer(1, 4 * mm))

    # any remaining keys (ensure "完整信息")
    remain = []
    for k in sorted(profile_merged.keys()):
        if k in used_keys:
            continue
        if k in PROFILE_EXCLUDE_KEYS:
            continue
        if k in ("form_status", "submitted"):
            continue
        v = profile_merged.get(k)
        if v is None or v == "":
            continue
        remain.append((PROFILE_LABELS.get(k, k), _translate_profile_value(k, v)))
    if remain:
        profile_flows.append(Paragraph("补充字段", style_h2))
        profile_flows.append(_table_desc_2col(remain))

    profile_flows.append(PageBreak())
    profile_pdf = _build_pdf(profile_flows, f"material-{material_id}-profile")

    # ---- section pdf: declaration content ----
    decl_flows: list = [Paragraph("申报内容", style_h1)]
    if not decl_cfg or not isinstance(decl_cfg.get("modules"), list):
        decl_flows.append(
            Paragraph("未找到已发布的申报配置，以下展示原始 JSON（完整）。", style_small),
        )
        decl_flows.append(Spacer(1, 3 * mm))
        decl_flows.append(_to_para(decl, style_body))
    else:
        modules = [m for m in decl_cfg.get("modules", []) if isinstance(m, dict)]
        for mi, mod in enumerate(modules):
            mod_key = str(mod.get("key") or f"module_{mi}")
            mod_title = str(mod.get("title") or mod_key) or mod_key
            decl_flows.append(Paragraph(mod_title, style_h2))
            subs_raw = mod.get("subModules")
            subs = [s for s in subs_raw if isinstance(s, dict)] if isinstance(subs_raw, list) else []
            if not subs:
                decl_flows.append(Paragraph("（该模块未配置子模块）", style_small))
                decl_flows.append(Spacer(1, 2 * mm))
                continue
            for si, sub in enumerate(subs):
                sub_key = str(sub.get("key") or f"sub_{si}")
                sub_title = str(sub.get("title") or sub_key) or sub_key
                sub_type = str(sub.get("type") or "map")
                decl_flows.append(Paragraph(sub_title, style_body))
                fields_raw = sub.get("fields")
                fields = [f for f in fields_raw if isinstance(f, dict)] if isinstance(fields_raw, list) else []
                if sub_type == "list":
                    rows_list = _decl_get_list_rows(mod_key, sub_key)
                    if not rows_list:
                        decl_flows.append(Paragraph("（未填写）", style_small))
                        decl_flows.append(Spacer(1, 2 * mm))
                        continue
                    for ri, row in enumerate(rows_list):
                        kv: list[tuple[str, str]] = [("行号", str(ri + 1))]
                        for fi, f in enumerate(fields):
                            fname = str(f.get("name") or f"field_{fi}")
                            flabel = str(f.get("label") or fname) or fname
                            widget = str(f.get("widget") or "input")
                            kv.append((flabel, _render_decl_value(widget, f, row.get(fname))))
                        decl_flows.append(_table_kv(kv))
                        decl_flows.append(Spacer(1, 3 * mm))
                else:
                    mp = _decl_get_map(mod_key, sub_key)
                    if not mp:
                        decl_flows.append(Paragraph("（未填写）", style_small))
                        decl_flows.append(Spacer(1, 2 * mm))
                        continue
                    kv = []
                    for fi, f in enumerate(fields):
                        fname = str(f.get("name") or f"field_{fi}")
                        flabel = str(f.get("label") or fname) or fname
                        widget = str(f.get("widget") or "input")
                        kv.append((flabel, _render_decl_value(widget, f, mp.get(fname))))
                    decl_flows.append(_table_kv(kv))
                    decl_flows.append(Spacer(1, 4 * mm))

        # include any extra keys not covered by config
        try:
            cfg_keys: set[tuple[str, str]] = set()
            for mi, mod in enumerate(modules):
                mk = str(mod.get("key") or f"module_{mi}")
                subs_raw = mod.get("subModules")
                subs = [s for s in subs_raw if isinstance(s, dict)] if isinstance(subs_raw, list) else []
                for si, sub in enumerate(subs):
                    sk = str(sub.get("key") or f"sub_{si}")
                    cfg_keys.add((mk, sk))
            extra: list[str] = []
            mod_obj = decl.get("modules")
            if isinstance(mod_obj, dict):
                for mk, subs in mod_obj.items():
                    if not isinstance(subs, dict):
                        continue
                    for sk in subs.keys():
                        if (str(mk), str(sk)) not in cfg_keys:
                            extra.append(f"{mk}.{sk}")
            if extra:
                decl_flows.append(Paragraph("未配置但存在的填报数据", style_h2))
                decl_flows.append(Paragraph("以下子模块在材料中存在，但不在当前发布配置中：", style_small))
                decl_flows.append(Spacer(1, 2 * mm))
                decl_flows.append(_table_kv([(x, "（存在数据）") for x in extra]))
        except Exception:
            pass

    decl_flows.append(PageBreak())
    decl_pdf = _build_pdf(decl_flows, f"material-{material_id}-declaration")

    try:
        from pypdf import PdfReader, PdfWriter
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"PDF 预览依赖缺失: {e}")

    writer = PdfWriter()
    # 先合并：封面 -> 个人信息 -> 申报内容 -> PDF 附件（申报材料 + 个人档案）
    cover_reader = PdfReader(cover_pdf)
    profile_reader = PdfReader(profile_pdf)
    decl_reader = PdfReader(decl_pdf)

    def _append_reader(r: PdfReader) -> int:
        start = len(writer.pages)
        for p in r.pages:
            writer.add_page(p)
        return start

    # 先放 cover，TOC 生成后再插入
    cover_start = _append_reader(cover_reader)
    profile_start = _append_reader(profile_reader)
    decl_start = _append_reader(decl_reader)

    attachment_outline: list[tuple[str, int]] = []
    for a in pdfs:
        try:
            if not os.path.isfile(a.file_path):
                continue
            start = len(writer.pages)
            reader = PdfReader(a.file_path)
            for page in reader.pages:
                writer.add_page(page)
            name = (a.file_name or "").strip() or f"附件-{a.id}"
            attachment_outline.append((name, start))
        except Exception:
            continue

    profile_attachment_outline: list[tuple[str, int]] = []
    for field_key, files in (
        ("id_pdf", id_pdf_files),
        ("birth_proof_pdf", birth_proof_files),
        ("highest_edu_proof_pdf", highest_edu_proof_files),
        ("highest_degree_proof_pdf", highest_degree_proof_files),
    ):
        field_label = PROFILE_LABELS.get(field_key, field_key)
        for name, url in files:
            path = _profile_file_url_to_local_path(material.user_id, url)
            if not path or not os.path.isfile(path):
                continue
            if not str(path).lower().endswith(".pdf"):
                continue
            try:
                start = len(writer.pages)
                reader = PdfReader(path)
                for page in reader.pages:
                    writer.add_page(page)
                profile_attachment_outline.append(
                    (f"{field_label}：{_safe_str(name)}", start),
                )
            except Exception:
                continue

    toc_pages = 0

    # ---- bookmarks / outline（顶层直接为各章节，不再套「申报材料 #N」根节点）----
    writer.add_outline_item("封面", 0, parent=None)
    writer.add_outline_item("个人信息", profile_start + toc_pages, parent=None)
    writer.add_outline_item("申报内容", decl_start + toc_pages, parent=None)
    merged_pdf_children = [*attachment_outline, *profile_attachment_outline]
    if merged_pdf_children:
        first_merged_page = merged_pdf_children[0][1] + toc_pages
        merged_parent = writer.add_outline_item(
            "附件与证明（PDF）", first_merged_page, parent=None
        )
        for name, page_index in attachment_outline:
            writer.add_outline_item(name, page_index + toc_pages, parent=merged_parent)
        for bookmark_title, page_index in profile_attachment_outline:
            writer.add_outline_item(
                bookmark_title, page_index + toc_pages, parent=merged_parent
            )

    out = BytesIO()
    writer.write(out)
    out.seek(0)
    filename = f"material-{material_id}-merged.pdf"
    headers = {"Content-Disposition": f'inline; filename="{filename}"'}
    return StreamingResponse(out, media_type="application/pdf", headers=headers)


@router.put("/{material_id}", response_model=MaterialOut)
def update_material(material_id: int, data: MaterialUpdate, db: DbSession, current_user: CurrentUser):
    material = db.get(ApplyMaterial, material_id)
    if not material:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="材料不存在")
    if material.user_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="无权限")
    if material.status != 0:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="已提交的材料不可修改")

    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(material, field, value)
    db.commit()
    db.refresh(material)
    return _material_to_out(db, material)


@router.post("/{material_id}/submit", response_model=MaterialOut)
def submit_material(material_id: int, db: DbSession, current_user: CurrentUser):
    material = db.get(ApplyMaterial, material_id)
    if not material:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="材料不存在")
    if material.user_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="无权限")
    if material.status != 0:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="当前状态不可提交")

    project = db.get(ApplyProject, material.project_id)
    if not project:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="项目不存在")
    flow = parse_project_flow(get_effective_project_flow_dict(db, project))
    if flow:
        material.approval_snapshot = flow.model_dump()
    else:
        material.approval_snapshot = None

    # 提交材料时绑定“当前已发布”的个人资料版本（若不存在则创建一个）
    # 说明：个人资料的“提交”行为发生在资料页（draft -> published）；材料提交不应隐式生成新版本，
    # 否则会导致“已发布版本”与用户理解不一致。
    pv = (
        db.execute(
            select(UserProfileVersion)
            .where(
                UserProfileVersion.user_id == current_user.id,
                UserProfileVersion.status == PROFILE_VERSION_STATUS_PUBLISHED,
            )
            .order_by(UserProfileVersion.version.desc())
            .limit(1)
        )
        .scalars()
        .first()
    )
    if pv is None:
        # 如果用户从未发布过资料，创建一个初始 draft 并直接发布，保证材料始终绑定可复现的快照
        draft = ensure_initial_draft_version(db, current_user.id, created_by=current_user.id)
        pv = publish_draft_version(db, draft.id, current_user.id, created_by=current_user.id)
    material.profile_version_id = pv.id

    material.status = 1
    material.submitted_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(material)
    return _material_to_out(db, material)
