import type { ZodTypeAny, output } from "zod";
import { ApiGreska } from "./greske.js";

/** Express tipizira route parametre kao string | string[] (ponavljajući segmenti puta).
 * Naši parametri su uvijek jednostruki — ovo je samo pouzdano suženje tipa. */
export function str(vrijednost: string | string[] | undefined): string {
  return Array.isArray(vrijednost) ? vrijednost[0] : (vrijednost ?? "");
}

/** Vraća IZLAZNI tip šeme — podrazumijevane vrijednosti (`.default()`) su već popunjene. */
export function tijelo<S extends ZodTypeAny>(schema: S, sirovoTijelo: unknown): output<S> {
  const rezultat = schema.safeParse(sirovoTijelo);
  if (!rezultat.success) {
    throw new ApiGreska(400, "NEVALIDAN_UNOS", "Podaci nisu ispravni — provjerite označena polja.", {
      greske: rezultat.error.issues.map((i) => ({ putanja: i.path.join("."), poruka: i.message })),
    });
  }
  return rezultat.data;
}
