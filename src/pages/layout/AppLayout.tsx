import { useState } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useTheme } from "next-themes";
import {
  AppWindow, Banknote, BarChart3, Building2, CalendarDays, Car, ChevronDown, ChevronRight, FileText, KeyRound, LockKeyhole, MapPin,
  ClipboardList, Files, Globe2, Grid2X2, Images, LayoutDashboard,
  LogOut, Maximize, Menu, Minimize, Moon, Package, PanelLeftClose, RefreshCw,
  PanelLeftOpen, Receipt, Search, Settings, ShieldCheck, ShoppingCart,
  Sun, Truck, User, UserCheck, Users, X,
} from "lucide-react";
import { SignInForm } from "@/components/auth/sign-in-form.tsx";
import { LockScreen } from "@/components/auth/lock-screen.tsx";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar.tsx";
import { Button } from "@/components/ui/button.tsx";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu.tsx";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select.tsx";
import { PageTransitionLoader } from "@/components/ui/page-loader.tsx";
import { useAuth } from "@/hooks/use-auth.ts";
import { NotificationsProvider } from "@/hooks/use-notifications.tsx";
import { NotificationCenter } from "@/components/notifications/notification-center.tsx";
import { cn } from "@/lib/utils.ts";
import type { OperationalRole } from "@/types/operations.ts";
import type { LucideIcon } from "lucide-react";
import { BrandLogo, BrandMark } from "@/components/brand-logo.tsx";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover.tsx";
import { TableEnhancer } from "@/components/data-table/table-enhancer.tsx";
import { useOfflineSynchronization } from "@/hooks/use-offline-sync.ts";

type PermissionRequirement = string | string[];
type NavItem = { icon: LucideIcon; label: string; path: string; exact?: boolean; permission?: PermissionRequirement };
type NavGroup = { label: string; items: NavItem[] };

function canAccessNavigation(user: { role?: string; permissions?: string[] } | null | undefined, permission?: PermissionRequirement) {
  if (!permission) return true;
  if (user?.role === "super_admin") return true;
  const required = Array.isArray(permission) ? permission : [permission];
  return required.some((item) => user?.permissions?.includes(item));
}

const routePreloaders: Record<string, () => Promise<unknown>> = {
  "/": () => import("@/pages/dashboard/page.tsx"),
  "/inventory": () => import("@/pages/inventory/page.tsx"),
  "/price-lists": () => import("@/pages/price-lists/page.tsx"),
  "/pos": () => import("@/pages/pos/page.tsx"),
  "/procurement": () => import("@/pages/procurement/page.tsx"),
  "/suppliers": () => import("@/pages/suppliers/page.tsx"),
  "/suppliers/": () => import("@/pages/suppliers/documents.tsx"),
  "/supplier-portal": () => import("@/pages/supplier-portal/page.tsx"),
  "/supplier-portal/catalog": () => import("@/pages/supplier-portal/catalog.tsx"),
  "/customers": () => import("@/pages/customers/page.tsx"),
  "/logistics": () => import("@/pages/logistics/page.tsx"),
  "/petty-cash": () => import("@/pages/petty-cash/page.tsx"),
  "/workshop-issues": () => import("@/pages/workshop-issues/page.tsx"),
  "/vehicles": () => import("@/pages/vehicles/page.tsx"),
  "/staff": () => import("@/pages/staff/page.tsx"),
  "/warehouses": () => import("@/pages/warehouses/page.tsx"),
  "/warehouse-locator": () => import("@/pages/warehouse-locator/page.tsx"),
  "/department-workspace": () => import("@/pages/department-workspace/page.tsx"),
  "/department-assignments": () => import("@/pages/department-assignments/page.tsx"),
  "/user-access": () => import("@/pages/user-access/page.tsx"),
  "/reports": () => import("@/pages/reports/page.tsx"),
  "/users": () => import("@/pages/users/page.tsx"),
  "/roles": () => import("@/pages/roles/page.tsx"),
  "/calendar": () => import("@/pages/calendar/page.tsx"),
  "/companies": () => import("@/pages/organization/page.tsx"),
  "/branches": () => import("@/pages/organization/page.tsx"),
  "/departments": () => import("@/pages/organization/page.tsx"),
  "/storage-locations": () => import("@/pages/organization/page.tsx"),
  "/announcements": () => import("@/pages/announcements/page.tsx"),
  "/settings": () => import("@/pages/settings/page.tsx"),
  "/policies": () => import("@/pages/policies/page.tsx"),
  "/media": () => import("@/pages/media/page.tsx"),
  "/offline-sync": () => import("@/pages/offline-sync/page.tsx"),
};

function preloadRoute(path: string) {
  const loader = routePreloaders[path.split("?")[0]];
  if (loader) void loader();
}

const navGroups: NavGroup[] = [
  { label: "Overview", items: [
    { icon: LayoutDashboard, label: "Dashboard", path: "/", exact: true },
    { icon: CalendarDays, label: "Calendar", path: "/calendar", permission: ["calendar.view", "locations.view"] },
  ] },
  { label: "Administration", items: [
    { icon: Users, label: "Users", path: "/users", permission: "users.view" },
    { icon: ShieldCheck, label: "Roles & Permissions", path: "/roles", permission: "users.view" },
    { icon: KeyRound, label: "User Access", path: "/user-access", permission: "users.manage" },
  ] },
  { label: "Department Workspace", items: [
    { icon: ClipboardList, label: "Department Orders", path: "/department-workspace", permission: "department.view" },
      { icon: Building2, label: "Department Assignments", path: "/department-assignments", permission: "users.manage" },
  ] },
  { label: "Organization", items: [
    { icon: Car, label: "Vehicles", path: "/vehicles", permission: "vehicles.view" },
    { icon: UserCheck, label: "Workshop Staff", path: "/staff", permission: "staff.view" },
    { icon: Building2, label: "Organization Tree", path: "/companies", permission: ["locations.view", "departments.view"] },

  ] },
  { label: "Inventory & Stores", items: [
    { icon: Package, label: "Products", path: "/inventory", permission: "inventory.view" },
    { icon: Building2, label: "Warehouses/Stores", path: "/storage-locations", permission: "locations.view" },
    { icon: Users, label: "Customers", path: "/customers", permission: "customers.view" },
  ] },
  { label: "Supplier Management", items: [
    { icon: UserCheck, label: "Suppliers", path: "/suppliers", permission: "suppliers.view" },
    { icon: ClipboardList, label: "Supplier Portal", path: "/supplier-portal", permission: "supplier_orders.view" },
  ] },
  { label: "Workshop Warehouse", items: [
    { icon: Package, label: "Workshop Issues", path: "/workshop-issues", permission: "workshop.issues.view" },
    { icon: MapPin, label: "Spare Part Locator", path: "/warehouse-locator", permission: "warehouse_locator.view" },
  ] },
  { label: "Procurement & Logistics", items: [
    { icon: ClipboardList, label: "Purchase Orders", path: "/procurement", permission: "purchase_orders.view" },
    { icon: Banknote, label: "Petty Cash", path: "/petty-cash", permission: "petty_cash.view" },
    { icon: Truck, label: "Logistics", path: "/logistics", permission: "logistics.view" },
  ] },
  { label: "Sales & Finance", items: [
    { icon: ShoppingCart, label: "Point of Sale", path: "/pos", permission: "sales.create" },
    { icon: Receipt, label: "Sales History", path: "/sales", permission: "sales.view" },
    { icon: BarChart3, label: "Reports", path: "/reports", permission: "reports.view" },
  ] },
  { label: "Media & Content", items: [
    { icon: Images, label: "Media Library", path: "/media", permission: "media.view" },
    { icon: RefreshCw, label: "Offline Sync", path: "/offline-sync", permission: ["inventory.view", "stock.count", "stock.issue", "stock.adjust", "stock.transfer.dispatch"] },
  ] },
  { label: "System & Content", items: [
    { icon: Settings, label: "System Settings", path: "/settings", permission: "users.manage" },
    { icon: FileText, label: "Policies", path: "/policies" },
  ] },
];
type NavigationUser = { role?: string; permissions?: string[]; supplier?: { id?: string } | null };

function navigationGroupsForUser(user: NavigationUser | null | undefined): NavGroup[] {
  const supplierLinked = user?.role === "supplier" && Boolean(user.supplier?.id);
  const groups = navGroups.map((group) => group.label === "Supplier Management" && supplierLinked
    ? { ...group, items: [] }
    : group);
  if (!supplierLinked) return groups;
  const supplierGroup: NavGroup = {
    label: "Supplier workspace",
    items: [
      { icon: ClipboardList, label: "Purchase orders", path: "/supplier-portal", permission: "supplier_orders.view" },
      { icon: Package, label: "Products & prices", path: "/supplier-portal/catalog", permission: "supplier_catalog.manage" },
      { icon: Files, label: "Documents", path: `/suppliers/${user.supplier?.id}/documents`, permission: "supplier_documents.upload" },
    ],
  };
  const [overview, ...remainingGroups] = groups;
  return overview ? [overview, supplierGroup, ...remainingGroups] : [supplierGroup];
}
const productLinks = [{ label: "Product List", path: "/inventory?view=products" }, { label: "Price Lists", path: "/price-lists" }, { label: "Categories", path: "/inventory?view=categories" }, { label: "SubCategories", path: "/inventory?view=subcategories" }, { label: "Brands", path: "/inventory?view=brands" }, { label: "Units", path: "/inventory?view=units" }, { label: "Current Stock", path: "/inventory?view=stock" }];
const organizationLinks: Array<{ label: string; path: string; permission?: PermissionRequirement }> = [{ label: "Companies", path: "/companies", permission: "locations.view" }, { label: "Branches", path: "/branches", permission: "locations.view" }, { label: "Departments", path: "/departments", permission: ["departments.view", "locations.view"] }, { label: "Storage Locations", path: "/storage-locations", permission: "locations.view" }, { label: "Announcements", path: "/announcements", permission: "announcements.view" }];
const reportLinks = [{ label: "Profit & Loss Report", path: "/reports?report=profit-loss" }, { label: "Purchase Report", path: "/reports?report=purchases" }, { label: "Purchase Return Report", path: "/reports?report=purchase-returns" }, { label: "Purchase Payments Report", path: "/reports?report=purchase-payments" }, { label: "Item Sales Report", path: "/reports?report=item-sales" }, { label: "Item Purchase Report", path: "/reports?report=item-purchases" }, { label: "Sales Report", path: "/reports?report=sales" }, { label: "Sales Return Report", path: "/reports?report=sales-returns" }, { label: "Sales Payments Report", path: "/reports?report=sales-payments" }, { label: "Stock Report", path: "/reports?report=stock" }, { label: "Expense Report", path: "/reports?report=expenses" }, { label: "Expired Items Report", path: "/reports?report=expired-items" }];

const webApps = [
  { name: "Proposal Meister", shortName: "P.Meister", url: "https://proposalmeister.com/auth/login", domain: "proposalmeister.com" },
  { name: "SEITS", shortName: "SEITS sys", url: "http://seits.tanzaniaspecialist.co.tz/", domain: "seits.tanzaniaspecialist.co.tz" },
  { name: "Africa Safari Trips", shortName: "Safari Portal", url: "https://portal.africasafaritrips.com/", domain: "portal.africasafaritrips.com" },
  { name: "WhatsApp Web", shortName: "WhatsApp", url: "https://web.whatsapp.com/", domain: "web.whatsapp.com" },
];

function SiteFavicon({ domain, className }: { domain: string; className?: string }) {
  const [failed, setFailed] = useState(false);
  if (failed) return <span className={cn("flex items-center justify-center rounded-lg bg-primary/10 text-primary", className)}><Globe2 className="size-4" /></span>;
  return <img src={`https://www.google.com/s2/favicons?domain=${domain}&sz=64`} alt="" className={cn("rounded-lg object-contain", className)} onError={() => setFailed(true)} />;
}

function WebAppsLauncher() {
  const [open, setOpen] = useState(false);
  return <Popover open={open} onOpenChange={setOpen}><PopoverTrigger asChild><Button variant="ghost" size="icon" aria-label="Open web apps" className="rounded-full"><Grid2X2 className="size-4" /></Button></PopoverTrigger><PopoverContent align="end" className="w-[min(370px,calc(100vw-1.5rem))] overflow-hidden p-0 shadow-xl"><div className="flex items-center justify-between border-b px-4 py-3"><div><p className="text-sm font-semibold">Web Apps</p><p className="mt-0.5 text-[11px] text-muted-foreground">Quick access to connected tools</p></div><AppWindow className="size-4 text-primary" /></div><div className="grid grid-cols-4 gap-1 p-3">{webApps.map((app) => <a key={app.url} href={app.url} target="_blank" rel="noreferrer noopener" onClick={() => setOpen(false)} title={app.name} className="group flex min-w-0 flex-col items-center gap-2 rounded-xl px-1 py-3 transition hover:bg-primary/5"><SiteFavicon domain={app.domain} className="size-8" /><span className="w-full truncate text-center text-[10px] font-medium text-muted-foreground group-hover:text-primary">{app.shortName}</span></a>)}</div><div className="border-t bg-muted/30 px-4 py-2 text-[10px] text-muted-foreground">Links open in a new browser tab.</div></PopoverContent></Popover>;
}

function CollapsedSidebarContent({ onClose }: { onClose?: () => void }) {
  const location = useLocation();
  const { user } = useAuth();
  const userNavItems = navigationGroupsForUser(user).flatMap((group) => group.items);
  const [productsOpen, setProductsOpen] = useState(location.pathname.startsWith("/inventory") || location.pathname.startsWith("/price-lists"));
  const [purchasesOpen, setPurchasesOpen] = useState(location.pathname.startsWith("/procurement"));
  const [organizationOpen, setOrganizationOpen] = useState(location.pathname.startsWith("/companies") || location.pathname.startsWith("/branches") || location.pathname.startsWith("/departments") || location.pathname.startsWith("/storage-locations"));
  const [settingsOpen, setSettingsOpen] = useState(location.pathname.startsWith("/settings"));
  const [reportsOpen, setReportsOpen] = useState(location.pathname.startsWith("/reports"));
  const nested = (label: string, icon: typeof Package, active: boolean, open: boolean, toggle: () => void, links: typeof productLinks) => {
    const Icon = icon;
    return <div key={label}><button type="button" title={label} onClick={toggle} className={cn("flex w-full items-center justify-center rounded-lg p-2.5 text-sm font-medium transition-all", active ? "bg-sidebar-accent text-sidebar-accent-foreground" : "text-sidebar-foreground/70 hover:bg-sidebar-accent/70 hover:text-sidebar-foreground")}><Icon className="size-4 shrink-0" />{open && <span className="sr-only">{links.length} links available</span>}</button></div>;
  };

  return <div className="flex h-full flex-col bg-sidebar text-sidebar-foreground">
    <div className="flex items-center justify-center px-3 py-5"><div className="size-14 overflow-hidden rounded-xl"><BrandMark className="size-full" darkSurface /></div></div>
    <nav className="sidebar-scroll flex-1 space-y-0.5 overflow-y-auto px-2 py-4">
      {userNavItems.map((item) => {
         if (!canAccessNavigation(user, item.permission)) return null;
        const active = item.exact ? location.pathname === item.path : location.pathname.startsWith(item.path);
        if (item.label === "Products") return nested(item.label, Package, active, productsOpen, () => setProductsOpen(!productsOpen), productLinks);
        if (item.label === "Purchases") return nested(item.label, ClipboardList, active, purchasesOpen, () => setPurchasesOpen(!purchasesOpen), [{ label: "List Purchases", path: "/procurement" }]);
        if (item.label === "Organization Tree") return nested(item.label, Building2, active, organizationOpen, () => setOrganizationOpen(!organizationOpen), organizationLinks);
        if (item.label === "Reports") return nested(item.label, BarChart3, active, reportsOpen, () => setReportsOpen(!reportsOpen), reportLinks);
        if (item.label === "System Settings") return nested(item.label, Settings, active, settingsOpen, () => setSettingsOpen(!settingsOpen), []);
        return <NavLink title={item.label} key={item.path} to={item.path} onMouseEnter={() => preloadRoute(item.path)} onClick={onClose} className={cn("group flex items-center justify-center rounded-lg p-2.5 text-sm font-medium transition-all", active ? "bg-sidebar-accent text-sidebar-accent-foreground" : "text-sidebar-foreground/70 hover:bg-sidebar-accent/70 hover:text-sidebar-foreground")}><item.icon className="size-4 shrink-0" /></NavLink>;
      })}
    </nav>
  </div>;
}

function SidebarContent({ onClose, collapsed = false }: { onClose?: () => void; collapsed?: boolean }) {
  const location = useLocation();
  const { switchRole, user } = useAuth();
  const [productsOpen, setProductsOpen] = useState(location.pathname.startsWith("/inventory") || location.pathname.startsWith("/price-lists"));
  const [purchasesOpen, setPurchasesOpen] = useState(location.pathname.startsWith("/procurement"));
  const [settingsOpen, setSettingsOpen] = useState(location.pathname.startsWith("/settings"));
  const [organizationOpen, setOrganizationOpen] = useState(organizationLinks.some((link) => location.pathname.startsWith(link.path)));
  const [reportsOpen, setReportsOpen] = useState(location.pathname.startsWith("/reports"));
  if (collapsed) return <CollapsedSidebarContent onClose={onClose} />;

  const linkClass = (active: boolean) => cn("group flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors", active ? "bg-sidebar-accent font-semibold text-sidebar-accent-foreground shadow-sm" : "text-sidebar-foreground/75 hover:bg-sidebar-accent/70 hover:text-sidebar-foreground");
  const nested = (label: string, icon: typeof Package, active: boolean, open: boolean, toggle: () => void, links: Array<{ label: string; path: string }>) => {
    const Icon = icon;
    return <div><button type="button" onClick={toggle} className={cn(linkClass(active), "w-full")}><Icon className="size-4 shrink-0" /><span>{label}</span><ChevronRight className={cn("ml-auto size-4 transition-transform", open && "rotate-90")} /></button>{open && <div className="ml-5 mt-1 space-y-0.5 border-l border-sidebar-border pl-3">{links.map((link) => <NavLink key={link.label} to={link.path} onMouseEnter={() => preloadRoute(link.path)} onClick={onClose} className="flex rounded-md px-3 py-1.5 text-xs text-sidebar-foreground/65 hover:bg-sidebar-accent/70 hover:text-sidebar-foreground">{link.label}</NavLink>)}</div>}</div>;
  };

  return <div className="flex h-full flex-col bg-sidebar text-sidebar-foreground">
    <div className="relative flex items-center justify-center px-4 py-5"><div className="w-full max-w-[176px] overflow-hidden"><BrandLogo className="mx-auto h-auto w-full" darkSurface /></div>{onClose && <button onClick={onClose} className="absolute right-4 text-sidebar-foreground/75 md:hidden"><X className="size-5" /></button>}</div>
    <nav className="sidebar-scroll flex-1 overflow-y-auto px-3 py-4">{navigationGroupsForUser(user).map((group) => {
       const items = group.items.filter((item) => canAccessNavigation(user, item.permission));
      if (!items.length) return null;
      return <section key={group.label} className="mb-5"><p className="mb-2 px-3 text-[10px] font-bold uppercase tracking-[0.16em] text-sidebar-foreground/45">{group.label}</p><div className="space-y-0.5">{items.map((item) => {
        const active = "exact" in item && item.exact ? location.pathname === item.path : location.pathname.startsWith(item.path);
        if (item.label === "Products") return <div key={item.path}>{nested(item.label, item.icon, active, productsOpen, () => setProductsOpen(!productsOpen), productLinks)}</div>;
        if (item.label === "Organization Tree") return <div key={item.path}>{nested(item.label, item.icon, organizationLinks.some((link) => location.pathname.startsWith(link.path)), organizationOpen, () => setOrganizationOpen(!organizationOpen), organizationLinks.filter((link) => canAccessNavigation(user, link.permission)))}</div>;
        if (item.label === "Purchases") return <div key={item.path}>{nested(item.label, item.icon, active, purchasesOpen, () => setPurchasesOpen(!purchasesOpen), [{ label: "List Purchases", path: "/procurement" }])}</div>;
        if (item.label === "Reports") return <div key={item.path}>{nested(item.label, item.icon, active, reportsOpen, () => setReportsOpen(!reportsOpen), reportLinks)}</div>;
        if (item.label === "System Settings") return <div key={item.path}>{nested("Settings", item.icon, active, settingsOpen, () => setSettingsOpen(!settingsOpen), [{ label: "System Settings", path: "/settings?section=general" }, { label: "Email Settings", path: "/settings?section=email" }, { label: "ReCaptcha Settings", path: "/settings?section=recaptcha" }, { label: "Cookie Settings", path: "/settings?section=cookie" }, { label: "Change Password", path: "/settings?section=security" }, { label: "Cache Settings", path: "/settings?section=cache" }, { label: "Database Backup", path: "/settings?section=backup" }])}</div>;
        return <NavLink key={item.path} to={item.path} onMouseEnter={() => preloadRoute(item.path)} onClick={onClose} className={linkClass(active)}><item.icon className="size-4 shrink-0" /><span>{item.label}</span>{active && <ChevronRight className="ml-auto size-3" />}</NavLink>;
      })}</div></section>;
    })}</nav>
    {import.meta.env.DEV && user?.id === "dev-superuser" && <div className="border-t border-sidebar-border px-3 py-4"><p className="mb-1.5 px-3 text-[10px] uppercase text-sidebar-foreground/55">Preview dashboard as</p><Select value={user.role} onValueChange={(value) => switchRole(value as OperationalRole)}><SelectTrigger className="h-8 border-sidebar-border bg-sidebar-accent/60 text-xs text-sidebar-foreground"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="super_admin">Super Admin</SelectItem><SelectItem value="procurement_manager">Procurement Manager</SelectItem><SelectItem value="procurement_officer">Procurement Officer</SelectItem><SelectItem value="store_keeper">Store Keeper</SelectItem><SelectItem value="accountant">Accountant</SelectItem><SelectItem value="supplier">Supplier</SelectItem></SelectContent></Select></div>}
  </div>;
}

function AppLayoutInner() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem("stockflow_sidebar_collapsed") === "true");
  const [fullscreen, setFullscreen] = useState(false);
  const [screenLocked, setScreenLocked] = useState(() => sessionStorage.getItem("stockflow_screen_locked") === "true");
  const [searchText, setSearchText] = useState("");
  const location = useLocation();
  const navigate = useNavigate();
  const { user, unlock, signout } = useAuth();
  useOfflineSynchronization(Boolean(user));
  const { resolvedTheme, setTheme } = useTheme();
  const page = location.pathname === "/search" ? { label: "Search" } : location.pathname === "/notifications" ? { label: "Notifications" } : navigationGroupsForUser(user).flatMap((group) => group.items).find((item) => "exact" in item && item.exact ? location.pathname === item.path : location.pathname.startsWith(item.path));
  const toggleCollapsed = () => setCollapsed((old) => { localStorage.setItem("stockflow_sidebar_collapsed", String(!old)); return !old; });
  const lockScreen = () => { sessionStorage.setItem("stockflow_screen_locked", "true"); sessionStorage.setItem("stockflow_lock_return_path", `${location.pathname}${location.search}${location.hash}`); setScreenLocked(true); };
  const toggleFullscreen = async () => { if (document.fullscreenElement) await document.exitFullscreen(); else await document.documentElement.requestFullscreen(); setFullscreen(Boolean(document.fullscreenElement)); };
  const submitSearch = (event: React.FormEvent<HTMLFormElement>) => { event.preventDefault(); navigate(`/search${searchText.trim() ? `?q=${encodeURIComponent(searchText.trim())}` : ""}`); };
   const visibleNavItems = navigationGroupsForUser(user).flatMap((group) => group.items).filter((item) => canAccessNavigation(user, item.permission));

  return <div className="flex h-screen overflow-hidden bg-background">
    <TableEnhancer />
    {mobileOpen && <div className="fixed inset-0 z-40 bg-foreground/55 backdrop-blur-sm md:hidden" onClick={() => setMobileOpen(false)} />}
    <aside className={cn("hidden shrink-0 flex-col border-r border-sidebar-border shadow-xl transition-[width] duration-200 md:flex", collapsed ? "w-20" : "w-64")}><SidebarContent collapsed={collapsed} /></aside>
    <aside className={cn("fixed inset-y-0 left-0 z-50 flex w-72 flex-col shadow-2xl transition-transform duration-200 md:hidden", mobileOpen ? "translate-x-0" : "-translate-x-full")}><SidebarContent onClose={() => setMobileOpen(false)} /></aside>
    <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
      <header className="z-20 flex h-[4.25rem] shrink-0 items-center gap-3 border-b border-border/80 bg-card/95 px-3 shadow-sm backdrop-blur md:px-5">
        <button aria-label="Open navigation" className="rounded-lg p-2 text-muted-foreground hover:bg-primary/10 hover:text-primary md:hidden" onClick={() => setMobileOpen(true)}><Menu className="size-5" /></button>
        <Button variant="ghost" size="icon" aria-label="Toggle sidebar" className="hidden md:inline-flex" onClick={toggleCollapsed}>{collapsed ? <PanelLeftOpen className="size-5" /> : <PanelLeftClose className="size-5" />}</Button>
        <form onSubmit={submitSearch} className="relative flex min-w-0 max-w-xl flex-1 items-center"><Search className="pointer-events-none absolute left-3 size-4 text-muted-foreground" /><input aria-label="Search" value={searchText} onChange={(event) => setSearchText(event.target.value)} placeholder="Search products, orders, pages…" className="h-10 w-full rounded-lg border border-border bg-muted/50 pl-9 pr-24 text-sm outline-none transition focus:border-primary focus:bg-background focus:ring-2 focus:ring-primary/15" /><Button type="submit" size="sm" className="absolute right-1.5 h-7 px-2.5"><Search className="size-3.5" /><span className="hidden sm:inline">Search</span></Button></form>
        <div className="ml-auto flex items-center gap-1"><span className="hidden px-2 text-xs font-medium text-muted-foreground xl:inline">{page?.label ?? "StockFlow"}</span><Button variant="ghost" size="icon" aria-label="Toggle theme" onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}>{resolvedTheme === "dark" ? <Sun className="size-4" /> : <Moon className="size-4" />}</Button><Button variant="ghost" size="icon" aria-label="Toggle fullscreen" className="hidden sm:inline-flex" onClick={toggleFullscreen}>{fullscreen ? <Minimize className="size-4" /> : <Maximize className="size-4" />}</Button><WebAppsLauncher /><NotificationCenter /><DropdownMenu><DropdownMenuTrigger asChild><Button variant="ghost" className="h-10 gap-2 rounded-lg px-2"><Avatar className="size-8 ring-2 ring-primary/10"><AvatarImage src={user?.profile.avatarUrl ?? undefined} /><AvatarFallback>{user?.profile.name?.charAt(0).toUpperCase() ?? "U"}</AvatarFallback></Avatar><span className="hidden max-w-32 text-left sm:block"><span className="block truncate text-xs font-semibold">{user?.profile.name}</span><span className="block truncate text-[10px] capitalize text-muted-foreground">{user?.role.replaceAll("_", " ")}</span></span><ChevronDown className="hidden size-3 text-muted-foreground sm:block" /></Button></DropdownMenuTrigger><DropdownMenuContent align="end" className="w-56"><DropdownMenuLabel><p>{user?.profile.name}</p><p className="text-xs font-normal text-muted-foreground">{user?.profile.email}</p></DropdownMenuLabel><DropdownMenuSeparator /><DropdownMenuItem onClick={() => navigate("/profile")}><User className="size-4" />Profile settings</DropdownMenuItem>{user?.role === "super_admin" && <DropdownMenuItem onClick={() => navigate("/settings")}><Settings className="size-4" />System settings</DropdownMenuItem>}<DropdownMenuSeparator /><DropdownMenuItem onClick={lockScreen}><LockKeyhole className="size-4" />Lock screen</DropdownMenuItem><DropdownMenuItem variant="destructive" onClick={() => void signout()}><LogOut className="size-4" />Log out</DropdownMenuItem></DropdownMenuContent></DropdownMenu></div>
      </header>
      <main className="min-h-0 flex-1 overflow-auto"><Outlet /></main>
      <footer className="flex min-h-16 shrink-0 flex-col justify-center gap-1 border-t border-border/80 bg-card px-5 py-4 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between md:px-7 md:py-5 md:text-sm"><span>2026 © StockFlow.</span><span>Inventory, procurement &amp; logistics workspace</span></footer>
    </div>
    <nav className="fixed inset-x-0 bottom-0 z-30 flex justify-around border-t border-border bg-card/95 py-1 shadow-lg backdrop-blur md:hidden">{visibleNavItems.slice(0, 5).map((item) => <NavLink key={item.path} to={item.path} onTouchStart={() => preloadRoute(item.path)} onMouseEnter={() => preloadRoute(item.path)} className={({ isActive }) => cn("rounded-lg px-3 py-2 text-muted-foreground", isActive && "bg-primary/10 text-primary")}><item.icon className="size-5" /></NavLink>)}</nav>
    {screenLocked && user && <LockScreen user={user} unlock={unlock} signout={signout} onUnlocked={() => { const returnPath = sessionStorage.getItem("stockflow_lock_return_path") || "/"; sessionStorage.removeItem("stockflow_lock_return_path"); setScreenLocked(false); navigate(returnPath, { replace: true }); }} />}
  </div>;
}

export default function AppLayout() {
  const { isAuthenticated, isLoading } = useAuth();
  if (isLoading) return <PageTransitionLoader />;
  if (!isAuthenticated) return <SignInForm />;
  return <NotificationsProvider><AppLayoutInner /></NotificationsProvider>;
}
