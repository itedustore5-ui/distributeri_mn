// Pravi prvi nalog (bzr — odgovorno lice za bezbjednost hrane) poslije instalacije kod klijenta.
// Pokreće se sa računara konsultantkinje: node alati/prvi-korisnik.ts
//   --firma "Naziv d.o.o." --ime "Ime Prezime" --korisnik korisnicko.ime
import "dotenv/config";
import crypto from "node:crypto";
import { Pool } from "pg";
import { hashLozinke, MINIMALNA_DUZINA_LOZINKE } from "../server/lozinke.js";

function argument(naziv: string): string | undefined {
  const indeks = process.argv.indexOf(`--${naziv}`);
  return indeks === -1 ? undefined : process.argv[indeks + 1];
}

async function main() {
  const firmaNaziv = argument("firma");
  const ime = argument("ime");
  const korisnickoIme = argument("korisnik");
  if (!firmaNaziv || !ime || !korisnickoIme) {
    console.error('Upotreba: node alati/prvi-korisnik.ts --firma "Naziv d.o.o." --ime "Ime Prezime" --korisnik korisnicko.ime');
    process.exit(1);
  }

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL nije podešen u .env — pokrenite prvo migracije.");
  const pool = new Pool({ connectionString, ssl: connectionString.includes("localhost") ? undefined : { rejectUnauthorized: false } });

  const postojiFirma = await pool.query(`select id from firma limit 1`);
  if (postojiFirma.rows.length === 0) {
    await pool.query(`insert into firma (naziv, odgovorno_lice_ime) values ($1, $2)`, [firmaNaziv, ime]);
  }

  const postojiKorisnik = await pool.query(`select id from korisnik where korisnicko_ime = $1`, [korisnickoIme]);
  if (postojiKorisnik.rows.length > 0) {
    console.error(`Korisničko ime "${korisnickoIme}" već postoji.`);
    process.exit(1);
  }

  const brojLica = await pool.query<{ broj: number }>(`select count(*)::int as broj from lice`);
  const sifra = `M-${String((brojLica.rows[0]?.broj ?? 0) + 1).padStart(2, "0")}`;
  const lice = await pool.query<{ id: string }>(
    `insert into lice (ime, radno_mjesto, rukuje_hranom, sifra) values ($1, 'Odgovorno lice za bezbjednost hrane', true, $2) returning id`,
    [ime, sifra],
  );

  const privremenaLozinka = crypto.randomBytes(9).toString("base64url").slice(0, MINIMALNA_DUZINA_LOZINKE + 4);
  await pool.query(
    `insert into korisnik (korisnicko_ime, lozinka_hash, uloga, lice_id) values ($1, $2, 'bzr', $3)`,
    [korisnickoIme, hashLozinke(privremenaLozinka), lice.rows[0].id],
  );

  console.log("\nNalog kreiran.");
  console.log(`  Korisničko ime: ${korisnickoIme}`);
  console.log(`  Privremena lozinka: ${privremenaLozinka}`);
  console.log(`  Šifra za potpisivanje: ${sifra}`);
  console.log("\nOva lozinka se više neće prikazati — proslijedite je odgovornom licu odmah.\n");

  await pool.end();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
