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
npm run migriraj          # kreira šemu (fajlovi db/01_*.sql ... db/21_*.sql)
npm run seed:demo         # OPCIONO: dodaje demo podatke i demo naloge (SAMO za demo bazu)
npm run dev                # http://localhost:5000
```

### Environment (`.env`)

Vidi [`.env.example`](.env.example). Najvažnije:

- `DATABASE_URL` — Supabase **Session pooler**, port **5432**. Direct connection radi samo
  preko IPv6 i Render ga ne dohvata — ako se koristi, aplikacija se neće moći povezati u
  produkciji.
- `NODE_ENV` — `development` lokalno, `production` na Renderu.
- `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` — **nisu potrebni**. Ključ za push
  obavještenja server pravi sam pri prvom pokretanju i čuva ga u bazi klijenta (`web_push_kljuc`);
  kontakt je javna adresa servisa na Renderu (`RENDER_EXTERNAL_URL`, Render ga sam postavlja).

Nema `SESSION_SECRET` ni `ADMIN_TOKEN` — sesije su nasumični 256-bitni tokeni; u bazi
(`sesija_prijave`, `db/20_sesije_prijave_cg.sql`) stoji samo njihov sha256 heš, pa deploy i restart
nikoga ne odjavljuju. Promjena lozinke odjavljuje sve ostale uređaje; promjena uloge i
deaktivacija odjavljuju sve. Server tabelu sesija pravi i sam pri pokretanju ako je nema, da
deploy prije dopune 20 ne zaključa korisnike van aplikacije. Nema HTTP admin-rute koja bi trebalo zaglavlje sa
tokenom (za razliku od ranije verzije aplikacije). Sve administrativne operacije idu preko
`alati/*` skripti koje se povezuju direktno na bazu.

### Migracije

`npm run migriraj` primjenjuje SQL fajlove iz `db/` po redu (`01_organizacija.sql` →
`27_talas2_cg.sql`), i pamti šta je već primijenjeno u tabeli `schema_migracije` —
bezbjedno je pokrenuti ga više puta. `db/13_demo_cg.sql` se primjenjuje samo sa `--demo`
(odnosno `npm run seed:demo`), i **nikad na bazi pravog klijenta**. Fajlovi poslije 13
(`14_povlacenje.sql`, `15_isporuka_uneo_cg.sql`, `16_bekap_cg.sql`, `17_naknadno_cg.sql`, `18_temperatura_predaje_cg.sql`, `19_skladista_poruke_cg.sql`, `20_sesije_prijave_cg.sql`, `21_pitanja_firme_cg.sql`, `22_integritet_cg.sql`, `23_otpremnice_cg.sql`, `24_haccp_sistem_cg.sql`, `25_push_cg.sql`, `26_talas1_cg.sql`, `27_talas2_cg.sql`) su dodati naknadno namjerno —
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
   vozaču (vidi „Ljudi — nalozi i početna lozinka").
4. Dodati klijenta u `alati/klijenti.txt` (nije u gitu — ostaje samo na vašem računaru):
   ```
   Naziv klijenta = postgresql://...
   ```
5. Provjera da je deploy stvarno prošao: `GET /api/zdravlje` vraća `{ ok: true, izdanje: "abc1234" }` —
   izdanje je commit koji Render stvarno pokreće (`RENDER_GIT_COMMIT`), i piše i u dnu menija.
   Uporediti sa `git log -1 --format=%h`. Lokalno piše „lokalno".

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
| `npm run bekap` | `pg_dump` svake baze iz `alati/klijenti.txt` (ili, bez tog fajla, baze iz `DATABASE_URL`) u `bekap/<klijent>/`. Samo šema `public`, bez podataka sesija prijave. Svaki fajl se odmah provjeri (`pg_restore --list`); stariji od 90 dana se brišu; ishod u `bekap/POSLJEDNJI-BEKAP.txt`; izlazni kod `1` ako ijedan klijent padne. Traži PostgreSQL alate iste ili novije verzije od servera (uzima najnoviji iz `C:\Program Files\PostgreSQL`, ili `PG_DUMP=` / `PG_RESTORE=`). |

`alati/klijenti.txt` (format `Naziv = postgresql://...`, po jedan red) sadrži lozinke baza — u
`.gitignore` je i mora tu i ostati.

**Bekap van baze** pravi `npm run bekap`, ali **ne pokreće se sam** dok nije dodat u Task
Scheduler (računar mora biti uključen u to vrijeme). Dnevno u 2:00, na primjer:

```bat
schtasks /Create /SC DAILY /ST 02:00 /TN "PILOT bekap" /TR "cmd /c cd /d C:\masaze\distributeri_mn && npm run bekap"
```

**Vraćanje** — uvijek u NOVU, praznu bazu, nikad preko žive:

```bash
pg_restore --no-owner --no-privileges --dbname "<adresa nove baze>" bekap/<klijent>/<fajl>.dump
```

Pa `npm run migriraj` na toj bazi (preskače već primijenjeno) i provjera jednog lota na
`/sledljivost`. Vraćanje probati bar jednom prije nego što zatreba.

---

## Arhitektura

```
db/                    SQL šema (01-12) + demo podaci (13) + migracioni runner
server/
  index.ts             bootstrap: Express, CSRF zaglavlje, javne rute → GRANICA PRIJAVE → ostale rute,
                        Vite (dev) / static (prod), provjera ruta pri startu
  provjeraRuta.ts      javniRuter() i provjeriRute(): ruta bez uloga ili ruter sa .use → server ne kreće
  db.ts                pg Pool, transakcije, provjera postojanja pogleda/tabele
  auth.ts              sesije, uloge (requireUloga, sviPrijavljeni), PROZOR, CSRF
  lozinke.ts           scrypt heš, provjera dužine
  vrijeme.ts           datum po podgoričkom vremenu (Europe/Podgorica), ne UTC
  validacija.ts        Zod helper
  greske.ts            konzistentan format greške { error: { code, message, details } }
  services/            SQL i poslovna pravila: haccp (evaluacija pravila), prijem, isporuka, zaliha,
                        neusaglašenosti, vozila, sledljivost, izvoz, audit, zadaci, poruke, tabla,
                        ljudi, provjera znanja, push
  routes/               REST rute po modulu, montirane pod /api — šema, uloga, poziv servisa, odgovor
src/
  pages/               po jedna strana po ulozi/modulu (Tabla, Ljudi, Prijem, Zalihe, HACCP,
                        Neusaglašenosti, Vozila, Isporuka, Moja, Sledljivost, Prilozi,
                        Izvještaji, Audit, ProvjeraZnanja, Admin)
  components/          Layout (sidebar+topbar), StatusBadge, Modal, StatCard
  lib/                 api.ts (fetch wrapper + CSRF zaglavlje), auth.tsx (AuthContext)
public/obrasci-cg.json definicija dnevnih obrazaca (P3–P10) — nov obrazac se dodaje ovdje; čitaju je
                        i pregledač i server (koji odgovor je odstupanje: `odstupanjeAko`, obavezan tekst: `obavezno`)
public/sw.js           service worker SAMO za push obavještenja (ništa ne kešira)
public/manifest.webmanifest  aplikacija na početnom ekranu telefona (ikone ikona-192/512.png)
testovi/               E2E testovi; izolovano.mjs pravi sopstvenu test bazu (npm test)
.github/workflows/     testovi na svaki push (GitHub Actions)
alati/                 CLI skripte, pokreću se sa računara konsultantkinje
```

### Pet uloga (ne deset)

| Uloga | Za koga | Vidi |
|---|---|---|
| `bzr` | Odgovorno lice za bezbjednost hrane | sve u firmi — prva strana poslije prijave je `/tabla` |
| `operater` | Magacioner | prijem, zalihe, HACCP, isporuka — samo poslednji 1 dan, samo svoje unose i isporuke koje je sam spremio |
| `vozac` | Vozač | vozila (D1 — vidi samo vozač), isporuka — samo poslednji 1 dan, samo dodijeljene; on potvrđuje predaju |
| `uprava` | Direktor | pregled bez unosa; šalje poruke zaposlenima |
| `izvodjac` | Konsultant | sve + banka pitanja za provjeru znanja + podešavanje firme (`/admin`) |

Dozvole se provjeravaju **na serveru** (`server/auth.ts` → `requireUloga`, `ogranicenjeDatuma`,
`samoMoje`, `izvrsilacZa`) — frontend meni samo krije stavke, ne štiti ništa.

### Poslovni tok

```
Dobavljač → Prijem → LOT (obavezan broj lota) → odluka (PRIHVATI / HOLD / ODBIJI)
  → Zaliha (FEFO) → Isporuka (vezana za LOT, kupac mora imati telefon) → Kupac

LOT na HOLD-u (karantin) → bzr: PUSTI (razlog obavezan) → zaliha, ili ODBIJ → otpis
  (ne pušta se dok je povlačenje u toku)

Prijem robe pod temperaturnim režimom → temperatura OBAVEZNA (KKT 1)

HACCP mjerenje → evaluacija protiv pravila iz baze (PASS/WARNING/FAIL)
  → FAIL: Neusaglašenost + Zadatak + Obavještenje bzr-u + LOT na HOLD
  → artikal sa NEPOTVRĐENOM granicom: samo WARNING i obavještenje bzr-u, bez HOLD-a
  Granica artikla se unosi u Šifarnicima → postaje pravilo KKT 1 i KKT 3 (jedan izvor)

Odstupanje u dnevnom obrascu → Neusaglašenost „čeka provjeru" + Zadatak + Obavještenje bzr-u
Neusaglašenost se zatvara samo uz urađenu mjeru i samo tuđom provjerom
  (izuzetak: firma sa JEDNIM odgovornim licem — označeno, obrazloženo, konsultant obaviješten)

Plan monitoringa (šta, koliko često, ko) → „Danas po planu" na Mojoj strani,
  „Danas fali po planu · juče propušteno" na Kontrolnom centru
Termometar ne prođe provjeru → Neusaglašenost + Zadatak + upozorenje na HACCP strani;
  mjerenja njime od posljednje dobre provjere su „upitna", a njime se više ne mjeri
Mjerenje (prijem, magacin, predaja) pamti termometar; lot se ocjenjuje po granici SVOG artikla

D1 prije utovara: čistoća, oprema, vrata + temperatura po granici vozila (rashladno vozilo)
  → pala → vozilo NIJE SPREMNO + Neusaglašenost; „spremno" važi samo za dan kontrole
Roba pod temperaturnim režimom ide samo rashladnim vozilom; predaja traži današnju D1

Dnevni obrazac: odstupanje slijedi iz odgovora („tragovi štetočina: da"), ne samo iz kvačice
  Ispravka: nov zapis, jednom, istog obrasca; terenska uloga samo svoj
Neusaglašenost iz kontrole (mjerenje, D1, termometar) se zatvara tek kad ponovna kontrola prođe

Predaja kupcu → server PONOVO provjerava lot (prihvaćen, rok nije istekao) i zalihu
  → nepredato i odbijeno → KARANTIN → bzr: vrati u prodaju ili otpiši (Zalihe)
Lot pređe na HOLD (mjerenje van granice, povlačenje) → isporuke u pripremi sa njim:
  „Ne predajte lot" vozaču i onome ko je spremio
Istekao rok na zalihi → ne isporučuje se; kartica „Rok robe" na Kontrolnom centru;
  bzr dobija obavještenje jednom po lotu

Svaka kritična odluka piše u audit_log (imutabilan; dogadjaj se od faze 4 ne puni).
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
  vozila — ne može se izmijeniti ni obrisati, samo se doda nova. Vozilo (registarski broj, režim
  od–do °C, u upotrebi) mijenja odgovorno lice — „Izmijeni vozilo"; audit pamti šta je bilo.
- **Dnevni obrasci** (`/haccp`): „Ispravi" pravi nov zapis koji zamjenjuje stari; stari ostaje
  vidljiv (posivljen, „ispravljen"). Ispravlja se samo posljednja verzija; magacioner samo svoj zapis.

Svaka izmjena u `audit_log` nosi i **staru i novu vrijednost** (samo polja koja su se promijenila);
ekran `/audit` ih prikazuje kao „bilo → sada".

### Otpremnica — slikaj ili učitaj

Prijem → Novi prijem → **„Slikaj otpremnicu"** (telefon otvara kameru) ili **„Učitaj PDF ili sliku"**.
Otpremnica se čita **na vašem serveru, bez ikakvog spoljnog servisa**:

- **PDF** od dobavljača — tekst se čita direktno iz fajla, tačno do slova. PDF sa više otpremnica
  nudi izbor.
- **Fotografija** — lokalni OCR (Tesseract, srpska latinica), uz ispravljanje nagiba i sjenke. Polja
  koja je pročitao nesigurno (npr. „J" pročitano kao „)") su **žuta**.

Aplikacija samo **popuni formu**: dobavljač (po PIB-u), broj i datum dokumenta, stavke (artikal,
lot, rok, količina). Magacioner sve upoređuje sa robom i etiketom i to potvrđuje kvačicom — bez nje
se ne snima. Nepoznat dobavljač ostaje prazan (odgovorno lice ga doda jednim klikom, sa PIB-om).
Artikal sa otpremnice („J-010 Jogurt 1 kg") se prvi put bira ručno, a aplikacija ga **zapamti za tog
dobavljača** — sljedeći put ga prepozna sama.

Uz stavku ostaje šta piše na otpremnici: **manjak** („po otpremnici 50, primljeno 47") i **drugi lot**
se vide u prijemu i na listi („odstupa od otpremnice"). Otpremnica (PDF/slika) se čuva uz prijem i
otvara iz njega; ulazi i u bekap. Temperaturu sa otpremnice aplikacija samo prikaže — to je podatak
dobavljača; KKT 1 mjeri magacioner.

**Istekao rok:** takva roba se upisuje (stigla je), odgovorno lice odmah dobija obavještenje, a
stavka se **ne može prihvatiti** — samo odbiti (povrat ili uništenje).

Ograničenja: rukopis se ne čita; skeniran PDF bez teksta se odbija (slikajte ga); OCR je do sada
provjeren na izmišljenim otpremnicama i simuliranim fotografijama — prve prave otpremnice pilot
klijenta su pravi test.

### Otpis zaliha

`/zalihe` → dugme **"Otpiši"** na lotu koji ima nešto dostupno (oštećeno, isteklo, izgubljeno).
Jedini drugi način da količina na zalihi ide dolje je isporuka — ručnog unosa novog broja nema
nigdje, da izvještaj o zalihama ostane dokaz, ne procjena. Otpis ide kroz isti obrazac kao
isporuka: transakcija koja umanjuje `zaliha.kolicina`, upisuje red u `kretanje_zalihe` (tip
`OTPIS`, razlog u `napomena`) i ostavlja trag u `audit_log`. Dozvoljeno svima koji rade
sa robom (`operater`, `bzr`, `izvodjac`) — magacioner prijavljuje šta je zatekao, isto kao kod
prijema.

**Karantin povrata.** Roba koja se vrati sa isporuke (kupac odbio ili nije predata) ne ide nazad u
slobodnu zalihu — ide u **karantin** tog lota, a odgovorno lice dobija obavještenje. Na `/zalihe`
lot tada ima dugmad **„Iz karantina: pusti"** (pregledano — temperatura, ambalaža, rok — vraća se u
prodaju) i **„Iz karantina: otpiši"**. Upisuje se šta je pregledano. Istekla roba se ne pušta,
samo otpisuje.

**Dupli klik i slaba mreža.** Dugme za slanje je zaključano dok zahtjev traje, a nov prijem i nova
isporuka nose ključ zahtjeva — ako telefon pošalje isto dvaput (izgubljen odgovor), server vraća
prvi upis umjesto drugog. Bez interneta poruka kaže da je unos ostao u formi.

### Šifarnici

`/sifarnici` — jedino mjesto gdje se unose kupci, dobavljači i artikli (do sad su postojale samo
API rute, bez forme; padajuće liste u prijemu/isporuci su samo birale iz onoga što je ovdje
uneseno). Tri jezička: Kupci (telefon obavezan, čl. 28), Dobavljači, Artikli (temperaturni opseg
i „Granicu potvrdio klijent" — dok nije potvrđeno, automatska ocjena odstupanja se ne primjenjuje,
invarijanta #5). Vidljivo samo `bzr`/`izvodjac`.

### Ljudi — nalozi i početna lozinka

Odgovorno lice otvara nalog magacioneru ili vozaču na dva mjesta:

- **Novo lice** → kvačica „Otvori i nalog za prijavu". Uloga se predlaže iz radnog mjesta
  („vozač…" → vozač, inače magacioner), korisničko ime iz imena („Marko Vuković" → `marko.v`),
  a početna lozinka je predložena (npr. `Durmitor-4827`) — može se prekucati svojom, najmanje
  10 znakova. Lice i nalog nastaju zajedno ili nikako: zauzeto korisničko ime ne ostavlja lice
  bez naloga.
- **Svi zaposleni** → „Otvori nalog" kod svakog ko ga još nema (ili kartica Nalozi → „Novi nalog").

Poslije toga se prikaže **jednom**: korisničko ime, početna lozinka i šifra, sa dugmetom
„Štampaj ceduljicu" za zaposlenog. Poslije zatvaranja lozinku ne vidi niko.

Zaboravljena lozinka: Nalozi → **„Nova lozinka"** — postavlja novu privremenu, prekida prijavu
na svim uređajima tog naloga, a pri sljedećoj prijavi se opet mora promijeniti. Odgovorno lice
ovo može samo magacioneru i vozaču (invarijanta #13); svoju mijenja na Mojoj strani.

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
za to je `npm run bekap` (vidi Alati).

### Povlačenje (čl. 28)

`/sledljivost` → rezultat pretrage → **Pokreni povlačenje** (samo `bzr`/`izvodjac`) otvara
povlačenje za taj LOT i **automatski** popuni spisak kupaca iz stvarnih isporuka (ime, telefon,
količina — ručno se ništa ne kuca, da se niko ne izostavi). **Lot odmah ide na HOLD, a zaliha
tog lota u karantin** — sporna serija se više ne nudi za isporuku. Otvara i neusaglašenost visoke
ozbiljnosti i zadatak. Sekcija „Povlačenja" na istoj strani prati ko je već zvan
(„Označi zvano" po kupcu) i ne dozvoljava zatvaranje dok svi nisu kontaktirani. Spisak se štampa
dugmetom „Štampaj spisak" (`db/14_povlacenje.sql`). Zadržan lot se ne može pustiti dok je
povlačenje u toku; odbiti (otpisati) se može.

### Obavještenja i zadaci — ko šta dobija

Zvonce u zaglavlju pokazuje broj nepročitanih; klik na obavještenje vodi na stranu na koju se
odnosi (samo ako uloga smije tamo).

| Kome | Kada |
|---|---|
| odgovorno lice (`bzr`) | temperatura van opsega · pokrenuto povlačenje · vozilo nije prošlo kontrolu · sedmični bekap · **prijavljen problem sa terena** · **mjera urađena — čeka provjeru** |
| uprava | temperatura van opsega · povlačenje · vozilo nije spremno · problem visoke ozbiljnosti — sve ostalo vidi u „Aktivnosti uživo" |
| vozač | dodijeljena mu je isporuka (pri pravljenju ili kad se promijeni vozač) |
| magacioner | lot sa njegovog prijema je **zadržan** ili **odbijen** (odmah, po lotu); cio prijem je riješen (jedna poruka, ne po stavci) |
| svako | dodijeljen mu je zadatak ili korektivna mjera · neusaglašenost koju je prijavio je zatvorena · **poruka** od odgovornog lica ili uprave |

Niko ne dobija obavještenje o onome što je sam uradio.

**Na telefon, i kad je aplikacija zatvorena:** Moja strana → **„Obavještenja na telefon"** →
„Uključi na ovom uređaju" (pa „Pošalji probno"). Uključuje se na svakom uređaju posebno.
- Stiže ISTO što i na zvonce, za nekoliko sekundi; hitno (temperatura, povlačenje) ostaje na
  ekranu dok se ne pogleda. Klik otvara stranu na koju se odnosi.
- **iPhone:** samo kad je aplikacija na početnom ekranu (Safari → Dijeli → Dodaj na početni ekran,
  pa otvoriti sa te ikone), iOS 16.4 ili noviji. Android (Chrome) radi i iz pregledača.
- Sadržaj ide šifrovan kroz push servis pregledača (Google/Apple/Mozilla) — servis ga prenosi, ne
  čita. Uređaj koji je odjavio obavještenja ili ga više nema briše se sam.
- Zvonce u aplikaciji (provjera na 30 s) radi i dalje, za one koji push ne uključe.

**Zadaci** nastaju sami (neusaglašenost, povlačenje, kontrola vozila) i nastaju
**nedodijeljeni** — odgovorno lice ih vidi na Kontrolnom centru i u „Moji zadaci", i dodjeljuje
ih nekome padajućim spiskom (ta osoba dobije obavještenje). Terenske uloge vide samo zadatke
dodijeljene njima. Zadatak se **zatvara sam** kad se zatvori neusaglašenost ili povlačenje iz
kog je nastao. Odgovorno lice pravi i **ručne zadatke** („Novi zadatak": šta, kome, prioritet,
rok) — rok je kraj izabranog dana po podgoričkom vremenu.

### Neusaglašenosti — kako se rješavaju

Na vrhu strane stoje četiri koraka, a u svakoj neusaglašenosti piše **šta je sljedeće i čije je**:

1. **Prijava** — svako (i vozač i magacioner) prijavi problem tamo gdje ga vidi: „Prijavi problem"
   na Neusaglašenostima, ili „Problem" na konkretnoj isporuci. Odgovorno lice dobija
   obavještenje i nedodijeljen zadatak; visoku ozbiljnost vidi i uprava.
2. **Mjera** — odgovorno lice upiše korektivnu mjeru, **kome je daje** i rok. Ta osoba dobija
   obavještenje i na listi joj stoji „Mjera za vas".
3. **Urađeno** — mjeru završava **samo onaj kome je dodijeljena** (server odbija ostale), i mora
   upisati šta je urađeno — taj zapis čita inspektor. Odgovorno lice dobija „čeka vašu provjeru".
4. **Provjera** — odgovorno lice provjeri i zatvori (ne može ista osoba koja je uradila mjeru), ili
   vrati. Zadatak se zatvara sam, a ko je prijavio dobija obavještenje.

**Mala firma — jedno odgovorno lice.** Kad je mjeru uradilo samo odgovorno lice, a u firmi nema
drugog aktivnog `bzr` naloga, server to prepozna i ponudi kvačicu „provjeru radim bez drugog
lica". Tada napomena mora imati bar 10 znakova (šta je pregledano), provjera nosi trajnu oznaku
„bez četiri oka" (`verifikacija.izuzetak_cetiri_oka`), a konsultant dobija obavještenje. Čim
firma ima dva odgovorna lica, izuzetak se odbija (`IZUZETAK_NIJE_DOZVOLJEN`). Uprava ni tada ne
provjerava.

Terenske uloge prvo vide „Za mene" (ono što su prijavile ili im je dodijeljeno).

### Problem na isporuci

Dugme „Problem" na svakoj isporuci: vrsta (kupac odbio, oštećeno, pogrešna količina ili artikal,
temperatura, reklamacija poslije isporuke, kašnjenje, drugo) + opis. Upisuje se kao neusaglašenost
vezana za tu isporuku, a isporuka dobija narandžastu oznaku dok se ne zatvori. **Potvrđena
isporuka se ne prepravlja** — ispravka je ovaj zapis, da ostane trag šta je bilo i šta je urađeno.
Dok isporuka nije potvrđena, pogrešna količina ili artikal se ispravljaju dugmetom „Izmijeni".

### Zalihe — filteri i štampa

Status (sa brojem na svakoj kartici), pretraga po artiklu, lotu i dobavljaču, rok (ističe za 7
dana, istekao, bez roka), dobavljač, artikal, magacin, „samo na stanju" i poredak (FEFO, artikal,
količina). „Štampaj" i „CSV" daju **tačno ono što je na ekranu**; na papiru stoje firma, datum i
primijenjeni filteri.

### Uprava — „Aktivnost uživo"

Na Kontrolnom centru: svaki prijem, odluka, isporuka, dnevni obrazac, kontrola vozila,
neusaglašenost, otpis i povlačenje — ko i kada, osvježava se na 30 s, „Samo problemi" sužava.
Uprava ne dobija obavještenje za svaki unos (50 poruka dnevno bi zatrpalo ono nekoliko važnih);
važno stiže na zvonce. Uprava nema zadatke i ne vidi sanitarnu knjižicu ako ne rukuje hranom.

Kartice Kontrolnog centra kod uprave otvaraju **listu iza broja**, samo za čitanje (otvorene
neusaglašenosti, temperature van opsega, nespremna vozila, knjižice, prijemi / isporuke /
zapisi danas) — uprava ne ulazi na operativne strane. „Lotovi na HOLD-u" vodi na Zalihe sa već
izabranim filterom, „Povlačenja u toku" na Sledljivost, gdje uprava vidi povlačenja i spisak
kupaca, bez dugmadi za upis. Lista i broj na kartici se računaju istim uslovom (`/tabla/detalj`).

### Izvještaji — prvo pregled

Izvještaj se prvo otvori na ekranu (najnovijih 500 redova, čitljiva zaglavlja, statusi kao u
aplikaciji, bez internih ID-jeva, pretraga), pa se štampa ili preuzme CSV sa svim kolonama.

### Provjera znanja — pitanja firme i rezultati

**Kako zaposleni ulazi:** prijavljen **svojim nalogom**, sa svoje početne strane. Dok je termin
otvoren, na Mojoj strani (magacioner, vozač) i na Kontrolnom centru (odgovorno lice, direktor)
stoji kartica **„Otvorena je provjera znanja — Uđi"**. Šifra se **ne kuca**: server uzima šifru
prijavljenog, pa niko ne može raditi provjeru umjesto drugoga, a tuđu započetu provjeru ne može ni
odgovarati ni završiti. Poslije završetka na početnoj strani piše da je provjera urađena. Bez
prijave nema ulaza (ni na strani za prijavu, ni preko adrese). **Zaposleni bez naloga ne radi
provjeru** — prvo mu se otvori nalog (Ljudi → Svi zaposleni → „Otvori nalog"). Kartica u Ljudima
crveno javlja kad nema otvorenog termina.

Ljudi → Provjera znanja:

- **Termini i rezultati** — termin bira izvor pitanja (sva / samo pitanja firme / samo
  konsultantova) i **prag za „položeno"** (podrazumijevano 70 %). Za svaki termin: koliko je
  završilo, koliko položilo, prosjek. Ispod: ko je radio, tačno X/Y, skor u %, položeno ili ne —
  sa štampom.
- **Pitanja firme** — unosi ih odgovorno lice, o procedurama svoje firme; vidi koliko je ljudi
  odgovorilo i koliko tačno. Pitanje na koje se već odgovaralo ne mijenja se (rezultati bi
  pokazivali odgovore na pitanje koje više ne postoji) — isključi se i unese novo.
- **Pitanja konsultanta** ostaju skrivena i odgovornom licu (invarijanta #14).

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

Ocjena ide **samo po pravilu KKT 3 za taj artikal**. To pravilo pravi Šifarnik iz granice
artikla (`pravilaService.uskladiPravilaArtikla`) — aplikacija više ne čita granicu sa artikla
mimo pravila. Nepotvrđena granica (`granica_potvrdio`) daje samo upozorenje, bez
neusaglašenosti. Opšte pravilo KKT 3 (rashladni režim vozila, 0–5 °C) se namjerno ne koristi —
po njemu bi smrznuta roba na −18 °C ispala „van opsega". Van granice → mjerenje FAIL na KKT 3 (vezano za lot i vozilo),
neusaglašenost i zadatak, obavještenje odgovornom licu. **Lot u magacinu se ne stavlja na HOLD**
— problem je nastao u prevozu, a roba koja je ostala u magacinu nije bila u tom vozilu.

### HACCP plan (`/haccp-plan`)

Strana za odgovorno lice i konsultanta; uprava je vidi, ali ne mijenja. Četiri kartice:

- **Plan monitoringa** — šta se radi, koliko često (svaki dan / radnim danima / sedmično /
  mjesečno / po događaju), koliko puta i ko (uloga, po želji skladište). „Predloži osnovni plan"
  upiše polazni plan:
  - KKT 1 i KKT 3 po događaju;
  - KKT 2 radnim danima, dva puta;
  - P3, P8 i P9 radnim danima;
  - P7 i P10 sedmično;
  - D1 za svako vozilo.

  Ispod plana je stanje za danas i spisak propuštenih dana za posljednjih 30 dana.
  Brojanje radi `monitoringService.stanjeDanas()`; dan je po podgoričkom vremenu, a ispravka
  zapisa se ne broji dva puta.
- **Kontrolne tačke** — za svaku KKT: opasnost, granica, korektivna mjera, verifikacija.
  „Predloži tekst" popuni polazni tekst za KKT 1–3. KKT 1 i KKT 3 se ne mogu ugasiti.
- **Termometri** — interna provjera (npr. ledena voda, referentni termometar) i kalibracija.
  - Rezultat računa server iz referentne i izmjerene vrijednosti (dozvoljeno odstupanje
    podrazumijevano ±0,5 °C).
  - Kalibracija bez broja sertifikata se ne prima.
  - Stanje: ISTEKLA / USKORO (provjera ≤ 7 dana, kalibracija ≤ 30) / VAŽI / NEISPRAVAN.
  - Neispravan termometar otvara neusaglašenost i zadatak. Na strani HACCP stoji upozorenje
    da se njime ne mjeri, a server ga odbija pri mjerenju.
  - Svako mjerenje pamti termometar. Kad firma vodi termometre, ručno mjerenje bez izbora
    termometra se ne prima; kad je samo jedan, bira se sam.
  - Kad termometar padne na provjeri, mjerenja njime od posljednje ispravne provjere dobijaju
    oznaku „upitno" (neusaglašenost kaže koliko ih je). Neusaglašenost se zatvara tek posle nove
    ispravne provjere — ili kad se termometar isključi iz upotrebe.
- **Verifikacija sistema** — godišnja revizija HACCP plana, interni audit, vježba povlačenja.
  „Potrebne izmjene" pravi zadatak. Kartica pokazuje šta nije rađeno, šta kasni i šta uskoro ističe.

„Štampaj HACCP plan" (`/prilozi` → HACCP plan) sklapa dokument iz onoga što je podešeno:
- tabela KKT-ova;
- monitoring;
- termometri;
- verifikacija;
- potpisi.

Šta nije upisano, štampa se crveno kao „— upisati —".

**Na Mojoj strani** magacioner i vozač vide „Danas po planu" (šta je urađeno, šta fali, „Upiši"
otvara baš taj obrazac ili mjerenje) i upozorenje ako juče nešto nije urađeno. Na Kontrolnom
centru su dvije kartice: „Danas fali po planu · juče propušteno" i „HACCP rokovi".

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
- Jedna granica prijave (`app.use("/api", requireAuth)`); ispred nje samo javne adrese (prijava,
  odjava; provjera znanja NIJE javna). Server pri pokretanju prolazi sve rute i ne kreće ako
  neka nema `requireUloga` (`server/provjeraRuta.ts`).
- Push: pretplata se prima samo za push servise pregledača (ne „pošalji bilo kud"); sadržaj je
  šifrovan za uređaj; VAPID ključ je po bazi klijenta.

## Mobilni prikaz

Layout je responzivan (bočni meni postaje off-canvas ispod 760px, modali postaju bottom-sheet
ispod 480px, tabele dobijaju horizontalno skrolovanje). Terenske strane (`/haccp`, `/isporuka`,
`/vozila`, `/moja`) su testirane prvenstveno za telefon — magacioner i vozač rade sa telefona.

---

## Testiranje prije isporuke klijentu

```bash
npm run typecheck
npm run build
npm test             # 409 provjera na SOPSTVENOJ čistoj bazi; izlazni kod 1 ako išta padne
```

**`npm test`** ne dira ni demo bazu na Renderu ni vaše PostgreSQL servise: iz PostgreSQL-a
instaliranog na računaru (`C:/Program Files/PostgreSQL`, ili `PG_BIN=`) pravi svoj klaster u
`.testbaza/` (port 54329, bez lozinke, samo localhost), svaki put čistu bazu, na nju sve migracije
i demo podatke, pokrene server na portu 5055 (samo `/api`), pusti sve testove i sve ugasi. Jedan
test: `npm test -- povlacenje`. Isto radi **GitHub Actions na svaki push** na `main`
(`.github/workflows/testovi.yml`, `npm run test:ci`) — ishod je kvačica ili krstić pored commita.

`npm run test:e2e` pušta iste testove protiv servera koji već radi i baze iz `.env` — samo kad
treba provjeriti baš demo bazu. Radi **samo na demo bazi** — prije prvog koraka provjeri
da u bazi stoji svih pet demo naloga sa svojim fiksnim ID-jevima i inače odbije da krene, jer
testovi prave i brišu podatke. Server i test moraju gledati istu bazu (`DATABASE_URL` iz
`.env`); drugi server se zadaje sa `APP_URL=`. Jedan test: `npm run test:e2e -- povlacenje`.

Demo baza može imati i ono što je uneseno ručno kroz aplikaciju (npr. drugo skladište). Testovi
to ne diraju: prijem ide u „Glavni magacin" (`glavnoSkladiste()` u `testovi/pomoc.mjs`),
isporuka iz skladišta svog lota. Provjera koja traži da je skladište jedino se tada preskače i to
se ispiše („· preskočeno"). Demo lotovi vremenom isteknu (rok je od dana punjenja baze) — test
koji isporučuje demo lot bira onaj koji nije istekao (`nijeIstekao()`).

| Test | Šta dokazuje |
|---|---|
| `pristup` | svaka uloga vidi svoje adrese i ne vidi tuđe; bez prijave radi samo `/zdravlje` — ni provjera znanja, ni sa tačnom šifrom |
| `obavjestenja` | obavještenja za teren, zadaci, KKT 3 pri predaji, neusaglašenost od otvaranja do zatvaranja |
| `poruke_skladista` | poruke (grupa, pojedinačno, svima, ko je pročitao), ručni zadaci, više skladišta |
| `povlacenje` | spisak kupaca iz isporuka, lot na HOLD-u, ne zatvara se dok svi nisu zvani |
| `provjera_znanja` | ulazi samo prijavljeni, svojom šifrom (tuđa iz zahtjeva se ne gleda); drugi zaposleni ne može odgovarati ni završiti tuđu provjeru; rezultat se ne može naduvati; Prilog 14 |
| `prilozi_izvoz` | podaci za štampu, svih 14 CSV izvora i kolone koje se prodaju kao dokaz |
| `sesije` | prijava u bazi kao heš, odjava, promjena lozinke odjavljuje ostale uređaje |
| `neusaglasenosti_teren` | vozač prijavi problem na isporuci → mjera njemu → samo on je završava, uz opis → provjera; uprava i aktivnost |
| `znanje_firme` | pitanja firme, termin sa pragom, rezultat „položeno", statistika po pitanju |
| `faza1_haccp` | HOLD → pusti/odbij sa razlogom, povlačenje blokira puštanje, provjera tek uz urađenu mjeru, odstupanje iz obrasca → neusaglašenost, nepotvrđena granica ne zadržava robu |
| `otpremnice` | 10 probnih otpremnica iz PDF-a tačno do slova, fotografija (i smanjena kao iz pregledača) sa tačnim lotovima, dobavljač po PIB-u, zapamćen artikal, manjak, istekao rok se ne prihvata |
| `faza2_integritet` | istovremeni unosi ne dobijaju isti broj, lice + nalog ili oba ili ništa, početna i nova lozinka, terenske uloge ne čitaju tuđe, kartice direktora, baza odbija nepoznat izvor |
| `push` | pretplata po uređaju, adresa koja nije push servis se odbija, push stiže potpisan i šifrovan i čita ga samo „uređaj", ne šalje se dvaput, nestao uređaj (410) se briše sam, odjava samo svog uređaja |
| `talas1` | predaja zadržanog lota, isteklog lota i više nego što je na zalihi se odbija, zaliha nikad u minusu; povrat u karantin i odluka o njemu; tuđa isporuka i stari prijem po adresi; isti ključ zahtjeva = jedan upis; potvrda sa svim stavkama; tuđi pogrešni pokušaji prijave ne zaključavaju druge |
| `talas2` | D1 ocjenjuje temperaturu po granici vozila, roba pod režimom samo rashladnim vozilom, predaja traži današnju D1; izmjene pamte „prije"; ispravka zapisa jednom, istog obrasca, svog zapisa; odstupanje iz odgovora u obrascu; lot po granici svog artikla; termometar na mjerenju i „upitna" mjerenja; zatvaranje tek posle ponovne kontrole; novi izvori izvoza |
| `faza3_sistem` | temperatura obavezna na KKT 1, granica iz Šifarnika postaje pravilo (i nova verzija pri izmjeni), plan monitoringa i „šta danas fali", termometar (ispravan / neispravan → neusaglašenost, kalibracija traži sertifikat), verifikacija sistema, podaci za štampu HACCP plana, izuzetak od četiri oka samo kad je odgovorno lice jedino |

Svaki test briše sve što napravi. Nov tok u aplikaciji = nov test u `testovi/` — dvije greške koje
su dugo bile na Renderu (neusaglašenost se nije mogla zatvoriti; uprava i provjera znanja
zaključani) našao je tek test koji prolazi tok do kraja.

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
8. **HACCP plan**: `/haccp-plan` → „Predloži osnovni plan", dodati termometar i upisati
   provjeru, upisati reviziju plana; pa kao magacioner na `/moja` provjeriti „Danas po planu" i
   „Upiši"; na `/prilozi` → HACCP plan provjeriti štampu.
9. **Mobilni prikaz**: DevTools na 375px širine, provjeriti `/haccp`, `/isporuka`, `/moja`.

---

## Šta NIJE u ovoj verziji (namjerno)

Picking, rute, optimizacija ruta, rezervacije zaliha, povrati/reklamacije kao posebni moduli,
multi-facility/multi-zone skladište, barcode/IoT senzori, spoljne integracije (ERP,
računovodstvo), SMS/email obavještenja. Vidi plan/CLAUDE.md za obrazloženje — cilj je sistem
koji magacioner stvarno koristi, ne enterprise WMS.

## Otvoreno

- `npm run bekap` postoji, ali nije u Task Scheduleru — dok ga niko ne doda, ne radi sam.
- Plan monitoringa i tekst HACCP plana su polazni prijedlog — za svakog klijenta ih konsultant
  prilagođava stvarnim komorama, vozilima i ritmu rada.
- Obavještenje o „tišini" klijenta (`dnevni-pregled`) je alat koji se pokreće ručno, ne mejl —
  pravi mejl traži SMTP nalog (poslovna odluka, ne kod).
- Ugovor i cjenovnik nijesu dio ovog repozitorijuma (vidi `.gitignore` — `prezentacija/` i
  `dokumenti/` žive u posebnom privatnom repozitorijumu).
- Banka pitanja za provjeru znanja nije validirana ni na jednoj grupi — prvih ~30 ispitanika su
  pilot, ne mjerenje.
