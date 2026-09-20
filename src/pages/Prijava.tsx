import { useState, type FormEvent } from "react";
import { LockKeyhole, ShieldCheck, AlertCircle } from "lucide-react";
import { useAuth } from "../lib/auth";
import { ApiGreska } from "../lib/api";

export function Prijava() {
  const { prijavi } = useAuth();
  const [korisnickoIme, setKorisnickoIme] = useState("");
  const [lozinka, setLozinka] = useState("");
  const [greska, setGreska] = useState("");
  const [saljem, setSaljem] = useState(false);

  const posalji = async (event: FormEvent) => {
    event.preventDefault();
    setSaljem(true);
    setGreska("");
    try {
      await prijavi(korisnickoIme.trim(), lozinka);
    } catch (e) {
      setGreska(e instanceof ApiGreska ? e.message : "Prijava nije uspjela.");
    } finally {
      setSaljem(false);
    }
  };

  return (
    <div className="auth-shell" style={{ gridTemplateColumns: "minmax(0, 520px)" }}>
      <div className="auth-card">
        <div className="auth-brand">
          <div className="brand-mark">
            <span>P</span>
          </div>
          <div className="brand-copy">
            <strong>PILOT</strong>
            <span>DISTRIBUTERI CG</span>
          </div>
        </div>
        <div className="auth-heading">
          <div className="auth-lock">
            <LockKeyhole size={19} />
          </div>
          <div>
            <div className="eyebrow">Prijava</div>
            <h1>Dobra higijenska praksa i HACCP</h1>
            <p>Prijavite se korisničkim imenom i lozinkom koje ste dobili od odgovornog lica.</p>
          </div>
        </div>
        <form className="auth-form" onSubmit={posalji}>
          {greska && (
            <div className="auth-error">
              <AlertCircle size={14} /> {greska}
            </div>
          )}
          <label>
            Korisničko ime
            <input value={korisnickoIme} onChange={(e) => setKorisnickoIme(e.target.value)} autoFocus autoComplete="username" />
          </label>
          <label>
            Lozinka
            <input type="password" value={lozinka} onChange={(e) => setLozinka(e.target.value)} autoComplete="current-password" />
          </label>
          <button className="primary-button auth-submit" type="submit" disabled={saljem}>
            {saljem ? "Prijavljivanje..." : "Prijavi se"}
          </button>
        </form>
        <div className="auth-security-note">
          <ShieldCheck size={14} />
          <span>Podaci se prenose šifrovano. Lozinka se čuva samo kao heš — niko, ni konsultant, ne može da je pročita.</span>
        </div>
      </div>
    </div>
  );
}
