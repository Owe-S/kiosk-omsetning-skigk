export interface MappingEntry {
  kassaTekst: string;
  driftskategori: string;
  kolonneMaaned: string;
  konto: string;
  mva: string;
}

export interface PaymentMapping {
  kassaTekst: string;
  maalKolonne: string;
  konto: string;
}

export interface ZReportLine {
  dato: string;
  varenavn: string;
  antall: number;
  beloep: number;
  varegruppe: string;
  konto: string;
  mvaKode: string;
}

export interface ZReportPayment {
  type: string;
  beloep: number;
  konto: string;
}

export interface QAChecklist {
  checkedAgainstReceipts: boolean;
  checkedPaymentTotals: boolean;
  checkedUnknownItems: boolean;
}

export interface ScanMetadata {
  scannedByName: string;
  scannedByPhone?: string;
  scannedAt: string;
  authType: 'kiosk' | 'admin';
}

export interface ZReportData {
  dato: string;
  linjer: ZReportLine[];
  betalinger: ZReportPayment[];
  mvaGrupper: {
    navn: string;
    salg: number;
    mva: number;
  }[];
  totalSalg: number;
  totalBetaling: number;
  differanse: number;
  status: 'ok' | 'warning' | 'error';
  meldinger: string[];
  bilder?: string[];
  ansatt?: string;
  scanMetadata?: ScanMetadata;
  qaChecklist?: QAChecklist;
  qaComment?: string;
}
