"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Navbar from "@/components/Navbar";
import { useSession } from "next-auth/react";
import AlertDialog from "@/components/AlertDialog";

const NOTIFICATION_INFO: Record<string, { desc: string; example: string }> = {
  MISSING_HOURS_REMINDER: {
    desc: "Notifica inviata ai lavoratori che non hanno inserito le ore lavorate per i turni già svolti. Viene inviata automaticamente ogni giorno (cron) e può essere inviata manualmente dalla sezione Turni e Ore.\nIl parametro «Ora cron» è in UTC: per le 8:00 in Italia, usa 7 in inverno (CET) o 6 in estate (CEST).\n«Giorni indietro»: quanti giorni controllare (es. 60 = ultimi 60 giorni).\n«Giorni da escludere»: quanti giorni recenti non considerare per dare tempo di inserire le ore; Es. 1 = non considerare ieri, 2 = escludi ieri e l'altro ieri.",
    example: "Mario Rossi ha svolto un turno tre giorni fa ma non ha ancora inserito le ore. Riceve una notifica: «Hai turni con ore non inserite. Inserisci le ore dalla sezione I miei turni.»\nCon Giorni da escludere = 1 il cron non notifica per i turni di ieri.\nEsempio orario: 7 UTC = 8:00 Italia (inverno), 9:00 Italia (estate).",
  },
  UNAVAILABILITY_CREATED_BY_ADMIN: {
    desc: "Notifica inviata al lavoratore quando un amministratore inserisce un'indisponibilità al suo posto (es. ferie, malattia).",
    example: "L'admin inserisce per Mario Rossi un'indisponibilità dal 20 al 25 marzo. Mario riceve: «Un amministratore ha inserito un'indisponibilità per te. Periodo: 20/03 - 25/03».",
  },
  UNAVAILABILITY_MODIFIED_BY_ADMIN: {
    desc: "Notifica inviata al lavoratore quando un amministratore modifica un'indisponibilità già esistente.",
    example: "L'admin sposta l'indisponibilità di Mario dal 20-25 marzo al 22-27 marzo. Mario riceve la notifica con i dettagli della modifica.",
  },
  UNAVAILABILITY_DELETED_BY_ADMIN: {
    desc: "Notifica inviata al lavoratore quando un amministratore elimina un'indisponibilità a suo nome.",
    example: "L'admin elimina l'indisponibilità di Mario per un errore. Mario riceve: «Un amministratore ha eliminato un'indisponibilità.»",
  },
  UNAVAILABILITY_APPROVED: {
    desc: "Notifica inviata al lavoratore quando la sua richiesta di indisponibilità (in conflitto con turni assegnati) viene approvata.",
    example: "Mario aveva comunicato un'indisponibilità per il 10 aprile pur avendo un turno. L'admin approva: Mario riceve «La tua indisponibilità è stata approvata.»",
  },
  UNAVAILABILITY_REJECTED: {
    desc: "Notifica inviata al lavoratore quando la sua richiesta di indisponibilità (in conflitto con turni assegnati) viene rifiutata.",
    example: "Mario aveva comunicato un'indisponibilità per il 10 aprile con turno assegnato. L'admin rifiuta: Mario riceve «La tua indisponibilità non è stata approvata.»",
  },
  ORE_INSERITE_DA_ADMIN: {
    desc: "Notifica inviata al lavoratore quando un amministratore inserisce le ore lavorate al suo posto per un turno.",
    example: "L'admin inserisce 8 ore per Mario per il turno del 15/02. Mario riceve la notifica con data, orario, evento e località.",
  },
  ORE_MODIFICATE_DA_ADMIN: {
    desc: "Notifica inviata al lavoratore quando un amministratore modifica le ore da lui inserite.",
    example: "Mario aveva inserito 6 ore, l'admin corregge a 8 ore. Mario riceve la notifica con ore originali barrate e nuove ore.",
  },
  ORE_ELIMINATE_DA_ADMIN: {
    desc: "Notifica inviata al lavoratore quando un amministratore elimina le ore da lui inserite per un turno.",
    example: "L'admin elimina le ore inserite da Mario per il turno del 15/02. Mario riceve la notifica con i dettagli del turno.",
  },
  ADMIN_LOCKED_ACCOUNTS: {
    desc: "Notifica inviata ai SuperAdmin quando ci sono account bloccati (es. dopo troppi tentativi di login errati).\nSolo i SuperAdmin la ricevono.",
    example: "Dopo 5 login errati, l'account di mario.rossi@teatro.it viene bloccato. I SuperAdmin ricevono: «1 account bloccato: Mario Rossi - mario.rossi@teatro.it»",
  },
  UNAVAILABILITY_PENDING_APPROVAL: {
    desc: "Notifica inviata agli amministratori quando un lavoratore comunica un'indisponibilità in conflitto con turni già assegnati. Richiede approvazione.",
    example: "Mario comunica un'indisponibilità per il 10 aprile ma ha un turno assegnato. Gli admin ricevono: «Mario Rossi ha comunicato un'indisponibilità in conflitto con turni assegnati. Approva dalla sezione Indisponibilità.»",
  },
  UNAVAILABILITY_MODIFIED_BY_WORKER: {
    desc: "Notifica inviata agli amministratori quando un lavoratore modifica la propria indisponibilità in giornate con eventi attivi.",
    example: "Mario modifica la sua indisponibilità dal 10-12 aprile al 11-13 aprile. Gli admin ricevono la notifica con i dettagli.",
  },
  UNAVAILABILITY_DELETED_BY_WORKER: {
    desc: "Notifica inviata agli amministratori quando un lavoratore elimina la propria indisponibilità in giornate con eventi attivi.",
    example: "Mario elimina la sua indisponibilità per il 15 aprile. Gli admin ricevono la notifica.",
  },
  WORKDAY_ISSUES: {
    desc: "Notifica inviata agli amministratori sui problemi di programmazione: workday senza assegnazioni, personale insufficiente, clienti non impostati.\nViene inviata dal cron ogni giorno per i giorni configurati.\nIl parametro «Giorni in avanti» indica quanti giorni in avanti considerare per i problemi di programmazione (workday, personale, clienti).",
    example: "Il 18/02 gli admin ricevono: «20/02: Workday senza assegnazioni | Personale insufficiente in Sala» per i problemi nei prossimi 7 giorni.",
  },
};

interface Company {
  id: string;
  ragioneSociale: string;
}

interface Area {
  id: string;
  name: string;
  code: string;
}

interface NotificationSetting {
  type: string;
  label: string;
  isActive: boolean;
  priority: string;
  showInDashboardModal: boolean;
  metadata: { workdayIssuesDaysAhead?: number; cronHour?: number; giorniIndietro?: number; giorniEsclusi?: number } | null;
  hasParams: boolean;
}

type Tab = "user" | "system";

export default function NotificationsSettingsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { data: session, status } = useSession();
  const tabParam = searchParams.get("tab");
  const [activeTab, setActiveTab] = useState<Tab>(tabParam === "system" ? "system" : "user");
  const isSuperAdmin = (session?.user as { isSuperAdmin?: boolean })?.isSuperAdmin === true;
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const [companyIds, setCompanyIds] = useState<string[]>([]);
  const [areaIds, setAreaIds] = useState<string[]>([]);

  const [companies, setCompanies] = useState<Company[]>([]);
  const [areas, setAreas] = useState<Area[]>([]);

  const [systemWorker, setSystemWorker] = useState<NotificationSetting[]>([]);
  const [systemAdmin, setSystemAdmin] = useState<NotificationSetting[]>([]);
  const [systemLoading, setSystemLoading] = useState(false);
  const [systemSaving, setSystemSaving] = useState(false);
  const [systemError, setSystemError] = useState("");
  const [systemSuccess, setSystemSuccess] = useState("");
  const [systemDirty, setSystemDirty] = useState<Set<string>>(new Set());
  const [infoModalType, setInfoModalType] = useState<string | null>(null);
  const [paramsModal, setParamsModal] = useState<{ type: string; category: "worker" | "admin"; label: string } | null>(null);
  const [paramsModalDraft, setParamsModalDraft] = useState<Record<string, unknown>>({});

  const userRole = (session?.user as { role?: string })?.role || "";
  const userCompanyId = (session?.user as { companyId?: string })?.companyId;
  const isResponsabile = userRole === "RESPONSABILE";

  useEffect(() => {
    if (status === "loading") return;
    const allowed = ["SUPER_ADMIN", "ADMIN", "RESPONSABILE"].includes(userRole);
    if (!session?.user || !allowed) {
      router.push("/settings");
      return;
    }
    fetchData();
  }, [session, status, userRole, router]);

  useEffect(() => {
    if (tabParam === "system" && isSuperAdmin) {
      setActiveTab("system");
    }
  }, [tabParam, isSuperAdmin]);

  const fetchData = async () => {
    try {
      const [prefRes, companiesRes, areasRes] = await Promise.all([
        fetch("/api/settings/notifications"),
        fetch("/api/companies"),
        fetch("/api/areas"),
      ]);

      if (prefRes.ok) {
        const pref = await prefRes.json();
        setCompanyIds(Array.isArray(pref.companyIds) ? pref.companyIds : []);
        setAreaIds(Array.isArray(pref.areaIds) ? pref.areaIds : []);
      } else if (prefRes.status === 403) {
        router.push("/settings");
        return;
      }

      if (companiesRes.ok) {
        const comps = await companiesRes.json();
        setCompanies(comps);
      }
      if (areasRes.ok) {
        const a = await areasRes.json();
        setAreas(a);
      }
    } catch (err) {
      console.error(err);
      setError("Errore nel caricamento");
    } finally {
      setLoading(false);
    }
  };

  const handleSaveAreasCompanies = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSuccess("");
    setSaving(true);
    try {
      const res = await fetch("/api/settings/notifications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ companyIds, areaIds }),
      });
      if (res.ok) {
        setSuccess("Preferenze salvate");
      } else {
        const data = await res.json().catch(() => ({}));
        setError(data.details ? `${data.error}: ${data.details}` : (data.error || "Errore nel salvataggio"));
      }
    } catch (err) {
      setError("Errore nel salvataggio");
    } finally {
      setSaving(false);
    }
  };

  const toggleCompany = (id: string) => {
    if (isResponsabile && userCompanyId && id !== userCompanyId) return;
    setCompanyIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const toggleArea = (id: string) => {
    setAreaIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const selectAllCompanies = () => {
    if (isResponsabile && userCompanyId) {
      setCompanyIds([userCompanyId]);
    } else {
      setCompanyIds(companies.map((c) => c.id));
    }
  };

  const selectAllAreas = () => {
    setAreaIds(areas.map((a) => a.id));
  };

  const clearCompanies = () => {
    setCompanyIds([]);
  };

  const clearAreas = () => setAreaIds([]);

  const fetchSystemData = async () => {
    setSystemLoading(true);
    setSystemError("");
    try {
      const res = await fetch("/api/settings/notifications/system");
      if (res.ok) {
        const data = await res.json();
        setSystemWorker(data.worker ?? []);
        setSystemAdmin(data.admin ?? []);
      } else if (res.status === 403) {
        router.push("/settings");
      }
    } catch (err) {
      console.error(err);
      setSystemError("Errore nel caricamento");
    } finally {
      setSystemLoading(false);
    }
  };

  useEffect(() => {
    if (activeTab === "system" && isSuperAdmin) {
      fetchSystemData();
    }
  }, [activeTab, isSuperAdmin]);

  useEffect(() => {
    if (!paramsModal) return;
    const list = paramsModal.category === "worker" ? systemWorker : systemAdmin;
    const item = list.find((n) => n.type === paramsModal.type);
    setParamsModalDraft({ ...(item?.metadata ?? {}) });
  }, [paramsModal, systemWorker, systemAdmin]);

  const updateSystemLocal = (
    category: "worker" | "admin",
    type: string,
    field: keyof NotificationSetting,
    value: unknown
  ) => {
    const setter = category === "worker" ? setSystemWorker : setSystemAdmin;
    const list = category === "worker" ? systemWorker : systemAdmin;
    setter(
      list.map((n) =>
        n.type === type ? { ...n, [field]: value } : n
      )
    );
    setSystemDirty((prev) => new Set(prev).add(type));
  };

  const handleSaveSystem = async () => {
    setSystemError("");
    setSystemSuccess("");
    setSystemSaving(true);
    try {
      const updates: Array<{
        type: string;
        isActive?: boolean;
        priority?: string;
        showInDashboardModal?: boolean;
        metadata?: Record<string, unknown>;
      }> = [];

      for (const n of [...systemWorker, ...systemAdmin]) {
        if (!systemDirty.has(n.type)) continue;
        const u: (typeof updates)[0] = { type: n.type };
        u.isActive = n.isActive;
        u.priority = n.priority;
        u.showInDashboardModal = n.showInDashboardModal;
        if (n.hasParams && n.metadata) u.metadata = n.metadata;
        updates.push(u);
      }

      const res = await fetch("/api/settings/notifications/system", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ updates }),
      });
      if (res.ok) {
        setSystemSuccess("Impostazioni salvate");
        setSystemDirty(new Set());
      } else {
        const data = await res.json().catch(() => ({}));
        setSystemError(data.error || "Errore nel salvataggio");
      }
    } catch (err) {
      setSystemError("Errore nel salvataggio");
    } finally {
      setSystemSaving(false);
    }
  };

  const renderSystemRow = (n: NotificationSetting, category: "worker" | "admin") => {
    const info = NOTIFICATION_INFO[n.type];
    return (
    <tr key={n.type} className="border-b border-gray-100">
      <td className="pl-4 py-3 pr-4 font-medium text-gray-900 min-w-[260px]">{n.label}</td>
      <td className="pl-4 py-3 pr-4">
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={n.isActive}
            onChange={(e) => updateSystemLocal(category, n.type, "isActive", e.target.checked)}
            className="rounded border-gray-300"
          />
          <span className="text-sm">Attiva</span>
        </label>
      </td>
      <td className="pl-4 py-3 pr-4">
        <select
          value={n.priority}
          onChange={(e) => updateSystemLocal(category, n.type, "priority", e.target.value)}
          className="px-2 py-1.5 border border-gray-300 rounded text-sm"
        >
          <option value="HIGH">Alta</option>
          <option value="MEDIUM">Media</option>
          <option value="LOW">Bassa</option>
        </select>
      </td>
      <td className="pl-4 py-3 pr-4">
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={n.showInDashboardModal}
            onChange={(e) => updateSystemLocal(category, n.type, "showInDashboardModal", e.target.checked)}
            className="rounded border-gray-300"
          />
          <span className="text-sm">Modal dashboard</span>
        </label>
      </td>
      <td className="pl-4 py-3 pr-4">
        {n.hasParams ? (
          <button
            type="button"
            onClick={() => setParamsModal({ type: n.type, category, label: n.label })}
            className="px-3 py-1.5 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 border border-gray-300"
          >
            Configura
          </button>
        ) : (
          <span className="text-sm text-gray-400">—</span>
        )}
      </td>
      <td className="pl-4 py-3 pr-4 w-14">
        {info && (
          <button
            type="button"
            onClick={() => setInfoModalType(n.type)}
            className="p-1.5 rounded-lg bg-gray-900 text-white hover:bg-gray-800 transition-colors"
            title="Info"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </button>
        )}
      </td>
    </tr>
  );
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-white text-gray-900">
        <Navbar />
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="animate-pulse h-8 bg-gray-200 rounded w-48 mb-6" />
          <div className="animate-pulse h-64 bg-gray-100 rounded" />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white text-gray-900">
      <Navbar />
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <a
          href="/settings"
          className="inline-flex items-center text-gray-600 hover:text-gray-900 mb-6"
        >
          <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 19l-7-7 7-7" />
          </svg>
          Torna alle Impostazioni
        </a>

        <h1 className="text-4xl font-bold mb-8">Impostazioni notifiche</h1>

        <div className="flex gap-2 mb-6 border-b border-gray-200">
          <button
            type="button"
            onClick={() => setActiveTab("user")}
            className={`px-4 py-2 font-medium border-b-2 -mb-px transition-colors ${
              activeTab === "user"
                ? "border-gray-900 text-gray-900"
                : "border-transparent text-gray-500 hover:text-gray-700"
            }`}
          >
            Notifiche utente
          </button>
          {isSuperAdmin && (
            <button
              type="button"
              onClick={() => setActiveTab("system")}
              className={`px-4 py-2 font-medium border-b-2 -mb-px transition-colors ${
                activeTab === "system"
                  ? "border-gray-900 text-gray-900"
                  : "border-transparent text-gray-500 hover:text-gray-700"
              }`}
            >
              Notifiche di sistema
            </button>
          )}
        </div>

        {error && (
          <div className="mb-4 p-4 bg-red-50 border border-red-200 text-red-700 rounded-lg">
            {error}
          </div>
        )}
        {success && (
          <div className="mb-4 p-4 bg-green-50 border border-green-200 text-green-700 rounded-lg">
            {success}
          </div>
        )}

        {activeTab === "user" && (
          <div className="space-y-8 max-w-xl">
            <div className="border border-gray-200 rounded-lg p-6">
              <h2 className="text-xl font-semibold mb-4">Aree e aziende per le notifiche</h2>
            <p className="text-gray-600 mb-6">
              Seleziona le aziende e le aree per cui ricevere notifiche. Lascia vuoto per ricevere notifiche per tutte.
            </p>

            {isResponsabile && (
              <p className="text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-3 mb-6 text-sm">
                Come responsabile vedi solo la tua azienda.
              </p>
            )}

            <form onSubmit={handleSaveAreasCompanies}>
              <div className="mb-6">
                <div className="flex items-center justify-between mb-2">
                  <label className="block text-sm font-medium text-gray-700">Aziende</label>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={selectAllCompanies}
                      className="text-sm text-gray-600 hover:text-gray-900"
                    >
                      Tutte
                    </button>
                    <button
                      type="button"
                      onClick={clearCompanies}
                      className="text-sm text-gray-600 hover:text-gray-900"
                    >
                      Nessuna
                    </button>
                  </div>
                </div>
                <div className="border border-gray-200 rounded-lg p-3 max-h-40 overflow-y-auto space-y-2">
                  {companies
                    .filter((c) => !isResponsabile || c.id === userCompanyId)
                    .map((c) => (
                      <label key={c.id} className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={companyIds.includes(c.id)}
                          onChange={() => toggleCompany(c.id)}
                          className="rounded border-gray-300"
                        />
                        <span>{c.ragioneSociale}</span>
                      </label>
                    ))}
                  {companies.filter((c) => !isResponsabile || c.id === userCompanyId).length === 0 && (
                    <p className="text-gray-500 text-sm">Nessuna azienda disponibile</p>
                  )}
                </div>
              </div>

              <div className="mb-6">
                <div className="flex items-center justify-between mb-2">
                  <label className="block text-sm font-medium text-gray-700">Aree</label>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={selectAllAreas}
                      className="text-sm text-gray-600 hover:text-gray-900"
                    >
                      Tutte
                    </button>
                    <button
                      type="button"
                      onClick={clearAreas}
                      className="text-sm text-gray-600 hover:text-gray-900"
                    >
                      Nessuna
                    </button>
                  </div>
                </div>
                <div className="border border-gray-200 rounded-lg p-3 max-h-40 overflow-y-auto space-y-2">
                  {areas.map((a) => (
                    <label key={a.id} className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={areaIds.includes(a.id)}
                        onChange={() => toggleArea(a.id)}
                        className="rounded border-gray-300"
                      />
                      <span>{a.name}</span>
                    </label>
                  ))}
                  {areas.length === 0 && (
                    <p className="text-gray-500 text-sm">Nessuna area disponibile</p>
                  )}
                </div>
              </div>

              <button
                type="submit"
                disabled={saving}
                className="px-4 py-2 bg-gray-900 text-white rounded-lg hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {saving ? "Salvataggio..." : "Salva"}
              </button>
            </form>
            </div>
          </div>
        )}

        {activeTab === "system" && isSuperAdmin && (
          <div className="max-w-4xl">
            {systemError && (
              <div className="mb-4 p-4 bg-red-50 border border-red-200 text-red-700 rounded-lg">{systemError}</div>
            )}
            {systemSuccess && (
              <div className="mb-4 p-4 bg-green-50 border border-green-200 text-green-700 rounded-lg">{systemSuccess}</div>
            )}
            {systemLoading ? (
              <div className="animate-pulse h-64 bg-gray-100 rounded" />
            ) : (
              <>
                <p className="text-gray-600 mb-6 pl-4">
                  Configura attivazione, priorità e visualizzazione nel modal dashboard per ogni tipo di notifica.
                </p>
                <div className="space-y-8">
                  <div>
                    <h2 className="text-xl font-semibold mb-4 pl-4">Notifiche lavoratori</h2>
                    <div className="border border-gray-200 rounded-lg overflow-hidden">
                      <table className="min-w-full table-fixed">
                        <thead className="bg-gray-50">
                          <tr>
                            <th className="px-4 py-2 text-left text-sm font-medium text-gray-700 w-[260px] min-w-[260px]">Tipo</th>
                            <th className="px-4 py-2 text-left text-sm font-medium text-gray-700">Attiva</th>
                            <th className="px-4 py-2 text-left text-sm font-medium text-gray-700">Priorità</th>
                            <th className="px-4 py-2 text-left text-sm font-medium text-gray-700">Modal</th>
                            <th className="px-4 py-2 text-left text-sm font-medium text-gray-700">Parametri</th>
                            <th className="px-4 py-2 text-left text-sm font-medium text-gray-700 w-14"></th>
                          </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-100">
                          {systemWorker.map((n) => renderSystemRow(n, "worker"))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                  <div>
                    <h2 className="text-xl font-semibold mb-4 pl-4">Notifiche amministratori</h2>
                    <div className="border border-gray-200 rounded-lg overflow-hidden">
                      <table className="min-w-full table-fixed">
                        <thead className="bg-gray-50">
                          <tr>
                            <th className="px-4 py-2 text-left text-sm font-medium text-gray-700 w-[260px] min-w-[260px]">Tipo</th>
                            <th className="px-4 py-2 text-left text-sm font-medium text-gray-700">Attiva</th>
                            <th className="px-4 py-2 text-left text-sm font-medium text-gray-700">Priorità</th>
                            <th className="px-4 py-2 text-left text-sm font-medium text-gray-700">Modal</th>
                            <th className="px-4 py-2 text-left text-sm font-medium text-gray-700">Parametri</th>
                            <th className="px-4 py-2 text-left text-sm font-medium text-gray-700 w-14"></th>
                          </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-100">
                          {systemAdmin.map((n) => renderSystemRow(n, "admin"))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
                <div className="mt-8">
                  <button
                    type="button"
                    onClick={handleSaveSystem}
                    disabled={systemSaving || systemDirty.size === 0}
                    className="px-4 py-2 bg-gray-900 text-white rounded-lg hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {systemSaving ? "Salvataggio..." : "Salva modifiche"}
                  </button>
                </div>
              </>
            )}
          </div>
        )}

        {paramsModal && (() => {
          const meta = paramsModalDraft as { cronHour?: number; giorniIndietro?: number; giorniEsclusi?: number; workdayIssuesDaysAhead?: number };
          const isMissingHours = paramsModal.type === "MISSING_HOURS_REMINDER";
          const isWorkday = paramsModal.type === "WORKDAY_ISSUES";
          const info = NOTIFICATION_INFO[paramsModal.type];
          return (
            <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[9998]">
              <div className="bg-white rounded-lg shadow-xl p-6 max-w-md w-full mx-4">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-xl font-bold text-gray-900">Configura: {paramsModal.label}</h2>
                  {info && (
                    <button
                      type="button"
                      onClick={() => setInfoModalType(paramsModal.type)}
                      className="p-1.5 rounded-lg bg-gray-900 text-white hover:bg-gray-800 transition-colors"
                      title="Info"
                    >
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                    </button>
                  )}
                </div>
                <div className="space-y-4 mb-6">
                  {isMissingHours && (
                    <>
                      <div className="flex items-center justify-between gap-4">
                        <label className="text-sm text-gray-700">Ora cron (UTC):</label>
                        <input
                          type="number"
                          min={0}
                          max={23}
                          value={meta.cronHour ?? 8}
                          onChange={(e) =>
                            setParamsModalDraft((prev) => ({
                              ...prev,
                              cronHour: Math.max(0, Math.min(23, parseInt(e.target.value, 10) || 8)),
                            }))
                          }
                          className="w-20 px-2 py-1.5 border border-gray-300 rounded text-sm"
                        />
                      </div>
                      <div className="flex items-center justify-between gap-4">
                        <label className="text-sm text-gray-700">Giorni indietro:</label>
                        <input
                          type="number"
                          min={1}
                          max={365}
                          value={meta.giorniIndietro ?? 60}
                          onChange={(e) =>
                            setParamsModalDraft((prev) => ({
                              ...prev,
                              giorniIndietro: Math.max(1, Math.min(365, parseInt(e.target.value, 10) || 60)),
                            }))
                          }
                          className="w-20 px-2 py-1.5 border border-gray-300 rounded text-sm"
                        />
                      </div>
                      <div className="flex items-center justify-between gap-4">
                        <label className="text-sm text-gray-700">Giorni da escludere:</label>
                        <input
                          type="number"
                          min={0}
                          max={7}
                          value={meta.giorniEsclusi ?? 1}
                          onChange={(e) =>
                            setParamsModalDraft((prev) => ({
                              ...prev,
                              giorniEsclusi: Math.max(0, Math.min(7, parseInt(e.target.value, 10) || 1)),
                            }))
                          }
                          className="w-20 px-2 py-1.5 border border-gray-300 rounded text-sm"
                        />
                      </div>
                    </>
                  )}
                  {isWorkday && (
                    <div className="flex items-center justify-between gap-4">
                      <label className="text-sm text-gray-700">Giorni in avanti:</label>
                      <input
                        type="number"
                        min={1}
                        max={90}
                        value={meta.workdayIssuesDaysAhead ?? 7}
                        onChange={(e) =>
                          setParamsModalDraft((prev) => ({
                            ...prev,
                            workdayIssuesDaysAhead: Math.max(1, Math.min(90, parseInt(e.target.value, 10) || 7)),
                          }))
                        }
                        className="w-20 px-2 py-1.5 border border-gray-300 rounded text-sm"
                      />
                    </div>
                  )}
                </div>
                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setParamsModal(null)}
                    className="px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200"
                  >
                    Annulla
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      updateSystemLocal(paramsModal.category, paramsModal.type, "metadata", paramsModalDraft);
                      setSystemDirty((prev) => new Set(prev).add(paramsModal.type));
                      setParamsModal(null);
                    }}
                    className="px-4 py-2 bg-gray-900 text-white rounded-lg hover:bg-gray-800"
                  >
                    Salva
                  </button>
                </div>
              </div>
            </div>
          );
        })()}

        {infoModalType && NOTIFICATION_INFO[infoModalType] && (
          <AlertDialog
            isOpen={!!infoModalType}
            size="lg"
            title={systemWorker.find((n) => n.type === infoModalType)?.label ?? systemAdmin.find((n) => n.type === infoModalType)?.label ?? infoModalType}
            message={
              <>
                <p className="mb-4 whitespace-pre-line">{NOTIFICATION_INFO[infoModalType].desc}</p>
                <p className="text-sm text-gray-600 italic whitespace-pre-line">
                  <strong>Esempio:</strong> {NOTIFICATION_INFO[infoModalType].example}
                </p>
              </>
            }
            onClose={() => setInfoModalType(null)}
          />
        )}
      </div>
    </div>
  );
}
