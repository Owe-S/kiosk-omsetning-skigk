import { GoogleGenAI, Type } from "@google/genai";
import { ZReportData } from "../types";
import { DEFAULT_VARE_MAPPING, DEFAULT_BETALING_MAPPING } from "../constants";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });

export async function processZReportImage(base64Images: string[]): Promise<ZReportData> {
  const model = "gemini-3-flash-preview";
  
  const prompt = `
    Du er en ekspert på å lese norske Z-rapporter og bankterminal-avstemminger for Ski Golfklubb.
    Du vil motta ett eller flere bilder. Disse kan inneholde en Z-rapport (lang strimmel) og en bankterminal-avstemming (kort strimmel med "Avstemming").
    
    Din oppgave er å trekke ut data og strukturere det i JSON-format.
    
    Mapping-regler for varer:
    ${JSON.stringify(DEFAULT_VARE_MAPPING, null, 2)}
    
    Mapping-regler for betaling:
    ${JSON.stringify(DEFAULT_BETALING_MAPPING, null, 2)}
    
    Spesifikke instruksjoner for parsing:
    1. **Dato**: Finn datoen (f.eks. "30/03/2026").
    2. **Varelinjer (Z-rapport)**:
       - Finn varenavn (f.eks. "Greenfee 9 Hull").
       - Finn "TELLER X" rett under for antall.
       - Finn beløpet til høyre.
    3. **Betalinger (Bankterminal / Avstemming)**:
       - Se spesielt etter lappen som starter med "Avstemming".
       - Trekk ut beløp for "BankAxept", "VISA", "MASTERCARD", "AMERICAN EXPRESS".
       - Disse beløpene er de faktiske pengene i banken.
    4. **Z-rapport Oppsummering**:
       - Finn "KORTISALG" og "TOTAL BETALING SALG" på Z-rapporten.
    5. **Kontrollsjekker**:
       - Beregn differanse mellom "Total" fra bankterminalen og "TOTAL BETALING SALG" fra Z-rapporten.
       - Hvis bankterminalen viser 5180,- og Z-rapporten viser 5150,-, er differansen +30,-.
       - Legg til forklarende meldinger hvis tallene ikke stemmer.
    
    Returner dataen nøyaktig i henhold til skjemaet. Svar KUN med JSON.
  `;

  const imageParts = base64Images.map(img => ({
    inlineData: {
      mimeType: "image/jpeg",
      data: img.split(",")[1] || img,
    },
  }));

  const response = await ai.models.generateContent({
    model,
    contents: [
      {
        parts: [
          { text: prompt },
          ...imageParts
        ],
      },
    ],
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          dato: { type: Type.STRING, description: "Dato i formatet YYYY-MM-DD" },
          linjer: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                dato: { type: Type.STRING },
                varenavn: { type: Type.STRING },
                antall: { type: Type.NUMBER },
                beloep: { type: Type.NUMBER },
                varegruppe: { type: Type.STRING },
                konto: { type: Type.STRING },
                mvaKode: { type: Type.STRING },
              },
              required: ["varenavn", "antall", "beloep"],
            },
          },
          betalinger: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                type: { type: Type.STRING },
                beloep: { type: Type.NUMBER },
                konto: { type: Type.STRING },
              },
              required: ["type", "beloep"],
            },
          },
          mvaGrupper: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                navn: { type: Type.STRING },
                salg: { type: Type.NUMBER },
                mva: { type: Type.NUMBER, description: "MVA prosentsats (f.eks. 25, 15, 12)" },
              },
            },
          },
          totalSalg: { type: Type.NUMBER },
          totalBetaling: { type: Type.NUMBER },
          differanse: { type: Type.NUMBER },
          status: { type: Type.STRING, enum: ["ok", "warning", "error"] },
          meldinger: { type: Type.ARRAY, items: { type: Type.STRING } },
        },
        required: ["dato", "linjer", "betalinger", "totalSalg", "status"],
      },
    },
  });

  const result = JSON.parse(response.text || "{}");
  return { ...result, bilder: base64Images } as ZReportData;
}
