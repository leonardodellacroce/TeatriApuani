"use client";

import { useState, useEffect } from "react";
import { useRouter, useParams } from "next/navigation";
import DashboardShell from "@/components/DashboardShell";
import PageSkeleton from "@/components/PageSkeleton";
import ColorSelector from "@/components/ColorSelector";

export default function ViewLocationPage() {
  const router = useRouter();
  const params = useParams();
  const id = params.id as string;

  const [formData, setFormData] = useState({
    name: "",
    address: "",
    city: "",
    province: "",
    postalCode: "",
    color: null as string | null,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [isArchived, setIsArchived] = useState(false);

  useEffect(() => {
    fetchLocation();
  }, [id]);

  const fetchLocation = async () => {
    try {
      const res = await fetch(`/api/locations/${id}`);
      if (res.ok) {
        const data = await res.json();
        setFormData({
          name: data.name || "",
          address: data.address || "",
          city: data.city || "",
          province: data.province || "",
          postalCode: data.postalCode || "",
          color: data.color || null,
        });
        setIsArchived(data.isArchived || false);
      }
    } catch (error) {
      console.error("Error fetching location:", error);
      setError("Errore nel caricamento della location");
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return <PageSkeleton />;
  }

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
          <h1 className="text-3xl font-bold">Dettagli Location</h1>
        </div>

        <form className="max-w-2xl space-y-4">
          <div>
            <label
              htmlFor="name"
              className="block text-sm font-medium text-gray-700 mb-2"
            >
              Nome Location *
            </label>
            <input
              id="name"
              name="name"
              type="text"
              value={formData.name}
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

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
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

          <div className="space-y-4 p-4 border border-gray-300 rounded-lg bg-gray-50">
            <h3 className="text-lg font-semibold text-gray-800">Colore Location</h3>
            <div className="flex flex-wrap gap-2">
              {formData.color && (
                <div className="w-16 h-16 rounded-full border-2 border-gray-400" style={{ backgroundColor: formData.color }}>
                </div>
              )}
              {!formData.color && (
                <p className="text-gray-500">Nessun colore selezionato</p>
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
                onClick={() => router.push(`/settings/locations/${id}`)}
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


