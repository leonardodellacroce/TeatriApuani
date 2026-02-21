"use client";

import { useState, useEffect } from "react";
import { useRouter, useParams } from "next/navigation";
import DashboardShell from "@/components/DashboardShell";
import PageSkeleton from "@/components/PageSkeleton";

export default function ViewClientPage() {
  const router = useRouter();
  const params = useParams();
  const id = params?.id as string;

  const [clientType, setClientType] = useState<string>("");
  const [formData, setFormData] = useState({
    ragioneSociale: "",
    nome: "",
    cognome: "",
    address: "",
    city: "",
    province: "",
    postalCode: "",
    partitaIva: "",
    codiceFiscale: "",
    codiceSDI: "",
    codicePA: "",
    email: "",
    pec: "",
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [isArchived, setIsArchived] = useState(false);

  useEffect(() => {
    fetchClient();
  }, [id]);

  const fetchClient = async () => {
    try {
      const res = await fetch(`/api/clients/${id}`);
      if (res.ok) {
        const data = await res.json();
        setClientType(data.type || "");
        setFormData({
          ragioneSociale: data.ragioneSociale || "",
          nome: data.nome || "",
          cognome: data.cognome || "",
          address: data.address || "",
          city: data.city || "",
          province: data.province || "",
          postalCode: data.postalCode || "",
          partitaIva: data.partitaIva || "",
          codiceFiscale: data.codiceFiscale || "",
          codiceSDI: data.codiceSDI || "",
          codicePA: data.codicePA || "",
          email: data.email || "",
          pec: data.pec || "",
        });
        setIsArchived(data.isArchived || false);
      }
    } catch (error) {
      console.error("Error fetching client:", error);
      setError("Errore nel caricamento del cliente");
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return <PageSkeleton />;
  }

  const getClientTypeLabel = () => {
    switch (clientType) {
      case "AZIENDA":
        return "Azienda";
      case "PA":
        return "Pubblica Amministrazione";
      case "PRIVATO":
        return "Privato";
      default:
        return clientType;
    }
  };

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
          <h1 className="text-3xl font-bold">Dettagli Cliente</h1>
        </div>

        <form className="max-w-2xl space-y-4">
          <div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Categoria Cliente
            </label>
            <input
              type="text"
              value={getClientTypeLabel()}
              readOnly
              className="w-full px-4 py-2 border border-blue-300 rounded-lg bg-white text-gray-700 cursor-not-allowed font-semibold"
            />
          </div>

          {/* Ragione Sociale per Azienda e PA */}
          {(clientType === "AZIENDA" || clientType === "PA") && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Ragione Sociale *
              </label>
              <input
                type="text"
                value={formData.ragioneSociale}
                readOnly
                className="w-full px-4 py-2 border border-gray-300 rounded-lg bg-gray-100 text-gray-700 cursor-not-allowed"
              />
            </div>
          )}

          {/* Nome e Cognome per Privati */}
          {clientType === "PRIVATO" && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Nome *
                </label>
                <input
                  type="text"
                  value={formData.nome}
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
                  value={formData.cognome}
                  readOnly
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg bg-gray-100 text-gray-700 cursor-not-allowed"
                />
              </div>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Indirizzo *
            </label>
            <input
              type="text"
              value={formData.address}
              readOnly
              className="w-full px-4 py-2 border border-gray-300 rounded-lg bg-gray-100 text-gray-700 cursor-not-allowed"
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Città *
              </label>
              <input
                type="text"
                value={formData.city}
                readOnly
                className="w-full px-4 py-2 border border-gray-300 rounded-lg bg-gray-100 text-gray-700 cursor-not-allowed"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Provincia *
              </label>
              <input
                type="text"
                value={formData.province}
                readOnly
                className="w-full px-4 py-2 border border-gray-300 rounded-lg bg-gray-100 text-gray-700 cursor-not-allowed uppercase"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                CAP *
              </label>
              <input
                type="text"
                value={formData.postalCode}
                readOnly
                className="w-full px-4 py-2 border border-gray-300 rounded-lg bg-gray-100 text-gray-700 cursor-not-allowed"
              />
            </div>
          </div>

          {/* Partita IVA per Azienda e PA */}
          {(clientType === "AZIENDA" || clientType === "PA") && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Partita IVA *
              </label>
              <input
                type="text"
                value={formData.partitaIva}
                readOnly
                className="w-full px-4 py-2 border border-gray-300 rounded-lg bg-gray-100 text-gray-700 cursor-not-allowed"
              />
            </div>
          )}

          {/* Codice Fiscale */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Codice Fiscale *
            </label>
            <input
              type="text"
              value={formData.codiceFiscale}
              readOnly
              className="w-full px-4 py-2 border border-gray-300 rounded-lg bg-gray-100 text-gray-700 cursor-not-allowed uppercase"
            />
          </div>

          {/* Codice SDI per Aziende */}
          {clientType === "AZIENDA" && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Codice SDI *
              </label>
              <input
                type="text"
                value={formData.codiceSDI}
                readOnly
                className="w-full px-4 py-2 border border-gray-300 rounded-lg bg-gray-100 text-gray-700 cursor-not-allowed uppercase"
              />
            </div>
          )}

          {/* Codice PA per Pubblica Amministrazione */}
          {clientType === "PA" && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Codice PA *
              </label>
              <input
                type="text"
                value={formData.codicePA}
                readOnly
                className="w-full px-4 py-2 border border-gray-300 rounded-lg bg-gray-100 text-gray-700 cursor-not-allowed uppercase"
              />
            </div>
          )}

          {/* Email - obbligatoria solo per Aziende */}
          {(clientType === "AZIENDA" || formData.email) && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Email {clientType === "AZIENDA" ? "*" : ""}
              </label>
              <input
                type="email"
                value={formData.email}
                readOnly
                className="w-full px-4 py-2 border border-gray-300 rounded-lg bg-gray-100 text-gray-700 cursor-not-allowed"
              />
            </div>
          )}

          {/* PEC - opzionale per tutti */}
          {formData.pec && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                PEC
              </label>
              <input
                type="email"
                value={formData.pec}
                readOnly
                className="w-full px-4 py-2 border border-gray-300 rounded-lg bg-gray-100 text-gray-700 cursor-not-allowed"
              />
            </div>
          )}

          {error && (
            <div className="text-red-600 text-sm">{error}</div>
          )}

          <div className="flex gap-4 pt-4">
            {!isArchived && (
              <button
                type="button"
                onClick={() => router.push(`/settings/clients/${id}`)}
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


