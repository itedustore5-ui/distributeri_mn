import { useEffect, useState, type FormEvent } from "react";
import { KeyRound, BookOpen, Bell, CheckCircle2 } from "lucide-react";
import { api, ApiGreska } from "../lib/api";
import { PageHeader } from "../components/Zajednicko";
import { StatusBadge } from "../components/StatusBadge";
import { useAuth, NAZIV_ULOGE } from "../lib/auth";

type Lice = { id: string; ime: string; sifra: string; sanitarna_knjizica_rok: string | null; knjizica_status: string | null };
type Zadatak = { id: string; naslov: string; opis: string | null; status: string; rok_at: string | null };
type Obavjestenje = { id: string; naslov: string; poruka: string | null; ozbiljnost: string; procitano_at: string | null; created_at: string };

export function Moja() {
  const { korisnik } = useAuth();
  const [lice, setLice] = useState<Lice | null>(null);
  const [zadaci, setZadaci] = useState<Zadatak[]>([]);
  const [obavjestenja, setObavjestenja] = useState<Obavjestenje[]>([]);

  const ucitaj = () => {
    api<Zadatak[]>("/zadaci?moji=1").then(setZadaci);
    api<Obavjestenje[]>("/obavjestenja").then(setObavjestenja);
  };

  useEffect(() => {
    ucitaj();
    if (korisnik?.lice_id) {
      api<Lice[]>("/lica").then((lica) => setLice(lica.find((l) => l.id === korisnik.lice_id) ?? null));
    }
  }, [korisnik?.lice_id]);

  return (
    <>
      <PageHeader title="Moja strana" description={korisnik ? `${korisnik.lice_ime ?? korisnik.korisnicko_ime} · ${NAZIV_ULOGE[korisnik.uloga]}` : ""} />

      {lice && (
        <div className="panel" style={{ marginBottom: 20 }}>
          <div className="panel-header"><h2>Moji podaci</h2></div>
          <div className="trace-detail-grid" style={{ padding: "0 20px 20px" }}>
            <div>
              <span>Šifra za potpisivanje</span>
              <strong>{lice.sifra}</strong>
            </div>
            {lice.knjizica_status && (
              <div>
                <span>Sanitarna knjižica</span>
                <StatusBadge status={lice.knjizica_status} />
                <small>{lice.sanitarna_knjizica_rok ?? ""}</small>
              </div>
            )}
          </div>
        </div>
      )}

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

      <div style={{ marginTop: 20 }}>
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
    <div className="panel" style={{ maxWidth: 420 }}>
      <div className="panel-header">
        <h2><KeyRound size={14} style={{ verticalAlign: "-2px", marginRight: 6 }} />Promjena lozinke</h2>
      </div>
      <form className="form-grid" style={{ gridTemplateColumns: "1fr" }} onSubmit={posalji}>
        {poruka && <div className="auth-security-note"><BookOpen size={13} />{poruka}</div>}
        {greska && <div className="auth-error">{greska}</div>}
        <label>Trenutna lozinka<input type="password" value={stara} onChange={(e) => setStara(e.target.value)} /></label>
        <label>Nova lozinka (najmanje 10 znakova)<input type="password" value={nova} onChange={(e) => setNova(e.target.value)} /></label>
        <button className="primary-button" type="submit" disabled={nova.length < 10}>Sačuvaj lozinku</button>
      </form>
    </div>
  );
}
