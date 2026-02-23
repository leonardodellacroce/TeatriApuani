"use client";

import DashboardShell from "@/components/DashboardShell";
import PageSkeleton from "@/components/PageSkeleton";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { getWorkModeCookie, WORK_MODE_CHANGED_EVENT } from "@/lib/workMode";
import { buildMyShiftsUrlWithDates } from "@/lib/notificationDates";
import { getEffectivePriority, isAdminModalPriority } from "@/lib/notifications";

type NotificationItem = {
  id: string;
  type: string;
  title: string;
  message: string;
  metadata?: { dates?: string[] } | null;
  priority?: string | null;
  read: boolean;
  createdAt: string;
};

export default function Dashboard() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [workMode, setWorkMode] = useState<"admin" | "worker">("admin");
  const [missingHoursModal, setMissingHoursModal] = useState<NotificationItem | null>(null);
  const [adminModalOpen, setAdminModalOpen] = useState(false);
  const [highPriorityCounts, setHighPriorityCounts] = useState<{
    indisponibilita: number;
    impostazioniTecniche: number;
    workdayIssues: { badge: "red" | "yellow" | null; count: number };
    turniOreMissingHours: number;
  }>({
    indisponibilita: 0,
    impostazioniTecniche: 0,
    workdayIssues: { badge: null, count: 0 },
    turniOreMissingHours: 0,
  });
  const [workerMissingHoursCount, setWorkerMissingHoursCount] = useState(0);
  const [workerPendingUnavailCount, setWorkerPendingUnavailCount] = useState(0);

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/login");
    } else if (status === "authenticated" && session?.user) {
      const mustChangePassword = (session.user as any)?.mustChangePassword;
      if (mustChangePassword === true) {
        router.push("/change-password");
        return;
      }
    }
  }, [status, session, router]);

  useEffect(() => {
    setWorkMode(getWorkModeCookie());
  }, [session]);

  useEffect(() => {
    const handleWorkModeChange = () => setWorkMode(getWorkModeCookie());
    window.addEventListener(WORK_MODE_CHANGED_EVENT, handleWorkModeChange);
    return () => window.removeEventListener(WORK_MODE_CHANGED_EVENT, handleWorkModeChange);
  }, []);

  const refreshHighPriorityCounts = () => {
    fetch("/api/notifications/admin-high-priority-counts")
      .then((r) =>
        r.ok
          ? r.json()
          : {
              indisponibilita: 0,
              impostazioniTecniche: 0,
              workdayIssues: { badge: null, count: 0 },
              turniOreMissingHours: 0,
            }
      )
      .then(
        (d: {
          indisponibilita?: number;
          impostazioniTecniche?: number;
          workdayIssues?: { badge: "red" | "yellow" | null; count: number };
          turniOreMissingHours?: number;
        }) =>
          setHighPriorityCounts({
            indisponibilita: d?.indisponibilita ?? 0,
            impostazioniTecniche: d?.impostazioniTecniche ?? 0,
            workdayIssues: d?.workdayIssues ?? { badge: null, count: 0 },
            turniOreMissingHours: d?.turniOreMissingHours ?? 0,
          })
      )
      .catch(() =>
        setHighPriorityCounts({
          indisponibilita: 0,
          impostazioniTecniche: 0,
          workdayIssues: { badge: null, count: 0 },
          turniOreMissingHours: 0,
        })
      );
  };

  const refreshWorkerMissingHours = () => {
    fetch("/api/notifications/worker-missing-hours-count")
      .then((r) => (r.ok ? r.json() : { hasMissing: false, count: 0 }))
      .then((d) => setWorkerMissingHoursCount(d?.hasMissing ? d?.count ?? 0 : 0))
      .catch(() => setWorkerMissingHoursCount(0));
  };

  const refreshWorkerPendingUnavail = () => {
    fetch("/api/unavailabilities/my-pending-count")
      .then((r) => (r.ok ? r.json() : { count: 0 }))
      .then((d) => setWorkerPendingUnavailCount(d?.count ?? 0))
      .catch(() => setWorkerPendingUnavailCount(0));
  };

  useEffect(() => {
    const refresh = () => refreshHighPriorityCounts();
    window.addEventListener("unavailabilitiesUpdated", refresh);
    window.addEventListener("lockedAccountsUpdated", refresh);
    window.addEventListener("workdaysUpdated", refresh);
    window.addEventListener("timeEntriesUpdated", refresh);
    return () => {
      window.removeEventListener("unavailabilitiesUpdated", refresh);
      window.removeEventListener("lockedAccountsUpdated", refresh);
      window.removeEventListener("workdaysUpdated", refresh);
      window.removeEventListener("timeEntriesUpdated", refresh);
    };
  }, []);

  useEffect(() => {
    const refresh = () => refreshWorkerMissingHours();
    window.addEventListener("timeEntriesUpdated", refresh);
    return () => window.removeEventListener("timeEntriesUpdated", refresh);
  }, []);

  useEffect(() => {
    const refresh = () => refreshWorkerPendingUnavail();
    window.addEventListener("unavailabilitiesUpdated", refresh);
    return () => window.removeEventListener("unavailabilitiesUpdated", refresh);
  }, []);

  useEffect(() => {
    if (status !== "authenticated" || !session?.user) return;
    const role = (session.user as any)?.role;
    const std = !["SUPER_ADMIN", "ADMIN", "RESPONSABILE"].includes(role || "");
    const wrk = (session.user as any)?.isWorker === true;
    const nonStdWrk = !std && wrk;
    const canSee = std || (wrk && (!nonStdWrk || workMode === "worker"));
    const isAdminRole = ["SUPER_ADMIN", "ADMIN", "RESPONSABILE"].includes(role || "");
    if (canSee) {
      Promise.all([
        fetch("/api/notifications?unreadOnly=true&type=worker", { cache: "no-store" }).then((r) => (r.ok ? r.json() : [])),
        fetch("/api/settings/notifications/system/worker-display").then((r) => (r.ok ? r.json() : null)),
      ])
        .then(([data, settingsData]: [NotificationItem[], { worker?: { type: string; showInDashboardModal: boolean }[] } | null]) => {
          const arr = Array.isArray(data) ? data : [];
          const missing = arr.find((n) => n.type === "MISSING_HOURS_REMINDER");
          const showModal = settingsData?.worker?.find((w) => w.type === "MISSING_HOURS_REMINDER")?.showInDashboardModal ?? true;
          if (missing && showModal) setMissingHoursModal(missing);
        })
        .catch(() => {});
      refreshWorkerMissingHours();
      refreshWorkerPendingUnavail();
    }
    if (isAdminRole && (!nonStdWrk || workMode === "admin")) {
      Promise.all([
        fetch("/api/notifications?type=admin&unreadOnly=true").then((r) => (r.ok ? r.json() : [])),
        fetch("/api/settings/notifications/system").then((r) => (r.ok ? r.json() : null)),
      ])
        .then(([data, settingsData]: [NotificationItem[], { worker?: { type: string; showInDashboardModal: boolean }[]; admin?: { type: string; showInDashboardModal: boolean }[] } | null]) => {
          const arr = Array.isArray(data) ? data : [];
          const map: Record<string, { showInDashboardModal: boolean }> = {};
          if (settingsData?.worker) {
            for (const item of settingsData.worker) {
              map[item.type] = { showInDashboardModal: item.showInDashboardModal };
            }
          }
          if (settingsData?.admin) {
            for (const item of settingsData.admin) {
              map[item.type] = { showInDashboardModal: item.showInDashboardModal };
            }
          }
          const hasImportant = arr.some(
            (n) =>
              !n.read &&
              (map[n.type]?.showInDashboardModal ?? isAdminModalPriority(getEffectivePriority(n.priority, n.type)))
          );
          setAdminModalOpen(hasImportant);
        })
        .catch(() => {});
      refreshHighPriorityCounts();
    }
  }, [status, session?.user, workMode]);

  const handleInserisci = async () => {
    if (!missingHoursModal) return;
    const url = buildMyShiftsUrlWithDates(missingHoursModal.message, missingHoursModal.metadata);
    try {
      await fetch(`/api/notifications/mark-all-read?type=MISSING_HOURS_REMINDER`, {
        method: "POST",
      });
      window.dispatchEvent(new Event("notificationsUpdated"));
    } catch {}
    setMissingHoursModal(null);
    router.push(url);
  };

  const handleVaiAlleNotifiche = () => {
    setAdminModalOpen(false);
    router.push("/dashboard/admin-notifications");
  };

  if (status === "loading") {
    return <PageSkeleton />;
  }

  if (!session) {
    return null;
  }

  const userRole = (session.user as any)?.role;
  const isAdmin = userRole === "ADMIN" || userRole === "SUPER_ADMIN";
  const isStandardUser = !["SUPER_ADMIN", "ADMIN", "RESPONSABILE"].includes(userRole);
  const isWorker = (session.user as any)?.isWorker === true;
  const isNonStandardWorker = !isStandardUser && isWorker;
  const canAccessReportsBase = ["SUPER_ADMIN", "ADMIN", "RESPONSABILE"].includes(userRole);
  const canAccessReports = canAccessReportsBase && (!isNonStandardWorker || workMode === "admin");
  const canAccessAdminFeatures = isAdmin && (!isNonStandardWorker || workMode === "admin");
  const canSeeMyShiftsAndHours =
    isStandardUser ||
    (isWorker && (!isNonStandardWorker || workMode === "worker"));
  // In modalità lavoratore, gli admin vedono le stesse descrizioni degli utenti standard
  const useStandardUserDescriptions = isStandardUser || (isNonStandardWorker && workMode === "worker");

  return (
    <DashboardShell>
      <div>
        <h1 className="text-4xl font-bold mb-4 text-gray-900">Dashboard</h1>
        <div className="mt-4">
          <p className="text-gray-600">
            Benvenuto, {session.user?.name || session.user?.email}!
          </p>
          {userRole && (
            <p className="text-sm text-gray-500">
              Ruolo: {userRole}
            </p>
          )}
        </div>

        <div className="mt-8 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 max-w-6xl">
          {/* Eventi */}
          <div className="border border-gray-200 rounded-lg p-6 hover:shadow-lg transition-shadow relative">
            {canAccessAdminFeatures && highPriorityCounts.workdayIssues.badge && (
              <span
                className={`absolute top-4 right-4 min-w-[22px] h-[22px] px-1.5 flex items-center justify-center text-xs font-bold text-white rounded-full ${
                  highPriorityCounts.workdayIssues.badge === "red" ? "bg-red-500" : "bg-amber-500"
                }`}
              >
                {highPriorityCounts.workdayIssues.count > 99 ? "99+" : highPriorityCounts.workdayIssues.count}
              </span>
            )}
            <div className="flex items-center mb-4">
              <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center mr-3">
                <svg className="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
              </div>
                <h2 className="text-2xl font-semibold text-gray-900">Eventi</h2>
            </div>
            <p className="text-gray-600 mb-4">
              {useStandardUserDescriptions
                ? "Visualizza eventi, giornate e pianificazioni"
                : "Gestisci eventi, giornate e pianificazioni"
              }
            </p>
            <button
              onClick={() => router.push("/dashboard/events")}
              className="inline-block px-4 py-2 bg-gray-900 text-white rounded-lg hover:bg-gray-800 hover:shadow-lg hover:scale-105 active:scale-100 transition-all duration-200 cursor-pointer"
            >
              Vai agli Eventi
            </button>
          </div>

          {/* Indisponibilità - Utenti standard, lavoratori, o admin per gestione */}
          {(canSeeMyShiftsAndHours || canAccessAdminFeatures) && (
            <div className="border border-gray-200 rounded-lg p-6 hover:shadow-lg transition-shadow relative">
              {canAccessAdminFeatures && highPriorityCounts.indisponibilita > 0 && (
                <span className="absolute top-4 right-4 min-w-[22px] h-[22px] px-1.5 flex items-center justify-center text-xs font-bold text-white bg-red-500 rounded-full">
                  {highPriorityCounts.indisponibilita > 99 ? "99+" : highPriorityCounts.indisponibilita}
                </span>
              )}
              {canSeeMyShiftsAndHours && !canAccessAdminFeatures && workerPendingUnavailCount > 0 && (
                <span className="absolute top-4 right-4 min-w-[22px] h-[22px] px-1.5 flex items-center justify-center text-xs font-bold text-white bg-red-500 rounded-full">
                  {workerPendingUnavailCount > 99 ? "99+" : workerPendingUnavailCount}
                </span>
              )}
              <div className="flex items-center mb-4">
                <div className="w-10 h-10 bg-amber-100 rounded-lg flex items-center justify-center mr-3">
                  <svg className="w-6 h-6 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <h2 className="text-2xl font-semibold text-gray-900">Indisponibilità</h2>
              </div>
              <p className="text-gray-600 mb-4">
                {useStandardUserDescriptions
                  ? "Comunica giorni e orari in cui non sei disponibile"
                  : "Visualizza e gestisci le indisponibilità comunicate dal personale"
                }
              </p>
              <button
                onClick={() => router.push("/dashboard/unavailabilities")}
                className="inline-block px-4 py-2 bg-gray-900 text-white rounded-lg hover:bg-gray-800 hover:shadow-lg hover:scale-105 active:scale-100 transition-all duration-200 cursor-pointer"
              >
                Vai alle Indisponibilità
              </button>
            </div>
          )}

          {/* I Miei Turni - Solo per utenti standard o abilitati come lavoratori */}
          {canSeeMyShiftsAndHours && (
            <div className="border border-gray-200 rounded-lg p-6 hover:shadow-lg transition-shadow relative">
              {workerMissingHoursCount > 0 && (
                <span className="absolute top-4 right-4 min-w-[22px] h-[22px] px-1.5 flex items-center justify-center text-xs font-bold text-white bg-red-500 rounded-full">
                  {workerMissingHoursCount > 99 ? "99+" : workerMissingHoursCount}
                </span>
              )}
              <div className="flex items-center mb-4">
                <div className="w-10 h-10 bg-sky-100 rounded-lg flex items-center justify-center mr-3">
                  <svg className="w-6 h-6 text-sky-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7V3m8 4V3M3 11h18M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                </div>
                <h2 className="text-2xl font-semibold text-gray-900">I Miei Turni</h2>
              </div>
              <p className="text-gray-600 mb-4">
                Visualizza i turni assegnati e inserisci le ore lavorate
              </p>
              <button
                onClick={() => router.push("/dashboard/my-shifts")}
                className="inline-block px-4 py-2 bg-gray-900 text-white rounded-lg hover:bg-gray-800 hover:shadow-lg hover:scale-105 active:scale-100 transition-all duration-200 cursor-pointer"
              >
                Vai ai Miei Turni
              </button>
            </div>
          )}

          {/* Turni e Ore - Solo per Admin, Super Admin e Responsabile */}
          {canAccessReports && (
            <div className="border border-gray-200 rounded-lg p-6 hover:shadow-lg transition-shadow relative">
              {highPriorityCounts.turniOreMissingHours > 0 && (
                <span className="absolute top-4 right-4 min-w-[22px] h-[22px] px-1.5 flex items-center justify-center text-xs font-bold text-white bg-red-500 rounded-full">
                  {highPriorityCounts.turniOreMissingHours > 99 ? "99+" : highPriorityCounts.turniOreMissingHours}
                </span>
              )}
              <div className="flex items-center mb-4">
                <div className="w-10 h-10 bg-emerald-100 rounded-lg flex items-center justify-center mr-3">
                  <svg className="w-6 h-6 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <h2 className="text-2xl font-semibold text-gray-900">Turni e Ore</h2>
              </div>
              <p className="text-gray-600 mb-4">
                Visualizza e correggi le ore inserite dai lavoratori
              </p>
              <button
                onClick={() => router.push("/dashboard/admin/shifts-hours")}
                className="inline-block px-4 py-2 bg-gray-900 text-white rounded-lg hover:bg-gray-800 hover:shadow-lg hover:scale-105 active:scale-100 transition-all duration-200 cursor-pointer"
              >
                Vai a Turni e Ore
              </button>
            </div>
          )}

          {/* Reportistica - Solo per Admin, Super Admin e Responsabile */}
          {canAccessReports && (
            <div className="border border-gray-200 rounded-lg p-6 hover:shadow-lg transition-shadow">
              <div className="flex items-center mb-4">
                <div className="w-10 h-10 bg-indigo-100 rounded-lg flex items-center justify-center mr-3">
                  <svg className="w-6 h-6 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                </div>
                <h2 className="text-2xl font-semibold text-gray-900">Reportistica</h2>
              </div>
              <p className="text-gray-600 mb-4">
                {userRole === "RESPONSABILE"
                  ? "Genera report personalizzati per azienda e dipendenti"
                  : "Genera report personalizzati per clienti, eventi, mansioni, azienda e dipendenti"}
              </p>
              <button
                onClick={() => router.push("/dashboard/reports")}
                className="inline-block px-4 py-2 bg-gray-900 text-white rounded-lg hover:bg-gray-800 hover:shadow-lg hover:scale-105 active:scale-100 transition-all duration-200 cursor-pointer"
              >
                Vai alla Reportistica
              </button>
            </div>
          )}

          {/* Impostazioni - Solo per Admin (nascosto in modalità lavoratore) */}
          {canAccessAdminFeatures && (
            <div className="border border-gray-200 rounded-lg p-6 hover:shadow-lg transition-shadow relative">
              {userRole === "SUPER_ADMIN" && highPriorityCounts.impostazioniTecniche > 0 && (
                <span className="absolute top-4 right-4 min-w-[22px] h-[22px] px-1.5 flex items-center justify-center text-xs font-bold text-white bg-red-500 rounded-full">
                  {highPriorityCounts.impostazioniTecniche > 99 ? "99+" : highPriorityCounts.impostazioniTecniche}
                </span>
              )}
              <div className="flex items-center mb-4">
                <div className="w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center mr-3">
                  <svg className="w-6 h-6 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                </div>
                <h2 className="text-2xl font-semibold text-gray-900">Impostazioni</h2>
              </div>
              <p className="text-gray-600 mb-4">
                Gestisci aziende, location, clienti, utenti e configurazioni
              </p>
              <button
                onClick={() => router.push("/settings")}
                className="inline-block px-4 py-2 bg-gray-900 text-white rounded-lg hover:bg-gray-800 hover:shadow-lg hover:scale-105 active:scale-100 transition-all duration-200 cursor-pointer"
              >
                Vai alle Impostazioni
              </button>
            </div>
          )}
        </div>
      </div>

      {adminModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6 border border-gray-200">
            <h2 className="text-xl font-bold text-gray-900 mb-3">
              Hai delle notifiche importanti a cui prestare attenzione!
            </h2>
            <p className="text-gray-700 text-sm mb-6">
              Controlla le notifiche per non perdere aggiornamenti rilevanti.
            </p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setAdminModalOpen(false)}
                className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50"
              >
                Dopo
              </button>
              <button
                onClick={handleVaiAlleNotifiche}
                className="px-4 py-2 bg-gray-900 text-white rounded-lg hover:bg-gray-800"
              >
                Vai alle notifiche
              </button>
            </div>
          </div>
        </div>
      )}

      {missingHoursModal && !adminModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6 border border-gray-200">
            <h2 className="text-xl font-bold text-gray-900 mb-3">Notifica importante!</h2>
            <p className="text-gray-700 text-sm mb-6 whitespace-pre-wrap">
              {missingHoursModal.message}
            </p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setMissingHoursModal(null)}
                className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50"
              >
                Dopo
              </button>
              <button
                onClick={handleInserisci}
                className="px-4 py-2 bg-gray-900 text-white rounded-lg hover:bg-gray-800"
              >
                Inserisci
              </button>
            </div>
          </div>
        </div>
      )}
    </DashboardShell>
  );
}
