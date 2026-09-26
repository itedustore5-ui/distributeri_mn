// Mali talas 4 posle revizije 25.09.2026:
//   R-19 bekap iz aplikacije bez tajni (heševi lozinki, sesije, ključevi) i sa svim tabelama;
//   R-25 /api/zdravlje provjerava i bazu;
//   R-26 neispravan zahtjev → 400/409 sa porukom, ne 500;
//   R-27 bezbjednosna zaglavlja (CSP i HSTS samo u produkciji — ovdje se provjerava ostatak).
import { pool, prijava, anonimno, NALOZI, APP_URL, danasCG } from "./pomoc.mjs";

export const naziv = "Mali talas 4: bekap bez tajni, zdravlje, greške 4xx, zaglavlja";

export async function pokreni({ provjeri }) {
  const ana = await prijava(NALOZI.ana);
  const anon = anonimno();
  const trag = { bekap: null };

  try {
    // ── R-25 ──
    const z = await anon("/zdravlje");
    provjeri("R-25: zdravlje javlja i stanje baze", z.status === 200 && z.tijelo.ok === true && z.tijelo.baza === "ok", JSON.stringify(z.tijelo));

    // ── R-27 ──
    const odg = await fetch(`${APP_URL}/api/zdravlje`);
    provjeri("R-27: nosniff, zabrana okvira i Permissions-Policy", odg.headers.get("x-content-type-options") === "nosniff" && odg.headers.get("x-frame-options") === "DENY" && (odg.headers.get("permissions-policy") ?? "").includes("microphone=()"));

    // ── R-26 ──
    const losJson = await fetch(`${APP_URL}/api/poruke`, {
      method: "POST",
      headers: { "x-zahtjev-app": "1", "Content-Type": "application/json", cookie: ana.kolacic },
      body: "{ovo nije json",
    });
    provjeri("R-26: neispravan JSON → 400, ne 500", losJson.status === 400);
    const losId = await ana("/lotovi/nije-identifikator");
    provjeri("R-26: loš identifikator u adresi → 400, ne 500", losId.status === 400 && losId.tijelo.error.code === "NEISPRAVAN_PODATAK", `${losId.status}`);
    const zod = await ana("/provjera-znanja/zavrsi", { telo: { ucesnikId: "x" } });
    provjeri("R-26: greška šeme van tijelo() → 400, ne 500", zod.status === 400 && zod.tijelo.error.code === "NEVALIDAN_UNOS", `${zod.status}`);
    const veza = await ana("/plan-obuke", { telo: { liceId: "00000000-0000-4000-8000-000000000000", tema: "E2E", planiraniDatum: danasCG() } });
    provjeri("R-26: veza na nepostojeći zapis → 409 sa porukom, ne 500", veza.status === 409 && veza.tijelo.error.code === "VEZA_NE_POSTOJI", `${veza.status} ${veza.tijelo?.error?.code}`);
    const bezLozinke = await ana("/provjera-znanja/uci", { telo: {} });
    provjeri("R-26: poruka iz šeme ide na ekran („Upišite svoju lozinku.\")", bezLozinke.status === 400 && bezLozinke.tijelo.error.message === "Upišite svoju lozinku.", bezLozinke.tijelo?.error?.message);

    // ── R-19 ──
    const b = await ana("/bekap", { method: "POST" });
    trag.bekap = b.tijelo?.id;
    const podaci = (await ana(`/bekap/${b.tijelo.id}/preuzmi`)).tijelo;
    provjeri("R-19: bekap nosi naloge, ali bez heša lozinke", Array.isArray(podaci?.korisnik) && podaci.korisnik.length >= 5 && podaci.korisnik.every((k) => !("lozinka_hash" in k)));
    provjeri("R-19: …bez sesija, VAPID ključa, push uređaja i ključeva zahtjeva", ["sesija_prijave", "web_push_kljuc", "push_pretplata", "kljuc_zahtjeva", "bekap_log"].every((t) => !(t in podaci)));
    provjeri("R-19: …a sa tabelama HACCP sistema (plan, termometri, verifikacija)", ["plan_monitoringa", "mjerni_uredjaj", "provjera_uredjaja", "verifikacija_sistema", "artikal_dobavljaca"].every((t) => t in podaci));
    provjeri("R-19: otpremnice bez samog fajla (on je u pg_dump bekapu)", Array.isArray(podaci.prijem_dokument) && podaci.prijem_dokument.every((p) => !("sadrzaj" in p)));
    const stari = (await pool.query(`select count(*)::int as n from bekap_log where podaci -> 'korisnik' -> 0 ? 'lozinka_hash'`)).rows[0].n;
    provjeri("R-19: ni stari bekapi u bazi više nemaju heševe (dopuna 30)", stari === 0, `${stari}`);
  } finally {
    if (trag.bekap) {
      await pool.query(`delete from audit_log where entitet_id = $1`, [trag.bekap]);
      await pool.query(`delete from obavjestenje where izvor_id = $1`, [trag.bekap]);
      await pool.query(`delete from bekap_log where id = $1`, [trag.bekap]);
    }
  }
}
