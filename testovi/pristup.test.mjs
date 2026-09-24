// Matrica pristupa: svaka uloga protiv adresa koje MORA vidjeti i onih koje NE SMIJE.
// Ovaj test je nastao poslije greške u kojoj je .use(requireUloga) jednog rutera na
// zajedničkom "/api" zaključavao sve rute registrovane poslije njega: uprava je dobijala 403 na
// svom Kontrolnom centru, a ulazak u provjeru znanja šifrom je vraćao 401.
import { prijava, anonimno, NALOZI } from "./pomoc.mjs";

export const naziv = "Ko šta smije da vidi";

const MORA = {
  ana: ["/tabla", "/prijem", "/lotovi", "/zaliha", "/zapisi", "/mjerenja", "/isporuke", "/vozila", "/kontrole-vozila", "/neusaglasenosti",
    "/lica", "/nalozi", "/plan-obuke", "/evidencija-osposobljavanja", "/provjera-znanja/sesije", "/poruke", "/poruke/primaoci", "/zadaci",
    "/zadaci/izvrsioci", "/obavjestenja", "/skladista", "/kupci", "/dobavljaci", "/artikli", "/povlacenja", "/izvoz/izvori", "/audit",
    "/bekap/poslednji", "/firma", "/sledljivost/pretraga?q=MLJ", "/zdravlje", "/aktivnost", "/pitanja-firme",
    "/provjera-znanja/rezultati", "/izvoz/prijemi/pregled"],
  direktor: ["/tabla", "/aktivnost", "/tabla/detalj/neusaglasenosti", "/povlacenja", "/lotovi", "/poruke", "/poruke/primaoci", "/zadaci", "/obavjestenja", "/skladista", "/sledljivost/pretraga?q=MLJ", "/zdravlje"],
  marko: ["/prijem", "/zaliha", "/lotovi", "/zapisi", "/mjerenja", "/isporuke", "/neusaglasenosti", "/zadaci", "/obavjestenja", "/skladista", "/lica/ja",
    "/kupci", "/dobavljaci", "/artikli", "/vozaci", "/zdravlje"],
  petar: ["/isporuke", "/vozila", "/kontrole-vozila", "/neusaglasenosti", "/zadaci", "/obavjestenja", "/vozaci", "/skladista", "/kupci", "/zaliha", "/lica/ja", "/zdravlje"],
  konsultant: ["/tabla", "/izvoz/izvori", "/audit", "/pitanja", "/nalozi", "/povlacenja", "/zdravlje"],
};

const NE_SMIJE = {
  direktor: ["/pitanja-firme", "/izvoz/prijemi/pregled", "/izvoz/izvori", "/audit", "/nalozi", "/pitanja", "/kontrole-vozila", "/lica", "/prijem", "/zapisi", "/plan-obuke"],
  marko: ["/aktivnost", "/tabla", "/tabla/detalj/neusaglasenosti", "/lica", "/plan-obuke", "/pravila-kontrole", "/pitanja-firme", "/provjera-znanja/rezultati", "/kontrole-vozila", "/izvoz/izvori", "/nalozi", "/poruke", "/audit", "/povlacenja", "/sledljivost/pretraga?q=MLJ", "/pitanja"],
  petar: ["/izvoz/izvori", "/nalozi", "/poruke", "/audit", "/povlacenja", "/pitanja", "/sledljivost/pretraga?q=MLJ", "/tabla", "/lica", "/prijem", "/zapisi", "/mjerenja", "/dobavljaci", "/artikli", "/lotovi", "/kontrolne-tacke"],
  ana: ["/pitanja"], // banka pitanja je samo konsultantova (invarijanta #14)
};

export async function pokreni({ provjeri }) {
  const anon = anonimno();
  provjeri("Bez prijave: /zdravlje radi", (await anon("/zdravlje")).status === 200);
  const uci = await anon("/provjera-znanja/uci", { telo: { sifra: "NEPOSTOJECA-SIFRA" } });
  provjeri("Bez prijave: ulazak u provjeru znanja šifrom nije zaključan (nije 401)", uci.status !== 401, `${uci.status} ${uci.tijelo?.error?.code ?? ""}`);
  provjeri("Bez prijave: Kontrolni centar je zaključan (401)", (await anon("/tabla")).status === 401);

  for (const [kljuc, adrese] of Object.entries(MORA)) {
    const k = await prijava(NALOZI[kljuc]);
    const pali = [];
    for (const a of adrese) {
      const r = await k(a);
      if (r.status !== 200) pali.push(`${a} → ${r.status}`);
    }
    provjeri(`${NALOZI[kljuc].ime}: vidi svih ${adrese.length} svojih adresa`, pali.length === 0, pali.join(", "));
  }
  for (const [kljuc, adrese] of Object.entries(NE_SMIJE)) {
    const k = await prijava(NALOZI[kljuc]);
    const propusteno = [];
    for (const a of adrese) {
      const r = await k(a);
      if (r.status !== 403) propusteno.push(`${a} → ${r.status}`);
    }
    provjeri(`${NALOZI[kljuc].ime}: ne vidi ${adrese.length} tuđih adresa (403)`, propusteno.length === 0, propusteno.join(", "));
  }

  const petar = await prijava(NALOZI.petar);
  provjeri("Vozač ne upisuje HACCP obrasce (403)", (await petar("/zapisi", { telo: { obrazacKod: "P3", datum: "2026-01-01", podaci: {} } })).status === 403);
}
