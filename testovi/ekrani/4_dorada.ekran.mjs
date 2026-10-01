// Dorada posle probe vlasnice (01.10.2026) na telefonu: filteri izvještaja i audita, poruke po vremenu,
// plan obuke i pitanja — da se nađu bez traženja.
import { telefon, otvori, siroko, prozor, slikaj } from "./telefon.mjs";

export const naziv = "Ekrani: filteri izvještaja i audita, poruke, plan obuke (odgovorno lice)";

export async function pokreni({ provjeri }) {
  const t = await telefon("ana");
  try {
    // ── Izvještaji: period i kategorije ─────────────────────────────────────────────────────
    await otvori(t, "/izvjestaji");
    await t.strana.getByRole("button", { name: "Lotovi" }).click();
    await t.strana.getByRole("button", { name: "Ovaj mjesec" }).waitFor({ timeout: 10_000 });
    await t.strana.getByRole("button", { name: "Sve", exact: true }).first().click();
    await t.strana.waitForLoadState("networkidle").catch(() => undefined);
    const statusFilter = t.strana.locator(".filter-bar label", { hasText: "Status" }).locator("select");
    const imaStatus = (await statusFilter.count()) > 0;
    if (imaStatus) {
      // Tabela se čita tek kad stigne filtrirani odgovor.
      const odgovor = t.strana.waitForResponse((r) => r.url().includes("f_status=PRIHVACEN"));
      await statusFilter.selectOption("PRIHVACEN");
      await odgovor;
      await t.strana.waitForTimeout(200);
    }
    const statusi = await t.strana.locator(".data-table tbody tr").evaluateAll((r) => r.map((x) => x.textContent ?? ""));
    await slikaj(t.strana, "4-izvjestaj-filteri");
    const s1 = await siroko(t.strana);
    provjeri(
      "Izvještaj: traka perioda i filter po statusu; tabela prati filter; ne viri van ekrana",
      imaStatus && statusi.length > 0 && statusi.every((x) => /Prihvać/i.test(x)) && s1.visak === 0,
      `${imaStatus} ${statusi.length} ${s1.visak}px ${s1.krivi.join(",")}`,
    );

    // ── Audit ───────────────────────────────────────────────────────────────────────────────
    await otvori(t, "/audit");
    // Radnja koja u dnevniku postoji (na čistoj bazi ih je malo) — spisak dolazi sa servera.
    const izborRadnje = t.strana.locator(".filter-bar label", { hasText: "Radnja" }).locator("select");
    await t.strana.waitForFunction(() => [...document.querySelectorAll(".filter-bar select")].some((s) => s.options.length > 1), null, { timeout: 10_000 }).catch(() => undefined);
    const opcije = await izborRadnje.locator("option").evaluateAll((o) => o.map((x) => ({ v: x.value, t: x.textContent ?? "" })).filter((x) => x.v));
    if (opcije.length === 0) {
      provjeri("Audit: filter po radnji · preskočeno (dnevnik je prazan)", true);
    } else {
      const odgovor = t.strana.waitForResponse((r) => r.url().includes(`akcija=${opcije[0].v}`));
      await izborRadnje.selectOption(opcije[0].v);
      await odgovor;
      await t.strana.waitForTimeout(200);
      const radnje = await t.strana.locator(".data-table tbody tr td:nth-child(3)").allTextContents();
      await slikaj(t.strana, "5-audit-filteri");
      provjeri(`Audit: filter po radnji (samo „${opcije[0].t}“), čitljivi nazivi`, radnje.length > 0 && radnje.every((x) => x === opcije[0].t) && !/^[A-Z_]+$/.test(opcije[0].t), `${radnje.length} ${[...new Set(radnje)].join(",")}`);
    }

    // ── Poruke ──────────────────────────────────────────────────────────────────────────────
    await otvori(t, "/poruke");
    const tabovi = await Promise.all(["Sve", "Primljene", "Poslate"].map((n) => t.strana.locator(".panel-header .filter-tabs button", { hasText: n }).count()));
    provjeri("Poruke: jedan spisak — Sve / Primljene / Poslate", tabovi.every((n) => n > 0), tabovi.join(","));

    // ── Plan obuke: sa HACCP plana direktno, za sve koji rukuju hranom ───────────────────────
    await otvori(t, "/haccp-plan");
    await t.strana.getByRole("button", { name: "Plan obuke" }).click();
    await t.strana.getByText("Godišnji plan obuke", { exact: false }).first().waitFor();
    const izabrana = await t.strana.locator(".filter-tabs button.selected").first().textContent();
    await t.strana.getByRole("button", { name: "Nova stavka plana" }).click();
    const modal = prozor(t.strana, "Nova stavka plana obuke");
    const zaKoga = await modal.getByLabel("Za koga").locator("option").allTextContents();
    await slikaj(t.strana, "6-plan-obuke");
    provjeri(
      "Plan obuke: ulaz sa HACCP plana otvara pravu karticu; nova stavka za sve koji rukuju hranom odjednom",
      /Godišnji plan obuke/.test(izabrana ?? "") && zaKoga.some((o) => o.startsWith("Svi koji rukuju hranom")),
      `${izabrana} · ${zaKoga.slice(0, 3).join(" | ")}`,
    );
    provjeri("Bez greške u konzoli", t.greske.length === 0, t.greske.join(" | "));
  } finally {
    await t.zatvori();
  }
}
