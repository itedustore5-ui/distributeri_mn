import { pool, tabelaPostoji } from "../db.js";
import { ApiGreska } from "../greske.js";

export const IZVORI_IZVOZA = [
  { kod: "sledljivost", naziv: "Sledljivost", izvor: "v_izvoz_sledljivost" },
  { kod: "lica", naziv: "Zaposleni", izvor: "v_lica" },
  { kod: "plan_obuke", naziv: "Plan obuke", izvor: "v_plan_obuke" },
  { kod: "prijemi", naziv: "Prijemi", izvor: "v_izvoz_prijemi" },
  { kod: "lotovi", naziv: "Lotovi", izvor: "lot" },
  { kod: "isporuke", naziv: "Isporuke", izvor: "v_izvoz_isporuke" },
  { kod: "isporuke_stavke", naziv: "Stavke isporuka", izvor: "isporuka_stavka" },
  // Nalaz R-20: bez ovih izvora inspektor nije dobijao D1, provjere mjera, termometre, verifikaciju
  // sistema ni dnevnik kretanja zaliha — sve je bilo u bazi, ali ne i u izvozu.
  { kod: "kontrole_vozila", naziv: "Kontrole vozila (D1)", izvor: "v_izvoz_kontrole_vozila" },
  { kod: "kretanja_zalihe", naziv: "Kretanja zaliha", izvor: "v_izvoz_kretanja_zalihe" },
  { kod: "neusaglasenosti", naziv: "Neusaglašenosti", izvor: "neusaglasenost" },
  { kod: "korektivne_mjere", naziv: "Korektivne mjere", izvor: "korektivna_mjera" },
  { kod: "provjere_nc", naziv: "Provjere neusaglašenosti", izvor: "v_izvoz_provjere_nc" },
  { kod: "mjerenja", naziv: "Temperaturna mjerenja", izvor: "mjerenje_temperature" },
  { kod: "termometri", naziv: "Provjere termometara", izvor: "v_izvoz_termometri" },
  { kod: "verifikacija_sistema", naziv: "Verifikacija sistema", izvor: "v_izvoz_verifikacija_sistema" },
  { kod: "zapisi", naziv: "Dnevni zapisi", izvor: "v_trag_ispravki" },
  { kod: "povlacenja", naziv: "Povlačenja", izvor: "povlacenje" },
  { kod: "povlacenje_kontakti", naziv: "Kontakti povlačenja", izvor: "povlacenje_kontakt" },
  { kod: "audit", naziv: "Audit log", izvor: "audit_log" },
] as const;

function csvVrijednost(v: unknown): string {
  if (v === null || v === undefined) return "";
  const tekst = v instanceof Date ? v.toISOString() : String(v);
  if (/[",\n;]/.test(tekst)) return `"${tekst.replaceAll('"', '""')}"`;
  return tekst;
}

/** `sveKolone`: nazivi kolona iz upita — prazna tabela se izvozi SA zaglavljem, ne kao prazan fajl
 * (inspektor inače ne vidi ni koje se kolone vode). */
export function nizUCsv(redovi: Record<string, unknown>[], sveKolone?: string[]): string {
  const kolone = sveKolone ?? (redovi[0] ? Object.keys(redovi[0]) : []);
  if (kolone.length === 0) return "";
  const zaglavlje = kolone.join(";");
  const tijelo = redovi.map((red) => kolone.map((k) => csvVrijednost(red[k])).join(";")).join("\n");
  return `﻿${zaglavlje}\n${tijelo}`;
}

export async function izvezi(kod: string): Promise<{ naziv: string; csv: string }> {
  const stavka = IZVORI_IZVOZA.find((i) => i.kod === kod);
  if (!stavka) throw new ApiGreska(404, "IZVOZ_NEPOZNAT", "Traženi izvor izvoza ne postoji.");
  const postoji = await tabelaPostoji(stavka.izvor);
  if (!postoji) {
    throw new ApiGreska(409, "IZVOR_NEDOSTAJE", `Izvor "${stavka.naziv}" trenutno nije dostupan u bazi. Pokrenite migracije (npm run migriraj) pa pokušajte ponovo.`, {
      izvor: stavka.izvor,
    });
  }
  const rezultat = await pool.query(`select * from ${stavka.izvor} order by 1`);
  return { naziv: stavka.naziv, csv: nizUCsv(rezultat.rows, rezultat.fields.map((f) => f.name)) };
}

/** Ne smije da padne zbog jednog nedostajućeg izvora — nedostajući se prijavi poimence,
 * ostalo se izveze normalno (invarijanta #30). */
export async function izveziSve(): Promise<{ podaci: Record<string, Record<string, unknown>[]>; nedostaje: { kod: string; naziv: string; razlog: string }[] }> {
  const podaci: Record<string, Record<string, unknown>[]> = {};
  const nedostaje: { kod: string; naziv: string; razlog: string }[] = [];
  for (const stavka of IZVORI_IZVOZA) {
    const postoji = await tabelaPostoji(stavka.izvor);
    if (!postoji) {
      nedostaje.push({ kod: stavka.kod, naziv: stavka.naziv, razlog: `relation "${stavka.izvor}" does not exist` });
      continue;
    }
    const rezultat = await pool.query(`select * from ${stavka.izvor} order by 1`);
    podaci[stavka.kod] = rezultat.rows;
  }
  return { podaci, nedostaje };
}

/** Pregled prije preuzimanja ili štampe: najnovijih `limit` redova, sa ukupnim brojem. Isti izvor
 * i ista provjera kao CSV — ono što se vidi na ekranu je ono što se preuzme. */
export async function pregled(kod: string, limit = 500) {
  const stavka = IZVORI_IZVOZA.find((i) => i.kod === kod);
  if (!stavka) throw new ApiGreska(404, "IZVOZ_NEPOZNAT", "Traženi izvor izvoza ne postoji.");
  if (!(await tabelaPostoji(stavka.izvor))) {
    throw new ApiGreska(409, "IZVOR_NEDOSTAJE", `Izvor "${stavka.naziv}" trenutno nije dostupan u bazi. Pokrenite migracije (npm run migriraj) pa pokušajte ponovo.`);
  }
  const prazno = await pool.query(`select * from ${stavka.izvor} limit 0`);
  const kolone = prazno.fields.map((f) => f.name);
  const poredak = kolone.includes("created_at") ? "created_at desc" : "1";
  const [redovi, ukupno] = await Promise.all([
    pool.query(`select * from ${stavka.izvor} order by ${poredak} limit $1`, [limit]),
    pool.query<{ n: number }>(`select count(*)::int as n from ${stavka.izvor}`),
  ]);
  return { naziv: stavka.naziv, kolone, redovi: redovi.rows, ukupno: ukupno.rows[0].n };
}

/** Spisak izvora sa oznakom koji nedostaje u bazi (invarijanta #30) — da ekran to kaže unaprijed. */
export async function spisakIzvora() {
  return Promise.all(
    IZVORI_IZVOZA.map(async ({ kod, naziv, izvor }) => ((await tabelaPostoji(izvor)) ? { kod, naziv } : { kod, naziv, nedostaje: true, razlog: `relation "${izvor}" does not exist` })),
  );
}
