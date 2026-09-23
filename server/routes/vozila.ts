import { Router } from "express";
import { z } from "zod";
import { pool, upit } from "../db.js";
import { asyncRuta } from "../greske.js";
import { requireAuth, requireUloga, type AuthZahtjev } from "../auth.js";
import { tijelo } from "../validacija.js";
import { zabiljeziKontroluVozila } from "../services/vozilaService.js";
import { logKreiranje } from "../services/auditService.js";

export const vozilaRuter = Router();
vozilaRuter.use(requireAuth);

vozilaRuter.get("/vozila", asyncRuta(async (_request, response) => {
  response.json((await upit(`select * from vozilo where aktivan order by registarski_broj`)).rows);
}));

const novoVoziloSchema = z.object({
  registarskiBroj: z.string().min(3),
  tip: z.string().optional(),
  tempKontrolisano: z.boolean().default(false),
  tempMin: z.number().optional(),
  tempMax: z.number().optional(),
});

vozilaRuter.post(
  "/vozila",
  requireUloga("bzr", "izvodjac"),
  asyncRuta(async (request: AuthZahtjev, response) => {
    const ulaz = tijelo(novoVoziloSchema, request.body);
    const rezultat = await pool.query<{ id: string }>(
      `insert into vozilo (registarski_broj, tip, temp_kontrolisano, temp_min, temp_max) values ($1, $2, $3, $4, $5) returning id`,
      [ulaz.registarskiBroj, ulaz.tip ?? null, ulaz.tempKontrolisano, ulaz.tempMin ?? null, ulaz.tempMax ?? null],
    );
    await logKreiranje(pool, { korisnikId: request.korisnik!.id, entitetTip: "vozilo", entitetId: rezultat.rows[0].id, noveVrijednosti: ulaz });
    response.status(201).json({ id: rezultat.rows[0].id });
  }),
);

// D1 vidi SAMO vozač (i bzr/izvodjac radi nadzora) — invarijanta #24. Magacioner ovo ne vidi
// čak ni kad postoji aktivan vozač, jer zapis o vozilu potpisuje onaj ko je stajao pored njega.
vozilaRuter.get(
  "/kontrole-vozila",
  requireUloga("vozac", "bzr", "izvodjac"),
  asyncRuta(async (request, response) => {
    const voziloId = typeof request.query.voziloId === "string" ? request.query.voziloId : undefined;
    const rezultat = await upit(
      `select kv.*, v.registarski_broj, coalesce(l.ime, k.korisnicko_ime) as izvrsio,
              to_char(kv.izvrseno_at at time zone 'Europe/Podgorica', 'YYYY-MM-DD') as datum
       from kontrola_vozila kv
       join vozilo v on v.id = kv.vozilo_id
       left join korisnik k on k.id = kv.izvrsio_korisnik_id
       left join lice l on l.id = k.lice_id
       where ($1::uuid is null or kv.vozilo_id = $1) order by kv.izvrseno_at desc limit 100`,
      [voziloId ?? null],
    );
    response.json(rezultat.rows);
  }),
);

const kontrolaSchema = z.object({
  vozilId: z.string().uuid(),
  cistoca: z.boolean(),
  temperatura: z.number().optional(),
  opremaOk: z.boolean(),
  vrataOk: z.boolean(),
  napomena: z.string().optional(),
});

vozilaRuter.post(
  "/kontrole-vozila",
  requireUloga("vozac", "bzr", "izvodjac"),
  asyncRuta(async (request: AuthZahtjev, response) => {
    const ulaz = tijelo(kontrolaSchema, request.body);
    const rezultat = await zabiljeziKontroluVozila(ulaz, request.korisnik!.id);
    response.status(201).json(rezultat);
  }),
);
