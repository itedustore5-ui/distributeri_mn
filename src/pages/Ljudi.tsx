import { useEffect, useState } from "react";
import { Plus, KeyRound } from "lucide-react";
import { api, ApiGreska } from "../lib/api";
import { PageHeader, Modal, ZakonskaOznaka } from "../components/Zajednicko";
import { StatusBadge } from "../components/StatusBadge";

type Lice = {
  id: string;
  ime: string;
  radno_mjesto: string | null;
  rukuje_hranom: boolean;
  sifra: string;
  sanitarna_knjizica_broj: string | null;
  sanitarna_knjizica_rok: string | null;
  knjizica_status: string | null;
  ima_nalog: boolean;
  aktivan: boolean;
};

type PlanStavka = {
  id: string;
  lice_ime: string;
  tema: string;
  planirani_datum: string;
  obavljeno_datum: string | null;
  stanje: string;
};

type Nalog = {
  id: string;
  korisnicko_ime: string;
  uloga: string;
  lozinka_stanje: string;
  aktivan: boolean;
  lice_ime: string | null;
};

const TABOVI = [
  { kod: "zaposleni", naziv: "Svi zaposleni" },
  { kod: "plan", naziv: "Godišnji plan obuke" },
  { kod: "nalozi", naziv: "Nalozi" },
] as const;

export function Ljudi() {
  const [tab, setTab] = useState<(typeof TABOVI)[number]["kod"]>("zaposleni");
  const [lica, setLica] = useState<Lice[]>([]);
  const [plan, setPlan] = useState<PlanStavka[]>([]);
  const [nalozi, setNalozi] = useState<Nalog[]>([]);
  const [modalNoviLice, setModalNoviLice] = useState(false);
  const [modalIzmjenaLice, setModalIzmjenaLice] = useState<Lice | null>(null);
  const [modalNoviNalog, setModalNoviNalog] = useState(false);
  const [modalPlan, setModalPlan] = useState(false);

  const ucitaj = () => {
    api<Lice[]>("/lica").then(setLica);
    api<PlanStavka[]>("/plan-obuke").then(setPlan);
    api<Nalog[]>("/nalozi").then(setNalozi);
  };

  useEffect(ucitaj, []);

  return (
    <>
      <PageHeader
        title="Ljudi"
        description="Jedan spisak svih zaposlenih — ko rukuje hranom, kome ističe sanitarna knjižica i ko ima nalog za prijavu."
        action={
          tab === "zaposleni" ? (
            <button className="primary-button" onClick={() => setModalNoviLice(true)}>
              <Plus size={16} /> Novo lice
            </button>
          ) : tab === "plan" ? (
            <button className="primary-button" onClick={() => setModalPlan(true)}>
              <Plus size={16} /> Nova stavka plana
            </button>
          ) : (
            <button className="primary-button" onClick={() => setModalNoviNalog(true)}>
              <Plus size={16} /> Novi nalog
            </button>
          )
        }
      />
      <div className="filter-tabs" style={{ marginBottom: 16 }}>
        {TABOVI.map((t) => (
          <button key={t.kod} className={tab === t.kod ? "selected" : ""} onClick={() => setTab(t.kod)}>
            {t.naziv}
          </button>
        ))}
      </div>

      {tab === "zaposleni" && (
        <div className="panel full-panel">
          <div className="data-table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Ime</th>
                  <th>Radno mjesto</th>
                  <th>Šifra</th>
                  <th>Rukuje hranom</th>
                  <th>Sanitarna knjižica <ZakonskaOznaka clan="sanitarna" /></th>
                  <th>Nalog</th>
                  <th>Status</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {lica.map((l) => (
                  <tr key={l.id} style={!l.aktivan ? { opacity: 0.55 } : undefined}>
                    <td>{l.ime}</td>
                    <td className="muted-text">{l.radno_mjesto ?? "—"}</td>
                    <td>
                      <code>{l.sifra}</code>
                    </td>
                    <td>{l.rukuje_hranom ? "Da" : "Ne"}</td>
                    <td>{l.knjizica_status ? <StatusBadge status={l.knjizica_status} /> : <span className="muted-text">—</span>}</td>
                    <td>{l.ima_nalog ? <StatusBadge status="VAZI" tekst="Ima nalog" /> : <span className="muted-text">Bez naloga</span>}</td>
                    <td>{l.aktivan ? <StatusBadge status="VAZI" tekst="Aktivan" /> : <StatusBadge status="ISTEKLA" tekst="Uklonjen" />}</td>
                    <td>
                      <div style={{ display: "flex", gap: 6 }}>
                        <button className="small-action" onClick={() => setModalIzmjenaLice(l)}>Izmijeni</button>
                        {l.aktivan ? (
                          <button className="small-action" onClick={() => { if (window.confirm(`Ukloniti ${l.ime} sa spiska zaposlenih?`)) api(`/lica/${l.id}`, { method: "PATCH", telo: { aktivan: false } }).then(ucitaj); }}>
                            Ukloni
                          </button>
                        ) : (
                          <button className="small-action" onClick={() => api(`/lica/${l.id}`, { method: "PATCH", telo: { aktivan: true } }).then(ucitaj)}>
                            Vrati
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === "plan" && (
        <div className="panel full-panel">
          <div className="data-table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Ime</th>
                  <th>Tema</th>
                  <th>Planirano</th>
                  <th>Stanje</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {plan.map((p) => (
                  <tr key={p.id}>
                    <td>{p.lice_ime}</td>
                    <td>{p.tema}</td>
                    <td className="muted-text">{p.planirani_datum}</td>
                    <td>
                      <StatusBadge status={p.stanje} />
                    </td>
                    <td>
                      {!p.obavljeno_datum && (
                        <button className="small-action" onClick={() => api(`/plan-obuke/${p.id}/uradjeno`, { method: "PATCH", telo: {} }).then(ucitaj)}>
                          Označi urađeno
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === "nalozi" && (
        <div className="panel full-panel">
          <div className="data-table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Korisničko ime</th>
                  <th>Lice</th>
                  <th>Uloga</th>
                  <th>Lozinka</th>
                  <th>Status</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {nalozi.map((n) => (
                  <tr key={n.id}>
                    <td>{n.korisnicko_ime}</td>
                    <td className="muted-text">{n.lice_ime ?? "—"}</td>
                    <td>{n.uloga}</td>
                    <td>
                      <StatusBadge status={n.lozinka_stanje === "privremena" ? "USKORO" : "VAZI"} tekst={n.lozinka_stanje} />
                    </td>
                    <td>{n.aktivan ? <StatusBadge status="VAZI" tekst="Aktivan" /> : <StatusBadge status="ISTEKLA" tekst="Deaktiviran" />}</td>
                    <td>
                      {n.aktivan && (
                        <button className="small-action" onClick={() => api(`/nalozi/${n.id}/deaktiviraj`, { method: "PATCH", telo: {} }).then(ucitaj)}>
                          Deaktiviraj
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {modalNoviLice && <NoviLiceModal onClose={() => setModalNoviLice(false)} onCreated={ucitaj} />}
      {modalIzmjenaLice && <IzmjenaLiceModal lice={modalIzmjenaLice} onClose={() => setModalIzmjenaLice(null)} onSacuvano={ucitaj} />}
      {modalPlan && <NoviPlanModal lica={lica} onClose={() => setModalPlan(false)} onCreated={ucitaj} />}
      {modalNoviNalog && <NoviNalogModal lica={lica} onClose={() => setModalNoviNalog(false)} onCreated={ucitaj} />}
    </>
  );
}

function NoviLiceModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [ime, setIme] = useState("");
  const [radnoMjesto, setRadnoMjesto] = useState("");
  const [rukujeHranom, setRukujeHranom] = useState(true);
  const [knjizicaBroj, setKnjizicaBroj] = useState("");
  const [knjizicaRok, setKnjizicaRok] = useState("");
  const [greska, setGreska] = useState("");

  const posalji = async () => {
    try {
      await api("/lica", { telo: { ime, radnoMjesto, rukujeHranom, sanitarnaKnjizicaBroj: knjizicaBroj || undefined, sanitarnaKnjizicaRok: knjizicaRok || undefined } });
      onCreated();
      onClose();
    } catch (e) {
      setGreska(e instanceof ApiGreska ? e.message : "Lice nije sačuvano.");
    }
  };

  return (
    <Modal naslov="Novo lice" podnaslov="Spisak zaposlenih" onClose={onClose} greska={greska} footer={<><button className="secondary-button" onClick={onClose}>Otkaži</button><button className="primary-button" onClick={posalji} disabled={!ime}>Sačuvaj</button></>}>
      <div className="form-grid">
        <label>Ime i prezime<input value={ime} onChange={(e) => setIme(e.target.value)} /></label>
        <label>Radno mjesto<input value={radnoMjesto} onChange={(e) => setRadnoMjesto(e.target.value)} /></label>
        <label>
          Rukuje hranom
          <select value={rukujeHranom ? "da" : "ne"} onChange={(e) => setRukujeHranom(e.target.value === "da")}>
            <option value="da">Da</option>
            <option value="ne">Ne</option>
          </select>
        </label>
        <div />
        <label>Broj sanitarne knjižice <ZakonskaOznaka clan="sanitarna" /><input value={knjizicaBroj} onChange={(e) => setKnjizicaBroj(e.target.value)} /></label>
        <label>Rok sanitarne knjižice<input type="date" value={knjizicaRok} onChange={(e) => setKnjizicaRok(e.target.value)} /></label>
      </div>
    </Modal>
  );
}

function IzmjenaLiceModal({ lice, onClose, onSacuvano }: { lice: Lice; onClose: () => void; onSacuvano: () => void }) {
  const [ime, setIme] = useState(lice.ime);
  const [radnoMjesto, setRadnoMjesto] = useState(lice.radno_mjesto ?? "");
  const [rukujeHranom, setRukujeHranom] = useState(lice.rukuje_hranom);
  const [knjizicaBroj, setKnjizicaBroj] = useState(lice.sanitarna_knjizica_broj ?? "");
  const [knjizicaRok, setKnjizicaRok] = useState(lice.sanitarna_knjizica_rok ?? "");
  const [greska, setGreska] = useState("");

  const posalji = async () => {
    try {
      await api(`/lica/${lice.id}`, {
        method: "PATCH",
        telo: { ime, radnoMjesto, rukujeHranom, sanitarnaKnjizicaBroj: knjizicaBroj || undefined, sanitarnaKnjizicaRok: knjizicaRok || undefined },
      });
      onSacuvano();
      onClose();
    } catch (e) {
      setGreska(e instanceof ApiGreska ? e.message : "Izmjene nisu sačuvane.");
    }
  };

  return (
    <Modal naslov={`Izmjena — ${lice.ime}`} podnaslov={`Šifra ${lice.sifra}`} onClose={onClose} greska={greska} footer={<><button className="secondary-button" onClick={onClose}>Otkaži</button><button className="primary-button" onClick={posalji} disabled={!ime}>Sačuvaj</button></>}>
      <div className="form-grid">
        <label>Ime i prezime<input value={ime} onChange={(e) => setIme(e.target.value)} /></label>
        <label>Radno mjesto<input value={radnoMjesto} onChange={(e) => setRadnoMjesto(e.target.value)} /></label>
        <label>
          Rukuje hranom
          <select value={rukujeHranom ? "da" : "ne"} onChange={(e) => setRukujeHranom(e.target.value === "da")}>
            <option value="da">Da</option>
            <option value="ne">Ne</option>
          </select>
        </label>
        <div />
        <label>Broj sanitarne knjižice <ZakonskaOznaka clan="sanitarna" /><input value={knjizicaBroj} onChange={(e) => setKnjizicaBroj(e.target.value)} /></label>
        <label>Rok sanitarne knjižice<input type="date" value={knjizicaRok} onChange={(e) => setKnjizicaRok(e.target.value)} /></label>
      </div>
    </Modal>
  );
}

function NoviPlanModal({ lica, onClose, onCreated }: { lica: Lice[]; onClose: () => void; onCreated: () => void }) {
  const [liceId, setLiceId] = useState(lica[0]?.id ?? "");
  const [tema, setTema] = useState("");
  const [datum, setDatum] = useState("");
  const [greska, setGreska] = useState("");

  const posalji = async () => {
    try {
      await api("/plan-obuke", { telo: { liceId, tema, planiraniDatum: datum } });
      onCreated();
      onClose();
    } catch (e) {
      setGreska(e instanceof ApiGreska ? e.message : "Stavka plana nije sačuvana.");
    }
  };

  return (
    <Modal naslov="Nova stavka plana obuke" podnaslov="Prilog 13" onClose={onClose} greska={greska} footer={<><button className="secondary-button" onClick={onClose}>Otkaži</button><button className="primary-button" onClick={posalji} disabled={!liceId || !tema || !datum}>Sačuvaj</button></>}>
      <div className="form-grid">
        <label>
          Zaposleni
          <select value={liceId} onChange={(e) => setLiceId(e.target.value)}>
            {lica.map((l) => (
              <option key={l.id} value={l.id}>{l.ime}</option>
            ))}
          </select>
        </label>
        <label>Planirani datum<input type="date" value={datum} onChange={(e) => setDatum(e.target.value)} /></label>
        <label style={{ gridColumn: "1 / -1" }}>Tema<input value={tema} onChange={(e) => setTema(e.target.value)} /></label>
      </div>
    </Modal>
  );
}

function NoviNalogModal({ lica, onClose, onCreated }: { lica: Lice[]; onClose: () => void; onCreated: () => void }) {
  const [liceId, setLiceId] = useState("");
  const [korisnickoIme, setKorisnickoIme] = useState("");
  const [uloga, setUloga] = useState("operater");
  const [lozinka, setLozinka] = useState<string | null>(null);
  const [greska, setGreska] = useState("");

  const posalji = async () => {
    try {
      const rezultat = await api<{ privremenaLozinka: string }>("/nalozi", { telo: { liceId: liceId || undefined, korisnickoIme, uloga } });
      setLozinka(rezultat.privremenaLozinka);
      onCreated();
    } catch (e) {
      setGreska(e instanceof ApiGreska ? e.message : "Nalog nije kreiran.");
    }
  };

  if (lozinka) {
    return (
      <Modal naslov="Nalog je kreiran" podnaslov="Zapišite odmah — ovo se više neće prikazati" onClose={onClose} footer={<button className="primary-button" onClick={onClose}>Zatvori</button>}>
        <div className="form-grid" style={{ gridTemplateColumns: "1fr" }}>
          <div className="next-control">
            <div className="next-control-icon"><KeyRound size={16} /></div>
            <div>
              <span>Privremena lozinka</span>
              <strong style={{ fontSize: 15 }}>{lozinka}</strong>
            </div>
          </div>
        </div>
      </Modal>
    );
  }

  return (
    <Modal naslov="Novi nalog za prijavu" podnaslov="Otvara se samo ulozi operater ili vozač" onClose={onClose} greska={greska} footer={<><button className="secondary-button" onClick={onClose}>Otkaži</button><button className="primary-button" onClick={posalji} disabled={!korisnickoIme}>Kreiraj</button></>}>
      <div className="form-grid">
        <label>
          Poveži sa licem (opciono)
          <select value={liceId} onChange={(e) => setLiceId(e.target.value)}>
            <option value="">— bez veze —</option>
            {lica.map((l) => (
              <option key={l.id} value={l.id}>{l.ime}</option>
            ))}
          </select>
        </label>
        <label>
          Uloga
          <select value={uloga} onChange={(e) => setUloga(e.target.value)}>
            <option value="operater">Magacioner</option>
            <option value="vozac">Vozač</option>
          </select>
        </label>
        <label style={{ gridColumn: "1 / -1" }}>Korisničko ime<input value={korisnickoIme} onChange={(e) => setKorisnickoIme(e.target.value.toLowerCase())} /></label>
      </div>
    </Modal>
  );
}
