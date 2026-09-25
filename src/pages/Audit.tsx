import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { PageHeader } from "../components/Zajednicko";

type AuditRed = {
  id: string;
  akcija: string;
  entitet_tip: string;
  entitet_id: string;
  korisnicko_ime: string | null;
  stare_vrijednosti: Record<string, unknown> | null;
  nove_vrijednosti: Record<string, unknown> | null;
  created_at: string;
};

const prikaz = (v: unknown) => (v === null || v === undefined || v === "" ? "∅" : typeof v === "object" ? JSON.stringify(v) : String(v));

/** Kod izmjene: „polje: bilo → sada" (R-06); inače samo nove vrijednosti. */
function formatirajDetalje(stare: Record<string, unknown> | null, nove: Record<string, unknown> | null): string {
  if (!nove && !stare) return "—";
  const kljucevi = Array.from(new Set([...Object.keys(stare ?? {}), ...Object.keys(nove ?? {})]));
  const parovi = kljucevi
    .map((k) => {
      const imaStaro = !!stare && k in stare;
      const novo = nove?.[k];
      if (imaStaro) return `${k}: ${prikaz(stare![k])} → ${prikaz(novo)}`;
      return novo === null || novo === undefined || novo === "" ? null : `${k}: ${prikaz(novo)}`;
    })
    .filter(Boolean);
  return parovi.length === 0 ? "—" : parovi.join(" · ");
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
                  <td className="muted-text">{formatirajDetalje(a.stare_vrijednosti, a.nove_vrijednosti)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
