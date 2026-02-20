"use client";

import React from "react";
import { Page } from "./types";
import { ChevronLeft, ChevronRight, Plus, Copy, Trash2 } from "lucide-react";

interface PageManagerProps {
  pages: Page[];
  currentPageIndex: number;
  onSelectPage: (index: number) => void;
  onAddPage: () => void;
  onDuplicatePage: (index: number) => void;
  onDeletePage: (index: number) => void;
  onMovePage: (fromIndex: number, toIndex: number) => void;
}

export default function PageManager({
  pages,
  currentPageIndex,
  onSelectPage,
  onAddPage,
  onDuplicatePage,
  onDeletePage,
  onMovePage,
}: PageManagerProps) {
  const canMoveLeft = currentPageIndex > 0;
  const canMoveRight = currentPageIndex < pages.length - 1;
  const canDelete = pages.length > 1;

  return (
    <div className="bg-white border-t border-gray-200 shadow-md py-4 px-4 my-8">
      <div className="flex items-center gap-3">
        {/* Pulsante Aggiungi Pagina */}
        <button
          onClick={onAddPage}
          className="flex items-center gap-2 px-3 py-2 bg-gray-900 text-white rounded hover:bg-gray-800 transition-colors text-sm font-medium"
          title="Aggiungi pagina"
        >
          <Plus size={16} />
          Aggiungi pagina
        </button>

        {/* Separatore */}
        <div className="h-8 w-px bg-gray-300" />

        {/* Miniature pagine */}
        <div className="flex-1 flex items-center gap-2 overflow-x-auto py-2">
          {pages.map((page, index) => (
            <div
              key={page.id}
              className={`relative flex-shrink-0 cursor-pointer border-2 rounded transition-all ${
                index === currentPageIndex
                  ? "border-gray-900 shadow-md"
                  : "border-gray-300 hover:border-gray-400"
              }`}
              onClick={() => onSelectPage(index)}
            >
              {/* Miniatura */}
              <div className="w-20 h-28 bg-gray-50 flex items-center justify-center text-gray-400 text-xs">
                <div className="text-center">
                  <div className="font-medium">Pagina {index + 1}</div>
                  <div className="text-[10px] mt-1">{page.blocks.length} blocchi</div>
                </div>
              </div>

              {/* Badge numero pagina */}
              <div
                className={`absolute -top-2.5 -right-2.5 w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                  index === currentPageIndex
                    ? "bg-gray-900 text-white"
                    : "bg-gray-300 text-gray-700"
                }`}
              >
                {index + 1}
              </div>
            </div>
          ))}
        </div>

        {/* Separatore */}
        <div className="h-8 w-px bg-gray-300" />

        {/* Controlli pagina corrente */}
        <div className="flex items-center gap-1">
          {/* Sposta a sinistra */}
          <button
            onClick={() => canMoveLeft && onMovePage(currentPageIndex, currentPageIndex - 1)}
            disabled={!canMoveLeft}
            className={`p-2 rounded transition-colors ${
              canMoveLeft
                ? "bg-gray-100 hover:bg-gray-200 text-gray-700"
                : "bg-gray-50 text-gray-300 cursor-not-allowed"
            }`}
            title="Sposta a sinistra"
          >
            <ChevronLeft size={18} />
          </button>

          {/* Sposta a destra */}
          <button
            onClick={() => canMoveRight && onMovePage(currentPageIndex, currentPageIndex + 1)}
            disabled={!canMoveRight}
            className={`p-2 rounded transition-colors ${
              canMoveRight
                ? "bg-gray-100 hover:bg-gray-200 text-gray-700"
                : "bg-gray-50 text-gray-300 cursor-not-allowed"
            }`}
            title="Sposta a destra"
          >
            <ChevronRight size={18} />
          </button>

          {/* Duplica */}
          <button
            onClick={() => onDuplicatePage(currentPageIndex)}
            className="p-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded transition-colors"
            title="Duplica pagina"
          >
            <Copy size={18} />
          </button>

          {/* Elimina */}
          <button
            onClick={() => canDelete && onDeletePage(currentPageIndex)}
            disabled={!canDelete}
            className={`p-2 rounded transition-colors ${
              canDelete
                ? "bg-red-50 hover:bg-red-100 text-red-600"
                : "bg-gray-50 text-gray-300 cursor-not-allowed"
            }`}
            title="Elimina pagina"
          >
            <Trash2 size={18} />
          </button>
        </div>
      </div>
    </div>
  );
}

