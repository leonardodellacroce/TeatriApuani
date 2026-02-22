"use client";

import Container from "@/components/Container";
import Navbar from "@/components/Navbar";
import { signIn } from "next-auth/react";
import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";

const ACCOUNT_LOCKED_MSG =
  "Account temporaneamente bloccato. Riprova più tardi o contatta l'amministratore.";

const USER_DEACTIVATED_MSG = "Utente disattivato.";

const FORGOT_PASSWORD_SUCCESS_MSG =
  "Se l'indirizzo email è registrato, riceverai una mail con la nuova password provvisoria. Controlla anche la cartella spam.";

export default function Login() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [rememberMe, setRememberMe] = useState(true);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [loginFailed, setLoginFailed] = useState(false);
  const [isAccountLocked, setIsAccountLocked] = useState(false);
  const [isSuperAdminRecovery, setIsSuperAdminRecovery] = useState(false);
  const [forgotPasswordLoading, setForgotPasswordLoading] = useState(false);
  const [forgotPasswordMessage, setForgotPasswordMessage] = useState("");

  useEffect(() => {
    const err = searchParams.get("error");
    const code = searchParams.get("code");
    if (err?.toUpperCase().includes("DEACTIVATED") || code?.toUpperCase().includes("DEACTIVATED")) {
      setError(USER_DEACTIVATED_MSG);
      setIsAccountLocked(false);
      setIsSuperAdminRecovery(false);
    } else if (
      err?.toUpperCase().includes("SUPERADMIN") ||
      code?.toUpperCase().includes("SUPERADMIN") ||
      err?.toLowerCase().includes("recupero account notificata")
    ) {
      setError(FORGOT_PASSWORD_SUCCESS_MSG);
      setIsAccountLocked(true);
      setIsSuperAdminRecovery(true);
      setLoginFailed(true);
    } else if (
      err?.toUpperCase().includes("LOCKED") ||
      code?.toUpperCase().includes("LOCKED") ||
      err?.toLowerCase().includes("bloccato")
    ) {
      setError(ACCOUNT_LOCKED_MSG);
      setIsAccountLocked(true);
      setIsSuperAdminRecovery(false);
      setLoginFailed(true);
    }
  }, [searchParams]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setForgotPasswordMessage("");
    setLoading(true);

    try {
      const result = await signIn("credentials", {
        email,
        password,
        rememberMe: String(rememberMe),
        redirect: false,
      });

      if (result?.error || result?.code) {
        const errStr = String(result.error || "");
        const codeStr = String(result.code || "");
        const isDeactivated =
          errStr.toUpperCase().includes("DEACTIVATED") ||
          codeStr.toUpperCase().includes("DEACTIVATED") ||
          errStr.toLowerCase().includes("disattivato");
        const isSuperAdminRecovery =
          errStr.toUpperCase().includes("SUPERADMIN") ||
          codeStr.toUpperCase().includes("SUPERADMIN") ||
          errStr.toLowerCase().includes("recupero account notificata");
        const isLocked =
          errStr.toUpperCase().includes("LOCKED") ||
          codeStr.toUpperCase().includes("LOCKED") ||
          errStr.toLowerCase().includes("bloccato");
        setLoginFailed(true);
        setIsAccountLocked(isLocked || isSuperAdminRecovery);
        setIsSuperAdminRecovery(isSuperAdminRecovery);
        setError(
          isDeactivated
            ? USER_DEACTIVATED_MSG
            : isSuperAdminRecovery
              ? FORGOT_PASSWORD_SUCCESS_MSG
              : isLocked
                ? ACCOUNT_LOCKED_MSG
                : "Credenziali non valide"
        );
      } else {
        setLoginFailed(false);
        setIsAccountLocked(false);
        setIsSuperAdminRecovery(false);
        // Aspetta che la sessione si aggiorni e controlla il flag
        router.refresh();
        
        // Aspetta un momento per permettere alla sessione di aggiornarsi
        setTimeout(async () => {
          try {
            const sessionRes = await fetch("/api/auth/session");
            const session = await sessionRes.json();
            const mustChangePassword = (session?.user as any)?.mustChangePassword;
            console.log("[login] Session mustChangePassword:", mustChangePassword, "Type:", typeof mustChangePassword);
            
            if (mustChangePassword === true) {
              console.log("[login] Redirecting to change-password");
              router.push("/change-password");
            } else {
              console.log("[login] Redirecting to dashboard");
              router.push("/dashboard");
            }
          } catch (err) {
            console.error("Error checking session:", err);
            router.push("/dashboard");
          }
        }, 500);
      }
    } catch (err) {
      setError("Si è verificato un errore");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-white text-gray-900">
      <Navbar />
      <Container>
        <div className="min-h-[calc(100vh-4rem)] flex items-center justify-center">
          <div className="w-full max-w-md space-y-8">
            <div>
              <h1 className="text-4xl font-bold text-center mb-8 text-gray-900">Login</h1>
            </div>
            <form onSubmit={handleSubmit} className="space-y-6">
              <div>
                <label
                  htmlFor="email"
                  className="block text-sm font-medium text-gray-700 mb-2"
                >
                  Email
                </label>
                <input
                  id="email"
                  name="email"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full px-4 py-2 h-10 border border-gray-300 rounded-lg text-base bg-white text-gray-900 focus:ring-2 focus:ring-gray-500 focus:border-transparent"
                  placeholder="nome@esempio.com"
                />
              </div>
              <div>
                <label
                  htmlFor="password"
                  className="block text-sm font-medium text-gray-700 mb-2"
                >
                  Password
                </label>
                <input
                  id="password"
                  name="password"
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full px-4 py-2 h-10 border border-gray-300 rounded-lg text-base bg-white text-gray-900 focus:ring-2 focus:ring-gray-500 focus:border-transparent"
                  placeholder="••••••••"
                />
              </div>
              <div className="flex items-center gap-2">
                <input
                  id="rememberMe"
                  name="rememberMe"
                  type="checkbox"
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                  className="h-4 w-4 rounded border-gray-300 text-gray-900 focus:ring-gray-500"
                />
                <label htmlFor="rememberMe" className="text-sm text-gray-700 cursor-pointer">
                  Ricordami (resta connesso per 30 giorni)
                </label>
              </div>
              {error && (
                <div
                  className={`text-sm ${
                    isSuperAdminRecovery ? "text-green-600 bg-green-50 p-3 rounded-lg" : "text-red-600"
                  }`}
                >
                  {error}
                </div>
              )}
              {loginFailed && !isAccountLocked && !isSuperAdminRecovery && (
                <div className="text-center">
                  <button
                    type="button"
                    onClick={async () => {
                      if (!email.trim()) {
                        setError("Inserisci l'email per richiedere il reset della password");
                        return;
                      }
                      setForgotPasswordMessage("");
                      setForgotPasswordLoading(true);
                      try {
                        const res = await fetch("/api/auth/forgot-password", {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ email: email.trim() }),
                        });
                        const data = await res.json();
                        setForgotPasswordMessage(
                          data.message || FORGOT_PASSWORD_SUCCESS_MSG
                        );
                      } catch {
                        setForgotPasswordMessage("Errore di connessione. Riprova.");
                      } finally {
                        setForgotPasswordLoading(false);
                      }
                    }}
                    disabled={forgotPasswordLoading}
                    className="text-sm text-gray-600 hover:text-gray-900 underline disabled:opacity-50"
                  >
                    {forgotPasswordLoading ? "Invio in corso..." : "Ho dimenticato la password"}
                  </button>
                </div>
              )}
              {forgotPasswordMessage && (
                <div className="text-green-600 text-sm bg-green-50 p-3 rounded-lg">
                  {forgotPasswordMessage}
                </div>
              )}
              <button
                type="submit"
                disabled={loading}
                className="w-full flex justify-center py-3 px-4 border border-transparent rounded-lg shadow-sm text-sm font-medium text-white bg-gray-900 hover:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-500 disabled:opacity-50"
              >
                {loading ? "Accesso in corso..." : "Accedi"}
              </button>
            </form>
          </div>
        </div>
      </Container>
    </div>
  );
}
