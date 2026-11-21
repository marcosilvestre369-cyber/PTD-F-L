import type { Request, Response } from 'express';

const parsedEnvLimit = Number(process.env.MAX_CONCURRENT_TASKS);
export const MAX_CONCURRENT_TASKS =
  Number.isInteger(parsedEnvLimit) && parsedEnvLimit >= 1 && parsedEnvLimit <= 16
    ? parsedEnvLimit
    : 4;

// Limite de segurança abaixo dos 120s recomendados pela Hostinger
export const MAX_TASK_TIMEOUT_MS = 110_000;
export const DEFAULT_TASK_TIMEOUT_MS = 25_000;
export const HEAVY_TASK_TIMEOUT_MS = 90_000;
export const MAX_WAITING_TASKS = 100;

export class TaskTimeoutError extends Error {
  public readonly statusCode = 504;
  constructor(label: string, timeoutMs: number) {
    super(`A operação "${label}" excedeu o tempo limite (${Math.round(timeoutMs / 1000)}s).`);
    this.name = 'TaskTimeoutError';
  }
}

export class TaskQueueFullError extends Error {
  public readonly statusCode = 503;
  constructor() {
    super('Servidor temporariamente ocupado. Por favor tente novamente dentro de instantes.');
    this.name = 'TaskQueueFullError';
  }
}

export class TaskAbortedError extends Error {
  public readonly statusCode = 499;
  constructor() {
    super('Pedido cancelado pelo cliente.');
    this.name = 'TaskAbortedError';
  }
}

interface QueuedTask<T> {
  task: () => Promise<T> | T;
  resolve: (value: T) => void;
  reject: (reason?: unknown) => void;
  timeoutMs: number;
  label: string;
  signal?: AbortSignal;
  onAbort?: () => void;
}

let activeTasks = 0;
const waitingTasks: QueuedTask<any>[] = [];

function clampTimeout(ms?: number): number {
  if (typeof ms !== 'number' || !Number.isFinite(ms) || ms <= 0) {
    return DEFAULT_TASK_TIMEOUT_MS;
  }
  return Math.min(ms, MAX_TASK_TIMEOUT_MS);
}

/**
 * Executa uma tarefa pesada respeitando o limite global partilhado (MAX_CONCURRENT_TASKS),
 * garantindo timeout por tarefa e cancelamento automático em fila se o cliente desligar.
 */
export function runWithLimit<T>(
  task: () => Promise<T> | T,
  options?: {
    timeoutMs?: number;
    label?: string;
    signal?: AbortSignal;
  }
): Promise<T> {
  const signal = options?.signal;
  if (signal?.aborted) {
    return Promise.reject(new TaskAbortedError());
  }

  if (waitingTasks.length >= MAX_WAITING_TASKS) {
    return Promise.reject(new TaskQueueFullError());
  }

  const timeoutMs = clampTimeout(options?.timeoutMs);
  const label = options?.label || 'tarefa';

  return new Promise<T>((resolve, reject) => {
    const item: QueuedTask<T> = {
      task,
      resolve,
      reject,
      timeoutMs,
      label,
      signal,
    };

    if (signal) {
      const onAbort = () => {
        const idx = waitingTasks.indexOf(item);
        if (idx !== -1) {
          waitingTasks.splice(idx, 1);
          reject(new TaskAbortedError());
        }
      };
      item.onAbort = onAbort;
      signal.addEventListener('abort', onAbort, { once: true });
    }

    waitingTasks.push(item);
    processQueue();
  });
}

async function processQueue(): Promise<void> {
  while (activeTasks < MAX_CONCURRENT_TASKS && waitingTasks.length > 0) {
    const item = waitingTasks.shift();
    if (!item) return;

    if (item.signal && item.onAbort) {
      item.signal.removeEventListener('abort', item.onAbort);
    }

    if (item.signal?.aborted) {
      item.reject(new TaskAbortedError());
      continue;
    }

    activeTasks++;
    void executeItem(item);
  }
}

async function executeItem<T>(item: QueuedTask<T>): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | null = null;

  try {
    const executionPromise = Promise.resolve().then(() => item.task());
    const timeoutPromise = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        reject(new TaskTimeoutError(item.label, item.timeoutMs));
      }, item.timeoutMs);
    });

    const result = await Promise.race([executionPromise, timeoutPromise]);
    item.resolve(result);
  } catch (error) {
    item.reject(error);
  } finally {
    if (timer) {
      clearTimeout(timer);
    }
    activeTasks--;
    if (waitingTasks.length > 0) {
      setImmediate(() => {
        void processQueue();
      });
    }
  }
}

/**
 * Cria um AbortSignal associado ao ciclo de vida do pedido HTTP,
 * permitindo remover imediatamente da fila pedidos cancelados pelo navegador.
 */
export function createRequestAbortController(_req: Request, res: Response): {
  signal: AbortSignal;
  cleanup: () => void;
} {
  const controller = new AbortController();

  const onClose = () => {
    if (!res.writableEnded) {
      controller.abort();
    }
  };

  res.on('close', onClose);

  return {
    signal: controller.signal,
    cleanup: () => {
      res.off('close', onClose);
    },
  };
}

export function getLimiterStats() {
  return {
    maxConcurrentTasks: MAX_CONCURRENT_TASKS,
    activeTasks,
    waitingTasks: waitingTasks.length,
    maxWaitingTasks: MAX_WAITING_TASKS,
  };
}
