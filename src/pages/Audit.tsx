import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { PageHeader } from "../components/Zajednicko";

type AuditRed = {
  id: string;
  akcija: string;
  entitet_tip: string;
  entitet_id: string;
  korisnicko_ime: string | null;
  nove_vrijednosti: Record<string, unknown> | null;
  created_at: string;
};

function formatirajDetalje(vrijednosti: Record<string, unknown> | null): string {
  if (!vrijednosti) return "—";
  const parovi = Object.entries(vrijednosti).filter(([, v]) => v !== null && v !== undefined && v !== "");
  if (parovi.length === 0) return "—";
  return parovi.map(([kljuc, v]) => `${kljuc}: ${typeof v === "object" ? JSON.stringify(v) : String(v)}`).join(" · ");
}

export function Audit() {
  const [lista, setLista] = useState<AuditRed[]>([]);
  const [tipovi, setTipovi] = useState<string[]>([]);
  const [filter, setFilter] = useState("");

  useEffect(() => {
    api<AuditRed[]>("/audit").then((svi) => setTipovi(Array.from(new Set(svi.map((a) => a.entitet_tip))).sort()));
  }, []);

  useEffect(() => {
    api<AuditRed[]>(`/audit${filter ? `?entitetTip=${filter}` : ""}`).then(setLista);
  }, [filter]);

  return (
    <>
      <PageHeader
        title="Audit trag"
        description="Imutabilan zapis — ne može se mijenjati niti brisati kroz aplikaciju."
        action={
          <select value={filter} onChange={(e) => setFilter(e.target.value)} style={{ height: 38, borderRadius: 7, border: "1px solid #dfe6ec", padding: "0 10px", fontSize: 12 }}>
            <option value="">Svi entiteti</option>
            {tipovi.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        }
      />
      <div className="panel full-panel audit-table-shell">
        <div className="data-table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Vrijeme</th>
                <th>Korisnik</th>
                <th>Akcija</th>
                <th>Entitet</th>
                <th>Detalji</th>
              </tr>
            </thead>
            <tbody>
              {lista.map((a) => (
                <tr key={a.id}>
                  <td className="muted-text">{new Date(a.created_at).toLocaleString("sr-Latn-ME")}</td>
                  <td>{a.korisnicko_ime ?? "sistem"}</td>
                  <td>{a.akcija}</td>
                  <td><code>{a.entitet_tip}</code></td>
                  <td className="muted-text">{formatirajDetalje(a.nove_vrijednosti)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
