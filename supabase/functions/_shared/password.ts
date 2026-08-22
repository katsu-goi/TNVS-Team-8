import * as bcrypt from "npm:bcryptjs@^3.0.2";

/** Compares a raw password against a stored BCrypt hash (Spring BCryptPasswordEncoder compatible). */
export async function verifyPassword(raw: string, hash: string): Promise<boolean> {
  try {
    return await bcrypt.compare(raw, hash);
  } catch {
    return false;
  }
}

export async function hashPassword(raw: string): Promise<string> {
  const salt = await bcrypt.genSalt(12);
  return await bcrypt.hash(raw, salt);
}