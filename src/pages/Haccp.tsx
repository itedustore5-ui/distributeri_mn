import { useEffect, useState } from "react";
import { Plus, Thermometer, ClipboardList } from "lucide-react";
import { api, ApiGreska } from "../lib/api";
import { lokalniDatum } from "../lib/vrijeme";
import { PageHeader, Modal } from "../components/Zajednicko";
import { StatusBadge } from "../components/StatusBadge";

type KontrolnaTacka = { id: string; sifra: string; naziv: string };
type Mjerenje = { id: string; kontrolna_tacka_naziv: string; broj_lota: string | null; vrijednost: string; izmjereno_at: string; rezultat: string; izmjerio: string | null };
type Lot = { id: string; artikal_naziv: string; broj_lota: string };
type ObrazacPolje = { kljuc: string; oznaka: string; tip: "text" | "number" | "checkbox" };
type Obrazac = { kod: string; naziv: string; uloge: string[]; polja: ObrazacPolje[] };
type Zapis = { id: string; obrazac_kod: string; datum: string; izvrsilac: string; odstupanje: boolean; korektivna_mjera: string | null; podaci: Record<string, unknown> };

export function Haccp() {
  const [tacke, setTacke] = useState<KontrolnaTacka[]>([]);
  const [mjerenja, setMjerenja] = useState<Mjerenje[]>([]);
  const [lotovi, setLotovi] = useState<Lot[]>([]);
  const [obrasci, setObrasci] = useState<Obrazac[]>([]);
  const [zapisi, setZapisi] = useState<Zapis[]>([]);
  const [modalMjerenje, setModalMjerenje] = useState(false);
  const [modalZapis, setModalZapis] = useState<Obrazac | null>(null);

  const ucitaj = () => {
    api<Mjerenje[]>("/mjerenja").then(setMjerenja);
    api<Zapis[]>("/zapisi").then(setZapisi);
  };

  useEffect(() => {
    api<KontrolnaTacka[]>("/kontrolne-tacke").then(setTacke);
    api<Lot[]>("/lotovi?status=PRIHVACEN").then(setLotovi);
    fetch("/obrasci-cg.json").then((r) => r.json()).then(setObrasci);
    ucitaj();
  }, []);

  return (
    <>
      <PageHeader
        title="HACCP / DHP"
        description="Limiti dolaze iz podešavanja artikla — ne kucaju se ovdje. Odstupanje bez zapisane mjere se ne snima."
        action={
          <button className="primary-button" onClick={() => setModalMjerenje(true)}>
            <Plus size={16} /> Novo mjerenje
          </button>
        }
      />

      <div className="section-heading">
        <div>
          <h2><Thermometer size={15} style={{ verticalAlign: "-2px", marginRight: 6 }} />Temperaturna mjerenja</h2>
        </div>
      </div>
      <div className="panel full-panel" style={{ marginBottom: 26 }}>
        <div className="data-table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Kontrolna tačka</th>
                <th>Lot</th>
                <th>Vrijednost</th>
                <th>Vrijeme</th>
                <th>Izmjerio</th>
                <th>Rezultat</th>
              </tr>
            </thead>
            <tbody>
              {mjerenja.map((m) => (
                <tr key={m.id}>
                  <td>{m.kontrolna_tacka_naziv}</td>
                  <td className="muted-text">{m.broj_lota ?? "—"}</td>
                  <td>{m.vrijednost}°C</td>
                  <td className="muted-text">{new Date(m.izmjereno_at).toLocaleString("sr-Latn-ME")}</td>
                  <td className="muted-text">{m.izmjerio ?? "—"}</td>
                  <td><StatusBadge status={m.rezultat} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="section-heading">
        <div>
          <h2><ClipboardList size={15} style={{ verticalAlign: "-2px", marginRight: 6 }} />Dnevni obrasci</h2>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          {obrasci.map((o) => (
            <button key={o.kod} className="small-action" onClick={() => setModalZapis(o)}>
              {o.kod} — {o.naziv}
            </button>
          ))}
        </div>
      </div>
      <div className="panel full-panel">
        <div className="data-table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Obrazac</th>
                <th>Datum</th>
                <th>Izvršilac</th>
                <th>Odstupanje</th>
                <th>Korektivna mjera</th>
              </tr>
            </thead>
            <tbody>
              {zapisi.map((z) => (
                <tr key={z.id}>
                  <td>{z.obrazac_kod}</td>
                  <td className="muted-text">{z.datum}</td>
                  <td>{z.izvrsilac}</td>
                  <td>{z.odstupanje ? <StatusBadge status="OTVORENA" tekst="Da" /> : <span className="muted-text">Ne</span>}</td>
                  <td className="muted-text">{z.korektivna_mjera ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {modalMjerenje && (
        <NovoMjerenjeModal tacke={tacke} lotovi={lotovi} onClose={() => setModalMjerenje(false)} onCreated={ucitaj} />
      )}
      {modalZapis && <NoviZapisModal obrazac={modalZapis} onClose={() => setModalZapis(null)} onCreated={ucitaj} />}
    </>
  );
}

function NovoMjerenjeModal({ tacke, lotovi, onClose, onCreated }: { tacke: KontrolnaTacka[]; lotovi: Lot[]; onClose: () => void; onCreated: () => void }) {
  const [kontrolnaTackaId, setKontrolnaTackaId] = useState(tacke[0]?.id ?? "");
  const [lotId, setLotId] = useState("");
  const [vrijednost, setVrijednost] = useState("");
  const [napomena, setNapomena] = useState("");
  const [rezultat, setRezultat] = useState<string | null>(null);
  const [greska, setGreska] = useState("");

  const posalji = async () => {
    try {
      const r = await api<{ rezultat: string }>("/mjerenja", { telo: { kontrolnaTackaId, lotId: lotId || undefined, vrijednost: Number(vrijednost), napomena: napomena || undefined } });
      setRezultat(r.rezultat);
      onCreated();
    } catch (e) {
      setGreska(e instanceof ApiGreska ? e.message : "Mjerenje nije sačuvano.");
    }
  };

  if (rezultat) {
    return (
      <Modal naslov="Mjerenje zabilježeno" onClose={onClose} footer={<button className="primary-button" onClick={onClose}>Zatvori</button>}>
        <div style={{ padding: 20 }}>
          <StatusBadge status={rezultat} />
          {rezultat === "FAIL" && <p style={{ marginTop: 10, fontSize: 12, color: "#c34e55" }}>Otvorena je neusaglašenost i zadatak za odgovorno lice. Ako je povezano sa lotom, lot je stavljen na HOLD.</p>}
        </div>
      </Modal>
    );
  }

  return (
    <Modal naslov="Novo temperaturno mjerenje" onClose={onClose} greska={greska} footer={<><button className="secondary-button" onClick={onClose}>Otkaži</button><button className="primary-button" onClick={posalji} disabled={!kontrolnaTackaId || !vrijednost}>Sačuvaj</button></>}>
      <div className="form-grid">
        <label>
          Kontrolna tačka
          <select value={kontrolnaTackaId} onChange={(e) => setKontrolnaTackaId(e.target.value)}>
            {tacke.map((t) => <option key={t.id} value={t.id}>{t.naziv}</option>)}
          </select>
        </label>
        <label>
          Lot (opciono)
          <select value={lotId} onChange={(e) => setLotId(e.target.value)}>
            <option value="">— nije vezano za lot —</option>
            {lotovi.map((l) => <option key={l.id} value={l.id}>{l.artikal_naziv} · {l.broj_lota}</option>)}
          </select>
        </label>
        <label>Vrijednost (°C)<input type="number" step="0.1" value={vrijednost} onChange={(e) => setVrijednost(e.target.value)} /></label>
        <label>Napomena<input value={napomena} onChange={(e) => setNapomena(e.target.value)} /></label>
      </div>
    </Modal>
  );
}

function NoviZapisModal({ obrazac, onClose, onCreated }: { obrazac: Obrazac; onClose: () => void; onCreated: () => void }) {
  const [datum, setDatum] = useState(lokalniDatum());
  const [podaci, setPodaci] = useState<Record<string, unknown>>({});
  const [odstupanje, setOdstupanje] = useState(false);
  const [korektivnaMjera, setKorektivnaMjera] = useState("");
  const [greska, setGreska] = useState("");

  const posalji = async () => {
    try {
      await api("/zapisi", { telo: { obrazacKod: obrazac.kod, datum, podaci, odstupanje, korektivnaMjera: korektivnaMjera || undefined } });
      onCreated();
      onClose();
    } catch (e) {
      setGreska(e instanceof ApiGreska ? e.message : "Zapis nije sačuvan.");
    }
  };

  return (
    <Modal naslov={`${obrazac.kod} — ${obrazac.naziv}`} onClose={onClose} greska={greska} footer={<><button className="secondary-button" onClick={onClose}>Otkaži</button><button className="primary-button" onClick={posalji} disabled={odstupanje && !korektivnaMjera.trim()}>Sačuvaj</button></>}>
      <div className="form-grid">
        <label>Datum<input type="date" value={datum} onChange={(e) => setDatum(e.target.value)} /></label>
        {obrazac.polja.map((polje) => (
          <label key={polje.kljuc}>
            {polje.oznaka}
            {polje.tip === "checkbox" ? (
              <select value={podaci[polje.kljuc] ? "da" : "ne"} onChange={(e) => setPodaci((p) => ({ ...p, [polje.kljuc]: e.target.value === "da" }))}>
                <option value="da">Da</option>
                <option value="ne">Ne</option>
              </select>
            ) : (
              <input value={(podaci[polje.kljuc] as string) ?? ""} onChange={(e) => setPodaci((p) => ({ ...p, [polje.kljuc]: e.target.value }))} />
            )}
          </label>
        ))}
      </div>
      <div className="form-grid" style={{ gridTemplateColumns: "1fr" }}>
        <label>
          <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <input type="checkbox" checked={odstupanje} onChange={(e) => setOdstupanje(e.target.checked)} style={{ width: "auto", height: "auto" }} /> Ima odstupanja
          </span>
        </label>
        {odstupanje && (
          <label>
            Korektivna mjera
            <input value={korektivnaMjera} onChange={(e) => setKorektivnaMjera(e.target.value)} placeholder="Odstupanje bez zapisane mjere je nalaz protiv firme." />
          </label>
        )}
      </div>
    </Modal>
  );
}
