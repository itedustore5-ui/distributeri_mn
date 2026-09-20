import { Router } from "express";
import { z } from "zod";
import { pool, upit } from "../db.js";
import { asyncRuta } from "../greske.js";
import { requireAuth, type AuthZahtjev } from "../auth.js";
import { tijelo } from "../validacija.js";

export const zadaciRuter = Router();
zadaciRuter.use(requireAuth);

zadaciRuter.get(
  "/zadaci",
  asyncRuta(async (request: AuthZahtjev, response) => {
    const samoMoji = request.query.moji === "1";
    const rezultat = await upit(
      `select z.*, k.korisnicko_ime as dodijeljeno
       from zadatak z left join korisnik k on k.id = z.dodijeljeno_korisnik_id
       where z.status not in ('ZAVRSEN', 'OTKAZAN') and ($1::boolean is false or z.dodijeljeno_korisnik_id = $2)
       order by z.rok_at nulls last, z.created_at desc`,
      [samoMoji, request.korisnik!.id],
    );
    response.json(rezultat.rows);
  }),
);

const izmjenaSchema = z.object({ status: z.enum(["OTVOREN", "U_TOKU", "ZAVRSEN", "OTKAZAN"]) });

zadaciRuter.patch(
  "/zadaci/:id",
  asyncRuta(async (request, response) => {
    const { status } = tijelo(izmjenaSchema, request.body);
    await pool.query(`update zadatak set status = $1, zavrseno_at = case when $1 = 'ZAVRSEN' then now() else zavrseno_at end where id = $2`, [status, request.params.id]);
    response.status(204).end();
  }),
);

zadaciRuter.get(
  "/obavjestenja",
  asyncRuta(async (request: AuthZahtjev, response) => {
    const rezultat = await upit(
      `select * from obavjestenje where korisnik_id = $1 order by created_at desc limit 50`,
      [request.korisnik!.id],
    );
    response.json(rezultat.rows);
  }),
);

zadaciRuter.patch(
  "/obavjestenja/:id/procitano",
  asyncRuta(async (request, response) => {
    await pool.query(`update obavjestenje set procitano_at = now() where id = $1`, [request.params.id]);
    response.status(204).end();
  }),
);
