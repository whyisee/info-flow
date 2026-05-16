import { useEffect, useState } from "react";
import { Button, Modal, Segmented, Space, Spin, Typography, message } from "antd";
import { useNavigate, useParams } from "react-router-dom";
import {
  DeclarationConfigRenderer,
  normalizeDeclarationDraft,
} from "../../features/declaration-config-render";
import * as materialService from "../../services/materials";
import type { MaterialEditContext } from "../../services/materials";
import PdfJsBlobViewer from "../../components/PdfJsBlobViewer";
import "./MaterialPrintPreviewPage.css";

export default function MaterialPrintPreviewPage() {
  const { id } = useParams();
  const materialId = Number(id);
  const navigate = useNavigate();
  const [context, setContext] = useState<MaterialEditContext | null>(null);
  const [loading, setLoading] = useState(false);
  const [pdfOpen, setPdfOpen] = useState(false);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [pdfViewerMode, setPdfViewerMode] = useState<"system" | "light">("system");

  useEffect(() => {
    if (!Number.isFinite(materialId) || materialId <= 0) return;
    setLoading(true);
    materialService
      .getMaterialEditContext(materialId)
      .then(setContext)
      .catch(() => message.error("加载预览失败"))
      .finally(() => setLoading(false));
  }, [materialId]);

  useEffect(() => {
    if (!pdfOpen && pdfUrl) {
      URL.revokeObjectURL(pdfUrl);
      setPdfUrl(null);
    }
  }, [pdfOpen, pdfUrl]);

  const openPdf = async () => {
    if (!context) return;
    setPdfOpen(true);
    setPdfLoading(true);
    try {
      const blob = await materialService.previewMaterialMergedPdf(context.material.id);
      setPdfUrl(URL.createObjectURL(blob));
    } catch {
      message.error("生成 PDF 失败");
      setPdfOpen(false);
    } finally {
      setPdfLoading(false);
    }
  };

  const config = context?.config ?? { modules: [] };
  const draft = normalizeDeclarationDraft(context?.draft?.declaration);

  return (
    <div className="materialPrintPreviewPage">
      <div className="materialPrintPreviewHeader">
        <div>
          <h2 className="materialPrintPreviewTitle">打印预览</h2>
          <div className="materialPrintPreviewSubtitle">
            {typeof context?.project?.name === "string" ? context.project.name : "申报材料"}
          </div>
        </div>
        <Space>
          <Button onClick={() => navigate(`/declaration/materials/${materialId}`)}>
            返回修改
          </Button>
          <Button type="primary" onClick={openPdf} disabled={!context}>
            预览 PDF
          </Button>
        </Space>
      </div>

      {loading ? (
        <div style={{ textAlign: "center", padding: 60 }}>
          <Spin size="large" />
        </div>
      ) : context ? (
        <div className="materialPrintPreviewCanvas">
          <div className="materialPrintPreviewPaper">
            <DeclarationConfigRenderer
              variant="preview"
              config={config}
              draft={draft}
              moduleLayout="stack"
            />
          </div>
        </div>
      ) : (
        <Typography.Text type="secondary">暂无可预览内容</Typography.Text>
      )}

      <Modal
        open={pdfOpen}
        onCancel={() => setPdfOpen(false)}
        footer={null}
        width={760}
        title="PDF 预览"
      >
        {pdfLoading ? (
          <div style={{ textAlign: "center", padding: 40 }}>
            <Spin size="large" />
            <div style={{ marginTop: 16 }}>正在生成预览...</div>
          </div>
        ) : pdfUrl ? (
          <>
            <div style={{ marginBottom: 12 }}>
              <Segmented
                value={pdfViewerMode}
                onChange={(v) => setPdfViewerMode(v as "system" | "light")}
                options={[
                  { label: "系统查看器", value: "system" },
                  { label: "轻量查看器", value: "light" },
                ]}
              />
            </div>
            {pdfViewerMode === "light" ? (
              <PdfJsBlobViewer url={pdfUrl} />
            ) : (
              <iframe
                className="materialPrintPreviewPdfFrame"
                src={pdfUrl}
                title="pdf-preview"
              />
            )}
          </>
        ) : null}
      </Modal>
    </div>
  );
}
