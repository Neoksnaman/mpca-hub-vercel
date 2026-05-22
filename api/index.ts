import 'dotenv/config';
import express from 'express';
import crypto from 'crypto';
import path from 'path';
import fs from 'fs';
import cookieParser from 'cookie-parser';
import { google } from 'googleapis';
import { OAuth2Client } from 'google-auth-library';
import multer from 'multer';
import { Readable } from 'stream';
import os from 'os';

const app = express();

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));
app.use(cookieParser());

const CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const REFRESH_TOKEN = process.env.GOOGLE_REFRESH_TOKEN;
const SPREADSHEET_ID = process.env.GOOGLE_SHEET_ID;
const ROOT_FOLDER_ID = process.env.GOOGLE_DRIVE_FOLDER_ID;

const auth = new OAuth2Client(CLIENT_ID, CLIENT_SECRET);
if (REFRESH_TOKEN) {
  auth.setCredentials({ refresh_token: REFRESH_TOKEN });
}

const sheets = google.sheets({ version: 'v4', auth });
const drive = google.drive({ version: 'v3', auth });

function normalizeAvatarUrl(url: string) {
  if (!url) return '';
  const driveMatch = url.match(/(?:id=|\/d\/|export=view&id=)([a-zA-Z0-9_-]{25,})/);
  if (driveMatch && driveMatch[1]) {
    return `/api/avatar/${driveMatch[1]}`;
  }
  return url;
}

// Multer setup using platform-agnostic OS temp directory
const upload = multer({ dest: path.join(os.tmpdir(), 'uploads') });

/**
 * Helper to find or create a subfolder in Google Drive
 */
async function getOrCreateSubfolder(parentID: string, folderName: string) {
  const response = await drive.files.list({
    q: `'${parentID}' in parents and name = '${folderName}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
    fields: 'files(id, name)',
  });

  const folders = response.data.files || [];
  if (folders.length > 0) return folders[0].id;

  // Create if not exists
  const folderMetadata = {
    name: folderName,
    mimeType: 'application/vnd.google-apps.folder',
    parents: [parentID],
  };

  const folder = await drive.files.create({
    requestBody: folderMetadata,
    fields: 'id',
  });

  return folder.data.id;
}

// OAuth helper routes to get a refresh token
app.get('/auth/google/url', (req, res) => {
  const redirectUri = `${req.protocol}://${req.get('host')}/auth/google/callback`;
  const oauthClient = new OAuth2Client(CLIENT_ID, CLIENT_SECRET, redirectUri);
  
  const url = oauthClient.generateAuthUrl({
    access_type: 'offline',
    scope: [
      'https://www.googleapis.com/auth/spreadsheets',
      'https://www.googleapis.com/auth/drive.file'
    ],
    prompt: 'consent'
  });
  res.send(`<h3>Google Sheets Setup</h3><p>Click below to authorize the app to access your spreadsheet. You will be provided with a refresh token to save in your environment variables.</p><a href="${url}" style="padding: 10px 20px; background: #4285F4; color: white; border-radius: 5px; text-decoration: none; font-family: sans-serif;">Authorize Google Sheets</a>`);
});

app.get('/auth/google/callback', async (req, res) => {
  const { code } = req.query;
  const redirectUri = `${req.protocol}://${req.get('host')}/auth/google/callback`;
  const oauthClient = new OAuth2Client(CLIENT_ID, CLIENT_SECRET, redirectUri);

  try {
    const { tokens } = await oauthClient.getToken(code as string);
    res.send(`
      <div style="font-family: sans-serif; padding: 20px;">
          <h3 style="color: #34A853;">Authorization Successful!</h3>
          <p>Copy the Refresh Token below and add it to your <b>GOOGLE_REFRESH_TOKEN</b> environment variable in the <b>Settings</b> menu:</p>
          <textarea style="width: 100%; height: 60px; padding: 10px; border: 1px solid #ddd; border-radius: 5px; background: #f9f9f9;" readonly>${tokens.refresh_token}</textarea>
          <p style="margin-top: 20px; font-size: 14px; color: #666;">After saving the variable, click <b>Restart Server</b> in the AI Studio preview.</p>
      </div>
    `);
  } catch (error: any) {
    res.status(500).send('Error getting token: ' + error.message);
  }
});

// Middleware to check if user is logged in via our custom username/pass session
app.use('/api', (req, res, next) => {
  if (req.path === '/login') return next();
  if (req.path === '/cron/reminders') return next(); // Bypass session auth for cron checks
  if (req.cookies.user_id) return next();
  res.status(401).json({ error: 'Unauthorized' });
});

app.post('/api/upload', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) throw new Error('No file uploaded');
    if (!ROOT_FOLDER_ID) throw new Error('GOOGLE_DRIVE_FOLDER_ID is not configured');

    const { type } = req.body; // 'Transmittal' or 'Meeting'
    const folderName = type === 'Meeting' ? 'Minutes of Meetings' : 'Transmittals';

    console.log(`[Drive] Uploading ${req.file.originalname} to ${folderName}...`);

    // 1. Get/Create Subfolder
    const subfolderID = await getOrCreateSubfolder(ROOT_FOLDER_ID, folderName);

    // 2. Upload File
    const fileMetadata = {
      name: req.file.originalname,
      parents: [subfolderID!],
    };
    const media = {
      mimeType: req.file.mimetype,
      body: fs.createReadStream(req.file.path),
    };

    const file = await drive.files.create({
      requestBody: fileMetadata,
      media: media,
      fields: 'id, webViewLink',
    });

    // 3. Set Permissions to "Anyone with link can view"
    await drive.permissions.create({
      fileId: file.data.id!,
      requestBody: {
        role: 'reader',
        type: 'anyone',
      },
    });

    // 4. Clean up local file
    fs.unlinkSync(req.file.path);

    console.log(`[Drive] File uploaded successfully: ${file.data.id}`);
    res.json({ id: file.data.id, url: file.data.webViewLink });
  } catch (error: any) {
    console.error('[Drive] Upload error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/delete-file/:fileId', async (req, res) => {
  try {
    const { fileId } = req.params;
    console.log(`[Drive] Deleting file: ${fileId}`);
    await drive.files.delete({ fileId });
    res.json({ success: true });
  } catch (error: any) {
    console.error('[Drive] Delete error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/upload-avatar', async (req, res) => {
  try {
    const { avatarDataUrl, username } = req.body;
    if (!avatarDataUrl) throw new Error('No avatar data URL provided');

    // Parse base64
    const matches = avatarDataUrl.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
    if (!matches || matches.length !== 3) {
      throw new Error('Invalid base64 avatar format');
    }
    const mimeType = matches[1];
    const buffer = Buffer.from(matches[2], 'base64');

    // Get or create Avatar folder inside GOOGLE_DRIVE_FOLDER_ID
    const parentFolderID = ROOT_FOLDER_ID || 'root';
    console.log(`[Drive Avatar] Searching or creating Avatar folder inside parent folder: ${parentFolderID}...`);
    const avatarFolderID = await getOrCreateSubfolder(parentFolderID, 'Avatar');

    // Name the file dynamically based on username to avoid collision
    const ext = mimeType.split('/')[1] || 'png';
    const filename = `avatar_${username}_${Date.now()}.${ext}`;

    // Upload to Google Drive
    const fileMetadata = {
      name: filename,
      parents: [avatarFolderID!],
    };

    const stream = Readable.from(buffer);

    const media = {
      mimeType: mimeType,
      body: stream,
    };

    const file = await drive.files.create({
      requestBody: fileMetadata,
      media: media,
      fields: 'id, webViewLink',
    });

    // Make the file public
    await drive.permissions.create({
      fileId: file.data.id!,
      requestBody: {
        role: 'reader',
        type: 'anyone',
      },
    });

    const directUrl = `/api/avatar/${file.data.id}`;
    console.log(`[Drive Avatar] File uploaded successfully: ${file.data.id}, Proxy URL: ${directUrl}`);

    res.json({ id: file.data.id, url: directUrl });
  } catch (error: any) {
    console.error('[Drive Avatar] Upload error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/avatar/:fileId', async (req, res) => {
  try {
    const { fileId } = req.params;
    console.log(`[Drive Proxy] Streaming avatar for file ID: ${fileId}`);

    const metadata = await drive.files.get({
      fileId,
      fields: 'mimeType,name',
    });

    const mimeType = metadata.data.mimeType || 'image/png';
    res.setHeader('Content-Type', mimeType);
    res.setHeader('Cache-Control', 'public, max-age=86400');

    const response = await drive.files.get(
      { fileId, alt: 'media' },
      { responseType: 'stream' }
    );

    response.data
      .on('error', (err: any) => {
        console.error('[Drive Proxy] Stream error:', err);
        if (!res.headersSent) {
          res.status(500).send('Error streaming avatar');
        }
      })
      .pipe(res);
  } catch (error: any) {
    console.error('[Drive Proxy] Error fetching avatar:', error);
    res.status(404).send('Avatar not found');
  }
});

app.put('/api/users/:id', async (req, res) => {
  const { id } = req.params;
  const { firstName, lastName, email, avatarUrl } = req.body;
  
  try {
    if (!SPREADSHEET_ID) throw new Error('GOOGLE_SHEET_ID is not configured');

    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: 'users!A:J',
    });

    const rows = response.data.values || [];
    const rowIndex = rows.findIndex(row => String(row[0]).trim().replace(/^0+/, '') === id.replace(/^0+/, ''));
    if (rowIndex === -1) return res.status(404).json({ error: 'User not found' });

    const currentRow = rows[rowIndex];
    while (currentRow.length < 10) {
      currentRow.push('');
    }

    if (firstName !== undefined) currentRow[3] = firstName;
    if (lastName !== undefined) currentRow[4] = lastName;
    if (avatarUrl !== undefined) currentRow[8] = avatarUrl;
    if (email !== undefined) currentRow[9] = email;

    await sheets.spreadsheets.values.update({
      spreadsheetId: SPREADSHEET_ID,
      range: `users!A${rowIndex + 1}:J${rowIndex + 1}`,
      valueInputOption: 'USER_ENTERED',
      requestBody: { values: [currentRow] },
    });

    res.json({ 
      success: true, 
      user: {
        id: currentRow[0],
        username: currentRow[1],
        firstName: currentRow[3],
        lastName: currentRow[4],
        role: currentRow[5],
        team: currentRow[6],
        status: currentRow[7],
        avatarUrl: currentRow[8],
        email: currentRow[9]
      }
    });
  } catch (error: any) {
    console.error('[API] Error updating user:', error);
    res.status(500).json({ error: error.message });
  }
});

app.put('/api/users/:id/password', async (req, res) => {
  const { id } = req.params;
  const { currentPassword, newPassword } = req.body;
  try {
    if (!SPREADSHEET_ID) throw new Error('GOOGLE_SHEET_ID is not configured');

    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: 'users!A:C',
    });

    const rows = response.data.values || [];
    const rowIndex = rows.findIndex(row => String(row[0]).trim().replace(/^0+/, '') === id.replace(/^0+/, ''));
    if (rowIndex === -1) return res.status(404).json({ error: 'User not found' });

    const currentRow = rows[rowIndex];
    if (currentRow[2] !== currentPassword) {
      return res.status(400).json({ error: 'Incorrect current password' });
    }

    await sheets.spreadsheets.values.update({
      spreadsheetId: SPREADSHEET_ID,
      range: `users!C${rowIndex + 1}`,
      valueInputOption: 'USER_ENTERED',
      requestBody: { values: [[newPassword]] },
    });

    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/login', async (req, res) => {
  const { username, password } = req.body;
  
  try {
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID!,
      range: 'users!A2:J',
    });

    const rows = response.data.values;
    if (!rows) return res.status(401).json({ error: 'No users found' });

    const userRow = rows.find(row => row[1] === username && row[2] === password);

    if (userRow) {
      res.cookie('user_id', userRow[0], { httpOnly: true, secure: true, sameSite: 'none' });
      res.json({
        id: userRow[0],
        username: userRow[1],
        firstName: userRow[3],
        lastName: userRow[4],
        role: userRow[5],
        team: userRow[6],
        status: userRow[7],
        avatarUrl: normalizeAvatarUrl(userRow[8] || ''),
        email: userRow[9] || '',
      });
    } else {
      res.status(401).json({ error: 'Invalid username or password' });
    }
  } catch (error: any) {
    console.error('Login error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/data', async (req, res) => {
  try {
    if (!SPREADSHEET_ID) throw new Error('GOOGLE_SHEET_ID is not configured');

    const ranges = [
      'retainerEngagements!A2:H', 'specialEngagements!A2:I', 'taxCompliances!A2:H',
      'users!A2:J', 'clients!A2:H', 'services!A2:C', 'deadline!A2:E',
      'retainerLog!A2:D', 'taskLog!A2:D', 'activityLog!A2:D', 'credentials!A2:G',
      'transmittals!A2:H', 'meetings!A2:E', 'notifications!A2:H'
    ];

    const response = await sheets.spreadsheets.values.batchGet({
      spreadsheetId: SPREADSHEET_ID,
      ranges,
    });

    const valueRanges = response.data.valueRanges || [];
    const data: any = {};
    ranges.forEach((range, i) => {
      const key = range.split('!')[0];
      data[key] = valueRanges[i]?.values || [];
    });

    const users = data.users.map((row: any[]) => ({
      id: row[0] || '',
      username: row[1] || '',
      firstName: row[3] || '',
      lastName: row[4] || '',
      role: row[5] || '',
      team: row[6] || '',
      status: row[7] || '',
      avatarUrl: normalizeAvatarUrl(row[8] || ''),
      email: row[9] || ''
    }));

    const retainers = data.retainerEngagements.map((row: any[]) => ({
      id: row[0] || '',
      clientId: row[1] || '',
      serviceType: row[2] || '',
      startDate: row[3] || '',
      engagementStatus: row[4] || 'Active',
      assignedStaff: row[5] || ''
    }));

    const clients = data.clients.map((row: any[]) => ({
      id: row[0] || '',
      name: row[1] || '',
      tin: row[2] || '',
      entityType: row[3] || '',
      email: row[4] || '',
      contactPerson: row[5] || '',
      status: row[6] || 'Active',
      fiscalYearEnd: row[7] || ''
    }));

    const services = data.services.map((row: any[]) => ({
      id: row[0] || '',
      name: row[1] || '',
      type: row[2] || ''
    }));

    res.json({
      retainers,
      specials: data.specialEngagements.map((row: any[]) => {
        const padded = [...row];
        while (padded.length < 9) padded.push('');
        return padded;
      }),
      taxCompliances: data.taxCompliances,
      deadlines: data.deadline,
      users,
      clients,
      services,
      retainerLogs: data.retainerLog,
      taskLog: data.taskLog,
      activityLog: data.activityLog,
      credentials: data.credentials.map((row: any[]) => ({
        credentialID: row[0] || '',
        clientID: row[1] || '',
        systemName: row[2] || '',
        username: row[3] || '',
        password: row[4] || '',
        securityAnswer: row[5] || '',
        remarks: row[6] || ''
      })),
      transmittals: data.transmittals.map((row: any[]) => ({
        transmittalID: row[0] || '',
        clientID: row[1] || '',
        userID: row[2] || '',
        items: row[3] || '',
        date: row[4] || '',
        receiptUrl: row[5] || '',
        receiverName: row[6] || '',
        receiverAddress: row[7] || ''
      })),
      meetings: data.meetings.map((row: any[]) => ({
        meetingID: row[0] || '',
        date: row[1] || '',
        subject: row[2] || '',
        userIDs: row[3] || '',
        momUrl: row[4] || ''
      })),
      notifications: data.notifications ? data.notifications.map((row: any[]) => ({
        id: row[0] || '',
        userId: row[1] || '',
        title: row[2] || '',
        message: row[3] || '',
        type: row[4] || '',
        link: row[5] || '',
        isRead: String(row[6]).toUpperCase() === 'TRUE',
        createdAt: row[7] || ''
      })) : [],
      deliverables: []
    });
  } catch (error: any) {
    console.error('API /api/data error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// --- Notifications Endpoints ---
app.post('/api/notifications', async (req, res) => {
  try {
    const data = req.body;
    const id = crypto.randomUUID();
    const createdAt = new Date().toISOString();
    const row = [id, data.userId, data.title, data.message, data.type, data.link, 'FALSE', createdAt];

    await sheets.spreadsheets.values.append({
      spreadsheetId: SPREADSHEET_ID!,
      range: 'notifications!A:H',
      valueInputOption: 'USER_ENTERED',
      requestBody: { values: [row] },
    });
    res.json({ success: true, id });
  } catch (error: any) {
    console.error('API /api/notifications error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/notifications/read', async (req, res) => {
  try {
    const { id } = req.body;
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID!,
      range: 'notifications!A2:H',
    });
    const rows = response.data.values || [];
    const index = rows.findIndex((row: any) => row[0] === id);
    
    if (index !== -1) {
      await sheets.spreadsheets.values.update({
        spreadsheetId: SPREADSHEET_ID!,
        range: `notifications!G${index + 2}`,
        valueInputOption: 'USER_ENTERED',
        requestBody: { values: [['TRUE']] },
      });
    }
    res.json({ success: true });
  } catch (error: any) {
    console.error('API /api/notifications/read error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/notifications/read-all', async (req, res) => {
  try {
    const { userId } = req.body;
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID!,
      range: 'notifications!A2:H',
    });
    const rows = response.data.values || [];
    const updates = [];
    
    for (let i = 0; i < rows.length; i++) {
      if (rows[i][1] === userId && String(rows[i][6]).toUpperCase() !== 'TRUE') {
        updates.push({
          range: `notifications!G${i + 2}`,
          values: [['TRUE']]
        });
      }
    }

    if (updates.length > 0) {
      await sheets.spreadsheets.values.batchUpdate({
        spreadsheetId: SPREADSHEET_ID!,
        requestBody: {
          valueInputOption: 'USER_ENTERED',
          data: updates
        }
      });
    }
    res.json({ success: true });
  } catch (error: any) {
    console.error('API /api/notifications/read-all error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/logout', (req, res) => {
  res.clearCookie('user_id');
  res.json({ success: true });
});

app.post('/api/transmittals', async (req, res) => {
  try {
    if (!SPREADSHEET_ID) throw new Error('GOOGLE_SHEET_ID is not configured');
    const data = req.body;
    const transmittalDate = new Date(data.date);
    
    const month = String(transmittalDate.getMonth() + 1).padStart(2, '0');
    const year = String(transmittalDate.getFullYear()).slice(-2);
    const prefix = `${month}${year}-TS`;

    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: 'transmittals!A2:A',
    });
    const rows = response.data.values || [];
    
    const monthIds = rows
      .map(row => String(row[0] || ''))
      .filter(id => id.startsWith(prefix));

    let nextNum = 1;
    if (monthIds.length > 0) {
      const numbers = monthIds.map(id => {
        const parts = id.split('-TS');
        return parts.length > 1 ? parseInt(parts[1], 10) : 0;
      });
      nextNum = Math.max(...numbers) + 1;
    }

    const nextId = `${prefix}${nextNum.toString().padStart(4, '0')}`;

    const row = [
      nextId,
      data.clientID,
      data.userID,
      data.items,
      data.date,
      data.receiptUrl || '',
      data.receiverName || '',
      data.receiverAddress || ''
    ];

    await sheets.spreadsheets.values.append({
      spreadsheetId: SPREADSHEET_ID,
      range: 'transmittals!A2',
      valueInputOption: 'USER_ENTERED',
      requestBody: { values: [row] },
    });

    res.json({ success: true, transmittalID: nextId });
  } catch (error: any) {
    console.error('[API] Transmittal error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/meetings', async (req, res) => {
  try {
    if (!SPREADSHEET_ID) throw new Error('GOOGLE_SHEET_ID is not configured');
    const data = req.body;

    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: 'meetings!A2:A',
    });
    const rows = response.data.values || [];
    const nextId = (rows.length + 1).toString().padStart(4, '0');

    const row = [
      nextId,
      data.date,
      data.subject,
      data.userIDs,
      data.momUrl
    ];

    await sheets.spreadsheets.values.append({
      spreadsheetId: SPREADSHEET_ID,
      range: 'meetings!A2',
      valueInputOption: 'USER_ENTERED',
      requestBody: { values: [row] },
    });

    res.json({ success: true, meetingID: nextId });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.put('/api/transmittals/:id', async (req, res) => {
  const { id } = req.params;
  const data = req.body;
  try {
    if (!SPREADSHEET_ID) throw new Error('GOOGLE_SHEET_ID is not configured');
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: 'transmittals!A:A',
    });
    const rows = response.data.values || [];
    const rowIndex = rows.findIndex(row => String(row[0]) === String(id));
    if (rowIndex === -1) return res.status(404).json({ error: 'Transmittal not found' });

    const row = [id, data.clientID, data.userID, data.items, data.date, data.receiptUrl || '', data.receiverName || '', data.receiverAddress || ''];
    await sheets.spreadsheets.values.update({
      spreadsheetId: SPREADSHEET_ID,
      range: `transmittals!A${rowIndex + 1}:H${rowIndex + 1}`,
      valueInputOption: 'USER_ENTERED',
      requestBody: { values: [row] },
    });
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.put('/api/meetings/:id', async (req, res) => {
  const { id } = req.params;
  const data = req.body;
  try {
    if (!SPREADSHEET_ID) throw new Error('GOOGLE_SHEET_ID is not configured');
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: 'meetings!A:A',
    });
    const rows = response.data.values || [];
    const rowIndex = rows.findIndex(row => String(row[0]) === String(id));
    if (rowIndex === -1) return res.status(404).json({ error: 'Meeting not found' });

    const row = [id, data.date, data.subject, data.userIDs, data.momUrl];
    await sheets.spreadsheets.values.update({
      spreadsheetId: SPREADSHEET_ID,
      range: `meetings!A${rowIndex + 1}:E${rowIndex + 1}`,
      valueInputOption: 'USER_ENTERED',
      requestBody: { values: [row] },
    });
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/clients', async (req, res) => {
  console.log('[API] Received request to add client:', req.body.name);
  try {
    if (!SPREADSHEET_ID) {
      throw new Error('GOOGLE_SHEET_ID is not configured');
    }

    const client = req.body;
    
    console.log('[Sheets API] Fetching current IDs...');
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: 'clients!A2:A',
    });
    
    const rows = response.data.values || [];
    let nextIdNum = 1;
    
    if (rows.length > 0) {
      const numericIds = rows
        .map(row => row[0])
        .filter(id => id && !isNaN(parseInt(String(id), 10)))
        .map(id => parseInt(String(id), 10));
        
      if (numericIds.length > 0) {
        nextIdNum = Math.max(...numericIds) + 1;
      }
    }
    
    const nextId = nextIdNum.toString().padStart(4, '0');
    console.log('[API] Generated next ID:', nextId);
    
    const row = [
      nextId,
      client.name || '',
      client.tin || '',
      client.entityType || '',
      client.email || '',
      client.contactPerson || '',
      client.status || 'Active',
      client.fiscalYearEnd || ''
    ];

    console.log('[Sheets API] Appending row...');
    await sheets.spreadsheets.values.append({
      spreadsheetId: SPREADSHEET_ID,
      range: 'clients!A2',
      valueInputOption: 'USER_ENTERED',
      requestBody: {
        values: [row],
      },
    });

    console.log('[API] Successfully added client:', nextId);
    return res.status(200).json({ 
      success: true, 
      client: { ...client, id: nextId } 
    });
  } catch (error: any) {
    console.error('[API] Error adding client:', error);
    return res.status(500).json({ 
      error: error.message || 'Internal server error' 
    });
  }
});

app.put('/api/clients/:id', async (req, res) => {
  const { id } = req.params;
  const updatedClient = req.body;
  console.log(`[API] Update request for client ${id}:`, JSON.stringify(updatedClient));
  
  try {
    if (!SPREADSHEET_ID) {
      throw new Error('GOOGLE_SHEET_ID is not configured');
    }

    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: 'clients!A:A',
    });
    
    const rows = response.data.values || [];
    const rowIndex = rows.findIndex(row => String(row[0]).trim().replace(/^0+/, '') === String(id).trim().replace(/^0+/, ''));
    
    if (rowIndex === -1) {
      console.error(`[API] Client ${id} not found in sheet`);
      return res.status(404).json({ error: 'Client not found' });
    }

    const row = [
      id.padStart(4, '0'),
      updatedClient.name || '',
      updatedClient.tin || '',
      updatedClient.entityType || updatedClient.entity_type || '',
      updatedClient.email || '',
      updatedClient.contactPerson || '',
      updatedClient.status || 'Active',
      updatedClient.fiscalYearEnd || ''
    ];

    console.log(`[API] Writing row to sheet at index ${rowIndex + 1}:`, JSON.stringify(row));

    await sheets.spreadsheets.values.update({
      spreadsheetId: SPREADSHEET_ID,
      range: `clients!A${rowIndex + 1}:H${rowIndex + 1}`,
      valueInputOption: 'USER_ENTERED',
      requestBody: {
        values: [row],
      },
    });

    console.log('[API] Successfully updated client:', id);
    return res.status(200).json({ success: true });
  } catch (error: any) {
    console.error('[API] Error updating client:', error);
    return res.status(500).json({ error: error.message });
  }
});

app.put('/api/retainers/:id', async (req, res) => {
  const { id } = req.params;
  const { clientId, serviceId, assignedStaffId, startDate, dueDateCode, selectedTaxes } = req.body;
  
  console.log(`[API] Updating retainer: ${id} for client: ${clientId}`);

  try {
    if (!SPREADSHEET_ID) throw new Error('GOOGLE_SHEET_ID is not configured');

    const rResponse = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: 'retainerEngagements!A:F',
    });
    const rRows = rResponse.data.values || [];
    const rowIndex = rRows.findIndex(r => String(r[0]).trim().replace(/^0+/, '') === id.replace(/^0+/, ''));
    
    if (rowIndex === -1) return res.status(404).json({ error: 'Retainer not found' });

    const updatedRow = [id, clientId, serviceId, startDate, 'Active', assignedStaffId];
    await sheets.spreadsheets.values.update({
      spreadsheetId: SPREADSHEET_ID,
      range: `retainerEngagements!A${rowIndex + 1}:F${rowIndex + 1}`,
      valueInputOption: 'USER_ENTERED',
      requestBody: { values: [updatedRow] }
    });

    const dlResponse = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: 'deadline!A:E',
    });
    const dlRows = dlResponse.data.values || [];
    
    const filteredDeadlines = dlRows.filter((r, idx) => {
      if (idx === 0) return true;
      return String(r[1]).trim().replace(/^0+/, '') !== id.replace(/^0+/, '');
    });

    await sheets.spreadsheets.values.clear({
      spreadsheetId: SPREADSHEET_ID,
      range: 'deadline!A:E',
    });
    await sheets.spreadsheets.values.update({
      spreadsheetId: SPREADSHEET_ID,
      range: 'deadline!A1',
      valueInputOption: 'USER_ENTERED',
      requestBody: { values: filteredDeadlines }
    });

    const newDlResponse = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: 'deadline!A2:A',
    });
    const newDlRows = newDlResponse.data.values || [];
    let nextDlIdNum = 1;
    if (newDlRows.length > 0) {
      const dlIds = newDlRows.map(r => r[0]).filter(id => id && !isNaN(parseInt(id, 10))).map(id => parseInt(id, 10));
      if (dlIds.length > 0) nextDlIdNum = Math.max(...dlIds) + 1;
    }

    let deadlineRows = [];
    if (serviceId === '0001' && selectedTaxes && selectedTaxes.length > 0) {
      deadlineRows = selectedTaxes.map((tax: any, idx: number) => [
        (nextDlIdNum + idx).toString().padStart(4, '0'),
        id,
        serviceId,
        tax.taxID,
        tax.dueDateCode
      ]);
    } else if (dueDateCode) {
      deadlineRows = [[
        nextDlIdNum.toString().padStart(4, '0'),
        id,
        serviceId,
        '',
        dueDateCode
      ]];
    }

    if (deadlineRows.length > 0) {
      await sheets.spreadsheets.values.append({
        spreadsheetId: SPREADSHEET_ID,
        range: 'deadline!A2',
        valueInputOption: 'USER_ENTERED',
        requestBody: { values: deadlineRows }
      });
    }

    console.log('[API] Successfully updated retainer and deadlines:', id);
    return res.status(200).json({ success: true });
  } catch (error: any) {
    console.error('[API] Error updating retainer:', error);
    return res.status(500).json({ error: error.message });
  }
});

app.delete('/api/retainers/:id', async (req, res) => {
  const { id } = req.params;
  console.log(`[API] Deleting retainer: ${id}`);

  try {
    if (!SPREADSHEET_ID) throw new Error('GOOGLE_SHEET_ID is not configured');

    const rResponse = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: 'retainerEngagements!A:F',
    });
    const rRows = rResponse.data.values || [];
    const filteredRetainers = rRows.filter((r, idx) => {
      if (idx === 0) return true;
      return String(r[0]).trim().replace(/^0+/, '') !== id.replace(/^0+/, '');
    });

    await sheets.spreadsheets.values.clear({
      spreadsheetId: SPREADSHEET_ID,
      range: 'retainerEngagements!A:F',
    });
    await sheets.spreadsheets.values.update({
      spreadsheetId: SPREADSHEET_ID,
      range: 'retainerEngagements!A1',
      valueInputOption: 'USER_ENTERED',
      requestBody: { values: filteredRetainers }
    });

    const dlResponse = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: 'deadline!A:E',
    });
    const dlRows = dlResponse.data.values || [];
    const filteredDeadlines = dlRows.filter((r, idx) => {
      if (idx === 0) return true;
      return String(r[1]).trim().replace(/^0+/, '') !== id.replace(/^0+/, '');
    });

    await sheets.spreadsheets.values.clear({
      spreadsheetId: SPREADSHEET_ID,
      range: 'deadline!A:E',
    });
    await sheets.spreadsheets.values.update({
      spreadsheetId: SPREADSHEET_ID,
      range: 'deadline!A1',
      valueInputOption: 'USER_ENTERED',
      requestBody: { values: filteredDeadlines }
    });

    console.log('[API] Successfully deleted retainer and deadlines:', id);
    return res.status(200).json({ success: true });
  } catch (error: any) {
    console.error('[API] CRITICAL ERROR deleting retainer:', error);
    const message = error.response?.data?.error?.message || error.message || 'Unknown server error';
    return res.status(500).json({ error: `Server Error: ${message}` });
  }
});

app.post('/api/retainers', async (req, res) => {
  const { clientId, assignments } = req.body;
  console.log('[API] Modular assignment for client:', clientId, 'Count:', assignments?.length);

  try {
    if (!SPREADSHEET_ID) throw new Error('GOOGLE_SHEET_ID is not configured');

    const results = [];

    for (const task of assignments) {
      const { serviceId, assignedStaffId, startDate, dueDateCode, selectedTaxes } = task;

      const response = await sheets.spreadsheets.values.get({
        spreadsheetId: SPREADSHEET_ID,
        range: 'retainerEngagements!A2:A',
      });
      const rows = response.data.values || [];
      let nextIdNum = 1;
      if (rows.length > 0) {
        const numericIds = rows.map(r => r[0]).filter(id => id && !isNaN(parseInt(id, 10))).map(id => parseInt(id, 10));
        if (numericIds.length > 0) nextIdNum = Math.max(...numericIds) + 1;
      }
      const retainerId = nextIdNum.toString().padStart(4, '0');

      await sheets.spreadsheets.values.append({
        spreadsheetId: SPREADSHEET_ID,
        range: 'retainerEngagements!A2',
        valueInputOption: 'USER_ENTERED',
        requestBody: { values: [[retainerId, clientId, serviceId, startDate, 'Active', assignedStaffId]] }
      });

      console.log('[API] Adding deadlines for retainer:', retainerId, 'Service:', serviceId);
      
      const dlResponse = await sheets.spreadsheets.values.get({
        spreadsheetId: SPREADSHEET_ID,
        range: 'deadline!A2:A',
      });
      const dlRows = dlResponse.data.values || [];
      let nextDlIdNum = 1;
      if (dlRows.length > 0) {
        const dlIds = dlRows.map(r => r[0]).filter(id => id && !isNaN(parseInt(id, 10))).map(id => parseInt(id, 10));
        if (dlIds.length > 0) nextDlIdNum = Math.max(...dlIds) + 1;
      }

      let deadlineRows = [];

      if (serviceId === '0001' && selectedTaxes && selectedTaxes.length > 0) {
        deadlineRows = selectedTaxes.map((tax: any, idx: number) => [
          (nextDlIdNum + idx).toString().padStart(4, '0'),
          retainerId,
          serviceId,
          tax.taxID,
          tax.dueDateCode
        ]);
      } else if (dueDateCode) {
        deadlineRows = [[
          nextDlIdNum.toString().padStart(4, '0'),
          retainerId,
          serviceId,
          '',
          dueDateCode
        ]];
      }

      if (deadlineRows.length > 0) {
        await sheets.spreadsheets.values.append({
          spreadsheetId: SPREADSHEET_ID,
          range: 'deadline!A2',
          valueInputOption: 'USER_ENTERED',
          requestBody: { values: deadlineRows }
        });
      }
      
      results.push({ retainerId, serviceId });
    }

    return res.status(200).json({ success: true, results });
  } catch (error: any) {
    console.error('[API] Error in modular assignment:', error);
    return res.status(500).json({ error: error.message || 'Internal server error' });
  }
});

const formatDateToMDY = (dateStr: string) => {
  if (!dateStr || !dateStr.includes('-')) return dateStr;
  const parts = dateStr.split('-');
  if (parts.length !== 3) return dateStr;
  const [y, m, d] = parts;
  return `${m}/${d}/${y}`;
};

app.post('/api/specials', async (req, res) => {
  const { clientId, assignments } = req.body;
  console.log('[API] Special project assignment for client:', clientId);

  try {
    if (!SPREADSHEET_ID) throw new Error('GOOGLE_SHEET_ID is not configured');

    const results = [];
    for (const task of assignments) {
      const response = await sheets.spreadsheets.values.get({
        spreadsheetId: SPREADSHEET_ID,
        range: 'specialEngagements!A2:A',
      });
      const rows = response.data.values || [];
      let nextIdNum = 1;
      if (rows.length > 0) {
        const numericIds = rows.map(r => r[0]).filter(id => id && !isNaN(parseInt(id, 10))).map(id => parseInt(id, 10));
        if (numericIds.length > 0) nextIdNum = Math.max(...numericIds) + 1;
      }
      const specialId = nextIdNum.toString().padStart(4, '0');

      const row = [
        specialId,
        String(clientId).padStart(4, '0'),
        String(task.assignedStaffId).padStart(4, '0'),
        String(task.serviceId).padStart(4, '0'),
        task.projectTitle || '',
        formatDateToMDY(task.startDate) || '',
        formatDateToMDY(task.endDate) || '',
        task.status || 'Planning',
        task.description || ''
      ];

      await sheets.spreadsheets.values.append({
        spreadsheetId: SPREADSHEET_ID,
        range: 'specialEngagements!A2',
        valueInputOption: 'USER_ENTERED',
        requestBody: { values: [row] }
      });
      
      results.push({ specialId });
    }

    return res.status(200).json({ success: true, results });
  } catch (error: any) {
    console.error('[API] Error adding special project:', error);
    return res.status(500).json({ error: error.message || 'Internal server error' });
  }
});

app.put('/api/specials/:id', async (req, res) => {
  const { id } = req.params;
  const data = req.body;
  console.log(`[API] Updating special engagement: ${id}`);

  try {
    if (!SPREADSHEET_ID) throw new Error('GOOGLE_SHEET_ID is not configured');

    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: 'specialEngagements!A:I',
    });

    const rows = response.data.values || [];
    const rowIndex = rows.findIndex(r => String(r[0]).trim().replace(/^0+/, '') === id.replace(/^0+/, ''));

    if (rowIndex === -1) {
      return res.status(404).json({ error: 'Special engagement not found' });
    }

    const currentRow = rows[rowIndex];
    const updatedRow = [...currentRow];
    
    if (data.assignedStaffId !== undefined) updatedRow[2] = String(data.assignedStaffId).padStart(4, '0');
    if (data.serviceId !== undefined) updatedRow[3] = String(data.serviceId).padStart(4, '0');
    if (data.projectTitle !== undefined) updatedRow[4] = data.projectTitle;
    if (data.startDate !== undefined) updatedRow[5] = formatDateToMDY(data.startDate);
    if (data.endDate !== undefined) updatedRow[6] = formatDateToMDY(data.endDate);
    if (data.status !== undefined) updatedRow[7] = data.status;
    if (data.description !== undefined) updatedRow[8] = data.description;
    
    updatedRow[0] = String(updatedRow[0] || '').padStart(4, '0');
    updatedRow[1] = String(updatedRow[1] || '').padStart(4, '0');

    while (updatedRow.length < 9) updatedRow.push('');

    console.log('[API] Final updatedRow to be sent:', updatedRow);

    await sheets.spreadsheets.values.update({
      spreadsheetId: SPREADSHEET_ID,
      range: `specialEngagements!A${rowIndex + 1}:I${rowIndex + 1}`,
      valueInputOption: 'USER_ENTERED',
      requestBody: { values: [updatedRow] }
    });

    console.log('[API] Successfully updated special engagement:', id);
    return res.status(200).json({ success: true });
  } catch (error: any) {
    console.error('[API] Error updating special engagement:', error);
    return res.status(500).json({ error: error.message });
  }
});

app.delete('/api/specials/:id', async (req, res) => {
  const { id } = req.params;
  console.log(`[API] Deleting special engagement: ${id}`);

  try {
    if (!SPREADSHEET_ID) throw new Error('GOOGLE_SHEET_ID is not configured');

    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: 'specialEngagements!A:I',
    });

    const rows = response.data.values || [];
    const filteredRows = rows.filter((r, idx) => {
      if (idx === 0) return true;
      return String(r[0]).trim().replace(/^0+/, '') !== id.replace(/^0+/, '');
    });

    await sheets.spreadsheets.values.clear({
      spreadsheetId: SPREADSHEET_ID,
      range: 'specialEngagements!A:I',
    });

    await sheets.spreadsheets.values.update({
      spreadsheetId: SPREADSHEET_ID,
      range: 'specialEngagements!A1',
      valueInputOption: 'USER_ENTERED',
      requestBody: { values: filteredRows }
    });

    console.log('[API] Successfully deleted special engagement:', id);
    return res.status(200).json({ success: true });
  } catch (error: any) {
    console.error('[API] Error deleting special engagement:', error);
    return res.status(500).json({ error: error.message });
  }
});

app.post('/api/retainer-logs', async (req, res) => {
  const { deadline, period, dateCompleted, remarks } = req.body;
  console.log('[API] Adding retainer log:', deadline, period, dateCompleted, remarks);

  try {
    if (!SPREADSHEET_ID) throw new Error('GOOGLE_SHEET_ID is not configured');

    const row = [deadline, period, dateCompleted, remarks || ''];

    await sheets.spreadsheets.values.append({
      spreadsheetId: SPREADSHEET_ID,
      range: 'retainerLog!A2',
      valueInputOption: 'USER_ENTERED',
      requestBody: { values: [row] }
    });

    console.log('[API] Successfully added retainer log for deadline:', deadline);
    return res.status(200).json({ success: true });
  } catch (error: any) {
    console.error('[API] Error adding retainer log:', error);
    return res.status(500).json({ error: error.message || 'Internal server error' });
  }
});

app.put('/api/retainer-logs', async (req, res) => {
  const { deadline, period, dateCompleted, remarks } = req.body;
  console.log('[API] Updating retainer log:', deadline, period, dateCompleted, remarks);

  try {
    if (!SPREADSHEET_ID) throw new Error('GOOGLE_SHEET_ID is not configured');

    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: 'retainerLog!A:B',
    });
    
    const rows = response.data.values || [];
    console.log(`[API] Found ${rows.length} rows in retainerLog`);
    
    const rowIndex = rows.findIndex((row, idx) => {
      const matchId = String(row[0] || '').trim().replace(/^0+/, '') === String(deadline).trim().replace(/^0+/, '');
      const matchPeriod = String(row[1] || '').trim() === String(period).trim();
      if (matchId) {
        console.log(`[API] Row ${idx} ID match: ${row[0]} vs ${deadline}, Period match: ${row[1]} vs ${period} -> ${matchPeriod}`);
      }
      return matchId && matchPeriod;
    });
    
    if (rowIndex === -1) {
      console.warn(`[API] Log entry not found for deadline: ${deadline}, period: ${period}`);
      return res.status(404).json({ error: 'Log entry not found' });
    }

    const updatedRow = [deadline, period, dateCompleted, remarks || ''];
    await sheets.spreadsheets.values.update({
      spreadsheetId: SPREADSHEET_ID,
      range: `retainerLog!A${rowIndex + 1}:D${rowIndex + 1}`,
      valueInputOption: 'USER_ENTERED',
      requestBody: {
        values: [updatedRow],
      },
    });

    console.log('[API] Successfully updated retainer log for deadline:', deadline);
    return res.status(200).json({ success: true });
  } catch (error: any) {
    console.error('[API] Error updating retainer log:', error);
    return res.status(500).json({ error: error.message || 'Internal server error' });
  }
});

app.post('/api/tasks', async (req, res) => {
  const { taskID, specialID, taskName, status } = req.body;
  try {
    if (!SPREADSHEET_ID) throw new Error('GOOGLE_SHEET_ID is not configured');
    const row = [taskID, specialID, taskName, status || 'Pending'];
    await sheets.spreadsheets.values.append({
      spreadsheetId: SPREADSHEET_ID,
      range: 'taskLog!A2',
      valueInputOption: 'USER_ENTERED',
      requestBody: { values: [row] }
    });
    return res.status(200).json({ success: true });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

app.put('/api/tasks/:id', async (req, res) => {
  const { id } = req.params;
  const { taskName, status } = req.body;
  try {
    if (!SPREADSHEET_ID) throw new Error('GOOGLE_SHEET_ID is not configured');
    
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: 'taskLog!A2:D',
    });
    const rows = response.data.values || [];
    const rowIndex = rows.findIndex(row => row[0] === id);
    
    if (rowIndex === -1) {
      return res.status(404).json({ error: 'Task not found' });
    }

    const currentRow = rows[rowIndex];
    const updatedRow = [
      id,
      currentRow[1],
      taskName || currentRow[2],
      status || currentRow[3]
    ];

    await sheets.spreadsheets.values.update({
      spreadsheetId: SPREADSHEET_ID,
      range: `taskLog!A${rowIndex + 2}:D${rowIndex + 2}`,
      valueInputOption: 'USER_ENTERED',
      requestBody: { values: [updatedRow] }
    });

    return res.status(200).json({ success: true });
  } catch (error: any) {
    console.error('[API] Error updating task:', error);
    return res.status(500).json({ error: error.message });
  }
});

app.delete('/api/tasks/:id', async (req, res) => {
  const { id } = req.params;
  try {
    if (!SPREADSHEET_ID) throw new Error('GOOGLE_SHEET_ID is not configured');

    const taskResponse = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: 'taskLog!A2:A',
    });
    const taskRows = taskResponse.data.values || [];
    const taskRowIndex = taskRows.findIndex(row => row[0] === id);

    if (taskRowIndex !== -1) {
      const spreadsheet = await sheets.spreadsheets.get({ spreadsheetId: SPREADSHEET_ID });
      const taskSheet = spreadsheet.data.sheets?.find(s => s.properties?.title === 'taskLog');
      if (taskSheet) {
        await sheets.spreadsheets.batchUpdate({
          spreadsheetId: SPREADSHEET_ID,
          requestBody: {
            requests: [{
              deleteDimension: {
                range: {
                  sheetId: taskSheet.properties?.sheetId,
                  dimension: 'ROWS',
                  startIndex: taskRowIndex + 1,
                  endIndex: taskRowIndex + 2
                }
              }
            }]
          }
        });
      }
    }

    const activityResponse = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: 'activityLog!A2:B',
    });
    const activityRows = activityResponse.data.values || [];
    
    const indicesToDelete: number[] = [];
    activityRows.forEach((row, index) => {
      if (row[1] === id) {
        indicesToDelete.push(index + 1);
      }
    });

    if (indicesToDelete.length > 0) {
      const spreadsheet = await sheets.spreadsheets.get({ spreadsheetId: SPREADSHEET_ID });
      const activitySheet = spreadsheet.data.sheets?.find(s => s.properties?.title === 'activityLog');
      if (activitySheet) {
        indicesToDelete.sort((a, b) => b - a);
        
        const requests = indicesToDelete.map(rowIndex => ({
          deleteDimension: {
            range: {
              sheetId: activitySheet.properties?.sheetId,
              dimension: 'ROWS',
              startIndex: rowIndex,
              endIndex: rowIndex + 1
            }
          }
        }));

        await sheets.spreadsheets.batchUpdate({
          spreadsheetId: SPREADSHEET_ID,
          requestBody: { requests }
        });
      }
    }

    return res.status(200).json({ success: true });
  } catch (error: any) {
    console.error('[API] Error deleting task:', error);
    return res.status(500).json({ error: error.message });
  }
});

app.post('/api/activities', async (req, res) => {
  const { activityID, taskID, dateCompleted, description } = req.body;
  try {
    if (!SPREADSHEET_ID) throw new Error('GOOGLE_SHEET_ID is not configured');
    const row = [activityID, taskID, dateCompleted, description];
    await sheets.spreadsheets.values.append({
      spreadsheetId: SPREADSHEET_ID,
      range: 'activityLog!A2',
      valueInputOption: 'USER_ENTERED',
      requestBody: { values: [row] }
    });
    return res.status(200).json({ success: true });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

app.put('/api/activities/:id', async (req, res) => {
  const { id } = req.params;
  const { description, dateCompleted } = req.body;
  try {
    if (!SPREADSHEET_ID) throw new Error('GOOGLE_SHEET_ID is not configured');
    
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: 'activityLog!A2:D',
    });
    const rows = response.data.values || [];
    const rowIndex = rows.findIndex(row => row[0] === id);
    
    if (rowIndex === -1) {
      return res.status(404).json({ error: 'Activity not found' });
    }

    const currentRow = rows[rowIndex];
    const updatedRow = [
      id,
      currentRow[1],
      dateCompleted || currentRow[2],
      description || currentRow[3]
    ];

    await sheets.spreadsheets.values.update({
      spreadsheetId: SPREADSHEET_ID,
      range: `activityLog!A${rowIndex + 2}:D${rowIndex + 2}`,
      valueInputOption: 'USER_ENTERED',
      requestBody: { values: [updatedRow] }
    });

    return res.status(200).json({ success: true });
  } catch (error: any) {
    console.error('[API] Error updating activity:', error);
    return res.status(500).json({ error: error.message });
  }
});

app.delete('/api/activities/:id', async (req, res) => {
  const { id } = req.params;
  try {
    if (!SPREADSHEET_ID) throw new Error('GOOGLE_SHEET_ID is not configured');

    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: 'activityLog!A2:A',
    });
    const rows = response.data.values || [];
    const rowIndex = rows.findIndex(row => row[0] === id);

    if (rowIndex === -1) {
      return res.status(404).json({ error: 'Activity not found' });
    }

    const spreadsheet = await sheets.spreadsheets.get({
      spreadsheetId: SPREADSHEET_ID
    });
    const sheet = spreadsheet.data.sheets?.find(s => s.properties?.title === 'activityLog');
    if (!sheet) throw new Error('activityLog sheet not found');
    const sheetId = sheet.properties?.sheetId;

    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: SPREADSHEET_ID,
      requestBody: {
        requests: [
          {
            deleteDimension: {
              range: {
                sheetId: sheetId,
                dimension: 'ROWS',
                startIndex: rowIndex + 1,
                endIndex: rowIndex + 2
              }
            }
          }
        ]
      }
    });

    return res.status(200).json({ success: true });
  } catch (error: any) {
    console.error('[API] Error deleting activity:', error);
    return res.status(500).json({ error: error.message });
  }
});

// --- Credential Endpoints ---
app.post('/api/credentials', async (req, res) => {
  const { clientID, systemName, username, password, securityAnswer, remarks } = req.body;
  try {
    if (!SPREADSHEET_ID) throw new Error('GOOGLE_SHEET_ID is not configured');
    
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: 'credentials!A2:A',
    });
    const rows = response.data.values || [];
    let nextIdNum = 1;
    if (rows.length > 0) {
      const ids = rows.map(r => r[0]).filter(id => id && !isNaN(parseInt(id, 10))).map(id => parseInt(id, 10));
      if (ids.length > 0) nextIdNum = Math.max(...ids) + 1;
    }
    const credentialID = nextIdNum.toString().padStart(4, '0');
    
    const row = [credentialID, clientID, systemName, username, password, securityAnswer, remarks || ''];
    await sheets.spreadsheets.values.append({
      spreadsheetId: SPREADSHEET_ID,
      range: 'credentials!A2',
      valueInputOption: 'USER_ENTERED',
      requestBody: { values: [row] }
    });
    return res.status(200).json({ success: true, credentialID });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

app.put('/api/credentials/:id', async (req, res) => {
  const { id } = req.params;
  const { systemName, username, password, securityAnswer, remarks } = req.body;
  try {
    if (!SPREADSHEET_ID) throw new Error('GOOGLE_SHEET_ID is not configured');
    
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: 'credentials!A:G',
    });
    const rows = response.data.values || [];
    const rowIndex = rows.findIndex(row => String(row[0]).trim().replace(/^0+/, '') === id.replace(/^0+/, ''));
    
    if (rowIndex === -1) return res.status(404).json({ error: 'Credential not found' });

    const currentRow = rows[rowIndex];
    const updatedRow = [
      id.padStart(4, '0'),
      currentRow[1],
      systemName || currentRow[2],
      username || currentRow[3],
      password || currentRow[4],
      securityAnswer !== undefined ? securityAnswer : currentRow[5],
      remarks !== undefined ? remarks : currentRow[6]
    ];

    await sheets.spreadsheets.values.update({
      spreadsheetId: SPREADSHEET_ID,
      range: `credentials!A${rowIndex + 1}:G${rowIndex + 1}`,
      valueInputOption: 'USER_ENTERED',
      requestBody: { values: [updatedRow] }
    });

    return res.status(200).json({ success: true });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

app.delete('/api/credentials/:id', async (req, res) => {
  const { id } = req.params;
  try {
    if (!SPREADSHEET_ID) throw new Error('GOOGLE_SHEET_ID is not configured');

    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: 'credentials!A:A',
    });
    const rows = response.data.values || [];
    const rowIndex = rows.findIndex(row => String(row[0]).trim().replace(/^0+/, '') === id.replace(/^0+/, ''));

    if (rowIndex === -1) return res.status(404).json({ error: 'Credential not found' });

    const spreadsheet = await sheets.spreadsheets.get({ spreadsheetId: SPREADSHEET_ID });
    const sheet = spreadsheet.data.sheets?.find(s => s.properties?.title === 'credentials');
    if (!sheet) throw new Error('credentials sheet not found');

    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: SPREADSHEET_ID,
      requestBody: {
        requests: [{
          deleteDimension: {
            range: {
              sheetId: sheet.properties?.sheetId,
              dimension: 'ROWS',
              startIndex: rowIndex,
              endIndex: rowIndex + 1
            }
          }
        }]
      }
    });

    return res.status(200).json({ success: true });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

app.delete('/api/transmittals/:id', async (req, res) => {
  const { id } = req.params;
  try {
    if (!SPREADSHEET_ID) throw new Error('GOOGLE_SHEET_ID is not configured');

    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: 'transmittals!A:A',
    });
    const rows = response.data.values || [];
    const rowIndex = rows.findIndex(row => String(row[0]) === String(id));

    if (rowIndex === -1) return res.status(404).json({ error: 'Transmittal not found' });

    const spreadsheet = await sheets.spreadsheets.get({ spreadsheetId: SPREADSHEET_ID });
    const sheet = spreadsheet.data.sheets?.find(s => s.properties?.title === 'transmittals');
    if (!sheet) throw new Error('transmittals sheet not found');

    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: SPREADSHEET_ID,
      requestBody: {
        requests: [{
          deleteDimension: {
            range: {
              sheetId: sheet.properties?.sheetId,
              dimension: 'ROWS',
              startIndex: rowIndex,
              endIndex: rowIndex + 1
            }
          }
        }]
      }
    });

    return res.status(200).json({ success: true });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

app.delete('/api/meetings/:id', async (req, res) => {
  const { id } = req.params;
  try {
    if (!SPREADSHEET_ID) throw new Error('GOOGLE_SHEET_ID is not configured');

    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: 'meetings!A:A',
    });
    const rows = response.data.values || [];
    const rowIndex = rows.findIndex(row => String(row[0]) === String(id));

    if (rowIndex === -1) return res.status(404).json({ error: 'Meeting not found' });

    const spreadsheet = await sheets.spreadsheets.get({ spreadsheetId: SPREADSHEET_ID });
    const sheet = spreadsheet.data.sheets?.find(s => s.properties?.title === 'meetings');
    if (!sheet) throw new Error('meetings sheet not found');

    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: SPREADSHEET_ID,
      requestBody: {
        requests: [{
          deleteDimension: {
            range: {
              sheetId: sheet.properties?.sheetId,
              dimension: 'ROWS',
              startIndex: rowIndex,
              endIndex: rowIndex + 1
            }
          }
        }]
      }
    });

    return res.status(200).json({ success: true });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

export async function runDeadlineChecks() {
  console.log('Backend auto deadline notification generation is disabled. The header generates these notifications on the frontend.');
}

// --- Endpoint to trigger deadline checks from frontend ---
app.post('/api/check-deadlines', async (req, res) => {
  try {
    await runDeadlineChecks();
    res.json({ success: true, message: 'Dynamic deadline notifications are generated on the frontend only' });
  } catch (error: any) {
    console.error('Check deadlines failed:', error);
    res.status(500).json({ error: error.message });
  }
});

export default app;
