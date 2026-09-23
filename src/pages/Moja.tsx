import { useEffect, useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { KeyRound, BookOpen, CheckCircle2, ArrowDownToLine, PackageCheck, Truck, Phone, ChevronRight, AlertTriangle } from "lucide-react";
import { api, ApiGreska } from "../lib/api";
import { PageHeader } from "../components/Zajednicko";
import { StatusBadge } from "../components/StatusBadge";
import { useAuth, NAZIV_ULOGE } from "../lib/auth";
import { ListaZadataka, ListaObavjestenja } from "../components/Zadaci";
import { lokalniDatum } from "../lib/vrijeme";

type Lice = { id: string; ime: string; sifra: string; sanitarna_knjizica_rok: string | null; knjizica_status: string | null; rukuje_hranom: boolean };

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
    if (korisnik?.uloga === "operater") {
      api<unknown[]>("/isporuke").then((r) => setBrojIsporuka(r.length));
    }
  }, [korisnik?.lice_id, korisnik?.uloga]);

  const terenskaUloga = korisnik?.uloga === "operater" || korisnik?.uloga === "vozac";
  const knjizicaTrazi = terenskaUloga && lice && lice.rukuje_hranom && (lice.knjizica_status === "ISTEKLA" || lice.knjizica_status === "USKORO");

  return (
    <>
      <PageHeader title="Moja strana" description={korisnik ? `${korisnik.lice_ime ?? korisnik.korisnicko_ime} · ${NAZIV_ULOGE[korisnik.uloga]}` : ""} />

      {knjizicaTrazi && (
        <div className="upozorenje-traka">
          <AlertTriangle size={16} />
          <span>
            Sanitarna knjižica {lice!.knjizica_status === "ISTEKLA" ? "je istekla" : "uskoro ističe"}
            {lice!.sanitarna_knjizica_rok ? ` (${new Date(lice!.sanitarna_knjizica_rok).toLocaleDateString("sr-Latn-ME")})` : ""} — javite se odgovornom licu za ljekarski pregled.
          </span>
        </div>
      )}

      {korisnik?.uloga === "vozac" && <VozacDanas />}

      {korisnik?.uloga === "operater" && (
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
            {korisnik?.uloga === "operater" && (
              <button className="stat-card" style={{ textAlign: "left" }} onClick={() => navigate("/isporuka")}>
                <div className="stat-icon green"><PackageCheck size={18} /></div>
                <div className="stat-copy">
                  <span>Isporuke (posljednji dan)</span>
                  <strong>{brojIsporuka ?? "…"}</strong>
                  <small>Otvori isporuku</small>
                </div>
              </button>
            )}
            <button className="stat-card" style={{ textAlign: "left" }} onClick={() => navigate("/haccp")}>
              <div className="stat-icon orange"><CheckCircle2 size={18} /></div>
              <div className="stat-copy">
                <span>Dnevni obrasci</span>
                <strong>P3–P10</strong>
                <small>Čišćenje, štetočine, higijena, otpad, oprema</small>
              </div>
            </button>
          </div>
        </>
      )}

      <div className="section-heading">
        <div><h2>Zadaci i obavještenja</h2></div>
      </div>
      <div className="dashboard-columns">
        {korisnik?.uloga !== "uprava" && <ListaZadataka samoMoji />}
        <ListaObavjestenja />
      </div>

      <div className="section-heading" style={{ marginTop: 26 }}>
        <div><h2>Moji podaci</h2></div>
      </div>
      <div className="dashboard-columns">
        {/* Knjižica se tiče samo onih koji rukuju hranom (Zakon o zaštiti stanovništva od zaraznih
            bolesti, čl. 31); šifra za potpis — onih koji potpisuju obrasce, ne uprave. */}
        {lice && (lice.rukuje_hranom || korisnik?.uloga !== "uprava") && (
          <div className="panel" style={{ minHeight: "auto" }}>
            <div className="panel-header"><h2>{lice.rukuje_hranom ? "Sanitarna knjižica i šifra" : "Šifra"}</h2></div>
            <div style={{ padding: "0 20px 20px", display: "flex", flexDirection: "column", gap: 14 }}>
              {lice.rukuje_hranom && lice.knjizica_status && (
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

type IsporukaVozaca = {
  id: string;
  broj: string;
  kupac_naziv: string;
  kupac_telefon: string | null;
  datum_isporuke: string;
  status: string;
  vozilo_id: string | null;
  registarski_broj: string | null;
  skladiste_naziv: string | null;
};
type VoziloStanje = { id: string; registarski_broj: string; status: string; aktivan?: boolean };
type KontrolaVozila = { vozilo_id: string; datum: string; izvrseno_at: string; ukupan_status: string; izvrsio: string | null };

/** Vozačeva tabla odgovara na dva pitanja prije polaska: je li vozilo spremno i pregledano
 * danas (D1), i šta danas vozim i kome. Brojke bez konteksta ("Isporuke: 1", "D1") mu ne govore ništa. */
function VozacDanas() {
  const navigate = useNavigate();
  const [isporuke, setIsporuke] = useState<IsporukaVozaca[] | null>(null);
  const [vozila, setVozila] = useState<VoziloStanje[]>([]);
  const [kontrole, setKontrole] = useState<KontrolaVozila[]>([]);
  const danas = lokalniDatum();

  useEffect(() => {
    api<IsporukaVozaca[]>("/isporuke").then(setIsporuke);
    api<VoziloStanje[]>("/vozila").then(setVozila);
    api<KontrolaVozila[]>("/kontrole-vozila").then(setKontrole);
  }, []);

  const zaIsporuku = (isporuke ?? []).filter((i) => i.status === "U_PRIPREMI").sort((a, b) => a.datum_isporuke.localeCompare(b.datum_isporuke));
  const danasIsporuceno = (isporuke ?? []).filter((i) => i.status !== "U_PRIPREMI" && i.datum_isporuke === danas).length;
  // Vozila sa mojih isporuka; bez isporuka — sva vozila, da se kontrola može uraditi unaprijed.
  const idVozila = new Set(zaIsporuku.map((i) => i.vozilo_id).filter(Boolean));
  const mojaVozila = idVozila.size > 0 ? vozila.filter((v) => idVozila.has(v.id)) : vozila;
  const kontrolaDanas = (voziloId: string) => kontrole.find((k) => k.vozilo_id === voziloId && k.datum === danas);
  const opisDatuma = (datum: string) => (datum === danas ? "danas" : datum);

  return (
    <>
      <div className="section-heading">
        <div>
          <h2>Danas</h2>
          <span>{new Date().toLocaleDateString("sr-Latn-ME", { weekday: "long", day: "numeric", month: "long" })}</span>
        </div>
      </div>
      <div className="dashboard-columns" style={{ marginBottom: 24 }}>
        <div className="panel" style={{ minHeight: "auto" }}>
          <div className="panel-header">
            <h2><Truck size={14} style={{ verticalAlign: "-2px", marginRight: 6 }} />Vozilo i kontrola (D1)</h2>
          </div>
          <div className="danas-lista">
            {mojaVozila.length === 0 && <p className="muted-text" style={{ fontSize: 11 }}>Nema vozila u evidenciji.</p>}
            {mojaVozila.map((v) => {
              const k = kontrolaDanas(v.id);
              return (
                <div key={v.id} className="danas-red">
                  <div>
                    <strong>{v.registarski_broj} <StatusBadge status={v.status} /></strong>
                    {k ? (
                      <span className={k.ukupan_status === "PROSAO" ? "danas-ok" : "danas-fali"}>
                        Kontrola danas u {new Date(k.izvrseno_at).toLocaleTimeString("sr-Latn-ME", { hour: "2-digit", minute: "2-digit" })} —{" "}
                        {k.ukupan_status === "PROSAO" ? "prošao" : "nije prošao"}
                      </span>
                    ) : (
                      <span className="danas-fali">Kontrola danas nije urađena</span>
                    )}
                  </div>
                  {!k && (
                    <button className="small-action" onClick={() => navigate("/vozila")}>Uradi kontrolu</button>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        <div className="panel" style={{ minHeight: "auto" }}>
          <div className="panel-header">
            <h2><PackageCheck size={14} style={{ verticalAlign: "-2px", marginRight: 6 }} />Moje isporuke</h2>
            <button className="small-action" onClick={() => navigate("/isporuka")}>Sve isporuke</button>
          </div>
          <div className="danas-lista">
            {isporuke !== null && zaIsporuku.length === 0 && (
              <p className="muted-text" style={{ fontSize: 11 }}>Nema isporuka koje čekaju — kad vam dodijele novu, stići će obavještenje.</p>
            )}
            {zaIsporuku.map((i) => (
              <div key={i.id} className="danas-red klikabilno" role="button" tabIndex={0} onClick={() => navigate("/isporuka")} onKeyDown={(e) => e.key === "Enter" && navigate("/isporuka")}>
                <div>
                  <strong>{i.kupac_naziv}</strong>
                  <span>
                    {i.broj} · {opisDatuma(i.datum_isporuke)}
                    {i.registarski_broj ? ` · ${i.registarski_broj}` : " · bez vozila"}
                    {i.skladiste_naziv ? ` · iz: ${i.skladiste_naziv}` : ""}
                  </span>
                </div>
                {i.kupac_telefon && (
                  <a className="row-action" href={`tel:${i.kupac_telefon.replace(/\s/g, "")}`} onClick={(e) => e.stopPropagation()} aria-label={`Pozovi ${i.kupac_naziv}`}>
                    <Phone size={14} />
                  </a>
                )}
                <ChevronRight size={16} className="muted-icon" />
              </div>
            ))}
            {danasIsporuceno > 0 && <p className="danas-ok" style={{ fontSize: 11, marginTop: 8 }}>Danas isporučeno: {danasIsporuceno}</p>}
          </div>
        </div>
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
