import { useState, useMemo } from "react";
import { useDraftState } from "@/hooks/use-draft-state.ts";
import { useApiQuery, useApiMutation } from "@/hooks/use-api.ts";
import { useNavigate } from "react-router-dom";
import { endpoints } from "@/api/endpoints.ts";
import { Button } from "@/components/ui/button.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Label } from "@/components/ui/label.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import { Card, CardContent } from "@/components/ui/card.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog.tsx";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select.tsx";
import { Separator } from "@/components/ui/separator.tsx";
import { toast } from "@/lib/system-message.ts";
import { cn } from "@/lib/utils.ts";
import {
  Plus,
  Search,
  Truck,
  Trash2,
  Package,
  ArrowRight,
  PackageOpen,
  ArrowLeftRight,
  X,
  ChevronDown,
  ChevronUp,
  Clock,
  MapPin,
  Send,
  CheckCircle2,
  AlertCircle,
  Navigation,
  Banknote,
} from "lucide-react";
import { format, parseISO, isAfter } from "date-fns";
import type { EntityId } from "@/types/api.ts";
import { PageContentLoader } from "@/components/ui/page-loader.tsx";
import { useAuth } from "@/hooks/use-auth.ts";

const STATUS_COLORS: Record<string, string> = {
  pending:
    "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
  in_transit:
    "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  delivered:
    "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
  cancelled: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
};

const TYPE_CONFIG = {
  inbound: {
    label: "Inbound",
    icon: PackageOpen,
    color: "bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400",
  },
  outbound: {
    label: "Outbound",
    icon: Send,
    color: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  },
  transfer: {
    label: "Transfer",
    icon: ArrowLeftRight,
    color: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400",
  },
};

type ShipItem = { productId: string; quantity: string; unitCost: string };

type ShipmentForm = {
  type: "inbound" | "outbound" | "transfer";
  fromWarehouseId: string;
  toWarehouseId: string;
  supplierId: string;
  customerId: string;
  carrier: string;
  trackingNumber: string;
  estimatedDelivery: string;
  notes: string;
};

const EMPTY_FORM: ShipmentForm = {
  type: "outbound",
  fromWarehouseId: "",
  toWarehouseId: "",
  supplierId: "",
  customerId: "",
  carrier: "",
  trackingNumber: "",
  estimatedDelivery: "",
  notes: "",
};

export default function LogisticsPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const canViewPettyCash = user?.role === "super_admin" || user?.permissions.includes("petty_cash.view");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [showDialog, setShowDialog] = useState(false);
  const [form, setForm] = useDraftState("logistics-shipment", EMPTY_FORM);
  const [shipItems, setShipItems] = useState<ShipItem[]>([
    { productId: "", quantity: "1", unitCost: "" },
  ]);
  const [expandedId, setExpandedId] = useState<EntityId<"shipments"> | null>(null);

  const shipments = useApiQuery(endpoints.logistics.listShipments, {});
  const warehouses = useApiQuery(endpoints.warehouses.listWarehouses);
  const suppliers = useApiQuery(endpoints.suppliers.listSuppliers);
  const customers = useApiQuery(endpoints.customers.listCustomers);
  const products = useApiQuery(endpoints.inventory.listProducts, {
    includeInactive: false,
  });
  const createShipment = useApiMutation(endpoints.logistics.createShipment);
  const updateStatus = useApiMutation(endpoints.logistics.updateShipmentStatus);

  // Summary KPIs
  const stats = useMemo(() => {
    const all = shipments ?? [];
    return {
      total: all.length,
      pending: all.filter((s) => s.status === "pending").length,
      inTransit: all.filter((s) => s.status === "in_transit").length,
      overdue: all.filter(
        (s) =>
          s.status === "in_transit" &&
          s.estimatedDelivery &&
          isAfter(new Date(), parseISO(s.estimatedDelivery)),
      ).length,
    };
  }, [shipments]);

  const filtered = useMemo(
    () =>
      (shipments ?? []).filter((s) => {
        const matchSearch =
          s.shipmentNumber.toLowerCase().includes(search.toLowerCase()) ||
          (s.trackingNumber ?? "").toLowerCase().includes(search.toLowerCase()) ||
          (s.carrier ?? "").toLowerCase().includes(search.toLowerCase()) ||
          (s.customer?.name ?? "").toLowerCase().includes(search.toLowerCase()) ||
          (s.supplier?.name ?? "").toLowerCase().includes(search.toLowerCase());
        const matchStatus = statusFilter === "all" || s.status === statusFilter;
        const matchType = typeFilter === "all" || s.type === typeFilter;
        return matchSearch && matchStatus && matchType;
      }),
    [shipments, search, statusFilter, typeFilter],
  );

  if (shipments === undefined) return <PageContentLoader variant="table" />;

  const addItem = () =>
    setShipItems((p) => [...p, { productId: "", quantity: "1", unitCost: "" }]);
  const removeItem = (i: number) =>
    setShipItems((p) => p.filter((_, idx) => idx !== i));
  const updateItem = (
    idx: number,
    field: keyof ShipItem,
    value: string,
  ) =>
    setShipItems((p) =>
      p.map((it, i) => (i === idx ? { ...it, [field]: value } : it)),
    );

  const handleCreate = async () => {
    const validItems = shipItems.filter((i) => i.productId && i.quantity);
    if (!validItems.length) {
      toast.error("Add at least one item");
      return;
    }
    if (form.type === "transfer" && (!form.fromWarehouseId || !form.toWarehouseId)) {
      toast.error("Select both source and destination warehouses for a transfer");
      return;
    }
    try {
      await createShipment({
        type: form.type,
        fromWarehouseId: form.fromWarehouseId
          ? (form.fromWarehouseId as EntityId<"warehouses">)
          : undefined,
        toWarehouseId: form.toWarehouseId
          ? (form.toWarehouseId as EntityId<"warehouses">)
          : undefined,
        supplierId: form.supplierId
          ? (form.supplierId as EntityId<"suppliers">)
          : undefined,
        customerId: form.customerId
          ? (form.customerId as EntityId<"customers">)
          : undefined,
        carrier: form.carrier || undefined,
        trackingNumber: form.trackingNumber || undefined,
        estimatedDelivery: form.estimatedDelivery || undefined,
        notes: form.notes || undefined,
        items: validItems.map((i) => ({
          productId: i.productId as EntityId<"products">,
          quantity: parseInt(i.quantity),
          unitCost: i.unitCost ? parseFloat(i.unitCost) : undefined,
        })),
      });
      toast.success("Shipment created");
      setShowDialog(false);
      setForm(EMPTY_FORM);
      setShipItems([{ productId: "", quantity: "1", unitCost: "" }]);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to create shipment");
    }
  };

  return (
    <div className="p-5 space-y-5 pb-24 md:pb-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold">Logistics & Shipments</h2>
          <p className="text-sm text-muted-foreground">
            {shipments?.length ?? 0} shipments tracked
          </p>
        </div>
        <div className="flex flex-wrap justify-end gap-2">
          {canViewPettyCash && <Button variant="outline" onClick={() => navigate("/petty-cash")} className="cursor-pointer"><Banknote className="w-4 h-4 mr-2" />Petty Cash</Button>}
          <Button onClick={() => setShowDialog(true)} className="cursor-pointer"><Plus className="w-4 h-4 mr-2" />New Shipment</Button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          {
            label: "Total Shipments",
            value: stats.total,
            icon: Truck,
            color: "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400",
          },
          {
            label: "Pending",
            value: stats.pending,
            icon: Clock,
            color: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
          },
          {
            label: "In Transit",
            value: stats.inTransit,
            icon: Navigation,
            color: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
          },
          {
            label: "Overdue",
            value: stats.overdue,
            icon: AlertCircle,
            color:
              stats.overdue > 0
                ? "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"
                : "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
          },
        ].map((stat) => (
          <Card key={stat.label}>
            <CardContent className="p-4">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-xs text-muted-foreground uppercase tracking-wider font-medium">
                    {stat.label}
                  </p>
                  <p className="text-2xl font-bold mt-0.5">{stat.value}</p>
                </div>
                <div
                  className={cn(
                    "w-8 h-8 rounded-lg flex items-center justify-center",
                    stat.color,
                  )}
                >
                  <stat.icon className="w-4 h-4" />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search by SHP#, tracking, carrier, customer…"
            className="pl-9"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-36">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="in_transit">In Transit</SelectItem>
            <SelectItem value="delivered">Delivered</SelectItem>
            <SelectItem value="cancelled">Cancelled</SelectItem>
          </SelectContent>
        </Select>
        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="w-36">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            <SelectItem value="inbound">Inbound</SelectItem>
            <SelectItem value="outbound">Outbound</SelectItem>
            <SelectItem value="transfer">Transfer</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Shipments Table */}
      <Card>
        <CardContent className="p-0">
          {shipments === undefined ? (
            <div className="p-4 space-y-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-14 w-full" />
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <div className="py-16 text-center">
              <Truck className="w-10 h-10 text-muted-foreground/40 mx-auto mb-3" />
              <p className="text-sm text-muted-foreground">No shipments found</p>
              <Button
                variant="ghost"
                size="sm"
                className="mt-2 cursor-pointer"
                onClick={() => setShowDialog(true)}
              >
                Create your first shipment
              </Button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/30">
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">
                      Shipment
                    </th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground hidden md:table-cell">
                      Type
                    </th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground hidden lg:table-cell">
                      Route / Party
                    </th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground hidden md:table-cell">
                      Carrier
                    </th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground hidden lg:table-cell">
                      Est. Delivery
                    </th>
                    <th className="text-center px-4 py-3 font-medium text-muted-foreground">
                      Status
                    </th>
                    <th className="text-right px-4 py-3 font-medium text-muted-foreground">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((s) => {
                    const isExpanded = expandedId === s._id;
                    const TypeIcon = TYPE_CONFIG[s.type].icon;
                    const isOverdue =
                      s.status === "in_transit" &&
                      s.estimatedDelivery &&
                      isAfter(new Date(), parseISO(s.estimatedDelivery));

                    return (
                      <>
                        <tr
                          key={s._id}
                          className={cn(
                            "border-b border-border last:border-0 hover:bg-muted/20 transition-colors",
                            isExpanded && "bg-muted/10",
                          )}
                        >
                          <td className="px-4 py-3">
                            <p className="font-mono text-xs font-semibold">
                              {s.shipmentNumber}
                            </p>
                            <p className="text-[10px] text-muted-foreground mt-0.5">
                              {s.itemCount} item{s.itemCount !== 1 ? "s" : ""}{" "}
                              · {format(parseISO(s.createdAt), "MMM d")}
                            </p>
                          </td>
                          <td className="px-4 py-3 hidden md:table-cell">
                            <Badge
                              className={cn(
                                "text-xs gap-1",
                                TYPE_CONFIG[s.type].color,
                              )}
                            >
                              <TypeIcon className="w-3 h-3" />
                              {TYPE_CONFIG[s.type].label}
                            </Badge>
                          </td>
                          <td className="px-4 py-3 hidden lg:table-cell text-xs text-muted-foreground">
                            <div className="flex items-center gap-1">
                              {s.fromWarehouse?.name && (
                                <span className="flex items-center gap-1">
                                  <MapPin className="w-3 h-3" />
                                  {s.fromWarehouse.name}
                                </span>
                              )}
                              {s.fromWarehouse?.name &&
                                (s.toWarehouse?.name ||
                                  s.customer?.name ||
                                  s.supplier?.name) && (
                                  <ArrowRight className="w-3 h-3 shrink-0" />
                                )}
                              {s.toWarehouse?.name && (
                                <span>{s.toWarehouse.name}</span>
                              )}
                              {s.supplier?.name && (
                                <span>{s.supplier.name}</span>
                              )}
                              {s.customer?.name && (
                                <span>{s.customer.name}</span>
                              )}
                            </div>
                          </td>
                          <td className="px-4 py-3 hidden md:table-cell">
                            <div>
                              <p className="text-xs font-medium">
                                {s.carrier ?? "—"}
                              </p>
                              {s.trackingNumber && (
                                <p className="text-[10px] text-muted-foreground font-mono">
                                  {s.trackingNumber}
                                </p>
                              )}
                            </div>
                          </td>
                          <td className="px-4 py-3 hidden lg:table-cell">
                            {s.estimatedDelivery ? (
                              <span
                                className={cn(
                                  "text-xs",
                                  isOverdue
                                    ? "text-red-500 font-medium"
                                    : "text-muted-foreground",
                                )}
                              >
                                {isOverdue && (
                                  <AlertCircle className="w-3 h-3 inline mr-1" />
                                )}
                                {format(
                                  parseISO(s.estimatedDelivery),
                                  "MMM d, yyyy",
                                )}
                              </span>
                            ) : (
                              <span className="text-xs text-muted-foreground">
                                —
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-center">
                            <Badge
                              className={cn(
                                "text-xs",
                                STATUS_COLORS[s.status],
                              )}
                            >
                              {s.status.replace("_", " ")}
                            </Badge>
                          </td>
                          <td className="px-4 py-3 text-right">
                            <div className="flex items-center justify-end gap-0.5">
                              {s.status === "pending" && (
                                <>
                                  <Button
                                    size="sm"
                                    variant="secondary"
                                    className="text-xs h-7 cursor-pointer"
                                    onClick={async () => {
                                      await updateStatus({
                                        id: s._id,
                                        status: "in_transit",
                                      });
                                      toast.success("Shipment dispatched");
                                    }}
                                  >
                                    <Truck className="w-3 h-3 mr-1" />
                                    Dispatch
                                  </Button>
                                  <Button
                                    size="icon"
                                    variant="ghost"
                                    className="w-7 h-7 cursor-pointer text-muted-foreground hover:text-destructive"
                                    onClick={async () => {
                                      await updateStatus({
                                        id: s._id,
                                        status: "cancelled",
                                      });
                                      toast.success("Shipment cancelled");
                                    }}
                                  >
                                    <X className="w-3 h-3" />
                                  </Button>
                                </>
                              )}
                              {s.status === "in_transit" && (
                                <Button
                                  size="sm"
                                  className="text-xs h-7 cursor-pointer"
                                  onClick={async () => {
                                    await updateStatus({
                                      id: s._id,
                                      status: "delivered",
                                    });
                                    toast.success("Marked as delivered");
                                  }}
                                >
                                  <CheckCircle2 className="w-3 h-3 mr-1" />
                                  Deliver
                                </Button>
                              )}
                              {/* Expand button */}
                              <Button
                                size="icon"
                                variant="ghost"
                                className="w-7 h-7 cursor-pointer"
                                onClick={() =>
                                  setExpandedId(isExpanded ? null : s._id)
                                }
                              >
                                {isExpanded ? (
                                  <ChevronUp className="w-3 h-3" />
                                ) : (
                                  <ChevronDown className="w-3 h-3" />
                                )}
                              </Button>
                            </div>
                          </td>
                        </tr>

                        {/* Expanded details row */}
                        {isExpanded && (
                          <tr
                            key={`${s._id}-exp`}
                            className="border-b border-border bg-muted/5"
                          >
                            <td colSpan={7} className="px-6 py-3">
                              <ShipmentExpandedDetails shipmentId={s._id} />
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

      {/* Create Shipment Dialog */}
      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Create Shipment</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            {/* Type selector as pills */}
            <div className="space-y-1.5">
              <Label>Shipment Type</Label>
              <div className="flex gap-2">
                {(
                  Object.entries(TYPE_CONFIG) as [
                    keyof typeof TYPE_CONFIG,
                    (typeof TYPE_CONFIG)[keyof typeof TYPE_CONFIG],
                  ][]
                ).map(([key, cfg]) => {
                  const Icon = cfg.icon;
                  return (
                    <button
                      key={key}
                      onClick={() =>
                        setForm({
                          ...EMPTY_FORM,
                          type: key,
                        })
                      }
                      className={cn(
                        "flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-lg border text-sm font-medium transition-colors cursor-pointer",
                        form.type === key
                          ? "border-primary bg-primary/10 text-primary"
                          : "border-border text-muted-foreground hover:border-primary/50",
                      )}
                    >
                      <Icon className="w-4 h-4" />
                      {cfg.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Dynamic party / warehouse fields */}
            <div className="grid grid-cols-2 gap-3">
              {(form.type === "inbound" || form.type === "transfer") && (
                <div className="space-y-1.5">
                  <Label>
                    {form.type === "inbound" ? "Destination" : "From"}{" "}
                    Warehouse
                  </Label>
                  <Select
                    value={form.fromWarehouseId || "none"}
                    onValueChange={(v) =>
                      setForm({
                        ...form,
                        fromWarehouseId: v === "none" ? "" : v,
                      })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select warehouse" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Select warehouse</SelectItem>
                      {(warehouses ?? []).map((w) => (
                        <SelectItem key={w._id} value={w._id}>
                          {w.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              {form.type === "transfer" && (
                <div className="space-y-1.5">
                  <Label>To Warehouse</Label>
                  <Select
                    value={form.toWarehouseId || "none"}
                    onValueChange={(v) =>
                      setForm({
                        ...form,
                        toWarehouseId: v === "none" ? "" : v,
                      })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select warehouse" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Select warehouse</SelectItem>
                      {(warehouses ?? [])
                        .filter((w) => w._id !== form.fromWarehouseId)
                        .map((w) => (
                          <SelectItem key={w._id} value={w._id}>
                            {w.name}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              {form.type === "outbound" && (
                <div className="space-y-1.5">
                  <Label>From Warehouse</Label>
                  <Select
                    value={form.fromWarehouseId || "none"}
                    onValueChange={(v) =>
                      setForm({
                        ...form,
                        fromWarehouseId: v === "none" ? "" : v,
                      })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select warehouse" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Select warehouse</SelectItem>
                      {(warehouses ?? []).map((w) => (
                        <SelectItem key={w._id} value={w._id}>
                          {w.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              {form.type === "inbound" && (
                <div className="space-y-1.5">
                  <Label>Supplier</Label>
                  <Select
                    value={form.supplierId || "none"}
                    onValueChange={(v) =>
                      setForm({ ...form, supplierId: v === "none" ? "" : v })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select supplier" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Select supplier</SelectItem>
                      {(suppliers ?? []).map((s) => (
                        <SelectItem key={s._id} value={s._id}>
                          {s.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              {form.type === "outbound" && (
                <div className="space-y-1.5">
                  <Label>Customer</Label>
                  <Select
                    value={form.customerId || "none"}
                    onValueChange={(v) =>
                      setForm({ ...form, customerId: v === "none" ? "" : v })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select customer" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Select customer</SelectItem>
                      {(customers ?? []).map((c) => (
                        <SelectItem key={c._id} value={c._id}>
                          {c.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>

            {/* Carrier & Tracking */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Carrier</Label>
                <Input
                  value={form.carrier}
                  onChange={(e) => setForm({ ...form, carrier: e.target.value })}
                  placeholder="FedEx, DHL, UPS…"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Tracking Number</Label>
                <Input
                  value={form.trackingNumber}
                  onChange={(e) =>
                    setForm({ ...form, trackingNumber: e.target.value })
                  }
                  placeholder="Optional"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Est. Delivery Date</Label>
                <Input
                  type="date"
                  value={form.estimatedDelivery}
                  onChange={(e) =>
                    setForm({ ...form, estimatedDelivery: e.target.value })
                  }
                />
              </div>
              <div className="space-y-1.5">
                <Label>Notes</Label>
                <Input
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                  placeholder="Optional"
                />
              </div>
            </div>

            <Separator />

            {/* Items */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label className="text-sm font-semibold">Items</Label>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={addItem}
                  className="cursor-pointer h-7 text-xs"
                >
                  <Plus className="w-3 h-3 mr-1" />Add Item
                </Button>
              </div>

              <div className="grid grid-cols-12 gap-2 text-xs text-muted-foreground font-medium px-1">
                <div className="col-span-6">Product</div>
                <div className="col-span-2">Qty</div>
                <div className="col-span-3">Unit Cost</div>
                <div className="col-span-1" />
              </div>

              {shipItems.map((item, idx) => (
                <div key={idx} className="grid grid-cols-12 gap-2 items-center">
                  <div className="col-span-6">
                    <Select
                      value={item.productId || "none"}
                      onValueChange={(v) =>
                        updateItem(idx, "productId", v === "none" ? "" : v)
                      }
                    >
                      <SelectTrigger className="h-8 text-xs">
                        <SelectValue placeholder="Select product" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Select product</SelectItem>
                        {(products ?? []).map((p) => (
                          <SelectItem key={p._id} value={p._id}>
                            <span className="flex items-center gap-2">
                              {p.name}
                              <span className="text-muted-foreground font-mono text-[10px]">
                                {p.sku}
                              </span>
                            </span>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="col-span-2">
                    <Input
                      className="h-8 text-xs text-center"
                      type="number"
                      min="1"
                      value={item.quantity}
                      onChange={(e) =>
                        updateItem(idx, "quantity", e.target.value)
                      }
                    />
                  </div>
                  <div className="col-span-3">
                    <Input
                      className="h-8 text-xs font-mono"
                      type="number"
                      step="0.01"
                      value={item.unitCost}
                      onChange={(e) =>
                        updateItem(idx, "unitCost", e.target.value)
                      }
                      placeholder="0.00"
                    />
                  </div>
                  <div className="col-span-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 cursor-pointer text-muted-foreground hover:text-destructive"
                      onClick={() => removeItem(idx)}
                      disabled={shipItems.length === 1}
                    >
                      <Trash2 className="w-3 h-3" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => setShowDialog(false)}
              className="cursor-pointer"
            >
              Cancel
            </Button>
            <Button onClick={handleCreate} className="cursor-pointer">
              <Package className="w-4 h-4 mr-2" />Create Shipment
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// Expanded row — shows items list
function ShipmentExpandedDetails({
  shipmentId,
}: {
  shipmentId: EntityId<"shipments">;
}) {
  const shipment = useApiQuery(endpoints.logistics.getShipment, { id: shipmentId });

  if (shipment === undefined)
    return (
      <div className="py-2">
        <Skeleton className="h-20 w-full" />
      </div>
    );
  if (!shipment) return null;

  return (
    <div className="space-y-3">
      {shipment.notes && (
        <p className="text-xs text-muted-foreground italic">{shipment.notes}</p>
      )}

      <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
        {shipment.carrier && (
          <span>
            <Truck className="w-3 h-3 inline mr-1" />
            {shipment.carrier}
            {shipment.trackingNumber && (
              <span className="font-mono ml-1">({shipment.trackingNumber})</span>
            )}
          </span>
        )}
        {shipment.actualDelivery && (
          <span>
            <CheckCircle2 className="w-3 h-3 inline mr-1 text-green-500" />
            Delivered {format(parseISO(shipment.actualDelivery), "MMM d, yyyy")}
          </span>
        )}
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-border">
              <th className="text-left py-1.5 font-medium text-muted-foreground">
                Product
              </th>
              <th className="text-right py-1.5 font-medium text-muted-foreground">
                Quantity
              </th>
              <th className="text-right py-1.5 font-medium text-muted-foreground hidden md:table-cell">
                Unit Cost
              </th>
              <th className="text-right py-1.5 font-medium text-muted-foreground hidden md:table-cell">
                Total
              </th>
            </tr>
          </thead>
          <tbody>
            {shipment.items.map((item) => {
              const total =
                item.unitCost != null
                  ? item.quantity * item.unitCost
                  : null;
              return (
                <tr
                  key={item._id}
                  className="border-b border-border/50 last:border-0"
                >
                  <td className="py-1.5">
                    <p className="font-medium">{item.product?.name ?? "—"}</p>
                    <p className="text-muted-foreground font-mono">
                      {item.product?.sku}
                    </p>
                  </td>
                  <td className="py-1.5 text-right font-mono font-semibold">
                    {item.quantity}
                  </td>
                  <td className="py-1.5 text-right font-mono text-muted-foreground hidden md:table-cell">
                    {item.unitCost != null ? `$${item.unitCost.toFixed(2)}` : "—"}
                  </td>
                  <td className="py-1.5 text-right font-mono font-semibold hidden md:table-cell">
                    {total != null ? `$${total.toFixed(2)}` : "—"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
