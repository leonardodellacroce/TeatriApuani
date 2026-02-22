import { prisma } from "@/lib/prisma";

const DEFAULTS: Record<string, string> = {
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

let cache: Record<string, string> | null = null;
let cacheExpiry = 0;
const CACHE_TTL_MS = 10 * 1000; // 10 secondi (breve per evitare valori obsoleti su serverless)

export async function getSystemSettings(): Promise<Record<string, string>> {
  if (cache && Date.now() < cacheExpiry) {
    return { ...cache };
  }
  const rows = await prisma.systemSetting.findMany();
  cache = { ...DEFAULTS };
  for (const row of rows) {
    cache[row.key] = row.value;
  }
  cacheExpiry = Date.now() + CACHE_TTL_MS;
  return { ...cache };
}

export async function getSystemSetting(key: string): Promise<string> {
  const settings = await getSystemSettings();
  return settings[key] ?? DEFAULTS[key] ?? "";
}

export function invalidateSettingsCache() {
  cache = null;
}

export async function setSystemSetting(key: string, value: string): Promise<void> {
  await prisma.systemSetting.upsert({
    where: { key },
    create: { key, value },
    update: { value },
  });
  invalidateSettingsCache();
}

export async function setSystemSettings(updates: Record<string, string>): Promise<void> {
  for (const [key, value] of Object.entries(updates)) {
    await setSystemSetting(key, value);
  }
}
