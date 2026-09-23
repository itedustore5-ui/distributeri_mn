# PILOT DISTRIBUTERI CG

Aplikacija za dobru higijensku praksu i HACCP kod distributera hrane u Crnoj Gori — prijem robe,
LOT i sledljivost, zalihe, HACCP kontrole, neusaglašenosti i korektivne mjere, isporuka kupcu,
vozila, ljudi (sanitarne knjižice, plan obuke), izvoz podataka i štampani prilozi.

Ne prodaje se softver — prodaje se odgovor na pitanje *„serija je sporna, kojim kupcima je
otišla?"* i dokaz da zapisi nastaju svakog dana, ne noć prije inspekcije. Pravni okvir i sve
poslovne odluke ove aplikacije su detaljno obrazložene u [CLAUDE.md](CLAUDE.md) — pročitajte ga
prije bilo koje izmjene koda.

## Stack

- **Frontend**: React 19 + TypeScript + Vite, React Router, obično `fetch` (bez dodatnih
  data-fetching biblioteka).
- **Backend**: Node.js + Express 5 + TypeScript, `pg` (node-postgres) sa ručno pisanim
  parametrizovanim SQL-om (bez ORM-a — jednostavnije za održavanje na ovoj skali), Zod za
  validaciju.
- **Baza**: PostgreSQL na [Supabase](https://supabase.com) — **jedna baza po klijentu**.
- **Deploy**: [Render](https://render.com) — jedan web servis po klijentu.

## Pravilo koje se ne krši

**Jedan klijent = jedna baza = jedan Render servis.** Aplikacija ne sprovodi izolaciju
više klijenata u istoj bazi. Ne dijeliti bazu između klijenata.

---

## Pokretanje lokalno

```bash
npm install
cp .env.example .env      # popuniti DATABASE_URL
npm run migriraj          # kreira šemu (fajlovi db/01_*.sql ... db/19_*.sql)
npm run seed:demo         # OPCIONO: dodaje demo podatke i demo naloge (SAMO za demo bazu)
npm run dev                # http://localhost:5000
```

### Environment (`.env`)

Vidi [`.env.example`](.env.example). Najvažnije:

- `DATABASE_URL` — Supabase **Session pooler**, port **5432**. Direct connection radi samo
  preko IPv6 i Render ga ne dohvata — ako se koristi, aplikacija se neće moći povezati u
  produkciji.
- `NODE_ENV` — `development` lokalno, `production` na Renderu.

Nema `SESSION_SECRET` ni `ADMIN_TOKEN` — sesije su nasumični 256-bitni tokeni koje server čuva
u memoriji (nema šta da se potpisuje), a nema HTTP admin-rute koja bi trebalo zaglavlje sa
tokenom (za razliku od ranije verzije aplikacije). Sve administrativne operacije idu preko
`alati/*` skripti koje se povezuju direktno na bazu.

### Migracije

`npm run migriraj` primjenjuje SQL fajlove iz `db/` po redu (`01_organizacija.sql` →
`19_skladista_poruke_cg.sql`), i pamti šta je već primijenjeno u tabeli `schema_migracije` —
bezbjedno je pokrenuti ga više puta. `db/13_demo_cg.sql` se primjenjuje samo sa `--demo`
(odnosno `npm run seed:demo`), i **nikad na bazi pravog klijenta**. Fajlovi poslije 13
(`14_povlacenje.sql`, `15_isporuka_uneo_cg.sql`, `16_bekap_cg.sql`, `17_naknadno_cg.sql`, `18_temperatura_predaje_cg.sql`, `19_skladista_poruke_cg.sql`) su dodati naknadno namjerno —
brojevi fajlova prate redoslijed kad su nastali, ne semantičku grupu; runner demo fajl uvijek
tretira posebno bez obzira na njegov broj.

Redoslijed fajlova nije proizvoljan — svaki sljedeći pretpostavlja da prethodni postoji
(FK reference, `alter table` na postojeće tabele). Ne mijenjati redoslijed.

### Demo nalozi

Poslije `npm run seed:demo`, ispisuju se korisnička imena i lozinke u terminalu (samo tada — poslije
se ne mogu ponovo prikazati). Podrazumijevano:

| Uloga | Korisničko ime |
|---|---|
| Konsultant (izvođač) | `konsultant` |
| Odgovorno lice (bzr) | `ana.b` |
| Magacioner (operater) | `marko.v` |
| Vozač | `petar.j` |
| Uprava | `direktor` |

---

## Build i produkcija

```bash
npm run build     # tsc -b && vite build -> dist/
npm start         # NODE_ENV=production tsx server/index.ts, servira dist/
```

`npm run typecheck` provjerava i `tsconfig.app.json` (frontend) i `tsconfig.server.json`
(backend) — pokrenuti prije svakog puša.

---

## Deploy na Render — nova instanca za novog klijenta

Svaki klijent dobija **svoj** Supabase projekat i **svoj** Render web servis, sa istim kodom.

1. **Supabase**: napraviti novi projekat. Iz **Project Settings → Database → Connection
   string** uzeti **Session pooler** (port 5432), ne Direct connection.
2. **Render**: novi Web Service iz ovog repozitorijuma.
   - Build command: `npm install && npm run build`
   - Start command: `npm start`
   - Environment: `DATABASE_URL` (iz koraka 1), `NODE_ENV=production`
   - Plaćeni plan — besplatni plan spava poslije 15 min neaktivnosti, a prvi zahtjev poslije
     toga čeka ~50 s. Neprihvatljivo za demo pred klijentom ili za magacionera koji žuri.
3. Poslije prvog deploy-a, sa svog računara pokrenuti migracije protiv NOVE baze:
   ```bash
   DATABASE_URL="<connection string novog klijenta>" npm run migriraj
   DATABASE_URL="<connection string novog klijenta>" npm run prvi-korisnik -- --firma "Naziv d.o.o." --ime "Ime Prezime" --korisnik ime.prezime
   ```
   `prvi-korisnik` ispisuje privremenu lozinku — proslijediti je odmah odgovornom licu
   (`bzr`), koje potom u `/moja` mijenja lozinku i u `/ljudi` otvara naloge magacioneru i
   vozaču.
4. Dodati klijenta u `alati/klijenti.txt` (nije u gitu — ostaje samo na vašem računaru):
   ```
   Naziv klijenta = postgresql://...
   ```
5. Provjera da je deploy stvarno prošao: `GET /api/zdravlje` vraća `{ ok: true, izdanje: "..." }`.

### Demo instalacija

Demo baza (za prodajne sastanke) se pravi na isti način, ali sa `npm run seed:demo` umjesto
`prvi-korisnik`. Demo se nikad ne koristi za pravi rad klijenta, niti obrnuto.

---

## Alati (`alati/`) — pokreću se sa računara konsultantkinje, ne sa servera

| Alat | Šta radi |
|---|---|
| `npm run prvi-korisnik -- --firma "..." --ime "..." --korisnik ...` | Prvi nalog (`bzr`) poslije instalacije kod klijenta. |
| `npm run dnevni-pregled` | Stanje SVIH klijenata iz `alati/klijenti.txt` u jednom ispisu (poslednji unos, otvorene neusaglašenosti). Izlazni kod `1` ako je neko u zastoju (>2 dana bez unosa) — pogodno za Task Scheduler + mejl na grešku. |
| `node alati/napravi-licencu.ts "Naziv klijenta"` | Administrativni licencni ključ za ugovor (aplikacija ga ne provjerava — to je papirni trag, ne tehnička brava). |
| `powershell -File alati/bekap.ps1` | `pg_dump` po klijentu u `bekap/`, briše starije od 90 dana. Zahtijeva `pg_dump` u PATH-u. |

`alati/klijenti.txt` (format `Naziv = postgresql://...`, po jedan red) sadrži lozinke baza — u
`.gitignore` je i mora tu i ostati.

**Bekap se ne radi sam** — `bekap.ps1` mora biti u Windows Task Scheduler-u (ili ekvivalentu) da
bi se izvršavao periodično. Dok nije podešeno, bekapa nema.

---

## Arhitektura

```
db/                    SQL šema (01-12) + demo podaci (13) + migracioni runner
server/
  index.ts             bootstrap: Express, CSRF zaglavlje, montiranje ruta, Vite (dev) / static (prod)
  db.ts                pg Pool, transakcije, provjera postojanja pogleda/tabele
  auth.ts              sesije, uloge, PROZOR (koliko dana unazad koja uloga smije), CSRF
  lozinke.ts           scrypt heš, provjera dužine
  vrijeme.ts           datum po podgoričkom vremenu (Europe/Podgorica), ne UTC
  validacija.ts        Zod helper
  greske.ts            konzistentan format greške { error: { code, message, details } }
  services/            poslovna logika: haccp (evaluacija pravila), prijem, isporuka, zaliha,
                        neusaglašenosti, vozila, sledljivost, izvoz, događaji, audit, zadaci
  routes/               REST rute po modulu, montirane pod /api
src/
  pages/               po jedna strana po ulozi/modulu (Tabla, Ljudi, Prijem, Zalihe, HACCP,
                        Neusaglašenosti, Vozila, Isporuka, Moja, Sledljivost, Prilozi,
                        Izvještaji, Audit, ProvjeraZnanja, Admin)
  components/          Layout (sidebar+topbar), StatusBadge, Modal, StatCard
  lib/                 api.ts (fetch wrapper + CSRF zaglavlje), auth.tsx (AuthContext)
public/obrasci-cg.json definicija dnevnih obrazaca (P3/P7/P8) — nov obrazac se dodaje ovdje
alati/                 CLI skripte, pokreću se sa računara konsultantkinje
```

### Pet uloga (ne deset)

| Uloga | Za koga | Vidi |
|---|---|---|
| `bzr` | Odgovorno lice za bezbjednost hrane | sve u firmi — prva strana poslije prijave je `/tabla` |
| `operater` | Magacioner | prijem, zalihe, HACCP, isporuka — samo poslednji 1 dan, samo svoje unose |
| `vozac` | Vozač | vozila (D1 — vidi samo vozač), isporuka — samo poslednji 1 dan, samo svoje unose |
| `uprava` | Direktor | pregled bez unosa; šalje poruke zaposlenima |
| `izvodjac` | Konsultant | sve + banka pitanja za provjeru znanja + podešavanje firme (`/admin`) |

Dozvole se provjeravaju **na serveru** (`server/auth.ts` → `requireUloga`, `ogranicenjeDatuma`,
`samoMoje`, `izvrsilacZa`) — frontend meni samo krije stavke, ne štiti ništa.

### Poslovni tok

```
Dobavljač → Prijem → LOT (obavezan broj lota) → odluka (PRIHVATI / HOLD / ODBIJI)
  → Zaliha (FEFO) → Isporuka (vezana za LOT, kupac mora imati telefon) → Kupac

HACCP mjerenje → evaluacija protiv pravila iz baze (PASS/WARNING/FAIL)
  → FAIL: Neusaglašenost + Zadatak + Obavještenje bzr-u + LOT na HOLD

Svaka kritična odluka piše i u dogadjaj (events) i u audit_log — oba imutabilna.
```

Sledljivost unazad i unaprijed (`/sledljivost`) čita iz pogleda `v_sledljivost_naprijed` /
`v_sledljivost_nazad` definisanih u `db/12_pogledi.sql`.

### Izmjena i uklanjanje

Ništa se ne briše iz baze kroz aplikaciju. Umjesto toga:

- **Ljudi** (`/ljudi`): "Izmijeni" mijenja podatke o licu; "Ukloni" postavlja `aktivan = false`
  (lice ostaje u istoriji zapisa, samo nestaje sa aktivnog spiska; "Vrati" ga reaktivira).
- **Prijem** (`/prijem`): stavka se može ispraviti ("Izmijeni") **samo dok lot čeka odluku**
  (status `PRIMLJEN`) — čim je prihvaćen/na čekanju/odbijen, brojke su već uticale na zalihu i
  ispravka ide kroz novi zapis, ne kroz prepravku ove stavke.
- **Isporuka** (`/isporuka`): cijela isporuka (vozilo, datum, stavke — dodavanje/uklanjanje/
  promjena količine) se može izmijeniti **samo dok je U_PRIPREMI** — čim je potvrđena, zaliha je
  već umanjena.
- **Vozila** (`/vozila`): svaka D1 kontrola ostaje trajno u „Evidencija kontrola" ispod spiska
  vozila — ne može se izmijeniti ni obrisati, samo se doda nova.

### Otpis zaliha

`/zalihe` → dugme **"Otpiši"** na lotu koji ima nešto dostupno (oštećeno, isteklo, izgubljeno).
Jedini drugi način da količina na zalihi ide dolje je isporuka — ručnog unosa novog broja nema
nigdje, da izvještaj o zalihama ostane dokaz, ne procjena. Otpis ide kroz isti obrazac kao
isporuka: transakcija koja umanjuje `zaliha.kolicina`, upisuje red u `kretanje_zalihe` (tip
`OTPIS`, razlog u `napomena`) i ostavlja trag u `dogadjaj`/`audit_log`. Dozvoljeno svima koji rade
sa robom (`operater`, `bzr`, `izvodjac`) — magacioner prijavljuje šta je zatekao, isto kao kod
prijema.

### Šifarnici

`/sifarnici` — jedino mjesto gdje se unose kupci, dobavljači i artikli (do sad su postojale samo
API rute, bez forme; padajuće liste u prijemu/isporuci su samo birale iz onoga što je ovdje
uneseno). Tri jezička: Kupci (telefon obavezan, čl. 28), Dobavljači, Artikli (temperaturni opseg
i „Granicu potvrdio klijent" — dok nije potvrđeno, automatska ocjena odstupanja se ne primjenjuje,
invarijanta #5). Vidljivo samo `bzr`/`izvodjac`.

### Prva prijava — obavezna promjena lozinke

Dok god `korisnik.mora_promijeniti_lozinku` stoji na `true` (postavlja ga bzr/izvodjac pri
otvaranju naloga), cijela aplikacija je zaključana na jedan ekran — „Postavite svoju lozinku" —
bez obzira na ulogu i putanju. Provjera je u `Zasticeno` u `src/App.tsx`, prije provjere uloge, pa
je nema šanse zaobići idući direktno na neku drugu stranicu. Ranije se ovo polje čitalo sa servera
ali ništa u pregledaču nije reagovalo na njega — privremena lozinka je mogla ostati u trajnoj
upotrebi.

### Bekap

Kontrolna tabla (`/tabla`, samo `bzr`/`izvodjac`) ima karticu **Bekap**: dugme koje odmah pravi
snimak svih poslovnih tabela (JSON) i preuzima ga u pregledač, i status poslednjeg bekapa (kad,
ko/automatski, koliko tabela i redova). Isti proces se pokreće **sam jednom sedmično** —
`pokreniSedmicniBekap()` u `server/services/bekapService.ts` provjerava pri svakom pokretanju
servera (i onda jednom dnevno) da li je prošlo 7 dana od poslednjeg bekapa; ako jeste, napravi ga
i pošalje obavještenje ulozi `bzr`. Provjera je po stvarnom vremenu iz baze, ne po tajmeru koji
mora neprekidno da radi — zato radi i kad besplatni Render plan uspava server: prvi sledeći
zahtjev probudi server i provjera se pokrene odmah.

**Važno ograničenje, da se ne pogrešno razumije kao potpuna zaštita:** bekap se čuva u
`bekap_log` u ISTOJ Supabase bazi (90 dana, pa se briše). To štiti od greške u aplikaciji ili
čovjeku ("kakvo je stanje bilo prije nedelju dana"), ali NE štiti od gubitka same Supabase baze —
za to i dalje služi `alati/bekap.ps1` (pg_dump na spoljnu lokaciju), koji ostaje otvorena stavka
dok se ne zakaže u Task Scheduleru. Preporuka: s vremena na vrijeme preuzeti bekap sa table i
sačuvati ga van aplikacije.

### Povlačenje (čl. 28)

`/sledljivost` → rezultat pretrage → **Pokreni povlačenje** (samo `bzr`/`izvodjac`) otvara
povlačenje za taj LOT i **automatski** popuni spisak kupaca iz stvarnih isporuka (ime, telefon,
količina — ručno se ništa ne kuca, da se niko ne izostavi). Otvara i neusaglašenost visoke
ozbiljnosti i zadatak. Sekcija „Povlačenja" na istoj strani prati ko je već zvan
(„Označi zvano" po kupcu) i ne dozvoljava zatvaranje dok svi nisu kontaktirani. Spisak se štampa
dugmetom „Štampaj spisak" (`db/14_povlacenje.sql`).

### Obavještenja i zadaci — ko šta dobija

Zvonce u zaglavlju pokazuje broj nepročitanih; klik na obavještenje vodi na stranu na koju se
odnosi (samo ako uloga smije tamo).

| Kome | Kada |
|---|---|
| odgovorno lice (`bzr`) | temperatura van opsega · pokrenuto povlačenje · vozilo nije prošlo kontrolu · sedmični bekap |
| vozač | dodijeljena mu je isporuka (pri pravljenju ili kad se promijeni vozač) |
| magacioner | lot sa njegovog prijema je **zadržan** ili **odbijen** (odmah, po lotu); cio prijem je riješen (jedna poruka, ne po stavci) |
| svako | dodijeljen mu je zadatak ili korektivna mjera · neusaglašenost koju je prijavio je zatvorena · **poruka** od odgovornog lica ili uprave |

Niko ne dobija obavještenje o onome što je sam uradio.

**Zadaci** nastaju sami (neusaglašenost, povlačenje, kontrola vozila) i nastaju
**nedodijeljeni** — odgovorno lice ih vidi na Kontrolnom centru i u „Moji zadaci", i dodjeljuje
ih nekome padajućim spiskom (ta osoba dobije obavještenje). Terenske uloge vide samo zadatke
dodijeljene njima. Zadatak se **zatvara sam** kad se zatvori neusaglašenost ili povlačenje iz
kog je nastao. Odgovorno lice pravi i **ručne zadatke** („Novi zadatak": šta, kome, prioritet,
rok) — rok je kraj izabranog dana po podgoričkom vremenu.

### Poruke

`/poruke` (odgovorno lice, konsultant, uprava): poruka se šalje **po grupi** (magacioneri,
vozači, …), **pojedinačno** ili **svima**; „Važno" je ističe crveno. Primalac je dobija kao
obavještenje sa imenom pošiljaoca. Pošiljalac vidi „pročitalo X od Y" i spisak ko je pročitao.
Poruka se ne briše i ne mijenja (`poruka`, `db/19_skladista_poruke_cg.sql`). Svi pošiljaoci
vide sve poslate poruke — da odgovorno lice i uprava ne šalju različita uputstva istim ljudima.

### Više skladišta

Dopuna 19 pravi jedno skladište („Glavni magacin") i veže za njega sve postojeće prijeme i
isporuke. **Dok firma ima jedno aktivno skladište, izbor se nigdje ne prikazuje.** Čim se u
Šifarnici → Skladišta doda drugo, prijem, isporuka i zalihe dobijaju izbor i kolonu „Magacin".

- Lot ostaje u skladištu u koje je primljen; isporuka ide iz jednog skladišta i server odbija
  lot iz drugog. **Premještanje robe između skladišta nije u ovoj verziji.**
- Matično skladište naloga (Ljudi → Nalozi) je samo podrazumijevani izbor — magacioner po potrebi
  bira drugo pri unosu. Bez matičnog, a sa više skladišta, izbor je obavezan.
- Posljednje aktivno skladište se ne može ugasiti; ugašeno ostaje u istoriji.

Isporuke se filtriraju po **datumu, vozilu i magacinu** (vozač vidi samo svoje).

### Temperatura pri predaji (KKT 3)

Na potvrdi isporuke, za svaki artikal pod temperaturnim režimom (`artikal.temp_kontrolisano`)
koji se predaje, vozač upisuje temperaturu izmjerenu kod kupca — bez nje server odbija potvrdu.
Čuva se na stavci (`isporuka_stavka.temperatura_predaje`, `db/18_temperatura_predaje_cg.sql`) i
izvozi u „Stavke isporuka".

Ocjena ide redom: pravilo za KKT 3 postavljeno za taj artikal → granica sa samog artikla, **samo
ako je potvrđena** (`granica_potvrdio`). Nepotvrđena granica se ne ocjenjuje. Opšte pravilo
KKT 3 (rashladni režim vozila, 0–5 °C) se namjerno ne koristi — po njemu bi smrznuta roba na
−18 °C ispala „van opsega". Van granice → mjerenje FAIL na KKT 3 (vezano za lot i vozilo),
neusaglašenost i zadatak, obavještenje odgovornom licu. **Lot u magacinu se ne stavlja na HOLD**
— problem je nastao u prevozu, a roba koja je ostala u magacinu nije bila u tom vozilu.

---

## Pravni okvir (sažetak — puna verzija u CLAUDE.md)

- **Zakon o bezbjednosti hrane**, „Sl. list CG" **59/2026** (na snazi od 12.05.2026): čl. 27
  sledljivost, čl. 28 povlačenje, čl. 35 higijena, čl. 36 HACCP, čl. 43 registracija, čl. 47
  vodiči, čl. 82 kazne (2.000–20.000 € pravno lice).
- **Sanitarne knjižice**: Zakon o zaštiti stanovništva od zaraznih bolesti, čl. 31 (kazna
  2.500–20.000 €) — ljekarski pregled, ne obuka. U `lice` se čuva samo broj i rok, nikad nalaz.
- **Obuka zaposlenih nije zakonska obaveza** u važećem zakonu — nikad se ne predstavlja kao
  takva. Prodaje se kao dokaz da HACCP sistem radi (čl. 36) + Vodič UBH Prilog 13/14.
- **Obrazac 6 ne postoji u Crnoj Gori** (srpski obrazac) — nikad se ne pominje.
- Obrasci P1/P3/P7/P8 i D1-D4 u ovoj aplikaciji su **autorski**, ne zvanični obrasci UBH.

---

## Sigurnost

- Lozinke: `scrypt` heš (`server/lozinke.ts`), minimalna dužina 10 znakova, provjera i na
  serveru i u pregledaču. Lozinka se prikazuje **tačno jednom**, pri kreiranju naloga — poslije
  toga samo stanje (`privremena`/`svoja`/`postavljena`).
- Sesije: httpOnly kolačić, `SameSite=Lax`, `Secure` u produkciji, 8h trajanje.
- CSRF: state-changing zahtjevi (`POST`/`PATCH`/`DELETE`) moraju nositi zaglavlje
  `x-zahtjev-app: 1` (`server/auth.ts` → `zahtjevAppZaglavlje`) — cross-site forme ga ne mogu
  postaviti.
- Rate limiting na prijavu: 8 neuspjelih pokušaja po IP-u zaustavlja dalje pokušaje na 10 min.
- SQL injection: svi upiti su parametrizovani (`$1, $2...`), nema string-konkatenacije
  korisničkog unosa u SQL (jedini izuzetak su imena tabela u `izvozService.ts`, koja dolaze
  isključivo iz hardkodovane liste, nikad od korisnika).
- Validacija: Zod na serveru je autoritativna; frontend validacija je samo za UX.
- `korisnik.uloga` sa klijenta se nikad ne vjeruje — svaka ruta provjerava ulogu iz sesije.

## Mobilni prikaz

Layout je responzivan (bočni meni postaje off-canvas ispod 760px, modali postaju bottom-sheet
ispod 480px, tabele dobijaju horizontalno skrolovanje). Terenske strane (`/haccp`, `/isporuka`,
`/vozila`, `/moja`) su testirane prvenstveno za telefon — magacioner i vozač rade sa telefona.

---

## Testiranje prije isporuke klijentu

```bash
npm run typecheck
npm run build
```

Ručno, na `npm run dev`, kroz svih pet uloga:

1. Prijava kao `bzr`, `operater`, `vozac`, `uprava`, `izvodjac` — provjeriti da meni odgovara
   ulozi.
2. **Prijem → LOT → zaliha → isporuka**: unijeti prijem sa temperaturom u opsegu, prihvatiti
   lot, kreirati isporuku, potvrditi je.
3. **Devijacija**: unijeti mjerenje van opsega (npr. 8.6°C za rashlađeno) → provjeriti da se
   otvorila neusaglašenost, zadatak i da je LOT otišao na HOLD; dodati korektivnu mjeru,
   završiti je, verifikovati drugim nalogom (ne istim koji je završio mjeru), zatvoriti.
4. **Sledljivost**: pretraga po broju lota — provjeriti lanac dobavljač → prijem → lot →
   isporuka → kupac.
5. **Izvoz**: preuzeti CSV po tabeli i sve odjednom (JSON) sa `/izvjestaji`.
6. **Prilozi**: štampati rješenje o imenovanju i Prilog 13/14 sa `/prilozi`.
7. **Provjera znanja**: sa `/provjera-znanja`, ući šifrom sa spiska zaposlenih, odgovoriti na
   pitanja, provjeriti evidenciju na `/prilozi` → Prilog 14.
8. **Mobilni prikaz**: DevTools na 375px širine, provjeriti `/haccp`, `/isporuka`, `/moja`.

---

## Šta NIJE u ovoj verziji (namjerno)

Picking, rute, optimizacija ruta, rezervacije zaliha, povrati/reklamacije kao posebni moduli,
multi-facility/multi-zone skladište, barcode/IoT senzori, spoljne integracije (ERP,
računovodstvo), SMS/email obavještenja. Vidi plan/CLAUDE.md za obrazloženje — cilj je sistem
koji magacioner stvarno koristi, ne enterprise WMS.

## Otvoreno

- Bekap se ne radi sam dok `alati/bekap.ps1` nije u Task Scheduleru.
- Obavještenje o „tišini" klijenta (`dnevni-pregled`) je alat koji se pokreće ručno, ne mejl —
  pravi mejl traži SMTP nalog (poslovna odluka, ne kod).
- Ugovor i cjenovnik nijesu dio ovog repozitorijuma (vidi `.gitignore` — `prezentacija/` i
  `dokumenti/` žive u posebnom privatnom repozitorijumu).
- Banka pitanja za provjeru znanja nije validirana ni na jednoj grupi — prvih ~30 ispitanika su
  pilot, ne mjerenje.
