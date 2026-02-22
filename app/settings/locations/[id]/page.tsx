"use client";

import { useState, useEffect } from "react";
import { useRouter, useParams } from "next/navigation";
import DashboardShell from "@/components/DashboardShell";
import PageSkeleton from "@/components/PageSkeleton";
import ColorSelector from "@/components/ColorSelector";
import ConfirmEditDialog from "@/components/ConfirmEditDialog";

export default function EditLocationPage() {
  const router = useRouter();
  const params = useParams();
  const id = params.id as string;

  const [originalData, setOriginalData] = useState<Record<string, any>>({});
  const [formData, setFormData] = useState({
    name: "",
    address: "",
    city: "",
    province: "",
    postalCode: "",
    color: null as string | null,
  });
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(true);
  const [error, setError] = useState("");
  const [fieldError, setFieldError] = useState<string>("");
  const [invalidFields, setInvalidFields] = useState<Set<string>>(new Set());
  const [fieldErrors, setFieldErrors] = useState<Map<string, string>>(new Map());
  const [touchedFields, setTouchedFields] = useState<Set<string>>(new Set());
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [nameUniqueError, setNameUniqueError] = useState<string>("");

  const fieldLabels: Record<string, string> = {
    name: "Nome",
    address: "Indirizzo",
    city: "Città",
    province: "Provincia",
    postalCode: "CAP",
    color: "Colore",
  };

  useEffect(() => {
    fetchLocation();
  }, [id]);

  const fetchLocation = async () => {
    try {
      const res = await fetch(`/api/locations/${id}`);
      if (res.ok) {
        const data = await res.json();
        const initialData = {
          name: data.name || "",
          address: data.address || "",
          city: data.city || "",
          province: data.province || "",
          postalCode: data.postalCode || "",
          color: data.color || null,
        };
        setFormData(initialData);
        setOriginalData(initialData);
      }
    } catch (error) {
      console.error("Error fetching location:", error);
      setError("Errore nel caricamento della location");
    } finally {
      setFetching(false);
    }
  };

  const validateFieldLength = (name: string, value: string) => {
    const newInvalidFields = new Set(invalidFields);
    const newFieldErrors = new Map(fieldErrors);
    
    // CAP: esattamente 5 numeri
    if (name === "postalCode") {
      if (value.length > 0 && value.length < 5) {
        newInvalidFields.add("postalCode");
        newFieldErrors.set("postalCode", "Il CAP deve essere esattamente 5 numeri");
      } else {
        newInvalidFields.delete("postalCode");
        newFieldErrors.delete("postalCode");
      }
    }

    // Provincia: 2 lettere maiuscole
    if (name === "province") {
      if (value.length > 0 && !/^[A-Z]{2}$/.test(value)) {
        newInvalidFields.add("province");
        newFieldErrors.set("province", "La provincia deve essere esattamente 2 lettere maiuscole");
      } else {
        newInvalidFields.delete("province");
        newFieldErrors.delete("province");
      }
    }

    setInvalidFields(newInvalidFields);
    setFieldErrors(newFieldErrors);
  };

  const validateField = (name: string, value: string): boolean => {
    // Provincia: solo lettere maiuscole, max 2 caratteri
    if (name === "province" && value.length > 0) {
      if (!/^[A-Z]*$/.test(value)) {
        setFieldError("Carattere non permesso: solo lettere");
        return false;
      }
    }

    // CAP: solo numeri
    if (name === "postalCode" && value.length > 0) {
      if (!/^\d*$/.test(value)) {
        setFieldError("Carattere non permesso: solo numeri");
        return false;
      }
    }

    setFieldError("");
    return true;
  };

  const validate = () => {
    // Provincia: 2 lettere maiuscole
    if (formData.province && !/^[A-Z]{2}$/.test(formData.province)) {
      setError("La provincia deve essere esattamente 2 lettere maiuscole");
      return false;
    }

    // CAP: esattamente 5 numeri
    if (formData.postalCode && !/^\d{5}$/.test(formData.postalCode)) {
      setError("Il CAP deve essere esattamente 5 numeri");
      return false;
    }

    return true;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    // Verifica se ci sono campi con errori
    if (invalidFields.size > 0) {
      setError("Correggi gli errori nei campi evidenziati prima di salvare");
      return;
    }

    if (!validate()) {
      return;
    }

    // Mostra il dialog di conferma
    setShowConfirmDialog(true);
  };

  const confirmSave = async () => {
    setShowConfirmDialog(false);
    setLoading(true);

    try {
      const res = await fetch(`/api/locations/${id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(formData),
      });

      if (res.ok) {
        router.push("/settings/locations");
      } else {
        const data = await res.json();
        setError(data.error || "Errore durante la modifica");
      }
    } catch (error) {
      console.error("Error updating location:", error);
      setError("Errore durante la modifica");
    } finally {
      setLoading(false);
    }
  };

  const cancelSave = () => {
    setShowConfirmDialog(false);
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;

    // Auto-maiuscolo per provincia durante la digitazione
    let processedValue = value;
    if (name === "province") {
      processedValue = value.toUpperCase();
    }

    // Validazione in tempo reale
    if (!validateField(name, processedValue)) {
      return;
    }

    setFormData({
      ...formData,
      [name]: processedValue,
    });
    validateFieldLength(name, processedValue);
  };

  // Validate uniqueness name+city as user types (exclude current id)
  useEffect(() => {
    const controller = new AbortController();
    const run = async () => {
      const name = formData.name?.trim();
      const city = formData.city?.trim();
      if (!name || !city) {
        setNameUniqueError("");
        setInvalidFields((prev) => { const n = new Set(prev); n.delete("name"); return n; });
        return;
      }
      try {
        const res = await fetch(`/api/locations?name=${encodeURIComponent(name)}&city=${encodeURIComponent(city)}&excludeId=${id}`, { signal: controller.signal });
        if (res.ok) {
          const data = await res.json();
          if (data.exists) {
            setNameUniqueError("Esiste già una location con questo nome in questa città");
            setInvalidFields((prev) => new Set(prev).add("name"));
          } else {
            setNameUniqueError("");
            setInvalidFields((prev) => { const n = new Set(prev); n.delete("name"); return n; });
          }
        }
      } catch {}
    };
    run();
    return () => controller.abort();
  }, [formData.name, formData.city, id]);

  const handleBlur = (e: React.FocusEvent<HTMLInputElement>) => {
    const { name } = e.target;
    setTouchedFields((prev) => new Set(prev).add(name));
  };

  if (fetching) {
    return <PageSkeleton />;
  }

  return (
    <DashboardShell>
      <div>
        <div className="flex items-center gap-3 mb-6">
          <button
            onClick={() => router.push("/settings/locations")}
            aria-label="Indietro"
            title="Indietro"
            className="h-10 w-10 inline-flex items-center justify-center rounded-lg bg-gray-900 text-white hover:bg-gray-800 hover:shadow-lg transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <h1 className="text-3xl font-bold">Modifica Location</h1>
        </div>

        <div className="bg-white rounded-lg shadow p-6 border border-gray-200 mb-6 max-w-xl">
        <form onSubmit={handleSubmit} className="space-y-4">
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
              onChange={handleChange}
              required
              className={`w-full px-4 py-2 h-10 border rounded-lg text-sm focus:ring-2 focus:ring-gray-500 focus:border-transparent ${invalidFields.has("name") ? 'border-red-500' : 'border-gray-300'}`}
            />
            {nameUniqueError && (
              <p className="text-red-600 text-sm mt-1">{nameUniqueError}</p>
            )}
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
              onChange={handleChange}
              required
              className="w-full px-4 py-2 h-10 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-gray-500 focus:border-transparent"
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
                onChange={handleChange}
                required
                className="w-full px-4 py-2 h-10 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-gray-500 focus:border-transparent"
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
                onChange={handleChange}
                onBlur={handleBlur}
                maxLength={2}
                required
                className={`w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-gray-500 focus:border-transparent uppercase ${
                  invalidFields.has("province") ? "border-red-500" : "border-gray-300"
                }`}
                placeholder="RM"
              />
              {touchedFields.has("province") && invalidFields.has("province") && (
                <p className="text-red-600 text-sm mt-1">{fieldErrors.get("province")}</p>
              )}
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
                onChange={handleChange}
                onBlur={handleBlur}
                maxLength={5}
                required
                className={`w-full px-4 py-2 h-10 border rounded-lg text-sm focus:ring-2 focus:ring-gray-500 focus:border-transparent ${
                  invalidFields.has("postalCode") ? "border-red-500" : "border-gray-300"
                }`}
              />
              {touchedFields.has("postalCode") && invalidFields.has("postalCode") && (
                <p className="text-red-600 text-sm mt-1">{fieldErrors.get("postalCode")}</p>
              )}
            </div>
          </div>

          <ColorSelector
            selectedColor={formData.color}
            onChange={(color) => setFormData({ ...formData, color })}
          />

          {fieldError && (
            <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded relative">
              {fieldError}
            </div>
          )}

          {error && (
            <div className="text-red-600 text-sm">{error}</div>
          )}

          <div className="flex gap-4 pt-4">
            <button
              type="submit"
              disabled={loading || invalidFields.size > 0}
              className="px-4 py-2 bg-gray-900 text-white rounded-lg hover:bg-gray-800 hover:shadow-lg hover:scale-105 active:scale-100 transition-all duration-200 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-gray-900 disabled:hover:shadow-none"
            >
              {loading ? "Salvataggio..." : "Salva Modifiche"}
            </button>
            <button
              type="button"
              onClick={() => router.push("/settings/locations")}
              className="px-4 py-2 h-10 border border-gray-300 rounded-lg text-sm hover:bg-gray-50 hover:border-gray-400 hover:shadow-md hover:scale-105 active:scale-100 transition-all duration-200 cursor-pointer"
            >
              Annulla
            </button>
          </div>
        </form>
        </div>

        <ConfirmEditDialog
          isOpen={showConfirmDialog}
          title="Conferma Modifiche Location"
          oldData={originalData}
          newData={formData}
          fieldLabels={fieldLabels}
          onConfirm={confirmSave}
          onCancel={cancelSave}
        />
      </div>
    </DashboardShell>
  );
}

