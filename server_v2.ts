import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { google } from "googleapis";
import cookieSession from "cookie-session";
import dotenv from "dotenv";
import * as admin from "firebase-admin";

dotenv.config();

// 5. Innebygd Feilsøkingslogg
const debugLogs: string[] = [];
function addLog(msg: string) {
  const timestamp = new Date().toISOString();
  const logEntry = `[${timestamp}] ${msg}`;
  console.log(logEntry);
  debugLogs.unshift(logEntry);
  if (debugLogs.length > 50) debugLogs.pop();
}

// 1. Initialize Firebase Admin (Firestore)
try {
  if (!admin.apps.length) {
    admin.initializeApp({
      credential: admin.credential.applicationDefault() // Skal fungere automatisk i Cloud Run
    });
    addLog("Firebase Admin initialized");
  }
} catch (error: any) {
  addLog(`Firebase initialization error: ${error.message}`);
}
const db = admin.firestore();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

// 4. Sikker Session Management for Mobil/Cross-site
app.use(cookieSession({
  name: 'session',
  keys: [process.env.SESSION_SECRET || 'ski-golf-secret-fallback'],
  maxAge: 24 * 60 * 60 * 1000, // 24 hours
  secure: process.env.NODE_ENV === 'production',
  sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax'
}));

// 2. Dynamisk OAuth Redirect Håndtering
function getOAuthClient(req: express.Request) {
  const protocol = req.headers['x-forwarded-proto'] || req.protocol;
  const host = req.headers.host;
  const dynamicUrl = `${protocol}://${host}`;
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    `${dynamicUrl}/auth/callback`
  );
}

// Auth Routes (Admin)
app.get('/api/auth/url', (req, res) => {
  addLog(`Generate auth URL requested from host: ${req.headers.host}`);
  const oauth2Client = getOAuthClient(req);
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

app.get('/auth/callback', async (req, res) => {
  const { code } = req.query;
  addLog("OAuth callback triggered");
  try {
    const oauth2Client = getOAuthClient(req);
    const { tokens } = await oauth2Client.getToken(code as string);
    req.session!.tokens = tokens;
    
    // 3. Persistent Token-lagring i Firestore
    try {
      await db.collection('config').doc('google_tokens').set(tokens);
      addLog("Tokens lagret trygt i Firestore.");
    } catch (fsErr: any) {
      addLog(`Advarsel - feil ved lagring av tokens til Firestore: ${fsErr.message}`);
    }

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
  } catch (error: any) {
    addLog(`Error getting tokens: ${error.message}`);
    res.status(500).send("Autentisering feilet.");
  }
});

app.get('/api/auth/status', async (req, res) => {
  let hasTokens = !!req.session?.tokens;
  let isKioskUser = !!req.session?.kioskUser;

  // 3. Hent fra Firestore dersom session mangler og vi er admin (persistent tokens)
  // Men vi returnerer bare isAuthenticated hvis token faktisk fins i db eller session.
  if (!hasTokens) {
    try {
      const doc = await db.collection('config').doc('google_tokens').get();
      if (doc.exists) {
        req.session!.tokens = doc.data();
        hasTokens = true;
        addLog("Gjenopprettet admin Google-tokens fra Firestore til session.");
      }
    } catch (err: any) {
      addLog(`Feil ved sjekk av admin tokens i Firestore: ${err.message}`);
    }
  }

  res.json({ isAuthenticated: hasTokens, isKioskUser });
});

app.post('/api/auth/logout', (req, res) => {
  req.session = null;
  addLog("Bruker logget ut.");
  res.json({ success: true });
});

// 4. Separat Mobil-innlogging for Kioskvakter
app.post('/api/auth/login-mobile', async (req, res) => {
  const { phone, pin } = req.body;
  addLog(`Mobil login-forsøk: ${phone}`);
  
  try {
    const usersRef = db.collection('users');
    const snapshot = await usersRef.where('phone', '==', phone).where('pin', '==', pin).get();

    if (snapshot.empty) {
      // Midlertidig fallback for lokal utvikling
      if (phone === '12345678' && pin === '1234') {
         req.session!.kioskUser = { phone, role: 'kioskvakt' };
         addLog(`Fallback mobil-login suksess for tesbruker: ${phone}`);
         return res.json({ success: true });
      }
      
      addLog(`Mobil login feilet (feil PIN/nr) for: ${phone}`);
      return res.status(401).json({ error: "Ugyldig telefonnummer eller PIN" });
    }

    req.session!.kioskUser = { phone, id: snapshot.docs[0].id, role: 'kioskvakt' };
    addLog(`Mobil login suksess fra Firestore for: ${phone}`);
    res.json({ success: true });
  } catch (err: any) {
     addLog(`Mobil login error: ${err.message}`);
     res.status(500).json({ error: "Intern serverfeil ved innlogging" });
  }
});

// 5. Innebygd Feilsøkingslogg API
app.get('/api/debug/logs', (req, res) => {
  res.json({ logs: debugLogs });
});

// Google Sheets API
app.post('/api/sheets/save', async (req, res) => {
  // Tillat hvis admin eller hvis kioskvakt (som bruker lagret admin-token)
  let tokens = req.session?.tokens;
  
  if (!tokens && req.session?.kioskUser) {
    try {
      const doc = await db.collection('config').doc('google_tokens').get();
      if (doc.exists) {
         tokens = doc.data();
      }
    } catch (e) {
      addLog("Klarte ikke hente felles tokens for kioskvakt");
    }
  }

  if (!tokens) {
    return res.status(401).json({ error: "Ikke autentisert for Google Sheets" });
  }

  const { reportData, folderName = "Kasse_Kiosk" } = req.body;
  const oauth2Client = getOAuthClient(req);
  oauth2Client.setCredentials(tokens);
  
  const drive = google.drive({ version: 'v3', auth: oauth2Client });
  const sheets = google.sheets({ version: 'v4', auth: oauth2Client });

  try {
    let folderId: string;
    const folderRes = await drive.files.list({
      q: `name = '${folderName}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
      fields: 'files(id)',
    });

    if (folderRes.data.files && folderRes.data.files.length > 0) {
      folderId = folderRes.data.files[0].id!;
    } else {
      const newFolder = await drive.files.create({
        requestBody: { name: folderName, mimeType: 'application/vnd.google-apps.folder' },
        fields: 'id',
      });
      folderId = newFolder.data.id!;
    }

    const monthName = reportData.dato.substring(0, 7);
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
        requestBody: { properties: { title: fileName } },
      });
      spreadsheetId = newSheet.data.spreadsheetId!;
      
      await drive.files.update({
        fileId: spreadsheetId,
        addParents: folderId,
        removeParents: 'root',
        fields: 'id, parents',
      });

      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: 'Sheet1!A1',
        valueInputOption: 'RAW',
        requestBody: {
          values: [["Dato", "Ansatt", "Varenavn", "Antall", "Beløp", "Varegruppe", "Konto", "MVA-kode"]]
        }
      });
    }

    const values = reportData.linjer.map((l: any) => [
      reportData.dato,
      reportData.ansatt || "Ukjent",
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

    addLog(`Dagens oppgjør lagret i regneark: ${fileName}`);
    res.json({ success: true, spreadsheetId });
  } catch (error: any) {
    addLog(`Sheets error: ${error.message}`);
    res.status(500).json({ error: error.message });
  }
});

async function startServer() {
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
    addLog(`V2 Server startet på port ${PORT}`);
  });
}

startServer();