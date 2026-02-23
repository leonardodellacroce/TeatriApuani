import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";

const PUBLIC_PATHS = ["/login", "/change-password"];
const AUTH_API_PREFIX = "/api/auth";

export default async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Lascia passare API, static, _next
  if (pathname.startsWith(AUTH_API_PREFIX) || pathname.startsWith("/api/") || pathname.startsWith("/_next") || pathname.includes(".")) {
    return NextResponse.next();
  }

  // Su HTTPS (Vercel) NextAuth usa cookie __Secure-authjs.session-token
  const isSecure = req.url.startsWith("https://");
  const token = await getToken({
    req,
    secret: process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET,
    secureCookie: isSecure,
  });

  // Non autenticato: solo login e change-password (che reindirizza a login)
  if (!token) {
    if (PUBLIC_PATHS.includes(pathname)) {
      return NextResponse.next();
    }
    return NextResponse.redirect(new URL("/login", req.url));
  }

  // Autenticato con mustChangePassword: SOLO change-password
  const mustChangePassword = (token as { mustChangePassword?: boolean }).mustChangePassword === true;
  if (mustChangePassword) {
    if (pathname === "/change-password") {
      return NextResponse.next();
    }
    return NextResponse.redirect(new URL("/change-password", req.url));
  }

  // Autenticato senza mustChangePassword: redirect root e login a dashboard
  if (pathname === "/" || pathname === "/login") {
    return NextResponse.redirect(new URL("/dashboard", req.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - icon.png, apple-touch-icon, etc.
     */
    "/((?!_next/static|_next/image|favicon.ico|icon.png|apple-touch-icon).*)",
  ],
};
