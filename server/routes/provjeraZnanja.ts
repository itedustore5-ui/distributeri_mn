import { Router } from "express";
import { z } from "zod";
import { pool, upit } from "../db.js";
import { asyncRuta, ApiGreska } from "../greske.js";
import { requireAuth, requireUloga, type AuthZahtjev } from "../auth.js";
import { tijelo } from "../validacija.js";

export const provjeraZnanjaRuter = Router();

// --- Ulazak šifrom sa spiska zaposlenih (invarijanta #32) — BEZ naloga za prijavu. ---
const uciSchema = z.object({ sifra: z.string().min(1) });

provjeraZnanjaRuter.post(
  "/provjera-znanja/uci",
  asyncRuta(async (request, response) => {
    const { sifra } = tijelo(uciSchema, request.body);
    const sesija = await upit<{ id: string; broj_pitanja: number; cuva_imena: boolean }>(
      `select id, broj_pitanja, cuva_imena from sesija_znanja where otvoren order by created_at desc limit 1`,
    );
    if (!sesija.rows[0]) throw new ApiGreska(404, "NEMA_OTVORENE_SESIJE", "Trenutno nije otvorena nijedna provjera znanja.");
    const lice = await upit<{ id: string; ime: string }>(`select id, ime from lice where sifra = $1 and aktivan`, [sifra.trim()]);
    if (!lice.rows[0]) throw new ApiGreska(404, "SIFRA_NIJE_PREPOZNATA", "Šifra nije prepoznata — provjerite je sa odgovornim licem.");

    const postojeci = await upit<{ id: string; zavrseno_at: string | null }>(
      `select id, zavrseno_at from ucesnik_znanja where sesija_id = $1 and sifra = $2`,
      [sesija.rows[0].id, sifra.trim()],
    );
    if (postojeci.rows[0]?.zavrseno_at) {
      throw new ApiGreska(409, "VEC_ZAVRSENO", "Provjera je već završena za ovu šifru.");
    }

    const ucesnikId =
      postojeci.rows[0]?.id ??
      (
        await pool.query<{ id: string }>(
          `insert into ucesnik_znanja (sesija_id, lice_id, sifra, ime_snapshot) values ($1, $2, $3, $4) returning id`,
          [sesija.rows[0].id, lice.rows[0].id, sifra.trim(), sesija.rows[0].cuva_imena ? lice.rows[0].ime : null],
        )
      ).rows[0].id;

    const pitanja = await upit<{ id: string; tema: string; tekst: string; ponudjeni_odgovori: string[] }>(
      `select id, tema, tekst, ponudjeni_odgovori from pitanje where aktivno order by random() limit $1`,
      [sesija.rows[0].broj_pitanja],
    );

    response.json({
      ucesnikId,
      ime: sesija.rows[0].cuva_imena ? lice.rows[0].ime : null,
      pitanja: pitanja.rows,
    });
  }),
);

const odgovorSchema = z.object({ ucesnikId: z.string().uuid(), pitanjeId: z.string().uuid(), datIndeks: z.number().int() });

provjeraZnanjaRuter.post(
  "/provjera-znanja/odgovor",
  asyncRuta(async (request, response) => {
    const ulaz = tijelo(odgovorSchema, request.body);
    const pitanje = await upit<{ tacan_indeks: number }>(`select tacan_indeks from pitanje where id = $1`, [ulaz.pitanjeId]);
    if (!pitanje.rows[0]) throw new ApiGreska(404, "PITANJE_NE_POSTOJI", "Pitanje nije pronađeno.");
    const tacan = pitanje.rows[0].tacan_indeks === ulaz.datIndeks;
    await pool.query(
      `insert into odgovor_znanja (ucesnik_id, pitanje_id, dat_indeks, tacan) values ($1, $2, $3, $4)`,
      [ulaz.ucesnikId, ulaz.pitanjeId, ulaz.datIndeks, tacan],
    );
    response.status(204).end();
  }),
);

provjeraZnanjaRuter.post(
  "/provjera-znanja/zavrsi",
  asyncRuta(async (request, response) => {
    const ucesnikId = z.string().uuid().parse(request.body?.ucesnikId);
    const rezultat = await pool.query<{ broj_tacnih: number; broj_pitanja: number }>(
      `select count(*) filter (where tacan)::int as broj_tacnih, count(*)::int as broj_pitanja from odgovor_znanja where ucesnik_id = $1`,
      [ucesnikId],
    );
    const { broj_tacnih, broj_pitanja } = rezultat.rows[0];
    await pool.query(`update ucesnik_znanja set zavrseno_at = now(), broj_tacnih = $1, broj_pitanja = $2 where id = $3`, [broj_tacnih, broj_pitanja, ucesnikId]);
    response.json({ brojTacnih: broj_tacnih, brojPitanja: broj_pitanja });
  }),
);

// --- Upravljanje sesijama i bankom pitanja — samo izvodjac vidi pitanja (invarijanta #14). ---
provjeraZnanjaRuter.get(
  "/provjera-znanja/sesije",
  requireAuth,
  requireUloga("bzr", "izvodjac"),
  asyncRuta(async (_request, response) => {
    response.json((await upit(`select * from sesija_znanja order by created_at desc`)).rows);
  }),
);

const sesijaSchema = z.object({
  naziv: z.string().min(2),
  brojPitanja: z.number().int().positive().default(10),
  cuvaImena: z.boolean().default(true),
});

provjeraZnanjaRuter.post(
  "/provjera-znanja/sesije",
  requireAuth,
  requireUloga("bzr", "izvodjac"),
  asyncRuta(async (request: AuthZahtjev, response) => {
    const ulaz = tijelo(sesijaSchema, request.body);
    const rezultat = await pool.query<{ id: string }>(
      `insert into sesija_znanja (naziv, broj_pitanja, cuva_imena, created_by) values ($1, $2, $3, $4) returning id`,
      [ulaz.naziv, ulaz.brojPitanja, ulaz.cuvaImena, request.korisnik!.id],
    );
    response.status(201).json({ id: rezultat.rows[0].id });
  }),
);

provjeraZnanjaRuter.patch(
  "/provjera-znanja/sesije/:id/zatvori",
  requireAuth,
  requireUloga("bzr", "izvodjac"),
  asyncRuta(async (request, response) => {
    await pool.query(`update sesija_znanja set otvoren = false where id = $1`, [request.params.id]);
    response.status(204).end();
  }),
);

provjeraZnanjaRuter.get(
  "/pitanja",
  requireAuth,
  requireUloga("izvodjac"),
  asyncRuta(async (_request, response) => {
    response.json((await upit(`select * from pitanje order by tema, created_at`)).rows);
  }),
);

const pitanjeSchema = z.object({
  tema: z.string().min(2),
  tekst: z.string().min(5),
  ponudjeniOdgovori: z.array(z.string().min(1)).min(2),
  tacanIndeks: z.number().int().nonnegative(),
});

provjeraZnanjaRuter.post(
  "/pitanja",
  requireAuth,
  requireUloga("izvodjac"),
  asyncRuta(async (request, response) => {
    const ulaz = tijelo(pitanjeSchema, request.body);
    const rezultat = await pool.query<{ id: string }>(
      `insert into pitanje (tema, tekst, ponudjeni_odgovori, tacan_indeks) values ($1, $2, $3, $4) returning id`,
      [ulaz.tema, ulaz.tekst, JSON.stringify(ulaz.ponudjeniOdgovori), ulaz.tacanIndeks],
    );
    response.status(201).json({ id: rezultat.rows[0].id });
  }),
);

provjeraZnanjaRuter.get(
  "/evidencija-osposobljavanja",
  requireAuth,
  requireUloga("bzr", "izvodjac"),
  asyncRuta(async (_request, response) => {
    response.json((await upit(`select * from v_evidencija_osposobljavanja order by ime`)).rows);
  }),
);
