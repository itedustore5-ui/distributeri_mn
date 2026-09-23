import { Router } from "express";
import { z } from "zod";
import { upit } from "../db.js";
import { asyncRuta, ApiGreska } from "../greske.js";
import { requireAuth, requireUloga, ogranicenjeDatuma, provjeriProzorUpisa, type AuthZahtjev } from "../auth.js";
import { tijelo, str } from "../validacija.js";
import { kreirajPrijem, donesiOdlukuOLotu, izmijeniStavku } from "../services/prijemService.js";

export const prijemRuter = Router();
prijemRuter.use(requireAuth);

prijemRuter.get(
  "/prijem",
  asyncRuta(async (request: AuthZahtjev, response) => {
    const ogranicenje = ogranicenjeDatuma(request.korisnik!.uloga, "p.datum_prijema");
    const rezultat = await upit(
      `select p.*, d.naziv as dobavljac_naziv,
              (select count(*) from lot l where l.prijem_id = p.id) as broj_stavki
       from prijem p join dobavljac d on d.id = p.dobavljac_id
       where ${ogranicenje}
       order by p.datum_prijema desc, p.created_at desc`,
    );
    response.json(rezultat.rows);
  }),
);

prijemRuter.get(
  "/prijem/:id",
  asyncRuta(async (request, response) => {
    const prijem = await upit(`select p.*, d.naziv as dobavljac_naziv from prijem p join dobavljac d on d.id = p.dobavljac_id where p.id = $1`, [request.params.id]);
    if (!prijem.rows[0]) throw new ApiGreska(404, "PRIJEM_NE_POSTOJI", "Prijem nije pronađen.");
    const stavke = await upit(
      `select ps.*, l.broj_lota, l.status as lot_status, l.rok_trajanja, a.naziv as artikal_naziv
       from prijem_stavka ps join lot l on l.id = ps.lot_id join artikal a on a.id = ps.artikal_id
       where ps.prijem_id = $1 order by a.naziv`,
      [request.params.id],
    );
    response.json({ ...prijem.rows[0], stavke: stavke.rows });
  }),
);

const stavkaSchema = z.object({
  artikalId: z.string().uuid(),
  brojLota: z.string().min(1, "Broj lota je obavezan — bez njega nema sledljivosti."),
  proizvodniDatum: z.string().optional(),
  rokTrajanja: z.string().optional(),
  primljenaKolicina: z.number().positive(),
  temperaturaPrijema: z.number().optional(),
});

const noviPrijemSchema = z.object({
  dobavljacId: z.string().uuid(),
  brojDokumenta: z.string().optional(),
  datumPrijema: z.string(),
  napomena: z.string().optional(),
  stavke: z.array(stavkaSchema).min(1),
});

prijemRuter.post(
  "/prijem",
  requireUloga("operater", "bzr", "izvodjac"),
  asyncRuta(async (request: AuthZahtjev, response) => {
    const ulaz = tijelo(noviPrijemSchema, request.body);
    provjeriProzorUpisa(request.korisnik!.uloga, ulaz.datumPrijema);
    const prijemId = await kreirajPrijem(ulaz, request.korisnik!.id);
    response.status(201).json({ id: prijemId });
  }),
);

const izmjenaStavkeSchema = z.object({
  brojLota: z.string().min(1).optional(),
  proizvodniDatum: z.string().optional(),
  rokTrajanja: z.string().optional(),
  primljenaKolicina: z.number().positive().optional(),
  temperaturaPrijema: z.number().optional(),
});

prijemRuter.patch(
  "/prijem/:prijemId/lot/:lotId",
  requireUloga("operater", "bzr", "izvodjac"),
  asyncRuta(async (request: AuthZahtjev, response) => {
    const ulaz = tijelo(izmjenaStavkeSchema, request.body);
    const prijem = await upit<{ datum_prijema: string }>(
      `select p.datum_prijema from lot l join prijem p on p.id = l.prijem_id where l.id = $1`,
      [str(request.params.lotId)],
    );
    if (!prijem.rows[0]) throw new ApiGreska(404, "LOT_NE_POSTOJI", "Stavka prijema nije pronađena.");
    // Izmjena je upis — isti prozor kao za novi prijem, inače magacioner mijenja staru stavku koja čeka odluku.
    provjeriProzorUpisa(request.korisnik!.uloga, prijem.rows[0].datum_prijema);
    await izmijeniStavku(str(request.params.lotId), ulaz, request.korisnik!.id);
    response.status(204).end();
  }),
);

const odlukaSchema = z.object({
  odluka: z.enum(["PRIHVATI", "HOLD", "ODBIJI"]),
  kolicina: z.number().nonnegative(),
  napomena: z.string().optional(),
});

prijemRuter.patch(
  "/prijem/:prijemId/lot/:lotId/odluka",
  requireUloga("bzr", "izvodjac"),
  asyncRuta(async (request: AuthZahtjev, response) => {
    const ulaz = tijelo(odlukaSchema, request.body);
    const rezultat = await donesiOdlukuOLotu(str(request.params.lotId), ulaz.odluka, ulaz.kolicina, ulaz.napomena, request.korisnik!.id);
    response.json(rezultat);
  }),
);
