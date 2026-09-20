import "dotenv/config";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Pool } from "pg";

const dbDir = path.dirname(fileURLToPath(import.meta.url));
const zeliDemo = process.argv.includes("--demo");

// Lozinke demo naloga su hardkodovane u db/13_demo_cg.sql kao unaprijed izračunati scrypt
// heševi — ovdje se samo ispisuju, radi podsjetnika poslije seed-a.
const DEMO_NALOZI = [
  { korisnickoIme: "konsultant", lozinka: "Konsultant-2026!", uloga: "izvodjac" },
  { korisnickoIme: "ana.b", lozinka: "Podgorica-2026!", uloga: "bzr" },
  { korisnickoIme: "marko.v", lozinka: "Magacin-2026!", uloga: "operater" },
  { korisnickoIme: "petar.j", lozinka: "Vozac-2026!", uloga: "vozac" },
  { korisnickoIme: "direktor", lozinka: "Uprava-2026!", uloga: "uprava" },
];

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL nije podešen u .env.");
  const pool = new Pool({ connectionString, ssl: connectionString.includes("localhost") ? undefined : { rejectUnauthorized: false } });

  await pool.query(`create table if not exists schema_migracije (fajl varchar(100) primary key, primijenjeno_at timestamptz not null default now())`);

  const svi = (await fs.readdir(dbDir)).filter((f) => /^\d{2}_.*\.sql$/.test(f)).sort();
  const zaPrimjenu = svi.filter((f) => f !== "13_demo_cg.sql" || zeliDemo);

  for (const fajl of zaPrimjenu) {
    const vec = await pool.query(`select 1 from schema_migracije where fajl = $1`, [fajl]);
    if (vec.rows.length > 0) {
      console.log(`✓ ${fajl} (već primijenjeno)`);
      continue;
    }
    const sadrzaj = await fs.readFile(path.join(dbDir, fajl), "utf8");
    console.log(`→ primjenjujem ${fajl}...`);
    await pool.query(sadrzaj);
    await pool.query(`insert into schema_migracije (fajl) values ($1)`, [fajl]);
    console.log(`✓ ${fajl}`);
  }

  if (zeliDemo) {
    console.log("\nDemo nalozi (SAMO za demo bazu — nikad na pravoj bazi klijenta):");
    for (const nalog of DEMO_NALOZI) {
      console.log(`  ${nalog.korisnickoIme.padEnd(12)} / ${nalog.lozinka.padEnd(20)} (${nalog.uloga})`);
    }
    console.log("");
  }

  await pool.end();
  console.log("Gotovo.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
