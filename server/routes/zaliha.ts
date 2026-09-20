import { Router } from "express";
import { upit } from "../db.js";
import { asyncRuta, ApiGreska } from "../greske.js";
import { requireAuth } from "../auth.js";
import { lanacNaprijedZaLot, vremenskaLinijaZaEntitet } from "../services/sledljivostService.js";
import { str } from "../validacija.js";

export const zalihaRuter = Router();
zalihaRuter.use(requireAuth);

zalihaRuter.get(
  "/zaliha",
  asyncRuta(async (_request, response) => {
    response.json((await upit(`select * from v_zaliha_dostupna`)).rows);
  }),
);

zalihaRuter.get(
  "/lotovi",
  asyncRuta(async (request, response) => {
    const status = typeof request.query.status === "string" ? request.query.status : undefined;
    const rezultat = await upit(
      `select l.*, a.naziv as artikal_naziv, d.naziv as dobavljac_naziv,
              coalesce((select sum(z.kolicina) from zaliha z where z.lot_id = l.id and z.status = 'DOSTUPNO'), 0) as dostupno
       from lot l join artikal a on a.id = l.artikal_id join dobavljac d on d.id = l.dobavljac_id
       where ($1::text is null or l.status::text = $1)
       order by l.rok_trajanja nulls last`,
      [status ?? null],
    );
    response.json(rezultat.rows);
  }),
);

zalihaRuter.get(
  "/lotovi/:id",
  asyncRuta(async (request, response) => {
    const lot = await upit(
      `select l.*, a.naziv as artikal_naziv, d.naziv as dobavljac_naziv from lot l
       join artikal a on a.id = l.artikal_id join dobavljac d on d.id = l.dobavljac_id where l.id = $1`,
      [request.params.id],
    );
    if (!lot.rows[0]) throw new ApiGreska(404, "LOT_NE_POSTOJI", "Lot nije pronađen.");
    const lanac = await lanacNaprijedZaLot(str(request.params.id));
    const vremenskaLinija = await vremenskaLinijaZaEntitet("lot", str(request.params.id));
    response.json({ ...lot.rows[0], lanac, vremenskaLinija });
  }),
);
