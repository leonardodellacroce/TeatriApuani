"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import DashboardShell from "@/components/DashboardShell";
import PageSkeleton from "@/components/PageSkeleton";
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
  isWorker: boolean;
  codiceFiscale: string | null;
  company: {
    id: string;
    ragioneSociale: string;
  } | null;
  createdAt: string;
  hasAssignments?: boolean;
  assignmentsCount?: number;
}

type SortField = "code" | "name";
type SortOrder = "asc" | "desc";

export default function UsersPage() {
  const router = useRouter();
  const { data: session } = useSession();
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [sortField, setSortField] = useState<SortField>("code");
  const [sortOrder, setSortOrder] = useState<SortOrder>("asc");
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [pendingToggle, setPendingToggle] = useState<{ id: string; isActive: boolean } | null>(null);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);
  const [showArchiveDialog, setShowArchiveDialog] = useState(false);
  const [pendingArchive, setPendingArchive] = useState<string | null>(null);

  useEffect(() => {
    fetchUsers();
  }, []);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortOrder(sortOrder === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortOrder("asc");
    }
  };

  const sortedUsers = [...users].sort((a, b) => {
    let aValue: any = a[sortField];
    let bValue: any = b[sortField];
    if (!aValue) aValue = "";
    if (!bValue) bValue = "";

    if (aValue < bValue) return sortOrder === "asc" ? -1 : 1;
    if (aValue > bValue) return sortOrder === "asc" ? 1 : -1;
    return 0;
  });

  const fetchUsers = async () => {
    try {
      const res = await fetch("/api/users");
      if (res.ok) {
        const data = await res.json();
        // Mostra solo utenti di gestione: SUPER_ADMIN, ADMIN, RESPONSABILE
        const managementUsers = data.filter((u: User) =>
          (u.isSuperAdmin || u.isAdmin || u.isResponsabile) && !u.isCoordinatore
        );
        setUsers(managementUsers);
      }
    } catch (error) {
      console.error("Error fetching users:", error);
    } finally {
      setLoading(false);
    }
  };

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
    } catch (error: any) {
      console.error("Error archiving user:", error);
      alert(error?.message || "Errore durante l'operazione");
    } finally {
      setShowArchiveDialog(false);
      setPendingArchive(null);
    }
  };

  const cancelArchive = () => {
    setShowArchiveDialog(false);
    setPendingArchive(null);
  };

  const isToggleDisabled = (target: User): { disabled: boolean; reason: string } => {
    if (!session?.user) return { disabled: false, reason: "" };
    // Confronta gli ID come stringhe per essere sicuri
    if (String(session.user.id) === String(target.id)) {
      return { disabled: true, reason: "Non puoi disattivare il tuo stesso utente" };
    }
    if (target.isSuperAdmin && session.user.role === "ADMIN") {
      return { disabled: true, reason: "Un Admin non può modificare un Super Admin" };
    }
    return { disabled: false, reason: "" };
  };

  const isArchiveDisabled = (target: User): boolean => {
    if (!session?.user) return false;
    // Confronta gli ID come stringhe per essere sicuri
    return String(session.user.id) === String(target.id);
  };

  if (loading) {
    return <PageSkeleton />;
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
            <h1 className="text-3xl font-bold">Utenti di Gestione</h1>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => router.push("/settings/management-users/archive")}
              className="px-4 py-2 rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50 hover:border-gray-400 hover:shadow-md hover:scale-105 active:scale-100 transition-all duration-200 cursor-pointer"
            >
              Archivio
            </button>
            <button
              onClick={() => router.push("/settings/management-users/new")}
              className="px-4 py-2 rounded-lg bg-gray-900 text-white hover:bg-gray-800 hover:shadow-lg hover:scale-105 active:scale-100 transition-all duration-200 cursor-pointer"
            >
              Nuovo Utente di Gestione
            </button>
          </div>
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
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Ruolo
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
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
                {sortedUsers.map((user) => {
                  const guard = isToggleDisabled(user);
                  return (
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
                        <div className="flex flex-col space-y-1">
                          {user.isSuperAdmin && <span className="text-red-600 font-medium">Super Admin</span>}
                          {user.isAdmin && <span className="text-blue-600 font-medium">Admin</span>}
                          {user.isResponsabile && <span className="text-green-600 font-medium">Responsabile</span>}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {user.company?.ragioneSociale || "-"}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm">
                        {guard.disabled ? (
                          <span
                            title={guard.reason}
                            className={`px-2 py-1 text-xs font-semibold rounded-full opacity-50 cursor-not-allowed ${
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
                          <button onClick={() => router.push(`/settings/management-users/${user.id}/view`)} aria-label="Visualizza" title="Visualizza" className="h-8 w-8 inline-flex items-center justify-center rounded-lg bg-gray-900 text-white hover:bg-gray-800 hover:shadow-lg transition-colors">
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.477 0 8.268 2.943 9.542 7-1.274 4.057-5.065 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
                          </button>
                          <button onClick={() => router.push(`/settings/management-users/${user.id}`)} aria-label="Modifica" title="Modifica" className="h-8 w-8 inline-flex items-center justify-center rounded-lg bg-gray-900 text-white hover:bg-gray-800 hover:shadow-lg transition-colors">
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15.232 5.232l3.536 3.536M4 20h4l10.293-10.293a1 1 0 000-1.414l-2.586-2.586a1 1 0 00-1.414 0L4 16v4z" /></svg>
                          </button>
                          <button onClick={isArchiveDisabled(user) ? undefined : () => handleArchive(user.id)} disabled={isArchiveDisabled(user)} aria-label="Archivia" title={isArchiveDisabled(user) ? "Non puoi archiviare il tuo stesso utente" : "Archivia"} className={`h-8 w-8 inline-flex items-center justify-center rounded-lg ${isArchiveDisabled(user) ? 'bg-gray-400 text-white opacity-50 cursor-not-allowed' : 'bg-gray-900 text-white hover:bg-gray-800 hover:shadow-lg'} transition-colors`}>
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
                        </div>
                      </td>
                    </tr>
                  );
                })}
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
          message="Sei sicuro di voler archiviare questo utente di gestione?"
          onConfirm={confirmArchive}
          onCancel={cancelArchive}
        />

        <ConfirmDialog
          isOpen={showDeleteDialog}
          title="Conferma Eliminazione"
          message="Sei sicuro di voler eliminare questo utente di gestione? Questa azione non può essere annullata."
          onConfirm={confirmDelete}
          onCancel={cancelDelete}
        />
      </div>
    </DashboardShell>
  );
}

