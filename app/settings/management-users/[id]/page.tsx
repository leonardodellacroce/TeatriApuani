"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter, useParams } from "next/navigation";
import DashboardShell from "@/components/DashboardShell";
import PageSkeleton from "@/components/PageSkeleton";
import ConfirmEditDialog from "@/components/ConfirmEditDialog";
import ConfirmDialog from "@/components/ConfirmDialog";
import AreasRolesSelector from "@/components/AreasRolesSelector";
import { UserRoles } from "@/lib/areas-roles";

interface Company {
  id: string;
  ragioneSociale: string;
}

interface User {
  id: string;
  code: string;
  name: string;
  cognome: string;
  email: string;
  isAdmin: boolean;
  isSuperAdmin: boolean;
  isResponsabile: boolean;
  isActive: boolean;
  isWorker: boolean;
  codiceFiscale: string;
  company: {
    id: string;
    ragioneSociale: string;
  } | null;
}

export default function EditUserPage() {
  const router = useRouter();
  const params = useParams();
  const id = params.id as string;

  const [companies, setCompanies] = useState<Company[]>([]);
  const [user, setUser] = useState<User | null>(null);
  const [originalData, setOriginalData] = useState<Record<string, any>>({});
  const [formData, setFormData] = useState({
    name: "",
    cognome: "",
    email: "",
    password: "",
    isSuperAdmin: false,
    isAdmin: false,
    isResponsabile: false,
    isActive: true,
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
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [showResetPasswordDialog, setShowResetPasswordDialog] = useState(false);
  const [resettingPassword, setResettingPassword] = useState(false);
  const [successMessage, setSuccessMessage] = useState("");
  
  // Timer per debounce delle verifiche unicità
  const emailCheckTimer = useRef<NodeJS.Timeout | null>(null);
  const codiceFiscaleCheckTimer = useRef<NodeJS.Timeout | null>(null);
  
  const [emailAvailabilityError, setEmailAvailabilityError] = useState("");
  const [codiceFiscaleAvailabilityError, setCodiceFiscaleAvailabilityError] = useState("");

  const handleAreasRolesChange = (areas: string[], roles: UserRoles) => {
    setSelectedAreas(areas);
    setSelectedRoles(roles);
  };

  const fieldLabels: Record<string, string> = {
    name: "Nome",
    cognome: "Cognome",
    email: "Email",
    password: "Password",
    codiceFiscale: "Codice Fiscale",
    companyId: "Azienda",
    isSuperAdmin: "Super Admin",
    isAdmin: "Admin",
    isResponsabile: "Responsabile",
    isActive: "Stato",
    isWorker: "Considera come utente lavoratore",
  };

  useEffect(() => {
    fetchCompanies();
    fetchUser();
  }, [id]);

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

  // Funzione per verificare disponibilità email (escludendo l'utente corrente)
  const checkEmailAvailability = async (email: string) => {
    if (!email || !email.includes("@")) return;
    
    try {
      const res = await fetch(`/api/users/check-email?email=${encodeURIComponent(email)}&excludeId=${id}`);
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

  // Funzione per verificare disponibilità codice fiscale (escludendo l'utente corrente)
  const checkCodiceFiscaleAvailability = async (cf: string) => {
    if (!cf || cf.length !== 16) return;
    
    try {
      const res = await fetch(`/api/users/check-codice-fiscale?cf=${encodeURIComponent(cf)}&excludeId=${id}`);
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
    }
  };

  const fetchUser = async () => {
    try {
      const res = await fetch(`/api/users/${id}`);
      if (res.ok) {
        const data = await res.json();
        setUser(data);
        const initialData = {
          name: data.name || "",
          cognome: data.cognome || "",
          email: data.email || "",
          password: "",
          isSuperAdmin: data.isSuperAdmin || false,
          isAdmin: data.isAdmin || false,
          isResponsabile: data.isResponsabile || false,
          isActive: data.isActive !== undefined ? data.isActive : true,
          isWorker: data.isWorker || false,
          codiceFiscale: data.codiceFiscale || "",
          companyId: data.company?.id || "",
        };
        setFormData(initialData);
        setOriginalData(initialData);
        setMustChangePassword(data.mustChangePassword !== undefined ? data.mustChangePassword : true);

        let initialAreas: string[] = [];
        let initialRoles: UserRoles = {};
        if (data.areas) {
          try {
            const parsed = JSON.parse(data.areas);
            if (Array.isArray(parsed)) {
              initialAreas = parsed;
            }
          } catch (error) {
            console.error("Errore parsing aree utente", error);
          }
        }
        if (data.roles) {
          try {
            const parsedRoles = JSON.parse(data.roles);
            if (parsedRoles && typeof parsedRoles === "object") {
              initialRoles = parsedRoles;
            }
          } catch (error) {
            console.error("Errore parsing ruoli utente", error);
          }
        }
        setSelectedAreas(initialAreas);
        setSelectedRoles(initialRoles);
      }
    } catch (error) {
      console.error("Error fetching user:", error);
      setError("Errore nel caricamento dell'utente");
    } finally {
      setFetching(false);
    }
  };

  const validateCodiceFiscale = (value: string): boolean => {
    return /^[A-Z0-9]{16}$/.test(value);
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
    if (!formData.isSuperAdmin && !formData.isAdmin && !formData.isResponsabile) {
      setError("Seleziona almeno un ruolo");
      return false;
    }
    if (!formData.codiceFiscale || !validateCodiceFiscale(formData.codiceFiscale)) {
      setError("Il codice fiscale deve essere esattamente 16 caratteri");
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
    // Se Super Admin è selezionato, Admin non può essere selezionato
    if (formData.isSuperAdmin && formData.isAdmin) {
      setError("Non è possibile selezionare sia Super Admin che Admin");
      return false;
    }
    if (formData.isWorker) {
      if (selectedAreas.length === 0) {
        setError("Seleziona almeno un'area per questo utente lavoratore");
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

    // Mostra il dialog di conferma
    setShowConfirmDialog(true);
  };

  const handleResetPassword = async () => {
    setShowResetPasswordDialog(false);
    setResettingPassword(true);

    try {
      const res = await fetch(`/api/users/${id}/reset-password`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({}),
      });

      const data = await res.json();

      if (res.ok) {
        setSuccessMessage(data.message || "Password resettata con successo.");
        // Ricarica i dati dell'utente
        await fetchUser();
        // Rimuovi il messaggio dopo 5 secondi
        setTimeout(() => setSuccessMessage(""), 5000);
      } else {
        setError(data.error || "Errore durante il reset della password");
      }
    } catch (err) {
      console.error("Error resetting password:", err);
      setError("Si è verificato un errore durante il reset della password");
    } finally {
      setResettingPassword(false);
    }
  };

  const confirmSave = async () => {
    setShowConfirmDialog(false);
    setLoading(true);

    try {
      const res = await fetch(`/api/users/${id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          ...formData,
          isActive: formData.isActive,
          areas: formData.isWorker ? JSON.stringify(selectedAreas) : null,
          roles: formData.isWorker ? JSON.stringify(selectedRoles) : null,
        }),
      });

      if (res.ok) {
        router.push("/settings/management-users");
      } else {
        const data = await res.json();
        console.error("Error details:", data);
        setError(data.error || data.details || "Errore durante la modifica");
      }
    } catch (error) {
      console.error("Error updating user:", error);
      setError("Errore durante la modifica");
    } finally {
      setLoading(false);
    }
  };

  const cancelSave = () => {
    setShowConfirmDialog(false);
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value, type } = e.target;
    const checked = (e.target as HTMLInputElement).checked;

    // Gestione speciale per isSuperAdmin
    if (name === "isSuperAdmin") {
      const isCurrentlySuperAdmin = formData.isSuperAdmin;
      if (!isCurrentlySuperAdmin && checked) {
        // Stai per aggiungere Super Admin
        setPendingSuperAdminState(true);
        setShowSuperAdminConfirm(true);
        return;
      } else if (isCurrentlySuperAdmin && !checked) {
        // Stai per rimuovere Super Admin
        setPendingSuperAdminState(false);
        setShowSuperAdminConfirm(true);
        return;
      }
    }

    // Se Admin è selezionato e si cerca di selezionare Super Admin, deselezione Admin
    if (name === "isSuperAdmin" && checked && formData.isAdmin) {
      setFormData({
        ...formData,
        isAdmin: false,
        isSuperAdmin: checked,
      });
      return;
    }

    // Se Super Admin è selezionato e si cerca di selezionare Admin, previeni
    if (name === "isAdmin" && checked && formData.isSuperAdmin) {
      setError("Non è possibile selezionare Admin se Super Admin è già selezionato");
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

  const handleSuperAdminConfirm = () => {
    setFormData({
      ...formData,
      isSuperAdmin: pendingSuperAdminState,
    });
    setShowSuperAdminConfirm(false);
    setError("");
  };

  const handleSuperAdminCancel = () => {
    setShowSuperAdminConfirm(false);
    setPendingSuperAdminState(false);
  };

  if (fetching || !user) {
    return <PageSkeleton />;
  }

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
          <h1 className="text-3xl font-bold">Modifica Utente {user.code}</h1>
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
                  className="px-4 py-2 h-10 border border-gray-300 rounded-lg text-sm hover:bg-gray-50 hover:border-gray-400 hover:shadow-md hover:scale-105 active:scale-100 transition-all duration-200 cursor-pointer"
                >
                  Annulla
                </button>
              </div>
            </div>
          </div>
        )}

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
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Password
            </label>
            <button
              type="button"
              onClick={() => setShowResetPasswordDialog(true)}
              disabled={resettingPassword}
              className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 hover:border-gray-400 hover:shadow-md hover:scale-105 active:scale-100 transition-all duration-200 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium text-gray-700 whitespace-nowrap"
            >
              {resettingPassword ? "Reset..." : "Reset Password"}
            </button>
            <p className="text-xs text-gray-500 mt-1">Invia una mail con una password temporanea per l'accesso</p>
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
                  disabled={formData.isSuperAdmin}
                  className="mr-2 w-4 h-4 text-gray-900 border-gray-300 rounded focus:ring-gray-500 disabled:opacity-50 disabled:cursor-not-allowed"
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
                Attiva l'opzione per indicare le aree e le mansioni in cui questo utente può operare.
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
                value={formData.companyId ?? ""}
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

          {successMessage && (
            <div className="bg-green-100 border border-green-400 text-green-700 px-4 py-3 rounded relative">
              {successMessage}
            </div>
          )}

          <div className="flex gap-4 pt-4">
            <button
              type="submit"
              disabled={loading || invalidFields.size > 0 || !!emailAvailabilityError || !!codiceFiscaleAvailabilityError || !!error}
              className="px-4 py-2 bg-gray-900 text-white rounded-lg hover:bg-gray-800 hover:shadow-lg hover:scale-105 active:scale-100 transition-all duration-200 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-gray-900 disabled:hover:shadow-none"
            >
              {loading ? "Salvataggio..." : "Salva Modifiche"}
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

        <ConfirmEditDialog
          isOpen={showConfirmDialog}
          title="Conferma Modifiche Utente di Gestione"
          oldData={originalData}
          newData={formData}
          fieldLabels={fieldLabels}
          valueFormatters={{
            companyId: (value) => {
              if (!value) return "-";
              const company = companies.find((c) => c.id === value);
              return company?.ragioneSociale ?? value;
            },
          }}
          onConfirm={confirmSave}
          onCancel={cancelSave}
        />

        <ConfirmDialog
          isOpen={showResetPasswordDialog}
          title="Reset Password"
          message="La password verrà resettata e inviata all'indirizzo email dell'utente. L'utente dovrà cambiarla al primo accesso."
          onConfirm={handleResetPassword}
          onCancel={() => setShowResetPasswordDialog(false)}
        />
      </div>
    </DashboardShell>
  );
}

