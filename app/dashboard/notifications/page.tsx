"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import DashboardShell from "@/components/DashboardShell";
import { buildMyShiftsUrlWithDates, buildMyShiftsUrlForOreNotification } from "@/lib/notificationDates";
import { getEffectivePriority, getPriorityIcon } from "@/lib/notifications";

type Notification = {
  id: string;
  type: string;
  title: string;
  message: string;
  metadata?: { dates?: string[]; dateFrom?: string; dateTo?: string } | null;
  priority?: string | null;
  read: boolean;
  createdAt: string;
};

const TITLE_BY_TYPE: Record<string, string> = {
  MISSING_HOURS_REMINDER: "Orari da inserire",
  DAILY_SHIFT_REMINDER: "Promemoria turni di oggi",
  UNAVAILABILITY_CREATED_BY_ADMIN: "Indisponibilità inserita",
  UNAVAILABILITY_MODIFIED_BY_ADMIN: "Indisponibilità modificata",
  UNAVAILABILITY_DELETED_BY_ADMIN: "Indisponibilità eliminata",
  UNAVAILABILITY_APPROVED: "Indisponibilità approvata",
  UNAVAILABILITY_REJECTED: "Indisponibilità non approvata",
  ORE_INSERITE_DA_ADMIN: "Ore lavorate inserite",
  ORE_MODIFICATE_DA_ADMIN: "Ore lavorate modificate",
  ORE_ELIMINATE_DA_ADMIN: "Ore lavorate eliminate",
};

function getTitle(n: Notification) {
  return n.title || TITLE_BY_TYPE[n.type] || "Notifica";
}

/** Renderizza messaggio con ~~testo~~ come barrato (strikethrough) */
function renderMessageWithStrikethrough(message: string) {
  const parts: React.ReactNode[] = [];
  let remaining = message;
  let key = 0;
  while (remaining.includes("~~")) {
    const start = remaining.indexOf("~~");
    const end = remaining.indexOf("~~", start + 2);
    if (end === -1) break;
    if (start > 0) parts.push(<span key={key++}>{remaining.slice(0, start)}</span>);
    parts.push(
      <span key={key++} className="line-through text-gray-500">
        {remaining.slice(start + 2, end)}
      </span>
    );
    remaining = remaining.slice(end + 2);
  }
  if (remaining) parts.push(<span key={key++}>{remaining}</span>);
  return parts.length > 1 ? parts : message;
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("it-IT", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function NotificationsPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [requireModalActionToMarkRead, setRequireModalActionToMarkRead] = useState(false);
  const [typesWithModalActivo, setTypesWithModalActivo] = useState<string[]>([]);

  const readNotifications = notifications.filter((n) => n.read);
  const allReadSelected =
    readNotifications.length > 0 &&
    readNotifications.every((n) => selectedIds.has(n.id));

  useEffect(() => {
    if (status === "loading") return;
    if (!session?.user) {
      router.push("/login");
      return;
    }
    fetch("/api/notifications?type=worker")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        const arr = Array.isArray(data) ? data : (data?.notifications ?? []);
        setNotifications(arr);
        if (data && !Array.isArray(data)) {
          setRequireModalActionToMarkRead(data.requireModalActionToMarkRead === true);
          setTypesWithModalActivo(Array.isArray(data.typesWithModalActivo) ? data.typesWithModalActivo : []);
        }
      })
      .catch(() => setNotifications([]))
      .finally(() => setLoading(false));
  }, [status, session?.user, router]);

  const handleInserisci = async (n: Notification) => {
    const url =
      n.type === "MISSING_HOURS_REMINDER"
        ? buildMyShiftsUrlWithDates(n.message, n.metadata)
        : "/dashboard/my-shifts";
    try {
      await fetch(`/api/notifications/${n.id}`, { method: "PATCH" });
      setNotifications((prev) =>
        prev.map((x) => (x.id === n.id ? { ...x, read: true } : x))
      );
      setSelectedIds((prev) => {
        const next = new Set(prev);
        next.delete(n.id);
        return next;
      });
      window.dispatchEvent(new Event("notificationsUpdated"));
    } catch {}
    router.push(url);
  };

  const UNAVAILABILITY_TYPES = [
    "UNAVAILABILITY_CREATED_BY_ADMIN",
    "UNAVAILABILITY_MODIFIED_BY_ADMIN",
    "UNAVAILABILITY_DELETED_BY_ADMIN",
    "UNAVAILABILITY_APPROVED",
    "UNAVAILABILITY_REJECTED",
  ];

  const ORE_TYPES = ["ORE_INSERITE_DA_ADMIN", "ORE_MODIFICATE_DA_ADMIN", "ORE_ELIMINATE_DA_ADMIN"];

  const handleVaiAlleIndisponibilita = async (n: Notification) => {
    try {
      await fetch(`/api/notifications/${n.id}`, { method: "PATCH" });
      setNotifications((prev) =>
        prev.map((x) => (x.id === n.id ? { ...x, read: true } : x))
      );
      setSelectedIds((prev) => {
        const next = new Set(prev);
        next.delete(n.id);
        return next;
      });
      window.dispatchEvent(new Event("notificationsUpdated"));
    } catch {}
    router.push("/dashboard/unavailabilities");
  };

  const handleVisualizza = async (n: Notification) => {
    const url = buildMyShiftsUrlForOreNotification(n.metadata);
    try {
      await fetch(`/api/notifications/${n.id}`, { method: "PATCH" });
      setNotifications((prev) =>
        prev.map((x) => (x.id === n.id ? { ...x, read: true } : x))
      );
      setSelectedIds((prev) => {
        const next = new Set(prev);
        next.delete(n.id);
        return next;
      });
      window.dispatchEvent(new Event("notificationsUpdated"));
    } catch {}
    router.push(url);
  };

  const handleMarkAsRead = async (n: Notification) => {
    try {
      await fetch(`/api/notifications/${n.id}`, { method: "PATCH" });
      setNotifications((prev) =>
        prev.map((x) => (x.id === n.id ? { ...x, read: true } : x))
      );
      setSelectedIds((prev) => {
        const next = new Set(prev);
        next.delete(n.id);
        return next;
      });
      window.dispatchEvent(new Event("notificationsUpdated"));
    } catch {}
  };

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAll = () => {
    if (allReadSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(readNotifications.map((n) => n.id)));
    }
  };

  const handleDeleteSelected = async () => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    try {
      const res = await fetch("/api/notifications/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids }),
      });
      if (res.ok) {
        setNotifications((prev) => prev.filter((n) => !selectedIds.has(n.id)));
        setSelectedIds(new Set());
        window.dispatchEvent(new Event("notificationsUpdated"));
      }
    } catch {}
  };

  if (status === "loading" || loading) {
    return (
      <DashboardShell>
        <div className="p-8 text-center text-gray-500">Caricamento...</div>
      </DashboardShell>
    );
  }

  return (
    <DashboardShell>
      <div>
        <div className="flex flex-wrap items-center justify-between gap-4 mb-2">
          <h1 className="text-3xl font-bold">Notifiche</h1>
          {notifications.length > 0 && (
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={selectAll}
                disabled={readNotifications.length === 0}
                className="px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {allReadSelected ? "Deseleziona" : "Seleziona tutte"}
              </button>
              <button
                type="button"
                onClick={handleDeleteSelected}
                disabled={selectedIds.size === 0}
                className="px-4 py-2 border border-red-300 text-red-700 rounded-lg text-sm font-medium hover:bg-red-50 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Elimina ({selectedIds.size})
              </button>
            </div>
          )}
        </div>
        <p className="text-gray-600 mb-6">
          Notifiche sui turni e ore da inserire. Ultimi 7 giorni.
        </p>

        {notifications.length === 0 ? (
          <div className="p-8 text-center text-gray-500 rounded-xl border border-gray-200 bg-gray-50">
            Nessuna notifica.
          </div>
        ) : (
          <div className="space-y-4">
            {notifications.map((n) => (
              <div
                key={n.id}
                className={`rounded-2xl border overflow-hidden shadow-sm transition-all ${
                  n.read
                    ? "border-gray-200 bg-gray-50/50 opacity-75"
                    : "border-gray-300 bg-white hover:shadow-md"
                }`}
              >
                <div className="bg-gray-900 px-4 py-2.5 flex items-center gap-3">
                  {n.read && (
                    <input
                      type="checkbox"
                      checked={selectedIds.has(n.id)}
                      onChange={() => toggleSelect(n.id)}
                      className="w-4 h-4 rounded border-gray-400 text-gray-900 focus:ring-gray-500"
                      aria-label={`Seleziona notifica ${getTitle(n)}`}
                    />
                  )}
                  <span className="text-white/80 text-xs font-mono" title={`Priorità ${getEffectivePriority(n.priority, n.type)}`}>
                    {getPriorityIcon(getEffectivePriority(n.priority, n.type))}
                  </span>
                  <h2 className="text-white font-semibold text-sm">
                    {getTitle(n)}
                  </h2>
                </div>
                <div className="px-4 py-4 bg-white/95 shadow-[0_2px_8px_rgba(0,0,0,0.06)]">
                  <p className="text-gray-700 text-sm whitespace-pre-wrap mb-3">
                    {n.message.includes("~~")
                      ? renderMessageWithStrikethrough(n.message)
                      : n.message}
                  </p>
                  <div className="flex items-center justify-between gap-4 flex-wrap">
                    <span className="text-xs text-gray-500">
                      {formatDate(n.createdAt)}
                    </span>
                    <div className="flex items-center gap-2">
                      {!n.read && n.type === "MISSING_HOURS_REMINDER" && (
                        <button
                          onClick={() => handleInserisci(n)}
                          className="px-4 py-2 bg-gray-900 text-white text-sm font-medium rounded-lg hover:bg-gray-800"
                        >
                          Inserisci
                        </button>
                      )}
                      {!n.read && n.type === "DAILY_SHIFT_REMINDER" && (
                        <button
                          onClick={() => handleInserisci(n)}
                          className="px-4 py-2 bg-gray-900 text-white text-sm font-medium rounded-lg hover:bg-gray-800"
                        >
                          Vai ai turni
                        </button>
                      )}
                      {!n.read && UNAVAILABILITY_TYPES.includes(n.type) && (
                        <button
                          onClick={() => handleVaiAlleIndisponibilita(n)}
                          className="px-4 py-2 bg-gray-900 text-white text-sm font-medium rounded-lg hover:bg-gray-800"
                        >
                          Vai alle indisponibilità
                        </button>
                      )}
                      {!n.read && ORE_TYPES.includes(n.type) && (
                        <button
                          onClick={() => handleVisualizza(n)}
                          className="px-4 py-2 bg-gray-900 text-white text-sm font-medium rounded-lg hover:bg-gray-800"
                        >
                          Visualizza
                        </button>
                      )}
                      {!n.read &&
                        !(requireModalActionToMarkRead && typesWithModalActivo.includes(n.type)) && (
                        <button
                          onClick={() => handleMarkAsRead(n)}
                          className="px-4 py-2 border border-gray-300 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-50"
                        >
                          Letta
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </DashboardShell>
  );
}
