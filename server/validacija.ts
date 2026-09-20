import type { ZodType } from "zod";
import { ApiGreska } from "./greske.js";

/** Express tipizira route parametre kao string | string[] (ponavljajući segmenti puta).
 * Naši parametri su uvijek jednostruki — ovo je samo pouzdano suženje tipa. */
export function str(vrijednost: string | string[] | undefined): string {
  return Array.isArray(vrijednost) ? vrijednost[0] : (vrijednost ?? "");
}

export function tijelo<T>(schema: ZodType<T>, sirovoTijelo: unknown): T {
  const rezultat = schema.safeParse(sirovoTijelo);
  if (!rezultat.success) {
    throw new ApiGreska(400, "NEVALIDAN_UNOS", "Podaci nisu ispravni — provjerite označena polja.", {
      greske: rezultat.error.issues.map((i) => ({ putanja: i.path.join("."), poruka: i.message })),
    });
  }
  return rezultat.data;
}
