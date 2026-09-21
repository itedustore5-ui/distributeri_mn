import { useEffect, useState } from "react";
import { api, ApiGreska } from "../lib/api";
import { lokalniDatum } from "../lib/vrijeme";
import { PageHeader, Modal, ZakonskaOznaka } from "../components/Zajednicko";
import { StatusBadge } from "../components/StatusBadge";

type Lot = {
  id: string;
  artikal_naziv: string;
  dobavljac_naziv: string;
  broj_lota: string;
  rok_trajanja: string | null;
  status: string;
  dostupno: string;
};

const FILTERI = [
  { kod: "", naziv: "Svi" },
  { kod: "PRIHVACEN", naziv: "Prihvaćeni" },
  { kod: "HOLD", naziv: "Na čekanju" },
  { kod: "ODBIJEN", naziv: "Odbijeni" },
  { kod: "PRIMLJEN", naziv: "Čekaju odluku" },
];

export function Zalihe() {
  const [lotovi, setLotovi] = useState<Lot[]>([]);
  const [filter, setFilter] = useState("");
  const [otpisLot, setOtpisLot] = useState<Lot | null>(null);

  const ucitaj = () => {
    const upit = filter ? `?status=${filter}` : "";
    api<Lot[]>(`/lotovi${upit}`).then(setLotovi);
  };

  useEffect(ucitaj, [filter]);

  const danas = lokalniDatum();
  const uskoroDatum = new Date(Date.now() + 5 * 86400000).toLocaleDateString("sv-SE", { timeZone: "Europe/Podgorica" });
  const uskoroIsticu = (rok: string | null) => rok !== null && rok >= danas && rok <= uskoroDatum;

  return (
    <>
      <PageHeader
        title="Zalihe"
        description={
          <>
            Poređano po roku trajanja — prvo ističe, prvo izlazi (FEFO). Količina se mijenja samo kroz
            prijem, isporuku ili otpis — nikad ručnim unosom <ZakonskaOznaka clan="27" />.
          </>
        }
      />
      <div className="filter-tabs" style={{ marginBottom: 16 }}>
        {FILTERI.map((f) => (
          <button key={f.kod} className={filter === f.kod ? "selected" : ""} onClick={() => setFilter(f.kod)}>
            {f.naziv}
          </button>
        ))}
      </div>
      <div className="panel full-panel">
        <div className="data-table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Artikal</th>
                <th>Dobavljač</th>
                <th>Lot <ZakonskaOznaka clan="27" /></th>
                <th>Rok trajanja</th>
                <th>Dostupno</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {lotovi.map((l) => (
                <tr key={l.id}>
                  <td>{l.artikal_naziv}</td>
                  <td className="muted-text">{l.dobavljac_naziv}</td>
                  <td><code>{l.broj_lota}</code></td>
                  <td className={uskoroIsticu(l.rok_trajanja) ? "expiry-near" : "muted-text"}>{l.rok_trajanja ?? "—"}</td>
                  <td>{l.dostupno}</td>
                  <td><StatusBadge status={l.status} /></td>
                  <td>
                    {Number(l.dostupno) > 0 && (
                      <button className="small-action" onClick={() => setOtpisLot(l)}>Otpiši</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {otpisLot && (
        <OtpisModal
          lot={otpisLot}
          onClose={() => setOtpisLot(null)}
          onSacuvano={() => {
            setOtpisLot(null);
            ucitaj();
          }}
        />
      )}
    </>
  );
}

function OtpisModal({ lot, onClose, onSacuvano }: { lot: Lot; onClose: () => void; onSacuvano: () => void }) {
  const [kolicina, setKolicina] = useState("");
  const [razlog, setRazlog] = useState("");
  const [greska, setGreska] = useState("");

  const posalji = async () => {
    try {
      await api(`/lotovi/${lot.id}/otpis`, { method: "POST", telo: { kolicina: Number(kolicina), razlog } });
      onSacuvano();
    } catch (e) {
      setGreska(e instanceof ApiGreska ? e.message : "Otpis nije sačuvan.");
    }
  };

  const validno = Number(kolicina) > 0 && Number(kolicina) <= Number(lot.dostupno) && razlog.trim().length >= 3;

  return (
    <Modal
      naslov={`Otpis — ${lot.broj_lota}`}
      podnaslov={`${lot.artikal_naziv} · dostupno ${lot.dostupno}`}
      onClose={onClose}
      greska={greska}
      footer={<><button className="secondary-button" onClick={onClose}>Otkaži</button><button className="primary-button" onClick={posalji} disabled={!validno}>Sačuvaj otpis</button></>}
    >
      <div className="form-grid" style={{ padding: 20 }}>
        <label>
          Količina za otpis
          <input type="number" step="0.001" max={lot.dostupno} value={kolicina} onChange={(e) => setKolicina(e.target.value)} />
        </label>
        <label style={{ gridColumn: "1 / -1" }}>
          Razlog <ZakonskaOznaka clan="27" />
          <input value={razlog} onChange={(e) => setRazlog(e.target.value)} placeholder="npr. oštećeno u transportu, isteklo, izgubljeno" />
        </label>
      </div>
    </Modal>
  );
}
