import type { PoolClient } from "pg";
import { pool } from "../db.js";
import { ApiGreska } from "../greske.js";

/** Iz kog skladišta se radi. Redom: izabrano u formi → matično skladište naloga → jedino
 * aktivno skladište firme. Firma sa više skladišta, a nalog bez matičnog: izbor je obavezan —
 * pogađanje bi upisalo robu u pogrešan magacin, a to se kasnije ne vidi dok se ne traži lot. */
export async function odrediSkladiste(klijent: PoolClient | typeof pool, trazeno: string | null | undefined, korisnikId: string): Promise<string> {
  if (trazeno) {
    const red = await klijent.query(`select 1 from skladiste where id = $1 and aktivan`, [trazeno]);
    if (!red.rows[0]) throw new ApiGreska(400, "SKLADISTE_NE_POSTOJI", "Izabrano skladište ne postoji ili više nije aktivno.");
    return trazeno;
  }
  const maticno = await klijent.query<{ id: string }>(
    `select s.id from korisnik k join skladiste s on s.id = k.skladiste_id and s.aktivan where k.id = $1`,
    [korisnikId],
  );
  if (maticno.rows[0]) return maticno.rows[0].id;
  const aktivna = await klijent.query<{ id: string }>(`select id from skladiste where aktivan order by created_at, naziv`);
  if (aktivna.rows.length === 1) return aktivna.rows[0].id;
  if (aktivna.rows.length === 0) throw new ApiGreska(409, "NEMA_SKLADISTA", "Nema nijednog aktivnog skladišta — dodajte ga u Šifarnicima.");
  throw new ApiGreska(400, "SKLADISTE_OBAVEZNO", "Firma ima više skladišta — izaberite u kom se radi.");
}
