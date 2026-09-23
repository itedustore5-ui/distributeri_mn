import { useEffect, useState } from "react";
import { Plus, Check } from "lucide-react";
import { api, ApiGreska } from "../lib/api";
import { lokalniDatum } from "../lib/vrijeme";
import { PageHeader, Modal, ZakonskaOznaka } from "../components/Zajednicko";
import { StatusBadge } from "../components/StatusBadge";
import { useAuth, NAZIV_ULOGE, type Uloga } from "../lib/auth";

type Nc = {
  id: string;
  broj: string;
  ozbiljnost: string;
  status: string;
  opis: string;
  prijavio: string | null;
  prijavio_korisnik_id: string | null;
  izvor_oznaka: string | null;
  mjera_za_mene: boolean;
  mjera_kod: string | null;
  created_at: string;
};
type Mjera = {
  id: string;
  opis: string;
  status: string;
  dodijeljeno_korisnik_id: string | null;
  dodijeljeno: string | null;
  zavrsio: string | null;
  rok: string | null;
  rezultat: string | null;
  zavrseno_at: string | null;
};
type Verifikacija = { id: string; rezultat: string; napomena: string | null; verifikovao: string | null; verifikovano_at: string };
type NcDetalj = Nc & { zatvorio: string | null; zatvoreno_at: string | null; korektivneMjere: Mjera[]; verifikacije: Verifikacija[] };
type Izvrsilac = { id: string; ime: string; uloga: Uloga };

const KORACI = ["Prijavljeno", "Mjera određena", "Mjera urađena", "Provjereno i zatvoreno"];

/** Na kom je koraku neusaglašenost (0–3) — isti redoslijed kao KORACI. */
function korak(status: string) {
  if (status === "ZATVORENA") return 4;
  if (status === "CEKA_VERIFIKACIJU") return 3;
  if (status === "MJERA_U_TOKU") return 2;
  return 1; // OTVORENA, PONOVO_OTVORENA: čeka mjeru
}

const datum = (iso: string) => new Date(iso).toLocaleDateString("sr-Latn-ME");

export function Neusaglasenosti() {
  const { korisnik } = useAuth();
  const vodiSistem = korisnik?.uloga === "bzr" || korisnik?.uloga === "izvodjac";
  const FILTERI = vodiSistem
    ? [
        { kod: "aktivne", naziv: "Aktivne" },
        { kod: "provjera", naziv: "Čekaju moju provjeru" },
        { kod: "sve", naziv: "Sve" },
        { kod: "zatvorene", naziv: "Zatvorene" },
      ]
    : [
        { kod: "za-mene", naziv: "Za mene" },
        { kod: "aktivne", naziv: "Sve aktivne" },
        { kod: "zatvorene", naziv: "Zatvorene" },
      ];
  const [lista, setLista] = useState<Nc[]>([]);
  const [filter, setFilter] = useState(FILTERI[0].kod);
  const [otvoren, setOtvoren] = useState<NcDetalj | null>(null);
  const [modalNova, setModalNova] = useState(false);

  const ucitaj = () => api<Nc[]>("/neusaglasenosti").then(setLista);
  useEffect(() => {
    ucitaj();
  }, []);

  const otvoriDetalj = (id: string) => api<NcDetalj>(`/neusaglasenosti/${id}`).then(setOtvoren);

  const uslov = (nc: Nc, kod: string) =>
    kod === "za-mene"
      ? nc.status !== "ZATVORENA" && (nc.mjera_za_mene || nc.prijavio_korisnik_id === korisnik?.id)
      : kod === "aktivne"
        ? nc.status !== "ZATVORENA"
        : kod === "provjera"
          ? nc.status === "CEKA_VERIFIKACIJU"
          : kod === "zatvorene"
            ? nc.status === "ZATVORENA"
            : true;
  const prikazano = lista.filter((nc) => uslov(nc, filter));

  return (
    <>
      <PageHeader
        title="Neusaglašenosti"
        description={<>Odstupanje bez zapisane mjere je nalaz protiv firme, ne protiv zaposlenog <ZakonskaOznaka clan="36" />.</>}
        action={
          <button className="primary-button" onClick={() => setModalNova(true)}>
            <Plus size={16} /> Prijavi problem
          </button>
        }
      />

      <div className="nc-tok">
        {KORACI.map((k, i) => (
          <div key={k} className="nc-tok-korak">
            <span>{i + 1}</span>
            <div>
              <strong>{k}</strong>
              <small>
                {i === 0 && "Svako prijavi problem tamo gdje ga vidi"}
                {i === 1 && "Odgovorno lice upiše mjeru i kome je daje"}
                {i === 2 && "Taj radnik je uradi i upiše šta je urađeno"}
                {i === 3 && "Odgovorno lice provjeri i zatvori"}
              </small>
            </div>
          </div>
        ))}
      </div>

      <div className="filter-tabs" style={{ marginBottom: 16, flexWrap: "wrap" }}>
        {FILTERI.map((f) => (
          <button key={f.kod} className={filter === f.kod ? "selected" : ""} onClick={() => setFilter(f.kod)}>
            {f.naziv} <b>{lista.filter((nc) => uslov(nc, f.kod)).length}</b>
          </button>
        ))}
      </div>
      <div className="panel full-panel">
        <div className="nc-list">
          {prikazano.map((nc) => (
            <div key={nc.id} className={`nc-row${nc.mjera_za_mene ? " nc-za-mene" : ""}`} onClick={() => otvoriDetalj(nc.id)} style={{ cursor: "pointer" }}>
              <div className={`severity-bar ${nc.ozbiljnost === "VISOK" ? "danger" : "warning"}`} />
              <div className="nc-title">
                <strong>{nc.broj}{nc.mjera_za_mene && <span className="nc-oznaka-mjera">Mjera za vas</span>}</strong>
                <h3>{nc.opis}</h3>
                <span>
                  {datum(nc.created_at)} · {nc.izvor_oznaka ?? "Prijava"} · prijava: {nc.prijavio ?? "sistem"}
                  {nc.mjera_kod && ` · mjera kod: ${nc.mjera_kod}`}
                </span>
              </div>
              <div><StatusBadge status={nc.ozbiljnost} /></div>
              <div><StatusBadge status={nc.status} /></div>
              <div className="muted-text">Korak {Math.min(korak(nc.status) + 1, 4)}/4</div>
              <div />
            </div>
          ))}
          {prikazano.length === 0 && (
            <p style={{ padding: 20, color: "#9aa5ae", fontSize: 12 }}>
              {filter === "za-mene" ? "Nema ničega što čeka vas. Kad vam odgovorno lice dodijeli mjeru, stići će obavještenje." : "Nema neusaglašenosti u ovom prikazu."}
            </p>
          )}
        </div>
      </div>

      {otvoren && (
        <NcDetaljModal
          detalj={otvoren}
          vodiSistem={vodiSistem}
          mojId={korisnik?.id ?? ""}
          onClose={() => setOtvoren(null)}
          onOsvjezi={() => otvoriDetalj(otvoren.id).then(ucitaj)}
        />
      )}
      {modalNova && <NovaNcModal onClose={() => setModalNova(false)} onCreated={ucitaj} />}
    </>
  );
}

function NcDetaljModal({ detalj, vodiSistem, mojId, onClose, onOsvjezi }: { detalj: NcDetalj; vodiSistem: boolean; mojId: string; onClose: () => void; onOsvjezi: () => void }) {
  const [izvrsioci, setIzvrsioci] = useState<Izvrsilac[]>([]);
  const [opisMjere, setOpisMjere] = useState("");
  const [kome, setKome] = useState("");
  const [rok, setRok] = useState("");
  const [uradjeno, setUradjeno] = useState<Record<string, string>>({});
  const [napomena, setNapomena] = useState("");
  const [greska, setGreska] = useState("");

  useEffect(() => {
    if (vodiSistem) api<Izvrsilac[]>("/zadaci/izvrsioci").then(setIzvrsioci);
  }, [vodiSistem]);

  const radnja = async (fn: () => Promise<unknown>, poruka: string) => {
    setGreska("");
    try {
      await fn();
      onOsvjezi();
    } catch (e) {
      setGreska(e instanceof ApiGreska ? e.message : poruka);
    }
  };

  const k = korak(detalj.status);
  const otvorenaMjera = detalj.korektivneMjere.find((m) => m.status !== "ZAVRSENA");
  const sljedeci = (() => {
    if (detalj.status === "ZATVORENA") return `Zatvoreno ${detalj.zatvoreno_at ? datum(detalj.zatvoreno_at) : ""}${detalj.zatvorio ? ` — ${detalj.zatvorio}` : ""}.`;
    if (k === 1) return vodiSistem ? "Upišite korektivnu mjeru ispod i izaberite kome je dajete — ta osoba dobija obavještenje." : "Odgovorno lice određuje mjeru. Kad je dodijeli vama, stići će obavještenje.";
    if (k === 2) {
      if (otvorenaMjera?.dodijeljeno_korisnik_id === mojId) return "Mjera je dodijeljena vama: uradite je, upišite ispod šta je urađeno i označite „Urađeno“.";
      return `Čeka da ${otvorenaMjera?.dodijeljeno ?? "odgovorno lice"} uradi mjeru${otvorenaMjera?.rok ? ` (rok ${datum(otvorenaMjera.rok)})` : ""}.`;
    }
    return vodiSistem ? "Mjera je urađena — provjerite na licu mjesta i zatvorite. Ne može provjeriti ista osoba koja je uradila mjeru." : "Mjera je urađena — čeka provjeru odgovornog lica.";
  })();

  return (
    <Modal naslov={detalj.broj} podnaslov={detalj.izvor_oznaka ?? "Prijava"} onClose={onClose} greska={greska}>
      <div style={{ padding: 20 }}>
        <div className="nc-koraci">
          {KORACI.map((naziv, i) => (
            <div key={naziv} className={`nc-korak${i < k ? " uradjen" : i === k ? " trenutni" : ""}`}>
              <span>{i < k ? <Check size={11} /> : i + 1}</span>
              <small>{naziv}</small>
            </div>
          ))}
        </div>
        <div className="nc-sljedeci">{sljedeci}</div>

        <p style={{ fontSize: 12, color: "#394a57", margin: "14px 0 4px" }}>{detalj.opis}</p>
        <p className="muted-text" style={{ fontSize: 10, marginBottom: 16 }}>
          Prijava: {detalj.prijavio ?? "sistem"} · {datum(detalj.created_at)} · <StatusBadge status={detalj.ozbiljnost} />
        </p>

        <h3 style={{ fontSize: 12, marginBottom: 8 }}>Korektivne mjere <ZakonskaOznaka clan="36" /></h3>
        {detalj.korektivneMjere.length === 0 && <p style={{ fontSize: 11, color: "#9aa5ae" }}>Još nema unijete mjere.</p>}
        {detalj.korektivneMjere.map((m) => {
          const mojaIliVodim = m.dodijeljeno_korisnik_id === mojId || vodiSistem;
          return (
            <div key={m.id} className="nc-mjera">
              <div className="nc-mjera-glava">
                <strong>{m.opis}</strong>
                <StatusBadge status={m.status === "ZAVRSENA" ? "ZATVORENA" : "MJERA_U_TOKU"} tekst={m.status === "ZAVRSENA" ? "Urađeno" : "U toku"} />
              </div>
              <small className="muted-text">
                Kome: {m.dodijeljeno ?? "nije dodijeljena"}{m.rok ? ` · rok ${datum(m.rok)}` : ""}
              </small>
              {m.status === "ZAVRSENA" ? (
                <p className="nc-uradjeno">
                  Urađeno: {m.rezultat ?? "—"} <span className="muted-text">— {m.zavrsio ?? ""}{m.zavrseno_at ? `, ${datum(m.zavrseno_at)}` : ""}</span>
                </p>
              ) : (
                mojaIliVodim && (
                  <div className="nc-uradi">
                    <textarea
                      rows={2}
                      placeholder="Šta je urađeno (npr. komora očišćena i dezinfikovana, termometar zamijenjen)"
                      value={uradjeno[m.id] ?? ""}
                      onChange={(e) => setUradjeno((u) => ({ ...u, [m.id]: e.target.value }))}
                    />
                    <button
                      className="primary-button"
                      disabled={(uradjeno[m.id] ?? "").trim().length < 3}
                      onClick={() => radnja(() => api(`/korektivne-mjere/${m.id}/zavrsi`, { telo: { rezultat: uradjeno[m.id] } }), "Mjera nije označena kao urađena.")}
                    >
                      <Check size={14} /> Urađeno
                    </button>
                  </div>
                )
              )}
            </div>
          );
        })}

        {vodiSistem && detalj.status !== "ZATVORENA" && !otvorenaMjera && (
          <div className="form-grid nc-nova-mjera">
            <label style={{ gridColumn: "1 / -1" }}>
              Nova korektivna mjera
              <input placeholder="Šta treba uraditi" value={opisMjere} onChange={(e) => setOpisMjere(e.target.value)} />
            </label>
            <label>
              Kome
              <select value={kome} onChange={(e) => setKome(e.target.value)}>
                <option value="">— bez dodjele (radi odgovorno lice) —</option>
                {izvrsioci.map((i) => <option key={i.id} value={i.id}>{i.ime} · {NAZIV_ULOGE[i.uloga]}</option>)}
              </select>
            </label>
            <label>Rok<input type="date" min={lokalniDatum()} value={rok} onChange={(e) => setRok(e.target.value)} /></label>
            <button
              className="secondary-button"
              style={{ gridColumn: "1 / -1" }}
              disabled={opisMjere.trim().length < 3}
              onClick={() =>
                radnja(async () => {
                  await api(`/neusaglasenosti/${detalj.id}/korektivna-mjera`, { telo: { opis: opisMjere, dodijeljenoKorisnikId: kome || undefined, rok: rok || undefined } });
                  setOpisMjere("");
                  setKome("");
                  setRok("");
                }, "Mjera nije sačuvana.")
              }
            >
              Dodaj mjeru
            </button>
          </div>
        )}

        {vodiSistem && detalj.status === "CEKA_VERIFIKACIJU" && (
          <div className="nc-provjera">
            <input placeholder="Napomena o provjeri (šta ste pogledali)" value={napomena} onChange={(e) => setNapomena(e.target.value)} />
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button
                className="primary-button"
                onClick={() => radnja(() => api(`/neusaglasenosti/${detalj.id}/verifikacija`, { telo: { korektivnaMjeraId: detalj.korektivneMjere[detalj.korektivneMjere.length - 1]?.id, rezultat: "POTVRDJENO", napomena: napomena || undefined } }), "Provjera nije sačuvana.")}
              >
                Provjereno — zatvori
              </button>
              <button
                className="secondary-button"
                onClick={() => radnja(() => api(`/neusaglasenosti/${detalj.id}/verifikacija`, { telo: { korektivnaMjeraId: detalj.korektivneMjere[detalj.korektivneMjere.length - 1]?.id, rezultat: "ODBIJENO", napomena: napomena || undefined } }), "Provjera nije sačuvana.")}
              >
                Nije riješeno — vrati
              </button>
            </div>
          </div>
        )}

        {detalj.verifikacije.length > 0 && (
          <div style={{ marginTop: 16 }}>
            <h3 style={{ fontSize: 12, marginBottom: 6 }}>Provjere</h3>
            {detalj.verifikacije.map((v) => (
              <p key={v.id} style={{ fontSize: 11, margin: "0 0 4px" }}>
                {v.rezultat === "POTVRDJENO" ? "✓ Potvrđeno" : "✗ Vraćeno"} — {v.verifikovao ?? ""}, {datum(v.verifikovano_at)}
                {v.napomena ? `: ${v.napomena}` : ""}
              </p>
            ))}
          </div>
        )}
      </div>
    </Modal>
  );
}

function NovaNcModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [opis, setOpis] = useState("");
  const [ozbiljnost, setOzbiljnost] = useState("SREDNJI");
  const [greska, setGreska] = useState("");

  const posalji = async () => {
    try {
      await api("/neusaglasenosti", { telo: { opis, ozbiljnost } });
      onCreated();
      onClose();
    } catch (e) {
      setGreska(e instanceof ApiGreska ? e.message : "Neusaglašenost nije sačuvana.");
    }
  };

  return (
    <Modal
      naslov="Prijavi problem"
      podnaslov="Odgovorno lice dobija obavještenje i određuje mjeru"
      onClose={onClose}
      greska={greska}
      footer={<><button className="secondary-button" onClick={onClose}>Otkaži</button><button className="primary-button" onClick={posalji} disabled={opis.trim().length < 3}>Prijavi</button></>}
    >
      <div className="form-grid">
        <label style={{ gridColumn: "1 / -1" }}>
          Šta se desilo
          <textarea rows={3} value={opis} onChange={(e) => setOpis(e.target.value)} placeholder="npr. rashladna komora 2 pokazuje 9 °C, vrata ne dihtuju" />
        </label>
        <label>
          Koliko je ozbiljno
          <select value={ozbiljnost} onChange={(e) => setOzbiljnost(e.target.value)}>
            <option value="NIZAK">Nisko — može da sačeka</option>
            <option value="SREDNJI">Srednje — riješiti danas</option>
            <option value="VISOK">Visoko — roba ili ljudi u riziku</option>
          </select>
        </label>
      </div>
    </Modal>
  );
}
