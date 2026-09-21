import { useEffect, useState, type ReactNode } from "react";
import { Printer, FileText } from "lucide-react";
import { api } from "../lib/api";
import { PageHeader, ZakonskaOznaka } from "../components/Zajednicko";

type Firma = { naziv: string; adresa: string | null; grad: string | null; pib: string | null; odgovorno_lice_ime: string | null };
type PlanStavka = { lice_ime: string; radno_mjesto: string | null; tema: string; planirani_datum: string; stanje: string };
type Evidencija = { ime: string; radno_mjesto: string | null; posljednja_provjera_at: string | null; posljednji_broj_tacnih: number | null; posljednji_broj_pitanja: number | null };

type Prilog = "resenje" | "prilog13" | "prilog14";

const OPISI: Record<Prilog, ReactNode> = {
  resenje: "Rješenje o imenovanju nije zakonski obrazac — to je pisani trag ko sprovodi postupke i ko javlja UBH.",
  prilog13: "Plan sa stanjem (planirano/uskoro/kasni/urađeno) — stavka koja je prošla bez obuke se ne briše, ostaje kao „kasni\".",
  prilog14: (
    <>
      Dokaz da HACCP sistem stvarno radi <ZakonskaOznaka clan="36" /> — nije sertifikat o položenom
      testu (banka pitanja nije statistički validirana), nego evidencija da se provjera redovno
      sprovodi. Termini se otvaraju na „Ljudi" → „Provjera znanja".
    </>
  ),
};

export function Prilozi() {
  const [firma, setFirma] = useState<Firma | null>(null);
  const [plan, setPlan] = useState<PlanStavka[]>([]);
  const [evidencija, setEvidencija] = useState<Evidencija[]>([]);
  const [prilog, setPrilog] = useState<Prilog>("resenje");

  useEffect(() => {
    api<Firma>("/firma").then(setFirma);
    api<PlanStavka[]>("/plan-obuke").then(setPlan);
    api<Evidencija[]>("/evidencija-osposobljavanja").then(setEvidencija);
  }, []);

  return (
    <>
      <div className="no-print">
        <PageHeader title="Prilozi" description={OPISI[prilog]} />
        <div className="filter-tabs" style={{ marginBottom: 20 }}>
          <button className={prilog === "resenje" ? "selected" : ""} onClick={() => setPrilog("resenje")}>Rješenje o imenovanju</button>
          <button className={prilog === "prilog13" ? "selected" : ""} onClick={() => setPrilog("prilog13")}>Prilog 13 — Plan obuke</button>
          <button className={prilog === "prilog14" ? "selected" : ""} onClick={() => setPrilog("prilog14")}>Prilog 14 — Evidencija</button>
        </div>
        <button className="primary-button" onClick={() => window.print()} style={{ marginBottom: 20 }}>
          <Printer size={16} /> Štampaj
        </button>
      </div>

      <div className="panel" style={{ padding: 40, maxWidth: 720, margin: "0 auto" }}>
        {prilog === "resenje" && <ResenjeOImenovanju firma={firma} />}
        {prilog === "prilog13" && <Prilog13 plan={plan} firma={firma} />}
        {prilog === "prilog14" && <Prilog14 evidencija={evidencija} firma={firma} />}
      </div>
    </>
  );
}

function Zaglavlje({ firma, naslov }: { firma: Firma | null; naslov: string }) {
  return (
    <div style={{ textAlign: "center", marginBottom: 30 }}>
      <FileText size={22} style={{ marginBottom: 8 }} />
      <h1 style={{ fontSize: 18 }}>{firma?.naziv ?? "Firma"}</h1>
      <p style={{ fontSize: 11, color: "#8996a0" }}>{firma?.adresa}{firma?.adresa && firma?.grad ? ", " : ""}{firma?.grad}{firma?.pib ? ` · PIB ${firma.pib}` : ""}</p>
      <h2 style={{ marginTop: 20, fontSize: 15 }}>{naslov}</h2>
    </div>
  );
}

function ResenjeOImenovanju({ firma }: { firma: Firma | null }) {
  return (
    <div>
      <Zaglavlje firma={firma} naslov="Rješenje o imenovanju odgovornog lica za bezbjednost hrane" />
      <p style={{ fontSize: 12, lineHeight: 1.8 }}>
        Na osnovu obaveza koje za privredno društvo proizilaze iz Zakona o bezbjednosti hrane
        ("Sl. list CG", br. 59/2026), direktor društva <strong>{firma?.naziv ?? "___________________"}</strong> donosi
      </p>
      <h3 style={{ textAlign: "center", margin: "24px 0", fontSize: 13 }}>RJEŠENJE</h3>
      <ol style={{ fontSize: 12, lineHeight: 2 }}>
        <li>
          Za odgovorno lice za bezbjednost hrane imenuje se <strong>{firma?.odgovorno_lice_ime ?? "___________________"}</strong>.
        </li>
        <li>Odgovorno lice sprovodi postupke sledljivosti (čl. 27), povlačenja nebezbjedne hrane i obavještavanja nadležnog organa (čl. 28), i uspostavljanja, primjene i kontinuiranog održavanja HACCP postupaka (čl. 36) Zakona o bezbjednosti hrane.</li>
        <li>Ovo rješenje stupa na snagu danom donošenja.</li>
      </ol>
      <div style={{ marginTop: 60, display: "flex", justifyContent: "space-between", fontSize: 12 }}>
        <div>Mjesto i datum: ______________________</div>
        <div>Direktor: ______________________</div>
      </div>
    </div>
  );
}

function Prilog13({ plan, firma }: { plan: PlanStavka[]; firma: Firma | null }) {
  return (
    <div>
      <Zaglavlje firma={firma} naslov="Prilog 13 — Godišnji plan obuke" />
      <table className="data-table">
        <thead>
          <tr>
            <th>Zaposleni</th>
            <th>Radno mjesto</th>
            <th>Tema</th>
            <th>Planirano</th>
            <th>Stanje</th>
          </tr>
        </thead>
        <tbody>
          {plan.map((p, i) => (
            <tr key={i}>
              <td>{p.lice_ime}</td>
              <td>{p.radno_mjesto ?? "—"}</td>
              <td>{p.tema}</td>
              <td>{p.planirani_datum}</td>
              <td>{p.stanje}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Prilog14({ evidencija, firma }: { evidencija: Evidencija[]; firma: Firma | null }) {
  return (
    <div>
      <Zaglavlje firma={firma} naslov="Prilog 14 — Evidencija osposobljavanja" />
      <table className="data-table">
        <thead>
          <tr>
            <th>Zaposleni</th>
            <th>Radno mjesto</th>
            <th>Posljednja provjera</th>
            <th>Rezultat</th>
          </tr>
        </thead>
        <tbody>
          {evidencija.map((e, i) => (
            <tr key={i}>
              <td>{e.ime}</td>
              <td>{e.radno_mjesto ?? "—"}</td>
              <td>{e.posljednja_provjera_at ? new Date(e.posljednja_provjera_at).toLocaleDateString("sr-Latn-ME") : "Nema podataka"}</td>
              <td>{e.posljednji_broj_tacnih !== null ? `${e.posljednji_broj_tacnih}/${e.posljednji_broj_pitanja}` : "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
