"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
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
  const { data: session } = useSession();
  const [companies, setCompanies] = useState<Company[]>([]);
  const [formData, setFormData] = useState({
    name: "",
    cognome: "",
    email: "",
    codiceFiscale: "",
    companyId: "",
  });
  const [selectedAreas, setSelectedAreas] = useState<string[]>([]);
  const [selectedRoles, setSelectedRoles] = useState<UserRoles>({});
  const [isCoordinatore, setIsCoordinatore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(true);
  const [error, setError] = useState("");
  const [invalidFields, setInvalidFields] = useState<Set<string>>(new Set());
  const [fieldErrors, setFieldErrors] = useState<Map<string, string>>(new Map());
  const [touchedFields, setTouchedFields] = useState<Set<string>>(new Set());

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
          mustChangePassword: true,
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
    return <PageSkeleton />;
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

        <div className="bg-white rounded-lg shadow p-6 border border-gray-200 mb-6 max-w-xl">
        <form onSubmit={handleSubmit} className="space-y-4">
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

          <p className="text-sm text-gray-500">
            All'utente verrà inviata automaticamente una mail con il link per l'accesso alla piattaforma e la password provvisoria da cambiare al primo accesso.
          </p>

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
      </div>
    </DashboardShell>
  );
}
