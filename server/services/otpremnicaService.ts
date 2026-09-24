// Otpremnica → prijedlog prijema. Sve se radi NA NAŠEM SERVERU, bez spoljnih servisa:
//   PDF    — tekst se čita direktno iz fajla (pdfjs), tačno do slova;
//   slika  — lokalni OCR (Tesseract, srpska latinica), uz prilagodljivo crno-bijelo (sjenka) i
//            ispravljanje nagiba. Nesigurna polja se označavaju za provjeru.
// Rezultat je SAMO PRIJEDLOG: magacioner ga upoređuje sa robom i etiketom i tek onda potvrđuje.
import path from "node:path";
import { createRequire } from "node:module";
import { upit } from "../db.js";
import { ApiGreska } from "../greske.js";
import { danasCG } from "../vrijeme.js";

export type Celija = { tekst: string; pouzdanost: number };
export type Linija = Celija[];

export type StavkaOtpremnice = {
  sifra: string | null;
  naziv: string | null;
  jm: string | null;
  kolicina: number | null;
  lot: string | null;
  rok: string | null; // YYYY-MM-DD
  /** Polja koja treba posebno provjeriti (niska pouzdanost OCR-a, ispravljen znak, nečitljivo). */
  nesigurno: string[];
};

export type Otpremnica = {
  strana: number;
  broj: string | null;
  datum: string | null;
  pibovi: string[];
  /** PIB ispod labele "Isporučilac/Dobavljač" — samo kad se to može pouzdano reći. */
  pibIsporucioca: string | null;
  isporucilac: string | null;
  kupac: string | null;
  temperatura: number | null;
  stavke: StavkaOtpremnice[];
};

/** Ispod ovoga je OCR riječ nesigurna i polje se boji žuto. */
const PRAG_POUZDANOSTI = 80;

// ─── Čitanje ─────────────────────────────────────────────────────────────────────────────────────

export function prepoznajVrstu(sadrzaj: Buffer): { vrsta: "pdf" | "slika"; mime: string } | null {
  if (sadrzaj.subarray(0, 5).toString("latin1") === "%PDF-") return { vrsta: "pdf", mime: "application/pdf" };
  if (sadrzaj[0] === 0xff && sadrzaj[1] === 0xd8 && sadrzaj[2] === 0xff) return { vrsta: "slika", mime: "image/jpeg" };
  if (sadrzaj.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return { vrsta: "slika", mime: "image/png" };
  if (sadrzaj.subarray(0, 4).toString("latin1") === "RIFF" && sadrzaj.subarray(8, 12).toString("latin1") === "WEBP") return { vrsta: "slika", mime: "image/webp" };
  return null;
}

type PdfStavka = { str: string; transform: number[]; width: number; height: number };

/** Svaka strana → redovi → ćelije. Dijelovi teksta u istoj visini su jedan red; razmak veći od
 * pola visine slova je nova ćelija (tako se ćelije tabele ne slijepe). */
export async function procitajPdf(sadrzaj: Buffer): Promise<Linija[][]> {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const ucitavanje = pdfjs.getDocument({ data: new Uint8Array(sadrzaj), useSystemFonts: false, verbosity: 0 });
  const dokument = await ucitavanje.promise;
  const strane: Linija[][] = [];
  let ukupnoTeksta = 0;
  for (let broj = 1; broj <= dokument.numPages; broj++) {
    const strana = await dokument.getPage(broj);
    const sadrzajStrane = await strana.getTextContent();
    const redovi: { y: number; dijelovi: PdfStavka[] }[] = [];
    for (const it of sadrzajStrane.items as PdfStavka[]) {
      if (!("str" in it) || !it.str.trim()) continue;
      ukupnoTeksta += it.str.length;
      const y = it.transform[5];
      let red = redovi.find((r) => Math.abs(r.y - y) < Math.max(2, (it.height || 8) * 0.4));
      if (!red) redovi.push((red = { y, dijelovi: [] }));
      red.dijelovi.push(it);
    }
    redovi.sort((a, b) => b.y - a.y);
    strane.push(
      redovi.map((r) => {
        const dijelovi = r.dijelovi.sort((a, b) => a.transform[4] - b.transform[4]);
        const celije: Celija[] = [];
        let prethodni: PdfStavka | null = null;
        for (const d of dijelovi) {
          const razmak = prethodni ? d.transform[4] - (prethodni.transform[4] + prethodni.width) : Infinity;
          if (prethodni && razmak < Math.max(1.5, (d.height || 8) * 0.5)) {
            celije[celije.length - 1].tekst += (razmak > 0.8 ? " " : "") + d.str;
          } else {
            celije.push({ tekst: d.str, pouzdanost: 100 });
          }
          prethodni = d;
        }
        return celije.map((c) => ({ ...c, tekst: c.tekst.replace(/\s+/g, " ").trim() })).filter((c) => c.tekst);
      }),
    );
  }
  await ucitavanje.destroy();
  if (ukupnoTeksta < 20) {
    throw new ApiGreska(422, "PDF_BEZ_TEKSTA", "Ovaj PDF je skeniran kao slika i nema teksta — slikajte otpremnicu telefonom ili pošaljite sliku.");
  }
  return strane;
}

// Jedan OCR radnik za cijeli server, poslovi idu jedan za drugim (Render ima malo memorije).
// Gasi se posle 5 minuta bez posla i ponovo pali pri sljedećoj slici.
type OcrRadnik = Awaited<ReturnType<typeof import("tesseract.js").createWorker>>;
let radnik: Promise<OcrRadnik> | null = null;
let gasenje: NodeJS.Timeout | null = null;
let red: Promise<unknown> = Promise.resolve();

async function dajRadnika(): Promise<OcrRadnik> {
  if (!radnik) {
    radnik = (async () => {
      const { createWorker } = await import("tesseract.js");
      const require = createRequire(import.meta.url);
      const langPath = path.join(path.dirname(require.resolve("@tesseract.js-data/srp_latn/package.json")), "4.0.0_best_int");
      const w = await createWorker("srp_latn", 1, { langPath, cacheMethod: "none", gzip: true });
      // Sauvola (2) umjesto Otsu: lokalni prag ne "pojede" dio papira u sjenci — na probnoj
      // fotografiji pouzdanost je skočila sa 67 na 90 %. Razmaci se čuvaju da se vide kolone.
      // PSM 3 (automatska podjela stranice): tesseract.js inače čita sve kao jedan blok i na
      // probi je gubio red tabele.
      await w.setParameters({ thresholding_method: "2", preserve_interword_spaces: "1", tessedit_pageseg_mode: "3" } as Record<string, string>);
      return w;
    })();
    radnik.catch(() => {
      radnik = null;
    });
  }
  return radnik;
}

type OcrRijec = { text: string; confidence: number; bbox: { x0: number; x1: number } };
type OcrLinija = { words: unknown[]; bbox: { y0: number; y1: number } };

export async function procitajSliku(sadrzaj: Buffer): Promise<{ strane: Linija[][]; pouzdanost: number }> {
  const posao = red.then(async () => {
    if (gasenje) clearTimeout(gasenje);
    const w = await dajRadnika();
    try {
      const { data } = await w.recognize(sadrzaj, { rotateAuto: true }, { text: true, blocks: true });
      return data;
    } finally {
      gasenje = setTimeout(() => {
        const r = radnik;
        radnik = null;
        r?.then((x) => x.terminate()).catch(() => undefined);
      }, 5 * 60_000);
      gasenje.unref();
    }
  });
  red = posao.catch(() => undefined);
  const data = await posao;
  const sveLinije = (data.blocks ?? [])
    .flatMap((b) => b.paragraphs.flatMap((p) => p.lines as unknown as OcrLinija[]))
    .sort((a, b) => (a.bbox.y0 + a.bbox.y1) - (b.bbox.y0 + b.bbox.y1));
  const linije: Linija[] = [];
  for (const l of sveLinije) {
    const rijeci = (l.words as OcrRijec[]).filter((r) => r.text.trim()).sort((a, b) => a.bbox.x0 - b.bbox.x0);
    if (rijeci.length === 0) continue;
    const znakova = rijeci.reduce((z, r) => z + r.text.length, 0);
    const sirinaZnaka = rijeci.reduce((z, r) => z + (r.bbox.x1 - r.bbox.x0), 0) / Math.max(1, znakova);
    const celije: { rijeci: OcrRijec[] }[] = [];
    let prethodna: OcrRijec | null = null;
    for (const r of rijeci) {
      if (prethodna && r.bbox.x0 - prethodna.bbox.x1 < sirinaZnaka * 1.6) celije[celije.length - 1].rijeci.push(r);
      else celije.push({ rijeci: [r] });
      prethodna = r;
    }
    linije.push(
      celije.map((c) => ({
        tekst: c.rijeci.map((r) => r.text).join(" "),
        pouzdanost: Math.min(...c.rijeci.map((r) => r.confidence)),
      })),
    );
  }
  return { strane: [linije], pouzdanost: Math.round(data.confidence ?? 0) };
}

// ─── Prepoznavanje ───────────────────────────────────────────────────────────────────────────────

/** mala slova, bez kvačica — za poređenje naziva i labela. */
export const normalizuj = (s: string) =>
  s.toLowerCase().replace(/đ/g, "dj").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim();

const DATUM = /(\d{1,2})[.\/-](\d{1,2})[.\/-](\d{2,4})\.?/;

export function uDatum(tekst: string | null | undefined): string | null {
  const m = tekst?.match(DATUM);
  if (!m) return null;
  const dan = Number(m[1]);
  const mjesec = Number(m[2]);
  let godina = Number(m[3]);
  if (godina < 100) godina += 2000;
  if (mjesec < 1 || mjesec > 12 || dan < 1 || dan > 31 || godina < 2000 || godina > 2100) return null;
  const d = new Date(Date.UTC(godina, mjesec - 1, dan));
  if (d.getUTCDate() !== dan) return null;
  return `${godina}-${String(mjesec).padStart(2, "0")}-${String(dan).padStart(2, "0")}`;
}

export function uBroj(tekst: string | null | undefined): number | null {
  if (!tekst) return null;
  let t = tekst.replace(/\s/g, "");
  if (!/^\d{1,3}([.,]?\d{3})*([.,]\d{1,3})?$/.test(t)) return null;
  // 1.250,5 → 1250.5 ; 1,250.5 → 1250.5 ; 25,5 → 25.5
  const zadnji = Math.max(t.lastIndexOf(","), t.lastIndexOf("."));
  if (zadnji >= 0 && t.length - zadnji - 1 === 3 && (t.match(/[.,]/g) ?? []).length >= 1 && !/[.,]\d{1,2}$/.test(t)) {
    // samo separator hiljada (1.250) — tri cifre posle posljednjeg znaka
    t = t.replace(/[.,]/g, "");
  } else if (zadnji >= 0) {
    t = t.slice(0, zadnji).replace(/[.,]/g, "") + "." + t.slice(zadnji + 1);
  }
  const n = Number(t);
  return Number.isFinite(n) && n > 0 ? n : null;
}

const JM = /^(kom|kom\.|kg|kg\.|g|gr|l|lit|lit\.|ml|pak|pak\.|kut|kut\.|kart|kd|fl|boca|bok|kanta|par|m)$/i;

// Kolone tabele: po nazivu u zaglavlju.
type Kolona = "sifra" | "naziv" | "jm" | "kolicina" | "lot" | "rok";
const ZAGLAVLJE: [Kolona, RegExp][] = [
  ["sifra", /^(sifra|sif|kod|sifra artikla|sif\. art|br\. art\w*|artikal br\.?|r\.?b\.?)$/],
  ["naziv", /^(proizvod|naziv|artikal|opis|naziv artikla|naziv proizvoda|naziv robe|roba)$/],
  ["jm", /^(jm|j\.m|j\. m|jed\. ?mj\w*|jedinica\w*|mj)$/],
  ["kolicina", /^(kol|kolicina|kolic\w*|kom)$/],
  ["lot", /^(lot|serija|sarza|lot\/serija|serija\/lot|batch|lot br|br\. lota|broj lota)$/],
  ["rok", /^(rok|rok trajanja|upotrebljivo do|najbolje upotrijebiti do|datum isteka|exp|best before|rok upotrebe)$/],
];

const bezInterpunkcije = (s: string) => normalizuj(s).replace(/[^a-z0-9 ./\\]/g, "").replace(/[.:]+$/, "").trim();

function kolonaZaglavlja(tekst: string): Kolona | null {
  const t = bezInterpunkcije(tekst);
  for (const [k, re] of ZAGLAVLJE) if (re.test(t)) return k;
  return null;
}

/** Zaglavlje tabele: red u kom su bar tri prepoznate kolone, među njima lot ili količina. */
function redoslijedKolona(linija: Linija): Kolona[] | null {
  let kolone = linija.map((c) => kolonaZaglavlja(c.tekst));
  // OCR ponekad spoji dvije labele u jednu ćeliju ("Šifra Proizvod") — probaj po riječima.
  if (kolone.filter(Boolean).length < 3) kolone = linija.flatMap((c) => c.tekst.split(/\s+/).map((r) => kolonaZaglavlja(r)));
  // Zaglavlje je kratak red u kom su labele većina — rečenica "…istekao rok, LOT…" nije zaglavlje.
  if (kolone.length > 12 || kolone.filter(Boolean).length * 2 < kolone.length) return null;
  const nadjene = kolone.filter((k): k is Kolona => k !== null);
  const jedinstvene = [...new Set(nadjene)];
  if (jedinstvene.length < 3 || !(jedinstvene.includes("lot") || jedinstvene.includes("kolicina"))) return null;
  return jedinstvene;
}

const KRAJ_TABELE = /^(napomena|ukupno|svega|predao|preuzeo|potpis|napomene|total|iznos|vozac|status)/;

/** OCR tipično čita "J" kao ")", "}" ili "|" na početku koda (JG26… → )G26…). Takav znak u kodu
 * ne može biti, pa se vraća u "J" — ali polje ostaje označeno za provjeru. */
function ocistiKod(tekst: string): { vrijednost: string | null; ispravljeno: boolean } {
  let t = tekst.trim().replace(/\s+/g, "");
  let ispravljeno = false;
  if (/^[)}\]|]/.test(t) && t.length > 1) {
    t = "J" + t.slice(1);
    ispravljeno = true;
  }
  const cisto = t.replace(/[^A-Za-z0-9\-\/.]/g, "");
  if (cisto !== t) ispravljeno = true;
  const v = cisto.replace(/^[.\-/]+|[.\-/]+$/g, "").toUpperCase();
  if (v !== cisto.toUpperCase()) ispravljeno = true;
  return { vrijednost: v || null, ispravljeno };
}

/** Da li riječ može biti vrijednost te kolone — po obliku, ne po položaju. */
function lici(k: Kolona, tekst: string): boolean {
  if (k === "jm") return JM.test(tekst.replace(/[^A-Za-z.]/g, ""));
  if (k === "kolicina") return uBroj(tekst.replace(/[^0-9.,]/g, "")) !== null && /^[|]?[\d.,]+$/.test(tekst);
  if (k === "rok") return uDatum(tekst) !== null;
  if (k === "lot") {
    const v = ocistiKod(tekst).vrijednost ?? "";
    return v.length >= 3 && /\d/.test(v) && uDatum(v) === null;
  }
  return true;
}

function parsirajRed(linija: Linija, kolone: Kolona[]): StavkaOtpremnice | null {
  // Samostalne linije tabele ("|", "___") nisu ćelije. "|" zalijepljen uz kod ostaje — to je
  // često pogrešno pročitano "J" (vidi ocistiKod).
  const celije = linija
    .filter((c) => !/^[|_\-—–\s]+$/.test(c.tekst))
    .map((c) => ({ ...c, tekst: c.tekst.replace(/^\|+\s+|\s+\|+$/g, "").replace(/\s+\|+\s+/g, " ").trim() }));
  if (celije.length === 0) return null;
  const vrijednosti: Partial<Record<Kolona, Celija>> = {};

  const imaNaziv = kolone.includes("naziv");
  if (imaNaziv && celije.length === kolone.length) {
    kolone.forEach((k, i) => (vrijednosti[k] = celije[i]));
  } else {
    // Broj ćelija se ne slaže (spojene ili razbijene ćelije), ili OCR nije pročitao labelu
    // "Proizvod" (nagnut papir → labele u dva reda). Kolone desno od naziva se uzimaju s desna,
    // svaka SAMO ako riječ liči na nju (datum, lot, broj, jedinica); lijevo od naziva s lijeva;
    // naziv je ono što ostane. Svaka riječ je ćelija.
    const rijeci: Celija[] = celije.flatMap((c) => c.tekst.split(/\s+/).map((t) => ({ tekst: t, pouzdanost: c.pouzdanost })));
    const iNaziv = imaNaziv ? kolone.indexOf("naziv") : kolone.filter((k) => k === "sifra").length;
    const bezNaziva = kolone.filter((k) => k !== "naziv");
    const lijevo = bezNaziva.slice(0, iNaziv);
    const desno = bezNaziva.slice(iNaziv);
    let pocetak = 0;
    let kraj = rijeci.length;
    for (const k of lijevo) if (pocetak < kraj) vrijednosti[k] = rijeci[pocetak++];
    for (const k of [...desno].reverse()) {
      if (kraj <= pocetak) break;
      if (!lici(k, rijeci[kraj - 1].tekst)) continue;
      vrijednosti[k] = rijeci[--kraj];
    }
    if (kraj > pocetak) {
      const dio = rijeci.slice(pocetak, kraj);
      vrijednosti.naziv = { tekst: dio.map((r) => r.tekst).join(" "), pouzdanost: Math.min(...dio.map((r) => r.pouzdanost)) };
    }
  }

  const nesigurno: string[] = [];
  const nisko = (k: Kolona) => (vrijednosti[k]?.pouzdanost ?? 100) < PRAG_POUZDANOSTI;

  const kolicina = uBroj(vrijednosti.kolicina?.tekst.replace(/[^0-9.,]/g, ""));
  if (vrijednosti.kolicina && (kolicina === null || nisko("kolicina"))) nesigurno.push("kolicina");

  const rokTekst = vrijednosti.rok?.tekst ?? null;
  const rok = uDatum(rokTekst);
  if (rokTekst && (rok === null || nisko("rok"))) nesigurno.push("rok");

  let lot: string | null = null;
  if (vrijednosti.lot) {
    const c = ocistiKod(vrijednosti.lot.tekst);
    lot = c.vrijednost && /\d/.test(c.vrijednost) && c.vrijednost.length >= 3 && !uDatum(c.vrijednost) ? c.vrijednost : null;
    if (!lot || c.ispravljeno || nisko("lot")) nesigurno.push("lot");
  }

  let sifra: string | null = null;
  if (vrijednosti.sifra) {
    const c = ocistiKod(vrijednosti.sifra.tekst);
    sifra = c.vrijednost;
    if (c.ispravljeno || nisko("sifra")) nesigurno.push("sifra");
  }

  let naziv = vrijednosti.naziv?.tekst.replace(/^\s+|[|\s]+$/g, "") || null;
  if (!sifra && naziv) {
    const [prva, ...ostalo] = naziv.split(/\s+/);
    if (ostalo.length > 0 && (/^[)}\]|]?[A-Za-z]{0,4}-\d{1,6}$/.test(prva) || /^[A-Za-z]{1,4}\d{2,6}$/.test(prva) || /^[)}\]|][A-Za-z]{0,3}\d{2,6}$/.test(prva))) {
      const c = ocistiKod(prva);
      sifra = c.vrijednost;
      naziv = ostalo.join(" ");
      if (c.ispravljeno || nisko("naziv")) nesigurno.push("sifra");
    }
  }
  naziv = naziv?.replace(/^[|\s]+/, "") || null;
  if (naziv && nisko("naziv")) nesigurno.push("naziv");
  const jmTekst = vrijednosti.jm?.tekst.replace(/[^A-Za-z.]/g, "") ?? "";
  const jm = JM.test(jmTekst) ? jmTekst.toLowerCase().replace(/\.$/, "") : null;

  // Red tabele mora imati bar količinu ili lot — inače je to tekst ispod tabele.
  if (kolicina === null && lot === null) return null;
  return { sifra, naziv, jm, kolicina, lot, rok, nesigurno };
}

const tekstLinije = (l: Linija) => l.map((c) => c.tekst).join("  ");
const LABELA_ISPORUCILAC = /(rucilac|dobavlja|prodavac|posiljalac|izdavalac|isporucio)/;
const LABELA_KUPAC = /^(kupac|primalac|narucilac|kupac\/primalac)\b/;
const jeLabela = (tekst: string, labela: RegExp) => {
  const t = bezInterpunkcije(tekst).replace(/^[^a-z]+/, "");
  return t.split(" ").length <= 2 && labela.test(t);
};

/** Vrijednost iza labele: sljedeća ćelija u istom redu (tabela zaglavlja), ili ostatak iste ćelije. */
function iza(linije: Linija[], labela: RegExp): string | null {
  for (const l of linije) {
    for (let i = 0; i < l.length; i++) {
      if (!jeLabela(l[i].tekst, labela)) continue;
      const ostatak = l[i].tekst.replace(/^[^:]*:\s*/, "");
      if (ostatak && ostatak !== l[i].tekst && ostatak.length > 2) return ostatak.trim();
      if (l[i + 1]) return l[i + 1].tekst.trim();
    }
  }
  return null;
}

function stavkeIspod(linije: Linija[], iZaglavlja: number): StavkaOtpremnice[] {
  const kolone = redoslijedKolona(linije[iZaglavlja])!;
  const stavke: StavkaOtpremnice[] = [];
  let promasaja = 0;
  for (const l of linije.slice(iZaglavlja + 1)) {
    if (KRAJ_TABELE.test(bezInterpunkcije(l[0]?.tekst ?? "").replace(/^[^a-z]+/, ""))) break;
    const s = parsirajRed(l, kolone);
    if (s) {
      stavke.push(s);
      promasaja = 0;
    } else if (++promasaja >= 3) break;
  }
  return stavke;
}

function parsirajStranu(linije: Linija[], strana: number): Otpremnica | null {
  let iZaglavlja = -1;
  let stavke: StavkaOtpremnice[] = [];
  for (let i = 0; i < linije.length; i++) {
    if (redoslijedKolona(linije[i]) === null) continue;
    const nadjene = stavkeIspod(linije, i);
    if (iZaglavlja < 0) iZaglavlja = i;
    if (nadjene.length > 0) {
      iZaglavlja = i;
      stavke = nadjene;
      break;
    }
  }
  const glava = iZaglavlja >= 0 ? linije.slice(0, iZaglavlja) : linije;
  const glavaTekst = glava.map(tekstLinije).join("\n");

  let broj: string | null = null;
  const brojRe = /(broj\s+otpremnice|otpremnica\s+(?:br\.?|broj)|br\.?\s*otpremnice|broj\s+dokumenta|dokument\s+br\.?)\s*[:#]?\s*(?:\|\s*)?([A-Z0-9][A-Z0-9\-\/.]*\d[A-Z0-9\-\/]*)/i;
  for (const l of glava) {
    const m = tekstLinije(l).replace(/\s{2,}/g, " ").match(brojRe);
    if (m) {
      broj = m[2].replace(/\.$/, "");
      break;
    }
  }
  const datumIzaLabele = glavaTekst.match(/datum[^0-9\n]{0,40}(\d{1,2}[.\/-]\d{1,2}[.\/-]\d{2,4})/i);
  const datum = uDatum(datumIzaLabele?.[1] ?? glavaTekst.match(DATUM)?.[0]);
  const pibovi = [...glavaTekst.matchAll(/PIB[:\s]*([0-9]{8,13})/gi)].map((m) => m[1]);
  // Čiji je PIB: posljednja labela (Isporučilac / Kupac) iznad njega. Ako su obje labele u istom
  // redu (stranke jedna pored druge), ne zna se — tada se ne pogađa.
  let stranka: "isporucilac" | "kupac" | null = null;
  let pibIsporucioca: string | null = null;
  for (const l of glava) {
    const isp = l.some((c) => jeLabela(c.tekst, LABELA_ISPORUCILAC));
    const kup = l.some((c) => jeLabela(c.tekst, LABELA_KUPAC));
    if (isp && kup) stranka = null;
    else if (isp) stranka = "isporucilac";
    else if (kup) stranka = "kupac";
    const pib = tekstLinije(l).match(/PIB[:\s]*([0-9]{8,13})/i)?.[1];
    if (pib && stranka === "isporucilac" && !pibIsporucioca) pibIsporucioca = pib;
  }
  const temperaturaM = linije.map(tekstLinije).join("\n").match(/temperatur\w*[^:\n]{0,30}:\s*([+\-−]?\s?\d{1,2}(?:[.,]\d)?)\s*[°*o]?\s*C/i);
  const temperatura = temperaturaM ? Number(temperaturaM[1].replace(/\s/g, "").replace("−", "-").replace(",", ".")) : null;

  if (!broj && stavke.length === 0) return null;
  return {
    strana,
    broj,
    datum,
    pibovi: [...new Set(pibovi)],
    pibIsporucioca,
    isporucilac: iza(glava, LABELA_ISPORUCILAC),
    kupac: iza(glava, LABELA_KUPAC),
    temperatura: temperatura !== null && Number.isFinite(temperatura) ? temperatura : null,
    stavke,
  };
}

/** Jedan fajl može imati više otpremnica (PDF sa više strana). Strana bez broja, a sa stavkama, je
 * nastavak prethodne otpremnice. */
export function parsiraj(strane: Linija[][]): Otpremnica[] {
  const otpremnice: Otpremnica[] = [];
  strane.forEach((linije, i) => {
    const o = parsirajStranu(linije, i + 1);
    if (!o) return;
    const prethodna = otpremnice[otpremnice.length - 1];
    if (!o.broj && prethodna) prethodna.stavke.push(...o.stavke);
    else otpremnice.push(o);
  });
  return otpremnice.filter((o) => o.stavke.length > 0 || o.broj);
}

// ─── Uparivanje sa šifarnikom ────────────────────────────────────────────────────────────────────

/** Dice koeficijent na parovima slova — trpi OCR greške ("Mliijeko" ≈ "Mlijeko"). */
export function slicnost(a: string, b: string): number {
  const cist = (s: string) => normalizuj(s).replace(/\b(d\.?o\.?o\.?|a\.?d\.?|doo)\b/g, "").replace(/[^a-z0-9%]/g, "");
  const x = cist(a);
  const y = cist(b);
  if (!x || !y) return 0;
  if (x === y) return 1;
  const parovi = (s: string) => {
    const m = new Map<string, number>();
    for (let i = 0; i < s.length - 1; i++) m.set(s.slice(i, i + 2), (m.get(s.slice(i, i + 2)) ?? 0) + 1);
    return m;
  };
  const px = parovi(x);
  const py = parovi(y);
  let zajedno = 0;
  for (const [p, n] of px) zajedno += Math.min(n, py.get(p) ?? 0);
  return (2 * zajedno) / (x.length - 1 + y.length - 1);
}

/** Ključ artikla dobavljača: njegova šifra, a kad je nema — naziv (malim slovima, bez kvačica). */
export const kljucArtikla = (sifra: string | null | undefined, naziv: string | null | undefined) =>
  sifra?.trim() ? `s:${normalizuj(sifra)}` : `n:${normalizuj(naziv ?? "")}`;

export type PrijedlogStavke = StavkaOtpremnice & { artikalId: string | null; artikalSigurno: boolean; rokIstekao: boolean };
export type Prijedlog = {
  strana: number;
  broj: string | null;
  datum: string | null;
  temperaturaNaOtpremnici: number | null;
  dobavljac: { id: string | null; naziv: string | null; pib: string | null; sigurno: boolean };
  stavke: PrijedlogStavke[];
  upozorenja: string[];
};

export async function uskladi(o: Otpremnica): Promise<Prijedlog> {
  const [dobavljaci, firma, artikli] = await Promise.all([
    upit<{ id: string; naziv: string; pib: string | null }>(`select id, naziv, pib from dobavljac where aktivan`),
    upit<{ pib: string | null }>(`select pib from firma limit 1`),
    upit<{ id: string; sifra: string | null; naziv: string }>(`select id, sifra, naziv from artikal where aktivan`),
  ]);
  const cifre = (s: string | null | undefined) => (s ?? "").replace(/\D/g, "");
  const upozorenja: string[] = [];
  const pibFirme = cifre(firma.rows[0]?.pib);

  if (pibFirme && o.pibovi.length > 0 && !o.pibovi.includes(pibFirme)) {
    upozorenja.push("Na otpremnici nije PIB vaše firme — provjerite da je roba stvarno za vas.");
  }
  const tudjiPibovi = o.pibovi.filter((p) => p !== pibFirme);

  // PIB za NOVOG dobavljača samo kad se zna da je njegov — tuđi PIB (kupca) bi napravio pogrešnog.
  // Bez labele: jedini PIB pored PIB-a vaše firme je dobavljačev — samo ako je vaš PIB tu.
  const pibNovog = o.pibIsporucioca ?? (pibFirme && o.pibovi.includes(pibFirme) && tudjiPibovi.length === 1 ? tudjiPibovi[0] : null);
  let dobavljac: Prijedlog["dobavljac"] = { id: null, naziv: o.isporucilac, pib: pibNovog, sigurno: false };
  const poPibu = dobavljaci.rows.find((d) => cifre(d.pib) && o.pibovi.includes(cifre(d.pib)));
  if (poPibu) {
    dobavljac = { id: poPibu.id, naziv: poPibu.naziv, pib: poPibu.pib, sigurno: true };
  } else if (o.isporucilac) {
    const najbolji = dobavljaci.rows.map((d) => ({ d, s: slicnost(d.naziv, o.isporucilac!) })).sort((a, b) => b.s - a.s)[0];
    if (najbolji && najbolji.s >= 0.6) dobavljac = { id: najbolji.d.id, naziv: najbolji.d.naziv, pib: najbolji.d.pib, sigurno: false };
  }
  if (!dobavljac.id) {
    upozorenja.push(
      `Dobavljač ${o.isporucilac ?? "sa otpremnice"}${dobavljac.pib ? ` (PIB ${dobavljac.pib})` : ""} nije u šifarniku — izaberite ga ili ga odgovorno lice dodaje u Šifarnicima.`,
    );
  }

  const mapiranja = dobavljac.id
    ? (await upit<{ kljuc: string; artikal_id: string }>(`select kljuc, artikal_id from artikal_dobavljaca where dobavljac_id = $1`, [dobavljac.id])).rows
    : [];
  const danas = danasCG();
  const stavke: PrijedlogStavke[] = o.stavke.map((s) => {
    const kljucevi = [kljucArtikla(s.sifra, s.naziv), kljucArtikla(null, s.naziv)];
    const zapamceno = mapiranja.find((m) => kljucevi.includes(m.kljuc));
    let artikalId: string | null = zapamceno?.artikal_id ?? null;
    let artikalSigurno = !!zapamceno;
    if (!artikalId && s.sifra) {
      const istaSifra = artikli.rows.find((a) => a.sifra && normalizuj(a.sifra) === normalizuj(s.sifra!));
      if (istaSifra) artikalId = istaSifra.id;
    }
    if (!artikalId && s.naziv) {
      const najbolji = artikli.rows.map((a) => ({ a, v: slicnost(a.naziv, s.naziv!) })).sort((x, y) => y.v - x.v)[0];
      if (najbolji && najbolji.v >= 0.45) artikalId = najbolji.a.id;
    }
    if (!artikalId) artikalSigurno = false;
    return { ...s, artikalId, artikalSigurno, rokIstekao: !!s.rok && s.rok < danas };
  });
  if (stavke.some((s) => s.rokIstekao)) upozorenja.push("Na otpremnici je roba sa isteklim rokom — takva stavka se ne može prihvatiti.");
  if (stavke.some((s) => !s.artikalId)) upozorenja.push("Neke stavke nisu prepoznate kao vaš artikal — izaberite ih; zapamtiće se za ovog dobavljača.");

  return { strana: o.strana, broj: o.broj, datum: o.datum, temperaturaNaOtpremnici: o.temperatura, dobavljac, stavke, upozorenja };
}

/** Cijeli tok: fajl → tekst → otpremnice → prijedlozi. */
export async function procitajOtpremnicu(sadrzaj: Buffer, vrsta: "pdf" | "slika") {
  const { strane, pouzdanost } = vrsta === "pdf" ? { strane: await procitajPdf(sadrzaj), pouzdanost: null } : await procitajSliku(sadrzaj);
  const otpremnice = parsiraj(strane);
  if (otpremnice.length === 0) {
    throw new ApiGreska(
      422,
      "OTPREMNICA_NIJE_PROCITANA",
      vrsta === "slika"
        ? "Na slici nije pronađena tabela sa robom. Slikajte cijelu otpremnicu odozgo, ravno, bez sjenke — ili unesite prijem ručno."
        : "U PDF-u nije pronađena tabela sa robom (kolone kao Šifra, Naziv, Količina, Lot, Rok) — unesite prijem ručno.",
    );
  }
  return { otpremnice: await Promise.all(otpremnice.map(uskladi)), pouzdanostOcr: pouzdanost };
}
