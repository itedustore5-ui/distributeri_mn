import { useEffect, useState } from "react";
import { Plus, Truck, ClipboardList } from "lucide-react";
import { api, ApiGreska } from "../lib/api";
import { PageHeader, Modal } from "../components/Zajednicko";
import { StatusBadge } from "../components/StatusBadge";
import { useAuth } from "../lib/auth";
import { lokalniDatum } from "../lib/vrijeme";

type Vozilo = { id: string; registarski_broj: string; tip: string | null; status: string; temp_kontrolisano: boolean };
type Kontrola = {
  id: string;
  vozilo_id: string;
  registarski_broj: string;
  izvrsio: string | null;
  izvrsio_korisnik_id: string | null;
  izvrseno_at: string;
  datum: string;
  cistoca: boolean;
  oprema_ok: boolean;
  vrata_ok: boolean;
  temperatura: string | null;
  ukupan_status: string;
  napomena: string | null;
};

const sat = (iso: string) => new Date(iso).toLocaleTimeString("sr-Latn-ME", { hour: "2-digit", minute: "2-digit" });
const datumIVrijeme = (iso: string) => `${new Date(iso).toLocaleDateString("sr-Latn-ME")} ${sat(iso)}`;

export function Vozila() {
  const { korisnik } = useAuth();
  const [vozila, setVozila] = useState<Vozilo[]>([]);
  const [kontrole, setKontrole] = useState<Kontrola[]>([]);
  const [modalKontrola, setModalKontrola] = useState<Vozilo | null>(null);
  const [modalNovo, setModalNovo] = useState(false);
  const [filterVozilo, setFilterVozilo] = useState("");
  const [filterDatum, setFilterDatum] = useState("");
  const [filterRezultat, setFilterRezultat] = useState("");
  const [samoMoje, setSamoMoje] = useState(false);

  const ucitaj = () => {
    api<Vozilo[]>("/vozila").then(setVozila);
    api<Kontrola[]>("/kontrole-vozila").then(setKontrole);
  };
  useEffect(() => {
    ucitaj();
  }, []);

  const danas = lokalniDatum();
  // Lista je sortirana od najnovije — prva kontrola za vozilo je posljednja urađena.
  const posljednja = (voziloId: string) => kontrole.find((k) => k.vozilo_id === voziloId);
  const prikazano = kontrole.filter(
    (k) =>
      (!filterVozilo || k.vozilo_id === filterVozilo) &&
      (!filterDatum || k.datum === filterDatum) &&
      (!filterRezultat || k.ukupan_status === filterRezultat) &&
      (!samoMoje || k.izvrsio_korisnik_id === korisnik?.id),
  );
  const imaFiltera = filterVozilo || filterDatum || filterRezultat || samoMoje;

  return (
    <>
      <PageHeader
        title="Vozila"
        description="Kritičan nalaz na kontroli blokira isporuku tim vozilom dok se ne ponovi provjera."
        action={
          (korisnik?.uloga === "bzr" || korisnik?.uloga === "izvodjac") && (
            <button className="primary-button" onClick={() => setModalNovo(true)}>
              <Plus size={16} /> Novo vozilo
            </button>
          )
        }
      />
      <div className="vehicle-grid">
        {vozila.map((v) => (
          <div key={v.id} className={`vehicle-card ${v.status === "NIJE_SPREMNO" ? "danger" : "success"}`}>
            <div className="vehicle-top">
              <div className="vehicle-symbol"><Truck size={16} /></div>
            </div>
            <h3>{v.registarski_broj}</h3>
            <div className="vehicle-type">{v.tip ?? "Vozilo"}{v.temp_kontrolisano && <><span>·</span>rashladno</>}</div>
            <div className="vehicle-divider" />
            <div className="vehicle-meta">
              <div>
                <span>Status</span>
                <strong>{v.status === "SPREMNO" ? "Spremno" : "Nije spremno"}</strong>
              </div>
              <div>
                <span>Posljednja kontrola</span>
                {(() => {
                  const k = posljednja(v.id);
                  if (!k) return <strong className="kontrola-nema">nije rađena</strong>;
                  return (
                    <strong className={k.datum === danas ? "kontrola-danas" : "kontrola-stara"}>
                      {k.datum === danas ? `danas u ${sat(k.izvrseno_at)}` : datumIVrijeme(k.izvrseno_at)} · {k.izvrsio ?? "—"}
                    </strong>
                  );
                })()}
              </div>
            </div>
            <button className="secondary-button full-width" onClick={() => setModalKontrola(v)}>Nova kontrola (D1)</button>
          </div>
        ))}
      </div>

      <div className="section-heading" style={{ marginTop: 26 }}>
        <div>
          <h2><ClipboardList size={15} style={{ verticalAlign: "-2px", marginRight: 6 }} />Evidencija kontrola (D1)</h2>
          <span>Svaka kontrola ostaje zapisana — ne može se mijenjati ni brisati.</span>
        </div>
      </div>
      <div className="filter-bar">
        <label>
          Vozilo
          <select value={filterVozilo} onChange={(e) => setFilterVozilo(e.target.value)}>
            <option value="">Sva vozila</option>
            {vozila.map((v) => <option key={v.id} value={v.id}>{v.registarski_broj}</option>)}
          </select>
        </label>
        <label>
          Datum
          <input type="date" value={filterDatum} onChange={(e) => setFilterDatum(e.target.value)} />
        </label>
        <button className={`small-action${filterDatum === danas ? " selected" : ""}`} onClick={() => setFilterDatum(danas)}>Danas</button>
        <label>
          Rezultat
          <select value={filterRezultat} onChange={(e) => setFilterRezultat(e.target.value)}>
            <option value="">Svi</option>
            <option value="PROSAO">Prošao</option>
            <option value="NIJE_PROSAO">Nije prošao</option>
          </select>
        </label>
        <label className="filter-potvrda">
          <input type="checkbox" checked={samoMoje} onChange={(e) => setSamoMoje(e.target.checked)} /> Samo moje kontrole
        </label>
        {imaFiltera && (
          <button className="link-button" onClick={() => { setFilterVozilo(""); setFilterDatum(""); setFilterRezultat(""); setSamoMoje(false); }}>
            Poništi filtere
          </button>
        )}
        <span className="filter-broj">{prikazano.length} od {kontrole.length}</span>
      </div>
      {/* Na telefonu kartice umjesto tabele od 8 kolona — rezultat mora biti vidljiv bez skrolovanja u stranu. */}
      <div className="panel kontrole-kartice">
        {prikazano.length === 0 && <p className="muted-text" style={{ fontSize: 11, padding: 16 }}>{imaFiltera ? "Nema kontrola za izabrane filtere." : "Nema zabilježenih kontrola."}</p>}
        {prikazano.map((k) => {
          const pali = [!k.cistoca && "čistoća", !k.oprema_ok && "oprema", !k.vrata_ok && "vrata"].filter(Boolean);
          return (
            <div key={k.id} className="danas-red">
              <div>
                <strong>{k.registarski_broj} <StatusBadge status={k.ukupan_status} /></strong>
                <span>{datumIVrijeme(k.izvrseno_at)} · {k.izvrsio ?? "—"}{k.temperatura !== null ? ` · ${Number(k.temperatura)} °C` : ""}</span>
                {pali.length > 0 && <span className="danas-fali">Nije u redu: {pali.join(", ")}</span>}
                {k.napomena && <span>{k.napomena}</span>}
              </div>
            </div>
          );
        })}
      </div>
      <div className="panel full-panel kontrole-tabela">
        <div className="data-table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Vozilo</th>
                <th>Vrijeme</th>
                <th>Čistoća</th>
                <th>Oprema</th>
                <th>Vrata</th>
                <th>Temperatura</th>
                <th>Izvršio</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {prikazano.map((k) => (
                <tr key={k.id}>
                  <td>{k.registarski_broj}</td>
                  <td className="muted-text">{datumIVrijeme(k.izvrseno_at)}</td>
                  <td>{k.cistoca ? "Da" : "Ne"}</td>
                  <td>{k.oprema_ok ? "Da" : "Ne"}</td>
                  <td>{k.vrata_ok ? "Da" : "Ne"}</td>
                  <td className="muted-text">{k.temperatura ?? "—"}</td>
                  <td className="muted-text">{k.izvrsio ?? "—"}</td>
                  <td><StatusBadge status={k.ukupan_status} /></td>
                </tr>
              ))}
              {prikazano.length === 0 && (
                <tr>
                  <td colSpan={8} className="muted-text" style={{ textAlign: "center", padding: 20 }}>
                    {imaFiltera ? "Nema kontrola za izabrane filtere." : "Nema zabilježenih kontrola."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {modalKontrola && <NovaKontrolaModal vozilo={modalKontrola} onClose={() => setModalKontrola(null)} onCreated={ucitaj} />}
      {modalNovo && <NovoVoziloModal onClose={() => setModalNovo(false)} onCreated={ucitaj} />}
    </>
  );
}

function NovaKontrolaModal({ vozilo, onClose, onCreated }: { vozilo: Vozilo; onClose: () => void; onCreated: () => void }) {
  const [cistoca, setCistoca] = useState(true);
  const [opremaOk, setOpremaOk] = useState(true);
  const [vrataOk, setVrataOk] = useState(true);
  const [temperatura, setTemperatura] = useState("");
  const [napomena, setNapomena] = useState("");
  const [greska, setGreska] = useState("");

  const posalji = async () => {
    try {
      await api("/kontrole-vozila", { telo: { vozilId: vozilo.id, cistoca, opremaOk, vrataOk, temperatura: temperatura ? Number(temperatura) : undefined, napomena: napomena || undefined } });
      onCreated();
      onClose();
    } catch (e) {
      setGreska(e instanceof ApiGreska ? e.message : "Kontrola nije sačuvana.");
    }
  };

  const Polje = ({ oznaka, vrijednost, onChange }: { oznaka: string; vrijednost: boolean; onChange: (v: boolean) => void }) => (
    <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <input type="checkbox" checked={vrijednost} onChange={(e) => onChange(e.target.checked)} style={{ width: "auto", height: "auto" }} /> {oznaka}
    </label>
  );

  return (
    <Modal naslov={`Kontrola vozila — ${vozilo.registarski_broj}`} podnaslov="D1" onClose={onClose} greska={greska} footer={<><button className="secondary-button" onClick={onClose}>Otkaži</button><button className="primary-button" onClick={posalji}>Sačuvaj</button></>}>
      <div className="form-grid" style={{ gridTemplateColumns: "1fr" }}>
        <Polje oznaka="Čistoća tovarnog prostora" vrijednost={cistoca} onChange={setCistoca} />
        <Polje oznaka="Oprema ispravna" vrijednost={opremaOk} onChange={setOpremaOk} />
        <Polje oznaka="Vrata/brtve ispravni" vrijednost={vrataOk} onChange={setVrataOk} />
      </div>
      <div className="form-grid">
        {vozilo.temp_kontrolisano && <label>Temperatura (°C)<input type="number" step="0.1" value={temperatura} onChange={(e) => setTemperatura(e.target.value)} /></label>}
        <label style={{ gridColumn: vozilo.temp_kontrolisano ? undefined : "1 / -1" }}>Napomena<input value={napomena} onChange={(e) => setNapomena(e.target.value)} /></label>
      </div>
    </Modal>
  );
}

function NovoVoziloModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [registarskiBroj, setRegistarskiBroj] = useState("");
  const [tip, setTip] = useState("");
  const [tempKontrolisano] = useState(true);
  const [greska, setGreska] = useState("");

  const posalji = async () => {
    try {
      await api("/vozila", { telo: { registarskiBroj, tip: tip || undefined, tempKontrolisano } });
      onCreated();
      onClose();
    } catch (e) {
      setGreska(e instanceof ApiGreska ? e.message : "Vozilo nije sačuvano.");
    }
  };

  return (
    <Modal naslov="Novo vozilo" onClose={onClose} greska={greska} footer={<><button className="secondary-button" onClick={onClose}>Otkaži</button><button className="primary-button" onClick={posalji} disabled={!registarskiBroj}>Sačuvaj</button></>}>
      <div className="form-grid">
        <label>Registarski broj<input value={registarskiBroj} onChange={(e) => setRegistarskiBroj(e.target.value)} /></label>
        <label>Tip<input value={tip} onChange={(e) => setTip(e.target.value)} /></label>
      </div>
    </Modal>
  );
}
