import { Router } from "express";
import { z } from "zod";
import { asyncRuta } from "../greske.js";
import { requireUloga, type AuthZahtjev, type Uloga } from "../auth.js";
import { tijelo, str } from "../validacija.js";
import * as poruke from "../services/porukeService.js";

export const porukeRuter = Router();
// Poruke šalju odgovorno lice, konsultant i uprava — uprava inače samo gleda, ali uputstvo
// zaposlenima ("od ponedjeljka utovar u 6h") je njena stvar.
const SALJU: Uloga[] = ["bzr", "izvodjac", "uprava"];

porukeRuter.get(
  "/poruke/primaoci",
  requireUloga(...SALJU),
  asyncRuta(async (request: AuthZahtjev, response) => {
    response.json(await poruke.moguciPrimaoci(request.korisnik!.id));
  }),
);

const porukaSchema = z.object({
  naslov: z.string().trim().min(2, "Upišite naslov poruke.").max(200),
  tekst: z.string().trim().max(2000).optional(),
  vazno: z.boolean().default(false),
  primaoci: z.discriminatedUnion("nacin", [
    z.object({ nacin: z.literal("svi") }),
    z.object({ nacin: z.literal("uloge"), uloge: z.array(z.enum(["operater", "vozac", "bzr", "uprava", "izvodjac"])).min(1, "Izaberite bar jednu grupu.") }),
    z.object({ nacin: z.literal("pojedinacno"), korisnici: z.array(z.string().uuid()).min(1, "Izaberite bar jednu osobu.") }),
  ]),
});

porukeRuter.post(
  "/poruke",
  requireUloga(...SALJU),
  asyncRuta(async (request: AuthZahtjev, response) => {
    response.status(201).json(await poruke.posaljiPoruku(tijelo(porukaSchema, request.body), request.korisnik!.id));
  }),
);

porukeRuter.get(
  "/poruke",
  requireUloga(...SALJU),
  asyncRuta(async (_request, response) => {
    response.json(await poruke.poslatePoruke());
  }),
);

porukeRuter.get(
  "/poruke/:id/primaoci",
  requireUloga(...SALJU),
  asyncRuta(async (request, response) => {
    response.json(await poruke.primaociPoruke(str(request.params.id)));
  }),
);
