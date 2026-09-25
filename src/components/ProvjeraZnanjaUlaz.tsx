import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { GraduationCap, CheckCircle2 } from "lucide-react";
import { api } from "../lib/api";

type MojTermin = { otvoren: boolean; naziv: string | null; sifra: string | null; zavrseno: boolean };

/** Ulaz u provjeru znanja na početnoj strani prijavljenog (Moja strana, Kontrolni centar) — samo
 * dok je termin otvoren i samo za onoga ko ima šifru. Strana za prijavu ga namjerno nema. */
export function ProvjeraZnanjaUlaz() {
  const navigate = useNavigate();
  const [termin, setTermin] = useState<MojTermin | null>(null);

  useEffect(() => {
    api<MojTermin>("/provjera-znanja/moj-termin").then(setTermin).catch(() => undefined);
  }, []);

  if (!termin?.otvoren || !termin.sifra) return null;

  if (termin.zavrseno) {
    return (
      <div className="panel" style={{ minHeight: "auto", marginBottom: 16 }}>
        <div style={{ padding: "12px 16px", display: "flex", gap: 10, alignItems: "center", fontSize: 12 }}>
          <CheckCircle2 size={16} color="#20a477" />
          <span>Provjeru znanja „{termin.naziv}“ ste završili.</span>
        </div>
      </div>
    );
  }

  return (
    <div className="panel" style={{ minHeight: "auto", marginBottom: 16, borderColor: "#9cc3e4" }}>
      <div style={{ padding: "14px 16px", display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
        <GraduationCap size={20} color="#2f6fa8" />
        <div style={{ flex: 1, minWidth: 200 }}>
          <strong style={{ fontSize: 13 }}>Otvorena je provjera znanja „{termin.naziv}“</strong>
          <div className="muted-text" style={{ fontSize: 11, marginTop: 2 }}>
            Radite je svojim nalogom (šifra <code>{termin.sifra}</code>).
          </div>
        </div>
        <button className="primary-button" onClick={() => navigate("/provjera-znanja")}>
          Uđi u provjeru znanja
        </button>
      </div>
    </div>
  );
}
