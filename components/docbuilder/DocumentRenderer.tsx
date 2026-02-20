"use client";

import { DocTemplateJson, Block } from "./types";
import { mmToPx, getPageMm } from "./mm";
import { replaceExpressions } from "./expr";
import DOMPurify from "dompurify";

interface DocumentRendererProps {
  template: DocTemplateJson;
  data?: any;
  scale?: number;
  showGrid?: boolean;
  mode?: "template" | "instance";
  signatures?: Array<{
    blockId: string;
    signaturePngUrl: string;
    signatureHash: string;
    signedAtLocal: string;
    tz: string;
  }>;
}

export default function DocumentRenderer({
  template,
  data = {},
  scale = 1,
  showGrid = false,
  mode = "template",
  signatures = [],
}: DocumentRendererProps) {
  const { pageSettings, pages } = template;
  const pageMm = getPageMm(pageSettings.orientation);
  const pageWidthPx = mmToPx(pageMm.w) * scale;
  const pageHeightPx = mmToPx(pageMm.h) * scale;

  const marginTopPx = mmToPx(pageSettings.marginTop) * scale;
  const marginRightPx = mmToPx(pageSettings.marginRight) * scale;
  const marginBottomPx = mmToPx(pageSettings.marginBottom) * scale;
  const marginLeftPx = mmToPx(pageSettings.marginLeft) * scale;

  // Area utile (dentro i margini)
  const usableWMm = pageMm.w - pageSettings.marginLeft - pageSettings.marginRight;
  const usableHMm = pageMm.h - pageSettings.marginTop - pageSettings.marginBottom;

  // Converti le pagine in array di blocchi ordinati per z
  const renderedPages: Block[][] = pages.map(page => 
    [...page.blocks].sort((a, b) => (a.z || 0) - (b.z || 0))
  );

  const totalPages = renderedPages.length;

  const renderBlock = (block: Block, pageNum: number) => {
    const style: React.CSSProperties = {
      position: "absolute",
      left: `${mmToPx(block.xMm) * scale}px`,
      top: `${mmToPx(block.yMm) * scale}px`,
      width: `${mmToPx(block.wMm) * scale}px`,
      height: block.hMm ? `${mmToPx(block.hMm) * scale}px` : "auto",
      fontFamily: block.style?.fontFamily || "Arial",
      fontSize: `${(block.style?.fontSize || 12) * scale}pt`,
      fontWeight: block.style?.bold ? "bold" : "normal",
      fontStyle: block.style?.italic ? "italic" : "normal",
      textAlign: block.style?.align || "left",
      padding: `${mmToPx(block.style?.paddingMm || 2) * scale}px`,
      border: block.style?.border === "thin" 
        ? "1px solid #ccc" 
        : block.style?.border === "medium" 
        ? "2px solid #999" 
        : "none",
      overflow: "hidden",
    };

    // Valuta visibleIf
    if (block.visibleIf) {
      try {
        // Semplice eval sicuro (per ora assume sintassi base)
        // In produzione usare un parser più robusto
        const visible = evaluateCondition(block.visibleIf, data);
        if (!visible) return null;
      } catch {
        // Se errore, nascondi
        return null;
      }
    }

    const content = renderBlockContent(block, data, scale);

    return (
      <div key={block.id} style={style} className="block-node">
        {content}
      </div>
    );
  };

  const renderBlockContent = (block: Block, data: any, scale: number) => {
    switch (block.type) {
      case "header":
        const headerBlock = block as any;
        return (
          <div className="flex items-center justify-between h-full">
            {headerBlock.logoUrl && (
              <img
                src={headerBlock.logoUrl}
                alt="Logo"
                className="h-full object-contain"
                style={{ maxWidth: "20%" }}
              />
            )}
            <div className="flex-1">{replaceExpressions(headerBlock.content || "", { data })}</div>
          </div>
        );

      case "title":
        const titleBlock = block as any;
        const TitleTag = titleBlock.level || "h1";
        return (
          <TitleTag className="m-0 p-0" style={{ lineHeight: 1.2 }}>
            {replaceExpressions(titleBlock.text || "", { data })}
          </TitleTag>
        );

      case "paragraph":
        const paraBlock = block as any;
        const html = replaceExpressions(paraBlock.html || "", { data });
        const sanitized = DOMPurify.sanitize(html);
        return (
          <div
            className="prose prose-sm max-w-none"
            style={{ fontSize: `${scale}em` }}
            dangerouslySetInnerHTML={{ __html: sanitized }}
          />
        );

      case "text":
        const textBlock = block as any;
        const textValue = textBlock.bind ? getValueFromBinding(textBlock.bind, data) : "";
        
        if (mode === "instance" && textValue) {
          return (
            <div>
              <div className="text-xs font-medium mb-1 text-gray-600" style={{ fontSize: `${9 * scale}px` }}>
                {textBlock.label}
              </div>
              <div style={{ fontSize: `${12 * scale}px`, fontWeight: 500 }}>
                {textValue}
              </div>
            </div>
          );
        }
        
        return (
          <div>
            <div className="text-xs font-medium mb-1" style={{ fontSize: `${10 * scale}px` }}>
              {textBlock.label}
              {textBlock.required && <span className="text-red-500">*</span>}
            </div>
            <div
              className="border-b border-gray-900"
              style={{
                minHeight: textBlock.multiline ? `${20 * scale}px` : `${12 * scale}px`,
                paddingBottom: `${2 * scale}px`,
              }}
            >
              {textValue && <span style={{ fontSize: `${12 * scale}px` }}>{textValue}</span>}
            </div>
          </div>
        );

      case "number":
        const numBlock = block as any;
        const numValue = numBlock.bind ? getValueFromBinding(numBlock.bind, data) : "";
        
        if (mode === "instance" && numValue) {
          return (
            <div>
              <div className="text-xs font-medium mb-1 text-gray-600" style={{ fontSize: `${9 * scale}px` }}>
                {numBlock.label}
              </div>
              <div style={{ fontSize: `${12 * scale}px`, fontWeight: 500 }}>
                {numValue}
              </div>
            </div>
          );
        }
        
        return (
          <div>
            <div className="text-xs font-medium mb-1" style={{ fontSize: `${10 * scale}px` }}>
              {numBlock.label}
              {numBlock.required && <span className="text-red-500">*</span>}
            </div>
            <div
              className="border-b border-gray-900"
              style={{ minHeight: `${12 * scale}px`, paddingBottom: `${2 * scale}px` }}
            >
              {numValue && <span style={{ fontSize: `${12 * scale}px` }}>{numValue}</span>}
            </div>
          </div>
        );

      case "dateTime":
        const dateBlock = block as any;
        const dateValue = dateBlock.bind ? getValueFromBinding(dateBlock.bind, data) : "";
        
        if (mode === "instance" && dateValue) {
          return (
            <div>
              <div className="text-xs font-medium mb-1 text-gray-600" style={{ fontSize: `${9 * scale}px` }}>
                {dateBlock.label}
              </div>
              <div style={{ fontSize: `${12 * scale}px`, fontWeight: 500 }}>
                {dateValue}
              </div>
            </div>
          );
        }
        
        return (
          <div>
            <div className="text-xs font-medium mb-1" style={{ fontSize: `${10 * scale}px` }}>
              {dateBlock.label}
            </div>
            <div
              className="border-b border-gray-900"
              style={{ minHeight: `${12 * scale}px`, paddingBottom: `${2 * scale}px` }}
            >
              {dateValue && <span style={{ fontSize: `${12 * scale}px` }}>{dateValue}</span>}
            </div>
          </div>
        );

      case "checkbox":
        const checkBlock = block as any;
        const checkValue = checkBlock.bind ? getValueFromBinding(checkBlock.bind, data) : false;
        
        if (mode === "instance") {
          return (
            <div className="flex items-center gap-2">
              <div
                className="border-2 border-gray-900"
                style={{
                  width: `${14 * scale}px`,
                  height: `${14 * scale}px`,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  backgroundColor: checkValue ? "#1f2937" : "white",
                }}
              >
                {checkValue && <span style={{ fontSize: `${11 * scale}px`, color: "white", fontWeight: "bold" }}>✓</span>}
              </div>
              <span style={{ fontSize: `${12 * scale}px`, fontWeight: 500 }}>{checkBlock.label}</span>
            </div>
          );
        }
        
        return (
          <div className="flex items-center gap-2">
            <div
              className="border border-gray-900"
              style={{
                width: `${12 * scale}px`,
                height: `${12 * scale}px`,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              {checkValue && <span style={{ fontSize: `${10 * scale}px` }}>✓</span>}
            </div>
            <span style={{ fontSize: `${12 * scale}px` }}>{checkBlock.label}</span>
          </div>
        );

      case "select":
        const selectBlock = block as any;
        const selectValue = selectBlock.bind ? getValueFromBinding(selectBlock.bind, data) : "";
        
        if (mode === "instance" && selectValue) {
          return (
            <div>
              <div className="text-xs font-medium mb-1 text-gray-600" style={{ fontSize: `${9 * scale}px` }}>
                {selectBlock.label}
              </div>
              <div style={{ fontSize: `${12 * scale}px`, fontWeight: 500 }}>
                {selectValue}
              </div>
            </div>
          );
        }
        
        return (
          <div>
            <div className="text-xs font-medium mb-1" style={{ fontSize: `${10 * scale}px` }}>
              {selectBlock.label}
            </div>
            <div
              className="border border-gray-900 rounded px-2"
              style={{
                minHeight: `${16 * scale}px`,
                fontSize: `${12 * scale}px`,
                display: "flex",
                alignItems: "center",
              }}
            >
              {selectValue || <span className="text-gray-400">Seleziona...</span>}
            </div>
          </div>
        );

      case "table":
      case "repeaterTable":
        const tableBlock = block as any;
        const columns = tableBlock.columns || [];
        const rows = tableBlock.type === "table" ? (tableBlock.rows || 3) : (tableBlock.minRows || 1);
        const totalFr = columns.reduce((sum: number, col: any) => sum + col.widthFr, 0);

        return (
          <div style={{ fontSize: `${12 * scale}px` }}>
            {tableBlock.label && (
              <div className="font-medium mb-1" style={{ fontSize: `${10 * scale}px` }}>
                {tableBlock.label}
              </div>
            )}
            <table className="w-full border-collapse border border-gray-900">
              <thead>
                <tr className="bg-gray-100">
                  {columns.map((col: any) => (
                    <th
                      key={col.id}
                      className="border border-gray-900 px-1 py-1 font-semibold"
                      style={{
                        width: `${(col.widthFr / totalFr) * 100}%`,
                        fontSize: `${10 * scale}px`,
                      }}
                    >
                      {col.header}
                      {col.required && <span className="text-red-500">*</span>}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {Array.from({ length: rows }).map((_, rowIdx) => (
                  <tr key={rowIdx}>
                    {columns.map((col: any) => (
                      <td
                        key={col.id}
                        className="border border-gray-900 px-1"
                        style={{
                          minHeight: `${16 * scale}px`,
                          fontSize: `${10 * scale}px`,
                        }}
                      >
                        &nbsp;
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
            {tableBlock.type === "repeaterTable" && (
              <div className="text-xs text-gray-500 mt-1" style={{ fontSize: `${9 * scale}px` }}>
                (righe aggiuntive in fase di compilazione)
              </div>
            )}
          </div>
        );

      case "signature":
        const sigBlock = block as any;
        
        // In mode "instance", cerca la firma corrispondente
        if (mode === "instance") {
          const signature = signatures.find(s => s.blockId === block.id);
          
          if (signature) {
            return (
              <div className="space-y-2">
                <div className="border border-gray-300 rounded p-1 bg-white">
                  <img
                    src={signature.signaturePngUrl}
                    alt="Firma"
                    className="max-w-full h-auto"
                    style={{ maxHeight: `${mmToPx(block.hMm || 20) * scale}px` }}
                  />
                </div>
                <div className="text-gray-600" style={{ fontSize: `${8 * scale}px` }}>
                  Firmato il: {signature.signedAtLocal} ({signature.tz})
                  <br />
                  Hash: <span className="font-mono">{signature.signatureHash.slice(0, 16)}…</span>
                </div>
              </div>
            );
          }
        }
        
        // Mode "template" o nessuna firma trovata
        return (
          <div
            className="border-2 border-dashed border-gray-400 rounded flex flex-col items-center justify-center"
            style={{ minHeight: `${30 * scale}px` }}
          >
            <div className="font-medium" style={{ fontSize: `${10 * scale}px` }}>
              {sigBlock.label || "Area firma"}
            </div>
            {sigBlock.role && (
              <div className="text-gray-500" style={{ fontSize: `${9 * scale}px` }}>
                ({sigBlock.role})
              </div>
            )}
          </div>
        );

      case "group":
        const groupBlock = block as any;
        return (
          <div className="border border-gray-400 rounded p-2 h-full">
            {groupBlock.title && (
              <div className="font-semibold mb-2" style={{ fontSize: `${10 * scale}px` }}>
                {groupBlock.title}
              </div>
            )}
            <div className="text-gray-400" style={{ fontSize: `${9 * scale}px` }}>
              Contenitore gruppo
            </div>
          </div>
        );

      case "divider":
        return <hr className="border-t-2 border-gray-900 m-0" />;

      case "spacer":
        return null;

      case "dynamicText":
        const dynBlock = block as any;
        const evaluated = replaceExpressions(dynBlock.expression || "", { data });
        return <span>{evaluated}</span>;

      default:
        return <div className="text-gray-400 text-xs">{block.type}</div>;
    }
  };

  return (
    <div className="document-renderer">
      {renderedPages.map((pageBlocks, pageIdx) => (
        <div
          key={pageIdx}
          className="page bg-white shadow-lg mx-auto mb-8 relative"
          style={{
            width: `${pageWidthPx}px`,
            height: `${pageHeightPx}px`,
            padding: `${marginTopPx}px ${marginRightPx}px ${marginBottomPx}px ${marginLeftPx}px`,
            breakAfter: "page",
          }}
        >
          {/* Griglia (opzionale) */}
          {showGrid && pageSettings.grid?.show && (
            <svg
              className="absolute inset-0 pointer-events-none"
              width={pageWidthPx}
              height={pageHeightPx}
              style={{ zIndex: 0 }}
            >
              {Array.from({ length: Math.floor(pageMm.w / (pageSettings.grid.stepMm || 5)) + 1 }).map((_, i) => {
                const x = mmToPx(i * (pageSettings.grid!.stepMm || 5)) * scale;
                return (
                  <line
                    key={`v-${i}`}
                    x1={x}
                    y1={0}
                    x2={x}
                    y2={pageHeightPx}
                    stroke="#eee"
                    strokeWidth="0.5"
                  />
                );
              })}
              {Array.from({ length: Math.floor(pageMm.h / (pageSettings.grid.stepMm || 5)) + 1 }).map((_, i) => {
                const y = mmToPx(i * (pageSettings.grid!.stepMm || 5)) * scale;
                return (
                  <line
                    key={`h-${i}`}
                    x1={0}
                    y1={y}
                    x2={pageWidthPx}
                    y2={y}
                    stroke="#eee"
                    strokeWidth="0.5"
                  />
                );
              })}
            </svg>
          )}

          {/* Margini visibili */}
          {showGrid && (
            <div
              className="absolute border-2 border-dashed border-blue-300 pointer-events-none"
              style={{
                left: `${marginLeftPx}px`,
                top: `${marginTopPx}px`,
                width: `calc(100% - ${marginLeftPx + marginRightPx}px)`,
                height: `calc(100% - ${marginTopPx + marginBottomPx}px)`,
                zIndex: 0,
              }}
            />
          )}

          {/* Intestazione */}
          {pageSettings.showHeader && pageSettings.headerContent && (
            <div
              className="absolute flex"
              style={{
                left: `${marginLeftPx}px`,
                top: `${mmToPx(pageSettings.marginTop - 2 - (pageSettings.headerHeight || 5)) * scale}px`,
                width: `calc(100% - ${marginLeftPx + marginRightPx}px)`,
                height: `${mmToPx(pageSettings.headerHeight || 5) * scale}px`,
                zIndex: 1,
                fontFamily: pageSettings.headerFontFamily || "Arial",
                fontSize: `${(pageSettings.headerFontSize || 10) * scale}pt`,
                fontWeight: pageSettings.headerBold ? "bold" : "normal",
                fontStyle: pageSettings.headerItalic ? "italic" : "normal",
                textAlign: pageSettings.headerAlign || "left",
                justifyContent: pageSettings.headerAlign === "center" ? "center" : pageSettings.headerAlign === "right" ? "flex-end" : "flex-start",
                alignItems: pageSettings.headerVerticalAlign === "top" ? "flex-start" : pageSettings.headerVerticalAlign === "bottom" ? "flex-end" : "center",
                paddingLeft: `${8 * scale}px`,
                paddingRight: `${8 * scale}px`,
                color: "#000",
                whiteSpace: "pre-wrap",
                wordWrap: "break-word",
                lineHeight: "1.2",
              }}
            >
              {pageSettings.headerContent}
            </div>
          )}

          {/* Piè di pagina */}
          {pageSettings.showFooter && pageSettings.footerContent && (
            <div
              className="absolute flex"
              style={{
                left: `${marginLeftPx}px`,
                top: `${mmToPx(pageSettings.marginTop + usableHMm + 2) * scale}px`,
                width: pageSettings.showPageNumbers 
                  ? `${mmToPx(usableWMm - 30 - 5) * scale}px`
                  : `${mmToPx(usableWMm) * scale}px`,
                height: `${mmToPx(pageSettings.footerHeight || 5) * scale}px`,
                zIndex: 1,
                fontFamily: pageSettings.footerFontFamily || "Arial",
                fontSize: `${(pageSettings.footerFontSize || 10) * scale}pt`,
                fontWeight: pageSettings.footerBold ? "bold" : "normal",
                fontStyle: pageSettings.footerItalic ? "italic" : "normal",
                textAlign: pageSettings.footerAlign || "left",
                justifyContent: pageSettings.footerAlign === "center" ? "center" : pageSettings.footerAlign === "right" ? "flex-end" : "flex-start",
                alignItems: pageSettings.footerVerticalAlign === "top" ? "flex-start" : pageSettings.footerVerticalAlign === "bottom" ? "flex-end" : "center",
                paddingLeft: `${8 * scale}px`,
                paddingRight: `${8 * scale}px`,
                color: "#000",
                whiteSpace: "pre-wrap",
                wordWrap: "break-word",
                lineHeight: "1.2",
              }}
            >
              {pageSettings.footerContent}
            </div>
          )}

          {/* Numero di pagina */}
          {pageSettings.showPageNumbers && (
            <div
              className="absolute flex items-center justify-end"
              style={{
                right: `${marginRightPx}px`,
                top: `${mmToPx(pageSettings.marginTop + usableHMm + 2) * scale}px`,
                width: `${mmToPx(30) * scale}px`,
                height: `${mmToPx(pageSettings.footerHeight || 5) * scale}px`,
                zIndex: 1,
                fontSize: `${10 * scale}pt`,
                color: "#000",
                fontWeight: "normal",
                textAlign: "right",
                paddingRight: `${8 * scale}px`,
              }}
            >
              Pagina {pageIdx + 1} / {totalPages}
            </div>
          )}

          {/* Blocchi */}
          <div className="relative" style={{ zIndex: 1 }}>
            {pageBlocks.map((block) => renderBlock(block, pageIdx + 1))}
          </div>
        </div>
      ))}

      <style jsx global>{`
        @media print {
          @page {
            size: A4 ${pageSettings.orientation};
            margin: 0;
          }
          .page {
            page-break-after: always;
            box-shadow: none !important;
          }
          body {
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
        }
        .prose h1, .prose h2, .prose h3, .prose p {
          margin: 0;
          padding: 0;
        }
      `}</style>
    </div>
  );
}

function evaluateCondition(expr: string, ctx: any): boolean {
  // Semplice parser per espressioni tipo "data.field === 'value'"
  // Per ora supporta solo uguaglianza base
  try {
    const parts = expr.split("===");
    if (parts.length === 2) {
      const left = parts[0].trim();
      const right = parts[1].trim().replace(/['"]/g, "");
      const leftValue = getValueFromBinding(left, ctx);
      return leftValue === right;
    }
    return true;
  } catch {
    return true;
  }
}

function getValueFromBinding(binding: string, ctx: any): any {
  try {
    const parts = binding.split(".");
    let result: any = ctx;
    
    for (const part of parts) {
      if (result && typeof result === "object" && part in result) {
        result = result[part];
      } else {
        return "";
      }
    }

    return result != null ? result : "";
  } catch {
    return "";
  }
}

