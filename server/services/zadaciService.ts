import type { PoolClient } from "pg";
import { pool } from "../db.js";

type NoviZadatakInput = {
  naslov: string;
  opis?: string;
  dodijeljenoKorisnikId?: string | null;
  prioritet?: "NIZAK" | "SREDNJI" | "VISOK";
  rokAt?: string | null;
  izvorTip?: string;
  izvorId?: string;
  createdBy?: string | null;
};

export async function kreirajZadatak(klijent: PoolClient | typeof pool, ulaz: NoviZadatakInput) {
  const rezultat = await klijent.query<{ id: string }>(
    `insert into zadatak (naslov, opis, dodijeljeno_korisnik_id, prioritet, rok_at, izvor_tip, izvor_id, created_by)
     values ($1, $2, $3, $4, $5, $6, $7, $8) returning id`,
    [
      ulaz.naslov,
      ulaz.opis ?? null,
      ulaz.dodijeljenoKorisnikId ?? null,
      ulaz.prioritet ?? "SREDNJI",
      ulaz.rokAt ?? null,
      ulaz.izvorTip ?? null,
      ulaz.izvorId ?? null,
      ulaz.createdBy ?? null,
    ],
  );
  return rezultat.rows[0].id;
}

type NovoObavjestenjeInput = {
  korisnikId: string;
  naslov: string;
  poruka?: string;
  ozbiljnost?: "NIZAK" | "SREDNJI" | "VISOK";
  izvorTip?: string;
  izvorId?: string;
};

export async function kreirajObavjestenje(klijent: PoolClient | typeof pool, ulaz: NovoObavjestenjeInput) {
  await klijent.query(
    `insert into obavjestenje (korisnik_id, naslov, poruka, ozbiljnost, izvor_tip, izvor_id)
     values ($1, $2, $3, $4, $5, $6)`,
    [ulaz.korisnikId, ulaz.naslov, ulaz.poruka ?? null, ulaz.ozbiljnost ?? "SREDNJI", ulaz.izvorTip ?? null, ulaz.izvorId ?? null],
  );
}

/** Automatski zadatak živi koliko i ono iz čega je nastao — kad se zatvori neusaglašenost ili
 * povlačenje, njegov zadatak se zatvara sam. Inače bi ostao da visi kao "zakašnjeo" zauvijek. */
export async function zatvoriZadatkeIzvora(klijent: PoolClient | typeof pool, izvorTip: string, izvorId: string) {
  await klijent.query(
    `update zadatak set status = 'ZAVRSEN', zavrseno_at = now()
     where izvor_tip = $1 and izvor_id = $2 and status not in ('ZAVRSEN', 'OTKAZAN')`,
    [izvorTip, izvorId],
  );
}

/** Obavijesti sve aktivne korisnike zadate uloge (npr. bzr kad nastane kritična NC). */
export async function obavijestiUlogu(klijent: PoolClient | typeof pool, uloga: string, ulaz: Omit<NovoObavjestenjeInput, "korisnikId">) {
  const korisnici = await klijent.query<{ id: string }>(`select id from korisnik where uloga = $1 and aktivan`, [uloga]);
  for (const red of korisnici.rows) {
    await kreirajObavjestenje(klijent, { ...ulaz, korisnikId: red.id });
  }
}
