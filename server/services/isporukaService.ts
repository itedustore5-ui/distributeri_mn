import type { PoolClient } from "pg";
import { transakcija, upit, pool } from "../db.js";
import { ApiGreska } from "../greske.js";
import { emituj } from "./dogadjajService.js";
import { logKreiranje, logPromjenaStatusa } from "./auditService.js";
import { kreirajObavjestenje } from "./zadaciService.js";
import { zabiljeziMjerenje } from "./haccpService.js";
import { odrediSkladiste } from "./skladisteService.js";
import { sljedeciBroj, danasKratko } from "./brojeviService.js";

export type StavkaIsporukeUlaz = { lotId: string; planiranaKolicina: number };
export type NovaIsporukaUlaz = {
  kupacId: string;
  skladisteId?: string | null;
  vozilId?: string | null;
  vozacKorisnikId?: string | null;
  datumIsporuke: string;
  napomena?: string;
  stavke: StavkaIsporukeUlaz[];
};

/** Vozač saznaje za isporuku iz aplikacije, ne iz poziva — i ima trag kad mu je dodijeljena.
 * Ne obavještava se ko je sam sebi upisao isporuku. */
async function obavijestiVozaca(klijent: PoolClient, isporukaId: string, vozacId: string | null | undefined, korisnikId: string) {
  if (!vozacId || vozacId === korisnikId) return;
  const red = await klijent.query<{ broj: string; datum_isporuke: string; kupac: string; registarski_broj: string | null }>(
    `select i.broj, i.datum_isporuke, k.naziv as kupac, v.registarski_broj from isporuka i
     join kupac k on k.id = i.kupac_id left join vozilo v on v.id = i.vozilo_id where i.id = $1`,
    [isporukaId],
  );
  const i = red.rows[0];
  if (!i) return;
  const vozilo = i.registarski_broj ? `vozilo ${i.registarski_broj}` : "vozilo nije izabrano";
  await kreirajObavjestenje(klijent, {
    korisnikId: vozacId,
    naslov: `Nova isporuka za vas: ${i.broj}`,
    poruka: `${i.kupac} · ${i.datum_isporuke} · ${vozilo}. Prije utovara uradite kontrolu vozila (D1).`,
    ozbiljnost: "SREDNJI",
    izvorTip: "isporuka",
    izvorId: isporukaId,
  });
}

/** Lot mora biti prihvaćen, imati dovoljno na zalihi i biti u skladištu iz kog isporuka ide —
 * roba se isporučuje iz magacina u kom stvarno stoji (premještanje nije u ovoj verziji). */
async function provjeriLotZaIsporuku(klijent: PoolClient, stavka: StavkaIsporukeUlaz, skladisteId: string) {
  const lot = await klijent.query<{ status: string; dostupno: string | null; broj_lota: string; skladiste_id: string | null; skladiste_naziv: string | null }>(
    `select l.status, z.kolicina as dostupno, l.broj_lota, p.skladiste_id, s.naziv as skladiste_naziv from lot l
     left join zaliha z on z.lot_id = l.id and z.status = 'DOSTUPNO'
     left join prijem p on p.id = l.prijem_id
     left join skladiste s on s.id = p.skladiste_id
     where l.id = $1`,
    [stavka.lotId],
  );
  const red = lot.rows[0];
  if (!red || red.status !== "PRIHVACEN") {
    throw new ApiGreska(409, "LOT_NIJE_DOSTUPAN", "Isporuka nije dozvoljena jer izabrani lot nije u statusu PRIHVAĆEN.");
  }
  if (red.skladiste_id && red.skladiste_id !== skladisteId) {
    throw new ApiGreska(
      409,
      "LOT_U_DRUGOM_SKLADISTU",
      `Lot ${red.broj_lota} je u skladištu "${red.skladiste_naziv}" — isporuka ide iz drugog. Izaberite skladište u kom je roba.`,
    );
  }
  const dostupno = Number(red.dostupno ?? 0);
  if (dostupno < stavka.planiranaKolicina) {
    throw new ApiGreska(409, "NEDOVOLJNO_ZALIHE", `Na zalihi je dostupno samo ${dostupno} za lot ${red.broj_lota}.`);
  }
}

export async function kreirajIsporuku(ulaz: NovaIsporukaUlaz, korisnikId: string) {
  if (ulaz.stavke.length === 0) {
    throw new ApiGreska(400, "ISPORUKA_BEZ_STAVKI", "Isporuka mora imati najmanje jednu stavku.");
  }

  if (ulaz.vozilId) {
    const vozilo = await upit<{ status: string }>(`select status from vozilo where id = $1`, [ulaz.vozilId]);
    if (vozilo.rows[0]?.status !== "SPREMNO") {
      throw new ApiGreska(409, "VOZILO_NIJE_SPREMNO", "Isporuka nije dozvoljena zato što vozilo nije prošlo kontrolu.");
    }
  }

  const skladisteId = await odrediSkladiste(pool, ulaz.skladisteId, korisnikId);

  return transakcija(async (klijent) => {
    for (const stavka of ulaz.stavke) await provjeriLotZaIsporuku(klijent, stavka, skladisteId);

    const broj = await sljedeciBroj(klijent, "isporuka", `ISP-${danasKratko()}`);
    const isporuka = await klijent.query<{ id: string }>(
      `insert into isporuka (broj, kupac_id, vozilo_id, vozac_korisnik_id, uneo_korisnik_id, datum_isporuke, status, napomena, skladiste_id)
       values ($1, $2, $3, $4, $5, $6, 'U_PRIPREMI', $7, $8) returning id`,
      [broj, ulaz.kupacId, ulaz.vozilId ?? null, ulaz.vozacKorisnikId ?? null, korisnikId, ulaz.datumIsporuke, ulaz.napomena ?? null, skladisteId],
    );
    const isporukaId = isporuka.rows[0].id;

    for (const stavka of ulaz.stavke) {
      await klijent.query(
        `insert into isporuka_stavka (isporuka_id, lot_id, planirana_kolicina) values ($1, $2, $3)`,
        [isporukaId, stavka.lotId, stavka.planiranaKolicina],
      );
    }

    await emituj(klijent, { tipDogadjaja: "EVT-030", entitetTip: "isporuka", entitetId: isporukaId, korisnikId });
    await obavijestiVozaca(klijent, isporukaId, ulaz.vozacKorisnikId, korisnikId);
    await logKreiranje(klijent, { korisnikId, entitetTip: "isporuka", entitetId: isporukaId, noveVrijednosti: { broj, kupacId: ulaz.kupacId } });

    return isporukaId;
  });
}

export type IzmjenaIsporukeUlaz = {
  skladisteId?: string | null;
  vozilId?: string | null;
  vozacKorisnikId?: string | null;
  datumIsporuke: string;
  stavke: StavkaIsporukeUlaz[];
};

/** Izmjena je dozvoljena samo dok je isporuka U_PRIPREMI — čim je potvrđena, zaliha je već
 * umanjena i ispravka ide kroz novi događaj, ne kroz prepravku ove isporuke. Cijeli spisak
 * stavki se zamjenjuje (isto kao pri kreiranju) da bi se izbjeglo dupliranje logike. */
export async function izmijeniIsporuku(isporukaId: string, ulaz: IzmjenaIsporukeUlaz, korisnikId: string) {
  if (ulaz.stavke.length === 0) {
    throw new ApiGreska(400, "ISPORUKA_BEZ_STAVKI", "Isporuka mora imati najmanje jednu stavku.");
  }
  if (ulaz.vozilId) {
    const vozilo = await upit<{ status: string }>(`select status from vozilo where id = $1`, [ulaz.vozilId]);
    if (vozilo.rows[0]?.status !== "SPREMNO") {
      throw new ApiGreska(409, "VOZILO_NIJE_SPREMNO", "Isporuka nije dozvoljena zato što vozilo nije prošlo kontrolu.");
    }
  }

  return transakcija(async (klijent) => {
    const isporukaRed = await klijent.query<{ status: string; vozac_korisnik_id: string | null; skladiste_id: string | null }>(
      `select status, vozac_korisnik_id, skladiste_id from isporuka where id = $1 for update`,
      [isporukaId],
    );
    if (!isporukaRed.rows[0]) throw new ApiGreska(404, "ISPORUKA_NE_POSTOJI", "Isporuka nije pronađena.");
    if (isporukaRed.rows[0].status !== "U_PRIPREMI") {
      throw new ApiGreska(409, "ISPORUKA_VEC_POTVRDJENA", "Isporuka se više ne može mijenjati — već je potvrđena.");
    }
    const prethodniVozac = isporukaRed.rows[0].vozac_korisnik_id;
    const skladisteId = await odrediSkladiste(klijent, ulaz.skladisteId ?? isporukaRed.rows[0].skladiste_id, korisnikId);

    for (const stavka of ulaz.stavke) await provjeriLotZaIsporuku(klijent, stavka, skladisteId);

    await klijent.query(`delete from isporuka_stavka where isporuka_id = $1`, [isporukaId]);
    for (const stavka of ulaz.stavke) {
      await klijent.query(
        `insert into isporuka_stavka (isporuka_id, lot_id, planirana_kolicina) values ($1, $2, $3)`,
        [isporukaId, stavka.lotId, stavka.planiranaKolicina],
      );
    }
    await klijent.query(
      `update isporuka set vozilo_id = $1, vozac_korisnik_id = $2, datum_isporuke = $3, skladiste_id = $4, updated_at = now() where id = $5`,
      [ulaz.vozilId ?? null, ulaz.vozacKorisnikId ?? null, ulaz.datumIsporuke, skladisteId, isporukaId],
    );

    await logKreiranje(klijent, { korisnikId, entitetTip: "isporuka", entitetId: isporukaId, noveVrijednosti: { izmijenjeno: true, stavke: ulaz.stavke } });
    if (ulaz.vozacKorisnikId && ulaz.vozacKorisnikId !== prethodniVozac) {
      await obavijestiVozaca(klijent, isporukaId, ulaz.vozacKorisnikId, korisnikId);
    }
  });
}

export type StavkaPotvrdeUlaz = {
  stavkaId: string;
  isporucenaKolicina: number;
  odbijenaKolicina?: number;
  razlogOdbijanja?: string;
  temperaturaPredaje?: number | null;
};

type MjerenjePredaje = { lotId: string; artikalId: string; temperatura: number; granica: { min: string | null; max: string | null; potvrdjena: boolean } };

const KKT3_SIFRA = "KKT3";

export async function potvrdiIsporuku(isporukaId: string, stavke: StavkaPotvrdeUlaz[], korisnikId: string) {
  const mjerenjaPredaje: MjerenjePredaje[] = [];

  const potvrda = await transakcija(async (klijent) => {
    const isporukaRed = await klijent.query<{ status: string; vozilo_id: string | null; broj: string }>(
      `select status, vozilo_id, broj from isporuka where id = $1 for update`,
      [isporukaId],
    );
    if (!isporukaRed.rows[0]) throw new ApiGreska(404, "ISPORUKA_NE_POSTOJI", "Isporuka nije pronađena.");
    if (isporukaRed.rows[0].status !== "U_PRIPREMI") {
      throw new ApiGreska(409, "ISPORUKA_VEC_POTVRDJENA", "Ova isporuka je već potvrđena.");
    }

    let ukupnoPlanirano = 0;
    let ukupnoIsporuceno = 0;

    for (const stavka of stavke) {
      if ((stavka.odbijenaKolicina ?? 0) > 0 && (!stavka.razlogOdbijanja || stavka.razlogOdbijanja.trim() === "")) {
        throw new ApiGreska(400, "RAZLOG_OBAVEZAN", "Odbijanje pri isporuci mora imati zapisan razlog.");
      }
      const stavkaRed = await klijent.query<{
        lot_id: string;
        planirana_kolicina: string;
        artikal_id: string;
        artikal_naziv: string;
        temp_kontrolisano: boolean;
        temp_min: string | null;
        temp_max: string | null;
        granica_potvrdio: boolean;
      }>(
        `select is2.lot_id, is2.planirana_kolicina, l.artikal_id, a.naziv as artikal_naziv,
                a.temp_kontrolisano, a.temp_min, a.temp_max, a.granica_potvrdio
         from isporuka_stavka is2 join lot l on l.id = is2.lot_id join artikal a on a.id = l.artikal_id
         where is2.id = $1 and is2.isporuka_id = $2`,
        [stavka.stavkaId, isporukaId],
      );
      const red = stavkaRed.rows[0];
      if (!red) throw new ApiGreska(404, "STAVKA_NE_POSTOJI", "Stavka isporuke nije pronađena.");
      const temperatura = stavka.temperaturaPredaje ?? null;
      if (red.temp_kontrolisano && stavka.isporucenaKolicina > 0 && temperatura === null) {
        throw new ApiGreska(
          400,
          "TEMPERATURA_OBAVEZNA",
          `Upišite temperaturu pri predaji za "${red.artikal_naziv}" — to je dokaz da je hladni lanac održan do kupca.`,
        );
      }
      const planirano = Number(red.planirana_kolicina);
      const isporuceno = stavka.isporucenaKolicina;
      const odbijeno = stavka.odbijenaKolicina ?? 0;
      if (isporuceno + odbijeno > planirano) {
        throw new ApiGreska(400, "KOLICINA_PREKORACENA", "Isporučena i odbijena količina ne mogu biti veće od planirane.");
      }
      ukupnoPlanirano += planirano;
      ukupnoIsporuceno += isporuceno;

      await klijent.query(
        `update isporuka_stavka set isporucena_kolicina = $1, odbijena_kolicina = $2, razlog_odbijanja = $3, temperatura_predaje = $4 where id = $5`,
        [isporuceno, odbijeno, stavka.razlogOdbijanja ?? null, temperatura, stavka.stavkaId],
      );
      if (temperatura !== null) {
        mjerenjaPredaje.push({
          lotId: red.lot_id,
          artikalId: red.artikal_id,
          temperatura,
          granica: { min: red.temp_min, max: red.temp_max, potvrdjena: red.granica_potvrdio },
        });
      }

      if (isporuceno > 0) {
        await klijent.query(
          `update zaliha set kolicina = kolicina - $1, updated_at = now() where lot_id = $2 and status = 'DOSTUPNO'`,
          [isporuceno, red.lot_id],
        );
        await klijent.query(
          `insert into kretanje_zalihe (lot_id, artikal_id, kolicina_delta, tip, referenca_tip, referenca_id, izvrsio_korisnik_id)
           values ($1, $2, $3, 'ISPORUKA', 'isporuka', $4, $5)`,
          [red.lot_id, red.artikal_id, -isporuceno, isporukaId, korisnikId],
        );
      }
    }

    const status = ukupnoIsporuceno === 0 ? "ODBIJENA" : ukupnoIsporuceno < ukupnoPlanirano ? "DJELIMICNA" : "POTVRDJENA";
    await klijent.query(
      `update isporuka set status = $1, potvrdio_korisnik_id = $2, potvrdjeno_at = now(), updated_at = now() where id = $3`,
      [status, korisnikId, isporukaId],
    );

    const dogadjajTip = status === "POTVRDJENA" ? "EVT-034" : status === "DJELIMICNA" ? "EVT-035" : "EVT-036";
    const dogadjajId = await emituj(klijent, { tipDogadjaja: dogadjajTip, entitetTip: "isporuka", entitetId: isporukaId, korisnikId, podaci: { status } });
    await logPromjenaStatusa(klijent, { dogadjajId, korisnikId, entitetTip: "isporuka", entitetId: isporukaId, noveVrijednosti: { status } });

    return { status, voziloId: isporukaRed.rows[0].vozilo_id, broj: isporukaRed.rows[0].broj };
  });

  // Mjerenje na KKT 3 ide poslije potvrde, u svojoj transakciji po stavci — kao KKT 1 na prijemu:
  // nalaz van granice ne smije poništiti potvrdu isporuke koja se već desila.
  const rezultati = await zabiljeziTemperaturePredaje(mjerenjaPredaje, potvrda.voziloId, potvrda.broj, korisnikId);
  return { status: potvrda.status, vanGranice: rezultati.filter((r) => r === "FAIL").length };
}

/** Granica se uzima redom: pravilo za KKT 3 postavljeno baš za taj artikal, pa granica sa samog
 * artikla — ali SAMO ako ju je klijent potvrdio (invarijanta #5). Nepotvrđena granica je
 * pretpostavka konsultanta: temperatura se tada čuva na stavci, ali se ne ocjenjuje.
 * Opšte pravilo KKT 3 (rashladni režim vozila, 0–5 °C) se ovdje namjerno NE koristi — po njemu
 * bi svaki smrznuti artikal na −18 °C ispao "van opsega". Lot se ne stavlja na HOLD: problem
 * je nastao u prevozu, a roba koja je ostala u magacinu nije bila u tom vozilu. */
async function zabiljeziTemperaturePredaje(mjerenja: MjerenjePredaje[], voziloId: string | null, brojIsporuke: string, korisnikId: string) {
  if (mjerenja.length === 0) return [];
  const kkt = await upit<{ id: string }>(`select id from kontrolna_tacka where sifra = $1 and aktivan`, [KKT3_SIFRA]);
  const kkt3Id = kkt.rows[0]?.id;
  if (!kkt3Id) return [];

  const rezultati: string[] = [];
  for (const m of mjerenja) {
    const pravilo = await upit<{ id: string; min_vrijednost: string | null; max_vrijednost: string | null }>(
      `select id, min_vrijednost, max_vrijednost from pravilo_kontrole
       where kontrolna_tacka_id = $1 and artikal_id = $2 and aktivan order by created_at desc limit 1`,
      [kkt3Id, m.artikalId],
    );
    const p = pravilo.rows[0];
    const granica = p
      ? { id: p.id as string | null, min_vrijednost: p.min_vrijednost, max_vrijednost: p.max_vrijednost }
      : m.granica.potvrdjena && (m.granica.min !== null || m.granica.max !== null)
        ? { id: null, min_vrijednost: m.granica.min, max_vrijednost: m.granica.max }
        : null;
    if (!granica) continue;
    const r = await zabiljeziMjerenje(granica, {
      kontrolnaTackaId: kkt3Id,
      praviloKontroleId: granica.id,
      lotId: m.lotId,
      vozilId: voziloId,
      vrijednost: m.temperatura,
      izmjerioKorisnikId: korisnikId,
      napomena: `Pri predaji kupcu — ${brojIsporuke}`,
      holdLota: false,
    });
    rezultati.push(r.rezultat);
  }
  return rezultati;
}
