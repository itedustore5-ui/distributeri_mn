import "dotenv/config";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express, { type NextFunction, type Request, type Response } from "express";
import { createServer as createViteServer, type ViteDevServer } from "vite";
import { greskaHandler } from "./greske.js";
import { zahtjevAppZaglavlje, requireAuth } from "./auth.js";
import { provjeriRute } from "./provjeraRuta.js";

import { authRuter, authJavniRuter } from "./routes/auth.js";
import { ljudiRuter } from "./routes/ljudi.js";
import { sifarniciRuter } from "./routes/sifarnici.js";
import { prijemRuter } from "./routes/prijem.js";
import { zalihaRuter } from "./routes/zaliha.js";
import { haccpRuter } from "./routes/haccp.js";
import { ncRuter } from "./routes/neusaglasenosti.js";
import { vozilaRuter } from "./routes/vozila.js";
import { isporukaRuter } from "./routes/isporuka.js";
import { zadaciRuter } from "./routes/zadaci.js";
import { porukeRuter } from "./routes/poruke.js";
import { sledljivostRuter } from "./routes/sledljivost.js";
import { izvozRuter } from "./routes/izvoz.js";
import { auditRuter } from "./routes/audit.js";
import { tablaRuter } from "./routes/tabla.js";
import { provjeraZnanjaRuter, provjeraZnanjaJavniRuter } from "./routes/provjeraZnanja.js";
import { firmaRuter } from "./routes/firma.js";
import { haccpPlanRuter } from "./routes/haccpPlan.js";
import { povlacenjeRuter } from "./routes/povlacenje.js";
import { bekapRuter } from "./routes/bekap.js";
import { pushRuter } from "./routes/push.js";
import { pokreniSlanjePush } from "./services/pushService.js";
import { pokreniSedmicniBekap } from "./services/bekapService.js";
import { pripremiSesije } from "./auth.js";

const port = Number(process.env.PORT || 5000);
const isProduction = process.env.NODE_ENV === "production";
// Render sam postavlja RENDER_GIT_COMMIT — izdanje je commit koji STVARNO radi, pa se u
// /api/zdravlje (i u dnu menija) vidi je li deploy prošao. Lokalno: "lokalno".
const IZDANJE = process.env.RENDER_GIT_COMMIT?.slice(0, 7) ?? "lokalno";

const app = express();
app.disable("x-powered-by");
app.use(express.json({ limit: "200kb" })); // MORA ostati i MORA biti prvo

app.use((_request, response, next) => {
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.setHeader("X-Frame-Options", "DENY");
  response.setHeader("Referrer-Policy", "same-origin");
  if (!_request.path.startsWith("/api")) {
    next();
    return;
  }
  response.setHeader("Cache-Control", "no-store");
  next();
});

app.use("/api", zahtjevAppZaglavlje);

// ── JAVNO: jedino što radi bez prijave (nalaz A3, faza 4) ──
app.get("/api/zdravlje", (_request, response) => {
  response.json({ ok: true, izdanje: IZDANJE });
});
app.use("/api", authJavniRuter); // prijava, odjava
app.use("/api", provjeraZnanjaJavniRuter); // ulazak šifrom (invarijanta #32)

// ── GRANICA PRIJAVE: sve ispod traži sesiju. Ruteri NE kače requireAuth sami i nemaju svoj
// .use — uloge stoje na svakoj ruti, a provjeriRute() ispod to provjerava pri pokretanju. ──
app.use("/api", requireAuth);
app.use("/api", authRuter);
app.use("/api", provjeraZnanjaRuter);
app.use("/api", ljudiRuter);
app.use("/api", sifarniciRuter);
app.use("/api", prijemRuter);
app.use("/api", zalihaRuter);
app.use("/api", haccpRuter);
app.use("/api", ncRuter);
app.use("/api", vozilaRuter);
app.use("/api", isporukaRuter);
app.use("/api", zadaciRuter);
app.use("/api", porukeRuter);
app.use("/api", sledljivostRuter);
app.use("/api", izvozRuter);
app.use("/api", auditRuter);
app.use("/api", tablaRuter);
app.use("/api", firmaRuter);
app.use("/api", haccpPlanRuter);
app.use("/api", povlacenjeRuter);
app.use("/api", bekapRuter);
app.use("/api", pushRuter);

app.use("/api", (_request: Request, response: Response, _next: NextFunction) => {
  response.status(404).json({ error: { code: "RUTA_NE_POSTOJI", message: "Traženi API resurs ne postoji." } });
});

app.use(greskaHandler);

// Ruta bez uloga, ruter sa svojim .use ili zaštićen ruter ispred granice: u razvoju server ne
// kreće (greška se vidi odmah), u produkciji se samo zapiše — klijent ne ostaje bez aplikacije.
const prekrsajiRuta = provjeriRute(app);
if (prekrsajiRuta.length) {
  const poruka = `Prava na rutama nisu podešena kako treba:\n  - ${prekrsajiRuta.join("\n  - ")}`;
  if (isProduction) console.error(poruka);
  else throw new Error(poruka);
}

const rootDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(rootDirectory, "..");

const start = async () => {
  let vite: ViteDevServer | undefined;
  // SAMO_API=1: server bez stranica — izolovani testovi (testovi/izolovano.mjs) zovu samo /api, a
  // Vite bi se sudario sa „npm run dev" koji možda radi u drugom prozoru.
  if (process.env.SAMO_API === "1") {
    // ništa — samo /api
  } else if (!isProduction) {
    vite = await createViteServer({
      configFile: path.resolve(projectRoot, "vite.config.ts"),
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(projectRoot, "dist");
    app.use(express.static(distPath, { index: false }));
    app.use((request, response, next) => {
      if (request.method !== "GET" || request.path.startsWith("/api/")) {
        next();
        return;
      }
      response.sendFile(path.join(distPath, "index.html"));
    });
  }

  try {
    await pripremiSesije();
  } catch (e) {
    // Server se ipak diže (da /api/zdravlje javi stanje), ali prijava neće raditi dok baza ne odgovori.
    console.error("Tabela sesija nije spremna — prijava neće raditi:", e);
  }

  const server = app.listen(port, "0.0.0.0", () => {
    console.log(`PILOT DISTRIBUTERI CG sluša na 0.0.0.0:${port} (${isProduction ? "produkcija" : "razvoj"}, izdanje ${IZDANJE})`);
  });
  pokreniSedmicniBekap();
  pokreniSlanjePush().catch((e) => console.error("Push obavještenja nisu pokrenuta:", e));

  const shutdown = async () => {
    await vite?.close();
    server.close();
  };
  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);
};

start().catch((error) => {
  console.error(error);
  process.exit(1);
});
