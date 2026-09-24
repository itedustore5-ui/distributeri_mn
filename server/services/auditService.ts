import type { PoolClient } from "pg";
import { pool } from "../db.js";

// Jedini dnevnik promjena (nalaz B4, faza 4). Tabela `dogadjaj` se više ne puni — stari redovi
// ostaju u bazi i u bekapu, a `audit_log.dogadjaj_id` je za nove redove prazan.

type ZabiljeziInput = {
  korisnikId?: string | null;
  akcija: string;
  entitetTip: string;
  entitetId: string;
  stareVrijednosti?: Record<string, unknown> | null;
  noveVrijednosti?: Record<string, unknown> | null;
  ipAdresa?: string | null;
  userAgent?: string | null;
};

async function zabiljezi(klijent: PoolClient | typeof pool, ulaz: ZabiljeziInput) {
  await klijent.query(
    `insert into audit_log (korisnik_id, akcija, entitet_tip, entitet_id, stare_vrijednosti, nove_vrijednosti, ip_adresa, user_agent)
     values ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [
      ulaz.korisnikId ?? null,
      ulaz.akcija,
      ulaz.entitetTip,
      ulaz.entitetId,
      ulaz.stareVrijednosti ? JSON.stringify(ulaz.stareVrijednosti) : null,
      ulaz.noveVrijednosti ? JSON.stringify(ulaz.noveVrijednosti) : null,
      ulaz.ipAdresa ?? null,
      ulaz.userAgent ?? null,
    ],
  );
}

export const logKreiranje = (klijent: PoolClient | typeof pool, ulaz: Omit<ZabiljeziInput, "akcija">) =>
  zabiljezi(klijent, { ...ulaz, akcija: "KREIRANJE" });

export const logIzmjena = (klijent: PoolClient | typeof pool, ulaz: Omit<ZabiljeziInput, "akcija">) =>
  zabiljezi(klijent, { ...ulaz, akcija: "IZMJENA" });

export const logPromjenaStatusa = (klijent: PoolClient | typeof pool, ulaz: Omit<ZabiljeziInput, "akcija">) =>
  zabiljezi(klijent, { ...ulaz, akcija: "PROMJENA_STATUSA" });

export const logOdluka = (klijent: PoolClient | typeof pool, ulaz: Omit<ZabiljeziInput, "akcija">) =>
  zabiljezi(klijent, { ...ulaz, akcija: "ODLUKA" });

export const logSigurnosniDogadjaj = (klijent: PoolClient | typeof pool, ulaz: Omit<ZabiljeziInput, "akcija">) =>
  zabiljezi(klijent, { ...ulaz, akcija: "SIGURNOST" });
