import crypto from "node:crypto";

const MIN_DUZINA = 10;

export function hashLozinke(lozinka: string, salt = crypto.randomBytes(16).toString("hex")): string {
  const izvedeni = crypto.scryptSync(lozinka, salt, 64).toString("hex");
  return `scrypt$${salt}$${izvedeni}`;
}

export function provjeriLozinku(lozinka: string, sacuvaniHash: string): boolean {
  const [, salt, izvedeniHash] = sacuvaniHash.split("$");
  if (!salt || !izvedeniHash) return false;
  const izvedeni = crypto.scryptSync(lozinka, salt, 64);
  const sacuvaniBuffer = Buffer.from(izvedeniHash, "hex");
  return sacuvaniBuffer.length === izvedeni.length && crypto.timingSafeEqual(sacuvaniBuffer, izvedeni);
}

export function lozinkaJeDovoljnoDugacka(lozinka: string): boolean {
  return typeof lozinka === "string" && lozinka.length >= MIN_DUZINA;
}

export { MIN_DUZINA as MINIMALNA_DUZINA_LOZINKE };
