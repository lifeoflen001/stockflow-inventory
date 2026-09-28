import { useState, useMemo, useRef } from "react";
import { useDraftState } from "@/hooks/use-draft-state.ts";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useApiQuery, useApiMutation } from "@/hooks/use-api.ts";
import { apiClient, getApiErrorMessage } from "@/api/client.ts";
import { endpoints } from "@/api/endpoints.ts";
import { downloadPurchaseOrderPdf } from "@/lib/purchase-order-pdf.ts";
import { Button } from "@/components/ui/button.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Label } from "@/components/ui/label.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog.tsx";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select.tsx";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover.tsx";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command.tsx";
import { Separator } from "@/components/ui/separator.tsx";
import { Textarea } from "@/components/ui/textarea.tsx";
import { toast } from "@/lib/system-message.ts";
import { cn } from "@/lib/utils.ts";
import {
  Plus, Search, ClipboardList, Trash2, Eye, DollarSign,
  PackageCheck, ShoppingBag, Clock,
  Check, CheckCircle2, Send, X, AlertTriangle, ChevronDown, ChevronUp,
  Banknote, Download,
} from "lucide-react";
import { format, parseISO, isAfter } from "date-fns";
import type { EntityId } from "@/types/api.ts";
import { useAuth } from "@/hooks/use-auth.ts";
import { PageContentLoader } from "@/components/ui/page-loader.tsx";

const STATUS_COLORS: Record<string, string> = {
  draft: "bg-gray-100 text-gray-600 dark:bg-gray-800/60 dark:text-gray-400",
  sent: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  confirmed: "bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400",
  partial: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
  received: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
  cancelled: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
};

const STATUS_FLOW: Record<string, string[]> = {
  draft: ["sent", "cancelled"],
  sent: ["sent", "confirmed", "cancelled"],
  confirmed: ["received", "cancelled"],
  partial: ["received", "cancelled"],
  received: [],
  cancelled: [],
};

type POItem = { productId: string; orderedQty: string; unitCost: string; taxRate: string };
type ActiveTab = "orders" | "receive" | "payments";
type SearchableOption = { value: string; label: string; description?: string; keywords?: string };
const formatMoney = (value: number, currency: string) => `${currency} ${value.toLocaleString("en-TZ", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function SearchableSelect({
  value,
  onValueChange,
  options,
  placeholder,
  searchPlaceholder,
  className,
}: {
  value: string;
  onValueChange: (value: string) => void;
  options: SearchableOption[];
  placeholder: string;
  searchPlaceholder: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const selected = options.find((option) => option.value === value);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className={cn("w-full justify-between font-normal", !selected && "text-muted-foreground", className)}
        >
          <span className="truncate text-left">{selected?.label ?? placeholder}</span>
          <ChevronDown className="h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[var(--radix-popover-trigger-width)] min-w-64 p-0">
        <Command>
          <CommandInput placeholder={searchPlaceholder} />
          <CommandList>
            <CommandEmpty>No matching records found.</CommandEmpty>
            <CommandGroup>
              {options.map((option) => (
                <CommandItem
                  key={option.value}
                  value={option.value}
                  keywords={[option.label, option.description, option.keywords].filter(Boolean) as string[]}
                  onSelect={() => {
                    onValueChange(option.value);
                    setOpen(false);
                  }}
                >
                  <Check className={cn("h-4 w-4", selected?.value === option.value ? "opacity-100" : "opacity-0")} />
                  <span className="min-w-0">
                    <span className="block truncate">{option.label}</span>
                    {option.description && <span className="block truncate text-xs text-muted-foreground">{option.description}</span>}
                  </span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

export default function ProcurementPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user } = useAuth();
  const canCreatePO = user?.role === "super_admin" || user?.permissions.includes("purchase_orders.create");
  const canIssuePO = user?.role === "super_admin" || user?.permissions.includes("purchase_orders.issue");
  const canApprovePO = user?.role === "super_admin" || user?.permissions.includes("purchase_orders.approve");
  const canVerifyPayments = user?.role === "super_admin" || user?.role === "accountant";
  const canReceiveGoods = user?.role === "super_admin" || user?.permissions.includes("goods_receipts.create");
  const canViewPettyCash = user?.role === "super_admin" || user?.permissions.includes("petty_cash.view");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState(() => searchParams.get("status") ?? "all");
  const [activeTab, setActiveTab] = useState<ActiveTab>("orders");
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [selectedPOId, setSelectedPOId] = useState<EntityId<"purchaseOrders"> | null>(null);
  const [showReceiveDialog, setShowReceiveDialog] = useState(false);
  const [receiveQtys, setReceiveQtys] = useState<Record<string, string>>({});
  const [showPaymentDialog, setShowPaymentDialog] = useState(false);
  const [paymentAmount, setPaymentAmount] = useState("");
  const [paymentFile, setPaymentFile] = useState<File | null>(null);
  const paymentFileInput = useRef<HTMLInputElement>(null);
  const [paymentPOId, setPaymentPOId] = useState<EntityId<"purchaseOrders"> | null>(null);
  const [expandedId, setExpandedId] = useState<EntityId<"purchaseOrders"> | null>(null);

  // Create form
  const [form, setForm] = useDraftState("procurement-purchase-order", { supplierId: "", locationId: "", expectedDate: "", notes: "", purchaseReason: "", allocation: "", allocationDepartmentId: "", collectedBy: "" });
  const [poItems, setPoItems] = useState<POItem[]>([{ productId: "", orderedQty: "1", unitCost: "", taxRate: "0" }]);

  const purchaseOrders = useApiQuery(endpoints.procurement.listPurchaseOrders, {});
  const selectedPO = useApiQuery(endpoints.procurement.getPurchaseOrder, selectedPOId ? { id: selectedPOId } : "skip");
  const suppliers = useApiQuery(endpoints.suppliers.listSuppliers, canCreatePO || canReceiveGoods ? {} : "skip");
  const storageLocations = useApiQuery(endpoints.organizationStructure.listStorageLocations, canCreatePO || canReceiveGoods ? {} : "skip");
  const receivingLocations = storageLocations === undefined ? undefined : [
    ...(storageLocations.data?.warehouses ?? []).filter((location) => location.is_active !== false).map((location) => ({ ...location, type: "warehouse" as const })),
    ...(storageLocations.data?.stores ?? []).filter((location) => location.is_active !== false).map((location) => ({ ...location, type: "store" as const })),
  ].sort((left, right) => left.name.localeCompare(right.name));
  const products = useApiQuery(endpoints.inventory.listProducts, canCreatePO ? { includeInactive: false } : "skip");
  const companiesResponse = useApiQuery(endpoints.organizationStructure.listCompanies, canCreatePO || canReceiveGoods ? {} : "skip");
  const departmentsResponse = useApiQuery(endpoints.organizationStructure.listDepartments, canCreatePO ? {} : "skip");
  const departments = (departmentsResponse?.data ?? []).filter((department) => department.is_active !== false);

  const createPO = useApiMutation(endpoints.procurement.createPurchaseOrder);
  const updateStatus = useApiMutation(endpoints.procurement.updatePOStatus);
  const receivePO = useApiMutation(endpoints.procurement.receivePurchaseOrder);
  const company = companiesResponse?.data?.find((entry) => entry.is_active === true) ?? companiesResponse?.data?.[0];
  const currency = company?.currency ?? "TSHS";
  const money = (value: number) => formatMoney(value, currency);

  const downloadPO = async (id: EntityId<"purchaseOrders">) => {
    toast.loading("Preparing approved PO PDF...");
    try {
      const { data } = await apiClient.get(`/purchase-orders/${id}`);
      if (data.status === "draft" || !data.approvedBy) {
        toast.error("This PO must be approved by a procurement manager before it can be downloaded.");
        return;
      }
      await downloadPurchaseOrderPdf({ ...data, signatureName: user?.profile.name, signatureUrl: user?.profile.signatureUrl }, company);
      toast.success("Approved PO PDF downloaded successfully");
    } catch (e) {
      toast.error(getApiErrorMessage(e, "Unable to generate approved PO PDF"));
    }
  };

  // Stats
  const stats = useMemo(() => {
    const all = purchaseOrders ?? [];
    const totalValue = all.reduce((s, p) => s + p.totalAmount, 0);
    const outstanding = all.reduce((s, p) => s + (p.totalAmount - p.paidAmount), 0);
    const pending = all.filter((p) => ["draft", "sent", "confirmed"].includes(p.status)).length;
    const overdue = all.filter((p) =>
      p.expectedDate &&
      ["sent", "confirmed", "partial"].includes(p.status) &&
      isAfter(new Date(), parseISO(p.expectedDate))
    ).length;
    return { totalValue, outstanding, pending, overdue };
  }, [purchaseOrders]);

  const filtered = useMemo(() => {
    return (purchaseOrders ?? []).filter((po) => {
      const matchSearch =
        po.poNumber.toLowerCase().includes(search.toLowerCase()) ||
        (po.supplier?.name ?? "").toLowerCase().includes(search.toLowerCase());
      const matchStatus = statusFilter === "all" || po.status === statusFilter;
      return matchSearch && matchStatus;
    });
  }, [purchaseOrders, search, statusFilter]);

  // Receive-eligible POs
  const receivablePOs = (purchaseOrders ?? []).filter((po) =>
    ["confirmed", "partial"].includes(po.status)
  );
  // Payment-outstanding POs
  const unpaidPOs = (purchaseOrders ?? []).filter((po) =>
    canVerifyPayments && po.paidAmount < po.totalAmount && po.status !== "cancelled" && po.status !== "draft" && Boolean(po.approvedBy)
  );

  const addItem = () => setPoItems((p) => [...p, { productId: "", orderedQty: "1", unitCost: "", taxRate: "0" }]);
  const removeItem = (idx: number) => setPoItems((p) => p.filter((_, i) => i !== idx));
  const updateItem = (idx: number, field: keyof POItem, value: string) =>
    setPoItems((p) => p.map((item, i) => (i === idx ? { ...item, [field]: value } : item)));

  // Line totals for create form
  const formTotals = useMemo(() => {
    let subtotal = 0, tax = 0;
    for (const item of poItems) {
      if (!item.productId || !item.unitCost || !item.orderedQty) continue;
      const line = parseFloat(item.orderedQty) * parseFloat(item.unitCost);
      subtotal += line;
      tax += line * ((parseFloat(item.taxRate) || 0) / 100);
    }
    return { subtotal, tax, total: subtotal + tax };
  }, [poItems]);

  if (purchaseOrders === undefined) return <PageContentLoader variant="table" />;

  const handleCreate = async () => {
    if (!form.supplierId || !form.locationId) { toast.error("Select a supplier and receiving location"); return; }
    if (!form.allocationDepartmentId) { toast.error("Select the department this purchase will be allocated to"); return; }
    const validItems = poItems.filter((i) => i.productId && i.orderedQty && i.unitCost);
    if (!validItems.length) { toast.error("Add at least one product"); return; }
    try {
      const [locationType, locationId] = form.locationId.split(":");
      await createPO({
        supplierId: form.supplierId as EntityId<"suppliers">,
        locationType,
        locationId: Number(locationId),
        expectedDate: form.expectedDate || undefined,
        notes: form.notes || undefined,
        purchaseReason: form.purchaseReason.trim() || undefined,
        allocation: form.allocation.trim() || undefined,
        allocationDepartmentId: Number(form.allocationDepartmentId),
        collectedBy: form.collectedBy.trim() || undefined,
        items: validItems.map((i) => ({
          productId: i.productId as EntityId<"products">,
          orderedQty: parseInt(i.orderedQty),
          unitCost: parseFloat(i.unitCost),
          taxRate: parseFloat(i.taxRate) || 0,
        })),
      });
      toast.success("Purchase order created and sent for manager approval");
      setShowCreateDialog(false);
      setForm({ supplierId: "", locationId: "", expectedDate: "", notes: "", purchaseReason: "", allocation: "", allocationDepartmentId: "", collectedBy: "" });
      setPoItems([{ productId: "", orderedQty: "1", unitCost: "", taxRate: "0" }]);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to create LPO");
    }
  };

  const handleReceive = async () => {
    if (!selectedPOId || !selectedPO) return;
    const items = selectedPO.items
      .map((item) => ({
        itemId: item._id,
        receivedQty: parseInt(receiveQtys[item._id] ?? "0") || 0,
      }))
      .filter((i) => i.receivedQty > 0);
    if (!items.length) { toast.error("Enter received quantities"); return; }
    try {
      await receivePO({ id: selectedPOId, items });
      toast.success("Goods received and stock updated");
      setShowReceiveDialog(false);
      setReceiveQtys({});
      setSelectedPOId(null);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to receive PO");
    }
  };

  const handlePayment = async () => {
    if (!paymentPOId || !paymentAmount || !paymentFile) { toast.error("Enter the amount and attach the proof of payment"); return; }
    const amount = parseFloat(paymentAmount);
    if (isNaN(amount) || amount <= 0) { toast.error("Enter a valid amount"); return; }
    try {
      const formData = new FormData();
      formData.append("amount", String(amount));
      formData.append("file", paymentFile);
      await apiClient.post(`/purchase-orders/${paymentPOId}/payments`, formData);
      window.dispatchEvent(new Event("stockflow:api-invalidated"));
      toast.success("Payment verified and proof of payment uploaded");
      setShowPaymentDialog(false);
      setPaymentAmount("");
      setPaymentFile(null);
      setPaymentPOId(null);
      if (paymentFileInput.current) paymentFileInput.current.value = "";
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to record payment");
    }
  };

  const tabs = [
    { key: "orders" as ActiveTab, label: "Purchase Orders", count: (purchaseOrders ?? []).length },
    ...(canReceiveGoods ? [{ key: "receive" as ActiveTab, label: "Receive Goods", count: receivablePOs.length }] : []),
    ...(canVerifyPayments ? [{ key: "payments" as ActiveTab, label: "Payments", count: unpaidPOs.length }] : []),
  ];

  return (
    <div className="p-5 space-y-5 pb-24 md:pb-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold">Procurement</h2>
          <p className="text-sm text-muted-foreground">{purchaseOrders?.length ?? 0} purchase orders</p>
        </div>
        <div className="flex flex-wrap justify-end gap-2">
          {canViewPettyCash && <Button variant="outline" onClick={() => navigate("/petty-cash")} className="cursor-pointer"><Banknote className="w-4 h-4 mr-2" />Petty Cash</Button>}
          {canCreatePO && <Button onClick={() => setShowCreateDialog(true)} className="cursor-pointer"><Plus className="w-4 h-4 mr-2" />New PO</Button>}
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { label: "Total PO Value", value: money(stats.totalValue), icon: ShoppingBag, color: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400" },
          { label: "Outstanding", value: money(stats.outstanding), icon: DollarSign, color: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400" },
          { label: "Pending Orders", value: stats.pending.toString(), icon: Clock, color: "bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400" },
          { label: "Overdue", value: stats.overdue.toString(), icon: AlertTriangle, color: stats.overdue > 0 ? "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400" : "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" },
        ].map((stat) => (
          <Card key={stat.label}>
            <CardContent className="p-4">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-xs text-muted-foreground uppercase tracking-wider font-medium">{stat.label}</p>
                  <p className="text-xl font-bold mt-0.5">{stat.value}</p>
                </div>
                <div className={cn("w-8 h-8 rounded-lg flex items-center justify-center", stat.color)}>
                  <stat.icon className="w-4 h-4" />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex gap-0 border-b border-border overflow-x-auto">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setActiveTab(t.key)}
            className={cn(
              "flex items-center gap-1.5 px-4 py-2 text-sm font-medium whitespace-nowrap border-b-2 -mb-px transition-colors cursor-pointer",
              activeTab === t.key ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {t.label}
            {t.count > 0 && (
              <Badge className={cn("text-[10px] px-1.5 py-0 h-4", activeTab === t.key ? "" : "bg-muted text-muted-foreground")}>
                {t.count}
              </Badge>
            )}
          </button>
        ))}
      </div>

      {/* ── Purchase Orders Tab ──────────────────────────── */}
      {activeTab === "orders" && (
        <div className="space-y-4">
          <div className="flex flex-wrap gap-3">
            <div className="relative flex-1 min-w-48">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input placeholder="Search PO number or supplier…" className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                {["draft", "sent", "confirmed", "partial", "received", "cancelled"].map((s) => (
                  <SelectItem key={s} value={s} className="capitalize">{s}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <Card>
            <CardContent className="p-0">
              {purchaseOrders === undefined ? (
                <div className="p-4 space-y-3">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-14 w-full" />)}</div>
              ) : filtered.length === 0 ? (
                <div className="py-16 text-center">
                  <ClipboardList className="w-10 h-10 text-muted-foreground/40 mx-auto mb-3" />
                  <p className="text-sm text-muted-foreground">No purchase orders found</p>
                  {canCreatePO && <Button variant="ghost" size="sm" className="mt-2 cursor-pointer" onClick={() => setShowCreateDialog(true)}>
                    Create your first PO
                  </Button>}
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border bg-muted/30">
                        <th className="text-left px-4 py-3 font-medium text-muted-foreground">PO #</th>
                        <th className="text-left px-4 py-3 font-medium text-muted-foreground hidden md:table-cell">Supplier</th>
                        <th className="text-left px-4 py-3 font-medium text-muted-foreground hidden lg:table-cell">Warehouse</th>
                        <th className="text-left px-4 py-3 font-medium text-muted-foreground hidden md:table-cell">Expected</th>
                        <th className="text-right px-4 py-3 font-medium text-muted-foreground">Total</th>
                        <th className="text-right px-4 py-3 font-medium text-muted-foreground hidden lg:table-cell">Paid</th>
                        <th className="text-center px-4 py-3 font-medium text-muted-foreground">Status</th>
                        <th className="text-right px-4 py-3 font-medium text-muted-foreground">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filtered.map((po) => {
                        const isExpanded = expandedId === po._id;
                        const isOverdue = po.expectedDate &&
                          ["sent", "confirmed", "partial"].includes(po.status) &&
                          isAfter(new Date(), parseISO(po.expectedDate));
                        const paymentPct = po.totalAmount > 0 ? (po.paidAmount / po.totalAmount) * 100 : 0;
                        return (
                          <>
                            <tr key={po._id} className={cn("border-b border-border last:border-0 hover:bg-muted/20 transition-colors", isExpanded && "bg-muted/10")}>
                              <td className="px-4 py-3">
                                <p className="font-mono text-xs font-semibold">{po.poNumber}</p>
                                <p className="text-[10px] text-muted-foreground">{format(parseISO(po.createdAt), "MMM d, yyyy")}</p>
                              </td>
                              <td className="px-4 py-3 hidden md:table-cell">
                                <p className="font-medium text-sm">{po.supplier?.name ?? "—"}</p>
                              </td>
                              <td className="px-4 py-3 hidden lg:table-cell text-xs text-muted-foreground">{po.receivingLocation?.name ?? po.warehouse?.name ?? po.store?.name ?? "—"}</td>
                              <td className="px-4 py-3 hidden md:table-cell">
                                {po.expectedDate ? (
                                  <span className={cn("text-xs", isOverdue ? "text-red-500 font-medium" : "text-muted-foreground")}>
                                    {isOverdue && <AlertTriangle className="w-3 h-3 inline mr-1" />}
                                    {format(parseISO(po.expectedDate), "MMM d")}
                                  </span>
                                ) : <span className="text-xs text-muted-foreground">—</span>}
                              </td>
                              <td className="px-4 py-3 text-right font-mono font-semibold">{money(po.totalAmount)}</td>
                              <td className="px-4 py-3 text-right hidden lg:table-cell">
                                <div className="flex items-center justify-end gap-2">
                                  <div className="w-16 h-1.5 bg-muted rounded-full overflow-hidden">
                                    <div className="h-full bg-green-500 rounded-full" style={{ width: `${paymentPct}%` }} />
                                  </div>
                                  <span className="text-xs text-muted-foreground">{paymentPct.toFixed(0)}%</span>
                                </div>
                              </td>
                              <td className="px-4 py-3 text-center">
                                <Badge className={cn("text-xs capitalize", STATUS_COLORS[po.status])}>{po.status}</Badge>
                              </td>
                              <td className="px-4 py-3 text-right">
                                <div className="flex items-center justify-end gap-0.5">
                                  <Button size="icon" variant="ghost" className="w-7 h-7 cursor-pointer" title="View purchase order details" onClick={() => navigate(`/procurement/${po._id}`)}>
                                    <Eye className="w-3 h-3" />
                                  </Button>
                                  {/* Status advance buttons */}
                                  {STATUS_FLOW[po.status]?.filter((s) => s !== "cancelled" && (s === "sent" ? canApprovePO && (po.status === "draft" || !po.approvedBy) : s === "confirmed" ? (canIssuePO || canApprovePO) : canReceiveGoods)).map((nextStatus) => {
                                    const isApprovalAction = nextStatus === "sent" && canApprovePO;
                                    const isDraftApproval = isApprovalAction && !canIssuePO;
                                    const actionLabel = isApprovalAction && po.status === "sent" ? "Approve" : isDraftApproval ? "Approve" : nextStatus === "sent" && canApprovePO && canIssuePO ? "Approve & send" : nextStatus;
                                    return (
                                    <Button
                                      key={nextStatus}
                                      size="sm"
                                      variant={isDraftApproval || nextStatus === "received" ? "default" : "secondary"}
                                      className="text-xs h-7 cursor-pointer capitalize"
                                      onClick={async () => {
                                        if (nextStatus === "received") {
                                          // Open receive dialog instead
                                          setSelectedPOId(po._id);
                                          setReceiveQtys({});
                                          setShowReceiveDialog(true);
                                        } else {
                                          await updateStatus({ id: po._id, status: nextStatus });
                                          toast.success(isDraftApproval ? "Purchase order approved" : `PO marked as ${nextStatus}`);
                                        }
                                      }}
                                    >
                                      {nextStatus === "sent" && (isDraftApproval ? <CheckCircle2 className="w-3 h-3 mr-1" /> : <Send className="w-3 h-3 mr-1" />)}
                                      {nextStatus === "confirmed" && <CheckCircle2 className="w-3 h-3 mr-1" />}
                                      {nextStatus === "received" && <PackageCheck className="w-3 h-3 mr-1" />}
                                      {actionLabel.charAt(0).toUpperCase() + actionLabel.slice(1)}
                                    </Button>
                                    );
                                  })}
                                  {/* Payment button */}
                                  {canVerifyPayments && po.paidAmount < po.totalAmount && po.status !== "cancelled" && po.status !== "draft" && po.approvedBy && (
                                    <Button
                                      size="sm"
                                      variant="ghost"
                                      className="text-xs h-7 cursor-pointer text-green-600 hover:text-green-700"
                                      onClick={() => { setPaymentPOId(po._id); setPaymentAmount((po.totalAmount - po.paidAmount).toFixed(2)); setPaymentFile(null); setShowPaymentDialog(true); }}
                                    >
                                      <Banknote className="w-3 h-3 mr-1" />Pay
                                    </Button>
                                  )}
                                  <Button size="icon" variant="ghost" className="w-7 h-7 cursor-pointer" title={po.approvedBy ? "Download approved LPO PDF" : "Approval required before downloading LPO PDF"} disabled={!po.approvedBy || po.status === "draft"} onClick={() => void downloadPO(po._id)}>
                                    <Download className="w-3 h-3" />
                                  </Button>
                                  {/* Cancel */}
                                  {(canIssuePO || canApprovePO) && ["draft", "sent"].includes(po.status) && (
                                    <Button
                                      size="icon"
                                      variant="ghost"
                                      className="w-7 h-7 cursor-pointer text-muted-foreground hover:text-destructive"
                                      onClick={async () => { await updateStatus({ id: po._id, status: "cancelled" }); toast.success("PO cancelled"); }}
                                    >
                                      <X className="w-3 h-3" />
                                    </Button>
                                  )}
                                  {/* Expand */}
                                  <Button
                                    size="icon"
                                    variant="ghost"
                                    className="w-7 h-7 cursor-pointer"
                                    onClick={() => setExpandedId(isExpanded ? null : po._id)}
                                  >
                                    {isExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                                  </Button>
                                </div>
                              </td>
                            </tr>
                            {isExpanded && (
                              <tr key={`${po._id}-exp`} className="border-b border-border bg-muted/5">
                                <td colSpan={8} className="px-6 py-3">
                                  <POExpandedDetails poId={po._id} currency={currency} />
                                </td>
                              </tr>
                            )}
                          </>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* ── Receive Goods Tab ─────────────────────────────── */}
      {activeTab === "receive" && (
        <div className="space-y-4">
          {receivablePOs.length === 0 ? (
            <Card>
              <CardContent className="py-16 text-center">
                <PackageCheck className="w-10 h-10 text-muted-foreground/40 mx-auto mb-3" />
                <p className="text-sm text-muted-foreground">No confirmed POs awaiting receipt</p>
                <p className="text-xs text-muted-foreground mt-1">Confirm a purchase order first, then receive goods here</p>
              </CardContent>
            </Card>
          ) : (
            receivablePOs.map((po) => (
              <Card key={po._id}>
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle className="text-sm font-semibold font-mono">{po.poNumber}</CardTitle>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {po.supplier?.name ?? "—"} · {po.receivingLocation?.name ?? po.warehouse?.name ?? po.store?.name ?? "—"}
                        {po.expectedDate && ` · Expected ${format(parseISO(po.expectedDate), "MMM d, yyyy")}`}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge className={cn("text-xs", STATUS_COLORS[po.status])}>{po.status}</Badge>
                      {canReceiveGoods && <Button
                        size="sm"
                        className="cursor-pointer"
                        onClick={() => {
                          setSelectedPOId(po._id);
                          setReceiveQtys({});
                          setShowReceiveDialog(true);
                        }}
                      >
                        <PackageCheck className="w-3 h-3 mr-1.5" />Receive
                      </Button>}
                    </div>
                  </div>
                </CardHeader>
                <POExpandedDetails poId={po._id} currency={currency} compact />
              </Card>
            ))
          )}
        </div>
      )}

      {/* ── Payments Tab ─────────────────────────────────── */}
      {activeTab === "payments" && (
        <div className="space-y-4">
          {unpaidPOs.length === 0 ? (
            <Card>
              <CardContent className="py-16 text-center">
                <CheckCircle2 className="w-10 h-10 text-green-500/40 mx-auto mb-3" />
                <p className="text-sm text-muted-foreground">All purchase orders are fully paid</p>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border bg-muted/30">
                        <th className="text-left px-4 py-3 font-medium text-muted-foreground">PO #</th>
                        <th className="text-left px-4 py-3 font-medium text-muted-foreground hidden md:table-cell">Supplier</th>
                        <th className="text-right px-4 py-3 font-medium text-muted-foreground">Total</th>
                        <th className="text-right px-4 py-3 font-medium text-muted-foreground">Paid</th>
                        <th className="text-right px-4 py-3 font-medium text-muted-foreground">Outstanding</th>
                        <th className="text-center px-4 py-3 font-medium text-muted-foreground">Progress</th>
                        <th className="text-right px-4 py-3 font-medium text-muted-foreground">Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {unpaidPOs.map((po) => {
                        const outstanding = po.totalAmount - po.paidAmount;
                        const pct = po.totalAmount > 0 ? (po.paidAmount / po.totalAmount) * 100 : 0;
                        return (
                          <tr key={po._id} className="border-b border-border last:border-0 hover:bg-muted/20">
                            <td className="px-4 py-3">
                              <p className="font-mono text-xs font-semibold">{po.poNumber}</p>
                              <Badge className={cn("text-[10px] py-0 mt-0.5", STATUS_COLORS[po.status])}>{po.status}</Badge>
                            </td>
                            <td className="px-4 py-3 hidden md:table-cell text-sm">{po.supplier?.name ?? "—"}</td>
                            <td className="px-4 py-3 text-right font-mono text-sm">{money(po.totalAmount)}</td>
                            <td className="px-4 py-3 text-right font-mono text-sm text-green-600">{money(po.paidAmount)}</td>
                            <td className="px-4 py-3 text-right font-mono text-sm font-bold text-amber-600">{money(outstanding)}</td>
                            <td className="px-4 py-3 text-center">
                              <div className="flex items-center justify-center gap-2">
                                <div className="w-20 h-2 bg-muted rounded-full overflow-hidden">
                                  <div className="h-full bg-green-500 rounded-full transition-all" style={{ width: `${pct}%` }} />
                                </div>
                                <span className="text-xs text-muted-foreground">{pct.toFixed(0)}%</span>
                              </div>
                            </td>
                            <td className="px-4 py-3 text-right">
                              <Button
                                size="sm"
                                className="cursor-pointer h-7 text-xs"
                                onClick={() => { setPaymentPOId(po._id); setPaymentAmount(outstanding.toFixed(2)); setPaymentFile(null); setShowPaymentDialog(true); }}
                              >
                                <Banknote className="w-3 h-3 mr-1" />Record Payment
                              </Button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* ── Create PO Dialog ──────────────────────────────── */}
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Create Purchase Order</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Supplier <span className="text-destructive">*</span></Label>
                <SearchableSelect
                  value={form.supplierId}
                  onValueChange={(value) => setForm({ ...form, supplierId: value })}
                  placeholder="Select supplier"
                  searchPlaceholder="Search supplier, TIN or VRN..."
                  options={(suppliers ?? []).filter((s) => s.isActive).map((s) => ({
                    value: s._id,
                    label: s.name,
                    description: [s.contactPerson, s.tin ?? s.taxId, s.vrn].filter(Boolean).join(" · "),
                    keywords: [s.email, s.phone, s.city].filter(Boolean).join(" "),
                  }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Receiving location <span className="text-destructive">*</span></Label>
                <SearchableSelect
                  value={form.locationId}
                  onValueChange={(value) => setForm({ ...form, locationId: value })}
                  placeholder="Select store or warehouse"
                  searchPlaceholder="Search store or warehouse..."
                  options={(receivingLocations ?? []).map((location) => ({ value: `${location.type}:${location.id}`, label: `${location.type === "store" ? "Store" : "Warehouse"} · ${location.name}`, description: [location.branch?.name, location.address].filter(Boolean).join(" · ") }))}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Expected Delivery Date</Label>
                <Input type="date" value={form.expectedDate} onChange={(e) => setForm({ ...form, expectedDate: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>Notes</Label>
                <Input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Optional notes" />
              </div>
            </div>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Reason for Purchase</Label>
                <Textarea value={form.purchaseReason} onChange={(e) => setForm({ ...form, purchaseReason: e.target.value })} placeholder="What operational need does this order address?" rows={3} />
              </div>
              <div className="space-y-1.5">
                <Label>Allocating to <span className="text-destructive">*</span></Label>
                <Select value={form.allocationDepartmentId} onValueChange={(value) => { const department = departments.find((item) => String(item.id) === value); setForm({ ...form, allocationDepartmentId: value, allocation: department?.name ?? "" }); }}>
                  <SelectTrigger><SelectValue placeholder="Select department" /></SelectTrigger>
                  <SelectContent>{departments.length ? departments.map((department) => <SelectItem key={department.id} value={String(department.id)}>{department.name}{department.branch?.name ? ` · ${department.branch.name}` : ""}</SelectItem>) : <SelectItem value="no-departments" disabled>No departments available</SelectItem>}</SelectContent>
                </Select>
                {!departments.length && <p className="text-xs text-muted-foreground">Create a department before allocating this PO.</p>}
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Collected By</Label>
              <Input value={form.collectedBy} onChange={(e) => setForm({ ...form, collectedBy: e.target.value })} placeholder="Name of collector" />
            </div>

            <Separator />

            {/* Line items */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label className="text-sm font-semibold">Order Items</Label>
                <Button variant="ghost" size="sm" onClick={addItem} className="cursor-pointer h-7 text-xs">
                  <Plus className="w-3 h-3 mr-1" />Add Item
                </Button>
              </div>

              {/* Headers */}
              <div className="grid grid-cols-12 gap-2 text-xs text-muted-foreground font-medium px-1">
                <div className="col-span-5">Product</div>
                <div className="col-span-2">Qty</div>
                <div className="col-span-2">Unit Cost</div>
                <div className="col-span-2">Tax %</div>
                <div className="col-span-1" />
              </div>

              {poItems.map((item, idx) => {
                const lineCost = parseFloat(item.orderedQty || "0") * parseFloat(item.unitCost || "0");
                return (
                  <div key={idx} className="grid grid-cols-12 gap-2 items-center">
                    <div className="col-span-5">
                      <SearchableSelect
                        value={item.productId}
                        placeholder="Select product"
                        searchPlaceholder="Search product name..."
                        options={(products ?? []).map((p) => ({
                          value: p._id,
                          label: p.name,
                          keywords: [p.brand, p.model, p.category?.name].filter(Boolean).join(" "),
                        }))}
                        onValueChange={(value) => {
                          const product = (products ?? []).find((p) => p._id === value);
                          updateItem(idx, "productId", value);
                          if (product) updateItem(idx, "unitCost", product.costPrice.toString());
                        }}
                        className="h-8 text-xs"
                      />
                    </div>
                    <div className="col-span-2">
                      <Input className="h-8 text-xs" type="number" min="1" value={item.orderedQty}
                        onChange={(e) => updateItem(idx, "orderedQty", e.target.value)} />
                    </div>
                    <div className="col-span-2">
                      <Input className="h-8 text-xs font-mono" type="number" step="0.01" value={item.unitCost}
                        onChange={(e) => updateItem(idx, "unitCost", e.target.value)} placeholder="0.00" />
                    </div>
                    <div className="col-span-2">
                      <Input className="h-8 text-xs" type="number" step="0.1" value={item.taxRate}
                        onChange={(e) => updateItem(idx, "taxRate", e.target.value)} />
                    </div>
                    <div className="col-span-1 flex items-center gap-1">
                      <Button variant="ghost" size="icon" className="h-7 w-7 cursor-pointer text-muted-foreground hover:text-destructive"
                        onClick={() => removeItem(idx)} disabled={poItems.length === 1}>
                        <Trash2 className="w-3 h-3" />
                      </Button>
                    </div>
                    {lineCost > 0 && (
                      <div className="col-span-12 text-right text-xs text-muted-foreground -mt-1 pr-10">
                        Line total: <span className="font-mono font-semibold text-foreground">{money(lineCost)}</span>
                      </div>
                    )}
                  </div>
                );
              })}

              {/* Order summary */}
              {formTotals.total > 0 && (
                <div className="bg-muted/40 rounded-xl p-3 space-y-1 text-sm">
                  <div className="flex justify-between text-muted-foreground text-xs">
                    <span>Subtotal</span><span className="font-mono">{money(formTotals.subtotal)}</span>
                  </div>
                  {formTotals.tax > 0 && (
                    <div className="flex justify-between text-muted-foreground text-xs">
                      <span>Tax</span><span className="font-mono">{money(formTotals.tax)}</span>
                    </div>
                  )}
                  <div className="flex justify-between font-bold border-t border-border pt-1">
                    <span>Total</span><span className="font-mono">{money(formTotals.total)}</span>
                  </div>
                </div>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setShowCreateDialog(false)} className="cursor-pointer">Cancel</Button>
            <Button onClick={handleCreate} className="cursor-pointer">Create Purchase Order</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Receive Goods Dialog ──────────────────────────── */}
      <Dialog open={showReceiveDialog} onOpenChange={setShowReceiveDialog}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <PackageCheck className="w-4 h-4" />
              Receive Goods
            </DialogTitle>
            {selectedPO && (
              <p className="text-xs text-muted-foreground">{selectedPO.poNumber} · {selectedPO.supplier?.name}</p>
            )}
          </DialogHeader>

          {selectedPO === undefined ? (
            <div className="space-y-3 py-2">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
          ) : selectedPO === null ? (
            <p className="text-muted-foreground text-sm py-4">PO not found</p>
          ) : (
            <div className="space-y-4 py-2">
              <div className="space-y-2">
                {selectedPO.items.map((item) => {
                  const remaining = item.orderedQty - item.receivedQty;
                  return (
                    <div key={item._id} className="flex items-center gap-3 p-3 rounded-lg border border-border bg-muted/20">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{item.product?.name ?? "—"}</p>
                        <p className="text-xs text-muted-foreground">
                          Ordered: {item.orderedQty} · Already received: {item.receivedQty} · Remaining: <span className="font-semibold text-foreground">{remaining}</span>
                        </p>
                      </div>
                      <div className="w-24">
                        <Label className="text-xs text-muted-foreground">Receiving</Label>
                        <Input
                          type="number"
                          min="0"
                          max={remaining}
                          value={receiveQtys[item._id] ?? remaining.toString()}
                          onChange={(e) => setReceiveQtys((prev) => ({ ...prev, [item._id]: e.target.value }))}
                          className="h-8 text-sm text-center font-mono"
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
              <p className="text-xs text-muted-foreground">
                {selectedPO.receivingLocation?.type === "store" ? `This receipt will be recorded for ${selectedPO.receivingLocation.name}.` : `Stock will be automatically updated for ${selectedPO.receivingLocation?.name ?? selectedPO.warehouse?.name ?? "the selected warehouse"}.`}
              </p>
            </div>
          )}

          <DialogFooter>
            <Button variant="ghost" onClick={() => setShowReceiveDialog(false)} className="cursor-pointer">Cancel</Button>
            <Button onClick={handleReceive} className="cursor-pointer">
              <PackageCheck className="w-4 h-4 mr-2" />Confirm Receipt
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Record Payment Dialog ─────────────────────────── */}
      <Dialog open={showPaymentDialog} onOpenChange={setShowPaymentDialog}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Banknote className="w-4 h-4" />
              Verify payment
            </DialogTitle>
          </DialogHeader>
          {paymentPOId && (
            <div className="space-y-4 py-2">
              {(() => {
                const po = (purchaseOrders ?? []).find((p) => p._id === paymentPOId);
                return po ? (
                  <div className="bg-muted/40 rounded-lg p-3 text-sm space-y-1">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">PO</span>
                      <span className="font-mono font-semibold">{po.poNumber}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Total</span>
                      <span className="font-mono">{money(po.totalAmount)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Already paid</span>
                      <span className="font-mono text-green-600">{money(po.paidAmount)}</span>
                    </div>
                    <div className="flex justify-between font-semibold border-t border-border pt-1">
                      <span>Outstanding</span>
                      <span className="font-mono text-amber-600">{money(po.totalAmount - po.paidAmount)}</span>
                    </div>
                  </div>
                ) : null;
              })()}
              <div className="space-y-1.5">
                <Label>Payment Amount</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={paymentAmount}
                  onChange={(e) => setPaymentAmount(e.target.value)}
                  placeholder="0.00"
                  className="font-mono"
                  autoFocus
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="proof-of-payment">Proof of payment</Label>
                <Input id="proof-of-payment" ref={paymentFileInput} type="file" accept=".jpg,.jpeg,.png,.webp,.gif,.pdf,.doc,.docx,.xls,.xlsx,.csv,.txt" onChange={(event) => setPaymentFile(event.target.files?.[0] ?? null)} />
                <p className="text-xs text-muted-foreground">Required. This file will be attached to the payment verification record.</p>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setShowPaymentDialog(false)} className="cursor-pointer">Cancel</Button>
            <Button onClick={handlePayment} className="cursor-pointer">
              <CheckCircle2 className="w-4 h-4 mr-2" />Verify payment
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ── Inline PO detail component ─────────────────────────────────────────────
function POExpandedDetails({ poId, currency, compact = false }: { poId: EntityId<"purchaseOrders">; currency: string; compact?: boolean }) {
  const po = useApiQuery(endpoints.procurement.getPurchaseOrder, { id: poId });

  if (po === undefined) return <div className="p-4"><Skeleton className="h-20 w-full" /></div>;
  if (!po) return null;

  return (
    <div className={cn("space-y-3", compact ? "px-4 pb-4" : "")}>
      {po.notes && (
        <p className="text-xs text-muted-foreground italic">{po.notes}</p>
      )}
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-border">
              <th className="text-left py-1.5 font-medium text-muted-foreground">Product</th>
              <th className="text-right py-1.5 font-medium text-muted-foreground">Ordered</th>
              <th className="text-right py-1.5 font-medium text-muted-foreground">Received</th>
              <th className="text-right py-1.5 font-medium text-muted-foreground">Unit Cost</th>
              <th className="text-right py-1.5 font-medium text-muted-foreground">Total</th>
            </tr>
          </thead>
          <tbody>
            {po.items.map((item) => (
              <tr key={item._id} className="border-b border-border/50 last:border-0">
                <td className="py-1.5">
                  <p className="font-medium">{item.product?.name ?? "—"}</p>
                </td>
                <td className="py-1.5 text-right font-mono">{item.orderedQty}</td>
                <td className="py-1.5 text-right font-mono">
                  <span className={cn(item.receivedQty >= item.orderedQty ? "text-green-600" : item.receivedQty > 0 ? "text-amber-600" : "text-muted-foreground")}>
                    {item.receivedQty}
                  </span>
                </td>
                <td className="py-1.5 text-right font-mono">{formatMoney(item.unitCost, currency)}</td>
                <td className="py-1.5 text-right font-mono font-semibold">{formatMoney(item.total, currency)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex justify-end gap-6 text-xs text-muted-foreground">
        <span>Subtotal: <span className="font-mono text-foreground">{formatMoney(po.subtotal, currency)}</span></span>
        {po.taxAmount > 0 && <span>Tax: <span className="font-mono text-foreground">{formatMoney(po.taxAmount, currency)}</span></span>}
        <span className="font-semibold text-foreground">Total: <span className="font-mono">{formatMoney(po.totalAmount, currency)}</span></span>
      </div>
    </div>
  );
}
