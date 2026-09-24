// Otpremnica → prijem, bez spoljnih servisa: PDF se čita direktno, fotografija lokalnim OCR-om.
// Probni dokumenti su izmišljeni (testovi/otpremnice/): 10 otpremnica "ADRIATIC DISTRIBUCIJA" sa
// scenarijima — redovna, temperatura, manjak, oštećenje, istekao rok, lot, smrznuto.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { pool, prijava, NALOZI, danasCG, posaljiFajl, preuzmi } from "./pomoc.mjs";

export const naziv = "Otpremnica: PDF i fotografija → prijem, pamćenje artikala, manjak, istekao rok";

const folder = path.join(path.dirname(fileURLToPath(import.meta.url)), "otpremnice");
const PDF = fs.readFileSync(path.join(folder, "testne_otpremnice.pdf"));
// Ista "fotografija" dva puta: onako kako je snimljena, i smanjena + ponovo kompresovana kao što je
// pregledač šalje — OCR je osjetljiv na razmjeru, pa se provjeravaju obje.
const SLIKE = [
  ["fotografija", fs.readFileSync(path.join(folder, "telefon_str3.jpg"))],
  ["fotografija iz pregledača (smanjena)", fs.readFileSync(path.join(folder, "telefon_str3_smanjena.jpg"))],
];

// Šta tačno piše na probnim otpremnicama (broj → [lot, količina, rok]).
const OCEKIVANO = {
  "2026-000151": [["ML26092301", 60, "2026-10-05"], ["JG26092215", 40, "2026-10-02"], ["SR26092008", 20, "2026-10-15"]],
  "2026-000152": [["PF26092302", 35, "2026-09-28"], ["MS26092111", 30, "2026-10-20"], ["PV26092204", 25, "2026-10-03"]],
  "2026-000153": [["PF26092303", 25, "2026-09-28"], ["KB26092104", 20, "2026-09-30"], ["JG26092215", 30, "2026-10-02"]],
  "2026-000154": [["JG26092216", 50, "2026-10-02"], ["ML26092304", 40, "2026-10-05"]],
  "2026-000155": [["SR26092011", 20, "2026-10-15"], ["MS26092112", 20, "2026-10-20"]],
  "2026-000156": [["JG26090102", 30, "2026-09-15"], ["ML26092201", 30, "2026-10-05"]],
  "2026-000157": [["SV26092001", 40, "2027-09-20"], ["PF26091908", 20, "2027-09-19"]],
  "2026-000158": [["JG26099999", 40, "2026-10-02"], ["SR26092012", 15, "2026-10-15"]],
  "2026-000159": [["ML26092305", 50, "2026-10-05"], ["SR26092013", 10, "2026-10-15"]],
  "2026-000160": [["ML26092306", 80, "2026-10-05"], ["JG26092218", 60, "2026-10-02"], ["PV26092205", 30, "2026-10-03"]],
};

const pomjeri = (dana) => {
  const d = new Date(`${danasCG()}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dana);
  return d.toISOString().slice(0, 10);
};

export async function pokreni({ provjeri }) {
  const ana = await prijava(NALOZI.ana);
  const marko = await prijava(NALOZI.marko);
  const petar = await prijava(NALOZI.petar);
  const trag = { dokumenti: [], prijemi: [], dobavljacId: null };
  const zapamti = (r) => r.tijelo?.dokumentId && trag.dokumenti.push(r.tijelo.dokumentId);

  try {
    // ── Pristup i vrsta fajla ───────────────────────────────────────────────────────────────
    provjeri("Vozač ne šalje otpremnice za prijem (403)", (await posaljiFajl(petar, "/prijem/otpremnica", PDF, "application/pdf")).status === 403);
    const tekst = await posaljiFajl(marko, "/prijem/otpremnica", Buffer.from("ovo nije otpremnica"), "text/plain");
    provjeri("Fajl koji nije PDF ni slika — odbijen (415)", tekst.status === 415, tekst.tijelo?.error?.message);

    // ── PDF: svih 10 otpremnica, tačno ──────────────────────────────────────────────────────
    const prvi = await posaljiFajl(marko, "/prijem/otpremnica", PDF, "application/pdf", "testne_otpremnice.pdf");
    zapamti(prvi);
    provjeri("PDF sa 10 otpremnica — pročitano 10", prvi.status === 201 && prvi.tijelo.otpremnice.length === 10, `${prvi.status} ${prvi.tijelo?.otpremnice?.length ?? prvi.tijelo?.error?.message}`);
    const pogresno = [];
    for (const o of prvi.tijelo.otpremnice) {
      const ocek = OCEKIVANO[o.broj];
      const procitano = o.stavke.map((s) => [s.lot, s.kolicina, s.rok]);
      if (!ocek || JSON.stringify(ocek) !== JSON.stringify(procitano)) pogresno.push(`${o.broj}: ${JSON.stringify(procitano)}`);
    }
    provjeri("PDF: svaki broj, lot, količina i rok tačni do slova", pogresno.length === 0, pogresno.join(" | "));
    provjeri("PDF: ništa nije označeno kao nesigurno", prvi.tijelo.otpremnice.every((o) => o.stavke.every((s) => s.nesigurno.length === 0)));
    const o153 = prvi.tijelo.otpremnice.find((o) => o.broj === "2026-000153");
    provjeri("Temperatura sa otpremnice se prikazuje kao podatak dobavljača (+8,7), ne upisuje se", o153.temperaturaNaOtpremnici === 8.7);
    provjeri("Nepoznat dobavljač — nije pogođen, nego se traži izbor", prvi.tijelo.otpremnice[0].dobavljac.id === null && prvi.tijelo.otpremnice[0].upozorenja.some((u) => u.includes("nije u šifarniku")));
    const o156 = prvi.tijelo.otpremnice.find((o) => o.broj === "2026-000156");
    provjeri("Istekao rok (15.09.2026) prepoznat već na otpremnici", o156.stavke[0].rokIstekao === true && o156.upozorenja.some((u) => u.includes("isteklim rokom")));

    // ── Dobavljač po PIB-u ──────────────────────────────────────────────────────────────────
    const dob = await ana("/dobavljaci", { telo: { naziv: "ADRIATIC DISTRIBUCIJA d.o.o. Podgorica", pib: "03098765" } });
    trag.dobavljacId = dob.tijelo?.id;
    const drugi = await posaljiFajl(marko, "/prijem/otpremnica", PDF, "application/pdf");
    zapamti(drugi);
    const o154 = drugi.tijelo.otpremnice.find((o) => o.broj === "2026-000154");
    provjeri("Dobavljač prepoznat po PIB-u, sigurno", o154.dobavljac.id === trag.dobavljacId && o154.dobavljac.sigurno === true);
    provjeri("Prvi put artikal nije siguran — magacioner bira", o154.stavke.every((s) => s.artikalSigurno === false));

    // ── Prijem iz otpremnice: manjak (50 na papiru, izbrojano 47) ───────────────────────────
    const artikli = (await marko("/artikli")).tijelo;
    const jogurt = artikli.find((a) => a.naziv.startsWith("Jogurt"));
    const mlijeko = artikli.find((a) => a.naziv.startsWith("Mlijeko"));
    const rok = pomjeri(10);
    const prijem = await marko("/prijem", {
      telo: {
        dobavljacId: trag.dobavljacId,
        brojDokumenta: o154.broj,
        datumPrijema: danasCG(),
        dokumentId: drugi.tijelo.dokumentId,
        stavke: [
          { artikalId: jogurt.id, brojLota: "JG26092216", rokTrajanja: rok, primljenaKolicina: 47, temperaturaPrijema: 3.2, poOtpremnici: { sifra: "J-010", naziv: "Jogurt 1 kg", kolicina: 50, lot: "JG26092216", rok: "2026-10-02" } },
          { artikalId: mlijeko.id, brojLota: "ML26092399", rokTrajanja: rok, primljenaKolicina: 40, temperaturaPrijema: 3.4, poOtpremnici: { sifra: "M-001", naziv: "Mlijeko 2,8% 1 L", kolicina: 40, lot: "ML26092304", rok: "2026-10-05" } },
        ],
      },
    });
    trag.prijemi.push(prijem.tijelo?.id);
    provjeri("Prijem iz otpremnice snimljen", prijem.status === 201, `${prijem.status} ${prijem.tijelo?.error?.message ?? ""}`);
    const detalj = (await marko(`/prijem/${prijem.tijelo.id}`)).tijelo;
    const sJog = detalj.stavke.find((s) => s.broj_lota === "JG26092216");
    provjeri("Uz stavku stoji šta piše na otpremnici: 50, primljeno 47", Number(sJog.po_otpremnici.kolicina) === 50 && Number(sJog.primljena_kolicina) === 47);
    provjeri("Otpremnica je vezana za prijem", detalj.dokumenti.length === 1 && detalj.dokumenti[0].vrsta === "pdf");
    const red = (await marko("/prijem")).tijelo.find((p) => p.id === prijem.tijelo.id);
    provjeri("Na listi: ima otpremnicu i odstupa od nje (manjak, drugi lot)", red.ima_otpremnicu === true && red.odstupa_od_otpremnice === true);
    const fajl = await preuzmi(marko, `/prijem/${prijem.tijelo.id}/dokument/${detalj.dokumenti[0].id}`);
    provjeri("Otpremnica se otvara iz prijema (isti PDF)", fajl.status === 200 && fajl.tip === "application/pdf" && fajl.sadrzaj.equals(PDF));
    const opet = await marko("/prijem", {
      telo: { dobavljacId: trag.dobavljacId, datumPrijema: danasCG(), dokumentId: drugi.tijelo.dokumentId, stavke: [{ artikalId: jogurt.id, brojLota: "E2E-X", primljenaKolicina: 1, temperaturaPrijema: 3 }] },
    });
    if (opet.tijelo?.id) trag.prijemi.push(opet.tijelo.id);
    provjeri("Ista otpremnica se ne veže za drugi prijem (409)", opet.status === 409 && opet.tijelo.error.code === "OTPREMNICA_VEC_VEZANA");

    // ── Zapamćen artikal ────────────────────────────────────────────────────────────────────
    const treci = await posaljiFajl(marko, "/prijem/otpremnica", PDF, "application/pdf");
    zapamti(treci);
    const o160 = treci.tijelo.otpremnice.find((o) => o.broj === "2026-000160");
    const j010 = o160.stavke.find((s) => s.sifra === "J-010");
    const m001 = o160.stavke.find((s) => s.sifra === "M-001");
    provjeri("Sljedeća otpremnica: J-010 je sigurno naš Jogurt (zapamćeno)", j010.artikalId === jogurt.id && j010.artikalSigurno === true);
    provjeri("…i M-001 naše Mlijeko", m001.artikalId === mlijeko.id && m001.artikalSigurno === true);

    // ── Istekao rok: upisuje se, ali se ne prihvata ─────────────────────────────────────────
    const star = await marko("/prijem", {
      telo: { dobavljacId: trag.dobavljacId, brojDokumenta: "E2E-ROK", datumPrijema: danasCG(), stavke: [{ artikalId: jogurt.id, brojLota: "JG26090102", rokTrajanja: pomjeri(-3), primljenaKolicina: 30, temperaturaPrijema: 3 }] },
    });
    trag.prijemi.push(star.tijelo?.id);
    provjeri("Roba sa isteklim rokom se upisuje (to je stiglo)", star.status === 201);
    provjeri("…odgovorno lice odmah dobija obavještenje", (await ana("/obavjestenja")).tijelo.some((o) => o.izvor_id === star.tijelo.id && o.naslov.includes("isteklim rokom")));
    const lotStar = (await ana(`/prijem/${star.tijelo.id}`)).tijelo.stavke[0];
    const prihvati = await ana(`/prijem/${star.tijelo.id}/lot/${lotStar.lot_id}/odluka`, { method: "PATCH", telo: { odluka: "PRIHVATI", kolicina: 30 } });
    provjeri("…i ne može se prihvatiti (409)", prihvati.status === 409 && prihvati.tijelo.error.code === "ROK_ISTEKAO", prihvati.tijelo?.error?.message);
    const odbij = await ana(`/prijem/${star.tijelo.id}/lot/${lotStar.lot_id}/odluka`, { method: "PATCH", telo: { odluka: "ODBIJI", kolicina: 30, napomena: "E2E rok istekao, povrat dobavljaču" } });
    provjeri("…odbija se, uz razlog", odbij.status === 200);

    // ── Fotografija (lokalni OCR) ───────────────────────────────────────────────────────────
    for (const [opis, slikaFajl] of SLIKE) {
      const slika = await posaljiFajl(marko, "/prijem/otpremnica", slikaFajl, "image/jpeg", "otpremnica.jpg");
      zapamti(slika);
      const os = slika.tijelo?.otpremnice?.[0];
      provjeri(`${opis} (nakrivljena, sa sjenkom) — pročitana`, slika.status === 201 && slika.tijelo.vrsta === "slika" && os?.broj === "2026-000153", `${slika.status} ${os?.broj ?? slika.tijelo?.error?.message}`);
      const procitano = os?.stavke.map((s) => [s.lot, s.kolicina, s.rok]);
      provjeri(`${opis}: lotovi, količine i rokovi tačni`, JSON.stringify(procitano) === JSON.stringify(OCEKIVANO["2026-000153"]), JSON.stringify(procitano));
      provjeri(`${opis}: ispravljen lot (JG…) je označen za provjeru`, !!os?.stavke[2]?.nesigurno.includes("lot"));
      provjeri(`${opis}: dobavljač prepoznat`, os?.dobavljac.id === trag.dobavljacId, os?.dobavljac?.naziv);
    }
  } finally {
    const k = await pool.connect();
    try {
      await k.query("begin");
      const prijemi = trag.prijemi.filter(Boolean);
      const lotovi = prijemi.length ? (await k.query(`select id from lot where prijem_id = any($1)`, [prijemi])).rows.map((r) => r.id) : [];
      const mjerenja = lotovi.length ? (await k.query(`select id from mjerenje_temperature where lot_id = any($1)`, [lotovi])).rows.map((r) => r.id) : [];
      const sve = [...prijemi, ...lotovi, ...trag.dokumenti, ...mjerenja];
      await k.query(`delete from obavjestenje where izvor_id = any($1)`, [sve]);
      await k.query(`delete from audit_log where entitet_id = any($1)`, [[...sve, trag.dobavljacId].filter(Boolean)]);
      await k.query(`delete from dogadjaj where entitet_id = any($1)`, [sve]);
      await k.query(`delete from kretanje_zalihe where lot_id = any($1)`, [lotovi]);
      await k.query(`delete from zaliha where lot_id = any($1)`, [lotovi]);
      await k.query(`delete from mjerenje_temperature where lot_id = any($1)`, [lotovi]);
      await k.query(`delete from prijem_dokument where id = any($1) or prijem_id = any($2)`, [trag.dokumenti, prijemi]);
      await k.query(`delete from prijem_stavka where prijem_id = any($1)`, [prijemi]);
      await k.query(`delete from lot where id = any($1)`, [lotovi]);
      await k.query(`delete from prijem where id = any($1)`, [prijemi]);
      if (trag.dobavljacId) {
        await k.query(`delete from artikal_dobavljaca where dobavljac_id = $1`, [trag.dobavljacId]);
        await k.query(`delete from dobavljac where id = $1`, [trag.dobavljacId]);
      }
      await k.query("commit");
    } catch (e) {
      await k.query("rollback");
      throw new Error(`Čišćenje nije uspjelo: ${e.message} ${JSON.stringify(trag)}`);
    } finally {
      k.release();
    }
  }
}
