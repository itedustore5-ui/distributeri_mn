import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express, { type NextFunction, type Request, type Response } from "express";
import { createServer as createViteServer, type ViteDevServer } from "vite";

type UserRole = "management" | "warehouse" | "driver";
type PageKey =
  | "dashboard"
  | "receipts"
  | "inventory"
  | "orders"
  | "picking"
  | "vehicles"
  | "routes"
  | "deliveries"
  | "haccp"
  | "nc"
  | "tasks"
  | "traceability"
  | "reports"
  | "audit"
  | "settings";

type PublicUser = {
  id: string;
  username: string;
  initials: string;
  firstName: string;
  name: string;
  role: UserRole;
  roleLabel: string;
  facility: string;
};

type StoredUser = PublicUser & {
  passwordHash: string;
};

type Session = {
  userId: string;
  expiresAt: number;
};

type AuthenticatedRequest = Request & {
  user?: StoredUser;
};

const port = Number(process.env.PORT || 5000);
const isProduction = process.env.NODE_ENV === "production";
const sessionSecret = process.env.SESSION_SECRET || (isProduction ? "" : "development-only-session-secret");
if (!sessionSecret) {
  throw new Error("SESSION_SECRET mora biti podešen u produkciji.");
}

const roleAccess: Record<UserRole, PageKey[]> = {
  management: ["dashboard", "receipts", "inventory", "orders", "picking", "vehicles", "routes", "deliveries", "haccp", "nc", "tasks", "traceability", "reports", "audit", "settings"],
  warehouse: ["dashboard", "receipts", "inventory", "picking", "haccp", "tasks"],
  driver: ["dashboard", "vehicles", "routes", "deliveries", "tasks"],
};

const publicUserFields = (user: StoredUser): PublicUser => {
  const { passwordHash: _passwordHash, ...publicUser } = user;
  return publicUser;
};

const hashPassword = (password: string, salt = crypto.randomBytes(16).toString("hex")) => {
  const derivedKey = crypto.scryptSync(password, salt, 64).toString("hex");
  return `scrypt$${salt}$${derivedKey}`;
};

const verifyPassword = (password: string, encodedHash: string) => {
  const [, salt, storedKey] = encodedHash.split("$");
  if (!salt || !storedKey) return false;
  const derivedKey = crypto.scryptSync(password, salt, 64);
  const storedBuffer = Buffer.from(storedKey, "hex");
  return storedBuffer.length === derivedKey.length && crypto.timingSafeEqual(storedBuffer, derivedKey);
};

const seedUsers = (): StoredUser[] => {
  const configuredUsers = process.env.AUTH_USERS_JSON;
  if (configuredUsers) {
    const parsed = JSON.parse(configuredUsers) as StoredUser[];
    if (!Array.isArray(parsed) || parsed.some((user) => !user.passwordHash)) {
      throw new Error("AUTH_USERS_JSON mora biti niz korisnika sa passwordHash vrednostima.");
    }
    return parsed;
  }
  if (isProduction) {
    throw new Error("U produkciji je potreban AUTH_USERS_JSON sa hashiranim lozinkama.");
  }
  return [
    { id: "marko", username: "marko", passwordHash: hashPassword("Marko#2026"), initials: "MP", firstName: "Marko", name: "Marko Petrović", role: "management", roleLabel: "Odgovorno lice", facility: "Centralni magacin" },
    { id: "nikola", username: "nikola", passwordHash: hashPassword("Nikola#2026"), initials: "NV", firstName: "Nikola", name: "Nikola Vuković", role: "warehouse", roleLabel: "Magacioner", facility: "Centralni magacin" },
    { id: "petar", username: "petar", passwordHash: hashPassword("Petar#2026"), initials: "PJ", firstName: "Petar", name: "Petar Janković", role: "driver", roleLabel: "Vozač", facility: "Distribucija · Ruta 091" },
  ];
};

const users = seedUsers();
const sessions = new Map<string, Session>();
const failedLogins = new Map<string, { attempts: number; resetAt: number }>();
const sessionCookie = "pilot_session";
const sessionDurationMs = 8 * 60 * 60 * 1000;

const cookieValue = (request: Request, name: string) => {
  const header = request.headers.cookie || "";
  const match = header.split(";").map((part) => part.trim()).find((part) => part.startsWith(`${name}=`));
  return match ? decodeURIComponent(match.slice(name.length + 1)) : undefined;
};

const setSessionCookie = (response: Response, token: string) => {
  response.setHeader("Set-Cookie", `${sessionCookie}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${sessionDurationMs / 1000}${isProduction ? "; Secure" : ""}`);
};

const clearSessionCookie = (response: Response) => {
  response.setHeader("Set-Cookie", `${sessionCookie}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${isProduction ? "; Secure" : ""}`);
};

const sessionToken = () => crypto.randomBytes(32).toString("base64url");

const getSessionUser = (request: Request) => {
  const token = cookieValue(request, sessionCookie);
  if (!token) return undefined;
  const session = sessions.get(token);
  if (!session || session.expiresAt <= Date.now()) {
    if (session) sessions.delete(token);
    return undefined;
  }
  return users.find((user) => user.id === session.userId);
};

const requireAuth = (request: AuthenticatedRequest, response: Response, next: NextFunction) => {
  const user = getSessionUser(request);
  if (!user) {
    response.status(401).json({ error: "UNAUTHENTICATED", message: "Prijava je potrebna." });
    return;
  }
  request.user = user;
  next();
};

const requirePageAccess = (page: PageKey) => (request: AuthenticatedRequest, response: Response, next: NextFunction) => {
  if (!request.user || !roleAccess[request.user.role].includes(page)) {
    response.status(403).json({ error: "FORBIDDEN", message: "Ova uloga nema pristup traženom modulu." });
    return;
  }
  next();
};

const app = express();
app.disable("x-powered-by");
app.use(express.json({ limit: "100kb" }));
app.use((_request, response, next) => {
  response.setHeader("Cache-Control", "no-store");
  next();
});

app.post("/api/auth/login", (request, response) => {
  const username = typeof request.body?.username === "string" ? request.body.username.trim().toLowerCase() : "";
  const password = typeof request.body?.password === "string" ? request.body.password : "";
  const clientKey = request.ip || "unknown";
  const throttle = failedLogins.get(clientKey);
  if (throttle && throttle.resetAt > Date.now() && throttle.attempts >= 8) {
    response.status(429).json({ error: "TOO_MANY_ATTEMPTS", message: "Previše neuspešnih pokušaja. Pokušajte ponovo za nekoliko minuta." });
    return;
  }
  const user = users.find((candidate) => candidate.username === username);
  if (!user || !verifyPassword(password, user.passwordHash)) {
    const nextThrottle = throttle && throttle.resetAt > Date.now() ? throttle : { attempts: 0, resetAt: Date.now() + 10 * 60 * 1000 };
    nextThrottle.attempts += 1;
    failedLogins.set(clientKey, nextThrottle);
    response.status(401).json({ error: "INVALID_CREDENTIALS", message: "Korisničko ime ili lozinka nisu ispravni." });
    return;
  }
  failedLogins.delete(clientKey);
  const token = sessionToken();
  sessions.set(token, { userId: user.id, expiresAt: Date.now() + sessionDurationMs });
  setSessionCookie(response, token);
  response.json({ user: publicUserFields(user), permissions: roleAccess[user.role] });
});

app.get("/api/auth/me", requireAuth, (request: AuthenticatedRequest, response) => {
  response.json({ user: publicUserFields(request.user!), permissions: roleAccess[request.user!.role] });
});

app.post("/api/auth/logout", (request, response) => {
  const token = cookieValue(request, sessionCookie);
  if (token) sessions.delete(token);
  clearSessionCookie(response);
  response.status(204).end();
});

app.get("/api/access/:page", requireAuth, (request: AuthenticatedRequest, response, next) => {
  const page = request.params.page as PageKey;
  if (!roleAccess[request.user!.role].includes(page)) {
    response.status(403).json({ error: "FORBIDDEN", message: "Ova uloga nema pristup traženom modulu." });
    return;
  }
  next();
}, (request, response) => {
  response.json({ allowed: true, page: request.params.page });
});

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
    console.log(`PILOT server listening on 0.0.0.0:${port} (${isProduction ? "production" : "development"})`);
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