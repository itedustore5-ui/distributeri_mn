// Rad na terenu kroz ekran telefona, kao što ga radi čovjek: vozač D1 pa predaja, magacioner mjerenje,
// dnevni obrazac i početak prijema; direktor otvara karticu na Kontrolnom centru.
import { pool, NALOZI } from "../pomoc.mjs";
import { telefon, otvori, siroko, prozor } from "./telefon.mjs";
import { napraviTeren, napraviKomoru, ocisti } from "./priprema.mjs";

export const naziv = "Ekrani: vozač (D1, predaja), magacioner (mjerenje, obrazac, prijem), direktor (kartica)";

export async function pokreni({ provjeri }) {
  const oznaka = `E2EEK${Date.now().toString(36)}`;
  let trag = null;
  try {
    const teren = await napraviTeren(oznaka);
    trag = teren.trag;
    await napraviKomoru(trag);

    // ── Vozač: D1 pa predaja ────────────────────────────────────────────────────────────────
    const vozac = await telefon("petar");
    try {
      await otvori(vozac, "/vozila");
      const kartica = vozac.strana.locator(".vehicle-card", { hasText: teren.registarski });
      await kartica.getByRole("button", { name: "Nova kontrola (D1)" }).click();
      const d1 = prozor(vozac.strana, "Kontrola vozila");
      const sacuvaj = d1.getByRole("button", { name: "Sačuvaj" });
      const prijeOdgovora = await sacuvaj.isDisabled();
      for (const pitanje of ["Tovarni prostor čist", "Oprema ispravna", "Vrata i brtve ispravni"]) await d1.getByLabel(pitanje).selectOption("da");
      await sacuvaj.click();
      await d1.waitFor({ state: "detached", timeout: 15_000 });
      await kartica.getByText("Spremno danas").waitFor({ timeout: 10_000 });
      provjeri("Vozač: D1 — „Sačuvaj“ čeka sve odgovore, pa vozilo postaje „Spremno danas“", prijeOdgovora);

      await otvori(vozac, "/isporuka");
      const red = vozac.strana.locator("tr", { hasText: teren.broj });
      await red.getByRole("button", { name: "Potvrdi" }).click();
      const potvrda = prozor(vozac.strana, `Potvrda isporuke ${teren.broj}`);
      await potvrda.getByRole("button", { name: "Potvrdi" }).click();
      await potvrda.waitFor({ state: "detached", timeout: 15_000 });
      const status = (await pool.query(`select status, potvrda_van_mreze from isporuka where id = $1`, [teren.isporukaId])).rows[0];
      provjeri("Vozač: predaja kroz ekran — isporuka potvrđena (sa mrežom, bez oznake „bez mreže“)", status?.status === "POTVRDJENA" && status.potvrda_van_mreze === false, JSON.stringify(status));
      const s = await siroko(vozac.strana);
      provjeri("…ekran isporuke ne viri van telefona, bez greške", s.visak === 0 && vozac.greske.length === 0, `${s.visak}px ${s.krivi.join(",")} ${vozac.greske.join(" | ")}`);
    } finally {
      await vozac.zatvori();
    }

    // ── Magacioner: mjerenje, obrazac, prijem ──────────────────────────────────────────────
    const magacioner = await telefon("marko");
    try {
      await otvori(magacioner, "/haccp");
      await magacioner.strana.getByRole("button", { name: "Novo mjerenje" }).click();
      const m = prozor(magacioner.strana, "Novo temperaturno mjerenje");
      await m.getByLabel("Kontrolna tačka").selectOption({ label: `${oznaka} komora` });
      await m.getByLabel("Vrijednost").fill("3.4");
      const termometar = m.locator("select").filter({ has: magacioner.strana.locator("option", { hasText: `${oznaka} termometar` }) });
      await termometar.selectOption({ label: await termometar.locator("option", { hasText: `${oznaka} termometar` }).first().textContent() });
      await m.getByRole("button", { name: "Sačuvaj" }).click();
      const rezultat = prozor(magacioner.strana, "Mjerenje zabilježeno");
      await rezultat.waitFor({ timeout: 15_000 });
      await rezultat.locator(".modal-footer").getByRole("button", { name: "Zatvori" }).click();
      const mjerenje = (await pool.query(`select vrijednost::float as v, mjerni_uredjaj_id from mjerenje_temperature where kontrolna_tacka_id = $1`, [trag.tacka])).rows;
      provjeri("Magacioner: mjerenje kroz ekran — upisano sa izabranim termometrom", mjerenje.length === 1 && mjerenje[0].v === 3.4 && mjerenje[0].mjerni_uredjaj_id === trag.uredjaj, JSON.stringify(mjerenje));

      const t0 = new Date();
      await magacioner.strana.getByRole("button", { name: /^P9 — / }).click();
      const z = prozor(magacioner.strana, "P9");
      const sacuvajZ = z.getByRole("button", { name: "Sačuvaj" });
      const zakljucano = await sacuvajZ.isDisabled();
      for (const izbor of await z.locator("select").all()) await izbor.selectOption("da");
      await sacuvajZ.click();
      await z.waitFor({ state: "detached", timeout: 15_000 });
      const zapis = (await pool.query(`select id from zapis where uneo_korisnik_id = $1 and obrazac_kod = 'P9' and created_at >= $2 order by created_at desc`, [NALOZI.marko.id, t0])).rows;
      trag.zapisi.push(...zapis.map((r) => r.id));
      provjeri("Magacioner: obrazac P9 — bez odgovora se ne čuva, sa odgovorima je upisan", zakljucano && zapis.length === 1, `${zakljucano} ${zapis.length}`);

      await otvori(magacioner, "/prijem");
      await magacioner.strana.getByRole("button", { name: "Novi prijem" }).click();
      const prijem = prozor(magacioner.strana, "Novi prijem robe");
      await prijem.getByText("Kako unosite prijem?").waitFor({ timeout: 10_000 });
      const izbori = await Promise.all(["Slikaj otpremnicu", "Učitaj PDF ili sliku", "Upiši ručno"].map((x) => prijem.getByText(x).isVisible()));
      const s = await siroko(magacioner.strana);
      provjeri("Magacioner: prijem prvo pita kako se unosi (slikaj / PDF / ručno), prozor ne viri van ekrana", izbori.every(Boolean) && s.visak === 0, `${izbori} ${s.visak}px ${s.krivi.join(",")}`);
      provjeri("…bez greške u konzoli", magacioner.greske.length === 0, magacioner.greske.join(" | "));
    } finally {
      await magacioner.zatvori();
    }

    // ── Direktor: kartica otvara listu iza broja ───────────────────────────────────────────
    const direktor = await telefon("direktor");
    try {
      await otvori(direktor, "/tabla");
      await direktor.strana.locator("button.stat-card", { hasText: "Prijemi danas" }).click();
      const lista = direktor.strana.locator(".modal");
      await lista.waitFor({ timeout: 10_000 });
      const tekst = await lista.innerText();
      provjeri("Direktor: kartica „Prijemi danas“ otvara listu iza broja (današnji prijem se vidi)", tekst.includes(oznaka), tekst.slice(0, 200));
      provjeri("…bez greške u konzoli", direktor.greske.length === 0, direktor.greske.join(" | "));
    } finally {
      await direktor.zatvori();
    }
  } finally {
    if (trag) await ocisti(trag);
  }
}
