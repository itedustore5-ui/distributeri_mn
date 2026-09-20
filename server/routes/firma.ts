import { Router } from "express";
import { z } from "zod";
import { pool, upit } from "../db.js";
import { asyncRuta } from "../greske.js";
import { requireAuth, requireUloga } from "../auth.js";
import { tijelo } from "../validacija.js";

export const firmaRuter = Router();
firmaRuter.use(requireAuth);

firmaRuter.get(
  "/firma",
  asyncRuta(async (_request, response) => {
    const rezultat = await upit(`select * from firma limit 1`);
    response.json(rezultat.rows[0] ?? null);
  }),
);

const firmaSchema = z.object({
  naziv: z.string().min(2),
  pib: z.string().optional(),
  adresa: z.string().optional(),
  grad: z.string().optional(),
  telefon: z.string().optional(),
  email: z.string().email().optional().or(z.literal("")),
  odgovornoLiceIme: z.string().optional(),
});

firmaRuter.patch(
  "/firma",
  requireUloga("bzr", "izvodjac"),
  asyncRuta(async (request, response) => {
    const ulaz = tijelo(firmaSchema, request.body);
    await pool.query(
      `update firma set naziv = $1, pib = $2, adresa = $3, grad = $4, telefon = $5, email = $6, odgovorno_lice_ime = $7, updated_at = now()
       where id = (select id from firma limit 1)`,
      [ulaz.naziv, ulaz.pib ?? null, ulaz.adresa ?? null, ulaz.grad ?? null, ulaz.telefon ?? null, ulaz.email || null, ulaz.odgovornoLiceIme ?? null],
    );
    response.status(204).end();
  }),
);
