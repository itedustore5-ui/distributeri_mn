import { Router } from "express";
import { upit } from "../db.js";
import { asyncRuta, ApiGreska } from "../greske.js";
import { IZVOR_OZNAKA, IME } from "./neusaglasenosti.js";
import { requireAuth, requireUloga } from "../auth.js";
import { danasCG } from "../vrijeme.js";

export const tablaRuter = Router();
tablaRuter.use(requireAuth);

tablaRuter.get(
  "/tabla",
  requireUloga("bzr", "izvodjac", "uprava"),
  asyncRuta(async (_request, response) => {
    // Dan po podgoričkom vremenu (invarijanta #11) — current_date u bazi je UTC, pa bi između
    // ponoći i 1–2h tabla pokazivala jučerašnje brojke.
    const danas = danasCG();
    const [nc, temp, vozila, lotovi, zadaci, zadaciOtvoreni, prijemi, isporuke, knjizice, povlacenja, zapisi] = await Promise.all([
      upit(`select ozbiljnost, count(*)::int as broj from neusaglasenost where status not in ('ZATVORENA') group by ozbiljnost`),
      upit(`select count(*)::int as broj from mjerenje_temperature where rezultat = 'FAIL' and izmjereno_at > now() - interval '24 hours'`),
      upit(`select count(*)::int as broj from vozilo where status = 'NIJE_SPREMNO' and aktivan`),
      upit(`select count(*)::int as broj from lot where status = 'HOLD'`),
      upit(`select count(*)::int as broj from zadatak where status not in ('ZAVRSEN', 'OTKAZAN') and rok_at is not null and rok_at < now()`),
      upit(`select count(*)::int as broj from zadatak where status not in ('ZAVRSEN', 'OTKAZAN')`),
      upit(`select count(*)::int as broj from prijem where datum_prijema = $1`, [danas]),
      upit(`select count(*)::int as broj from isporuka where datum_isporuke = $1`, [danas]),
      upit(`select count(*)::int as broj from v_lica where knjizica_status in ('ISTEKLA', 'USKORO')`),
      upit(`select count(*)::int as broj from povlacenje where status = 'U_TOKU'`),
      upit(`select count(*)::int as broj from zapis where datum = $1`, [danas]),
    ]);

    response.json({
      kriticno: {
        neusaglasenostiVisoke: Number(nc.rows.find((r) => r.ozbiljnost === "VISOK")?.broj ?? 0),
        neusaglasenostiOtvorene: nc.rows.reduce((zbir, r) => zbir + Number(r.broj), 0),
        temperatureVanOpsega: temp.rows[0]?.broj ?? 0,
        vozilaNijeSpremno: vozila.rows[0]?.broj ?? 0,
        lotoviNaHoldu: lotovi.rows[0]?.broj ?? 0,
        zadaciZakasnili: zadaci.rows[0]?.broj ?? 0,
        zadaciOtvoreni: zadaciOtvoreni.rows[0]?.broj ?? 0,
        knjizicIstice: knjizice.rows[0]?.broj ?? 0,
        povlacenjaUToku: povlacenja.rows[0]?.broj ?? 0,
      },
      operativno: {
        prijemiDanas: prijemi.rows[0]?.broj ?? 0,
        isporukeDanas: isporuke.rows[0]?.broj ?? 0,
        zapisiDanas: zapisi.rows[0]?.broj ?? 0,
      },
    });
  }),
);

// "Aktivnost uživo" — šta se u firmi dešava, iz samih zapisa (ne iz posebnog dnevnika koji bi se
// mogao razići sa njima). Uprava ovo gleda umjesto da dobija obavještenje za svaki unos: 50 poruka
// dnevno bi zatrpalo onih nekoliko važnih (temperatura, povlačenje, vozilo) koje i dalje stižu na zvonce.
const AKTIVNOST = `
with ime as (select k.id, coalesce(l.ime, k.korisnicko_ime) as ime from korisnik k left join lice l on l.id = k.lice_id)
select * from (
  select p.created_at as vrijeme, 'prijem' as vrsta, (select ime from ime where id = p.primio_korisnik_id) as ko,
         'Primljena roba — ' || d.naziv || coalesce(' · ' || p.broj_dokumenta, '') as opis, 'info' as tezina, '/prijem' as putanja
    from prijem p join dobavljac d on d.id = p.dobavljac_id where p.created_at > now() - $1::interval
  union all
  select p.odluka_at, 'odluka', (select ime from ime where id = p.odluku_donio_korisnik_id),
         'Odluka o prijemu — ' || d.naziv || ': ' || case p.status::text when 'PRIHVACEN' then 'prihvaćeno' when 'ODBIJEN' then 'odbijeno'
           when 'DJELIMICNO_PRIHVACEN' then 'djelimično prihvaćeno' else lower(p.status::text) end,
         case when p.status::text in ('ODBIJEN', 'DJELIMICNO_PRIHVACEN') then 'upozorenje' else 'info' end, '/prijem'
    from prijem p join dobavljac d on d.id = p.dobavljac_id where p.odluka_at > now() - $1::interval
  union all
  select i.created_at, 'isporuka', (select ime from ime where id = i.uneo_korisnik_id), 'Isporuka pripremljena — ' || i.broj || ' → ' || k.naziv, 'info', '/isporuka'
    from isporuka i join kupac k on k.id = i.kupac_id where i.created_at > now() - $1::interval
  union all
  select i.potvrdjeno_at, 'isporuka', (select ime from ime where id = i.potvrdio_korisnik_id),
         'Isporuka ' || case i.status::text when 'POTVRDJENA' then 'predata' when 'DJELIMICNA' then 'djelimično predata' when 'ODBIJENA' then 'odbijena'
           else lower(i.status::text) end || ' — ' || i.broj || ' · ' || k.naziv,
         case when i.status::text in ('DJELIMICNA', 'ODBIJENA') then 'upozorenje' else 'info' end, '/isporuka'
    from isporuka i join kupac k on k.id = i.kupac_id where i.potvrdjeno_at > now() - $1::interval
  union all
  select nc.created_at, 'neusaglasenost', (select ime from ime where id = nc.prijavio_korisnik_id), 'Neusaglašenost ' || nc.broj || ' — ' || nc.opis,
         case when nc.ozbiljnost::text = 'VISOK' then 'problem' else 'upozorenje' end, '/neusaglasenosti'
    from neusaglasenost nc where nc.created_at > now() - $1::interval
  union all
  select nc.zatvoreno_at, 'neusaglasenost', (select ime from ime where id = nc.zatvorio_korisnik_id), 'Zatvorena neusaglašenost ' || nc.broj, 'info', '/neusaglasenosti'
    from neusaglasenost nc where nc.zatvoreno_at > now() - $1::interval
  union all
  select m.izmjereno_at, 'temperatura', (select ime from ime where id = m.izmjerio_korisnik_id),
         'Temperatura van opsega — ' || kt.naziv || ': ' || m.vrijednost || ' °C', 'problem', '/haccp'
    from mjerenje_temperature m join kontrolna_tacka kt on kt.id = m.kontrolna_tacka_id
    where m.rezultat::text = 'FAIL' and m.izmjereno_at > now() - $1::interval
  union all
  select kv.izvrseno_at, 'vozilo', (select ime from ime where id = kv.izvrsio_korisnik_id),
         'Kontrola vozila ' || v.registarski_broj || ' — ' || case when kv.ukupan_status::text = 'PROSAO' then 'prošao' else 'NIJE prošao' end,
         case when kv.ukupan_status::text = 'PROSAO' then 'info' else 'problem' end, '/vozila'
    from kontrola_vozila kv join vozilo v on v.id = kv.vozilo_id where kv.izvrseno_at > now() - $1::interval
  union all
  select z.created_at, 'zapis', coalesce((select ime from ime where id = z.uneo_korisnik_id), z.izvrsilac),
         'Dnevni obrazac ' || z.obrazac_kod || case when z.odstupanje then ' — sa odstupanjem' else '' end,
         case when z.odstupanje then 'upozorenje' else 'info' end, '/haccp'
    from zapis z where z.created_at > now() - $1::interval
  union all
  select p.pokrenuto_at, 'povlacenje', (select ime from ime where id = p.pokrenuo_korisnik_id), 'Pokrenuto povlačenje ' || p.broj || ' — ' || p.razlog, 'problem', '/sledljivost'
    from povlacenje p where p.pokrenuto_at > now() - $1::interval
  union all
  select kz.created_at, 'otpis', (select ime from ime where id = kz.izvrsio_korisnik_id),
         'Otpis zalihe — ' || a.naziv || ' ' || abs(kz.kolicina_delta) || coalesce(' · ' || kz.napomena, ''), 'upozorenje', '/zalihe'
    from kretanje_zalihe kz join artikal a on a.id = kz.artikal_id where kz.tip::text = 'OTPIS' and kz.created_at > now() - $1::interval
) a
where vrijeme is not null
order by vrijeme desc
limit $2`;

tablaRuter.get(
  "/aktivnost",
  requireUloga("bzr", "izvodjac", "uprava"),
  asyncRuta(async (request, response) => {
    const dana = Math.min(Math.max(Number(request.query.dana) || 7, 1), 31);
    const rezultat = await upit(AKTIVNOST, [`${dana} days`, 60]);
    response.json(rezultat.rows);
  }),
);

// Šta stoji iza broja na kartici — lista samo za čitanje. Uprava ne ulazi na operativne strane
// (prijem, HACCP, neusaglašenosti…), pa joj je klik na karticu ranije radio ništa. Uslovi su ISTI
// kao u brojanju iznad — broj na kartici i dužina liste se ne smiju razići.
type Kolona = { kljuc: string; naziv: string; vrsta?: "status" };
const VRIJEME = (kolona: string) => `to_char(${kolona} at time zone 'Europe/Podgorica', 'DD.MM. HH24:MI')`;
const DETALJ: Record<string, { naslov: string; kolone: Kolona[]; sql: string; saDanom?: boolean; prazno?: string }> = {
  neusaglasenosti: {
    naslov: "Otvorene neusaglašenosti",
    kolone: [
      { kljuc: "broj", naziv: "Broj" }, { kljuc: "prijavljeno", naziv: "Prijavljeno" }, { kljuc: "ozbiljnost", naziv: "Ozbiljnost", vrsta: "status" },
      { kljuc: "status", naziv: "Stanje", vrsta: "status" }, { kljuc: "opis", naziv: "Šta" }, { kljuc: "izvor", naziv: "Odakle" },
      { kljuc: "prijavio", naziv: "Prijavio" }, { kljuc: "mjera_kod", naziv: "Mjera kod" },
    ],
    sql: `select nc.broj, ${VRIJEME("nc.created_at")} as prijavljeno, nc.ozbiljnost, nc.status, nc.opis, ${IZVOR_OZNAKA} as izvor,
                 ${IME("nc.prijavio_korisnik_id")} as prijavio,
                 (select ${IME("m.dodijeljeno_korisnik_id")} from korektivna_mjera m where m.neusaglasenost_id = nc.id and m.status <> 'ZAVRSENA'
                   order by m.created_at desc limit 1) as mjera_kod
          from neusaglasenost nc where nc.status not in ('ZATVORENA')
          order by (nc.ozbiljnost = 'VISOK') desc, nc.created_at desc`,
  },
  temperature: {
    naslov: "Temperature van opsega — posljednja 24 sata",
    kolone: [
      { kljuc: "vrijeme", naziv: "Kad" }, { kljuc: "tacka", naziv: "Kontrolna tačka" }, { kljuc: "vrijednost", naziv: "°C" },
      { kljuc: "roba", naziv: "Roba / vozilo" }, { kljuc: "izmjerio", naziv: "Izmjerio" }, { kljuc: "napomena", naziv: "Napomena" },
    ],
    sql: `select ${VRIJEME("m.izmjereno_at")} as vrijeme, kt.naziv as tacka, m.vrijednost::text as vrijednost,
                 coalesce(a.naziv || ' · lot ' || l.broj_lota, 'vozilo ' || v.registarski_broj) as roba,
                 ${IME("m.izmjerio_korisnik_id")} as izmjerio, m.napomena
          from mjerenje_temperature m join kontrolna_tacka kt on kt.id = m.kontrolna_tacka_id
          left join lot l on l.id = m.lot_id left join artikal a on a.id = l.artikal_id left join vozilo v on v.id = m.vozilo_id
          where m.rezultat = 'FAIL' and m.izmjereno_at > now() - interval '24 hours'
          order by m.izmjereno_at desc`,
  },
  vozila: {
    naslov: "Vozila koja nisu spremna",
    kolone: [
      { kljuc: "vozilo", naziv: "Vozilo" }, { kljuc: "kontrola", naziv: "Posljednja kontrola" }, { kljuc: "ko", naziv: "Ko" },
      { kljuc: "nije_proslo", naziv: "Šta nije prošlo" }, { kljuc: "napomena", naziv: "Napomena" },
    ],
    sql: `select v.registarski_broj as vozilo, ${VRIJEME("kv.izvrseno_at")} as kontrola, ${IME("kv.izvrsio_korisnik_id")} as ko,
                 concat_ws(', ', case when kv.cistoca = false then 'čistoća' end, case when kv.oprema_ok = false then 'oprema' end,
                   case when kv.vrata_ok = false then 'vrata' end) as nije_proslo, kv.napomena
          from vozilo v
          left join lateral (select * from kontrola_vozila k where k.vozilo_id = v.id order by k.izvrseno_at desc limit 1) kv on true
          where v.status = 'NIJE_SPREMNO' and v.aktivan
          order by v.registarski_broj`,
  },
  knjizice: {
    naslov: "Sanitarne knjižice — ističu ili su istekle",
    kolone: [
      { kljuc: "ime", naziv: "Zaposleni" }, { kljuc: "radno_mjesto", naziv: "Radno mjesto" }, { kljuc: "rok", naziv: "Važi do" },
      { kljuc: "knjizica_status", naziv: "Stanje", vrsta: "status" },
    ],
    sql: `select ime, radno_mjesto, to_char(sanitarna_knjizica_rok, 'DD.MM.YYYY.') as rok, knjizica_status
          from v_lica where knjizica_status in ('ISTEKLA', 'USKORO') order by sanitarna_knjizica_rok nulls first`,
  },
  prijemi: {
    naslov: "Prijemi danas",
    saDanom: true,
    prazno: "Danas još nema unosa.",
    kolone: [
      { kljuc: "vrijeme", naziv: "Upisano" }, { kljuc: "dobavljac", naziv: "Dobavljač" }, { kljuc: "dokument", naziv: "Dokument" },
      { kljuc: "stavki", naziv: "Stavki" }, { kljuc: "status", naziv: "Odluka", vrsta: "status" }, { kljuc: "primio", naziv: "Primio" },
    ],
    sql: `select ${VRIJEME("p.created_at")} as vrijeme, d.naziv as dobavljac, p.broj_dokumenta as dokument,
                 (select count(*) from prijem_stavka s where s.prijem_id = p.id)::text as stavki, p.status, ${IME("p.primio_korisnik_id")} as primio
          from prijem p join dobavljac d on d.id = p.dobavljac_id where p.datum_prijema = $1 order by p.created_at desc`,
  },
  isporuke: {
    naslov: "Isporuke danas",
    saDanom: true,
    prazno: "Danas još nema unosa.",
    kolone: [
      { kljuc: "broj", naziv: "Broj" }, { kljuc: "kupac", naziv: "Kupac" }, { kljuc: "status", naziv: "Stanje", vrsta: "status" },
      { kljuc: "vozac", naziv: "Vozač" }, { kljuc: "vozilo", naziv: "Vozilo" }, { kljuc: "predato", naziv: "Predato" },
    ],
    sql: `select i.broj, k.naziv as kupac, i.status, ${IME("i.vozac_korisnik_id")} as vozac, v.registarski_broj as vozilo, ${VRIJEME("i.potvrdjeno_at")} as predato
          from isporuka i join kupac k on k.id = i.kupac_id left join vozilo v on v.id = i.vozilo_id
          where i.datum_isporuke = $1 order by i.created_at desc`,
  },
  zapisi: {
    naslov: "Dnevni zapisi danas",
    saDanom: true,
    prazno: "Danas još nema unosa.",
    kolone: [
      { kljuc: "vrijeme", naziv: "Upisano" }, { kljuc: "obrazac_kod", naziv: "Obrazac" }, { kljuc: "izvrsilac", naziv: "Izvršilac" },
      { kljuc: "odstupanje", naziv: "Odstupanje" }, { kljuc: "korektivna_mjera", naziv: "Preduzeto" },
    ],
    sql: `select ${VRIJEME("z.created_at")} as vrijeme, z.obrazac_kod, z.izvrsilac, case when z.odstupanje then 'DA' else '—' end as odstupanje, z.korektivna_mjera
          from zapis z where z.datum = $1 order by z.created_at desc`,
  },
};

tablaRuter.get(
  "/tabla/detalj/:kartica",
  requireUloga("bzr", "izvodjac", "uprava"),
  asyncRuta(async (request, response) => {
    const detalj = DETALJ[String(request.params.kartica)];
    if (!detalj) throw new ApiGreska(404, "KARTICA_NE_POSTOJI", "Za ovu karticu nema pregleda.");
    const rezultat = await upit(detalj.sql, detalj.saDanom ? [danasCG()] : []);
    response.json({ naslov: detalj.naslov, kolone: detalj.kolone, redovi: rezultat.rows, prazno: detalj.prazno ?? "Nema ništa — sve je u redu." });
  }),
);
