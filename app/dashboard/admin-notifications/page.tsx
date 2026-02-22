"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import DashboardShell from "@/components/DashboardShell";

type Notification = {
  id: string;
  type: string;
  title: string;
  message: string;
  read: boolean;
  createdAt: string;
};

const TITLE_BY_TYPE: Record<string, string> = {
  ADMIN_LOCKED_ACCOUNTS: "Account bloccati",
};

function getTitle(n: Notification) {
  return n.title || TITLE_BY_TYPE[n.type] || "Notifica";
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

  const isAdminRole =
    (session?.user as any)?.isSuperAdmin === true ||
    (session?.user as any)?.isAdmin === true ||
    (session?.user as any)?.role === "RESPONSABILE";

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
      .then((r) => (r.ok ? r.json() : []))
      .then((data) => setNotifications(Array.isArray(data) ? data : []))
      .catch(() => setNotifications([]))
      .finally(() => setLoading(false));
  }, [status, session?.user, isAdminRole, router]);

  const handleVaiImpostazioni = async (n: Notification) => {
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
    router.push("/settings/technical");
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
                  <h2 className="text-white font-semibold text-sm">
                    {getTitle(n)}
                  </h2>
                </div>
                <div className="px-4 py-4 bg-white/95 shadow-[0_2px_8px_rgba(0,0,0,0.06)]">
                  <p className="text-gray-700 text-sm whitespace-pre-wrap mb-3">
                    {n.message}
                  </p>
                  <div className="flex items-center justify-between gap-4">
                    <span className="text-xs text-gray-500">
                      {formatDate(n.createdAt)}
                    </span>
                    {!n.read && n.type === "ADMIN_LOCKED_ACCOUNTS" && (
                      <button
                        onClick={() => handleVaiImpostazioni(n)}
                        className="px-4 py-2 bg-gray-900 text-white text-sm font-medium rounded-lg hover:bg-gray-800"
                      >
                        Vai a impostazioni tecniche
                      </button>
                    )}
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
