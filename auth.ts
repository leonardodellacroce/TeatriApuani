import NextAuth from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcrypt";

export const { auth, handlers, signIn, signOut } = NextAuth({
  secret: process.env.NEXTAUTH_SECRET,
  providers: [
    CredentialsProvider({
      name: "Credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          return null;
        }

        const email = credentials.email as string;
        const password = credentials.password as string;

        const user = await prisma.user.findUnique({
          where: {
            email,
          },
        });

        if (!user || !user.password) {
          return null;
        }

        const isPasswordValid = await bcrypt.compare(
          password,
          user.password
        );

        if (!isPasswordValid) {
          return null;
        }

        // Leggi mustChangePassword dal database (potrebbe non esistere se la migrazione non è stata eseguita)
        const mustChangePassword = (user as any).mustChangePassword;
        console.log("[auth] User mustChangePassword value:", mustChangePassword, "Type:", typeof mustChangePassword);

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          image: user.image,
          role: user.role || "",
          isSuperAdmin: user.isSuperAdmin,
          isAdmin: user.isAdmin,
          isResponsabile: user.isResponsabile,
          isWorker: (user as any).isWorker === true,
          companyId: user.companyId,
          // Se il campo non esiste nel database, assume false (retrocompatibilità)
          mustChangePassword: mustChangePassword === true,
        };
      },
    }),
  ],
  session: {
    strategy: "jwt",
  },
  pages: {
    signIn: "/login",
  },
  callbacks: {
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

