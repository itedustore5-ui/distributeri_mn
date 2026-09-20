import type { PoolClient } from "pg";
import { transakcija } from "../db.js";
import { danasCG } from "../vrijeme.js";
import { emituj } from "./dogadjajService.js";
import { logKreiranje, logPromjenaStatusa } from "./auditService.js";
import { kreirajZadatak, obavijestiUlogu } from "./zadaciService.js";

export type RezultatMjerenja = "PASS" | "FAIL" | "WARNING";

export type PraviloKontrole = {
  id: string;
  min_vrijednost: string | null;
  max_vrijednost: string | null;
};

const TOLERANCIJA = 0.5; // °C blizu granice → upozorenje umjesto prolaza bez traga

/** Centralni decision-engine za HACCP mjerenja. Limiti dolaze iz baze (pravilo_kontrole),
 * nikad iz koda — konsultant ih mijenja kroz podešavanje artikla/kontrolne tačke. */
export function evaluirajPravilo(pravilo: Pick<PraviloKontrole, "min_vrijednost" | "max_vrijednost">, vrijednost: number): RezultatMjerenja {
  const min = pravilo.min_vrijednost === null ? null : Number(pravilo.min_vrijednost);
  const max = pravilo.max_vrijednost === null ? null : Number(pravilo.max_vrijednost);
  if (min !== null && vrijednost < min) return "FAIL";
  if (max !== null && vrijednost > max) return "FAIL";
  if (min !== null && vrijednost < min + TOLERANCIJA) return "WARNING";
  if (max !== null && vrijednost > max - TOLERANCIJA) return "WARNING";
  return "PASS";
}

async function sljedeciBrojNc(klijent: PoolClient) {
  const danas = danasCG().replaceAll("-", "").slice(2); // YYMMDD
  const rezultat = await klijent.query<{ broj: number }>(
    `select count(*)::int as broj from neusaglasenost where broj like $1`,
    [`NC-${danas}-%`],
  );
  const sledeci = (rezultat.rows[0]?.broj ?? 0) + 1;
  return `NC-${danas}-${String(sledeci).padStart(3, "0")}`;
}

type NoviMjerenjeInput = {
  kontrolnaTackaId: string;
  praviloKontroleId: string;
  lotId?: string | null;
  vozilId?: string | null;
  vrijednost: number;
  izmjerioKorisnikId: string;
  napomena?: string;
};

/** Mjerenje + posljedice ako je FAIL: NC, zadatak, obavještenje bzr-u, i HOLD na LOT-u gdje
 * je primjenjivo. Sve u jednoj transakciji — ili sve ili ništa. */
export async function zabiljeziMjerenje(pravilo: Pick<PraviloKontrole, "min_vrijednost" | "max_vrijednost">, ulaz: NoviMjerenjeInput) {
  const rezultat = evaluirajPravilo(pravilo, ulaz.vrijednost);

  return transakcija(async (klijent) => {
    const mjerenje = await klijent.query<{ id: string }>(
      `insert into mjerenje_temperature (kontrolna_tacka_id, pravilo_kontrole_id, lot_id, vozilo_id, vrijednost, izmjereno_at, izmjerio_korisnik_id, rezultat, napomena)
       values ($1, $2, $3, $4, $5, now(), $6, $7, $8) returning id`,
      [ulaz.kontrolnaTackaId, ulaz.praviloKontroleId, ulaz.lotId ?? null, ulaz.vozilId ?? null, ulaz.vrijednost, ulaz.izmjerioKorisnikId, rezultat, ulaz.napomena ?? null],
    );
    const mjerenjeId = mjerenje.rows[0].id;

    const dogadjajId = await emituj(klijent, {
      tipDogadjaja: rezultat === "FAIL" ? "EVT-006" : "EVT-005",
      entitetTip: "mjerenje_temperature",
      entitetId: mjerenjeId,
      korisnikId: ulaz.izmjerioKorisnikId,
      podaci: { vrijednost: ulaz.vrijednost, rezultat },
    });
    await logKreiranje(klijent, {
      dogadjajId,
      korisnikId: ulaz.izmjerioKorisnikId,
      entitetTip: "mjerenje_temperature",
      entitetId: mjerenjeId,
      noveVrijednosti: { vrijednost: ulaz.vrijednost, rezultat },
    });

    let neusaglasenostId: string | null = null;
    if (rezultat === "FAIL") {
      const broj = await sljedeciBrojNc(klijent);
      const nc = await klijent.query<{ id: string }>(
        `insert into neusaglasenost (broj, ozbiljnost, status, izvor_tip, izvor_id, opis, prijavio_korisnik_id)
         values ($1, 'VISOK', 'OTVORENA', 'mjerenje_temperature', $2, $3, $4) returning id`,
        [broj, mjerenjeId, `Mjerenje van opsega: ${ulaz.vrijednost}°C.`, ulaz.izmjerioKorisnikId],
      );
      neusaglasenostId = nc.rows[0].id;

      await kreirajZadatak(klijent, {
        naslov: `Riješi neusaglašenost ${broj}`,
        opis: `Temperaturno mjerenje van opsega (${ulaz.vrijednost}°C).`,
        prioritet: "VISOK",
        izvorTip: "neusaglasenost",
        izvorId: neusaglasenostId,
      });
      await obavijestiUlogu(klijent, "bzr", {
        naslov: "Temperatura van opsega",
        poruka: `${ulaz.vrijednost}°C — otvorena neusaglašenost ${broj}.`,
        ozbiljnost: "VISOK",
        izvorTip: "neusaglasenost",
        izvorId: neusaglasenostId,
      });

      if (ulaz.lotId) {
        await klijent.query(`update lot set status = 'HOLD', updated_at = now() where id = $1`, [ulaz.lotId]);
        await klijent.query(
          `update zaliha set status = 'KARANTIN', updated_at = now() where lot_id = $1 and status = 'DOSTUPNO'`,
          [ulaz.lotId],
        );
        await klijent.query(
          `insert into kretanje_zalihe (lot_id, artikal_id, kolicina_delta, tip, referenca_tip, referenca_id, izvrsio_korisnik_id, napomena)
           select $1, artikal_id, 0, 'HOLD', 'neusaglasenost', $2, $3, 'Automatski HOLD zbog neuspješnog mjerenja' from lot where id = $1`,
          [ulaz.lotId, neusaglasenostId, ulaz.izmjerioKorisnikId],
        );
        await logPromjenaStatusa(klijent, {
          korisnikId: ulaz.izmjerioKorisnikId,
          entitetTip: "lot",
          entitetId: ulaz.lotId,
          noveVrijednosti: { status: "HOLD", razlog: "temperatura_van_opsega" },
        });
      }
    }

    return { mjerenjeId, rezultat, neusaglasenostId };
  });
}
