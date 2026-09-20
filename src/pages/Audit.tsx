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

export function Audit() {
  const [lista, setLista] = useState<AuditRed[]>([]);

  useEffect(() => {
    api<AuditRed[]>("/audit").then(setLista);
  }, []);

  return (
    <>
      <PageHeader title="Audit trag" description="Imutabilan zapis — ne može se mijenjati niti brisati kroz aplikaciju." />
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
                  <td className="muted-text">{a.nove_vrijednosti ? JSON.stringify(a.nove_vrijednosti) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
