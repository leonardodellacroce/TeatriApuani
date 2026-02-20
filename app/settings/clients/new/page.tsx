"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import DashboardShell from "@/components/DashboardShell";

export default function NewClientPage() {
  const router = useRouter();
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
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [fieldError, setFieldError] = useState<string>("");
  const [invalidFields, setInvalidFields] = useState<Set<string>>(new Set());
  const [fieldErrors, setFieldErrors] = useState<Map<string, string>>(new Map());
  const [touchedFields, setTouchedFields] = useState<Set<string>>(new Set());

  const validateFieldLength = (name: string, value: string) => {
    const newInvalidFields = new Set(invalidFields);
    const newFieldErrors = new Map(fieldErrors);
    
    // CAP: esattamente 5 numeri
    if (name === "postalCode") {
      if (value.length > 0 && value.length !== 5) {
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

    // Codice Fiscale: 11 numeri per aziende e PA, 16 caratteri per privati
    if (name === "codiceFiscale") {
      if (clientType === "PRIVATO") {
        if (value.length > 0 && value.length !== 16) {
          newInvalidFields.add("codiceFiscale");
          newFieldErrors.set("codiceFiscale", "Il codice fiscale deve essere esattamente 16 caratteri");
        } else {
          newInvalidFields.delete("codiceFiscale");
          newFieldErrors.delete("codiceFiscale");
        }
      } else {
        if (value.length > 0 && value.length !== 11) {
          newInvalidFields.add("codiceFiscale");
          newFieldErrors.set("codiceFiscale", "Il codice fiscale deve essere esattamente 11 numeri");
        } else {
          newInvalidFields.delete("codiceFiscale");
          newFieldErrors.delete("codiceFiscale");
        }
      }
    }

    // Codice SDI: esattamente 7 cifre (solo se inserito)
    if (name === "codiceSDI") {
      if (value.length > 0 && value.length !== 7) {
        newInvalidFields.add("codiceSDI");
        newFieldErrors.set("codiceSDI", "Il codice SDI deve essere esattamente 7 cifre");
      } else {
        newInvalidFields.delete("codiceSDI");
        newFieldErrors.delete("codiceSDI");
      }
    }

    // Codice PA: esattamente 6 caratteri (lettere maiuscole e numeri)
    if (name === "codicePA") {
      if (value.length > 0 && value.length !== 6) {
        newInvalidFields.add("codicePA");
        newFieldErrors.set("codicePA", "Il codice PA deve essere esattamente 6 caratteri");
      } else {
        newInvalidFields.delete("codicePA");
        newFieldErrors.delete("codicePA");
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

    // Codice Fiscale: solo numeri per aziende e PA
    if (name === "codiceFiscale" && clientType !== "PRIVATO" && value.length > 0) {
      if (!/^\d*$/.test(value)) {
        setFieldError("Carattere non permesso: solo numeri");
        return false;
      }
    }

    // Codice Fiscale per privati: solo lettere maiuscole e numeri
    if (name === "codiceFiscale" && clientType === "PRIVATO" && value.length > 0) {
      if (!/^[A-Z0-9]*$/.test(value)) {
        setFieldError("Carattere non permesso: solo lettere maiuscole e numeri");
        return false;
      }
    }

    // Codice SDI: solo lettere maiuscole e numeri
    if (name === "codiceSDI" && value.length > 0) {
      if (!/^[A-Z0-9]*$/.test(value)) {
        setFieldError("Carattere non permesso: solo lettere maiuscole e numeri");
        return false;
      }
    }

    // Codice PA: solo lettere maiuscole e numeri
    if (name === "codicePA" && value.length > 0) {
      if (!/^[A-Z0-9]*$/.test(value)) {
        setFieldError("Carattere non permesso: solo lettere maiuscole e numeri");
        return false;
      }
    }

    setFieldError("");
    return true;
  };

  const validate = () => {
    if (!clientType) {
      setError("Seleziona un tipo cliente");
      return false;
    }

    if (clientType === "AZIENDA") {
      // Azienda: ragione sociale obbligatoria
      if (!formData.ragioneSociale || formData.ragioneSociale.trim() === "") {
        setError("La ragione sociale è obbligatoria");
        return false;
      }
      // Indirizzo obbligatorio
      if (!formData.address || formData.address.trim() === "") {
        setError("L'indirizzo è obbligatorio");
        return false;
      }
      // Città obbligatoria
      if (!formData.city || formData.city.trim() === "") {
        setError("La città è obbligatoria");
        return false;
      }
      // Provincia: 2 lettere maiuscole
      if (!formData.province || formData.province.trim() === "" || !/^[A-Z]{2}$/.test(formData.province)) {
        setError("La provincia è obbligatoria e deve essere esattamente 2 lettere maiuscole");
        return false;
      }
      // CAP: esattamente 5 numeri
      if (!formData.postalCode || formData.postalCode.trim() === "" || !/^\d{5}$/.test(formData.postalCode)) {
        setError("Il CAP è obbligatorio e deve essere esattamente 5 numeri");
        return false;
      }
      // Partita IVA: 11 numeri
      if (!formData.partitaIva || formData.partitaIva.trim() === "" || !/^\d{11}$/.test(formData.partitaIva)) {
        setError("La partita IVA è obbligatoria e deve essere esattamente 11 numeri");
        return false;
      }
      // Codice Fiscale: 11 numeri
      if (!formData.codiceFiscale || formData.codiceFiscale.trim() === "" || !/^\d{11}$/.test(formData.codiceFiscale)) {
        setError("Il codice fiscale è obbligatorio e deve essere esattamente 11 numeri");
        return false;
      }
      // Codice SDI o PEC: almeno uno deve essere presente
      const hasValidSDI = formData.codiceSDI && formData.codiceSDI.trim() !== "" && /^[A-Z0-9]{7}$/.test(formData.codiceSDI);
      const hasValidPEC = formData.pec && formData.pec.trim() !== "" && formData.pec.includes("@");
      
      if (!hasValidSDI && !hasValidPEC) {
        setError("È necessario inserire il Codice SDI o la PEC");
        return false;
      }
      
      // Validazione PEC se presente
      if (formData.pec && formData.pec.trim() !== "" && !formData.pec.includes("@")) {
        setError("La PEC non è valida (deve contenere @)");
        return false;
      }
    } else if (clientType === "PA") {
      // Pubblica Amministrazione: stessa struttura azienda ma codice PA invece di SDI
      if (!formData.ragioneSociale || formData.ragioneSociale.trim() === "") {
        setError("La ragione sociale è obbligatoria");
        return false;
      }
      if (!formData.address || formData.address.trim() === "") {
        setError("L'indirizzo è obbligatorio");
        return false;
      }
      if (!formData.city || formData.city.trim() === "") {
        setError("La città è obbligatoria");
        return false;
      }
      if (!formData.province || formData.province.trim() === "" || !/^[A-Z]{2}$/.test(formData.province)) {
        setError("La provincia è obbligatoria e deve essere esattamente 2 lettere maiuscole");
        return false;
      }
      if (!formData.postalCode || formData.postalCode.trim() === "" || !/^\d{5}$/.test(formData.postalCode)) {
        setError("Il CAP è obbligatorio e deve essere esattamente 5 numeri");
        return false;
      }
      if (!formData.partitaIva || formData.partitaIva.trim() === "" || !/^\d{11}$/.test(formData.partitaIva)) {
        setError("La partita IVA è obbligatoria e deve essere esattamente 11 numeri");
        return false;
      }
      if (!formData.codiceFiscale || formData.codiceFiscale.trim() === "" || !/^\d{11}$/.test(formData.codiceFiscale)) {
        setError("Il codice fiscale è obbligatorio e deve essere esattamente 11 numeri");
        return false;
      }
      // Codice PA: esattamente 6 caratteri (lettere maiuscole e numeri)
      if (!formData.codicePA || formData.codicePA.trim() === "" || !/^[A-Z0-9]{6}$/.test(formData.codicePA)) {
        setError("Il codice PA è obbligatorio e deve essere esattamente 6 caratteri");
        return false;
      }
    } else if (clientType === "PRIVATO") {
      // Privato: nome e cognome
      if (!formData.nome || formData.nome.trim() === "") {
        setError("Il nome è obbligatorio");
        return false;
      }
      if (!formData.cognome || formData.cognome.trim() === "") {
        setError("Il cognome è obbligatorio");
        return false;
      }
      if (!formData.address || formData.address.trim() === "") {
        setError("L'indirizzo è obbligatorio");
        return false;
      }
      if (!formData.city || formData.city.trim() === "") {
        setError("La città è obbligatoria");
        return false;
      }
      if (!formData.province || formData.province.trim() === "" || !/^[A-Z]{2}$/.test(formData.province)) {
        setError("La provincia è obbligatoria e deve essere esattamente 2 lettere maiuscole");
        return false;
      }
      if (!formData.postalCode || formData.postalCode.trim() === "" || !/^\d{5}$/.test(formData.postalCode)) {
        setError("Il CAP è obbligatorio e deve essere esattamente 5 numeri");
        return false;
      }
      // Codice Fiscale: 16 caratteri
      if (!formData.codiceFiscale || formData.codiceFiscale.trim() === "" || !/^[A-Z0-9]{16}$/.test(formData.codiceFiscale)) {
        setError("Il codice fiscale è obbligatorio e deve essere esattamente 16 caratteri");
        return false;
      }
    }

    // Email è obbligatoria solo per AZIENDA
    if (clientType === "AZIENDA") {
      if (!formData.email || formData.email.trim() === "" || !/^[^@]+@[^@]+$/.test(formData.email)) {
        setError("L'email è obbligatoria e deve essere un indirizzo valido");
        return false;
      }
    }

    // PEC è opzionale per tutti

    return true;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (invalidFields.size > 0) {
      setError("Correggi gli errori nei campi evidenziati prima di salvare");
      return;
    }

    if (!validate()) {
      return;
    }

    setLoading(true);

    try {
      const res = await fetch("/api/clients", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          type: clientType,
          ...formData,
          // Pulisci i campi in base al tipo
          ragioneSociale: clientType !== "PRIVATO" ? formData.ragioneSociale : null,
          nome: clientType === "PRIVATO" ? formData.nome : null,
          cognome: clientType === "PRIVATO" ? formData.cognome : null,
          partitaIva: clientType !== "PRIVATO" ? formData.partitaIva : null,
          codiceSDI: clientType === "AZIENDA" ? formData.codiceSDI : null,
          codicePA: clientType === "PA" ? formData.codicePA : null,
        }),
      });

      if (res.ok) {
        router.push("/settings/clients");
      } else {
        const data = await res.json();
        setError(data.error || data.details || "Errore durante la creazione");
      }
    } catch (error) {
      console.error("Error creating client:", error);
      setError("Errore durante la creazione");
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;

    // Auto-maiuscolo per provincia, codice fiscale privati, codice PA e codice SDI
    let processedValue = value;
    if (name === "province" || (name === "codiceFiscale" && clientType === "PRIVATO") || name === "codicePA" || name === "codiceSDI") {
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

  return (
    <DashboardShell>
      <div>
        <div className="flex items-center gap-3 mb-6">
          <button
            onClick={() => router.push("/settings/clients")}
            aria-label="Indietro"
            title="Indietro"
            className="h-10 w-10 inline-flex items-center justify-center rounded-lg bg-gray-900 text-white hover:bg-gray-800 hover:shadow-lg transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <h1 className="text-3xl font-bold">Nuovo Cliente</h1>
        </div>

        <form onSubmit={handleSubmit} className="max-w-2xl space-y-4">
          {/* Selezione tipo cliente */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Tipo Cliente *
            </label>
            <div className="grid grid-cols-3 gap-4">
              <button
                type="button"
                onClick={() => setClientType("AZIENDA")}
                className={`px-4 py-2 border rounded-lg ${
                  clientType === "AZIENDA"
                    ? "bg-gray-900 text-white"
                    : "border-gray-300 hover:bg-gray-50"
                }`}
              >
                Azienda
              </button>
              <button
                type="button"
                onClick={() => setClientType("PA")}
                className={`px-4 py-2 border rounded-lg ${
                  clientType === "PA"
                    ? "bg-gray-900 text-white"
                    : "border-gray-300 hover:bg-gray-50"
                }`}
              >
                Pubblica Amministrazione
              </button>
              <button
                type="button"
                onClick={() => setClientType("PRIVATO")}
                className={`px-4 py-2 border rounded-lg ${
                  clientType === "PRIVATO"
                    ? "bg-gray-900 text-white"
                    : "border-gray-300 hover:bg-gray-50"
                }`}
              >
                Privato
              </button>
            </div>
          </div>

          {clientType && (
            <>
              {/* Ragione sociale / Nome */}
              {clientType !== "PRIVATO" ? (
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
                    onBlur={handleBlur}
                    required
                    className={`w-full px-4 py-2 h-10 border rounded-lg text-sm focus:ring-2 focus:ring-gray-500 focus:border-transparent ${
                      touchedFields.has("ragioneSociale") && !formData.ragioneSociale.trim() ? "border-red-500" : "border-gray-300"
                    }`}
                  />
                  {touchedFields.has("ragioneSociale") && !formData.ragioneSociale.trim() && (
                    <p className="text-red-600 text-sm mt-1">Campo obbligatorio</p>
                  )}
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label
                      htmlFor="nome"
                      className="block text-sm font-medium text-gray-700 mb-2"
                    >
                      Nome *
                    </label>
                    <input
                      id="nome"
                      name="nome"
                      type="text"
                      value={formData.nome}
                      onChange={handleChange}
                      onBlur={handleBlur}
                      required
                      className={`w-full px-4 py-2 h-10 border rounded-lg text-sm focus:ring-2 focus:ring-gray-500 focus:border-transparent ${
                        touchedFields.has("nome") && !formData.nome.trim() ? "border-red-500" : "border-gray-300"
                      }`}
                    />
                    {touchedFields.has("nome") && !formData.nome.trim() && (
                      <p className="text-red-600 text-sm mt-1">Campo obbligatorio</p>
                    )}
                  </div>
                  <div>
                    <label
                      htmlFor="cognome"
                      className="block text-sm font-medium text-gray-700 mb-2"
                    >
                      Cognome *
                    </label>
                    <input
                      id="cognome"
                      name="cognome"
                      type="text"
                      value={formData.cognome}
                      onChange={handleChange}
                      onBlur={handleBlur}
                      required
                      className={`w-full px-4 py-2 h-10 border rounded-lg text-sm focus:ring-2 focus:ring-gray-500 focus:border-transparent ${
                        touchedFields.has("cognome") && !formData.cognome.trim() ? "border-red-500" : "border-gray-300"
                      }`}
                    />
                    {touchedFields.has("cognome") && !formData.cognome.trim() && (
                      <p className="text-red-600 text-sm mt-1">Campo obbligatorio</p>
                    )}
                  </div>
                </div>
              )}

              {/* Indirizzo */}
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
                  onBlur={handleBlur}
                  required
                  className={`w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-gray-500 focus:border-transparent ${
                    touchedFields.has("address") && !formData.address.trim() ? "border-red-500" : "border-gray-300"
                  }`}
                />
                {touchedFields.has("address") && !formData.address.trim() && (
                  <p className="text-red-600 text-sm mt-1">Campo obbligatorio</p>
                )}
              </div>

              {/* Città, Provincia, CAP */}
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
                    onBlur={handleBlur}
                    required
                    className={`w-full px-4 py-2 h-10 border rounded-lg text-sm focus:ring-2 focus:ring-gray-500 focus:border-transparent ${
                      touchedFields.has("city") && !formData.city.trim() ? "border-red-500" : "border-gray-300"
                    }`}
                  />
                  {touchedFields.has("city") && !formData.city.trim() && (
                    <p className="text-red-600 text-sm mt-1">Campo obbligatorio</p>
                  )}
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
                      invalidFields.has("province") || (touchedFields.has("province") && !formData.province.trim()) ? "border-red-500" : "border-gray-300"
                    }`}
                    placeholder="RM"
                  />
                  {touchedFields.has("province") && invalidFields.has("province") && (
                    <p className="text-red-600 text-sm mt-1">{fieldErrors.get("province")}</p>
                  )}
                  {touchedFields.has("province") && !formData.province.trim() && (
                    <p className="text-red-600 text-sm mt-1">Campo obbligatorio</p>
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
                      invalidFields.has("postalCode") || (touchedFields.has("postalCode") && !formData.postalCode.trim()) ? "border-red-500" : "border-gray-300"
                    }`}
                  />
                  {touchedFields.has("postalCode") && invalidFields.has("postalCode") && (
                    <p className="text-red-600 text-sm mt-1">{fieldErrors.get("postalCode")}</p>
                  )}
                  {touchedFields.has("postalCode") && !formData.postalCode.trim() && (
                    <p className="text-red-600 text-sm mt-1">Campo obbligatorio</p>
                  )}
                </div>
              </div>

              {/* Partita IVA (solo per Azienda e PA) */}
              {clientType !== "PRIVATO" && (
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
                        invalidFields.has("partitaIva") || (touchedFields.has("partitaIva") && !formData.partitaIva.trim()) ? "border-red-500" : "border-gray-300"
                      }`}
                    />
                    {touchedFields.has("partitaIva") && invalidFields.has("partitaIva") && (
                      <p className="text-red-600 text-sm mt-1">{fieldErrors.get("partitaIva")}</p>
                    )}
                    {touchedFields.has("partitaIva") && !formData.partitaIva.trim() && (
                      <p className="text-red-600 text-sm mt-1">Campo obbligatorio</p>
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
                        invalidFields.has("codiceFiscale") || (touchedFields.has("codiceFiscale") && !formData.codiceFiscale.trim()) ? "border-red-500" : "border-gray-300"
                      }`}
                    />
                    {touchedFields.has("codiceFiscale") && invalidFields.has("codiceFiscale") && (
                      <p className="text-red-600 text-sm mt-1">{fieldErrors.get("codiceFiscale")}</p>
                    )}
                    {touchedFields.has("codiceFiscale") && !formData.codiceFiscale.trim() && (
                      <p className="text-red-600 text-sm mt-1">Campo obbligatorio</p>
                    )}
                  </div>
                </div>
              )}

              {/* Codice SDI (solo per Azienda) */}
              {clientType === "AZIENDA" && (
                <div>
                  <label
                    htmlFor="codiceSDI"
                    className="block text-sm font-medium text-gray-700 mb-2"
                  >
                    Codice SDI
                  </label>
                  <input
                    id="codiceSDI"
                    name="codiceSDI"
                    type="text"
                    value={formData.codiceSDI}
                    onChange={handleChange}
                    onBlur={handleBlur}
                    maxLength={7}
                    className={`w-full px-4 py-2 h-10 border rounded-lg text-sm focus:ring-2 focus:ring-gray-500 focus:border-transparent ${
                      invalidFields.has("codiceSDI") ? "border-red-500" : "border-gray-300"
                    }`}
                  />
                  {touchedFields.has("codiceSDI") && invalidFields.has("codiceSDI") && (
                    <p className="text-red-600 text-sm mt-1">{fieldErrors.get("codiceSDI")}</p>
                  )}
                </div>
              )}

              {/* Codice PA (solo per PA) */}
              {clientType === "PA" && (
                <div>
                  <label
                    htmlFor="codicePA"
                    className="block text-sm font-medium text-gray-700 mb-2"
                  >
                    Codice PA *
                  </label>
                  <input
                    id="codicePA"
                    name="codicePA"
                    type="text"
                    value={formData.codicePA}
                    onChange={handleChange}
                    onBlur={handleBlur}
                    maxLength={6}
                    required
                    className={`w-full px-4 py-2 h-10 border rounded-lg text-sm focus:ring-2 focus:ring-gray-500 focus:border-transparent ${
                      invalidFields.has("codicePA") || (touchedFields.has("codicePA") && !formData.codicePA.trim()) ? "border-red-500" : "border-gray-300"
                    }`}
                  />
                  {touchedFields.has("codicePA") && invalidFields.has("codicePA") && (
                    <p className="text-red-600 text-sm mt-1">{fieldErrors.get("codicePA")}</p>
                  )}
                  {touchedFields.has("codicePA") && !formData.codicePA.trim() && (
                    <p className="text-red-600 text-sm mt-1">Campo obbligatorio</p>
                  )}
                </div>
              )}

              {/* Codice Fiscale per PRIVATO */}
              {clientType === "PRIVATO" && (
                <div>
                  <label
                    htmlFor="codiceFiscalePrivato"
                    className="block text-sm font-medium text-gray-700 mb-2"
                  >
                    Codice Fiscale *
                  </label>
                  <input
                    id="codiceFiscalePrivato"
                    name="codiceFiscale"
                    type="text"
                    value={formData.codiceFiscale}
                    onChange={handleChange}
                    onBlur={handleBlur}
                    maxLength={16}
                    required
                    className={`w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-gray-500 focus:border-transparent uppercase ${
                      invalidFields.has("codiceFiscale") || (touchedFields.has("codiceFiscale") && !formData.codiceFiscale.trim()) ? "border-red-500" : "border-gray-300"
                    }`}
                  />
                  {touchedFields.has("codiceFiscale") && invalidFields.has("codiceFiscale") && (
                    <p className="text-red-600 text-sm mt-1">{fieldErrors.get("codiceFiscale")}</p>
                  )}
                  {touchedFields.has("codiceFiscale") && !formData.codiceFiscale.trim() && (
                    <p className="text-red-600 text-sm mt-1">Campo obbligatorio</p>
                  )}
                </div>
              )}

              {/* Email e PEC */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label
                    htmlFor="email"
                    className="block text-sm font-medium text-gray-700 mb-2"
                  >
                    Email {clientType === "AZIENDA" && "*"}
                  </label>
                  <input
                    id="email"
                    name="email"
                    type="email"
                    value={formData.email}
                    onChange={handleChange}
                    onBlur={handleBlur}
                    required={clientType === "AZIENDA"}
                    className={`w-full px-4 py-2 h-10 border rounded-lg text-sm focus:ring-2 focus:ring-gray-500 focus:border-transparent ${
                      (invalidFields.has("email") && formData.email.length > 0) ? "border-red-500" : "border-gray-300"
                    }`}
                  />
                  {invalidFields.has("email") && formData.email.length > 0 && (
                    <p className="text-red-600 text-sm mt-1">{fieldErrors.get("email")}</p>
                  )}
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
                    onChange={handleChange}
                    onBlur={handleBlur}
                    className={`w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-500 focus:border-transparent ${
                      (invalidFields.has("pec") && formData.pec.length > 0) ? "border-red-500" : ""
                    }`}
                  />
                  {invalidFields.has("pec") && formData.pec.length > 0 && (
                    <p className="text-red-600 text-sm mt-1">{fieldErrors.get("pec")}</p>
                  )}
                </div>
              </div>
            </>
          )}

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
              disabled={loading || !clientType || invalidFields.size > 0}
              className="px-4 py-2 bg-gray-900 text-white rounded-lg hover:bg-gray-800 hover:shadow-lg hover:scale-105 active:scale-100 transition-all duration-200 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-gray-900 disabled:hover:shadow-none"
            >
              {loading ? "Salvataggio..." : "Salva"}
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
    </DashboardShell>
  );
}
