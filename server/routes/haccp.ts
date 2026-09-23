import { Router } from "express";
import { z } from "zod";
import { pool, upit, transakcija } from "../db.js";
import { asyncRuta, ApiGreska } from "../greske.js";
import { requireAuth, requireUloga, ogranicenjeDatuma, izvrsilacZa, samoMoje, provjeriProzorUpisa, type AuthZahtjev } from "../auth.js";
import { tijelo } from "../validacija.js";
import { zabiljeziMjerenje } from "../services/haccpService.js";
import { logKreiranje } from "../services/auditService.js";
import { neusaglasenostIzZapisa } from "../services/ncService.js";

export const haccpRuter = Router();
haccpRuter.use(requireAuth);

haccpRuter.get("/kontrolne-tacke", asyncRuta(async (_request, response) => {
  response.json((await upit(`select * from kontrolna_tacka where aktivan order by sifra`)).rows);
}));

haccpRuter.get(
  "/pravila-kontrole",
  asyncRuta(async (request, response) => {
    const { kontrolnaTackaId, artikalId } = request.query;
    const rezultat = await upit(
      `select * from pravilo_kontrole
       where aktivan and ($1::uuid is null or kontrolna_tacka_id = $1) and ($2::uuid is null or artikal_id = $2 or artikal_id is null)
       order by artikal_id nulls last`,
      [kontrolnaTackaId ?? null, artikalId ?? null],
    );
    response.json(rezultat.rows);
  }),
);

const novoPraviloSchema = z.object({
  kontrolnaTackaId: z.string().uuid(),
  artikalId: z.string().uuid().optional(),
  naziv: z.string().min(2),
  minVrijednost: z.number().optional(),
  maxVrijednost: z.number().optional(),
  jedinica: z.string().default("°C"),
  ozbiljnost: z.enum(["NIZAK", "SREDNJI", "VISOK"]).default("SREDNJI"),
});

// Pravila su versionisana — nova verzija zatvara prethodnu, ne prepisuje je.
haccpRuter.post(
  "/pravila-kontrole",
  requireUloga("bzr", "izvodjac"),
  asyncRuta(async (request: AuthZahtjev, response) => {
    const ulaz = tijelo(novoPraviloSchema, request.body);
    const prethodno = await pool.query<{ id: string; verzija: number }>(
      `select id, verzija from pravilo_kontrole where kontrolna_tacka_id = $1 and artikal_id is not distinct from $2 and aktivan`,
      [ulaz.kontrolnaTackaId, ulaz.artikalId ?? null],
    );
    if (prethodno.rows[0]) {
      await pool.query(`update pravilo_kontrole set aktivan = false, vazi_do = now() where id = $1`, [prethodno.rows[0].id]);
    }
    const verzija = (prethodno.rows[0]?.verzija ?? 0) + 1;
    const rezultat = await pool.query<{ id: string }>(
      `insert into pravilo_kontrole (kontrolna_tacka_id, artikal_id, naziv, min_vrijednost, max_vrijednost, jedinica, ozbiljnost, verzija)
       values ($1, $2, $3, $4, $5, $6, $7, $8) returning id`,
      [ulaz.kontrolnaTackaId, ulaz.artikalId ?? null, ulaz.naziv, ulaz.minVrijednost ?? null, ulaz.maxVrijednost ?? null, ulaz.jedinica, ulaz.ozbiljnost, verzija],
    );
    await logKreiranje(pool, { korisnikId: request.korisnik!.id, entitetTip: "pravilo_kontrole", entitetId: rezultat.rows[0].id, noveVrijednosti: ulaz });
    response.status(201).json({ id: rezultat.rows[0].id, verzija });
  }),
);

haccpRuter.get(
  "/mjerenja",
  asyncRuta(async (request: AuthZahtjev, response) => {
    const ogranicenje = ogranicenjeDatuma(request.korisnik!.uloga, "m.izmjereno_at::date");
    const rezultat = await upit(
      `select m.*, kt.naziv as kontrolna_tacka_naziv, l.broj_lota, k.korisnicko_ime as izmjerio
       from mjerenje_temperature m
       join kontrolna_tacka kt on kt.id = m.kontrolna_tacka_id
       left join lot l on l.id = m.lot_id
       left join korisnik k on k.id = m.izmjerio_korisnik_id
       where ${ogranicenje}
       order by m.izmjereno_at desc limit 200`,
    );
    response.json(rezultat.rows);
  }),
);

const novoMjerenjeSchema = z.object({
  kontrolnaTackaId: z.string().uuid(),
  lotId: z.string().uuid().optional(),
  vozilId: z.string().uuid().optional(),
  vrijednost: z.number(),
  napomena: z.string().optional(),
});

haccpRuter.post(
  "/mjerenja",
  requireUloga("operater", "bzr", "izvodjac"),
  asyncRuta(async (request: AuthZahtjev, response) => {
    const ulaz = tijelo(novoMjerenjeSchema, request.body);
    const pravilo = await upit<{ id: string; min_vrijednost: string | null; max_vrijednost: string | null }>(
      `select id, min_vrijednost, max_vrijednost from pravilo_kontrole
       where kontrolna_tacka_id = $1 and aktivan order by created_at desc limit 1`,
      [ulaz.kontrolnaTackaId],
    );
    if (!pravilo.rows[0]) {
      throw new ApiGreska(409, "PRAVILO_NE_POSTOJI", "Za ovu kontrolnu tačku još nije podešeno pravilo — obratite se odgovornom licu.");
    }
    const rezultat = await zabiljeziMjerenje(pravilo.rows[0], { ...ulaz, kontrolnaTackaId: ulaz.kontrolnaTackaId, praviloKontroleId: pravilo.rows[0].id, izmjerioKorisnikId: request.korisnik!.id });
    response.status(201).json(rezultat);
  }),
);

// Dnevni obrasci (P1/P3/P7/P8...), generički. Šema polja je u public/obrasci-cg.json.
haccpRuter.get(
  "/zapisi",
  asyncRuta(async (request: AuthZahtjev, response) => {
    const obrazacKod = typeof request.query.obrazacKod === "string" ? request.query.obrazacKod : undefined;
    const ogranicenje = ogranicenjeDatuma(request.korisnik!.uloga, "z.datum");
    const filterMoje = samoMoje(request.korisnik!.uloga) ? "and z.uneo_korisnik_id = $2" : "";
    const parametri = filterMoje ? [obrazacKod ?? null, request.korisnik!.id] : [obrazacKod ?? null];
    const rezultat = await upit(
      `select z.*, not exists(select 1 from zapis n where n.ispravlja_id = z.id) as vazeci,
              ((z.created_at at time zone 'Europe/Podgorica')::date - z.datum) as naknadno_dana
       from zapis z
       where ${ogranicenje} and ($1::text is null or z.obrazac_kod = $1) ${filterMoje}
       order by z.datum desc, z.created_at desc limit 300`,
      parametri,
    );
    response.json(rezultat.rows);
  }),
);

const noviZapisSchema = z.object({
  obrazacKod: z.string().min(1),
  datum: z.string(),
  podaci: z.record(z.string(), z.unknown()).default({}),
  odstupanje: z.boolean().default(false),
  korektivnaMjera: z.string().optional(),
  izvrsilac: z.string().optional(),
  ispravljaId: z.string().uuid().optional(),
});

haccpRuter.post(
  "/zapisi",
  requireUloga("operater", "bzr", "izvodjac"),
  asyncRuta(async (request: AuthZahtjev, response) => {
    const ulaz = tijelo(noviZapisSchema, request.body);
    provjeriProzorUpisa(request.korisnik!.uloga, ulaz.datum);
    if (ulaz.odstupanje && (!ulaz.korektivnaMjera || ulaz.korektivnaMjera.trim() === "")) {
      throw new ApiGreska(400, "MJERA_OBAVEZNA", "Odstupanje bez zapisane mjere je nalaz protiv firme, ne protiv zaposlenog — upišite korektivnu mjeru.");
    }
    const izvrsilac = izvrsilacZa(request.korisnik!, ulaz.izvrsilac);
    const rezultat = await transakcija(async (klijent) => {
      const rezultat = await klijent.query<{ id: string }>(
        `insert into zapis (obrazac_kod, datum, podaci, odstupanje, korektivna_mjera, izvrsilac, uneo_korisnik_id, ispravlja_id)
         values ($1, $2, $3, $4, $5, $6, $7, $8) returning id`,
        [ulaz.obrazacKod, ulaz.datum, JSON.stringify(ulaz.podaci), ulaz.odstupanje, ulaz.korektivnaMjera ?? null, izvrsilac, request.korisnik!.id, ulaz.ispravljaId ?? null],
      );
      await logKreiranje(klijent, { korisnikId: request.korisnik!.id, entitetTip: "zapis", entitetId: rezultat.rows[0].id, noveVrijednosti: { obrazacKod: ulaz.obrazacKod, datum: ulaz.datum } });
      return rezultat;
    });
    // Ispravka zapisa ne otvara drugu neusaglašenost za isto odstupanje.
    const nc = ulaz.odstupanje && !ulaz.ispravljaId
      ? await neusaglasenostIzZapisa({ zapisId: rezultat.rows[0].id, obrazacKod: ulaz.obrazacKod, datum: ulaz.datum, korektivnaMjera: ulaz.korektivnaMjera!, korisnikId: request.korisnik!.id })
      : null;
    response.status(201).json({ id: rezultat.rows[0].id, neusaglasenost: nc?.broj ?? null });
  }),
);
