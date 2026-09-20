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

export function PageHeader({ eyebrow, title, description, action }: { eyebrow?: string; title: string; description?: string; action?: ReactNode }) {
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
