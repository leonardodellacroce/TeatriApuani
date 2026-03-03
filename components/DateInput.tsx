"use client";

import { useRef } from "react";
import { format, parse, isValid } from "date-fns";
import { it } from "date-fns/locale";

type DateInputProps = {
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  name: string;
  id?: string;
  required?: boolean;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
  min?: string;
  max?: string;
};

/**
 * DateInput: trigger stilizzato + input nativo nascosto.
 * Risolve problemi di larghezza, allineamento e font su Safari iOS.
 * Il tap apre il date picker nativo; il valore è mostrato con stile uniforme.
 */
export default function DateInput({
  value,
  onChange,
  name,
  id,
  required = false,
  placeholder = "gg/mm/aaaa",
  className = "",
  disabled = false,
  min,
  max,
}: DateInputProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  const displayValue = value
    ? (() => {
        try {
          const d = parse(value, "yyyy-MM-dd", new Date());
          return isValid(d) ? format(d, "dd/MM/yyyy", { locale: it }) : value;
        } catch {
          return value;
        }
      })()
    : "";

  const handleClick = () => {
    if (disabled) return;
    inputRef.current?.showPicker?.();
  };

  return (
    <div className="relative w-full min-w-0">
      <button
        type="button"
        onClick={handleClick}
        disabled={disabled}
        className={`w-full min-w-0 px-3 h-11 border border-gray-300 rounded-lg text-sm flex items-center justify-between cursor-pointer bg-white hover:border-gray-400 focus:ring-2 focus:ring-gray-900 focus:border-transparent focus:outline-none text-left ${className} ${
          disabled ? "opacity-50 cursor-not-allowed bg-gray-50" : ""
        }`}
      >
        <span className={displayValue ? "text-gray-900" : "text-gray-500"}>
          {displayValue || placeholder}
        </span>
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="text-gray-400 flex-shrink-0 ml-2"
          aria-hidden
        >
          <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
          <line x1="16" y1="2" x2="16" y2="6" />
          <line x1="8" y1="2" x2="8" y2="6" />
          <line x1="3" y1="10" x2="21" y2="10" />
        </svg>
      </button>
      <input
        ref={inputRef}
        type="date"
        value={value}
        onChange={onChange}
        name={name}
        id={id}
        required={required}
        disabled={disabled}
        min={min}
        max={max}
        className="absolute w-px h-px p-0 -m-px overflow-hidden whitespace-nowrap border-0 [clip:rect(0,0,0,0)] pointer-events-none"
        aria-hidden
        tabIndex={-1}
      />
    </div>
  );
}
