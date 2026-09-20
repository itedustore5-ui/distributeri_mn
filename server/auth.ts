import crypto from "node:crypto";
import type { NextFunction, Request, Response } from "express";
import { upit } from "./db.js";
import { ApiGreska, posalji } from "./greske.js";

export type Uloga = "izvodjac" | "bzr" | "operater" | "vozac" | "uprava";

export type SesijskiKorisnik = {
  id: string;
  korisnicko_ime: string;
  uloga: Uloga;
  lice_id: string | null;
  lice_ime: string | null;
  mora_promijeniti_lozinku: boolean;
  lozinka_stanje: string;
};

export type AuthZahtjev = Request & { korisnik?: SesijskiKorisnik };

const SESIJA_KOLACIC = "pilot_sesija";
const TRAJANJE_SESIJE_MS = 8 * 60 * 60 * 1000;
const isProduction = process.env.NODE_ENV === "production";

type Sesija = { korisnikId: string; expiresAt: number };
const sesije = new Map<string, Sesija>();
const neuspjeliPokusaji = new Map<string, { pokusaji: number; resetAt: number }>();

export const noviToken = () => crypto.randomBytes(32).toString("base64url");

export function kreirajSesiju(korisnikId: string): string {
  const token = noviToken();
  sesije.set(token, { korisnikId, expiresAt: Date.now() + TRAJANJE_SESIJE_MS });
  return token;
}

export function obrisiSesiju(token: string) {
  sesije.delete(token);
}

/** Promjena uloge briše sesiju — stara sesija nosi staru ulogu (invarijanta #27). */
export function obrisiSveSesijeZaKorisnika(korisnikId: string) {
  for (const [token, sesija] of sesije) {
    if (sesija.korisnikId === korisnikId) sesije.delete(token);
  }
}

const vrijednostKolacica = (request: Request, naziv: string) => {
  const zaglavlje = request.headers.cookie || "";
  const dio = zaglavlje.split(";").map((deo) => deo.trim()).find((deo) => deo.startsWith(`${naziv}=`));
  return dio ? decodeURIComponent(dio.slice(naziv.length + 1)) : undefined;
};

export function postaviSesijskiKolacic(response: Response, token: string) {
  response.setHeader(
    "Set-Cookie",
    `${SESIJA_KOLACIC}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${TRAJANJE_SESIJE_MS / 1000}${isProduction ? "; Secure" : ""}`,
  );
}

export function obrisiSesijskiKolacic(response: Response) {
  response.setHeader("Set-Cookie", `${SESIJA_KOLACIC}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${isProduction ? "; Secure" : ""}`);
}

export function tokenIzZahtjeva(request: Request) {
  return vrijednostKolacica(request, SESIJA_KOLACIC);
}

export async function ucitajKorisnikaPoSesiji(token: string | undefined): Promise<SesijskiKorisnik | undefined> {
  if (!token) return undefined;
  const sesija = sesije.get(token);
  if (!sesija || sesija.expiresAt <= Date.now()) {
    if (sesija) sesije.delete(token);
    return undefined;
  }
  const rezultat = await upit<SesijskiKorisnik & { aktivan: boolean }>(
    `select k.id, k.korisnicko_ime, k.uloga, k.lice_id, k.mora_promijeniti_lozinku, k.lozinka_stanje,
            k.aktivan, l.ime as lice_ime
     from korisnik k left join lice l on l.id = k.lice_id
     where k.id = $1`,
    [sesija.korisnikId],
  );
  const red = rezultat.rows[0];
  if (!red || !red.aktivan) return undefined;
  return red;
}

export const requireAuth = async (request: AuthZahtjev, response: Response, next: NextFunction) => {
  const korisnik = await ucitajKorisnikaPoSesiji(tokenIzZahtjeva(request));
  if (!korisnik) {
    posalji(response, 401, "NEPRIJAVLJEN", "Prijava je potrebna.");
    return;
  }
  request.korisnik = korisnik;
  next();
};

export const requireUloga = (...uloge: Uloga[]) => (request: AuthZahtjev, response: Response, next: NextFunction) => {
  if (!request.korisnik || !uloge.includes(request.korisnik.uloga)) {
    posalji(response, 403, "NEDOZVOLJENO", "Vaša uloga nema pristup ovoj funkciji.");
    return;
  }
  next();
};

/** Zaštita od CSRF-a: state-changing zahtjevi moraju nositi ovo zaglavlje. Cross-site forme i
 * <img>/<script> pozivi ga ne mogu postaviti bez CORS dozvole koju server ne daje. */
export const zahtjevAppZaglavlje = (request: Request, response: Response, next: NextFunction) => {
  if (["GET", "HEAD", "OPTIONS"].includes(request.method)) {
    next();
    return;
  }
  if (request.headers["x-zahtjev-app"] !== "1") {
    posalji(response, 403, "NEDOSTAJE_ZAGLAVLJE", "Zahtjev nije prepoznat kao dolazak iz aplikacije.");
    return;
  }
  next();
};

export function provjeriOgranicenjeLogina(kljucKlijenta: string) {
  const stanje = neuspjeliPokusaji.get(kljucKlijenta);
  if (stanje && stanje.resetAt > Date.now() && stanje.pokusaji >= 8) {
    throw new ApiGreska(429, "PREVISE_POKUSAJA", "Previše neuspješnih pokušaja. Pokušajte ponovo za nekoliko minuta.");
  }
}

export function zabiljeziNeuspjeliPokusaj(kljucKlijenta: string) {
  const stanje = neuspjeliPokusaji.get(kljucKlijenta);
  const sljedeci = stanje && stanje.resetAt > Date.now() ? stanje : { pokusaji: 0, resetAt: Date.now() + 10 * 60 * 1000 };
  sljedeci.pokusaji += 1;
  neuspjeliPokusaji.set(kljucKlijenta, sljedeci);
}

export function ocistiNeuspjelePokusaje(kljucKlijenta: string) {
  neuspjeliPokusaji.delete(kljucKlijenta);
}

/** Koliko dana unazad smije da unosi/vidi svaka uloga — stoji na serveru, ne u pregledaču. */
export const PROZOR: Record<Uloga, number> = {
  operater: 1,
  vozac: 1,
  bzr: 7,
  izvodjac: 30,
  uprava: 7,
};

export const NA_TERENU: Uloga[] = ["operater", "vozac"];

/** Kolona se prosljeđuje kao argument — pogledi imaju različita imena (datum, datum_prijema...). */
export function ogranicenjeDatuma(uloga: Uloga, kolona: string) {
  const dani = PROZOR[uloga];
  return `${kolona} >= current_date - interval '${dani} days'`;
}

/** Operater/vozač ne mogu upisati tuđe ime kao izvršioca — server ga uvijek postavi na njihovo. */
export function izvrsilacZa(korisnik: SesijskiKorisnik, poslatoIme: string | undefined | null): string {
  if (NA_TERENU.includes(korisnik.uloga)) {
    return korisnik.lice_ime ?? korisnik.korisnicko_ime;
  }
  const ime = (poslatoIme ?? "").trim();
  return ime.length > 0 ? ime : (korisnik.lice_ime ?? korisnik.korisnicko_ime);
}

export function samoMoje(uloga: Uloga): boolean {
  return NA_TERENU.includes(uloga);
}

/** bzr otvara naloge samo ulozi operater/vozac; izvodjac otvara bilo koju osim izvodjac. */
export function smijeDodijelitiUlogu(izvrsiocevaUloga: Uloga, ciljUloga: Uloga): boolean {
  if (izvrsiocevaUloga === "izvodjac") return ciljUloga !== "izvodjac";
  if (izvrsiocevaUloga === "bzr") return ciljUloga === "operater" || ciljUloga === "vozac";
  return false;
}
