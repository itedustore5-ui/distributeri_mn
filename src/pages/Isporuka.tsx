import { useEffect, useState } from "react";
import { Plus } from "lucide-react";
import { api, ApiGreska } from "../lib/api";
import { lokalniDatum } from "../lib/vrijeme";
import { PageHeader, Modal, ZakonskaOznaka } from "../components/Zajednicko";
import { StatusBadge } from "../components/StatusBadge";
import { useAuth } from "../lib/auth";

type Kupac = { id: string; naziv: string; telefon: string };
type Vozilo = { id: string; registarski_broj: string; status: string };
type Vozac = { id: string; ime: string };
type LotDostupan = { lot_id: string; artikal_naziv: string; broj_lota: string; kolicina: string };
type IsporukaRed = { id: string; broj: string; kupac_naziv: string; datum_isporuke: string; status: string; registarski_broj: string | null; vozac_korisnik_id: string | null };
type StavkaIsporuke = { id: string; artikal_naziv: string; broj_lota: string; planirana_kolicina: string; isporucena_kolicina: string };

export function Isporuka() {
  const [lista, setLista] = useState<IsporukaRed[]>([]);
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
      <div className="panel full-panel">
        <div className="data-table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Broj</th>
                <th>Kupac</th>
                <th>Vozilo</th>
                <th>Vozač</th>
                <th>Datum</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {lista.map((i) => (
                <tr key={i.id}>
                  <td>{i.broj}</td>
                  <td>{i.kupac_naziv}</td>
                  <td className="muted-text">{i.registarski_broj ?? "—"}</td>
                  <td className="muted-text">{imeVozaca(i.vozac_korisnik_id)}</td>
                  <td className="muted-text">{i.datum_isporuke}</td>
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
        <IsporukaFormaModal kupci={kupci} vozila={vozila} vozaci={vozaci} zaliha={zaliha} onClose={() => setModalNova(false)} onSacuvano={ucitaj} />
      )}
      {modalIzmjena && (
        <IsporukaFormaModal
          postojeca={modalIzmjena.isporuka}
          postojeceStavke={modalIzmjena.stavke}
          kupci={kupci}
          vozila={vozila}
          vozaci={vozaci}
          zaliha={zaliha}
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
  onClose,
  onSacuvano,
}: {
  postojeca?: IsporukaRed;
  postojeceStavke?: StavkaIsporuke[];
  kupci: Kupac[];
  vozila: Vozilo[];
  vozaci: Vozac[];
  zaliha: LotDostupan[];
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
  const [redovi, setRedovi] = useState<NovaStavkaRed[]>(
    postojeceStavke && postojeceStavke.length > 0
      ? postojeceStavke.map((s) => ({ lotId: zaliha.find((z) => z.broj_lota === s.broj_lota)?.lot_id ?? "", kolicina: s.planirana_kolicina }))
      : [{ lotId: zaliha[0]?.lot_id ?? "", kolicina: "" }],
  );
  const [greska, setGreska] = useState("");

  const dodajRed = () => setRedovi((r) => [...r, { lotId: zaliha[0]?.lot_id ?? "", kolicina: "" }]);
  const ukloniRed = (i: number) => setRedovi((r) => r.filter((_, idx) => idx !== i));
  const azurirajRed = (i: number, izm: Partial<NovaStavkaRed>) => setRedovi((r) => r.map((red, idx) => (idx === i ? { ...red, ...izm } : red)));

  const posalji = async () => {
    try {
      const telo = {
        kupacId,
        vozilId: vozilId || undefined,
        vozacKorisnikId: vozacId || undefined,
        datumIsporuke: datum,
        stavke: redovi.map((r) => ({ lotId: r.lotId, planiranaKolicina: Number(r.kolicina) })),
      };
      if (izmjena) {
        await api(`/isporuke/${postojeca!.id}`, { method: "PATCH", telo: { vozilId: telo.vozilId, vozacKorisnikId: telo.vozacKorisnikId, datumIsporuke: telo.datumIsporuke, stavke: telo.stavke } });
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
                {zaliha.map((z) => <option key={z.lot_id} value={z.lot_id}>{z.artikal_naziv} · {z.broj_lota} (dostupno {z.kolicina})</option>)}
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
  const [vrijednosti, setVrijednosti] = useState<Record<string, { isporuceno: string; odbijeno: string; razlog: string }>>(
    Object.fromEntries(stavke.map((s) => [s.id, { isporuceno: s.planirana_kolicina, odbijeno: "0", razlog: "" }])),
  );
  const [greska, setGreska] = useState("");

  const posalji = async () => {
    try {
      await api(`/isporuke/${isporuka.id}/potvrda`, {
        telo: {
          stavke: stavke.map((s) => ({
            stavkaId: s.id,
            isporucenaKolicina: Number(vrijednosti[s.id].isporuceno),
            odbijenaKolicina: Number(vrijednosti[s.id].odbijeno || 0),
            razlogOdbijanja: vrijednosti[s.id].razlog || undefined,
          })),
        },
      });
      onCreated();
      onClose();
    } catch (e) {
      setGreska(e instanceof ApiGreska ? e.message : "Potvrda nije sačuvana.");
    }
  };

  return (
    <Modal naslov={`Potvrda isporuke ${isporuka.broj}`} onClose={onClose} greska={greska} footer={<><button className="secondary-button" onClick={onClose}>Otkaži</button><button className="primary-button" onClick={posalji}>Potvrdi</button></>}>
      <div style={{ padding: 20 }}>
        {stavke.map((s) => (
          <div key={s.id} style={{ borderBottom: "1px solid #edf1f3", paddingBottom: 12, marginBottom: 12 }}>
            <strong style={{ fontSize: 11 }}>{s.artikal_naziv} · {s.broj_lota} (planirano {s.planirana_kolicina})</strong>
            <div className="form-grid" style={{ padding: "10px 0 0" }}>
              <label>Isporučeno<input type="number" value={vrijednosti[s.id].isporuceno} onChange={(e) => setVrijednosti((v) => ({ ...v, [s.id]: { ...v[s.id], isporuceno: e.target.value } }))} /></label>
              <label>Odbijeno<input type="number" value={vrijednosti[s.id].odbijeno} onChange={(e) => setVrijednosti((v) => ({ ...v, [s.id]: { ...v[s.id], odbijeno: e.target.value } }))} /></label>
              <label style={{ gridColumn: "1 / -1" }}>Razlog odbijanja (ako ima)<input value={vrijednosti[s.id].razlog} onChange={(e) => setVrijednosti((v) => ({ ...v, [s.id]: { ...v[s.id], razlog: e.target.value } }))} /></label>
            </div>
          </div>
        ))}
      </div>
    </Modal>
  );
}
