import { Router } from "express";
import { upit } from "../db.js";
import { asyncRuta } from "../greske.js";
import { requireUloga } from "../auth.js";

export const auditRuter = Router();
// Provjera važi SAMO za adrese ovog rutera. Ruter je montiran na zajednički "/api", pa bi
// .use(...) bez putanje važio za SVAKI zahtjev koji prođe kroz njega — i zaključao bi rute
// registrovane poslije (ovako je uprava dobijala 403 na /api/tabla).

auditRuter.get(
  "/audit",
  requireUloga("bzr", "izvodjac"),
  asyncRuta(async (request, response) => {
    const entitetTip = typeof request.query.entitetTip === "string" ? request.query.entitetTip : undefined;
    const rezultat = await upit(
      `select a.*, k.korisnicko_ime from audit_log a left join korisnik k on k.id = a.korisnik_id
       where ($1::text is null or a.entitet_tip = $1)
       order by a.created_at desc limit 300`,
      [entitetTip ?? null],
    );
    response.json(rezultat.rows);
  }),
);
