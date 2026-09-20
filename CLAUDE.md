# CLAUDE.md — kontekst projekta

**Pročitaj ovaj fajl prvi, prije bilo kakvog rada u ovom repozitorijumu.**
Ovdje je sve što se ne vidi iz koda: zašto je nešto tako, šta se ne smije dirati,
i na čemu se već izgubilo vrijeme.

Ažurira se pri svakoj većoj izmjeni. Ako nešto naučiš na teži način — upiši ovdje.

---

## Šta je ovo

Aplikacija za **dobru higijensku praksu i HACCP kod distributera hrane u Crnoj Gori.**
Vlasnica je konsultantkinja iz Srbije koja uslugu prodaje crnogorskim firmama:
uspostavljanje sistema jednokratno (900–1.600 €) + mjesečno održavanje (80–180 €).

Nastala je kao nadogradnja na postojeću aplikaciju za mjerenje osposobljenosti zaposlenih
(`hoteli-pilot` / `pilot_firme` / `pilot_hoteli` — ista aplikacija za različite branše).

**Šta se stvarno prodaje:** ne softver, nego odgovor na pitanje *„serija je sporna, kojim
kupcima je otišla?"* i dokaz da zapisi nastaju svakog dana, a ne noć prije inspekcije.

---

## Pravilo koje se nikad ne krši

**Jedan klijent = jedna baza = jedan Render servis.**

Kod to **ne sprovodi** — `firma_id` se uzima iz URL parametra i nigdje se ne poredi sa
`korisnik.firma_id`. Dok je jedna baza po klijentu, nema problema. Prvi put kad se dva
klijenta nađu u istoj bazi, svaki vidi svakoga.

Postoji i **demo instalacija** — posebna baza sa izmišljenim podacima (`05_demo_cg.sql`),
za prodajne sastanke. Demo se nikad ne koristi za pravi rad, niti obrnuto.

---

## Kome se predaje aplikacija

**Prvi nalog koji se otvara u klijentovoj firmi je `bzr` — odgovorno lice za bezbjednost
hrane.** Ne direktor, ne magacioner.

Zakon 59/2026 ne propisuje da firma mora imenovati „odgovorno lice za bezbjednost hrane"
kao funkciju. Ono što postoji je **„odgovorno lice u pravnom licu" iz čl. 82** — pojam
prekršajnog prava, koje lično plaća 500–2.000 €. Dok firma pisano ne odredi ko to jeste,
to je izvršni direktor. *(likely — iz teksta kazni, ne iz odredbe koja imenuje funkciju.)*

Zato se sistem predaje ovim redom:

| # | Šta | Čime |
|---|---|---|
| 1 | Direktor potpiše rješenje o imenovanju | `prilozi.html` → prva stavka u spisku |
| 2 | Imenovanom licu se otvara nalog `bzr` | `alati/prvi-korisnik.mjs` / komandna tabla |
| 3 | To lice dobija `tabla.html` kao prvu stranu | automatski, po ulozi |
| 4 | Upisuje lica koja rukuju hranom i rokove sanitarnih knjižica | `ljudi.html` → Sanitarne knjižice |
| 5 | Magacioneri i vozači dobijaju `operater` naloge — **otvara ih sam** | `ljudi.html` → Nalozi |
| 6 | Direktor dobija `uprava` — samo pogled, bez unosa | po potrebi |

**Rješenje o imenovanju nije zakonski obrazac** i tako se i predstavlja. Ono je pisani
trag ko sprovodi postupke iz čl. 36 i ko javlja UBH po čl. 28. Bez njega inspektor pita
direktora, a direktor pokazuje na nekoga ko nigdje nije zapisan.

---

## Pravni okvir — Crna Gora, provjereno

**Obrazac 6 ne postoji u Crnoj Gori.** To je srpski obrazac iz Pravilnika o evidencijama
BZR. Crnogorski inspektor ga ne traži i ne priznaje. Nosivi propis je zakonodavstvo o
hrani, a nadzor vodi **UBH** (Uprava za bezbjednost hrane, veterinu i fitosanitarne
poslove).

| Propis | Broj | Članovi |
|---|---|---|
| Zakon o bezbjednosti hrane | **59/2026** (objavljen 04.05.2026) — stavio 57/15 van snage | **brojevi članova nepoznati, ne citirati** |
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

## Arhitektura

Postojeća aplikacija se **ne prepisuje** — dodaju se fajlovi i dvije linije u
`server/index.js`:

```js
import { zapisiRuter } from './zapisi.js';   // uz ostale import-e
app.use(express.json());                      // MORA ostati i MORA biti prvo
app.use(zapisiRuter);                         // odmah ispod
```

### SQL — redoslijed nije proizvoljan

| Fajl | Šta pravi |
|---|---|
| `01_schema.sql` | 22 tabele: `firma`, `korisnik` (prijava), obuke, pitanja i provjera znanja |
| `00_sifre.sql` | šifre razloga i opasnosti (srpske, interne — klijentu se ne pokazuju) |
| `02_pogledi.sql` | osnovni izvještaji |
| `03_analiza.sql` | **`v_evidencija_osposobljavanja`** → Prilog 14 i potvrde |
| `04_zapisi_cg.sql` | crnogorski dio: `zapis`, `prijem`, `isporuka`, šifarnici, sledljivost. **Na početku radi DROP TABLE — nikad ga ne pokretati na živoj bazi.** |
| `05_demo_cg.sql` | demo podaci. **Samo na demo bazi.** |
| `06_ispravke_cg.sql` | ispravke zapisa + uloga `operater`. Ne dira podatke, bezbjedno na živoj bazi. |
| `07_dopune_cg.sql` | oznaka naknadnog unosa, pogledi za izvoz i dnevni pregled, zabrana prazne korektivne mjere. Ne dira podatke. **Ako ikad ponovo pokreneš 06, odmah poslije pokreni i 07.** |
| `08_lica_cg.sql` | tabela `lice` i pogled `v_lica` — ko rukuje hranom i dokad važi sanitarna knjižica. Ne dira podatke, bezbjedno na živoj bazi. |
| `09_nalog_lice_cg.sql` | `korisnik.lice_id` + pogled `v_nalozi` — nalog za prijavu vezan za lice sa spiska, pa nalog nosi šifru i radno mjesto. Ne dira podatke. |
| `10_plan_obuke_cg.sql` | tabela `plan_obuke` + pogled `v_plan_obuke` — Prilog 13 kao plan sa stanjem (planirano/uskoro/kasni/urađeno), ne kao dnevni zapis. Ne dira podatke. |
| `11_zaposleni_cg.sql` | `lice.rukuje_hranom` + prošireni `v_lica` (`ima_nalog`) — spisak postaje spisak SVIH zaposlenih. Ne dira podatke. |
| `12_ko_je_unio_cg.sql` | `uneo_korisnik_id` na `zapis`, `prijem`, `isporuka` — nalog sa kojeg je zapis poslat. Ne dira podatke. |
| `13_uloga_vozac_cg.sql` | `uloga_t` dobija `vozac`. **`ALTER TYPE ... ADD VALUE` mora biti samostalna naredba.** |
| `14_moje_liste_cg.sql` | `v_sledljivost_nazad` i `v_sledljivost_napred` nose `uneo_korisnik_id` — bez toga filter „vidim samo svoje" nema po čemu da radi. `v_izvoz_sledljivost` se obnavlja **nepromijenjen** (njegove kolone su zaglavlja CSV-a). |
| `15_trag_ispravki_cg.sql` | pogled `v_trag_ispravki`, izvučen iz 06. **Bez njega cio izvoz pada** sa `relation "v_trag_ispravki" does not exist` — 06 se ne pokreće ponovo, jer bi vratio poglede na stariju verziju od 07 i 14. Ne dira podatke. |

### Server

- `server/zapisi.js` — sav crnogorski API (`/api/cg/*`), montiran kao Express ruter
- `server/index.js` — postojeća aplikacija, dirano samo na dva mjesta

### Stranice

| Stranica | Za koga | Uređaj |
|---|---|---|
| `index.html` | ulazna strana — vodi na prijavu; provjera znanja je sporedna vrata | svi |
| `tabla.html` | **odgovorno lice za bezbjednost hrane** — prva strana poslije prijave za ulogu `bzr` | računar |
| `ljudi.html` | odgovorno lice — svi zaposleni, godišnji plan obuke, nalozi | računar |
| `moja.html` | **svaka uloga** — svoja šifra, svoja knjižica, svoj rad, šta danas fali | telefon i računar |
| `admin.html` | konsultant — komandna tabla (uloga `izvodjac`) | računar |
| `podesavanje.html` | konsultant | računar |
| `promet.html` | magacioner, vozač — prijem (KKT 1) i isporuka (KKT 3) | **telefon** |
| `zapisi.html` | magacioner — dnevni obrasci P1–D4 | **telefon** |
| `sledljivost.html` | odgovorno lice — pretraga serije, vježba povlačenja | računar |
| `prilozi.html` | odgovorno lice — štampa priloga i potvrda | računar + štampač |
| `izvoz.html` | odgovorno lice, konsultant — izvoz podataka klijentu (CSV/JSON) | računar |

`public/obrasci-cg.json` definiše obrasce. **Nov obrazac se dodaje tamo, bez migracije baze.**
Poslije izmjene obavezno `node test_pravila.mjs`.

### Alati — pokreću se sa njenog računara, ne sa servera

| Alat | Šta radi |
|---|---|
| `alati/prvi-korisnik.mjs` | pravi nalog konsultanta poslije instalacije |
| `alati/napravi-licencu.mjs` | licencni ključ |
| `alati/dnevni-pregled.mjs` | stanje SVIH klijenata u jednom ispisu; izlazni kod 1 ako je neko u zastoju |
| `alati/dopune.mjs` | primjenjuje SQL dopune 07 i 08 na bazu iz `.env`. Radi i u cmd-u. Idempotentno — već primijenjeno preskače. Nikad ne dira 04 ni 05. |
| `alati/bekap.ps1` | `pg_dump` po klijentu u `bekap/`, briše starije od 90 dana |

Oba posljednja čitaju `alati/klijenti.txt` (`Naziv = postgresql://...`, po jedan red).
**Taj fajl ima lozinke — u `.gitignore` je i ostaje tamo.** Ako ga nema, gledaju samo
`DATABASE_URL` iz `.env`.

---

## Invarijante — ovo se ne smije pokvariti

1. **Zapis se ne briše i ne mijenja.** Ispravka je NOV zapis sa `ispravlja_id` → stari.
   Važeći je onaj **na koji niko ne pokazuje**:
   `NOT EXISTS (SELECT 1 FROM t n WHERE n.ispravlja_id = t.id)`.
   *Ranije je stajalo `ispravlja_id IS NULL` — to je naopako i skrivalo je ispravku.*
2. **Odstupanje bez korektivne mjere se ne snima.** Sprovedeno na tri mjesta: `CHECK` u
   bazi, provjera u API-ju, provjera u pregledaču.
3. **Prijem bez broja serije se odbija.** Bez lota nema sledljivosti (čl. 41).
4. **Kupac bez telefona se ne upisuje.** Povlačenje po čl. 42 počinje telefonom.
5. **Automatska ocjena odstupanja samo za potvrđene granice.** Dok je
   `artikal.granica_potvrdio` prazno, granica je pretpostavka konsultanta, ne podatak
   klijenta — i ne smije se po njoj odbijati roba.
6. **Operater vidi samo posljednja dva dana** (`ogranicenje(req, kolona)` u `zapisi.js`).
   Kolona se prosljeđuje — `zapis.datum`, ali `v_sledljivost_nazad.datum_prijema`.
7. **Isporuka se veže za PRIJEM, ne za artikal.** Tako lot ostaje povezan.
8. Zalihe i ponuđene serije idu po **FEFO** — prvo ističe, prvo izlazi.
9. **Koliko unazad se smije upisati stoji na SERVERU**, ne u pregledaču:
   operater 1 dan · `bzr` 7 · `izvodjac` 30 (`PROZOR` u `zapisi.js`). Datum u
   budućnosti se ne prima nikad.
10. **Naknadan unos se ne krije.** `datum < kreirano::date` → oznaka `naknadno +N`
    u listama i u izvozu. Zapis se smije unijeti kasnije; ne smije izgledati kao da
    je unesen istog dana.
11. **Dan se računa po podgoričkom vremenu**, ne po UTC-u — `danasCG()` na serveru,
    `lokalniDatum()` u pregledaču. `toISOString()` se za datum ne koristi nigdje.
12. **`ADMIN_TOKEN` se prima samo iz zaglavlja `x-admin-token`.** Nikad iz adrese.
13. **Odgovorno lice (`bzr`) otvara naloge samo ulozi `operater` i samo u svojoj firmi.**
    Nikad sebi ravan ni iznad sebe. Sprovedeno u `smijeNadUlogom()` i `ciljKorisnik()`
    u `server/index.js` — ne u pregledaču.
14. **Banka pitanja je samo izvođačeva** (`bankaPitanja` u `server/index.js`): stavke,
    distraktori, analiza kvaliteta, pregled sesije, paket, šifarnik. Ko zna pitanja,
    ne mjeri više znanje. Rezultate i evidenciju obuke odgovorno lice vidi normalno.
15. **U `lice` se upisuje broj i rok sanitarne knjižice — nikad nalaz pregleda.**
    Rok je podatak o dokumentu, nalaz je podatak o zdravlju.
16. **Nalog za prijavu i lice sa spiska su dvije stvari, spojene preko `korisnik.lice_id`.**
    Ime i šifra se čitaju iz `lice`, ne prepisuju u `korisnik` — inače se raziđu.
    Stari nalozi bez veze prikazuju „bez šifre" i vezuju se dugmetom „poveži".
17. **Lozinka nije šifra.** Lozinkom se prijavljuje (`korisnik.lozinka_hash`),
    šifrom potpisuje zapise (`lice.sifra`, polje `izvrsilac`). Ne miješati u tekstu.
18. **Prilog 13 je plan, ne zapis.** Živi u `plan_obuke`, unosi se na `ljudi.html`
    → Godišnji plan obuke, štampa iz `prilozi.html`. Stavka koja je prošla bez
    obuke se NE briše — označi se kao „kasni" i tako i izlazi na štampu.
19. **Odjava i promjena lozinke se dodaju iz `veza.js`**, u `dodajOdjavu()`, na
    kraj `.nav` svake stranice. Ne dopisivati ih ručno po stranicama.
20. **Jedan spisak ljudi, ne dva.** `lice` je spisak SVIH zaposlenih;
    `rukuje_hranom` odlučuje za koga važe knjižica i obuka. Druga tabela
    „zaposleni" se ne pravi — dvije liste ljudi se razilaze prvim preimenovanjem.
21. **Polje „izvršilac" se ne kuca.** Server ga postavlja iz sesije
    (`izvrsilacZa()` u `zapisi.js`): operateru UVIJEK njegovo ime, bez obzira
    šta pošalje pregledač; `bzr` i `izvodjac` smiju upisati drugo lice, jer
    unose i za one koji nemaju nalog, i dobijaju spisak zaposlenih za izbor.
22. **`izvrsilac` i `uneo_korisnik_id` nisu isto.** Prvi je KO JE OBAVIO radnju
    (može biti i bez naloga), drugi je NALOG sa kojeg je zapis poslat. „Moja
    tabla" broji po nalogu; stari zapisi bez naloga se i dalje traže po imenu.
23. **`potpis` u `/api/ja` je IME, ne šifra.** Zapis čita inspektor, a „M-01"
    mu ne znači ništa. Pregledač i server rade isti račun — ne smiju se razići.
24. **Pet uloga, ne četiri.** `operater` = magacin (prijem + P3/P7/P8),
    `vozac` = prevoz (isporuka + D1 kontrola vozila). **D1 vidi SAMO vozač** —
    zapis o vozilu potpisuje onaj ko je stajao pored njega; `MOJI` u
    `zapisi.html` više ne daje magacinu vozačke obrasce. Firma bez ijednog
    vozačkog naloga: D1 unosi odgovorno lice. Obje su „na terenu": prozor od
    jednog dana, potpis zaključan, `NA_TERENU` u `zapisi.js`. Firma u kojoj
    isti čovjek prima i vozi koristi `operater` — podjela se ne nameće.
25. **Obrazac nosi `uloga` u `obrasci-cg.json`.** Po njoj se filtriraju pločice:
    vozač vidi samo D1, magacin svoje i vozačke, odgovorno lice sve. Nov
    obrazac bez `uloga` neće se pojaviti terenskim ulogama.
26. **Terenske uloge u listama vide SAMO SVOJE unose** — `samoMoje()` i
    `samoMojeIsporuke()` u `zapisi.js`. Filtrira se po `uneo_korisnik_id`, a
    za stare zapise bez naloga po potpisu, da čovjeku ne nestane istorija.
    Odgovorno lice i konsultant vide sve i to se nigdje ne ograničava.
27. **Radno mjesto nije uloga.** `lice.radno_mjesto` je podatak o čovjeku i ide
    na štampu; `korisnik.uloga` odlučuje KOJU TABLU vidi. Mogu se razići i
    razišli su se u praksi (magacioner sa ulogom `vozac` → vozačka tabla).
    Zato: uloga se predlaže iz radnog mjesta pri otvaranju naloga,
    neslaganje se ispisuje, a `POST /api/korisnici/:id/uloga` je ispravlja
    bez zatvaranja naloga. Promjena uloge briše sesiju — stara nosi staru ulogu.
28. **Lozinka se nigdje ne prikazuje osim jednom, pri postavljanju.** U bazi je
    samo heš. Na ekranu naloga stoji STANJE (`privremena` / `svoja` /
    `postavljena`), nikad vrijednost. Traženo je dvaput i dvaput odbijeno —
    ako se ikad popusti, svaki potpis u aplikaciji gubi vrijednost.
    Najmanja dužina je **10 znakova**, provjerava se i u pregledaču i na
    serveru, i piše na tri mjesta u interfejsu.
29. **Šifre za potpisivanje stoje na jezičku „Godišnji plan obuke"**, kao
    spisak ime · radno mjesto · šifra sa dugmetom za štampu. Tamo se dijele —
    uz obuku. Mijenjaju se i dalje na „Svi zaposleni".
30. **Izvoz ne smije da padne zbog jednog nedostajućeg pogleda.** Prije svakog
    upita `postoji()` u `zapisi.js` provjeri `to_regclass`. Nedostajući izvor
    se prijavi poimence (spisak dobije `nedostaje` i `razlog`, `sve.json`
    dobije listu `nedostaje`, pojedinačni CSV vraća 409 sa komandom za
    popravku) — sve ostalo se izveze normalno. Ranije je jedan pogled koji
    nije ušao rušio CIO izvoz sa `relation ... does not exist`, a klijent je
    ostajao bez svih podataka.
31. **Preuzimanje ide kroz `fetch`, ne kroz `<a href>`.** Obično preuzimanje
    koje padne pregledač ne prikaže nikako — klik izgleda kao pokvareno
    dugme, a server je vratio 401, 409 ili 500. `preuzmi()` u `izvoz.html`
    pročita odgovor, ispiše tačnu grešku, i tek onda snimi fajl.
32. **U provjeru znanja se ulazi ŠIFROM SA SPISKA ZAPOSLENIH.** `lice.sifra` i
    `ucesnik.sifra` su isti broj sa ceduljice. Ako šifra nije u `ucesnik`,
    `/api/sesija` je traži u `lice` iste firme i upisuje čovjeka sam, u
    trenutku ulaska. Nema drugog spiska za održavanje. Ime se prepisuje samo
    kad `grupa.cuva_imena` — inače mjerenje ostaje anonimno, ali onda i
    **Prilog 14 izlazi bez imena prisutnih.**
33. **Tri stvari obaraju provjeru znanja, nijedna se ne vidi iz aplikacije:**
    (a) `import { generisiFormu } from './forma.js'` u `server/index.js` —
    bez njega `/api/sesija` puca sa „generisiFormu is not defined"; bio je
    izgubljen pri odvajanju crnogorske verzije i vidio se samo u logu;
    (b) stavke banke koje čekaju potvrdu (`zahteva_potvrdu` i `potvrdio IS
    NULL`) — jedna nepotvrđena porodica obara CIJELU provjeru, potvrđuje se
    na komandnoj tabli; (c) nema otvorenog termina (`talas.otvoren`).
    Sve troje provjerava `alati/provjeri.mjs`.

---

## Naučeno na teži način

| Problem | Uzrok | Rješenje |
|---|---|---|
| `Cannot read properties of undefined (reading 'email')` | obrisan `app.use(express.json())` pri dodavanju rutera | mora postojati i biti **prije** ruta |
| `syntax error at or near "db"` u Supabase | nalijepljeno **ime fajla** umjesto sadržaja | `Get-Content db\x.sql -Raw -Encoding UTF8 \| Set-Clipboard` |
| kvačice se prikazuju kao `Ä‡` | kopirano bez `-Encoding UTF8` | uvijek sa tim dodatkom |
| `'Get-Content' is not recognized` | naredba iz uputstva nalijepljena u **cmd**, a to je PowerShell cmdlet | dopune ide `node alati\dopune.mjs` — radi u oba |
| magacioner ne može da se prijavi | `/api/lozinka` nije dozvoljavao ulogu `operater`, a `mora_promeniti` je TRUE | uloga dodata u `dozvoli(...)` |
| operater završi na `/admin.html` | `gde()` u `prijava.html` nije poznavao ulogu | operater → `/promet.html` |
| `invalid input value for enum uloga_t: "operater"` | `ALTER TYPE` nije prošao | `ALTER TYPE uloga_t ADD VALUE IF NOT EXISTS 'operater';` kao **samostalna** naredba |
| `timestamp + integer` greška | `generate_series` vraća `timestamptz` | `d::date` |
| ekran spremnosti javlja 15 rupa umjesto 3 | nedjelje se računaju kao radni dani | `?neradni=0`, podrazumijevano nedjelja |
| „1 artikala bez granice" | nema padeža | `pade(n, jedan, dva, pet)` u `zapisi.js` |
| izvještaj štampa sirov JSON | `podaci->>'opis'` je NULL | `jsonb_each_text` + `string_agg` |
| operateru puca lista prijema (500) | `ogranicenje()` je zakucavao kolonu `datum`, a pogled ima `datum_prijema` | kolona se prosljeđuje kao argument |
| `cannot change data type of view column` | `CREATE OR REPLACE VIEW` ne mijenja tip kolone | `DROP VIEW IF EXISTS` pa `CREATE VIEW` |
| svi demo zapisi nose oznaku „naknadno" | `kreirano` je trenutak pokretanja skripte, a datumi su unazad | `05_demo_cg.sql` na kraju poravnava `kreirano` sa `datum` |
| odstupanje „sa mjerom" koja je prazan razmak | `CHECK` je tražio samo `IS NOT NULL` | `COALESCE(btrim(...),'') <> ''`, `NOT VALID` da ne padne na živoj bazi |

### Gdje se zapravo testira

**Vlasnica radi na ŽIVOJ aplikaciji na Renderu, ne lokalno.** Iz toga slijedi:

- Izmjena fajla na njenom računaru **ne mijenja ništa** dok ne ode
  `git add -A && git commit && git push`, pa Render → Manual Deploy.
- SQL dopune (`node alati\dopune.mjs`) idu na **istu Supabase bazu** koju
  koristi Render, pa one djeluju odmah — a kod ne. Otuda stalna zbrka
  „baza je zelena, a aplikacija se ponaša staro".
- `alati/provjeri.mjs` prima adresu:
  `node alati\provjeri.mjs https://moja-app.onrender.com`, ili `APP_URL=` u
  `.env`. Bez toga gleda `localhost` i javlja da server ne radi — što je tačno,
  ali beskorisno.
- Oznaka izdanja u `/api/zdravlje` (`IZDANJE` u `server/index.js`) je jedini
  pouzdan način da se vidi je li deploy stvarno prošao.

### Okruženje

- **Supabase: obavezno Session pooler, port 5432.** Direct connection radi samo preko IPv6
  i Render ga ne dohvata.
- **Render besplatni plan spava poslije 15 min**, prvi zahtjev čeka ~50 s. Za demo pred
  klijentom — plaćeni plan, ne UptimeRobot.
- Node ne učitava izmjene sam: poslije izmjene u `server/` treba **restart**.

---

## Provjera prije isporuke

```bash
node test_pravila.mjs        # pravila odstupanja po obrascima
python3 db/_gradi_banku.py   # banka: 22 porodice, 70 pitanja, 6 tema
node test_simulacija.mjs     # postojeći test mjerenja znanja
node test_uloge.mjs          # ko šta smije da vidi
node alati/dnevni-pregled.mjs # stižu li zapisi uopšte, po svim klijentima
```

Lokalno: `npm start`, pa provjeri tri stvari — pretragu serije `MLJ-2609-A` na
`/sledljivost.html`, crvenu presudu na Prilogu P7 sa temperaturom `8.6`, i pregled
odstupanja na `/prilozi.html`.

---

## Otvoreno — po redu hitnosti

| # | Šta | Stanje |
|---|---|---|
| 1 | **Bekap se ne radi sam.** `alati/bekap.ps1` postoji, ali ga neko mora pokrenuti. Dok to nije u Task Scheduleru, bekapa nema. | **otvoreno** |
| 2 | Obavještenje o tišini je alat koji se pokreće ručno (`alati/dnevni-pregled.mjs`), nije mejl. Pravi mejl traži SMTP nalog — to je poslovna odluka, ne kod. | otvoreno, ublaženo |
| 3 | Nema provjere da korisnik pripada firmi iz URL-a — `firmaZa(req)` uzima `korisnik.firma_id` kad postoji, ali `izvodjac` ima `firma_id = NULL` pa i dalje pada na `?firma=` | otvoreno (ublaženo pravilom jedna baza = jedan klijent) |
| 4 | Stari redovi sa praznom korektivnom mjerom nisu provjereni — `CHECK` je `NOT VALID` | otvoreno, vidi se u dnevnom pregledu |
| ✓ | Datum zapisa zaključan na serveru — `PROZOR` po ulozi + zabrana budućnosti | riješeno |
| ✓ | Izvoz podataka klijentu (čl. 7 ugovora) — `izvoz.html`, CSV po tabeli + sve u jednom JSON-u | riješeno |
| ✓ | `ADMIN_TOKEN` samo iz zaglavlja `x-admin-token` | riješeno |
| ✓ | Datum po podgoričkom vremenu umjesto UTC-a | riješeno |
| ✓ | Naknadan unos se prepoznaje i prikazuje | riješeno |
| ✓ | Operater ne može da promijeni lozinku | riješeno |
| ✓ | Svaka uloga ide na svoj ekran poslije prijave (`bzr` → `tabla.html`) | riješeno |
| ✓ | `/api/cg/spremnost` ima svoj ekran — `tabla.html` | riješeno |
| ✓ | Rješenje o imenovanju odgovornog lica — `prilozi.html`, prva stavka u spisku | riješeno |
| ✓ | Ispravka pogrešnog unosa + trag ispravki | riješeno |

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
