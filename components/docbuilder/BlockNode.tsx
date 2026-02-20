"use client";

import { useDraggable } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { Block, TableColumn } from "./types";
import { mmToPx } from "./mm";
import { useState } from "react";

interface BlockNodeProps {
  block: Block;
  selected: boolean;
  onSelect: () => void;
  onResize: (id: string, direction: "n" | "s" | "e" | "w", deltaXMm: number, deltaYMm: number) => void;
}

export default function BlockNode({ block, selected, onSelect, onResize }: BlockNodeProps) {
  const [resizing, setResizing] = useState<string | null>(null);
  const [tempSize, setTempSize] = useState<{ x: number; y: number; w: number; h: number } | null>(null);

  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: block.id,
    data: { block, fromCanvas: true },
    disabled: block.locked || resizing !== null,
  });

  const verticalAlignMap = {
    top: "flex-start",
    middle: "center",
    bottom: "flex-end",
  };

  const displayX = tempSize ? tempSize.x : block.xMm;
  const displayY = tempSize ? tempSize.y : block.yMm;
  const displayW = tempSize ? tempSize.w : block.wMm;
  const displayH = tempSize ? tempSize.h : (block.hMm || 10);

  // Per i blocchi titolo, il livello H1/H2/H3 determina dimensione e grassetto
  let effectiveFontSize = block.style?.fontSize || 12;
  let effectiveBold = block.style?.bold || false;
  
  if (block.type === "title") {
    const titleBlock = block as any;
    const level = titleBlock.level || "h1";
    
    // Il livello predomina sulla dimensione manuale
    if (level === "h1") {
      effectiveFontSize = 24;
      effectiveBold = true;
    } else if (level === "h2") {
      effectiveFontSize = 18;
      effectiveBold = true;
    } else if (level === "h3") {
      effectiveFontSize = 14;
      effectiveBold = true;
    }
    
    // Ma l'utente può comunque disabilitare il grassetto se vuole
    if (block.style?.bold === false) {
      effectiveBold = false;
    }
  }

  const style: React.CSSProperties = {
    position: "absolute",
    left: `${mmToPx(displayX)}px`,
    top: `${mmToPx(displayY)}px`,
    width: `${mmToPx(displayW)}px`,
    height: `${mmToPx(displayH)}px`,
    transform: resizing ? "none" : CSS.Translate.toString(transform),
    opacity: isDragging ? 0.5 : 1,
    zIndex: selected ? 1000 : block.z || 1,
    cursor: block.locked ? "default" : isDragging ? "move" : "pointer",
    fontFamily: block.style?.fontFamily || "Arial",
    fontSize: `${effectiveFontSize}pt`,
    fontWeight: effectiveBold ? "bold" : "normal",
    fontStyle: block.style?.italic ? "italic" : "normal",
    textAlign: block.style?.align || "left",
    padding: `${mmToPx(block.style?.paddingMm || 2)}px`,
    display: "flex",
    flexDirection: "column",
    justifyContent: verticalAlignMap[block.style?.verticalAlign || "top"],
  };

  const borderStyle = block.style?.border === "thin" ? "1px solid #ccc" : block.style?.border === "medium" ? "2px solid #999" : "none";

  const handleMouseDown = (e: React.MouseEvent, direction: "n" | "s" | "e" | "w") => {
    if (block.locked) return;
    e.stopPropagation();
    setResizing(direction);
    const startX = e.clientX;
    const startY = e.clientY;
    const startW = block.wMm;
    const startH = block.hMm || 10;
    let finalW = startW;
    let finalH = startH;

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const deltaXPx = moveEvent.clientX - startX;
      const deltaYPx = moveEvent.clientY - startY;
      const deltaXMm = deltaXPx / 3.78;
      const deltaYMm = deltaYPx / 3.78;

      let newX = block.xMm;
      let newY = block.yMm;
      let newW = startW;
      let newH = startH;

      if (direction === "e") {
        // Maniglia destra: allarga verso destra
        newW = Math.max(10, startW + deltaXMm);
      } else if (direction === "w") {
        // Maniglia sinistra: allarga verso sinistra (sposta X e aumenta W)
        newW = Math.max(10, startW - deltaXMm);
        newX = block.xMm + deltaXMm;
      } else if (direction === "s") {
        // Maniglia basso: allarga verso basso
        newH = Math.max(8, startH + deltaYMm);
      } else if (direction === "n") {
        // Maniglia alto: allarga verso alto (sposta Y e aumenta H)
        newH = Math.max(8, startH - deltaYMm);
        newY = block.yMm + deltaYMm;
      }

      finalW = newW;
      finalH = newH;
      
      // Aggiorna stato temporaneo con posizione E dimensioni
      setTempSize({ x: newX, y: newY, w: newW, h: newH });
    };

    const handleMouseUp = () => {
      // Al rilascio, applica le dimensioni finali
      onResize(block.id, direction, finalW, finalH);
      setResizing(null);
      setTempSize(null);
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
  };

  const renderContent = () => {
    switch (block.type) {
      case "header":
        return (
          <div className="flex items-center justify-between">
            {(block as any).logoUrl && (
              <div className="w-12 h-12 bg-gray-200 rounded flex items-center justify-center text-xs">
                Logo
              </div>
            )}
            <div className="flex-1">{(block as any).content || "Header"}</div>
          </div>
        );

      case "title":
        const titleBlock = block as any;
        return (
          <div>
            {titleBlock.text || "Titolo"}
          </div>
        );

      case "paragraph":
        return (
          <div
            className="prose prose-sm max-w-none"
            dangerouslySetInnerHTML={{ __html: (block as any).html || "<p>Paragrafo...</p>" }}
          />
        );

      case "text":
        const textBlock = block as any;
        return (
          <div>
            {textBlock.label && <div className="text-xs font-medium mb-1">{textBlock.label}</div>}
            <div className="border border-gray-300 rounded px-2 py-1 bg-gray-50 text-xs text-gray-400">
              {textBlock.placeholder || "Inserisci testo..."}
            </div>
            {textBlock.required && <span className="text-red-500 text-xs">*</span>}
          </div>
        );

      case "number":
        const numberBlock = block as any;
        return (
          <div>
            {numberBlock.label && <div className="text-xs font-medium mb-1">{numberBlock.label}</div>}
            <div className="border border-gray-300 rounded px-2 py-1 bg-gray-50 text-xs text-gray-400">
              0
            </div>
            {numberBlock.required && <span className="text-red-500 text-xs">*</span>}
          </div>
        );

      case "dateTime":
        const dateBlock = block as any;
        const placeholder = dateBlock.mode === "time" ? "HH:MM" : dateBlock.mode === "datetime" ? "DD/MM/YYYY HH:MM" : "DD/MM/YYYY";
        return (
          <div>
            {dateBlock.label && <div className="text-xs font-medium mb-1">{dateBlock.label}</div>}
            <div className="border border-gray-300 rounded px-2 py-1 bg-gray-50 text-xs text-gray-400">
              {placeholder}
            </div>
          </div>
        );

      case "checkbox":
        const checkboxBlock = block as any;
        return (
          <div className="flex items-center gap-2">
            <input type="checkbox" disabled className="w-4 h-4" />
            {checkboxBlock.label && <span className="text-xs">{checkboxBlock.label}</span>}
          </div>
        );

      case "select":
        const selectBlock = block as any;
        return (
          <div>
            {selectBlock.label && <div className="text-xs font-medium mb-1">{selectBlock.label}</div>}
            <select disabled className="w-full border border-gray-300 rounded px-2 py-1 bg-gray-50 text-xs">
              <option>Seleziona...</option>
              {(selectBlock.options || []).map((opt: string, i: number) => (
                <option key={i}>{opt}</option>
              ))}
            </select>
          </div>
        );

      case "table":
      case "repeaterTable":
        const tableBlock = block as any;
        const columns: TableColumn[] = tableBlock.columns || [];
        const rows = tableBlock.type === "table" ? (tableBlock.rows || 3) : (tableBlock.minRows || 1);
        const totalFr = columns.reduce((sum, col) => sum + col.widthFr, 0);

        return (
          <div className="text-xs">
            {tableBlock.label && <div className="font-medium mb-1">{tableBlock.label}</div>}
            <table className="w-full border-collapse" style={{ border: borderStyle }}>
              <thead>
                <tr className="bg-gray-100">
                  {columns.map((col) => (
                    <th
                      key={col.id}
                      className="border border-gray-300 px-1 py-0.5 text-xs font-semibold"
                      style={{ width: `${(col.widthFr / totalFr) * 100}%` }}
                    >
                      {col.header}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {Array.from({ length: rows }).map((_, rowIdx) => (
                  <tr key={rowIdx}>
                    {columns.map((col) => (
                      <td key={col.id} className="border border-gray-300 px-1 py-0.5 text-xs text-gray-400">
                        {col.type === "checkbox" ? "☐" : "-"}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );

      case "signature":
        const sigBlock = block as any;
        return (
          <div className="border-2 border-dashed border-gray-400 rounded p-2 text-center">
            <div className="text-xs font-medium">{sigBlock.label || "Firma"}</div>
            {sigBlock.role && <div className="text-xs text-gray-500">({sigBlock.role})</div>}
            <div className="text-xs text-gray-400 mt-1">Area firma</div>
          </div>
        );

      case "image":
        const imgBlock = block as any;
        return (
          <div className="border border-gray-300 rounded overflow-hidden bg-gray-50 flex items-center justify-center h-full">
            {imgBlock.imageUrl ? (
              <img src={imgBlock.imageUrl} alt={imgBlock.altText || "Immagine"} className="w-full h-full object-contain" />
            ) : (
              <div className="text-center p-2">
                <svg className="w-8 h-8 mx-auto text-gray-400 mb-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
                <div className="text-xs text-gray-500">Nessuna immagine</div>
              </div>
            )}
          </div>
        );

      case "group":
        const groupBlock = block as any;
        return (
          <div className="border border-gray-400 rounded p-2">
            <div className="text-xs font-semibold mb-1">{groupBlock.title || "Gruppo"}</div>
            <div className="text-xs text-gray-400">Contenitore gruppo</div>
          </div>
        );

      case "divider":
        return <hr className="border-t-2 border-gray-400" />;

      case "spacer":
        return <div className="bg-gray-100 w-full h-full flex items-center justify-center text-xs text-gray-400">Spazio</div>;

      case "dynamicText":
        const dynBlock = block as any;
        return (
          <div className="text-xs text-blue-600">
            {dynBlock.expression || "{espressione}"}
          </div>
        );

      case "pageBreak":
        return (
          <div className="border-t-4 border-dashed border-gray-400 flex items-center justify-center text-xs text-gray-500">
            --- Interruzione pagina ---
          </div>
        );

      default:
        return <div className="text-xs text-gray-400">{(block as { type: string }).type}</div>;
    }
  };

  return (
    <div
      ref={setNodeRef}
      style={{ ...style, border: borderStyle || undefined }}
      onClick={(e) => {
        e.stopPropagation();
        onSelect();
      }}
      className={`bg-gray-50 rounded transition-all border border-gray-300 ${
        selected ? "ring-2 ring-blue-500 shadow-lg" : "hover:ring-1 hover:ring-gray-400"
      } ${block.locked ? "opacity-75" : ""}`}
      {...(block.locked ? {} : { ...attributes, ...listeners })}
    >
      {/* Indicatore visibleIf */}
      {block.visibleIf && (
        <div className="absolute -top-2 -right-2 w-4 h-4 bg-purple-500 text-white rounded-full flex items-center justify-center text-xs font-bold">
          fx
        </div>
      )}

      {/* Contenuto */}
      <div className="pointer-events-none select-none overflow-hidden">
        {renderContent()}
      </div>

      {/* Maniglie resize (solo se selezionato e non locked) */}
      {selected && !block.locked && (
        <>
          {/* Nord */}
          <div
            onMouseDown={(e) => handleMouseDown(e, "n")}
            className="absolute -top-1 left-1/2 -translate-x-1/2 w-3 h-3 bg-blue-500 border border-white rounded-full cursor-ns-resize pointer-events-auto"
          />
          {/* Sud */}
          <div
            onMouseDown={(e) => handleMouseDown(e, "s")}
            className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-3 h-3 bg-blue-500 border border-white rounded-full cursor-ns-resize pointer-events-auto"
          />
          {/* Est */}
          <div
            onMouseDown={(e) => handleMouseDown(e, "e")}
            className="absolute top-1/2 -translate-y-1/2 -right-1 w-3 h-3 bg-blue-500 border border-white rounded-full cursor-ew-resize pointer-events-auto"
          />
          {/* Ovest */}
          <div
            onMouseDown={(e) => handleMouseDown(e, "w")}
            className="absolute top-1/2 -translate-y-1/2 -left-1 w-3 h-3 bg-blue-500 border border-white rounded-full cursor-ew-resize pointer-events-auto"
          />
        </>
      )}
    </div>
  );
}
