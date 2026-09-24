# CLAUDE.md — kontekst projekta

**Pročitaj ovaj fajl prvi, prije bilo kakvog rada u ovom repozitorijumu.**
Ovdje je sve što se ne vidi iz koda: mapa aplikacije, zašto je nešto tako, šta se ne smije
dirati, šta je poznato da ne valja, i na čemu se već izgubilo vrijeme.

Ažurira se pri svakoj većoj izmjeni. Ako nešto naučiš na teži način — upiši ovdje.
Posljednji pregled koda i usklađivanje ovog fajla: **24.09.2026.** (Ranija verzija ovog fajla
opisivala je staru aplikaciju — `zapisi.js`, `promet.html`, `veza.js` — koje u ovom kodu nema.)

---

## Šta je ovo

Aplikacija za **dobru higijensku praksu i HACCP kod distributera hrane u Crnoj Gori.**
Vlasnica je konsultantkinja iz Srbije koja uslugu prodaje crnogorskim firmama:
uspostavljanje sistema jednokratno (900–1.600 €) + mjesečno održavanje (80–180 €).

**Šta se stvarno prodaje:** ne softver, nego odgovor na pitanje *„serija je sporna, kojim
kupcima je otišla?"* i dokaz da zapisi nastaju svakog dana, a ne noć prije inspekcije.

---

## Pravilo koje se nikad ne krši

**Jedan klijent = jedna baza = jedan Render servis.**

Kod nema razdvajanje firmi: tabela `firma` ima jedan red, a sve ostale tabele pripadaju toj
firmi. Prvi put kad se dva klijenta nađu u istoj bazi, svaki vidi sve.

**Demo baza** (`npm run seed:demo`, `db/13_demo_cg.sql`) je samo za prodajne sastanke i
testove. Demo se nikad ne koristi za pravi rad, niti obrnuto. `npm run test:e2e` sam provjeri
da je baza demo i inače odbije da krene.

---

## Kome se predaje aplikacija

**Prvi nalog u klijentovoj firmi je `bzr` — odgovorno lice za bezbjednost hrane.** Ne direktor,
ne magacioner.

Zakon 59/2026 ne propisuje funkciju „odgovorno lice za bezbjednost hrane". Postoji **„odgovorno
lice u pravnom licu" iz čl. 82** — pojam prekršajnog prava, lično plaća 500–2.000 €. Dok firma
pisano ne odredi ko je to, to je izvršni direktor. *(likely — iz teksta kazni.)*

| # | Šta | Čime |
|---|---|---|
| 1 | Direktor potpiše rješenje o imenovanju | `/prilozi` → prva stavka |
| 2 | Imenovanom licu se otvara nalog `bzr` | `npm run prvi-korisnik` |
| 3 | To lice dobija Kontrolni centar kao prvu stranu | `/tabla`, automatski po ulozi |
| 4 | Upisuje sve zaposlene; kod onih koji rukuju hranom — rok sanitarne knjižice | `/ljudi` → Svi zaposleni |
| 5 | Magacioneri (`operater`) i vozači (`vozac`) dobijaju naloge — **otvara ih sam**, odmah pri unosu zaposlenog, sa početnom lozinkom i ceduljicom za štampu | `/ljudi` → Novo lice / „Otvori nalog" |
| 6 | Direktor dobija `uprava` — pregled, aktivnost uživo i poruke, bez unosa | otvara konsultant |
| 7 | Konsultant podešava HACCP plan: „Predloži osnovni plan" pa prilagodi stvarnim komorama i vozilima, upiše termometre i tekst kontrolnih tačaka | `/haccp-plan` |

**Rješenje o imenovanju nije zakonski obrazac** i tako se i predstavlja — pisani trag ko
sprovodi postupke iz čl. 36 i ko javlja UBH po čl. 28.

---

## Pravni okvir — Crna Gora, provjereno

**Obrazac 6 ne postoji u Crnoj Gori.** To je srpski obrazac iz Pravilnika o evidencijama
BZR. Crnogorski inspektor ga ne traži i ne priznaje. Nosivi propis je zakonodavstvo o
hrani, a nadzor vodi **UBH** (Uprava za bezbjednost hrane, veterinu i fitosanitarne
poslove).

| Propis | Broj | Članovi |
|---|---|---|
| Zakon o bezbjednosti hrane | **59/2026** (objavljen 04.05.2026) — stavio 57/15 van snage | čl. 27, 28, 35, 36, 43, 47, 82 — provjereni, tabela ispod |
| ~~Zakon o bezbjednosti hrane~~ | ~~„Sl. list CG" 57/15~~ | ~~41 sledljivost · 42 povlačenje · 44 transport i obuka · 46 HACCP · 48 registracija · 82 kazne~~ — **prestao da važi** |
| Pravilnik o registraciji i odobravanju objekata | „Sl. list CG" **111/2022** | taksa 30 € |
| Pravilnik o sledljivosti | „Sl. list CG" **48/16** | identifikacija serije |
| Zakon o zaštiti stanovništva od zaraznih bolesti | „Sl. list CG" **12/2018, 64/2020** | **čl. 31** — sanitarne knjižice, izričito pominje **distribuciju**; čl. 69 kazna 2.500–20.000 € |
| Vodič za dobru higijensku praksu | UBH, v1.0, 03.05.2023 | Prilozi 1–14 |

**Važeći propis je Zakon o bezbjednosti hrane, „Sl. list CG" 59/2026.**
Usvojen 27.04.2026, objavljen 04.05.2026, **na snazi od 12.05.2026** (čl. 88 — osmog dana
od objave). Čl. 87 je stavio van snage raniji zakon 57/15.

Brojevi članova pročitani iz teksta zakona 14.09.2026. Potvrđeni dvostruko: iz naslova
članova i iz unakrsnih poziva u kaznenim odredbama.

| Tema | Novi zakon 59/2026 | Bilo u 57/15 |
|---|:-:|:-:|
| **Sljedljivost** — u svim fazama, sistem za identifikaciju dobavljača i kupaca, označavanje serije | **čl. 27** | 41 |
| **Povlačenje** nebezbjedne hrane i obavještavanje nadležnog organa; st. 3 izričito pominje **distribuciju** | **čl. 28** | 42 |
| **Zahtjevi za higijenu hrane** — st. 2: zahtjeve propisuje Vlada, dakle Uredba o higijeni hrane | **čl. 35** | 44 |
| **HACCP** — uspostaviti, primjenjivati i kontinuirano održavati postupke; st. 2 izmjena proizvoda/procesa → izmjena postupaka (naplativa revizija); posljednji stav: ko ne može identifikovati KKT dužan je da uspostavi **dobru higijensku praksu** | **čl. 36** | 46 |
| **Vodiči za dobru higijensku praksu i primjenu HACCP-a** | **čl. 47** | — |
| **Registracija objekata** — prije otpočinjanja djelatnosti | **čl. 43** | 48 |
| **Kazne** | **čl. 82** | 82 |
| Ponovljeni prekršaj | čl. 83 | — |
| Rok za podzakonske akte | čl. 84 | — |
| Prestanak važenja 57/15 | čl. 87 | — |
| Stupanje na snagu | čl. 88 | — |

**Kazne, čl. 82 — više NISU višekratnik najniže cijene rada, nego fiksan iznos:**

| Ko | Iznos |
|---|---|
| pravno lice | **2.000 – 20.000 €** |
| preduzetnik | 1.000 – 6.000 € |
| odgovorno lice u pravnom licu i fizičko lice | 500 – 2.000 € |

> ### Obuka zaposlenih više nije u zakonu — pazi na ovo
>
> Stari čl. 44 je izričito nabrajao *„obuku lica koja rukuju hranom"* i bio je tvoj pravni
> osnov za naplatu obuke. **Nov zakon tu obavezu ne pominje nigdje.** Čl. 35 kaže samo da
> subjekat mora ispunjavati zahtjeve o higijeni hrane i da **te zahtjeve propisuje Vlada** —
> dakle Uredbom o higijeni hrane.
>
> Obaveza nije nestala, spustila se nivo niže. Ali se sada citira **Uredba o higijeni hrane
> i Vodič UBH**, ne član zakona.
>
> **Posljedica:** broj Službenog lista za Uredbu, koji od početka stoji kao neprovjeren,
> više nije sitnica — postao je glavni oslonac za polovinu onoga što prodaješ. Provjeri ga
> prije sljedeće ponude koja pominje obuku.

> ### ⛔ OBUKA ZAPOSLENIH NIJE ZAKONSKA OBAVEZA — provjereno 16.09.2026
>
> **Zakon o bezbjednosti hrane 59/2026: nema je.** Pretražen cio tekst po svim
> oblicima (obuk, obuč, osposob, edukac, znanj, upućen, instru). Jedina „obuka" u
> zakonu je **obuka službenih lica koja vrše kontrole**, koju organizuje nadležni
> organ — to su inspektori, ne klijentovi zaposleni.
>
> **Uredba o higijeni hrane: ne nalazi se ni tamo.** Prilog 2 ima deset dijelova i
> završava se **termičkom obradom** — tačno tamo gdje u EU Uredbi 852/2004 počinje
> **Poglavlje XII „Osposobljavanje"**. Dva nezavisna čitanja istog teksta daju isto.
> *(likely, ne dokaz — čitano kroz sažetak PDF-a, nije isključeno da posljednja
> strana nije obuhvaćena.)*
>
> **Provjeru znanja sa pitanjima i rezultatom ne traži niko** — ni zakon, ni Uredba,
> a ni EU 852 koja traži „instructed and/or trained", dakle upućivanje, ne ispit.
>
> **ŠTA TO ZNAČI ZA PRODAJU.** Obuka i provjera znanja se **ne smiju predstaviti kao
> zakonska obaveza.** To je Obrazac 6 u drugom izdanju — jednom izgovoreno pred
> klijentom koji provjeri, gubi se sve.
>
> Prodaju se kao **dokaz da HACCP sistem stvarno radi**: čl. 36 traži da subjekat
> postupke *uspostavi, primjenjuje i kontinuirano održava*, i da **na zahtjev
> nadležnog organa dokaže usaglašenost**. Čovjek koji ne zna šta je kritična
> kontrolna tačka ne može primjenjivati postupak — evidencija obuke je kako se to
> dokazuje. Uz to, **Vodič UBH ima Prilog 13 i Prilog 14**; vodič nije obavezujući,
> ali ga je izdala sama Uprava i to inspektor traži u praksi.
>
> **Tvrda obaveza sa kaznom u ovoj oblasti su sanitarne knjižice** —
> Zakon o zaštiti stanovništva od zaraznih bolesti, čl. 31, kazna 2.500–20.000 €.
> To je ljekarski pregled, ne obuka. Ne miješati to dvoje.

**Podzakonski akti sa osnovom u 57/15 OSTAJU NA SNAZI** — čl. 84: novi propisi se donose
u roku od 18 mjeseci od stupanja na snagu (dakle do ~12.11.2027), a do tada se primjenjuju
stari *„ako nijesu u suprotnosti sa ovim zakonom"*. Pravilnik o sledljivosti 48/16 i
Uredba o higijeni hrane se i dalje citiraju.

**Prelazni rokovi (čl. 85 i 86) — provjereno, NE pogađaju običnog distributera:**
šest mjeseci važi za objekte sa tradicionalnim postupcima proizvodnje (čl. 39), tri
mjeseca za predmete i materijale u kontaktu sa hranom (istekao 12.08.2026), a planovi
unapređenja za objekte III kategorije idu do 31.12.2030. **Distributeru registrovanom po
starom zakonu novi zakon ne daje rok za ponovnu registraciju.** Ne prodavati kao rok.

**Brojka koja NIJE provjerena — ne izgovarati je klijentu:**

- Broj Sl. lista za **Uredbu o higijeni hrane** (izvori se razilaze: 13/15 naspram
  26/16, 32/18, 42/21). Registar je potvrdio da Uredba postoji kao podzakonski akt, ali
  ne i njen broj. Uzeti prečišćen tekst sa `gov.me`.

**Obrasci D1–D5** (vozila, utovar, isporuka, povlačenje, reklamacije) su autorski rad.
Zvanični crnogorski vodič pokriva ugostiteljstvo i trgovinu, **ne distribuciju.**
Nikad ih ne predstavljati kao zvanične obrasce.

---

## Jezik i ton

- Dokumentacija i cijeli interfejs su na **ijekavici**: bezbjednost, sledljivost, mlijeko,
  prijem, obavještenje, mjera, vrijeme. Ekavica odaje da je predložak prepisan iz Srbije.
- Nazivi propisa se pišu onako kako glase u Službenom listu.
- Poruke u aplikaciji su **kratke i govore šta da se uradi**, ne šta je greška.
  Loše: „Validacija nije uspjela." Dobro: „Odstupanje bez zapisane mjere je nalaz protiv
  firme, ne protiv zaposlenog."

---

## Mapa aplikacije

### Stack i tok jednog zahtjeva

React 19 + TypeScript + Vite (`src/`) · Express 5 + TypeScript (`server/`, pokreće se kroz `tsx`) ·
PostgreSQL na Supabase (`db/`) · Render, jedan servis po klijentu.

```
pregledač  src/pages/*.tsx  ──►  src/lib/api.ts  (zaglavlje x-zahtjev-app, kolačić pilot_sesija)
   │
   ▼
server/index.ts   1. javne rute PRVE: /api/zdravlje, auth, provjera znanja (ulaz šifrom)
                  2. ruteri /api/*  (server/routes/*.ts) — zod validacija, requireAuth, requireUloga
   │
   ▼
server/services/*.ts   poslovna pravila, transakcije, događaj (dogadjaj) + audit (audit_log)
                       brojevi dokumenata SAMO iz brojeviService.sljedeciBroj()
   │
   ▼
PostgreSQL   tabele + pogledi (v_*) · migracije db/NN_*.sql, stanje u schema_migracije
```

### Moduli

| Modul | Strana | Ruta (`server/routes/`) | Servis (`server/services/`) | Glavne tabele |
|---|---|---|---|---|
| Prijava, sesije | `/prijava`, prisilna promjena lozinke | `auth.ts` | `server/auth.ts` | `korisnik`, `sesija_prijave` |
| Ljudi | `/ljudi` (zaposleni, plan obuke, provjera znanja, nalozi) | `ljudi.ts`, `provjeraZnanja.ts` | — | `lice`, `korisnik`, `plan_obuke`, `pitanje`, `sesija_znanja`, `ucesnik_znanja`, `odgovor_znanja` |
| Šifarnici | `/sifarnici` | `sifarnici.ts` | `skladisteService` | `kupac`, `dobavljac`, `artikal`, `skladiste` |
| Prijem — KKT 1 | `/prijem` | `prijem.ts` | `prijemService`, `haccpService` | `prijem`, `prijem_stavka`, `lot`, `zaliha`, `kretanje_zalihe` |
| Otpremnica (PDF / fotografija) | `/prijem` → Novi prijem | `prijem.ts` (`/prijem/otpremnica`) | `otpremnicaService` | `prijem_dokument`, `artikal_dobavljaca`, `prijem_stavka.po_otpremnici` |
| Zalihe, otpis | `/zalihe` | `zaliha.ts` | `otpisService` | `zaliha`, `kretanje_zalihe` |
| HACCP — KKT 2, obrasci | `/haccp` | `haccp.ts` | `haccpService` | `kontrolna_tacka`, `pravilo_kontrole`, `mjerenje_temperature`, `zapis` (+ `public/obrasci-cg.json`) |
| Neusaglašenosti | `/neusaglasenosti` | `neusaglasenosti.ts` | `ncService` | `neusaglasenost`, `korektivna_mjera`, `verifikacija` |
| Vozila — D1 | `/vozila` | `vozila.ts` | `vozilaService` | `vozilo`, `kontrola_vozila` |
| Isporuka — KKT 3 | `/isporuka` | `isporuka.ts` | `isporukaService` | `isporuka`, `isporuka_stavka` |
| Sledljivost, povlačenje | `/sledljivost` | `sledljivost.ts`, `povlacenje.ts` | `sledljivostService`, `povlacenjeService` | `povlacenje`, `povlacenje_kontakt`, `v_sledljivost_*` |
| Zadaci, obavještenja, poruke | `/moja`, `/tabla`, `/poruke` | `zadaci.ts`, `poruke.ts` | `zadaciService` | `zadatak`, `obavjestenje`, `poruka` |
| Kontrolni centar, aktivnost | `/tabla` | `tabla.ts` | `monitoringService`, `haccpPlanService` (kartice „Danas fali po planu", „HACCP rokovi") | čita sve (aktivnost = unija domenskih tabela) |
| HACCP plan: plan monitoringa, kontrolne tačke, termometri, verifikacija sistema | `/haccp-plan`; štampa `/prilozi` → HACCP plan; „Danas po planu" na `/moja` | `haccpPlan.ts` | `monitoringService` (šta danas fali), `haccpPlanService` (termometri, verifikacija, podaci za štampu), `pravilaService` (granica artikla → pravilo) | `plan_monitoringa`, `mjerni_uredjaj`, `provjera_uredjaja`, `verifikacija_sistema`, `kontrolna_tacka` (opasnost, mjera, verifikacija) |
| Prilozi, izvještaji, izvoz | `/prilozi`, `/izvjestaji` | `izvoz.ts`, `firma.ts` | `izvozService` | `firma`, pogledi `v_izvoz_*`, `v_plan_obuke`, `v_evidencija_osposobljavanja` |
| Audit | `/audit` | `audit.ts` | `auditService`, `dogadjajService` | `audit_log`, `dogadjaj` |
| Bekap | `/tabla` (kartica) | `bekap.ts` | `bekapService` | `bekap_log` |
| Podešavanje (konsultant) | `/admin` | `firma.ts`, `provjeraZnanja.ts` | — | `firma`, banka pitanja konsultanta |

Meni i ko smije na koju stranu: `STAVKE` u `src/components/Layout.tsx` (isti spisak koristi
`mozeNa()` za linkove iz obavještenja). Rute i uloge u pregledaču: `src/App.tsx`. **Prava stvarno
provjerava server** (`requireUloga` po ruti) — meni samo sakriva.

### Uloge

| Uloga | Ko | Prva strana | Upis unazad (`PROZOR`) | Šta radi |
|---|---|---|:-:|---|
| `izvodjac` | konsultantkinja | `/tabla` | 30 dana | sve što i `bzr` + Podešavanje, banka pitanja konsultanta; otvara sve naloge osim `izvodjac` |
| `bzr` | odgovorno lice | `/tabla` | 7 | odluke o prijemu, mjere i provjera neusaglašenosti, povlačenje, nalozi `operater`/`vozac`, pitanja firme, HACCP plan (plan monitoringa, termometri, verifikacija), izvoz, poruke |
| `uprava` | direktor | `/tabla` | — (samo gleda) | Kontrolni centar (kartice otvaraju listu iza broja, `/tabla/detalj`), aktivnost uživo, zalihe, sledljivost i povlačenja (čitanje), HACCP plan (čitanje), poruke; bez zadataka i unosa |
| `operater` | magacioner | `/moja` | 1 | prijem, zalihe i otpis, obrasci P3–P10, isporuka, prijava problema, SVOJA korektivna mjera; „Danas po planu" na Mojoj strani; provjera termometra (API) |
| `vozac` | vozač | `/moja` | 1 | isporuka i potvrda sa temperaturom (KKT 3), kontrola vozila D1, prijava problema, SVOJA mjera; „Danas po planu" |

`PROZOR`, `NA_TERENU`, `ogranicenjeDatuma()`, `provjeriProzorUpisa()`, `izvrsilacZa()`,
`samoMoje()`, `smijeDodijelitiUlogu()` — sve u `server/auth.ts`.

### HACCP tok kako ga kod stvarno sprovodi

| Tačka | Šta se upisuje | Van granice → |
|---|---|---|
| **otpremnica** | PDF ili fotografija → server pročita (PDF tekst / lokalni OCR) i POPUNI formu; magacioner upoređuje sa robom i potvrđuje kvačicom | nesigurna polja žuta; dobavljač po PIB-u; artikal po zapamćenoj vezi sa dobavljačem; manjak i drugi lot se vide uz stavku |
| **plan monitoringa** | `plan_monitoringa`: šta (mjerenje na KKT / obrazac / D1 za vozilo), koliko često, koliko puta, ko (uloga, skladište) | ništa se ne blokira — „Danas po planu" na `/moja`, kartica „Danas fali po planu · juče propušteno" na tabli, propušteni dani na `/haccp-plan` |
| **KKT 1 — prijem** | stavke sa lotom (bez lota odbijeno), temperatura **obavezna za robu pod režimom** (`TEMPERATURA_OBAVEZNA`), ocjena po `pravilo_kontrole` KKT1 artikla | mjerenje FAIL → neusaglašenost + zadatak + obavještenje `bzr` i uprava + **lot na HOLD**. Artikal sa NEPOTVRĐENOM granicom → samo WARNING i obavještenje `bzr`, bez HOLD-a (invarijanta #5) |
| odluka o lotu | `bzr`: prihvati / HOLD / odbij (odbijanje traži razlog). **Istekao rok se ne prihvata i ne pušta** (`ROK_ISTEKAO`); pri prijemu takve robe `bzr` odmah dobija obavještenje | prihvaćeno → zaliha DOSTUPNO + kretanje PRIJEM; HOLD → KARANTIN + kretanje PRIJEM; magacioner dobija obavještenje |
| **lot na HOLD-u** | `bzr`: **pusti** (razlog obavezan) ili **odbij** — na `/zalihe` i `/prijem` | pušteno iz karantina → DOSTUPNO, kretanje RELEASE 0; odbijeno → karantin 0, kretanje OTPIS. Zadržan pri prijemu (zaliha još ne postoji) → pušten = PRIJEM. **Ne pušta se dok je povlačenje U_TOKU** |
| **KKT 2 — skladištenje** | ručno mjerenje na `/haccp` | kao KKT 1 (ako je vezano za lot — HOLD) |
| obrasci P3–P10 | `zapis` iz `public/obrasci-cg.json`; odstupanje traži korektivnu mjeru (tekst) | neusaglašenost odmah u „čeka provjeru" — mjera iz obrasca je upisana kao urađena, potpisuje je ko je unio zapis; zadatak + obavještenje `bzr`. Ispravka zapisa ne otvara drugu |
| **D1 — vozilo** | kontrola prije utovara (vidi samo vozač, invarijanta #24) | vozilo NIJE_SPREMNO → isporuka tim vozilom odbijena; neusaglašenost |
| **KKT 3 — isporuka** | potvrda + temperatura pri predaji (obavezna za robu pod režimom); ocjena SAMO po pravilu KKT3 artikla | FAIL → neusaglašenost; lot u magacinu se NE zadržava (problem je u prevozu) |
| **termometar** | interna provjera (referentna vs izmjereno — rezultat računa server) ili kalibracija (broj sertifikata obavezan) | NEISPRAVAN → neusaglašenost + zadatak + obavještenje `bzr`; traka upozorenja na `/haccp`. Istekla provjera/kalibracija → kartica „HACCP rokovi" |
| **verifikacija sistema** | revizija HACCP plana, interni audit, vježba povlačenja — jednom godišnje | POTREBNE_IZMJENE → zadatak (`verifikacija_sistema`); KASNI / NIJE_RADJENO → „HACCP rokovi" |
| problem na isporuci | „Problem" na isporuci → neusaglašenost vezana za isporuku | zadatak + obavještenje `bzr` |
| **neusaglašenost** | 4 koraka: prijava → mjera (kome, rok) → urađeno (samo dodijeljeni, uz opis) → provjera drugog lica | provjera SAMO iz „čeka provjeru"; mjeru koja se provjerava bira server (posljednja urađena), ne pregledač. Zadatak se zatvara sam; prijavilac dobija obavještenje. Izuzetak od četiri oka — invarijanta #41 |
| **povlačenje** (čl. 28) | kontakti iz stvarnih isporuka lota | lot na HOLD, zaliha u karantin; zatvara se tek kad su svi pozvani |

### Migracije (`npm run migriraj`, redoslijed nije proizvoljan)

| Fajl | Šta |
|---|---|
| `01_organizacija` | `firma` (jedan red), `korisnik`, `uloga_t` |
| `02_ljudi` | `lice` (svi zaposleni, šifra, knjižica), `plan_obuke` |
| `03_sifarnici` | `dobavljac`, `kupac` (telefon obavezan), `artikal` (granice, `granica_potvrdio`) |
| `04_prijem_lot` | `prijem`, `lot`, `prijem_stavka` |
| `05_zaliha` | `zaliha` (po lotu i statusu), `kretanje_zalihe` (dnevnik) |
| `06_haccp` | `kontrolna_tacka`, `pravilo_kontrole` (verzionisano), `mjerenje_temperature`, `zapis` |
| `07_neusaglasenosti` | `neusaglasenost`, `korektivna_mjera`, `verifikacija` |
| `08_vozila_isporuka` | `vozilo`, `kontrola_vozila`, `isporuka`, `isporuka_stavka` |
| `09_zadaci_obavjestenja` | `zadatak`, `obavjestenje` |
| `10_events_audit` | `dogadjaj`, `audit_log` |
| `11_provjera_znanja` | `pitanje`, `sesija_znanja`, `ucesnik_znanja`, `odgovor_znanja` |
| `12_pogledi` | `v_lica`, `v_plan_obuke`, `v_zaliha_dostupna`, `v_sledljivost_*`, `v_evidencija_osposobljavanja`, … |
| `13_demo_cg` | **demo podaci — samo `npm run seed:demo`, samo demo baza** |
| `14_povlacenje` | `povlacenje`, `povlacenje_kontakt` |
| `15_isporuka_uneo_cg` | `isporuka.uneo_korisnik_id` |
| `16_bekap_cg` | `bekap_log` (bekap u ISTOJ bazi) |
| `17_naknadno_cg` | pogledi sa `naknadno_dana` za izvoz |
| `18_temperatura_predaje_cg` | `isporuka_stavka.temperatura_predaje` (KKT 3) |
| `19_skladista_poruke_cg` | `skladiste` (+ veze na prijem/isporuku/nalog), `poruka` |
| `20_sesije_prijave_cg` | `sesija_prijave` (heš tokena); server je pravi i sam pri startu |
| `21_pitanja_firme_cg` | `pitanje.izvor` (konsultant/firma), prag i izvor pitanja na terminu |
| `22_integritet_cg` | CHECK na `izvor_tip` u `neusaglasenost`, `zadatak`, `obavjestenje` (nalaz B2); isti spisak kao `IZVORI_*` u `zadaciService.ts` |
| `23_otpremnice_cg` | `prijem_dokument` (PDF/slika u bazi — ulazi u bekap), `artikal_dobavljaca` (zapamćena veza „njihov → naš artikal"), `prijem_stavka.po_otpremnici` |
| `24_haccp_sistem_cg` | `plan_monitoringa`, `mjerni_uredjaj`, `provjera_uredjaja`, `verifikacija_sistema`; `kontrolna_tacka` + opasnost/mjera/verifikacija; `verifikacija.izuzetak_cetiri_oka`; proširene CHECK liste izvora; pravila KKT1/KKT3 iz postojećih granica artikala |

Postojeći fajl se **nikad ne mijenja** — ispravka je nov fajl sa sljedećim brojem.

### Alati (`alati/`, pokreću se sa računara konsultantkinje)

| Alat | Šta radi |
|---|---|
| `npm run prvi-korisnik -- --firma … --ime … --korisnik …` | prvi `bzr` nalog u novoj bazi |
| `npm run dnevni-pregled` | stanje svih klijenata iz `alati/klijenti.txt`; izlazni kod 1 ako je neko u zastoju |
| `alati/napravi-licencu.ts` | licencni ključ za ugovor (papirni trag, aplikacija ga ne provjerava) |
| `npm run bekap` (`alati/bekap.ts`) | `pg_dump` svake baze iz `klijenti.txt` (ili `DATABASE_URL`) u `bekap/<klijent>/`, samo šema `public`, **bez podataka sesija** (živi tokeni). Svaki fajl se odmah provjeri (`pg_restore --list`), stariji od 90 dana se brišu, ishod u `bekap/POSLJEDNJI-BEKAP.txt`, izlazni kod 1 ako ijedan klijent padne. `bekap/` je u `.gitignore`. Treba mu `pg_dump` ≥ verzije servera (traži najnoviji u `C:/Program Files/PostgreSQL`, ili `PG_DUMP=`). |

`alati/klijenti.txt` ima lozinke baza — u `.gitignore` je i ostaje.

### Testovi (`testovi/`, `npm run test:e2e`)

13 testova, 293 provjere, kroz svih pet uloga: pristup (svaka uloga × svaka adresa), obavještenja
i zadaci, poruke i skladišta, povlačenje, provjera znanja, pitanja firme, neusaglašenost sa
terena, prilozi i izvoz, prijave, i Faza 1 (HOLD → pusti/odbij, provjera mjere, odstupanje iz
obrasca, nepotvrđena granica — `faza1_haccp`), i Faza 2 (istovremeni brojevi, lice + nalog u
jednoj transakciji, početna i nova lozinka, čitanje po ulogama, kartice direktora, nepoznat izvor
odbijen u bazi — `faza2_integritet`), i otpremnice (10 probnih u PDF-u tačno do slova, fotografija
nakrivljena i sa sjenkom — i originalna i smanjena kao iz pregledača, zapamćen artikal, manjak,
istekao rok — `otpremnice`; probni fajlovi u `testovi/otpremnice/` su izmišljeni), i Faza 3
(temperatura obavezna na KKT 1, granica iz Šifarnika → pravilo sa verzijama, plan monitoringa i
„šta danas fali", termometri, verifikacija sistema, podaci za štampu HACCP plana, izuzetak od
četiri oka — `faza3_sistem`). **Rade samo na demo bazi** (`testovi/pomoc.mjs` to provjeri
preko pet demo naloga sa fiksnim ID-jevima) i brišu sve što naprave. Server mora raditi
(`npm run dev` ili `APP_URL=`). Nov tok u aplikaciji = nov test.

Demo baza nije čista — vlasnica kroz Render unosi svoje (npr. drugo skladište „Magacin Bar").
Testovi to **ne diraju**: prijem ide u „Glavni magacin" (`glavnoSkladiste()`), isporuka iz
skladišta svog lota; provjera koja traži JEDNO skladište se tada preskače i ispiše „· preskočeno".

---

## Invarijante — ovo se ne smije pokvariti

Brojevi su stalni — kod ih navodi u komentarima („invarijanta #14"). Ukinuta invarijanta ostaje
pod svojim brojem sa oznakom „ukinuto", da se brojevi ne pomjere.

1. **Zapis se ne briše i ne mijenja.** Ispravka je NOV zapis sa `ispravlja_id` → stari. Važeći je
   onaj **na koji niko ne pokazuje**: `NOT EXISTS (SELECT 1 FROM t n WHERE n.ispravlja_id = t.id)`.
   Isto važi za potvrđenu isporuku: ispravka je neusaglašenost vezana za nju, ne prepravka.
2. **Odstupanje bez korektivne mjere se ne snima** — `CHECK` u bazi (`NOT VALID` za stare redove),
   provjera u ruti i u pregledaču. Neusaglašenost se zatvara samo iz „čeka provjeru" i samo uz
   urađenu mjeru (`ncService.verifikuj`).
3. **Prijem bez broja lota se odbija** (zod + `prijemService`). Bez lota nema sledljivosti (čl. 27).
4. **Kupac bez telefona se ne upisuje.** Povlačenje (čl. 28) počinje telefonom.
5. **Automatska ocjena samo po POTVRĐENOJ granici** (`artikal.granica_potvrdio`). Nepotvrđena je
   pretpostavka konsultanta i po njoj se ne odbija roba. Sprovedeno na JEDNOM mjestu,
   `haccpService.zabiljeziMjerenje`, za sve KKT-ove: van nepotvrđene granice = WARNING +
   obavještenje `bzr`, bez neusaglašenosti i bez HOLD-a.
6. **Terenske uloge vide samo posljednji dan** — `ogranicenjeDatuma(uloga, kolona)`; kolona se
   prosljeđuje (`z.datum`, `i.datum_isporuke`, …), dan po podgoričkom vremenu.
7. **Isporuka se veže za LOT** (`isporuka_stavka.lot_id`), ne za artikal. Lot mora biti PRIHVAĆEN,
   imati zalihu i biti u skladištu iz kog isporuka ide.
8. **FEFO** — zalihe i ponuđeni lotovi poređani po roku.
9. **Koliko unazad se smije upisati stoji na SERVERU** — `PROZOR` + `provjeriProzorUpisa()`:
   operater i vozač 1 dan, `bzr` 7, `izvodjac` 30. Datum u budućnosti se ne prima nikad.
10. **Naknadan unos se ne krije** — `naknadno_dana` u listama i izvozu (oznaka „naknadno +N").
11. **Dan po podgoričkom vremenu** — `danasCG()` na serveru, `lokalniDatum()` u pregledaču,
    `(now() at time zone 'Europe/Podgorica')::date` u SQL-u. Nikad `current_date`, nikad
    `toISOString()` za datum.
12. *Ukinuto:* `ADMIN_TOKEN` — nova verzija nema HTTP admin rutu; administracija ide kroz `alati/`.
13. **`bzr` otvara i mijenja naloge samo ulogama `operater` i `vozac`**, nikad sebi ravnom ni
    iznad sebe — `smijeDodijelitiUlogu()` + `provjeriMozeDaDirneNalog()`, na serveru.
14. **Banka pitanja KONSULTANTA je samo izvođačeva** (`pitanje.izvor = 'konsultant'`, ruta
    `/pitanja`). Ko zna pitanja, ne mjeri više znanje. **Pitanja firme** (`izvor = 'firma'`,
    `/pitanja-firme`) unosi i vidi odgovorno lice. Rezultate vidi normalno.
15. **U `lice` ide broj i rok sanitarne knjižice — nikad nalaz pregleda.**
    15a. **Korektivnu mjeru završava samo onaj kome je dodijeljena** (terenske uloge; `bzr` i
    `izvodjac` smiju svaku), uz upisan opis šta je urađeno — `zavrsiKorektivnuMjeru()`. Ko je uradio
    mjeru, ne provjerava je.
16. **Nalog i lice su dvije stvari, spojene preko `korisnik.lice_id`.** Ime i šifra se čitaju iz
    `lice`, ne prepisuju u `korisnik`.
17. **Lozinka nije šifra.** Lozinkom se prijavljuje, šifrom (`lice.sifra`) potpisuje i ulazi u
    provjeru znanja.
18. **Prilog 13 je plan, ne zapis** (`plan_obuke`, `v_plan_obuke` sa stanjem KASNI/USKORO/…).
    Stavka koja je prošla bez obuke se ne briše.
19. *Ukinuto:* `veza.js` / `dodajOdjavu()` — odjava i promjena lozinke su u `Layout.tsx` i `/moja`.
20. **Jedan spisak ljudi** — `lice` su SVI zaposleni; `rukuje_hranom` odlučuje za koga važe
    knjižica i obuka. Druga tabela zaposlenih se ne pravi.
21. **Izvršilac se ne kuca** — `izvrsilacZa()`: terenskoj ulozi UVIJEK njeno ime; `bzr` i
    `izvodjac` smiju upisati drugo lice.
22. **`izvrsilac` ≠ `uneo_korisnik_id`** — prvi je ko je obavio radnju (može biti bez naloga),
    drugi nalog sa kog je zapis poslat.
23. **Potpis je IME, ne šifra** — inspektoru „M-01" ne znači ništa; i u evidenciji kontrola vozila.
24. **Pet uloga.** D1 (kontrola vozila) vidi i unosi SAMO vozač, odgovorno lice i konsultant; HACCP
    obrasci nisu za vozača.
25. **Obrazac nosi `uloge` u `public/obrasci-cg.json`** — po njima se filtriraju pločice na
    `/haccp`. Nov obrazac bez `uloge` se ne pojavljuje terenskim ulogama.
26. **Terenske uloge u listama vide SAMO SVOJE unose** — `samoMoje()`; vozač vidi i isporuke koje su
    mu dodijeljene (`vozac_korisnik_id`); neusaglašenosti — one koje je sam prijavio i one gdje je
    mjera na njemu (`SAMO_MOJE_NC`). **Svaka GET ruta nosi `requireUloga`** sa tačno onim ulogama
    čije strane je zovu (mapa u `testovi/pristup.test.mjs`); cijeli spisak zaposlenih (`/lica`)
    vidi samo vodstvo, a svako svoje lice čita preko `/lica/ja`. Nova ruta bez `requireUloga` je
    greška, ne zaborav.
27. **Radno mjesto nije uloga.** `lice.radno_mjesto` ide na štampu, `korisnik.uloga` odlučuje
    tablu. Promjena uloge briše sesije tog naloga.
28. **Lozinka se prikazuje samo jednom, pri postavljanju.** U bazi je heš; najmanje 10 znakova,
    provjera i u pregledaču i na serveru. Početnu (i novu, za zaboravljenu) lozinku postavlja
    odgovorno lice — može je sama zadati ili prihvatiti predlog — i ona je UVIJEK privremena
    (`mora_promijeniti_lozinku`). „Nova lozinka" prekida sve prijave tog naloga. Sesije: u bazi samo heš tokena (`sesija_prijave`);
    promjena lozinke odjavljuje ostale uređaje.
29. **Šifre za potpis se dijele na kartici „Godišnji plan obuke"** (spisak za štampu).
30. **Izvoz ne pada zbog jednog nedostajućeg pogleda** — `tabelaPostoji()` prije upita; spisak
    izvora nosi `nedostaje`, `sve.json` listu `nedostaje`, pojedinačni CSV vraća 409.
31. **Preuzimanje ide kroz `fetch`** (`preuzmiFajl()`), da se greška 401/409/500 ispiše.
32. **U provjeru znanja se ulazi ŠIFROM SA SPISKA, bez naloga** — ruta mora ostati javna i
    montirana PRIJE rutera sa `requireAuth` (vidi „Naučeno"). Rezultat se ne može naduvati: jedan
    odgovor po pitanju, ništa poslije završetka.
33. *Ukinuto:* `generisiFormu` / `talas` — stara verzija. Provjera znanja sada pada samo ako nema
    otvorenog termina ili nema pitanja iz izabranog izvora (tada se termin ne može ni otvoriti).
34. **Broj dokumenta (NC, isporuka, povlačenje, šifra zaposlenog) samo iz `sljedeciBroj()`**
    (`server/services/brojeviService.ts`), i to UNUTAR transakcije koja upisuje red — ključ
    (`pg_advisory_xact_lock`) drži se do kraja transakcije. Nikad `count(*) + 1`, nikad nasumičan broj.
35. **Upis u više koraka je jedna transakcija** (`transakcija()`): red + audit + obavještenje +
    zadatak + brisanje sesija. Odgovor se šalje POSLIJE transakcije. Funkcija koju zove više mjesta
    prima `klijent` (npr. `neusaglasenostIzZapisa`, `obrisiSveSesijeZaKorisnika`).
36. **`izvor_tip` samo sa spiska** — `IZVORI_ZADATKA` / `IZVORI_OBAVJESTENJA` u `zadaciService.ts`
    (tip, pada pri typecheck-u) i CHECK u bazi (`22_integritet_cg.sql`). Nov izvor: na oba mjesta,
    novom dopunom.
37. **Otpremnica samo POPUNJAVA formu — ništa se ne snima bez čovjeka.** Prijem iz otpremnice traži
    kvačicu „uporedio/la sa robom i etiketom"; nesigurna polja su žuta; nepoznat dobavljač ostaje
    PRAZAN (nikad prvi sa spiska). Čita se **na našem serveru** — PDF tekst direktno, slika lokalnim
    OCR-om (Tesseract, `srp_latn`). **Nikakav spoljni servis** (vlasnica je to izričito odlučila
    24.09.2026: bez Anthropica i sličnih). Temperatura sa otpremnice je podatak dobavljača — prikazuje se,
    ne upisuje; KKT 1 mjeri magacioner.
38. **Roba sa isteklim rokom se upisuje, ali se ne prihvata ni pušta** (`ROK_ISTEKAO` u
    `donesiOdlukuOLotu`). Upisuje se jer je stigla (trag za povrat i ocjenu dobavljača); ne HOLD-uje
    se automatski, da greška u kucanju datuma ostane ispravljiva dok odluka nije donesena.
39. **Granica temperature ima JEDAN izvor — `pravilo_kontrole`.** Unosi se na artiklu u Šifarnicima,
    a `uskladiPravilaArtikla()` (`pravilaService`) u ISTOJ transakciji pravi novu verziju pravila
    KKT 1 i KKT 3 za taj artikal (stara ostaje sa `vazi_do`), ili ga gasi kad artikal izađe iz
    režima. Nijedan KKT ne čita `artikal.temp_min/max` mimo pravila. KKT 1 i KKT 3 se ne mogu
    ugasiti (`TACKA_NEZAMJENJIVA`).
40. **Roba pod temperaturnim režimom se ne prima bez temperature** (`TEMPERATURA_OBAVEZNA`, i u
    formi). Temperatura sa otpremnice se ne računa (#37).
41. **Četiri oka — izuzetak samo kad firma ima JEDNO aktivno odgovorno lice** (`ncService.verifikuj`).
    Server ga nudi (`VERIFIKACIJA_NIJE_NEZAVISNA` + `izuzetakMoguc`), pregledač ga ne izmišlja.
    Traži izričitu kvačicu i obrazloženje od bar 10 znakova. Trajno je označen
    (`verifikacija.izuzetak_cetiri_oka`, „bez četiri oka" u listi), a konsultant dobija
    obavještenje. Sa dva odgovorna lica — `IZUZETAK_NIJE_DOZVOLJEN`. Uprava i dalje ne provjerava.
42. **Rezultat provjere termometra računa server** iz referentne i izmjerene vrijednosti
    (dozvoljeno odstupanje, podrazumijevano 0,5). Pregledač ga ne šalje kad ima brojeva.
    Kalibracija bez broja sertifikata se ne prima. NEISPRAVAN → neusaglašenost (izvor `mjerni_uredjaj`).
43. **„Šta danas fali" ima jedan izvor — `monitoringService.stanjeDanas()`.** Tabla, Moja strana i
    HACCP plan čitaju isto. Dan je po Podgorici (#11). Zapis obrasca se broji jednom — ispravka
    (`ispravlja_id`) nije nov zapis. Terenska uloga vidi samo stavke svoje uloge i svog matičnog
    skladišta.

---

## Nalazi — arhitektura, baza, uloge, HACCP tok (pregled koda 23.09.2026)

Ozbiljnost: **K** kritično (pogrešan podatak ili zaglavljena roba) · **V** visoko · **S** srednje · **N** nisko.

### HACCP tok

| # | | Nalaz | Gdje |
|---|:-:|---|---|
| H1 | ✓ **riješeno u fazi 1 (23.09.2026)** | ~~Lot na HOLD-u je slijepa ulica.~~ Sada: `bzr` pušta (razlog obavezan) ili odbija zadržan lot; pušteno → RELEASE, odbijeno → OTPIS iz karantina; ne pušta se dok je povlačenje U_TOKU. Usput nađeno i ispravljeno: lot zadržan PRI PRIJEMU nije imao zalihu uopšte, a odluka „HOLD" nije upisivala PRIJEM u dnevnik kretanja. | `prijemService.donesiOdlukuOLotu` |
| H2 | ✓ **riješeno u fazi 1 (23.09.2026)** | ~~Neusaglašenost se može zatvoriti bez korektivne mjere.~~ Sada: samo iz CEKA_VERIFIKACIJU, a mjeru bira server (posljednja urađena) — četiri oka se ne mogu zaobići izostavljanjem id-a. | `ncService.verifikuj` |
| H3 | ✓ **riješeno u fazi 1 (23.09.2026)** | ~~Odstupanje u obrascu ne ulazi u tok neusaglašenosti.~~ Sada: neusaglašenost u „čeka provjeru" + zadatak + obavještenje `bzr`. **Posljedica za H7:** kad odstupanje upiše samo odgovorno lice, provjeriti ga može samo konsultant. | `ncService.neusaglasenostIzZapisa` |
| H4 | ✓ **riješeno u fazama 1 i 3 (23–24.09.2026)** | ~~KKT 1 i KKT 2 ne poštuju `granica_potvrdio`.~~ Sada na jednom mjestu (`zabiljeziMjerenje`). ~~Dva izvora granica.~~ U fazi 3: granica artikla postaje pravilo (`pravilaService`), KKT 3 više ne čita artikal (invarijanta #39). | `haccpService`, `pravilaService` |
| H5 | ✓ **riješeno u fazi 3 (24.09.2026)** | ~~Nema plana monitoringa.~~ Sada `plan_monitoringa` + „Danas po planu" na Mojoj strani, kartica „Danas fali po planu · juče propušteno" na tabli, propušteni dani za 30 dana na `/haccp-plan`. | `monitoringService` |
| H6 | ✓ **riješeno u fazi 3 (24.09.2026)** | ~~Verifikacija sistema nije pokrivena.~~ Sada termometri (interna provjera, kalibracija, rokovi), revizija plana / interni audit / vježba povlačenja, štampa HACCP plana iz podešenog. | `haccpPlanService`, `/prilozi` |
| H7 | ✓ **riješeno u fazi 3 (24.09.2026)** | ~~Firma sa jednim odgovornim licem ne može zatvoriti neusaglašenost.~~ Sada svjesno označen izuzetak (invarijanta #41). | `ncService.verifikuj` |

### Baza

| # | | Nalaz | Gdje |
|---|:-:|---|---|
| B1 | ✓ **riješeno u fazi 2 (24.09.2026)** | ~~Brojevi = `count(*) + 1`.~~ Sada `sljedeciBroj()`: ključ po prefiksu + najveći postojeći broj, u transakciji. Pet istovremenih prijava dobija pet različitih brojeva (test). Nasumični formati `NC-…-P###` / `-V###` ukinuti. | `brojeviService` |
| B2 | ✓ **riješeno u fazi 2 (24.09.2026)** — djelimično | ~~Polimorfne veze bez zaštite.~~ Sada CHECK liste u bazi (potvrđene i nad starim redovima na demo bazi) + tip u kodu. **Ostaje:** `izvor_id` i dalje nema FK — može pokazivati na obrisan red (brisanja poslovnih redova ionako nema). | 22, `zadaciService` |
| B3 | **S** | **Zaliha nije po skladištu** — skladište lota se čita iz prijema; premještanje ne postoji. Kad se uvede, `zaliha` mora dobiti `skladiste_id`. | 05, 19 |
| B4 | **S** | **Dva dnevnika + treći izvor**: `dogadjaj` i `audit_log` se pišu paralelno, a „Aktivnost uživo" se gradi iz domenskih tabela. `dogadjaj` se skoro ne čita — ili ga koristiti ili prestati puniti. | 10 |
| B5 | **N** | Pogledi sa `p.*` se ne proširuju sami kad se doda kolona — mora `drop` + `create` (desilo se u 19). | `v_izvoz_*` |
| B6 | **N** | `CHECK ... NOT VALID` — stari redovi sa praznom mjerom nisu provjereni. | 07 |

### Arhitektura i pogon

| # | | Nalaz | Gdje |
|---|:-:|---|---|
| A1 | ✓ **riješeno u fazi 1 (23.09.2026)** — osim rasporeda | ~~Bekap samo u istoj bazi.~~ Sada `npm run bekap` (`pg_dump` na računar, provjeren, 90 dana). **Ostaje:** da se pokreće SAM (Task Scheduler) — dok nije u rasporedu, bekap zavisi od toga da se neko sjeti. | `alati/bekap.ts` |
| A2 | ✓ **riješeno u fazi 2 (24.09.2026)** | ~~Više koraka bez transakcije.~~ Sada 26 mjesta u transakciji: šifarnici, nalozi (uloga, lozinka, deaktivacija + brisanje sesija), zadaci, pravila kontrole (`for update`), zapis + neusaglašenost, izmjena stavke prijema (`for update` — ne preplete se sa odlukom), povlačenje, bekap sa table (`repeatable read` — jedan snimak). Prijava (poslednja prijava + sesija) svjesno nije. | rute, servisi |
| A3 | **S** | **Ruteri na zajedničkom `/api` sa `.use(requireAuth)`** — ko smije zavisi od REDOSLIJEDA montiranja; jedna takva greška je zaključala upravu i provjeru znanja. Svaki ruter treba svoj prefiks. | `server/index.ts` |
| A4 | **S** | SQL i poslovna pravila pola u rutama (`zadaci`, `poruke`, `tabla`, `ljudi`, `provjeraZnanja`), pola u servisima. | `server/routes/` |
| A5 | **S** | Testovi rade na ISTOJ demo bazi koju koristi Render i ne pokreću se sami (nema CI). | `testovi/` |
| A6 | **S** | Obavještenja stižu samo dok je aplikacija otvorena (provjera na 30 s) — nema push obavještenja na zaključan telefon. | `Layout.tsx` |
| A7 | **N** | Liste bez straničenja (lotovi, isporuke, neusaglašenosti) — dovoljno za malog distributera. | rute |
| A8 | **N** | Ograničenje pokušaja prijave je u memoriji — restart ga briše. | `server/auth.ts` |

### Uloge

| # | | Nalaz |
|---|:-:|---|
| U1 | ✓ **riješeno u fazi 2 (24.09.2026)** | ~~GET rute samo sa `requireAuth`.~~ Sada svaka GET ruta ima uloge po mapi strana; `/lica` samo vodstvo (+ `/lica/ja`); neusaglašenosti na terenu samo svoje; `/tabla` samo vodstvo i uprava. |
| U2 | ✓ **riješeno u fazi 3 (24.09.2026)** | ~~Pravilo četiri oka nema izlaz za malu firmu.~~ Izabran svjesno potpisan izuzetak (ne uprava, ne konsultant umjesto firme) — invarijanta #41. |
| U3 | **N** | Jedan `izvodjac` nalog po bazi — ako konsultantkinja dobije saradnika, dijele nalog i ne vidi se ko je šta uradio. |

---

## Plan izmjena po fazama

| Faza | Šta | Nalazi | Procjena |
|---|---|---|---|
| ~~**1 — HACCP rupe i bekap**~~ ✓ 23.09.2026 | Pusti / odbij lot na HOLD-u. Provjera samo uz urađenu mjeru. Odstupanje u obrascu → neusaglašenost. Potvrđena granica na svim KKT. `npm run bekap`. Test `faza1_haccp` (33 provjere). **Ostalo: Task Scheduler za bekap.** | H1, H2, H3, H4, A1 | urađeno |
| ~~**2 — Integritet baze**~~ ✓ 24.09.2026 | Brojevi iz `sljedeciBroj()`. 26 višekoračnih upisa u transakciji. CHECK liste za `izvor_tip` (dopuna 22). Uloge na svim GET rutama. Test `faza2_integritet` (30 provjera). Uz to: nalog i početna lozinka pri unosu zaposlenog, „Nova lozinka", kartice direktora, ulaz u provjeru znanja sa prijave. | B1, A2, B2, U1 | urađeno |
| ~~**3 — HACCP kao sistem**~~ ✓ 24.09.2026 | Plan monitoringa + „šta danas fali" na tabli i Mojoj strani. Termometri (provjera, kalibracija), revizija plana, interni audit, vježba povlačenja, štampa HACCP plana. Izuzetak od četiri oka za malu firmu. Jedan izvor granica. Temperatura obavezna na KKT 1. Dopuna `24_haccp_sistem_cg`, test `faza3_sistem` (41 provjera). | H5, H6, H7, U2, ostatak H4 | urađeno |
| **4 — Arhitektura i pogon** | Ruteri pod svojim prefiksom. SQL iz ruta u servise. Zasebna test baza + automatsko pokretanje testova. Odluka o `dogadjaj`. Push obavještenja (PWA). | A3, A4, A5, B4, A6 | 2–3 dana |
| **5 — Po potražnji klijenata** | Premještanje robe među skladištima, straničenje, više konsultantskih naloga. ~~Skeniranje otpremnica~~ ✓ 24.09.2026, urađeno prije faze 3 na zahtjev vlasnice (bez spoljnih servisa). | B3, A7, U3 | po stavci |

**Pilot sa prvim klijentom ide paralelno od faze 1** — pravi magacioner nađe ono što test ne nađe.

---

## Naučeno na teži način

| Problem | Uzrok | Rješenje |
|---|---|---|
| neusaglašenost se nikad nije mogla zatvoriti (500) | isti parametar i kao enum (`set status = $1`) i kao tekst (`case when $1 = …`) | kastovati na SVAKOM mjestu: `$1::nc_status_t`, `$2::uuid` |
| uprava 403 na Kontrolnom centru; provjera znanja 401 za sve | `.use(requireAuth, requireUloga(…))` BEZ putanje na ruteru montiranom na `/api` važi i za rute registrovane poslije | `.use("/izvoz", …)`; javne rute montirane PRVE; `testovi/pristup.test.mjs` |
| lot pod povlačenjem i dalje ponuđen za isporuku | povlačenje nije mijenjalo status lota | povlačenje stavlja lot na HOLD, zalihu u karantin |
| „poruka nije stigla" — a stigla je | zvonce se osvježavalo samo pri prelasku na drugu stranu | provjera na 30 s + pri povratku u aplikaciju (`Layout.tsx`) |
| ne zna se je li deploy prošao | izdanje zakucano na „1.0.0" | izdanje = `RENDER_GIT_COMMIT`, u `/api/zdravlje` i u dnu menija |
| deploy odjavljuje vozača usred ture | sesije u memoriji servera | sesije u bazi (`sesija_prijave`, heš tokena) |
| skor provjere znanja se mogao naduvati | više odgovora na isto pitanje, odgovori poslije završetka | jedan odgovor po pitanju, ništa poslije završetka |
| svi demo zapisi nose „naknadno" | vrijeme upisa = trenutak pokretanja skripte | `13_demo_cg.sql` na kraju poravnava `created_at` sa datumom |
| odstupanje „sa mjerom" koja je prazan razmak | `CHECK` je tražio samo `IS NOT NULL` | `COALESCE(btrim(…),'') <> ''`, `NOT VALID` |
| `cannot change data type of view column` / nova kolona ne ulazi u izvoz | `create or replace view` ne mijenja tip ni redoslijed; `p.*` se razvija pri pravljenju | `drop view` + `create view` |
| `invalid input value for enum` | `ALTER TYPE … ADD VALUE` u istoj transakciji sa upotrebom | samostalna naredba |
| build pada, typecheck prolazi (ili obrnuto) | `replaceAll`, `.at()` — projekat cilja stariji JS | `.replace(/…/g, …)`, `[arr.length - 1]` |
| kvačice kao `Ä‡` | kopirano bez UTF-8 | uvijek UTF-8 |
| zadržana roba se nije mogla ni pustiti ni odbiti | odluka je primala samo lot PRIMLJEN; RELEASE u enumu, a niko ga ne koristi | odluka radi i iz HOLD (`odHolda`); test `faza1_haccp` |
| lot zadržan pri prijemu (temperatura) nema zalihu uopšte | HOLD na KKT 1 se desi PRIJE odluke, pa prebacivanje DOSTUPNO → KARANTIN nema šta da prebaci | puštanje takvog lota pravi zalihu i PRIJEM u dnevniku; kod čita količinu u karantinu i ne pretpostavlja da postoji |
| zaliha u karantinu se udvostruči ili padne na unique | drugi HOLD istog lota radio je `insert` u `zaliha` sa (lot, status) koji već postoji | `on conflict (lot_id, status) do update` — sabira |
| `pg_dump` pravi bekap od 78 tabela, pola tuđih | Supabase ima svoje šeme (`auth`, `storage`, …) | `--schema=public`; sesije bez podataka (`--exclude-table-data`) — to su živi tokeni |
| dvije istovremene prijave → druga pada sa `duplicate key` | broj = `count(*) + 1` čitan van transakcije | `sljedeciBroj()` — ključ po prefiksu do kraja transakcije, `max` umjesto `count` |
| direktoru se kartice na Kontrolnom centru „ne otvaraju" | klik je vodio na strane na koje uprava ne smije, pa `mozeNa()` nije radio ništa | lista iza broja u prozoru (`/tabla/detalj`), ISTI uslov kao brojanje |
| „Lotovi na HOLD-u" vodi na Zalihe, a tamo ih nema | Zalihe se otvaraju na „Prihvaćeni" | kartica šalje izabran status (`navigate(…, { state })`) |
| Moja strana je čitala spisak SVIH zaposlenih da nađe svoje ime | `/lica` bez uloga, filtriranje u pregledaču | `/lica/ja`; `/lica` samo vodstvo |
| OCR fotografije gubi red tabele | `tesseract.js` podrazumijevano čita stranicu kao JEDAN blok (PSM 6) | `tessedit_pageseg_mode: 3` + Sauvola prag (`thresholding_method: 2`) — sjenka više ne briše pola papira (pouzdanost 67 → 90 %) |
| ista fotografija: u testu tačna, iz pregledača smeće | pregledač je smanji i ponovo kompresuje, a OCR je osjetljiv na razmjeru; zaglavlje nakrivljene tabele pada u dva reda | polja se prepoznaju po OBLIKU s desna (datum, lot, broj, jedinica), naziv je ostatak; slanje do 3200 px; test sa obje verzije slike |
| rečenica „…količinski manjak, … istekao rok, LOT" prepoznata kao zaglavlje tabele | tri riječi kolona u jednoj rečenici | zaglavlje = kratak red u kom su labele većina, i uzima se prvi kandidat ISPOD kog ima stavki |
| forma prijema ostavila prvog dobavljača sa spiska kad sa otpremnice nije prepoznat | početna vrijednost polja | nepoznat → prazno („— izaberite dobavljača —") |
| `pdfjs-dist` na starijem Node-u ne radi | traži Node ≥ 22.13 | `engines.node` u `package.json` — Render bira verziju po njemu |
| zaposleni nisu znali gdje se ulazi u provjeru znanja | adresa `/provjera-znanja` je stajala samo kao tekst kod Ane | dugme na strani za prijavu i na Mojoj strani (sa šifrom); kartica javlja kad nema otvorenog termina |
| server pao usred testova: `Connection terminated unexpectedly`, neuhvaćen `'error'` | `pg-pool` skida svoj slušalac greške sa klijenta dok je izdat — prekid veze usred transakcije ruši cio proces | `transakcija()` kači svoj slušalac i vraća klijenta sa `release(greska)` (pokvarena veza se ne vraća u bazen); `pool.on("error")`; `connectionTimeoutMillis: 10_000` |
| testovi odjednom padaju na 400 „Firma ima više skladišta" | vlasnica je na demo bazi (preko Rendera) dodala svoje skladište; testovi su pretpostavljali jedno | testovi biraju skladište izričito; tuđe skladište se nikad ne gasi — provjera „posljednje aktivno" bi inače ugasila Glavni magacin |
| Vite: `Unterminated string`, a stranica bijela | u nizu pod `"…"` tekst „HACCP plan" zatvoren ASCII navodnikom | unutar koda: „…“ (zatvara se sa “, U+201C) |
| temperatura na KKT 3 ocijenjena po drugoj granici nego na KKT 1 | KKT 3 je padao na `artikal.temp_*` kad pravila nema, KKT 1 nije | jedan izvor — pravilo (invarijanta #39); dopuna 24 napravila pravila iz postojećih granica |

### Gdje se zapravo testira

**Vlasnica radi na ŽIVOJ aplikaciji na Renderu.** Izmjena na računaru ne mijenja ništa dok ne ode
`git push` pa Render → Manual Deploy. Migracije (`npm run migriraj`) idu na istu Supabase bazu
i djeluju odmah — kod ne. Zato: **prvo migracije, pa deploy** (nov kod koji traži tabelu koje
nema ruši tu funkciju). Da li je deploy prošao: izdanje u dnu menija = `git log -1 --format=%h`.

### Okruženje

- **Supabase: Session pooler, port 5432.** Direct connection radi samo preko IPv6, Render ga ne dohvata.
- **Render besplatni plan spava poslije 15 min** — za demo i pravi rad plaćeni plan.
- Server ne učitava izmjene sam (`tsx` bez watch): poslije izmjene u `server/` — restart.
- **Node ≥ 22.13** (`engines` u `package.json`) — zbog `pdfjs-dist`.
- OCR: jedan Tesseract radnik za cijeli server, poslovi idu jedan za drugim, gasi se posle 5 min bez
  posla (oko 150 MB dok radi). Jezik `srp_latn` je u `node_modules` (`@tesseract.js-data/srp_latn`) —
  ništa se ne preuzima sa interneta. Slika: 3–5 s na računaru; na Render besplatnom planu sporije.

---

## Provjera prije isporuke

```bash
npm run typecheck
npm run build
npm run dev          # u drugom prozoru
npm run test:e2e     # samo demo baza; izlazni kod 1 ako išta padne
```

Pa ručno na telefonu (375 px): `/moja` za vozača i magacionera (i „Danas po planu" → „Upiši"),
potvrda isporuke sa temperaturom, „Prijavi problem".

---

## Otvoreno

Tehnički nalozi i plan su u „Nalazi" i „Plan izmjena po fazama" iznad. Od ranijih stavki i dalje
važi: broj Sl. lista Uredbe o higijeni hrane nije provjeren (vidi pravni okvir).

**Otpremnice — OCR je provjeren samo na izmišljenim i simuliranim fotografijama.** Prve prave
otpremnice pilot klijenta (više dobavljača, pravi telefon, loše svjetlo) će pokazati šta još ne
valja. Rukopis se ne čita. Skeniran PDF (samo slika, bez teksta) se odbija uz poruku da se slika.

**HACCP plan je polazni prijedlog.** „Predloži osnovni plan" i „Predloži tekst" daju razuman
početak za distributera, ali ga konsultant za svakog klijenta prilagođava stvarnim komorama,
vozilima i ritmu rada — prazno polje se u štampi vidi kao crveno „— upisati —". Faza 3 nije
prošla ručni klik kroz pregledač (samo build, typecheck i E2E kroz API) — prvo korišćenje na
Renderu je i prva vizuelna provjera.

**Bekap se ne pokreće sam** dok `npm run bekap` nije u Task Scheduleru na računaru
konsultantkinje. Skripta postoji i radi; raspored je odluka vlasnice (računar mora biti uključen
u to vrijeme).

### Van koda

- Ugovor nije pregledao crnogorski pravnik (naročito čl. 6, 7 i 9)
- Nije riješeno fakturisanje prema Crnoj Gori
- Nema nijedne reference — prvi klijent je pilot i tako se i cijeni
- Banka pitanja nije validirana ni na jednoj grupi; prvih ~30 ispitanika su pilot,
  ne mjerenje. **Ne slati klijentu analizu pitanja kao nalaz.**

---

## Šta NE ide u ovaj repozitorijum

`prezentacija/` i `dokumenti/` su isključeni u `.gitignore` i drže se u **zasebnom
privatnom repozitorijumu**. Razlog: prezentacija sadrži prodajni scenario i interne
slijepe tačke vlasnice, a `dokumenti/` cjenovnik i nacrt ugovora. Taj repozitorijum se
objavljuje na Render i jednog dana može dobiti saradnika — to tamo ne smije biti.

`.env` nikad ne ide u git. Ni u jedan repozitorijum.
