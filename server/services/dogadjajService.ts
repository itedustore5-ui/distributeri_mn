import type { PoolClient } from "pg";
import { pool } from "../db.js";

type EmitujInput = {
  tipDogadjaja: string;
  entitetTip: string;
  entitetId: string;
  korisnikId?: string | null;
  podaci?: Record<string, unknown>;
  korelacijaId?: string | null;
};

export async function emituj(klijent: PoolClient | typeof pool, ulaz: EmitujInput) {
  const rezultat = await klijent.query<{ id: string }>(
    `insert into dogadjaj (tip_dogadjaja, entitet_tip, entitet_id, korisnik_id, podaci, korelacija_id)
     values ($1, $2, $3, $4, $5, $6) returning id`,
    [
      ulaz.tipDogadjaja,
      ulaz.entitetTip,
      ulaz.entitetId,
      ulaz.korisnikId ?? null,
      JSON.stringify(ulaz.podaci ?? {}),
      ulaz.korelacijaId ?? null,
    ],
  );
  return rezultat.rows[0].id;
}
