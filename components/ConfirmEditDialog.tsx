"use client";

import React, { useEffect } from "react";

interface ConfirmEditDialogProps {
  isOpen: boolean;
  title: string;
  oldData: Record<string, any>;
  newData: Record<string, any>;
  fieldLabels: Record<string, string>;
  /** Mappa campo -> funzione per formattare il valore in stringa leggibile (es. ID azienda -> ragione sociale) */
  valueFormatters?: Record<string, (value: any) => string>;
  onConfirm: () => void;
  onCancel: () => void;
}

const ConfirmEditDialog: React.FC<ConfirmEditDialogProps> = ({
  isOpen,
  title,
  oldData,
  newData,
  fieldLabels,
  valueFormatters,
  onConfirm,
  onCancel,
}) => {
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Enter") {
        event.preventDefault();
        onConfirm();
      } else if (event.key === "Escape") {
        event.preventDefault();
        onCancel();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onConfirm, onCancel]);

  if (!isOpen) return null;

  const getChangedFields = () => {
    const changed: Array<{ field: string; label: string; oldValue: any; newValue: any }> = [];
    
    for (const key in newData) {
      // Ignora la password se vuota
      if (key === "password" && !newData[key]) {
        continue;
      }
      
      // Gestione speciale per campi JSON (areas, roles)
      if (key === "areas" || key === "roles") {
        const oldVal = JSON.stringify(oldData[key] || []);
        const newVal = JSON.stringify(newData[key] || []);
        if (oldVal !== newVal) {
          changed.push({
            field: key,
            label: fieldLabels[key] || key,
            oldValue: oldVal,
            newValue: newVal,
          });
        }
      } else if (newData[key] !== oldData[key]) {
        const fmt = valueFormatters?.[key];
        changed.push({
          field: key,
          label: fieldLabels[key] || key,
          oldValue: fmt ? fmt(oldData[key]) : oldData[key],
          newValue: fmt ? fmt(newData[key]) : newData[key],
        });
      }
    }
    
    return changed;
  };

  const changedFields = getChangedFields();

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg p-6 max-w-3xl w-full max-h-[90vh] overflow-auto">
        <h2 className="text-2xl font-bold mb-6">{title}</h2>
        <p className="mb-6 text-gray-700">Sei sicuro di voler modificare questi dati?</p>
        
        {changedFields.length === 0 ? (
          <p className="text-gray-500 italic mb-6">Nessuna modifica rilevata</p>
        ) : (
          <div className="space-y-4 mb-6">
            {changedFields.map((change) => (
              <div key={change.field} className="border border-gray-200 rounded-lg p-4">
                <h3 className="font-semibold text-gray-800 mb-2">{change.label}</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="bg-red-50 p-3 rounded">
                    <p className="text-xs text-gray-600 uppercase mb-1">Valore Precedente</p>
                    <p className="text-sm text-red-800 break-words">{String(change.oldValue) || "-"}</p>
                  </div>
                  <div className="bg-green-50 p-3 rounded">
                    <p className="text-xs text-gray-600 uppercase mb-1">Nuovo Valore</p>
                    <p className="text-sm text-green-800 break-words">{String(change.newValue) || "-"}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="flex justify-end gap-4">
          <button
            onClick={onCancel}
            className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 hover:border-gray-400 hover:shadow-md hover:scale-105 active:scale-100 transition-all duration-200 cursor-pointer"
          >
            Annulla
          </button>
          <button
            onClick={onConfirm}
            className="px-4 py-2 bg-gray-900 text-white rounded-lg hover:bg-gray-800 hover:shadow-lg hover:scale-105 active:scale-100 transition-all duration-200 cursor-pointer"
          >
            Conferma Modifiche
          </button>
        </div>
      </div>
    </div>
  );
};

export default ConfirmEditDialog;

