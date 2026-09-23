import { useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { ShieldCheck, AlertCircle, CheckCircle2 } from "lucide-react";
import { api, ApiGreska } from "../lib/api";

type Pitanje = { id: string; tema: string; tekst: string; ponudjeni_odgovori: string[] };

export function ProvjeraZnanja() {
  const sifraSaMoje = (useLocation().state as { sifra?: string } | null)?.sifra ?? "";
  const [sifra, setSifra] = useState(sifraSaMoje);
  const [ucesnikId, setUcesnikId] = useState<string | null>(null);
  const [ime, setIme] = useState<string | null>(null);
  const [pitanja, setPitanja] = useState<Pitanje[]>([]);
  const [indeks, setIndeks] = useState(0);
  const [odgovori, setOdgovori] = useState<Record<string, number>>({});
  const [rezultat, setRezultat] = useState<{ brojTacnih: number; brojPitanja: number } | null>(null);
  const [greska, setGreska] = useState("");
  const [ucitavanje, setUcitavanje] = useState(false);

  const uci = async () => {
    setGreska("");
    setUcitavanje(true);
    try {
      const odgovor = await api<{ ucesnikId: string; ime: string | null; pitanja: Pitanje[] }>("/provjera-znanja/uci", { telo: { sifra: sifra.trim() } });
      setUcesnikId(odgovor.ucesnikId);
      setIme(odgovor.ime);
      setPitanja(odgovor.pitanja);
    } catch (e) {
      setGreska(e instanceof ApiGreska ? e.message : "Ulazak nije uspio.");
    } finally {
      setUcitavanje(false);
    }
  };

  const odaberi = async (pitanjeId: string, datIndeks: number) => {
    setOdgovori((o) => ({ ...o, [pitanjeId]: datIndeks }));
    await api("/provjera-znanja/odgovor", { telo: { ucesnikId, pitanjeId, datIndeks } });
    if (indeks + 1 < pitanja.length) {
      setIndeks((i) => i + 1);
    } else {
      const zavrseno = await api<{ brojTacnih: number; brojPitanja: number }>("/provjera-znanja/zavrsi", { telo: { ucesnikId } });
      setRezultat(zavrseno);
    }
  };

  if (rezultat) {
    return (
      <div className="auth-shell" style={{ gridTemplateColumns: "minmax(0,480px)" }}>
        <div className="auth-card" style={{ textAlign: "center" }}>
          <CheckCircle2 size={32} color="#20a477" style={{ margin: "0 auto 12px" }} />
          <h1>Provjera je završena</h1>
          <p style={{ marginTop: 10 }}>Tačno {rezultat.brojTacnih} od {rezultat.brojPitanja} pitanja. Hvala, {ime ?? "kolega"}.</p>
        </div>
      </div>
    );
  }

  if (pitanja.length > 0 && ucesnikId) {
    const trenutno = pitanja[indeks];
    return (
      <div className="auth-shell" style={{ gridTemplateColumns: "minmax(0,560px)" }}>
        <div className="auth-card">
          <div className="eyebrow">Pitanje {indeks + 1} od {pitanja.length} · {trenutno.tema}</div>
          <h1 style={{ fontSize: 20, marginTop: 10 }}>{trenutno.tekst}</h1>
          <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 20 }}>
            {trenutno.ponudjeni_odgovori.map((odgovor, i) => (
              <button key={i} className="secondary-button full-width" style={{ justifyContent: "flex-start", minHeight: 44 }} onClick={() => odaberi(trenutno.id, i)}>
                {odgovor}
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="auth-shell" style={{ gridTemplateColumns: "minmax(0,480px)" }}>
      <div className="auth-card">
        <div className="auth-heading">
          <div className="auth-lock">
            <ShieldCheck size={19} />
          </div>
          <div>
            <div className="eyebrow">Provjera znanja</div>
            <h1>Unesite vašu šifru</h1>
            <p>Šifra je na vašoj cedulji sa spiska zaposlenih — dobijate je od odgovornog lica.</p>
          </div>
        </div>
        {greska && (
          <div className="auth-error" style={{ marginTop: 16 }}>
            <AlertCircle size={14} /> {greska}
          </div>
        )}
        <label style={{ display: "flex", flexDirection: "column", gap: 7, marginTop: 20, fontSize: 10, fontWeight: 600, color: "#637481" }}>
          Šifra
          <input value={sifra} onChange={(e) => setSifra(e.target.value)} style={{ height: 41, border: "1px solid #dfe6ec", borderRadius: 7, padding: "0 12px" }} />
        </label>
        <button className="primary-button auth-submit" onClick={uci} disabled={!sifra.trim() || ucitavanje} style={{ marginTop: 14 }}>
          {ucitavanje ? "Provjera..." : "Uđi"}
        </button>
        <Link to="/prijava" className="muted-text" style={{ display: "block", textAlign: "center", marginTop: 16, fontSize: 11 }}>
          ← Prijava u aplikaciju (korisničko ime i lozinka)
        </Link>
      </div>
    </div>
  );
}
