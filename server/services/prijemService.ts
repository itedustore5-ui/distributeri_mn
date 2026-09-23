import type { PoolClient } from "pg";
import { transakcija, upit, pool } from "../db.js";
import { ApiGreska } from "../greske.js";
import { emituj } from "./dogadjajService.js";
import { logKreiranje, logOdluka, logIzmjena } from "./auditService.js";
import { evaluirajPravilo, zabiljeziMjerenje } from "./haccpService.js";
import { kreirajObavjestenje } from "./zadaciService.js";
import { odrediSkladiste } from "./skladisteService.js";

const KKT1_SIFRA = "KKT1";

export type StavkaUlaz = {
  artikalId: string;
  brojLota: string;
  proizvodniDatum?: string | null;
  rokTrajanja?: string | null;
  primljenaKolicina: number;
  temperaturaPrijema?: number | null;
};

export type NoviPrijemUlaz = {
  dobavljacId: string;
  skladisteId?: string | null;
  brojDokumenta?: string;
  datumPrijema: string;
  napomena?: string;
  stavke: StavkaUlaz[];
};

export async function kreirajPrijem(ulaz: NoviPrijemUlaz, korisnikId: string) {
  if (ulaz.stavke.length === 0) {
    throw new ApiGreska(400, "PRIJEM_BEZ_STAVKI", "Prijem mora imati najmanje jednu stavku.");
  }
  for (const stavka of ulaz.stavke) {
    if (!stavka.brojLota || stavka.brojLota.trim() === "") {
      throw new ApiGreska(400, "LOT_OBAVEZAN", "Broj lota je obavezan za svaku stavku — bez njega nema sledljivosti.");
    }
  }

  const skladisteId = await odrediSkladiste(pool, ulaz.skladisteId, korisnikId);
  const kktRed = await upit<{ id: string }>(`select id from kontrolna_tacka where sifra = $1`, [KKT1_SIFRA]);
  const kkt1Id = kktRed.rows[0]?.id;

  const { prijemId, lotoviZaProvjeru } = await transakcija(async (klijent) => {
    const prijem = await klijent.query<{ id: string }>(
      `insert into prijem (dobavljac_id, broj_dokumenta, datum_prijema, status, primio_korisnik_id, napomena, skladiste_id)
       values ($1, $2, $3, 'CEKA_ODLUKU', $4, $5, $6) returning id`,
      [ulaz.dobavljacId, ulaz.brojDokumenta ?? null, ulaz.datumPrijema, korisnikId, ulaz.napomena ?? null, skladisteId],
    );
    const prijemId = prijem.rows[0].id;
    await emituj(klijent, { tipDogadjaja: "EVT-009", entitetTip: "prijem", entitetId: prijemId, korisnikId });
    await logKreiranje(klijent, { korisnikId, entitetTip: "prijem", entitetId: prijemId, noveVrijednosti: { dobavljacId: ulaz.dobavljacId } });

    const lotoviZaProvjeru: { lotId: string; artikalId: string; temperatura: number | null }[] = [];

    for (const stavka of ulaz.stavke) {
      const lot = await klijent.query<{ id: string }>(
        `insert into lot (artikal_id, dobavljac_id, prijem_id, broj_lota, proizvodni_datum, rok_trajanja, status, primljena_kolicina)
         values ($1, $2, $3, $4, $5, $6, 'PRIMLJEN', $7) returning id`,
        [stavka.artikalId, ulaz.dobavljacId, prijemId, stavka.brojLota.trim(), stavka.proizvodniDatum ?? null, stavka.rokTrajanja ?? null, stavka.primljenaKolicina],
      );
      const lotId = lot.rows[0].id;
      await emituj(klijent, { tipDogadjaja: "EVT-011", entitetTip: "lot", entitetId: lotId, korisnikId });

      await klijent.query(
        `insert into prijem_stavka (prijem_id, artikal_id, lot_id, primljena_kolicina, temperatura_prijema)
         values ($1, $2, $3, $4, $5)`,
        [prijemId, stavka.artikalId, lotId, stavka.primljenaKolicina, stavka.temperaturaPrijema ?? null],
      );

      lotoviZaProvjeru.push({ lotId, artikalId: stavka.artikalId, temperatura: stavka.temperaturaPrijema ?? null });
    }

    return { prijemId, lotoviZaProvjeru };
  });

  // HACCP provjera na KKT1 se radi poslije upisa prijema — odvojena transakcija po lotu,
  // da jedan neuspio nalaz ne obori upis cijelog prijema.
  if (kkt1Id) {
    for (const stavka of lotoviZaProvjeru) {
      if (stavka.temperatura === null) continue;
      const pravilo = await upit<{ id: string; min_vrijednost: string | null; max_vrijednost: string | null }>(
        `select id, min_vrijednost, max_vrijednost from pravilo_kontrole
         where kontrolna_tacka_id = $1 and (artikal_id = $2 or artikal_id is null) and aktivan
         order by artikal_id nulls last limit 1`,
        [kkt1Id, stavka.artikalId],
      );
      const p = pravilo.rows[0];
      if (!p) continue;
      await zabiljeziMjerenje(p, {
        kontrolnaTackaId: kkt1Id,
        praviloKontroleId: p.id,
        lotId: stavka.lotId,
        vrijednost: stavka.temperatura,
        izmjerioKorisnikId: korisnikId,
        napomena: "Izmjereno pri prijemu",
      });
    }
  }

  return prijemId;
}

export type StavkaIzmjenaUlaz = {
  brojLota?: string;
  proizvodniDatum?: string | null;
  rokTrajanja?: string | null;
  primljenaKolicina?: number;
  temperaturaPrijema?: number | null;
};

/** Ispravka unosa je dozvoljena SAMO dok lot čeka odluku — čim je lot PRIHVAĆEN/HOLD/ODBIJEN,
 * mijenjanje bi pokvarilo sledljivost i zalihu koja je već zavisna od unesenih brojki. */
export async function izmijeniStavku(lotId: string, ulaz: StavkaIzmjenaUlaz, korisnikId: string) {
  const lotRed = await pool.query<{ status: string }>(`select status from lot where id = $1`, [lotId]);
  if (!lotRed.rows[0]) throw new ApiGreska(404, "LOT_NE_POSTOJI", "Lot nije pronađen.");
  if (lotRed.rows[0].status !== "PRIMLJEN") {
    throw new ApiGreska(409, "ODLUKA_VEC_DONESENA", "Stavka se više ne može mijenjati — odluka o prijemu je već donesena.");
  }
  if (ulaz.brojLota !== undefined && ulaz.brojLota.trim() === "") {
    throw new ApiGreska(400, "LOT_OBAVEZAN", "Broj lota je obavezan — bez njega nema sledljivosti.");
  }

  await pool.query(
    `update lot set
       broj_lota = coalesce($1, broj_lota),
       proizvodni_datum = coalesce($2, proizvodni_datum),
       rok_trajanja = coalesce($3, rok_trajanja),
       primljena_kolicina = coalesce($4, primljena_kolicina),
       updated_at = now()
     where id = $5`,
    [ulaz.brojLota?.trim() ?? null, ulaz.proizvodniDatum ?? null, ulaz.rokTrajanja ?? null, ulaz.primljenaKolicina ?? null, lotId],
  );
  await pool.query(
    `update prijem_stavka set
       primljena_kolicina = coalesce($1, primljena_kolicina),
       temperatura_prijema = coalesce($2, temperatura_prijema)
     where lot_id = $3`,
    [ulaz.primljenaKolicina ?? null, ulaz.temperaturaPrijema ?? null, lotId],
  );
  await logIzmjena(pool, { korisnikId, entitetTip: "lot", entitetId: lotId, noveVrijednosti: ulaz });
}

export type Odluka = "PRIHVATI" | "HOLD" | "ODBIJI";

/** Magacioner koji je primio robu saznaje šta je odlučeno. Zadržavanje i odbijanje traže od
 * njega da robu fizički izdvoji, pa se javljaju odmah, po lotu. Prihvatanje se ne javlja po
 * stavci, nego jednom kad je cio prijem riješen — da deset stavki ne napravi deset poruka. */
async function obavijestiPrimaoca(
  klijent: PoolClient,
  ulaz: { prijemId: string; lotId: string; odluka: Odluka; prijemStatus: string; napomena?: string; korisnikId: string },
) {
  const red = await klijent.query<{ primio_korisnik_id: string; broj_dokumenta: string | null; broj_lota: string; artikal: string; dobavljac: string }>(
    `select p.primio_korisnik_id, p.broj_dokumenta, l.broj_lota, a.naziv as artikal, d.naziv as dobavljac
     from prijem p join lot l on l.prijem_id = p.id join artikal a on a.id = l.artikal_id join dobavljac d on d.id = p.dobavljac_id
     where p.id = $1 and l.id = $2`,
    [ulaz.prijemId, ulaz.lotId],
  );
  const r = red.rows[0];
  if (!r || r.primio_korisnik_id === ulaz.korisnikId) return;
  const prijem = r.broj_dokumenta ? `Prijem ${r.broj_dokumenta} (${r.dobavljac})` : `Prijem od ${r.dobavljac}`;
  const razlog = ulaz.napomena?.trim() ? ` Razlog: ${ulaz.napomena.trim()}` : "";

  if (ulaz.odluka === "HOLD") {
    await kreirajObavjestenje(klijent, {
      korisnikId: r.primio_korisnik_id,
      naslov: `Zadržano: ${r.artikal} · lot ${r.broj_lota}`,
      poruka: `${prijem}. Izdvojite robu i označite je — ne ide u isporuku dok se ne odluči.${razlog}`,
      ozbiljnost: "SREDNJI",
      izvorTip: "lot",
      izvorId: ulaz.lotId,
    });
  } else if (ulaz.odluka === "ODBIJI") {
    await kreirajObavjestenje(klijent, {
      korisnikId: r.primio_korisnik_id,
      naslov: `Odbijeno: ${r.artikal} · lot ${r.broj_lota}`,
      poruka: `${prijem}. Izdvojite robu za povrat dobavljaču.${razlog}`,
      ozbiljnost: "VISOK",
      izvorTip: "lot",
      izvorId: ulaz.lotId,
    });
  }

  if (ulaz.prijemStatus !== "CEKA_ODLUKU") {
    const ishod =
      ulaz.prijemStatus === "PRIHVACEN" ? "sve je prihvaćeno, roba može na policu" : ulaz.prijemStatus === "ODBIJEN" ? "sve je odbijeno" : "djelimično prihvaćeno — pogledajte stavke";
    await kreirajObavjestenje(klijent, {
      korisnikId: r.primio_korisnik_id,
      naslov: `${prijem}: odluka donesena`,
      poruka: `Odgovorno lice je odlučilo: ${ishod}.`,
      ozbiljnost: "NIZAK",
      izvorTip: "prijem",
      izvorId: ulaz.prijemId,
    });
  }
}

export async function donesiOdlukuOLotu(lotId: string, odluka: Odluka, kolicina: number, napomena: string | undefined, korisnikId: string) {
  return transakcija(async (klijent) => {
    const lotRed = await klijent.query<{ id: string; artikal_id: string; prijem_id: string; status: string }>(
      `select id, artikal_id, prijem_id, status from lot where id = $1 for update`,
      [lotId],
    );
    const lot = lotRed.rows[0];
    if (!lot) throw new ApiGreska(404, "LOT_NE_POSTOJI", "Lot nije pronađen.");
    if (lot.status !== "PRIMLJEN") {
      throw new ApiGreska(409, "ODLUKA_VEC_DONESENA", "Odluka o ovom lotu je već donesena.");
    }
    if (odluka === "ODBIJI" && (!napomena || napomena.trim() === "")) {
      throw new ApiGreska(400, "RAZLOG_OBAVEZAN", "Odbijanje robe mora imati zapisan razlog.");
    }

    const noviStatus = odluka === "PRIHVATI" ? "PRIHVACEN" : odluka === "HOLD" ? "HOLD" : "ODBIJEN";
    await klijent.query(`update lot set status = $1, prihvacena_kolicina = $2, odbijena_kolicina = $3, updated_at = now() where id = $4`, [
      noviStatus,
      odluka === "PRIHVATI" ? kolicina : 0,
      odluka === "ODBIJI" ? kolicina : 0,
      lotId,
    ]);
    await klijent.query(
      `update prijem_stavka set prihvacena_kolicina = $1, odbijena_kolicina = $2, napomena = coalesce($3, napomena) where lot_id = $4`,
      [odluka === "PRIHVATI" ? kolicina : 0, odluka === "ODBIJI" ? kolicina : 0, napomena ?? null, lotId],
    );

    if (odluka === "PRIHVATI") {
      await klijent.query(
        `insert into zaliha (lot_id, artikal_id, kolicina, status) values ($1, $2, $3, 'DOSTUPNO')
         on conflict (lot_id, status) do update set kolicina = zaliha.kolicina + excluded.kolicina, updated_at = now()`,
        [lotId, lot.artikal_id, kolicina],
      );
      await klijent.query(
        `insert into kretanje_zalihe (lot_id, artikal_id, kolicina_delta, tip, referenca_tip, referenca_id, izvrsio_korisnik_id)
         values ($1, $2, $3, 'PRIJEM', 'prijem', $4, $5)`,
        [lotId, lot.artikal_id, kolicina, lot.prijem_id, korisnikId],
      );
    } else if (odluka === "HOLD") {
      await klijent.query(
        `insert into zaliha (lot_id, artikal_id, kolicina, status) values ($1, $2, $3, 'KARANTIN')
         on conflict (lot_id, status) do update set kolicina = zaliha.kolicina + excluded.kolicina, updated_at = now()`,
        [lotId, lot.artikal_id, kolicina],
      );
    }

    const dogadjajTip = odluka === "PRIHVATI" ? "EVT-014" : odluka === "HOLD" ? "EVT-015" : "EVT-016";
    const dogadjajId = await emituj(klijent, { tipDogadjaja: dogadjajTip, entitetTip: "lot", entitetId: lotId, korisnikId, podaci: { odluka, kolicina, napomena } });
    await logOdluka(klijent, { dogadjajId, korisnikId, entitetTip: "lot", entitetId: lotId, noveVrijednosti: { status: noviStatus, kolicina, napomena } });

    const preostaliRed = await klijent.query<{ status: string }>(`select status from lot where prijem_id = $1`, [lot.prijem_id]);
    const statusi = preostaliRed.rows.map((r) => r.status);
    let prijemStatus: string;
    if (statusi.some((s) => s === "PRIMLJEN")) prijemStatus = "CEKA_ODLUKU";
    else if (statusi.every((s) => s === "PRIHVACEN")) prijemStatus = "PRIHVACEN";
    else if (statusi.every((s) => s === "ODBIJEN")) prijemStatus = "ODBIJEN";
    else prijemStatus = "DJELIMICNO_PRIHVACEN";
    await klijent.query(`update prijem set status = $1, odluku_donio_korisnik_id = $2, odluka_at = now(), updated_at = now() where id = $3`, [
      prijemStatus,
      korisnikId,
      lot.prijem_id,
    ]);
    await obavijestiPrimaoca(klijent, { prijemId: lot.prijem_id, lotId, odluka, prijemStatus, napomena, korisnikId });

    return { status: noviStatus, prijemStatus };
  });
}

export { evaluirajPravilo };
