import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AlertTriangle, Thermometer, Truck, PackageX, Clock3, BookOpen, ArrowDownToLine, PackageCheck, PhoneCall, ClipboardList } from "lucide-react";
import { api } from "../lib/api";
import { PageHeader } from "../components/Zajednicko";

type TablaPodaci = {
  kriticno: {
    neusaglasenostiVisoke: number;
    neusaglasenostiOtvorene: number;
    temperatureVanOpsega: number;
    vozilaNijeSpremno: number;
    lotoviNaHoldu: number;
    zadaciZakasnili: number;
    knjizicIstice: number;
    povlacenjaUToku: number;
  };
  operativno: { prijemiDanas: number; isporukeDanas: number; zapisiDanas: number };
};

export function Tabla() {
  const [podaci, setPodaci] = useState<TablaPodaci | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    api<TablaPodaci>("/tabla").then(setPodaci);
  }, []);

  if (!podaci) return null;
  const k = podaci.kriticno;

  const kriticneKartice = [
    { naslov: "Povlačenja u toku", vrijednost: k.povlacenjaUToku, ikonica: <PhoneCall size={18} />, putanja: "/sledljivost", tona: "danger" },
    { naslov: "Otvorene neusaglašenosti", vrijednost: k.neusaglasenostiOtvorene, ikonica: <AlertTriangle size={18} />, putanja: "/neusaglasenosti", tona: k.neusaglasenostiVisoke > 0 ? "danger" : "warning" },
    { naslov: "Temperature van opsega (24h)", vrijednost: k.temperatureVanOpsega, ikonica: <Thermometer size={18} />, putanja: "/haccp", tona: k.temperatureVanOpsega > 0 ? "danger" : "warning" },
    { naslov: "Vozila nisu spremna", vrijednost: k.vozilaNijeSpremno, ikonica: <Truck size={18} />, putanja: "/vozila", tona: k.vozilaNijeSpremno > 0 ? "danger" : "warning" },
    { naslov: "Lotovi na HOLD-u", vrijednost: k.lotoviNaHoldu, ikonica: <PackageX size={18} />, putanja: "/zalihe", tona: k.lotoviNaHoldu > 0 ? "danger" : "warning" },
    { naslov: "Zakašnjeli zadaci", vrijednost: k.zadaciZakasnili, ikonica: <Clock3 size={18} />, putanja: "/moja", tona: k.zadaciZakasnili > 0 ? "danger" : "warning" },
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
          <button key={kartica.naslov} className={`alert-card ${kartica.vrijednost > 0 ? kartica.tona : "neutral"}`} onClick={() => navigate(kartica.putanja)}>
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
    </>
  );
}
