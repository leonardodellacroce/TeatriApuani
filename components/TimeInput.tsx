"use client";

import { useRef, useId } from "react";

type TimeInputProps = {
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  name?: string;
  id?: string;
  required?: boolean;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
  onBlur?: (e: React.FocusEvent<HTMLInputElement>) => void;
};

/**
 * TimeInput: trigger stilizzato + input nativo nascosto.
 * Usa label per garantire tap su tutto il box su mobile.
 * Il bordo usa outline per evitare glitch di rendering su PC.
 */
export default function TimeInput({
  value,
  onChange,
  name,
  id: idProp,
  required = false,
  placeholder = "hh:mm",
  className = "",
  disabled = false,
  onBlur,
}: TimeInputProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const generatedId = useId();
  const id = idProp ?? generatedId;

  const displayValue = value || "";
  const showPlaceholder = !value;

  const handleFocus = () => {
    if (disabled) return;
    inputRef.current?.showPicker?.();
  };

  return (
    <div className="relative w-full min-w-0 overflow-hidden rounded-lg focus-within:ring-2 focus-within:ring-inset focus-within:ring-gray-900">
      {/* Display sempre visibile (sotto l'input) */}
      <div
        className={`flex items-center justify-between w-full min-w-0 px-3 h-11 border border-gray-300 rounded-lg text-sm cursor-pointer bg-white hover:border-gray-400 text-left ${className} ${
          disabled ? "opacity-50 cursor-not-allowed bg-gray-50" : ""
        }`}
      >
        <span className={showPlaceholder ? "text-gray-500" : "text-gray-900"}>
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
          <circle cx="12" cy="12" r="10" />
          <polyline points="12 6 12 12 16 14" />
        </svg>
      </div>
      {/* Input overlay: riceve tap, apre picker, non mostra display nativo (opacity-0) */}
      <input
        ref={inputRef}
        type="time"
        value={value}
        onChange={onChange}
        onFocus={handleFocus}
        onBlur={onBlur}
        name={name}
        id={id}
        required={required}
        disabled={disabled}
        className={`absolute inset-0 w-full h-full opacity-0 cursor-pointer ${disabled ? "pointer-events-none" : ""}`}
        aria-label={placeholder}
        tabIndex={disabled ? -1 : 0}
      />
    </div>
  );
}
