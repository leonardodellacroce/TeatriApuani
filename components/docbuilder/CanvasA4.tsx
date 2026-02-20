"use client";

import { useDroppable } from "@dnd-kit/core";
import { Block, PageSettings } from "./types";
import { mmToPx, getPageMm, snapToGrid } from "./mm";
import BlockNode from "./BlockNode";
import { useState } from "react";

interface CanvasA4Props {
  page: PageSettings;
  blocks: Block[];
  selectedId?: string;
  onAddBlock: (b: Block) => void;
  onUpdateBlock: (id: string, patch: Partial<Block>) => void;
  onSelectBlock: (id?: string) => void;
  onDeleteBlock: (id: string) => void;
  onUpdatePageSettings: (patch: Partial<PageSettings>) => void;
  zoom?: number;
}

export default function CanvasA4({
  page,
  blocks,
  selectedId,
  onAddBlock,
  onUpdateBlock,
  onSelectBlock,
  onDeleteBlock,
  onUpdatePageSettings,
  zoom = 1,
}: CanvasA4Props) {
  const { setNodeRef } = useDroppable({
    id: "canvas-dropzone",
  });


  const pageMm = getPageMm(page.orientation);
  const pageWidthPx = mmToPx(pageMm.w);
  const pageHeightPx = mmToPx(pageMm.h);

  // Area utile (dentro i margini)
  const usableXMm = page.marginLeft;
  const usableYMm = page.marginTop;
  const usableWMm = pageMm.w - page.marginLeft - page.marginRight;
  const usableHMm = pageMm.h - page.marginTop - page.marginBottom;

  const handleCanvasClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) {
      onSelectBlock(undefined);
    }
  };

  const handleResize = (id: string, direction: "n" | "s" | "e" | "w", newW: number, newH: number) => {
    const block = blocks.find((b) => b.id === id);
    if (!block) return;

    console.log("Resize:", { id, direction, oldX: block.xMm, oldY: block.yMm, oldW: block.wMm, oldH: block.hMm, newW, newH });

    const gridSnap = page.grid?.snap && page.grid?.stepMm ? page.grid.stepMm : 1;

    // Snap alla griglia solo per le dimensioni
    if (page.grid?.snap) {
      newW = snapToGrid(newW, gridSnap);
      newH = snapToGrid(newH, gridSnap);
    }

    // Limiti ai margini per le dimensioni
    newW = Math.min(newW, usableXMm + usableWMm - block.xMm);
    newH = Math.min(newH, usableYMm + usableHMm - block.yMm);

    console.log("After snap/limits:", { newW, newH, xMm: block.xMm, yMm: block.yMm });

    // Aggiorna solo le dimensioni, X e Y rimangono invariati
    onUpdateBlock(id, { wMm: newW, hMm: newH });
  };

  return (
    <div className="flex-1 bg-gray-100 rounded-lg overflow-auto flex items-center justify-center p-8">
      <div
        ref={setNodeRef}
        data-canvas="true"
        className="bg-white border border-gray-300 shadow-lg relative"
        style={{
          width: `${pageWidthPx}px`,
          height: `${pageHeightPx}px`,
          transform: `scale(${zoom})`,
          transformOrigin: "top left",
        }}
        onClick={handleCanvasClick}
      >
        {/* Griglia */}
        {page.grid?.show && (
          <svg
            className="absolute inset-0 pointer-events-none"
            width={pageWidthPx}
            height={pageHeightPx}
            style={{ zIndex: 0 }}
          >
            {Array.from({ length: Math.floor(pageMm.w / (page.grid.stepMm || 5)) + 1 }).map((_, i) => {
              const x = mmToPx(i * (page.grid!.stepMm || 5));
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
            {Array.from({ length: Math.floor(pageMm.h / (page.grid.stepMm || 5)) + 1 }).map((_, i) => {
              const y = mmToPx(i * (page.grid!.stepMm || 5));
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

        {/* Margini (area non utilizzabile) */}
        <div
          className="absolute border-2 border-dashed border-red-500 pointer-events-none"
          style={{
            left: `${mmToPx(page.marginLeft)}px`,
            top: `${mmToPx(page.marginTop)}px`,
            width: `${mmToPx(usableWMm)}px`,
            height: `${mmToPx(usableHMm)}px`,
            zIndex: 0,
          }}
        />

        {/* Intestazione (se abilitata) */}
        {page.showHeader && (
          <div
            className="absolute border border-dashed border-blue-500 bg-blue-50 bg-opacity-30 cursor-text overflow-y-auto"
            contentEditable
            suppressContentEditableWarning
            onBlur={(e) => {
              const text = e.currentTarget.innerText || "";
              if (text !== page.headerContent) {
                onUpdatePageSettings({ headerContent: text });
              }
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                document.execCommand("insertLineBreak");
              }
            }}
            onClick={(e) => e.stopPropagation()}
            style={{
              left: `${mmToPx(page.marginLeft)}px`,
              top: `${mmToPx(page.marginTop - 2 - (page.headerHeight || 5))}px`,
              width: `${mmToPx(usableWMm)}px`,
              height: `${mmToPx(page.headerHeight || 5)}px`,
              zIndex: 1,
              paddingLeft: "8px",
              paddingRight: "8px",
              paddingTop: page.headerVerticalAlign === "top" ? "4px" : undefined,
              paddingBottom: page.headerVerticalAlign === "bottom" ? "4px" : undefined,
              fontFamily: page.headerFontFamily || "Arial",
              fontSize: `${page.headerFontSize || 10}pt`,
              fontWeight: page.headerBold ? "bold" : "normal",
              fontStyle: page.headerItalic ? "italic" : "normal",
              textAlign: page.headerAlign || "left",
              lineHeight: "1.2",
              color: "#1e40af",
              display: page.headerVerticalAlign !== "top" ? "flex" : "block",
              flexDirection: page.headerVerticalAlign !== "top" ? "column" : undefined,
              justifyContent: page.headerVerticalAlign === "middle" ? "center" : page.headerVerticalAlign === "bottom" ? "flex-end" : undefined,
              whiteSpace: "pre-wrap",
            }}
            dangerouslySetInnerHTML={{ __html: (page.headerContent || "").replace(/\n/g, "<br>") }}
          />
        )}

        {/* Piè di pagina (se abilitato) */}
        {page.showFooter && (
          <div
            className="absolute border border-dashed border-blue-500 bg-blue-50 bg-opacity-30 cursor-text overflow-y-auto"
            contentEditable
            suppressContentEditableWarning
            onBlur={(e) => {
              const text = e.currentTarget.innerText || "";
              if (text !== page.footerContent) {
                onUpdatePageSettings({ footerContent: text });
              }
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                document.execCommand("insertLineBreak");
              }
            }}
            onClick={(e) => e.stopPropagation()}
            style={{
              left: `${mmToPx(page.marginLeft)}px`,
              top: `${mmToPx(page.marginTop + usableHMm + 2)}px`,
              width: `${mmToPx(page.showPageNumbers ? usableWMm - 30 - 5 : usableWMm)}px`,
              height: `${mmToPx(page.footerHeight || 5)}px`,
              zIndex: 1,
              paddingLeft: "8px",
              paddingRight: "8px",
              paddingTop: page.footerVerticalAlign === "top" ? "4px" : undefined,
              paddingBottom: page.footerVerticalAlign === "bottom" ? "4px" : undefined,
              fontFamily: page.footerFontFamily || "Arial",
              fontSize: `${page.footerFontSize || 10}pt`,
              fontWeight: page.footerBold ? "bold" : "normal",
              fontStyle: page.footerItalic ? "italic" : "normal",
              textAlign: page.footerAlign || "left",
              lineHeight: "1.2",
              color: "#1e40af",
              display: page.footerVerticalAlign !== "top" ? "flex" : "block",
              flexDirection: page.footerVerticalAlign !== "top" ? "column" : undefined,
              justifyContent: page.footerVerticalAlign === "middle" ? "center" : page.footerVerticalAlign === "bottom" ? "flex-end" : undefined,
              whiteSpace: "pre-wrap",
            }}
            dangerouslySetInnerHTML={{ __html: (page.footerContent || "").replace(/\n/g, "<br>") }}
          />
        )}

        {/* Numero di pagina (se abilitato) */}
        {page.showPageNumbers && (
          <div
            className="absolute border border-dashed border-orange-500 bg-orange-50 bg-opacity-30 flex items-center justify-end px-2"
            style={{
              right: `${mmToPx(page.marginRight)}px`,
              top: `${mmToPx(page.marginTop + usableHMm + 2)}px`,
              width: `${mmToPx(30)}px`,
              height: `${mmToPx(page.footerHeight || 5)}px`,
              zIndex: 1,
              fontSize: "10pt",
              color: "#ea580c",
              fontWeight: "500",
              textAlign: "right",
            }}
          >
            # pagina
          </div>
        )}

        {/* Blocchi */}
        {blocks.map((block) => (
          <BlockNode
            key={block.id}
            block={block}
            selected={block.id === selectedId}
            onSelect={() => onSelectBlock(block.id)}
            onResize={handleResize}
          />
        ))}
      </div>
      
      <style jsx>{`
        [contentEditable][data-placeholder]:empty:before {
          content: attr(data-placeholder);
          color: #93c5fd;
          opacity: 0.6;
        }
      `}</style>
    </div>
  );
}

