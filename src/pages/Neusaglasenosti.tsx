import { useEffect, useState } from "react";
import { Plus } from "lucide-react";
import { api, ApiGreska } from "../lib/api";
import { PageHeader, Modal } from "../components/Zajednicko";
import { StatusBadge } from "../components/StatusBadge";
import { useAuth } from "../lib/auth";

type Nc = { id: string; broj: string; ozbiljnost: string; status: string; opis: string; prijavio: string | null; created_at: string };
type Mjera = { id: string; opis: string; status: string; zavrsio_korisnik_id: string | null; rok: string | null };
type NcDetalj = Nc & { korektivneMjere: Mjera[]; verifikacije: { id: string; rezultat: string; napomena: string | null }[] };

export function Neusaglasenosti() {
  const { korisnik } = useAuth();
  const [lista, setLista] = useState<Nc[]>([]);
  const [otvoren, setOtvoren] = useState<NcDetalj | null>(null);
  const [modalNova, setModalNova] = useState(false);

  const ucitaj = () => api<Nc[]>("/neusaglasenosti").then(setLista);
  useEffect(() => {
    ucitaj();
  }, []);

  const otvoriDetalj = (id: string) => api<NcDetalj>(`/neusaglasenosti/${id}`).then(setOtvoren);

  const mozeUpravljati = korisnik?.uloga === "bzr" || korisnik?.uloga === "izvodjac";

  return (
    <>
      <PageHeader
        title="Neusaglašenosti"
        description="Odstupanje bez zapisane mjere je nalaz protiv firme, ne protiv zaposlenog."
        action={
          <button className="primary-button" onClick={() => setModalNova(true)}>
            <Plus size={16} /> Prijavi neusaglašenost
          </button>
        }
      />
      <div className="panel full-panel">
        <div className="nc-list">
          {lista.map((nc) => (
            <div key={nc.id} className="nc-row" onClick={() => otvoriDetalj(nc.id)} style={{ cursor: "pointer" }}>
              <div className={`severity-bar ${nc.ozbiljnost === "VISOK" ? "danger" : "warning"}`} />
              <div className="nc-title">
                <strong>{nc.broj}</strong>
                <h3>{nc.opis}</h3>
                <span>{new Date(nc.created_at).toLocaleDateString("sr-Latn-ME")}</span>
              </div>
              <div><StatusBadge status={nc.ozbiljnost} /></div>
              <div><StatusBadge status={nc.status} /></div>
              <div className="muted-text">{nc.prijavio ?? "—"}</div>
              <div />
            </div>
          ))}
          {lista.length === 0 && <p style={{ padding: 20, color: "#9aa5ae", fontSize: 12 }}>Nema neusaglašenosti.</p>}
        </div>
      </div>

      {otvoren && (
        <NcDetaljModal detalj={otvoren} mozeUpravljati={mozeUpravljati} onClose={() => setOtvoren(null)} onOsvjezi={() => otvoriDetalj(otvoren.id).then(ucitaj)} />
      )}
      {modalNova && <NovaNcModal onClose={() => setModalNova(false)} onCreated={ucitaj} />}
    </>
  );
}

function NcDetaljModal({ detalj, mozeUpravljati, onClose, onOsvjezi }: { detalj: NcDetalj; mozeUpravljati: boolean; onClose: () => void; onOsvjezi: () => void }) {
  const [opisMjere, setOpisMjere] = useState("");
  const [greska, setGreska] = useState("");

  const dodajMjeru = async () => {
    try {
      await api(`/neusaglasenosti/${detalj.id}/korektivna-mjera`, { telo: { opis: opisMjere } });
      setOpisMjere("");
      onOsvjezi();
    } catch (e) {
      setGreska(e instanceof ApiGreska ? e.message : "Mjera nije sačuvana.");
    }
  };

  const zavrsiMjeru = async (mjeraId: string) => {
    try {
      await api(`/korektivne-mjere/${mjeraId}/zavrsi`, { telo: {} });
      onOsvjezi();
    } catch (e) {
      setGreska(e instanceof ApiGreska ? e.message : "Mjera nije označena kao završena.");
    }
  };

  const verifikuj = async (rezultat: "POTVRDJENO" | "ODBIJENO") => {
    try {
      const mjeraId = detalj.korektivneMjere[detalj.korektivneMjere.length - 1]?.id;
      await api(`/neusaglasenosti/${detalj.id}/verifikacija`, { telo: { korektivnaMjeraId: mjeraId, rezultat } });
      onOsvjezi();
    } catch (e) {
      setGreska(e instanceof ApiGreska ? e.message : "Verifikacija nije sačuvana.");
    }
  };

  return (
    <Modal naslov={detalj.broj} podnaslov={detalj.status} onClose={onClose} greska={greska}>
      <div style={{ padding: 20 }}>
        <p style={{ fontSize: 12, color: "#556774", marginBottom: 16 }}>{detalj.opis}</p>

        <h3 style={{ fontSize: 12, marginBottom: 8 }}>Korektivne mjere</h3>
        {detalj.korektivneMjere.length === 0 && <p style={{ fontSize: 11, color: "#9aa5ae" }}>Još nema unijete mjere.</p>}
        {detalj.korektivneMjere.map((m) => (
          <div key={m.id} className="next-control" style={{ margin: "0 0 8px" }}>
            <div>
              <span>{m.status}</span>
              <strong style={{ fontSize: 11 }}>{m.opis}</strong>
            </div>
            {m.status !== "ZAVRSENA" && mozeUpravljati && (
              <button className="small-action" onClick={() => zavrsiMjeru(m.id)}>Označi završeno</button>
            )}
          </div>
        ))}

        {mozeUpravljati && detalj.status !== "ZATVORENA" && (
          <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
            <input placeholder="Opis nove korektivne mjere" value={opisMjere} onChange={(e) => setOpisMjere(e.target.value)} style={{ flex: 1, height: 35, border: "1px solid #dfe7ed", borderRadius: 6, padding: "0 9px" }} />
            <button className="secondary-button" onClick={dodajMjeru} disabled={!opisMjere.trim()}>Dodaj mjeru</button>
          </div>
        )}

        {mozeUpravljati && detalj.status === "CEKA_VERIFIKACIJU" && (
          <div style={{ display: "flex", gap: 8, marginTop: 16, borderTop: "1px solid #edf1f3", paddingTop: 16 }}>
            <button className="primary-button" onClick={() => verifikuj("POTVRDJENO")}>Verifikuj i zatvori</button>
            <button className="secondary-button" onClick={() => verifikuj("ODBIJENO")}>Odbij — ponovo otvori</button>
          </div>
        )}
      </div>
    </Modal>
  );
}

function NovaNcModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [opis, setOpis] = useState("");
  const [ozbiljnost, setOzbiljnost] = useState("SREDNJI");
  const [greska, setGreska] = useState("");

  const posalji = async () => {
    try {
      await api("/neusaglasenosti", { telo: { opis, ozbiljnost } });
      onCreated();
      onClose();
    } catch (e) {
      setGreska(e instanceof ApiGreska ? e.message : "Neusaglašenost nije sačuvana.");
    }
  };

  return (
    <Modal naslov="Prijavi neusaglašenost" onClose={onClose} greska={greska} footer={<><button className="secondary-button" onClick={onClose}>Otkaži</button><button className="primary-button" onClick={posalji} disabled={opis.trim().length < 3}>Prijavi</button></>}>
      <div className="form-grid">
        <label>
          Ozbiljnost
          <select value={ozbiljnost} onChange={(e) => setOzbiljnost(e.target.value)}>
            <option value="NIZAK">Niska</option>
            <option value="SREDNJI">Srednja</option>
            <option value="VISOK">Visoka</option>
          </select>
        </label>
        <label style={{ gridColumn: "1 / -1" }}>Opis<input value={opis} onChange={(e) => setOpis(e.target.value)} /></label>
      </div>
    </Modal>
  );
}
