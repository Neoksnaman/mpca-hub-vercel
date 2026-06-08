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
import bcrypt from 'bcryptjs';
import { MongoClient } from 'mongodb';
import * as Ably from 'ably';

const app = express();

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));
app.use(cookieParser());

const CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const REFRESH_TOKEN = process.env.GOOGLE_REFRESH_TOKEN;
const SPREADSHEET_ID = process.env.GOOGLE_SHEET_ID;
const ROOT_FOLDER_ID = process.env.GOOGLE_DRIVE_FOLDER_ID;
const MONGODB_URI = process.env.MONGODB_URI;
const ABLY_API_KEY = process.env.ABLY_API_KEY;

const auth = new OAuth2Client(CLIENT_ID, CLIENT_SECRET);
if (REFRESH_TOKEN) {
  auth.setCredentials({ refresh_token: REFRESH_TOKEN });
}

const sheets = google.sheets({ version: 'v4', auth });
const drive = google.drive({ version: 'v3', auth });

let mongoClientPromise: Promise<MongoClient> | null = null;
let ablyRestClient: Ably.Rest | null = null;

async function getMongoDb() {
  if (!MONGODB_URI) {
    throw new Error('MONGODB_URI is not configured');
  }

  if (!mongoClientPromise) {
    const client = new MongoClient(MONGODB_URI, {
      serverSelectionTimeoutMS: 10000,
    });
    mongoClientPromise = client.connect();
  }

  const client = await mongoClientPromise;
  return client.db('mpca_app');
}

function getAblyRestClient() {
  if (!ABLY_API_KEY) return null;
  if (!ablyRestClient) {
    ablyRestClient = new Ably.Rest({ key: ABLY_API_KEY });
  }
  return ablyRestClient;
}

async function publishChatEvent(name: string, data: any) {
  const ably = getAblyRestClient();
  if (!ably) return;

  try {
    await ably.channels.get('mpca:chat').publish(name, {
      ...data,
      createdAt: new Date().toISOString(),
    });
  } catch (error) {
    console.warn('[Ably] Chat event publish failed:', error);
  }
}

app.get('/api/mongo-health', async (req, res) => {
  try {
    const db = await getMongoDb();
    const ping = await db.command({ ping: 1 });
    const testDoc = {
      message: 'MongoDB health endpoint works from MPCA app',
      updatedAt: new Date(),
      source: 'api/mongo-health',
    };

    await db.collection<any>('connectionTests').updateOne(
      { _id: 'api-health-check' },
      { $set: testDoc, $setOnInsert: { createdAt: new Date() } },
      { upsert: true }
    );

    res.json({
      success: true,
      database: db.databaseName,
      ping,
      sampleDocumentId: 'api-health-check',
    });
  } catch (error: any) {
    console.error('Mongo health check failed:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/api/mongo-test/users', async (req, res) => {
  try {
    const db = await getMongoDb();
    const users = await db.collection('users')
      .find({}, { projection: { password: 0, passwordHash: 0 } })
      .limit(10)
      .toArray();

    res.json({
      success: true,
      count: users.length,
      users,
    });
  } catch (error: any) {
    console.error('Mongo users test failed:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

function normalizeAvatarUrl(url: string) {
  if (!url) return '';
  const driveMatch = url.match(/(?:id=|\/d\/|export=view&id=)([a-zA-Z0-9_-]{25,})/);
  if (driveMatch && driveMatch[1]) {
    return `/api/avatar/${driveMatch[1]}`;
  }
  return url;
}

function userIdCandidates(id: string) {
  const raw = String(id || '').trim();
  const normalized = raw.replace(/^0+/, '') || '0';
  return Array.from(new Set([raw, normalized, normalized.padStart(4, '0')]));
}

function toPaddedId(id: any, width = 4) {
  return (String(id || '').trim().replace(/^0+/, '') || '0').padStart(width, '0');
}

function isTaxComplianceService(serviceId: any) {
  return toPaddedId(serviceId) === '0001';
}

function newRecordId(prefix: string) {
  return `${prefix}_${crypto.randomUUID()}`;
}

function mapMongoUser(user: any) {
  const id = String(user?.userID || user?._id || '');
  return {
    id,
    username: user?.userName || user?.username || '',
    firstName: user?.firstName || '',
    lastName: user?.lastName || '',
    role: user?.role || '',
    team: user?.team || '',
    status: user?.status || '',
    avatarUrl: normalizeAvatarUrl(user?.avatarUrl || ''),
    email: user?.email || ''
  };
}

function mapMongoNotification(notification: any) {
  return {
    id: String(notification?._id || notification?.id || ''),
    userId: notification?.userId || '',
    title: notification?.title || '',
    message: notification?.message || '',
    type: notification?.type || '',
    link: notification?.link || '',
    isRead: Boolean(notification?.isRead),
    createdAt: notification?.createdAt instanceof Date
      ? notification.createdAt.toISOString()
      : notification?.createdAt || ''
  };
}

function mapMongoChatThread(thread: any, unreadCount = 0) {
  return {
    id: String(thread?._id || ''),
    type: thread?.type || (Array.isArray(thread?.participantUserIDs) && thread.participantUserIDs.length > 2 ? 'group' : 'direct'),
    threadTitle: thread?.threadTitle || thread?.title || '',
    participantUserIDs: Array.isArray(thread?.participantUserIDs) ? thread.participantUserIDs.map(String) : [],
    participantKey: thread?.participantKey || '',
    createdByUserID: thread?.createdByUserID || '',
    adminUserIDs: Array.isArray(thread?.adminUserIDs) ? thread.adminUserIDs.map(String) : [],
    lastMessage: thread?.lastMessage || '',
    lastSenderUserID: thread?.lastSenderUserID || '',
    lastMessageAt: thread?.lastMessageAt instanceof Date
      ? thread.lastMessageAt.toISOString()
      : thread?.lastMessageAt || '',
    unreadCount,
    createdAt: thread?.createdAt instanceof Date
      ? thread.createdAt.toISOString()
      : thread?.createdAt || '',
    updatedAt: thread?.updatedAt instanceof Date
      ? thread.updatedAt.toISOString()
      : thread?.updatedAt || ''
  };
}

function mapMongoChatMessage(message: any) {
  return {
    id: String(message?._id || ''),
    threadId: message?.threadId || '',
    senderUserID: message?.senderUserID || '',
    message: message?.message || '',
    readBy: Array.isArray(message?.readBy) ? message.readBy.map(String) : [],
    mentions: Array.isArray(message?.mentions)
      ? message.mentions
          .filter((mention: any) => mention?.type === 'all' || (mention?.type === 'user' && mention?.userID))
          .map((mention: any) => mention?.type === 'all'
            ? { type: 'all', label: mention?.label || 'All' }
            : { type: 'user', userID: String(mention.userID), name: String(mention.name || '') }
          )
      : [],
    reactions: Array.isArray(message?.reactions)
      ? message.reactions
          .filter((reaction: any) => reaction?.userId && reaction?.reaction)
          .map((reaction: any) => ({
            userId: String(reaction.userId),
            reaction: String(reaction.reaction),
            reactedAt: reaction?.reactedAt instanceof Date
              ? reaction.reactedAt.toISOString()
              : reaction?.reactedAt || ''
          }))
      : [],
    createdAt: message?.createdAt instanceof Date
      ? message.createdAt.toISOString()
      : message?.createdAt || ''
  };
}

async function getRequestUser(req: any) {
  const userId = req.cookies?.user_id;
  if (!userId) return null;
  const db = await getMongoDb();
  const ids = userIdCandidates(userId);
  return db.collection('users').findOne(
    { $or: [{ _id: { $in: ids } }, { userID: { $in: ids } }] } as any,
    { projection: { password: 0, passwordHash: 0 } }
  );
}

function canDeleteEngagement(user: any) {
  return ['Admin', 'Manager', 'Supervisor'].includes(String(user?.role || ''));
}

function isElevatedDeleteRole(user: any) {
  return ['Admin', 'Manager', 'Supervisor'].includes(String(user?.role || ''));
}

function isMeetingDeleteRole(user: any) {
  return ['Admin', 'Manager', 'Supervisor', 'Senior'].includes(String(user?.role || ''));
}

function userMatchesId(user: any, id: any) {
  const targetIds = new Set(userIdCandidates(String(id || '')).map(candidate => candidate.toLowerCase()));
  return [user?._id, user?.userID].some(value => targetIds.has(String(value || '').trim().toLowerCase()));
}

async function getUserByAnyId(db: any, id: any) {
  const ids = userIdCandidates(String(id || ''));
  return db.collection('users').findOne(
    { $or: [{ _id: { $in: ids } }, { userID: { $in: ids } }] } as any,
    { projection: { password: 0, passwordHash: 0 } }
  );
}

async function canDeleteAssignedUserRecord(db: any, requestUser: any, assignedUserId: any) {
  if (!requestUser || !assignedUserId) return false;
  if (isElevatedDeleteRole(requestUser)) return true;
  if (userMatchesId(requestUser, assignedUserId)) return true;

  if (String(requestUser.role || '') !== 'Senior') return false;

  const assignedUser = await getUserByAnyId(db, assignedUserId);
  return Boolean(
    assignedUser &&
    String(assignedUser.role || '') === 'Staff' &&
    String(assignedUser.team || '') &&
    String(assignedUser.team || '') === String(requestUser.team || '')
  );
}

async function canDeleteAnyAssignedUserRecord(db: any, requestUser: any, assignedUserIds: any[]) {
  const uniqueIds = Array.from(new Set((assignedUserIds || []).flatMap(id => String(id || '').split(',').map(part => part.trim())).filter(Boolean)));
  for (const assignedUserId of uniqueIds) {
    if (await canDeleteAssignedUserRecord(db, requestUser, assignedUserId)) return true;
  }
  return false;
}

async function getTaskAssignedStaffIds(db: any, taskId: any) {
  const ids = userIdCandidates(String(taskId || ''));
  const task = await db.collection('taskLogs').findOne(
    { $or: [{ _id: { $in: ids } }, { taskID: { $in: ids } }] },
    { projection: { specialID: 1 } }
  );
  if (!task?.specialID) return [];

  const specialIds = userIdCandidates(String(task.specialID));
  const special = await db.collection('specialEngagements').findOne(
    { $or: [{ _id: { $in: specialIds } }, { specialID: { $in: specialIds } }] },
    { projection: { assignedStaffID: 1 } }
  );
  return special?.assignedStaffID ? [special.assignedStaffID] : [];
}

async function canDeleteTask(db: any, requestUser: any, taskId: any) {
  return canDeleteAnyAssignedUserRecord(db, requestUser, await getTaskAssignedStaffIds(db, taskId));
}

async function canDeleteActivity(db: any, requestUser: any, activityId: any) {
  const ids = userIdCandidates(String(activityId || ''));
  const activity = await db.collection('activityLogs').findOne(
    { $or: [{ _id: { $in: ids } }, { activityID: { $in: ids } }] },
    { projection: { taskID: 1 } }
  );
  if (!activity?.taskID) return false;
  return canDeleteTask(db, requestUser, activity.taskID);
}

async function canDeleteCredential(db: any, requestUser: any, credentialId: any) {
  if (!requestUser) return false;
  if (isElevatedDeleteRole(requestUser)) return true;

  const ids = userIdCandidates(String(credentialId || ''));
  const credential = await db.collection('credentials').findOne(
    { $or: [{ _id: { $in: ids } }, { credentialID: { $in: ids } }] },
    { projection: { clientID: 1 } }
  );
  if (!credential?.clientID) return false;

  const clientIds = userIdCandidates(String(credential.clientID));
  const [retainers, specials] = await Promise.all([
    db.collection('retainerEngagements')
      .find({ clientID: { $in: clientIds } }, { projection: { assignedStaffID: 1 } })
      .toArray(),
    db.collection('specialEngagements')
      .find({ clientID: { $in: clientIds } }, { projection: { assignedStaffID: 1 } })
      .toArray()
  ]);

  return canDeleteAnyAssignedUserRecord(
    db,
    requestUser,
    [...retainers, ...specials].map(record => record.assignedStaffID)
  );
}

function canDeleteTransmittalRecord(requestUser: any, transmittal: any) {
  if (!requestUser || !transmittal) return false;
  return isElevatedDeleteRole(requestUser) || userMatchesId(requestUser, transmittal.userID);
}

function canDeleteMeetingRecord(requestUser: any) {
  return isMeetingDeleteRole(requestUser);
}

function mapMongoTask(task: any) {
  return {
    taskID: String(task?.taskID || task?._id || ''),
    specialID: task?.specialID || '',
    taskName: task?.taskName || '',
    status: task?.status || 'Pending'
  };
}

function mapMongoActivity(activity: any) {
  return {
    activityID: String(activity?.activityID || activity?._id || ''),
    taskID: activity?.taskID || '',
    dateCompleted: activity?.dateCompleted || '',
    description: activity?.description || ''
  };
}

function mapMongoClient(client: any) {
  return {
    id: String(client?.clientID || client?._id || ''),
    name: client?.clientName || '',
    tin: client?.tin || '',
    entityType: client?.entityType || '',
    email: client?.email || '',
    contactPerson: client?.contactPerson || '',
    status: client?.status || 'Active',
    fiscalYearEnd: client?.fiscalYearEnd || ''
  };
}

function mapMongoRetainer(retainer: any) {
  return {
    id: String(retainer?.retainerID || retainer?._id || ''),
    clientId: retainer?.clientID || '',
    serviceType: retainer?.serviceID || '',
    startDate: retainer?.startDate || '',
    engagementStatus: retainer?.status || 'Active',
    assignedStaff: retainer?.assignedStaffID || ''
  };
}

function mapMongoSpecial(special: any) {
  return [
    String(special?.specialID || special?._id || ''),
    special?.clientID || '',
    special?.assignedStaffID || '',
    special?.serviceID || '',
    special?.projectTitle || '',
    special?.startDate || '',
    special?.endDate || '',
    special?.status || 'Planning',
    special?.description || ''
  ];
}

function mapMongoService(service: any) {
  return {
    id: String(service?.serviceID || service?._id || ''),
    name: service?.serviceName || '',
    type: service?.type || ''
  };
}

function mapMongoTaxCompliance(tax: any) {
  return {
    taxID: String(tax?.taxID || tax?._id || ''),
    complianceName: tax?.complianceName || '',
    complianceCode: tax?.complianceCode || '',
    frequency: tax?.frequency || ''
  };
}

function mapMongoDeadline(deadline: any) {
  return {
    deadlineID: String(deadline?.deadlineID || deadline?._id || ''),
    retainerID: deadline?.retainerID || '',
    serviceID: deadline?.serviceID || '',
    taxID: deadline?.taxID || '',
    dueDate: deadline?.dueDate || '',
    status: deadline?.status || 'Active'
  };
}

function mapMongoRetainerLog(log: any) {
  return [
    log?.deadlineID || '',
    log?.period || '',
    log?.dateCompleted || '',
    log?.remarks || ''
  ];
}

function mapMongoAuditLog(log: any) {
  return {
    id: String(log?._id || ''),
    entityType: log?.entityType || '',
    entityId: log?.entityId || '',
    relatedEntityType: log?.relatedEntityType || '',
    relatedEntityId: log?.relatedEntityId || '',
    period: log?.period || '',
    action: log?.action || '',
    actionLabel: log?.actionLabel || '',
    summary: log?.summary || '',
    userId: log?.userId || '',
    userName: log?.userName || 'System',
    userRole: log?.userRole || '',
    details: log?.details || {},
    createdAt: log?.createdAt instanceof Date ? log.createdAt.toISOString() : log?.createdAt || ''
  };
}

async function writeAuditLog(db: any, req: any, data: any) {
  const requestUser = await getRequestUser(req);
  const userName = requestUser
    ? `${requestUser.firstName || ''} ${requestUser.lastName || ''}`.trim() || requestUser.userName || 'Unknown User'
    : 'System';

  await db.collection('auditLogs').insertOne({
    _id: crypto.randomUUID(),
    userId: requestUser?.userID || requestUser?._id || '',
    userName,
    userRole: requestUser?.role || '',
    createdAt: new Date(),
    ...data,
  });
}

async function getServiceAuditName(db: any, serviceId: any) {
  const ids = userIdCandidates(serviceId);
  const service = await db.collection('services').findOne({
    $or: [{ _id: { $in: ids } }, { serviceID: { $in: ids } }]
  });
  return service?.serviceName || service?.name || service?.type || String(serviceId || 'service');
}

async function getDeadlineAuditContext(db: any, deadlineId: any) {
  const ids = userIdCandidates(deadlineId);
  const deadline = await db.collection('deadlines').findOne({
    $or: [{ _id: { $in: ids } }, { deadlineID: { $in: ids } }]
  });
  const retainerIds = userIdCandidates(deadline?.retainerID || '');
  const retainer = deadline?.retainerID
    ? await db.collection('retainerEngagements').findOne({
      $or: [{ _id: { $in: retainerIds } }, { retainerID: { $in: retainerIds } }]
    })
    : null;
  return {
    clientID: String(retainer?.clientID || ''),
    retainerID: String(deadline?.retainerID || ''),
    deadlineID: String(deadline?.deadlineID || deadline?._id || deadlineId || ''),
    serviceID: String(deadline?.serviceID || retainer?.serviceID || ''),
    taxID: String(deadline?.taxID || ''),
    assignedStaffID: String(retainer?.assignedStaffID || '')
  };
}

async function getSpecialAuditContext(db: any, specialId: any) {
  const ids = userIdCandidates(specialId);
  const special = await db.collection('specialEngagements').findOne({
    $or: [{ _id: { $in: ids } }, { specialID: { $in: ids } }]
  });
  return {
    clientID: String(special?.clientID || ''),
    specialID: String(special?.specialID || special?._id || specialId || ''),
    serviceID: String(special?.serviceID || ''),
    assignedStaffID: String(special?.assignedStaffID || '')
  };
}

function mapMongoCredential(credential: any) {
  return {
    credentialID: String(credential?.credentialID || credential?._id || ''),
    clientID: credential?.clientID || '',
    systemName: credential?.systemName || '',
    username: credential?.username || '',
    password: credential?.password || '',
    securityAnswer: credential?.securityAnswer || '',
    remarks: credential?.remarks || ''
  };
}

function mapMongoTransmittal(transmittal: any) {
  return {
    transmittalID: String(transmittal?.transmittalID || transmittal?._id || ''),
    clientID: transmittal?.clientID || '',
    userID: transmittal?.userID || '',
    items: transmittal?.items || '',
    date: transmittal?.date || '',
    receiptUrl: transmittal?.receiptUrl || '',
    receiverName: transmittal?.receiverName || '',
    receiverAddress: transmittal?.receiverAddress || ''
  };
}

function mapMongoMeeting(meeting: any) {
  return {
    meetingID: String(meeting?.meetingID || meeting?._id || ''),
    date: meeting?.date || '',
    subject: meeting?.subject || '',
    userIDs: meeting?.userIDs || '',
    momUrl: meeting?.momUrl || ''
  };
}

async function getNextTransmittalId(collection: any, dateValue: string) {
  const transmittalDate = new Date(dateValue);
  const month = String(transmittalDate.getMonth() + 1).padStart(2, '0');
  const year = String(transmittalDate.getFullYear()).slice(-2);
  const prefix = `${month}${year}-TS`;
  const rows = await collection.find({ transmittalID: { $regex: `^${prefix}` } }, { projection: { transmittalID: 1 } }).toArray();
  const maxNum = rows.reduce((max: number, row: any) => {
    const parts = String(row?.transmittalID || '').split('-TS');
    const num = parts.length > 1 ? parseInt(parts[1], 10) : 0;
    return Number.isNaN(num) ? max : Math.max(max, num);
  }, 0);

  return `${prefix}${String(maxNum + 1).padStart(4, '0')}`;
}

let mongoIndexPromise: Promise<void> | null = null;
async function ensureMongoIndexes() {
  if (!mongoIndexPromise) {
    mongoIndexPromise = getMongoDb().then(async db => {
      const createIndex = async (collectionName: string, keys: any) => {
        try {
          const collection = db.collection(collectionName);
          const existingIndexes = await collection.indexes();
          const hasSameKey = existingIndexes.some((index: any) => JSON.stringify(index.key) === JSON.stringify(keys));
          if (hasSameKey) return;

          await collection.createIndex(keys);
        } catch (error: any) {
          if (
            error?.codeName === 'IndexOptionsConflict' ||
            error?.codeName === 'IndexKeySpecsConflict' ||
            error?.code === 85 ||
            String(error?.message || '').includes('An existing index has the same name')
          ) {
            console.warn(`[Mongo] Reusing existing index for ${collectionName}:`, JSON.stringify(keys));
            return;
          }
          throw error;
        }
      };

      await Promise.all([
        createIndex('users', { userID: 1 }),
        createIndex('users', { userName: 1 }),
        createIndex('clients', { clientID: 1 }),
        createIndex('retainerEngagements', { retainerID: 1 }),
        createIndex('retainerEngagements', { clientID: 1 }),
        createIndex('specialEngagements', { specialID: 1 }),
        createIndex('specialEngagements', { clientID: 1 }),
        createIndex('deadlines', { deadlineID: 1 }),
        createIndex('deadlines', { retainerID: 1 }),
        createIndex('retainerLogs', { deadlineID: 1, period: 1 }),
        createIndex('taskLogs', { taskID: 1 }),
        createIndex('taskLogs', { specialID: 1 }),
        createIndex('activityLogs', { activityID: 1 }),
        createIndex('activityLogs', { taskID: 1 }),
        createIndex('credentials', { clientID: 1 }),
        createIndex('transmittals', { clientID: 1 }),
        createIndex('meetings', { date: -1 }),
        createIndex('notifications', { userId: 1, createdAt: -1 }),
        createIndex('chatThreads', { participantUserIDs: 1, lastMessageAt: -1 }),
        createIndex('chatThreads', { participantKey: 1 }),
        createIndex('chatMessages', { threadId: 1, createdAt: -1 }),
        createIndex('auditLogs', { entityType: 1, entityId: 1, period: 1, createdAt: -1 }),
      ]);
    }).catch(error => {
      mongoIndexPromise = null;
      throw error;
    });
  }

  return mongoIndexPromise;
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
    const db = await getMongoDb();
    const requestUser = await getRequestUser(req);
    const [transmittal, meeting] = await Promise.all([
      db.collection<any>('transmittals').findOne({ receiptUrl: fileId }, { projection: { userID: 1 } }),
      db.collection<any>('meetings').findOne({ momUrl: fileId }, { projection: { userIDs: 1 } })
    ]);

    if (transmittal && !canDeleteTransmittalRecord(requestUser, transmittal)) {
      return res.status(403).json({ error: 'You do not have permission to delete this transmittal file' });
    }

    if (meeting && !canDeleteMeetingRecord(requestUser)) {
      return res.status(403).json({ error: 'Only Admin, Manager, Supervisor, or Senior can delete meeting files' });
    }

    if (!transmittal && !meeting) {
      return res.status(403).json({ error: 'File is not linked to a deletable record' });
    }

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
  const { username, userName, firstName, lastName, email, avatarUrl, role, team, status, password } = req.body;
  
  try {
    const db = await getMongoDb();
    const ids = userIdCandidates(id);
    const existingSpecial = await db.collection<any>('specialEngagements').findOne({
      $or: [{ _id: { $in: ids } }, { specialID: { $in: ids } }]
    });
    const updates: any = { updatedAt: new Date() };
    const nextUserName = userName ?? username;

    if (nextUserName !== undefined) {
      const existing = await db.collection<any>('users').findOne({
        userName: nextUserName,
        $nor: [{ _id: { $in: ids } }, { userID: { $in: ids } }]
      });
      if (existing) return res.status(400).json({ error: 'Username already exists' });
      updates.userName = nextUserName;
    }
    if (firstName !== undefined) updates.firstName = firstName;
    if (lastName !== undefined) updates.lastName = lastName;
    if (avatarUrl !== undefined) updates.avatarUrl = avatarUrl;
    if (email !== undefined) updates.email = email;
    if (role !== undefined) updates.role = role;
    if (team !== undefined) updates.team = team;
    if (status !== undefined) updates.status = status;
    if (password) updates.passwordHash = await bcrypt.hash(password, 10);

    const result = await db.collection<any>('users').findOneAndUpdate(
      { $or: [{ _id: { $in: ids } }, { userID: { $in: ids } }] },
      { $set: updates },
      { returnDocument: 'after' }
    );

    if (!result) return res.status(404).json({ error: 'User not found' });

    res.json({ 
      success: true, 
      user: mapMongoUser(result)
    });
  } catch (error: any) {
    console.error('[API] Error updating user:', error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/users', async (req, res) => {
  const { username, userName, password, firstName, lastName, role, team, status, avatarUrl, email } = req.body;
  const nextUserName = String(userName ?? username ?? '').trim();

  if (!nextUserName || !password || !firstName || !lastName || !role) {
    return res.status(400).json({ error: 'Username, password, first name, last name, and role are required' });
  }

  try {
    const db = await getMongoDb();
    const usersCollection = db.collection<any>('users');
    const existing = await usersCollection.findOne({ userName: nextUserName });
    if (existing) return res.status(400).json({ error: 'Username already exists' });

    const userID = newRecordId('usr');
    const passwordHash = await bcrypt.hash(password, 10);
    const now = new Date();
    const doc = {
      _id: userID,
      userID,
      userName: nextUserName,
      passwordHash,
      firstName,
      lastName,
      role,
      team: team || '',
      status: status || 'Active',
      avatarUrl: avatarUrl || '',
      email: email || '',
      createdAt: now,
      updatedAt: now
    };

    await usersCollection.insertOne(doc);
    res.status(201).json({ success: true, user: mapMongoUser(doc) });
  } catch (error: any) {
    console.error('[API] Error creating user:', error);
    res.status(500).json({ error: error.message });
  }
});

app.put('/api/users/:id/password', async (req, res) => {
  const { id } = req.params;
  const { currentPassword, newPassword } = req.body;
  try {
    const db = await getMongoDb();
    const ids = userIdCandidates(id);
    const user = await db.collection<any>('users').findOne({ $or: [{ _id: { $in: ids } }, { userID: { $in: ids } }] });
    if (!user) return res.status(404).json({ error: 'User not found' });

    const isMatch = !!user.passwordHash && await bcrypt.compare(currentPassword, user.passwordHash);
    if (!isMatch) {
      return res.status(400).json({ error: 'Incorrect current password' });
    }

    const passwordHash = await bcrypt.hash(newPassword, 10);
    await db.collection<any>('users').updateOne({
      $or: [{ _id: { $in: ids } }, { userID: { $in: ids } }]
    }, {
      $set: { passwordHash, updatedAt: new Date() }
    });

    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/login', async (req, res) => {
  const { username, password } = req.body;
  
  try {
    try {
      const db = await getMongoDb();
      const mongoUser = await db.collection<any>('users').findOne({ userName: username });

      if (mongoUser?.passwordHash) {
        const isMatch = await bcrypt.compare(password, mongoUser.passwordHash);

        if (isMatch) {
          const userId = mongoUser.userID || mongoUser._id;
          res.cookie('user_id', userId, { httpOnly: true, secure: true, sameSite: 'none' });
          return res.json(mapMongoUser(mongoUser));
        }
      }
    } catch (mongoError: any) {
      console.warn('Mongo login unavailable, falling back to Google Sheets:', mongoError.message);
    }

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
    const startedAt = Date.now();

    const db = await getMongoDb();

    const [
      users,
      clients,
      retainers,
      specials,
      services,
      taxCompliances,
      deadlines,
      retainerLogs,
      recentActivityDocs,
      credentials,
      transmittals,
      meetings
    ] = await Promise.all([
      db.collection<any>('users')
        .find({}, { projection: { password: 0, passwordHash: 0 } })
        .sort({ _id: 1 })
        .toArray()
        .then(rows => rows.map(mapMongoUser)),
      db.collection<any>('clients')
        .find({}, { projection: { clientID: 1, clientName: 1, tin: 1, entityType: 1, email: 1, contactPerson: 1, status: 1, fiscalYearEnd: 1 } })
        .sort({ clientID: 1 })
        .toArray()
        .then(rows => rows.map(mapMongoClient)),
      db.collection<any>('retainerEngagements')
        .find({}, { projection: { retainerID: 1, clientID: 1, serviceID: 1, startDate: 1, status: 1, assignedStaffID: 1 } })
        .sort({ retainerID: 1 })
        .toArray()
        .then(rows => rows.map(mapMongoRetainer)),
      db.collection<any>('specialEngagements')
        .find({}, { projection: { specialID: 1, clientID: 1, assignedStaffID: 1, serviceID: 1, projectTitle: 1, startDate: 1, endDate: 1, status: 1, description: 1 } })
        .sort({ specialID: 1 })
        .toArray()
        .then(rows => rows.map(mapMongoSpecial)),
      db.collection<any>('services')
        .find({}, { projection: { serviceID: 1, serviceName: 1, type: 1 } })
        .sort({ serviceID: 1 })
        .toArray()
        .then(rows => rows.map(mapMongoService)),
      db.collection<any>('taxCompliances')
        .find({}, { projection: { taxID: 1, complianceName: 1, complianceCode: 1, frequency: 1 } })
        .sort({ taxID: 1 })
        .toArray()
        .then(rows => rows.map(mapMongoTaxCompliance)),
      db.collection<any>('deadlines')
        .find({ $or: [{ status: 'Active' }, { status: { $exists: false } }] }, { projection: { deadlineID: 1, retainerID: 1, serviceID: 1, taxID: 1, dueDate: 1, status: 1 } })
        .sort({ deadlineID: 1 })
        .toArray()
        .then(rows => rows.map(mapMongoDeadline)),
      db.collection<any>('retainerLogs')
        .find({}, { projection: { deadlineID: 1, period: 1, dateCompleted: 1, remarks: 1 } })
        .sort({ deadlineID: 1, period: 1 })
        .toArray()
        .then(rows => rows.map(mapMongoRetainerLog)),
      db.collection<any>('activityLogs')
        .find({}, { projection: { activityID: 1, taskID: 1, dateCompleted: 1, description: 1 } })
        .sort({ activityID: -1 })
        .limit(50)
        .toArray(),
      db.collection<any>('credentials')
        .find({}, { projection: { credentialID: 1, clientID: 1, systemName: 1, username: 1, password: 1, securityAnswer: 1, remarks: 1 } })
        .sort({ credentialID: 1 })
        .toArray()
        .then(rows => rows.map(mapMongoCredential)),
      db.collection<any>('transmittals')
        .find({}, { projection: { transmittalID: 1, clientID: 1, userID: 1, items: 1, date: 1, receiptUrl: 1, receiverName: 1, receiverAddress: 1 } })
        .sort({ date: -1, transmittalID: -1 })
        .toArray()
        .then(rows => rows.map(mapMongoTransmittal)),
      db.collection<any>('meetings')
        .find({}, { projection: { meetingID: 1, date: 1, subject: 1, userIDs: 1, momUrl: 1 } })
        .sort({ date: -1, meetingID: -1 })
        .toArray()
        .then(rows => rows.map(mapMongoMeeting))
    ]);

    const recentTaskIds = Array.from(new Set(recentActivityDocs.map(activity => activity.taskID).filter(Boolean)));
    const recentTaskDocs = recentTaskIds.length > 0
      ? await db.collection<any>('taskLogs')
        .find({ taskID: { $in: recentTaskIds } }, { projection: { taskID: 1, specialID: 1, taskName: 1, status: 1 } })
        .toArray()
      : [];
    const taskLog = recentTaskDocs.map(mapMongoTask);
    const activityLog = recentActivityDocs.map(mapMongoActivity);

    res.json({
      retainers,
      specials,
      taxCompliances,
      deadlines,
      users,
      clients,
      services,
      retainerLogs,
      taskLog,
      activityLog,
      credentials,
      transmittals,
      meetings,
      notifications: [],
      deliverables: []
    });
    console.log(`[API /api/data] Loaded in ${Date.now() - startedAt}ms`);
  } catch (error: any) {
    console.error('API /api/data error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// --- Notifications Endpoints ---
app.get('/api/notifications', async (req, res) => {
  try {
    const userId = String(req.query.userId || '').trim();
    const limit = Math.min(Math.max(parseInt(String(req.query.limit || '50'), 10) || 50, 1), 100);

    if (!userId) return res.status(400).json({ error: 'userId is required' });

    const db = await getMongoDb();
    const notifications = await db.collection<any>('notifications')
      .find(
        { userId },
        { projection: { userId: 1, title: 1, message: 1, type: 1, link: 1, isRead: 1, createdAt: 1 } }
      )
      .sort({ createdAt: -1 })
      .limit(limit)
      .toArray()
      .then(rows => rows.map(mapMongoNotification));

    res.json(notifications);
  } catch (error: any) {
    console.error('API GET /api/notifications error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/notifications', async (req, res) => {
  try {
    const data = req.body;
    const id = crypto.randomUUID();
    const createdAt = new Date();
    const db = await getMongoDb();

    await db.collection<any>('notifications').insertOne({
      _id: id,
      userId: data.userId || '',
      title: data.title || '',
      message: data.message || '',
      type: data.type || '',
      link: data.link || '',
      isRead: false,
      createdAt,
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
    const db = await getMongoDb();

    await db.collection<any>('notifications').updateOne(
      { _id: id },
      { $set: { isRead: true, readAt: new Date() } }
    );

    res.json({ success: true });
  } catch (error: any) {
    console.error('API /api/notifications/read error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/notifications/read-all', async (req, res) => {
  try {
    const { userId } = req.body;
    const db = await getMongoDb();
    const result = await db.collection<any>('notifications').updateMany(
      { userId, isRead: { $ne: true } },
      { $set: { isRead: true, readAt: new Date() } }
    );

    res.json({ success: true, modifiedCount: result.modifiedCount });
  } catch (error: any) {
    console.error('API /api/notifications/read-all error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/ably-token', async (req, res) => {
  try {
    const requestUser = await getRequestUser(req);
    if (!requestUser) return res.status(401).json({ error: 'Unauthorized' });

    const ably = getAblyRestClient();
    if (!ably) return res.status(503).json({ error: 'Ably is not configured' });

    const clientId = String((requestUser as any).userID || (requestUser as any)._id || '');
    const tokenRequest = await ably.auth.createTokenRequest({
      clientId,
      capability: JSON.stringify({
        'mpca:chat': ['subscribe', 'presence'],
      }),
    });

    res.json(tokenRequest);
  } catch (error: any) {
    console.error('API GET /api/ably-token error:', error);
    res.status(500).json({ error: error.message });
  }
});

// --- Chat Message Endpoints ---
app.get('/api/chat/threads', async (req, res) => {
  try {
    const userId = String(req.query.userId || '').trim();
    const limit = Math.min(Math.max(parseInt(String(req.query.limit || '30'), 10) || 30, 1), 50);
    if (!userId) return res.status(400).json({ error: 'userId is required' });

    const db = await getMongoDb();
    const threads = await db.collection<any>('chatThreads')
      .find({ participantUserIDs: userId })
      .sort({ lastMessageAt: -1, updatedAt: -1 })
      .limit(limit)
      .toArray();

    const threadIds = threads.map((thread: any) => thread._id);
    const unreadRows = threadIds.length > 0
      ? await db.collection<any>('chatMessages').aggregate([
          {
            $match: {
              threadId: { $in: threadIds },
              senderUserID: { $ne: userId },
              readBy: { $ne: userId }
            }
          },
          { $group: { _id: '$threadId', count: { $sum: 1 } } }
        ]).toArray()
      : [];
    const unreadByThread = new Map(unreadRows.map((row: any) => [String(row._id), row.count]));

    res.json(threads.map((thread: any) => mapMongoChatThread(thread, unreadByThread.get(String(thread._id)) || 0)));
  } catch (error: any) {
    console.error('API GET /api/chat/threads error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/chat/messages', async (req, res) => {
  try {
    const threadId = String(req.query.threadId || '').trim();
    const userId = String(req.query.userId || '').trim();
    const limit = Math.min(Math.max(parseInt(String(req.query.limit || '5'), 10) || 5, 1), 25);
    const before = String(req.query.before || '').trim();
    if (!threadId || !userId) return res.status(400).json({ error: 'threadId and userId are required' });

    const db = await getMongoDb();
    const thread = await db.collection<any>('chatThreads').findOne({ _id: threadId, participantUserIDs: userId });
    if (!thread) return res.status(404).json({ error: 'Chat thread not found' });

    const query: any = { threadId };
    if (before) {
      const beforeDate = new Date(before);
      if (!isNaN(beforeDate.getTime())) query.createdAt = { $lt: beforeDate };
    }

    const rows = await db.collection<any>('chatMessages')
      .find(query)
      .sort({ createdAt: -1 })
      .limit(limit)
      .toArray();

    res.json(rows.reverse().map(mapMongoChatMessage));
  } catch (error: any) {
    console.error('API GET /api/chat/messages error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/chat/messages', async (req, res) => {
  try {
    const threadId = String(req.body?.threadId || '').trim();
    const senderUserID = String(req.body?.senderUserID || '').trim();
    const message = String(req.body?.message || '').trim();
    const requestedType = String(req.body?.type || '').trim() === 'group' ? 'group' : 'direct';
    const threadTitle = String(req.body?.threadTitle || req.body?.title || '').trim();
    const recipientUserIDs = Array.isArray(req.body?.recipientUserIDs)
      ? req.body.recipientUserIDs.map((id: any) => String(id || '').trim()).filter(Boolean)
      : [];

    if (!senderUserID || !message || (!threadId && recipientUserIDs.length === 0)) {
      return res.status(400).json({ error: 'senderUserID, recipientUserIDs, and message are required' });
    }

    const db = await getMongoDb();
    const now = new Date();
    let thread = threadId
      ? await db.collection<any>('chatThreads').findOne({ _id: threadId, participantUserIDs: senderUserID })
      : null;

    if (threadId && !thread) return res.status(404).json({ error: 'Chat thread not found' });

    const participants = thread
      ? (Array.isArray(thread.participantUserIDs) ? thread.participantUserIDs.map(String) : [])
      : Array.from(new Set([senderUserID, ...recipientUserIDs])).sort();

    const threadType = thread
      ? (thread.type || (participants.length > 2 ? 'group' : 'direct'))
      : (requestedType === 'group' || participants.length > 2 ? 'group' : 'direct');

    if (!thread && threadType === 'group' && participants.length < 3) {
      return res.status(400).json({ error: 'Group chat needs at least two recipients' });
    }

    if (!thread && threadType === 'direct') {
      const participantKey = `direct:${participants.join('|')}`;
      thread = await db.collection<any>('chatThreads').findOne({ participantKey: { $in: [participantKey, participants.join('|')] } });
    }

    if (!thread) {
      const newThreadId = crypto.randomUUID();
      thread = {
        _id: newThreadId,
        type: threadType,
        threadTitle: threadType === 'group' ? threadTitle : '',
        participantUserIDs: participants,
        participantKey: threadType === 'direct' ? `direct:${participants.join('|')}` : `group:${newThreadId}`,
        createdByUserID: senderUserID,
        adminUserIDs: threadType === 'group' ? [senderUserID] : [],
        lastMessage: '',
        lastSenderUserID: '',
        lastMessageAt: now,
        createdAt: now,
        updatedAt: now,
      };
      await db.collection<any>('chatThreads').insertOne(thread);
    }

    const mentionText = message.toLowerCase();
    const mentions = Array.isArray(req.body?.mentions)
      ? req.body.mentions
          .map((mention: any) => {
            const type = String(mention?.type || '').trim();
            if (type === 'all') {
              return threadType === 'group' && mentionText.includes('@all')
                ? { type: 'all', label: 'All' }
                : null;
            }
            if (type === 'user') {
              const userID = String(mention?.userID || '').trim();
              const name = String(mention?.name || '').trim();
              if (!userID || !participants.includes(userID) || !name) return null;
              return mentionText.includes(`@${name.toLowerCase()}`) ? { type: 'user', userID, name } : null;
            }
            return null;
          })
          .filter(Boolean)
          .filter((mention: any, index: number, list: any[]) => {
            const key = mention.type === 'all' ? 'all' : `user:${mention.userID}`;
            return list.findIndex((item: any) => (item.type === 'all' ? 'all' : `user:${item.userID}`) === key) === index;
          })
      : [];

    const messageId = crypto.randomUUID();
    const messageDoc = {
      _id: messageId,
      threadId: thread._id,
      senderUserID,
      message,
      mentions,
      readBy: [senderUserID],
      reactions: [],
      createdAt: now,
    };

    await db.collection<any>('chatMessages').insertOne(messageDoc);
    await db.collection<any>('chatThreads').updateOne(
      { _id: thread._id },
      {
        $set: {
          lastMessage: message,
          lastSenderUserID: senderUserID,
          lastMessageAt: now,
          updatedAt: now,
        }
      }
    );

    await publishChatEvent('chat.message.created', {
      threadId: thread._id,
      senderUserID,
      participantUserIDs: participants,
      messageId,
    });

    res.json({ success: true, threadId: thread._id, message: mapMongoChatMessage(messageDoc) });
  } catch (error: any) {
    console.error('API POST /api/chat/messages error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/chat/reactions', async (req, res) => {
  try {
    const messageId = String(req.body?.messageId || '').trim();
    const userId = String(req.body?.userId || '').trim();
    const reaction = String(req.body?.reaction || '').trim();
    const allowedReactions = new Set(['👍', '❤️', '😂', '😮', '😢', '🙏']);

    if (!messageId || !userId) return res.status(400).json({ error: 'messageId and userId are required' });
    if (reaction && !allowedReactions.has(reaction)) return res.status(400).json({ error: 'Invalid reaction' });

    const db = await getMongoDb();
    const message = await db.collection<any>('chatMessages').findOne({ _id: messageId });
    if (!message) return res.status(404).json({ error: 'Chat message not found' });

    const thread = await db.collection<any>('chatThreads').findOne({ _id: message.threadId, participantUserIDs: userId });
    if (!thread) return res.status(404).json({ error: 'Chat thread not found' });

    await db.collection<any>('chatMessages').updateOne(
      { _id: messageId },
      { $pull: { reactions: { userId } } } as any
    );

    if (reaction) {
      await db.collection<any>('chatMessages').updateOne(
        { _id: messageId },
        { $push: { reactions: { userId, reaction, reactedAt: new Date() } } } as any
      );
    }

    const updatedMessage = await db.collection<any>('chatMessages').findOne({ _id: messageId });
    const mappedMessage = mapMongoChatMessage(updatedMessage);
    await publishChatEvent('chat.message.reacted', {
      threadId: mappedMessage.threadId,
      messageId,
      userId,
      reaction,
      message: mappedMessage,
      participantUserIDs: Array.isArray(thread.participantUserIDs) ? thread.participantUserIDs.map(String) : [],
    });

    res.json({ success: true, message: mappedMessage });
  } catch (error: any) {
    console.error('API POST /api/chat/reactions error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/chat/read', async (req, res) => {
  try {
    const threadId = String(req.body?.threadId || '').trim();
    const userId = String(req.body?.userId || '').trim();
    if (!threadId || !userId) return res.status(400).json({ error: 'threadId and userId are required' });

    const db = await getMongoDb();
    const result = await db.collection<any>('chatMessages').updateMany(
      { threadId, senderUserID: { $ne: userId }, readBy: { $ne: userId } },
      { $addToSet: { readBy: userId } }
    );

    if (result.modifiedCount > 0) {
      const thread = await db.collection<any>('chatThreads').findOne({ _id: threadId });
      await publishChatEvent('chat.thread.read', {
        threadId,
        readerUserID: userId,
        participantUserIDs: Array.isArray(thread?.participantUserIDs) ? thread.participantUserIDs.map(String) : [],
      });
    }

    res.json({ success: true, modifiedCount: result.modifiedCount });
  } catch (error: any) {
    console.error('API POST /api/chat/read error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.put('/api/chat/thread-settings', async (req, res) => {
  try {
    const threadId = String(req.body?.threadId || '').trim();
    const userId = String(req.body?.userId || '').trim();
    const threadTitle = String(req.body?.threadTitle || '').trim();
    const participantUserIDs = Array.isArray(req.body?.participantUserIDs)
      ? req.body.participantUserIDs.map((id: any) => String(id || '').trim()).filter(Boolean)
      : [];
    const adminUserIDs = Array.isArray(req.body?.adminUserIDs)
      ? req.body.adminUserIDs.map((id: any) => String(id || '').trim()).filter(Boolean)
      : [];

    if (!threadId || !userId) return res.status(400).json({ error: 'threadId and userId are required' });

    const db = await getMongoDb();
    const thread = await db.collection<any>('chatThreads').findOne({ _id: threadId, participantUserIDs: userId });
    if (!thread) return res.status(404).json({ error: 'Chat thread not found' });

    const threadType = thread.type || (Array.isArray(thread.participantUserIDs) && thread.participantUserIDs.length > 2 ? 'group' : 'direct');
    if (threadType !== 'group') return res.status(400).json({ error: 'Only group chats can be updated' });

    const existingParticipants = Array.isArray(thread.participantUserIDs) ? thread.participantUserIDs.map(String) : [];
    const existingAdmins = Array.isArray(thread.adminUserIDs) && thread.adminUserIDs.length > 0
      ? thread.adminUserIDs.map(String)
      : [String(thread.createdByUserID || existingParticipants[0] || userId)];

    if (!existingAdmins.includes(userId)) return res.status(403).json({ error: 'Only group admins can update this chat' });

    const nextParticipants = Array.from(new Set([...(participantUserIDs.length > 0 ? participantUserIDs : existingParticipants)]));
    if (!nextParticipants.includes(userId)) nextParticipants.push(userId);
    if (nextParticipants.length < 3) return res.status(400).json({ error: 'Group chat needs at least three members including you' });

    const nextAdmins = Array.from(new Set((adminUserIDs.length > 0 ? adminUserIDs : existingAdmins).filter(id => nextParticipants.includes(id))));
    if (nextAdmins.length === 0) nextAdmins.push(userId);
    if (!nextAdmins.includes(userId) && existingAdmins.length === 1 && existingAdmins[0] === userId) {
      return res.status(400).json({ error: 'Assign another admin before removing yourself as admin' });
    }

    await db.collection<any>('chatThreads').updateOne(
      { _id: threadId },
      {
        $set: {
          type: 'group',
          threadTitle,
          participantUserIDs: nextParticipants.sort(),
          adminUserIDs: nextAdmins.sort(),
          updatedAt: new Date(),
        }
      }
    );

    const updatedThread = await db.collection<any>('chatThreads').findOne({ _id: threadId });
    await publishChatEvent('chat.thread.updated', {
      threadId,
      updatedByUserID: userId,
      participantUserIDs: Array.isArray(updatedThread?.participantUserIDs) ? updatedThread.participantUserIDs.map(String) : [],
    });
    res.json({ success: true, thread: mapMongoChatThread(updatedThread, 0) });
  } catch (error: any) {
    console.error('API PUT /api/chat/thread-settings error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/logout', (req, res) => {
  res.clearCookie('user_id');
  res.json({ success: true });
});

app.post('/api/transmittals', async (req, res) => {
  try {
    const data = req.body;
    const db = await getMongoDb();
    const collection = db.collection<any>('transmittals');
    const nextId = await getNextTransmittalId(collection, data.date);

    await collection.insertOne({
      _id: nextId,
      transmittalID: nextId,
      clientID: data.clientID || '',
      userID: data.userID || '',
      items: data.items || '',
      date: data.date || '',
      receiptUrl: data.receiptUrl || '',
      receiverName: data.receiverName || '',
      receiverAddress: data.receiverAddress || '',
      createdAt: new Date(),
      updatedAt: new Date()
    });
    await writeAuditLog(db, req, {
      entityType: 'transmittal',
      entityId: nextId,
      action: 'transmittal_created',
      actionLabel: 'Created Transmittal',
      summary: `Created transmittal #${nextId} with ${(data.items || '').split('||').filter(Boolean).length} item(s).`,
      details: {
        transmittalID: nextId,
        clientID: data.clientID || '',
        userID: data.userID || ''
      }
    });

    res.json({ success: true, transmittalID: nextId });
  } catch (error: any) {
    console.error('[API] Transmittal error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/meetings', async (req, res) => {
  try {
    const data = req.body;
    const db = await getMongoDb();
    const collection = db.collection<any>('meetings');
    const nextId = newRecordId('mtg');
    const attendeeCount = String(data.userIDs || '').split(',').filter(Boolean).length;

    await collection.insertOne({
      _id: nextId,
      meetingID: nextId,
      date: data.date || '',
      subject: data.subject || '',
      userIDs: data.userIDs || '',
      momUrl: data.momUrl || '',
      createdAt: new Date(),
      updatedAt: new Date()
    });
    await writeAuditLog(db, req, {
      entityType: 'meeting',
      entityId: nextId,
      action: 'meeting_created',
      actionLabel: 'Created Meeting',
      summary: `Created meeting "${data.subject || 'Untitled Meeting'}" with ${attendeeCount} attendee(s).`,
      details: {
        meetingID: nextId,
        date: data.date || '',
        attendeeCount
      }
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
    const db = await getMongoDb();
    const existingTransmittal = await db.collection<any>('transmittals').findOne({ _id: id });
    if (!existingTransmittal) return res.status(404).json({ error: 'Transmittal not found' });
    const beforeItemCount = String(existingTransmittal?.items || '').split('||').filter(Boolean).length;
    const afterItemCount = String(data.items || '').split('||').filter(Boolean).length;
    const attachmentChanged = String(existingTransmittal?.receiptUrl || '') !== String(data.receiptUrl || '');
    const fieldChanges: string[] = [];
    const changeDetails: any = {
      transmittalID: String(existingTransmittal?.transmittalID || existingTransmittal?._id || id),
      before: {},
      after: {}
    };
    const addChange = (label: string, key: string, beforeValue: any, afterValue: any) => {
      const beforeText = String(beforeValue || '').trim();
      const afterText = String(afterValue || '').trim();
      if (beforeText === afterText) return;
      fieldChanges.push(label);
      changeDetails.before[key] = beforeText;
      changeDetails.after[key] = afterText;
    };

    addChange('client', 'clientID', existingTransmittal?.clientID, data.clientID);
    addChange('representative', 'userID', existingTransmittal?.userID, data.userID);
    addChange('date', 'date', existingTransmittal?.date, data.date);
    addChange('receiver name', 'receiverName', existingTransmittal?.receiverName, data.receiverName);
    addChange('receiver address', 'receiverAddress', existingTransmittal?.receiverAddress, data.receiverAddress);
    if (String(existingTransmittal?.items || '') !== String(data.items || '')) {
      fieldChanges.push('document manifest');
      changeDetails.before.itemCount = beforeItemCount;
      changeDetails.after.itemCount = afterItemCount;
    }
    if (attachmentChanged) {
      fieldChanges.push('official slip');
      changeDetails.before.receiptUrl = existingTransmittal?.receiptUrl || '';
      changeDetails.after.receiptUrl = data.receiptUrl || '';
    }

    if (fieldChanges.length === 0) {
      return res.status(200).json({ success: true, unchanged: true });
    }

    const formatChangeList = (changes: string[]) => {
      if (changes.length === 0) return 'No visible field changes detected.';
      if (changes.length === 1) return changes[0];
      if (changes.length === 2) return `${changes[0]} and ${changes[1]}`;
      return `${changes.slice(0, -1).join(', ')}, and ${changes[changes.length - 1]}`;
    };

    const summary = attachmentChanged && fieldChanges.length === 1
      ? (data.receiptUrl ? 'Attached official transmittal slip.' : 'Removed official transmittal slip.')
      : `Updated ${formatChangeList(fieldChanges)}.`;

    await db.collection<any>('transmittals').updateOne(
      { _id: id },
      {
        $set: {
          clientID: data.clientID || '',
          userID: data.userID || '',
          items: data.items || '',
          date: data.date || '',
          receiptUrl: data.receiptUrl || '',
          receiverName: data.receiverName || '',
          receiverAddress: data.receiverAddress || '',
          updatedAt: new Date()
        }
      }
    );

    await writeAuditLog(db, req, {
      entityType: 'transmittal',
      entityId: String(existingTransmittal?.transmittalID || existingTransmittal?._id || id),
      action: attachmentChanged ? 'transmittal_attachment_updated' : 'transmittal_updated',
      actionLabel: attachmentChanged ? 'Updated Official Slip' : 'Updated Transmittal',
      summary,
      details: changeDetails
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
    const db = await getMongoDb();
    const existingMeeting = await db.collection<any>('meetings').findOne({ _id: id });
    if (!existingMeeting) return res.status(404).json({ error: 'Meeting not found' });
    const normalizeUserIds = (value: any) => String(value || '').split(',').map((item) => item.trim()).filter(Boolean).sort().join(',');
    const countUserIds = (value: any) => String(value || '').split(',').map((item) => item.trim()).filter(Boolean).length;
    const fieldChanges: string[] = [];
    const changeDetails: any = {
      meetingID: String(existingMeeting?.meetingID || existingMeeting?._id || id),
      before: {},
      after: {}
    };
    const addChange = (label: string, key: string, beforeValue: any, afterValue: any) => {
      const beforeText = String(beforeValue || '').trim();
      const afterText = String(afterValue || '').trim();
      if (beforeText === afterText) return;
      fieldChanges.push(label);
      changeDetails.before[key] = beforeText;
      changeDetails.after[key] = afterText;
    };
    const formatChangeList = (changes: string[]) => {
      if (changes.length === 1) return changes[0];
      if (changes.length === 2) return `${changes[0]} and ${changes[1]}`;
      return `${changes.slice(0, -1).join(', ')}, and ${changes[changes.length - 1]}`;
    };

    addChange('subject', 'subject', existingMeeting?.subject, data.subject);
    addChange('date', 'date', existingMeeting?.date, data.date);
    if (normalizeUserIds(existingMeeting?.userIDs) !== normalizeUserIds(data.userIDs)) {
      fieldChanges.push('attendees');
      changeDetails.before.attendeeCount = countUserIds(existingMeeting?.userIDs);
      changeDetails.after.attendeeCount = countUserIds(data.userIDs);
      changeDetails.before.userIDs = existingMeeting?.userIDs || '';
      changeDetails.after.userIDs = data.userIDs || '';
    }
    const attachmentChanged = String(existingMeeting?.momUrl || '') !== String(data.momUrl || '');
    if (attachmentChanged) {
      fieldChanges.push('minutes attachment');
      changeDetails.before.momUrl = existingMeeting?.momUrl || '';
      changeDetails.after.momUrl = data.momUrl || '';
    }

    if (fieldChanges.length === 0) {
      return res.status(200).json({ success: true, unchanged: true });
    }

    const summary = attachmentChanged && fieldChanges.length === 1
      ? (data.momUrl ? 'Attached minutes of meeting.' : 'Removed minutes of meeting.')
      : `Updated ${formatChangeList(fieldChanges)}.`;

    await db.collection<any>('meetings').updateOne(
      { _id: id },
      {
        $set: {
          date: data.date || '',
          subject: data.subject || '',
          userIDs: data.userIDs || '',
          momUrl: data.momUrl || '',
          updatedAt: new Date()
        }
      }
    );

    await writeAuditLog(db, req, {
      entityType: 'meeting',
      entityId: String(existingMeeting?.meetingID || existingMeeting?._id || id),
      action: attachmentChanged ? 'meeting_attachment_updated' : 'meeting_updated',
      actionLabel: attachmentChanged ? 'Updated Minutes Attachment' : 'Updated Meeting',
      summary,
      details: changeDetails
    });
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/clients', async (req, res) => {
  console.log('[API] Received request to add client:', req.body.name);
  try {
    const db = await getMongoDb();
    const collection = db.collection<any>('clients');
    const client = req.body;

    const nextId = newRecordId('cli');
    console.log('[API] Generated next ID:', nextId);

    await collection.insertOne({
      _id: nextId,
      clientID: nextId,
      clientName: client.name || '',
      tin: client.tin || '',
      entityType: client.entityType || '',
      email: client.email || '',
      contactPerson: client.contactPerson || '',
      status: client.status || 'Active',
      fiscalYearEnd: client.fiscalYearEnd || '',
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    await writeAuditLog(db, req, {
      entityType: 'client',
      entityId: nextId,
      action: 'client_created',
      actionLabel: 'Created Client',
      summary: `Created client profile for ${client.name || 'new client'}.`,
      details: { clientID: nextId }
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
    const db = await getMongoDb();
    const ids = userIdCandidates(id);
    const existingClient = await db.collection<any>('clients').findOne({
      $or: [{ _id: { $in: ids } }, { clientID: { $in: ids } }]
    });
    const clientBefore = {
      name: existingClient?.clientName || '',
      tin: existingClient?.tin || '',
      entityType: existingClient?.entityType || '',
      email: existingClient?.email || '',
      contactPerson: existingClient?.contactPerson || '',
      status: existingClient?.status || '',
      fiscalYearEnd: existingClient?.fiscalYearEnd || ''
    };
    const clientAfter = {
      name: updatedClient.name || '',
      tin: updatedClient.tin || '',
      entityType: updatedClient.entityType || updatedClient.entity_type || '',
      email: updatedClient.email || '',
      contactPerson: updatedClient.contactPerson || '',
      status: updatedClient.status || 'Active',
      fiscalYearEnd: updatedClient.fiscalYearEnd || ''
    };
    const clientDetails = buildChangedAuditDetails(clientBefore, clientAfter);
    if (existingClient && clientDetails.changedKeys.length === 0) {
      return res.status(200).json({ success: true, unchanged: true });
    }

    const result = await db.collection<any>('clients').updateOne(
      { $or: [{ _id: { $in: ids } }, { clientID: { $in: ids } }] },
      {
        $set: {
          clientName: updatedClient.name || '',
          tin: updatedClient.tin || '',
          entityType: updatedClient.entityType || updatedClient.entity_type || '',
          email: updatedClient.email || '',
          contactPerson: updatedClient.contactPerson || '',
          status: updatedClient.status || 'Active',
          fiscalYearEnd: updatedClient.fiscalYearEnd || '',
          updatedAt: new Date(),
        }
      }
    );

    if (result.matchedCount === 0) return res.status(404).json({ error: 'Client not found' });
    await writeAuditLog(db, req, {
      entityType: 'client',
      entityId: String(existingClient?.clientID || existingClient?._id || id),
      action: 'client_profile_updated',
      actionLabel: 'Updated Client Profile',
      summary: buildFieldChangeSummary(clientBefore, clientAfter, `Updated client profile details for ${updatedClient.name || existingClient?.clientName || 'this client'}.`),
      details: {
        clientID: String(existingClient?.clientID || existingClient?._id || id),
        before: clientDetails.before,
        after: clientDetails.after
      }
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
    const db = await getMongoDb();
    const ids = userIdCandidates(id);
    const retainerId = toPaddedId(id);
    const normalizedServiceId = toPaddedId(serviceId);
    const existingRetainer = await db.collection<any>('retainerEngagements').findOne({
      $or: [{ _id: { $in: ids } }, { retainerID: { $in: ids } }]
    });
    if (!existingRetainer) return res.status(404).json({ error: 'Retainer not found' });

    const deadlineCollection = db.collection<any>('deadlines');
    const existingDeadlines = await deadlineCollection
      .find({ retainerID: { $in: ids } })
      .toArray();
    const now = new Date();
    const getNextDeadlineId = () => newRecordId('dl');
    const formatDeadlineEntry = (serviceValue: any, taxValue: any, dueDateValue: any) =>
      `${toPaddedId(serviceValue)}:${toPaddedId(taxValue || '')}:${dueDateValue || ''}`;
    const getDeadlineConfigMap = (rows: any[]) => new Map(rows
      .filter((row: any) => String(row?.status || 'Active') !== 'Inactive')
      .map((row: any) => [`${toPaddedId(row.serviceID)}:${toPaddedId(row.taxID || '')}`, row.dueDate || '']));
    const beforeDeadlineMap = getDeadlineConfigMap(existingDeadlines);
    const afterDeadlineMap = new Map<string, string>();
    if (isTaxComplianceService(normalizedServiceId) && selectedTaxes && selectedTaxes.length > 0) {
      selectedTaxes.forEach((tax: any) => {
        afterDeadlineMap.set(`${normalizedServiceId}:${toPaddedId(tax.taxID)}`, tax.dueDateCode || '');
      });
    } else if (dueDateCode) {
      afterDeadlineMap.set(`${normalizedServiceId}:`, dueDateCode);
    }
    const affectedDeadlineKeys = Array.from(new Set([...beforeDeadlineMap.keys(), ...afterDeadlineMap.keys()]))
      .filter((key) => String(beforeDeadlineMap.get(key) || '') !== String(afterDeadlineMap.get(key) || ''))
      .sort();
    const affectedBeforeDeadlineConfig = affectedDeadlineKeys
      .filter((key) => beforeDeadlineMap.has(key))
      .map((key) => {
        const [serviceKey, taxKey] = key.split(':');
        return formatDeadlineEntry(serviceKey, taxKey, beforeDeadlineMap.get(key));
      })
      .join(' | ');
    const affectedAfterDeadlineConfig = affectedDeadlineKeys
      .filter((key) => afterDeadlineMap.has(key))
      .map((key) => {
        const [serviceKey, taxKey] = key.split(':');
        return formatDeadlineEntry(serviceKey, taxKey, afterDeadlineMap.get(key));
      })
      .join(' | ');
    const retainerBefore = {
      serviceID: existingRetainer?.serviceID || '',
      assignedStaffID: existingRetainer?.assignedStaffID || '',
      startDate: existingRetainer?.startDate || '',
      deadlineConfig: affectedBeforeDeadlineConfig
    };
    const retainerAfter = {
      serviceID: normalizedServiceId,
      assignedStaffID: assignedStaffId,
      startDate,
      deadlineConfig: affectedAfterDeadlineConfig
    };
    const retainerDetails = buildChangedAuditDetails(retainerBefore, retainerAfter);
    if (retainerDetails.changedKeys.length === 0) {
      return res.status(200).json({ success: true, unchanged: true });
    }

    const result = await db.collection<any>('retainerEngagements').updateOne(
      { $or: [{ _id: { $in: ids } }, { retainerID: { $in: ids } }] },
      {
        $set: {
          clientID: clientId,
          serviceID: normalizedServiceId,
          startDate,
          status: 'Active',
          assignedStaffID: assignedStaffId,
          updatedAt: now,
        }
      }
    );

    if (result.matchedCount === 0) return res.status(404).json({ error: 'Retainer not found' });

    if (isTaxComplianceService(normalizedServiceId) && selectedTaxes && selectedTaxes.length > 0) {
      const selectedTaxRows = selectedTaxes
        .map((tax: any) => ({
          taxID: toPaddedId(tax.taxID),
          dueDate: tax.dueDateCode,
        }))
        .filter((tax: any) => tax.taxID);
      const selectedTaxIds = new Set(selectedTaxRows.map((tax: any) => tax.taxID));
      const existingByTaxId = new Map(
        existingDeadlines
          .filter((deadline: any) => toPaddedId(deadline.serviceID) === normalizedServiceId && deadline.taxID)
          .map((deadline: any) => [toPaddedId(deadline.taxID), deadline])
      );

      for (const tax of selectedTaxRows) {
        const deadlineKey = `${normalizedServiceId}:${tax.taxID}`;
        if (!affectedDeadlineKeys.includes(deadlineKey)) continue;
        const existingDeadline = existingByTaxId.get(tax.taxID);
        if (existingDeadline) {
          await deadlineCollection.updateOne(
            { _id: existingDeadline._id },
            {
              $set: {
                retainerID: retainerId,
                serviceID: normalizedServiceId,
                taxID: tax.taxID,
                dueDate: tax.dueDate,
                status: 'Active',
                updatedAt: now,
              }
            }
          );
        } else {
          const deadlineID = getNextDeadlineId();
          await deadlineCollection.insertOne({
            _id: deadlineID,
            deadlineID,
            retainerID: retainerId,
            serviceID: normalizedServiceId,
            taxID: tax.taxID,
            dueDate: tax.dueDate,
            status: 'Active',
            createdAt: now,
            updatedAt: now,
          });
        }
      }

      const removedDeadlineIds = existingDeadlines
        .filter((deadline: any) => toPaddedId(deadline.serviceID) !== normalizedServiceId || !selectedTaxIds.has(toPaddedId(deadline.taxID)))
        .map((deadline: any) => deadline._id);
      if (removedDeadlineIds.length > 0) {
        await deadlineCollection.updateMany(
          { _id: { $in: removedDeadlineIds } },
          { $set: { status: 'Inactive', updatedAt: now } }
        );
      }
    } else if (dueDateCode) {
      const existingDeadline = existingDeadlines.find((deadline: any) => toPaddedId(deadline.serviceID) === normalizedServiceId && !deadline.taxID);
      const deadlineKey = `${normalizedServiceId}:`;
      if (affectedDeadlineKeys.includes(deadlineKey)) {
        if (existingDeadline) {
          await deadlineCollection.updateOne(
            { _id: existingDeadline._id },
            {
              $set: {
                retainerID: retainerId,
                serviceID: normalizedServiceId,
                taxID: '',
                dueDate: dueDateCode,
                status: 'Active',
                updatedAt: now,
              }
            }
          );
        } else {
          const deadlineID = getNextDeadlineId();
          await deadlineCollection.insertOne({
            _id: deadlineID,
            deadlineID,
            retainerID: retainerId,
            serviceID: normalizedServiceId,
            taxID: '',
            dueDate: dueDateCode,
            status: 'Active',
            createdAt: now,
            updatedAt: now,
          });
        }
      }

      const removedDeadlineIds = existingDeadlines
        .filter((deadline: any) => deadline._id !== existingDeadline?._id)
        .map((deadline: any) => deadline._id);
      if (removedDeadlineIds.length > 0) {
        await deadlineCollection.updateMany(
          { _id: { $in: removedDeadlineIds } },
          { $set: { status: 'Inactive', updatedAt: now } }
        );
      }
    } else {
      await deadlineCollection.updateMany(
        { retainerID: { $in: ids } },
        { $set: { status: 'Inactive', updatedAt: now } }
      );
    }

    console.log('[API] Successfully updated retainer and deadlines:', id);
    if (retainerDetails.changedKeys.length > 0) {
      const serviceName = await getServiceAuditName(db, normalizedServiceId);
      const retainerSummary = buildServiceAwareChangeSummary(retainerBefore, retainerAfter, 'Updated retainer service details.', serviceName);
      await writeAuditLog(db, req, {
        entityType: 'client',
        entityId: String(existingRetainer?.clientID || clientId || ''),
        action: 'client_retainer_updated',
        actionLabel: 'Updated Retainer Service',
        summary: retainerSummary,
        details: {
          clientID: String(existingRetainer?.clientID || clientId || ''),
          retainerID: String(existingRetainer?.retainerID || existingRetainer?._id || id),
          serviceID: normalizedServiceId,
          assignedStaffID: String(retainerAfter.assignedStaffID || ''),
          before: retainerDetails.before,
          after: retainerDetails.after
        }
      });
    }
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
    const db = await getMongoDb();
    const requestUser = await getRequestUser(req);
    if (!canDeleteEngagement(requestUser)) {
      return res.status(403).json({ error: 'Only Admin, Manager, or Supervisor can delete retainer services' });
    }

    const ids = userIdCandidates(id);
    const existingRetainer = await db.collection<any>('retainerEngagements').findOne({
      $or: [{ _id: { $in: ids } }, { retainerID: { $in: ids } }]
    });
    const result = await db.collection<any>('retainerEngagements').deleteOne({
      $or: [{ _id: { $in: ids } }, { retainerID: { $in: ids } }]
    });
    await db.collection<any>('deadlines').deleteMany({ retainerID: { $in: ids } });

    if (result.deletedCount === 0) return res.status(404).json({ error: 'Retainer not found' });
    const serviceName = await getServiceAuditName(db, existingRetainer?.serviceID || '');
    await writeAuditLog(db, req, {
      entityType: 'client',
      entityId: String(existingRetainer?.clientID || ''),
      action: 'client_retainer_deleted',
      actionLabel: 'Deleted Retainer Service',
      summary: `Deleted retainer service "${serviceName}" and associated deadlines.`,
      details: {
        clientID: String(existingRetainer?.clientID || ''),
        retainerID: String(existingRetainer?.retainerID || existingRetainer?._id || id),
        serviceID: existingRetainer?.serviceID || '',
        assignedStaffID: existingRetainer?.assignedStaffID || ''
      }
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
    const db = await getMongoDb();
    const retainerCollection = db.collection<any>('retainerEngagements');
    const deadlineCollection = db.collection<any>('deadlines');
    const results = [];
    for (const task of assignments) {
      const { serviceId, assignedStaffId, startDate, dueDateCode, selectedTaxes } = task;
      const normalizedServiceId = toPaddedId(serviceId);

      const retainerId = newRecordId('ret');

      await retainerCollection.insertOne({
        _id: retainerId,
        retainerID: retainerId,
        clientID: clientId,
        serviceID: normalizedServiceId,
        startDate,
        status: 'Active',
        assignedStaffID: assignedStaffId,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      console.log('[API] Adding deadlines for retainer:', retainerId, 'Service:', normalizedServiceId);

      let deadlineRows = [];

      if (isTaxComplianceService(normalizedServiceId) && selectedTaxes && selectedTaxes.length > 0) {
        deadlineRows = selectedTaxes.map((tax: any) => {
          const deadlineID = newRecordId('dl');
          return {
            _id: deadlineID,
            deadlineID,
            retainerID: retainerId,
            serviceID: normalizedServiceId,
            taxID: tax.taxID,
            dueDate: tax.dueDateCode,
            status: 'Active',
            createdAt: new Date(),
            updatedAt: new Date(),
          };
        });
      } else if (dueDateCode) {
        const deadlineID = newRecordId('dl');
        deadlineRows = [{
          _id: deadlineID,
          deadlineID,
          retainerID: retainerId,
          serviceID: normalizedServiceId,
          taxID: '',
          dueDate: dueDateCode,
          status: 'Active',
          createdAt: new Date(),
          updatedAt: new Date(),
        }];
      }

      if (deadlineRows.length > 0) {
        await deadlineCollection.insertMany(deadlineRows);
      }
      const serviceName = await getServiceAuditName(db, normalizedServiceId);
      await writeAuditLog(db, req, {
        entityType: 'client',
        entityId: String(clientId || ''),
        action: 'client_retainer_added',
        actionLabel: 'Added Retainer Service',
        summary: `Added retainer service "${serviceName}".`,
        details: {
          clientID: String(clientId || ''),
          retainerID: retainerId,
          serviceID: normalizedServiceId,
          assignedStaffID: String(assignedStaffId || '')
        }
      });
      
      results.push({ retainerId, serviceId: normalizedServiceId });
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

function buildRetainerFilingAuditSummary(before: any, after: any) {
  if (!before && after?.dateCompleted) {
    return after?.remarks ? `Filed on ${after.dateCompleted} with remarks.` : `Filed on ${after.dateCompleted}.`;
  }
  if (before?.dateCompleted && !after) {
    return before?.remarks ? `Removed filing dated ${before.dateCompleted} and remarks.` : `Removed filing dated ${before.dateCompleted}.`;
  }

  const dateChanged = String(before?.dateCompleted || '') !== String(after?.dateCompleted || '');
  const remarksChanged = String(before?.remarks || '') !== String(after?.remarks || '');
  if (dateChanged && remarksChanged) {
    return 'Updated filing date and remarks.';
  }
  if (dateChanged) return 'Updated filing date.';
  if (remarksChanged) return 'Updated filing remarks.';
  return 'No visible filing changes detected.';
}

function formatAuditFieldLabel(key: string) {
  return key
    .replace(/ID$/, '')
    .replace(/Id$/, '')
    .replace(/([A-Z])/g, ' $1')
    .replace(/^./, char => char.toUpperCase())
    .trim();
}

function formatAuditList(items: string[]) {
  if (items.length === 0) return '';
  if (items.length === 1) return items[0];
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(', ')}, and ${items[items.length - 1]}`;
}

function buildFieldChangeSummary(before: any, after: any, fallback: string) {
  const changedKeys = Array.from(new Set([...Object.keys(before || {}), ...Object.keys(after || {})]))
    .filter((key) => !['specialID', 'taskID', 'activityID'].includes(key))
    .filter((key) => String(before?.[key] ?? '') !== String(after?.[key] ?? ''));
  if (changedKeys.length === 0) return fallback;
  if (changedKeys.length === 1) {
    const key = changedKeys[0];
    if (key === 'description') return 'Updated description.';
    if (key === 'deadlineConfig') return 'Updated deadline configuration.';
    if (key === 'password') return 'Updated password.';
    if (key === 'securityAnswer') return 'Updated security answer.';
    if (key.endsWith('ID') || key.endsWith('Id')) return `Updated ${formatAuditFieldLabel(key).toLowerCase().replace(' id', '')}.`;
    return `Updated ${formatAuditFieldLabel(key).toLowerCase()}: ${before?.[key] || 'blank'} > ${after?.[key] || 'blank'}.`;
  }
  return `Updated ${formatAuditList(changedKeys.map((key) => formatAuditFieldLabel(key).toLowerCase()))}.`;
}

function buildServiceAwareChangeSummary(before: any, after: any, fallback: string, serviceName = '') {
  const changedKeys = Array.from(new Set([...Object.keys(before || {}), ...Object.keys(after || {})]))
    .filter((key) => !['specialID', 'taskID', 'activityID'].includes(key))
    .filter((key) => String(before?.[key] ?? '') !== String(after?.[key] ?? ''));
  if (changedKeys.length === 0) return fallback;

  const suffix = serviceName ? ` for ${serviceName}` : '';
  if (changedKeys.length === 1) {
    const key = changedKeys[0];
    const label = key === 'deadlineConfig' ? 'deadline configuration' : formatAuditFieldLabel(key).toLowerCase();
    if (key === 'password') return 'Updated password.';
    if (key === 'securityAnswer') return 'Updated security answer.';
    return `Updated ${label}${suffix}.`;
  }

  return `Updated ${formatAuditList(changedKeys.map((key) => key === 'deadlineConfig' ? 'deadline configuration' : formatAuditFieldLabel(key).toLowerCase()))}${suffix}.`;
}

function buildProgressChangeSummary(before: any, after: any, taskName: string) {
  const changedKeys = Array.from(new Set([...Object.keys(before || {}), ...Object.keys(after || {})]))
    .filter((key) => String(before?.[key] ?? '') !== String(after?.[key] ?? ''));
  const subject = `progress for "${taskName || 'task'}"`;
  if (changedKeys.length === 0) return `Updated ${subject}.`;
  if (changedKeys.length === 1) return `Updated ${formatAuditFieldLabel(changedKeys[0]).toLowerCase()} for "${taskName || 'task'}".`;
  return `Updated ${formatAuditList(changedKeys.map((key) => formatAuditFieldLabel(key).toLowerCase()))} for "${taskName || 'task'}".`;
}

function buildChangedAuditDetails(before: any, after: any, excludedKeys: string[] = []) {
  if (!before && !after) return { before: null, after: null, changedKeys: [] as string[] };
  if (!before) {
    const afterDetails = Object.fromEntries(
      Object.entries(after || {}).filter(([key, value]) => !excludedKeys.includes(key) && String(value ?? '') !== '')
    );
    return { before: null, after: afterDetails, changedKeys: Object.keys(afterDetails) };
  }
  if (!after) {
    const beforeDetails = Object.fromEntries(
      Object.entries(before || {}).filter(([key, value]) => !excludedKeys.includes(key) && String(value ?? '') !== '')
    );
    return { before: beforeDetails, after: null, changedKeys: Object.keys(beforeDetails) };
  }

  const changedKeys = Array.from(new Set([...Object.keys(before), ...Object.keys(after)]))
    .filter((key) => !excludedKeys.includes(key))
    .filter((key) => String(before?.[key] ?? '') !== String(after?.[key] ?? ''));
  const beforeDetails = Object.fromEntries(changedKeys.map((key) => [key, before?.[key] ?? '']));
  const afterDetails = Object.fromEntries(changedKeys.map((key) => [key, after?.[key] ?? '']));
  return { before: beforeDetails, after: afterDetails, changedKeys };
}

app.post('/api/specials', async (req, res) => {
  const { clientId, assignments } = req.body;
  console.log('[API] Special project assignment for client:', clientId);

  try {
    const db = await getMongoDb();
    const collection = db.collection<any>('specialEngagements');
    const results = [];
    for (const task of assignments) {
      const specialId = newRecordId('spc');

      await collection.insertOne({
        _id: specialId,
        specialID: specialId,
        clientID: String(clientId).padStart(4, '0'),
        assignedStaffID: String(task.assignedStaffId).padStart(4, '0'),
        serviceID: String(task.serviceId).padStart(4, '0'),
        projectTitle: task.projectTitle || '',
        startDate: formatDateToMDY(task.startDate) || '',
        endDate: formatDateToMDY(task.endDate) || '',
        status: task.status || 'Planning',
        description: task.description || '',
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      const serviceName = await getServiceAuditName(db, String(task.serviceId).padStart(4, '0'));
      await writeAuditLog(db, req, {
        entityType: 'client',
        entityId: String(clientId || ''),
        action: 'client_special_added',
        actionLabel: 'Added Special Project',
        summary: `Added special project "${task.projectTitle || 'Untitled Project'}" for ${serviceName}.`,
        details: {
          clientID: String(clientId || ''),
          specialID: specialId,
          serviceID: String(task.serviceId).padStart(4, '0'),
          assignedStaffID: String(task.assignedStaffId).padStart(4, '0')
        }
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
    const db = await getMongoDb();
    const ids = userIdCandidates(id);
    const existingSpecial = await db.collection<any>('specialEngagements').findOne({
      $or: [{ _id: { $in: ids } }, { specialID: { $in: ids } }]
    });
    const updates: any = { updatedAt: new Date() };
    if (data.assignedStaffId !== undefined) updates.assignedStaffID = String(data.assignedStaffId).padStart(4, '0');
    if (data.serviceId !== undefined) updates.serviceID = String(data.serviceId).padStart(4, '0');
    if (data.projectTitle !== undefined) updates.projectTitle = data.projectTitle;
    if (data.startDate !== undefined) updates.startDate = formatDateToMDY(data.startDate);
    if (data.endDate !== undefined) updates.endDate = formatDateToMDY(data.endDate);
    if (data.status !== undefined) updates.status = data.status;
    if (data.description !== undefined) updates.description = data.description;
    if (!existingSpecial) return res.status(404).json({ error: 'Special engagement not found' });
    const specialBefore = {
      projectTitle: existingSpecial?.projectTitle || '',
      assignedStaffID: existingSpecial?.assignedStaffID || '',
      serviceID: existingSpecial?.serviceID || '',
      startDate: existingSpecial?.startDate || '',
      endDate: existingSpecial?.endDate || '',
      status: existingSpecial?.status || '',
      description: existingSpecial?.description || ''
    };
    const specialAfter = {
      projectTitle: updates.projectTitle ?? existingSpecial?.projectTitle ?? '',
      assignedStaffID: updates.assignedStaffID ?? existingSpecial?.assignedStaffID ?? '',
      serviceID: updates.serviceID ?? existingSpecial?.serviceID ?? '',
      startDate: updates.startDate ?? existingSpecial?.startDate ?? '',
      endDate: updates.endDate ?? existingSpecial?.endDate ?? '',
      status: updates.status ?? existingSpecial?.status ?? '',
      description: updates.description ?? existingSpecial?.description ?? ''
    };
    const specialDetails = buildChangedAuditDetails(specialBefore, specialAfter, ['specialID']);
    if (specialDetails.changedKeys.length === 0) {
      return res.status(200).json({ success: true, unchanged: true });
    }

    const result = await db.collection<any>('specialEngagements').updateOne(
      { $or: [{ _id: { $in: ids } }, { specialID: { $in: ids } }] },
      { $set: updates }
    );

    if (result.matchedCount === 0) return res.status(404).json({ error: 'Special engagement not found' });
    if (specialDetails.changedKeys.length > 0) {
      const specialServiceName = await getServiceAuditName(db, specialAfter.serviceID);
      await writeAuditLog(db, req, {
        entityType: 'specialProject',
        entityId: String(existingSpecial?.specialID || existingSpecial?._id || id),
        relatedEntityType: 'client',
        relatedEntityId: String(existingSpecial?.clientID || ''),
        action: 'special_project_updated',
        actionLabel: 'Updated Project',
        summary: buildServiceAwareChangeSummary(specialBefore, specialAfter, `Updated project "${specialAfter.projectTitle || 'Untitled Project'}".`, specialServiceName),
        details: {
          clientID: String(existingSpecial?.clientID || ''),
          specialID: String(existingSpecial?.specialID || existingSpecial?._id || id),
          serviceID: String(specialAfter.serviceID || ''),
          assignedStaffID: String(specialAfter.assignedStaffID || ''),
          before: specialDetails.before,
          after: specialDetails.after
        }
      });
    }

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
    const db = await getMongoDb();
    const requestUser = await getRequestUser(req);
    if (!canDeleteEngagement(requestUser)) {
      return res.status(403).json({ error: 'Only Admin, Manager, or Supervisor can delete special engagements' });
    }

    const ids = userIdCandidates(id);
    const existingSpecial = await db.collection<any>('specialEngagements').findOne({
      $or: [{ _id: { $in: ids } }, { specialID: { $in: ids } }]
    });
    const taskDocs = await db.collection<any>('taskLogs')
      .find({ specialID: { $in: ids } }, { projection: { taskID: 1 } })
      .toArray();
    const taskIds = taskDocs.map(task => task.taskID).filter(Boolean);

    const result = await db.collection<any>('specialEngagements').deleteOne({
      $or: [{ _id: { $in: ids } }, { specialID: { $in: ids } }]
    });
    await db.collection<any>('taskLogs').deleteMany({ specialID: { $in: ids } });
    if (taskIds.length > 0) {
      await db.collection<any>('activityLogs').deleteMany({ taskID: { $in: taskIds } });
    }

    if (result.deletedCount === 0) return res.status(404).json({ error: 'Special engagement not found' });
    const serviceName = await getServiceAuditName(db, existingSpecial?.serviceID || '');
    await writeAuditLog(db, req, {
      entityType: 'client',
      entityId: String(existingSpecial?.clientID || ''),
      action: 'client_special_deleted',
      actionLabel: 'Deleted Special Project',
      summary: `Deleted special project "${existingSpecial?.projectTitle || 'Untitled Project'}" for ${serviceName} and related worklogs.`,
      details: {
        clientID: String(existingSpecial?.clientID || ''),
        specialID: String(existingSpecial?.specialID || existingSpecial?._id || id),
        serviceID: existingSpecial?.serviceID || '',
        assignedStaffID: existingSpecial?.assignedStaffID || ''
      }
    });

    console.log('[API] Successfully deleted special engagement:', id);
    return res.status(200).json({ success: true });
  } catch (error: any) {
    console.error('[API] Error deleting special engagement:', error);
    return res.status(500).json({ error: error.message });
  }
});

app.get('/api/audit-logs', async (req, res) => {
  try {
    const entityType = String(req.query.entityType || '').trim();
    const entityId = String(req.query.entityId || '').trim();
    const period = String(req.query.period || '').trim();
    const limit = Math.min(Math.max(parseInt(String(req.query.limit || '5'), 10) || 5, 1), 50);
    const page = Math.max(parseInt(String(req.query.page || '1'), 10) || 1, 1);
    const skip = (page - 1) * limit;
    if (!entityType || !entityId) return res.status(400).json({ error: 'entityType and entityId are required' });

    const db = await getMongoDb();
    const entityIds = userIdCandidates(entityId);
    const query: any = {
      $or: [
        { entityType, entityId: { $in: entityIds } },
        { relatedEntityType: entityType, relatedEntityId: { $in: entityIds } }
      ]
    };
    if (period) query.period = period;

    const collection = db.collection<any>('auditLogs');
    const [logs, total] = await Promise.all([
      collection
      .find(query)
      .sort({ createdAt: -1 })
        .skip(skip)
      .limit(limit)
        .toArray(),
      collection.countDocuments(query)
    ]);

    res.json({
      logs: logs.map(mapMongoAuditLog),
      total,
      page,
      totalPages: Math.max(Math.ceil(total / limit), 1)
    });
  } catch (error: any) {
    console.error('API GET /api/audit-logs error:', error);
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
});

app.post('/api/retainer-logs', async (req, res) => {
  const { deadline, period, dateCompleted, remarks } = req.body;
  console.log('[API] Adding retainer log:', deadline, period, dateCompleted, remarks);

  try {
    const db = await getMongoDb();
    const deadlineID = String(deadline).padStart(4, '0');
    const id = `${deadlineID}-${String(period).replace(/[^\d]/g, '')}`;
    const existingLog = await db.collection<any>('retainerLogs').findOne({ deadlineID, period });
    const fullAuditBefore = existingLog ? { dateCompleted: existingLog.dateCompleted || '', remarks: existingLog.remarks || '' } : null;
    const fullAuditAfter = { dateCompleted, remarks: remarks || '' };
    const auditDetails = buildChangedAuditDetails(fullAuditBefore, fullAuditAfter);
    if (existingLog && auditDetails.changedKeys.length === 0) {
      return res.status(200).json({ success: true, unchanged: true });
    }

    await db.collection<any>('retainerLogs').updateOne(
      { deadlineID, period },
      {
        $set: {
          deadlineID,
          period,
          dateCompleted,
          remarks: remarks || '',
          updatedAt: new Date(),
        },
        $setOnInsert: {
          _id: id,
          createdAt: new Date(),
        }
      },
      { upsert: true }
    );

    if (!existingLog || auditDetails.changedKeys.length > 0) {
      const auditContext = await getDeadlineAuditContext(db, deadlineID);
      await writeAuditLog(db, req, {
        entityType: 'retainerFiling',
        entityId: deadlineID,
        period,
        action: existingLog ? 'retainer_filing_updated' : 'retainer_filed',
        actionLabel: existingLog ? 'Updated Filing' : 'Marked as Filed',
        summary: buildRetainerFilingAuditSummary(fullAuditBefore, fullAuditAfter),
        details: {
          ...auditContext,
          period,
          before: auditDetails.before,
          after: auditDetails.after
        }
      });
    }

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
    const db = await getMongoDb();
    const ids = userIdCandidates(deadline);
    const existingLog = await db.collection<any>('retainerLogs').findOne({ deadlineID: { $in: ids }, period });
    const fullAuditBefore = existingLog ? { dateCompleted: existingLog.dateCompleted || '', remarks: existingLog.remarks || '' } : null;
    const fullAuditAfter = { dateCompleted, remarks: remarks || '' };
    const auditDetails = buildChangedAuditDetails(fullAuditBefore, fullAuditAfter);
    if (existingLog && auditDetails.changedKeys.length === 0) {
      return res.status(200).json({ success: true, unchanged: true });
    }

    const result = await db.collection<any>('retainerLogs').updateOne(
      { deadlineID: { $in: ids }, period },
      {
        $set: {
          deadlineID: String(deadline).padStart(4, '0'),
          period,
          dateCompleted,
          remarks: remarks || '',
          updatedAt: new Date(),
        }
      }
    );

    if (result.matchedCount === 0) return res.status(404).json({ error: 'Log entry not found' });

    if (auditDetails.changedKeys.length > 0) {
      const auditDeadlineID = String(deadline).padStart(4, '0');
      const auditContext = await getDeadlineAuditContext(db, auditDeadlineID);
      await writeAuditLog(db, req, {
        entityType: 'retainerFiling',
        entityId: auditDeadlineID,
        period,
        action: 'retainer_filing_updated',
        actionLabel: 'Updated Filing',
        summary: buildRetainerFilingAuditSummary(fullAuditBefore, fullAuditAfter),
        details: {
          ...auditContext,
          period,
          before: auditDetails.before,
          after: auditDetails.after
        }
      });
    }

    console.log('[API] Successfully updated retainer log for deadline:', deadline);
    return res.status(200).json({ success: true });
  } catch (error: any) {
    console.error('[API] Error updating retainer log:', error);
    return res.status(500).json({ error: error.message || 'Internal server error' });
  }
});

app.delete('/api/retainer-logs', async (req, res) => {
  const deadline = String(req.query.deadline || req.body?.deadline || '').trim();
  const period = String(req.query.period || req.body?.period || '').trim();
  console.log('[API] Deleting retainer log:', deadline, period);

  try {
    if (!deadline || !period) return res.status(400).json({ error: 'deadline and period are required' });

    const db = await getMongoDb();
    const ids = userIdCandidates(deadline);
    const existingLog = await db.collection<any>('retainerLogs').findOne({
      deadlineID: { $in: ids },
      period
    });
    const result = await db.collection<any>('retainerLogs').deleteOne({
      deadlineID: { $in: ids },
      period
    });

    if (result.deletedCount === 0) return res.status(404).json({ error: 'Log entry not found' });

    const auditBefore = existingLog ? { dateCompleted: existingLog.dateCompleted || '', remarks: existingLog.remarks || '' } : null;
    const auditDetails = buildChangedAuditDetails(auditBefore, null);
    const auditDeadlineID = String(deadline).padStart(4, '0');
    const auditContext = await getDeadlineAuditContext(db, auditDeadlineID);
    await writeAuditLog(db, req, {
      entityType: 'retainerFiling',
      entityId: auditDeadlineID,
      period,
      action: 'retainer_unfiled',
      actionLabel: 'Unfiled Compliance',
      summary: buildRetainerFilingAuditSummary(auditBefore, null),
      details: {
        ...auditContext,
        period,
        before: auditDetails.before,
        after: auditDetails.after
      }
    });

    console.log('[API] Successfully deleted retainer log for deadline:', deadline, period);
    return res.status(200).json({ success: true });
  } catch (error: any) {
    console.error('[API] Error deleting retainer log:', error);
    return res.status(500).json({ error: error.message || 'Internal server error' });
  }
});

app.get('/api/specials/:id/worklog', async (req, res) => {
  const { id } = req.params;

  try {
    const db = await getMongoDb();
    const specialIds = userIdCandidates(id);
    const tasks = await db.collection<any>('taskLogs')
      .find({ specialID: { $in: specialIds } })
      .sort({ taskID: 1 })
      .toArray();
    const taskIds = tasks.map(task => task.taskID).filter(Boolean);
    const activities = taskIds.length > 0
      ? await db.collection<any>('activityLogs')
        .find({ taskID: { $in: taskIds } })
        .sort({ activityID: 1 })
        .toArray()
      : [];

    res.json({
      taskLog: tasks.map(mapMongoTask),
      activityLog: activities.map(mapMongoActivity)
    });
  } catch (error: any) {
    console.error('[API] Error fetching special worklog:', error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/tasks', async (req, res) => {
  const { taskID, specialID, taskName, status } = req.body;
  try {
    const db = await getMongoDb();
    const taskLogs = db.collection<any>('taskLogs');
    let id = String(taskID || '').trim();
    if (!specialID || !taskName) {
      return res.status(400).json({ error: 'specialID and taskName are required' });
    }

    if (!id || await taskLogs.findOne({ _id: id })) {
      id = newRecordId('tsk');
    }

    await taskLogs.insertOne({
      _id: id,
      taskID: id,
      specialID,
      taskName,
      status: status || 'Pending',
      createdAt: new Date(),
      updatedAt: new Date()
    });

    const specialContext = await getSpecialAuditContext(db, specialID);
    await writeAuditLog(db, req, {
      entityType: 'specialProject',
      entityId: specialID,
      action: 'special_task_added',
      actionLabel: 'Added Task',
      summary: `Added task "${taskName}".`,
      details: {
        ...specialContext,
        taskID: id,
        after: { taskID: id, taskName, status: status || 'Pending' }
      }
    });

    return res.status(200).json({ success: true, taskID: id });
  } catch (error: any) {
    if (error.code === 11000) return res.status(409).json({ error: 'Task ID already exists' });
    return res.status(500).json({ error: error.message });
  }
});

app.put('/api/tasks/:id', async (req, res) => {
  const { id } = req.params;
  const { taskName, status } = req.body;
  try {
    const db = await getMongoDb();
    const existingTask = await db.collection<any>('taskLogs').findOne({ _id: id });
    const updates: any = { updatedAt: new Date() };
    if (taskName !== undefined) updates.taskName = taskName;
    if (status !== undefined) updates.status = status;

    const result = await db.collection<any>('taskLogs').updateOne(
      { _id: id },
      { $set: updates }
    );

    if (result.matchedCount === 0) return res.status(404).json({ error: 'Task not found' });

    const taskBefore = existingTask ? { taskName: existingTask.taskName || '', status: existingTask.status || '' } : null;
    const taskAfter = { taskName: taskName ?? existingTask?.taskName ?? '', status: status ?? existingTask?.status ?? '' };
    const taskDetails = buildChangedAuditDetails(taskBefore, taskAfter);
    if (taskDetails.changedKeys.length > 0) {
      const specialContext = await getSpecialAuditContext(db, existingTask?.specialID || '');
      await writeAuditLog(db, req, {
        entityType: 'specialProject',
        entityId: existingTask?.specialID || '',
        action: 'special_task_updated',
        actionLabel: 'Updated Task',
        summary: buildFieldChangeSummary(
          taskBefore,
          taskAfter,
          `Updated task "${updates.taskName || existingTask?.taskName || id}".`
        ),
        details: {
          ...specialContext,
          taskID: String(existingTask?.taskID || existingTask?._id || id),
          before: taskDetails.before,
          after: taskDetails.after
        }
      });
    }

    return res.status(200).json({ success: true });
  } catch (error: any) {
    console.error('[API] Error updating task:', error);
    return res.status(500).json({ error: error.message });
  }
});

app.delete('/api/tasks/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const db = await getMongoDb();
    const requestUser = await getRequestUser(req);
    if (!await canDeleteTask(db, requestUser, id)) {
      return res.status(403).json({ error: 'You do not have permission to delete this task' });
    }

    const ids = userIdCandidates(id);
    const task = await db.collection<any>('taskLogs').findOne({ $or: [{ _id: { $in: ids } }, { taskID: { $in: ids } }] });
    const activityCount = await db.collection<any>('activityLogs').countDocuments({ taskID: { $in: ids } });
    const taskResult = await db.collection<any>('taskLogs').deleteOne({ $or: [{ _id: { $in: ids } }, { taskID: { $in: ids } }] });
    await db.collection<any>('activityLogs').deleteMany({ taskID: { $in: ids } });

    if (taskResult.deletedCount === 0) return res.status(404).json({ error: 'Task not found' });

    await writeAuditLog(db, req, {
      entityType: 'specialProject',
      entityId: task?.specialID || '',
      action: 'special_task_deleted',
      actionLabel: 'Deleted Task',
      summary: `Deleted task "${task?.taskName || id}"${activityCount ? ` and ${activityCount} progress log${activityCount === 1 ? '' : 's'}` : ''}.`,
      details: {
        ...(await getSpecialAuditContext(db, task?.specialID || '')),
        taskID: String(task?.taskID || task?._id || id),
        before: task ? { taskID: task.taskID || id, taskName: task.taskName || '', status: task.status || '', activityCount } : null,
        after: null
      }
    });

    return res.status(200).json({ success: true });
  } catch (error: any) {
    console.error('[API] Error deleting task:', error);
    return res.status(500).json({ error: error.message });
  }
});

app.post('/api/activities', async (req, res) => {
  const { activityID, taskID, dateCompleted, description } = req.body;
  try {
    const db = await getMongoDb();
    const activityLogs = db.collection<any>('activityLogs');
    let id = String(activityID || '').trim();
    if (!taskID || !dateCompleted || !description) {
      return res.status(400).json({ error: 'taskID, dateCompleted, and description are required' });
    }

    if (!id || await activityLogs.findOne({ _id: id })) {
      id = newRecordId('act');
    }

    await activityLogs.insertOne({
      _id: id,
      activityID: id,
      taskID,
      dateCompleted,
      description,
      createdAt: new Date(),
      updatedAt: new Date()
    });

    const task = await db.collection<any>('taskLogs').findOne({ $or: [{ _id: taskID }, { taskID }] });
    await writeAuditLog(db, req, {
      entityType: 'specialProject',
      entityId: task?.specialID || '',
      action: 'special_progress_added',
      actionLabel: 'Added Progress',
      summary: `Added progress for "${task?.taskName || 'task'}".`,
      details: {
        ...(await getSpecialAuditContext(db, task?.specialID || '')),
        activityID: id,
        taskID,
        taskName: task?.taskName || '',
        after: { dateCompleted, description }
      }
    });

    return res.status(200).json({ success: true, activityID: id });
  } catch (error: any) {
    if (error.code === 11000) return res.status(409).json({ error: 'Activity ID already exists' });
    return res.status(500).json({ error: error.message });
  }
});

app.put('/api/activities/:id', async (req, res) => {
  const { id } = req.params;
  const { description, dateCompleted } = req.body;
  try {
    const db = await getMongoDb();
    const existingActivity = await db.collection<any>('activityLogs').findOne({ _id: id });
    const task = existingActivity
      ? await db.collection<any>('taskLogs').findOne({ $or: [{ _id: existingActivity.taskID }, { taskID: existingActivity.taskID }] })
      : null;
    const updates: any = { updatedAt: new Date() };
    if (dateCompleted !== undefined) updates.dateCompleted = dateCompleted;
    if (description !== undefined) updates.description = description;

    const result = await db.collection<any>('activityLogs').updateOne(
      { _id: id },
      { $set: updates }
    );

    if (result.matchedCount === 0) return res.status(404).json({ error: 'Activity not found' });

    const activityBefore = existingActivity ? { dateCompleted: existingActivity.dateCompleted || '', description: existingActivity.description || '' } : null;
    const activityAfter = { dateCompleted: dateCompleted ?? existingActivity?.dateCompleted ?? '', description: description ?? existingActivity?.description ?? '' };
    const activityDetails = buildChangedAuditDetails(activityBefore, activityAfter);
    if (activityDetails.changedKeys.length > 0) {
      await writeAuditLog(db, req, {
      entityType: 'specialProject',
      entityId: task?.specialID || '',
      action: 'special_progress_updated',
      actionLabel: 'Updated Progress',
      summary: buildProgressChangeSummary(activityBefore, activityAfter, task?.taskName || 'task'),
      details: {
        ...(await getSpecialAuditContext(db, task?.specialID || '')),
        activityID: String(existingActivity?.activityID || existingActivity?._id || id),
        taskID: existingActivity?.taskID || '',
          taskName: task?.taskName || '',
          before: activityDetails.before,
          after: activityDetails.after
        }
      });
    }

    return res.status(200).json({ success: true });
  } catch (error: any) {
    console.error('[API] Error updating activity:', error);
    return res.status(500).json({ error: error.message });
  }
});

app.delete('/api/activities/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const db = await getMongoDb();
    const requestUser = await getRequestUser(req);
    if (!await canDeleteActivity(db, requestUser, id)) {
      return res.status(403).json({ error: 'You do not have permission to delete this activity log' });
    }

    const ids = userIdCandidates(id);
    const existingActivity = await db.collection<any>('activityLogs').findOne({ $or: [{ _id: { $in: ids } }, { activityID: { $in: ids } }] });
    const task = existingActivity
      ? await db.collection<any>('taskLogs').findOne({ $or: [{ _id: existingActivity.taskID }, { taskID: existingActivity.taskID }] })
      : null;
    const result = await db.collection<any>('activityLogs').deleteOne({ $or: [{ _id: { $in: ids } }, { activityID: { $in: ids } }] });
    if (result.deletedCount === 0) return res.status(404).json({ error: 'Activity not found' });

    await writeAuditLog(db, req, {
      entityType: 'specialProject',
      entityId: task?.specialID || '',
      action: 'special_progress_deleted',
      actionLabel: 'Deleted Progress',
      summary: `Deleted progress for "${task?.taskName || 'task'}".`,
      details: {
        ...(await getSpecialAuditContext(db, task?.specialID || '')),
        activityID: String(existingActivity?.activityID || existingActivity?._id || id),
        taskID: String(existingActivity?.taskID || ''),
        taskName: task?.taskName || '',
        before: existingActivity ? { dateCompleted: existingActivity.dateCompleted || '', description: existingActivity.description || '' } : null,
        after: null
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
    const db = await getMongoDb();
    const collection = db.collection<any>('credentials');
    const credentialID = newRecordId('cred');

    await collection.insertOne({
      _id: credentialID,
      credentialID,
      clientID,
      systemName,
      username,
      password,
      securityAnswer,
      remarks: remarks || '',
      createdAt: new Date(),
      updatedAt: new Date()
    });
    await writeAuditLog(db, req, {
      entityType: 'client',
      entityId: String(clientID || ''),
      action: 'client_credential_added',
      actionLabel: 'Added Credential',
      summary: `Added credential "${systemName || 'Untitled Credential'}".`,
      details: { clientID: String(clientID || ''), credentialID }
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
    const db = await getMongoDb();
    const ids = userIdCandidates(id);
    const existingCredential = await db.collection<any>('credentials').findOne({
      $or: [{ _id: { $in: ids } }, { credentialID: { $in: ids } }]
    });
    const updates: any = { updatedAt: new Date() };
    if (systemName !== undefined) updates.systemName = systemName;
    if (username !== undefined) updates.username = username;
    if (password !== undefined) updates.password = password;
    if (securityAnswer !== undefined) updates.securityAnswer = securityAnswer;
    if (remarks !== undefined) updates.remarks = remarks;
    const credentialBefore = {
      systemName: existingCredential?.systemName || '',
      username: existingCredential?.username || '',
      password: existingCredential?.password || '',
      securityAnswer: existingCredential?.securityAnswer || '',
      remarks: existingCredential?.remarks || ''
    };
    const credentialAfter = {
      systemName: systemName ?? existingCredential?.systemName ?? '',
      username: username ?? existingCredential?.username ?? '',
      password: password ?? existingCredential?.password ?? '',
      securityAnswer: securityAnswer ?? existingCredential?.securityAnswer ?? '',
      remarks: remarks ?? existingCredential?.remarks ?? ''
    };
    const credentialDetails = buildChangedAuditDetails(credentialBefore, credentialAfter);
    if (existingCredential && credentialDetails.changedKeys.length === 0) {
      return res.status(200).json({ success: true, unchanged: true });
    }

    const result = await db.collection<any>('credentials').updateOne(
      { $or: [{ _id: { $in: ids } }, { credentialID: { $in: ids } }] },
      { $set: updates }
    );

    if (result.matchedCount === 0) return res.status(404).json({ error: 'Credential not found' });
    await writeAuditLog(db, req, {
      entityType: 'client',
      entityId: String(existingCredential?.clientID || ''),
      action: 'client_credential_updated',
      actionLabel: 'Updated Credential',
      summary: buildFieldChangeSummary(credentialBefore, credentialAfter, `Updated credential "${systemName || existingCredential?.systemName || 'Untitled Credential'}".`),
      details: {
        clientID: String(existingCredential?.clientID || ''),
        credentialID: String(existingCredential?.credentialID || existingCredential?._id || id),
        before: credentialDetails.before,
        after: credentialDetails.after
      }
    });

    return res.status(200).json({ success: true });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

app.delete('/api/credentials/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const db = await getMongoDb();
    const requestUser = await getRequestUser(req);
    if (!await canDeleteCredential(db, requestUser, id)) {
      return res.status(403).json({ error: 'You do not have permission to delete this credential' });
    }

    const ids = userIdCandidates(id);
    const existingCredential = await db.collection<any>('credentials').findOne({
      $or: [{ _id: { $in: ids } }, { credentialID: { $in: ids } }]
    });
    const result = await db.collection<any>('credentials').deleteOne({ $or: [{ _id: { $in: ids } }, { credentialID: { $in: ids } }] });
    if (result.deletedCount === 0) return res.status(404).json({ error: 'Credential not found' });
    await writeAuditLog(db, req, {
      entityType: 'client',
      entityId: String(existingCredential?.clientID || ''),
      action: 'client_credential_deleted',
      actionLabel: 'Deleted Credential',
      summary: `Deleted credential "${existingCredential?.systemName || 'Untitled Credential'}".`,
      details: {
        clientID: String(existingCredential?.clientID || ''),
        credentialID: String(existingCredential?.credentialID || existingCredential?._id || id)
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
    const db = await getMongoDb();
    const requestUser = await getRequestUser(req);
    const transmittal = await db.collection<any>('transmittals').findOne({ _id: id });
    if (!canDeleteTransmittalRecord(requestUser, transmittal)) {
      return res.status(403).json({ error: 'You do not have permission to delete this transmittal' });
    }

    const result = await db.collection<any>('transmittals').deleteOne({ _id: id });
    if (result.deletedCount === 0) return res.status(404).json({ error: 'Transmittal not found' });
    await writeAuditLog(db, req, {
      entityType: 'transmittal',
      entityId: String(transmittal?.transmittalID || transmittal?._id || id),
      action: 'transmittal_deleted',
      actionLabel: 'Deleted Transmittal',
      summary: `Deleted transmittal #${transmittal?.transmittalID || id}.`,
      details: {
        transmittalID: String(transmittal?.transmittalID || transmittal?._id || id),
        clientID: transmittal?.clientID || '',
        userID: transmittal?.userID || '',
        itemCount: String(transmittal?.items || '').split('||').filter(Boolean).length
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
    const db = await getMongoDb();
    const requestUser = await getRequestUser(req);
    if (!canDeleteMeetingRecord(requestUser)) {
      return res.status(403).json({ error: 'Only Admin, Manager, Supervisor, or Senior can delete meetings' });
    }

    const meeting = await db.collection<any>('meetings').findOne({ _id: id });
    const result = await db.collection<any>('meetings').deleteOne({ _id: id });
    if (result.deletedCount === 0) return res.status(404).json({ error: 'Meeting not found' });
    await writeAuditLog(db, req, {
      entityType: 'meeting',
      entityId: String(meeting?.meetingID || meeting?._id || id),
      action: 'meeting_deleted',
      actionLabel: 'Deleted Meeting',
      summary: `Deleted meeting "${meeting?.subject || id}".`,
      details: {
        meetingID: String(meeting?.meetingID || meeting?._id || id),
        date: meeting?.date || '',
        attendeeCount: String(meeting?.userIDs || '').split(',').filter(Boolean).length
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
