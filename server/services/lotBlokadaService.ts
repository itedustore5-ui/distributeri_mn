import type { PoolClient } from "pg";
import { kreirajObavjestenje } from "./zadaciService.js";

// Kad lot bude zadržan (povlačenje, temperatura van granice), isporuke koje su već pripremljene sa
// tim lotom ne smiju otići kupcu (nalaz R-01). Potvrda ih ionako odbija; ovo samo javlja vozaču i
// onome ko je isporuku pripremio, prije nego što roba krene.
export async function javiIsporukeSaLotom(klijent: PoolClient, lotId: string, razlog: string, pokrenuoKorisnikId: string) {
  const isporuke = await klijent.query<{ id: string; broj: string; kupac: string; broj_lota: string; vozac_korisnik_id: string | null; uneo_korisnik_id: string | null }>(
    `select distinct i.id, i.broj, k.naziv as kupac, l.broj_lota, i.vozac_korisnik_id, i.uneo_korisnik_id
     from isporuka i
     join isporuka_stavka s on s.isporuka_id = i.id
     join lot l on l.id = s.lot_id
     join kupac k on k.id = i.kupac_id
     where s.lot_id = $1 and i.status = 'U_PRIPREMI'`,
    [lotId],
  );
  for (const i of isporuke.rows) {
    const primaoci = new Set([i.vozac_korisnik_id, i.uneo_korisnik_id].filter((x): x is string => !!x && x !== pokrenuoKorisnikId));
    for (const korisnikId of primaoci) {
      await kreirajObavjestenje(klijent, {
        korisnikId,
        naslov: `Ne predajte lot ${i.broj_lota} — isporuka ${i.broj}`,
        poruka: `${razlog}. Isporuka ${i.broj} (${i.kupac}) sadrži taj lot. Za tu stavku upišite 0 i razlog, i javite se odgovornom licu.`,
        ozbiljnost: "VISOK",
        izvorTip: "isporuka",
        izvorId: i.id,
      });
    }
  }
  return isporuke.rows.length;
}
