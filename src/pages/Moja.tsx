import { useEffect, useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { KeyRound, BookOpen, CheckCircle2, ArrowDownToLine, PackageCheck, Truck } from "lucide-react";
import { api, ApiGreska } from "../lib/api";
import { PageHeader } from "../components/Zajednicko";
import { StatusBadge } from "../components/StatusBadge";
import { useAuth, NAZIV_ULOGE } from "../lib/auth";
import { ListaZadataka, ListaObavjestenja } from "../components/Zadaci";

type Lice = { id: string; ime: string; sifra: string; sanitarna_knjizica_rok: string | null; knjizica_status: string | null };

export function Moja() {
  const { korisnik } = useAuth();
  const navigate = useNavigate();
  const [lice, setLice] = useState<Lice | null>(null);
  const [brojPrijema, setBrojPrijema] = useState<number | null>(null);
  const [brojIsporuka, setBrojIsporuka] = useState<number | null>(null);

  useEffect(() => {
    if (korisnik?.lice_id) {
      api<Lice[]>("/lica").then((lica) => setLice(lica.find((l) => l.id === korisnik.lice_id) ?? null));
    }
    if (korisnik?.uloga === "operater") {
      api<unknown[]>("/prijem").then((r) => setBrojPrijema(r.length));
    }
    if (korisnik?.uloga === "vozac" || korisnik?.uloga === "operater") {
      api<unknown[]>("/isporuke").then((r) => setBrojIsporuka(r.length));
    }
  }, [korisnik?.lice_id, korisnik?.uloga]);

  const terenskaUloga = korisnik?.uloga === "operater" || korisnik?.uloga === "vozac";

  return (
    <>
      <PageHeader title="Moja strana" description={korisnik ? `${korisnik.lice_ime ?? korisnik.korisnicko_ime} · ${NAZIV_ULOGE[korisnik.uloga]}` : ""} />

      {terenskaUloga && (
        <>
          <div className="section-heading">
            <div><h2>Moj rad</h2></div>
          </div>
          <div className="stats-grid" style={{ marginBottom: 24 }}>
            {korisnik?.uloga === "operater" && (
              <button className="stat-card" style={{ textAlign: "left" }} onClick={() => navigate("/prijem")}>
                <div className="stat-icon blue"><ArrowDownToLine size={18} /></div>
                <div className="stat-copy">
                  <span>Prijemi (posljednji dan)</span>
                  <strong>{brojPrijema ?? "…"}</strong>
                  <small>Otvori prijem robe</small>
                </div>
              </button>
            )}
            {(korisnik?.uloga === "vozac" || korisnik?.uloga === "operater") && (
              <button className="stat-card" style={{ textAlign: "left" }} onClick={() => navigate("/isporuka")}>
                <div className="stat-icon green"><PackageCheck size={18} /></div>
                <div className="stat-copy">
                  <span>Isporuke (posljednji dan)</span>
                  <strong>{brojIsporuka ?? "…"}</strong>
                  <small>Otvori isporuku</small>
                </div>
              </button>
            )}
            {korisnik?.uloga === "operater" ? (
              <button className="stat-card" style={{ textAlign: "left" }} onClick={() => navigate("/haccp")}>
                <div className="stat-icon orange"><CheckCircle2 size={18} /></div>
                <div className="stat-copy">
                  <span>Dnevni obrasci</span>
                  <strong>P3–P10</strong>
                  <small>Čišćenje, štetočine, higijena, otpad, oprema</small>
                </div>
              </button>
            ) : (
              <button className="stat-card" style={{ textAlign: "left" }} onClick={() => navigate("/vozila")}>
                <div className="stat-icon orange"><Truck size={18} /></div>
                <div className="stat-copy">
                  <span>Kontrola vozila</span>
                  <strong>D1</strong>
                  <small>Prije svakog utovara — nespremno vozilo ne smije na isporuku</small>
                </div>
              </button>
            )}
          </div>
        </>
      )}

      <div className="section-heading">
        <div><h2>Zadaci i obavještenja</h2></div>
      </div>
      <div className="dashboard-columns">
        <ListaZadataka samoMoji />
        <ListaObavjestenja />
      </div>

      <div className="section-heading" style={{ marginTop: 26 }}>
        <div><h2>Moji podaci</h2></div>
      </div>
      <div className="dashboard-columns">
        {lice && (
          <div className="panel" style={{ minHeight: "auto" }}>
            <div className="panel-header"><h2>Sanitarna knjižica i šifra</h2></div>
            <div style={{ padding: "0 20px 20px", display: "flex", flexDirection: "column", gap: 14 }}>
              {lice.knjizica_status && (
                <div>
                  <span className="meta-label">Sanitarna knjižica</span>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 4 }}>
                    <StatusBadge status={lice.knjizica_status} />
                    <small className="muted-text">{lice.sanitarna_knjizica_rok ?? ""}</small>
                  </div>
                </div>
              )}
              <div>
                <span className="meta-label">Šifra (potpis na obrascima i ulazak u provjeru znanja)</span>
                <div style={{ marginTop: 4 }}>
                  <code style={{ fontSize: 13 }}>{lice.sifra}</code>
                </div>
              </div>
            </div>
          </div>
        )}
        <PromjenaLozinke />
      </div>
    </>
  );
}

function PromjenaLozinke() {
  const [stara, setStara] = useState("");
  const [nova, setNova] = useState("");
  const [poruka, setPoruka] = useState("");
  const [greska, setGreska] = useState("");

  const posalji = async (e: FormEvent) => {
    e.preventDefault();
    setGreska("");
    setPoruka("");
    try {
      await api("/auth/promijeni-lozinku", { telo: { staraLozinka: stara, novaLozinka: nova } });
      setPoruka("Lozinka je promijenjena.");
      setStara("");
      setNova("");
    } catch (e) {
      setGreska(e instanceof ApiGreska ? e.message : "Lozinka nije promijenjena.");
    }
  };

  return (
    <div className="panel" style={{ minHeight: "auto" }}>
      <div className="panel-header">
        <h2><KeyRound size={14} style={{ verticalAlign: "-2px", marginRight: 6 }} />Promjena lozinke</h2>
      </div>
      <form className="form-grid" style={{ gridTemplateColumns: "1fr", padding: "0 20px 20px" }} onSubmit={posalji}>
        {poruka && <div className="auth-security-note"><BookOpen size={13} />{poruka}</div>}
        {greska && <div className="auth-error">{greska}</div>}
        <label>Trenutna lozinka<input type="password" value={stara} onChange={(e) => setStara(e.target.value)} /></label>
        <label>Nova lozinka (najmanje 10 znakova)<input type="password" value={nova} onChange={(e) => setNova(e.target.value)} /></label>
        <button className="primary-button" type="submit" disabled={nova.length < 10}>Sačuvaj lozinku</button>
      </form>
    </div>
  );
}
