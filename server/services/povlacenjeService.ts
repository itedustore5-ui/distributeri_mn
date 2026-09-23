import type { PoolClient } from "pg";
import { transakcija, upit, pool } from "../db.js";
import { ApiGreska } from "../greske.js";
import { danasCG } from "../vrijeme.js";
import { emituj } from "./dogadjajService.js";
import { logKreiranje, logPromjenaStatusa } from "./auditService.js";
import { kreirajZadatak, obavijestiUlogu, zatvoriZadatkeIzvora } from "./zadaciService.js";

async function sljedeciBrojPovlacenja(klijent: PoolClient) {
  const danas = danasCG().replaceAll("-", "").slice(2);
  const rezultat = await klijent.query<{ broj: number }>(`select count(*)::int as broj from povlacenje where broj like $1`, [`PVL-${danas}-%`]);
  return `PVL-${danas}-${String((rezultat.rows[0]?.broj ?? 0) + 1).padStart(3, "0")}`;
}

/** Povlačenje počinje telefonom (čl. 28) — kontakti se snimaju iz stvarnih isporuka tog lota,
 * ne unose se ručno, da se niko ne izostavi. Automatski otvara i neusaglašenost visoke
 * ozbiljnosti, jer je povlačenje uvijek ozbiljan nalaz. */
export async function pokreniPovlacenje(lotId: string, razlog: string, korisnikId: string) {
  const lotRed = await upit<{ id: string }>(`select id from lot where id = $1`, [lotId]);
  if (!lotRed.rows[0]) throw new ApiGreska(404, "LOT_NE_POSTOJI", "Lot nije pronađen.");

  return transakcija(async (klijent) => {
    const broj = await sljedeciBrojPovlacenja(klijent);
    const povlacenje = await klijent.query<{ id: string }>(
      `insert into povlacenje (broj, lot_id, razlog, pokrenuo_korisnik_id) values ($1, $2, $3, $4) returning id`,
      [broj, lotId, razlog, korisnikId],
    );
    const povlacenjeId = povlacenje.rows[0].id;

    const isporuke = await klijent.query<{ isporuka_id: string; kupac_naziv: string; kupac_telefon: string; kolicina: string }>(
      `select ist.isporuka_id, k.naziv as kupac_naziv, k.telefon as kupac_telefon, ist.isporucena_kolicina as kolicina
       from isporuka_stavka ist
       join isporuka i on i.id = ist.isporuka_id
       join kupac k on k.id = i.kupac_id
       where ist.lot_id = $1 and ist.isporucena_kolicina > 0`,
      [lotId],
    );
    for (const red of isporuke.rows) {
      await klijent.query(
        `insert into povlacenje_kontakt (povlacenje_id, isporuka_id, kupac_naziv, kupac_telefon, kolicina) values ($1, $2, $3, $4, $5)`,
        [povlacenjeId, red.isporuka_id, red.kupac_naziv, red.kupac_telefon, red.kolicina],
      );
    }

    const brojNc = `NC-${danasCG().replaceAll("-", "").slice(2)}-P${Math.floor(Math.random() * 900 + 100)}`;
    const nc = await klijent.query<{ id: string }>(
      `insert into neusaglasenost (broj, ozbiljnost, status, izvor_tip, izvor_id, opis, prijavio_korisnik_id)
       values ($1, 'VISOK', 'OTVORENA', 'povlacenje', $2, $3, $4) returning id`,
      [brojNc, povlacenjeId, `Pokrenuto povlačenje ${broj}: ${razlog}`, korisnikId],
    );
    await kreirajZadatak(klijent, {
      naslov: `Obavijesti sve kupce — povlačenje ${broj}`,
      opis: razlog,
      prioritet: "VISOK",
      izvorTip: "povlacenje",
      izvorId: povlacenjeId,
    });
    await obavijestiUlogu(klijent, "bzr", {
      naslov: "Pokrenuto povlačenje robe",
      poruka: `${broj} — ${isporuke.rows.length} kupaca treba obavijestiti.`,
      ozbiljnost: "VISOK",
      izvorTip: "povlacenje",
      izvorId: povlacenjeId,
    });

    const dogadjajId = await emituj(klijent, { tipDogadjaja: "EVT-POVLACENJE", entitetTip: "povlacenje", entitetId: povlacenjeId, korisnikId, podaci: { lotId, razlog } });
    await logKreiranje(klijent, { dogadjajId, korisnikId, entitetTip: "povlacenje", entitetId: povlacenjeId, noveVrijednosti: { broj, lotId, razlog } });

    return { id: povlacenjeId, broj, brojKontakata: isporuke.rows.length, neusaglasenostId: nc.rows[0].id };
  });
}

export async function oznaciKontaktiran(kontaktId: string, napomena: string | undefined, korisnikId: string) {
  const rezultat = await pool.query<{ povlacenje_id: string }>(
    `update povlacenje_kontakt set kontaktiran = true, kontaktiran_at = now(), napomena = coalesce($1, napomena) where id = $2 returning povlacenje_id`,
    [napomena ?? null, kontaktId],
  );
  if (!rezultat.rows[0]) throw new ApiGreska(404, "KONTAKT_NE_POSTOJI", "Kontakt nije pronađen.");
  await logPromjenaStatusa(pool, { korisnikId, entitetTip: "povlacenje_kontakt", entitetId: kontaktId, noveVrijednosti: { kontaktiran: true } });
  return rezultat.rows[0].povlacenje_id;
}

export async function zavrsiPovlacenje(povlacenjeId: string, korisnikId: string) {
  const nekontaktirani = await pool.query<{ broj: string }>(
    `select count(*) as broj from povlacenje_kontakt where povlacenje_id = $1 and not kontaktiran`,
    [povlacenjeId],
  );
  if (Number(nekontaktirani.rows[0].broj) > 0) {
    throw new ApiGreska(409, "NISU_SVI_KONTAKTIRANI", "Ne mogu se zatvoriti povlačenje dok svi kupci nisu obavješteni.");
  }
  const rezultat = await pool.query(
    `update povlacenje set status = 'ZAVRSENO', zavrseno_at = now(), zavrsio_korisnik_id = $1 where id = $2 and status = 'U_TOKU' returning id`,
    [korisnikId, povlacenjeId],
  );
  if (!rezultat.rows[0]) throw new ApiGreska(404, "POVLACENJE_NE_POSTOJI", "Povlačenje nije pronađeno ili je već zatvoreno.");
  await zatvoriZadatkeIzvora(pool, "povlacenje", povlacenjeId);
  await logPromjenaStatusa(pool, { korisnikId, entitetTip: "povlacenje", entitetId: povlacenjeId, noveVrijednosti: { status: "ZAVRSENO" } });
}
