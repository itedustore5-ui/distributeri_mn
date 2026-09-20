import { Fragment, useEffect, useState } from "react";
import { Plus, ChevronDown, ChevronUp } from "lucide-react";
import { api, ApiGreska } from "../lib/api";
import { lokalniDatum } from "../lib/vrijeme";
import { PageHeader, Modal } from "../components/Zajednicko";
import { StatusBadge } from "../components/StatusBadge";
import { useAuth } from "../lib/auth";

type Dobavljac = { id: string; naziv: string };
type Artikal = { id: string; naziv: string; temp_kontrolisano: boolean };
type PrijemRed = { id: string; dobavljac_naziv: string; datum_prijema: string; broj_dokumenta: string | null; status: string; broj_stavki: number };
type Stavka = { id: string; lot_id: string; artikal_naziv: string; broj_lota: string; lot_status: string; primljena_kolicina: string; rok_trajanja: string | null; temperatura_prijema: string | null };

export function Prijem() {
  const { korisnik } = useAuth();
  const [lista, setLista] = useState<PrijemRed[]>([]);
  const [dobavljaci, setDobavljaci] = useState<Dobavljac[]>([]);
  const [artikli, setArtikli] = useState<Artikal[]>([]);
  const [modalNovi, setModalNovi] = useState(false);
  const [modalIzmjena, setModalIzmjena] = useState<{ prijemId: string; stavka: Stavka } | null>(null);
  const [otvoren, setOtvoren] = useState<string | null>(null);
  const [stavke, setStavke] = useState<Record<string, Stavka[]>>({});
  const [greska, setGreska] = useState("");

  const ucitaj = () => api<PrijemRed[]>("/prijem").then(setLista);
  useEffect(() => {
    ucitaj();
    api<Dobavljac[]>("/dobavljaci").then(setDobavljaci);
    api<Artikal[]>("/artikli").then(setArtikli);
  }, []);

  const prosiri = async (id: string) => {
    if (otvoren === id) {
      setOtvoren(null);
      return;
    }
    setOtvoren(id);
    if (!stavke[id]) {
      const detalj = await api<{ stavke: Stavka[] }>(`/prijem/${id}`);
      setStavke((s) => ({ ...s, [id]: detalj.stavke }));
    }
  };

  const donesiOdluku = async (prijemId: string, lotId: string, odluka: "PRIHVATI" | "HOLD" | "ODBIJI", kolicina: number) => {
    let napomena: string | undefined;
    if (odluka === "ODBIJI") {
      napomena = window.prompt("Razlog odbijanja (obavezno):") ?? undefined;
      if (!napomena) return;
    }
    try {
      await api(`/prijem/${prijemId}/lot/${lotId}/odluka`, { method: "PATCH", telo: { odluka, kolicina, napomena } });
      const detalj = await api<{ stavke: Stavka[] }>(`/prijem/${prijemId}`);
      setStavke((s) => ({ ...s, [prijemId]: detalj.stavke }));
      ucitaj();
    } catch (e) {
      setGreska(e instanceof ApiGreska ? e.message : "Odluka nije sačuvana.");
    }
  };

  const moguOdlucivati = korisnik?.uloga === "bzr" || korisnik?.uloga === "izvodjac";

  return (
    <>
      <PageHeader
        title="Prijem robe"
        description="Bez broja lota nema sledljivosti — svaka stavka mora imati lot."
        action={
          <button className="primary-button" onClick={() => setModalNovi(true)}>
            <Plus size={16} /> Novi prijem
          </button>
        }
      />
      {greska && <div className="auth-error" style={{ marginBottom: 16 }}>{greska}</div>}

      <div className="panel full-panel">
        <div className="data-table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th></th>
                <th>Dobavljač</th>
                <th>Datum</th>
                <th>Dokument</th>
                <th>Stavki</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {lista.map((p) => (
                <Fragment key={p.id}>
                  <tr style={{ cursor: "pointer" }} onClick={() => prosiri(p.id)}>
                    <td>{otvoren === p.id ? <ChevronUp size={14} /> : <ChevronDown size={14} />}</td>
                    <td>{p.dobavljac_naziv}</td>
                    <td className="muted-text">{p.datum_prijema}</td>
                    <td className="muted-text">{p.broj_dokumenta ?? "—"}</td>
                    <td>{p.broj_stavki}</td>
                    <td><StatusBadge status={p.status} /></td>
                  </tr>
                  {otvoren === p.id && (
                    <tr>
                      <td colSpan={6} style={{ background: "#fbfcfd", padding: 0 }}>
                        <table className="data-table" style={{ margin: "0 12px 12px" }}>
                          <thead>
                            <tr>
                              <th>Artikal</th>
                              <th>Lot</th>
                              <th>Rok</th>
                              <th>Količina</th>
                              <th>Status</th>
                              <th>Radnje</th>
                            </tr>
                          </thead>
                          <tbody>
                            {(stavke[p.id] ?? []).map((s) => (
                              <tr key={s.id}>
                                <td>{s.artikal_naziv}</td>
                                <td><code>{s.broj_lota}</code></td>
                                <td className="muted-text">{s.rok_trajanja ?? "—"}</td>
                                <td>{s.primljena_kolicina}</td>
                                <td><StatusBadge status={s.lot_status} /></td>
                                <td>
                                  {s.lot_status === "PRIMLJEN" ? (
                                    <div style={{ display: "flex", gap: 6 }}>
                                      <button className="small-action" onClick={() => setModalIzmjena({ prijemId: p.id, stavka: s })}>Izmijeni</button>
                                      {moguOdlucivati && (
                                        <>
                                          <button className="small-action" onClick={() => donesiOdluku(p.id, s.lot_id, "PRIHVATI", Number(s.primljena_kolicina))}>Prihvati</button>
                                          <button className="small-action" onClick={() => donesiOdluku(p.id, s.lot_id, "HOLD", Number(s.primljena_kolicina))}>Hold</button>
                                          <button className="small-action" onClick={() => donesiOdluku(p.id, s.lot_id, "ODBIJI", Number(s.primljena_kolicina))}>Odbij</button>
                                        </>
                                      )}
                                    </div>
                                  ) : (
                                    <span className="muted-text">Odlučeno</span>
                                  )}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {modalNovi && (
        <NoviPrijemModal
          dobavljaci={dobavljaci}
          artikli={artikli}
          onClose={() => setModalNovi(false)}
          onCreated={ucitaj}
        />
      )}
      {modalIzmjena && (
        <IzmjenaStavkeModal
          prijemId={modalIzmjena.prijemId}
          stavka={modalIzmjena.stavka}
          onClose={() => setModalIzmjena(null)}
          onSacuvano={async () => {
            const detalj = await api<{ stavke: Stavka[] }>(`/prijem/${modalIzmjena.prijemId}`);
            setStavke((s) => ({ ...s, [modalIzmjena.prijemId]: detalj.stavke }));
          }}
        />
      )}
    </>
  );
}

function IzmjenaStavkeModal({ prijemId, stavka, onClose, onSacuvano }: { prijemId: string; stavka: Stavka; onClose: () => void; onSacuvano: () => void }) {
  const [brojLota, setBrojLota] = useState(stavka.broj_lota);
  const [rokTrajanja, setRokTrajanja] = useState(stavka.rok_trajanja ?? "");
  const [primljenaKolicina, setPrimljenaKolicina] = useState(stavka.primljena_kolicina);
  const [temperaturaPrijema, setTemperaturaPrijema] = useState(stavka.temperatura_prijema ?? "");
  const [greska, setGreska] = useState("");

  const posalji = async () => {
    try {
      await api(`/prijem/${prijemId}/lot/${stavka.lot_id}`, {
        method: "PATCH",
        telo: {
          brojLota,
          rokTrajanja: rokTrajanja || undefined,
          primljenaKolicina: Number(primljenaKolicina),
          temperaturaPrijema: temperaturaPrijema ? Number(temperaturaPrijema) : undefined,
        },
      });
      await onSacuvano();
      onClose();
    } catch (e) {
      setGreska(e instanceof ApiGreska ? e.message : "Izmjene nisu sačuvane.");
    }
  };

  return (
    <Modal naslov={`Izmjena — ${stavka.artikal_naziv}`} podnaslov="Dok se ne donese odluka" onClose={onClose} greska={greska} footer={<><button className="secondary-button" onClick={onClose}>Otkaži</button><button className="primary-button" onClick={posalji} disabled={!brojLota.trim() || Number(primljenaKolicina) <= 0}>Sačuvaj</button></>}>
      <div className="form-grid">
        <label>Broj lota<input value={brojLota} onChange={(e) => setBrojLota(e.target.value)} /></label>
        <label>Rok trajanja<input type="date" value={rokTrajanja} onChange={(e) => setRokTrajanja(e.target.value)} /></label>
        <label>Količina<input type="number" value={primljenaKolicina} onChange={(e) => setPrimljenaKolicina(e.target.value)} /></label>
        <label>Temperatura pri prijemu (°C)<input type="number" step="0.1" value={temperaturaPrijema} onChange={(e) => setTemperaturaPrijema(e.target.value)} /></label>
      </div>
    </Modal>
  );
}

type NoviRed = { artikalId: string; brojLota: string; rokTrajanja: string; primljenaKolicina: string; temperaturaPrijema: string };

function NoviPrijemModal({ dobavljaci, artikli, onClose, onCreated }: { dobavljaci: Dobavljac[]; artikli: Artikal[]; onClose: () => void; onCreated: () => void }) {
  const [dobavljacId, setDobavljacId] = useState(dobavljaci[0]?.id ?? "");
  const [brojDokumenta, setBrojDokumenta] = useState("");
  const [datum, setDatum] = useState(lokalniDatum());
  const [redovi, setRedovi] = useState<NoviRed[]>([{ artikalId: artikli[0]?.id ?? "", brojLota: "", rokTrajanja: "", primljenaKolicina: "", temperaturaPrijema: "" }]);
  const [greska, setGreska] = useState("");

  const dodajRed = () => setRedovi((r) => [...r, { artikalId: artikli[0]?.id ?? "", brojLota: "", rokTrajanja: "", primljenaKolicina: "", temperaturaPrijema: "" }]);
  const azurirajRed = (i: number, izmjena: Partial<NoviRed>) => setRedovi((r) => r.map((red, idx) => (idx === i ? { ...red, ...izmjena } : red)));

  const posalji = async () => {
    try {
      await api("/prijem", {
        telo: {
          dobavljacId,
          brojDokumenta: brojDokumenta || undefined,
          datumPrijema: datum,
          stavke: redovi.map((r) => ({
            artikalId: r.artikalId,
            brojLota: r.brojLota,
            rokTrajanja: r.rokTrajanja || undefined,
            primljenaKolicina: Number(r.primljenaKolicina),
            temperaturaPrijema: r.temperaturaPrijema ? Number(r.temperaturaPrijema) : undefined,
          })),
        },
      });
      onCreated();
      onClose();
    } catch (e) {
      setGreska(e instanceof ApiGreska ? e.message : "Prijem nije sačuvan.");
    }
  };

  const validno = dobavljacId && datum && redovi.every((r) => r.artikalId && r.brojLota.trim() && Number(r.primljenaKolicina) > 0);

  return (
    <Modal naslov="Novi prijem robe" podnaslov="P1" onClose={onClose} greska={greska} footer={<><button className="secondary-button" onClick={onClose}>Otkaži</button><button className="primary-button" onClick={posalji} disabled={!validno}>Sačuvaj prijem</button></>}>
      <div className="form-grid">
        <label>
          Dobavljač
          <select value={dobavljacId} onChange={(e) => setDobavljacId(e.target.value)}>
            {dobavljaci.map((d) => <option key={d.id} value={d.id}>{d.naziv}</option>)}
          </select>
        </label>
        <label>Datum prijema<input type="date" value={datum} onChange={(e) => setDatum(e.target.value)} /></label>
        <label style={{ gridColumn: "1 / -1" }}>Broj dokumenta (otpremnica)<input value={brojDokumenta} onChange={(e) => setBrojDokumenta(e.target.value)} /></label>
      </div>
      <div style={{ padding: "0 20px" }}>
        {redovi.map((red, i) => (
          <div key={i} className="form-grid" style={{ padding: "10px 0", borderTop: "1px solid #edf1f3" }}>
            <label>
              Artikal
              <select value={red.artikalId} onChange={(e) => azurirajRed(i, { artikalId: e.target.value })}>
                {artikli.map((a) => <option key={a.id} value={a.id}>{a.naziv}</option>)}
              </select>
            </label>
            <label>Broj lota<input value={red.brojLota} onChange={(e) => azurirajRed(i, { brojLota: e.target.value })} placeholder="npr. MLJ-2609-A" /></label>
            <label>Rok trajanja<input type="date" value={red.rokTrajanja} onChange={(e) => azurirajRed(i, { rokTrajanja: e.target.value })} /></label>
            <label>Količina<input type="number" value={red.primljenaKolicina} onChange={(e) => azurirajRed(i, { primljenaKolicina: e.target.value })} /></label>
            <label>Temperatura pri prijemu (°C)<input type="number" step="0.1" value={red.temperaturaPrijema} onChange={(e) => azurirajRed(i, { temperaturaPrijema: e.target.value })} /></label>
          </div>
        ))}
        <button className="link-button" onClick={dodajRed} style={{ marginTop: 8 }}>
          <Plus size={14} /> Dodaj stavku
        </button>
      </div>
    </Modal>
  );
}
