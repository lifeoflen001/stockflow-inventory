import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, CloudOff, RefreshCw, TriangleAlert } from "lucide-react";
import { apiClient, getApiErrorMessage } from "@/api/client.ts";
import { Badge } from "@/components/ui/badge.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card.tsx";
import { toast } from "@/lib/system-message.ts";
import { listOfflineOperations, type OfflineOperation } from "@/lib/offline-store.ts";
import { refreshOfflineSnapshot, syncPendingOperations } from "@/lib/offline-sync.ts";

type ApiOperation = OfflineOperation;

export default function OfflineSyncPage() {
  const [operations, setOperations] = useState<ApiOperation[]>([]);
  const [online, setOnline] = useState(() => navigator.onLine);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    const local = await listOfflineOperations();
    setOperations(local);
    try {
      const response = await apiClient.get<{ data: ApiOperation[] }>("/offline/operations");
      setOperations(response.data.data ?? local);
    } catch { /* Local queue remains visible when the server is unavailable. */ }
  }, []);

  const synchronize = useCallback(async () => {
    if (!navigator.onLine) { toast.error("Synchronization requires an internet connection."); return; }
    setBusy(true);
    try { await refreshOfflineSnapshot(); await syncPendingOperations(); await refresh(); toast.success("Synchronization completed"); }
    catch (error) { toast.error(getApiErrorMessage(error, "Synchronization failed")); }
    finally { setBusy(false); }
  }, [refresh]);

  useEffect(() => {
    void refresh();
    const onlineHandler = () => { setOnline(true); void synchronize(); };
    const offlineHandler = () => setOnline(false);
    window.addEventListener("online", onlineHandler); window.addEventListener("offline", offlineHandler);
    return () => { window.removeEventListener("online", onlineHandler); window.removeEventListener("offline", offlineHandler); };
  }, [refresh, synchronize]);

  const retry = async (operationId: string) => {
    setBusy(true);
    try { await apiClient.post(`/offline/operations/${encodeURIComponent(operationId)}/retry`); await refresh(); toast.success("Operation retry completed"); }
    catch (error) { toast.error(getApiErrorMessage(error, "Operation retry failed")); }
    finally { setBusy(false); }
  };

  const pending = operations.filter((operation) => ["pending", "syncing"].includes(operation.status)).length;
  const conflicts = operations.filter((operation) => operation.status === "conflict").length;
  return <div className="space-y-6 p-4 pb-24 md:p-6 md:pb-6">
    <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between"><div><Badge variant="outline" className="mb-3 border-primary/20 bg-primary/5 text-primary">Reliable operations</Badge><h1 className="text-2xl font-bold tracking-tight">Offline synchronization</h1><p className="mt-1 text-sm text-muted-foreground">Transactions are encrypted on this device and synchronized only when your permissions and stock snapshot remain valid.</p></div><Button onClick={() => void synchronize()} disabled={busy || !online}><RefreshCw className="size-4" />{busy ? "Syncing…" : "Sync now"}</Button></div>
    <div className="grid gap-4 sm:grid-cols-3"><Summary icon={online ? CheckCircle2 : CloudOff} label="Connection" value={online ? "Online" : "Offline"} tone={online ? "text-emerald-600" : "text-amber-600"} /><Summary icon={RefreshCw} label="Pending operations" value={String(pending)} /><Summary icon={TriangleAlert} label="Conflicts requiring review" value={String(conflicts)} tone={conflicts ? "text-rose-600" : undefined} /></div>
    <Card><CardHeader><CardTitle className="text-base">Operation history</CardTitle></CardHeader><CardContent className="p-0">{operations.length ? <div className="divide-y">{operations.map((operation) => <div key={operation.operationId} className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><p className="font-medium">{operation.operationType.replaceAll("_", " ")}</p><Status status={operation.status} /></div><p className="mt-1 text-xs text-muted-foreground">{new Date(operation.clientCreatedAt).toLocaleString()} · {operation.operationId}</p>{operation.error && <p className="mt-2 text-sm text-rose-600">{operation.error}</p>}{operation.conflict && <p className="mt-2 text-sm text-amber-700">Stock changed on the server. Resolve the conflict against the current balance before retrying.</p>}</div>{["failed", "conflict"].includes(operation.status) && <Button variant="outline" size="sm" disabled={busy || !online} onClick={() => void retry(operation.operationId)}><RefreshCw className="size-3.5" />Retry</Button>}</div>)}</div> : <div className="flex flex-col items-center gap-2 py-16 text-center text-muted-foreground"><RefreshCw className="size-9 text-primary/35" /><p className="font-medium">No offline operations</p><p className="text-sm">When the connection is unavailable, supported stock actions will appear here.</p></div>}</CardContent></Card>
  </div>;
}

function Summary({ icon: Icon, label, value, tone }: { icon: typeof CheckCircle2; label: string; value: string; tone?: string }) { return <Card><CardContent className="flex items-center gap-3 p-4"><Icon className={`size-5 ${tone ?? "text-primary"}`} /><div><p className="text-xs text-muted-foreground">{label}</p><p className="mt-1 text-lg font-semibold">{value}</p></div></CardContent></Card>; }
function Status({ status }: { status: OfflineOperation["status"] }) { const style = status === "synchronized" ? "bg-emerald-100 text-emerald-700" : status === "conflict" ? "bg-amber-100 text-amber-800" : status === "failed" ? "bg-rose-100 text-rose-700" : "bg-primary/10 text-primary"; return <Badge className={style}><span className="capitalize">{status}</span></Badge>; }
