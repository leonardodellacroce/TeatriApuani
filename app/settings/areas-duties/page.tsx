"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import DashboardShell from "@/components/DashboardShell";
import PageSkeleton from "@/components/PageSkeleton";
import ConfirmDialog from "@/components/ConfirmDialog";

interface Area {
  id: string;
  code: string;
  name: string;
  prefix: string | null;
  enabledInWorkdayPlanning: boolean;
  createdAt: string;
}

interface Duty {
  id: string;
  code: string;
  name: string;
  area: string;
  createdAt: string;
}

type SortField = "code" | "name" | "createdAt" | "area";
type SortOrder = "asc" | "desc";

export default function AreasDutiesPage() {
  const router = useRouter();
  const [areas, setAreas] = useState<Area[]>([]);
  const [duties, setDuties] = useState<Duty[]>([]);
  const [loading, setLoading] = useState(true);
  // Inline forms/modals
  const [isAreaFormOpen, setIsAreaFormOpen] = useState(false);
  const [editingArea, setEditingArea] = useState<Area | null>(null);
  const [areaName, setAreaName] = useState("");
  const [areaPrefix, setAreaPrefix] = useState("");
  const [areaEnabledInWorkdayPlanning, setAreaEnabledInWorkdayPlanning] = useState(false);
  const [areaSaving, setAreaSaving] = useState(false);
  const [areaError, setAreaError] = useState("");
  const [prefixError, setPrefixError] = useState("");
  const [areaNameError, setAreaNameError] = useState("");
  const [areaNameTouched, setAreaNameTouched] = useState(false);

  const [isDutyFormOpen, setIsDutyFormOpen] = useState(false);
  const [editingDuty, setEditingDuty] = useState<Duty | null>(null);
  const [dutyName, setDutyName] = useState("");
  const [dutyArea, setDutyArea] = useState("");
  const [dutyCodeNumber, setDutyCodeNumber] = useState("");
  const [dutySaving, setDutySaving] = useState(false);
  const [dutyError, setDutyError] = useState("");
  const [dutyCodeError, setDutyCodeError] = useState("");
  const [dutyNameError, setDutyNameError] = useState("");
  const [dutyNameTouched, setDutyNameTouched] = useState(false);
  
  // Aree
  const [sortField, setSortField] = useState<SortField>("code");
  const [sortOrder, setSortOrder] = useState<SortOrder>("asc");
  const [showAreaConfirmDialog, setShowAreaConfirmDialog] = useState(false);
  const [pendingAreaDelete, setPendingAreaDelete] = useState<string | null>(null);
  
  // Mansioni
  const [dutySortField, setDutySortField] = useState<SortField>("code");
  const [dutySortOrder, setDutySortOrder] = useState<SortOrder>("asc");
  const [suggestedCode, setSuggestedCode] = useState<string>("");
  const [areaFilter, setAreaFilter] = useState<string>("TUTTE");
  const [showDutyConfirmDialog, setShowDutyConfirmDialog] = useState(false);
  const [pendingDutyDelete, setPendingDutyDelete] = useState<string | null>(null);

  const [prefixCheckTimer, setPrefixCheckTimer] = useState<NodeJS.Timeout | null>(null);
  const [dutyCodeCheckTimer, setDutyCodeCheckTimer] = useState<NodeJS.Timeout | null>(null);
  const [areaNameCheckTimer, setAreaNameCheckTimer] = useState<NodeJS.Timeout | null>(null);
  const [dutyNameCheckTimer, setDutyNameCheckTimer] = useState<NodeJS.Timeout | null>(null);

  useEffect(() => {
    fetchData();
  }, []);

  // Verifica unicità del prefisso in tempo reale
  useEffect(() => {
    if (!isAreaFormOpen || !areaPrefix.trim()) {
      setPrefixError("");
      return;
    }

    const timer = setTimeout(() => {
      checkPrefixAvailability(areaPrefix.trim().toUpperCase());
    }, 500);

    setPrefixCheckTimer(timer);

    return () => {
      if (timer) clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [areaPrefix, isAreaFormOpen, areas, editingArea]);

  const checkPrefixAvailability = async (prefix: string) => {
    if (!prefix || prefix.length === 0) {
      setPrefixError("");
      return;
    }

    // Verifica se il prefisso è già in uso da altre aree (ma non dall'area attualmente in modifica)
    const existingArea = areas.find(a => a.prefix && a.prefix.toUpperCase() === prefix.toUpperCase());
    
    if (existingArea) {
      // Se non stiamo modificando l'area che ha già questo prefisso, allora è un errore
      if (!editingArea || existingArea.id !== editingArea.id) {
        setPrefixError("Questo prefisso è già in uso");
      } else {
        setPrefixError("");
      }
    } else {
      setPrefixError("");
    }
  };

  // Verifica validità e unicità del nome area in tempo reale
  useEffect(() => {
    if (!isAreaFormOpen || !areaNameTouched) {
      setAreaNameError("");
      return;
    }

    if (!areaName.trim()) {
      setAreaNameError("Il nome è obbligatorio");
      return;
    }

    const timer = setTimeout(() => {
      checkAreaNameAvailability(areaName.trim());
    }, 500);

    setAreaNameCheckTimer(timer);

    return () => {
      if (timer) clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [areaName, areaNameTouched, isAreaFormOpen, areas, editingArea]);

  const checkAreaNameAvailability = (name: string) => {
    if (!name || name.length === 0) {
      setAreaNameError("");
      return;
    }

    // Verifica se il nome è già in uso da altre aree (ma non dall'area attualmente in modifica)
    const existingArea = areas.find(a => a.name.toLowerCase() === name.toLowerCase());
    
    if (existingArea) {
      // Se non stiamo modificando l'area che ha già questo nome, allora è un errore
      if (!editingArea || existingArea.id !== editingArea.id) {
        setAreaNameError("Questo nome è già in uso");
      } else {
        setAreaNameError("");
      }
    } else {
      setAreaNameError("");
    }
  };

  // Gestione tastiera per modali inline - Area Form
  useEffect(() => {
    if (!isAreaFormOpen) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Enter") {
        event.preventDefault();
        // Simula il click sul pulsante Salva
        const saveButton = document.querySelector('[data-area-save-button]') as HTMLButtonElement;
        if (saveButton && !saveButton.disabled) {
          saveButton.click();
        }
      } else if (event.key === "Escape") {
        event.preventDefault();
        setIsAreaFormOpen(false);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isAreaFormOpen]);

  // Verifica validità e unicità del nome mansione in tempo reale
  useEffect(() => {
    if (!isDutyFormOpen || !dutyNameTouched) {
      setDutyNameError("");
      return;
    }

    if (!dutyName.trim()) {
      setDutyNameError("Il nome è obbligatorio");
      return;
    }

    const timer = setTimeout(() => {
      checkDutyNameAvailability(dutyName.trim());
    }, 500);

    setDutyNameCheckTimer(timer);

    return () => {
      if (timer) clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dutyName, dutyNameTouched, isDutyFormOpen, duties, editingDuty]);

  const checkDutyNameAvailability = (name: string) => {
    if (!name || name.length === 0) {
      setDutyNameError("");
      return;
    }

    // Verifica se il nome è già in uso da altre mansioni (ma non dalla mansione attualmente in modifica)
    const existingDuty = duties.find(d => d.name.toLowerCase() === name.toLowerCase());
    
    if (existingDuty) {
      // Se non stiamo modificando la mansione che ha già questo nome, allora è un errore
      if (!editingDuty || existingDuty.id !== editingDuty.id) {
        setDutyNameError("Questo nome è già in uso");
      } else {
        setDutyNameError("");
      }
    } else {
      setDutyNameError("");
    }
  };

  // Verifica unicità del codice mansione in tempo reale (solo durante modifica)
  useEffect(() => {
    if (!isDutyFormOpen || !editingDuty || !dutyCodeNumber || !dutyArea) {
      setDutyCodeError("");
      return;
    }

    const timer = setTimeout(() => {
      checkDutyCodeAvailability();
    }, 500);

    setDutyCodeCheckTimer(timer);

    return () => {
      if (timer) clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dutyCodeNumber, isDutyFormOpen, dutyArea, editingDuty, duties]);

  const checkDutyCodeAvailability = () => {
    if (!dutyArea || !dutyCodeNumber || !editingDuty) {
      setDutyCodeError("");
      return;
    }

    const prefix = getAreaPrefix(dutyArea);
    const fullCode = `${prefix}-${dutyCodeNumber.padStart(3, '0')}`;
    
    // Verifica se il codice esiste già in altre mansioni
    const existingDuty = duties.find(d => d.code.toUpperCase() === fullCode.toUpperCase());
    
    if (existingDuty) {
      // Se non stiamo modificando la mansione che ha già questo codice, allora è un errore
      if (existingDuty.id !== editingDuty.id) {
        setDutyCodeError("Questo codice è già in uso");
      } else {
        setDutyCodeError("");
      }
    } else {
      setDutyCodeError("");
    }
  };

  // Gestione tastiera per modali inline - Duty Form
  useEffect(() => {
    if (!isDutyFormOpen) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Enter") {
        event.preventDefault();
        // Simula il click sul pulsante Salva
        const saveButton = document.querySelector('[data-duty-save-button]') as HTMLButtonElement;
        if (saveButton && !saveButton.disabled) {
          saveButton.click();
        }
      } else if (event.key === "Escape") {
        event.preventDefault();
        setIsDutyFormOpen(false);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isDutyFormOpen]);

  // Calcola il codice suggerito quando l'area cambia nel form della mansione
  useEffect(() => {
    if (isDutyFormOpen && !editingDuty && dutyArea) {
      // Filtra le mansioni per l'area selezionata
      const dutiesInArea = duties.filter(d => d.area === dutyArea);
      
      // Estrai tutti i codici numerici delle mansioni di quest'area
      const allCodesInArea = dutiesInArea
        .map(d => parseCodeNumber(d.code))
        .filter(code => code > 0);
      
      // Calcola il prossimo codice progressivo
      const maxCode = allCodesInArea.length > 0 ? Math.max(...allCodesInArea) : 0;
      const nextCode = String(maxCode + 1).padStart(3, '0');
      setSuggestedCode(nextCode);
    }
  }, [isDutyFormOpen, editingDuty, dutyArea, duties]);

  const fetchData = async () => {
    try {
      const [areasRes, dutiesRes] = await Promise.all([
        fetch("/api/areas"),
        fetch("/api/duties"),
      ]);

      if (areasRes.ok) {
        const areasData = await areasRes.json();
        setAreas(areasData);
      }

      if (dutiesRes.ok) {
        const dutiesData = await dutiesRes.json();
        setDuties(dutiesData);
      }
    } catch (error) {
      console.error("Error fetching data:", error);
    } finally {
      setLoading(false);
    }
  };

  // Aree sorting
  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortOrder(sortOrder === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortOrder("asc");
    }
  };

  const parseCodeNumber = (code: string): number => {
    // Estrae solo la parte numerica, ignorando il prefisso
    const match = code.match(/(?:[A-Z]-)?(\d{3})$/);
    return match ? parseInt(match[1], 10) : 0;
  };

  const parseCodePrefix = (code: string): string => {
    const match = code.match(/^([A-Z])-/);
    return match ? match[1] : "";
  };

  const sortedAreas = [...areas].sort((a, b) => {
    let aValue: any = (sortField === "code" || sortField === "name") ? a[sortField] : a[sortField as keyof Area];
    let bValue: any = (sortField === "code" || sortField === "name") ? b[sortField] : b[sortField as keyof Area];

    if (sortField === "createdAt") {
      aValue = new Date(aValue).getTime();
      bValue = new Date(bValue).getTime();
    } else if (sortField === "code") {
      aValue = parseCodeNumber(a.code);
      bValue = parseCodeNumber(b.code);
    }

    if (aValue < bValue) return sortOrder === "asc" ? -1 : 1;
    if (aValue > bValue) return sortOrder === "asc" ? 1 : -1;
    return 0;
  });

  // Mansioni filtering and sorting
  const filteredDuties = duties.filter((duty) => {
    if (areaFilter === "TUTTE") return true;
    return duty.area === areaFilter;
  });

  const handleDutySort = (field: SortField) => {
    if (dutySortField === field) {
      setDutySortOrder(dutySortOrder === "asc" ? "desc" : "asc");
    } else {
      setDutySortField(field);
      setDutySortOrder("asc");
    }
  };

  const sortedDuties = [...filteredDuties].sort((a, b) => {
    let aValue: any = a[dutySortField];
    let bValue: any = b[dutySortField];

    if (dutySortField === "createdAt") {
      aValue = new Date(aValue).getTime();
      bValue = new Date(bValue).getTime();
    } else if (dutySortField === "code") {
      // Ordina prima per prefisso (lettera), poi per numero
      const aPrefix = parseCodePrefix(a.code);
      const bPrefix = parseCodePrefix(b.code);
      
      if (aPrefix !== bPrefix) {
        return aPrefix.localeCompare(bPrefix);
      }
      
      aValue = parseCodeNumber(a.code);
      bValue = parseCodeNumber(b.code);
    }

    if (aValue < bValue) return dutySortOrder === "asc" ? -1 : 1;
    if (aValue > bValue) return dutySortOrder === "asc" ? 1 : -1;
    return 0;
  });

  // Aree handlers
  const handleAreaDelete = (id: string) => {
    setPendingAreaDelete(id);
    setShowAreaConfirmDialog(true);
  };

  const openNewArea = () => {
    setEditingArea(null);
    setAreaName("");
    setAreaPrefix("");
    setAreaEnabledInWorkdayPlanning(false);
    setAreaError("");
    setPrefixError("");
    setAreaNameError("");
    setAreaNameTouched(false);
    setIsAreaFormOpen(true);
  };

  const openEditArea = (area: Area) => {
    setEditingArea(area);
    setAreaName(area.name);
    setAreaPrefix(area.prefix || "");
    setAreaEnabledInWorkdayPlanning(area.enabledInWorkdayPlanning || false);
    setAreaError("");
    setPrefixError("");
    setAreaNameError("");
    setAreaNameTouched(false);
    setIsAreaFormOpen(true);
  };

  const submitArea = async () => {
    if (!areaName.trim()) {
      setAreaNameError("Il nome è obbligatorio");
      setAreaNameTouched(true);
      return;
    }
    if (!editingArea && !areaPrefix.trim()) {
      setAreaError("Il prefisso è obbligatorio");
      return;
    }
    // Se si sta creando una nuova area o modificando il prefisso, verifica che sia valido
    if (areaPrefix.trim() && !/^[A-Z]$/.test(areaPrefix.trim())) {
      setAreaError("Il prefisso deve essere una singola lettera maiuscola");
      return;
    }
    // Verifica che il prefisso non sia già in uso (solo per nuove aree)
    if (!editingArea && areaPrefix.trim()) {
      const existingPrefixes = duties
        .map(d => parseCodePrefix(d.code))
        .filter(p => p);
      
      if (existingPrefixes.includes(areaPrefix.trim())) {
        setAreaError("Questo prefisso è già in uso");
        return;
      }
    }
    
    setAreaSaving(true);
    setAreaError("");
    try {
      const res = await fetch(editingArea ? `/api/areas/${editingArea.id}` : "/api/areas", {
        method: editingArea ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: (() => {
          const payload: any = { 
            name: areaName.trim(),
            enabledInWorkdayPlanning: areaEnabledInWorkdayPlanning,
          };
          if (!editingArea) {
            payload.prefix = areaPrefix.trim();
          } else if (areaPrefix.trim()) {
            payload.prefix = areaPrefix.trim();
          }
          console.log("Sending payload:", payload);
          return JSON.stringify(payload);
        })(),
      });
      
      const contentType = res.headers.get("content-type");
      let data;
      if (contentType && contentType.includes("application/json")) {
        data = await res.json();
      } else {
        const text = await res.text();
        console.error("Non-JSON response:", text);
        setAreaError(text || "Errore nel salvataggio");
        return;
      }
      
      if (!res.ok) {
        console.error("Error response:", data);
        setAreaError(data.error || data.details || "Errore nel salvataggio");
      } else {
        setIsAreaFormOpen(false);
        await fetchData();
      }
    } catch (e: any) {
      console.error("Error in submitArea:", e);
      setAreaError(e?.message || "Errore nel salvataggio");
    } finally {
      setAreaSaving(false);
    }
  };

  const confirmAreaDelete = async () => {
    if (!pendingAreaDelete) return;

    try {
      const res = await fetch(`/api/areas/${pendingAreaDelete}`, {
        method: "DELETE",
      });

      if (res.ok) {
        fetchData();
      } else {
        alert("Errore durante l'eliminazione");
      }
    } catch (error) {
      console.error("Error deleting area:", error);
      alert("Errore durante l'eliminazione");
    } finally {
      setShowAreaConfirmDialog(false);
      setPendingAreaDelete(null);
    }
  };

  const cancelAreaDelete = () => {
    setShowAreaConfirmDialog(false);
    setPendingAreaDelete(null);
  };

  // Mansioni handlers
  const handleDutyDelete = (id: string) => {
    setPendingDutyDelete(id);
    setShowDutyConfirmDialog(true);
  };

  const getAreaPrefix = (area: string) => {
    const areaObj = areas.find(a => a.name === area);
    return areaObj?.prefix || "";
  };

  const openNewDuty = () => {
    setEditingDuty(null);
    setDutyName("");
    setDutyArea("");
    setDutyCodeNumber("");
    setDutyError("");
    setDutyCodeError("");
    setDutyNameError("");
    setDutyNameTouched(false);
    setSuggestedCode("");
    
    setIsDutyFormOpen(true);
  };

  const openEditDuty = (duty: Duty) => {
    setEditingDuty(duty);
    setDutyName(duty.name);
    setDutyArea(duty.area);
    const match = (duty.code || "").match(/^(?:[A-Z]-)?(\d{3})$/);
    setDutyCodeNumber(match ? match[1] : "");
    setDutyError("");
    setDutyCodeError("");
    setDutyNameError("");
    setDutyNameTouched(false);
    setIsDutyFormOpen(true);
  };

  const submitDuty = async () => {
    if (!dutyName.trim()) { 
      setDutyNameError("Il nome è obbligatorio");
      setDutyNameTouched(true);
      return; 
    }
    if (!dutyArea.trim()) { setDutyError("L'area è obbligatoria"); return; }
    
    // Per creazione usa suggestedCode, per modifica usa dutyCodeNumber
    const codeToUse = editingDuty ? dutyCodeNumber : suggestedCode;
    if (!codeToUse || codeToUse.length !== 3) { setDutyError("Il codice deve essere di 3 cifre"); return; }
    
    // Ottieni il prefisso dall'area selezionata
    const areaPrefix = getAreaPrefix(dutyArea);
    if (!areaPrefix) {
      setDutyError("L'area selezionata non ha un prefisso valido");
      return;
    }
    
    // Costruisci il codice completo con prefisso
    const fullCode = `${areaPrefix}-${codeToUse}`;
    
    setDutySaving(true);
    setDutyError("");
    try {
      const payload: any = { name: dutyName.trim(), area: dutyArea, code: fullCode };
      const url = editingDuty ? `/api/duties/${editingDuty.id}` : "/api/duties";
      const method = editingDuty ? "PATCH" : "POST";
      const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const data = await res.json();
      if (!res.ok) {
        setDutyError(data.error || data.details || "Errore nel salvataggio");
      } else {
        setIsDutyFormOpen(false);
        await fetchData();
      }
    } catch (e) {
      setDutyError("Errore nel salvataggio");
    } finally {
      setDutySaving(false);
    }
  };

  const confirmDutyDelete = async () => {
    if (!pendingDutyDelete) return;

    try {
      const res = await fetch(`/api/duties/${pendingDutyDelete}`, {
        method: "DELETE",
      });

      if (res.ok) {
        fetchData();
      } else {
        alert("Errore durante l'eliminazione");
      }
    } catch (error) {
      console.error("Error deleting duty:", error);
      alert("Errore durante l'eliminazione");
    } finally {
      setShowDutyConfirmDialog(false);
      setPendingDutyDelete(null);
    }
  };

  const cancelDutyDelete = () => {
    setShowDutyConfirmDialog(false);
    setPendingDutyDelete(null);
  };

  if (loading) {
    return <PageSkeleton />;
  }

  return (
    <DashboardShell>
      <div>
        <div className="flex justify-between items-center mb-6">
          <div className="flex items-center gap-3">
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
            <h1 className="text-3xl font-bold">Aree e Mansioni</h1>
          </div>
        </div>

        {/* Aree Section */}
        <div className="mb-12">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-2xl font-semibold">Aree</h2>
            <button
              onClick={openNewArea}
              className="px-4 py-2 rounded-lg bg-gray-900 text-white hover:bg-gray-800 hover:shadow-lg hover:scale-105 active:scale-100 transition-all duration-200 cursor-pointer"
            >
              Nuova Area
            </button>
          </div>

          {sortedAreas.length === 0 ? (
            <p className="text-gray-600">Nessuna area trovata.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th
                      className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                      onClick={() => handleSort("code")}
                    >
                      Codice
                    </th>
                    <th
                      className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                      onClick={() => handleSort("name")}
                    >
                      Nome Area
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Prefisso
                    </th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Azioni
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {sortedAreas.map((area) => (
                    <tr key={area.id}>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                        {area.code}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {area.name}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {area.prefix || "-"}
                      </td>
                      <td className="px-6 py-2 whitespace-nowrap text-right text-sm font-medium">
                        <div className="inline-flex items-center gap-2">
                          <button onClick={() => openEditArea(area)} aria-label="Modifica" title="Modifica" className="h-8 w-8 inline-flex items-center justify-center rounded-lg bg-gray-900 text-white hover:bg-gray-800 hover:shadow-lg transition-colors">
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15.232 5.232l3.536 3.536M4 20h4l10.293-10.293a1 1 0 000-1.414l-2.586-2.586a1 1 0 00-1.414 0L4 16v4z" /></svg>
                          </button>
                          <button onClick={() => handleAreaDelete(area.id)} aria-label="Elimina" title="Elimina" className="h-8 w-8 inline-flex items-center justify-center rounded-lg bg-red-600 text-white hover:bg-red-700 hover:shadow-lg transition-colors">
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

        {/* Mansioni Section */}
        <div>
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-2xl font-semibold">Mansioni</h2>
            <button
              onClick={openNewDuty}
              className="px-4 py-2 rounded-lg bg-gray-900 text-white hover:bg-gray-800 hover:shadow-lg hover:scale-105 active:scale-100 transition-all duration-200 cursor-pointer"
            >
              Nuova Mansione
            </button>
          </div>

          <div className="mb-4">
            <label htmlFor="areaFilter" className="block text-sm font-medium text-gray-700 mb-2">
              Filtra per Area:
            </label>
            <select
              id="areaFilter"
              value={areaFilter}
              onChange={(e) => setAreaFilter(e.target.value)}
              className="px-4 py-2 border border-gray-300 rounded-lg hover:border-gray-400 hover:shadow-md hover:bg-gray-50 focus:ring-2 focus:ring-gray-900 focus:border-transparent transition-all duration-200 cursor-pointer"
            >
              <option value="TUTTE">Tutte le aree</option>
              <option value="Area Tecnica">Area Tecnica</option>
              <option value="Area di Sala">Area di Sala</option>
              <option value="Area di Biglietteria">Area di Biglietteria</option>
            </select>
          </div>

          {sortedDuties.length === 0 ? (
            <p className="text-gray-600">Nessuna mansione trovata.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th
                      className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                      onClick={() => handleDutySort("code")}
                    >
                      Codice
                    </th>
                    <th
                      className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                      onClick={() => handleDutySort("name")}
                    >
                      Nome Mansione
                    </th>
                    <th
                      className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                      onClick={() => handleDutySort("area")}
                    >
                      Area
                    </th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Azioni
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {sortedDuties.map((duty) => (
                    <tr key={duty.id}>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                        {duty.code}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {duty.name}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {duty.area}
                      </td>
                      <td className="px-6 py-2 whitespace-nowrap text-right text-sm font-medium">
                        <div className="inline-flex items-center gap-2">
                          <button onClick={() => openEditDuty(duty)} aria-label="Modifica" title="Modifica" className="h-8 w-8 inline-flex items-center justify-center rounded-lg bg-gray-900 text-white hover:bg-gray-800 hover:shadow-lg transition-colors">
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15.232 5.232l3.536 3.536M4 20h4l10.293-10.293a1 1 0 000-1.414l-2.586-2.586a1 1 0 00-1.414 0L4 16v4z" /></svg>
                          </button>
                          <button onClick={() => handleDutyDelete(duty.id)} aria-label="Elimina" title="Elimina" className="h-8 w-8 inline-flex items-center justify-center rounded-lg bg-red-600 text-white hover:bg-red-700 hover:shadow-lg transition-colors">
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

      {/* Confirm Dialogs */}
      <ConfirmDialog
        isOpen={showAreaConfirmDialog}
        title="Conferma Eliminazione"
        message="Sei sicuro di voler eliminare questa area? Questa azione non può essere annullata."
        onConfirm={confirmAreaDelete}
        onCancel={cancelAreaDelete}
      />

      <ConfirmDialog
        isOpen={showDutyConfirmDialog}
        title="Conferma Eliminazione"
        message="Sei sicuro di voler eliminare questa mansione? Questa azione non può essere annullata."
        onConfirm={confirmDutyDelete}
        onCancel={cancelDutyDelete}
      />

      {/* Area Form Modal (semplice overlay) */}
      {isAreaFormOpen && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md">
            <h3 className="text-lg font-semibold mb-4">{editingArea ? "Modifica Area" : "Nuova Area"}</h3>
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Nome Area *</label>
                <input
                  type="text"
                  value={areaName}
                  onChange={(e) => {
                    setAreaName(e.target.value);
                    setAreaNameError(""); // Clear error on change
                  }}
                  onBlur={() => setAreaNameTouched(true)}
                  className={`w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-gray-500 focus:border-transparent ${
                    areaNameError ? 'border-red-500' : 'border-gray-300'
                  }`}
                />
                {areaNameError && (
                  <p className="text-red-600 text-sm mt-1">{areaNameError}</p>
                )}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Prefisso Lettera (es. A, B, S, T) {!editingArea ? '*' : ''}
                </label>
                <input
                  type="text"
                  value={areaPrefix}
                  onChange={(e) => {
                    setAreaPrefix(e.target.value.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 1));
                    setPrefixError(""); // Clear prefix error on change
                  }}
                  maxLength={1}
                  placeholder="A"
                  className={`w-20 px-4 py-2 border rounded-lg focus:ring-2 focus:ring-gray-500 focus:border-transparent ${
                    prefixError ? 'border-red-500' : 'border-gray-300'
                  }`}
                />
                {prefixError && (
                  <p className="text-red-600 text-sm mt-1">{prefixError}</p>
                )}
                <p className="text-xs text-gray-500 mt-1">
                  {editingArea 
                    ? "Modificando il prefisso, verranno aggiornati automaticamente tutti i codici delle mansioni di quest'area"
                    : "Una singola lettera maiuscola che verrà usata per i codici delle mansioni di quest'area"
                  }
                </p>
              </div>
              <div>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={areaEnabledInWorkdayPlanning}
                    onChange={(e) => setAreaEnabledInWorkdayPlanning(e.target.checked)}
                    className="w-4 h-4 text-gray-900 border-gray-300 rounded focus:ring-gray-500 cursor-pointer"
                  />
                  <span className="text-sm font-medium text-gray-700">Abilita in programmazione giornate</span>
                </label>
                <p className="text-xs text-gray-500 mt-1 ml-6">
                  Se abilitata, questa area sarà visualizzata come box nella pagina di programmazione giornate
                </p>
              </div>
              {areaError && <p className="text-sm text-red-600 mt-2">{areaError}</p>}
            </div>
            <div className="flex justify-end gap-2 mt-4">
              <button onClick={() => setIsAreaFormOpen(false)} className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 hover:border-gray-400 hover:shadow-md hover:scale-105 active:scale-100 transition-all duration-200 cursor-pointer">Annulla</button>
              <button data-area-save-button onClick={submitArea} disabled={areaSaving || areaError !== "" || prefixError !== "" || areaNameError !== ""} className={`px-4 py-2 rounded-lg ${
                areaSaving || areaError !== "" || prefixError !== "" || areaNameError !== ""
                  ? 'bg-gray-400 text-gray-200 cursor-not-allowed'
                  : 'bg-gray-900 text-white hover:bg-gray-800 hover:shadow-lg hover:scale-105 active:scale-100 transition-all duration-200 cursor-pointer'
              }`}>{areaSaving ? "Salvataggio..." : (editingArea ? "Salva modifiche" : "Salva")}</button>
            </div>
          </div>
        </div>
      )}

      {/* Duty Form Modal */}
      {isDutyFormOpen && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-lg">
            <h3 className="text-lg font-semibold mb-4">{editingDuty ? "Modifica Mansione" : "Nuova Mansione"}</h3>
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Nome Mansione *</label>
                <input 
                  type="text" 
                  value={dutyName} 
                  onChange={(e) => {
                    setDutyName(e.target.value);
                    setDutyNameError(""); // Clear error on change
                  }}
                  onBlur={() => setDutyNameTouched(true)}
                  className={`w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-gray-500 focus:border-transparent ${
                    dutyNameError ? 'border-red-500' : 'border-gray-300'
                  }`}
                />
                {dutyNameError && (
                  <p className="text-red-600 text-sm mt-1">{dutyNameError}</p>
                )}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Area *</label>
                <select value={dutyArea} onChange={(e) => setDutyArea(e.target.value)} className="w-full px-4 py-2 border border-gray-300 rounded-lg hover:border-gray-400 hover:shadow-md hover:bg-gray-50 focus:ring-2 focus:ring-gray-900 focus:border-transparent transition-all duration-200 cursor-pointer h-[42px]">
                  <option value="">Seleziona area</option>
                  <option value="Area Tecnica">Area Tecnica</option>
                  <option value="Area di Sala">Area di Sala</option>
                  <option value="Area di Biglietteria">Area di Biglietteria</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Codice (3 cifre) *</label>
                <div className="flex items-center gap-2">
                  <input type="text" value={getAreaPrefix(dutyArea)} disabled className="w-14 px-4 py-2 border border-gray-300 rounded-lg bg-gray-100 text-gray-700" />
                  <input 
                    type="text" 
                    value={editingDuty ? dutyCodeNumber : (suggestedCode || "001")} 
                    onChange={editingDuty ? (e) => {
                      setDutyCodeNumber(e.target.value.replace(/\D/g,'').slice(0,3));
                      setDutyCodeError(""); // Clear error on change
                    } : undefined}
                    disabled={!editingDuty}
                    placeholder="001" 
                    className={`w-24 px-4 py-2 border rounded-lg focus:ring-2 focus:ring-gray-500 focus:border-transparent disabled:bg-gray-100 disabled:text-gray-700 ${
                      dutyCodeError ? 'border-red-500' : 'border-gray-300'
                    }`}
                  />
                </div>
                {dutyCodeError && (
                  <p className="text-red-600 text-sm mt-1">{dutyCodeError}</p>
                )}
                {!editingDuty && <p className="text-xs text-gray-500 mt-1">Codice automaticamente generato</p>}
              </div>
              {dutyError && <p className="text-sm text-red-600">{dutyError}</p>}
            </div>
            <div className="flex justify-end gap-2 mt-4">
              <button onClick={() => setIsDutyFormOpen(false)} className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 hover:border-gray-400 hover:shadow-md hover:scale-105 active:scale-100 transition-all duration-200 cursor-pointer">Annulla</button>
              <button data-duty-save-button onClick={submitDuty} disabled={dutySaving || dutyError !== "" || dutyCodeError !== "" || dutyNameError !== ""} className={`px-4 py-2 rounded-lg ${
                dutySaving || dutyError !== "" || dutyCodeError !== "" || dutyNameError !== ""
                  ? 'bg-gray-400 text-gray-200 cursor-not-allowed'
                  : 'bg-gray-900 text-white hover:bg-gray-800 hover:shadow-lg hover:scale-105 active:scale-100 transition-all duration-200 cursor-pointer'
              }`}>{dutySaving ? "Salvataggio..." : (editingDuty ? "Salva modifiche" : "Salva")}</button>
            </div>
          </div>
        </div>
      )}
    </DashboardShell>
  );
}

