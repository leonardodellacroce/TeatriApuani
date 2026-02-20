"use client";

import Link from "next/link";
import { signOut, useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useState, useTransition, useEffect } from "react";
import { hasRole } from "@/lib/authz";
import { getWorkModeCookie, setWorkModeCookie, type WorkMode } from "@/lib/workMode";

export default function Navbar() {
  const router = useRouter();
  const { data: session, status } = useSession();
  const [loggingOut, setLoggingOut] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [workMode, setWorkMode] = useState<WorkMode>("admin");
  const [profileDropdownOpen, setProfileDropdownOpen] = useState(false);
  const [pendingUnavailCount, setPendingUnavailCount] = useState(0);

  const userRole = session?.user?.role as string | undefined;
  const isStandardUser = !["SUPER_ADMIN", "ADMIN", "RESPONSABILE"].includes(userRole || "");
  const isWorker = (session?.user as any)?.isWorker === true;
  const isNonStandardWorker = !isStandardUser && isWorker;

  const canAccessUsersBase = hasRole(
    userRole ? { role: userRole as any } : null,
    ["ADMIN", "SUPER_ADMIN", "RESPONSABILE"]
  );
  const canAccessUsers =
    canAccessUsersBase && (!isNonStandardWorker || workMode === "admin");
  const canSeeMyShiftsAndHours =
    isStandardUser ||
    (isWorker && (!isNonStandardWorker || workMode === "worker"));
  const canSeeIndisponibilita = canSeeMyShiftsAndHours || canAccessUsers;

  useEffect(() => {
    if (isNonStandardWorker) {
      setWorkMode(getWorkModeCookie());
    }
  }, [isNonStandardWorker, session]);

  const refreshPendingCount = () => {
    if (canAccessUsers) {
      fetch("/api/unavailabilities/pending-count")
        .then((r) => r.ok ? r.json() : { count: 0 })
        .then((d) => setPendingUnavailCount(d?.count ?? 0))
        .catch(() => setPendingUnavailCount(0));
    }
  };
  useEffect(() => {
    refreshPendingCount();
  }, [canAccessUsers, session]);
  useEffect(() => {
    const handler = () => refreshPendingCount();
    window.addEventListener("unavailabilitiesUpdated", handler);
    return () => window.removeEventListener("unavailabilitiesUpdated", handler);
  }, [canAccessUsers]);

  const handleLogout = async () => {
    if (loggingOut) return;
    setLoggingOut(true);
    startTransition(() => router.replace("/dashboard"));
    try {
      await signOut({ redirect: false });
    } finally {
      setLoggingOut(false);
    }
  };

  const handleWorkModeChange = (mode: WorkMode) => {
    setWorkModeCookie(mode);
    setWorkMode(mode);
    setProfileDropdownOpen(false);
    router.push("/dashboard");
  };

  return (
    <nav className="sticky top-0 z-50 bg-white border-b border-gray-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <div className="flex-shrink-0">
            <Link href="/dashboard" className="text-xl font-bold text-gray-900">
              Teatri Apuani
            </Link>
          </div>

          {/* Navigation Links */}
          <div className="hidden md:flex items-center space-x-8">
            {session && (
              <>
                <Link
                  href="/dashboard"
                  className="text-gray-700 hover:text-gray-900 font-medium transition-colors"
                >
                  Dashboard
                </Link>
                <Link
                  href="/dashboard/events"
                  className="text-gray-700 hover:text-gray-900 font-medium transition-colors"
                >
                  Eventi
                </Link>
                {canSeeIndisponibilita && (
                  <Link
                    href="/dashboard/unavailabilities"
                    className="relative inline-flex items-center text-gray-700 hover:text-gray-900 font-medium transition-colors"
                  >
                    Indisponibilità
                    {canAccessUsers && pendingUnavailCount > 0 && (
                      <span className="ml-1 min-w-[18px] h-[18px] px-1 flex items-center justify-center text-[10px] font-bold text-white bg-red-500 rounded-full">
                        {pendingUnavailCount > 99 ? "99+" : pendingUnavailCount}
                      </span>
                    )}
                  </Link>
                )}
                {canSeeMyShiftsAndHours && (
                  <>
                    <Link
                      href="/dashboard/time-entries"
                      className="text-gray-700 hover:text-gray-900 font-medium transition-colors"
                    >
                      Le Mie Ore
                    </Link>
                    <Link
                      href="/dashboard/my-shifts"
                      className="text-gray-700 hover:text-gray-900 font-medium transition-colors"
                    >
                      I Miei Turni
                    </Link>
                  </>
                )}
              </>
            )}
            {canAccessUsers && (
              <>
                <Link
                  href="/dashboard/reports"
                  className="text-gray-700 hover:text-gray-900 font-medium transition-colors"
                >
                  Reportistica
                </Link>
              </>
            )}
            {canAccessUsers && (
              <>
                {userRole === "RESPONSABILE" ? (
                  <Link
                    href="/settings/users"
                    className="text-gray-700 hover:text-gray-900 font-medium transition-colors"
                  >
                    Utenti
                  </Link>
                ) : (
                  <Link
                    href="/settings"
                    className="text-gray-700 hover:text-gray-900 font-medium transition-colors"
                  >
                    Impostazioni
                  </Link>
                )}
              </>
            )}
            {session ? (
              <>
                <div className="relative">
                  <button
                    onClick={() => setProfileDropdownOpen(!profileDropdownOpen)}
                    className="flex items-center gap-2 text-gray-700 hover:text-gray-900 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-1 rounded-lg px-2 py-1"
                    aria-expanded={profileDropdownOpen}
                    aria-haspopup="true"
                  >
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      fill="none"
                      viewBox="0 0 24 24"
                      strokeWidth={1.5}
                      stroke="currentColor"
                      className="w-5 h-5 text-gray-700"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z"
                      />
                    </svg>
                    <span className="text-gray-900 font-medium">
                      {session.user?.name}
                    </span>
                    <svg className={`w-4 h-4 transition-transform ${profileDropdownOpen ? "rotate-180" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>
                  {profileDropdownOpen && (
                    <>
                      <div
                        className="fixed inset-0 z-40"
                        onClick={() => setProfileDropdownOpen(false)}
                        aria-hidden="true"
                      />
                      <div className="absolute right-0 mt-1 w-56 rounded-lg bg-white border border-gray-200 shadow-lg z-50 py-1">
                        {isNonStandardWorker && (
                          <>
                            <div className="px-3 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wider border-b border-gray-100">
                              Modalità operativa
                            </div>
                            <button
                              onClick={() => handleWorkModeChange("admin")}
                              className={`w-full text-left px-4 py-2 text-sm flex items-center justify-between ${
                                workMode === "admin" ? "bg-gray-100 text-gray-900 font-medium" : "text-gray-700 hover:bg-gray-50"
                              }`}
                            >
                              Modalità amministratore
                              {workMode === "admin" && (
                                <svg className="w-4 h-4 text-gray-900" fill="currentColor" viewBox="0 0 20 20">
                                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                                </svg>
                              )}
                            </button>
                            <button
                              onClick={() => handleWorkModeChange("worker")}
                              className={`w-full text-left px-4 py-2 text-sm flex items-center justify-between ${
                                workMode === "worker" ? "bg-gray-100 text-gray-900 font-medium" : "text-gray-700 hover:bg-gray-50"
                              }`}
                            >
                              Modalità lavoratore
                              {workMode === "worker" && (
                                <svg className="w-4 h-4 text-gray-900" fill="currentColor" viewBox="0 0 20 20">
                                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                                </svg>
                              )}
                            </button>
                            <div className="border-t border-gray-100 my-1" />
                          </>
                        )}
                        <button
                          onClick={() => {
                            setProfileDropdownOpen(false);
                            handleLogout();
                          }}
                          disabled={loggingOut}
                          className={`w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 ${loggingOut ? "opacity-60 cursor-not-allowed" : ""}`}
                        >
                          {loggingOut ? "Logout…" : "Logout"}
                        </button>
                      </div>
                    </>
                  )}
                </div>
              </>
            ) : (
              <Link
                href="/login"
                className="text-gray-700 hover:text-gray-900 font-medium transition-colors"
              >
                Login
              </Link>
            )}
          </div>

          {/* Mobile menu button */}
          <div className="md:hidden">
            <button
              type="button"
              className="text-gray-700 hover:text-gray-900 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-gray-500"
              aria-label="Menu"
            >
              <svg
                className="h-6 w-6"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M4 6h16M4 12h16M4 18h16"
                />
              </svg>
            </button>
          </div>
        </div>
      </div>
    </nav>
  );
}
