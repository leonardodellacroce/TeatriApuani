import { getSystemSettings } from "./settings";

export async function validatePassword(password: string): Promise<{ valid: boolean; error?: string }> {
  const settings = await getSystemSettings();
  const minLength = parseInt(settings.password_min_length || "8", 10);
  const requireUppercase = settings.password_require_uppercase === "true";
  const requireNumber = settings.password_require_number === "true";
  const requireSpecial = settings.password_require_special === "true";

  if (password.length < minLength) {
    return { valid: false, error: `La password deve essere di almeno ${minLength} caratteri` };
  }
  if (requireUppercase && !/[A-Z]/.test(password)) {
    return { valid: false, error: "La password deve contenere almeno una lettera maiuscola" };
  }
  if (requireNumber && !/[0-9]/.test(password)) {
    return { valid: false, error: "La password deve contenere almeno un numero" };
  }
  if (requireSpecial && !/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)) {
    return { valid: false, error: "La password deve contenere almeno un carattere speciale (!@#$%^&*)" };
  }
  return { valid: true };
}
