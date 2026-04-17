import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { google } from "googleapis";
import cookieSession from "cookie-session";
import dotenv from "dotenv";
import admin from 'firebase-admin';
import { getFirestore } from 'firebase-admin/firestore';
import fs from 'fs';

dotenv.config();

let db: any = null;
const ALLOWED_MVA_CODES = new Set(['Ingen', '15% (Kode 31)', '25% (Kode 3)']);

function validateReportData(reportData: any) {
  const errors: string[] = [];

  if (!reportData || typeof reportData !== 'object') {
    return ['Mangler reportData.'];
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(reportData.dato || ''))) {
    errors.push('Dato mangler eller har feil format (YYYY-MM-DD).');
  }

  if (!reportData.ansatt || !String(reportData.ansatt).trim()) {
    errors.push('Ansattnavn mangler.');
  }

  const scanMeta = reportData.scanMetadata;
  if (!scanMeta || !String(scanMeta.scannedByName || '').trim()) {
    errors.push('Skannebevis mangler: scannedByName.');
  }
  if (!scanMeta || !String(scanMeta.scannedAt || '').trim()) {
    errors.push('Skannebevis mangler: scannedAt.');
  }

  const checklist = reportData.qaChecklist;
  if (!checklist || Object.values(checklist).some(v => v !== true)) {
    errors.push('Kvalitetskontroll er ikke fullført.');
  }

  if (Number(reportData.differanse || 0) !== 0 && !String(reportData.qaComment || '').trim()) {
    errors.push('Kommentar er obligatorisk når differansen ikke er 0.');
  }

  if (!Array.isArray(reportData.linjer) || reportData.linjer.length === 0) {
    errors.push('Ingen varelinjer mottatt.');
    return errors;
  }

  reportData.linjer.forEach((line: any, idx: number) => {
    const lineNumber = idx + 1;
    if (!String(line.varenavn || '').trim()) {
      errors.push(`Linje ${lineNumber}: varenavn mangler.`);
    }
    if (!Number.isFinite(Number(line.antall)) || Number(line.antall) <= 0) {
      errors.push(`Linje ${lineNumber}: antall må være større enn 0.`);
    }
    if (!Number.isFinite(Number(line.beloep)) || Number(line.beloep) < 0) {
      errors.push(`Linje ${lineNumber}: beløp kan ikke være negativt.`);
    }
    if (!String(line.konto || '').trim()) {
      errors.push(`Linje ${lineNumber}: konto mangler.`);
    }
    if (!ALLOWED_MVA_CODES.has(String(line.mvaKode || ''))) {
      errors.push(`Linje ${lineNumber}: ugyldig MVA-kode.`);
    }
  });

  return errors;
}

// Initialize Firebase Admin asynchronously
async function initFirebase() {
  try {
    const configPath = path.join(process.cwd(), 'firebase-applet-config.json');
    if (fs.existsSync(configPath)) {
      const firebaseConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      admin.initializeApp({
        projectId: firebaseConfig.projectId,
      });
      db = getFirestore(admin.app(), firebaseConfig.firestoreDatabaseId || '(default)');
      console.log("Firebase Admin initialized");
      await loadTokensFromFirestore();
    }
  } catch (err) {
    console.error("Firebase initialization failed:", err);
  }
}

const app = express();
const PORT = parseInt(process.env.PORT || '3000', 10);

const appUrl = process.env.APP_URL || `http://localhost:${PORT}`;

app.use(express.json());
app.use(cookieSession({
  name: 'session',
  keys: [process.env.SESSION_SECRET || 'ski-golf-secret-fallback'],
  maxAge: 24 * 60 * 60 * 1000, // 24 hours
  secure: process.env.NODE_ENV === 'production',
  sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax'
}));

const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  `${appUrl}/auth/callback`
);

// Mock database for kiosk users (In a real app, use a database)
const KIOSK_USERS = [
  { phone: "48887721", password: "SkiKiosk2026", name: "Lene Cecilie" },
  { phone: "98124460", password: "SkiKiosk2026", name: "Tomine" },
  { phone: "93030465", password: "SkiKiosk2026", name: "Ulf" },
  { phone: "95096275", password: "SkiKiosk2026", name: "Tove" }
];

// Auth Routes
app.post('/api/auth/login-mobile', (req, res) => {
  const { phone, password } = req.body;
  const user = KIOSK_USERS.find(u => u.phone === phone && u.password === password);
  
  if (user) {
    req.session!.kioskUser = { phone: user.phone, name: user.name };
    res.json({ success: true, user: req.session!.kioskUser });
  } else {
    res.status(401).json({ error: "Feil mobilnummer eller passord" });
  }
});

app.get('/api/auth/url', (req, res) => {
  const url = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: [
      'https://www.googleapis.com/auth/spreadsheets',
      'https://www.googleapis.com/auth/drive.file'
    ],
    prompt: 'consent'
  });
  res.json({ url });
});

let masterTokens: any = null;

// Function to load tokens from Firestore
async function loadTokensFromFirestore() {
  if (!db) return;
  try {
    const doc = await db.collection('config').doc('google_tokens').get();
    if (doc.exists) {
      masterTokens = doc.data();
      console.log("Tokens loaded from Firestore");
    }
  } catch (err) {
    console.error("Error loading tokens from Firestore:", err);
  }
}

// Function to save tokens to Firestore
async function saveTokensToFirestore(tokens: any) {
  if (!db) {
    console.warn("Firestore not initialized, tokens not saved permanently");
    return;
  }
  try {
    await db.collection('config').doc('google_tokens').set(tokens);
    console.log("Tokens saved to Firestore");
  } catch (err) {
    console.error("Error saving tokens to Firestore:", err);
  }
}

// Load tokens on startup (handled in initFirebase)
// loadTokensFromFirestore().catch(err => console.error("Initial token load failed:", err));

app.get('/auth/callback', async (req, res) => {
  const { code } = req.query;
  try {
    const { tokens } = await oauth2Client.getToken(code as string);
    req.session!.tokens = tokens;
    masterTokens = tokens;
    await saveTokensToFirestore(tokens); // Save to Firestore
    res.send(`
      <html>
        <body>
          <script>
            if (window.opener) {
              window.opener.postMessage({ type: 'OAUTH_AUTH_SUCCESS' }, '*');
              window.close();
            } else {
              window.location.href = '/';
            }
          </script>
          <p>Autentisering vellykket! Dette vinduet lukkes automatisk.</p>
        </body>
      </html>
    `);
  } catch (error) {
    console.error("Error getting tokens:", error);
    res.status(500).send("Autentisering feilet.");
  }
});

app.get('/api/auth/status', (req, res) => {
  res.json({ 
    isAuthenticated: !!req.session?.tokens || !!req.session?.kioskUser,
    isKioskUser: !!req.session?.kioskUser,
    user: req.session?.kioskUser || null
  });
});

app.post('/api/auth/logout', (req, res) => {
  req.session = null;
  res.json({ success: true });
});

// Google Sheets API
app.post('/api/sheets/save', async (req, res) => {
  const tokens = req.session?.tokens || masterTokens;
  
  if (!tokens) {
    return res.status(401).json({ error: "Ingen Google-tilkobling funnet. En admin må logge inn med Google først." });
  }

  const { reportData } = req.body;
  const validationErrors = validateReportData(reportData);
  if (validationErrors.length > 0) {
    return res.status(400).json({
      error: validationErrors[0],
      validationErrors,
    });
  }

  oauth2Client.setCredentials(tokens);
  
  const drive = google.drive({ version: 'v3', auth: oauth2Client });
  const sheets = google.sheets({ version: 'v4', auth: oauth2Client });

  try {
    // 1. Navigate/Create the hierarchy: økonomi -> org-filer -> data-kiosk
    const folders = ["økonomi", "org-filer", "data-kiosk"];
    let parentId = 'root';

    for (const folderName of folders) {
      const folderRes = await drive.files.list({
        q: `name = '${folderName}' and '${parentId}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
        fields: 'files(id)',
      });

      if (folderRes.data.files && folderRes.data.files.length > 0) {
        parentId = folderRes.data.files[0].id!;
      } else {
        const newFolder = await drive.files.create({
          requestBody: {
            name: folderName,
            mimeType: 'application/vnd.google-apps.folder',
            parents: parentId === 'root' ? [] : [parentId],
          },
          fields: 'id',
        });
        parentId = newFolder.data.id!;
      }
    }

    const folderId = parentId;

    // 2. Find or create the spreadsheet for the current month inside data-kiosk
    const monthName = reportData.dato.substring(0, 7); // YYYY-MM
    const fileName = `Kasseoppgjør_${monthName}`;
    
    let spreadsheetId: string;
    const fileRes = await drive.files.list({
      q: `name = '${fileName}' and '${folderId}' in parents and mimeType = 'application/vnd.google-apps.spreadsheet' and trashed = false`,
      fields: 'files(id)',
    });

    if (fileRes.data.files && fileRes.data.files.length > 0) {
      spreadsheetId = fileRes.data.files[0].id!;
    } else {
      const newSheet = await sheets.spreadsheets.create({
        requestBody: {
          properties: { title: fileName },
        },
      });
      spreadsheetId = newSheet.data.spreadsheetId!;
      
      // Move to folder
      await drive.files.update({
        fileId: spreadsheetId,
        addParents: folderId,
        removeParents: 'root',
        fields: 'id, parents',
      });

      // Add headers to the first sheet
      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: 'Sheet1!A1',
        valueInputOption: 'RAW',
        requestBody: {
          values: [[
            "Dato",
            "Ansatt",
            "Mobil",
            "Scannet tidspunkt",
            "Innlogging",
            "Kvalitetssjekk",
            "Differanse",
            "Differansekommentar",
            "Varenavn",
            "Antall",
            "Beløp",
            "Varegruppe",
            "Konto",
            "MVA-kode"
          ]]
        }
      });
    }

    // 3. Append the data
    const values = reportData.linjer.map((l: any) => [
      reportData.dato,
      reportData.ansatt || "Ukjent",
      reportData.scanMetadata?.scannedByPhone || "",
      reportData.scanMetadata?.scannedAt || "",
      reportData.scanMetadata?.authType || "",
      "Ja",
      reportData.differanse ?? 0,
      reportData.qaComment || "",
      l.varenavn,
      l.antall,
      l.beloep,
      l.varegruppe,
      l.konto,
      l.mvaKode
    ]);

    await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: 'Sheet1!A2',
      valueInputOption: 'RAW',
      requestBody: { values }
    });

    res.json({ success: true, spreadsheetId });
  } catch (error: any) {
    console.error("Sheets error:", error);
    res.status(500).json({ error: error.message });
  }
});

async function startServer() {
  await initFirebase();
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
