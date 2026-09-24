import { Router } from "express";
import { z } from "zod";
import { pool, upit, transakcija } from "../db.js";
import { asyncRuta, ApiGreska } from "../greske.js";
import { requireAuth, requireUloga, type AuthZahtjev } from "../auth.js";
import { tijelo, str } from "../validacija.js";
import { kreirajZadatak, kreirajObavjestenje } from "../services/zadaciService.js";
import { logKreiranje } from "../services/auditService.js";

export const zadaciRuter = Router();
zadaciRuter.use(requireAuth);

const vodiSistem = (uloga: string) => uloga === "bzr" || uloga === "izvodjac";

// Automatski zadaci (iz neusaglašenosti, povlačenja, kontrole vozila) nastaju NEDODIJELJENI —
// odgovorno lice ih vidi kao svoje dok ih ne dodijeli nekome. Terenske uloge vide samo ono što
// je dodijeljeno baš njima; uprava gleda sve, ali ne zatvara tuđe.
zadaciRuter.get(
  "/zadaci",
  asyncRuta(async (request: AuthZahtjev, response) => {
    const { id, uloga } = request.korisnik!;
    const samoMoji = request.query.moji === "1" || (!vodiSistem(uloga) && uloga !== "uprava");
    const rezultat = await upit(
      `select z.*, coalesce(l.ime, k.korisnicko_ime) as dodijeljeno,
              case z.izvor_tip when 'neusaglasenost' then nc.broj when 'povlacenje' then pv.broj end as izvor_oznaka,
              (z.rok_at is not null and z.rok_at < now()) as zakasnio
       from zadatak z
       left join korisnik k on k.id = z.dodijeljeno_korisnik_id
       left join lice l on l.id = k.lice_id
       left join neusaglasenost nc on z.izvor_tip = 'neusaglasenost' and nc.id = z.izvor_id
       left join povlacenje pv on z.izvor_tip = 'povlacenje' and pv.id = z.izvor_id
       where z.status not in ('ZAVRSEN', 'OTKAZAN')
         and ($1::boolean is false or z.dodijeljeno_korisnik_id = $2 or ($3::boolean and z.dodijeljeno_korisnik_id is null))
       order by (z.prioritet = 'VISOK') desc, z.rok_at nulls last, z.created_at desc`,
      [samoMoji, id, vodiSistem(uloga)],
    );
    response.json(rezultat.rows);
  }),
);

// Kome se zadatak može dodijeliti — svi aktivni nalozi, sa imenom sa spiska zaposlenih.
zadaciRuter.get(
  "/zadaci/izvrsioci",
  requireUloga("bzr", "izvodjac"),
  asyncRuta(async (_request, response) => {
    const rezultat = await upit(
      `select k.id, coalesce(l.ime, k.korisnicko_ime) as ime, k.uloga
       from korisnik k left join lice l on l.id = k.lice_id
       where k.aktivan order by coalesce(l.ime, k.korisnicko_ime)`,
    );
    response.json(rezultat.rows);
  }),
);

// Ručni zadatak — ono što ne nastaje samo iz sistema ("očisti komoru 2 do petka").
const noviZadatakSchema = z.object({
  naslov: z.string().trim().min(3, "Upišite šta treba uraditi."),
  opis: z.string().trim().optional(),
  dodijeljenoKorisnikId: z.string().uuid().nullable().optional(),
  prioritet: z.enum(["NIZAK", "SREDNJI", "VISOK"]).default("SREDNJI"),
  rok: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Rok mora biti datum.").optional(),
});

zadaciRuter.post(
  "/zadaci",
  requireUloga("bzr", "izvodjac"),
  asyncRuta(async (request: AuthZahtjev, response) => {
    const ulaz = tijelo(noviZadatakSchema, request.body);
    const korisnik = request.korisnik!;
    if (ulaz.dodijeljenoKorisnikId) {
      const cilj = await pool.query(`select 1 from korisnik where id = $1 and aktivan`, [ulaz.dodijeljenoKorisnikId]);
      if (!cilj.rows[0]) throw new ApiGreska(400, "NALOG_NIJE_AKTIVAN", "Zadatak se može dodijeliti samo aktivnom nalogu.");
    }
    // Rok je kraj tog dana po podgoričkom vremenu — "do petka" znači do kraja petka.
    const rokAt = ulaz.rok
      ? (await pool.query<{ rok: string }>(`select (($1::date + time '23:59') at time zone 'Europe/Podgorica')::text as rok`, [ulaz.rok])).rows[0].rok
      : null;
    const id = await transakcija(async (klijent) => {
      const id = await kreirajZadatak(klijent, {
        naslov: ulaz.naslov,
        opis: ulaz.opis || undefined,
        dodijeljenoKorisnikId: ulaz.dodijeljenoKorisnikId ?? null,
        prioritet: ulaz.prioritet,
        rokAt,
        izvorTip: "rucno",
        createdBy: korisnik.id,
      });
      if (ulaz.dodijeljenoKorisnikId && ulaz.dodijeljenoKorisnikId !== korisnik.id) {
        await kreirajObavjestenje(klijent, {
          korisnikId: ulaz.dodijeljenoKorisnikId,
          naslov: `Dodijeljen vam je zadatak: ${ulaz.naslov}`,
          poruka: [ulaz.opis, ulaz.rok ? `Rok: ${ulaz.rok}.` : ""].filter(Boolean).join(" ") || undefined,
          ozbiljnost: ulaz.prioritet === "VISOK" ? "VISOK" : "SREDNJI",
          izvorTip: "zadatak",
          izvorId: id,
        });
      }
      await logKreiranje(klijent, { korisnikId: korisnik.id, entitetTip: "zadatak", entitetId: id, noveVrijednosti: ulaz });
      return id;
    });
    response.status(201).json({ id });
  }),
);

const izmjenaSchema = z
  .object({
    status: z.enum(["OTVOREN", "U_TOKU", "ZAVRSEN", "OTKAZAN"]).optional(),
    dodijeljenoKorisnikId: z.string().uuid().nullable().optional(),
  })
  .refine((u) => u.status !== undefined || u.dodijeljenoKorisnikId !== undefined, { message: "Nema izmjene." });

zadaciRuter.patch(
  "/zadaci/:id",
  asyncRuta(async (request: AuthZahtjev, response) => {
    const ulaz = tijelo(izmjenaSchema, request.body);
    const zadatakId = str(request.params.id);
    const korisnik = request.korisnik!;
    // Dodjela, obavještenje i promjena statusa su jedna radnja: ranije je dodjela ostajala upisana
    // i kad je provjera statusa odmah zatim odbila zahtjev.
    await transakcija(async (klijent) => {
      const zadatak = await klijent.query<{ naslov: string; opis: string | null; dodijeljeno_korisnik_id: string | null }>(
        `select naslov, opis, dodijeljeno_korisnik_id from zadatak where id = $1 for update`,
        [zadatakId],
      );
      const red = zadatak.rows[0];
      if (!red) throw new ApiGreska(404, "ZADATAK_NE_POSTOJI", "Zadatak nije pronađen.");

      if (ulaz.dodijeljenoKorisnikId !== undefined) {
        if (!vodiSistem(korisnik.uloga)) {
          throw new ApiGreska(403, "NEDOZVOLJENO", "Zadatke dodjeljuje odgovorno lice.");
        }
        if (ulaz.dodijeljenoKorisnikId) {
          const cilj = await klijent.query(`select 1 from korisnik where id = $1 and aktivan`, [ulaz.dodijeljenoKorisnikId]);
          if (!cilj.rows[0]) throw new ApiGreska(400, "NALOG_NIJE_AKTIVAN", "Zadatak se može dodijeliti samo aktivnom nalogu.");
        }
        await klijent.query(`update zadatak set dodijeljeno_korisnik_id = $1 where id = $2`, [ulaz.dodijeljenoKorisnikId, zadatakId]);
        if (ulaz.dodijeljenoKorisnikId && ulaz.dodijeljenoKorisnikId !== korisnik.id && ulaz.dodijeljenoKorisnikId !== red.dodijeljeno_korisnik_id) {
          await kreirajObavjestenje(klijent, {
            korisnikId: ulaz.dodijeljenoKorisnikId,
            naslov: `Dodijeljen vam je zadatak: ${red.naslov}`,
            poruka: red.opis ?? undefined,
            ozbiljnost: "SREDNJI",
            izvorTip: "zadatak",
            izvorId: zadatakId,
          });
        }
      }

      if (ulaz.status !== undefined) {
        const dodijeljeno = ulaz.dodijeljenoKorisnikId !== undefined ? ulaz.dodijeljenoKorisnikId : red.dodijeljeno_korisnik_id;
        if (!vodiSistem(korisnik.uloga) && dodijeljeno !== korisnik.id) {
          throw new ApiGreska(403, "NIJE_VAS_ZADATAK", "Ovaj zadatak nije dodijeljen vama.");
        }
        await klijent.query(
          `update zadatak set status = $1::zadatak_status_t, zavrseno_at = case when $1::zadatak_status_t = 'ZAVRSEN' then now() else zavrseno_at end where id = $2`,
          [ulaz.status, zadatakId],
        );
      }
    });
    response.status(204).end();
  }),
);

zadaciRuter.get(
  "/obavjestenja",
  asyncRuta(async (request: AuthZahtjev, response) => {
    const rezultat = await upit(
      `select o.*, case when o.izvor_tip = 'poruka' then coalesce(l.ime, k.korisnicko_ime) end as posiljalac
       from obavjestenje o
       left join poruka p on o.izvor_tip = 'poruka' and p.id = o.izvor_id
       left join korisnik k on k.id = p.posiljalac_korisnik_id
       left join lice l on l.id = k.lice_id
       where o.korisnik_id = $1 order by o.created_at desc limit 50`,
      [request.korisnik!.id],
    );
    response.json(rezultat.rows);
  }),
);

zadaciRuter.patch(
  "/obavjestenja/procitano-sve",
  asyncRuta(async (request: AuthZahtjev, response) => {
    await pool.query(`update obavjestenje set procitano_at = now() where korisnik_id = $1 and procitano_at is null`, [request.korisnik!.id]);
    response.status(204).end();
  }),
);

zadaciRuter.patch(
  "/obavjestenja/:id/procitano",
  asyncRuta(async (request: AuthZahtjev, response) => {
    const rezultat = await pool.query(`update obavjestenje set procitano_at = now() where id = $1 and korisnik_id = $2`, [str(request.params.id), request.korisnik!.id]);
    if (rezultat.rowCount === 0) throw new ApiGreska(404, "OBAVJESTENJE_NE_POSTOJI", "Obavještenje nije pronađeno.");
    response.status(204).end();
  }),
);
