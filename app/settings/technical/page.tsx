"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import DashboardShell from "@/components/DashboardShell";
import PageSkeleton from "@/components/PageSkeleton";
import { useSession } from "next-auth/react";

const DEFAULT_SETTINGS: Record<string, string> = {
  password_change_interval_days: "90",
  session_remember_me_days: "30",
  session_no_remember_hours: "24",
  password_min_length: "8",
  password_require_uppercase: "true",
  password_require_number: "true",
  password_require_special: "false",
  lockout_max_attempts: "5",
  lockout_duration_minutes: "15",
};

export default function TechnicalSettingsPage() {
  const router = useRouter();
  const { data: session, status } = useSession();
  const [settings, setSettings] = useState<Record<string, string>>(DEFAULT_SETTINGS);
  const [initialSettings, setInitialSettings] = useState<Record<string, string>>(DEFAULT_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [unlockMessage, setUnlockMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [settingsSectionLocked, setSettingsSectionLocked] = useState(true);
  const [showUnlockModal, setShowUnlockModal] = useState(false);
  const [unlockPassword, setUnlockPassword] = useState("");
  const [unlockPasswordError, setUnlockPasswordError] = useState("");
  const [verifyingPassword, setVerifyingPassword] = useState(false);
  const [lockedAccounts, setLockedAccounts] = useState<Array<{
    id: string;
    email: string;
    name: string | null;
    cognome: string | null;
    code: string;
    lockedUntil: string | null;
    failedLoginAttempts: number;
  }>>([]);
  const [unlockDialogUser, setUnlockDialogUser] = useState<typeof lockedAccounts[0] | null>(null);
  const [unlockDialogStep, setUnlockDialogStep] = useState<"confirm" | "edit">("confirm");
  const [unlockDialogEmail, setUnlockDialogEmail] = useState("");
  const [unlockDialogSaving, setUnlockDialogSaving] = useState(false);
  const [unlockDialogError, setUnlockDialogError] = useState("");

  useEffect(() => {
    if (status === "loading") return;
    if (!session?.user || (session.user as any).role !== "SUPER_ADMIN") {
      router.push("/settings");
      return;
    }
    fetchSettings();
  }, [session, status, router]);

  const fetchSettings = async () => {
    try {
      const [settingsRes, lockedRes] = await Promise.all([
        fetch("/api/settings/technical"),
        fetch("/api/settings/technical/locked-accounts"),
      ]);
      if (settingsRes.ok) {
        const data = await settingsRes.json();
        const rest = data;
        const merged = { ...DEFAULT_SETTINGS, ...rest };
        setSettings(merged);
        setInitialSettings(merged);
      } else if (settingsRes.status === 403) {
        router.push("/settings");
      }
      if (lockedRes.ok) {
        const locked = await lockedRes.json();
        setLockedAccounts(locked);
      }
    } catch (err) {
      console.error(err);
      setError("Errore nel caricamento delle impostazioni");
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSuccess("");
    setSaving(true);
    try {
      const body: Record<string, string> = { ...settings };
      const res = await fetch("/api/settings/technical", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        const data = await res.json();
        const rest = data;
        const merged = { ...DEFAULT_SETTINGS, ...rest };
        setSettings(merged);
        setInitialSettings(merged);
        setSuccess("Impostazioni salvate con successo");
      } else {
        const data = await res.json();
        setError(data.error || "Errore nel salvataggio");
      }
    } catch (err) {
      setError("Errore nel salvataggio");
    } finally {
      setSaving(false);
    }
  };

  const handleUnlockSection = async (e?: React.FormEvent) => {
    e?.preventDefault();
    setUnlockPasswordError("");
    if (!unlockPassword.trim()) {
      setUnlockPasswordError("Inserire la password");
      return;
    }
    setVerifyingPassword(true);
    try {
      const res = await fetch("/api/settings/technical/verify-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: unlockPassword }),
      });
      if (res.ok) {
        setSettingsSectionLocked(false);
        setShowUnlockModal(false);
        setUnlockPassword("");
      } else {
        setUnlockPasswordError("Password non corretta");
      }
    } catch {
      setUnlockPasswordError("Errore di connessione");
    } finally {
      setVerifyingPassword(false);
    }
  };

  const closeUnlockModal = () => {
    setShowUnlockModal(false);
    setUnlockPassword("");
    setUnlockPasswordError("");
  };

  const openUnlockDialog = (u: (typeof lockedAccounts)[0]) => {
    setUnlockDialogUser(u);
    setUnlockDialogStep("confirm");
    setUnlockDialogEmail(u.email);
    setUnlockDialogError("");
  };

  const closeUnlockDialog = () => {
    setUnlockDialogUser(null);
    setUnlockDialogStep("confirm");
    setUnlockDialogEmail("");
    setUnlockDialogError("");
    setUnlockDialogSaving(false);
  };

  const handleUnlockConfirmYes = async () => {
    if (!unlockDialogUser) return;
    setUnlockDialogSaving(true);
    setUnlockDialogError("");
    try {
      const res = await fetch("/api/settings/technical/unlock-account", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: unlockDialogUser.id, sendEmail: true }),
      });
      const data = await res.json();
      if (res.ok) {
        setUnlockMessage({ type: "success", text: data.message || "Account sbloccato" });
        setLockedAccounts((prev) => prev.filter((u) => u.id !== unlockDialogUser.id));
        window.dispatchEvent(new Event("notificationsUpdated"));
        closeUnlockDialog();
      } else {
        setUnlockDialogError(data.error || "Errore nello sblocco");
      }
    } catch {
      setUnlockDialogError("Errore di connessione");
    } finally {
      setUnlockDialogSaving(false);
    }
  };

  const handleUnlockConfirmNo = () => {
    setUnlockDialogStep("edit");
  };

  const handleUnlockSaveNewEmail = async () => {
    if (!unlockDialogUser) return;
    const trimmed = unlockDialogEmail.trim();
    if (!trimmed || !trimmed.includes("@")) {
      setUnlockDialogError("Inserisci un indirizzo email valido");
      return;
    }
    setUnlockDialogSaving(true);
    setUnlockDialogError("");
    try {
      const res = await fetch("/api/settings/technical/unlock-account", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: unlockDialogUser.id,
          sendEmail: true,
          newEmail: trimmed !== unlockDialogUser.email ? trimmed : undefined,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setUnlockMessage({ type: "success", text: data.message || "Account sbloccato" });
        setLockedAccounts((prev) => prev.filter((u) => u.id !== unlockDialogUser.id));
        window.dispatchEvent(new Event("notificationsUpdated"));
        closeUnlockDialog();
      } else {
        setUnlockDialogError(data.error || "Errore nello sblocco");
      }
    } catch {
      setUnlockDialogError("Errore di connessione");
    } finally {
      setUnlockDialogSaving(false);
    }
  };

  const updateSetting = (key: string, value: string) => {
    setSettings((prev) => ({ ...prev, [key]: value }));
  };

  const toggleBool = (key: string) => {
    const current = settings[key] === "true";
    updateSetting(key, current ? "false" : "true");
  };

  const hasChanges = Object.keys(settings).some((k) => settings[k] !== initialSettings[k]);

  if (status === "loading" || loading) {
    return <PageSkeleton />;
  }

  return (
    <DashboardShell>
      <div>
        <div className="flex items-center gap-3 mb-6">
          <button
            onClick={() => router.push("/settings")}
            aria-label="Indietro"
            className="h-10 w-10 inline-flex items-center justify-center rounded-lg bg-gray-900 text-white hover:bg-gray-800"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <h1 className="text-3xl font-bold">Impostazioni tecniche</h1>
        </div>

        <form onSubmit={handleSave} className="max-w-xl space-y-8">
          {error && (
            <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">{error}</div>
          )}
          {success && (
            <div className="p-4 bg-green-50 border border-green-200 rounded-lg text-green-700 text-sm">{success}</div>
          )}

          {/* Password e Sessione - sezione bloccabile */}
          <div className="bg-white rounded-lg shadow border border-gray-200 p-6 relative">
            <div className={settingsSectionLocked ? "pointer-events-none opacity-75" : ""}>
              <h2 className="text-lg font-semibold mb-4">Password</h2>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Intervallo cambio password (giorni)
                  </label>
                  <input
                    type="number"
                    min="0"
                    max="365"
                    value={settings.password_change_interval_days}
                    onChange={(e) => updateSetting("password_change_interval_days", e.target.value)}
                    disabled={settingsSectionLocked}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-900 disabled:bg-gray-100"
                  />
                  <p className="text-xs text-gray-500 mt-1">Dopo quanti giorni richiedere il cambio password (0 = mai)</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Lunghezza minima (caratteri)</label>
                  <input
                    type="number"
                    min="6"
                    max="32"
                    value={settings.password_min_length}
                    onChange={(e) => updateSetting("password_min_length", e.target.value)}
                    disabled={settingsSectionLocked}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-900 disabled:bg-gray-100"
                  />
                </div>
                <div className="space-y-2">
                  <label className="block text-sm font-medium text-gray-700">Complessità</label>
                  <label className={`flex items-center gap-2 ${settingsSectionLocked ? "" : "cursor-pointer"}`}>
                    <input
                      type="checkbox"
                      checked={settings.password_require_uppercase === "true"}
                      onChange={() => toggleBool("password_require_uppercase")}
                      disabled={settingsSectionLocked}
                      className="rounded border-gray-300"
                    />
                    <span className="text-sm">Richiedi almeno una maiuscola</span>
                  </label>
                  <label className={`flex items-center gap-2 ${settingsSectionLocked ? "" : "cursor-pointer"}`}>
                    <input
                      type="checkbox"
                      checked={settings.password_require_number === "true"}
                      onChange={() => toggleBool("password_require_number")}
                      disabled={settingsSectionLocked}
                      className="rounded border-gray-300"
                    />
                    <span className="text-sm">Richiedi almeno un numero</span>
                  </label>
                  <label className={`flex items-center gap-2 ${settingsSectionLocked ? "" : "cursor-pointer"}`}>
                    <input
                      type="checkbox"
                      checked={settings.password_require_special === "true"}
                      onChange={() => toggleBool("password_require_special")}
                      disabled={settingsSectionLocked}
                      className="rounded border-gray-300"
                    />
                    <span className="text-sm">Richiedi almeno un carattere speciale (!@#$%^&*)</span>
                  </label>
                </div>
              </div>

            <div className="mt-6 pt-6 border-t border-gray-200">
              <h2 className="text-lg font-semibold mb-4">Sessione</h2>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Durata con Ricordami attivo (giorni)
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="365"
                    value={settings.session_remember_me_days}
                    onChange={(e) => updateSetting("session_remember_me_days", e.target.value)}
                    disabled={settingsSectionLocked}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-900 disabled:bg-gray-100"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Durata senza Ricordami (ore)
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="168"
                    value={settings.session_no_remember_hours}
                    onChange={(e) => updateSetting("session_no_remember_hours", e.target.value)}
                    disabled={settingsSectionLocked}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-900 disabled:bg-gray-100"
                  />
                </div>
              </div>
            </div>

            <div className="mt-6 pt-6 border-t border-gray-200">
              <h2 className="text-lg font-semibold mb-4">Blocco account</h2>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Tentativi falliti prima del blocco
                  </label>
                  <input
                    type="number"
                    min="3"
                    max="20"
                    value={settings.lockout_max_attempts}
                    onChange={(e) => updateSetting("lockout_max_attempts", e.target.value)}
                    disabled={settingsSectionLocked}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-900 disabled:bg-gray-100"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Durata blocco (minuti)
                  </label>
                  <input
                    type="number"
                    min="5"
                    max="1440"
                    value={settings.lockout_duration_minutes}
                    onChange={(e) => updateSetting("lockout_duration_minutes", e.target.value)}
                    disabled={settingsSectionLocked}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-900 disabled:bg-gray-100"
                  />
                </div>
              </div>
            </div>
            </div>

            {/* Salva impostazioni e Blocca/Sblocca sulla stessa riga */}
            <div className="mt-6 pt-6 border-t border-gray-200 flex flex-wrap items-center justify-between gap-4">
              <button
                type="submit"
                disabled={saving || !hasChanges}
                className="px-6 py-2 bg-gray-900 text-white rounded-lg hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {saving ? "Salvataggio..." : "Salva impostazioni"}
              </button>
              {settingsSectionLocked ? (
                <button
                  type="button"
                  onClick={() => setShowUnlockModal(true)}
                  className="px-4 py-2 bg-gray-900 text-white rounded-lg hover:bg-gray-800"
                >
                  Sblocca
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => setSettingsSectionLocked(true)}
                  className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50"
                >
                  Blocca
                </button>
              )}
            </div>
          </div>

          {/* Account bloccati */}
          <div className="bg-white rounded-lg shadow border border-gray-200 p-6">
            <h2 className="text-lg font-semibold mb-4">Account bloccati</h2>
            <div className="space-y-4">
              {lockedAccounts.length > 0 ? (
                  <ul className="space-y-2">
                    {lockedAccounts.map((u) => {
                      const displayName = [u.name, u.cognome].filter(Boolean).join(" ") || u.email || u.code;
                      const lockedUntilStr = u.lockedUntil
                        ? new Date(u.lockedUntil).toLocaleString("it-IT", {
                            dateStyle: "short",
                            timeStyle: "short",
                          })
                        : "-";
                      return (
                        <li
                          key={u.id}
                          className="flex items-center justify-between gap-4 py-2 px-3 bg-gray-50 rounded-lg"
                        >
                          <div className="min-w-0 flex-1">
                            <span className="font-medium text-gray-900 truncate block">{displayName}</span>
                            <span className="text-sm text-gray-500">{u.email}</span>
                            <span className="text-xs text-gray-400 ml-2">Fino alle {lockedUntilStr}</span>
                          </div>
                          <button
                            type="button"
                            onClick={() => openUnlockDialog(u)}
                            className="shrink-0 px-3 py-1.5 bg-orange-600 text-white text-sm rounded-lg hover:bg-orange-700"
                          >
                            Sblocca
                          </button>
                        </li>
                      );
                    })}
                  </ul>
              ) : (
                <p className="text-sm text-gray-500">Nessun account attualmente bloccato</p>
              )}
              {unlockMessage && (
                <p className={`text-sm ${unlockMessage.type === "success" ? "text-green-600" : "text-red-600"}`}>
                  {unlockMessage.text}
                </p>
              )}
            </div>
          </div>
        </form>

        {/* Modal sblocco account - conferma email e invio password */}
        {unlockDialogUser && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
            <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6 border border-gray-200">
              <h2 className="text-xl font-bold text-gray-900 mb-3">Sblocca account</h2>
              {unlockDialogStep === "confirm" ? (
                <>
                  <p className="text-gray-600 text-sm mb-2">
                    Indirizzo email dell&apos;utente: <strong>{unlockDialogUser.email}</strong>
                  </p>
                  <p className="text-gray-600 text-sm mb-4">
                    Confermi che questo indirizzo mail è ancora valido?
                  </p>
                  {unlockDialogError && (
                    <p className="text-sm text-red-600 mb-4">{unlockDialogError}</p>
                  )}
                  <div className="flex gap-3 justify-end">
                    <button
                      type="button"
                      onClick={closeUnlockDialog}
                      className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50"
                    >
                      Annulla
                    </button>
                    <button
                      type="button"
                      onClick={handleUnlockConfirmNo}
                      disabled={unlockDialogSaving}
                      className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                    >
                      No
                    </button>
                    <button
                      type="button"
                      onClick={handleUnlockConfirmYes}
                      disabled={unlockDialogSaving}
                      className="px-4 py-2 bg-gray-900 text-white rounded-lg hover:bg-gray-800 disabled:opacity-50"
                    >
                      {unlockDialogSaving ? "..." : "Sì"}
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <p className="text-gray-600 text-sm mb-2">Modifica l&apos;indirizzo email e salva per inviare la password provvisoria al nuovo indirizzo.</p>
                  <input
                    type="email"
                    value={unlockDialogEmail}
                    onChange={(e) => {
                      setUnlockDialogEmail(e.target.value);
                      setUnlockDialogError("");
                    }}
                    placeholder="nuovo@email.com"
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-900 mb-4"
                  />
                  {unlockDialogError && (
                    <p className="text-sm text-red-600 mb-4">{unlockDialogError}</p>
                  )}
                  <div className="flex gap-3 justify-end">
                    <button
                      type="button"
                      onClick={() => setUnlockDialogStep("confirm")}
                      className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50"
                    >
                      Indietro
                    </button>
                    <button
                      type="button"
                      onClick={handleUnlockSaveNewEmail}
                      disabled={unlockDialogSaving}
                      className="px-4 py-2 bg-gray-900 text-white rounded-lg hover:bg-gray-800 disabled:opacity-50"
                    >
                      {unlockDialogSaving ? "Salvataggio..." : "Salva"}
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        )}

        {/* Modal sblocco sezione */}
        {showUnlockModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
            <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6 border border-gray-200">
              <h2 className="text-xl font-bold text-gray-900 mb-3">Sblocca sezione</h2>
              <p className="text-gray-600 text-sm mb-4">
                Inserisci la tua password per sbloccare la modifica delle impostazioni Password, Sessione e Blocco account.
              </p>
              <input
                type="password"
                placeholder="Password"
                value={unlockPassword}
                onChange={(e) => {
                  setUnlockPassword(e.target.value);
                  setUnlockPasswordError("");
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleUnlockSection();
                }}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-900 mb-4"
                autoComplete="current-password"
                autoFocus
              />
              {unlockPasswordError && (
                <p className="text-sm text-red-600 mb-4">{unlockPasswordError}</p>
              )}
              <div className="flex gap-3 justify-end">
                <button
                  type="button"
                  onClick={closeUnlockModal}
                  className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50"
                >
                  Annulla
                </button>
                <button
                  type="button"
                  onClick={() => handleUnlockSection()}
                  disabled={verifyingPassword}
                  className="px-4 py-2 bg-gray-900 text-white rounded-lg hover:bg-gray-800 disabled:opacity-50"
                >
                  {verifyingPassword ? "..." : "Conferma"}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </DashboardShell>
  );
}
