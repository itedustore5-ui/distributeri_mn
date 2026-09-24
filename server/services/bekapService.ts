import { pool, tabelaPostoji, transakcija } from "../db.js";
import { obavijestiUlogu } from "./zadaciService.js";

/** Sve poslovne tabele — u istom redoslijedu kao db/*.sql. Namjerno bez schema_migracije
 * (samo bookkeeping migracija, ne podatak) i bez pogleda (izvode se iz ovih tabela). */
const TABELE = [
  "firma", "korisnik", "lice",
  "dobavljac", "kupac", "artikal", "razlog_sifra", "opasnost_sifra",
  "prijem", "prijem_stavka", "lot", "zaliha", "kretanje_zalihe",
  "kontrolna_tacka", "pravilo_kontrole", "mjerenje_temperature", "zapis",
  "neusaglasenost", "korektivna_mjera", "verifikacija",
  "vozilo", "kontrola_vozila", "isporuka", "isporuka_stavka",
  "zadatak", "obavjestenje", "dogadjaj", "audit_log",
  "pitanje", "sesija_znanja", "ucesnik_znanja", "odgovor_znanja",
  "plan_obuke", "povlacenje", "povlacenje_kontakt",
  "skladiste", "poruka",
] as const;

type BekapMeta = { id: string; tip: string; broj_tabela: number; broj_redova: number; created_at: string };

export async function napraviBekap(tip: "RUCNI" | "AUTOMATSKI", korisnikId: string | null): Promise<BekapMeta> {
  const podaci: Record<string, unknown[]> = {};
  let ukupnoRedova = 0;
  // Sve tabele iz JEDNOG snimka baze (repeatable read) — inače isporuka upisana usred bekapa može
  // ući bez svojih stavki, ili stavke bez isporuke.
  await transakcija(async (klijent) => {
    await klijent.query("set transaction isolation level repeatable read, read only");
    for (const tabela of TABELE) {
      // Tabela iz dopune koja na ovoj bazi još nije pokrenuta ne smije da obori cio bekap.
      if (!(await tabelaPostoji(tabela))) continue;
      const rezultat = await klijent.query(`select * from ${tabela}`);
      podaci[tabela] = rezultat.rows;
      ukupnoRedova += rezultat.rowCount ?? 0;
    }
  });

  const upisano = await pool.query<{ id: string; created_at: string }>(
    `insert into bekap_log (tip, pokrenuo_korisnik_id, broj_tabela, broj_redova, podaci)
     values ($1, $2, $3, $4, $5) returning id, created_at`,
    [tip, korisnikId, TABELE.length, ukupnoRedova, JSON.stringify(podaci)],
  );

  // Isto kao npm run bekap (alati/bekap.ts) — ne čuva se unazad zauvijek.
  await pool.query(`delete from bekap_log where created_at < now() - interval '90 days'`);

  if (tip === "AUTOMATSKI") {
    await obavijestiUlogu(pool, "bzr", {
      naslov: "Sedmični bekap je spreman",
      poruka: "Preuzmite ga sa kontrolne table i sačuvajte van aplikacije — u bazi se čuva samo 90 dana.",
      izvorTip: "bekap_log",
      izvorId: upisano.rows[0].id,
    });
  }

  return { id: upisano.rows[0].id, tip, broj_tabela: TABELE.length, broj_redova: ukupnoRedova, created_at: upisano.rows[0].created_at };
}

export async function poslednjiBekap(): Promise<BekapMeta | null> {
  const r = await pool.query<BekapMeta>(
    `select id, tip, broj_tabela, broj_redova, created_at from bekap_log order by created_at desc limit 1`,
  );
  return r.rows[0] ?? null;
}

export async function istorijaBekapa(limit = 12): Promise<BekapMeta[]> {
  const r = await pool.query<BekapMeta>(
    `select id, tip, broj_tabela, broj_redova, created_at from bekap_log order by created_at desc limit $1`,
    [limit],
  );
  return r.rows;
}

export async function preuzmiBekap(id: string): Promise<Record<string, unknown[]> | null> {
  const r = await pool.query<{ podaci: Record<string, unknown[]> }>(`select podaci from bekap_log where id = $1`, [id]);
  return r.rows[0]?.podaci ?? null;
}

/** Provjerava jednom pri startu i onda jednom dnevno — oslanja se na razliku stvarnog
 * vremena (created_at u bazi), ne na to da je server neprekidno budan. Zato radi i kad
 * Render besplatni plan uspava server: prvi zahtjev poslije buđenja pokrene provjeru. */
export function pokreniSedmicniBekap() {
  const NEDJELJU_DANA_MS = 7 * 24 * 60 * 60 * 1000;

  const provjeri = async () => {
    try {
      const poslednji = await poslednjiBekap();
      const prosloVrijeme = poslednji ? Date.now() - new Date(poslednji.created_at).getTime() : Infinity;
      if (prosloVrijeme > NEDJELJU_DANA_MS) {
        const rezultat = await napraviBekap("AUTOMATSKI", null);
        console.log(`Sedmični bekap kreiran automatski (${rezultat.broj_tabela} tabela, ${rezultat.broj_redova} redova).`);
      }
    } catch (greska) {
      console.error("Automatski bekap nije uspio:", greska);
    }
  };

  provjeri();
  setInterval(provjeri, 24 * 60 * 60 * 1000);
}
