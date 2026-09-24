import { transakcija } from "../db.js";
import { ApiGreska } from "../greske.js";
import { logKreiranje } from "./auditService.js";

export type OtpisUlaz = { kolicina: number; razlog: string };

/** Otpis je jedini dozvoljeni način da količina na zalihi ide dolje bez isporuke —
 * uvijek kroz kretanje_zalihe (tip OTPIS), nikad direktan update. Bez toga bi lot
 * mogao da "nestane" sa zalihe bez traga zašto (invarijanta sledljivosti, čl. 27). */
export async function otpisiZalihu(lotId: string, ulaz: OtpisUlaz, korisnikId: string) {
  return transakcija(async (klijent) => {
    const zaliha = await klijent.query<{ id: string; kolicina: string; artikal_id: string }>(
      `select id, kolicina, artikal_id from zaliha where lot_id = $1 and status = 'DOSTUPNO' for update`,
      [lotId],
    );
    const red = zaliha.rows[0];
    if (!red) throw new ApiGreska(404, "ZALIHA_NE_POSTOJI", "Za ovaj lot nema dostupne zalihe.");

    const dostupno = Number(red.kolicina);
    if (ulaz.kolicina > dostupno) {
      throw new ApiGreska(409, "NEDOVOLJNO_ZALIHE", `Na zalihi je dostupno samo ${dostupno} za izabrani lot.`);
    }

    await klijent.query(`update zaliha set kolicina = kolicina - $1, updated_at = now() where id = $2`, [ulaz.kolicina, red.id]);

    const kretanje = await klijent.query<{ id: string }>(
      `insert into kretanje_zalihe (lot_id, artikal_id, kolicina_delta, tip, referenca_tip, izvrsio_korisnik_id, napomena)
       values ($1, $2, $3, 'OTPIS', 'otpis', $4, $5) returning id`,
      [lotId, red.artikal_id, -ulaz.kolicina, korisnikId, ulaz.razlog],
    );
    const kretanjeId = kretanje.rows[0].id;

    await logKreiranje(klijent, {
      korisnikId,
      entitetTip: "kretanje_zalihe",
      entitetId: kretanjeId,
      noveVrijednosti: { lotId, kolicina: ulaz.kolicina, razlog: ulaz.razlog, tip: "OTPIS" },
    });
  });
}
