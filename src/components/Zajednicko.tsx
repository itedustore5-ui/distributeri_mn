import type { ReactNode } from "react";
import { X, AlertCircle } from "lucide-react";

export function StatCard({ ikonica, boja, oznaka, vrijednost, detalj }: { ikonica: ReactNode; boja: string; oznaka: string; vrijednost: string | number; detalj?: string }) {
  return (
    <div className="stat-card">
      <div className={`stat-icon ${boja}`}>{ikonica}</div>
      <div className="stat-copy">
        <span>{oznaka}</span>
        <strong>{vrijednost}</strong>
        {detalj && <small>{detalj}</small>}
      </div>
    </div>
  );
}

export function Modal({ naslov, podnaslov, onClose, children, footer, greska }: { naslov: string; podnaslov?: string; onClose: () => void; children: ReactNode; footer?: ReactNode; greska?: string }) {
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div>
            {podnaslov && <span>{podnaslov}</span>}
            <h2>{naslov}</h2>
          </div>
          <button className="icon-button" onClick={onClose} aria-label="Zatvori">
            <X size={18} />
          </button>
        </div>
        {greska && (
          <div className="auth-error" style={{ margin: "16px 20px 0" }}>
            <AlertCircle size={14} /> {greska}
          </div>
        )}
        {children}
        {footer && <div className="modal-footer">{footer}</div>}
      </div>
    </div>
  );
}

export function PageHeader({ eyebrow, title, description, action }: { eyebrow?: string; title: string; description?: ReactNode; action?: ReactNode }) {
  return (
    <div className="page-header">
      <div>
        <div className="eyebrow">{eyebrow ?? "Operativni pregled"}</div>
        <h1>{title}</h1>
        {description && <p>{description}</p>}
      </div>
      {action}
    </div>
  );
}

const ZAKONSKE_OZNAKE = {
  "27": { prikaz: "čl. 27", opis: "Zakon o bezbjednosti hrane, čl. 27 — sledljivost: sistem za identifikaciju dobavljača i kupaca, označavanje serije." },
  "28": { prikaz: "čl. 28", opis: "Zakon o bezbjednosti hrane, čl. 28 — povlačenje nebezbjedne hrane i obavještavanje UBH." },
  "35": { prikaz: "čl. 35", opis: "Zakon o bezbjednosti hrane, čl. 35 — zahtjevi higijene hrane, propisuje ih Vlada (Uredba o higijeni hrane)." },
  "36": { prikaz: "čl. 36", opis: "Zakon o bezbjednosti hrane, čl. 36 — HACCP: uspostaviti, primjenjivati i kontinuirano održavati postupke." },
  "47": { prikaz: "čl. 47", opis: "Zakon o bezbjednosti hrane, čl. 47 — vodiči za dobru higijensku praksu i primjenu HACCP-a." },
  sanitarna: { prikaz: "čl. 31", opis: "Zakon o zaštiti stanovništva od zaraznih bolesti, čl. 31 — sanitarne knjižice lica koja rukuju hranom." },
} satisfies Record<string, { prikaz: string; opis: string }>;

/** Mala oznaka pored polja koja pokazuje na koji član zakona se taj podatak oslanja —
 * bez ovoga ostaje samo tvrdnja da je aplikacija "usklađena", bez dokaza gdje. */
export function ZakonskaOznaka({ clan }: { clan: keyof typeof ZAKONSKE_OZNAKE }) {
  const info = ZAKONSKE_OZNAKE[clan];
  return (
    <span className="zakon-oznaka" title={info.opis}>
      {info.prikaz}
    </span>
  );
}

/** Invarijanta #10: zapis unesen kasnije se smije, ali ne smije izgledati kao da je unesen istog dana. */
export function NaknadnoOznaka({ dana }: { dana: number | null | undefined }) {
  if (!dana || dana <= 0) return null;
  return (
    <span className="naknadno-oznaka" title={`Unijeto ${dana} ${dana === 1 ? "dan" : "dana"} poslije datuma na koji se zapis odnosi.`}>
      naknadno +{dana}
    </span>
  );
}

export function PrazanPrikaz({ poruka }: { poruka: string }) {
  return (
    <div className="empty-notices">
      <span>{poruka}</span>
    </div>
  );
}

export function Ucitavanje() {
  return <div className="auth-loading">Učitavanje...</div>;
}
