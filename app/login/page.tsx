"use client";

import Container from "@/components/Container";
import Navbar from "@/components/Navbar";
import { signIn, useSession } from "next-auth/react";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";

export default function Login() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const result = await signIn("credentials", {
        email,
        password,
        redirect: false,
      });

      if (result?.error) {
        setError("Credenziali non valide");
      } else {
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
    <div className="min-h-screen">
      <Navbar />
      <Container>
        <div className="min-h-[calc(100vh-4rem)] flex items-center justify-center">
          <div className="w-full max-w-md space-y-8">
            <div>
              <h1 className="text-4xl font-bold text-center mb-8">Login</h1>
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
                  className="w-full px-4 py-2 h-10 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-gray-500 focus:border-transparent"
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
                  className="w-full px-4 py-2 h-10 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-gray-500 focus:border-transparent"
                  placeholder="••••••••"
                />
              </div>
              {error && (
                <div className="text-red-600 text-sm">{error}</div>
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
