# Admin Manual - Oppgjør Kiosken (Ski Golfklubb)

Denne manualen er for daglig leder/admin som har det overordnede ansvaret for kasseoppgjørene.

## 1. Administrasjon og tilgang
- **Innlogging:** Bruk knappen **"Logg inn med Google (Admin)"**.
- **Viktig:** Du må logge inn med din Google-konto (`admin-2025@skigk.no`) én gang for å aktivere tilgangen for de ansatte.
- **Permanent tilkobling:** Appen lagrer nå tilgangen din i en sikker database (Firebase). Dette betyr at de ansatte kan logge inn fra sine mobiler uten at du trenger å være til stede.

## 2. Hvor lagres dataene?
Alle oppgjør lagres automatisk i din Google Drive i følgende mappestruktur:
`økonomi / org-filer / data-kiosk`

- **Filnavn:** Appen oppretter automatisk ett regneark per måned, f.eks. `Kasseoppgjør_2026-04`.
- **Innhold:** Hvert oppgjør legges til som nye rader i regnearket med dato, ansattnavn, varenavn, antall, beløp, konto og MVA-kode.

## 3. Oversikt og rapporter
- **Dashboard:** Her ser du en rask oversikt over dagens status.
- **Historikk:** Her kan du se alle tidligere innsendte oppgjør.
- **Rapporter:** Her kan du generere oppsummeringer for regnskapet.

## 4. Vedlikehold av ansatte
De ansatte er for øyeblikket hardkodet i systemet med følgende mobilnumre:
- **Lene Cecilie:** 48887721
- **Tomine:** 98124460
- **Ulf:** 93030465
- **Tove:** 95096275
*Passord for alle: SkiKiosk2026*

## 5. Feilsøking
- **"Ingen Google-tilkobling funnet"**: Logg inn med din Google-konto på nytt. Dette kan skje hvis Google har utløpt din "token" (skjer sjelden).
- **Feil i regnearket**: Du kan redigere regnearkene direkte i Google Sheets hvis det er behov for manuelle rettinger i etterkant.

---
*Ved tekniske spørsmål, se Developer Notes.*
