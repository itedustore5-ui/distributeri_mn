# PILOT DISTRIBUTERI CG

Operativni control-center prototip za distributivni sistem sa WMS, HACCP/DHP, sledljivošću, isporukom i audit tokom.

## Trenutna verzija

Ova prva radna verzija je frontend MVP sa realističnim seed scenarijem u memoriji browsera. Pokriva:

- dashboard sa kritičnim upozorenjima i operativnim KPI karticama
- prijem robe sa filterima, statusima i prihvatanjem prijema
- zalihe po proizvodu, LOT-u, lokaciji i statusu
- porudžbine, picking, vozila, rute i isporuke
- HACCP/DHP kontrole sa verzionisanim pravilom i neuspešnim merenjem
- neusaglašenosti, zadatke i obaveštenja
- forward traceability lanac od dobavljača do kupca
- izveštaje, audit trail i podešavanja objekata
- responsive layout za desktop i tablet/mobilni prikaz

## Pokretanje

```bash
npm install
npm run dev
```

Vite server koristi `0.0.0.0:5000` i dozvoljene hostove za Replit preview.

## Sledeći korak za produkciju

UI je organizovan oko poslovnih objekata iz master specifikacije. Za produkciju treba povezati REST/Express servis i PostgreSQL/Drizzle sloj, uz zadržavanje sledećih granica:

- kritične komande kao transakcioni service layer
- `events` i `audit_logs` kao imutabilni zapis svake poslovne odluke
- serverska autorizacija po company/facility kontekstu
- HACCP pravila u bazi, ne u React komponentama
- idempotency ključevi za accept receipt, rezervaciju, loading, delivery i return
- `traceabilityService` kao jedini izvor za forward i reverse trace