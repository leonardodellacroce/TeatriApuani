"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { getWorkModeCookie } from "@/lib/workMode";
import { useRouter } from "next/navigation";
import DashboardShell from "@/components/DashboardShell";
import ConfirmDialog from "@/components/ConfirmDialog";
import { formatUserName, type UserLike } from "@/lib/formatUserName";

interface Unavailability {
  id: string;
  userId: string;
  dateStart: string;
  dateEnd: string;
  startTime: string | null;
  endTime: string | null;
  status: string;
  note: string | null;
  user: { id: string; name: string | null; cognome: string | null; code: string };
}

const ADMIN_ROLES = ["SUPER_ADMIN", "ADMIN", "RESPONSABILE"];

function formatDate(d: string) {
  return new Date(d).toLocaleDateString("it-IT", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

/** Formatta usando solo la parte data (YYYY-MM-DD) per evitare che 23:59:59 mostri il giorno successivo in timezone locali */
function formatDateFromPart(isoOrDateStr: string) {
  const part = isoOrDateStr.split("T")[0];
  return new Date(part + "T12:00:00.000Z").toLocaleDateString("it-IT", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

type TimeMode = "all_day" | "until" | "from" | "interval";

function formatTimeRange(start: string | null, end: string | null) {
  if (!start && !end) return "Tutto il giorno";
  if (start === "06:00" && end) return `fino alle ${end}`;
  if (start && end === "24:00") return `dalle ${start}`;
  if (start && end) return `${start} - ${end}`;
  if (start) return `dalle ${start}`;
  if (end) return `fino alle ${end}`;
  return "-";
}

function inferTimeMode(start: string | null, end: string | null): TimeMode {
  if (!start && !end) return "all_day";
  if (start === "06:00" && end) return "until";
  if (start && end === "24:00") return "from";
  if (start && end) return "interval";
  if (start) return "from";
  if (end) return "until";
  return "all_day";
}

function parseTimeToMinutes(t: string | null): number {
  if (!t) return 0;
  if (t === "24:00") return 24 * 60;
  const [h, m] = t.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}

/** Restituisce [startMin, endMin] per un giorno. all_day: [0,1440], until: [360,end], from: [start,1440], interval: [start,end] */
function getTimeRangeMinutes(start: string | null, end: string | null): [number, number] {
  if (!start && !end) return [0, 24 * 60];
  if (start === "06:00" && end) return [360, parseTimeToMinutes(end)];
  if (start && end === "24:00") return [parseTimeToMinutes(start), 24 * 60];
  if (start && end) return [parseTimeToMinutes(start), parseTimeToMinutes(end)];
  if (start) return [parseTimeToMinutes(start), 24 * 60];
  if (end) return [360, parseTimeToMinutes(end)];
  return [0, 24 * 60];
}

function timeRangesOverlap(a: [number, number], b: [number, number]): boolean {
  const [a1, a2] = a;
  const [b1, b2] = b;
  return a1 < b2 && b1 < a2;
}

/** Verifica se due indisponibilità si sovrappongono (date + orari) */
function unavailabilitiesOverlap(
  a: { dateStart: string; dateEnd: string; startTime: string | null; endTime: string | null },
  b: { dateStart: string; dateEnd: string; startTime: string | null; endTime: string | null }
): boolean {
  const aStart = a.dateStart.split("T")[0];
  const aEnd = a.dateEnd.split("T")[0];
  const bStart = b.dateStart.split("T")[0];
  const bEnd = b.dateEnd.split("T")[0];
  if (aStart > bEnd || bStart > aEnd) return false;
  const aTime = getTimeRangeMinutes(a.startTime, a.endTime);
  const bTime = getTimeRangeMinutes(b.startTime, b.endTime);
  return timeRangesOverlap(aTime, bTime);
}

export default function UnavailabilitiesPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [list, setList] = useState<Unavailability[]>([]);
  const [users, setUsers] = useState<Array<{ id: string; name: string | null; cognome: string | null; code: string }>>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [conflictAlert, setConflictAlert] = useState<string | null>(null);
  /** Conflitti con indisponibilità già comunicate: mostra dialog per scegliere quale mantenere */
  const [overlapConflict, setOverlapConflict] = useState<{
    overlapping: Unavailability[];
    payload: any;
  } | null>(null);

  const [formUserId, setFormUserId] = useState<string>("");
  const [formDateStart, setFormDateStart] = useState("");
  const [formDateEnd, setFormDateEnd] = useState("");
  const [formTimeMode, setFormTimeMode] = useState<TimeMode>("all_day");
  const [formStartTime, setFormStartTime] = useState("");
  const [formEndTime, setFormEndTime] = useState("");
  const [formNote, setFormNote] = useState("");

  const userRole = session?.user?.role || "";
  const isStandardUser = !ADMIN_ROLES.includes(userRole);
  const isNonStandardWorker = ["SUPER_ADMIN", "ADMIN", "RESPONSABILE"].includes(userRole) && (session?.user as any)?.isWorker === true;
  const workMode = getWorkModeCookie();
  const inWorkerMode = isNonStandardWorker && workMode === "worker";
  const isAdmin = ADMIN_ROLES.includes(userRole) && !inWorkerMode;

  useEffect(() => {
    if (status === "loading") return;
    if (!session?.user) {
      router.push("/login");
      return;
    }
    const canAccess = isStandardUser || isNonStandardWorker || (ADMIN_ROLES.includes(userRole) && !inWorkerMode);
    if (!canAccess) {
      router.push("/dashboard");
      return;
    }
    fetchList();
    if (isAdmin) fetchUsers();
  }, [status, session, router, isAdmin]);

  const fetchList = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (isAdmin) params.set("all", "true");
      const d = new Date();
      const monthStart = new Date(d.getFullYear(), d.getMonth() - 1, 1);
      const monthEnd = new Date(d.getFullYear(), d.getMonth() + 2, 0);
      params.set("dateFrom", monthStart.toISOString().split("T")[0]);
      params.set("dateTo", monthEnd.toISOString().split("T")[0]);
      const res = await fetch(`/api/unavailabilities?${params}`);
      if (res.ok) {
        const data = await res.json();
        setList(Array.isArray(data) ? data : []);
      } else {
        const err = await res.json().catch(() => ({}));
        console.error("GET unavailabilities failed:", err);
        setList([]);
      }
    } catch {
      setList([]);
    } finally {
      setLoading(false);
    }
  };

  const fetchUsers = async () => {
    try {
      const res = await fetch("/api/users?standard=true");
      if (res.ok) {
        const data = await res.json();
        setUsers(Array.isArray(data) ? data : []);
      }
    } catch {}
  };

  const resetForm = () => {
    setFormUserId(session?.user?.id as string || "");
    setFormDateStart("");
    setFormDateEnd("");
    setFormTimeMode("all_day");
    setFormStartTime("");
    setFormEndTime("");
    setFormNote("");
    setShowForm(false);
    setEditingId(null);
    setConflictAlert(null);
    setOverlapConflict(null);
  };

  const openCreate = () => {
    const today = new Date().toISOString().split("T")[0];
    setFormUserId(session?.user?.id as string || "");
    setFormDateStart(today);
    setFormDateEnd(today);
    setFormTimeMode("all_day");
    setFormStartTime("");
    setFormEndTime("");
    setFormNote("");
    setEditingId(null);
    setShowForm(true);
    setConflictAlert(null);
    setOverlapConflict(null);
  };

  const openEdit = (u: Unavailability) => {
    setFormUserId(u.userId);
    setFormDateStart(u.dateStart.split("T")[0]);
    setFormDateEnd(u.dateEnd.split("T")[0]);
    const mode = inferTimeMode(u.startTime, u.endTime);
    setFormTimeMode(mode);
    if (mode === "until") {
      setFormStartTime("");
      setFormEndTime(u.endTime || "");
    } else if (mode === "from") {
      setFormStartTime(u.startTime || "");
      setFormEndTime("");
    } else if (mode === "interval") {
      setFormStartTime(u.startTime || "");
      setFormEndTime(u.endTime || "");
    } else {
      setFormStartTime("");
      setFormEndTime("");
    }
    setFormNote(u.note || "");
    setEditingId(u.id);
    setShowForm(true);
    setConflictAlert(null);
    setOverlapConflict(null);
  };

  const doSubmit = async (payload: any, deleteOverlappingIds: string[] = []) => {
    try {
      for (const id of deleteOverlappingIds) {
        await fetch(`/api/unavailabilities/${id}`, { method: "DELETE" });
      }
      if (editingId) {
        const res = await fetch(`/api/unavailabilities/${editingId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (res.ok) {
          fetchList();
          resetForm();
        } else {
          const err = await res.json();
          alert(err.error || "Errore durante l'aggiornamento");
        }
      } else {
        const res = await fetch("/api/unavailabilities", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const data = await res.json();
        if (res.ok) {
          fetchList();
          if (data.hasConflict) {
            setConflictAlert("Sei già assegnato a un turno in questo periodo. Un amministratore è stato notificato, contattalo per l'approvazione dell'indisponibilità.");
            window.dispatchEvent(new CustomEvent("unavailabilitiesUpdated"));
          } else {
            resetForm();
          }
        } else {
          alert(data.details ? `${data.error}: ${data.details}` : data.error || "Errore durante la creazione");
        }
      }
    } catch (err) {
      alert("Errore di rete");
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const dateStart = formDateStart;
    const dateEnd = formTimeMode === "all_day" ? formDateEnd : formDateStart;
    if (!dateStart || !dateEnd) return;
    let startTime: string | undefined;
    let endTime: string | undefined;
    if (formTimeMode === "all_day") {
      startTime = undefined;
      endTime = undefined;
    } else if (formTimeMode === "until") {
      startTime = "06:00";
      endTime = formEndTime || undefined;
    } else if (formTimeMode === "from") {
      startTime = formStartTime || undefined;
      endTime = "24:00";
    } else {
      startTime = formStartTime || undefined;
      endTime = formEndTime || undefined;
    }
    const payload: any = {
      dateStart,
      dateEnd,
      startTime,
      endTime,
      note: formNote || undefined,
    };
    if (isAdmin && formUserId) payload.userId = formUserId;

    const newUnav = {
      dateStart,
      dateEnd,
      startTime: startTime || null,
      endTime: endTime || null,
    };

    try {
      const userId = isAdmin && formUserId ? formUserId : (session?.user as any)?.id;
      const params = new URLSearchParams();
      params.set("dateFrom", dateStart);
      params.set("dateTo", dateEnd);
      if (isAdmin) params.set("all", "true");
      else if (userId) params.set("userId", userId);
      const res = await fetch(`/api/unavailabilities?${params}`);
      const existingList: Unavailability[] = res.ok ? await res.json() : [];
      const overlapping = existingList.filter(
        (u) => (editingId ? u.id !== editingId : true) && u.userId === userId && unavailabilitiesOverlap(newUnav, u)
      );

      if (overlapping.length > 0) {
        setOverlapConflict({ overlapping, payload });
        return;
      }

      await doSubmit(payload);
    } catch (err) {
      alert("Errore di rete");
    }
  };

  const handleOverlapKeepNew = async () => {
    if (!overlapConflict) return;
    const ids = overlapConflict.overlapping.map((u) => u.id);
    await doSubmit(overlapConflict.payload, ids);
    setOverlapConflict(null);
  };

  const handleApprove = async (id: string) => {
    try {
      const res = await fetch(`/api/unavailabilities/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "APPROVED" }),
      });
      if (res.ok) {
        fetchList();
        window.dispatchEvent(new CustomEvent("unavailabilitiesUpdated"));
      } else {
        const err = await res.json();
        alert(err.error || "Errore durante l'approvazione");
      }
    } catch {
      alert("Errore di rete");
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      const res = await fetch(`/api/unavailabilities/${deleteTarget}`, { method: "DELETE" });
      if (res.ok) {
        fetchList();
        setDeleteTarget(null);
        window.dispatchEvent(new CustomEvent("unavailabilitiesUpdated"));
      } else {
        const err = await res.json();
        alert(err.error || "Errore durante l'eliminazione");
      }
    } catch {
      alert("Errore di rete");
    }
  };

  const allListUsers = list.map((u) => u.user).filter(Boolean) as UserLike[];
  const getUserName = (u: Unavailability) => {
    const userLike = u.user ? { name: u.user.name, cognome: u.user.cognome, code: u.user.code } : null;
    return userLike ? formatUserName(userLike, allListUsers) : "-";
  };

  if (status === "loading" || !session) {
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
        <h1 className="text-3xl font-bold mb-6">Indisponibilità</h1>
        <p className="text-gray-600 mb-6">
          {isAdmin
            ? "Visualizza e gestisci le indisponibilità comunicate dal personale. Puoi approvare quelle in attesa e creare indisponibilità per conto di altri."
            : "Comunica i giorni e gli orari in cui non sei disponibile per lavorare."}
        </p>

        {isAdmin && (
          <button
            onClick={openCreate}
            className="mb-6 px-4 py-2 bg-gray-900 text-white rounded-lg hover:bg-gray-800"
          >
            + Nuova indisponibilità
          </button>
        )}

        {!isAdmin && (
          <button
            onClick={openCreate}
            className="mb-6 px-4 py-2 bg-gray-900 text-white rounded-lg hover:bg-gray-800"
          >
            + Comunica indisponibilità
          </button>
        )}

        {showForm && (
          <div className="mb-8 p-6 border border-gray-200 rounded-lg bg-gray-50">
            <h2 className="text-xl font-semibold mb-4">{editingId ? "Modifica indisponibilità" : "Nuova indisponibilità"}</h2>
            {conflictAlert && (
              <div className="mb-4 p-4 bg-amber-50 border border-amber-200 rounded-lg text-amber-800">
                {conflictAlert}
              </div>
            )}
            <form onSubmit={handleSubmit} className="space-y-4">
              {isAdmin && !editingId && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Utente</label>
                  <select
                    value={formUserId}
                    onChange={(e) => setFormUserId(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                    required
                  >
                    <option value="">Seleziona utente</option>
                    {users.map((u) => (
                      <option key={u.id} value={u.id}>
                        {formatUserName(u, users)}
                      </option>
                    ))}
                  </select>
                </div>
              )}
              {formTimeMode === "all_day" ? (
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Data inizio *</label>
                    <input
                      type="date"
                      value={formDateStart}
                      onChange={(e) => setFormDateStart(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Data fine *</label>
                    <input
                      type="date"
                      value={formDateEnd}
                      onChange={(e) => setFormDateEnd(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                      required
                    />
                  </div>
                </div>
              ) : (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Data *</label>
                  <input
                    type="date"
                    value={formDateStart}
                    onChange={(e) => {
                      const v = e.target.value;
                      setFormDateStart(v);
                      setFormDateEnd(v);
                    }}
                    className="w-full max-w-xs px-3 py-2 border border-gray-300 rounded-lg"
                    required
                  />
                </div>
              )}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Modalità orario</label>
                <div className="flex flex-wrap gap-2">
                  {(["all_day", "until", "from", "interval"] as const).map((mode) => (
                    <button
                      key={mode}
                      type="button"
                      onClick={() => {
                        setFormTimeMode(mode);
                        if (mode !== "all_day") setFormDateEnd(formDateStart);
                      }}
                      className={`px-3 py-2 rounded-lg text-sm font-medium border transition-colors ${
                        formTimeMode === mode
                          ? "bg-gray-900 text-white border-gray-900"
                          : "bg-white text-gray-700 border-gray-300 hover:bg-gray-50"
                      }`}
                    >
                      {mode === "all_day" && "Tutto il giorno"}
                      {mode === "until" && "Fino alle"}
                      {mode === "from" && "Dalle"}
                      {mode === "interval" && "Intervallo orario"}
                    </button>
                  ))}
                </div>
              </div>
              {formTimeMode === "until" && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Ora fine *</label>
                  <input
                    type="time"
                    value={formEndTime}
                    onChange={(e) => setFormEndTime(e.target.value)}
                    className="w-full max-w-xs px-3 py-2 border border-gray-300 rounded-lg"
                    required
                  />
                </div>
              )}
              {formTimeMode === "from" && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Ora inizio *</label>
                  <input
                    type="time"
                    value={formStartTime}
                    onChange={(e) => setFormStartTime(e.target.value)}
                    className="w-full max-w-xs px-3 py-2 border border-gray-300 rounded-lg"
                    required
                  />
                </div>
              )}
              {formTimeMode === "interval" && (
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Ora inizio *</label>
                    <input
                      type="time"
                      value={formStartTime}
                      onChange={(e) => setFormStartTime(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Ora fine *</label>
                    <input
                      type="time"
                      value={formEndTime}
                      onChange={(e) => setFormEndTime(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                      required
                    />
                  </div>
                </div>
              )}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Note</label>
                <textarea
                  value={formNote}
                  onChange={(e) => setFormNote(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                  rows={2}
                />
              </div>
              <div className="flex gap-2">
                <button type="submit" className="px-4 py-2 bg-gray-900 text-white rounded-lg hover:bg-gray-800">
                  {editingId ? "Salva modifiche" : "Salva"}
                </button>
                <button type="button" onClick={resetForm} className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50">
                  Annulla
                </button>
              </div>
            </form>
          </div>
        )}

        {loading ? (
          <p>Caricamento...</p>
        ) : list.length === 0 ? (
          <p className="text-gray-500">Nessuna indisponibilità registrata.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  {isAdmin && <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Utente</th>}
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Periodo</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Orario</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Stato</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Azioni</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {list.map((u) => (
                  <tr key={u.id}>
                    {isAdmin && (
                      <td className="px-6 py-4 text-sm text-gray-900">{getUserName(u)}</td>
                    )}
                    <td className="px-6 py-4 text-sm text-gray-700">
                      {formatDateFromPart(u.dateStart)}
                      {u.dateStart.split("T")[0] !== u.dateEnd.split("T")[0] && ` → ${formatDateFromPart(u.dateEnd)}`}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-700">{formatTimeRange(u.startTime, u.endTime)}</td>
                    <td className="px-6 py-4 text-sm">
                      <span className={`px-2 py-1 rounded text-xs ${u.status === "PENDING_APPROVAL" ? "bg-amber-100 text-amber-800" : "bg-green-100 text-green-800"}`}>
                        {u.status === "PENDING_APPROVAL" ? "In attesa approvazione" : "Approvata"}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm">
                      <div className="inline-flex items-center gap-2">
                        {isAdmin && u.status === "PENDING_APPROVAL" && (
                          <button
                            onClick={() => handleApprove(u.id)}
                            aria-label="Approva"
                            title="Approva"
                            className="h-8 px-3 inline-flex items-center justify-center rounded-lg bg-green-600 text-white hover:bg-green-700 hover:shadow-lg transition-colors text-sm font-medium"
                          >
                            Approva
                          </button>
                        )}
                        <button
                          onClick={() => openEdit(u)}
                          aria-label="Modifica"
                          title="Modifica"
                          className="h-8 w-8 inline-flex items-center justify-center rounded-lg bg-gray-900 text-white hover:bg-gray-800 hover:shadow-lg transition-colors"
                        >
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15.232 5.232l3.536 3.536M4 20h4l10.293-10.293a1 1 0 000-1.414l-2.586-2.586a1 1 0 00-1.414 0L4 16v4z" />
                          </svg>
                        </button>
                        <button
                          onClick={() => setDeleteTarget(u.id)}
                          aria-label="Elimina"
                          title="Elimina"
                          className="h-8 w-8 inline-flex items-center justify-center rounded-lg bg-red-600 text-white hover:bg-red-700 hover:shadow-lg transition-colors"
                        >
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6M9 7h6m-1-2H10l1-1h2l1 1z" />
                          </svg>
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

      <ConfirmDialog
        isOpen={!!deleteTarget}
        title="Elimina indisponibilità"
        message="Sei sicuro di voler eliminare questa indisponibilità?"
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      />

      {overlapConflict && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-lg w-full mx-4 shadow-xl">
            <h3 className="text-xl font-semibold mb-3">Sovrapposizione indisponibilità</h3>
            <p className="text-gray-600 mb-4">
              Le seguenti indisponibilità già comunicate si sovrappongono alla nuova. Quale vuoi mantenere?
            </p>
            <ul className="mb-4 space-y-2 max-h-48 overflow-y-auto">
              {overlapConflict.overlapping.map((u) => (
                <li key={u.id} className="flex items-center justify-between gap-2 p-2 bg-gray-50 rounded-lg">
                  <span className="text-sm">
                    {formatDateFromPart(u.dateStart)}
                    {u.dateStart.split("T")[0] !== u.dateEnd.split("T")[0] && ` → ${formatDateFromPart(u.dateEnd)}`}
                    {" · "}
                    {formatTimeRange(u.startTime, u.endTime)}
                  </span>
                  <button
                    type="button"
                    onClick={() => setOverlapConflict(null)}
                    className="px-3 py-1 text-sm bg-gray-900 text-white rounded-lg hover:bg-gray-800"
                  >
                    Mantieni questa
                  </button>
                </li>
              ))}
            </ul>
            <p className="text-sm text-gray-500 mb-4">
              Oppure mantieni la nuova (le esistenti sovrapposte verranno eliminate):
            </p>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={handleOverlapKeepNew}
                className="px-4 py-2 bg-gray-900 text-white rounded-lg hover:bg-gray-800"
              >
                Mantieni la nuova
              </button>
              <button
                type="button"
                onClick={() => setOverlapConflict(null)}
                className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                Annulla
              </button>
            </div>
          </div>
        </div>
      )}
    </DashboardShell>
  );
}
