// Dnevni pregled stanja SVIH klijenata — pokreće se ručno (ili iz Task Scheduler-a) sa
// računara konsultantkinje. Čita alati/klijenti.txt ("Naziv = postgresql://..." po redu);
// bez tog fajla gleda samo DATABASE_URL iz .env. Izlazni kod 1 ako je neko u zastoju.
import "dotenv/config";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Pool } from "pg";

const dir = path.dirname(fileURLToPath(import.meta.url));

async function ucitajKlijente(): Promise<{ naziv: string; url: string }[]> {
  try {
    const sadrzaj = await fs.readFile(path.join(dir, "klijenti.txt"), "utf8");
    return sadrzaj
      .split("\n")
      .map((red) => red.trim())
      .filter((red) => red && !red.startsWith("#"))
      .map((red) => {
        const [naziv, url] = red.split("=").map((deo) => deo.trim());
        return { naziv, url };
      });
  } catch {
    if (!process.env.DATABASE_URL) throw new Error("Nema alati/klijenti.txt ni DATABASE_URL u .env.");
    return [{ naziv: "ova instanca", url: process.env.DATABASE_URL }];
  }
}

async function provjeriKlijenta(naziv: string, url: string): Promise<boolean> {
  const pool = new Pool({ connectionString: url, ssl: url.includes("localhost") ? undefined : { rejectUnauthorized: false } });
  try {
    const zadnjiZapis = await pool.query<{ max: string | null }>(`select max(created_at) from zapis`);
    const zadnjaIsporuka = await pool.query<{ max: string | null }>(`select max(created_at) from isporuka`);
    const otvoreneNc = await pool.query<{ broj: string }>(`select count(*) from neusaglasenost where status not in ('ZATVORENA')`);

    const poslednja = [zadnjiZapis.rows[0].max, zadnjaIsporuka.rows[0].max].filter(Boolean).sort().pop();
    const danaOdZadnjeg = poslednja ? Math.floor((Date.now() - new Date(poslednja).getTime()) / 86400000) : null;
    const uZastoju = danaOdZadnjeg === null || danaOdZadnjeg > 2;

    console.log(`${uZastoju ? "⚠" : "✓"} ${naziv}: poslednji unos ${danaOdZadnjeg === null ? "nikad" : `prije ${danaOdZadnjeg} dana`}, otvorenih NC: ${otvoreneNc.rows[0].broj}`);
    return !uZastoju;
  } catch (greska) {
    console.log(`✗ ${naziv}: greška pri povezivanju — ${(greska as Error).message}`);
    return false;
  } finally {
    await pool.end();
  }
}

async function main() {
  const klijenti = await ucitajKlijente();
  let sveDobro = true;
  for (const klijent of klijenti) {
    const dobro = await provjeriKlijenta(klijent.naziv, klijent.url);
    sveDobro = sveDobro && dobro;
  }
  process.exit(sveDobro ? 0 : 1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
