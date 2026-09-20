import { useEffect, useState } from "react";
import { Download, AlertCircle } from "lucide-react";
import { api, preuzmiFajl, ApiGreska } from "../lib/api";
import { PageHeader } from "../components/Zajednicko";

type Izvor = { kod: string; naziv: string };

export function Izvjestaji() {
  const [izvori, setIzvori] = useState<Izvor[]>([]);
  const [greska, setGreska] = useState("");
  const [preuzimam, setPreuzimam] = useState<string | null>(null);

  useEffect(() => {
    api<Izvor[]>("/izvoz/izvori").then(setIzvori);
  }, []);

  const preuzmi = async (kod: string, naziv: string) => {
    setGreska("");
    setPreuzimam(kod);
    try {
      await preuzmiFajl(`/izvoz/${kod}.csv`, `${naziv}.csv`);
    } catch (e) {
      setGreska(e instanceof ApiGreska ? e.message : "Preuzimanje nije uspjelo.");
    } finally {
      setPreuzimam(null);
    }
  };

  const preuzmiSve = async () => {
    setGreska("");
    setPreuzimam("sve");
    try {
      const odgovor = await api<{ podaci: Record<string, unknown[]>; nedostaje: { naziv: string }[] }>("/izvoz/sve.json");
      const blob = new Blob([JSON.stringify(odgovor.podaci, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "izvoz-svih-podataka.json";
      a.click();
      URL.revokeObjectURL(url);
      if (odgovor.nedostaje.length > 0) {
        setGreska(`Izvezeno je sve osim: ${odgovor.nedostaje.map((n) => n.naziv).join(", ")}.`);
      }
    } catch (e) {
      setGreska(e instanceof ApiGreska ? e.message : "Izvoz nije uspio.");
    } finally {
      setPreuzimam(null);
    }
  };

  return (
    <>
      <PageHeader
        title="Izvještaji i izvoz"
        description="Izvoz podataka klijentu — CSV po tabeli ili sve odjednom u JSON-u."
        action={
          <button className="secondary-button" onClick={preuzmiSve} disabled={preuzimam === "sve"}>
            <Download size={16} /> Izvezi sve (JSON)
          </button>
        }
      />
      {greska && (
        <div className="auth-error" style={{ marginBottom: 16 }}>
          <AlertCircle size={14} /> {greska}
        </div>
      )}
      <div className="report-grid">
        {izvori.map((i) => (
          <button key={i.kod} className="report-card" onClick={() => preuzmi(i.kod, i.naziv)} disabled={preuzimam === i.kod}>
            <div className="report-icon blue">
              <Download size={17} />
            </div>
            <div>
              <h3>{i.naziv}</h3>
              <p>{preuzimam === i.kod ? "Preuzimanje..." : "Preuzmi kao CSV"}</p>
            </div>
          </button>
        ))}
      </div>
    </>
  );
}
