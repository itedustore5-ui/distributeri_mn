import { transakcija } from "../db.js";
import { emituj } from "./dogadjajService.js";
import { logKreiranje, logPromjenaStatusa } from "./auditService.js";
import { kreirajZadatak, obavijestiUlogu } from "./zadaciService.js";
import { danasCG } from "../vrijeme.js";

export type NovaKontrolaVozilaUlaz = {
  vozilId: string;
  cistoca: boolean;
  temperatura?: number | null;
  opremaOk: boolean;
  vrataOk: boolean;
  napomena?: string;
};

async function sljedeciBrojNc() {
  const danas = danasCG().replaceAll("-", "").slice(2);
  return `NC-${danas}-V${Math.floor(Math.random() * 900 + 100)}`;
}

export async function zabiljeziKontroluVozila(ulaz: NovaKontrolaVozilaUlaz, korisnikId: string) {
  const prosao = ulaz.cistoca && ulaz.opremaOk && ulaz.vrataOk;
  const ukupanStatus = prosao ? "PROSAO" : "NIJE_PROSAO";

  return transakcija(async (klijent) => {
    const kontrola = await klijent.query<{ id: string }>(
      `insert into kontrola_vozila (vozilo_id, izvrsio_korisnik_id, cistoca, temperatura, oprema_ok, vrata_ok, ukupan_status, napomena)
       values ($1, $2, $3, $4, $5, $6, $7, $8) returning id`,
      [ulaz.vozilId, korisnikId, ulaz.cistoca, ulaz.temperatura ?? null, ulaz.opremaOk, ulaz.vrataOk, ukupanStatus, ulaz.napomena ?? null],
    );
    const kontrolaId = kontrola.rows[0].id;

    const noviStatusVozila = prosao ? "SPREMNO" : "NIJE_SPREMNO";
    await klijent.query(`update vozilo set status = $1 where id = $2`, [noviStatusVozila, ulaz.vozilId]);

    const dogadjajId = await emituj(klijent, {
      tipDogadjaja: prosao ? "EVT-027" : "EVT-028",
      entitetTip: "vozilo",
      entitetId: ulaz.vozilId,
      korisnikId,
      podaci: { kontrolaId, ukupanStatus },
    });
    await logKreiranje(klijent, { dogadjajId, korisnikId, entitetTip: "kontrola_vozila", entitetId: kontrolaId, noveVrijednosti: { ukupanStatus } });

    let neusaglasenostId: string | null = null;
    if (!prosao) {
      const broj = await sljedeciBrojNc();
      const nc = await klijent.query<{ id: string }>(
        `insert into neusaglasenost (broj, ozbiljnost, status, izvor_tip, izvor_id, opis, prijavio_korisnik_id)
         values ($1, 'SREDNJI', 'OTVORENA', 'kontrola_vozila', $2, $3, $4) returning id`,
        [broj, kontrolaId, `Vozilo nije prošlo kontrolu prije utovara. ${ulaz.napomena ?? ""}`.trim(), korisnikId],
      );
      neusaglasenostId = nc.rows[0].id;
      await kreirajZadatak(klijent, {
        naslov: `Popravi stanje vozila prije naredne isporuke`,
        opis: ulaz.napomena,
        prioritet: "SREDNJI",
        izvorTip: "neusaglasenost",
        izvorId: neusaglasenostId,
      });
      await obavijestiUlogu(klijent, "bzr", {
        naslov: "Vozilo nije spremno",
        poruka: `Kontrola vozila nije prošla — otvorena neusaglašenost ${broj}.`,
        ozbiljnost: "SREDNJI",
        izvorTip: "neusaglasenost",
        izvorId: neusaglasenostId,
      });
      await logPromjenaStatusa(klijent, { korisnikId, entitetTip: "vozilo", entitetId: ulaz.vozilId, noveVrijednosti: { status: "NIJE_SPREMNO" } });
    }

    return { kontrolaId, ukupanStatus, neusaglasenostId };
  });
}
