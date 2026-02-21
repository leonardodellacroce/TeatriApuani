"use client";

import { useState, useEffect } from "react";
import { useRouter, useParams } from "next/navigation";
import DashboardShell from "@/components/DashboardShell";
import PageSkeleton from "@/components/PageSkeleton";

interface Company {
  id: string;
  ragioneSociale: string;
}

interface User {
  id: string;
  code: string;
  name: string;
  cognome: string;
  email: string;
  isAdmin: boolean;
  isSuperAdmin: boolean;
  isResponsabile: boolean;
  isActive: boolean;
  codiceFiscale: string;
  company: {
    id: string;
    ragioneSociale: string;
  } | null;
}

export default function ViewUserPage() {
  const router = useRouter();
  const params = useParams();
  const id = params.id as string;

  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [isArchived, setIsArchived] = useState(false);

  useEffect(() => {
    fetchUser();
  }, [id]);

  const fetchUser = async () => {
    try {
      const res = await fetch(`/api/users/${id}`);
      if (res.ok) {
        const data = await res.json();
        setUser(data);
        setIsArchived(data.isArchived || false);
      }
    } catch (error) {
      console.error("Error fetching user:", error);
      setError("Errore nel caricamento dell'utente");
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return <PageSkeleton />;
  }

  if (!user) {
    return (
      <DashboardShell>
        <div className="flex items-center justify-center h-64">
          <p className="text-red-600">{error || "Utente non trovato"}</p>
        </div>
      </DashboardShell>
    );
  }

  const getRoles = () => {
    const roles: string[] = [];
    if (user.isSuperAdmin) roles.push("Super Admin");
    if (user.isAdmin) roles.push("Admin");
    if (user.isResponsabile) roles.push("Responsabile");
    return roles.length > 0 ? roles.join(", ") : "Nessun ruolo";
  };

  return (
    <DashboardShell>
      <div>
        <div className="flex items-center gap-3 mb-6">
          <button
            onClick={() => router.back()}
            aria-label="Indietro"
            title="Indietro"
            className="h-10 w-10 inline-flex items-center justify-center rounded-lg bg-gray-900 text-white hover:bg-gray-800 hover:shadow-lg transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <h1 className="text-3xl font-bold">Dettagli Utente di Gestione</h1>
        </div>

        <form className="max-w-2xl space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Nome *
              </label>
              <input
                type="text"
                value={user.name || ""}
                readOnly
                className="w-full px-4 py-2 border border-gray-300 rounded-lg bg-gray-100 text-gray-700 cursor-not-allowed"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Cognome *
              </label>
              <input
                type="text"
                value={user.cognome || ""}
                readOnly
                className="w-full px-4 py-2 border border-gray-300 rounded-lg bg-gray-100 text-gray-700 cursor-not-allowed"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Email *
            </label>
            <input
              type="email"
              value={user.email}
              readOnly
              className="w-full px-4 py-2 border border-gray-300 rounded-lg bg-gray-100 text-gray-700 cursor-not-allowed"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Codice Fiscale *
            </label>
            <input
              type="text"
              value={user.codiceFiscale || ""}
              readOnly
              className="w-full px-4 py-2 border border-gray-300 rounded-lg bg-gray-100 text-gray-700 cursor-not-allowed uppercase"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Ruolo/i
            </label>
            <input
              type="text"
              value={getRoles()}
              readOnly
              className="w-full px-4 py-2 border border-gray-300 rounded-lg bg-gray-100 text-gray-700 cursor-not-allowed"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Azienda
            </label>
            <input
              type="text"
              value={user.company?.ragioneSociale || "-"}
              readOnly
              className="w-full px-4 py-2 border border-gray-300 rounded-lg bg-gray-100 text-gray-700 cursor-not-allowed"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Stato
            </label>
            <div>
              {user.isActive ? (
                <span className="px-3 py-1 text-sm font-medium bg-green-100 text-green-800 rounded inline-block">
                  Attivo
                </span>
              ) : (
                <span className="px-3 py-1 text-sm font-medium bg-red-100 text-red-800 rounded inline-block">
                  Inattivo
                </span>
              )}
            </div>
          </div>

          {error && (
            <div className="text-red-600 text-sm">{error}</div>
          )}

          <div className="flex gap-4 pt-4">
            {!isArchived && (
              <button
                type="button"
                onClick={() => router.push(`/settings/management-users/${id}`)}
                className="px-4 py-2 bg-gray-900 text-white rounded-lg hover:bg-gray-800 hover:shadow-lg hover:scale-105 active:scale-100 transition-all duration-200 cursor-pointer"
              >
                Modifica
              </button>
            )}
          </div>
        </form>
      </div>
    </DashboardShell>
  );
}


