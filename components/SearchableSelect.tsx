"use client";

import { useState, useRef, useEffect } from "react";

export type SearchableSelectOption = {
  value: string;
  label: string;
};

type SearchableSelectProps = {
  options: SearchableSelectOption[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  emptyOption?: { value: string; label: string };
  className?: string;
  id?: string;
  disabled?: boolean;
};

export default function SearchableSelect({
  options,
  value,
  onChange,
  placeholder = "Cerca...",
  emptyOption,
  className = "",
  id,
  disabled = false,
}: SearchableSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);

  const displayLabel = emptyOption && value === emptyOption.value
    ? emptyOption.label
    : options.find((o) => o.value === value)?.label ?? "";

  const filteredOptions = search.trim()
    ? options.filter((o) =>
        o.label.toLowerCase().includes(search.toLowerCase())
      )
    : options;

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleSelect = (val: string) => {
    onChange(val);
    setIsOpen(false);
    setSearch("");
  };

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      <div
        onClick={() => !disabled && setIsOpen((o) => !o)}
        className={`flex items-center justify-between w-full pl-3 pr-4 py-2 h-10 border border-gray-300 rounded-lg text-sm cursor-pointer bg-white hover:border-gray-400 focus-within:ring-2 focus-within:ring-gray-500 focus-within:border-transparent ${
          disabled ? "opacity-50 cursor-not-allowed bg-gray-50" : ""
        }`}
      >
        <span className="text-gray-900 truncate">
          {isOpen ? (
            <input
              id={id}
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onFocus={(e) => e.target.select()}
              placeholder={placeholder}
              className="w-full min-w-0 bg-transparent border-none outline-none p-0 text-sm"
              autoFocus
            />
          ) : (
            displayLabel || placeholder
          )}
        </span>
        <svg
          className={`w-4 h-4 text-gray-500 shrink-0 ml-3 transition-transform ${isOpen ? "rotate-180" : ""}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </div>
      {isOpen && (
        <ul className="absolute z-50 w-full mt-1 max-h-60 overflow-auto bg-white border border-gray-200 rounded-lg shadow-lg py-1">
          {emptyOption && (
            <li
              onClick={() => handleSelect(emptyOption.value)}
              className={`px-3 py-2 text-sm cursor-pointer hover:bg-gray-100 ${
                value === emptyOption.value ? "bg-gray-100 font-medium" : ""
              }`}
            >
              {emptyOption.label}
            </li>
          )}
          {filteredOptions.map((opt) => (
            <li
              key={opt.value}
              onClick={() => handleSelect(opt.value)}
              className={`px-3 py-2 text-sm cursor-pointer hover:bg-gray-100 ${
                value === opt.value ? "bg-gray-100 font-medium" : ""
              }`}
            >
              {opt.label}
            </li>
          ))}
          {filteredOptions.length === 0 && (
            <li className="px-3 py-2 text-sm text-gray-500">Nessun risultato</li>
          )}
        </ul>
      )}
    </div>
  );
}
