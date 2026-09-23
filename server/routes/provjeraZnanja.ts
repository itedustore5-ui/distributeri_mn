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
    const sesija = await upit<{ id: string; broj_pitanja: number; cuva_imena: boolean; izvor_pitanja: string }>(
      `select id, broj_pitanja, cuva_imena, izvor_pitanja from sesija_znanja where otvoren order by created_at desc limit 1`,
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
      `select id, tema, tekst, ponudjeni_odgovori from pitanje
       where aktivno and ($2 = 'sva' or izvor = $2) order by random() limit $1`,
      [sesija.rows[0].broj_pitanja, sesija.rows[0].izvor_pitanja],
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
    // Rezultat ide na Prilog 14 — ne smije se naduvati: jedan odgovor po pitanju, ne više
    // odgovora nego što provjera ima pitanja, i ništa poslije završetka.
    const stanje = await upit<{ zavrseno_at: string | null; broj_pitanja: number; odgovoreno: number; vec_odgovoreno: boolean }>(
      `select u.zavrseno_at, s.broj_pitanja,
              (select count(*)::int from odgovor_znanja o where o.ucesnik_id = u.id) as odgovoreno,
              exists(select 1 from odgovor_znanja o where o.ucesnik_id = u.id and o.pitanje_id = $2) as vec_odgovoreno
       from ucesnik_znanja u join sesija_znanja s on s.id = u.sesija_id where u.id = $1`,
      [ulaz.ucesnikId, ulaz.pitanjeId],
    );
    const st = stanje.rows[0];
    if (!st) throw new ApiGreska(404, "UCESNIK_NE_POSTOJI", "Provjera nije pronađena — uđite ponovo svojom šifrom.");
    if (st.zavrseno_at) throw new ApiGreska(409, "VEC_ZAVRSENO", "Provjera je već završena — odgovori se više ne mijenjaju.");
    if (st.vec_odgovoreno) throw new ApiGreska(409, "VEC_ODGOVORENO", "Na ovo pitanje je već odgovoreno.");
    if (st.odgovoreno >= st.broj_pitanja) throw new ApiGreska(409, "SVA_PITANJA_ODGOVORENA", "Odgovoreno je na sva pitanja — završite provjeru.");
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
    // Ponovljeno "završi" vraća upisani rezultat — ne računa ga iznova.
    const vec = await upit<{ zavrseno_at: string | null; broj_tacnih: number | null; broj_pitanja: number | null }>(
      `select zavrseno_at, broj_tacnih, broj_pitanja from ucesnik_znanja where id = $1`,
      [ucesnikId],
    );
    if (!vec.rows[0]) throw new ApiGreska(404, "UCESNIK_NE_POSTOJI", "Provjera nije pronađena — uđite ponovo svojom šifrom.");
    if (vec.rows[0].zavrseno_at) {
      response.json({ brojTacnih: vec.rows[0].broj_tacnih, brojPitanja: vec.rows[0].broj_pitanja });
      return;
    }
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
    response.json(
      (
        await upit(
          `select s.*,
                  (select count(*)::int from ucesnik_znanja u where u.sesija_id = s.id and u.zavrseno_at is not null) as broj_zavrsilo,
                  (select count(*)::int from ucesnik_znanja u where u.sesija_id = s.id and u.zavrseno_at is not null
                     and u.broj_pitanja > 0 and u.broj_tacnih * 100 >= s.prag_prolaza * u.broj_pitanja) as broj_proslo,
                  (select round(avg(u.broj_tacnih * 100.0 / nullif(u.broj_pitanja, 0)))::int from ucesnik_znanja u
                     where u.sesija_id = s.id and u.zavrseno_at is not null) as prosjek_posto
           from sesija_znanja s order by s.created_at desc`,
        )
      ).rows,
    );
  }),
);

const sesijaSchema = z.object({
  naziv: z.string().min(2),
  brojPitanja: z.number().int().positive().default(10),
  cuvaImena: z.boolean().default(true),
  pragProlaza: z.number().int().min(1).max(100).default(70),
  izvorPitanja: z.enum(["sva", "firma", "konsultant"]).default("sva"),
});

provjeraZnanjaRuter.post(
  "/provjera-znanja/sesije",
  requireAuth,
  requireUloga("bzr", "izvodjac"),
  asyncRuta(async (request: AuthZahtjev, response) => {
    const ulaz = tijelo(sesijaSchema, request.body);
    // Termin bez dovoljno pitanja iz izabranog izvora bi tiho davao kraći test — kaže se unaprijed.
    const dostupno = await upit<{ n: number }>(`select count(*)::int as n from pitanje where aktivno and ($1 = 'sva' or izvor = $1)`, [ulaz.izvorPitanja]);
    if (dostupno.rows[0].n === 0) {
      throw new ApiGreska(409, "NEMA_PITANJA", ulaz.izvorPitanja === "firma" ? "Još nema pitanja firme — unesite ih na kartici „Pitanja firme\" pa otvorite termin." : "Nema aktivnih pitanja za ovaj termin.");
    }
    const rezultat = await pool.query<{ id: string }>(
      `insert into sesija_znanja (naziv, broj_pitanja, cuva_imena, created_by, prag_prolaza, izvor_pitanja)
       values ($1, $2, $3, $4, $5, $6) returning id`,
      [ulaz.naziv, ulaz.brojPitanja, ulaz.cuvaImena, request.korisnik!.id, ulaz.pragProlaza, ulaz.izvorPitanja],
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
      `insert into pitanje (tema, tekst, ponudjeni_odgovori, tacan_indeks, izvor, created_by) values ($1, $2, $3, $4, 'konsultant', $5) returning id`,
      [ulaz.tema, ulaz.tekst, JSON.stringify(ulaz.ponudjeniOdgovori), ulaz.tacanIndeks, (request as AuthZahtjev).korisnik!.id],
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

// --- Pitanja firme: unosi ih odgovorno lice, o procedurama svoje firme. Konsultantova banka joj
// ostaje skrivena (invarijanta #14) — vidi samo SVOJA pitanja i koliko je ljudi na njih tačno odgovorilo.
provjeraZnanjaRuter.get(
  "/pitanja-firme",
  requireAuth,
  requireUloga("bzr", "izvodjac"),
  asyncRuta(async (_request, response) => {
    const rezultat = await upit(
      `select p.id, p.tema, p.tekst, p.ponudjeni_odgovori, p.tacan_indeks, p.aktivno, p.created_at,
              count(o.id)::int as broj_odgovora,
              count(o.id) filter (where o.tacan)::int as broj_tacnih
       from pitanje p left join odgovor_znanja o on o.pitanje_id = p.id
       where p.izvor = 'firma'
       group by p.id order by p.aktivno desc, p.tema, p.created_at`,
    );
    response.json(rezultat.rows);
  }),
);

const pitanjeFirmeSchema = z.object({
  tema: z.string().trim().min(2, "Upišite temu (npr. Prijem robe)."),
  tekst: z.string().trim().min(5, "Upišite pitanje."),
  ponudjeniOdgovori: z.array(z.string().trim().min(1)).min(2, "Potrebna su bar dva odgovora.").max(6),
  tacanIndeks: z.number().int().min(0),
});

provjeraZnanjaRuter.post(
  "/pitanja-firme",
  requireAuth,
  requireUloga("bzr", "izvodjac"),
  asyncRuta(async (request: AuthZahtjev, response) => {
    const ulaz = tijelo(pitanjeFirmeSchema, request.body);
    if (ulaz.tacanIndeks >= ulaz.ponudjeniOdgovori.length) throw new ApiGreska(400, "TACAN_ODGOVOR", "Označite koji je odgovor tačan.");
    const rezultat = await pool.query<{ id: string }>(
      `insert into pitanje (tema, tekst, ponudjeni_odgovori, tacan_indeks, izvor, created_by) values ($1, $2, $3, $4, 'firma', $5) returning id`,
      [ulaz.tema, ulaz.tekst, JSON.stringify(ulaz.ponudjeniOdgovori), ulaz.tacanIndeks, request.korisnik!.id],
    );
    response.status(201).json({ id: rezultat.rows[0].id });
  }),
);

// Izmjena teksta je dozvoljena dok niko nije odgovorio — poslije bi rezultati pokazivali odgovore
// na pitanje koje više ne postoji. Tada se pitanje samo isključi i unese novo.
provjeraZnanjaRuter.patch(
  "/pitanja-firme/:id",
  requireAuth,
  requireUloga("bzr", "izvodjac"),
  asyncRuta(async (request: AuthZahtjev, response) => {
    const id = z.string().uuid().parse(request.params.id);
    const postojece = await upit<{ izvor: string; broj: number }>(
      `select p.izvor, (select count(*)::int from odgovor_znanja o where o.pitanje_id = p.id) as broj from pitanje p where p.id = $1`,
      [id],
    );
    if (!postojece.rows[0] || postojece.rows[0].izvor !== "firma") throw new ApiGreska(404, "PITANJE_NE_POSTOJI", "Pitanje nije pronađeno.");
    if (typeof request.body?.aktivno === "boolean" && Object.keys(request.body).length === 1) {
      await pool.query(`update pitanje set aktivno = $1 where id = $2`, [request.body.aktivno, id]);
      response.status(204).end();
      return;
    }
    if (postojece.rows[0].broj > 0) {
      throw new ApiGreska(409, "PITANJE_VEC_KORISCENO", "Na ovo pitanje su zaposleni već odgovarali — isključite ga i unesite novo, da rezultati ostanu tačni.");
    }
    const ulaz = tijelo(pitanjeFirmeSchema, request.body);
    if (ulaz.tacanIndeks >= ulaz.ponudjeniOdgovori.length) throw new ApiGreska(400, "TACAN_ODGOVOR", "Označite koji je odgovor tačan.");
    await pool.query(`update pitanje set tema = $1, tekst = $2, ponudjeni_odgovori = $3, tacan_indeks = $4 where id = $5`, [
      ulaz.tema,
      ulaz.tekst,
      JSON.stringify(ulaz.ponudjeniOdgovori),
      ulaz.tacanIndeks,
      id,
    ]);
    response.status(204).end();
  }),
);

// Ko je radio, koliko je tačno i je li prošao — po terminu. Bez imena kad termin ne čuva imena.
provjeraZnanjaRuter.get(
  "/provjera-znanja/rezultati",
  requireAuth,
  requireUloga("bzr", "izvodjac"),
  asyncRuta(async (request, response) => {
    const sesijaId = typeof request.query.sesijaId === "string" ? request.query.sesijaId : null;
    const rezultat = await upit(
      `select u.id, s.id as sesija_id, s.naziv as sesija, s.prag_prolaza, u.sifra,
              case when s.cuva_imena then coalesce(u.ime_snapshot, l.ime) end as ime, l.radno_mjesto,
              u.broj_tacnih, u.broj_pitanja, u.zavrseno_at,
              round(u.broj_tacnih * 100.0 / nullif(u.broj_pitanja, 0))::int as posto,
              (u.broj_pitanja > 0 and u.broj_tacnih * 100 >= s.prag_prolaza * u.broj_pitanja) as prosao
       from ucesnik_znanja u join sesija_znanja s on s.id = u.sesija_id left join lice l on l.id = u.lice_id
       where u.zavrseno_at is not null and ($1::uuid is null or s.id = $1)
       order by u.zavrseno_at desc limit 500`,
      [sesijaId],
    );
    response.json(rezultat.rows);
  }),
);
