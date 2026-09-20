import { Router } from "express";
import { z } from "zod";
import { upit } from "../db.js";
import { asyncRuta, ApiGreska } from "../greske.js";
import { requireAuth, requireUloga, type AuthZahtjev } from "../auth.js";
import { tijelo, str } from "../validacija.js";
import { kreirajRucnuNeusaglasenost, dodajKorektivnuMjeru, zavrsiKorektivnuMjeru, verifikuj } from "../services/ncService.js";

export const ncRuter = Router();
ncRuter.use(requireAuth);

ncRuter.get(
  "/neusaglasenosti",
  asyncRuta(async (request, response) => {
    const status = typeof request.query.status === "string" ? request.query.status : undefined;
    const rezultat = await upit(
      `select nc.*, k.korisnicko_ime as prijavio
       from neusaglasenost nc left join korisnik k on k.id = nc.prijavio_korisnik_id
       where ($1::text is null or nc.status::text = $1)
       order by nc.created_at desc`,
      [status ?? null],
    );
    response.json(rezultat.rows);
  }),
);

ncRuter.get(
  "/neusaglasenosti/:id",
  asyncRuta(async (request, response) => {
    const nc = await upit(`select * from neusaglasenost where id = $1`, [request.params.id]);
    if (!nc.rows[0]) throw new ApiGreska(404, "NC_NE_POSTOJI", "Neusaglašenost nije pronađena.");
    const mjere = await upit(`select * from korektivna_mjera where neusaglasenost_id = $1 order by created_at`, [request.params.id]);
    const verifikacije = await upit(`select * from verifikacija where neusaglasenost_id = $1 order by verifikovano_at`, [request.params.id]);
    response.json({ ...nc.rows[0], korektivneMjere: mjere.rows, verifikacije: verifikacije.rows });
  }),
);

const rucnaSchema = z.object({
  ozbiljnost: z.enum(["NIZAK", "SREDNJI", "VISOK"]).default("SREDNJI"),
  opis: z.string().min(3),
});

ncRuter.post(
  "/neusaglasenosti",
  asyncRuta(async (request: AuthZahtjev, response) => {
    const ulaz = tijelo(rucnaSchema, request.body);
    const rezultat = await kreirajRucnuNeusaglasenost(ulaz, request.korisnik!.id);
    response.status(201).json(rezultat);
  }),
);

const mjeraSchema = z.object({
  opis: z.string().min(3, "Odstupanje bez zapisane mjere je nalaz protiv firme, ne protiv zaposlenog."),
  dodijeljenoKorisnikId: z.string().uuid().optional(),
  rok: z.string().optional(),
});

ncRuter.post(
  "/neusaglasenosti/:id/korektivna-mjera",
  requireUloga("bzr", "izvodjac"),
  asyncRuta(async (request: AuthZahtjev, response) => {
    const ulaz = tijelo(mjeraSchema, request.body);
    const mjeraId = await dodajKorektivnuMjeru(str(request.params.id), ulaz, request.korisnik!.id);
    response.status(201).json({ id: mjeraId });
  }),
);

ncRuter.post(
  "/korektivne-mjere/:id/zavrsi",
  requireUloga("bzr", "operater", "vozac", "izvodjac"),
  asyncRuta(async (request: AuthZahtjev, response) => {
    const rezultat = typeof request.body?.rezultat === "string" ? request.body.rezultat : undefined;
    const neusaglasenostId = await zavrsiKorektivnuMjeru(str(request.params.id), rezultat, request.korisnik!.id);
    response.json({ neusaglasenostId });
  }),
);

const verifikacijaSchema = z.object({
  korektivnaMjeraId: z.string().uuid().optional(),
  rezultat: z.enum(["POTVRDJENO", "ODBIJENO"]),
  napomena: z.string().optional(),
});

ncRuter.post(
  "/neusaglasenosti/:id/verifikacija",
  requireUloga("bzr", "izvodjac"),
  asyncRuta(async (request: AuthZahtjev, response) => {
    const ulaz = tijelo(verifikacijaSchema, request.body);
    const rezultat = await verifikuj(str(request.params.id), ulaz, request.korisnik!.id);
    response.json(rezultat);
  }),
);
