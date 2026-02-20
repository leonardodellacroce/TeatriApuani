import { DocTemplateJson } from "@/components/docbuilder/types";
import { mmToPx, getPageMm } from "@/components/docbuilder/mm";
import { replaceExpressions } from "@/components/docbuilder/expr";

export function renderTemplateHtml(
  template: DocTemplateJson,
  data: any = {},
  options: { 
    scale?: number; 
    mode?: "template" | "instance";
    signatures?: Array<{
      blockId: string;
      signaturePngUrl: string;
      signatureHash: string;
      signedAtLocal: string;
      tz: string;
    }>;
  } = {}
): string {
  const { scale = 1, mode = "template", signatures = [] } = options;
  const { pageSettings, pages } = template;
  const pageMm = getPageMm(pageSettings.orientation);
  const pageWidthPx = mmToPx(pageMm.w);
  const pageHeightPx = mmToPx(pageMm.h);

  const marginTopPx = mmToPx(pageSettings.marginTop);
  const marginRightPx = mmToPx(pageSettings.marginRight);
  const marginBottomPx = mmToPx(pageSettings.marginBottom);
  const marginLeftPx = mmToPx(pageSettings.marginLeft);

  // Converti le pagine in array di blocchi ordinati per z
  const renderedPages = pages.map(page => 
    [...page.blocks].sort((a, b) => (a.z || 0) - (b.z || 0))
  );

  const totalPages = renderedPages.length;

  const renderBlock = (block: any): string => {
    const styleStr = `
      position: absolute;
      left: ${mmToPx(block.xMm)}px;
      top: ${mmToPx(block.yMm)}px;
      width: ${mmToPx(block.wMm)}px;
      ${block.hMm ? `height: ${mmToPx(block.hMm)}px;` : ""}
      font-family: ${block.style?.fontFamily || "Arial"};
      font-size: ${block.style?.fontSize || 12}pt;
      font-weight: ${block.style?.bold ? "bold" : "normal"};
      font-style: ${block.style?.italic ? "italic" : "normal"};
      text-align: ${block.style?.align || "left"};
      padding: ${mmToPx(block.style?.paddingMm || 2)}px;
      ${
        block.style?.border === "thin"
          ? "border: 1px solid #ccc;"
          : block.style?.border === "medium"
          ? "border: 2px solid #999;"
          : ""
      }
      overflow: hidden;
      box-sizing: border-box;
    `.trim();

    let content = "";

    switch (block.type) {
      case "header":
        content = `
          <div style="display: flex; align-items: center; justify-content: space-between; height: 100%;">
            ${block.logoUrl ? `<img src="${block.logoUrl}" alt="Logo" style="height: 100%; object-fit: contain; max-width: 20%;" />` : ""}
            <div style="flex: 1;">${replaceExpressions(block.content || "", { data })}</div>
          </div>
        `;
        break;

      case "title":
        const titleSize = block.level === "h1" ? "24pt" : block.level === "h2" ? "20pt" : "16pt";
        content = `<${block.level || "h1"} style="margin: 0; padding: 0; font-size: ${titleSize}; line-height: 1.2;">${replaceExpressions(block.text || "", { data })}</${block.level || "h1"}>`;
        break;

      case "paragraph":
        content = `<div class="prose">${replaceExpressions(block.html || "", { data })}</div>`;
        break;

      case "text":
        const textValue = mode === "instance" && block.bind ? getValueFromData(block.bind, data) : "";
        content = `
          <div>
            <div style="font-size: 10px; font-weight: 500; margin-bottom: 4px;">
              ${block.label}${block.required ? '<span style="color: red;">*</span>' : ""}
            </div>
            <div style="border-bottom: 1px solid #000; min-height: ${block.multiline ? "40px" : "20px"}; padding-bottom: 2px;">
              ${textValue ? `<span>${textValue}</span>` : ""}
            </div>
          </div>
        `;
        break;

      case "number":
        const numValue = mode === "instance" && block.bind ? getValueFromData(block.bind, data) : "";
        content = `
          <div>
            <div style="font-size: 10px; font-weight: 500; margin-bottom: 4px;">
              ${block.label}${block.required ? '<span style="color: red;">*</span>' : ""}
            </div>
            <div style="border-bottom: 1px solid #000; min-height: 20px; padding-bottom: 2px;">
              ${numValue ? `<span>${numValue}</span>` : ""}
            </div>
          </div>
        `;
        break;

      case "dateTime":
        const dateValue = mode === "instance" && block.bind ? getValueFromData(block.bind, data) : "";
        content = `
          <div>
            <div style="font-size: 10px; font-weight: 500; margin-bottom: 4px;">${block.label}</div>
            <div style="border-bottom: 1px solid #000; min-height: 20px; padding-bottom: 2px;">
              ${dateValue ? `<span>${dateValue}</span>` : ""}
            </div>
          </div>
        `;
        break;

      case "checkbox":
        const checkValue = mode === "instance" && block.bind ? getValueFromData(block.bind, data) : false;
        content = `
          <div style="display: flex; align-items: center; gap: 8px;">
            <div style="width: 12px; height: 12px; border: 1px solid #000; display: flex; align-items: center; justify-content: center;">
              ${checkValue ? "✓" : ""}
            </div>
            <span>${block.label}</span>
          </div>
        `;
        break;

      case "select":
        const selectValue = mode === "instance" && block.bind ? getValueFromData(block.bind, data) : "";
        content = `
          <div>
            <div style="font-size: 10px; font-weight: 500; margin-bottom: 4px;">${block.label}</div>
            <div style="border: 1px solid #000; border-radius: 4px; padding: 4px 8px; min-height: 24px;">
              ${selectValue || '<span style="color: #999;">Seleziona...</span>'}
            </div>
          </div>
        `;
        break;

      case "table":
      case "repeaterTable":
        const columns = block.columns || [];
        const rows = block.type === "table" ? (block.rows || 3) : (block.minRows || 1);
        const totalFr = columns.reduce((sum: number, col: any) => sum + col.widthFr, 0);
        
        const tableRows = Array.from({ length: rows })
          .map(
            (_, rowIdx) =>
              `<tr>${columns.map((col: any) => `<td style="border: 1px solid #000; padding: 4px; min-height: 20px; font-size: 10px;">&nbsp;</td>`).join("")}</tr>`
          )
          .join("");

        content = `
          <div>
            ${block.label ? `<div style="font-size: 10px; font-weight: 500; margin-bottom: 4px;">${block.label}</div>` : ""}
            <table style="width: 100%; border-collapse: collapse; border: 1px solid #000;">
              <thead>
                <tr style="background-color: #f3f4f6;">
                  ${columns
                    .map(
                      (col: any) =>
                        `<th style="border: 1px solid #000; padding: 4px; font-size: 10px; font-weight: 600; width: ${(col.widthFr / totalFr) * 100}%;">${col.header}${col.required ? '<span style="color: red;">*</span>' : ""}</th>`
                    )
                    .join("")}
                </tr>
              </thead>
              <tbody>
                ${tableRows}
              </tbody>
            </table>
            ${block.type === "repeaterTable" ? '<div style="font-size: 9px; color: #666; margin-top: 4px;">(righe aggiuntive in fase di compilazione)</div>' : ""}
          </div>
        `;
        break;

      case "signature":
        // In mode "instance", cerca la firma corrispondente
        if (mode === "instance") {
          const signature = signatures.find(s => s.blockId === block.id);
          
          if (signature) {
            content = `
              <div>
                <div style="border: 1px solid #ccc; border-radius: 4px; padding: 4px; background: white;">
                  <img src="${signature.signaturePngUrl}" alt="Firma" style="max-width: 100%; max-height: ${mmToPx(block.hMm || 20)}px; height: auto;" />
                </div>
                <div style="font-size: 8px; color: #666; margin-top: 4px;">
                  Firmato il: ${signature.signedAtLocal} (${signature.tz})<br/>
                  Hash: <span style="font-family: monospace;">${signature.signatureHash.slice(0, 16)}…</span>
                </div>
              </div>
            `;
            break;
          }
        }
        
        // Mode "template" o nessuna firma trovata
        content = `
          <div style="border: 2px dashed #999; border-radius: 4px; padding: 8px; text-align: center; min-height: 40px; display: flex; flex-direction: column; align-items: center; justify-content: center;">
            <div style="font-size: 10px; font-weight: 500;">${block.label || "Area firma"}</div>
            ${block.role ? `<div style="font-size: 9px; color: #666;">(${block.role})</div>` : ""}
          </div>
        `;
        break;

      case "group":
        content = `
          <div style="border: 1px solid #999; border-radius: 4px; padding: 8px; height: 100%;">
            ${block.title ? `<div style="font-size: 10px; font-weight: 600; margin-bottom: 8px;">${block.title}</div>` : ""}
            <div style="font-size: 9px; color: #999;">Contenitore gruppo</div>
          </div>
        `;
        break;

      case "divider":
        content = `<hr style="border: none; border-top: 2px solid #000; margin: 0;" />`;
        break;

      case "spacer":
        content = "";
        break;

      case "dynamicText":
        const evaluated = replaceExpressions(block.expression || "", { data });
        content = `<span>${evaluated}</span>`;
        break;

      default:
        content = `<div style="font-size: 10px; color: #999;">${block.type}</div>`;
    }

    return `<div style="${styleStr}">${content}</div>`;
  };

  const pagesHtml = renderedPages
    .map(
      (pageBlocks, pageIdx) => `
    <div class="page" style="width: ${pageWidthPx}px; height: ${pageHeightPx}px; position: relative; padding: ${marginTopPx}px ${marginRightPx}px ${marginBottomPx}px ${marginLeftPx}px; background-color: white; margin: 0 auto; box-sizing: border-box; break-after: page;">
      ${pageBlocks.map((block) => renderBlock(block)).join("")}
      ${
        pageSettings.showPageNumbers
          ? `<div style="position: absolute; bottom: ${marginBottomPx / 2}px; right: ${marginRightPx}px; font-size: 10px; color: #666;">Pagina ${pageIdx + 1} / ${totalPages}</div>`
          : ""
      }
    </div>
  `
    )
    .join("");

  const css = `
    @page {
      size: A4 ${pageSettings.orientation};
      margin: 0;
    }
    * {
      box-sizing: border-box;
    }
    body {
      margin: 0;
      padding: 0;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
      font-family: Arial, sans-serif;
    }
    .page {
      break-after: page;
    }
    @media print {
      .page {
        box-shadow: none !important;
      }
    }
    h1, h2, h3, p {
      margin: 0;
      padding: 0;
    }
    table {
      border-collapse: collapse;
    }
    .prose p {
      margin: 0 0 0.5em 0;
    }
    .prose ul, .prose ol {
      margin: 0.5em 0;
      padding-left: 1.5em;
    }
  `;

  return `
<!DOCTYPE html>
<html lang="it">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <base href="{{origin}}" />
    <title>${template.title || "Documento"}</title>
    <style>${css}</style>
  </head>
  <body>
    ${pagesHtml}
  </body>
</html>
  `.trim();
}

function getValueFromData(binding: string, data: any): any {
  try {
    const parts = binding.split(".");
    let result: any = data;

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

