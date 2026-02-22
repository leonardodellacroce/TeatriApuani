"use client";

import { useState } from "react";
import { COLOR_PALETTE } from "@/lib/color-palette";

interface ColorSelectorProps {
  selectedColor: string | null;
  onChange: (color: string | null) => void;
}

export default function ColorSelector({ selectedColor, onChange }: ColorSelectorProps) {
  const [showSelector, setShowSelector] = useState(false);

  const handleColorSelect = (color: string) => {
    onChange(color === selectedColor ? null : color);
    setShowSelector(false);
  };

  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-2">
        Colore
      </label>
      <div className="relative">
        <button
          type="button"
          onClick={() => setShowSelector(!showSelector)}
          className="w-full px-4 py-2 border border-gray-300 rounded-lg bg-white hover:border-gray-400 hover:shadow-md hover:bg-gray-50 focus:ring-2 focus:ring-gray-900 focus:border-transparent transition-all duration-200 cursor-pointer flex items-center justify-between"
        >
          <div className="flex items-center gap-2">
            {selectedColor ? (
              <>
                <div
                  className="w-6 h-6 rounded border border-gray-300"
                  style={{ backgroundColor: selectedColor }}
                />
                <span>
                  {COLOR_PALETTE.find(c => c.value === selectedColor)?.name || selectedColor}
                </span>
              </>
            ) : (
              <span className="text-gray-500">Seleziona un colore</span>
            )}
          </div>
          <svg
            className={`w-5 h-5 text-gray-500 transform transition-transform ${
              showSelector ? "rotate-180" : ""
            }`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>

        {showSelector && (
          <>
            <div
              className="fixed inset-0 z-10"
              onClick={() => setShowSelector(false)}
            />
            <div className="absolute z-20 mt-1 w-full bg-white border border-gray-300 rounded-lg shadow-lg p-3">
              <div className="grid grid-cols-8 gap-2">
                {COLOR_PALETTE.map((color) => (
                  <button
                    key={color.value}
                    type="button"
                    onClick={() => handleColorSelect(color.value)}
                    className={`
                      w-10 h-10 rounded border-2 transition-all hover:scale-110
                      ${
                        selectedColor === color.value
                          ? "border-gray-900 ring-2 ring-gray-300"
                          : "border-gray-200"
                      }
                    `}
                    style={{ backgroundColor: color.value }}
                    title={color.name}
                  />
                ))}
              </div>
              <div className="mt-3 pt-3 border-t border-gray-200">
                <button
                  type="button"
                  onClick={() => handleColorSelect("")}
                  className="w-full text-sm text-gray-600 hover:text-gray-900 text-center"
                >
                  Nessun colore
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}


