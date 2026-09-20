import { Navigate, Route, Routes, BrowserRouter } from "react-router-dom";
import type { ReactNode } from "react";
import { AuthProvider, useAuth, type Uloga } from "./lib/auth";
import { Layout } from "./components/Layout";
import { Ucitavanje } from "./components/Zajednicko";
import { Prijava } from "./pages/Prijava";
import { Tabla } from "./pages/Tabla";
import { Ljudi } from "./pages/Ljudi";
import { Prijem } from "./pages/Prijem";
import { Zalihe } from "./pages/Zalihe";
import { Haccp } from "./pages/Haccp";
import { Neusaglasenosti } from "./pages/Neusaglasenosti";
import { Vozila } from "./pages/Vozila";
import { Isporuka } from "./pages/Isporuka";
import { Moja } from "./pages/Moja";
import { Sledljivost } from "./pages/Sledljivost";
import { Prilozi } from "./pages/Prilozi";
import { Izvjestaji } from "./pages/Izvjestaji";
import { Audit } from "./pages/Audit";
import { ProvjeraZnanja } from "./pages/ProvjeraZnanja";
import { Admin } from "./pages/Admin";

function Zasticeno({ uloge, children }: { uloge?: Uloga[]; children: ReactNode }) {
  const { korisnik, ucitavanje } = useAuth();
  if (ucitavanje) return <Ucitavanje />;
  if (!korisnik) return <Navigate to="/prijava" replace />;
  if (uloge && !uloge.includes(korisnik.uloga)) return <Navigate to="/moja" replace />;
  return <Layout>{children}</Layout>;
}

function PocetnaPreusmjeri() {
  const { korisnik, ucitavanje } = useAuth();
  if (ucitavanje) return <Ucitavanje />;
  if (!korisnik) return <Navigate to="/prijava" replace />;
  const cilj = korisnik.uloga === "bzr" || korisnik.uloga === "izvodjac" || korisnik.uloga === "uprava" ? "/tabla" : "/moja";
  return <Navigate to={cilj} replace />;
}

function Rute() {
  const { korisnik, ucitavanje } = useAuth();
  return (
    <Routes>
      <Route path="/prijava" element={ucitavanje ? <Ucitavanje /> : korisnik ? <Navigate to="/" replace /> : <Prijava />} />
      <Route path="/provjera-znanja" element={<ProvjeraZnanja />} />
      <Route path="/" element={<PocetnaPreusmjeri />} />
      <Route path="/tabla" element={<Zasticeno uloge={["bzr", "izvodjac", "uprava"]}><Tabla /></Zasticeno>} />
      <Route path="/moja" element={<Zasticeno><Moja /></Zasticeno>} />
      <Route path="/ljudi" element={<Zasticeno uloge={["bzr", "izvodjac"]}><Ljudi /></Zasticeno>} />
      <Route path="/prijem" element={<Zasticeno uloge={["operater", "bzr", "izvodjac"]}><Prijem /></Zasticeno>} />
      <Route path="/zalihe" element={<Zasticeno uloge={["operater", "bzr", "izvodjac", "uprava"]}><Zalihe /></Zasticeno>} />
      <Route path="/haccp" element={<Zasticeno uloge={["operater", "vozac", "bzr", "izvodjac"]}><Haccp /></Zasticeno>} />
      <Route path="/neusaglasenosti" element={<Zasticeno uloge={["operater", "vozac", "bzr", "izvodjac"]}><Neusaglasenosti /></Zasticeno>} />
      <Route path="/vozila" element={<Zasticeno uloge={["vozac", "bzr", "izvodjac"]}><Vozila /></Zasticeno>} />
      <Route path="/isporuka" element={<Zasticeno uloge={["vozac", "operater", "bzr", "izvodjac"]}><Isporuka /></Zasticeno>} />
      <Route path="/sledljivost" element={<Zasticeno uloge={["bzr", "izvodjac", "uprava"]}><Sledljivost /></Zasticeno>} />
      <Route path="/prilozi" element={<Zasticeno uloge={["bzr", "izvodjac"]}><Prilozi /></Zasticeno>} />
      <Route path="/izvjestaji" element={<Zasticeno uloge={["bzr", "izvodjac"]}><Izvjestaji /></Zasticeno>} />
      <Route path="/audit" element={<Zasticeno uloge={["bzr", "izvodjac"]}><Audit /></Zasticeno>} />
      <Route path="/admin" element={<Zasticeno uloge={["izvodjac"]}><Admin /></Zasticeno>} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Rute />
      </AuthProvider>
    </BrowserRouter>
  );
}
