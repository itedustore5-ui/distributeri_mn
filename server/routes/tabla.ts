import { Router } from "express";
import { upit } from "../db.js";
import { asyncRuta } from "../greske.js";
import { requireAuth } from "../auth.js";

export const tablaRuter = Router();
tablaRuter.use(requireAuth);

tablaRuter.get(
  "/tabla",
  asyncRuta(async (_request, response) => {
    const [nc, temp, vozila, lotovi, zadaci, prijemi, isporuke, knjizice, povlacenja, zapisi] = await Promise.all([
      upit(`select ozbiljnost, count(*)::int as broj from neusaglasenost where status not in ('ZATVORENA') group by ozbiljnost`),
      upit(`select count(*)::int as broj from mjerenje_temperature where rezultat = 'FAIL' and izmjereno_at > now() - interval '24 hours'`),
      upit(`select count(*)::int as broj from vozilo where status = 'NIJE_SPREMNO' and aktivan`),
      upit(`select count(*)::int as broj from lot where status = 'HOLD'`),
      upit(`select count(*)::int as broj from zadatak where status not in ('ZAVRSEN', 'OTKAZAN') and rok_at is not null and rok_at < now()`),
      upit(`select count(*)::int as broj from prijem where datum_prijema = current_date`),
      upit(`select count(*)::int as broj from isporuka where datum_isporuke = current_date`),
      upit(`select count(*)::int as broj from v_lica where knjizica_status in ('ISTEKLA', 'USKORO')`),
      upit(`select count(*)::int as broj from povlacenje where status = 'U_TOKU'`),
      upit(`select count(*)::int as broj from zapis where datum = current_date`),
    ]);

    response.json({
      kriticno: {
        neusaglasenostiVisoke: Number(nc.rows.find((r) => r.ozbiljnost === "VISOK")?.broj ?? 0),
        neusaglasenostiOtvorene: nc.rows.reduce((zbir, r) => zbir + Number(r.broj), 0),
        temperatureVanOpsega: temp.rows[0]?.broj ?? 0,
        vozilaNijeSpremno: vozila.rows[0]?.broj ?? 0,
        lotoviNaHoldu: lotovi.rows[0]?.broj ?? 0,
        zadaciZakasnili: zadaci.rows[0]?.broj ?? 0,
        knjizicIstice: knjizice.rows[0]?.broj ?? 0,
        povlacenjaUToku: povlacenja.rows[0]?.broj ?? 0,
      },
      operativno: {
        prijemiDanas: prijemi.rows[0]?.broj ?? 0,
        isporukeDanas: isporuke.rows[0]?.broj ?? 0,
        zapisiDanas: zapisi.rows[0]?.broj ?? 0,
      },
    });
  }),
);
