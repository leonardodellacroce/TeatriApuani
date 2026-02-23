"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

interface AlertDialogProps {
  isOpen: boolean;
  title?: string;
  message: React.ReactNode;
  onClose: () => void;
  /** Larghezza: sm (max-w-md), lg (max-w-lg) */
  size?: "sm" | "lg";
}

export default function AlertDialog({
  isOpen,
  title = "Attenzione",
  message,
  onClose,
  size = "sm",
}: AlertDialogProps) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Enter" || event.key === "Escape") {
        event.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen || !mounted) {
    return null;
  }

  const maxWidthClass = size === "lg" ? "max-w-lg" : "max-w-md";
  const dialogContent = (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[9999]">
      <div className={`bg-white rounded-lg shadow-xl p-6 ${maxWidthClass} w-full mx-4`}>
        <h2 className="text-xl font-bold mb-4 text-gray-900">{title}</h2>
        <div className="mb-6 text-gray-700">{message}</div>
        <div className="flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-gray-900 text-white rounded-lg hover:bg-gray-800 hover:shadow-lg transition-all duration-200 cursor-pointer"
          >
            Ok
          </button>
        </div>
      </div>
    </div>
  );

  return createPortal(dialogContent, document.body);
}
