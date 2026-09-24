import express, { Router } from "express";
import { z } from "zod";
import { upit, pool } from "../db.js";
import { asyncRuta, ApiGreska } from "../greske.js";
import { requireUloga, ogranicenjeDatuma, provjeriProzorUpisa, type AuthZahtjev } from "../auth.js";
import { tijelo, str } from "../validacija.js";
import { kreirajPrijem, donesiOdlukuOLotu, izmijeniStavku } from "../services/prijemService.js";
import { prepoznajVrstu, procitajOtpremnicu } from "../services/otpremnicaService.js";

export const prijemRuter = Router();
prijemRuter.get(
  "/prijem",
  requireUloga("operater", "bzr", "izvodjac"),
  asyncRuta(async (request: AuthZahtjev, response) => {
    const ogranicenje = ogranicenjeDatuma(request.korisnik!.uloga, "p.datum_prijema");
    const rezultat = await upit(
      `select p.*, d.naziv as dobavljac_naziv, s.naziv as skladiste_naziv,
              (select count(*) from lot l where l.prijem_id = p.id) as broj_stavki,
              exists (select 1 from prijem_dokument pd where pd.prijem_id = p.id) as ima_otpremnicu,
              exists (select 1 from prijem_stavka ps join lot l on l.id = ps.lot_id where ps.prijem_id = p.id and ps.po_otpremnici is not null
                        and ((ps.po_otpremnici->>'kolicina')::numeric is distinct from ps.primljena_kolicina
                             or coalesce(ps.po_otpremnici->>'lot', l.broj_lota) <> l.broj_lota)) as odstupa_od_otpremnice,
              ((p.created_at at time zone 'Europe/Podgorica')::date - p.datum_prijema) as naknadno_dana
       from prijem p join dobavljac d on d.id = p.dobavljac_id left join skladiste s on s.id = p.skladiste_id
       where ${ogranicenje}
       order by p.datum_prijema desc, p.created_at desc`,
    );
    response.json(rezultat.rows);
  }),
);

prijemRuter.get(
  "/prijem/:id",
  requireUloga("operater", "bzr", "izvodjac"),
  asyncRuta(async (request, response) => {
    const prijem = await upit(
      `select p.*, d.naziv as dobavljac_naziv, s.naziv as skladiste_naziv from prijem p
       join dobavljac d on d.id = p.dobavljac_id left join skladiste s on s.id = p.skladiste_id where p.id = $1`,
      [request.params.id],
    );
    if (!prijem.rows[0]) throw new ApiGreska(404, "PRIJEM_NE_POSTOJI", "Prijem nije pronađen.");
    const stavke = await upit(
      `select ps.*, l.broj_lota, l.status as lot_status, l.rok_trajanja, a.naziv as artikal_naziv
       from prijem_stavka ps join lot l on l.id = ps.lot_id join artikal a on a.id = ps.artikal_id
       where ps.prijem_id = $1 order by a.naziv`,
      [request.params.id],
    );
    const dokumenti = await upit(
      `select id, vrsta, naziv_fajla, mime, velicina, created_at from prijem_dokument where prijem_id = $1 order by created_at`,
      [request.params.id],
    );
    response.json({ ...prijem.rows[0], stavke: stavke.rows, dokumenti: dokumenti.rows });
  }),
);

const stavkaSchema = z.object({
  artikalId: z.string().uuid(),
  brojLota: z.string().min(1, "Broj lota je obavezan — bez njega nema sledljivosti."),
  proizvodniDatum: z.string().optional(),
  rokTrajanja: z.string().optional(),
  primljenaKolicina: z.number().positive(),
  temperaturaPrijema: z.number().optional(),
  poOtpremnici: z
    .object({
      sifra: z.string().nullable().optional(),
      naziv: z.string().nullable().optional(),
      kolicina: z.number().nullable().optional(),
      lot: z.string().nullable().optional(),
      rok: z.string().nullable().optional(),
    })
    .optional(),
});

const noviPrijemSchema = z.object({
  dobavljacId: z.string().uuid(),
  skladisteId: z.string().uuid().optional(),
  brojDokumenta: z.string().optional(),
  datumPrijema: z.string(),
  napomena: z.string().optional(),
  dokumentId: z.string().uuid().optional(),
  stavke: z.array(stavkaSchema).min(1),
});

// Otpremnica (PDF ili fotografija) → prijedlog prijema. Čita se NA OVOM SERVERU — PDF direktno,
// slika lokalnim OCR-om; ništa ne ide spoljnim servisima. Fajl se čuva (dokaz uz prijem), a veže
// se za prijem tek kad magacioner provjeri i potvrdi. Nepotvrđeni se brišu posle 2 dana.
prijemRuter.post(
  "/prijem/otpremnica",
  requireUloga("operater", "bzr", "izvodjac"),
  express.raw({ type: () => true, limit: "12mb" }),
  asyncRuta(async (request: AuthZahtjev, response) => {
    const sadrzaj = request.body;
    if (!Buffer.isBuffer(sadrzaj) || sadrzaj.length === 0) throw new ApiGreska(400, "FAJL_PRAZAN", "Nije poslat fajl otpremnice.");
    const vrsta = prepoznajVrstu(sadrzaj);
    if (!vrsta) throw new ApiGreska(415, "NEPOZNAT_FAJL", "Pošaljite PDF ili sliku otpremnice (JPG, PNG).");
    let nazivFajla: string | null = null;
    try {
      nazivFajla = decodeURIComponent(String(request.headers["x-naziv-fajla"] ?? "")).slice(0, 200) || null;
    } catch {
      nazivFajla = null;
    }
    await pool.query(`delete from prijem_dokument where prijem_id is null and created_at < now() - interval '2 days'`);
    const procitano = await procitajOtpremnicu(sadrzaj, vrsta.vrsta);
    const dokument = await pool.query<{ id: string }>(
      `insert into prijem_dokument (vrsta, naziv_fajla, mime, velicina, sadrzaj, procitano, uneo_korisnik_id)
       values ($1, $2, $3, $4, $5, $6, $7) returning id`,
      [vrsta.vrsta, nazivFajla, vrsta.mime, sadrzaj.length, sadrzaj, JSON.stringify(procitano), request.korisnik!.id],
    );
    response.status(201).json({ dokumentId: dokument.rows[0].id, vrsta: vrsta.vrsta, ...procitano });
  }),
);

// Otpremnica uz prijem — preuzima se kroz fetch (invarijanta #31).
prijemRuter.get(
  "/prijem/:id/dokument/:dokumentId",
  requireUloga("operater", "bzr", "izvodjac"),
  asyncRuta(async (request, response) => {
    const r = await upit<{ mime: string; naziv_fajla: string | null; sadrzaj: Buffer }>(
      `select mime, naziv_fajla, sadrzaj from prijem_dokument where id = $1 and prijem_id = $2`,
      [request.params.dokumentId, request.params.id],
    );
    const d = r.rows[0];
    if (!d) throw new ApiGreska(404, "DOKUMENT_NE_POSTOJI", "Otpremnica nije pronađena.");
    response.setHeader("Content-Type", d.mime);
    response.setHeader("Content-Disposition", `inline; filename*=UTF-8''${encodeURIComponent(d.naziv_fajla ?? "otpremnica")}`);
    response.send(d.sadrzaj);
  }),
);

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
