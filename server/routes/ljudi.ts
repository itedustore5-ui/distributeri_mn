import { Router } from "express";
import { z } from "zod";
import type { PoolClient } from "pg";
import { pool, upit, transakcija } from "../db.js";
import { asyncRuta, ApiGreska } from "../greske.js";
import { requireAuth, requireUloga, smijeDodijelitiUlogu, obrisiSveSesijeZaKorisnika, type AuthZahtjev, type Uloga } from "../auth.js";
import { hashLozinke, lozinkaJeDovoljnoDugacka, MINIMALNA_DUZINA_LOZINKE } from "../lozinke.js";
import { tijelo, str } from "../validacija.js";
import { logKreiranje, logIzmjena } from "../services/auditService.js";
import crypto from "node:crypto";
import { danasCG } from "../vrijeme.js";
import { sljedeciBroj } from "../services/brojeviService.js";

export const ljudiRuter = Router();
ljudiRuter.use(requireAuth);

ljudiRuter.get(
  "/lica",
  asyncRuta(async (_request, response) => {
    const rezultat = await upit(`select * from v_lica order by ime`);
    response.json(rezultat.rows);
  }),
);

const ULOGE = ["bzr", "operater", "vozac", "uprava", "izvodjac"] as const;
const lozinkaPolje = z.string().optional();

const noviNalogPodaci = z.object({
  korisnickoIme: z.string().trim().min(3, "Korisničko ime mora imati bar 3 znaka."),
  uloga: z.enum(ULOGE),
  // Lozinku može da zada odgovorno lice (da je izgovori čovjeku); prazno = sistem je predloži.
  // Svakako je privremena: pri prvoj prijavi se mora promijeniti.
  lozinka: lozinkaPolje,
});

const noviLiceSchema = z.object({
  ime: z.string().min(2),
  radnoMjesto: z.string().optional(),
  rukujeHranom: z.boolean().default(true),
  sanitarnaKnjizicaBroj: z.string().optional(),
  sanitarnaKnjizicaRok: z.string().optional(),
  nalog: noviNalogPodaci.optional(),
});

const JEDINSTVEN = "23505";

/** Otvaranje naloga — jedno mjesto za "Novi nalog" i za "Novo lice + nalog". Radi u transakciji
 * pozivaoca, pa lice bez naloga (ili nalog bez lica) ne ostaje ako drugi korak padne. */
async function otvoriNalog(
  klijent: PoolClient,
  request: AuthZahtjev,
  ulaz: { liceId?: string | null; korisnickoIme: string; uloga: Uloga; lozinka?: string },
) {
  if (!smijeDodijelitiUlogu(request.korisnik!.uloga, ulaz.uloga)) {
    throw new ApiGreska(403, "NEDOZVOLJENA_ULOGA", "Ne možete otvoriti nalog sa tom ulogom.");
  }
  const zadata = ulaz.lozinka?.trim();
  if (zadata && !lozinkaJeDovoljnoDugacka(zadata)) {
    throw new ApiGreska(400, "LOZINKA_KRATKA", `Lozinka mora imati najmanje ${MINIMALNA_DUZINA_LOZINKE} znakova.`);
  }
  const korisnickoIme = ulaz.korisnickoIme.trim().toLowerCase();
  const zauzeto = await klijent.query(`select 1 from korisnik where korisnicko_ime = $1`, [korisnickoIme]);
  if (zauzeto.rows[0]) throw new ApiGreska(409, "KORISNICKO_IME_ZAUZETO", `Korisničko ime "${korisnickoIme}" je zauzeto — dodajte broj ili još jedno slovo prezimena.`);
  if (ulaz.liceId) {
    const vecIma = await klijent.query(`select korisnicko_ime from korisnik where lice_id = $1 and aktivan`, [ulaz.liceId]);
    if (vecIma.rows[0]) throw new ApiGreska(409, "LICE_IMA_NALOG", `Ovo lice već ima nalog (${vecIma.rows[0].korisnicko_ime}). Ako je zaboravio lozinku — "Nova lozinka" na kartici Nalozi.`);
  }
  const privremenaLozinka = zadata || crypto.randomBytes(9).toString("base64url").slice(0, MINIMALNA_DUZINA_LOZINKE + 2);
  try {
    const rezultat = await klijent.query<{ id: string }>(
      `insert into korisnik (korisnicko_ime, lozinka_hash, uloga, lice_id) values ($1, $2, $3, $4) returning id`,
      [korisnickoIme, hashLozinke(privremenaLozinka), ulaz.uloga, ulaz.liceId ?? null],
    );
    await logKreiranje(klijent, { korisnikId: request.korisnik!.id, entitetTip: "korisnik", entitetId: rezultat.rows[0].id, noveVrijednosti: { uloga: ulaz.uloga, liceId: ulaz.liceId ?? null } });
    return { id: rezultat.rows[0].id, korisnickoIme, privremenaLozinka };
  } catch (e) {
    if ((e as { code?: string }).code === JEDINSTVEN) throw new ApiGreska(409, "KORISNICKO_IME_ZAUZETO", `Korisničko ime "${korisnickoIme}" je zauzeto.`);
    throw e;
  }
}

ljudiRuter.post(
  "/lica",
  requireUloga("bzr", "izvodjac"),
  asyncRuta(async (request: AuthZahtjev, response) => {
    const { nalog, ...ulaz } = tijelo(noviLiceSchema, request.body);
    const rezultat = await transakcija(async (klijent) => {
      const sifra = await sljedeciBroj(klijent, "lice", "M", 2);
      const lice = await klijent.query<{ id: string }>(
        `insert into lice (ime, radno_mjesto, rukuje_hranom, sifra, sanitarna_knjizica_broj, sanitarna_knjizica_rok)
         values ($1, $2, $3, $4, $5, $6) returning id`,
        [ulaz.ime, ulaz.radnoMjesto ?? null, ulaz.rukujeHranom, sifra, ulaz.sanitarnaKnjizicaBroj ?? null, ulaz.sanitarnaKnjizicaRok ?? null],
      );
      await logKreiranje(klijent, { korisnikId: request.korisnik!.id, entitetTip: "lice", entitetId: lice.rows[0].id, noveVrijednosti: ulaz });
      const otvoren = nalog ? await otvoriNalog(klijent, request, { ...nalog, liceId: lice.rows[0].id }) : null;
      return { id: lice.rows[0].id, sifra, nalog: otvoren && { korisnickoIme: otvoren.korisnickoIme, privremenaLozinka: otvoren.privremenaLozinka } };
    });
    // Lozinka se prikazuje TAČNO OVDJE, jednom (invarijanta #28).
    response.status(201).json(rezultat);
  }),
);

const izmjenaLiceSchema = noviLiceSchema.partial().extend({ aktivan: z.boolean().optional() });

ljudiRuter.patch(
  "/lica/:id",
  requireUloga("bzr", "izvodjac"),
  asyncRuta(async (request: AuthZahtjev, response) => {
    const ulaz = tijelo(izmjenaLiceSchema, request.body);
    await transakcija(async (klijent) => {
      await klijent.query(
        `update lice set
           ime = coalesce($1, ime),
           radno_mjesto = coalesce($2, radno_mjesto),
           rukuje_hranom = coalesce($3, rukuje_hranom),
           sanitarna_knjizica_broj = coalesce($4, sanitarna_knjizica_broj),
           sanitarna_knjizica_rok = coalesce($5, sanitarna_knjizica_rok),
           aktivan = coalesce($6, aktivan),
           updated_at = now()
         where id = $7`,
        [ulaz.ime ?? null, ulaz.radnoMjesto ?? null, ulaz.rukujeHranom ?? null, ulaz.sanitarnaKnjizicaBroj ?? null, ulaz.sanitarnaKnjizicaRok ?? null, ulaz.aktivan ?? null, request.params.id],
      );
      await logIzmjena(klijent, { korisnikId: request.korisnik!.id, entitetTip: "lice", entitetId: str(request.params.id), noveVrijednosti: ulaz });
    });
    response.status(204).end();
  }),
);

// Samo ime i id aktivnih vozača — za izbor vozača pri pripremi isporuke, bez ostalih podataka o nalozima.
ljudiRuter.get(
  "/vozaci",
  asyncRuta(async (_request, response) => {
    const rezultat = await upit(
      `select k.id, coalesce(l.ime, k.korisnicko_ime) as ime
       from korisnik k left join lice l on l.id = k.lice_id
       where k.uloga = 'vozac' and k.aktivan order by 2`,
    );
    response.json(rezultat.rows);
  }),
);

// Godišnji plan obuke — Prilog 13.
ljudiRuter.get(
  "/plan-obuke",
  asyncRuta(async (_request, response) => {
    const rezultat = await upit(`select * from v_plan_obuke order by planirani_datum`);
    response.json(rezultat.rows);
  }),
);

const noviPlanSchema = z.object({
  liceId: z.string().uuid(),
  tema: z.string().min(2),
  planiraniDatum: z.string(),
  napomena: z.string().optional(),
});

ljudiRuter.post(
  "/plan-obuke",
  requireUloga("bzr", "izvodjac"),
  asyncRuta(async (request: AuthZahtjev, response) => {
    const ulaz = tijelo(noviPlanSchema, request.body);
    const rezultat = await transakcija(async (klijent) => {
      const rezultat = await klijent.query<{ id: string }>(
        `insert into plan_obuke (lice_id, tema, planirani_datum, napomena) values ($1, $2, $3, $4) returning id`,
        [ulaz.liceId, ulaz.tema, ulaz.planiraniDatum, ulaz.napomena ?? null],
      );
      await logKreiranje(klijent, { korisnikId: request.korisnik!.id, entitetTip: "plan_obuke", entitetId: rezultat.rows[0].id, noveVrijednosti: ulaz });
      return rezultat;
    });
    response.status(201).json({ id: rezultat.rows[0].id });
  }),
);

ljudiRuter.patch(
  "/plan-obuke/:id/uradjeno",
  requireUloga("bzr", "izvodjac"),
  asyncRuta(async (request: AuthZahtjev, response) => {
    const obavljenoDatum = typeof request.body?.obavljenoDatum === "string" ? request.body.obavljenoDatum : danasCG();
    await pool.query(`update plan_obuke set obavljeno_datum = $1 where id = $2`, [obavljenoDatum, request.params.id]);
    response.status(204).end();
  }),
);

// Nalozi za prijavu — bzr otvara samo operater/vozac u svojoj firmi (invarijanta #13).
ljudiRuter.get(
  "/nalozi",
  requireUloga("bzr", "izvodjac"),
  asyncRuta(async (_request, response) => {
    const rezultat = await upit(
      `select k.id, k.korisnicko_ime, k.uloga, k.lozinka_stanje, k.aktivan, k.poslednja_prijava_at, l.ime as lice_ime,
              k.skladiste_id, s.naziv as skladiste_naziv
       from korisnik k left join lice l on l.id = k.lice_id left join skladiste s on s.id = k.skladiste_id
       order by k.uloga, k.korisnicko_ime`,
    );
    response.json(rezultat.rows);
  }),
);

const noviNalogSchema = noviNalogPodaci.extend({ liceId: z.string().uuid().optional() });

ljudiRuter.post(
  "/nalozi",
  requireUloga("bzr", "izvodjac"),
  asyncRuta(async (request: AuthZahtjev, response) => {
    const ulaz = tijelo(noviNalogSchema, request.body);
    const rezultat = await transakcija((klijent) => otvoriNalog(klijent, request, ulaz));
    // Lozinka se prikazuje TAČNO OVDJE, jednom, pri postavljanju (invarijanta #28).
    response.status(201).json(rezultat);
  }),
);

/** bzr/izvodjac smiju da diraju samo nalog čija SADAŠNJA uloga smiju i da dodijele —
 * bez ovoga bi bzr mogao da promijeni ulogu ili deaktivira drugog bzr ili konsultanta
 * (invarijanta #13: "nikad sebi ravan ni iznad sebe"), jer smijeDodijelitiUlogu sama
 * po sebi provjerava samo CILJNU ulogu, ne i trenutnu. */
async function provjeriMozeDaDirneNalog(request: AuthZahtjev, ciljId: string) {
  const cilj = await pool.query<{ uloga: Uloga }>(`select uloga from korisnik where id = $1`, [ciljId]);
  if (!cilj.rows[0]) throw new ApiGreska(404, "NALOG_NE_POSTOJI", "Nalog nije pronađen.");
  if (!smijeDodijelitiUlogu(request.korisnik!.uloga, cilj.rows[0].uloga)) {
    throw new ApiGreska(403, "NEDOZVOLJEN_NALOG", "Nemate dozvolu da mijenjate ovaj nalog.");
  }
}

ljudiRuter.patch(
  "/nalozi/:id/uloga",
  requireUloga("bzr", "izvodjac"),
  asyncRuta(async (request: AuthZahtjev, response) => {
    const ciljUloga = z.enum(["bzr", "operater", "vozac", "uprava", "izvodjac"]).parse(request.body?.uloga);
    if (!smijeDodijelitiUlogu(request.korisnik!.uloga, ciljUloga)) {
      throw new ApiGreska(403, "NEDOZVOLJENA_ULOGA", "Ne možete dodijeliti tu ulogu.");
    }
    await provjeriMozeDaDirneNalog(request, str(request.params.id));
    await transakcija(async (klijent) => {
      await klijent.query(`update korisnik set uloga = $1, updated_at = now() where id = $2`, [ciljUloga, request.params.id]);
      await obrisiSveSesijeZaKorisnika(str(request.params.id), undefined, klijent);
    });
    response.status(204).end();
  }),
);

// Zaboravljena lozinka: odgovorno lice postavlja NOVU privremenu — staru ne vidi niko, ni ono
// (invarijanta #28). Sve prijave tog naloga se prekidaju, a pri sljedećoj se lozinka mora promijeniti.
ljudiRuter.patch(
  "/nalozi/:id/lozinka",
  requireUloga("bzr", "izvodjac"),
  asyncRuta(async (request: AuthZahtjev, response) => {
    const ciljId = str(request.params.id);
    if (ciljId === request.korisnik!.id) throw new ApiGreska(409, "SVOJA_LOZINKA", "Svoju lozinku mijenjate na svojoj strani (Moja strana → Promjena lozinke).");
    await provjeriMozeDaDirneNalog(request, ciljId);
    const { lozinka } = tijelo(z.object({ lozinka: lozinkaPolje }), request.body ?? {});
    const zadata = lozinka?.trim();
    if (zadata && !lozinkaJeDovoljnoDugacka(zadata)) {
      throw new ApiGreska(400, "LOZINKA_KRATKA", `Lozinka mora imati najmanje ${MINIMALNA_DUZINA_LOZINKE} znakova.`);
    }
    const privremenaLozinka = zadata || crypto.randomBytes(9).toString("base64url").slice(0, MINIMALNA_DUZINA_LOZINKE + 2);
    await transakcija(async (klijent) => {
      await klijent.query(
        `update korisnik set lozinka_hash = $1, lozinka_stanje = 'privremena', mora_promijeniti_lozinku = true, updated_at = now() where id = $2`,
        [hashLozinke(privremenaLozinka), ciljId],
      );
      await obrisiSveSesijeZaKorisnika(ciljId, undefined, klijent);
      await logIzmjena(klijent, { korisnikId: request.korisnik!.id, entitetTip: "korisnik", entitetId: ciljId, noveVrijednosti: { lozinka: "postavljena nova privremena" } });
    });
    response.json({ privremenaLozinka });
  }),
);

ljudiRuter.patch(
  "/nalozi/:id/deaktiviraj",
  requireUloga("bzr", "izvodjac"),
  asyncRuta(async (request: AuthZahtjev, response) => {
    await provjeriMozeDaDirneNalog(request, str(request.params.id));
    await transakcija(async (klijent) => {
      await klijent.query(`update korisnik set aktivan = false, updated_at = now() where id = $1`, [request.params.id]);
      await obrisiSveSesijeZaKorisnika(str(request.params.id), undefined, klijent);
    });
    response.status(204).end();
  }),
);

// Matično skladište naloga — samo podrazumijevani izbor u formama; magacioner po potrebi bira
// drugo skladište pri samom unosu. Ista granica kao za ostale izmjene naloga (invarijanta #13),
// osim što svako smije da postavi svoje.
const maticnoSchema = z.object({ skladisteId: z.string().uuid().nullable() });

ljudiRuter.patch(
  "/nalozi/:id/skladiste",
  requireUloga("bzr", "izvodjac"),
  asyncRuta(async (request: AuthZahtjev, response) => {
    const ciljId = str(request.params.id);
    const { skladisteId } = tijelo(maticnoSchema, request.body);
    if (ciljId !== request.korisnik!.id) await provjeriMozeDaDirneNalog(request, ciljId);
    if (skladisteId) {
      const postoji = await pool.query(`select 1 from skladiste where id = $1 and aktivan`, [skladisteId]);
      if (!postoji.rows[0]) throw new ApiGreska(400, "SKLADISTE_NE_POSTOJI", "Izabrano skladište ne postoji ili više nije aktivno.");
    }
    await transakcija(async (klijent) => {
      await klijent.query(`update korisnik set skladiste_id = $1 where id = $2`, [skladisteId, ciljId]);
      await logIzmjena(klijent, { korisnikId: request.korisnik!.id, entitetTip: "korisnik", entitetId: ciljId, noveVrijednosti: { skladisteId } });
    });
    response.status(204).end();
  }),
);
