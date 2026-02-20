import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { hasRole } from "@/lib/authz";
import Navbar from "@/components/Navbar";
import { getWorkModeFromServer } from "@/lib/workMode";

export default async function Settings() {
  const session = await auth();

  if (!session?.user) {
    redirect("/");
  }

  // Verifica se l'utente ha accesso (solo admin e superadmin per la pagina impostazioni)
  const userRole = session.user.role as string;
  const hasAccess = ["ADMIN", "SUPER_ADMIN"].includes(userRole);

  if (!hasAccess) {
    redirect("/");
  }

  const isStandardUser = !["SUPER_ADMIN", "ADMIN", "RESPONSABILE"].includes(userRole);
  const isWorker = (session.user as any).isWorker === true;
  const isNonStandardWorker = !isStandardUser && isWorker;
  const workMode = await getWorkModeFromServer();
  if (isNonStandardWorker && workMode === "worker") {
    redirect("/dashboard");
  }

  const isSuperAdmin = userRole === "SUPER_ADMIN";
  const canSeeManagementUsers = ["SUPER_ADMIN"].includes(userRole);
  const canSeeUsers = ["SUPER_ADMIN", "ADMIN", "RESPONSABILE"].includes(userRole);

  const userName = session.user.name || "Utente";
  const cognome = (session.user as any).cognome || "";
  const fullName = cognome ? `${session.user.name || ""} ${cognome}`.trim() : userName;

  return (
    <div className="min-h-screen bg-white text-gray-900">
      <Navbar />
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <h1 className="text-4xl font-bold mb-8">Impostazioni</h1>
        
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="border border-gray-200 rounded-lg p-6 hover:shadow-lg transition-shadow">
            <div className="flex items-center mb-4">
              <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center mr-3">
                <svg className="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                </svg>
              </div>
              <h2 className="text-2xl font-semibold">Aziende in ATI</h2>
            </div>
            <p className="text-gray-600 mb-4">
              Gestisci le aziende facenti parte dell'ATI e le loro informazioni fiscali
            </p>
            <a
              href="/settings/companies"
              className="inline-block px-4 py-2 bg-gray-900 text-white rounded-lg hover:bg-gray-800 hover:shadow-lg hover:scale-105 active:scale-100 transition-all duration-200 cursor-pointer"
            >
              Vai alle Aziende
            </a>
          </div>

          <div className="border border-gray-200 rounded-lg p-6 hover:shadow-lg transition-shadow">
            <div className="flex items-center mb-4">
              <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center mr-3">
                <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
              </div>
              <h2 className="text-2xl font-semibold">Location</h2>
            </div>
            <p className="text-gray-600 mb-4">
              Gestisci le location e le sedi di lavoro
            </p>
            <a
              href="/settings/locations"
              className="inline-block px-4 py-2 bg-gray-900 text-white rounded-lg hover:bg-gray-800 hover:shadow-lg hover:scale-105 active:scale-100 transition-all duration-200 cursor-pointer"
            >
              Vai alle Location
            </a>
          </div>

          <div className="border border-gray-200 rounded-lg p-6 hover:shadow-lg transition-shadow">
            <div className="flex items-center mb-4">
              <div className="w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center mr-3">
                <svg className="w-6 h-6 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                </svg>
              </div>
              <h2 className="text-2xl font-semibold">Clienti</h2>
            </div>
            <p className="text-gray-600 mb-4">
              Gestisci i clienti e le loro informazioni fiscali
            </p>
            <a
              href="/settings/clients"
              className="inline-block px-4 py-2 bg-gray-900 text-white rounded-lg hover:bg-gray-800 hover:shadow-lg hover:scale-105 active:scale-100 transition-all duration-200 cursor-pointer"
            >
              Vai ai Clienti
            </a>
          </div>

          {canSeeManagementUsers && (
            <div className="border border-gray-200 rounded-lg p-6 hover:shadow-lg transition-shadow">
              <div className="flex items-center mb-4">
                <div className="w-10 h-10 bg-orange-100 rounded-lg flex items-center justify-center mr-3">
                  <svg className="w-6 h-6 text-orange-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
                  </svg>
                </div>
                <h2 className="text-2xl font-semibold">Utenti di Gestione</h2>
              </div>
              <p className="text-gray-600 mb-4">
                Gestisci gli utenti di gestione
              </p>
              <a
                href="/settings/management-users"
                className="inline-block px-4 py-2 bg-gray-900 text-white rounded-lg hover:bg-gray-800 hover:shadow-lg hover:scale-105 active:scale-100 transition-all duration-200 cursor-pointer"
              >
                Vai agli Utenti di Gestione
              </a>
            </div>
          )}

          {canSeeUsers && (
            <div className="border border-gray-200 rounded-lg p-6 hover:shadow-lg transition-shadow">
              <div className="flex items-center mb-4">
                <div className="w-10 h-10 bg-teal-100 rounded-lg flex items-center justify-center mr-3">
                  <svg className="w-6 h-6 text-teal-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
                  </svg>
                </div>
                <h2 className="text-2xl font-semibold">Utenti</h2>
              </div>
              <p className="text-gray-600 mb-4">
                Gestisci gli utenti del sistema
              </p>
              <a
                href="/settings/users"
                className="inline-block px-4 py-2 bg-gray-900 text-white rounded-lg hover:bg-gray-800 hover:shadow-lg hover:scale-105 active:scale-100 transition-all duration-200 cursor-pointer"
              >
                Vai agli Utenti
              </a>
            </div>
          )}

          {canSeeManagementUsers && (
            <div className="border border-gray-200 rounded-lg p-6 hover:shadow-lg transition-shadow">
              <div className="flex items-center mb-4">
                <div className="w-10 h-10 bg-indigo-100 rounded-lg flex items-center justify-center mr-3">
                  <svg className="w-6 h-6 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                  </svg>
                </div>
                <h2 className="text-2xl font-semibold">Aree e Mansioni</h2>
              </div>
              <p className="text-gray-600 mb-4">
                Gestisci le aree di appartenenza e le mansioni
              </p>
              <a
                href="/settings/areas-duties"
                className="inline-block px-4 py-2 bg-gray-900 text-white rounded-lg hover:bg-gray-800 hover:shadow-lg hover:scale-105 active:scale-100 transition-all duration-200 cursor-pointer"
              >
                Vai ad Aree e Mansioni
              </a>
            </div>
          )}

          {canSeeManagementUsers && (
            <div className="border border-gray-200 rounded-lg p-6 hover:shadow-lg transition-shadow">
              <div className="flex items-center mb-4">
                <div className="w-10 h-10 bg-pink-100 rounded-lg flex items-center justify-center mr-3">
                  <svg className="w-6 h-6 text-pink-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
                  </svg>
                </div>
                <h2 className="text-2xl font-semibold">Attività e Turni</h2>
              </div>
              <p className="text-gray-600 mb-4">
                Gestisci le tipologie di attività e di turni
              </p>
              <a
                href="/settings/task-shift-types"
                className="inline-block px-4 py-2 bg-gray-900 text-white rounded-lg hover:bg-gray-800 hover:shadow-lg hover:scale-105 active:scale-100 transition-all duration-200 cursor-pointer"
              >
                Vai ad Attività e Turni
              </a>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

