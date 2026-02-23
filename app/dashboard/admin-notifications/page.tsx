"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import DashboardShell from "@/components/DashboardShell";
import { getEffectivePriority, getPriorityIcon } from "@/lib/notifications";

type Notification = {
  id: string;
  type: string;
  title: string;
  message: string;
  metadata?: { count?: number; details?: string[] } | null;
  priority?: string | null;
  read: boolean;
  createdAt: string;
};

const GROUPABLE_TYPES = ["UNAVAILABILITY_MODIFIED_BY_WORKER", "UNAVAILABILITY_DELETED_BY_WORKER"];
const GROUP_WINDOW_MS = 15 * 60 * 1000;

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
    const clusters: Notification[][] = [];
    let current: Notification[] = [arr[0]];
    for (let i = 1; i < arr.length; i++) {
      const prev = new Date(arr[i - 1].createdAt).getTime();
      const curr = new Date(arr[i].createdAt).getTime();
      if (curr - prev <= GROUP_WINDOW_MS) {
        current.push(arr[i]);
      } else {
        clusters.push(current);
        current = [arr[i]];
      }
    }
    clusters.push(current);

    for (const cluster of clusters) {
      if (cluster.length === 1) {
        result.push(cluster[0]);
      } else {
        result.push({ group: cluster });
      }
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

const TITLE_BY_TYPE: Record<string, string> = {
  ADMIN_LOCKED_ACCOUNTS: "Account bloccati",
  UNAVAILABILITY_PENDING_APPROVAL: "Indisponibilità in attesa",
  UNAVAILABILITY_MODIFIED_BY_WORKER: "Indisponibilità modificata da dipendente",
  UNAVAILABILITY_DELETED_BY_WORKER: "Indisponibilità eliminata da dipendente",
  WORKDAY_ISSUES: "Problemi programmazione",
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

export default function AdminNotificationsPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [requireModalActionToMarkRead, setRequireModalActionToMarkRead] = useState(false);
  const [typesWithModalActivo, setTypesWithModalActivo] = useState<string[]>([]);

  const isAdminRole =
    (session?.user as any)?.isSuperAdmin === true ||
    (session?.user as any)?.isAdmin === true ||
    (session?.user as any)?.role === "RESPONSABILE";

  const grouped = groupNotifications(notifications);
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
    if (!isAdminRole) {
      router.push("/dashboard");
      return;
    }
    fetch("/api/notifications?type=admin")
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
  }, [status, session?.user, isAdminRole, router]);

  const handleAction = async (n: Notification | { group: Notification[] }, path: string) => {
    const ids = "group" in n ? n.group.map((x) => x.id) : [n.id];
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
    router.push(path);
  };

  const handleMarkAsRead = async (n: Notification | { group: Notification[] }) => {
    const ids = "group" in n ? n.group.map((x) => x.id) : [n.id];
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
        <div className="flex flex-wrap items-center justify-between gap-4 mb-2">
          <h1 className="text-3xl font-bold">Notifiche Amministratori</h1>
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
          Notifiche di sistema per Amministratori. Ultimi 7 giorni.
        </p>

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
              const displayMessage = isGroup && item.group.length > 1
                ? `${n.message.split("\n\n")[0]} (${item.group.length} notifiche)\n\n${item.group.map((x) => x.message.split("\n\n").slice(1).join("\n\n")).filter(Boolean).join("\n\n---\n\n")}`
                : n.message;
              return (
                <div
                  key={isGroup ? ids.join("-") : n.id}
                  className={`rounded-2xl border overflow-hidden shadow-sm transition-all ${
                    n.read
                      ? "border-gray-200 bg-gray-50/50 opacity-75"
                      : "border-gray-300 bg-white hover:shadow-md"
                  }`}
                >
                  <div className="bg-gray-900 px-4 py-2.5 flex items-center gap-3">
                    {n.read && !isGroup && (
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
                      {getTitle(n)}{isGroup && item.group.length > 1 ? ` (${item.group.length})` : ""}
                    </h2>
                  </div>
                  <div className="px-4 py-4 bg-white/95 shadow-[0_2px_8px_rgba(0,0,0,0.06)]">
                    <p className="text-gray-700 text-sm whitespace-pre-wrap mb-3">
                      {displayMessage.includes("~~")
                        ? renderMessageWithStrikethrough(displayMessage)
                        : displayMessage}
                    </p>
                    <div className="flex items-center justify-between gap-4 flex-wrap">
                      <span className="text-xs text-gray-500">
                        {formatDate(n.createdAt)}
                      </span>
                      <div className="flex items-center gap-2">
                        {!n.read && n.type === "ADMIN_LOCKED_ACCOUNTS" && (
                          <button
                            onClick={() => handleAction(n, "/settings/technical")}
                            className="px-4 py-2 bg-gray-900 text-white text-sm font-medium rounded-lg hover:bg-gray-800"
                          >
                            Vai a impostazioni tecniche
                          </button>
                        )}
                        {!n.read && (n.type === "UNAVAILABILITY_PENDING_APPROVAL" || n.type === "UNAVAILABILITY_MODIFIED_BY_WORKER" || n.type === "UNAVAILABILITY_DELETED_BY_WORKER") && (
                          <button
                            onClick={() => handleAction(isGroup ? item : n, "/dashboard/unavailabilities")}
                            className="px-4 py-2 bg-gray-900 text-white text-sm font-medium rounded-lg hover:bg-gray-800"
                          >
                            Vai alle indisponibilità
                          </button>
                        )}
                        {!n.read && n.type === "WORKDAY_ISSUES" && (
                          <button
                            onClick={() => handleAction(n, "/dashboard/events")}
                            className="px-4 py-2 bg-gray-900 text-white text-sm font-medium rounded-lg hover:bg-gray-800"
                          >
                            Vai agli eventi
                          </button>
                        )}
                        {!n.read &&
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
