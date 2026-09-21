import { Router } from "express";
import { asyncRuta } from "../greske.js";
import { requireAuth, requireUloga } from "../auth.js";
import { IZVORI_IZVOZA, izvezi, izveziSve, nizUCsv } from "../services/izvozService.js";
import { str } from "../validacija.js";

export const izvozRuter = Router();
izvozRuter.use(requireAuth, requireUloga("bzr", "izvodjac"));

/** HTTP zaglavlja moraju biti ASCII — "š"/"č"/"ž"/"đ" u nazivu izvještaja (npr.
 * "Neusaglašenosti", "Povlačenja") su rušili preuzimanje sa ERR_INVALID_CHAR. Fajl dobija
 * ASCII naziv kao osnovu (filename=) i pravi naziv preko RFC 5987 dodatka (filename*=), pa
 * savremeni pregledač i dalje snimi fajl sa kvačicama u imenu. */
function nazivZaZaglavlje(naziv: string, ekstenzija: string) {
  const osnova = naziv.replaceAll(/\s+/g, "-").toLowerCase();
  const ascii = osnova
    .replaceAll(/[šŠ]/g, "s")
    .replaceAll(/[čćČĆ]/g, "c")
    .replaceAll(/[žŽ]/g, "z")
    .replaceAll(/[đĐ]/g, "dj");
  return `attachment; filename="${ascii}.${ekstenzija}"; filename*=UTF-8''${encodeURIComponent(`${osnova}.${ekstenzija}`)}`;
}

izvozRuter.get("/izvoz/izvori", (_request, response) => {
  response.json(IZVORI_IZVOZA.map(({ kod, naziv }) => ({ kod, naziv })));
});

izvozRuter.get(
  "/izvoz/:kod.csv",
  asyncRuta(async (request, response) => {
    const { naziv, csv } = await izvezi(str(request.params.kod));
    response.setHeader("Content-Type", "text/csv; charset=utf-8");
    response.setHeader("Content-Disposition", nazivZaZaglavlje(naziv, "csv"));
    response.send(csv);
  }),
);

izvozRuter.get(
  "/izvoz/sve.json",
  asyncRuta(async (_request, response) => {
    const { podaci, nedostaje } = await izveziSve();
    response.json({ podaci, nedostaje, izvezenoAt: new Date().toISOString() });
  }),
);

izvozRuter.get(
  "/izvoz/sve.csv-arhiva",
  asyncRuta(async (_request, response) => {
    const { podaci, nedostaje } = await izveziSve();
    const dijelovi = Object.entries(podaci).map(([kod, redovi]) => `--- ${kod} ---\n${nizUCsv(redovi)}`);
    response.setHeader("Content-Type", "text/plain; charset=utf-8");
    response.send([...dijelovi, nedostaje.length ? `\nNedostaje: ${nedostaje.map((n) => n.naziv).join(", ")}` : ""].join("\n\n"));
  }),
);
