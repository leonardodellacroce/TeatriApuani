"use client";

import { useState, useEffect } from "react";
import { useRouter, useParams } from "next/navigation";
import DashboardShell from "@/components/DashboardShell";
import PageSkeleton from "@/components/PageSkeleton";
import ConfirmEditDialog from "@/components/ConfirmEditDialog";

export default function EditCompanyPage() {
  const router = useRouter();
  const params = useParams();
  const id = params?.id as string;

  const [originalData, setOriginalData] = useState<Record<string, any>>({});
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
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [fieldError, setFieldError] = useState<string>("");
  const [invalidFields, setInvalidFields] = useState<Set<string>>(new Set());
  const [fieldErrors, setFieldErrors] = useState<Map<string, string>>(new Map());
  const [touchedFields, setTouchedFields] = useState<Set<string>>(new Set());
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);

  const fieldLabels: Record<string, string> = {
    ragioneSociale: "Ragione Sociale",
    address: "Indirizzo",
    city: "Città",
    province: "Provincia",
    postalCode: "CAP",
    partitaIva: "Partita IVA",
    codiceFiscale: "Codice Fiscale",
    codiceSDI: "Codice SDI",
    email: "Email",
    pec: "PEC",
  };

  useEffect(() => {
    fetchCompany();
  }, [id]);

  const fetchCompany = async () => {
    try {
      const res = await fetch(`/api/companies/${id}`);
      if (res.ok) {
        const data = await res.json();
        const initialData = {
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
        };
        setFormData(initialData);
        setOriginalData(initialData);
      }
    } catch (error) {
      console.error("Error fetching company:", error);
    } finally {
      setLoading(false);
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

    // Partita IVA: esattamente 11 numeri
    if (name === "partitaIva") {
      if (value.length > 0 && value.length !== 11) {
        newInvalidFields.add("partitaIva");
        newFieldErrors.set("partitaIva", "La partita IVA deve essere esattamente 11 numeri");
      } else {
        newInvalidFields.delete("partitaIva");
        newFieldErrors.delete("partitaIva");
      }
    }

    // Codice Fiscale: esattamente 11 numeri
    if (name === "codiceFiscale") {
      if (value.length > 0 && value.length !== 11) {
        newInvalidFields.add("codiceFiscale");
        newFieldErrors.set("codiceFiscale", "Il codice fiscale deve essere esattamente 11 numeri");
      } else {
        newInvalidFields.delete("codiceFiscale");
        newFieldErrors.delete("codiceFiscale");
      }
    }

    // Codice SDI: esattamente 7 cifre
    if (name === "codiceSDI") {
      if (value.length > 0 && value.length !== 7) {
        newInvalidFields.add("codiceSDI");
        newFieldErrors.set("codiceSDI", "Il codice SDI deve essere esattamente 7 cifre");
      } else {
        newInvalidFields.delete("codiceSDI");
        newFieldErrors.delete("codiceSDI");
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

    // Email: deve contenere @ esattamente una volta
    if (name === "email") {
      if (value.length > 0 && !/^[^@]+@[^@]+$/.test(value)) {
        newInvalidFields.add("email");
        newFieldErrors.set("email", "Inserire un indirizzo email valido");
      } else {
        newInvalidFields.delete("email");
        newFieldErrors.delete("email");
      }
    }

    // PEC: deve contenere @ esattamente una volta
    if (name === "pec") {
      if (value.length > 0 && !/^[^@]+@[^@]+$/.test(value)) {
        newInvalidFields.add("pec");
        newFieldErrors.set("pec", "Inserire un indirizzo PEC valido");
      } else {
        newInvalidFields.delete("pec");
        newFieldErrors.delete("pec");
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

    // Partita IVA: solo numeri
    if (name === "partitaIva" && value.length > 0) {
      if (!/^\d*$/.test(value)) {
        setFieldError("Carattere non permesso: solo numeri");
        return false;
      }
    }

    // Codice Fiscale: solo numeri
    if (name === "codiceFiscale" && value.length > 0) {
      if (!/^\d*$/.test(value)) {
        setFieldError("Carattere non permesso: solo numeri");
        return false;
      }
    }

    // Codice SDI: solo lettere maiuscole e numeri, max 7 caratteri
    if (name === "codiceSDI" && value.length > 0) {
      if (!/^[A-Z0-9]*$/.test(value)) {
        setFieldError("Carattere non permesso: solo lettere maiuscole e numeri");
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

    // Email: deve contenere @ esattamente una volta
    if (formData.email && !/^[^@]+@[^@]+$/.test(formData.email)) {
      setError("L'email deve contenere esattamente un simbolo @");
      return false;
    }

    // PEC: deve contenere @ esattamente una volta
    if (formData.pec && !/^[^@]+@[^@]+$/.test(formData.pec)) {
      setError("La PEC deve contenere esattamente un simbolo @");
      return false;
    }

    // Partita IVA: 11 numeri
    if (formData.partitaIva && !/^\d{11}$/.test(formData.partitaIva)) {
      setError("La partita IVA deve essere esattamente 11 numeri");
      return false;
    }

    // Codice Fiscale: 11 numeri
    if (formData.codiceFiscale && !/^\d{11}$/.test(formData.codiceFiscale)) {
      setError("Il codice fiscale deve essere esattamente 11 numeri");
      return false;
    }

    // Codice SDI: esattamente 7 caratteri (lettere maiuscole e numeri)
    if (formData.codiceSDI && formData.codiceSDI.length > 0 && formData.codiceSDI.length !== 7) {
      setError("Il codice SDI deve essere esattamente 7 caratteri");
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
    setSaving(true);

    try {
      const res = await fetch(`/api/companies/${id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(formData),
      });

      if (res.ok) {
        router.push("/settings/companies");
      } else {
        const data = await res.json();
        setError(data.error || data.details || "Errore durante l'aggiornamento");
      }
    } catch (error) {
      console.error("Error updating company:", error);
      setError("Errore durante l'aggiornamento");
    } finally {
      setSaving(false);
    }
  };

  const cancelSave = () => {
    setShowConfirmDialog(false);
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;

    // Auto-maiuscolo per provincia e codice SDI durante la digitazione
    let processedValue = value;
    if (name === "province" || name === "codiceSDI") {
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

  const handleBlur = (e: React.FocusEvent<HTMLInputElement>) => {
    const { name } = e.target;
    setTouchedFields((prev) => new Set(prev).add(name));
  };

  if (loading) {
    return <PageSkeleton />;
  }

  return (
    <DashboardShell>
      <div>
        <div className="flex items-center gap-3 mb-6">
          <button
            onClick={() => router.push("/settings/companies")}
            aria-label="Indietro"
            title="Indietro"
            className="h-10 w-10 inline-flex items-center justify-center rounded-lg bg-gray-900 text-white hover:bg-gray-800 hover:shadow-lg transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <h1 className="text-3xl font-bold">Modifica Azienda</h1>
        </div>

        <div className="bg-white rounded-lg shadow p-6 border border-gray-200 mb-6 max-w-xl">
        <form onSubmit={handleSubmit} className="space-y-4">
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
              onChange={handleChange}
              required
              className="w-full px-4 py-2 h-10 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-gray-500 focus:border-transparent"
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

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
                onChange={handleChange}
                onBlur={handleBlur}
                maxLength={11}
                required
                className={`w-full px-4 py-2 h-10 border rounded-lg text-sm focus:ring-2 focus:ring-gray-500 focus:border-transparent ${
                  invalidFields.has("partitaIva") ? "border-red-500" : "border-gray-300"
                }`}
              />
              {touchedFields.has("partitaIva") && invalidFields.has("partitaIva") && (
                <p className="text-red-600 text-sm mt-1">{fieldErrors.get("partitaIva")}</p>
              )}
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
                onChange={handleChange}
                onBlur={handleBlur}
                maxLength={11}
                required
                className={`w-full px-4 py-2 h-10 border rounded-lg text-sm focus:ring-2 focus:ring-gray-500 focus:border-transparent ${
                  invalidFields.has("codiceFiscale") ? "border-red-500" : "border-gray-300"
                }`}
              />
              {touchedFields.has("codiceFiscale") && invalidFields.has("codiceFiscale") && (
                <p className="text-red-600 text-sm mt-1">{fieldErrors.get("codiceFiscale")}</p>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
                onChange={handleChange}
                onBlur={handleBlur}
                maxLength={7}
                required
                className={`w-full px-4 py-2 h-10 border rounded-lg text-sm focus:ring-2 focus:ring-gray-500 focus:border-transparent ${
                  invalidFields.has("codiceSDI") ? "border-red-500" : "border-gray-300"
                }`}
              />
              {touchedFields.has("codiceSDI") && invalidFields.has("codiceSDI") && (
                <p className="text-red-600 text-sm mt-1">{fieldErrors.get("codiceSDI")}</p>
              )}
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
                onChange={handleChange}
                onBlur={handleBlur}
                required
                className={`w-full px-4 py-2 h-10 border rounded-lg text-sm focus:ring-2 focus:ring-gray-500 focus:border-transparent ${
                  invalidFields.has("email") ? "border-red-500" : "border-gray-300"
                }`}
              />
              {touchedFields.has("email") && invalidFields.has("email") && (
                <p className="text-red-600 text-sm mt-1">{fieldErrors.get("email")}</p>
              )}
            </div>
          </div>

          <div>
            <label
              htmlFor="pec"
              className="block text-sm font-medium text-gray-700 mb-2"
            >
              PEC *
            </label>
            <input
              id="pec"
              name="pec"
              type="email"
              value={formData.pec}
              onChange={handleChange}
              onBlur={handleBlur}
              required
              className={`w-full px-4 py-2 h-10 border rounded-lg text-sm focus:ring-2 focus:ring-gray-500 focus:border-transparent ${
                invalidFields.has("pec") ? "border-red-500" : "border-gray-300"
              }`}
            />
            {touchedFields.has("pec") && invalidFields.has("pec") && (
              <p className="text-red-600 text-sm mt-1">{fieldErrors.get("pec")}</p>
            )}
          </div>

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
              disabled={saving}
              className="px-4 py-2 bg-gray-900 text-white rounded-lg hover:bg-gray-800 hover:shadow-lg hover:scale-105 active:scale-100 transition-all duration-200 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-gray-900 disabled:hover:shadow-none"
            >
              {saving ? "Salvataggio..." : "Salva"}
            </button>
            <button
              type="button"
              onClick={() => router.back()}
              className="px-4 py-2 h-10 border border-gray-300 rounded-lg text-sm hover:bg-gray-50 hover:border-gray-400 hover:shadow-md hover:scale-105 active:scale-100 transition-all duration-200 cursor-pointer"
            >
              Annulla
            </button>
          </div>
        </form>
        </div>

        <ConfirmEditDialog
          isOpen={showConfirmDialog}
          title="Conferma Modifiche Azienda"
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

