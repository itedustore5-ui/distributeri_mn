import { Router } from "express";
import { z } from "zod";
import { pool, upit } from "../db.js";
import { asyncRuta } from "../greske.js";
import { requireAuth, requireUloga, type AuthZahtjev } from "../auth.js";
import { tijelo, str } from "../validacija.js";
import { logKreiranje, logIzmjena } from "../services/auditService.js";

export const sifarniciRuter = Router();
sifarniciRuter.use(requireAuth);

const dobavljacSchema = z.object({
  naziv: z.string().min(2),
  pib: z.string().optional(),
  adresa: z.string().optional(),
  telefon: z.string().optional(),
  email: z.string().email().optional().or(z.literal("")),
});

sifarniciRuter.get("/dobavljaci", asyncRuta(async (_request, response) => {
  response.json((await upit(`select * from dobavljac where aktivan order by naziv`)).rows);
}));

sifarniciRuter.post(
  "/dobavljaci",
  requireUloga("bzr", "izvodjac"),
  asyncRuta(async (request: AuthZahtjev, response) => {
    const ulaz = tijelo(dobavljacSchema, request.body);
    const rezultat = await pool.query<{ id: string }>(
      `insert into dobavljac (naziv, pib, adresa, telefon, email) values ($1, $2, $3, $4, $5) returning id`,
      [ulaz.naziv, ulaz.pib ?? null, ulaz.adresa ?? null, ulaz.telefon ?? null, ulaz.email || null],
    );
    await logKreiranje(pool, { korisnikId: request.korisnik!.id, entitetTip: "dobavljac", entitetId: rezultat.rows[0].id, noveVrijednosti: ulaz });
    response.status(201).json({ id: rezultat.rows[0].id });
  }),
);

sifarniciRuter.patch(
  "/dobavljaci/:id",
  requireUloga("bzr", "izvodjac"),
  asyncRuta(async (request: AuthZahtjev, response) => {
    const ulaz = tijelo(dobavljacSchema, request.body);
    await pool.query(
      `update dobavljac set naziv = $1, pib = $2, adresa = $3, telefon = $4, email = $5 where id = $6`,
      [ulaz.naziv, ulaz.pib ?? null, ulaz.adresa ?? null, ulaz.telefon ?? null, ulaz.email || null, request.params.id],
    );
    await logIzmjena(pool, { korisnikId: request.korisnik!.id, entitetTip: "dobavljac", entitetId: str(request.params.id), noveVrijednosti: ulaz });
    response.status(204).end();
  }),
);

// Kupac bez telefona se ne upisuje (invarijanta #4) — telefon je NOT NULL i u zod šemi i u bazi.
const kupacSchema = z.object({
  naziv: z.string().min(2),
  adresa: z.string().optional(),
  telefon: z.string().min(6, "Telefon je obavezan — povlačenje robe počinje telefonom."),
  email: z.string().email().optional().or(z.literal("")),
});

sifarniciRuter.get("/kupci", asyncRuta(async (_request, response) => {
  response.json((await upit(`select * from kupac where aktivan order by naziv`)).rows);
}));

sifarniciRuter.post(
  "/kupci",
  requireUloga("bzr", "izvodjac", "operater"),
  asyncRuta(async (request: AuthZahtjev, response) => {
    const ulaz = tijelo(kupacSchema, request.body);
    const rezultat = await pool.query<{ id: string }>(
      `insert into kupac (naziv, adresa, telefon, email) values ($1, $2, $3, $4) returning id`,
      [ulaz.naziv, ulaz.adresa ?? null, ulaz.telefon, ulaz.email || null],
    );
    await logKreiranje(pool, { korisnikId: request.korisnik!.id, entitetTip: "kupac", entitetId: rezultat.rows[0].id, noveVrijednosti: ulaz });
    response.status(201).json({ id: rezultat.rows[0].id });
  }),
);

sifarniciRuter.patch(
  "/kupci/:id",
  requireUloga("bzr", "izvodjac", "operater"),
  asyncRuta(async (request: AuthZahtjev, response) => {
    const ulaz = tijelo(kupacSchema, request.body);
    await pool.query(
      `update kupac set naziv = $1, adresa = $2, telefon = $3, email = $4 where id = $5`,
      [ulaz.naziv, ulaz.adresa ?? null, ulaz.telefon, ulaz.email || null, request.params.id],
    );
    await logIzmjena(pool, { korisnikId: request.korisnik!.id, entitetTip: "kupac", entitetId: str(request.params.id), noveVrijednosti: ulaz });
    response.status(204).end();
  }),
);

const artikalSchema = z.object({
  sifra: z.string().optional(),
  naziv: z.string().min(2),
  jedinicaMjere: z.string().default("kom"),
  zahtijevaLot: z.boolean().default(true),
  tempKontrolisano: z.boolean().default(false),
  tempMin: z.number().optional(),
  tempMax: z.number().optional(),
  rokTrajanjaDana: z.number().int().optional(),
  granicaPotvrdio: z.boolean().default(false),
});

sifarniciRuter.get("/artikli", asyncRuta(async (_request, response) => {
  response.json((await upit(`select * from artikal where aktivan order by naziv`)).rows);
}));

sifarniciRuter.post(
  "/artikli",
  requireUloga("bzr", "izvodjac"),
  asyncRuta(async (request: AuthZahtjev, response) => {
    const ulaz = tijelo(artikalSchema, request.body);
    const rezultat = await pool.query<{ id: string }>(
      `insert into artikal (sifra, naziv, jedinica_mjere, zahtijeva_lot, temp_kontrolisano, temp_min, temp_max, rok_trajanja_dana, granica_potvrdio)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9) returning id`,
      [ulaz.sifra ?? null, ulaz.naziv, ulaz.jedinicaMjere, ulaz.zahtijevaLot, ulaz.tempKontrolisano, ulaz.tempMin ?? null, ulaz.tempMax ?? null, ulaz.rokTrajanjaDana ?? null, ulaz.granicaPotvrdio],
    );
    await logKreiranje(pool, { korisnikId: request.korisnik!.id, entitetTip: "artikal", entitetId: rezultat.rows[0].id, noveVrijednosti: ulaz });
    response.status(201).json({ id: rezultat.rows[0].id });
  }),
);

sifarniciRuter.patch(
  "/artikli/:id",
  requireUloga("bzr", "izvodjac"),
  asyncRuta(async (request: AuthZahtjev, response) => {
    const ulaz = tijelo(artikalSchema.partial(), request.body);
    await pool.query(
      `update artikal set
         naziv = coalesce($1, naziv), jedinica_mjere = coalesce($2, jedinica_mjere),
         zahtijeva_lot = coalesce($3, zahtijeva_lot), temp_kontrolisano = coalesce($4, temp_kontrolisano),
         temp_min = coalesce($5, temp_min), temp_max = coalesce($6, temp_max), rok_trajanja_dana = coalesce($7, rok_trajanja_dana),
         granica_potvrdio = coalesce($8, granica_potvrdio), updated_at = now()
       where id = $9`,
      [
        ulaz.naziv ?? null,
        ulaz.jedinicaMjere ?? null,
        ulaz.zahtijevaLot ?? null,
        ulaz.tempKontrolisano ?? null,
        ulaz.tempMin ?? null,
        ulaz.tempMax ?? null,
        ulaz.rokTrajanjaDana ?? null,
        ulaz.granicaPotvrdio ?? null,
        request.params.id,
      ],
    );
    await logIzmjena(pool, { korisnikId: request.korisnik!.id, entitetTip: "artikal", entitetId: str(request.params.id), noveVrijednosti: ulaz });
    response.status(204).end();
  }),
);
