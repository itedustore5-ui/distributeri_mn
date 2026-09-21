import { Router } from "express";
import { asyncRuta, ApiGreska } from "../greske.js";
import { requireAuth, requireUloga, type AuthZahtjev } from "../auth.js";
import { napraviBekap, poslednjiBekap, istorijaBekapa, preuzmiBekap } from "../services/bekapService.js";
import { str } from "../validacija.js";

export const bekapRuter = Router();
bekapRuter.use(requireAuth);

bekapRuter.get(
  "/bekap/poslednji",
  requireUloga("bzr", "izvodjac"),
  asyncRuta(async (_request, response) => {
    response.json(await poslednjiBekap());
  }),
);

bekapRuter.get(
  "/bekap/istorija",
  requireUloga("bzr", "izvodjac"),
  asyncRuta(async (_request, response) => {
    response.json(await istorijaBekapa());
  }),
);

bekapRuter.post(
  "/bekap",
  requireUloga("bzr", "izvodjac"),
  asyncRuta(async (request: AuthZahtjev, response) => {
    const rezultat = await napraviBekap("RUCNI", request.korisnik!.id);
    response.status(201).json(rezultat);
  }),
);

bekapRuter.get(
  "/bekap/:id/preuzmi",
  requireUloga("bzr", "izvodjac"),
  asyncRuta(async (request, response) => {
    const podaci = await preuzmiBekap(str(request.params.id));
    if (!podaci) throw new ApiGreska(404, "BEKAP_NE_POSTOJI", "Bekap nije pronađen — u bazi se čuva samo 90 dana.");
    response.json(podaci);
  }),
);
