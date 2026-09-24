import { Fragment, useEffect, useState } from "react";
import { Plus, ChevronDown, ChevronUp, Camera, FileText, AlertTriangle } from "lucide-react";
import { api, ApiGreska, posaljiFajl, otvoriFajl } from "../lib/api";
import { lokalniDatum } from "../lib/vrijeme";
import { PageHeader, Modal, ZakonskaOznaka, NaknadnoOznaka } from "../components/Zajednicko";
import { StatusBadge } from "../components/StatusBadge";
import { useAuth } from "../lib/auth";
import { useSkladista, type Skladiste } from "../lib/skladista";

type Dobavljac = { id: string; naziv: string };
type Artikal = { id: string; naziv: string; temp_kontrolisano: boolean };
type PrijemRed = {
  id: string;
  dobavljac_naziv: string;
  datum_prijema: string;
  broj_dokumenta: string | null;
  status: string;
  broj_stavki: number;
  naknadno_dana: number;
  skladiste_id: string | null;
  skladiste_naziv: string | null;
  ima_otpremnicu: boolean;
  odstupa_od_otpremnice: boolean;
};
type PoOtpremnici = { sifra?: string | null; naziv?: string | null; kolicina?: number | null; lot?: string | null; rok?: string | null };
type Stavka = {
  id: string;
  lot_id: string;
  artikal_naziv: string;
  broj_lota: string;
  lot_status: string;
  primljena_kolicina: string;
  rok_trajanja: string | null;
  temperatura_prijema: string | null;
  po_otpremnici: PoOtpremnici | null;
};
type Dokument = { id: string; vrsta: "pdf" | "slika"; naziv_fajla: string | null };
type Detalj = { stavke: Stavka[]; dokumenti: Dokument[] };

export function Prijem() {
  const { korisnik } = useAuth();
  const skladista = useSkladista();
  const [filterSkladiste, setFilterSkladiste] = useState("");
  const [lista, setLista] = useState<PrijemRed[]>([]);
  const [dobavljaci, setDobavljaci] = useState<Dobavljac[]>([]);
  const [artikli, setArtikli] = useState<Artikal[]>([]);
  const [modalNovi, setModalNovi] = useState(false);
  const [modalIzmjena, setModalIzmjena] = useState<{ prijemId: string; stavka: Stavka } | null>(null);
  const [otvoren, setOtvoren] = useState<string | null>(null);
  const [stavke, setStavke] = useState<Record<string, Stavka[]>>({});
  const [dokumenti, setDokumenti] = useState<Record<string, Dokument[]>>({});
  const ucitajDetalj = async (id: string) => {
    const detalj = await api<Detalj>(`/prijem/${id}`);
    setStavke((s) => ({ ...s, [id]: detalj.stavke }));
    setDokumenti((d) => ({ ...d, [id]: detalj.dokumenti }));
  };
  const [greska, setGreska] = useState("");

  const ucitaj = () => api<PrijemRed[]>("/prijem").then(setLista);
  useEffect(() => {
    ucitaj();
    api<Dobavljac[]>("/dobavljaci").then(setDobavljaci);
    api<Artikal[]>("/artikli").then(setArtikli);
  }, []);

  const prosiri = async (id: string) => {
    if (otvoren === id) {
      setOtvoren(null);
      return;
    }
    setOtvoren(id);
    if (!stavke[id]) await ucitajDetalj(id);
  };

  const donesiOdluku = async (prijemId: string, lotId: string, odluka: "PRIHVATI" | "HOLD" | "ODBIJI", kolicina: number) => {
    let napomena: string | undefined;
    const izHolda = stavke[prijemId]?.find((s) => s.lot_id === lotId)?.lot_status === "HOLD";
    if (odluka === "ODBIJI" || izHolda) {
      napomena = window.prompt(izHolda && odluka === "PRIHVATI" ? "Zašto se zadržana roba pušta (obavezno):" : "Razlog odbijanja (obavezno):") ?? undefined;
      if (!napomena) return;
    }
    try {
      await api(`/prijem/${prijemId}/lot/${lotId}/odluka`, { method: "PATCH", telo: { odluka, kolicina, napomena } });
      await ucitajDetalj(prijemId);
      ucitaj();
    } catch (e) {
      setGreska(e instanceof ApiGreska ? e.message : "Odluka nije sačuvana.");
    }
  };

  const moguOdlucivati = korisnik?.uloga === "bzr" || korisnik?.uloga === "izvodjac";

  return (
    <>
      <PageHeader
        title="Prijem robe"
        description={<>Bez broja lota nema sledljivosti — svaka stavka mora imati lot <ZakonskaOznaka clan="27" />.</>}
        action={
          <button className="primary-button" onClick={() => setModalNovi(true)}>
            <Plus size={16} /> Novi prijem
          </button>
        }
      />
      {greska && <div className="auth-error" style={{ marginBottom: 16 }}>{greska}</div>}
      {skladista.vise && (
        <div className="filter-bar">
          <label>
            Magacin
            <select value={filterSkladiste} onChange={(e) => setFilterSkladiste(e.target.value)}>
              <option value="">Svi magacini</option>
              {skladista.sva.map((sk) => <option key={sk.id} value={sk.id}>{sk.naziv}</option>)}
            </select>
          </label>
        </div>
      )}

      <div className="panel full-panel">
        <div className="data-table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th></th>
                <th>Dobavljač</th>
                {skladista.vise && <th>Magacin</th>}
                <th>Datum</th>
                <th>Dokument</th>
                <th>Stavki</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {lista.filter((p) => !filterSkladiste || p.skladiste_id === filterSkladiste).map((p) => (
                <Fragment key={p.id}>
                  <tr style={{ cursor: "pointer" }} onClick={() => prosiri(p.id)}>
                    <td>{otvoren === p.id ? <ChevronUp size={14} /> : <ChevronDown size={14} />}</td>
                    <td>{p.dobavljac_naziv}</td>
                    {skladista.vise && <td className="muted-text">{p.skladiste_naziv ?? "—"}</td>}
                    <td className="muted-text">{p.datum_prijema}<NaknadnoOznaka dana={p.naknadno_dana} /></td>
                    <td className="muted-text">
                      {p.broj_dokumenta ?? "—"}
                      {p.ima_otpremnicu && <FileText size={12} style={{ marginLeft: 6, verticalAlign: "-1px" }} aria-label="otpremnica uz prijem" />}
                      {p.odstupa_od_otpremnice && <span className="rok-oznaka istekao" style={{ marginLeft: 6 }}>odstupa od otpremnice</span>}
                    </td>
                    <td>{p.broj_stavki}</td>
                    <td><StatusBadge status={p.status} /></td>
                  </tr>
                  {otvoren === p.id && (
                    <tr>
                      <td colSpan={skladista.vise ? 7 : 6} style={{ background: "#fbfcfd", padding: 0 }}>
                        {(dokumenti[p.id] ?? []).length > 0 && (
                          <div style={{ display: "flex", gap: 8, padding: "10px 12px 0", flexWrap: "wrap" }}>
                            {dokumenti[p.id].map((d) => (
                              <button key={d.id} className="small-action" onClick={() => otvoriFajl(`/prijem/${p.id}/dokument/${d.id}`).catch((e) => setGreska(e.message))}>
                                <FileText size={12} /> Otpremnica{d.vrsta === "slika" ? " (slika)" : " (PDF)"}
                              </button>
                            ))}
                          </div>
                        )}
                        <table className="data-table" style={{ margin: "0 12px 12px" }}>
                          <thead>
                            <tr>
                              <th>Artikal</th>
                              <th>Lot <ZakonskaOznaka clan="27" /></th>
                              <th>Rok</th>
                              <th>Količina</th>
                              <th>Status</th>
                              <th>Radnje</th>
                            </tr>
                          </thead>
                          <tbody>
                            {(stavke[p.id] ?? []).map((s) => (
                              <tr key={s.id}>
                                <td>{s.artikal_naziv}</td>
                                <td>
                                  <code>{s.broj_lota}</code>
                                  {s.po_otpremnici?.lot && s.po_otpremnici.lot !== s.broj_lota && (
                                    <div className="danas-fali" style={{ fontSize: 10 }}>na otpremnici: {s.po_otpremnici.lot}</div>
                                  )}
                                </td>
                                <td className="muted-text">
                                  {s.rok_trajanja ?? "—"}
                                  {s.rok_trajanja && s.rok_trajanja < lokalniDatum() && <span className="rok-oznaka istekao" style={{ marginLeft: 6 }}>istekao</span>}
                                </td>
                                <td>
                                  {s.primljena_kolicina}
                                  {s.po_otpremnici?.kolicina != null && Number(s.po_otpremnici.kolicina) !== Number(s.primljena_kolicina) && (
                                    <div className="danas-fali" style={{ fontSize: 10 }}>
                                      po otpremnici {s.po_otpremnici.kolicina} · {Number(s.primljena_kolicina) < Number(s.po_otpremnici.kolicina) ? "manjak" : "višak"}{" "}
                                      {Math.abs(Number(s.po_otpremnici.kolicina) - Number(s.primljena_kolicina))}
                                    </div>
                                  )}
                                </td>
                                <td><StatusBadge status={s.lot_status} /></td>
                                <td>
                                  {s.lot_status === "PRIMLJEN" ? (
                                    <div style={{ display: "flex", gap: 6 }}>
                                      <button className="small-action" onClick={() => setModalIzmjena({ prijemId: p.id, stavka: s })}>Izmijeni</button>
                                      {moguOdlucivati && (
                                        <>
                                          <button className="small-action" onClick={() => donesiOdluku(p.id, s.lot_id, "PRIHVATI", Number(s.primljena_kolicina))}>Prihvati</button>
                                          <button className="small-action" onClick={() => donesiOdluku(p.id, s.lot_id, "HOLD", Number(s.primljena_kolicina))}>Hold</button>
                                          <button className="small-action" onClick={() => donesiOdluku(p.id, s.lot_id, "ODBIJI", Number(s.primljena_kolicina))}>Odbij</button>
                                        </>
                                      )}
                                    </div>
                                  ) : s.lot_status === "HOLD" && moguOdlucivati ? (
                                    <div style={{ display: "flex", gap: 6 }}>
                                      <button className="small-action" onClick={() => donesiOdluku(p.id, s.lot_id, "PRIHVATI", Number(s.primljena_kolicina))}>Pusti</button>
                                      <button className="small-action" onClick={() => donesiOdluku(p.id, s.lot_id, "ODBIJI", Number(s.primljena_kolicina))}>Odbij</button>
                                    </div>
                                  ) : (
                                    <span className="muted-text">Odlučeno</span>
                                  )}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {modalNovi && (
        <NoviPrijemModal
          mozeDodatiDobavljaca={moguOdlucivati}
          dobavljaci={dobavljaci}
          artikli={artikli}
          skladista={skladista.vise ? skladista.aktivna : []}
          podrazumijevanoSkladiste={skladista.podrazumijevano}
          onClose={() => setModalNovi(false)}
          onCreated={ucitaj}
        />
      )}
      {modalIzmjena && (
        <IzmjenaStavkeModal
          prijemId={modalIzmjena.prijemId}
          stavka={modalIzmjena.stavka}
          onClose={() => setModalIzmjena(null)}
          onSacuvano={() => ucitajDetalj(modalIzmjena.prijemId)}
        />
      )}
    </>
  );
}

function IzmjenaStavkeModal({ prijemId, stavka, onClose, onSacuvano }: { prijemId: string; stavka: Stavka; onClose: () => void; onSacuvano: () => void }) {
  const [brojLota, setBrojLota] = useState(stavka.broj_lota);
  const [rokTrajanja, setRokTrajanja] = useState(stavka.rok_trajanja ?? "");
  const [primljenaKolicina, setPrimljenaKolicina] = useState(stavka.primljena_kolicina);
  const [temperaturaPrijema, setTemperaturaPrijema] = useState(stavka.temperatura_prijema ?? "");
  const [greska, setGreska] = useState("");

  const posalji = async () => {
    try {
      await api(`/prijem/${prijemId}/lot/${stavka.lot_id}`, {
        method: "PATCH",
        telo: {
          brojLota,
          rokTrajanja: rokTrajanja || undefined,
          primljenaKolicina: Number(primljenaKolicina),
          temperaturaPrijema: temperaturaPrijema ? Number(temperaturaPrijema) : undefined,
        },
      });
      await onSacuvano();
      onClose();
    } catch (e) {
      setGreska(e instanceof ApiGreska ? e.message : "Izmjene nisu sačuvane.");
    }
  };

  return (
    <Modal naslov={`Izmjena — ${stavka.artikal_naziv}`} podnaslov="Dok se ne donese odluka" onClose={onClose} greska={greska} footer={<><button className="secondary-button" onClick={onClose}>Otkaži</button><button className="primary-button" onClick={posalji} disabled={!brojLota.trim() || Number(primljenaKolicina) <= 0}>Sačuvaj</button></>}>
      <div className="form-grid">
        <label>Broj lota <ZakonskaOznaka clan="27" /><input value={brojLota} onChange={(e) => setBrojLota(e.target.value)} /></label>
        <label>Rok trajanja<input type="date" value={rokTrajanja} onChange={(e) => setRokTrajanja(e.target.value)} /></label>
        <label>Količina<input type="number" value={primljenaKolicina} onChange={(e) => setPrimljenaKolicina(e.target.value)} /></label>
        <label>Temperatura pri prijemu (°C) <ZakonskaOznaka clan="36" /><input type="number" step="0.1" value={temperaturaPrijema} onChange={(e) => setTemperaturaPrijema(e.target.value)} /></label>
      </div>
    </Modal>
  );
}

type NoviRed = {
  artikalId: string;
  brojLota: string;
  rokTrajanja: string;
  primljenaKolicina: string;
  temperaturaPrijema: string;
  /** Kako piše na otpremnici — samo kad je prijem popunjen iz otpremnice. */
  poOtpremnici?: PoOtpremnici & { jm?: string | null };
  /** Polja koja magacioner mora posebno pogledati; nestaje čim polje dirne. */
  nesigurno: string[];
};

type PrijedlogStavke = {
  sifra: string | null;
  naziv: string | null;
  jm: string | null;
  kolicina: number | null;
  lot: string | null;
  rok: string | null;
  nesigurno: string[];
  artikalId: string | null;
  artikalSigurno: boolean;
  rokIstekao: boolean;
};
type Prijedlog = {
  strana: number;
  broj: string | null;
  datum: string | null;
  temperaturaNaOtpremnici: number | null;
  dobavljac: { id: string | null; naziv: string | null; pib: string | null; sigurno: boolean };
  stavke: PrijedlogStavke[];
  upozorenja: string[];
};
type Procitano = { dokumentId: string; vrsta: "pdf" | "slika"; otpremnice: Prijedlog[]; pouzdanostOcr: number | null };

/** 1 stavka · 2 stavke · 5 stavki */
const stavkiPadez = (n: number) => `${n} ${n % 10 === 1 && n % 100 !== 11 ? "stavka" : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 12 || n % 100 > 14) ? "stavke" : "stavki"}`;

const prazanRed = (artikalId = ""): NoviRed => ({ artikalId, brojLota: "", rokTrajanja: "", primljenaKolicina: "", temperaturaPrijema: "", nesigurno: [] });
const ZUTO = { background: "#fff6d6", borderColor: "#e0b400" };

/** Fotografija sa telefona je 3–8 MB; za čitanje i čuvanje dovoljna je duža strana od 3200 px
 * (A4 ≈ 270 dpi — OCR-u treba oko 300; manje od 2400 px je na probi kvarilo čitanje tabele).
 * Crtanje preko platna usput okrene sliku kako je telefon snimio (EXIF). */
async function pripremiSliku(fajl: File): Promise<Blob> {
  if (!fajl.type.startsWith("image/") || typeof createImageBitmap !== "function") return fajl;
  try {
    const slika = await createImageBitmap(fajl);
    const razmjera = Math.min(1, 3200 / Math.max(slika.width, slika.height));
    const platno = document.createElement("canvas");
    platno.width = Math.round(slika.width * razmjera);
    platno.height = Math.round(slika.height * razmjera);
    platno.getContext("2d")!.drawImage(slika, 0, 0, platno.width, platno.height);
    return await new Promise<Blob>((ok) => platno.toBlob((b) => ok(b ?? fajl), "image/jpeg", 0.9));
  } catch {
    return fajl;
  }
}

function NoviPrijemModal({
  mozeDodatiDobavljaca,
  dobavljaci: pocetniDobavljaci,
  artikli,
  skladista,
  podrazumijevanoSkladiste,
  onClose,
  onCreated,
}: {
  mozeDodatiDobavljaca: boolean;
  dobavljaci: Dobavljac[];
  artikli: Artikal[];
  /** Prazno kad firma ima jedno skladište — tada se polje ne prikazuje. */
  skladista: Skladiste[];
  podrazumijevanoSkladiste: string;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [dobavljaci, setDobavljaci] = useState(pocetniDobavljaci);
  const [dobavljacId, setDobavljacId] = useState(pocetniDobavljaci[0]?.id ?? "");
  const [skladisteId, setSkladisteId] = useState(podrazumijevanoSkladiste);
  const [brojDokumenta, setBrojDokumenta] = useState("");
  const [datum, setDatum] = useState(lokalniDatum());
  const [redovi, setRedovi] = useState<NoviRed[]>([prazanRed(artikli[0]?.id)]);
  const [greska, setGreska] = useState("");
  // Otpremnica
  const [citam, setCitam] = useState<"" | "pdf" | "slika">("");
  const [procitano, setProcitano] = useState<Procitano | null>(null);
  const [prijedlog, setPrijedlog] = useState<Prijedlog | null>(null);
  const [uporedjeno, setUporedjeno] = useState(false);

  const dodajRed = () => setRedovi((r) => [...r, prazanRed(artikli[0]?.id)]);
  const azurirajRed = (i: number, izmjena: Partial<NoviRed>, polje?: string) =>
    setRedovi((r) => r.map((red, idx) => (idx === i ? { ...red, ...izmjena, nesigurno: polje ? red.nesigurno.filter((p) => p !== polje) : red.nesigurno } : red)));
  const nesigurno = (red: NoviRed, polje: string) => (red.nesigurno.includes(polje) ? ZUTO : undefined);

  const primijeni = (p: Prijedlog) => {
    setPrijedlog(p);
    setUporedjeno(false);
    // Nepoznat dobavljač: polje ostaje prazno — nikad ne ostaviti prvog sa spiska, jer bi prijem
    // tiho otišao pogrešnom dobavljaču.
    setDobavljacId(p.dobavljac.id ?? "");
    setBrojDokumenta(p.broj ?? "");
    setRedovi(
      p.stavke.map((s) => ({
        artikalId: s.artikalId ?? "",
        brojLota: s.lot ?? "",
        rokTrajanja: s.rok ?? "",
        primljenaKolicina: s.kolicina != null ? String(s.kolicina) : "",
        temperaturaPrijema: "",
        poOtpremnici: { sifra: s.sifra, naziv: s.naziv, kolicina: s.kolicina, lot: s.lot, rok: s.rok, jm: s.jm },
        nesigurno: [...s.nesigurno.filter((n) => n !== "sifra" && n !== "naziv"), ...(s.artikalSigurno ? [] : ["artikal"])],
      })),
    );
  };

  const ucitajOtpremnicu = async (fajl: File | undefined) => {
    if (!fajl) return;
    setGreska("");
    setCitam(fajl.type === "application/pdf" ? "pdf" : "slika");
    try {
      const za = await pripremiSliku(fajl);
      const r = await posaljiFajl<Procitano>("/prijem/otpremnica", za, fajl.name);
      setProcitano(r);
      primijeni(r.otpremnice[0]);
    } catch (e) {
      setGreska(e instanceof ApiGreska ? e.message : "Otpremnica nije pročitana — unesite prijem ručno.");
    } finally {
      setCitam("");
    }
  };

  const dodajDobavljaca = async () => {
    if (!prijedlog?.dobavljac.naziv) return;
    try {
      const r = await api<{ id: string }>("/dobavljaci", { telo: { naziv: prijedlog.dobavljac.naziv, pib: prijedlog.dobavljac.pib ?? undefined } });
      setDobavljaci((d) => [...d, { id: r.id, naziv: prijedlog.dobavljac.naziv! }].sort((a, b) => a.naziv.localeCompare(b.naziv, "sr")));
      setDobavljacId(r.id);
      setPrijedlog({ ...prijedlog, dobavljac: { ...prijedlog.dobavljac, id: r.id }, upozorenja: prijedlog.upozorenja.filter((u) => !u.startsWith("Dobavljač")) });
    } catch (e) {
      setGreska(e instanceof ApiGreska ? e.message : "Dobavljač nije dodat.");
    }
  };

  const posalji = async () => {
    try {
      await api("/prijem", {
        telo: {
          dobavljacId,
          skladisteId: skladisteId || undefined,
          brojDokumenta: brojDokumenta || undefined,
          datumPrijema: datum,
          dokumentId: procitano?.dokumentId,
          stavke: redovi.map((r) => ({
            artikalId: r.artikalId,
            brojLota: r.brojLota,
            rokTrajanja: r.rokTrajanja || undefined,
            primljenaKolicina: Number(r.primljenaKolicina),
            temperaturaPrijema: r.temperaturaPrijema ? Number(r.temperaturaPrijema) : undefined,
            poOtpremnici: r.poOtpremnici
              ? { sifra: r.poOtpremnici.sifra, naziv: r.poOtpremnici.naziv, kolicina: r.poOtpremnici.kolicina, lot: r.poOtpremnici.lot, rok: r.poOtpremnici.rok }
              : undefined,
          })),
        },
      });
      onCreated();
      onClose();
    } catch (e) {
      setGreska(e instanceof ApiGreska ? e.message : "Prijem nije sačuvan.");
    }
  };

  // KKT 1: roba pod temperaturnim režimom se ne prima bez izmjerene temperature (server isto provjerava).
  const podRezimom = (artikalId: string) => artikli.find((a) => a.id === artikalId)?.temp_kontrolisano === true;
  const validno =
    dobavljacId &&
    datum &&
    redovi.length > 0 &&
    redovi.every((r) => r.artikalId && r.brojLota.trim() && Number(r.primljenaKolicina) > 0 && (!podRezimom(r.artikalId) || r.temperaturaPrijema.trim() !== "")) &&
    (!procitano || uporedjeno);
  const ostaloZutih = redovi.reduce((n, r) => n + r.nesigurno.length, 0);

  return (
    <Modal naslov="Novi prijem robe" podnaslov="P1" onClose={onClose} greska={greska} footer={<><button className="secondary-button" onClick={onClose}>Otkaži</button><button className="primary-button" onClick={posalji} disabled={!validno}>Sačuvaj prijem</button></>}>
      {/* Otpremnica: PDF od dobavljača ili fotografija. Čita se na našem serveru, bez spoljnih
          servisa, i samo POPUNI formu — magacioner sve upoređuje sa robom prije snimanja. */}
      <div style={{ margin: "0 20px 12px", padding: 12, border: "1px dashed #c9d4dc", borderRadius: 8 }}>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <label className="secondary-button" style={{ cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 6 }}>
            <Camera size={15} /> Slikaj otpremnicu
            <input type="file" accept="image/*" capture="environment" hidden disabled={!!citam} onChange={(e) => { ucitajOtpremnicu(e.target.files?.[0]); e.target.value = ""; }} />
          </label>
          <label className="secondary-button" style={{ cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 6 }}>
            <FileText size={15} /> Učitaj PDF ili sliku
            <input type="file" accept="application/pdf,image/*" hidden disabled={!!citam} onChange={(e) => { ucitajOtpremnicu(e.target.files?.[0]); e.target.value = ""; }} />
          </label>
          {citam && <span className="muted-text" style={{ fontSize: 11 }}>{citam === "pdf" ? "Čitam PDF…" : "Čitam sliku… (do pola minuta)"}</span>}
        </div>
        {!procitano && !citam && (
          <p className="muted-text" style={{ fontSize: 10, margin: "8px 0 0" }}>
            Slikajte cijelu otpremnicu odozgo, ravno i bez sjenke. Aplikacija popuni formu, a vi sve upoređujete sa robom i etiketom.
          </p>
        )}
        {procitano && prijedlog && (
          <div style={{ marginTop: 10, fontSize: 11 }}>
            {procitano.otpremnice.length > 1 && (
              <label style={{ display: "block", marginBottom: 8 }}>
                U fajlu je {procitano.otpremnice.length} otpremnica — izaberite koju primate
                <select value={prijedlog.strana} onChange={(e) => primijeni(procitano.otpremnice.find((o) => o.strana === Number(e.target.value))!)}>
                  {procitano.otpremnice.map((o) => (
                    <option key={o.strana} value={o.strana}>{o.broj ?? `strana ${o.strana}`} · {stavkiPadez(o.stavke.length)}</option>
                  ))}
                </select>
              </label>
            )}
            <div>
              Pročitano: <b>{prijedlog.broj ?? "bez broja"}</b>{prijedlog.datum ? `, ${prijedlog.datum.split("-").reverse().join(".")}.` : ""} · {stavkiPadez(prijedlog.stavke.length)}
              {procitano.vrsta === "slika" && procitano.pouzdanostOcr != null && <> · čitljivost slike {procitano.pouzdanostOcr} %</>}
            </div>
            {prijedlog.temperaturaNaOtpremnici != null && (
              <div className="muted-text" style={{ marginTop: 4 }}>
                Na otpremnici piše {prijedlog.temperaturaNaOtpremnici.toLocaleString("sr-Latn-ME")} °C — to je podatak dobavljača. Izmjerite i upišite svoju temperaturu.
              </div>
            )}
            {prijedlog.upozorenja.map((u) => (
              <div key={u} className="danas-fali" style={{ marginTop: 4 }}><AlertTriangle size={11} style={{ verticalAlign: "-1px" }} /> {u}</div>
            ))}
            {!prijedlog.dobavljac.id && prijedlog.dobavljac.naziv && mozeDodatiDobavljaca && (
              <button className="small-action" style={{ marginTop: 6 }} onClick={dodajDobavljaca}>
                Dodaj dobavljača „{prijedlog.dobavljac.naziv}"{prijedlog.dobavljac.pib ? ` (PIB ${prijedlog.dobavljac.pib})` : ""}
              </button>
            )}
            {ostaloZutih > 0 && <div style={{ marginTop: 4 }}><span style={{ ...ZUTO, padding: "0 4px", border: "1px solid" }}>Žuta polja</span> je aplikacija nesigurno pročitala — pogledajte ih posebno.</div>}
          </div>
        )}
      </div>

      <div className="form-grid">
        <label>
          Dobavljač
          <select value={dobavljacId} onChange={(e) => setDobavljacId(e.target.value)} style={prijedlog && !prijedlog.dobavljac.sigurno ? ZUTO : undefined}>
            {!dobavljacId && <option value="">— izaberite dobavljača —</option>}
            {dobavljaci.map((d) => <option key={d.id} value={d.id}>{d.naziv}</option>)}
          </select>
        </label>
        <label>Datum prijema<input type="date" value={datum} onChange={(e) => setDatum(e.target.value)} /></label>
        {skladista.length > 0 && (
          <label style={{ gridColumn: "1 / -1" }}>
            U magacin
            <select value={skladisteId} onChange={(e) => setSkladisteId(e.target.value)}>
              {skladista.map((sk) => <option key={sk.id} value={sk.id}>{sk.naziv}</option>)}
            </select>
          </label>
        )}
        <label style={{ gridColumn: "1 / -1" }}>Broj dokumenta (otpremnica)<input value={brojDokumenta} onChange={(e) => setBrojDokumenta(e.target.value)} /></label>
      </div>
      <div style={{ padding: "0 20px" }}>
        {redovi.map((red, i) => {
          const po = red.poOtpremnici;
          const razlika = po?.kolicina != null && red.primljenaKolicina !== "" ? Number(red.primljenaKolicina) - Number(po.kolicina) : 0;
          return (
            <div key={i} style={{ padding: "10px 0", borderTop: "1px solid #edf1f3" }}>
              {po && (
                <div className="muted-text" style={{ fontSize: 10, marginBottom: 4 }}>
                  Na otpremnici: {[po.sifra, po.naziv, po.kolicina != null ? `${po.kolicina} ${po.jm ?? ""}`.trim() : null].filter(Boolean).join(" · ")}
                </div>
              )}
              <div className="form-grid" style={{ padding: 0 }}>
                <label>
                  Artikal
                  <select value={red.artikalId} onChange={(e) => azurirajRed(i, { artikalId: e.target.value }, "artikal")} style={nesigurno(red, "artikal")}>
                    {!red.artikalId && <option value="">— izaberite vaš artikal —</option>}
                    {artikli.map((a) => <option key={a.id} value={a.id}>{a.naziv}</option>)}
                  </select>
                </label>
                <label>
                  Broj lota <ZakonskaOznaka clan="27" />
                  <input value={red.brojLota} onChange={(e) => azurirajRed(i, { brojLota: e.target.value }, "lot")} placeholder="npr. MLJ-2609-A" style={nesigurno(red, "lot")} />
                  {po?.lot && red.brojLota.trim() && red.brojLota.trim().toUpperCase() !== po.lot.toUpperCase() && (
                    <small className="danas-fali" style={{ fontWeight: 400 }}>razlikuje se od otpremnice ({po.lot})</small>
                  )}
                </label>
                <label>
                  Rok trajanja
                  <input type="date" value={red.rokTrajanja} onChange={(e) => azurirajRed(i, { rokTrajanja: e.target.value }, "rok")} style={nesigurno(red, "rok")} />
                  {red.rokTrajanja && red.rokTrajanja < datum && <small className="danas-fali" style={{ fontWeight: 400 }}>rok je istekao — ne može se prihvatiti</small>}
                </label>
                <label>
                  {po?.kolicina != null ? "Primljeno (izbrojano)" : "Količina"}
                  <input type="number" value={red.primljenaKolicina} onChange={(e) => azurirajRed(i, { primljenaKolicina: e.target.value }, "kolicina")} style={nesigurno(red, "kolicina")} />
                  {razlika !== 0 && <small className="danas-fali" style={{ fontWeight: 400 }}>{razlika < 0 ? "manjak" : "višak"} {Math.abs(razlika)} u odnosu na otpremnicu</small>}
                </label>
                <label>
                  Temperatura pri prijemu (°C) {podRezimom(red.artikalId) && <span className="danas-fali" style={{ fontWeight: 400 }}>(obavezno)</span>} <ZakonskaOznaka clan="36" />
                  <input type="number" step="0.1" value={red.temperaturaPrijema} onChange={(e) => azurirajRed(i, { temperaturaPrijema: e.target.value })} />
                  {podRezimom(red.artikalId) && !red.temperaturaPrijema.trim() && <small className="muted-text">Izmjerite temperaturu robe — KKT 1.</small>}
                </label>
                {redovi.length > 1 && (
                  <button type="button" className="link-button" style={{ alignSelf: "end" }} onClick={() => setRedovi((r) => r.filter((_, idx) => idx !== i))}>Ukloni stavku</button>
                )}
              </div>
            </div>
          );
        })}
        <button className="link-button" onClick={dodajRed} style={{ marginTop: 8 }}>
          <Plus size={14} /> Dodaj stavku
        </button>
        {procitano && (
          <label style={{ display: "flex", flexDirection: "row", alignItems: "center", gap: 8, margin: "12px 0 4px", fontSize: 12, cursor: "pointer" }}>
            <input type="checkbox" checked={uporedjeno} onChange={(e) => setUporedjeno(e.target.checked)} style={{ width: "auto", height: "auto" }} />
            Svaku stavku sam uporedio/la sa robom i etiketom — artikal, lot, rok i količina su tačni.
          </label>
        )}
      </div>
    </Modal>
  );
}
