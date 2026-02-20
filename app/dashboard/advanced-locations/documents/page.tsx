"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import DashboardShell from "@/components/DashboardShell";
import { Plus, FileText, Eye, Trash2 } from "lucide-react";

interface DocInstance {
  id: string;
  templateId: string;
  title: string;
  status: string;
  createdById: string;
  createdAt: string;
  updatedAt: string;
  signedAt: string | null;
  signedBy: string | null;
}

export default function DocumentInstancesPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [instances, setInstances] = useState<DocInstance[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (status === "loading") return;

    if (!session?.user) {
      router.push("/dashboard");
      return;
    }

    fetchInstances();
  }, [session, status, router]);

  const fetchInstances = async () => {
    try {
      const res = await fetch("/api/docs/instances");
      if (res.ok) {
        const data = await res.json();
        setInstances(data);
      }
    } catch (error) {
      console.error("Error fetching instances:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Sei sicuro di voler eliminare questa istanza?")) {
      return;
    }

    try {
      const res = await fetch(`/api/docs/instances/${id}`, {
        method: "DELETE",
      });

      if (res.ok) {
        fetchInstances();
      } else {
        alert("Errore durante l'eliminazione");
      }
    } catch (error) {
      console.error("Error deleting instance:", error);
      alert("Errore durante l'eliminazione");
    }
  };

  if (status === "loading" || loading) {
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
      <div className="mb-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button
              onClick={() => router.push("/dashboard/advanced-locations")}
              aria-label="Indietro"
              title="Indietro"
              className="h-10 w-10 inline-flex items-center justify-center rounded-lg bg-gray-900 text-white hover:bg-gray-800 hover:shadow-lg transition-colors"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Documenti</h1>
              <p className="text-gray-600 mt-1">Gestisci le istanze dei documenti</p>
            </div>
          </div>
        </div>
      </div>

      {/* Tabella istanze */}
      <div className="bg-white rounded-lg shadow-md overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Titolo
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Stato
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Creato il
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Firmato il
              </th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                Azioni
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {instances.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-6 py-8 text-center text-gray-500">
                  Nessun documento trovato
                </td>
              </tr>
            ) : (
              instances.map((instance) => (
                <tr key={instance.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center">
                      <FileText className="w-5 h-5 text-gray-400 mr-3" />
                      <div className="text-sm font-medium text-gray-900">
                        {instance.title}
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span
                      className={`px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full ${
                        instance.status === "DRAFT"
                          ? "bg-yellow-100 text-yellow-800"
                          : instance.status === "SIGNED"
                          ? "bg-green-100 text-green-800"
                          : "bg-gray-100 text-gray-800"
                      }`}
                    >
                      {instance.status}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {new Date(instance.createdAt).toLocaleDateString("it-IT")}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {instance.signedAt
                      ? new Date(instance.signedAt).toLocaleDateString("it-IT")
                      : "-"}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                    <div className="flex justify-end gap-2">
                      <button
                        onClick={() => router.push(`/dashboard/advanced-locations/documents/${instance.id}`)}
                        className="inline-flex items-center px-3 py-1.5 bg-gray-900 text-white rounded hover:bg-gray-800"
                        title="Visualizza"
                      >
                        <Eye size={16} className="mr-1" />
                        Apri
                      </button>
                      <button
                        onClick={() => handleDelete(instance.id)}
                        className="inline-flex items-center px-3 py-1.5 bg-red-600 text-white rounded hover:bg-red-700"
                        title="Elimina"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </DashboardShell>
  );
}

