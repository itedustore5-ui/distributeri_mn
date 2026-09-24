import { Router } from "express";
import { z } from "zod";
import { upit } from "../db.js";
import { asyncRuta, ApiGreska } from "../greske.js";
import { requireAuth, requireUloga, NA_TERENU, type AuthZahtjev } from "../auth.js";
import { tijelo, str } from "../validacija.js";
import { kreirajRucnuNeusaglasenost, dodajKorektivnuMjeru, zavrsiKorektivnuMjeru, verifikuj } from "../services/ncService.js";

export const ncRuter = Router();
ncRuter.use(requireAuth);

// Odakle je neusaglašenost došla — čitljivo, da se na listi vidi "isporuka ISP-…", a ne samo broj.
export const IZVOR_OZNAKA = `
  case nc.izvor_tip
    when 'isporuka' then (select 'Isporuka ' || i.broj || ' · ' || k.naziv from isporuka i join kupac k on k.id = i.kupac_id where i.id = nc.izvor_id)
    when 'mjerenje_temperature' then (select 'Temperatura · ' || kt.naziv || ' ' || m.vrijednost || ' °C' from mjerenje_temperature m join kontrolna_tacka kt on kt.id = m.kontrolna_tacka_id where m.id = nc.izvor_id)
    when 'kontrola_vozila' then (select 'Vozilo ' || v.registarski_broj from kontrola_vozila kv join vozilo v on v.id = kv.vozilo_id where kv.id = nc.izvor_id)
    when 'povlacenje' then (select 'Povlačenje ' || p.broj from povlacenje p where p.id = nc.izvor_id)
    when 'zapis' then (select 'Obrazac ' || z.obrazac_kod || ' · ' || to_char(z.datum, 'DD.MM.YYYY.') from zapis z where z.id = nc.izvor_id)
    else 'Prijava sa terena'
  end`;

export // Magacioner i vozač vide neusaglašenosti koje su SAMI prijavili i one gdje je mjera dodijeljena
// NJIMA (invarijanta #26) — ne sve u firmi. $2 = id korisnika.
const SAMO_MOJE_NC = `(nc.prijavio_korisnik_id = $2 or exists (select 1 from korektivna_mjera m where m.neusaglasenost_id = nc.id and m.dodijeljeno_korisnik_id = $2))`;

export const IME = (alias: string) => `(select coalesce(l.ime, k.korisnicko_ime) from korisnik k left join lice l on l.id = k.lice_id where k.id = ${alias})`;

ncRuter.get(
  "/neusaglasenosti",
  requireUloga("operater", "vozac", "bzr", "izvodjac"),
  asyncRuta(async (request: AuthZahtjev, response) => {
    const status = typeof request.query.status === "string" ? request.query.status : undefined;
    const rezultat = await upit(
      `select nc.*, ${IME("nc.prijavio_korisnik_id")} as prijavio, ${IZVOR_OZNAKA} as izvor_oznaka,
              exists(select 1 from korektivna_mjera m where m.neusaglasenost_id = nc.id and m.dodijeljeno_korisnik_id = $2 and m.status <> 'ZAVRSENA') as mjera_za_mene,
              (select ${IME("m.dodijeljeno_korisnik_id")} from korektivna_mjera m
                where m.neusaglasenost_id = nc.id and m.status <> 'ZAVRSENA' order by m.created_at desc limit 1) as mjera_kod
       from neusaglasenost nc
       where ($1::text is null or nc.status::text = $1) ${NA_TERENU.includes(request.korisnik!.uloga) ? `and ${SAMO_MOJE_NC}` : ""}
       order by (nc.status = 'ZATVORENA'), nc.created_at desc`,
      [status ?? null, request.korisnik!.id],
    );
    response.json(rezultat.rows);
  }),
);

ncRuter.get(
  "/neusaglasenosti/:id",
  requireUloga("operater", "vozac", "bzr", "izvodjac"),
  asyncRuta(async (request: AuthZahtjev, response) => {
    const naTerenu = NA_TERENU.includes(request.korisnik!.uloga);
    const nc = await upit(
      `select nc.*, ${IME("nc.prijavio_korisnik_id")} as prijavio, ${IME("nc.zatvorio_korisnik_id")} as zatvorio, ${IZVOR_OZNAKA} as izvor_oznaka
       from neusaglasenost nc where nc.id = $1 ${naTerenu ? `and ${SAMO_MOJE_NC}` : ""}`,
      naTerenu ? [request.params.id, request.korisnik!.id] : [request.params.id],
    );
    if (!nc.rows[0]) throw new ApiGreska(404, "NC_NE_POSTOJI", "Neusaglašenost nije pronađena.");
    const mjere = await upit(
      `select m.*, ${IME("m.dodijeljeno_korisnik_id")} as dodijeljeno, ${IME("m.zavrsio_korisnik_id")} as zavrsio
       from korektivna_mjera m where m.neusaglasenost_id = $1 order by m.created_at`,
      [request.params.id],
    );
    const verifikacije = await upit(
      `select v.*, ${IME("v.verifikovao_korisnik_id")} as verifikovao from verifikacija v where v.neusaglasenost_id = $1 order by v.verifikovano_at`,
      [request.params.id],
    );
    response.json({ ...nc.rows[0], korektivneMjere: mjere.rows, verifikacije: verifikacije.rows });
  }),
);

const rucnaSchema = z.object({
  ozbiljnost: z.enum(["NIZAK", "SREDNJI", "VISOK"]).default("SREDNJI"),
  opis: z.string().trim().min(3, "Opišite šta se desilo."),
  izvorTip: z.enum(["rucno", "isporuka"]).default("rucno"),
  izvorId: z.string().uuid().optional(),
});

// Prijaviti smije svako — i vozač i magacioner (to je poenta: problem se upisuje tamo gdje nastane).
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
    const neusaglasenostId = await zavrsiKorektivnuMjeru(str(request.params.id), rezultat, request.korisnik!.id, request.korisnik!.uloga);
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
