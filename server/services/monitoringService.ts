// Plan monitoringa (nalaz H5): šta se radi, koliko često i ko — i iz toga "šta danas fali" i
// pregled rupa unazad. To je dokaz koji se prodaje: zapisi nastaju svakog dana, ne noć pred inspekciju.
//
// Sve se broji iz postojećih zapisa (mjerenja, obrasci, kontrole vozila) po PODGORIČKOM danu
// (invarijanta #11); plan ništa ne upisuje sam.
import type { PoolClient } from "pg";
import { upit } from "../db.js";
import { danasCG } from "../vrijeme.js";

export const UCESTALOSTI = ["DNEVNO", "RADNIM_DANIMA", "SEDMICNO", "MJESECNO", "PO_DOGADJAJU"] as const;
export type Ucestalost = (typeof UCESTALOSTI)[number];
export type VrstaPlana = "mjerenje" | "obrazac" | "kontrola_vozila";

export type StavkaPlana = {
  id: string;
  naziv: string;
  vrsta: VrstaPlana;
  kontrolna_tacka_id: string | null;
  kontrolna_tacka_naziv: string | null;
  kontrolna_tacka_sifra: string | null;
  obrazac_kod: string | null;
  vozilo_id: string | null;
  vozilo_oznaka: string | null;
  ucestalost: Ucestalost;
  puta: number;
  uloga: string | null;
  skladiste_id: string | null;
  skladiste_naziv: string | null;
  vazi_od: string;
  aktivan: boolean;
  napomena: string | null;
};

// ─── Datumi (YYYY-MM-DD, bez vremenskih zona — sve je već podgorički dan) ───────────────────────
const uDatum = (s: string) => new Date(`${s}T12:00:00Z`);
const izDatuma = (d: Date) => `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
export const dodajDane = (s: string, n: number) => {
  const d = uDatum(s);
  d.setUTCDate(d.getUTCDate() + n);
  return izDatuma(d);
};
const jeNedjelja = (s: string) => uDatum(s).getUTCDay() === 0;

/** Period kome pripada dan: dan, sedmica (pon–ned) ili mjesec. Nedjelja nije radni dan. */
export function period(ucestalost: Ucestalost, dan: string): { od: string; do: string; obavezno: boolean; rok: string } | null {
  switch (ucestalost) {
    case "DNEVNO":
      return { od: dan, do: dan, obavezno: true, rok: "danas" };
    case "RADNIM_DANIMA":
      return { od: dan, do: dan, obavezno: !jeNedjelja(dan), rok: "danas" };
    case "SEDMICNO": {
      const pomak = (uDatum(dan).getUTCDay() + 6) % 7; // 0 = ponedjeljak
      const od = dodajDane(dan, -pomak);
      return { od, do: dodajDane(od, 6), obavezno: true, rok: "do nedjelje" };
    }
    case "MJESECNO": {
      const d = uDatum(dan);
      const od = izDatuma(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1, 12)));
      const doDan = izDatuma(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0, 12)));
      return { od, do: doDan, obavezno: true, rok: "do kraja mjeseca" };
    }
    default:
      return null; // PO_DOGADJAJU — sprovodi se pri samom unosu (temperatura obavezna)
  }
}

const SELECT_PLANA = `
  select p.id, p.naziv, p.vrsta, p.kontrolna_tacka_id, kt.naziv as kontrolna_tacka_naziv, kt.sifra as kontrolna_tacka_sifra,
         p.obrazac_kod, p.vozilo_id, v.registarski_broj as vozilo_oznaka, p.ucestalost, p.puta, p.uloga::text as uloga,
         p.skladiste_id, s.naziv as skladiste_naziv, to_char(p.vazi_od, 'YYYY-MM-DD') as vazi_od, p.aktivan, p.napomena
  from plan_monitoringa p
  left join kontrolna_tacka kt on kt.id = p.kontrolna_tacka_id
  left join vozilo v on v.id = p.vozilo_id
  left join skladiste s on s.id = p.skladiste_id`;

export async function stavkePlana(samoAktivne = true): Promise<StavkaPlana[]> {
  const r = await upit<StavkaPlana>(
    `${SELECT_PLANA} ${samoAktivne ? "where p.aktivan" : ""}
     order by p.aktivan desc, case p.ucestalost when 'PO_DOGADJAJU' then 0 when 'DNEVNO' then 1 when 'RADNIM_DANIMA' then 2 when 'SEDMICNO' then 3 else 4 end, p.naziv`,
  );
  return r.rows;
}

/** Broj urađenih po danu za jednu stavku plana, u rasponu [od, do]. */
async function poDanima(s: StavkaPlana, od: string, doDan: string): Promise<Map<string, number>> {
  const sql =
    s.vrsta === "mjerenje"
      ? `select to_char((izmjereno_at at time zone 'Europe/Podgorica')::date, 'YYYY-MM-DD') as dan, count(*)::int as n
         from mjerenje_temperature where kontrolna_tacka_id = $1 and (izmjereno_at at time zone 'Europe/Podgorica')::date between $2 and $3 group by 1`
      : s.vrsta === "obrazac"
        ? // Ispravka ne broji dvaput — broji se prvi unos (ispravlja_id je prazan samo kod njega).
          `select to_char(datum, 'YYYY-MM-DD') as dan, count(*)::int as n
           from zapis where obrazac_kod = $1 and ispravlja_id is null and datum between $2 and $3 group by 1`
        : `select to_char((izvrseno_at at time zone 'Europe/Podgorica')::date, 'YYYY-MM-DD') as dan, count(*)::int as n
           from kontrola_vozila where vozilo_id = $1 and (izvrseno_at at time zone 'Europe/Podgorica')::date between $2 and $3 group by 1`;
  const kljuc = s.vrsta === "mjerenje" ? s.kontrolna_tacka_id : s.vrsta === "obrazac" ? s.obrazac_kod : s.vozilo_id;
  const r = await upit<{ dan: string; n: number }>(sql, [kljuc, od, doDan]);
  return new Map(r.rows.map((x) => [x.dan, x.n]));
}

const zbir = (m: Map<string, number>, od: string, doDan: string) => {
  let n = 0;
  for (const [dan, broj] of m) if (dan >= od && dan <= doDan) n += broj;
  return n;
};

export type StanjeStavke = StavkaPlana & { od: string; do: string; rok: string; uradjeno: number; fali: number };

/** Šta u tekućem periodu (danas / ova sedmica / ovaj mjesec) još nije urađeno, i šta je juče
 * propušteno. Terenska uloga dobija samo svoje stavke (i one bez zadate uloge). */
export async function stanjeDanas(filter: { uloga?: string; skladisteId?: string | null } = {}) {
  const danas = danasCG();
  const juce = dodajDane(danas, -1);
  const stavke = (await stavkePlana()).filter(
    (s) =>
      s.ucestalost !== "PO_DOGADJAJU" &&
      s.vazi_od <= danas &&
      (!filter.uloga || !s.uloga || s.uloga === filter.uloga) &&
      (!filter.skladisteId || !s.skladiste_id || s.skladiste_id === filter.skladisteId),
  );
  const danasStanje: StanjeStavke[] = [];
  const juceP: StanjeStavke[] = [];
  for (const s of stavke) {
    const p = period(s.ucestalost, danas)!;
    const pJuce = period(s.ucestalost, juce)!;
    const od = pJuce.od < p.od ? pJuce.od : p.od;
    const brojevi = await poDanima(s, od, danas);
    if (p.obavezno) {
      const uradjeno = zbir(brojevi, p.od, danas);
      danasStanje.push({ ...s, od: p.od, do: p.do, rok: p.rok, uradjeno, fali: Math.max(0, s.puta - uradjeno) });
    }
    // "Juče propušteno" samo za dnevne stavke — sedmica i mjesec se ocjenjuju kad se završe.
    if ((s.ucestalost === "DNEVNO" || s.ucestalost === "RADNIM_DANIMA") && pJuce.obavezno && s.vazi_od <= juce) {
      const uradjeno = zbir(brojevi, juce, juce);
      if (uradjeno < s.puta) juceP.push({ ...s, od: juce, do: juce, rok: "juče", uradjeno, fali: s.puta - uradjeno });
    }
  }
  return { danas, stavke: danasStanje, juce: juceP };
}

/** Pregled rupa unazad: koliko završenih perioda je bilo i u kojima nije urađeno koliko treba. */
export async function pregledRupa(dana: number) {
  const danas = danasCG();
  const juce = dodajDane(danas, -1);
  const pocetak = dodajDane(danas, -dana);
  const rezultat = [];
  for (const s of (await stavkePlana()).filter((x) => x.ucestalost !== "PO_DOGADJAJU")) {
    const od = s.vazi_od > pocetak ? s.vazi_od : pocetak;
    if (od > juce) {
      rezultat.push({ ...s, periodaUkupno: 0, propusteno: [] as { od: string; do: string; uradjeno: number }[] });
      continue;
    }
    const brojevi = await poDanima(s, od, juce);
    // Završeni periodi u rasponu: kraj perioda je prije danas.
    const periodi: { od: string; do: string }[] = [];
    let dan = od;
    while (dan <= juce) {
      const p = period(s.ucestalost, dan)!;
      if (p.obavezno && p.do <= juce) periodi.push({ od: p.od < od ? od : p.od, do: p.do });
      dan = dodajDane(p.do, 1);
    }
    const propusteno = periodi
      .map((p) => ({ ...p, uradjeno: zbir(brojevi, p.od, p.do) }))
      .filter((p) => p.uradjeno < s.puta);
    rezultat.push({ ...s, periodaUkupno: periodi.length, propusteno });
  }
  return { od: pocetak, do: juce, stavke: rezultat };
}

/** Osnovni plan za distributera — konsultant ga zatim prilagodi. Samo kad plan još ne postoji. */
export async function osnovniPlan(klijent: PoolClient, korisnikId: string): Promise<number> {
  const postoji = await klijent.query(`select 1 from plan_monitoringa where aktivan limit 1`);
  if (postoji.rows[0]) return 0;
  const tacke = new Map(
    (await klijent.query<{ sifra: string; id: string }>(`select sifra, id from kontrolna_tacka where aktivan`)).rows.map((r) => [r.sifra, r.id]),
  );
  const vozila = (await klijent.query<{ id: string; registarski_broj: string }>(`select id, registarski_broj from vozilo where aktivan order by registarski_broj`)).rows;
  type Nova = { naziv: string; vrsta: VrstaPlana; kt?: string; obrazac?: string; vozilo?: string; ucestalost: Ucestalost; puta?: number; uloga: string; napomena?: string };
  const nove: Nova[] = [];
  if (tacke.get("KKT1")) nove.push({ naziv: "Temperatura robe pri prijemu (KKT 1)", vrsta: "mjerenje", kt: tacke.get("KKT1"), ucestalost: "PO_DOGADJAJU", uloga: "operater", napomena: "Uz svaki prijem robe pod temperaturnim režimom — bez temperature se prijem ne snima." });
  if (tacke.get("KKT2")) nove.push({ naziv: "Temperatura skladištenja — rashladne komore (KKT 2)", vrsta: "mjerenje", kt: tacke.get("KKT2"), ucestalost: "RADNIM_DANIMA", puta: 2, uloga: "operater", napomena: "Jutro i popodne, svaka komora." });
  if (tacke.get("KKT3")) nove.push({ naziv: "Temperatura robe pri predaji kupcu (KKT 3)", vrsta: "mjerenje", kt: tacke.get("KKT3"), ucestalost: "PO_DOGADJAJU", uloga: "vozac", napomena: "Uz svaku isporuku robe pod režimom — bez temperature se isporuka ne potvrđuje." });
  nove.push(
    { naziv: "Čišćenje i dezinfekcija (P3)", vrsta: "obrazac", obrazac: "P3", ucestalost: "RADNIM_DANIMA", uloga: "operater" },
    { naziv: "Lična higijena i zdravstveno stanje (P8)", vrsta: "obrazac", obrazac: "P8", ucestalost: "RADNIM_DANIMA", uloga: "operater" },
    { naziv: "Kontrola otpada (P9)", vrsta: "obrazac", obrazac: "P9", ucestalost: "RADNIM_DANIMA", uloga: "operater" },
    { naziv: "Kontrola štetočina (P7)", vrsta: "obrazac", obrazac: "P7", ucestalost: "SEDMICNO", uloga: "operater" },
    { naziv: "Kontrola pribora i opreme (P10)", vrsta: "obrazac", obrazac: "P10", ucestalost: "SEDMICNO", uloga: "operater" },
  );
  for (const v of vozila) nove.push({ naziv: `Kontrola vozila ${v.registarski_broj} prije utovara (D1)`, vrsta: "kontrola_vozila", vozilo: v.id, ucestalost: "RADNIM_DANIMA", uloga: "vozac" });
  for (const n of nove) {
    await klijent.query(
      `insert into plan_monitoringa (naziv, vrsta, kontrolna_tacka_id, obrazac_kod, vozilo_id, ucestalost, puta, uloga, napomena, created_by)
       values ($1, $2, $3, $4, $5, $6, $7, $8::uloga_t, $9, $10)`,
      [n.naziv, n.vrsta, n.kt ?? null, n.obrazac ?? null, n.vozilo ?? null, n.ucestalost, n.puta ?? 1, n.uloga, n.napomena ?? null, korisnikId],
    );
  }
  return nove.length;
}
