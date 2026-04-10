import { ZReportData } from "./types";

export const SAMPLE_REPORTS: ZReportData[] = [
  {
    dato: "2026-04-01",
    status: "ok",
    totalSalg: 4500,
    totalBetaling: 4500,
    differanse: 0,
    meldinger: [],
    mvaGrupper: [
      { navn: "HVA1 (12%)", salg: 3000, mva: 360 },
      { navn: "HVA2 (15%)", salg: 1500, mva: 225 }
    ],
    linjer: [
      { dato: "2026-04-01", varenavn: "Greenfee 18 hull", antall: 5, beloep: 2500, varegruppe: "Greenfee", konto: "3985", mvaKode: "12%" },
      { dato: "2026-04-01", varenavn: "Vaffel", antall: 20, beloep: 1000, varegruppe: "Kiosk", konto: "3001", mvaKode: "15%" },
      { dato: "2026-04-01", varenavn: "Kaffe", antall: 20, beloep: 1000, varegruppe: "Kiosk", konto: "3001", mvaKode: "15%" }
    ],
    betalinger: [
      { type: "BankAxept", beloep: 4000, konto: "1521" },
      { type: "Kontanter", beloep: 500, konto: "1520" }
    ]
  },
  {
    dato: "2026-04-02",
    status: "warning",
    totalSalg: 3200,
    totalBetaling: 3190,
    differanse: -10,
    meldinger: ["Differanse på 10 kr mellom salg og betaling."],
    mvaGrupper: [
      { navn: "HVA1 (12%)", salg: 2000, mva: 240 },
      { navn: "HVA3 (25%)", salg: 1200, mva: 300 }
    ],
    linjer: [
      { dato: "2026-04-02", varenavn: "Greenfee 9 Hull", antall: 4, beloep: 1200, varegruppe: "Greenfee", konto: "3985", mvaKode: "12%" },
      { dato: "2026-04-02", varenavn: "Golfballer", antall: 10, beloep: 1200, varegruppe: "Proshop", konto: "3000", mvaKode: "25%" },
      { dato: "2026-04-02", varenavn: "Junior 9 hull", antall: 4, beloep: 800, varegruppe: "Greenfee", konto: "3985", mvaKode: "12%" }
    ],
    betalinger: [
      { type: "VISA", beloep: 3190, konto: "1522" }
    ]
  }
];
