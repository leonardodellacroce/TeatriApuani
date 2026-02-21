"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import DashboardShell from "@/components/DashboardShell";
import PageSkeleton from "@/components/PageSkeleton";
import AreasRolesSelector from "@/components/AreasRolesSelector";
import { UserRoles } from "@/lib/areas-roles";

interface Company {
  id: string;
  ragioneSociale: string;
}

export default function NewUserPage() {
  const router = useRouter();
  const [companies, setCompanies] = useState<Company[]>([]);
  const [formData, setFormData] = useState({
    name: "",
    cognome: "",
    email: "",
    password: "",
    isSuperAdmin: false,
    isAdmin: false,
    isResponsabile: false,
    isWorker: false,
    codiceFiscale: "",
    companyId: "",
  });
  const [selectedAreas, setSelectedAreas] = useState<string[]>([]);
  const [selectedRoles, setSelectedRoles] = useState<UserRoles>({});
  const [mustChangePassword, setMustChangePassword] = useState(true);
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(true);
  const [error, setError] = useState("");
  const [invalidFields, setInvalidFields] = useState<Set<string>>(new Set());
  const [fieldErrors, setFieldErrors] = useState<Map<string, string>>(new Map());
  const [showSuperAdminConfirm, setShowSuperAdminConfirm] = useState(false);
  const [pendingSuperAdminState, setPendingSuperAdminState] = useState(false);
  
  // Timer per debounce delle verifiche unicità
  const emailCheckTimer = useRef<NodeJS.Timeout | null>(null);
  const codiceFiscaleCheckTimer = useRef<NodeJS.Timeout | null>(null);
  
  const [emailAvailabilityError, setEmailAvailabilityError] = useState("");
  const [codiceFiscaleAvailabilityError, setCodiceFiscaleAvailabilityError] = useState("");

  const handleAreasRolesChange = (areas: string[], roles: UserRoles) => {
    setSelectedAreas(areas);
    setSelectedRoles(roles);
  };

  useEffect(() => {
    fetchCompanies();
  }, []);

  // Cleanup dei timer quando il componente viene smontato
  useEffect(() => {
    return () => {
      if (emailCheckTimer.current) {
        clearTimeout(emailCheckTimer.current);
      }
      if (codiceFiscaleCheckTimer.current) {
        clearTimeout(codiceFiscaleCheckTimer.current);
      }
    };
  }, []);

  // Funzione per verificare disponibilità email
  const checkEmailAvailability = async (email: string) => {
    if (!email || !email.includes("@")) return;
    
    try {
      const res = await fetch(`/api/users/check-email?email=${encodeURIComponent(email)}`);
      const data = await res.json();
      if (!data.available) {
        setEmailAvailabilityError("Email già registrata");
      } else {
        setEmailAvailabilityError("");
      }
    } catch (error) {
      console.error("Error checking email:", error);
    }
  };

  // Funzione per verificare disponibilità codice fiscale
  const checkCodiceFiscaleAvailability = async (cf: string) => {
    if (!cf || cf.length !== 16) return;
    
    try {
      const res = await fetch(`/api/users/check-codice-fiscale?cf=${encodeURIComponent(cf)}`);
      const data = await res.json();
      if (!data.available) {
        setCodiceFiscaleAvailabilityError("Codice fiscale già registrato");
      } else {
        setCodiceFiscaleAvailabilityError("");
      }
    } catch (error) {
      console.error("Error checking codice fiscale:", error);
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
    } finally {
      setFetching(false);
    }
  };

  const validateCodiceFiscale = (value: string): boolean => {
    // Solo lettere maiuscole e numeri, esattamente 16 caratteri
    return /^[A-Z0-9]{16}$/.test(value);
  };

  const handleCodiceFiscaleChange = (value: string) => {
    // Auto-uppercase e solo lettere/numeri
    const processedValue = value.toUpperCase().replace(/[^A-Z0-9]/g, "");
    const newInvalidFields = new Set(invalidFields);
    const newFieldErrors = new Map(fieldErrors);

    if (processedValue.length > 0 && processedValue.length !== 16) {
      newInvalidFields.add("codiceFiscale");
      newFieldErrors.set("codiceFiscale", "Il codice fiscale deve essere esattamente 16 caratteri");
    } else {
      newInvalidFields.delete("codiceFiscale");
      newFieldErrors.delete("codiceFiscale");
    }

    setInvalidFields(newInvalidFields);
    setFieldErrors(newFieldErrors);

    return processedValue;
  };

  const validate = () => {
    if (!formData.name) {
      setError("Il nome è obbligatorio");
      return false;
    }
    if (!formData.cognome) {
      setError("Il cognome è obbligatorio");
      return false;
    }
    if (!formData.email) {
      setError("L'email è obbligatoria");
      return false;
    }
    // password può essere vuota: API userà password123
    if (!formData.isSuperAdmin && !formData.isAdmin && !formData.isResponsabile) {
      setError("Seleziona almeno un ruolo");
      return false;
    }
    if (!formData.codiceFiscale || !validateCodiceFiscale(formData.codiceFiscale)) {
      setError("Il codice fiscale deve essere esattamente 16 caratteri (lettere maiuscole e numeri)");
      return false;
    }
    if (formData.isResponsabile && !formData.companyId) {
      setError("Il responsabile azienda deve essere associato ad un'azienda");
      return false;
    }
    if (formData.isWorker && !formData.companyId) {
      setError("L'utente lavoratore deve essere associato ad un'azienda");
      return false;
    }
    if (formData.isWorker) {
      if (selectedAreas.length === 0) {
        setError("Seleziona almeno un'area per l'utente lavoratore");
        return false;
      }
      for (const area of selectedAreas) {
        if (!selectedRoles[area] || selectedRoles[area].length === 0) {
          setError(`Seleziona almeno una mansione per l'area "${area}"`);
          return false;
        }
      }
    }

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
      console.log("Creating user with data:", formData);
      const res = await fetch("/api/users", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          ...formData,
          mustChangePassword: mustChangePassword,
          areas: formData.isWorker ? JSON.stringify(selectedAreas) : null,
          roles: formData.isWorker ? JSON.stringify(selectedRoles) : null,
        }),
      });

      console.log("Response status:", res.status);
      
      if (res.ok) {
        router.push("/settings/management-users");
      } else {
        const data = await res.json();
        console.error("Error response:", data);
        setError(data.error || "Errore durante la creazione");
      }
    } catch (error) {
      console.error("Error creating user:", error);
      setError("Errore durante la creazione");
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value, type } = e.target;
    const checked = (e.target as HTMLInputElement).checked;

    // Clear any existing error when user starts typing
    if (error) {
      setError("");
    }

    if (name === "isSuperAdmin") {
      // Conferma per SuperAdmin; dopo conferma, auto-deseleziona Admin se necessario
      setPendingSuperAdminState(checked);
      setShowSuperAdminConfirm(true);
      return;
    }

    if (name === "isAdmin" && type === "checkbox") {
      setFormData({
        ...formData,
        isAdmin: checked,
        // Se selezioni Admin, deseleziona Super Admin
        isSuperAdmin: checked ? false : formData.isSuperAdmin,
      });
      return;
    }

    if (name === "codiceFiscale") {
      const processedValue = handleCodiceFiscaleChange(value);
      setFormData({
        ...formData,
        [name]: processedValue,
      });
      
      // Clear errore disponibilità
      setCodiceFiscaleAvailabilityError("");
      
      // Verifica disponibilità con debounce se il codice è completo
      if (processedValue.length === 16) {
        if (codiceFiscaleCheckTimer.current) {
          clearTimeout(codiceFiscaleCheckTimer.current);
        }
        codiceFiscaleCheckTimer.current = setTimeout(() => {
          checkCodiceFiscaleAvailability(processedValue);
        }, 500);
      }
    } else if (name === "email") {
      setFormData({
        ...formData,
        [name]: value,
      });
      
      // Clear errore disponibilità
      setEmailAvailabilityError("");
      
      // Verifica disponibilità con debounce
      if (emailCheckTimer.current) {
        clearTimeout(emailCheckTimer.current);
      }
      emailCheckTimer.current = setTimeout(() => {
        checkEmailAvailability(value);
      }, 500);
    } else if (type === "checkbox") {
      setFormData({
        ...formData,
        [name]: checked,
      });
      if (name === "isWorker" && !checked) {
        setSelectedAreas([]);
        setSelectedRoles({});
      }
    } else {
      setFormData({
        ...formData,
        [name]: value,
      });
    }
  };

  if (fetching) {
    return <PageSkeleton />;
  }

  const handleSuperAdminConfirm = () => {
    setFormData({
      ...formData,
      isSuperAdmin: pendingSuperAdminState,
      // Se si conferma Super Admin attivo, deseleziona Admin
      isAdmin: pendingSuperAdminState ? false : formData.isAdmin,
    });
    setShowSuperAdminConfirm(false);
    setError("");
  };

  const handleSuperAdminCancel = () => {
    setShowSuperAdminConfirm(false);
    setPendingSuperAdminState(false);
  };

  return (
    <DashboardShell>
      <div>
        <div className="flex items-center gap-3 mb-6">
          <button
            onClick={() => router.push("/settings/management-users")}
            aria-label="Indietro"
            title="Indietro"
            className="h-10 w-10 inline-flex items-center justify-center rounded-lg bg-gray-900 text-white hover:bg-gray-800 hover:shadow-lg transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <h1 className="text-3xl font-bold">Nuovo Utente di Gestione</h1>
        </div>

        {showSuperAdminConfirm && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg p-6 max-w-md">
              <h2 className="text-xl font-bold mb-4">Conferma</h2>
              <p className="mb-4">
                {pendingSuperAdminState
                  ? "Sei sicuro di voler assegnare il ruolo di Super Admin a questo utente?"
                  : "Sei sicuro di voler rimuovere il ruolo di Super Admin a questo utente?"}
              </p>
              <div className="flex gap-4">
                <button
                  type="button"
                  onClick={handleSuperAdminConfirm}
                  className="px-4 py-2 bg-gray-900 text-white rounded-lg hover:bg-gray-800 hover:shadow-lg hover:scale-105 active:scale-100 transition-all duration-200 cursor-pointer"
                >
                  Conferma
                </button>
                <button
                  type="button"
                  onClick={handleSuperAdminCancel}
                  className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 hover:border-gray-400 hover:shadow-md hover:scale-105 active:scale-100 transition-all duration-200 cursor-pointer"
                >
                  Annulla
                </button>
              </div>
            </div>
          </div>
        )}

        <form onSubmit={handleSubmit} className="max-w-2xl space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label
                htmlFor="name"
                className="block text-sm font-medium text-gray-700 mb-2"
              >
                Nome *
              </label>
              <input
                id="name"
                name="name"
                type="text"
                value={formData.name}
                onChange={handleChange}
                required
                className="w-full px-4 py-2 h-10 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-gray-500 focus:border-transparent"
              />
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
                required
                className="w-full px-4 py-2 h-10 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-gray-500 focus:border-transparent"
              />
            </div>
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
              required
              className={`w-full px-4 py-2 h-10 border rounded-lg text-sm focus:ring-2 focus:ring-gray-500 focus:border-transparent ${
                emailAvailabilityError ? 'border-red-500' : 'border-gray-300'
              }`}
            />
            {emailAvailabilityError && (
              <p className="text-red-600 text-sm mt-1">{emailAvailabilityError}</p>
            )}
          </div>

          <div>
            <label
              htmlFor="password"
              className="block text-sm font-medium text-gray-700 mb-2"
            >
              Password (lascia vuoto per default)
            </label>
            <input
              id="password"
              name="password"
              type="password"
              value={formData.password}
              onChange={handleChange}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-500 focus:border-transparent"
            />
            <p className="text-xs text-gray-500 mt-1">Se lasci vuoto, verrà impostata la password di default: password123</p>
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
              maxLength={16}
              required
              className={`w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-gray-500 focus:border-transparent uppercase ${
                invalidFields.has("codiceFiscale") || codiceFiscaleAvailabilityError ? "border-red-500" : "border-gray-300"
              }`}
            />
            {invalidFields.has("codiceFiscale") && (
              <p className="text-red-600 text-sm mt-1">{fieldErrors.get("codiceFiscale")}</p>
            )}
            {codiceFiscaleAvailabilityError && (
              <p className="text-red-600 text-sm mt-1">{codiceFiscaleAvailabilityError}</p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Ruoli *
            </label>
            <div className="space-y-2">
              <label className="flex items-center">
                <input
                  type="checkbox"
                  name="isSuperAdmin"
                  checked={formData.isSuperAdmin}
                  onChange={handleChange}
                  className="mr-2 w-4 h-4 text-gray-900 border-gray-300 rounded focus:ring-gray-500"
                />
                <span className="text-sm text-gray-700 font-semibold">Super Admin</span>
              </label>
              <label className="flex items-center">
                <input
                  type="checkbox"
                  name="isAdmin"
                  checked={formData.isAdmin}
                  onChange={handleChange}
                  className="mr-2 w-4 h-4 text-gray-900 border-gray-300 rounded focus:ring-gray-500"
                />
                <span className="text-sm text-gray-700">Admin</span>
              </label>
              <label className="flex items-center">
                <input
                  type="checkbox"
                  name="isResponsabile"
                  checked={formData.isResponsabile}
                  onChange={handleChange}
                  className="mr-2 w-4 h-4 text-gray-900 border-gray-300 rounded focus:ring-gray-500"
                />
                <span className="text-sm text-gray-700">Responsabile Azienda</span>
              </label>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Gestione turni</label>
            <label className="flex items-start gap-2">
              <input
                type="checkbox"
                name="isWorker"
                checked={formData.isWorker}
                onChange={handleChange}
                className="mt-1 w-4 h-4 text-gray-900 border-gray-300 rounded focus:ring-gray-500"
              />
              <span className="text-sm text-gray-700">
                Considera come utente lavoratore
                <span className="block text-xs text-gray-500">
                  Se attivo, questo utente di gestione potrà essere assegnato ai turni e richiede aree e mansioni.
                </span>
              </span>
            </label>
          </div>

          <div className={`${formData.isWorker ? "opacity-100" : "opacity-75"}`}>
            <AreasRolesSelector
              selectedAreas={selectedAreas}
              selectedRoles={selectedRoles}
              onChange={handleAreasRolesChange}
              disabled={!formData.isWorker}
            />
            {!formData.isWorker && (
              <p className="text-xs text-gray-500 mt-2">
                Attiva l'opzione per indicare le aree e le mansioni in cui questo utente potrà lavorare.
              </p>
            )}
          </div>

          {(formData.isResponsabile || formData.isWorker) && (
            <div>
              <label
                htmlFor="companyId"
                className="block text-sm font-medium text-gray-700 mb-2"
              >
                Azienda *
              </label>
              <select
                id="companyId"
                name="companyId"
                value={formData.companyId}
                onChange={handleChange}
                required
                className="w-full px-4 py-2 h-10 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-gray-500 focus:border-transparent"
              >
                <option value="">Seleziona azienda</option>
                {companies.map((company) => (
                  <option key={company.id} value={company.id}>
                    {company.ragioneSociale}
                  </option>
                ))}
              </select>
              {formData.isWorker && !formData.isResponsabile && (
                <p className="text-xs text-gray-500 mt-1">
                  L'utente lavoratore deve essere associato ad un'azienda come gli altri dipendenti.
                </p>
              )}
            </div>
          )}

          {error && (
            <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded relative">
              {error}
            </div>
          )}

          <div className="pt-4">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={mustChangePassword}
                onChange={(e) => setMustChangePassword(e.target.checked)}
                className="w-4 h-4 text-gray-900 border-gray-300 rounded focus:ring-gray-500"
              />
              <span className="text-sm font-medium text-gray-700">
                Richiedi cambio password al primo accesso
              </span>
            </label>
          </div>

          <div className="flex gap-4 pt-4">
            <button
              type="submit"
              disabled={loading || invalidFields.size > 0 || !!emailAvailabilityError || !!codiceFiscaleAvailabilityError || !!error}
              className="px-4 py-2 bg-gray-900 text-white rounded-lg hover:bg-gray-800 hover:shadow-lg hover:scale-105 active:scale-100 transition-all duration-200 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-gray-900 disabled:hover:shadow-none"
            >
              {loading ? "Salvataggio..." : "Salva"}
            </button>
            <button
              type="button"
              onClick={() => router.push("/settings/management-users")}
              className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 hover:border-gray-400 hover:shadow-md hover:scale-105 active:scale-100 transition-all duration-200 cursor-pointer"
            >
              Annulla
            </button>
          </div>
        </form>
      </div>
    </DashboardShell>
  );
}

