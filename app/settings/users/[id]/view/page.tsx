"use client";

import { useState, useEffect } from "react";
import { useRouter, useParams } from "next/navigation";
import { useSession } from "next-auth/react";
import DashboardShell from "@/components/DashboardShell";
import { formatAreas, formatRoles } from "@/utils/user-display";

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
  isActive: boolean;
  codiceFiscale: string;
  areas: string | null;
  roles: string | null;
  company: {
    id: string;
    ragioneSociale: string;
  } | null;
}

export default function ViewUserPage() {
  const router = useRouter();
  const params = useParams();
  const { data: session } = useSession();
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
    return (
      <DashboardShell>
        <div className="flex items-center justify-center h-64">
          <p>Caricamento...</p>
        </div>
      </DashboardShell>
    );
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

  return (
    <DashboardShell>
      <div>
        <div className="flex items-center gap-3 mb-6">
          <button
            onClick={() => router.back()}
            aria-label="Indietro"
            title="Indietro"
            className="h-10 w-10 inline-flex items-center justify-center rounded-lg bg-gray-900 text-white hover:bg-gray-800 hover:shadow-lg hover:scale-105 active:scale-100 transition-all duration-200 cursor-pointer"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <h1 className="text-3xl font-bold">Dettagli Utente</h1>
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
              Aree di Appartenenza
            </label>
            <input
              type="text"
              value={user.areas ? formatAreas(user.areas) : "-"}
              readOnly
              className="w-full px-4 py-2 border border-gray-300 rounded-lg bg-gray-100 text-gray-700 cursor-not-allowed"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Ruoli
            </label>
            <input
              type="text"
              value={user.roles ? formatRoles(user.roles) : "-"}
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
                onClick={() => router.push(`/settings/users/${id}`)}
                aria-label="Modifica"
                title="Modifica"
                className="h-10 w-10 inline-flex items-center justify-center rounded-lg bg-gray-900 text-white hover:bg-gray-800 hover:shadow-lg transition-colors"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15.232 5.232l3.536 3.536M4 20h4l10.293-10.293a1 1 0 000-1.414l-2.586-2.586a1 1 0 00-1.414 0L4 16v4z" />
                </svg>
              </button>
            )}
          </div>
        </form>
      </div>
    </DashboardShell>
  );
}


