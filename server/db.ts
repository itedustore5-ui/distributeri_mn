import { Pool, types, type PoolClient } from "pg";

// pg inače parsira `date` kolone u JS Date na lokalnu ponoć pa ih JSON.stringify prebacuje u
// UTC — blizu granice dana to pomjeri prikazani datum za jedan dan (isto GRESKA kao
// toISOString() za datum, invarijanta #11). Kolona ostaje sirov "YYYY-MM-DD" string.
types.setTypeParser(types.builtins.DATE, (vrijednost) => vrijednost);

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL mora biti podešen (Supabase Session pooler, port 5432).");
}

export const pool = new Pool({
  connectionString,
  ssl: connectionString.includes("localhost") ? undefined : { rejectUnauthorized: false },
});

export const upit = <T extends Record<string, unknown> = Record<string, unknown>>(
  text: string,
  params: unknown[] = [],
) => pool.query<T>(text, params);

export async function transakcija<T>(rad: (klijent: PoolClient) => Promise<T>): Promise<T> {
  const klijent = await pool.connect();
  try {
    await klijent.query("BEGIN");
    const rezultat = await rad(klijent);
    await klijent.query("COMMIT");
    return rezultat;
  } catch (greska) {
    await klijent.query("ROLLBACK");
    throw greska;
  } finally {
    klijent.release();
  }
}

export async function tabelaPostoji(naziv: string): Promise<boolean> {
  const rezultat = await upit<{ regclass: string | null }>("select to_regclass($1) as regclass", [naziv]);
  return rezultat.rows[0]?.regclass !== null;
}
