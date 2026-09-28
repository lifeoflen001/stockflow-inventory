import { Activity, Boxes, ShieldCheck, ShoppingCart, Warehouse } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Bar, BarChart, CartesianGrid, Cell, Legend, Pie, PieChart as RechartsPieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { OperationalRole, OperationsDashboardSnapshot } from "@/types/operations.ts";
import { Badge } from "@/components/ui/badge.tsx";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card.tsx";

type DashboardRole = OperationalRole;

function EmptyPanel({ icon: Icon, title, description }: { icon: LucideIcon; title: string; description: string }) {
  return <div className="flex min-h-28 flex-col items-center justify-center px-4 py-4 text-center"><Icon className="mb-2 size-7 text-muted-foreground/40" /><p className="text-sm font-medium">{title}</p><p className="mt-1 max-w-sm text-xs text-muted-foreground">{description}</p></div>;
}

function ChartCard({ title, description, children }: { title: string; description: string; children: React.ReactNode }) {
  return <Card className="shadow-sm"><CardHeader className="px-4 py-3"><CardTitle className="text-sm">{title}</CardTitle><CardDescription>{description}</CardDescription></CardHeader><CardContent className="px-4 pb-4">{children}</CardContent></Card>;
}

const formatMoney = (value: number, currency: string) => `${currency} ${value.toLocaleString("en-TZ", { maximumFractionDigits: 0 })}`;

function SupplierCard({ snapshot, currency }: { snapshot: OperationsDashboardSnapshot; currency: string }) {
  return <ChartCard title="Supplier performance" description="Order volume, committed spend and overdue deliveries.">{snapshot.supplierPerformance.length ? <div className="overflow-x-auto"><table className="w-full text-left text-xs"><thead className="border-b text-muted-foreground"><tr><th className="pb-2 font-medium">Supplier</th><th className="pb-2 text-right font-medium">Orders</th><th className="pb-2 text-right font-medium">Spend</th><th className="pb-2 text-right font-medium">Late</th></tr></thead><tbody className="divide-y">{snapshot.supplierPerformance.map((supplier) => <tr key={supplier.name}><td className="py-2 font-medium">{supplier.name}</td><td className="py-2 text-right">{supplier.orders}</td><td className="py-2 text-right">{formatMoney(supplier.spend, currency)}</td><td className="py-2 text-right">{supplier.overdue ? <Badge variant="destructive" className="text-[10px]">{supplier.overdue}</Badge> : <span className="text-emerald-600">0</span>}</td></tr>)}</tbody></table></div> : <EmptyPanel icon={ShieldCheck} title="No supplier history yet" description="Supplier performance will appear once purchase orders exist." />}</ChartCard>;
}

function WarehouseCard({ snapshot, currency }: { snapshot: OperationsDashboardSnapshot; currency: string }) {
  const maxUnits = Math.max(...snapshot.warehouseComparison.map((item) => item.units), 1);
  return <ChartCard title="Warehouse comparison" description="Current units and inventory value by authorized warehouse.">{snapshot.warehouseComparison.length ? <div className="space-y-2">{snapshot.warehouseComparison.map((warehouse) => <div key={warehouse.id} className="flex items-center gap-3"><span className="w-28 truncate text-xs font-medium">{warehouse.name}</span><div className="h-2 flex-1 rounded-full bg-muted"><div className="h-2 rounded-full bg-primary" style={{ width: `${Math.min(100, Math.max(4, warehouse.units / maxUnits * 100))}%` }} /></div><span className="w-24 text-right text-[11px] text-muted-foreground">{warehouse.units.toLocaleString()} · {formatMoney(warehouse.value, currency)}</span></div>)}</div> : <EmptyPanel icon={Warehouse} title="No warehouse balances yet" description="Warehouse comparison will populate when stock is recorded." />}</ChartCard>;
}

export default function RoleAnalytics({ snapshot, role, currency = "TSHS" }: { snapshot: OperationsDashboardSnapshot; role: DashboardRole; currency?: string }) {
  const charts = snapshot.charts;
  const hasMovement = charts.movementTrend.some((item) => item.received || item.issued || item.transferred || item.adjusted);
  const hasStock = charts.stockStatus.some((item) => item.value > 0);
  const hasPO = charts.purchaseOrderStatus.some((item) => item.value > 0);
  const hasWarehouse = snapshot.warehouseComparison.length > 0;
  const shouldFillLastColumn = role === "super_admin" || role === "store_keeper" || role === "accountant";
  return <div className={`grid gap-4 xl:grid-cols-2 ${shouldFillLastColumn ? "xl:[&>*:last-child]:col-span-2" : ""}`}>
    {(role === "super_admin" || role === "store_keeper") && <ChartCard title={role === "store_keeper" ? "Warehouse stock health" : "Inventory health"} description="Live product quantities compared with reorder levels.">{hasStock ? <ResponsiveContainer width="100%" height={220}><RechartsPieChart><Pie data={charts.stockStatus} dataKey="value" nameKey="name" cx="50%" cy="45%" innerRadius={52} outerRadius={78} paddingAngle={2}>{charts.stockStatus.map((entry, index) => <Cell key={entry.name} fill={["#2563eb", "#f59e0b", "#ef4444"][index % 3]} />)}</Pie><Tooltip /><Legend verticalAlign="bottom" height={28} /></RechartsPieChart></ResponsiveContainer> : <EmptyPanel icon={Boxes} title="No stock balances yet" description="This view will populate as products and stock movements are recorded." />}</ChartCard>}
    {(role === "procurement_manager" || role === "procurement_officer" || role === "accountant") && <ChartCard title={role === "procurement_manager" ? "Procurement pipeline" : role === "accountant" ? "Payment control pipeline" : "Purchase order pipeline"} description="Current purchase orders grouped by live workflow status.">{hasPO ? <ResponsiveContainer width="100%" height={220}><BarChart data={charts.purchaseOrderStatus} margin={{ left: 0, right: 8, top: 8, bottom: 0 }}><CartesianGrid strokeDasharray="3 3" vertical={false} /><XAxis dataKey="name" tick={{ fontSize: 10 }} /><YAxis allowDecimals={false} tick={{ fontSize: 10 }} /><Tooltip /><Bar dataKey="value" name="Orders" fill="#2563eb" radius={[4, 4, 0, 0]} /></BarChart></ResponsiveContainer> : <EmptyPanel icon={ShoppingCart} title="No purchase orders yet" description="The pipeline will populate when procurement records exist." />}</ChartCard>}
    {role === "procurement_manager" && <SupplierCard snapshot={snapshot} currency={currency} />}
    {(role === "super_admin" || role === "store_keeper") && <WarehouseCard snapshot={snapshot} currency={currency} />}
    {(role === "store_keeper" || role === "procurement_officer" || role === "super_admin") && <ChartCard title={role === "store_keeper" ? "Goods movement" : "Goods-flow trend"} description="Receipts, issues, transfers and adjustments from the stock ledger.">{hasMovement ? <ResponsiveContainer width="100%" height={220}><BarChart data={charts.movementTrend} margin={{ left: 0, right: 8, top: 8, bottom: 0 }}><CartesianGrid strokeDasharray="3 3" vertical={false} /><XAxis dataKey="date" tick={{ fontSize: 10 }} /><YAxis allowDecimals={false} tick={{ fontSize: 10 }} /><Tooltip /><Legend wrapperStyle={{ fontSize: 11 }} /><Bar dataKey="received" name="Received" fill="#16a34a" radius={[3, 3, 0, 0]} /><Bar dataKey="issued" name="Issued" fill="#f97316" radius={[3, 3, 0, 0]} /><Bar dataKey="transferred" name="Transferred" fill="#2563eb" radius={[3, 3, 0, 0]} /><Bar dataKey="adjusted" name="Adjusted" fill="#dc2626" radius={[3, 3, 0, 0]} /></BarChart></ResponsiveContainer> : <EmptyPanel icon={Activity} title="No movement history yet" description="The live ledger will appear after receipts, issues or adjustments." />}</ChartCard>}
  </div>;
}
