import { useState } from "react";
import { useDraftState } from "@/hooks/use-draft-state.ts";
import { useApiQuery, useApiMutation } from "@/hooks/use-api.ts";
import { endpoints } from "@/api/endpoints.ts";
import { Button } from "@/components/ui/button.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Label } from "@/components/ui/label.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog.tsx";
import { Separator } from "@/components/ui/separator.tsx";
import { toast } from "@/lib/system-message.ts";
import { cn } from "@/lib/utils.ts";
import {
  Plus,
  Building2,
  Edit2,
  Package,
  MapPin,
  Phone,
  X,
  Boxes,
  TrendingUp,
  AlertTriangle,
  Hash,
} from "lucide-react";
import type { EntityId } from "@/types/api.ts";
import { DataExchangeTools } from "@/components/data-exchange/data-exchange-tools.tsx";
import { PageContentLoader } from "@/components/ui/page-loader.tsx";

type WHForm = {
  name: string;
  address: string;
  city: string;
  country: string;
  phone: string;
};
const EMPTY_FORM: WHForm = {
  name: "",
  address: "",
  city: "",
  country: "",
  phone: "",
};

export default function WarehousesPage() {
  const [showDialog, setShowDialog] = useState(false);
  const [editingId, setEditingId] = useState<EntityId<"warehouses"> | null>(null);
  const [form, setForm] = useDraftState("warehouses", EMPTY_FORM);
  const [selectedId, setSelectedId] = useState<EntityId<"warehouses"> | null>(null);
  const [stockSearch, setStockSearch] = useState("");

  const warehouses = useApiQuery(endpoints.warehouses.listWarehouses);
  const createWarehouse = useApiMutation(endpoints.warehouses.createWarehouse);
  const updateWarehouse = useApiMutation(endpoints.warehouses.updateWarehouse);
  const deleteWarehouse = useApiMutation(endpoints.warehouses.deleteWarehouse);

  const stock = useApiQuery(
    endpoints.warehouses.getWarehouseStock,
    selectedId ? { warehouseId: selectedId } : "skip",
  );
  const warehouseStats = useApiQuery(
    endpoints.warehouses.getWarehouseStats,
    selectedId ? { warehouseId: selectedId } : "skip",
  );

  if (warehouses === undefined) return <PageContentLoader variant="cards" />;

  const selectedWarehouse = (warehouses ?? []).find(
    (w) => w._id === selectedId,
  );

  const filteredStock = (stock ?? []).filter(
    (s) =>
      s.product.name.toLowerCase().includes(stockSearch.toLowerCase()) ||
      s.product.sku.toLowerCase().includes(stockSearch.toLowerCase()),
  );

  const handleSave = async () => {
    if (!form.name) {
      toast.error("Warehouse name is required");
      return;
    }
    const data = {
      name: form.name,
      address: form.address || undefined,
      city: form.city || undefined,
      country: form.country || undefined,
      phone: form.phone || undefined,
    };
    try {
      if (editingId) {
        await updateWarehouse({ id: editingId, ...data });
        toast.success("Warehouse updated");
      } else {
        await createWarehouse(data);
        toast.success("Warehouse created");
      }
      setShowDialog(false);
      setForm(EMPTY_FORM);
      setEditingId(null);
    } catch {
      toast.error("Failed to save warehouse");
    }
  };

  const openEdit = (wh: NonNullable<typeof warehouses>[0]) => {
    setForm({
      name: wh.name,
      address: wh.address ?? "",
      city: wh.city ?? "",
      country: wh.country ?? "",
      phone: wh.phone ?? "",
    });
    setEditingId(wh._id);
    setShowDialog(true);
  };

  return (
    <div className="p-5 space-y-5 pb-24 md:pb-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold">Warehouses</h2>
          <p className="text-sm text-muted-foreground">
            {warehouses?.length ?? 0} location
            {(warehouses?.length ?? 0) !== 1 ? "s" : ""}
          </p>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2"><DataExchangeTools /><Button
          onClick={() => {
            setForm(EMPTY_FORM);
            setEditingId(null);
            setShowDialog(true);
          }}
          className="cursor-pointer"
        >
          <Plus className="w-4 h-4 mr-2" />Add Warehouse
        </Button></div>
      </div>

      {/* Warehouse cards grid */}
      {warehouses === undefined ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-44 rounded-xl" />
          ))}
        </div>
      ) : warehouses.length === 0 ? (
        <div className="text-center py-20">
          <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-4">
            <Building2 className="w-8 h-8 text-primary" />
          </div>
          <h3 className="font-semibold text-base mb-1">No warehouses yet</h3>
          <p className="text-sm text-muted-foreground mb-4">
            Add your first storage location to start tracking stock
          </p>
          <Button
            className="cursor-pointer"
            onClick={() => setShowDialog(true)}
          >
            <Plus className="w-4 h-4 mr-2" />Add Warehouse
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {warehouses.map((wh) => (
            <WarehouseCard
              key={wh._id}
              warehouse={wh}
              isSelected={selectedId === wh._id}
              onSelect={() => setSelectedId(selectedId === wh._id ? null : wh._id)}
              onEdit={() => openEdit(wh)}
              onDelete={async () => {
                if (selectedId === wh._id) setSelectedId(null);
                await deleteWarehouse({ id: wh._id });
                toast.success("Warehouse deactivated");
              }}
            />
          ))}
        </div>
      )}

      {/* Stock detail panel for selected warehouse */}
      {selectedId && selectedWarehouse && (
        <div className="space-y-4">
          <Separator />
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                <Package className="w-4 h-4 text-primary" />
              </div>
              <div>
                <h3 className="font-semibold text-sm">
                  Stock at {selectedWarehouse.name}
                </h3>
                <p className="text-xs text-muted-foreground">
                  {stock?.length ?? "..."} product lines
                </p>
              </div>
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="cursor-pointer"
              onClick={() => setSelectedId(null)}
            >
              <X className="w-4 h-4 mr-1" />Close
            </Button>
          </div>

          {/* Stats row */}
          {warehouseStats !== undefined && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {[
                {
                  label: "SKUs",
                  value: warehouseStats.totalSkus,
                  icon: Hash,
                  color: "text-indigo-600",
                },
                {
                  label: "Total Units",
                  value: warehouseStats.totalUnits.toLocaleString(),
                  icon: Boxes,
                  color: "text-blue-600",
                },
                {
                  label: "Stock Value",
                  value: `$${warehouseStats.totalValue.toLocaleString("en-US", { minimumFractionDigits: 2 })}`,
                  icon: TrendingUp,
                  color: "text-green-600",
                },
                {
                  label: "Low Stock",
                  value: warehouseStats.lowStockCount,
                  icon: AlertTriangle,
                  color:
                    warehouseStats.lowStockCount > 0
                      ? "text-amber-500"
                      : "text-green-600",
                },
              ].map((stat) => (
                <Card key={stat.label}>
                  <CardContent className="p-3">
                    <div className="flex items-center gap-2">
                      <stat.icon
                        className={cn("w-4 h-4 shrink-0", stat.color)}
                      />
                      <div>
                        <p className="text-[10px] text-muted-foreground uppercase tracking-wide">
                          {stat.label}
                        </p>
                        <p className="text-sm font-bold">{stat.value}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}

          {/* Stock search */}
          <Input
            placeholder="Search products…"
            value={stockSearch}
            onChange={(e) => setStockSearch(e.target.value)}
            className="max-w-xs"
          />

          <Card>
            <CardContent className="p-0">
              {stock === undefined ? (
                <div className="p-4 space-y-2">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <Skeleton key={i} className="h-12 w-full" />
                  ))}
                </div>
              ) : filteredStock.length === 0 ? (
                <div className="py-12 text-center">
                  <Package className="w-8 h-8 text-muted-foreground/40 mx-auto mb-2" />
                  <p className="text-sm text-muted-foreground">
                    {stockSearch
                      ? "No products matching your search"
                      : "No stock in this warehouse"}
                  </p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border bg-muted/30">
                        <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground">
                          Product
                        </th>
                        <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground hidden md:table-cell">
                          SKU
                        </th>
                        <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground hidden lg:table-cell">
                          Category
                        </th>
                        <th className="text-right px-4 py-2.5 text-xs font-medium text-muted-foreground">
                          On Hand
                        </th>
                        <th className="text-right px-4 py-2.5 text-xs font-medium text-muted-foreground hidden md:table-cell">
                          Reserved
                        </th>
                        <th className="text-right px-4 py-2.5 text-xs font-medium text-muted-foreground hidden lg:table-cell">
                          Available
                        </th>
                        <th className="text-center px-4 py-2.5 text-xs font-medium text-muted-foreground hidden md:table-cell">
                          Stock Status
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredStock.map((s) => {
                        const quantity = Number(s.quantity ?? 0);
                        const reserved = Number(s.reservedQuantity ?? 0);
                        const available = Number(s.available ?? quantity - reserved);
                        const reorderLevel = Number(s.product.reorderLevel ?? 0);
                        const isLow = available <= reorderLevel;
                        const isOut = available <= 0;
                        return (
                          <tr
                            key={s._id}
                            className="border-b border-border last:border-0 hover:bg-muted/20"
                          >
                            <td className="px-4 py-2.5">
                              <p className="font-medium text-sm">
                                {s.product.name}
                              </p>
                            </td>
                            <td className="px-4 py-2.5 hidden md:table-cell font-mono text-xs text-muted-foreground">
                              {s.product.sku}
                            </td>
                            <td className="px-4 py-2.5 hidden lg:table-cell text-xs text-muted-foreground">
                              —
                            </td>
                            <td className="px-4 py-2.5 text-right font-mono font-semibold">
                              {quantity}
                            </td>
                            <td className="px-4 py-2.5 text-right hidden md:table-cell text-muted-foreground font-mono text-sm">
                              {reserved}
                            </td>
                            <td className="px-4 py-2.5 text-right hidden lg:table-cell font-mono text-sm font-semibold text-primary">
                              {available}
                            </td>
                            <td className="px-4 py-2.5 text-center hidden md:table-cell">
                              <Badge
                                className={cn(
                                  "text-xs",
                                  isOut
                                    ? "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"
                                    : isLow
                                      ? "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400"
                                      : "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
                                )}
                              >
                                {isOut
                                  ? "Out of Stock"
                                  : isLow
                                    ? "Low Stock"
                                    : "In Stock"}
                              </Badge>
                            </td>
                          </tr>
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

      {/* Warehouse Dialog */}
      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {editingId ? "Edit Warehouse" : "Add Warehouse"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1.5">
              <Label>
                Name <span className="text-destructive">*</span>
              </Label>
              <Input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="Main Warehouse"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Street Address</Label>
              <Input
                value={form.address}
                onChange={(e) =>
                  setForm({ ...form, address: e.target.value })
                }
                placeholder="123 Logistics Ave"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>City</Label>
                <Input
                  value={form.city}
                  onChange={(e) => setForm({ ...form, city: e.target.value })}
                  placeholder="New York"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Country</Label>
                <Input
                  value={form.country}
                  onChange={(e) =>
                    setForm({ ...form, country: e.target.value })
                  }
                  placeholder="USA"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Phone</Label>
              <Input
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
                placeholder="+1 555 0000"
              />
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
            <Button onClick={handleSave} className="cursor-pointer">
              {editingId ? "Update Warehouse" : "Create Warehouse"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ── Warehouse card component ──────────────────────────────────────────
type WarehouseData = {
  _id: EntityId<"warehouses">;
  name: string;
  address?: string;
  city?: string;
  country?: string;
  phone?: string;
  isActive: boolean;
};

function WarehouseCard({
  warehouse,
  isSelected,
  onSelect,
  onEdit,
  onDelete,
}: {
  warehouse: WarehouseData;
  isSelected: boolean;
  onSelect: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const stats = useApiQuery(endpoints.warehouses.getWarehouseStats, {
    warehouseId: warehouse._id,
  });

  return (
    <Card
      onClick={onSelect}
      className={cn(
        "cursor-pointer transition-all hover:shadow-md group",
        isSelected && "ring-2 ring-primary shadow-md",
      )}
    >
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3 min-w-0">
            <div
              className={cn(
                "w-10 h-10 rounded-xl flex items-center justify-center shrink-0 transition-colors",
                isSelected ? "bg-primary text-primary-foreground" : "bg-primary/10",
              )}
            >
              <Building2
                className={cn(
                  "w-5 h-5",
                  isSelected ? "text-primary-foreground" : "text-primary",
                )}
              />
            </div>
            <div className="min-w-0">
              <CardTitle className="text-sm truncate">{warehouse.name}</CardTitle>
              {(warehouse.city || warehouse.country) && (
                <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                  <MapPin className="w-3 h-3 shrink-0" />
                  {[warehouse.city, warehouse.country]
                    .filter(Boolean)
                    .join(", ")}
                </p>
              )}
            </div>
          </div>
          {/* Actions — shown on hover */}
          <div
            className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
            onClick={(e) => e.stopPropagation()}
          >
            <Button
              variant="ghost"
              size="icon"
              className="w-7 h-7 cursor-pointer"
              onClick={onEdit}
            >
              <Edit2 className="w-3 h-3" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="w-7 h-7 cursor-pointer text-muted-foreground hover:text-destructive"
              onClick={onDelete}
            >
              <X className="w-3 h-3" />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {warehouse.address && (
          <p className="text-xs text-muted-foreground truncate">
            {warehouse.address}
          </p>
        )}
        {warehouse.phone && (
          <p className="text-xs text-muted-foreground flex items-center gap-1 mt-1">
            <Phone className="w-3 h-3" />
            {warehouse.phone}
          </p>
        )}

        {/* Live stats */}
        {stats === undefined ? (
          <div className="mt-3 space-y-1">
            <Skeleton className="h-3 w-3/4" />
            <Skeleton className="h-3 w-1/2" />
          </div>
        ) : (
          <div className="mt-3 pt-3 border-t border-border grid grid-cols-3 gap-2 text-center">
            <div>
              <p className="text-xs font-bold">{stats.totalSkus}</p>
              <p className="text-[10px] text-muted-foreground">SKUs</p>
            </div>
            <div>
              <p className="text-xs font-bold">
                {stats.totalUnits.toLocaleString()}
              </p>
              <p className="text-[10px] text-muted-foreground">Units</p>
            </div>
            <div>
              <p
                className={cn(
                  "text-xs font-bold",
                  stats.lowStockCount > 0
                    ? "text-amber-500"
                    : "text-green-600",
                )}
              >
                {stats.lowStockCount}
              </p>
              <p className="text-[10px] text-muted-foreground">Low</p>
            </div>
          </div>
        )}

        <div className="mt-2">
          <Badge
            variant="secondary"
            className={cn(
              "text-[10px] px-1.5 py-0 h-4",
              isSelected ? "bg-primary/10 text-primary" : "",
            )}
          >
            {isSelected ? "Viewing stock →" : "Click to view stock"}
          </Badge>
        </div>
      </CardContent>
    </Card>
  );
}
