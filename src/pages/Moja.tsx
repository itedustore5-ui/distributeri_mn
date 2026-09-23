import { useEffect, useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { KeyRound, BookOpen, Bell, CheckCircle2, ArrowDownToLine, PackageCheck, Truck } from "lucide-react";
import { api, ApiGreska } from "../lib/api";
import { PageHeader } from "../components/Zajednicko";
import { StatusBadge } from "../components/StatusBadge";
import { useAuth, NAZIV_ULOGE } from "../lib/auth";

type Lice = { id: string; ime: string; sifra: string; sanitarna_knjizica_rok: string | null; knjizica_status: string | null };
type Zadatak = { id: string; naslov: string; opis: string | null; status: string; rok_at: string | null };
type Obavjestenje = { id: string; naslov: string; poruka: string | null; ozbiljnost: string; procitano_at: string | null; created_at: string };

export function Moja() {
  const { korisnik } = useAuth();
  const navigate = useNavigate();
  const [lice, setLice] = useState<Lice | null>(null);
  const [zadaci, setZadaci] = useState<Zadatak[]>([]);
  const [obavjestenja, setObavjestenja] = useState<Obavjestenje[]>([]);
  const [brojPrijema, setBrojPrijema] = useState<number | null>(null);
  const [brojIsporuka, setBrojIsporuka] = useState<number | null>(null);

  const ucitaj = () => {
    api<Zadatak[]>("/zadaci?moji=1").then(setZadaci);
    api<Obavjestenje[]>("/obavjestenja").then(setObavjestenja);
  };

  useEffect(() => {
    ucitaj();
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
        <div className="panel table-panel">
          <div className="panel-header">
            <h2>Moji zadaci</h2>
          </div>
          <div className="task-list">
            {zadaci.length === 0 && <p style={{ color: "#9aa5ae", fontSize: 11, padding: "0 0 10px" }}>Nema otvorenih zadataka.</p>}
            {zadaci.map((z) => (
              <div key={z.id} className="task-row">
                <span className={`task-check ${z.status === "ZAVRSEN" ? "success" : "warning"}`} />
                <div>
                  <strong>{z.naslov}</strong>
                  {z.opis && <span>{z.opis}</span>}
                </div>
                {z.status !== "ZAVRSEN" && (
                  <button className="row-action" onClick={() => api(`/zadaci/${z.id}`, { method: "PATCH", telo: { status: "ZAVRSEN" } }).then(ucitaj)}>
                    <CheckCircle2 size={14} />
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>

        <div className="panel activity-panel">
          <div className="panel-header">
            <h2><Bell size={14} style={{ verticalAlign: "-2px", marginRight: 6 }} />Obavještenja</h2>
          </div>
          <div className="activity-list">
            {obavjestenja.length === 0 && <p style={{ color: "#9aa5ae", fontSize: 11, padding: "14px 0" }}>Nema novih obavještenja.</p>}
            {obavjestenja.map((o) => (
              <div key={o.id} className="activity-row">
                <span className="activity-time">{new Date(o.created_at).toLocaleDateString("sr-Latn-ME")}</span>
                <div className={`activity-icon ${o.ozbiljnost === "VISOK" ? "danger" : "warning"}`}><Bell size={12} /></div>
                <div>
                  <strong>{o.naslov}</strong>
                  {o.poruka && <p>{o.poruka}</p>}
                </div>
              </div>
            ))}
          </div>
        </div>
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
