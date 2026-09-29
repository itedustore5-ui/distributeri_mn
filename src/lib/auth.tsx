import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { api } from "./api";

export type Uloga = "izvodjac" | "bzr" | "operater" | "vozac" | "uprava";

export type Korisnik = {
  id: string;
  korisnicko_ime: string;
  uloga: Uloga;
  lice_id: string | null;
  lice_ime: string | null;
  mora_promijeniti_lozinku: boolean;
  lozinka_stanje: string;
  /** Potvrda u dva koraka uključena (#81). */
  totp_ukljucen?: boolean;
  /** Za ulogu je 2FA obavezna na ovoj instanci, a nije uključena — ništa drugo se ne otvara dok je ne uključi. */
  mora2fa?: boolean;
};

/** Posle tačne lozinke nalog sa 2FA dobija izazov; sesija se daje tek uz kod. */
export type DrugiKorak = { izazov: string };

type AuthKontekst = {
  korisnik: Korisnik | null;
  ucitavanje: boolean;
  /** Vraća drugi korak kad nalog ima potvrdu u dva koraka; inače je korisnik prijavljen. */
  prijavi: (korisnickoIme: string, lozinka: string) => Promise<DrugiKorak | null>;
  potvrdiKod: (izazov: string, kod: string) => Promise<void>;
  odjavi: () => Promise<void>;
  osvjeziKorisnika: () => Promise<void>;
};

const Kontekst = createContext<AuthKontekst | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [korisnik, setKorisnik] = useState<Korisnik | null>(null);
  const [ucitavanje, setUcitavanje] = useState(true);

  const osvjeziKorisnika = async () => {
    try {
      const odgovor = await api<{ korisnik: Korisnik }>("/auth/ja");
      setKorisnik(odgovor.korisnik);
    } catch {
      setKorisnik(null);
    }
  };

  useEffect(() => {
    osvjeziKorisnika().finally(() => setUcitavanje(false));
  }, []);

  const prijavi = async (korisnickoIme: string, lozinka: string) => {
    const odgovor = await api<{ potreban2fa?: boolean; izazov?: string }>("/auth/prijava", { telo: { korisnickoIme, lozinka } });
    if (odgovor?.potreban2fa && odgovor.izazov) return { izazov: odgovor.izazov };
    await osvjeziKorisnika();
    return null;
  };

  const potvrdiKod = async (izazov: string, kod: string) => {
    await api("/auth/prijava/2fa", { telo: { izazov, kod } });
    await osvjeziKorisnika();
  };

  const odjavi = async () => {
    await api("/auth/odjava", { method: "POST" });
    setKorisnik(null);
  };

  return <Kontekst.Provider value={{ korisnik, ucitavanje, prijavi, potvrdiKod, odjavi, osvjeziKorisnika }}>{children}</Kontekst.Provider>;
}

export function useAuth() {
  const kontekst = useContext(Kontekst);
  if (!kontekst) throw new Error("useAuth mora biti unutar AuthProvider-a.");
  return kontekst;
}

export const NAZIV_ULOGE: Record<Uloga, string> = {
  izvodjac: "Konsultant",
  bzr: "Odgovorno lice",
  operater: "Magacioner",
  vozac: "Vozač",
  uprava: "Uprava",
};
