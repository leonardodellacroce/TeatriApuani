"use client";

import { useRef, useId } from "react";
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
 * Usa label per garantire tap su tutto il box su mobile.
 * Il bordo usa outline per evitare glitch di rendering su PC.
 */
export default function DateInput({
  value,
  onChange,
  name,
  id: idProp,
  required = false,
  placeholder = "gg/mm/aaaa",
  className = "",
  disabled = false,
  min,
  max,
}: DateInputProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const generatedId = useId();
  const id = idProp ?? generatedId;

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

  const handleFocus = () => {
    if (disabled) return;
    inputRef.current?.showPicker?.();
  };

  return (
    <div className="relative w-full min-w-0 overflow-hidden rounded-lg focus-within:ring-2 focus-within:ring-inset focus-within:ring-gray-900">
      <label
        htmlFor={id}
        className={`block w-full min-w-0 px-3 h-11 border border-gray-300 rounded-lg text-sm flex items-center justify-between cursor-pointer bg-white hover:border-gray-400 text-left ${className} ${
          disabled ? "opacity-50 cursor-not-allowed bg-gray-50 pointer-events-none" : ""
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
        />
      </label>
      <input
        ref={inputRef}
        type="date"
        value={value}
        onChange={onChange}
        onFocus={handleFocus}
        name={name}
        id={id}
        required={required}
        disabled={disabled}
        min={min}
        max={max}
        className="absolute w-px h-px p-0 -m-px overflow-hidden whitespace-nowrap border-0 [clip:rect(0,0,0,0)] pointer-events-none opacity-0"
        aria-hidden
        tabIndex={-1}
      />
    </div>
  );
}
