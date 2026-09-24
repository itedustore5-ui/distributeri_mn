export class ApiGreska extends Error {
  code: string;
  details: Record<string, unknown>;
  status: number;

  constructor(status: number, code: string, message: string, details: Record<string, unknown> = {}) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

type Opcije = {
  method?: "GET" | "POST" | "PATCH" | "DELETE";
  telo?: unknown;
};

export async function api<T = unknown>(putanja: string, opcije: Opcije = {}): Promise<T> {
  const metoda = opcije.method ?? (opcije.telo ? "POST" : "GET");
  const zaglavlja: Record<string, string> = { "x-zahtjev-app": "1" };
  if (opcije.telo !== undefined) zaglavlja["Content-Type"] = "application/json";

  const odgovor = await fetch(`/api${putanja}`, {
    method: metoda,
    credentials: "include",
    headers: zaglavlja,
    body: opcije.telo !== undefined ? JSON.stringify(opcije.telo) : undefined,
  });

  if (odgovor.status === 204) return undefined as T;

  const tekst = await odgovor.text();
  const podaci = tekst ? JSON.parse(tekst) : null;

  if (!odgovor.ok) {
    const greska = podaci?.error;
    throw new ApiGreska(odgovor.status, greska?.code ?? "GRESKA", greska?.message ?? "Došlo je do greške.", greska?.details ?? {});
  }
  return podaci as T;
}

/** Šalje fajl (PDF, slika) kao sirovo tijelo zahtjeva — bez base64 naduvavanja. */
export async function posaljiFajl<T = unknown>(putanja: string, fajl: Blob, nazivFajla: string): Promise<T> {
  const odgovor = await fetch(`/api${putanja}`, {
    method: "POST",
    credentials: "include",
    headers: { "x-zahtjev-app": "1", "Content-Type": fajl.type || "application/octet-stream", "x-naziv-fajla": encodeURIComponent(nazivFajla) },
    body: fajl,
  });
  const tekst = await odgovor.text();
  const podaci = tekst ? JSON.parse(tekst) : null;
  if (!odgovor.ok) {
    const greska = podaci?.error;
    throw new ApiGreska(odgovor.status, greska?.code ?? "GRESKA", greska?.message ?? `Slanje nije uspjelo (${odgovor.status}).`, greska?.details ?? {});
  }
  return podaci as T;
}

/** Otvara dokument (PDF, sliku) u novoj kartici — kroz fetch, da se greška vidi (invarijanta #31). */
export async function otvoriFajl(putanja: string) {
  const prozor = window.open("", "_blank");
  const odgovor = await fetch(`/api${putanja}`, { credentials: "include", headers: { "x-zahtjev-app": "1" } });
  if (!odgovor.ok) {
    prozor?.close();
    const podaci = await odgovor.json().catch(() => null);
    throw new ApiGreska(odgovor.status, podaci?.error?.code ?? "GRESKA", podaci?.error?.message ?? `Otvaranje nije uspjelo (${odgovor.status}).`);
  }
  const url = URL.createObjectURL(await odgovor.blob());
  if (prozor) prozor.location.href = url;
  else window.location.href = url;
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

/** Preuzimanje ide kroz fetch, ne kroz <a href> — obično preuzimanje koje padne ne prikaže
 * ništa (izgleda kao pokvareno dugme), a server je vratio 401/409/500 (invarijanta #31). */
export async function preuzmiFajl(putanja: string, nazivFajla: string) {
  const odgovor = await fetch(`/api${putanja}`, { credentials: "include", headers: { "x-zahtjev-app": "1" } });
  if (!odgovor.ok) {
    const podaci = await odgovor.json().catch(() => null);
    throw new ApiGreska(odgovor.status, podaci?.error?.code ?? "GRESKA", podaci?.error?.message ?? `Preuzimanje nije uspjelo (${odgovor.status}).`);
  }
  const blob = await odgovor.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = nazivFajla;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
