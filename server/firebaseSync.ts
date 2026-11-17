import fs from 'fs';
import path from 'path';
import { initializeApp } from 'firebase/app';
import {
  initializeFirestore,
  getFirestore,
  doc,
  setDoc,
  deleteDoc,
  getDoc,
  getDocs,
  collection,
  writeBatch,
  getDocFromServer,
  Firestore,
} from 'firebase/firestore';
import type {
  Collaborator,
  DailyTask,
  MealSchedule,
  Article,
  StockRecord,
  AuditLog,
  PdeRequest,
  InAppNotification,
  ImportRecord,
} from '../src/types/index.ts';

export interface DailyStatistic {
  id: string; // date YYYY-MM-DD
  date: string;
  totalTasks: number;
  completedTasks: number;
  notDoneTasks: number;
  pendingTasks: number;
  completionRate: number; // percentage
  totalExcessItems: number;
  totalExcessBoxes: number;
  totalRuptures: number;
  resolvedStocks: number;
  pendingStocks: number;
  activeCollaboratorsCount: number;
  updatedAt: string;
}

let db: Firestore | null = null;
let isInitialized = false;
let activeProjectId = '';
let activeDatabaseId = '(default)';

interface ResolvedFirebaseConfig {
  apiKey: string;
  authDomain: string;
  projectId: string;
  storageBucket?: string;
  messagingSenderId?: string;
  appId: string;
  firestoreDatabaseId?: string;
}

function cleanEnvValue(value: string | undefined): string {
  if (!value) return '';
  return value.trim().replace(/^['"]+|['"]+$/g, '').trim();
}

function resolveFirebaseConfig(): ResolvedFirebaseConfig | null {
  let fileConfig: Partial<ResolvedFirebaseConfig> = {};
  const configPath = path.resolve(process.cwd(), 'firebase-applet-config.json');

  if (fs.existsSync(configPath)) {
    try {
      fileConfig = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    } catch (err) {
      console.warn('[Firebase] Erro ao ler firebase-applet-config.json:', err);
    }
  }

  const apiKey = cleanEnvValue(process.env.FIREBASE_API_KEY) || fileConfig.apiKey || '';
  const projectId = cleanEnvValue(process.env.FIREBASE_PROJECT_ID) || fileConfig.projectId || '';
  const appId = cleanEnvValue(process.env.FIREBASE_APP_ID) || fileConfig.appId || '';
  const authDomain =
    cleanEnvValue(process.env.FIREBASE_AUTH_DOMAIN) ||
    fileConfig.authDomain ||
    (projectId ? `${projectId}.firebaseapp.com` : '');
  const storageBucket =
    cleanEnvValue(process.env.FIREBASE_STORAGE_BUCKET) ||
    fileConfig.storageBucket ||
    (projectId ? `${projectId}.firebasestorage.app` : '');
  const messagingSenderId =
    cleanEnvValue(process.env.FIREBASE_MESSAGING_SENDER_ID) || fileConfig.messagingSenderId || '';
  const firestoreDatabaseId =
    cleanEnvValue(process.env.FIREBASE_FIRESTORE_DATABASE_ID) || fileConfig.firestoreDatabaseId || '(default)';

  if (!apiKey || !projectId || !appId) {
    return null;
  }

  return {
    apiKey,
    authDomain,
    projectId,
    storageBucket,
    messagingSenderId,
    appId,
    firestoreDatabaseId,
  };
}

export function getFirebaseConfigInfo() {
  const cfg = resolveFirebaseConfig();
  return {
    projectId: activeProjectId || cfg?.projectId || 'não configurado',
    databaseId: activeDatabaseId !== '(default)' ? activeDatabaseId : cfg?.firestoreDatabaseId || '(default)',
    connected: isInitialized && db !== null,
  };
}

const FIRESTORE_OP_TIMEOUT_MS = 4500;
const FIRESTORE_HYDRATE_TIMEOUT_MS = 8000;

async function withTimeout<T>(promise: Promise<T>, ms: number, label: string, fallback: T): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | null = null;
  try {
    return await Promise.race([
      promise,
      new Promise<T>(resolve => {
        timer = setTimeout(() => {
          console.warn(`[Firebase] Timeout (${ms}ms) em ${label}. A continuar sem bloquear.`);
          resolve(fallback);
        }, ms);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export function initFirebase(): Firestore | null {
  if (isInitialized && db) return db;

  try {
    const config = resolveFirebaseConfig();
    if (!config) {
      console.warn(
        '[Firebase] Configuração não encontrada. Defina as variáveis FIREBASE_* ou disponibilize firebase-applet-config.json.'
      );
      return null;
    }

    const app = initializeApp({
      apiKey: config.apiKey,
      authDomain: config.authDomain,
      projectId: config.projectId,
      storageBucket: config.storageBucket,
      messagingSenderId: config.messagingSenderId,
      appId: config.appId,
    });

    // Conectar à base de dados Firestore aprovisionada (Long Polling evita bloqueios WebChannel em Node/Hostinger)
    const databaseId = config.firestoreDatabaseId || '(default)';
    try {
      db = initializeFirestore(app, { experimentalForceLongPolling: true }, databaseId);
    } catch {
      db = getFirestore(app, databaseId);
    }
    activeProjectId = config.projectId;
    activeDatabaseId = databaseId;
    isInitialized = true;
    console.log(`[Firebase] Conectado com sucesso ao Firestore (${config.projectId} / ${databaseId})`);

    // Validar conexão conforme diretivas (em background sem bloquear)
    testConnection(db).catch(() => {});
    return db;
  } catch (error) {
    console.error('[Firebase] Erro ao inicializar Firestore:', error);
    return null;
  }
}

async function testConnection(firestoreDb: Firestore) {
  try {
    await withTimeout(
      getDocFromServer(doc(firestoreDb, 'test', 'connection')).then(() => true),
      FIRESTORE_OP_TIMEOUT_MS,
      'testConnection',
      false
    );
  } catch (error: any) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.warn('[Firebase] Aviso de conexão offline:', error.message);
    }
  }
}

/**
 * Remove recursivamente todos os campos com valor undefined para que o Firestore
 * setDoc/updateDoc nunca falhe com "Unsupported field value: undefined".
 */
export function sanitizeForFirestore<T>(data: T): T {
  if (data === null || data === undefined) {
    return null as any;
  }
  if (Array.isArray(data)) {
    return data.map(item => sanitizeForFirestore(item)) as any;
  }
  if (typeof data === 'object' && !(data instanceof Date)) {
    const cleaned: Record<string, any> = {};
    for (const [key, val] of Object.entries(data)) {
      if (val !== undefined) {
        cleaned[key] = sanitizeForFirestore(val);
      }
    }
    return cleaned as T;
  }
  return data;
}

const FIRESTORE_BATCH_LIMIT = 400;

/**
 * Gravação em lotes (chunks de até 400 documentos) no Firestore.
 */
export async function syncDocumentsBatch(
  collectionName: string,
  items: Array<{ id: string } & Record<string, any>>
): Promise<boolean> {
  if (!items || items.length === 0) return true;
  const firestore = initFirebase();
  if (!firestore) return false;

  try {
    for (let i = 0; i < items.length; i += FIRESTORE_BATCH_LIMIT) {
      const chunk = items.slice(i, i + FIRESTORE_BATCH_LIMIT);
      const batch = writeBatch(firestore);
      for (const item of chunk) {
        if (!item?.id) continue;
        batch.set(doc(firestore, collectionName, item.id), sanitizeForFirestore(item));
      }
      const ok = await withTimeout(
        batch.commit().then(() => true),
        FIRESTORE_OP_TIMEOUT_MS,
        `syncDocumentsBatch(${collectionName})`,
        false
      );
      if (!ok) return false;
    }
    return true;
  } catch (err) {
    console.warn(`[Firebase] Erro ao gravar lote em ${collectionName}:`, err);
    return false;
  }
}

/**
 * Remoção em lotes (chunks de até 400 documentos) no Firestore.
 */
export async function deleteDocumentsBatch(collectionName: string, ids: string[]): Promise<boolean> {
  const uniqueIds = Array.from(new Set((ids || []).filter(Boolean)));
  if (uniqueIds.length === 0) return true;
  const firestore = initFirebase();
  if (!firestore) return false;

  try {
    for (let i = 0; i < uniqueIds.length; i += FIRESTORE_BATCH_LIMIT) {
      const chunk = uniqueIds.slice(i, i + FIRESTORE_BATCH_LIMIT);
      const batch = writeBatch(firestore);
      for (const id of chunk) {
        batch.delete(doc(firestore, collectionName, id));
      }
      const ok = await withTimeout(
        batch.commit().then(() => true),
        FIRESTORE_OP_TIMEOUT_MS,
        `deleteDocumentsBatch(${collectionName})`,
        false
      );
      if (!ok) return false;
    }
    return true;
  } catch (err) {
    console.warn(`[Firebase] Erro ao apagar lote em ${collectionName}:`, err);
    return false;
  }
}

/**
 * Sincronização completa da base de dados local para o Firestore
 */
export async function syncAllToFirestore(
  data: {
    collaborators: Collaborator[];
    articles: Article[];
    tasks: DailyTask[];
    meals: MealSchedule[];
    stocks: StockRecord[];
    audits: AuditLog[];
    pdes?: PdeRequest[];
    notifications?: InAppNotification[];
    imports?: ImportRecord[];
  },
  options?: { includeArticles?: boolean }
): Promise<boolean> {
  const firestore = initFirebase();
  if (!firestore) return false;

  try {
    const ops: Promise<boolean>[] = [
      syncDocumentsBatch('collaborators', data.collaborators),
      syncDocumentsBatch('tasks', data.tasks),
      syncDocumentsBatch('meals', data.meals),
      syncDocumentsBatch('stocks', data.stocks),
      syncDocumentsBatch('pdes', data.pdes || []),
      syncDocumentsBatch('notifications', data.notifications || []),
      syncDocumentsBatch('imports', data.imports || []),
      syncDocumentsBatch('audits', (data.audits || []).slice(0, 500)),
    ];

    if (options?.includeArticles !== false) {
      ops.push(syncDocumentsBatch('articles', data.articles));
    }

    const results = await Promise.all(ops);
    const allOk = results.every(Boolean);
    if (allOk) {
      console.log('[Firebase] Sincronização completa com o Firestore concluída com sucesso!');
    }
    return allOk;
  } catch (error) {
    console.error('[Firebase] Erro ao sincronizar dados com o Firestore:', error);
    return false;
  }
}

/**
 * Gravação pontual de documento no Firestore (com sanitização automática de undefined)
 */
export async function syncDocument(collectionName: string, id: string, docData: any): Promise<boolean> {
  const firestore = initFirebase();
  if (!firestore) return false;
  try {
    const cleanData = sanitizeForFirestore(docData);
    return await withTimeout(
      setDoc(doc(firestore, collectionName, id), cleanData).then(() => true),
      FIRESTORE_OP_TIMEOUT_MS,
      `syncDocument(${collectionName}/${id})`,
      false
    );
  } catch (err) {
    console.warn(`[Firebase] Erro ao salvar ${collectionName}/${id}:`, err);
    return false;
  }
}

/**
 * Remoção pontual de documento no Firestore
 */
export async function deleteDocument(collectionName: string, id: string): Promise<boolean> {
  const firestore = initFirebase();
  if (!firestore) return false;
  try {
    return await withTimeout(
      deleteDoc(doc(firestore, collectionName, id)).then(() => true),
      FIRESTORE_OP_TIMEOUT_MS,
      `deleteDocument(${collectionName}/${id})`,
      false
    );
  } catch (err) {
    console.warn(`[Firebase] Erro ao apagar ${collectionName}/${id}:`, err);
    return false;
  }
}

/**
 * Gravação e cálculo de estatística diária consolidada
 */
export async function computeAndSaveDailyStat(
  date: string,
  tasks: DailyTask[],
  stocks: StockRecord[],
  activeCollaboratorsCount: number
): Promise<DailyStatistic> {
  const dayTasks = tasks.filter(t => t.date === date);
  const totalTasks = dayTasks.length;
  const completedTasks = dayTasks.filter(t => t.status === 'FEITA').length;
  const notDoneTasks = dayTasks.filter(t => t.status === 'NAO_FEITA').length;
  const pendingTasks = dayTasks.filter(t => t.status === 'POR_ASSINALAR').length;
  const completionRate = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

  const dayStocks = stocks.filter(s => s.registrationDate === date || s.treatmentDate === date);
  const excessList = dayStocks.filter(s => s.type === 'EXCESSO');
  const ruptureList = dayStocks.filter(s => s.type === 'ROTURA');
  const totalExcessItems = excessList.length;
  const totalExcessBoxes = excessList.reduce((acc, curr) => acc + (curr.boxes || 0), 0);
  const totalRuptures = ruptureList.length;
  const resolvedStocks = dayStocks.filter(s => s.status === 'TRATADO' || (s.status as string) === 'RESOLVIDO').length;
  const pendingStocks = dayStocks.filter(s => s.status === 'POR_TRATAR').length;

  const stat: DailyStatistic = {
    id: `stat-${date}`,
    date,
    totalTasks,
    completedTasks,
    notDoneTasks,
    pendingTasks,
    completionRate,
    totalExcessItems,
    totalExcessBoxes,
    totalRuptures,
    resolvedStocks,
    pendingStocks,
    activeCollaboratorsCount,
    updatedAt: new Date().toISOString(),
  };

  await syncDocument('statistics', stat.id, stat);
  return stat;
}

/**
 * Carrega todos os registos persistidos no Firestore para hidratar a base de dados em memória
 */
export async function loadAllFromFirestore(): Promise<{
  collaborators?: Collaborator[];
  articles?: Article[];
  tasks?: DailyTask[];
  meals?: MealSchedule[];
  stocks?: StockRecord[];
  pdes?: PdeRequest[];
  notifications?: InAppNotification[];
  imports?: ImportRecord[];
  audits?: AuditLog[];
} | null> {
  const firestore = initFirebase();
  if (!firestore) return null;

  try {
    const snapshots = await withTimeout(
      Promise.all([
        getDocs(collection(firestore, 'tasks')),
        getDocs(collection(firestore, 'meals')),
        getDocs(collection(firestore, 'stocks')),
        getDocs(collection(firestore, 'pdes')),
        getDocs(collection(firestore, 'notifications')),
        getDocs(collection(firestore, 'collaborators')),
        getDocs(collection(firestore, 'articles')),
        getDocs(collection(firestore, 'imports')),
        getDocs(collection(firestore, 'audits')),
      ]),
      FIRESTORE_HYDRATE_TIMEOUT_MS,
      'loadAllFromFirestore',
      null
    );

    if (!snapshots) {
      return null;
    }

    const [
      tasksSnap,
      mealsSnap,
      stocksSnap,
      pdesSnap,
      notifsSnap,
      colabsSnap,
      articlesSnap,
      importsSnap,
      auditsSnap,
    ] = snapshots;

    const tasks: DailyTask[] = [];
    tasksSnap.forEach(d => {
      const data = d.data() as DailyTask;
      if (data && data.id) tasks.push(data);
    });

    const meals: MealSchedule[] = [];
    mealsSnap.forEach(d => {
      const data = d.data() as MealSchedule;
      if (data && data.id) meals.push(data);
    });

    const stocks: StockRecord[] = [];
    stocksSnap.forEach(d => {
      const data = d.data() as StockRecord;
      if (data && data.id) stocks.push(data);
    });

    const pdes: PdeRequest[] = [];
    pdesSnap.forEach(d => {
      const data = d.data() as PdeRequest;
      if (data && data.id) pdes.push(data);
    });

    const notifications: InAppNotification[] = [];
    notifsSnap.forEach(d => {
      const data = d.data() as InAppNotification;
      if (data && data.id) notifications.push(data);
    });

    const collaborators: Collaborator[] = [];
    colabsSnap.forEach(d => {
      const data = d.data() as Collaborator;
      if (data && data.id) collaborators.push(data);
    });

    const articles: Article[] = [];
    articlesSnap.forEach(d => {
      const data = d.data() as Article;
      if (data && data.id) articles.push(data);
    });

    const imports: ImportRecord[] = [];
    importsSnap.forEach(d => {
      const data = d.data() as ImportRecord;
      if (data && data.id) imports.push(data);
    });

    const audits: AuditLog[] = [];
    auditsSnap.forEach(d => {
      const data = d.data() as AuditLog;
      if (data && data.id) audits.push(data);
    });

    console.log(
      `[Firebase] Carregados do Firestore: ${tasks.length} tarefas, ${meals.length} refeições, ${stocks.length} stocks, ${pdes.length} PDEs, ${imports.length} importações, ${collaborators.length} colaboradores, ${articles.length} artigos, ${audits.length} auditorias.`
    );

    return {
      tasks,
      meals,
      stocks,
      pdes,
      notifications,
      collaborators,
      articles,
      imports,
      audits,
    };
  } catch (error) {
    console.warn('[Firebase] Erro ao carregar dados do Firestore (usando armazenamento local):', error);
    return null;
  }
}

