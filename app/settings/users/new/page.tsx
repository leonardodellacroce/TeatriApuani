"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import DashboardShell from "@/components/DashboardShell";
import AreasRolesSelector from "@/components/AreasRolesSelector";
import { UserRoles } from "@/lib/areas-roles";

interface Company {
  id: string;
  ragioneSociale: string;
}

export default function NewUserPage() {
  const router = useRouter();
  const { data: session } = useSession();
  const [companies, setCompanies] = useState<Company[]>([]);
  const [formData, setFormData] = useState({
    name: "",
    cognome: "",
    email: "",
    password: "",
    codiceFiscale: "",
    companyId: "",
  });
  const [selectedAreas, setSelectedAreas] = useState<string[]>([]);
  const [selectedRoles, setSelectedRoles] = useState<UserRoles>({});
  const [isCoordinatore, setIsCoordinatore] = useState(false);
  const [mustChangePassword, setMustChangePassword] = useState(true);
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(true);
  const [error, setError] = useState("");
  const [invalidFields, setInvalidFields] = useState<Set<string>>(new Set());
  const [fieldErrors, setFieldErrors] = useState<Map<string, string>>(new Map());
  const [touchedFields, setTouchedFields] = useState<Set<string>>(new Set());
  const [showPassword, setShowPassword] = useState(false);
  
  // Timer per debounce delle verifiche unicità
  const emailCheckTimer = useRef<NodeJS.Timeout | null>(null);
  const codiceFiscaleCheckTimer = useRef<NodeJS.Timeout | null>(null);
  
  const [emailAvailabilityError, setEmailAvailabilityError] = useState("");
  const [codiceFiscaleAvailabilityError, setCodiceFiscaleAvailabilityError] = useState("");
  
  // Funzione helper per verificare se tutte le aree hanno almeno un ruolo selezionato
  const hasAllAreasWithRoles = () => {
    if (selectedAreas.length === 0) return false;
    for (const area of selectedAreas) {
      if (!selectedRoles[area] || selectedRoles[area].length === 0) {
        return false;
      }
    }
    return true;
  };

  useEffect(() => {
    fetchCompanies();
  }, []);

  useEffect(() => {
    setFetching(false);
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

  const fetchCompanies = async () => {
    try {
      // Se l'utente è RESPONSABILE, recupera il suo companyId dal database
      if (session?.user?.role === "RESPONSABILE") {
        // Chiama l'API per ottenere i dati dell'utente corrente
        const userRes = await fetch("/api/users/me");
        if (userRes.ok) {
          const currentUser = await userRes.json();
          
          if (currentUser?.companyId) {
            // Carica tutte le aziende
            const companiesRes = await fetch("/api/companies");
            if (companiesRes.ok) {
              const allCompanies = await companiesRes.json();
              // Trova l'azienda del responsabile
              const userCompany = allCompanies.find((c: Company) => c.id === currentUser.companyId);
              
              if (userCompany) {
                setFormData(prev => ({ ...prev, companyId: userCompany.id }));
                setCompanies([userCompany]);
              } else {
                setError("Errore: azienda non trovata");
              }
            }
          } else {
            setError("Sei un responsabile ma non hai un'azienda associata. Contatta l'amministratore.");
          }
        }
      } else {
        // Per ADMIN e SUPER_ADMIN, mostra tutte le aziende
        const res = await fetch("/api/companies");
        if (res.ok) {
          const data = await res.json();
          setCompanies(data);
        }
      }
    } catch (error) {
      console.error("Error fetching companies:", error);
      setError("Errore nel caricamento delle aziende");
    } finally {
      setFetching(false);
    }
  };

  const validateCodiceFiscale = (value: string): boolean => {
    return /^[A-Z0-9]{16}$/.test(value);
  };

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

  const handleCodiceFiscaleChange = (value: string) => {
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
    if (!formData.name || formData.name.trim() === "") {
      setError("Il nome è obbligatorio");
      return false;
    }
    if (!formData.cognome || formData.cognome.trim() === "") {
      setError("Il cognome è obbligatorio");
      return false;
    }
    if (!formData.email || formData.email.trim() === "") {
      setError("L'email è obbligatoria");
      return false;
    }
    // Se la password è fornita, deve essere di almeno 8 caratteri
    if (formData.password && formData.password.trim().length > 0 && formData.password.length < 8) {
      setError("La password deve essere di almeno 8 caratteri");
      return false;
    }
    if (!formData.codiceFiscale || !validateCodiceFiscale(formData.codiceFiscale)) {
      setError("Il codice fiscale deve essere esattamente 16 caratteri (lettere maiuscole e numeri)");
      return false;
    }
    // Se è RESPONSABILE, verifica che companyId sia già stato impostato automaticamente
    if (session?.user?.role === "RESPONSABILE") {
      if (!formData.companyId) {
        setError("Impossibile creare l'utente. Assicurati di essere associato ad un'azienda.");
        return false;
      }
    } else {
      if (!formData.companyId) {
        setError("È necessario selezionare un'azienda");
        return false;
      }
    }

    // Verifica che per ogni area selezionata ci sia almeno un ruolo
    for (const area of selectedAreas) {
      if (!selectedRoles[area] || selectedRoles[area].length === 0) {
        setError(`È necessario selezionare almeno una mansione per l'area "${area}"`);
        return false;
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

    // Verifica che almeno un'area sia selezionata
    if (selectedAreas.length === 0) {
      setError("Seleziona almeno un'area di appartenenza");
      return;
    }

    setLoading(true);

    try {
      const res = await fetch("/api/users", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          ...formData,
          isSuperAdmin: false,
          isAdmin: false,
          isResponsabile: false,
          isCoordinatore: isCoordinatore,
          mustChangePassword: mustChangePassword,
          areas: JSON.stringify(selectedAreas),
          roles: JSON.stringify(selectedRoles),
        }),
      });

      if (res.ok) {
        router.push("/settings/users");
      } else {
        const data = await res.json();
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
    const { name, value } = e.target;

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
    } else {
      setFormData({
        ...formData,
        [name]: value,
      });
    }
  };

  const handleBlur = (e: React.FocusEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setTouchedFields((prev) => new Set(prev).add(name));

    if (name === "codiceFiscale") {
      handleCodiceFiscaleChange(value);
    }
  };

  if (fetching) {
    return (
      <DashboardShell>
        <div className="flex items-center justify-center h-64">
          <p>Caricamento aziende...</p>
        </div>
      </DashboardShell>
    );
  }

  return (
    <DashboardShell>
      <div>
        <div className="flex items-center gap-3 mb-6">
          <button
            onClick={() => router.push("/settings/users")}
            aria-label="Indietro"
            title="Indietro"
            className="h-10 w-10 inline-flex items-center justify-center rounded-lg bg-gray-900 text-white hover:bg-gray-800 hover:shadow-lg transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <h1 className="text-3xl font-bold">Nuovo Utente</h1>
        </div>

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
                onBlur={handleBlur}
                required
                className={`w-full px-4 py-2 h-10 border rounded-lg text-sm focus:ring-2 focus:ring-gray-500 focus:border-transparent ${
                  touchedFields.has("name") && !formData.name.trim() ? "border-red-500" : "border-gray-300"
                }`}
              />
              {touchedFields.has("name") && !formData.name.trim() && (
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
              className={`w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-gray-500 focus:border-transparent ${
                (touchedFields.has("email") && !formData.email.trim()) || emailAvailabilityError ? "border-red-500" : "border-gray-300"
              }`}
            />
            {touchedFields.has("email") && !formData.email.trim() && (
              <p className="text-red-600 text-sm mt-1">Campo obbligatorio</p>
            )}
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
            <div className="relative">
              <input
                id="password"
                name="password"
                type={showPassword ? "text" : "password"}
                value={formData.password}
                onChange={handleChange}
                onBlur={handleBlur}
                className={`w-full px-4 py-2 pr-10 border rounded-lg focus:ring-2 focus:ring-gray-500 focus:border-transparent ${
                  touchedFields.has("password") && formData.password.trim().length > 0 && formData.password.length < 8 ? "border-red-500" : "border-gray-300"
                }`}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-500 hover:text-gray-700"
              >
                {showPassword ? (
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 11-4.243-4.243m4.242 4.242L9.88 9.88" />
                  </svg>
                ) : (
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                )}
              </button>
            </div>
            <p className="text-xs text-gray-500 mt-1">Se lasci vuoto, verrà impostata la password di default: password123</p>
            {touchedFields.has("password") && formData.password.trim().length > 0 && formData.password.length < 8 && (
              <p className="text-red-600 text-sm mt-1">La password deve essere di almeno 8 caratteri</p>
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
            {touchedFields.has("codiceFiscale") && !formData.codiceFiscale.trim() && (
              <p className="text-red-600 text-sm mt-1">Campo obbligatorio</p>
            )}
          </div>

          {/* Selector Aree e Ruoli */}
          <AreasRolesSelector
            selectedAreas={selectedAreas}
            selectedRoles={selectedRoles}
            onChange={(areas, roles) => {
              setSelectedAreas(areas);
              setSelectedRoles(roles);
            }}
          />

          {/* Checkbox Coordinatore - Solo per ADMIN e SUPER_ADMIN */}
          {session?.user?.role === "SUPER_ADMIN" || session?.user?.role === "ADMIN" ? (
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="isCoordinatore"
                checked={isCoordinatore}
                onChange={(e) => setIsCoordinatore(e.target.checked)}
                className="w-4 h-4 text-gray-900 border-gray-300 rounded focus:ring-gray-500"
              />
              <label htmlFor="isCoordinatore" className="text-sm font-medium text-gray-700">
                Coordinatore
              </label>
            </div>
          ) : null}

          {/* Mostra il campo azienda solo se NON è un RESPONSABILE */}
          {session?.user?.role !== "RESPONSABILE" && (
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
                onBlur={handleBlur}
                required
                className={`w-full px-4 py-2 h-10 border rounded-lg text-sm focus:ring-2 focus:ring-gray-500 focus:border-transparent ${
                  touchedFields.has("companyId") && !formData.companyId ? "border-red-500" : "border-gray-300"
                }`}
              >
                <option value="">Seleziona un'azienda</option>
                {companies.map((company) => (
                  <option key={company.id} value={company.id}>
                    {company.ragioneSociale}
                  </option>
                ))}
              </select>
              {touchedFields.has("companyId") && !formData.companyId && (
                <p className="text-red-600 text-sm mt-1">Campo obbligatorio</p>
              )}
            </div>
          )}

          {/* Mostra info azienda (read-only) per RESPONSABILE */}
          {session?.user?.role === "RESPONSABILE" && formData.companyId && companies.length > 0 && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Azienda *
              </label>
              <input
                type="text"
                value={companies[0].ragioneSociale}
                disabled
                className="w-full px-4 py-2 border border-gray-300 rounded-lg bg-gray-100 cursor-not-allowed"
              />
              <p className="text-sm text-gray-500 mt-1">
                L'utente verrà creato automaticamente per la tua azienda
              </p>
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
              disabled={loading || invalidFields.size > 0 || !!emailAvailabilityError || !!codiceFiscaleAvailabilityError || (session?.user?.role !== "RESPONSABILE" && !formData.companyId) || !hasAllAreasWithRoles()}
              className="px-4 py-2 bg-gray-900 text-white rounded-lg hover:bg-gray-800 hover:shadow-lg hover:scale-105 active:scale-100 transition-all duration-200 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-gray-900 disabled:hover:shadow-none"
            >
              {loading ? "Salvataggio..." : "Salva"}
            </button>
            <button
              type="button"
              onClick={() => router.push("/settings/users")}
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
