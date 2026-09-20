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
};

type AuthKontekst = {
  korisnik: Korisnik | null;
  ucitavanje: boolean;
  prijavi: (korisnickoIme: string, lozinka: string) => Promise<void>;
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
    await api("/auth/prijava", { telo: { korisnickoIme, lozinka } });
    await osvjeziKorisnika();
  };

  const odjavi = async () => {
    await api("/auth/odjava", { method: "POST" });
    setKorisnik(null);
  };

  return <Kontekst.Provider value={{ korisnik, ucitavanje, prijavi, odjavi, osvjeziKorisnika }}>{children}</Kontekst.Provider>;
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
