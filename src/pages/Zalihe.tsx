import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { lokalniDatum } from "../lib/vrijeme";
import { PageHeader } from "../components/Zajednicko";
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

  useEffect(() => {
    const upit = filter ? `?status=${filter}` : "";
    api<Lot[]>(`/lotovi${upit}`).then(setLotovi);
  }, [filter]);

  const danas = lokalniDatum();
  const uskoroDatum = new Date(Date.now() + 5 * 86400000).toLocaleDateString("sv-SE", { timeZone: "Europe/Podgorica" });
  const uskoroIsticu = (rok: string | null) => rok !== null && rok >= danas && rok <= uskoroDatum;

  return (
    <>
      <PageHeader title="Zalihe" description="Poređano po roku trajanja — prvo ističe, prvo izlazi (FEFO)." />
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
                <th>Lot</th>
                <th>Rok trajanja</th>
                <th>Dostupno</th>
                <th>Status</th>
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
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
