import { auth } from "@/auth";
import { getSystemSettings, setSystemSettings } from "@/lib/settings";
import { NextRequest, NextResponse } from "next/server";

const ALLOWED_KEYS = [
  "password_change_interval_days",
  "session_remember_me_days",
  "session_no_remember_hours",
  "password_min_length",
  "password_require_uppercase",
  "password_require_number",
  "password_require_special",
  "lockout_max_attempts",
  "lockout_duration_minutes",
];

export async function GET() {
  const session = await auth();
  if (!session?.user || (session.user as any).role !== "SUPER_ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const settings = await getSystemSettings();
  const { default_password_hash: _, ...safe } = settings;
  return NextResponse.json(safe);
}

export async function PATCH(req: NextRequest) {
  const session = await auth();
  if (!session?.user || (session.user as any).role !== "SUPER_ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const body = await req.json();
  const updates: Record<string, string> = {};
  for (const key of ALLOWED_KEYS) {
    if (body[key] !== undefined) {
      updates[key] = String(body[key]);
    }
  }
  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "Nessun campo valido da aggiornare" }, { status: 400 });
  }
  await setSystemSettings(updates);
  const settings = await getSystemSettings();
  const { default_password_hash: _2, ...safe } = settings;
  return NextResponse.json(safe);
}
