import "dotenv/config";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express, { type NextFunction, type Request, type Response } from "express";
import { createServer as createViteServer, type ViteDevServer } from "vite";
import { greskaHandler } from "./greske.js";
import { zahtjevAppZaglavlje } from "./auth.js";

import { authRuter } from "./routes/auth.js";
import { ljudiRuter } from "./routes/ljudi.js";
import { sifarniciRuter } from "./routes/sifarnici.js";
import { prijemRuter } from "./routes/prijem.js";
import { zalihaRuter } from "./routes/zaliha.js";
import { haccpRuter } from "./routes/haccp.js";
import { ncRuter } from "./routes/neusaglasenosti.js";
import { vozilaRuter } from "./routes/vozila.js";
import { isporukaRuter } from "./routes/isporuka.js";
import { zadaciRuter } from "./routes/zadaci.js";
import { sledljivostRuter } from "./routes/sledljivost.js";
import { izvozRuter } from "./routes/izvoz.js";
import { auditRuter } from "./routes/audit.js";
import { tablaRuter } from "./routes/tabla.js";
import { provjeraZnanjaRuter } from "./routes/provjeraZnanja.js";
import { firmaRuter } from "./routes/firma.js";
import { povlacenjeRuter } from "./routes/povlacenje.js";

const port = Number(process.env.PORT || 5000);
const isProduction = process.env.NODE_ENV === "production";
const IZDANJE = "1.0.0";

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
app.use("/api", authRuter);
app.use("/api", ljudiRuter);
app.use("/api", sifarniciRuter);
app.use("/api", prijemRuter);
app.use("/api", zalihaRuter);
app.use("/api", haccpRuter);
app.use("/api", ncRuter);
app.use("/api", vozilaRuter);
app.use("/api", isporukaRuter);
app.use("/api", zadaciRuter);
app.use("/api", sledljivostRuter);
app.use("/api", izvozRuter);
app.use("/api", auditRuter);
app.use("/api", tablaRuter);
app.use("/api", provjeraZnanjaRuter);
app.use("/api", firmaRuter);
app.use("/api", povlacenjeRuter);

app.get("/api/zdravlje", (_request, response) => {
  response.json({ ok: true, izdanje: IZDANJE });
});

app.use("/api", (_request: Request, response: Response, _next: NextFunction) => {
  response.status(404).json({ error: { code: "RUTA_NE_POSTOJI", message: "Traženi API resurs ne postoji." } });
});

app.use(greskaHandler);

const rootDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(rootDirectory, "..");

const start = async () => {
  let vite: ViteDevServer | undefined;
  if (!isProduction) {
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

  const server = app.listen(port, "0.0.0.0", () => {
    console.log(`PILOT DISTRIBUTERI CG sluša na 0.0.0.0:${port} (${isProduction ? "produkcija" : "razvoj"}, izdanje ${IZDANJE})`);
  });

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
