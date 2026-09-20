import { Router } from "express";
import { upit } from "../db.js";
import { asyncRuta } from "../greske.js";
import { requireAuth, requireUloga } from "../auth.js";

export const auditRuter = Router();
auditRuter.use(requireAuth, requireUloga("bzr", "izvodjac"));

auditRuter.get(
  "/audit",
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
