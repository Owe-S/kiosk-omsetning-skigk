# Developer Notes - Ski Golfklubb Kassa-import

Denne filen inneholder teknisk informasjon og forslag til videreutvikling av systemet.

## 1. Looker Studio-tilkobling (Forslag)
For å visualisere dataene og få en sanntidsoversikt over salget i kiosken, anbefales det å koble Google Sheets-filene til Looker Studio.

### Slik gjør du det:
1. Gå til [Looker Studio](https://lookerstudio.google.com/).
2. Opprett en ny datakilde og velg **Google Sheets**.
3. Velg filen `Kasseoppgjør_YYYY-MM` (f.eks. `Kasseoppgjør_2026-04`).
4. **Viktig:** Siden appen oppretter en ny fil hver måned, bør du vurdere å bruke en **"Master Sheet"** som samler alle månedene i én fil ved hjelp av en enkel Google Apps Script-funksjon. Dette vil gjøre det enklere å se trender over hele året i Looker Studio.

### Forslag til dashboards:
- **Salg per dag:** Stolpediagram som viser totalomsetning.
- **Mest solgte varer:** Kakediagram eller tabell over antall solgte enheter per varenavn.
- **Salg per ansatt:** Oversikt over hvem som har utført flest oppgjør.
- **MVA-fordeling:** Oversikt over salg fordelt på MVA-koder (15% mat, 25% utstyr).

## 2. Tripletex Export (Forslag)
For å forenkle regnskapsføringen ytterligere, kan systemet utvides til å eksportere data direkte til Tripletex.

### Alternativ A: CSV-eksport (Enkelt)
Legg til en knapp i appen under "Rapporter" som genererer en CSV-fil formatert nøyaktig slik Tripletex krever for import av bilag.
- **Format:** Dato, Beskrivelse, Konto, MVA-kode, Beløp (Debet/Kredit).

### Alternativ B: Tripletex API (Avansert)
Koble appen direkte til Tripletex sitt API for automatisk bokføring.
- **Krav:** Du trenger en API-nøkkel fra Tripletex.
- **Funksjon:** Når et oppgjør sendes til Google Sheets, kan det samtidig sendes som et "Kassebilag" direkte inn i Tripletex sitt regnskapssystem. Dette vil eliminere behovet for manuell inntasting helt.

## 3. Teknisk arkitektur
- **Frontend:** React med Tailwind CSS.
- **Backend:** Node.js (Express) som kjører på Google Cloud.
- **Database:** Firebase Firestore for lagring av Google OAuth-tokens (permanent tilkobling).
- **Integrasjoner:** Google Drive API (mappestruktur) og Google Sheets API (lagring av data).
- **AI:** Google Gemini API for OCR-lesing av Z-rapporter og bankterminal-avstemminger.

---
*Utviklet for Ski Golfklubb - 2026*
