import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AlertTriangle, Thermometer, Truck, PackageX, Clock3, BookOpen, ArrowDownToLine, PackageCheck, PhoneCall, ClipboardList, DatabaseBackup } from "lucide-react";
import { api, ApiGreska, preuzmiFajl } from "../lib/api";
import { lokalniDatum } from "../lib/vrijeme";
import { PageHeader } from "../components/Zajednicko";
import { ListaZadataka } from "../components/Zadaci";
import { useAuth } from "../lib/auth";

type BekapMeta = { id: string; tip: string; broj_tabela: number; broj_redova: number; created_at: string };

type TablaPodaci = {
  kriticno: {
    neusaglasenostiVisoke: number;
    neusaglasenostiOtvorene: number;
    temperatureVanOpsega: number;
    vozilaNijeSpremno: number;
    lotoviNaHoldu: number;
    zadaciZakasnili: number;
    zadaciOtvoreni: number;
    knjizicIstice: number;
    povlacenjaUToku: number;
  };
  operativno: { prijemiDanas: number; isporukeDanas: number; zapisiDanas: number };
};

export function Tabla() {
  const { korisnik } = useAuth();
  const [podaci, setPodaci] = useState<TablaPodaci | null>(null);
  const [bekap, setBekap] = useState<BekapMeta | null | undefined>(undefined);
  const [bekapUToku, setBekapUToku] = useState(false);
  const [bekapGreska, setBekapGreska] = useState("");
  const navigate = useNavigate();

  const mozeBekap = korisnik?.uloga === "bzr" || korisnik?.uloga === "izvodjac";

  useEffect(() => {
    api<TablaPodaci>("/tabla").then(setPodaci);
    if (mozeBekap) api<BekapMeta | null>("/bekap/poslednji").then(setBekap);
  }, [mozeBekap]);

  const napraviBekap = async () => {
    setBekapUToku(true);
    setBekapGreska("");
    try {
      const rezultat = await api<BekapMeta>("/bekap", { method: "POST" });
      setBekap(rezultat);
      await preuzmiFajl(`/bekap/${rezultat.id}/preuzmi`, `bekap-cg-${lokalniDatum()}.json`);
    } catch (e) {
      setBekapGreska(e instanceof ApiGreska ? e.message : "Bekap nije napravljen.");
    } finally {
      setBekapUToku(false);
    }
  };

  if (!podaci) return null;
  const k = podaci.kriticno;

  const kriticneKartice = [
    { naslov: "Povlačenja u toku", vrijednost: k.povlacenjaUToku, ikonica: <PhoneCall size={18} />, putanja: "/sledljivost", tona: "danger" },
    { naslov: "Otvorene neusaglašenosti", vrijednost: k.neusaglasenostiOtvorene, ikonica: <AlertTriangle size={18} />, putanja: "/neusaglasenosti", tona: k.neusaglasenostiVisoke > 0 ? "danger" : "warning" },
    { naslov: "Temperature van opsega (24h)", vrijednost: k.temperatureVanOpsega, ikonica: <Thermometer size={18} />, putanja: "/haccp", tona: k.temperatureVanOpsega > 0 ? "danger" : "warning" },
    { naslov: "Vozila nisu spremna", vrijednost: k.vozilaNijeSpremno, ikonica: <Truck size={18} />, putanja: "/vozila", tona: k.vozilaNijeSpremno > 0 ? "danger" : "warning" },
    { naslov: "Lotovi na HOLD-u", vrijednost: k.lotoviNaHoldu, ikonica: <PackageX size={18} />, putanja: "/zalihe", tona: k.lotoviNaHoldu > 0 ? "danger" : "warning" },
    { naslov: "Zakašnjeli zadaci", vrijednost: k.zadaciZakasnili, ikonica: <Clock3 size={18} />, putanja: "#zadaci", tona: k.zadaciZakasnili > 0 ? "danger" : "warning" },
    { naslov: "Knjižice ističu/istekle", vrijednost: k.knjizicIstice, ikonica: <BookOpen size={18} />, putanja: "/ljudi", tona: k.knjizicIstice > 0 ? "danger" : "warning" },
  ];

  return (
    <>
      <PageHeader title="Kontrolni centar" description="Ovo nije forma za unos — ovo je pregled onoga što traži pažnju danas." />
      <div className="section-heading">
        <div>
          <h2>Kritično</h2>
          <span>Klik na karticu otvara konkretnu listu.</span>
        </div>
      </div>
      <div className="alert-grid">
        {kriticneKartice.map((kartica) => (
          <button key={kartica.naslov} className={`alert-card ${kartica.vrijednost > 0 ? kartica.tona : "neutral"}`} onClick={() => kartica.putanja.startsWith("#") ? document.getElementById(kartica.putanja.slice(1))?.scrollIntoView({ behavior: "smooth" }) : navigate(kartica.putanja)}>
            <div className="alert-card-icon">{kartica.ikonica}</div>
            <div className="alert-card-content">
              <b>{kartica.vrijednost}</b>
              <strong>{kartica.naslov}</strong>
            </div>
          </button>
        ))}
      </div>

      <div className="section-heading" style={{ marginTop: 26 }}>
        <div>
          <h2>Operativno danas</h2>
        </div>
      </div>
      <div className="stats-grid">
        <button className="stat-card" onClick={() => navigate("/prijem")} style={{ textAlign: "left" }}>
          <div className="stat-icon blue">
            <ArrowDownToLine size={18} />
          </div>
          <div className="stat-copy">
            <span>Prijemi danas</span>
            <strong>{podaci.operativno.prijemiDanas}</strong>
          </div>
        </button>
        <button className="stat-card" onClick={() => navigate("/isporuka")} style={{ textAlign: "left" }}>
          <div className="stat-icon green">
            <PackageCheck size={18} />
          </div>
          <div className="stat-copy">
            <span>Isporuke danas</span>
            <strong>{podaci.operativno.isporukeDanas}</strong>
          </div>
        </button>
        <button className="stat-card" onClick={() => navigate("/haccp")} style={{ textAlign: "left" }}>
          <div className="stat-icon orange">
            <ClipboardList size={18} />
          </div>
          <div className="stat-copy">
            <span>Dnevni zapisi sa terena danas</span>
            <strong>{podaci.operativno.zapisiDanas}</strong>
            <small>P3–P10, svi unosi svih uloga</small>
          </div>
        </button>
      </div>

      <div className="section-heading" id="zadaci" style={{ marginTop: 26 }}>
        <div>
          <h2>Otvoreni zadaci ({k.zadaciOtvoreni})</h2>
          <span>
            {mozeBekap
              ? "Nastaju sami iz neusaglašenosti, povlačenja i kontrole vozila. Dodijelite zadatak nekome — dobiće obavještenje. Zatvara se sam kad se zatvori ono iz čega je nastao."
              : "Nastaju sami iz neusaglašenosti, povlačenja i kontrole vozila."}
          </span>
        </div>
      </div>
      <ListaZadataka samoMoji={false} naslov="Svi otvoreni zadaci" />

      {mozeBekap && (
        <>
          <div className="section-heading" style={{ marginTop: 26 }}>
            <div>
              <h2>Bekap</h2>
              <span>U bazi se čuva 90 dana i pravi se sam jednom sedmično — dugme pravi novi odmah i preuzima ga.</span>
            </div>
          </div>
          <div className="panel" style={{ minHeight: "auto" }}>
            <div style={{ padding: 20, display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
              <div className="stat-icon blue">
                <DatabaseBackup size={18} />
              </div>
              <div style={{ flex: 1, minWidth: 200 }}>
                {bekap === undefined ? (
                  <span className="muted-text">Učitavanje...</span>
                ) : bekap === null ? (
                  <span className="muted-text">Bekap još nije napravljen.</span>
                ) : (
                  <>
                    <strong style={{ display: "block", fontSize: 12 }}>
                      Poslednji: {new Date(bekap.created_at).toLocaleString("sr-Latn-ME")} ({bekap.tip === "RUCNI" ? "ručni" : "automatski"})
                    </strong>
                    <small className="muted-text">{bekap.broj_tabela} tabela · {bekap.broj_redova} redova</small>
                  </>
                )}
                {bekapGreska && <div className="auth-error" style={{ marginTop: 8 }}>{bekapGreska}</div>}
              </div>
              <button className="primary-button" onClick={napraviBekap} disabled={bekapUToku}>
                {bekapUToku ? "Pravim bekap..." : "Preuzmi bekap sada"}
              </button>
            </div>
          </div>
        </>
      )}
    </>
  );
}
