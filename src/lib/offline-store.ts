import type { AxiosError } from "axios";

export type OfflineStatus = "pending" | "syncing" | "synchronized" | "failed" | "conflict";
export type OfflineOperation = {
  operationId: string;
  deviceId: string;
  operationType: string;
  status: OfflineStatus;
  payload: Record<string, unknown>;
  baseVersions?: Record<string, unknown>;
  clientCreatedAt: string;
  result?: Record<string, unknown> | null;
  error?: string | null;
  conflict?: Record<string, unknown> | null;
  attempts: number;
};

const DB_NAME = "procurement-sys-offline";
const DB_VERSION = 1;
const OPERATION_STORE = "operations";
const SNAPSHOT_STORE = "snapshots";
const DEVICE_KEY = "procurement_sys_device_id";

function database(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(OPERATION_STORE)) db.createObjectStore(OPERATION_STORE, { keyPath: "operationId" });
      if (!db.objectStoreNames.contains(SNAPSHOT_STORE)) db.createObjectStore(SNAPSHOT_STORE, { keyPath: "id" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Unable to open offline storage."));
  });
}

function transaction<T>(storeName: string, mode: IDBTransactionMode, action: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return database().then((db) => new Promise<T>((resolve, reject) => {
    const request = action(db.transaction(storeName, mode).objectStore(storeName));
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Offline storage operation failed."));
  }));
}

export function offlineDeviceId(): string {
  const existing = localStorage.getItem(DEVICE_KEY);
  if (existing) return existing;
  const created = crypto.randomUUID();
  localStorage.setItem(DEVICE_KEY, created);
  return created;
}

function keyMaterial(): Promise<CryptoKey> {
  const token = localStorage.getItem("auth_token") ?? "offline-session";
  return crypto.subtle.digest("SHA-256", new TextEncoder().encode(token)).then((hash) => crypto.subtle.importKey("raw", hash, "AES-GCM", false, ["encrypt", "decrypt"]));
}

async function encrypt(value: unknown): Promise<{ iv: string; data: string }> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const bytes = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await keyMaterial(), new TextEncoder().encode(JSON.stringify(value)));
  return { iv: Array.from(iv, (byte) => byte.toString(16).padStart(2, "0")).join(""), data: btoa(String.fromCharCode(...new Uint8Array(bytes))) };
}

async function decrypt<T>(value: { iv: string; data: string }): Promise<T> {
  const iv = new Uint8Array(value.iv.match(/.{2}/g)?.map((part) => Number.parseInt(part, 16)) ?? []);
  const bytes = Uint8Array.from(atob(value.data), (char) => char.charCodeAt(0));
  const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, await keyMaterial(), bytes);
  return JSON.parse(new TextDecoder().decode(plain)) as T;
}

export async function queueOfflineOperation(operationType: string, payload: Record<string, unknown>, baseVersions: Record<string, unknown> = {}): Promise<OfflineOperation> {
  const operation: OfflineOperation = { operationId: crypto.randomUUID(), deviceId: offlineDeviceId(), operationType, status: "pending", payload, baseVersions, clientCreatedAt: new Date().toISOString(), attempts: 0 };
  const encrypted = await encrypt(operation);
  await transaction(OPERATION_STORE, "readwrite", (store) => store.put({ operationId: operation.operationId, encrypted: true, value: encrypted }));
  return operation;
}

export async function listOfflineOperations(): Promise<OfflineOperation[]> {
  const records = await transaction<unknown[]>(OPERATION_STORE, "readonly", (store) => store.getAll());
  const items = await Promise.all((records as Array<{ value: { iv: string; data: string } }>).map((record) => decrypt<OfflineOperation>(record.value)));
  return items.sort((a, b) => b.clientCreatedAt.localeCompare(a.clientCreatedAt));
}

export async function updateOfflineOperation(operationId: string, update: Partial<OfflineOperation>): Promise<void> {
  const current = (await listOfflineOperations()).find((item) => item.operationId === operationId);
  if (!current) return;
  const encrypted = await encrypt({ ...current, ...update });
  await transaction(OPERATION_STORE, "readwrite", (store) => store.put({ operationId, encrypted: true, value: encrypted }));
}

export async function saveOfflineSnapshot(snapshot: unknown): Promise<void> {
  const encrypted = await encrypt(snapshot);
  await transaction(SNAPSHOT_STORE, "readwrite", (store) => store.put({ id: "current", encrypted: true, value: encrypted }));
}

export async function loadOfflineSnapshot<T>(): Promise<T | null> {
  try {
    const record = await transaction<{ value: { iv: string; data: string } } | undefined>(SNAPSHOT_STORE, "readonly", (store) => store.get("current"));
    return record ? await decrypt<T>(record.value) : null;
  } catch { return null; }
}

export function isNetworkError(error: unknown): boolean {
  const candidate = error as AxiosError | undefined;
  return !candidate?.response || candidate.code === "ERR_NETWORK";
}
