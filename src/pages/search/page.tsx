import { useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { ArrowRight, Banknote, BarChart3, Bell, Building2, CalendarDays, Car, ClipboardList, FileKey, FileSearch, MapPin, Package, Search, Settings, ShoppingCart, Truck, UserRound, Users } from "lucide-react";
import { endpoints } from "@/api/endpoints.ts";
import { useAuth } from "@/hooks/use-auth.ts";
import { useApiQuery } from "@/hooks/use-api.ts";
import { Badge } from "@/components/ui/badge.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Card, CardContent } from "@/components/ui/card.tsx";

type SearchEntry = { label: string; description: string; group: string; path: string; icon: typeof Package; type?: string; permission?: string };
type RemoteResult = { label: string; description: string; group: string; path: string; type: string };

const entries: SearchEntry[] = [
  { label: "Dashboard", description: "Operations overview, work queue and live goods flow", group: "Overview", path: "/", icon: BarChart3 },
  { label: "Calendar", description: "View scheduled work, holidays and operational events", group: "Overview", path: "/calendar", icon: CalendarDays, permission: "calendar.view" },
  { label: "Products", description: "Manage products, stock levels, categories and brands", group: "Inventory & Stores", path: "/inventory", icon: Package, permission: "inventory.view" },
  { label: "Price Lists", description: "Manage product pricing and selling lists", group: "Inventory & Stores", path: "/price-lists", icon: FileSearch, permission: "master_data.manage" },
  { label: "Warehouses / Stores", description: "Manage storage locations and warehouse balances", group: "Inventory & Stores", path: "/storage-locations", icon: Building2, permission: "locations.view" },
  { label: "Suppliers", description: "Maintain supplier records and contacts", group: "Inventory & Stores", path: "/suppliers", icon: Users, permission: "suppliers.view" },
  { label: "Customers", description: "Manage customer accounts and contact details", group: "Inventory & Stores", path: "/customers", icon: Users, permission: "customers.view" },
  { label: "Workshop Issues", description: "Issue spare parts to vehicles and workshop staff", group: "Workshop Warehouse", path: "/workshop-issues", icon: Package, permission: "workshop.issues.view" },
  { label: "Spare Part Locator", description: "Find spare parts by warehouse section and shelf", group: "Workshop Warehouse", path: "/warehouse-locator", icon: MapPin, permission: "warehouse_locator.view" },
  { label: "Vehicles", description: "Search and maintain workshop vehicles", group: "Workshop Warehouse", path: "/vehicles", icon: Building2, permission: "vehicles.view" },
  { label: "Workshop Staff", description: "Maintain collectors and workshop staff", group: "Workshop Warehouse", path: "/staff", icon: Users, permission: "staff.view" },
  { label: "Department Orders", description: "Raise and track departmental stock requirements", group: "Department Workspace", path: "/department-workspace", icon: ClipboardList, permission: "department.view" },
  { label: "Purchases", description: "Create and track purchase orders", group: "Procurement & Logistics", path: "/procurement", icon: ClipboardList, permission: "purchase_orders.view" },
  { label: "Logistics", description: "Track inbound and outbound shipments", group: "Procurement & Logistics", path: "/logistics", icon: Truck, permission: "logistics.view" },
  { label: "Petty Cash", description: "Issue and review petty cash vouchers", group: "Procurement & Logistics", path: "/petty-cash", icon: Banknote, permission: "petty_cash.view" },
  { label: "Point of Sale", description: "Sell products and manage current transactions", group: "Sales & Finance", path: "/pos", icon: ShoppingCart, permission: "sales.create" },
  { label: "Sales History", description: "Review completed sales and receipts", group: "Sales & Finance", path: "/sales", icon: FileSearch, permission: "sales.view" },
  { label: "Reports", description: "Review sales, purchase, stock and finance reports", group: "Sales & Finance", path: "/reports", icon: BarChart3, permission: "reports.view" },
  { label: "Users", description: "Manage user access and operational roles", group: "Administration", path: "/users", icon: Users, permission: "users.view" },
  { label: "Roles & Permissions", description: "Configure role access and permissions", group: "Administration", path: "/roles", icon: Settings, permission: "users.view" },
  { label: "Department Assignments", description: "Assign users to departmental workspaces", group: "Administration", path: "/department-assignments", icon: Building2, permission: "users.manage" },
  { label: "User Access", description: "Grant or revoke individual user permissions", group: "Administration", path: "/user-access", icon: FileKey, permission: "users.manage" },
  { label: "Organization", description: "Manage companies, branches and departments", group: "Administration", path: "/companies", icon: Building2, permission: "locations.view" },
  { label: "Departments", description: "View and manage organizational departments", group: "Administration", path: "/departments", icon: Building2, permission: "departments.view" },
  { label: "Media Library", description: "Browse organization files and media", group: "System & Content", path: "/media", icon: FileSearch, permission: "media.view" },
  { label: "Announcements", description: "Read organization announcements and updates", group: "System & Content", path: "/announcements", icon: Bell, permission: "announcements.view" },
  { label: "Profile", description: "Manage your profile and account details", group: "System & Content", path: "/profile", icon: Users },
  { label: "System Settings", description: "Configure system, email, security and backups", group: "System & Content", path: "/settings", icon: Settings, permission: "users.manage" },
  { label: "Notifications", description: "Review messages, alerts and organization updates", group: "System & Content", path: "/notifications", icon: Bell },
];

const icons: Record<string, typeof Package> = {
  Product: Package,
  Supplier: Users,
  Customer: Users,
  "Purchase Order": ClipboardList,
  Warehouse: Building2,
  User: Users,
  Announcement: Bell,
  Vehicle: Car,
  "Workshop Staff": UserRound,
};

export default function SearchPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [query, setQuery] = useState(params.get("q") ?? "");
  const normalized = query.trim().toLowerCase();
  const visibleEntries = useMemo(() => entries.filter((entry) => !entry.permission || user?.role === "super_admin" || user?.permissions.includes(entry.permission)), [user]);
  const remote = useApiQuery(endpoints.search.global, normalized.length >= 2 ? { q: normalized } : "skip");
  const remoteResults = remote?.data?.results as RemoteResult[] | undefined;
  const results = useMemo<SearchEntry[]>(() => {
    const pageResults = normalized ? visibleEntries.filter((entry) => `${entry.label} ${entry.description} ${entry.group}`.toLowerCase().includes(normalized)) : visibleEntries;
    const recordResults = normalized.length >= 2 ? (remoteResults ?? []).map((result) => ({ ...result, icon: icons[result.type] ?? Search })) : [];
    return [...pageResults, ...recordResults];
  }, [normalized, remoteResults, visibleEntries]);
  const submit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setParams(query.trim() ? { q: query.trim() } : {});
  };

  return <div className="space-y-6 p-4 pb-24 md:p-6 md:pb-6">
    <div><Badge variant="outline" className="mb-3 border-primary/20 bg-primary/5 text-primary">Workspace search</Badge><h1 className="text-2xl font-bold tracking-tight">Search results</h1><p className="mt-1 text-sm text-muted-foreground">Search pages and live dashboard content across your StockFlow workspace.</p></div>
    <Card className="border-primary/10 shadow-sm"><CardContent className="p-4"><form onSubmit={submit} className="relative flex max-w-2xl items-center"><Search className="pointer-events-none absolute left-3 size-4 text-muted-foreground" /><input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search products, suppliers, customers, orders..." className="h-11 w-full rounded-lg border border-border bg-muted/40 pl-9 pr-24 text-sm outline-none focus:border-primary focus:bg-background focus:ring-2 focus:ring-primary/15" /><Button type="submit" className="absolute right-1.5 h-8"><Search className="size-4" />Search</Button></form></CardContent></Card>
    <div className="flex items-center justify-between"><div><h2 className="text-sm font-semibold">{normalized ? `Results for “${query.trim()}”` : "Quick access"}</h2><p className="mt-1 text-xs text-muted-foreground">{results.length} {results.length === 1 ? "result" : "results"}{normalized.length >= 2 && " across pages and records"}</p></div>{normalized && <Button variant="outline" size="sm" onClick={() => { setQuery(""); setParams({}); }}>Clear search</Button>}</div>
    {results.length ? <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{results.map((entry, index) => <button key={`${entry.type ?? "page"}-${entry.path}-${entry.label}-${index}`} type="button" onClick={() => navigate(entry.path)} className="group text-left"><Card className="h-full transition hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md"><CardContent className="flex h-full items-start gap-3 p-4"><span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary transition group-hover:bg-primary group-hover:text-primary-foreground"><entry.icon className="size-5" /></span><span className="min-w-0 flex-1"><span className="flex items-center justify-between gap-2"><span className="truncate text-sm font-semibold">{entry.label}</span><ArrowRight className="size-4 shrink-0 text-muted-foreground transition group-hover:translate-x-0.5 group-hover:text-primary" /></span><span className="mt-1 block text-xs leading-5 text-muted-foreground">{entry.description}</span><span className="mt-2 block text-[10px] font-semibold uppercase tracking-wider text-primary/70">{entry.group}</span></span></CardContent></Card></button>)}</div> : <Card><CardContent className="flex flex-col items-center gap-3 py-16 text-center"><span className="flex size-12 items-center justify-center rounded-full bg-muted text-muted-foreground"><Search className="size-5" /></span><h2 className="font-semibold">No results found</h2><p className="max-w-sm text-sm text-muted-foreground">Try a product name, SKU, supplier, customer, purchase order, user or announcement.</p></CardContent></Card>}
  </div>;
}
