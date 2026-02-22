import NextAuth from "next-auth";
import { CredentialsSignin } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcrypt";
import { getSystemSettings } from "@/lib/settings";
import { notifySuperAdminsLockedAccounts } from "@/lib/notifications";
import { sendEmail } from "@/lib/email";
import { passwordResetEmail } from "@/lib/email-templates";
import crypto from "crypto";

function generateTempPassword(length = 12): string {
  const chars = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789";
  let result = "";
  const bytes = crypto.randomBytes(length);
  for (let i = 0; i < length; i++) {
    result += chars[bytes[i] % chars.length];
  }
  return result;
}

export const { auth, handlers, signIn, signOut } = NextAuth({
  secret: process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET,
  providers: [
    CredentialsProvider({
      name: "Credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
        rememberMe: { label: "Ricordami", type: "text" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          return null;
        }

        const email = (credentials.email as string).trim().toLowerCase();
        const password = (credentials.password as string).trim();
        if (!email || !password) return null;

        let settings: Record<string, string> = {};
        try {
          settings = await getSystemSettings();
        } catch {
          settings = {};
        }

        const user = await prisma.user.findFirst({
          where: {
            email: { equals: email, mode: "insensitive" },
          },
        });

        if (!user || !user.password) {
          return null;
        }

        if (!user.isActive || user.isArchived) {
          return { error: "USER_DEACTIVATED" } as any;
        }

        const lockedUntil = (user as any).lockedUntil as Date | null | undefined;
        const isSuperAdmin = user.isSuperAdmin === true;
        if (lockedUntil && new Date(lockedUntil) > new Date() && !isSuperAdmin) {
          return { error: "ACCOUNT_LOCKED" } as any;
        }

        const isPasswordValid = await bcrypt.compare(password, user.password);

        if (!isPasswordValid) {
          const maxAttempts = parseInt(settings.lockout_max_attempts || "5", 10);
          const currentAttempts = ((user as any).failedLoginAttempts as number) ?? 0;
          const newAttempts = currentAttempts + 1;

          if (isSuperAdmin) {
            // Super admin: dopo maxAttempts invia mail recupero automatica, non bloccare
            if (newAttempts >= maxAttempts) {
              const tempPassword = generateTempPassword();
              const hashedPassword = await bcrypt.hash(tempPassword, 10);
              try {
                await prisma.user.update({
                  where: { id: user.id },
                  data: {
                    password: hashedPassword,
                    mustChangePassword: true,
                    failedLoginAttempts: 0,
                  },
                });
              } catch (err: any) {
                const msg = String(err?.message || "").toLowerCase();
                if (msg.includes("mustchangepassword") || msg.includes("unknown field") || msg.includes("unknown column")) {
                  await prisma.user.update({
                    where: { id: user.id },
                    data: { password: hashedPassword, failedLoginAttempts: 0 },
                  });
                } else {
                  throw err;
                }
              }
              const userName = [user.name, user.cognome].filter(Boolean).join(" ") || user.email || "Utente";
              const { subject, html, text } = passwordResetEmail({ userName, tempPassword });
              await sendEmail({ to: user.email, subject, html, text }).catch((e) =>
                console.error("[auth] SuperAdmin recovery email:", e)
              );
              return { error: "SUPERADMIN_RECOVERY_SENT" } as any;
            }
            await prisma.user.update({
              where: { id: user.id },
              data: { failedLoginAttempts: newAttempts },
            });
          } else {
            // Utenti normali: blocco dopo maxAttempts
            const lockMinutes = parseInt(settings.lockout_duration_minutes || "15", 10);
            const updateData: Record<string, unknown> = {
              failedLoginAttempts: newAttempts,
            };
            if (newAttempts >= maxAttempts) {
              const lockUntil = new Date();
              lockUntil.setMinutes(lockUntil.getMinutes() + lockMinutes);
              updateData.lockedUntil = lockUntil;
            }

            await prisma.user.update({
              where: { id: user.id },
              data: updateData,
            });

            if (updateData.lockedUntil) {
              notifySuperAdminsLockedAccounts().catch((e) =>
                console.error("[auth] notifySuperAdminsLockedAccounts:", e)
              );
              return { error: "ACCOUNT_LOCKED" } as any;
            }
          }
          return null;
        }

        await prisma.user.update({
          where: { id: user.id },
          data: {
            failedLoginAttempts: 0,
            lockedUntil: null,
          },
        });

        const mustChangePasswordDb = (user as any).mustChangePassword === true;
        const lastPasswordChangeAt = (user as any).lastPasswordChangeAt as Date | null | undefined;
        const intervalDays = parseInt(settings.password_change_interval_days || "0", 10);

        let mustChangePassword = mustChangePasswordDb;
        if (!mustChangePasswordDb && intervalDays > 0 && lastPasswordChangeAt) {
          const lastChange = new Date(lastPasswordChangeAt);
          const expiry = new Date(lastChange);
          expiry.setDate(expiry.getDate() + intervalDays);
          if (new Date() > expiry) {
            mustChangePassword = true;
          }
        }

        const role =
          user.role ||
          (user.isSuperAdmin ? "SUPER_ADMIN" : user.isAdmin ? "ADMIN" : user.isResponsabile ? "RESPONSABILE" : "");
        const rememberMe = credentials.rememberMe === "true" || credentials.rememberMe === true;
        return {
          id: user.id,
          email: user.email,
          name: user.name,
          image: user.image,
          role,
          isSuperAdmin: user.isSuperAdmin,
          isAdmin: user.isAdmin,
          isResponsabile: user.isResponsabile,
          isWorker: (user as any).isWorker === true,
          companyId: user.companyId,
          mustChangePassword,
          rememberMe,
        };
      },
    }),
  ],
  session: {
    strategy: "jwt",
    maxAge: 30 * 24 * 60 * 60,
  },
  pages: {
    signIn: "/login",
    error: "/login",
  },
  callbacks: {
    async signIn({ user }) {
      if ((user as any)?.error === "ACCOUNT_LOCKED") {
        const err = new CredentialsSignin("Account temporaneamente bloccato");
        err.code = "AccountLocked";
        throw err;
      }
      if ((user as any)?.error === "USER_DEACTIVATED") {
        const err = new CredentialsSignin("Utente disattivato");
        err.code = "UserDeactivated";
        throw err;
      }
      if ((user as any)?.error === "SUPERADMIN_RECOVERY_SENT") {
        const err = new CredentialsSignin("Procedura di recupero account notificata");
        err.code = "SuperAdminRecoverySent";
        throw err;
      }
      return true;
    },
    async jwt({ token, user, trigger }) {
      if (user) {
        token.id = user.id;
        token.role = (user as any).role;
        token.isSuperAdmin = (user as any).isSuperAdmin;
        token.isAdmin = (user as any).isAdmin;
        token.isResponsabile = (user as any).isResponsabile;
        token.isWorker = (user as any).isWorker;
        token.companyId = (user as any).companyId;
        token.mustChangePassword = (user as any).mustChangePassword;
        const rememberMe = (user as any).rememberMe === true;
        const settings = await getSystemSettings();
        const rememberDays = parseInt(settings.session_remember_me_days || "30", 10);
        const noRememberHours = parseInt(settings.session_no_remember_hours || "24", 10);
        const maxAgeSeconds = rememberMe
          ? rememberDays * 24 * 60 * 60
          : noRememberHours * 60 * 60;
        token.exp = Math.floor(Date.now() / 1000) + maxAgeSeconds;
      }
      
      // Nota: non aggiorniamo mustChangePassword/isWorker dal DB ad ogni richiesta
      // (causava 1 query DB per ogni page load). I valori dal login restano validi
      // fino al prossimo login. Per forzare aggiornamento: logout + login.
      return token;
    },
    async session({ session, token }) {
      if (session.user && token) {
        session.user.id = (token.id as string) || (token.sub as string) || "";
        (session.user as any).role = token.role as string;
        (session.user as any).isSuperAdmin = token.isSuperAdmin as boolean;
        (session.user as any).isAdmin = token.isAdmin as boolean;
        (session.user as any).isResponsabile = token.isResponsabile as boolean;
        (session.user as any).isWorker = token.isWorker as boolean;
        (session.user as any).companyId = token.companyId as string;
        (session.user as any).mustChangePassword = token.mustChangePassword as boolean;
      }
      return session;
    },
  },
});

