"use client";

import { useState, useEffect } from "react";
import { useRouter, useParams } from "next/navigation";
import DashboardShell from "@/components/DashboardShell";

export default function ViewCompanyPage() {
  const router = useRouter();
  const params = useParams();
  const id = params?.id as string;

  const [formData, setFormData] = useState({
    ragioneSociale: "",
    address: "",
    city: "",
    province: "",
    postalCode: "",
    partitaIva: "",
    codiceFiscale: "",
    codiceSDI: "",
    email: "",
    pec: "",
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    fetchCompany();
  }, [id]);

  const fetchCompany = async () => {
    try {
      const res = await fetch(`/api/companies/${id}`);
      if (res.ok) {
        const data = await res.json();
        setFormData({
          ragioneSociale: data.ragioneSociale || "",
          address: data.address || "",
          city: data.city || "",
          province: data.province || "",
          postalCode: data.postalCode || "",
          partitaIva: data.partitaIva || "",
          codiceFiscale: data.codiceFiscale || "",
          codiceSDI: data.codiceSDI || "",
          email: data.email || "",
          pec: data.pec || "",
        });
      }
    } catch (error) {
      console.error("Error fetching company:", error);
      setError("Errore nel caricamento dell'azienda");
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
          <h1 className="text-3xl font-bold">Dettagli Azienda</h1>
        </div>

        <form className="max-w-2xl space-y-4">
          <div>
            <label
              htmlFor="ragioneSociale"
              className="block text-sm font-medium text-gray-700 mb-2"
            >
              Ragione Sociale *
            </label>
            <input
              id="ragioneSociale"
              name="ragioneSociale"
              type="text"
              value={formData.ragioneSociale}
              readOnly
              className="w-full px-4 py-2 border border-gray-300 rounded-lg bg-gray-100 text-gray-700 cursor-not-allowed"
            />
          </div>

          <div>
            <label
              htmlFor="address"
              className="block text-sm font-medium text-gray-700 mb-2"
            >
              Indirizzo *
            </label>
            <input
              id="address"
              name="address"
              type="text"
              value={formData.address}
              readOnly
              className="w-full px-4 py-2 border border-gray-300 rounded-lg bg-gray-100 text-gray-700 cursor-not-allowed"
            />
          </div>

          <div>
            <label
              htmlFor="city"
              className="block text-sm font-medium text-gray-700 mb-2"
            >
              Città *
            </label>
            <input
              id="city"
              name="city"
              type="text"
              value={formData.city}
              readOnly
              className="w-full px-4 py-2 border border-gray-300 rounded-lg bg-gray-100 text-gray-700 cursor-not-allowed"
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label
                htmlFor="province"
                className="block text-sm font-medium text-gray-700 mb-2"
              >
                Provincia *
              </label>
              <input
                id="province"
                name="province"
                type="text"
                value={formData.province}
                readOnly
                className="w-full px-4 py-2 border border-gray-300 rounded-lg bg-gray-100 text-gray-700 cursor-not-allowed uppercase"
              />
            </div>

            <div>
              <label
                htmlFor="postalCode"
                className="block text-sm font-medium text-gray-700 mb-2"
              >
                CAP *
              </label>
              <input
                id="postalCode"
                name="postalCode"
                type="text"
                value={formData.postalCode}
                readOnly
                className="w-full px-4 py-2 border border-gray-300 rounded-lg bg-gray-100 text-gray-700 cursor-not-allowed"
              />
            </div>
          </div>

          <div>
            <label
              htmlFor="partitaIva"
              className="block text-sm font-medium text-gray-700 mb-2"
            >
              Partita IVA *
            </label>
            <input
              id="partitaIva"
              name="partitaIva"
              type="text"
              value={formData.partitaIva}
              readOnly
              className="w-full px-4 py-2 border border-gray-300 rounded-lg bg-gray-100 text-gray-700 cursor-not-allowed"
            />
          </div>

          <div>
            <label
              htmlFor="codiceFiscale"
              className="block text-sm font-medium text-gray-700 mb-2"
            >
              Codice Fiscale *
            </label>
            <input
              id="codiceFiscale"
              name="codiceFiscale"
              type="text"
              value={formData.codiceFiscale}
              readOnly
              className="w-full px-4 py-2 border border-gray-300 rounded-lg bg-gray-100 text-gray-700 cursor-not-allowed"
            />
          </div>

          <div>
            <label
              htmlFor="codiceSDI"
              className="block text-sm font-medium text-gray-700 mb-2"
            >
              Codice SDI *
            </label>
            <input
              id="codiceSDI"
              name="codiceSDI"
              type="text"
              value={formData.codiceSDI}
              readOnly
              className="w-full px-4 py-2 border border-gray-300 rounded-lg bg-gray-100 text-gray-700 cursor-not-allowed uppercase"
            />
          </div>

          <div>
            <label
              htmlFor="email"
              className="block text-sm font-medium text-gray-700 mb-2"
            >
              Email *
            </label>
            <input
              id="email"
              name="email"
              type="email"
              value={formData.email}
              readOnly
              className="w-full px-4 py-2 border border-gray-300 rounded-lg bg-gray-100 text-gray-700 cursor-not-allowed"
            />
          </div>

          <div>
            <label
              htmlFor="pec"
              className="block text-sm font-medium text-gray-700 mb-2"
            >
              PEC
            </label>
            <input
              id="pec"
              name="pec"
              type="email"
              value={formData.pec}
              readOnly
              className="w-full px-4 py-2 border border-gray-300 rounded-lg bg-gray-100 text-gray-700 cursor-not-allowed"
            />
          </div>

          {error && (
            <div className="text-red-600 text-sm">{error}</div>
          )}

          <div className="flex gap-4 pt-4">
            <button
              type="button"
              onClick={() => router.push(`/settings/companies/${id}`)}
              className="px-4 py-2 bg-gray-900 text-white rounded-lg hover:bg-gray-800 hover:shadow-lg hover:scale-105 active:scale-100 transition-all duration-200 cursor-pointer"
            >
              Modifica
            </button>
          </div>
        </form>
      </div>
    </DashboardShell>
  );
}


