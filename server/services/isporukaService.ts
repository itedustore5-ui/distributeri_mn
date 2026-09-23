import { transakcija, upit } from "../db.js";
import { ApiGreska } from "../greske.js";
import { emituj } from "./dogadjajService.js";
import { logKreiranje, logPromjenaStatusa } from "./auditService.js";
import { danasCG } from "../vrijeme.js";

export type StavkaIsporukeUlaz = { lotId: string; planiranaKolicina: number };
export type NovaIsporukaUlaz = {
  kupacId: string;
  vozilId?: string | null;
  vozacKorisnikId?: string | null;
  datumIsporuke: string;
  napomena?: string;
  stavke: StavkaIsporukeUlaz[];
};

async function sljedeciBrojIsporuke() {
  const danas = danasCG().replaceAll("-", "").slice(2);
  const rezultat = await upit<{ broj: number }>(`select count(*)::int as broj from isporuka where broj like $1`, [`ISP-${danas}-%`]);
  return `ISP-${danas}-${String((rezultat.rows[0]?.broj ?? 0) + 1).padStart(3, "0")}`;
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

  return transakcija(async (klijent) => {
    for (const stavka of ulaz.stavke) {
      const lot = await klijent.query<{ status: string; dostupno: string | null }>(
        `select l.status, z.kolicina as dostupno from lot l
         left join zaliha z on z.lot_id = l.id and z.status = 'DOSTUPNO'
         where l.id = $1`,
        [stavka.lotId],
      );
      const red = lot.rows[0];
      if (!red || red.status !== "PRIHVACEN") {
        throw new ApiGreska(409, "LOT_NIJE_DOSTUPAN", "Isporuka nije dozvoljena jer izabrani lot nije u statusu PRIHVAĆEN.");
      }
      const dostupno = Number(red.dostupno ?? 0);
      if (dostupno < stavka.planiranaKolicina) {
        throw new ApiGreska(409, "NEDOVOLJNO_ZALIHE", `Na zalihi je dostupno samo ${dostupno} za izabrani lot.`);
      }
    }

    const broj = await sljedeciBrojIsporuke();
    const isporuka = await klijent.query<{ id: string }>(
      `insert into isporuka (broj, kupac_id, vozilo_id, vozac_korisnik_id, uneo_korisnik_id, datum_isporuke, status, napomena)
       values ($1, $2, $3, $4, $5, $6, 'U_PRIPREMI', $7) returning id`,
      [broj, ulaz.kupacId, ulaz.vozilId ?? null, ulaz.vozacKorisnikId ?? null, korisnikId, ulaz.datumIsporuke, ulaz.napomena ?? null],
    );
    const isporukaId = isporuka.rows[0].id;

    for (const stavka of ulaz.stavke) {
      await klijent.query(
        `insert into isporuka_stavka (isporuka_id, lot_id, planirana_kolicina) values ($1, $2, $3)`,
        [isporukaId, stavka.lotId, stavka.planiranaKolicina],
      );
    }

    await emituj(klijent, { tipDogadjaja: "EVT-030", entitetTip: "isporuka", entitetId: isporukaId, korisnikId });
    await logKreiranje(klijent, { korisnikId, entitetTip: "isporuka", entitetId: isporukaId, noveVrijednosti: { broj, kupacId: ulaz.kupacId } });

    return isporukaId;
  });
}

export type IzmjenaIsporukeUlaz = {
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
    const isporukaRed = await klijent.query<{ status: string }>(`select status from isporuka where id = $1 for update`, [isporukaId]);
    if (!isporukaRed.rows[0]) throw new ApiGreska(404, "ISPORUKA_NE_POSTOJI", "Isporuka nije pronađena.");
    if (isporukaRed.rows[0].status !== "U_PRIPREMI") {
      throw new ApiGreska(409, "ISPORUKA_VEC_POTVRDJENA", "Isporuka se više ne može mijenjati — već je potvrđena.");
    }

    for (const stavka of ulaz.stavke) {
      const lot = await klijent.query<{ status: string; dostupno: string | null }>(
        `select l.status, z.kolicina as dostupno from lot l
         left join zaliha z on z.lot_id = l.id and z.status = 'DOSTUPNO'
         where l.id = $1`,
        [stavka.lotId],
      );
      const red = lot.rows[0];
      if (!red || red.status !== "PRIHVACEN") {
        throw new ApiGreska(409, "LOT_NIJE_DOSTUPAN", "Isporuka nije dozvoljena jer izabrani lot nije u statusu PRIHVAĆEN.");
      }
      const dostupno = Number(red.dostupno ?? 0);
      if (dostupno < stavka.planiranaKolicina) {
        throw new ApiGreska(409, "NEDOVOLJNO_ZALIHE", `Na zalihi je dostupno samo ${dostupno} za izabrani lot.`);
      }
    }

    await klijent.query(`delete from isporuka_stavka where isporuka_id = $1`, [isporukaId]);
    for (const stavka of ulaz.stavke) {
      await klijent.query(
        `insert into isporuka_stavka (isporuka_id, lot_id, planirana_kolicina) values ($1, $2, $3)`,
        [isporukaId, stavka.lotId, stavka.planiranaKolicina],
      );
    }
    await klijent.query(`update isporuka set vozilo_id = $1, vozac_korisnik_id = $2, datum_isporuke = $3, updated_at = now() where id = $4`, [
      ulaz.vozilId ?? null,
      ulaz.vozacKorisnikId ?? null,
      ulaz.datumIsporuke,
      isporukaId,
    ]);

    await logKreiranje(klijent, { korisnikId, entitetTip: "isporuka", entitetId: isporukaId, noveVrijednosti: { izmijenjeno: true, stavke: ulaz.stavke } });
  });
}

export type StavkaPotvrdeUlaz = { stavkaId: string; isporucenaKolicina: number; odbijenaKolicina?: number; razlogOdbijanja?: string };

export async function potvrdiIsporuku(isporukaId: string, stavke: StavkaPotvrdeUlaz[], korisnikId: string) {
  return transakcija(async (klijent) => {
    const isporukaRed = await klijent.query<{ status: string }>(`select status from isporuka where id = $1 for update`, [isporukaId]);
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
      const stavkaRed = await klijent.query<{ lot_id: string; planirana_kolicina: string; artikal_id: string }>(
        `select is2.lot_id, is2.planirana_kolicina, l.artikal_id from isporuka_stavka is2 join lot l on l.id = is2.lot_id where is2.id = $1`,
        [stavka.stavkaId],
      );
      const red = stavkaRed.rows[0];
      if (!red) throw new ApiGreska(404, "STAVKA_NE_POSTOJI", "Stavka isporuke nije pronađena.");
      const planirano = Number(red.planirana_kolicina);
      const isporuceno = stavka.isporucenaKolicina;
      const odbijeno = stavka.odbijenaKolicina ?? 0;
      if (isporuceno + odbijeno > planirano) {
        throw new ApiGreska(400, "KOLICINA_PREKORACENA", "Isporučena i odbijena količina ne mogu biti veće od planirane.");
      }
      ukupnoPlanirano += planirano;
      ukupnoIsporuceno += isporuceno;

      await klijent.query(
        `update isporuka_stavka set isporucena_kolicina = $1, odbijena_kolicina = $2, razlog_odbijanja = $3 where id = $4`,
        [isporuceno, odbijeno, stavka.razlogOdbijanja ?? null, stavka.stavkaId],
      );

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

    return { status };
  });
}
