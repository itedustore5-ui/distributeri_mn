import { pool, tabelaPostoji } from "../db.js";
import { ApiGreska } from "../greske.js";

export const IZVORI_IZVOZA = [
  { kod: "sledljivost", naziv: "Sledljivost", izvor: "v_izvoz_sledljivost" },
  { kod: "lica", naziv: "Zaposleni", izvor: "v_lica" },
  { kod: "plan_obuke", naziv: "Plan obuke", izvor: "v_plan_obuke" },
  { kod: "prijemi", naziv: "Prijemi", izvor: "prijem" },
  { kod: "lotovi", naziv: "Lotovi", izvor: "lot" },
  { kod: "isporuke", naziv: "Isporuke", izvor: "isporuka" },
  { kod: "neusaglasenosti", naziv: "Neusaglašenosti", izvor: "neusaglasenost" },
  { kod: "korektivne_mjere", naziv: "Korektivne mjere", izvor: "korektivna_mjera" },
  { kod: "mjerenja", naziv: "Temperaturna mjerenja", izvor: "mjerenje_temperature" },
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

export function nizUCsv(redovi: Record<string, unknown>[]): string {
  if (redovi.length === 0) return "";
  const kolone = Object.keys(redovi[0]);
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
  return { naziv: stavka.naziv, csv: nizUCsv(rezultat.rows) };
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
