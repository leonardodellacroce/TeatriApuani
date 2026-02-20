"use client";

import DashboardShell from "@/components/DashboardShell";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { getWorkModeCookie, WORK_MODE_CHANGED_EVENT } from "@/lib/workMode";

export default function Dashboard() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [workMode, setWorkMode] = useState<"admin" | "worker">("admin");

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

  if (status === "loading") {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p>Caricamento...</p>
      </div>
    );
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
          <div className="border border-gray-200 rounded-lg p-6 hover:shadow-lg transition-shadow">
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
            <div className="border border-gray-200 rounded-lg p-6 hover:shadow-lg transition-shadow">
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

          {/* Le Mie Ore - Solo per utenti standard o abilitati come lavoratori */}
          {canSeeMyShiftsAndHours && (
            <div className="border border-gray-200 rounded-lg p-6 hover:shadow-lg transition-shadow">
              <div className="flex items-center mb-4">
                <div className="w-10 h-10 bg-orange-100 rounded-lg flex items-center justify-center mr-3">
                  <svg className="w-6 h-6 text-orange-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <h2 className="text-2xl font-semibold text-gray-900">Le Mie Ore</h2>
              </div>
              <p className="text-gray-600 mb-4">
                Inserisci e gestisci le ore lavorate
              </p>
              <button
                onClick={() => router.push("/dashboard/time-entries")}
                className="inline-block px-4 py-2 bg-gray-900 text-white rounded-lg hover:bg-gray-800 hover:shadow-lg hover:scale-105 active:scale-100 transition-all duration-200 cursor-pointer"
              >
                Vai alle Mie Ore
              </button>
            </div>
          )}

          {/* I Miei Turni - Solo per utenti standard o abilitati come lavoratori */}
          {canSeeMyShiftsAndHours && (
            <div className="border border-gray-200 rounded-lg p-6 hover:shadow-lg transition-shadow">
              <div className="flex items-center mb-4">
                <div className="w-10 h-10 bg-sky-100 rounded-lg flex items-center justify-center mr-3">
                  <svg className="w-6 h-6 text-sky-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7V3m8 4V3M3 11h18M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                </div>
                <h2 className="text-2xl font-semibold text-gray-900">I Miei Turni</h2>
              </div>
              <p className="text-gray-600 mb-4">
                Visualizza i turni assegnati
              </p>
              <button
                onClick={() => router.push("/dashboard/my-shifts")}
                className="inline-block px-4 py-2 bg-gray-900 text-white rounded-lg hover:bg-gray-800 hover:shadow-lg hover:scale-105 active:scale-100 transition-all duration-200 cursor-pointer"
              >
                Vai ai Miei Turni
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
            <div className="border border-gray-200 rounded-lg p-6 hover:shadow-lg transition-shadow">
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
    </DashboardShell>
  );
}
