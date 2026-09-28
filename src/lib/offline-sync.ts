import { apiClient } from "@/api/client.ts";
import { getApiErrorMessage } from "@/api/client.ts";
import { listOfflineOperations, saveOfflineSnapshot, updateOfflineOperation, type OfflineOperation, type OfflineStatus } from "@/lib/offline-store.ts";

type SyncResponse = { data?: { results?: Array<{ operationId: string; status: OfflineStatus; result?: Record<string, unknown> | null; error?: string | null; conflict?: Record<string, unknown> | null }> } };

let syncInFlight: Promise<OfflineOperation[]> | null = null;

export async function refreshOfflineSnapshot(): Promise<void> {
  const response = await apiClient.get("/offline/snapshot");
  await saveOfflineSnapshot(response.data?.data ?? response.data);
}

export async function syncPendingOperations(): Promise<OfflineOperation[]> {
  if (syncInFlight) return syncInFlight;
  syncInFlight = syncPendingOperationsInternal().finally(() => { syncInFlight = null; });
  return syncInFlight;
}

async function syncPendingOperationsInternal(): Promise<OfflineOperation[]> {
  const operations = (await listOfflineOperations()).filter((operation) => operation.status === "pending" || operation.status === "failed" || operation.status === "conflict");
  if (!operations.length) return listOfflineOperations();
  await Promise.all(operations.map((operation) => updateOfflineOperation(operation.operationId, { status: "syncing", attempts: operation.attempts + 1 })));
  try {
    const response = await apiClient.post<SyncResponse>("/offline/sync", { operations: operations.map((operation) => ({ operationId: operation.operationId, deviceId: operation.deviceId, operationType: operation.operationType, payload: operation.payload, baseVersions: operation.baseVersions, clientCreatedAt: operation.clientCreatedAt })) });
    for (const result of response.data?.data?.results ?? []) await updateOfflineOperation(result.operationId, { status: result.status, result: result.result, error: result.error, conflict: result.conflict });
  } catch (error) {
    const message = getApiErrorMessage(error, "Synchronization could not reach the server.");
    await Promise.all(operations.map((operation) => updateOfflineOperation(operation.operationId, { status: "failed", error: message })));
  }
  return listOfflineOperations();
}
