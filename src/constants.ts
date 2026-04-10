import { MappingEntry, PaymentMapping } from "./types";

export const DEFAULT_VARE_MAPPING: MappingEntry[] = [
  { kassaTekst: "Greenfee 9 Hull", driftskategori: "Greenfee", kolonneMaaned: "Greenfee", konto: "3985", mva: "15% (Kode 31)" },
  { kassaTekst: "Greenfee 18 hull", driftskategori: "Greenfee", kolonneMaaned: "Greenfee", konto: "3985", mva: "15% (Kode 31)" },
  { kassaTekst: "Junior 9 hull", driftskategori: "Greenfee", kolonneMaaned: "Greenfee", konto: "3985", mva: "15% (Kode 31)" },
  { kassaTekst: "Golfhefte 18 hull", driftskategori: "Hefter", kolonneMaaned: "Golf-heftet", konto: "3986", mva: "15% (Kode 31)" },
  { kassaTekst: "Golfhefte 9 hull", driftskategori: "Hefter", kolonneMaaned: "Golf-heftet", konto: "3986", mva: "15% (Kode 31)" },
  { kassaTekst: "Kaffe", driftskategori: "Kiosk", kolonneMaaned: "Kiosk", konto: "3001", mva: "15% (Kode 31)" },
  { kassaTekst: "Vaffel", driftskategori: "Kiosk", kolonneMaaned: "Kiosk", konto: "3001", mva: "15% (Kode 31)" },
  { kassaTekst: "Kaffe/Vaffel", driftskategori: "Kiosk", kolonneMaaned: "Kiosk", konto: "3001", mva: "15% (Kode 31)" },
  { kassaTekst: "Pølse", driftskategori: "Kiosk", kolonneMaaned: "Kiosk", konto: "3001", mva: "15% (Kode 31)" },
  { kassaTekst: "Toast", driftskategori: "Kiosk", kolonneMaaned: "Kiosk", konto: "3001", mva: "15% (Kode 31)" },
  { kassaTekst: "Mineralvann", driftskategori: "Kiosk", kolonneMaaned: "Kiosk", konto: "3001", mva: "15% eller 25%" },
  { kassaTekst: "Sjokolade", driftskategori: "Kiosk", kolonneMaaned: "Kiosk", konto: "3001", mva: "15% eller 25%" },
  { kassaTekst: "Kanelbolle", driftskategori: "Kiosk", kolonneMaaned: "Kiosk", konto: "3001", mva: "15% eller 25%" },
  { kassaTekst: "Kafé diverse", driftskategori: "Kiosk", kolonneMaaned: "Kiosk", konto: "3001", mva: "15% (Kode 31)" },
  { kassaTekst: "Leie tralle", driftskategori: "Utleie", kolonneMaaned: "Utleie", konto: "3905", mva: "25% (Kode 3)" },
  { kassaTekst: "Hansker", driftskategori: "Proshop", kolonneMaaned: "Utstyr", konto: "3000", mva: "25% (Kode 3)" },
  { kassaTekst: "Golfutst diverse", driftskategori: "Proshop", kolonneMaaned: "Utstyr", konto: "3000", mva: "25% (Kode 3)" },
  { kassaTekst: "Golfballer", driftskategori: "Proshop", kolonneMaaned: "Baller", konto: "3000", mva: "25% (Kode 3)" },
];

export const DEFAULT_BETALING_MAPPING: PaymentMapping[] = [
  { kassaTekst: "BankAxept", maalKolonne: "Bank", konto: "1521" },
  { kassaTekst: "VISA", maalKolonne: "Kr.kort", konto: "1522" },
  { kassaTekst: "MASTERCARD", maalKolonne: "Kr.kort", konto: "1522" },
  { kassaTekst: "AMERICAN EXPRESS", maalKolonne: "Kr.kort", konto: "1522" },
  { kassaTekst: "Kontanter", maalKolonne: "Kont.", konto: "1520" },
];
