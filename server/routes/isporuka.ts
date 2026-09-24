import { Router } from "express";
import { z } from "zod";
import { upit } from "../db.js";
import { asyncRuta, ApiGreska } from "../greske.js";
import { requireAuth, requireUloga, ogranicenjeDatuma, samoMoje, provjeriProzorUpisa, type AuthZahtjev } from "../auth.js";
import { tijelo, str } from "../validacija.js";
import { kreirajIsporuku, izmijeniIsporuku, potvrdiIsporuku } from "../services/isporukaService.js";

export const isporukaRuter = Router();
isporukaRuter.use(requireAuth);

isporukaRuter.get(
  "/isporuke",
  requireUloga("operater", "vozac", "bzr", "izvodjac"),
  asyncRuta(async (request: AuthZahtjev, response) => {
    const ogranicenje = ogranicenjeDatuma(request.korisnik!.uloga, "i.datum_isporuke");
    // Vozač vidi i isporuke koje je magacioner pripremio i njemu dodijelio, ne samo svoje.
    const filterMoje = samoMoje(request.korisnik!.uloga) ? "and (i.uneo_korisnik_id = $1 or i.vozac_korisnik_id = $1)" : "";
    const parametri = filterMoje ? [request.korisnik!.id] : [];
    const rezultat = await upit(
      `select i.*, k.naziv as kupac_naziv, k.telefon as kupac_telefon, v.registarski_broj, s.naziv as skladiste_naziv,
              (select count(*)::int from neusaglasenost nc where nc.izvor_tip = 'isporuka' and nc.izvor_id = i.id and nc.status <> 'ZATVORENA') as otvorena_odstupanja,
              ((i.created_at at time zone 'Europe/Podgorica')::date - i.datum_isporuke) as naknadno_dana
       from isporuka i join kupac k on k.id = i.kupac_id left join vozilo v on v.id = i.vozilo_id
       left join skladiste s on s.id = i.skladiste_id
       where ${ogranicenje} ${filterMoje}
       order by i.datum_isporuke desc, i.created_at desc`,
      parametri,
    );
    response.json(rezultat.rows);
  }),
);

isporukaRuter.get(
  "/isporuke/:id",
  requireUloga("operater", "vozac", "bzr", "izvodjac"),
  asyncRuta(async (request, response) => {
    const isporuka = await upit(
      `select i.*, k.naziv as kupac_naziv, k.telefon as kupac_telefon, v.registarski_broj, s.naziv as skladiste_naziv from isporuka i
       join kupac k on k.id = i.kupac_id left join vozilo v on v.id = i.vozilo_id left join skladiste s on s.id = i.skladiste_id
       where i.id = $1`,
      [request.params.id],
    );
    if (!isporuka.rows[0]) throw new ApiGreska(404, "ISPORUKA_NE_POSTOJI", "Isporuka nije pronađena.");
    const stavke = await upit(
      `select ist.*, l.broj_lota, a.naziv as artikal_naziv, a.temp_kontrolisano, a.temp_min, a.temp_max, a.granica_potvrdio from isporuka_stavka ist
       join lot l on l.id = ist.lot_id join artikal a on a.id = l.artikal_id where ist.isporuka_id = $1`,
      [request.params.id],
    );
    response.json({ ...isporuka.rows[0], stavke: stavke.rows });
  }),
);

const stavkaSchema = z.object({ lotId: z.string().uuid(), planiranaKolicina: z.number().positive() });
const novaIsporukaSchema = z.object({
  kupacId: z.string().uuid(),
  skladisteId: z.string().uuid().optional(),
  vozilId: z.string().uuid().optional(),
  vozacKorisnikId: z.string().uuid().optional(),
  datumIsporuke: z.string(),
  napomena: z.string().optional(),
  stavke: z.array(stavkaSchema).min(1),
});

isporukaRuter.post(
  "/isporuke",
  requireUloga("operater", "vozac", "bzr", "izvodjac"),
  asyncRuta(async (request: AuthZahtjev, response) => {
    const ulaz = tijelo(novaIsporukaSchema, request.body);
    provjeriProzorUpisa(request.korisnik!.uloga, ulaz.datumIsporuke);
    const isporukaId = await kreirajIsporuku(ulaz, request.korisnik!.id);
    response.status(201).json({ id: isporukaId });
  }),
);

isporukaRuter.patch(
  "/isporuke/:id",
  requireUloga("operater", "vozac", "bzr", "izvodjac"),
  asyncRuta(async (request: AuthZahtjev, response) => {
    const ulaz = tijelo(novaIsporukaSchema.omit({ kupacId: true, napomena: true }), request.body);
    provjeriProzorUpisa(request.korisnik!.uloga, ulaz.datumIsporuke);
    await izmijeniIsporuku(str(request.params.id), ulaz, request.korisnik!.id);
    response.status(204).end();
  }),
);

const potvrdaStavkaSchema = z.object({
  stavkaId: z.string().uuid(),
  isporucenaKolicina: z.number().nonnegative(),
  odbijenaKolicina: z.number().nonnegative().optional(),
  razlogOdbijanja: z.string().optional(),
  temperaturaPredaje: z.number().min(-40).max(40).nullable().optional(),
});

isporukaRuter.post(
  "/isporuke/:id/potvrda",
  requireUloga("vozac", "operater", "bzr", "izvodjac"),
  asyncRuta(async (request: AuthZahtjev, response) => {
    const stavke = tijelo(z.array(potvrdaStavkaSchema).min(1), request.body?.stavke);
    const rezultat = await potvrdiIsporuku(str(request.params.id), stavke, request.korisnik!.id);
    response.json(rezultat);
  }),
);
