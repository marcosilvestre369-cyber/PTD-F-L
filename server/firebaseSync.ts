import fs from 'fs';
import path from 'path';
import { initializeApp } from 'firebase/app';
import {
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

  const apiKey = process.env.FIREBASE_API_KEY || fileConfig.apiKey || '';
  const projectId = process.env.FIREBASE_PROJECT_ID || fileConfig.projectId || '';
  const appId = process.env.FIREBASE_APP_ID || fileConfig.appId || '';
  const authDomain =
    process.env.FIREBASE_AUTH_DOMAIN ||
    fileConfig.authDomain ||
    (projectId ? `${projectId}.firebaseapp.com` : '');
  const storageBucket =
    process.env.FIREBASE_STORAGE_BUCKET ||
    fileConfig.storageBucket ||
    (projectId ? `${projectId}.firebasestorage.app` : '');
  const messagingSenderId =
    process.env.FIREBASE_MESSAGING_SENDER_ID || fileConfig.messagingSenderId || '';
  const firestoreDatabaseId =
    process.env.FIREBASE_FIRESTORE_DATABASE_ID || fileConfig.firestoreDatabaseId || '(default)';

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

    // Conectar à base de dados Firestore aprovisionada
    const databaseId = config.firestoreDatabaseId || '(default)';
    db = getFirestore(app, databaseId);
    activeProjectId = config.projectId;
    activeDatabaseId = databaseId;
    isInitialized = true;
    console.log(`[Firebase] Conectado com sucesso ao Firestore (${config.projectId} / ${databaseId})`);

    // Validar conexão conforme diretivas
    testConnection(db);
    return db;
  } catch (error) {
    console.error('[Firebase] Erro ao inicializar Firestore:', error);
    return null;
  }
}

async function testConnection(firestoreDb: Firestore) {
  try {
    await getDocFromServer(doc(firestoreDb, 'test', 'connection'));
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

/**
 * Sincronização inicial de toda a base de dados
 */
export async function syncAllToFirestore(data: {
  collaborators: Collaborator[];
  articles: Article[];
  tasks: DailyTask[];
  meals: MealSchedule[];
  stocks: StockRecord[];
  audits: AuditLog[];
  pdes?: PdeRequest[];
  notifications?: InAppNotification[];
}): Promise<boolean> {
  const firestore = initFirebase();
  if (!firestore) return false;

  try {
    // 1. Sincronizar Colaboradores em batch
    const colabBatch = writeBatch(firestore);
    for (const c of data.collaborators) {
      colabBatch.set(doc(firestore, 'collaborators', c.id), sanitizeForFirestore(c));
    }
    await colabBatch.commit();

    // 2. Sincronizar Artigos do catálogo (em lotes de até 400 documentos)
    const chunkSize = 400;
    for (let i = 0; i < data.articles.length; i += chunkSize) {
      const chunk = data.articles.slice(i, i + chunkSize);
      const articleBatch = writeBatch(firestore);
      for (const a of chunk) {
        articleBatch.set(doc(firestore, 'articles', a.id), sanitizeForFirestore(a));
      }
      await articleBatch.commit();
    }

    // 3. Sincronizar Tarefas
    for (let i = 0; i < data.tasks.length; i += chunkSize) {
      const chunk = data.tasks.slice(i, i + chunkSize);
      const taskBatch = writeBatch(firestore);
      for (const t of chunk) {
        taskBatch.set(doc(firestore, 'tasks', t.id), sanitizeForFirestore(t));
      }
      await taskBatch.commit();
    }

    // 4. Sincronizar Horários de Refeição
    for (let i = 0; i < data.meals.length; i += chunkSize) {
      const chunk = data.meals.slice(i, i + chunkSize);
      const mealBatch = writeBatch(firestore);
      for (const m of chunk) {
        mealBatch.set(doc(firestore, 'meals', m.id), sanitizeForFirestore(m));
      }
      await mealBatch.commit();
    }

    // 5. Sincronizar Stocks
    if (data.stocks.length > 0) {
      const stockBatch = writeBatch(firestore);
      for (const s of data.stocks) {
        stockBatch.set(doc(firestore, 'stocks', s.id), sanitizeForFirestore(s));
      }
      await stockBatch.commit();
    }

    // 6. Sincronizar PDEs
    if (data.pdes && data.pdes.length > 0) {
      const pdeBatch = writeBatch(firestore);
      for (const p of data.pdes) {
        pdeBatch.set(doc(firestore, 'pdes', p.id), sanitizeForFirestore(p));
      }
      await pdeBatch.commit();
    }

    // 7. Sincronizar Notificações
    if (data.notifications && data.notifications.length > 0) {
      const notifBatch = writeBatch(firestore);
      for (const n of data.notifications) {
        notifBatch.set(doc(firestore, 'notifications', n.id), sanitizeForFirestore(n));
      }
      await notifBatch.commit();
    }

    console.log('[Firebase] Sincronização inicial concluída com sucesso!');
    return true;
  } catch (error) {
    console.error('[Firebase] Erro ao sincronizar dados com o Firestore:', error);
    return false;
  }
}

/**
 * Gravação pontual de documento no Firestore (com sanitização automática de undefined)
 */
export async function syncDocument(collectionName: string, id: string, docData: any) {
  const firestore = initFirebase();
  if (!firestore) return;
  try {
    const cleanData = sanitizeForFirestore(docData);
    await setDoc(doc(firestore, collectionName, id), cleanData);
  } catch (err) {
    console.warn(`[Firebase] Erro ao salvar ${collectionName}/${id}:`, err);
  }
}

/**
 * Remoção pontual de documento no Firestore
 */
export async function deleteDocument(collectionName: string, id: string) {
  const firestore = initFirebase();
  if (!firestore) return;
  try {
    await deleteDoc(doc(firestore, collectionName, id));
  } catch (err) {
    console.warn(`[Firebase] Erro ao apagar ${collectionName}/${id}:`, err);
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
  tasks?: DailyTask[];
  meals?: MealSchedule[];
  stocks?: StockRecord[];
  pdes?: PdeRequest[];
  notifications?: InAppNotification[];
} | null> {
  const firestore = initFirebase();
  if (!firestore) return null;

  try {
    const [tasksSnap, mealsSnap, stocksSnap, pdesSnap, notifsSnap, colabsSnap] = await Promise.all([
      getDocs(collection(firestore, 'tasks')),
      getDocs(collection(firestore, 'meals')),
      getDocs(collection(firestore, 'stocks')),
      getDocs(collection(firestore, 'pdes')),
      getDocs(collection(firestore, 'notifications')),
      getDocs(collection(firestore, 'collaborators')),
    ]);

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

    console.log(
      `[Firebase] Carregados do Firestore: ${tasks.length} tarefas, ${meals.length} refeições, ${stocks.length} stocks, ${pdes.length} PDEs, ${notifications.length} notificações, ${collaborators.length} colaboradores.`
    );

    return {
      tasks,
      meals,
      stocks,
      pdes,
      notifications,
      collaborators,
    };
  } catch (error) {
    console.warn('[Firebase] Erro ao carregar dados do Firestore (usando armazenamento local):', error);
    return null;
  }
}

