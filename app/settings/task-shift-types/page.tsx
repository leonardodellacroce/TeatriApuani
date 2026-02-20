"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import DashboardShell from "@/components/DashboardShell";
import ConfirmDialog from "@/components/ConfirmDialog";

interface TaskType {
  id: string;
  name: string;
  description: string | null;
  type: string; // "ACTIVITY" o "SHIFT"
  color: string | null;
  areas: string | null; // JSON array di ID aree
  isHourlyService: boolean | null;
  shiftHours: number | null;
  createdAt: string;
}

interface Area {
  id: string;
  name: string;
  code: string;
  prefix: string | null;
}

export default function TaskTypesPage() {
  const router = useRouter();
  const [taskTypes, setTaskTypes] = useState<TaskType[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Modal states
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingTaskType, setEditingTaskType] = useState<TaskType | null>(null);
  const [taskTypeType, setTaskTypeType] = useState<"ACTIVITY" | "SHIFT">("ACTIVITY");
  const [taskTypeName, setTaskTypeName] = useState("");
  const [taskTypeDescription, setTaskTypeDescription] = useState("");
  const [taskTypeColor, setTaskTypeColor] = useState<string | null>(null);
  const [showColorPicker, setShowColorPicker] = useState(false);
  const [isHourlyService, setIsHourlyService] = useState<boolean>(true);
  const [isShiftService, setIsShiftService] = useState<boolean>(false);
  const [shiftHours, setShiftHours] = useState<string>("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  
  // Areas states
  const [areas, setAreas] = useState<Area[]>([]);
  const [selectedAreaIds, setSelectedAreaIds] = useState<string[]>([]);
  
  // Sorting and filtering states for shifts
  type SortField = "name" | "areas";
  type SortOrder = "asc" | "desc";
  const [sortField, setSortField] = useState<SortField>("name");
  const [sortOrder, setSortOrder] = useState<SortOrder>("asc");
  const [areaFilter, setAreaFilter] = useState<string | null>(null);

  const colorPalette = [
    "#EF4444", // rosso
    "#F97316", // arancione
    "#EAB308", // giallo
    "#22C55E", // verde medio
    "#84CC16", // lime
    "#06B6D4", // ciano/blu cielo
    "#A16207", // marrone
    "#2563EB", // blu reale
    "#1E40AF", // blu scuro/indaco
    "#A78BFA", // lavanda/viola chiaro
    "#EC4899", // rosa
    "#6B7280", // grigio scuro
  ];

  const colorNames: Record<string, string> = {
    "#EF4444": "Rosso",
    "#F97316": "Arancione",
    "#EAB308": "Giallo",
    "#22C55E": "Verde",
    "#84CC16": "Verde Chiaro",
    "#06B6D4": "Cyan",
    "#A16207": "Marrone",
    "#2563EB": "Blu",
    "#1E40AF": "Blu Scuro",
    "#A78BFA": "Viola",
    "#EC4899": "Rosa",
    "#6B7280": "Grigio",
  };

  const getColorName = (color: string | null): string => {
    if (!color) return "";
    return colorNames[color] || color;
  };

  // Confirm dialog states
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);
  
  // Edit confirmation dialog
  const [showEditConfirmDialog, setShowEditConfirmDialog] = useState(false);
  const [pendingEditData, setPendingEditData] = useState<any>(null);

  useEffect(() => {
    fetchTaskTypes();
    fetchAreas();
  }, []);

  const fetchAreas = async () => {
    try {
      const res = await fetch("/api/areas");
      if (res.ok) {
        const data = await res.json();
        setAreas(data);
      }
    } catch (error) {
      console.error("Error fetching areas:", error);
    }
  };

  // Chiudi il color picker quando si clicca fuori
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      if (!target.closest(".color-picker-container")) {
        setShowColorPicker(false);
      }
    };

    if (showColorPicker) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [showColorPicker]);

  const activities = taskTypes.filter(t => t.type === "ACTIVITY");
  
  // Filter and sort shifts
  const filteredAndSortedShifts = (() => {
    let filtered = taskTypes.filter(t => t.type === "SHIFT");
    
    // Apply area filter
    if (areaFilter) {
      filtered = filtered.filter(taskType => {
        try {
          const areaIds: string[] = taskType.areas ? JSON.parse(taskType.areas) : [];
          return Array.isArray(areaIds) && areaIds.includes(areaFilter);
        } catch {
          return false;
        }
      });
    }
    
    // Apply sorting
    return [...filtered].sort((a, b) => {
      let aVal: any;
      let bVal: any;
      
      if (sortField === "name") {
        aVal = a.name || "";
        bVal = b.name || "";
      } else if (sortField === "areas") {
        // Sort by first area name, or empty string if no areas
        try {
          const aAreaIds: string[] = a.areas ? JSON.parse(a.areas) : [];
          const bAreaIds: string[] = b.areas ? JSON.parse(b.areas) : [];
          const aFirstArea = aAreaIds.length > 0 ? areas.find(ar => ar.id === aAreaIds[0])?.name || "" : "";
          const bFirstArea = bAreaIds.length > 0 ? areas.find(ar => ar.id === bAreaIds[0])?.name || "" : "";
          aVal = aFirstArea;
          bVal = bFirstArea;
        } catch {
          aVal = "";
          bVal = "";
        }
      } else {
        return 0;
      }
      
      if (aVal < bVal) return sortOrder === "asc" ? -1 : 1;
      if (aVal > bVal) return sortOrder === "asc" ? 1 : -1;
      return 0;
    });
  })();
  
  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortOrder(sortOrder === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortOrder("asc");
    }
  };

  const fetchTaskTypes = async () => {
    try {
      const res = await fetch("/api/task-types");
      if (res.ok) {
        const data = await res.json();
        setTaskTypes(data);
      }
    } catch (error) {
      console.error("Error fetching task types:", error);
    } finally {
      setLoading(false);
    }
  };

  const openNewTaskType = (type: "ACTIVITY" | "SHIFT") => {
    setEditingTaskType(null);
    setTaskTypeType(type);
    setTaskTypeName("");
    setTaskTypeDescription("");
    setTaskTypeColor(null);
    setShowColorPicker(false);
    setIsHourlyService(true);
    setIsShiftService(false);
    setShiftHours("");
    setSelectedAreaIds([]);
    setError("");
    setIsFormOpen(true);
  };

  const openEditTaskType = (taskType: TaskType) => {
    setEditingTaskType(taskType);
    setTaskTypeType(taskType.type as "ACTIVITY" | "SHIFT");
    setTaskTypeName(taskType.name);
    setTaskTypeDescription(taskType.description || "");
    setTaskTypeColor(taskType.color || null);
    setShowColorPicker(false);
    // Per isHourlyService: se è esplicitamente false, usa false; altrimenti usa true (default)
    // Se isHourlyService è false, allora è servizio a turno
    // Se isHourlyService è true o null/undefined, allora è servizio orario (default)
    const hourlyService = taskType.isHourlyService === false ? false : true;
    const shiftService = hourlyService === false;
    setIsHourlyService(hourlyService);
    setIsShiftService(shiftService);
    setShiftHours(taskType.shiftHours != null && taskType.shiftHours !== undefined ? taskType.shiftHours.toString() : "");
    // Parse areas JSON
    try {
      const parsedAreas = taskType.areas ? JSON.parse(taskType.areas) : [];
      setSelectedAreaIds(Array.isArray(parsedAreas) ? parsedAreas : []);
    } catch {
      setSelectedAreaIds([]);
    }
    setError("");
    setIsFormOpen(true);
  };

  const submitTaskType = async () => {
    if (!taskTypeName.trim()) {
      setError("Il nome è obbligatorio");
      return;
    }
    
    // Validazione per turni: se è servizio a turno, le ore del turno sono obbligatorie
    if (taskTypeType === "SHIFT" && isShiftService) {
      const hours = parseFloat(shiftHours);
      if (isNaN(hours) || hours <= 0) {
        setError("Le ore del turno sono obbligatorie e devono essere un numero positivo");
        return;
      }
    }
    
    // Salva direttamente
    await performSave();
  };
  
  const performSave = async () => {
    setSaving(true);
    setError("");
    try {
      const requestBody: Record<string, unknown> = {
        name: taskTypeName.trim(),
        description: taskTypeDescription.trim() || null,
        type: taskTypeType,
        color: taskTypeType === "SHIFT" ? taskTypeColor : null,
        areas: taskTypeType === "SHIFT" ? selectedAreaIds : null,
        isHourlyService: taskTypeType === "SHIFT" ? !isShiftService : undefined,
        shiftHours: taskTypeType === "SHIFT" && isShiftService ? (shiftHours ? parseFloat(shiftHours) : null) : null,
      };
      const res = await fetch(editingTaskType ? `/api/task-types/${editingTaskType.id}` : "/api/task-types", {
        method: editingTaskType ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestBody),
      });
      
      const contentType = res.headers.get("content-type");
      let data;
      if (contentType && contentType.includes("application/json")) {
        data = await res.json();
      } else {
        const text = await res.text();
        console.error("Non-JSON response:", text);
        setError(text || "Errore nel salvataggio");
        return;
      }
      
      if (!res.ok) {
        console.error("Error response:", data);
        setError(data.error || data.details || "Errore nel salvataggio");
      } else {
        // Ricarica i task types per avere i valori aggiornati dal database
        await fetchTaskTypes();
        setIsFormOpen(false);
      }
    } catch (e: any) {
      console.error("Error in performSave:", e);
      setError(e?.message || "Errore nel salvataggio");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = (id: string) => {
    setPendingDelete(id);
    setShowConfirmDialog(true);
  };

  const confirmDelete = async () => {
    if (!pendingDelete) return;

    try {
      const res = await fetch(`/api/task-types/${pendingDelete}`, {
        method: "DELETE",
      });

      if (res.ok) {
        fetchTaskTypes();
      } else {
        alert("Errore durante l'eliminazione");
      }
    } catch (error) {
      console.error("Error deleting task type:", error);
      alert("Errore durante l'eliminazione");
    } finally {
      setShowConfirmDialog(false);
      setPendingDelete(null);
    }
  };

  const cancelDelete = () => {
    setShowConfirmDialog(false);
    setPendingDelete(null);
  };
  
  const confirmEdit = async () => {
    setShowEditConfirmDialog(false);
    setPendingEditData(null);
    await performSave();
  };
  
  const cancelEdit = () => {
    setShowEditConfirmDialog(false);
    setPendingEditData(null);
  };

  if (loading) {
    return (
      <DashboardShell>
        <div className="flex items-center justify-center h-64">
          <p>Caricamento...</p>
        </div>
      </DashboardShell>
    );
  }

  return (
    <DashboardShell>
      <div>
        <div className="flex items-center gap-3 mb-8">
          <button
            onClick={() => router.push("/settings")}
            aria-label="Indietro"
            title="Indietro"
            className="h-10 w-10 inline-flex items-center justify-center rounded-lg bg-gray-900 text-white hover:bg-gray-800 hover:shadow-lg transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <h1 className="text-3xl font-bold">Attività e Turni</h1>
        </div>

        {/* Tipologie di Attività */}
        <div className="mb-12">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-2xl font-semibold">Tipologie di Attività</h2>
            <button
              onClick={() => openNewTaskType("ACTIVITY")}
              className="px-4 py-2 rounded-lg bg-gray-900 text-white hover:bg-gray-800 hover:shadow-lg hover:scale-105 active:scale-100 transition-all duration-200 cursor-pointer"
            >
              Nuova Tipologia Attività
            </button>
          </div>

          {activities.length === 0 ? (
            <p className="text-gray-600">Nessuna tipologia di attività trovata.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Nome
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Descrizione
                    </th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Azioni
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {activities.map((taskType) => (
                    <tr key={taskType.id}>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                        {taskType.name}
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-900">
                        {taskType.description || "-"}
                      </td>
                      <td className="px-6 py-2 whitespace-nowrap text-right text-sm font-medium">
                        <div className="inline-flex items-center gap-2">
                          <button onClick={() => openEditTaskType(taskType)} aria-label="Modifica" title="Modifica" className="h-8 w-8 inline-flex items-center justify-center rounded-lg bg-gray-900 text-white hover:bg-gray-800 hover:shadow-lg transition-colors">
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15.232 5.232l3.536 3.536M4 20h4l10.293-10.293a1 1 0 000-1.414l-2.586-2.586a1 1 0 00-1.414 0L4 16v4z" /></svg>
                          </button>
                          <button onClick={() => handleDelete(taskType.id)} aria-label="Elimina" title="Elimina" className="h-8 w-8 inline-flex items-center justify-center rounded-lg bg-red-600 text-white hover:bg-red-700 hover:shadow-lg transition-colors">
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6M9 7h6m-1-2H10l1-1h2l1 1z" /></svg>
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Tipologie di Turno */}
        <div>
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-2xl font-semibold">Tipologie di Turno</h2>
            <button
              onClick={() => openNewTaskType("SHIFT")}
              className="px-4 py-2 rounded-lg bg-gray-900 text-white hover:bg-gray-800 hover:shadow-lg hover:scale-105 active:scale-100 transition-all duration-200 cursor-pointer"
            >
              Nuova Tipologia Turno
            </button>
          </div>

          {/* Area Filter */}
          <div className="mb-4">
            <select
              value={areaFilter || ""}
              onChange={(e) => setAreaFilter(e.target.value || null)}
              className="px-4 py-2 h-10 border border-gray-300 rounded-lg text-sm bg-white text-gray-700 hover:border-gray-400 hover:shadow-md hover:bg-gray-50 focus:ring-2 focus:ring-gray-900 focus:border-transparent transition-all duration-200 cursor-pointer"
            >
              <option value="">Tutte le aree</option>
              {areas.map((area) => (
                <option key={area.id} value={area.id}>
                  {area.name}
                </option>
              ))}
            </select>
          </div>

          {filteredAndSortedShifts.length === 0 ? (
            <p className="text-gray-600">
              {areaFilter ? "Nessuna tipologia di turno trovata per l'area selezionata." : "Nessuna tipologia di turno trovata."}
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th 
                      className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100 transition-colors"
                      onClick={() => handleSort("name")}
                    >
                      <div className="flex items-center gap-2">
                        Nome
                        {sortField === "name" && (
                          <svg 
                            className={`w-4 h-4 ${sortOrder === "asc" ? "" : "rotate-180"}`}
                            fill="none" 
                            stroke="currentColor" 
                            viewBox="0 0 24 24"
                          >
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 15l7-7 7 7" />
                          </svg>
                        )}
                      </div>
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Descrizione
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Colore
                    </th>
                    <th 
                      className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100 transition-colors"
                      onClick={() => handleSort("areas")}
                    >
                      <div className="flex items-center gap-2">
                        Aree
                        {sortField === "areas" && (
                          <svg 
                            className={`w-4 h-4 ${sortOrder === "asc" ? "" : "rotate-180"}`}
                            fill="none" 
                            stroke="currentColor" 
                            viewBox="0 0 24 24"
                          >
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 15l7-7 7 7" />
                          </svg>
                        )}
                      </div>
                    </th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Azioni
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {filteredAndSortedShifts.map((taskType) => (
                    <tr key={taskType.id}>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                        {taskType.name}
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-900">
                        {taskType.description || "-"}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm">
                        {taskType.color ? (
                          <div className="w-6 h-6 rounded border border-gray-300" style={{ backgroundColor: taskType.color }}></div>
                        ) : (
                          <span className="text-gray-500">-</span>
                        )}
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-900">
                        {(() => {
                          try {
                            const areaIds: string[] = taskType.areas ? JSON.parse(taskType.areas) : [];
                            if (!Array.isArray(areaIds) || areaIds.length === 0) {
                              return <span className="text-gray-500">-</span>;
                            }
                            const areaNames = areaIds
                              .map(id => areas.find(a => a.id === id)?.name)
                              .filter(Boolean)
                              .join(", ");
                            return areaNames || <span className="text-gray-500">-</span>;
                          } catch {
                            return <span className="text-gray-500">-</span>;
                          }
                        })()}
                      </td>
                      <td className="px-6 py-2 whitespace-nowrap text-right text-sm font-medium">
                        <div className="inline-flex items-center gap-2">
                          <button onClick={() => openEditTaskType(taskType)} aria-label="Modifica" title="Modifica" className="h-8 w-8 inline-flex items-center justify-center rounded-lg bg-gray-900 text-white hover:bg-gray-800 hover:shadow-lg transition-colors">
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15.232 5.232l3.536 3.536M4 20h4l10.293-10.293a1 1 0 000-1.414l-2.586-2.586a1 1 0 00-1.414 0L4 16v4z" /></svg>
                          </button>
                          <button onClick={() => handleDelete(taskType.id)} aria-label="Elimina" title="Elimina" className="h-8 w-8 inline-flex items-center justify-center rounded-lg bg-red-600 text-white hover:bg-red-700 hover:shadow-lg transition-colors">
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6M9 7h6m-1-2H10l1-1h2l1 1z" /></svg>
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Confirm Dialog */}
      <ConfirmDialog
        isOpen={showConfirmDialog}
        title="Conferma Eliminazione"
        message="Sei sicuro di voler eliminare questa tipologia di attività? Questa azione non può essere annullata."
        onConfirm={confirmDelete}
        onCancel={cancelDelete}
      />

      {/* Edit Confirmation Dialog */}
      {showEditConfirmDialog && pendingEditData && (
        <div 
          className="fixed inset-0 bg-black/30 flex items-center justify-center z-[60]"
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              confirmEdit();
            } else if (e.key === 'Escape') {
              e.preventDefault();
              cancelEdit();
            }
          }}
          tabIndex={-1}
        >
          <div className="bg-white rounded-lg p-6 max-w-lg w-full">
            <h2 className="text-xl font-bold mb-2">Conferma Modifiche Tipologia</h2>
            <p className="mb-6 text-gray-700">Sei sicuro di voler modificare questi dati?</p>
            
            <div className="space-y-4 mb-6">
              {(pendingEditData.newName !== pendingEditData.oldName) && (
                <div>
                  <p className="text-sm font-semibold mb-2">Nome</p>
                  <div className="flex gap-3">
                    <div className="flex-1 border rounded-lg p-3 bg-red-50">
                      <p className="text-xs text-gray-500 mb-1">VALORE PRECEDENTE</p>
                      <p className="text-sm text-red-600">{pendingEditData.oldName}</p>
                    </div>
                    <div className="flex-1 border rounded-lg p-3 bg-green-50">
                      <p className="text-xs text-gray-500 mb-1">NUOVO VALORE</p>
                      <p className="text-sm text-green-600">{pendingEditData.newName}</p>
                    </div>
                  </div>
                </div>
              )}
              {(pendingEditData.newDescription !== pendingEditData.oldDescription) && (
                <div>
                  <p className="text-sm font-semibold mb-2">Descrizione</p>
                  <div className="flex gap-3">
                    <div className="flex-1 border rounded-lg p-3 bg-red-50">
                      <p className="text-xs text-gray-500 mb-1">VALORE PRECEDENTE</p>
                      <p className="text-sm text-red-600">{pendingEditData.oldDescription || "(vuoto)"}</p>
                    </div>
                    <div className="flex-1 border rounded-lg p-3 bg-green-50">
                      <p className="text-xs text-gray-500 mb-1">NUOVO VALORE</p>
                      <p className="text-sm text-green-600">{pendingEditData.newDescription || "(vuoto)"}</p>
                    </div>
                  </div>
                </div>
              )}
              {(pendingEditData.newColor !== pendingEditData.oldColor) && (
                <div>
                  <p className="text-sm font-semibold mb-2">Colore</p>
                  <div className="flex gap-3">
                    <div className="flex-1 border rounded-lg p-3 bg-red-50">
                      <p className="text-xs text-gray-500 mb-1">VALORE PRECEDENTE</p>
                      {pendingEditData.oldColor ? (
                        <div className="flex items-center gap-2">
                          <div className="w-6 h-6 rounded border border-gray-300" style={{ backgroundColor: pendingEditData.oldColor }}></div>
                          <p className="text-sm text-red-600">{getColorName(pendingEditData.oldColor)}</p>
                        </div>
                      ) : (
                        <p className="text-sm text-red-600">Nessun colore</p>
                      )}
                    </div>
                    <div className="flex-1 border rounded-lg p-3 bg-green-50">
                      <p className="text-xs text-gray-500 mb-1">NUOVO VALORE</p>
                      {pendingEditData.newColor ? (
                        <div className="flex items-center gap-2">
                          <div className="w-6 h-6 rounded border border-gray-300" style={{ backgroundColor: pendingEditData.newColor }}></div>
                          <p className="text-sm text-green-600">{getColorName(pendingEditData.newColor)}</p>
                        </div>
                      ) : (
                        <p className="text-sm text-green-600">Nessun colore</p>
                      )}
                    </div>
                  </div>
                </div>
              )}
              {(() => {
                const oldAreas = Array.isArray(pendingEditData.oldAreas) ? pendingEditData.oldAreas : [];
                const newAreas = Array.isArray(pendingEditData.newAreas) ? pendingEditData.newAreas : [];
                const oldAreasStr = JSON.stringify(oldAreas.sort());
                const newAreasStr = JSON.stringify(newAreas.sort());
                
                if (oldAreasStr !== newAreasStr) {
                  const oldAreaNames = oldAreas
                    .map((id: string) => areas.find(a => a.id === id)?.name)
                    .filter(Boolean)
                    .join(", ") || "(nessuna)";
                  const newAreaNames = newAreas
                    .map((id: string) => areas.find(a => a.id === id)?.name)
                    .filter(Boolean)
                    .join(", ") || "(nessuna)";
                  
                  return (
                    <div>
                      <p className="text-sm font-semibold mb-2">Aree</p>
                      <div className="flex gap-3">
                        <div className="flex-1 border rounded-lg p-3 bg-red-50">
                          <p className="text-xs text-gray-500 mb-1">VALORE PRECEDENTE</p>
                          <p className="text-sm text-red-600">{oldAreaNames}</p>
                        </div>
                        <div className="flex-1 border rounded-lg p-3 bg-green-50">
                          <p className="text-xs text-gray-500 mb-1">NUOVO VALORE</p>
                          <p className="text-sm text-green-600">{newAreaNames}</p>
                        </div>
                      </div>
                    </div>
                  );
                }
                return null;
              })()}
            </div>
            
            <div className="flex justify-end gap-3">
              <button
                type="button"
                onClick={cancelEdit}
                aria-label="Annulla"
                title="Annulla"
                className="h-10 w-10 inline-flex items-center justify-center rounded-lg border-2 border-gray-300 text-gray-700 hover:border-gray-400 hover:shadow-lg transition-colors"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
              <button
                type="button"
                onClick={confirmEdit}
                className="px-4 py-2 bg-gray-900 text-white rounded-lg hover:bg-gray-800 hover:shadow-lg hover:scale-105 active:scale-100 transition-all duration-200 cursor-pointer"
              >
                Conferma Modifiche
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Form Modal */}
      {isFormOpen && (
        <div 
          className="fixed inset-0 bg-black/30 flex items-center justify-center z-50"
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              submitTaskType();
            } else if (e.key === 'Escape') {
              e.preventDefault();
              setIsFormOpen(false);
            }
          }}
          tabIndex={-1}
        >
          <div className="bg-white rounded-lg p-6 w-full max-w-md">
            <h3 className="text-lg font-semibold mb-4">
              {editingTaskType ? `Modifica ${taskTypeType === "ACTIVITY" ? "Tipologia Attività" : "Tipologia Turno"}` : (taskTypeType === "ACTIVITY" ? "Nuova Tipologia Attività" : "Nuova Tipologia Turno")}
            </h3>
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Tipo</label>
                <input
                  type="text"
                  value={taskTypeType === "ACTIVITY" ? "Attività" : "Turno"}
                  disabled
                  className="w-full px-4 py-2 h-10 border border-gray-300 rounded-lg text-sm bg-gray-100 text-gray-700"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Nome *</label>
                <input
                  type="text"
                  value={taskTypeName}
                  onChange={(e) => setTaskTypeName(e.target.value)}
                  className="w-full px-4 py-2 h-10 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-gray-500 focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Descrizione</label>
                <textarea
                  value={taskTypeDescription}
                  onChange={(e) => setTaskTypeDescription(e.target.value)}
                  rows={3}
                  className="w-full px-4 py-2 h-10 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-gray-500 focus:border-transparent"
                />
              </div>
              {taskTypeType === "SHIFT" && (
                <>
                  <div className="relative color-picker-container">
                    <label className="block text-sm font-medium text-gray-700 mb-1">Colore</label>
                  <button
                    type="button"
                    onClick={() => setShowColorPicker(!showColorPicker)}
                    className="w-full px-4 py-2 h-10 border border-gray-300 rounded-lg text-sm hover:border-gray-400 hover:shadow-md hover:bg-gray-50 focus:ring-2 focus:ring-gray-900 focus:border-transparent transition-all duration-200 cursor-pointer text-left flex items-center justify-between"
                  >
                    <span className={taskTypeColor ? "" : "text-gray-500"}>
                      {taskTypeColor ? (
                        <div className="flex items-center gap-2">
                          <div className="w-5 h-5 rounded border border-gray-300" style={{ backgroundColor: taskTypeColor }}></div>
                          <span>{getColorName(taskTypeColor)}</span>
                        </div>
                      ) : (
                        "Seleziona un colore"
                      )}
                    </span>
                    <svg 
                      className={`w-4 h-4 flex-shrink-0 transition-transform ${showColorPicker ? 'rotate-180' : ''}`}
                      fill="none" 
                      stroke="currentColor" 
                      viewBox="0 0 24 24"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>
                  {showColorPicker && (
                    <div className="absolute z-10 w-full mt-2 bg-white border border-gray-300 rounded-lg shadow-lg p-4">
                      <div className="grid grid-cols-7 gap-2 mb-3">
                        {colorPalette.map((color) => (
                          <button
                            key={color}
                            type="button"
                            onClick={() => {
                              setTaskTypeColor(color);
                              setShowColorPicker(false);
                            }}
                            className="w-10 h-10 rounded border border-gray-300 hover:scale-110 transition-transform cursor-pointer"
                            style={{ backgroundColor: color }}
                            title={color}
                          />
                        ))}
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setTaskTypeColor(null);
                          setShowColorPicker(false);
                        }}
                        className="w-full text-center text-sm text-gray-600 hover:text-gray-900 py-2 hover:bg-gray-50 rounded transition-colors"
                      >
                        Nessun colore
                      </button>
                    </div>
                  )}
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Aree</label>
                    <div className="space-y-2 border border-gray-300 rounded-lg p-3">
                      {areas.length === 0 ? (
                        <p className="text-sm text-gray-500">Nessuna area disponibile</p>
                      ) : (
                        areas.map((area) => (
                          <label key={area.id} className="flex items-center gap-2 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={selectedAreaIds.includes(area.id)}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  setSelectedAreaIds([...selectedAreaIds, area.id]);
                                } else {
                                  setSelectedAreaIds(selectedAreaIds.filter(id => id !== area.id));
                                }
                              }}
                              className="w-4 h-4 text-gray-900 border-gray-300 rounded focus:ring-gray-500 cursor-pointer"
                            />
                            <span className="text-sm text-gray-700">{area.name}</span>
                          </label>
                        ))
                      )}
                    </div>
                  </div>
                  <div className="space-y-3">
                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        id="isHourlyService"
                        checked={isHourlyService}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setIsHourlyService(true);
                            setIsShiftService(false);
                            setShiftHours("");
                          }
                        }}
                        className="w-4 h-4 text-gray-900 border-gray-300 rounded focus:ring-gray-500 cursor-pointer"
                      />
                      <label htmlFor="isHourlyService" className="text-sm text-gray-700 cursor-pointer">
                        Considera come servizio orario
                      </label>
                    </div>
                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        id="isShiftService"
                        checked={isShiftService}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setIsShiftService(true);
                            setIsHourlyService(false);
                          } else {
                            setIsShiftService(false);
                            setIsHourlyService(true);
                            setShiftHours("");
                          }
                        }}
                        className="w-4 h-4 text-gray-900 border-gray-300 rounded focus:ring-gray-500 cursor-pointer"
                      />
                      <label htmlFor="isShiftService" className="text-sm text-gray-700 cursor-pointer">
                        Considera come servizio a turno
                      </label>
                    </div>
                    {isShiftService && (
                      <>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">
                            Ore del turno *
                          </label>
                          <input
                            type="number"
                            step="0.5"
                            min="0.5"
                            value={shiftHours}
                            onChange={(e) => setShiftHours(e.target.value)}
                            className="w-full px-4 py-2 h-10 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-gray-500 focus:border-transparent"
                            placeholder="Es. 8"
                          />
                        </div>
                      </>
                    )}
                  </div>
                </>
              )}
              {error && <p className="text-sm text-red-600">{error}</p>}
            </div>
            <div className="flex justify-end gap-2 mt-4">
              <button
                onClick={() => setIsFormOpen(false)}
                className="px-4 py-2 h-10 border border-gray-300 rounded-lg text-sm hover:bg-gray-50 hover:border-gray-400 hover:shadow-md hover:scale-105 active:scale-100 transition-all duration-200 cursor-pointer"
              >
                Annulla
              </button>
              <button
                onClick={submitTaskType}
                disabled={saving || error !== ""}
                className={`px-4 py-2 rounded-lg ${
                  saving || error !== ""
                    ? 'bg-gray-400 text-gray-200 cursor-not-allowed'
                    : 'bg-gray-900 text-white hover:bg-gray-800 hover:shadow-lg hover:scale-105 active:scale-100'
                }`}
              >
                {saving ? 'Salvataggio...' : (editingTaskType ? 'Salva modifiche' : 'Salva')}
              </button>
            </div>
          </div>
        </div>
      )}
    </DashboardShell>
  );
}

