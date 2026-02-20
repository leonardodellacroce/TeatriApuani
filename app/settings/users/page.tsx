"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import DashboardShell from "@/components/DashboardShell";
import ConfirmDialog from "@/components/ConfirmDialog";

interface User {
  id: string;
  code: string;
  name: string | null;
  cognome: string | null;
  email: string;
  role: string | null;
  isSuperAdmin: boolean;
  isAdmin: boolean;
  isResponsabile: boolean;
  isCoordinatore: boolean;
  isActive: boolean;
  codiceFiscale: string | null;
  areas: string | null;
  roles: string | null;
  company: {
    id: string;
    ragioneSociale: string;
  } | null;
  createdAt: string;
  hasAssignments?: boolean;
  assignmentsCount?: number;
}

interface Company {
  id: string;
  ragioneSociale: string;
}

type SortField = "code" | "name" | "company" | "createdAt";
type SortOrder = "asc" | "desc";

export default function UsersPage() {
  const router = useRouter();
  const { data: session } = useSession();
  const [users, setUsers] = useState<User[]>([]);
  const [allUsers, setAllUsers] = useState<User[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(true);
  const [sortField, setSortField] = useState<SortField>("code");
  const [sortOrder, setSortOrder] = useState<SortOrder>("asc");
  const [companyFilter, setCompanyFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState<"active" | "inactive" | "all">("active");
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [pendingToggle, setPendingToggle] = useState<{ id: string; isActive: boolean } | null>(null);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);
  const [showArchiveDialog, setShowArchiveDialog] = useState(false);
  const [pendingArchive, setPendingArchive] = useState<string | null>(null);
  
  const isSuperAdminOrAdmin = session?.user?.role === "SUPER_ADMIN" || session?.user?.role === "ADMIN";

  useEffect(() => {
    fetchUsers();
  }, []);

  useEffect(() => {
    if (isSuperAdminOrAdmin) {
      fetchCompanies();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSuperAdminOrAdmin]);

  const fetchUsers = async () => {
    try {
      const res = await fetch("/api/users");
      if (res.ok) {
        const data = await res.json();
        // Filtra solo gli utenti normali, non i management users
        const normalUsers = data.filter((user: User) => 
          !user.isSuperAdmin && !user.isAdmin && !user.isResponsabile
        );
        setAllUsers(normalUsers);
        setUsers(normalUsers);
      }
    } catch (error) {
      console.error("Error fetching users:", error);
    } finally {
      setLoading(false);
    }
  };

  const fetchCompanies = async () => {
    try {
      const res = await fetch("/api/companies");
      if (res.ok) {
        const data = await res.json();
        setCompanies(data);
      }
    } catch (error) {
      console.error("Error fetching companies:", error);
    }
  };

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortOrder(sortOrder === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortOrder("asc");
    }
  };

  // Filtra per azienda e stato
  useEffect(() => {
    let filtered = [...allUsers];
    
    // Filtra per azienda (selezione singola)
    if (companyFilter) {
      filtered = filtered.filter(user => user.company?.id === companyFilter);
    }
    
    // Filtra per stato
    if (statusFilter === "active") {
      filtered = filtered.filter(user => user.isActive);
    } else if (statusFilter === "inactive") {
      filtered = filtered.filter(user => !user.isActive);
    }
    
    // Ordina
    filtered.sort((a, b) => {
      let aValue: any;
      let bValue: any;
      
      if (sortField === "code") {
        aValue = a.code;
        bValue = b.code;
      } else if (sortField === "name") {
        aValue = `${a.name || ""} ${a.cognome || ""}`.trim();
        bValue = `${b.name || ""} ${b.cognome || ""}`.trim();
      } else if (sortField === "company") {
        aValue = a.company?.ragioneSociale || "";
        bValue = b.company?.ragioneSociale || "";
      } else {
        aValue = new Date(a.createdAt).getTime();
        bValue = new Date(b.createdAt).getTime();
      }
      
      if (aValue < bValue) return sortOrder === "asc" ? -1 : 1;
      if (aValue > bValue) return sortOrder === "asc" ? 1 : -1;
      return 0;
    });
    
    setUsers(filtered);
  }, [companyFilter, statusFilter, sortField, sortOrder, allUsers]);

  const handleToggle = (id: string, isActive: boolean) => {
    setPendingToggle({ id, isActive });
    setShowConfirmDialog(true);
  };

  const confirmToggle = async () => {
    if (!pendingToggle) return;

    try {
      console.log("Toggling user with ID:", pendingToggle.id);
      const res = await fetch(`/api/users/${pendingToggle.id}/toggle`, {
        method: "PATCH",
      });

      console.log("Response status:", res.status);
      
      if (res.ok) {
        const data = await res.json();
        console.log("Updated user:", data);
        fetchUsers();
      } else {
        const errorData = await res.json();
        console.error("Error response:", errorData);
        alert(errorData.error || "Errore durante la modifica dello stato");
      }
    } catch (error) {
      console.error("Error toggling user:", error);
      alert("Errore durante la modifica dello stato");
    } finally {
      setShowConfirmDialog(false);
      setPendingToggle(null);
    }
  };

  const cancelToggle = () => {
    setShowConfirmDialog(false);
    setPendingToggle(null);
  };

  const handleDelete = (id: string) => {
    setPendingDelete(id);
    setShowDeleteDialog(true);
  };

  const confirmDelete = async () => {
    if (!pendingDelete) return;

    try {
      const res = await fetch(`/api/users/${pendingDelete}`, {
        method: "DELETE",
      });

      if (res.ok) {
        fetchUsers();
      } else {
        const data = await res.json();
        if (data.hasAssignments) {
          alert(`Impossibile eliminare l'utente. L'utente è associato a ${data.assignmentsCount} turno/i o giornata/e di lavoro. È possibile solo archiviare l'utente.`);
        } else {
          alert(data.error || "Errore durante l'eliminazione");
        }
      }
    } catch (error) {
      console.error("Error deleting user:", error);
      alert("Errore durante l'eliminazione");
    } finally {
      setShowDeleteDialog(false);
      setPendingDelete(null);
    }
  };

  const cancelDelete = () => {
    setShowDeleteDialog(false);
    setPendingDelete(null);
  };

  const handleArchive = (id: string) => {
    setPendingArchive(id);
    setShowArchiveDialog(true);
  };

  const confirmArchive = async () => {
    if (!pendingArchive) return;

    try {
      const res = await fetch(`/api/users/${pendingArchive}/archive`, {
        method: "PATCH",
      });

      if (res.ok) {
        fetchUsers();
      } else {
        const data = await res.json();
        alert(data.error || "Errore durante l'operazione");
      }
    } catch (error) {
      console.error("Error archiving user:", error);
      alert("Errore durante l'operazione");
    } finally {
      setShowArchiveDialog(false);
      setPendingArchive(null);
    }
  };

  const cancelArchive = () => {
    setShowArchiveDialog(false);
    setPendingArchive(null);
  };

  const isArchiveDisabled = (userId: string): boolean => {
    if (!session?.user) return false;
    // Confronta gli ID come stringhe per essere sicuri
    return String(session.user.id) === String(userId);
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

  return (
    <DashboardShell>
      <div>
        <div className="flex justify-between items-center mb-6">
          <div className="flex items-center gap-3">
            <button
              onClick={() => router.push("/settings")}
              aria-label="Indietro"
              title="Indietro"
              className="h-10 w-10 inline-flex items-center justify-center rounded-lg bg-gray-900 text-white hover:bg-gray-800 hover:shadow-lg transition-colors"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <h1 className="text-3xl font-bold">Utenti</h1>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => router.push("/settings/users/archive")}
              className="px-4 py-2 rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50 hover:border-gray-400 hover:shadow-md hover:scale-105 active:scale-100 transition-all duration-200 cursor-pointer"
            >
              Archivio
            </button>
            <button
              onClick={() => router.push("/settings/users/new")}
              className="px-4 py-2 rounded-lg bg-gray-900 text-white hover:bg-gray-800 hover:shadow-lg hover:scale-105 active:scale-100 transition-all duration-200 cursor-pointer"
            >
              Nuovo Utente
            </button>
          </div>
        </div>

        {/* Filtri */}
        <div className="mb-6 flex gap-4 items-start">
          {/* Filtro per stato */}
          <div>
            <label htmlFor="status-filter" className="block text-sm font-medium text-gray-700 mb-2">
              Stato
            </label>
            <select
              id="status-filter"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as "active" | "inactive" | "all")}
              className="px-4 py-2 border border-gray-300 rounded-lg hover:border-gray-400 hover:shadow-md hover:bg-gray-50 focus:ring-2 focus:ring-gray-900 focus:border-transparent transition-all duration-200 cursor-pointer"
            >
              <option value="active">Attivi</option>
              <option value="inactive">Disattivati</option>
              <option value="all">Tutti</option>
            </select>
          </div>
          
          {/* Filtro per azienda solo per SUPER_ADMIN e ADMIN */}
          {isSuperAdminOrAdmin && companies.length > 0 && (
            <div>
              <label htmlFor="company-filter" className="block text-sm font-medium text-gray-700 mb-2">
                Azienda
              </label>
              <select
                id="company-filter"
                value={companyFilter}
                onChange={(e) => setCompanyFilter(e.target.value)}
                className="px-4 py-2 border border-gray-300 rounded-lg hover:border-gray-400 hover:shadow-md hover:bg-gray-50 focus:ring-2 focus:ring-gray-900 focus:border-transparent transition-all duration-200 cursor-pointer"
              >
                <option value="">Tutte le aziende</option>
                {companies.map((company) => (
                  <option key={company.id} value={company.id}>
                    {company.ragioneSociale}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        {users.length === 0 ? (
          <p className="text-gray-600">Nessun utente trovato.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th 
                    className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                    onClick={() => handleSort("code")}
                  >
                    Codice
                  </th>
                  <th 
                    className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                    onClick={() => handleSort("name")}
                  >
                    Nome e Cognome
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Email
                  </th>
                  <th
                    className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                    onClick={() => handleSort("company")}
                  >
                    Azienda
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Stato
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Azioni
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {users.map((user) => (
                  <tr key={user.id}>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                      {user.code}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                      {user.name && user.cognome 
                        ? `${user.name} ${user.cognome}` 
                        : user.name || user.email}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {user.email}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {user.company?.ragioneSociale || "-"}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm">
                      {session?.user?.id === user.id ? (
                        <span
                          className={`px-2 py-1 text-xs font-semibold rounded-full cursor-not-allowed ${
                            user.isActive
                              ? "bg-green-100 text-green-800"
                              : "bg-red-100 text-red-800"
                          }`}
                        >
                          {user.isActive ? "Attivo" : "Inattivo"}
                        </span>
                      ) : (
                        <button
                          onClick={() => handleToggle(user.id, user.isActive)}
                          className={`px-2 py-1 text-xs font-semibold rounded-full cursor-pointer hover:opacity-80 transition-opacity ${
                            user.isActive
                              ? "bg-green-100 text-green-800"
                              : "bg-red-100 text-red-800"
                          }`}
                        >
                          {user.isActive ? "Attivo" : "Inattivo"}
                        </button>
                      )}
                    </td>
                    <td className="px-6 py-2 whitespace-nowrap text-right text-sm font-medium">
                      <div className="inline-flex items-center gap-2">
                        <button onClick={() => router.push(`/settings/users/${user.id}/view`)} aria-label="Visualizza" title="Visualizza" className="h-8 w-8 inline-flex items-center justify-center rounded-lg bg-gray-900 text-white hover:bg-gray-800 hover:shadow-lg transition-colors">
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.477 0 8.268 2.943 9.542 7-1.274 4.057-5.065 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
                        </button>
                        <button onClick={() => router.push(`/settings/users/${user.id}`)} aria-label="Modifica" title="Modifica" className="h-8 w-8 inline-flex items-center justify-center rounded-lg bg-gray-900 text-white hover:bg-gray-800 hover:shadow-lg transition-colors">
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15.232 5.232l3.536 3.536M4 20h4l10.293-10.293a1 1 0 000-1.414l-2.586-2.586a1 1 0 00-1.414 0L4 16v4z" /></svg>
                        </button>
                        {(session?.user?.role === "SUPER_ADMIN" || session?.user?.role === "ADMIN") && (
                          <>
                            <button onClick={isArchiveDisabled(user.id) ? undefined : () => handleArchive(user.id)} disabled={isArchiveDisabled(user.id)} aria-label="Archivia" title={isArchiveDisabled(user.id) ? "Non puoi archiviare il tuo stesso utente" : "Archivia"} className={`h-8 w-8 inline-flex items-center justify-center rounded-lg ${isArchiveDisabled(user.id) ? 'bg-gray-400 text-white opacity-50 cursor-not-allowed' : 'bg-gray-900 text-white hover:bg-gray-800 hover:shadow-lg'} transition-colors`}>
                              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M20 7H4l2-2h12l2 2zM4 7v10a2 2 0 002 2h12a2 2 0 002-2V7M9 12h6" /></svg>
                            </button>
                            <button 
                              onClick={user.hasAssignments ? undefined : () => handleDelete(user.id)} 
                              disabled={user.hasAssignments}
                              aria-label="Elimina" 
                              title={user.hasAssignments ? `Impossibile eliminare: l'utente è associato a ${user.assignmentsCount || 0} turno/i o giornata/e. È possibile solo archiviare l'utente.` : "Elimina"} 
                              className={`h-8 w-8 inline-flex items-center justify-center rounded-lg transition-colors ${
                                user.hasAssignments 
                                  ? 'bg-gray-400 text-white opacity-50 cursor-not-allowed' 
                                  : 'bg-red-600 text-white hover:bg-red-700 hover:shadow-lg'
                              }`}
                            >
                              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6M9 7h6m-1-2H10l1-1h2l1 1z" /></svg>
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <ConfirmDialog
          isOpen={showConfirmDialog}
          title="Conferma"
          message={
            pendingToggle
              ? pendingToggle.isActive
                ? "Sei sicuro di voler disattivare questo utente?"
                : "Sei sicuro di voler attivare questo utente?"
              : ""
          }
          onConfirm={confirmToggle}
          onCancel={cancelToggle}
        />

        <ConfirmDialog
          isOpen={showArchiveDialog}
          title="Conferma Operazione"
          message="Sei sicuro di voler archiviare questo utente?"
          onConfirm={confirmArchive}
          onCancel={cancelArchive}
        />

        <ConfirmDialog
          isOpen={showDeleteDialog}
          title="Conferma Eliminazione"
          message="Sei sicuro di voler eliminare questo utente? Questa azione non può essere annullata."
          onConfirm={confirmDelete}
          onCancel={cancelDelete}
        />
      </div>
    </DashboardShell>
  );
}
