import type { PoolClient } from "pg";
import { transakcija, upit } from "../db.js";
import { ApiGreska } from "../greske.js";
import { emituj } from "./dogadjajService.js";
import { logIzmjena, logPromjenaStatusa } from "./auditService.js";
import { sljedeciBrojNc } from "./brojeviService.js";
import { zatvoriZadatkeIzvora, kreirajObavjestenje, kreirajZadatak, obavijestiUlogu } from "./zadaciService.js";

/** Prijava sa terena (ručno ili sa isporuke). Isto kao automatska NC: nedodijeljen zadatak i
 * obavještenje odgovornom licu — ranije ručna prijava nije javljala nikome, pa je magacioner
 * prijavio problem u prazno. Visoku ozbiljnost vidi i uprava. */
export async function kreirajRucnuNeusaglasenost(
  ulaz: { ozbiljnost?: string; opis: string; izvorTip?: "rucno" | "isporuka"; izvorId?: string },
  korisnikId: string,
) {
  let izvorOpis = "";
  if (ulaz.izvorTip === "isporuka") {
    if (!ulaz.izvorId) throw new ApiGreska(400, "ISPORUKA_OBAVEZNA", "Izaberite isporuku na koju se odstupanje odnosi.");
    const isp = await upit<{ broj: string; kupac: string }>(
      `select i.broj, k.naziv as kupac from isporuka i join kupac k on k.id = i.kupac_id where i.id = $1`,
      [ulaz.izvorId],
    );
    if (!isp.rows[0]) throw new ApiGreska(404, "ISPORUKA_NE_POSTOJI", "Isporuka nije pronađena.");
    izvorOpis = ` (isporuka ${isp.rows[0].broj}, ${isp.rows[0].kupac})`;
  }
  const ozbiljnost = ulaz.ozbiljnost ?? "SREDNJI";
  return transakcija(async (klijent) => {
    const broj = await sljedeciBrojNc(klijent);
    const nc = await klijent.query<{ id: string }>(
      `insert into neusaglasenost (broj, ozbiljnost, status, izvor_tip, izvor_id, opis, prijavio_korisnik_id)
       values ($1, $2, 'OTVORENA', $3, $4, $5, $6) returning id`,
      [broj, ozbiljnost, ulaz.izvorTip ?? "rucno", ulaz.izvorId ?? null, ulaz.opis, korisnikId],
    );
    const id = nc.rows[0].id;
    const dogadjajId = await emituj(klijent, { tipDogadjaja: "EVT-007", entitetTip: "neusaglasenost", entitetId: id, korisnikId });
    await logIzmjena(klijent, { dogadjajId, korisnikId, entitetTip: "neusaglasenost", entitetId: id, noveVrijednosti: { broj } });
    await kreirajZadatak(klijent, {
      naslov: `Riješi neusaglašenost ${broj}`,
      opis: `${ulaz.opis}${izvorOpis}`,
      prioritet: ozbiljnost === "VISOK" ? "VISOK" : "SREDNJI",
      izvorTip: "neusaglasenost",
      izvorId: id,
    });
    const obavjestenje = {
      naslov: `Prijavljena neusaglašenost ${broj}`,
      poruka: `${ulaz.opis}${izvorOpis}`,
      ozbiljnost: ozbiljnost as "NIZAK" | "SREDNJI" | "VISOK",
      izvorTip: "neusaglasenost" as const,
      izvorId: id,
    };
    await obavijestiUlogu(klijent, "bzr", obavjestenje);
    if (ozbiljnost === "VISOK") await obavijestiUlogu(klijent, "uprava", obavjestenje);
    return { id, broj };
  });
}

export async function dodajKorektivnuMjeru(
  neusaglasenostId: string,
  ulaz: { opis: string; dodijeljenoKorisnikId?: string | null; rok?: string | null },
  korisnikId: string,
) {
  if (!ulaz.opis || ulaz.opis.trim() === "") {
    throw new ApiGreska(400, "MJERA_OBAVEZNA", "Odstupanje bez zapisane mjere je nalaz protiv firme, ne protiv zaposlenog — upišite korektivnu mjeru.");
  }
  return transakcija(async (klijent) => {
    const mjera = await klijent.query<{ id: string }>(
      `insert into korektivna_mjera (neusaglasenost_id, opis, dodijeljeno_korisnik_id, rok)
       values ($1, $2, $3, $4) returning id`,
      [neusaglasenostId, ulaz.opis, ulaz.dodijeljenoKorisnikId ?? null, ulaz.rok ?? null],
    );
    await klijent.query(`update neusaglasenost set status = 'MJERA_U_TOKU', updated_at = now() where id = $1`, [neusaglasenostId]);
    const dogadjajId = await emituj(klijent, { tipDogadjaja: "EVT-039", entitetTip: "neusaglasenost", entitetId: neusaglasenostId, korisnikId });
    await logPromjenaStatusa(klijent, { dogadjajId, korisnikId, entitetTip: "neusaglasenost", entitetId: neusaglasenostId, noveVrijednosti: { status: "MJERA_U_TOKU" } });
    if (ulaz.dodijeljenoKorisnikId && ulaz.dodijeljenoKorisnikId !== korisnikId) {
      const nc = await klijent.query<{ broj: string }>(`select broj from neusaglasenost where id = $1`, [neusaglasenostId]);
      await kreirajObavjestenje(klijent, {
        korisnikId: ulaz.dodijeljenoKorisnikId,
        naslov: `Korektivna mjera za vas — ${nc.rows[0]?.broj ?? "neusaglašenost"}`,
        poruka: `${ulaz.opis}${ulaz.rok ? ` Rok: ${ulaz.rok}.` : ""} Kad je urađeno, označite je kao završenu na strani Neusaglašenosti.`,
        ozbiljnost: "SREDNJI",
        izvorTip: "neusaglasenost",
        izvorId: neusaglasenostId,
      });
    }
    return mjera.rows[0].id;
  });
}

/** Mjeru završava onaj kome je dodijeljena (terenske uloge SAMO svoju), uz zapis šta je urađeno —
 * taj zapis čita inspektor. Odgovorno lice dobija obavještenje da čeka njena provjera. */
export async function zavrsiKorektivnuMjeru(mjeraId: string, rezultat: string | undefined, korisnikId: string, uloga: string) {
  if (!rezultat || rezultat.trim().length < 3) {
    throw new ApiGreska(400, "REZULTAT_OBAVEZAN", "Upišite šta je urađeno — taj zapis čita inspektor.");
  }
  const postojeca = await upit<{ dodijeljeno_korisnik_id: string | null; status: string }>(
    `select dodijeljeno_korisnik_id, status from korektivna_mjera where id = $1`,
    [mjeraId],
  );
  if (!postojeca.rows[0]) throw new ApiGreska(404, "MJERA_NE_POSTOJI", "Korektivna mjera nije pronađena.");
  if (postojeca.rows[0].status === "ZAVRSENA") throw new ApiGreska(409, "MJERA_VEC_ZAVRSENA", "Ova mjera je već označena kao urađena.");
  const vodiSistem = uloga === "bzr" || uloga === "izvodjac";
  if (!vodiSistem && postojeca.rows[0].dodijeljeno_korisnik_id !== korisnikId) {
    throw new ApiGreska(403, "NIJE_VASA_MJERA", "Ova mjera nije dodijeljena vama — završava je onaj kome je dodijeljena.");
  }
  return transakcija(async (klijent) => {
    const mjera = await klijent.query<{ neusaglasenost_id: string }>(
      `update korektivna_mjera set status = 'ZAVRSENA', zavrseno_at = now(), zavrsio_korisnik_id = $1, rezultat = $2
       where id = $3 returning neusaglasenost_id`,
      [korisnikId, rezultat.trim(), mjeraId],
    );
    if (!mjera.rows[0]) throw new ApiGreska(404, "MJERA_NE_POSTOJI", "Korektivna mjera nije pronađena.");
    const neusaglasenostId = mjera.rows[0].neusaglasenost_id;
    await klijent.query(`update neusaglasenost set status = 'CEKA_VERIFIKACIJU', updated_at = now() where id = $1`, [neusaglasenostId]);
    const dogadjajId = await emituj(klijent, { tipDogadjaja: "EVT-040", entitetTip: "korektivna_mjera", entitetId: mjeraId, korisnikId });
    await logPromjenaStatusa(klijent, { dogadjajId, korisnikId, entitetTip: "neusaglasenost", entitetId: neusaglasenostId, noveVrijednosti: { status: "CEKA_VERIFIKACIJU" } });
    if (!vodiSistem) {
      const nc = await klijent.query<{ broj: string }>(`select broj from neusaglasenost where id = $1`, [neusaglasenostId]);
      await obavijestiUlogu(klijent, "bzr", {
        naslov: `Mjera urađena — ${nc.rows[0]?.broj ?? "neusaglašenost"} čeka vašu provjeru`,
        poruka: rezultat.trim(),
        ozbiljnost: "SREDNJI",
        izvorTip: "neusaglasenost",
        izvorId: neusaglasenostId,
      });
    }
    return neusaglasenostId;
  });
}

export async function verifikuj(
  neusaglasenostId: string,
  ulaz: { korektivnaMjeraId?: string | null; rezultat: "POTVRDJENO" | "ODBIJENO"; napomena?: string; izuzetak?: boolean },
  korisnikId: string,
  uloga?: string,
) {
  return transakcija(async (klijent) => {
    // Provjerava se samo ono što je urađeno (nalaz H2): neusaglašenost mora čekati provjeru, a
    // mjeru koju provjeravamo bira SERVER — posljednju završenu — ne pregledač. Ranije se mogla
    // zatvoriti i otvorena neusaglašenost bez ijedne mjere, a "četiri oka" su se zaobilazila
    // time što se id mjere jednostavno ne pošalje.
    const nc = await klijent.query<{ status: string }>(`select status from neusaglasenost where id = $1 for update`, [neusaglasenostId]);
    if (!nc.rows[0]) throw new ApiGreska(404, "NC_NE_POSTOJI", "Neusaglašenost nije pronađena.");
    if (nc.rows[0].status !== "CEKA_VERIFIKACIJU") {
      throw new ApiGreska(409, "NIJE_SPREMNO_ZA_PROVJERU", "Provjerava se tek kad je korektivna mjera urađena — neusaglašenost se ne zatvara bez nje.");
    }
    const mjera = await klijent.query<{ id: string; zavrsio_korisnik_id: string | null }>(
      `select id, zavrsio_korisnik_id from korektivna_mjera
       where neusaglasenost_id = $1 and status = 'ZAVRSENA' order by zavrseno_at desc limit 1`,
      [neusaglasenostId],
    );
    const zavrsena = mjera.rows[0];
    if (!zavrsena) throw new ApiGreska(409, "NEMA_URADJENE_MJERE", "Nema urađene korektivne mjere — neusaglašenost se ne zatvara bez nje.");
    // Četiri oka (invarijanta #15a). Izlaz za malu firmu (nalaz H7): kad u firmi NEMA drugog
    // odgovornog lica, bzr smije provjeriti i sopstvenu mjeru — ali svjesno, uz obrazloženje, sa
    // oznakom na zapisu i obavještenjem konsultantu da to pogleda pri posjeti.
    let izuzetak = false;
    if (zavrsena.zavrsio_korisnik_id === korisnikId) {
      const drugi = (
        await klijent.query<{ ime: string }>(
          `select coalesce(l.ime, k.korisnicko_ime) as ime from korisnik k left join lice l on l.id = k.lice_id
           where k.uloga = 'bzr' and k.aktivan and k.id <> $1 limit 1`,
          [korisnikId],
        )
      ).rows[0];
      const moguc = uloga === "bzr" && !drugi;
      if (!ulaz.izuzetak) {
        throw new ApiGreska(409, "VERIFIKACIJA_NIJE_NEZAVISNA", moguc
          ? "Mjeru ste uradili vi. U firmi nema drugog odgovornog lica — možete provjeriti sami, uz obrazloženje (zapis nosi oznaku)."
          : "Ko je završio korektivnu mjeru ne može istu i verifikovati.", { izuzetakMoguc: moguc });
      }
      if (!moguc) {
        throw new ApiGreska(409, "IZUZETAK_NIJE_DOZVOLJEN", drugi
          ? `Postoji drugo odgovorno lice (${drugi.ime}) — ono provjerava ovu mjeru.`
          : "Izuzetak od četiri oka ima samo odgovorno lice u firmi bez drugog odgovornog lica.");
      }
      if (!ulaz.napomena || ulaz.napomena.trim().length < 10) {
        throw new ApiGreska(400, "OBRAZLOZENJE_OBAVEZNO", "Upišite zašto provjeravate sami i šta ste pregledali (najmanje 10 znakova).");
      }
      izuzetak = true;
    }
    await klijent.query(
      `insert into verifikacija (neusaglasenost_id, korektivna_mjera_id, verifikovao_korisnik_id, rezultat, napomena, izuzetak_cetiri_oka)
       values ($1, $2, $3, $4, $5, $6)`,
      [neusaglasenostId, zavrsena.id, korisnikId, ulaz.rezultat, ulaz.napomena ?? null, izuzetak],
    );
    if (izuzetak) {
      const broj = (await klijent.query<{ broj: string }>(`select broj from neusaglasenost where id = $1`, [neusaglasenostId])).rows[0]?.broj;
      await obavijestiUlogu(klijent, "izvodjac", {
        naslov: `Provjera bez četiri oka — ${broj ?? "neusaglašenost"}`,
        poruka: `Odgovorno lice je samo uradilo i provjerilo mjeru (nema drugog odgovornog lica). Obrazloženje: ${ulaz.napomena!.trim()}. Pogledati pri posjeti.`,
        ozbiljnost: "SREDNJI",
        izvorTip: "neusaglasenost",
        izvorId: neusaglasenostId,
      });
    }

    const noviStatus = ulaz.rezultat === "POTVRDJENO" ? "ZATVORENA" : "PONOVO_OTVORENA";
    await klijent.query(
      `update neusaglasenost set status = $1::nc_status_t, updated_at = now(),
       zatvoreno_at = case when $1::nc_status_t = 'ZATVORENA' then now() else null end,
       zatvorio_korisnik_id = case when $1::nc_status_t = 'ZATVORENA' then $2::uuid else null end
       where id = $3`,
      [noviStatus, korisnikId, neusaglasenostId],
    );

    const dogadjajId = await emituj(klijent, {
      tipDogadjaja: ulaz.rezultat === "POTVRDJENO" ? "EVT-042" : "EVT-041",
      entitetTip: "neusaglasenost",
      entitetId: neusaglasenostId,
      korisnikId,
    });
    await logPromjenaStatusa(klijent, { dogadjajId, korisnikId, entitetTip: "neusaglasenost", entitetId: neusaglasenostId, noveVrijednosti: { status: noviStatus } });

    if (noviStatus === "ZATVORENA") {
      await zatvoriZadatkeIzvora(klijent, "neusaglasenost", neusaglasenostId);
      // Ko je prijavio problem saznaje da je riješen — inače magacioner koji je izmjerio 8 °C
      // nikad ne sazna šta je bilo dalje, i sljedeći put ne prijavi.
      const nc = await klijent.query<{ broj: string; prijavio_korisnik_id: string | null }>(
        `select broj, prijavio_korisnik_id from neusaglasenost where id = $1`,
        [neusaglasenostId],
      );
      const prijavio = nc.rows[0]?.prijavio_korisnik_id;
      if (prijavio && prijavio !== korisnikId) {
        await kreirajObavjestenje(klijent, {
          korisnikId: prijavio,
          naslov: `Neusaglašenost ${nc.rows[0].broj} je zatvorena`,
          poruka: ulaz.napomena ?? "Korektivna mjera je sprovedena i provjerena.",
          ozbiljnost: "NIZAK",
          izvorTip: "neusaglasenost",
          izvorId: neusaglasenostId,
        });
      }
    }

    return { status: noviStatus };
  });
}

/** Odstupanje upisano u dnevni obrazac (nalaz H3) ulazi u isti tok kao svaka neusaglašenost.
 * Radnik je hitnu mjeru već upisao u obrazac (bez nje se zapis ni ne snima — invarijanta #2), pa
 * neusaglašenost odmah čeka provjeru: mjera je "urađena" od strane onoga ko je upisao zapis, a
 * provjerava je DRUGO lice (četiri oka). Ranije je odstupanje ostajalo samo u listi zapisa.
 * Radi u transakciji pozivaoca — zapis i njegova neusaglašenost nastaju zajedno ili nikako. */
export async function neusaglasenostIzZapisa(klijent: PoolClient, ulaz: { zapisId: string; obrazacKod: string; datum: string; korektivnaMjera: string; korisnikId: string }) {
  const broj = await sljedeciBrojNc(klijent);
  const opis = `Odstupanje u obrascu ${ulaz.obrazacKod} (${ulaz.datum})`;
  const nc = await klijent.query<{ id: string }>(
    `insert into neusaglasenost (broj, ozbiljnost, status, izvor_tip, izvor_id, opis, prijavio_korisnik_id)
     values ($1, 'SREDNJI', 'CEKA_VERIFIKACIJU', 'zapis', $2, $3, $4) returning id`,
    [broj, ulaz.zapisId, opis, ulaz.korisnikId],
  );
  const id = nc.rows[0].id;
  await klijent.query(
    `insert into korektivna_mjera (neusaglasenost_id, opis, dodijeljeno_korisnik_id, status, zavrseno_at, zavrsio_korisnik_id, rezultat)
     values ($1, $2, $3, 'ZAVRSENA', now(), $3, $2)`,
    [id, ulaz.korektivnaMjera.trim(), ulaz.korisnikId],
  );
  const dogadjajId = await emituj(klijent, { tipDogadjaja: "EVT-007", entitetTip: "neusaglasenost", entitetId: id, korisnikId: ulaz.korisnikId, podaci: { izvor: "zapis", obrazac: ulaz.obrazacKod } });
  await logIzmjena(klijent, { dogadjajId, korisnikId: ulaz.korisnikId, entitetTip: "neusaglasenost", entitetId: id, noveVrijednosti: { broj, zapisId: ulaz.zapisId } });
  await kreirajZadatak(klijent, {
    naslov: `Provjeri odstupanje ${broj} (obrazac ${ulaz.obrazacKod})`,
    opis: `Preduzeto: ${ulaz.korektivnaMjera.trim()}`,
    prioritet: "SREDNJI",
    izvorTip: "neusaglasenost",
    izvorId: id,
  });
  await obavijestiUlogu(klijent, "bzr", {
    naslov: `Odstupanje u obrascu ${ulaz.obrazacKod} — čeka vašu provjeru`,
    poruka: `${ulaz.datum}. Preduzeto: ${ulaz.korektivnaMjera.trim()}`,
    ozbiljnost: "SREDNJI",
    izvorTip: "neusaglasenost",
    izvorId: id,
  });
  return { id, broj };
}
