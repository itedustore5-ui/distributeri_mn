import { Router } from "express";
import { asyncRuta, ApiGreska } from "../greske.js";
import { requireAuth, requireUloga } from "../auth.js";
import { pretraziSledljivost, lanacNaprijedZaLot, lanacNazadZaIsporuku } from "../services/sledljivostService.js";
import { str } from "../validacija.js";

export const sledljivostRuter = Router();
sledljivostRuter.use(requireAuth, requireUloga("bzr", "izvodjac", "uprava"));

sledljivostRuter.get(
  "/sledljivost/pretraga",
  asyncRuta(async (request, response) => {
    const q = typeof request.query.q === "string" ? request.query.q.trim() : "";
    if (q.length < 2) {
      response.json([]);
      return;
    }
    response.json(await pretraziSledljivost(q));
  }),
);

sledljivostRuter.get(
  "/sledljivost/lot/:id",
  asyncRuta(async (request, response) => {
    const lanac = await lanacNaprijedZaLot(str(request.params.id));
    if (lanac.length === 0) throw new ApiGreska(404, "LOT_NE_POSTOJI", "Lot nije pronađen ili nema podataka o sledljivosti.");
    response.json(lanac);
  }),
);

sledljivostRuter.get(
  "/sledljivost/isporuka/:id",
  asyncRuta(async (request, response) => {
    const lanac = await lanacNazadZaIsporuku(str(request.params.id));
    if (lanac.length === 0) throw new ApiGreska(404, "ISPORUKA_NE_POSTOJI", "Isporuka nije pronađena ili nema podataka o sledljivosti.");
    response.json(lanac);
  }),
);
