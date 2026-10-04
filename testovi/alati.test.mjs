// Alati sa računara konsultantkinje (04.10.2026):
//   • prvi-korisnik na NOVOJ, praznoj bazi pravi odgovorno lice i konsultantski nalog (jedna transakcija, audit,
//     privremene lozinke), a bazu koja već ima odgovorno lice ili konsultanta odbija (npr. demo iz .env);
//   • dnevni-pregled javlja veličinu baze i upozorava kad je blizu granice besplatnog Supabase-a.
// Nova baza se pravi samo na LOKALNOM klasteru (npm test / CI) i briše na kraju; na demo bazi se ta provjera preskače.
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { pool } from "./pomoc.mjs";

export const naziv = "Alati: prvi nalozi (odgovorno lice + konsultant) na novoj bazi, zaštita od pogrešne baze, veličina baze u dnevnom pregledu";

const KORIJEN = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const URL_TESTA = process.env.DATABASE_URL ?? "";

/** Pokreni alat kao zaseban proces (isto kao `npm run …`), sa datom bazom. */
function alat(skripta, argumenti, env) {
  return new Promise((ok) => {
    const p = spawn(process.execPath, ["--import", "tsx", skripta, ...argumenti], { cwd: KORIJEN, env: { ...process.env, ...env } });
    let izlaz = "";
    p.stdout.on("data", (d) => (izlaz += d));
    p.stderr.on("data", (d) => (izlaz += d));
    p.on("close", (kod) => ok({ kod, izlaz }));
  });
}

export async function pokreni({ provjeri }) {
  // ── Zaštita: baza koja nije nova (ovdje — test baza sa demo nalozima) ───────────────────────────
  const prije = (await pool.query(`select count(*)::int as n from korisnik`)).rows[0].n;
  const bzr = await alat("alati/prvi-korisnik.ts", ["--firma", "Proba d.o.o.", "--ime", "Proba Probić", "--korisnik", "proba.bzr"], { DATABASE_URL: URL_TESTA });
  const kons = await alat("alati/prvi-korisnik.ts", ["--konsultant", "proba.konsultant"], { DATABASE_URL: URL_TESTA });
  const posle = (await pool.query(`select count(*)::int as n from korisnik`)).rows[0].n;
  provjeri(
    "prvi-korisnik: baza koja već ima odgovorno lice / konsultanta se odbija (npr. demo iz .env) — i kaže u koju bazu je htio",
    bzr.kod === 1 && /već ima odgovorno lice/.test(bzr.izlaz) && /^Baza: /m.test(bzr.izlaz) && kons.kod === 1 && /već ima konsultantski nalog/.test(kons.izlaz) && prije === posle,
    `${bzr.kod} ${bzr.izlaz.trim().slice(0, 160)} | ${kons.kod} ${kons.izlaz.trim().slice(0, 120)} | ${prije}→${posle}`,
  );

  // ── Nova, prazna baza: dopune pa prvi nalozi ─────────────────────────────────────────────────
  if (!URL_TESTA.includes("localhost")) {
    provjeri("prvi-korisnik na novoj bazi · preskočeno (nije lokalni klaster)", true);
  } else {
    const ime = `pilot_prvi_${Date.now().toString(36)}`;
    let napravljena = false;
    try {
      await pool.query(`create database ${ime}`);
      napravljena = true;
    } catch (e) {
      provjeri(`prvi-korisnik na novoj bazi · preskočeno (nova baza se ne može napraviti: ${e.message})`, true);
    }
    if (napravljena) {
      const url = new URL(URL_TESTA);
      url.pathname = `/${ime}`;
      const nova = url.toString();
      const bezTabela = await alat("alati/prvi-korisnik.ts", ["--firma", "Nova d.o.o.", "--ime", "Jelena Nović", "--korisnik", "jelena.n"], { DATABASE_URL: nova });
      provjeri("prvi-korisnik prije prvog deploy-a (baza bez tabela): kaže da se sačeka deploy", bezTabela.kod === 1 && /još nema tabela/.test(bezTabela.izlaz), bezTabela.izlaz.trim().slice(0, 160));

      const m = await alat("db/migriraj.ts", [], { DATABASE_URL: nova });
      const r = await alat("alati/prvi-korisnik.ts", ["--firma", "Nova d.o.o.", "--ime", "Jelena Nović", "--korisnik", "jelena.n", "--konsultant", "konsultant.cg"], { DATABASE_URL: nova });
      const k = new pg.Client({ connectionString: nova });
      await k.connect();
      try {
        const nalozi = (await k.query(
          `select k.korisnicko_ime, k.uloga::text as uloga, k.mora_promijeniti_lozinku, l.ime from korisnik k left join lice l on l.id = k.lice_id order by k.uloga`,
        )).rows;
        const firma = (await k.query(`select naziv, odgovorno_lice_ime from firma`)).rows;
        const audit = (await k.query(`select count(*)::int as n from audit_log where entitet_tip = 'korisnik' and akcija = 'KREIRANJE'`)).rows[0].n;
        const b = nalozi.find((x) => x.uloga === "bzr");
        const i = nalozi.find((x) => x.uloga === "izvodjac");
        provjeri(
          "prvi-korisnik na novoj bazi: odgovorno lice (sa licem) i konsultant (bez lica), obje lozinke privremene, firma, audit",
          m.kod === 0 && r.kod === 0 && nalozi.length === 2 && b?.korisnicko_ime === "jelena.n" && b?.ime === "Jelena Nović" && i?.korisnicko_ime === "konsultant.cg" && !i?.ime &&
            nalozi.every((x) => x.mora_promijeniti_lozinku) && firma.length === 1 && firma[0].naziv === "Nova d.o.o." && audit === 2,
          `${m.kod} ${r.kod} ${JSON.stringify(nalozi)} ${JSON.stringify(firma)} audit ${audit} | ${r.izlaz.trim().slice(0, 200)}`,
        );
        provjeri("…lozinke se ispišu jednom (dvije, po 14 znakova), šifra zaposlenog se ne ispisuje (#17)", (r.izlaz.match(/^\s+(odgovorno lice|konsultant)\s+\S+\s+\S{14}$/gm) ?? []).length === 2 && !/Šifra/.test(r.izlaz), r.izlaz.trim());
        const opet = await alat("alati/prvi-korisnik.ts", ["--konsultant", "drugi.konsultant"], { DATABASE_URL: nova });
        provjeri("…drugi konsultant u istoj bazi se odbija (jedan po bazi)", opet.kod === 1 && /već ima konsultantski nalog/.test(opet.izlaz), opet.izlaz.trim().slice(0, 160));
      } finally {
        await k.end();
        await pool.query(`drop database if exists ${ime} with (force)`).catch(() => undefined);
      }
    }
  }

  // ── Dnevni pregled: veličina baze i upozorenje ────────────────────────────────────────────────
  // KLIJENTI_FAJL na nepostojeći fajl → gleda samo DATABASE_URL (test bazu), ne prave klijente ni demo iz .env.
  const env = { DATABASE_URL: URL_TESTA, KLIJENTI_FAJL: path.join(KORIJEN, ".testbaza", "nema-klijenata.txt") };
  const obicno = await alat("alati/dnevni-pregled.ts", [], env);
  const blizu = await alat("alati/dnevni-pregled.ts", [], { ...env, BAZA_UPOZORENJE_MB: "1" });
  provjeri(
    "dnevni-pregled: javlja veličinu baze (i koliko su otpremnice); preko granice upozorenja — upozorenje i izlazni kod 1",
    /baza \d+ MB \(otpremnice \d+ MB\)/.test(obicno.izlaz) && !/BAZA \d+ MB/.test(obicno.izlaz) && blizu.kod === 1 && /BAZA \d+ MB \(granica upozorenja 1 MB\)/.test(blizu.izlaz),
    `${obicno.izlaz.trim().slice(0, 200)} | ${blizu.kod} ${blizu.izlaz.trim().slice(0, 200)}`,
  );
}
