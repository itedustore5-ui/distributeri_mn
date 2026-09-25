import { Router } from "express";
import { z } from "zod";
import { upit, transakcija } from "../db.js";
import { asyncRuta, ApiGreska, posalji } from "../greske.js";
import {
  kreirajSesiju,
  obrisiSesiju,
  obrisiSveSesijeZaKorisnika,
  postaviSesijskiKolacic,
  obrisiSesijskiKolacic,
  tokenIzZahtjeva,
  sviPrijavljeni,
  provjeriOgranicenjeLogina,
  zabiljeziNeuspjeliPokusaj,
  ocistiNeuspjelePokusaje,
  type AuthZahtjev,
} from "../auth.js";
import { hashLozinke, provjeriLozinku, lozinkaJeDovoljnoDugacka, MINIMALNA_DUZINA_LOZINKE } from "../lozinke.js";
import { tijelo } from "../validacija.js";
import { logSigurnosniDogadjaj, logIzmjenaReda, stanjeReda } from "../services/auditService.js";
import { pool } from "../db.js";
import { javniRuter } from "../provjeraRuta.js";

/** Prijava i odjava — jedine adrese naloga koje rade bez sesije. */
export const authJavniRuter = javniRuter();
export const authRuter = Router();

const prijavaSchema = z.object({
  korisnickoIme: z.string().min(1),
  lozinka: z.string().min(1),
});

authJavniRuter.post(
  "/auth/prijava",
  asyncRuta(async (request, response) => {
    const { korisnickoIme, lozinka } = tijelo(prijavaSchema, request.body);
    // Ključ je IP + korisničko ime (R-11): iza proksija i u magacinu sa jednim ruterom svi dijele IP,
    // pa bi tuđi pogrešni pokušaji zaključali prijavu svima.
    const kljucKlijenta = `${request.ip || "nepoznato"}|${korisnickoIme.trim().toLowerCase()}`;
    provjeriOgranicenjeLogina(kljucKlijenta);

    const rezultat = await upit<{ id: string; lozinka_hash: string; uloga: string; mora_promijeniti_lozinku: boolean; aktivan: boolean }>(
      `select id, lozinka_hash, uloga, mora_promijeniti_lozinku, aktivan from korisnik where korisnicko_ime = $1`,
      [korisnickoIme.trim().toLowerCase()],
    );
    const korisnik = rezultat.rows[0];
    if (!korisnik || !korisnik.aktivan || !provjeriLozinku(lozinka, korisnik.lozinka_hash)) {
      zabiljeziNeuspjeliPokusaj(kljucKlijenta);
      await logSigurnosniDogadjaj(pool, { entitetTip: "korisnik", entitetId: korisnik?.id ?? "00000000-0000-0000-0000-000000000000", ipAdresa: request.ip });
      posalji(response, 401, "POGRESNI_PODACI", "Korisničko ime ili lozinka nisu ispravni.");
      return;
    }
    ocistiNeuspjelePokusaje(kljucKlijenta);
    await pool.query(`update korisnik set poslednja_prijava_at = now() where id = $1`, [korisnik.id]);

    const token = await kreirajSesiju(korisnik.id);
    postaviSesijskiKolacic(response, token);
    response.json({ moraPromijenitiLozinku: korisnik.mora_promijeniti_lozinku, uloga: korisnik.uloga });
  }),
);

authRuter.get(
  "/auth/ja",
  sviPrijavljeni(),
  asyncRuta(async (request: AuthZahtjev, response) => {
    response.json({ korisnik: request.korisnik });
  }),
);

authJavniRuter.post(
  "/auth/odjava",
  asyncRuta(async (request, response) => {
    const token = tokenIzZahtjeva(request);
    if (token) await obrisiSesiju(token);
    obrisiSesijskiKolacic(response);
    response.status(204).end();
  }),
);

const promjenaLozinkeSchema = z.object({
  staraLozinka: z.string().min(1),
  novaLozinka: z.string().min(MINIMALNA_DUZINA_LOZINKE, `Nova lozinka mora imati najmanje ${MINIMALNA_DUZINA_LOZINKE} znakova.`),
});

authRuter.post(
  "/auth/promijeni-lozinku",
  sviPrijavljeni(),
  asyncRuta(async (request: AuthZahtjev, response) => {
    const { staraLozinka, novaLozinka } = tijelo(promjenaLozinkeSchema, request.body);
    if (!lozinkaJeDovoljnoDugacka(novaLozinka)) {
      throw new ApiGreska(400, "LOZINKA_PREKRATKA", `Lozinka mora imati najmanje ${MINIMALNA_DUZINA_LOZINKE} znakova.`);
    }
    const rezultat = await upit<{ lozinka_hash: string }>(`select lozinka_hash from korisnik where id = $1`, [request.korisnik!.id]);
    if (!provjeriLozinku(staraLozinka, rezultat.rows[0].lozinka_hash)) {
      throw new ApiGreska(401, "STARA_LOZINKA_NETACNA", "Trenutna lozinka nije ispravna.");
    }
    await transakcija(async (klijent) => {
      const prije = await stanjeReda(klijent, "korisnik", request.korisnik!.id, true);
      await klijent.query(
        `update korisnik set lozinka_hash = $1, lozinka_stanje = 'svoja', mora_promijeniti_lozinku = false, updated_at = now() where id = $2`,
        [hashLozinke(novaLozinka), request.korisnik!.id],
      );
      // Heš se ne upisuje nigdje — samo da je lozinka promijenjena i sa koje adrese.
      await logIzmjenaReda(klijent, {
        korisnikId: request.korisnik!.id, entitetTip: "korisnik", entitetId: request.korisnik!.id,
        prije, poslije: await stanjeReda(klijent, "korisnik", request.korisnik!.id),
        dodatno: { lozinka: "promijenjena (sam korisnik)", ip: request.ip ?? null },
      });
      // Nova lozinka odjavljuje sve ostale uređaje — ako je stara procurila, stara prijava ne važi.
      await obrisiSveSesijeZaKorisnika(request.korisnik!.id, tokenIzZahtjeva(request), klijent);
    });
    response.status(204).end();
  }),
);
