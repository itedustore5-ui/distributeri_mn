import { useEffect, useState } from "react";
import { Plus } from "lucide-react";
import { api, ApiGreska } from "../lib/api";
import { lokalniDatum } from "../lib/vrijeme";
import { PageHeader, Modal, ZakonskaOznaka, NaknadnoOznaka } from "../components/Zajednicko";
import { StatusBadge } from "../components/StatusBadge";
import { useAuth } from "../lib/auth";
import { useSkladista, type Skladiste } from "../lib/skladista";

type Kupac = { id: string; naziv: string; telefon: string };
type Vozilo = { id: string; registarski_broj: string; status: string };
type Vozac = { id: string; ime: string };
type LotDostupan = { lot_id: string; artikal_naziv: string; broj_lota: string; kolicina: string; skladiste_id: string | null };
type IsporukaRed = {
  id: string;
  broj: string;
  kupac_naziv: string;
  datum_isporuke: string;
  status: string;
  vozilo_id: string | null;
  registarski_broj: string | null;
  vozac_korisnik_id: string | null;
  skladiste_id: string | null;
  skladiste_naziv: string | null;
  naknadno_dana: number;
};
type StavkaIsporuke = {
  id: string;
  artikal_naziv: string;
  broj_lota: string;
  planirana_kolicina: string;
  isporucena_kolicina: string;
  temp_kontrolisano: boolean;
  temp_min: string | null;
  temp_max: string | null;
  granica_potvrdio: boolean;
};

function opisGranice(s: StavkaIsporuke) {
  if (s.temp_min !== null && s.temp_max !== null) return `${Number(s.temp_min)} do ${Number(s.temp_max)} °C`;
  if (s.temp_max !== null) return `najviše ${Number(s.temp_max)} °C`;
  if (s.temp_min !== null) return `najmanje ${Number(s.temp_min)} °C`;
  return null;
}

/** Samo za potvrđenu granicu (invarijanta #5) — nepotvrđena je pretpostavka, ne podatak klijenta. */
function vanGranice(s: StavkaIsporuke, unos: string) {
  if (!s.granica_potvrdio || unos.trim() === "") return false;
  const t = Number(unos);
  if (Number.isNaN(t)) return false;
  return (s.temp_min !== null && t < Number(s.temp_min)) || (s.temp_max !== null && t > Number(s.temp_max));
}

export function Isporuka() {
  const skladista = useSkladista();
  const [lista, setLista] = useState<IsporukaRed[]>([]);
  const [filterDatum, setFilterDatum] = useState("");
  const [filterVozilo, setFilterVozilo] = useState("");
  const [filterSkladiste, setFilterSkladiste] = useState("");
  const [kupci, setKupci] = useState<Kupac[]>([]);
  const [vozila, setVozila] = useState<Vozilo[]>([]);
  const [vozaci, setVozaci] = useState<Vozac[]>([]);
  const [zaliha, setZaliha] = useState<LotDostupan[]>([]);
  const [modalNova, setModalNova] = useState(false);
  const [modalIzmjena, setModalIzmjena] = useState<{ isporuka: IsporukaRed; stavke: StavkaIsporuke[] } | null>(null);
  const [modalPotvrda, setModalPotvrda] = useState<IsporukaRed | null>(null);
  const [stavke, setStavke] = useState<StavkaIsporuke[]>([]);

  const ucitaj = () => {
    api<IsporukaRed[]>("/isporuke").then(setLista);
    api<LotDostupan[]>("/zaliha").then(setZaliha);
  };
  useEffect(() => {
    ucitaj();
    api<Kupac[]>("/kupci").then(setKupci);
    api<Vozilo[]>("/vozila").then(setVozila);
    api<Vozac[]>("/vozaci").then(setVozaci);
  }, []);

  const imeVozaca = (id: string | null) => vozaci.find((v) => v.id === id)?.ime ?? "—";

  // Filteri su na listi koju je server već ograničio po ulozi (vozač: svoje isporuke, prozor od
  // jednog dana unazad + sve unaprijed) — ovdje se samo sužava prikaz.
  const prikazano = lista.filter(
    (i) =>
      (!filterDatum || i.datum_isporuke === filterDatum) &&
      (!filterVozilo || (filterVozilo === "bez" ? !i.vozilo_id : i.vozilo_id === filterVozilo)) &&
      (!filterSkladiste || i.skladiste_id === filterSkladiste),
  );
  const imaFiltera = filterDatum || filterVozilo || filterSkladiste;

  const otvoriPotvrdu = async (i: IsporukaRed) => {
    const detalj = await api<{ stavke: StavkaIsporuke[] }>(`/isporuke/${i.id}`);
    setStavke(detalj.stavke);
    setModalPotvrda(i);
  };

  const otvoriIzmjenu = async (i: IsporukaRed) => {
    const detalj = await api<{ stavke: StavkaIsporuke[] }>(`/isporuke/${i.id}`);
    setModalIzmjena({ isporuka: i, stavke: detalj.stavke });
  };

  return (
    <>
      <PageHeader
        title="Isporuka"
        description={<>Isporuka je vezana za konkretan lot — tako sledljivost ostaje do kupca <ZakonskaOznaka clan="27" />.</>}
        action={
          <button className="primary-button" onClick={() => setModalNova(true)}>
            <Plus size={16} /> Nova isporuka
          </button>
        }
      />
      <div className="filter-bar">
        <label>
          Datum
          <input type="date" value={filterDatum} onChange={(e) => setFilterDatum(e.target.value)} />
        </label>
        <button className={`small-action${filterDatum === lokalniDatum() ? " selected" : ""}`} onClick={() => setFilterDatum(lokalniDatum())}>Danas</button>
        <label>
          Vozilo
          <select value={filterVozilo} onChange={(e) => setFilterVozilo(e.target.value)}>
            <option value="">Sva vozila</option>
            {vozila.map((v) => <option key={v.id} value={v.id}>{v.registarski_broj}</option>)}
            <option value="bez">Bez vozila</option>
          </select>
        </label>
        {skladista.vise && (
          <label>
            Magacin
            <select value={filterSkladiste} onChange={(e) => setFilterSkladiste(e.target.value)}>
              <option value="">Svi magacini</option>
              {skladista.sva.map((sk) => <option key={sk.id} value={sk.id}>{sk.naziv}</option>)}
            </select>
          </label>
        )}
        {imaFiltera && (
          <button className="link-button" onClick={() => { setFilterDatum(""); setFilterVozilo(""); setFilterSkladiste(""); }}>
            Poništi filtere
          </button>
        )}
        <span className="filter-broj">{prikazano.length} od {lista.length}</span>
      </div>
      <div className="panel full-panel">
        <div className="data-table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Broj</th>
                <th>Kupac</th>
                {skladista.vise && <th>Magacin</th>}
                <th>Vozilo</th>
                <th>Vozač</th>
                <th>Datum</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {prikazano.length === 0 && (
                <tr><td colSpan={8} className="muted-text" style={{ padding: 20 }}>{imaFiltera ? "Nema isporuka za izabrane filtere." : "Nema isporuka."}</td></tr>
              )}
              {prikazano.map((i) => (
                <tr key={i.id}>
                  <td>{i.broj}</td>
                  <td>{i.kupac_naziv}</td>
                  {skladista.vise && <td className="muted-text">{i.skladiste_naziv ?? "—"}</td>}
                  <td className="muted-text">{i.registarski_broj ?? "—"}</td>
                  <td className="muted-text">{imeVozaca(i.vozac_korisnik_id)}</td>
                  <td className="muted-text">{i.datum_isporuke}<NaknadnoOznaka dana={i.naknadno_dana} /></td>
                  <td><StatusBadge status={i.status} /></td>
                  <td>
                    {i.status === "U_PRIPREMI" && (
                      <div style={{ display: "flex", gap: 6 }}>
                        <button className="small-action" onClick={() => otvoriIzmjenu(i)}>Izmijeni</button>
                        <button className="small-action" onClick={() => otvoriPotvrdu(i)}>Potvrdi</button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {modalNova && (
        <IsporukaFormaModal
          kupci={kupci}
          vozila={vozila}
          vozaci={vozaci}
          zaliha={zaliha}
          skladista={skladista.vise ? skladista.aktivna : []}
          podrazumijevanoSkladiste={skladista.podrazumijevano}
          onClose={() => setModalNova(false)}
          onSacuvano={ucitaj}
        />
      )}
      {modalIzmjena && (
        <IsporukaFormaModal
          postojeca={modalIzmjena.isporuka}
          postojeceStavke={modalIzmjena.stavke}
          kupci={kupci}
          vozila={vozila}
          vozaci={vozaci}
          zaliha={zaliha}
          skladista={skladista.vise ? skladista.aktivna : []}
          podrazumijevanoSkladiste={skladista.podrazumijevano}
          onClose={() => setModalIzmjena(null)}
          onSacuvano={ucitaj}
        />
      )}
      {modalPotvrda && (
        <PotvrdaModal isporuka={modalPotvrda} stavke={stavke} onClose={() => setModalPotvrda(null)} onCreated={ucitaj} />
      )}
    </>
  );
}

type NovaStavkaRed = { lotId: string; kolicina: string };

function IsporukaFormaModal({
  postojeca,
  postojeceStavke,
  kupci,
  vozila,
  vozaci,
  zaliha,
  skladista,
  podrazumijevanoSkladiste,
  onClose,
  onSacuvano,
}: {
  postojeca?: IsporukaRed;
  postojeceStavke?: StavkaIsporuke[];
  kupci: Kupac[];
  vozila: Vozilo[];
  vozaci: Vozac[];
  zaliha: LotDostupan[];
  /** Prazno kad firma ima jedno skladište — tada se polje ne prikazuje. */
  skladista: Skladiste[];
  podrazumijevanoSkladiste: string;
  onClose: () => void;
  onSacuvano: () => void;
}) {
  const { korisnik } = useAuth();
  const izmjena = !!postojeca;
  const [kupacId, setKupacId] = useState(kupci[0]?.id ?? "");
  // Podrazumijevano prvo SPREMNO vozilo — nespremno bi server ionako odbio.
  const [vozilId, setVozilId] = useState(
    postojeca ? (vozila.find((v) => v.registarski_broj === postojeca.registarski_broj)?.id ?? "") : (vozila.find((v) => v.status === "SPREMNO")?.id ?? ""),
  );
  const [vozacId, setVozacId] = useState(postojeca ? (postojeca.vozac_korisnik_id ?? "") : korisnik?.uloga === "vozac" ? korisnik.id : "");
  const [datum, setDatum] = useState(postojeca?.datum_isporuke ?? lokalniDatum());
  const [skladisteId, setSkladisteId] = useState(postojeca?.skladiste_id ?? podrazumijevanoSkladiste);
  // Roba se isporučuje iz magacina u kom stoji — nude se samo lotovi izabranog skladišta.
  const lotoviSkladista = zaliha.filter((z) => !skladisteId || !z.skladiste_id || z.skladiste_id === skladisteId);
  const [redovi, setRedovi] = useState<NovaStavkaRed[]>(
    postojeceStavke && postojeceStavke.length > 0
      ? postojeceStavke.map((s) => ({ lotId: zaliha.find((z) => z.broj_lota === s.broj_lota)?.lot_id ?? "", kolicina: s.planirana_kolicina }))
      : [{ lotId: lotoviSkladista[0]?.lot_id ?? "", kolicina: "" }],
  );
  const [greska, setGreska] = useState("");

  const promijeniSkladiste = (id: string) => {
    setSkladisteId(id);
    const dostupni = zaliha.filter((z) => !z.skladiste_id || z.skladiste_id === id);
    setRedovi((r) => r.map((red) => (dostupni.some((z) => z.lot_id === red.lotId) ? red : { ...red, lotId: dostupni[0]?.lot_id ?? "" })));
  };

  const dodajRed = () => setRedovi((r) => [...r, { lotId: lotoviSkladista[0]?.lot_id ?? "", kolicina: "" }]);
  const ukloniRed = (i: number) => setRedovi((r) => r.filter((_, idx) => idx !== i));
  const azurirajRed = (i: number, izm: Partial<NovaStavkaRed>) => setRedovi((r) => r.map((red, idx) => (idx === i ? { ...red, ...izm } : red)));

  const posalji = async () => {
    try {
      const telo = {
        kupacId,
        skladisteId: skladisteId || undefined,
        vozilId: vozilId || undefined,
        vozacKorisnikId: vozacId || undefined,
        datumIsporuke: datum,
        stavke: redovi.map((r) => ({ lotId: r.lotId, planiranaKolicina: Number(r.kolicina) })),
      };
      if (izmjena) {
        await api(`/isporuke/${postojeca!.id}`, { method: "PATCH", telo: { skladisteId: telo.skladisteId, vozilId: telo.vozilId, vozacKorisnikId: telo.vozacKorisnikId, datumIsporuke: telo.datumIsporuke, stavke: telo.stavke } });
      } else {
        await api("/isporuke", { telo });
      }
      onSacuvano();
      onClose();
    } catch (e) {
      setGreska(e instanceof ApiGreska ? e.message : "Isporuka nije sačuvana.");
    }
  };

  const validno = (izmjena || kupacId) && datum && redovi.length > 0 && redovi.every((r) => r.lotId && Number(r.kolicina) > 0);

  return (
    <Modal
      naslov={izmjena ? `Izmjena isporuke ${postojeca!.broj}` : "Nova isporuka"}
      podnaslov="Jedan kupac, više artikala u istoj isporuci"
      onClose={onClose}
      greska={greska}
      footer={<><button className="secondary-button" onClick={onClose}>Otkaži</button><button className="primary-button" onClick={posalji} disabled={!validno}>Sačuvaj</button></>}
    >
      <div className="form-grid">
        {izmjena ? (
          <label>Kupac<input value={postojeca!.kupac_naziv} disabled /></label>
        ) : (
          <label>
            Kupac
            <select value={kupacId} onChange={(e) => setKupacId(e.target.value)}>
              {kupci.map((k) => <option key={k.id} value={k.id}>{k.naziv}</option>)}
            </select>
          </label>
        )}
        {skladista.length > 0 && (
          <label>
            Iz magacina
            <select value={skladisteId} onChange={(e) => promijeniSkladiste(e.target.value)}>
              {skladista.map((sk) => <option key={sk.id} value={sk.id}>{sk.naziv}</option>)}
            </select>
          </label>
        )}
        <label>
          Vozilo
          <select value={vozilId} onChange={(e) => setVozilId(e.target.value)}>
            <option value="">— bez vozila —</option>
            {vozila.map((v) => <option key={v.id} value={v.id} disabled={v.status !== "SPREMNO"}>{v.registarski_broj}{v.status !== "SPREMNO" ? " (nije spremno)" : ""}</option>)}
          </select>
        </label>
        <label>
          Vozač
          <select value={vozacId} onChange={(e) => setVozacId(e.target.value)}>
            <option value="">— nije dodijeljen —</option>
            {vozaci.map((v) => <option key={v.id} value={v.id}>{v.ime}</option>)}
          </select>
        </label>
        <label>Datum isporuke<input type="date" value={datum} onChange={(e) => setDatum(e.target.value)} /></label>
      </div>
      <div style={{ padding: "0 20px" }}>
        {redovi.map((red, i) => (
          <div key={i} className="form-grid stavka-red" style={{ padding: "10px 0", borderTop: "1px solid #edf1f3" }}>
            <label>
              Artikal / lot <ZakonskaOznaka clan="27" />
              <select value={red.lotId} onChange={(e) => azurirajRed(i, { lotId: e.target.value })}>
                {lotoviSkladista.length === 0 && <option value="">— u ovom magacinu nema robe na zalihi —</option>}
                {lotoviSkladista.map((z) => <option key={z.lot_id} value={z.lot_id}>{z.artikal_naziv} · {z.broj_lota} (dostupno {z.kolicina})</option>)}
              </select>
            </label>
            <label>
              Količina
              <input type="number" value={red.kolicina} onChange={(e) => azurirajRed(i, { kolicina: e.target.value })} style={{ width: 90 }} />
            </label>
            {redovi.length > 1 && (
              <button type="button" className="row-action" style={{ alignSelf: "end", marginBottom: 1 }} onClick={() => ukloniRed(i)}>
                ✕
              </button>
            )}
          </div>
        ))}
        <button className="link-button" onClick={dodajRed} style={{ marginTop: 8 }}>
          <Plus size={14} /> Dodaj artikal
        </button>
      </div>
    </Modal>
  );
}

function PotvrdaModal({ isporuka, stavke, onClose, onCreated }: { isporuka: IsporukaRed; stavke: StavkaIsporuke[]; onClose: () => void; onCreated: () => void }) {
  const [vrijednosti, setVrijednosti] = useState<Record<string, { isporuceno: string; odbijeno: string; razlog: string; temperatura: string }>>(
    Object.fromEntries(stavke.map((s) => [s.id, { isporuceno: s.planirana_kolicina, odbijeno: "0", razlog: "", temperatura: "" }])),
  );
  const [greska, setGreska] = useState("");
  const [brojVanGranice, setBrojVanGranice] = useState<number | null>(null);

  const postavi = (id: string, polje: "isporuceno" | "odbijeno" | "razlog" | "temperatura", vrijednost: string) =>
    setVrijednosti((v) => ({ ...v, [id]: { ...v[id], [polje]: vrijednost } }));

  // Isto pravilo kao na serveru: roba pod temperaturnim režimom koja se predaje mora imati temperaturu.
  const faliTemperatura = stavke.some((s) => s.temp_kontrolisano && Number(vrijednosti[s.id].isporuceno) > 0 && vrijednosti[s.id].temperatura.trim() === "");

  const posalji = async () => {
    try {
      const rezultat = await api<{ status: string; vanGranice: number }>(`/isporuke/${isporuka.id}/potvrda`, {
        telo: {
          stavke: stavke.map((s) => ({
            stavkaId: s.id,
            isporucenaKolicina: Number(vrijednosti[s.id].isporuceno),
            odbijenaKolicina: Number(vrijednosti[s.id].odbijeno || 0),
            razlogOdbijanja: vrijednosti[s.id].razlog || undefined,
            temperaturaPredaje: vrijednosti[s.id].temperatura.trim() === "" ? null : Number(vrijednosti[s.id].temperatura),
          })),
        },
      });
      onCreated();
      if (rezultat.vanGranice > 0) setBrojVanGranice(rezultat.vanGranice);
      else onClose();
    } catch (e) {
      setGreska(e instanceof ApiGreska ? e.message : "Potvrda nije sačuvana.");
    }
  };

  if (brojVanGranice !== null) {
    return (
      <Modal naslov={`Isporuka ${isporuka.broj} potvrđena`} onClose={onClose} footer={<button className="primary-button" onClick={onClose}>Zatvori</button>}>
        <div style={{ padding: 20 }}>
          <StatusBadge status="FAIL" />
          <p style={{ marginTop: 10, fontSize: 12, color: "#c34e55" }}>
            {brojVanGranice === 1 ? "Jedna stavka je predata" : `${brojVanGranice} stavke su predate`} van temperaturne granice. Otvorena je
            neusaglašenost i obaviješteno je odgovorno lice. Lot u magacinu se ne zadržava — problem je nastao u prevozu.
          </p>
        </div>
      </Modal>
    );
  }

  return (
    <Modal
      naslov={`Potvrda isporuke ${isporuka.broj}`}
      onClose={onClose}
      greska={greska}
      footer={
        <>
          <button className="secondary-button" onClick={onClose}>Otkaži</button>
          <button className="primary-button" onClick={posalji} disabled={faliTemperatura} title={faliTemperatura ? "Upišite temperaturu pri predaji" : undefined}>Potvrdi</button>
        </>
      }
    >
      <div style={{ padding: 20 }}>
        {stavke.map((s) => {
          const v = vrijednosti[s.id];
          const granica = opisGranice(s);
          return (
            <div key={s.id} style={{ borderBottom: "1px solid #edf1f3", paddingBottom: 12, marginBottom: 12 }}>
              <strong style={{ fontSize: 11 }}>{s.artikal_naziv} · {s.broj_lota} (planirano {s.planirana_kolicina})</strong>
              <div className="form-grid" style={{ padding: "10px 0 0" }}>
                <label>Isporučeno<input type="number" value={v.isporuceno} onChange={(e) => postavi(s.id, "isporuceno", e.target.value)} /></label>
                <label>Odbijeno<input type="number" value={v.odbijeno} onChange={(e) => postavi(s.id, "odbijeno", e.target.value)} /></label>
                {s.temp_kontrolisano && (
                  <label className="temp-predaje" style={{ gridColumn: "1 / -1" }}>
                    <span>
                      Temperatura pri predaji (°C) <ZakonskaOznaka clan="36" />{" "}
                      {granica && <span className="temp-granica">granica {granica}{s.granica_potvrdio ? "" : " — nije potvrđena, ne ocjenjuje se"}</span>}
                    </span>
                    <input type="number" step="0.1" inputMode="decimal" value={v.temperatura} onChange={(e) => postavi(s.id, "temperatura", e.target.value)} placeholder="izmjereno kod kupca" />
                    {vanGranice(s, v.temperatura) && (
                      <span className="temp-upozorenje">Van granice — kupac smije odbiti robu. Upišite odbijenu količinu i razlog.</span>
                    )}
                  </label>
                )}
                <label style={{ gridColumn: "1 / -1" }}>Razlog odbijanja (ako ima)<input value={v.razlog} onChange={(e) => postavi(s.id, "razlog", e.target.value)} /></label>
              </div>
            </div>
          );
        })}
        {faliTemperatura && <p style={{ fontSize: 10, color: "#8d9ba5", margin: 0 }}>Za robu pod temperaturnim režimom upišite temperaturu pri predaji — to je dokaz da je hladni lanac održan do kupca.</p>}
      </div>
    </Modal>
  );
}
