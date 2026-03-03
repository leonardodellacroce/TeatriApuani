"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import DashboardShell from "@/components/DashboardShell";
import {
  buildMyShiftsUrlWithDates,
  buildMyShiftsUrlForOreNotification,
  buildMyShiftsUrlForMissingHoursGroup,
  buildMyShiftsUrlForOreNotificationGroup,
} from "@/lib/notificationDates";
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

const GROUPABLE_TYPES = [
  "MISSING_HOURS_REMINDER",
  "DAILY_SHIFT_REMINDER",
  "UNAVAILABILITY_CREATED_BY_ADMIN",
  "UNAVAILABILITY_MODIFIED_BY_ADMIN",
  "UNAVAILABILITY_DELETED_BY_ADMIN",
  "UNAVAILABILITY_APPROVED",
  "UNAVAILABILITY_REJECTED",
  "ORE_INSERITE_DA_ADMIN",
  "ORE_MODIFICATE_DA_ADMIN",
  "ORE_ELIMINATE_DA_ADMIN",
  "FREE_HOURS_CONVERTED_BY_ADMIN",
  "FREE_HOURS_DELETED_BY_ADMIN",
];
const MAX_BLOCKS_DISPLAY = 12;
const MAX_LINES_BEFORE_EXPAND = 15;

function groupNotifications(list: Notification[]): Array<Notification | { group: Notification[] }> {
  const result: Array<Notification | { group: Notification[] }> = [];
  const unreadByType = new Map<string, Notification[]>();
  const read: Notification[] = [];

  for (const n of list) {
    if (n.read) {
      read.push(n);
    } else if (GROUPABLE_TYPES.includes(n.type)) {
      const arr = unreadByType.get(n.type) ?? [];
      arr.push(n);
      unreadByType.set(n.type, arr);
    } else {
      result.push(n);
    }
  }

  for (const [, arr] of unreadByType) {
    arr.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
    if (arr.length === 1) {
      result.push(arr[0]);
    } else {
      result.push({ group: arr });
    }
  }

  result.sort((a, b) => {
    const aItem = "group" in a ? a.group[0] : a;
    const bItem = "group" in b ? b.group[0] : b;
    return new Date(bItem.createdAt).getTime() - new Date(aItem.createdAt).getTime();
  });
  read.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  result.push(...read);
  return result;
}

/** Costruisce messaggio per gruppo: max 12 blocchi, poi "e altre X" */
function buildGroupDisplayMessage(group: Notification[]): { message: string; totalCount: number } {
  const toShow = group.slice(0, MAX_BLOCKS_DISPLAY);
  const rest = group.length - MAX_BLOCKS_DISPLAY;
  const parts = toShow.map((x) => x.message);
  let message = parts.join("\n\n---\n\n");
  if (rest > 0) {
    message += `\n\n… e altre ${rest}`;
  }
  return { message, totalCount: group.length };
}

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
  FREE_HOURS_CONVERTED_BY_ADMIN: "Ore libere convertite in evento",
  FREE_HOURS_DELETED_BY_ADMIN: "Ore libere eliminate",
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
  const [expandedCards, setExpandedCards] = useState<Set<string>>(new Set());

  const grouped = groupNotifications(notifications);

  const toggleCardExpanded = (key: string) => {
    setExpandedCards((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };
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

  const handleInserisci = async (item: Notification | { group: Notification[] }) => {
    const n = "group" in item ? item.group[0] : item;
    const ids = "group" in item ? item.group.map((x) => x.id) : [n.id];
    const url =
      n.type === "MISSING_HOURS_REMINDER"
        ? "group" in item && item.group.length > 1
          ? buildMyShiftsUrlForMissingHoursGroup(item.group)
          : buildMyShiftsUrlWithDates(n.message, n.metadata)
        : "/dashboard/my-shifts";
    try {
      await Promise.all(ids.map((id) => fetch(`/api/notifications/${id}`, { method: "PATCH" })));
      setNotifications((prev) =>
        prev.map((x) => (ids.includes(x.id) ? { ...x, read: true } : x))
      );
      setSelectedIds((prev) => {
        const next = new Set(prev);
        ids.forEach((id) => next.delete(id));
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

  const ORE_TYPES = [
    "ORE_INSERITE_DA_ADMIN",
    "ORE_MODIFICATE_DA_ADMIN",
    "ORE_ELIMINATE_DA_ADMIN",
    "FREE_HOURS_CONVERTED_BY_ADMIN",
    "FREE_HOURS_DELETED_BY_ADMIN",
  ];

  const DELETE_TYPES = [
    "UNAVAILABILITY_DELETED_BY_ADMIN",
    "ORE_ELIMINATE_DA_ADMIN",
    "FREE_HOURS_DELETED_BY_ADMIN",
  ];

  const handleVaiAlleIndisponibilita = async (item: Notification | { group: Notification[] }) => {
    const ids = "group" in item ? item.group.map((x) => x.id) : [item.id];
    try {
      await Promise.all(ids.map((id) => fetch(`/api/notifications/${id}`, { method: "PATCH" })));
      setNotifications((prev) =>
        prev.map((x) => (ids.includes(x.id) ? { ...x, read: true } : x))
      );
      setSelectedIds((prev) => {
        const next = new Set(prev);
        ids.forEach((id) => next.delete(id));
        return next;
      });
      window.dispatchEvent(new Event("notificationsUpdated"));
    } catch {}
    router.push("/dashboard/unavailabilities");
  };

  const handleVisualizza = async (item: Notification | { group: Notification[] }) => {
    const n = "group" in item ? item.group[0] : item;
    const ids = "group" in item ? item.group.map((x) => x.id) : [n.id];
    const url =
      "group" in item && item.group.length > 1
        ? buildMyShiftsUrlForOreNotificationGroup(item.group)
        : buildMyShiftsUrlForOreNotification(n.metadata);
    try {
      await Promise.all(ids.map((id) => fetch(`/api/notifications/${id}`, { method: "PATCH" })));
      setNotifications((prev) =>
        prev.map((x) => (ids.includes(x.id) ? { ...x, read: true } : x))
      );
      setSelectedIds((prev) => {
        const next = new Set(prev);
        ids.forEach((id) => next.delete(id));
        return next;
      });
      window.dispatchEvent(new Event("notificationsUpdated"));
    } catch {}
    router.push(url);
  };

  const handleMarkAsRead = async (item: Notification | { group: Notification[] }) => {
    const ids = "group" in item ? item.group.map((x) => x.id) : [item.id];
    try {
      await Promise.all(ids.map((id) => fetch(`/api/notifications/${id}`, { method: "PATCH" })));
      setNotifications((prev) =>
        prev.map((x) => (ids.includes(x.id) ? { ...x, read: true } : x))
      );
      setSelectedIds((prev) => {
        const next = new Set(prev);
        ids.forEach((id) => next.delete(id));
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
        <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
          <div className="flex items-center gap-3">
            <button
              onClick={() => router.push("/dashboard")}
              aria-label="Indietro"
              title="Indietro"
              className="h-11 w-11 inline-flex items-center justify-center rounded-lg bg-gray-900 text-white hover:bg-gray-800 hover:shadow-lg transition-colors"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <h1 className="text-3xl font-bold">Notifiche</h1>
          </div>
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

        {notifications.length === 0 ? (
          <div className="p-8 text-center text-gray-500 rounded-xl border border-gray-200 bg-gray-50">
            Nessuna notifica.
          </div>
        ) : (
          <div className="space-y-4">
            {grouped.map((item) => {
              const isGroup = "group" in item;
              const n = isGroup ? item.group[0] : item;
              const ids = isGroup ? item.group.map((x) => x.id) : [n.id];
              const cardKey = isGroup ? ids.join("-") : n.id;
              const { message: rawGroupMessage, totalCount } =
                isGroup && item.group.length > 1
                  ? buildGroupDisplayMessage(item.group)
                  : { message: n.message, totalCount: 1 };
              const displayMessage = rawGroupMessage;
              const lineCount = displayMessage.split("\n").length;
              const needsExpand = lineCount > MAX_LINES_BEFORE_EXPAND;
              const isExpanded = expandedCards.has(cardKey);
              const shownMessage =
                needsExpand && !isExpanded
                  ? displayMessage.split("\n").slice(0, MAX_LINES_BEFORE_EXPAND).join("\n")
                  : displayMessage;
              return (
                <div
                  key={cardKey}
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
                      {getTitle(n)}{isGroup && totalCount > 1 ? ` (${totalCount})` : ""}
                    </h2>
                  </div>
                  <div className="px-4 py-4 bg-white/95 shadow-[0_2px_8px_rgba(0,0,0,0.06)]">
                    <p className="text-gray-700 text-sm whitespace-pre-wrap mb-3">
                      {shownMessage.includes("~~")
                        ? renderMessageWithStrikethrough(shownMessage)
                        : shownMessage}
                    </p>
                    {needsExpand && (
                      <button
                        type="button"
                        onClick={() => toggleCardExpanded(cardKey)}
                        className="text-sm text-gray-600 hover:text-gray-900 underline mb-3"
                      >
                        {isExpanded ? "Riduci" : "Espandi"}
                      </button>
                    )}
                    <div className="flex items-center justify-between gap-4 flex-wrap">
                      <span className="text-xs text-gray-500">
                        {formatDate(n.createdAt)}
                      </span>
                      <div className="flex items-center gap-2">
                        {!n.read && n.type === "MISSING_HOURS_REMINDER" && (
                          <button
                            onClick={() => handleInserisci(isGroup ? item : n)}
                            className="px-4 py-2 bg-gray-900 text-white text-sm font-medium rounded-lg hover:bg-gray-800"
                          >
                            Inserisci
                          </button>
                        )}
                        {!n.read && n.type === "DAILY_SHIFT_REMINDER" && (
                          <button
                            onClick={() => handleInserisci(isGroup ? item : n)}
                            className="px-4 py-2 bg-gray-900 text-white text-sm font-medium rounded-lg hover:bg-gray-800"
                          >
                            Vai ai turni
                          </button>
                        )}
                        {!n.read && DELETE_TYPES.includes(n.type) && (
                          <button
                            onClick={() => handleMarkAsRead(isGroup ? item : n)}
                            className="px-4 py-2 bg-gray-900 text-white text-sm font-medium rounded-lg hover:bg-gray-800"
                          >
                            OK
                          </button>
                        )}
                        {!n.read && UNAVAILABILITY_TYPES.includes(n.type) && !DELETE_TYPES.includes(n.type) && (
                          <button
                            onClick={() => handleVaiAlleIndisponibilita(isGroup ? item : n)}
                            className="px-4 py-2 bg-gray-900 text-white text-sm font-medium rounded-lg hover:bg-gray-800"
                          >
                            Vai alle indisponibilità
                          </button>
                        )}
                        {!n.read && ORE_TYPES.includes(n.type) && !DELETE_TYPES.includes(n.type) && (
                          <button
                            onClick={() => handleVisualizza(isGroup ? item : n)}
                            className="px-4 py-2 bg-gray-900 text-white text-sm font-medium rounded-lg hover:bg-gray-800"
                          >
                            Visualizza
                          </button>
                        )}
                        {!n.read &&
                          !DELETE_TYPES.includes(n.type) &&
                          !(requireModalActionToMarkRead && typesWithModalActivo.includes(n.type)) && (
                            <button
                              onClick={() => handleMarkAsRead(isGroup ? item : n)}
                              className="px-4 py-2 border border-gray-300 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-50"
                            >
                              Letta
                            </button>
                          )}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </DashboardShell>
  );
}
