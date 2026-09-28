import { useEffect, useState } from "react";
import { useDraftState } from "@/hooks/use-draft-state.ts";
import { useSearchParams } from "react-router-dom";
import { useApiQuery, useApiMutation } from "@/hooks/use-api.ts";
import { endpoints } from "@/api/endpoints.ts";
import { Button } from "@/components/ui/button.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Label } from "@/components/ui/label.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog.tsx";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select.tsx";
import { Textarea } from "@/components/ui/textarea.tsx";
import { Separator } from "@/components/ui/separator.tsx";
import { toast } from "@/lib/system-message.ts";
import { cn } from "@/lib/utils.ts";
import {
  Plus, Search, Package, Edit2, AlertTriangle, BarChart3,
  Layers, ArrowLeftRight, TrendingUp, DollarSign, Archive,
  X, ChevronRight, Filter, Eye, EyeOff, Tag, Trash2,
} from "lucide-react";
import { format, parseISO } from "date-fns";
import type { EntityId } from "@/types/api.ts";
import { DataExchangeTools } from "@/components/data-exchange/data-exchange-tools.tsx";
import { PageContentLoader } from "@/components/ui/page-loader.tsx";
import { useAuth } from "@/hooks/use-auth.ts";
import { useConfirmation } from "@/hooks/use-confirmation.tsx";
import { queueOfflineOperation } from "@/lib/offline-store.ts";
import {
  BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Tooltip, Cell,
} from "recharts";

type ProductFormData = {
  sku: string; name: string; description: string; costPrice: string;
  sellingPrice: string; taxRate: string; reorderLevel: string; barcode: string;
  imageUrl: string; categoryId: string; unitId: string; tags: string;
};

const emptyForm: ProductFormData = {
  sku: "", name: "", description: "", costPrice: "", sellingPrice: "",
  taxRate: "0", reorderLevel: "5", barcode: "", imageUrl: "", categoryId: "", unitId: "", tags: "",
};

type ActiveTab = "products" | "stock" | "valuation" | "categories";

const ADJUSTMENT_COLORS: Record<string, string> = {
  add: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
  remove: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
  transfer: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  sale: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400",
  issue: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400",
  purchase: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
  return: "bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-400",
};

const CAT_COLORS = ["#6366f1","#22c55e","#f59e0b","#ef4444","#8b5cf6","#06b6d4","#ec4899","#f97316"];
const formatMoney = (value: number) => `TZS ${Number(value ?? 0).toLocaleString("en-TZ", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default function InventoryPage() {
  const { user } = useAuth();
  const { confirm, confirmationDialog } = useConfirmation();
  const canManageMasterData = user?.role === "super_admin" || user?.permissions.includes("master_data.manage");
  const [searchParams] = useSearchParams();
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [stockFilter, setStockFilter] = useState<"all" | "low" | "out">("all");
  const [showInactive, setShowInactive] = useState(false);
  const [activeTab, setActiveTab] = useState<ActiveTab>("products");

  useEffect(() => {
    const view = searchParams.get("view");
    if (view === "stock") setActiveTab("stock");
    else if (view === "valuation") setActiveTab("valuation");
    else if (["categories", "subcategories", "brands", "units"].includes(view ?? "")) setActiveTab("categories");
    else setActiveTab("products");
  }, [searchParams]);

  // Product dialog
  const [showDialog, setShowDialog] = useState(false);
  const [editingId, setEditingId] = useState<EntityId<"products"> | null>(null);
  const [form, setForm] = useDraftState("inventory-product", emptyForm);

  // Stock adjust dialog
  const [showAdjust, setShowAdjust] = useState(false);
  const [adjustProductId, setAdjustProductId] = useState<EntityId<"products"> | null>(null);
  const [adjustProductName, setAdjustProductName] = useState("");
  const [adjustForm, setAdjustForm] = useDraftState("inventory-adjustment", { warehouseId: "", type: "add" as "add" | "remove", quantity: "1", reason: "" });

  // Transfer dialog
  const [showTransfer, setShowTransfer] = useState(false);
  const [transferProductId, setTransferProductId] = useState<EntityId<"products"> | null>(null);
  const [transferProductName, setTransferProductName] = useState("");
  const [transferForm, setTransferForm] = useDraftState("inventory-transfer", { fromWarehouseId: "", toWarehouseId: "", quantity: "1", reason: "" });

  // Detail slide-over
  const [selectedProductId, setSelectedProductId] = useState<EntityId<"products"> | null>(null);

  // Category form
  const [catForm, setCatForm] = useDraftState("inventory-category", { name: "", description: "", color: "#6366f1" });
  const [editCatId, setEditCatId] = useState<EntityId<"categories"> | null>(null);

  // Unit form
  const [unitForm, setUnitForm] = useDraftState("inventory-unit", { name: "", abbreviation: "" });

  const products = useApiQuery(endpoints.inventory.listProducts, { includeInactive: showInactive });
  const categories = useApiQuery(endpoints.inventory.listCategories);
  const units = useApiQuery(endpoints.inventory.listUnits);
  const warehouses = useApiQuery(endpoints.warehouses.listWarehouses);
  const adjustments = useApiQuery(endpoints.inventory.getStockAdjustments, {});
  const valuation = useApiQuery(endpoints.inventory.getInventoryValuation);
  const selectedProduct = useApiQuery(
    endpoints.inventory.getProduct,
    selectedProductId ? { id: selectedProductId } : "skip",
  );

  const createProduct = useApiMutation(endpoints.inventory.createProduct);
  const updateProduct = useApiMutation(endpoints.inventory.updateProduct);
  const deleteProduct = useApiMutation(endpoints.inventory.deleteProduct);
  const toggleActive = useApiMutation(endpoints.inventory.toggleProductActive);
  const adjustStock = useApiMutation(endpoints.inventory.adjustStock);
  const transferStock = useApiMutation(endpoints.inventory.transferStock);
  const createCategory = useApiMutation(endpoints.inventory.createCategory);
   const updateCategory = useApiMutation(endpoints.inventory.updateCategory);
   const deleteCategory = useApiMutation(endpoints.inventory.deleteCategory);
   const createUnit = useApiMutation(endpoints.inventory.createUnit);
   const deleteUnit = useApiMutation(endpoints.inventory.deleteUnit);

  if (products === undefined) return <PageContentLoader variant="table" />;

  const filtered = (products ?? []).filter((p) => {
    const matchSearch =
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      p.sku.toLowerCase().includes(search.toLowerCase()) ||
      (p.barcode ?? "").includes(search) ||
      (p.tags ?? []).some((t) => t.toLowerCase().includes(search.toLowerCase()));
    const matchCat = categoryFilter === "all" || p.categoryId === categoryFilter;
    const matchStock =
      stockFilter === "all" ||
      (stockFilter === "low" && p.totalStock > 0 && p.totalStock <= p.reorderLevel) ||
      (stockFilter === "out" && p.totalStock === 0);
    return matchSearch && matchCat && matchStock;
  });

  const handleSaveProduct = async () => {
    if (!form.name || !form.sku || !form.costPrice || !form.sellingPrice) {
      toast.error("Please fill required fields");
      return;
    }
    try {
      const data = {
        sku: form.sku, name: form.name,
        description: form.description || undefined,
        costPrice: parseFloat(form.costPrice),
        sellingPrice: parseFloat(form.sellingPrice),
        taxRate: parseFloat(form.taxRate) || 0,
        reorderLevel: parseInt(form.reorderLevel) || 5,
        barcode: form.barcode || undefined,
        imageUrl: form.imageUrl || undefined,
        categoryId: form.categoryId ? (form.categoryId as EntityId<"categories">) : undefined,
        unitId: form.unitId ? (form.unitId as EntityId<"units">) : undefined,
        tags: form.tags ? form.tags.split(",").map((t) => t.trim()).filter(Boolean) : undefined,
      };
      if (editingId) {
        await updateProduct({ id: editingId, ...data });
        toast.success("Product updated");
      } else {
        await createProduct(data);
        toast.success("Product created");
      }
      setShowDialog(false);
      setForm(emptyForm);
      setEditingId(null);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed to save product";
      toast.error(msg);
    }
  };

  const handleAdjustStock = async () => {
    if (!adjustProductId || !adjustForm.warehouseId || !adjustForm.quantity) {
      toast.error("Please fill all fields");
      return;
    }
    try {
      if (!navigator.onLine) {
        const product = products.find((item) => String(item._id) === String(adjustProductId));
        const baseQuantity = Number((product as { stock?: Array<{ warehouseId?: string; quantity?: number }> } | undefined)?.stock?.find((stock) => String(stock.warehouseId) === String(adjustForm.warehouseId))?.quantity ?? 0);
        await queueOfflineOperation("stock_adjustment", { productId: Number(adjustProductId), warehouseId: Number(adjustForm.warehouseId), type: adjustForm.type, quantity: Number(adjustForm.quantity), reason: adjustForm.reason || undefined, baseQuantity });
        toast.success("No connection. Adjustment queued securely for synchronization."); setShowAdjust(false); return;
      }
      await adjustStock({
        productId: adjustProductId,
        warehouseId: adjustForm.warehouseId as EntityId<"warehouses">,
        type: adjustForm.type,
        quantity: parseInt(adjustForm.quantity),
        reason: adjustForm.reason || undefined,
      });
      toast.success("Stock adjusted successfully");
      setShowAdjust(false);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed to adjust stock";
      toast.error(msg);
    }
  };

  const handleTransfer = async () => {
    if (!transferProductId || !transferForm.fromWarehouseId || !transferForm.toWarehouseId || !transferForm.quantity) {
      toast.error("Please fill all fields");
      return;
    }
    if (transferForm.fromWarehouseId === transferForm.toWarehouseId) {
      toast.error("Source and destination must be different");
      return;
    }
    try {
      if (!navigator.onLine) {
        const product = products.find((item) => String(item._id) === String(transferProductId));
        const baseQuantity = Number((product as { stock?: Array<{ warehouseId?: string; quantity?: number }> } | undefined)?.stock?.find((stock) => String(stock.warehouseId) === String(transferForm.fromWarehouseId))?.quantity ?? 0);
        await queueOfflineOperation("transfer_stock", { productId: Number(transferProductId), fromWarehouseId: Number(transferForm.fromWarehouseId), toWarehouseId: Number(transferForm.toWarehouseId), quantity: Number(transferForm.quantity), reason: transferForm.reason || undefined, baseQuantity });
        toast.success("No connection. Transfer queued securely for synchronization."); setShowTransfer(false); return;
      }
      await transferStock({
        productId: transferProductId,
        fromWarehouseId: transferForm.fromWarehouseId as EntityId<"warehouses">,
        toWarehouseId: transferForm.toWarehouseId as EntityId<"warehouses">,
        quantity: parseInt(transferForm.quantity),
        reason: transferForm.reason || undefined,
      });
      toast.success("Stock transferred successfully");
      setShowTransfer(false);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed to transfer stock";
      toast.error(msg);
    }
  };

  const openEditProduct = (p: NonNullable<typeof products>[0]) => {
    setForm({
      sku: p.sku, name: p.name,
      description: p.description ?? "",
      costPrice: p.costPrice.toString(),
      sellingPrice: p.sellingPrice.toString(),
      taxRate: p.taxRate?.toString() ?? "0",
      reorderLevel: p.reorderLevel.toString(),
      barcode: p.barcode ?? "",
      imageUrl: p.imageUrl ?? "",
      categoryId: p.categoryId ?? "",
      unitId: p.unitId ?? "",
      tags: (p.tags ?? []).join(", "),
    });
    setEditingId(p._id);
    setShowDialog(true);
  };

   const handleDeleteProduct = async (product: NonNullable<typeof products>[0]) => {
    if (!canManageMasterData) return;
    const confirmed = await confirm({
      title: "Delete product?",
      description: `Delete ${product.name}? This cannot be undone. Products with stock or transaction history must be archived instead.`,
      confirmLabel: "Delete Product",
      destructive: true,
    });
    if (!confirmed) return;
    try {
      await deleteProduct({ id: product._id });
      if (selectedProductId === product._id) setSelectedProductId(null);
      toast.success("Product deleted successfully");
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "Unable to delete product");
    }
   };

   const handleDeleteUnit = async (unit: NonNullable<typeof units>[0]) => {
     if (!canManageMasterData) return;
     if (!await confirm({ title: "Delete unit?", description: `Delete ${unit.name}? Products using it will be left without a unit.`, confirmLabel: "Delete Unit", destructive: true })) return;
     try {
       await deleteUnit({ id: unit._id });
       toast.success("Unit deleted");
     } catch {
       toast.error("Unable to delete unit");
     }
   };

  const tabs: { key: ActiveTab; label: string }[] = [
    { key: "products", label: "Products" },
    { key: "stock", label: "Stock Movements" },
    { key: "valuation", label: "Valuation" },
    { key: "categories", label: "Categories & Units" },
  ];

  const margin = ((valuation?.totalSellValue ?? 0) - (valuation?.totalCostValue ?? 0)) /
    ((valuation?.totalSellValue ?? 1) || 1) * 100;

  return (
    <div className="flex h-full overflow-hidden">
      {/* Main content */}
      <div className={cn("flex flex-col flex-1 min-w-0 transition-all", selectedProductId ? "lg:mr-96" : "")}>
        <div className="p-6 space-y-5 overflow-y-auto pb-24 md:pb-6">

          {/* Header */}
          <div className="flex items-center justify-between gap-4">
            <div>
              <h2 className="text-xl font-bold">Inventory</h2>
              <p className="text-sm text-muted-foreground">
                {products?.length ?? 0} products · {valuation?.totalUnits ?? 0} units in stock
              </p>
            </div>
            <div className="flex flex-wrap items-center justify-end gap-2">
              <DataExchangeTools />
              <Button variant="secondary" size="sm" className="cursor-pointer hidden md:flex"
                onClick={() => setShowInactive((v) => !v)}>
                {showInactive ? <EyeOff className="w-4 h-4 mr-2" /> : <Eye className="w-4 h-4 mr-2" />}
                {showInactive ? "Hide Inactive" : "Show Inactive"}
              </Button>
              {canManageMasterData && <Button className="cursor-pointer" onClick={() => { setForm(emptyForm); setEditingId(null); setShowDialog(true); }}>
                <Plus className="w-4 h-4 mr-2" />Add Product
              </Button>}
            </div>
          </div>

          {/* Tabs */}
          <div className="flex gap-0 border-b border-border overflow-x-auto">
            {tabs.map((t) => (
              <button key={t.key} onClick={() => setActiveTab(t.key)}
                className={cn(
                  "px-4 py-2 text-sm font-medium whitespace-nowrap transition-colors border-b-2 -mb-px cursor-pointer",
                  activeTab === t.key
                    ? "border-primary text-primary"
                    : "border-transparent text-muted-foreground hover:text-foreground",
                )}>
                {t.label}
              </button>
            ))}
          </div>

          {/* ── Products Tab ─────────────────────────────────── */}
          {activeTab === "products" && (
            <div className="space-y-4">
              {/* Filters */}
              <div className="flex flex-wrap gap-3">
                <div className="relative flex-1 min-w-48">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input placeholder="Search name, SKU, barcode, tag…" className="pl-9"
                    value={search} onChange={(e) => setSearch(e.target.value)} />
                </div>
                <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                  <SelectTrigger className="w-44">
                    <Filter className="w-3 h-3 mr-2 text-muted-foreground" />
                    <SelectValue placeholder="Category" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Categories</SelectItem>
                    {(categories ?? []).filter((c) => c.isActive).map((c) => (
                      <SelectItem key={c._id} value={c._id}>{c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={stockFilter} onValueChange={(v) => setStockFilter(v as typeof stockFilter)}>
                  <SelectTrigger className="w-40">
                    <SelectValue placeholder="Stock" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Stock</SelectItem>
                    <SelectItem value="low">Low Stock</SelectItem>
                    <SelectItem value="out">Out of Stock</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Table */}
              <Card>
                <CardContent className="p-0">
                  {products === undefined ? (
                    <div className="p-4 space-y-3">
                      {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-14 w-full" />)}
                    </div>
                  ) : filtered.length === 0 ? (
                    <div className="py-16 text-center">
                      <Package className="w-10 h-10 text-muted-foreground/40 mx-auto mb-3" />
                      <p className="text-sm text-muted-foreground">No products found</p>
                      {canManageMasterData && <Button variant="ghost" size="sm" className="mt-2 cursor-pointer"
                        onClick={() => { setForm(emptyForm); setEditingId(null); setShowDialog(true); }}>
                        Add your first product
                      </Button>}
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-border bg-muted/30">
                            <th className="text-left px-4 py-3 font-medium text-muted-foreground">Product</th>
                            <th className="text-left px-4 py-3 font-medium text-muted-foreground hidden md:table-cell">SKU</th>
                            <th className="text-left px-4 py-3 font-medium text-muted-foreground hidden lg:table-cell">Description</th>
                            <th className="text-left px-4 py-3 font-medium text-muted-foreground hidden lg:table-cell">Category</th>
                            <th className="text-left px-4 py-3 font-medium text-muted-foreground hidden md:table-cell">Unit</th>
                            <th className="text-right px-4 py-3 font-medium text-muted-foreground">Cost</th>
                            <th className="text-right px-4 py-3 font-medium text-muted-foreground">Price</th>
                            <th className="text-right px-4 py-3 font-medium text-muted-foreground hidden lg:table-cell">Tax</th>
                            <th className="text-right px-4 py-3 font-medium text-muted-foreground hidden lg:table-cell">Reorder</th>
                            <th className="text-right px-4 py-3 font-medium text-muted-foreground hidden md:table-cell">Margin</th>
                            <th className="text-right px-4 py-3 font-medium text-muted-foreground">Stock</th>
                            <th className="text-right px-4 py-3 font-medium text-muted-foreground">Actions</th>
                          </tr>
                        </thead>
                        <tbody>
                          {filtered.map((product) => {
                            const margin = product.costPrice > 0
                              ? ((product.sellingPrice - product.costPrice) / product.sellingPrice * 100)
                              : 0;
                            const isLow = product.totalStock <= product.reorderLevel && product.totalStock > 0;
                            const isOut = product.totalStock === 0;
                            return (
                              <tr
                                key={product._id}
                                className={cn(
                                  "border-b border-border last:border-0 hover:bg-muted/20 transition-colors",
                                  !product.isActive && "opacity-50",
                                  selectedProductId === product._id && "bg-accent/40",
                                )}
                              >
                                <td className="px-4 py-3">
                                  <div className="flex items-center gap-3">
                                    <div className="w-9 h-9 rounded-lg bg-muted flex items-center justify-center shrink-0 overflow-hidden">
                                      {product.imageUrl
                                        ? <img src={product.imageUrl} alt={product.name} className="w-full h-full object-cover" />
                                        : <Package className="w-4 h-4 text-muted-foreground" />
                                      }
                                    </div>
                                    <div className="min-w-0">
                                      <p className="font-medium truncate max-w-[160px]">{product.name}</p>
                                      <div className="flex items-center gap-1 flex-wrap">
                                        {!product.isActive && <Badge variant="secondary" className="text-xs py-0">Inactive</Badge>}
                                      </div>
                                    </div>
                                  </div>
                                </td>
                                <td className="px-4 py-3 hidden md:table-cell font-mono text-xs text-muted-foreground">{product.sku}</td>
                                <td className="px-4 py-3 hidden lg:table-cell max-w-[240px]">
                                  <span className="text-xs text-muted-foreground line-clamp-2">{product.description || "—"}</span>
                                </td>
                                <td className="px-4 py-3 hidden lg:table-cell">
                                  {product.category && (
                                    <Badge variant="secondary" className="text-xs">{product.category.name}</Badge>
                                  )}
                                </td>
                                <td className="px-4 py-3 hidden md:table-cell text-xs text-muted-foreground">{product.unit?.name || "—"}</td>
                                <td className="px-4 py-3 text-right text-xs text-muted-foreground">{formatMoney(product.costPrice)}</td>
                                <td className="px-4 py-3 text-right text-xs text-muted-foreground">{formatMoney(product.sellingPrice)}</td>
                                <td className="px-4 py-3 text-right hidden lg:table-cell text-xs text-muted-foreground">{product.taxRate}%</td>
                                <td className="px-4 py-3 text-right hidden lg:table-cell text-xs text-muted-foreground">{product.reorderLevel}</td>
                                <td className="px-4 py-3 text-right hidden md:table-cell">
                                  <span className={cn("text-xs font-medium", margin >= 30 ? "text-green-600" : margin >= 10 ? "text-amber-600" : "text-red-500")}>
                                    {margin.toFixed(1)}%
                                  </span>
                                </td>
                                <td className="px-4 py-3 text-right">
                                  <Badge className={cn("text-xs",
                                    isOut ? "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"
                                    : isLow ? "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400"
                                    : "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                                  )}>
                                    {(isLow || isOut) && <AlertTriangle className="w-3 h-3 mr-1" />}
                                    {product.totalStock}
                                  </Badge>
                                </td>
                                <td className="px-4 py-3 text-right">
                                  <div className="flex items-center justify-end gap-0.5">
                                    <Button variant="ghost" size="icon" className="w-7 h-7 cursor-pointer"
                                      title="View details"
                                      onClick={() => setSelectedProductId(
                                        selectedProductId === product._id ? null : product._id
                                      )}>
                                      <ChevronRight className={cn("w-3 h-3 transition-transform", selectedProductId === product._id && "rotate-90")} />
                                    </Button>
                                    <Button variant="ghost" size="icon" className="w-7 h-7 cursor-pointer"
                                      title="Adjust stock"
                                      onClick={() => {
                                        setAdjustProductId(product._id);
                                        setAdjustProductName(product.name);
                                        setAdjustForm({ warehouseId: warehouses?.[0]?._id ?? "", type: "add", quantity: "1", reason: "" });
                                        setShowAdjust(true);
                                      }}>
                                      <BarChart3 className="w-3 h-3" />
                                    </Button>
                                    <Button variant="ghost" size="icon" className="w-7 h-7 cursor-pointer"
                                      title="Transfer stock"
                                      onClick={() => {
                                        setTransferProductId(product._id);
                                        setTransferProductName(product.name);
                                        setTransferForm({ fromWarehouseId: warehouses?.[0]?._id ?? "", toWarehouseId: "", quantity: "1", reason: "" });
                                        setShowTransfer(true);
                                      }}>
                                      <ArrowLeftRight className="w-3 h-3" />
                                    </Button>
                                    {canManageMasterData && <Button variant="ghost" size="icon" className="w-7 h-7 cursor-pointer"
                                      title="Edit product"
                                      onClick={() => openEditProduct(product)}>
                                      <Edit2 className="w-3 h-3" />
                                    </Button>}
                                    {canManageMasterData && <Button variant="ghost" size="icon" className="w-7 h-7 cursor-pointer text-destructive hover:text-destructive"
                                      title="Delete product"
                                      aria-label={`Delete ${product.name}`}
                                      onClick={() => void handleDeleteProduct(product)}>
                                      <Trash2 className="w-3 h-3" />
                                    </Button>}
                                  </div>
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

          {/* ── Stock Movements Tab ──────────────────────────── */}
          {activeTab === "stock" && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Recent Stock Movements</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                {adjustments === undefined ? (
                  <div className="p-4 space-y-3">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
                ) : adjustments.length === 0 ? (
                  <div className="py-12 text-center">
                    <BarChart3 className="w-8 h-8 text-muted-foreground/40 mx-auto mb-2" />
                    <p className="text-sm text-muted-foreground">No stock movements yet</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-border bg-muted/30">
                          <th className="text-left px-4 py-3 font-medium text-muted-foreground">Product</th>
                          <th className="text-left px-4 py-3 font-medium text-muted-foreground hidden md:table-cell">Warehouse</th>
                          <th className="text-center px-4 py-3 font-medium text-muted-foreground">Type</th>
                          <th className="text-right px-4 py-3 font-medium text-muted-foreground">Qty</th>
                          <th className="text-left px-4 py-3 font-medium text-muted-foreground hidden lg:table-cell">Reason</th>
                          <th className="text-left px-4 py-3 font-medium text-muted-foreground hidden md:table-cell">By</th>
                          <th className="text-right px-4 py-3 font-medium text-muted-foreground">Date</th>
                        </tr>
                      </thead>
                      <tbody>
                        {adjustments.map((adj) => (
                          <tr key={adj._id} className="border-b border-border last:border-0 hover:bg-muted/20">
                            <td className="px-4 py-3">
                              <p className="font-medium text-sm">
                                {"name" in (adj.product ?? {}) ? String((adj.product as Record<string, unknown>)?.name ?? "") : "—"}
                              </p>
                            </td>
                            <td className="px-4 py-3 text-xs text-muted-foreground hidden md:table-cell">
                              {"name" in (adj.warehouse ?? {}) ? String((adj.warehouse as Record<string, unknown>)?.name ?? "") : "—"}
                            </td>
                            <td className="px-4 py-3 text-center">
                              <Badge className={cn("text-xs capitalize", ADJUSTMENT_COLORS[adj.type] ?? "")}>{adj.type}</Badge>
                            </td>
                            <td className="px-4 py-3 text-right font-mono font-semibold">
                              <span className={adj.type === "remove" || adj.type === "sale" || adj.type === "issue" ? "text-red-500" : "text-green-600"}>
                                {adj.type === "remove" || adj.type === "sale" || adj.type === "issue" ? "-" : "+"}{adj.quantity}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-xs text-muted-foreground hidden lg:table-cell">{adj.reason ?? adj.referenceId ?? "—"}</td>
                            <td className="px-4 py-3 text-xs text-muted-foreground hidden md:table-cell">
                              {"name" in (adj.user ?? {}) ? String((adj.user as Record<string, unknown>)?.name ?? "") : "—"}
                            </td>
                            <td className="px-4 py-3 text-right text-xs text-muted-foreground">
                              {format(parseISO(adj.createdAt), "MMM d, h:mm a")}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* ── Valuation Tab ────────────────────────────────── */}
          {activeTab === "valuation" && (
            <div className="space-y-4">
              {valuation === undefined ? (
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                  {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-28 rounded-xl" />)}
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                    {[
                      { label: "Cost Value", value: formatMoney(valuation.totalCostValue), icon: Archive, color: "bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400", sub: "At cost price" },
                      { label: "Sell Value", value: formatMoney(valuation.totalSellValue), icon: DollarSign, color: "bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400", sub: "At selling price" },
                      { label: "Potential Profit", value: formatMoney(valuation.potentialProfit), icon: TrendingUp, color: "bg-purple-100 text-purple-600 dark:bg-purple-900/30 dark:text-purple-400", sub: `${margin.toFixed(1)}% margin` },
                      { label: "Total Units", value: valuation.totalUnits.toLocaleString(), icon: Package, color: "bg-amber-100 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400", sub: `${valuation.totalProducts} products` },
                    ].map((stat) => (
                      <Card key={stat.label}>
                        <CardContent className="p-5">
                          <div className="flex items-start justify-between">
                            <div>
                              <p className="text-xs text-muted-foreground uppercase tracking-wider font-medium">{stat.label}</p>
                              <p className="text-xl font-bold mt-1">{stat.value}</p>
                              <p className="text-xs text-muted-foreground mt-0.5">{stat.sub}</p>
                            </div>
                            <div className={cn("w-9 h-9 rounded-lg flex items-center justify-center", stat.color)}>
                              <stat.icon className="w-4 h-4" />
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>

                  {/* By-category chart */}
                  {valuation.categoryBreakdown.length > 0 && (
                    <Card>
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm">Inventory Value by Category</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <ResponsiveContainer width="100%" height={220}>
                          <BarChart data={valuation.categoryBreakdown} layout="vertical" margin={{ left: 0 }}>
                              <XAxis type="number" tick={{ fontSize: 10, fill: "var(--muted-foreground)" }} axisLine={false} tickLine={false} tickFormatter={(v) => `TZS ${Number(v).toLocaleString("en-TZ")}`} />
                            <YAxis type="category" dataKey="name" tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} axisLine={false} tickLine={false} width={100} />
                            <Tooltip
                              contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 }}
                              formatter={(v) => [formatMoney(typeof v === "number" ? v : 0), "Cost Value"] as [string, string]}
                            />
                            <Bar dataKey="costValue" radius={[0, 4, 4, 0]}>
                              {valuation.categoryBreakdown.map((_, idx) => (
                                <Cell key={idx} fill={CAT_COLORS[idx % CAT_COLORS.length]} />
                              ))}
                            </Bar>
                          </BarChart>
                        </ResponsiveContainer>
                      </CardContent>
                    </Card>
                  )}

                  {/* Per-product valuation */}
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm">Product Valuation Detail</CardTitle>
                    </CardHeader>
                    <CardContent className="p-0">
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="border-b border-border bg-muted/30">
                              <th className="text-left px-4 py-2 text-xs font-medium text-muted-foreground">Product</th>
                              <th className="text-right px-4 py-2 text-xs font-medium text-muted-foreground hidden md:table-cell">Units</th>
                              <th className="text-right px-4 py-2 text-xs font-medium text-muted-foreground">Cost/Unit</th>
                              <th className="text-right px-4 py-2 text-xs font-medium text-muted-foreground">Sell/Unit</th>
                              <th className="text-right px-4 py-2 text-xs font-medium text-muted-foreground hidden md:table-cell">Total Cost</th>
                              <th className="text-right px-4 py-2 text-xs font-medium text-muted-foreground">Margin</th>
                            </tr>
                          </thead>
                          <tbody>
                            {(products ?? [])
                              .filter((p) => p.isActive)
                              .sort((a, b) => (b.totalStock * b.costPrice) - (a.totalStock * a.costPrice))
                              .map((p) => {
                                const totalCost = p.totalStock * p.costPrice;
                                const pMargin = p.sellingPrice > 0 ? (p.sellingPrice - p.costPrice) / p.sellingPrice * 100 : 0;
                                return (
                                  <tr key={p._id} className="border-b border-border last:border-0 hover:bg-muted/20">
                                    <td className="px-4 py-2.5 font-medium">{p.name}</td>
                                    <td className="px-4 py-2.5 text-right hidden md:table-cell">{p.totalStock}</td>
                                    <td className="px-4 py-2.5 text-right font-mono text-xs">{formatMoney(p.costPrice)}</td>
                                    <td className="px-4 py-2.5 text-right font-mono text-xs">{formatMoney(p.sellingPrice)}</td>
                                    <td className="px-4 py-2.5 text-right font-mono text-xs font-semibold hidden md:table-cell">{formatMoney(totalCost)}</td>
                                    <td className="px-4 py-2.5 text-right">
                                      <span className={cn("text-xs font-medium",
                                        pMargin >= 30 ? "text-green-600" : pMargin >= 10 ? "text-amber-600" : "text-red-500"
                                      )}>{pMargin.toFixed(1)}%</span>
                                    </td>
                                  </tr>
                                );
                              })}
                          </tbody>
                        </table>
                      </div>
                    </CardContent>
                  </Card>
                </>
              )}
            </div>
          )}

          {/* ── Categories & Units Tab ───────────────────────── */}
          {activeTab === "categories" && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Categories */}
              <div className="space-y-4">
                <Card>
                  <CardHeader><CardTitle className="text-sm">{editCatId ? "Edit Category" : "Add Category"}</CardTitle></CardHeader>
                  <CardContent className="space-y-3">
                    <div className="space-y-1.5"><Label>Name</Label>
                      <Input value={catForm.name} onChange={(e) => setCatForm({ ...catForm, name: e.target.value })} placeholder="e.g. Electronics" />
                    </div>
                    <div className="space-y-1.5"><Label>Description</Label>
                      <Input value={catForm.description} onChange={(e) => setCatForm({ ...catForm, description: e.target.value })} placeholder="Optional description" />
                    </div>
                    <div className="flex items-center gap-3">
                      <Label>Color</Label>
                      <input type="color" value={catForm.color}
                        onChange={(e) => setCatForm({ ...catForm, color: e.target.value })}
                        className="w-10 h-8 rounded cursor-pointer border border-border" />
                      <div className="flex gap-1 flex-wrap">
                        {CAT_COLORS.map((c) => (
                          <button key={c} onClick={() => setCatForm({ ...catForm, color: c })}
                            className={cn("w-5 h-5 rounded-full cursor-pointer border-2", catForm.color === c ? "border-foreground" : "border-transparent")}
                            style={{ background: c }} />
                        ))}
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Button className="flex-1 cursor-pointer" onClick={async () => {
                        if (!catForm.name) { toast.error("Name required"); return; }
                        try {
                          if (editCatId) {
                            await updateCategory({ id: editCatId, name: catForm.name, description: catForm.description || undefined, color: catForm.color });
                            toast.success("Category updated");
                            setEditCatId(null);
                          } else {
                            await createCategory({ name: catForm.name, description: catForm.description || undefined, color: catForm.color });
                            toast.success("Category created");
                          }
                          setCatForm({ name: "", description: "", color: "#6366f1" });
                        } catch { toast.error("Failed to save category"); }
                      }}>
                        <Plus className="w-4 h-4 mr-2" />{editCatId ? "Update" : "Add"} Category
                      </Button>
                      {editCatId && (
                        <Button variant="ghost" className="cursor-pointer" onClick={() => { setEditCatId(null); setCatForm({ name: "", description: "", color: "#6366f1" }); }}>
                          <X className="w-4 h-4" />
                        </Button>
                      )}
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader><CardTitle className="text-sm">All Categories</CardTitle></CardHeader>
                  <CardContent className="p-0">
                    {categories === undefined ? <Skeleton className="h-32 m-4" /> :
                      categories.filter((c) => c.isActive).length === 0
                        ? <p className="text-sm text-muted-foreground text-center py-6">No categories yet</p>
                        : <div className="divide-y divide-border">
                          {categories.filter((c) => c.isActive).map((cat) => {
                            const productCount = (products ?? []).filter((p) => p.categoryId === cat._id).length;
                            return (
                              <div key={cat._id} className="flex items-center justify-between px-4 py-3 hover:bg-muted/20">
                                <div className="flex items-center gap-3">
                                  <div className="w-3 h-3 rounded-full shrink-0" style={{ background: cat.color ?? "#6366f1" }} />
                                  <div>
                                    <p className="text-sm font-medium">{cat.name}</p>
                                    {cat.description && <p className="text-xs text-muted-foreground">{cat.description}</p>}
                                  </div>
                                </div>
                                <div className="flex items-center gap-2">
                                  <span className="text-xs text-muted-foreground">{productCount} products</span>
                                  <Button variant="ghost" size="icon" className="w-7 h-7 cursor-pointer" onClick={() => {
                                    setEditCatId(cat._id);
                                    setCatForm({ name: cat.name, description: cat.description ?? "", color: cat.color ?? "#6366f1" });
                                    setActiveTab("categories");
                                  }}><Edit2 className="w-3 h-3" /></Button>
                                  <Button variant="ghost" size="icon" className="w-7 h-7 cursor-pointer text-muted-foreground hover:text-destructive" onClick={async () => {
                                    await deleteCategory({ id: cat._id });
                                    toast.success("Category removed");
                                  }}><X className="w-3 h-3" /></Button>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                    }
                  </CardContent>
                </Card>
              </div>

              {/* Units */}
              <div className="space-y-4">
                <Card>
                  <CardHeader><CardTitle className="text-sm">Add Unit of Measure</CardTitle></CardHeader>
                  <CardContent className="space-y-3">
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1.5"><Label>Name</Label>
                        <Input value={unitForm.name} onChange={(e) => setUnitForm({ ...unitForm, name: e.target.value })} placeholder="Kilogram" />
                      </div>
                      <div className="space-y-1.5"><Label>Abbreviation</Label>
                        <Input value={unitForm.abbreviation} onChange={(e) => setUnitForm({ ...unitForm, abbreviation: e.target.value })} placeholder="kg" />
                      </div>
                    </div>
                    <Button className="w-full cursor-pointer" onClick={async () => {
                      if (!unitForm.name || !unitForm.abbreviation) { toast.error("Fill both fields"); return; }
                      await createUnit(unitForm);
                      toast.success("Unit created");
                      setUnitForm({ name: "", abbreviation: "" });
                    }}>
                      <Plus className="w-4 h-4 mr-2" />Add Unit
                    </Button>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader><CardTitle className="text-sm">Units of Measure</CardTitle></CardHeader>
                  <CardContent className="p-0">
                    {units === undefined ? <Skeleton className="h-24 m-4" /> :
                      units.length === 0
                        ? <p className="text-sm text-muted-foreground text-center py-6">No units yet</p>
                        : <div className="divide-y divide-border">
                          {units.map((u) => (
                             <div key={u._id} className="flex items-center gap-3 px-4 py-2.5">
                               <Layers className="w-4 h-4 text-muted-foreground" />
                               <span className="text-sm font-medium">{u.name}</span>
                               <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded font-mono">{u.abbreviation}</span>
                               {canManageMasterData && <Button variant="ghost" size="icon" className="ml-auto w-7 h-7 text-muted-foreground hover:text-destructive" title="Delete unit" onClick={() => void handleDeleteUnit(u)}><Trash2 className="w-3 h-3" /></Button>}
                             </div>
                          ))}
                        </div>
                    }
                  </CardContent>
                </Card>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Product Detail Slide-Over ────────────────────── */}
      {selectedProductId && (
        <div className="hidden lg:flex lg:fixed lg:right-0 lg:top-14 lg:bottom-0 lg:w-96 flex-col border-l border-border bg-card overflow-y-auto z-10">
          <div className="flex items-center justify-between px-4 py-3 border-b border-border">
            <h3 className="text-sm font-semibold">Product Details</h3>
            <Button variant="ghost" size="icon" className="w-7 h-7 cursor-pointer" onClick={() => setSelectedProductId(null)}>
              <X className="w-4 h-4" />
            </Button>
          </div>

          {selectedProduct === undefined ? (
            <div className="p-4 space-y-3">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
          ) : selectedProduct === null ? (
            <p className="p-4 text-sm text-muted-foreground">Product not found</p>
          ) : (
            <div className="p-4 space-y-5">
              {/* Image & name */}
              <div className="flex gap-4 items-start">
                <div className="w-16 h-16 rounded-xl bg-muted overflow-hidden shrink-0">
                  {selectedProduct.imageUrl
                    ? <img src={selectedProduct.imageUrl} alt={selectedProduct.name} className="w-full h-full object-cover" />
                    : <div className="w-full h-full flex items-center justify-center"><Package className="w-6 h-6 text-muted-foreground" /></div>
                  }
                </div>
                <div>
                  <p className="font-semibold">{selectedProduct.name}</p>
                  <p className="text-xs font-mono text-muted-foreground mt-0.5">{selectedProduct.sku}</p>
                  {selectedProduct.barcode && <p className="text-xs text-muted-foreground">Barcode: {selectedProduct.barcode}</p>}
                  {selectedProduct.category && (
                    <Badge variant="secondary" className="text-xs mt-1">{selectedProduct.category.name}</Badge>
                  )}
                </div>
              </div>

              {selectedProduct.description && (
                <p className="text-xs text-muted-foreground bg-muted/50 rounded-lg p-3">{selectedProduct.description}</p>
              )}

              {/* Pricing */}
              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Pricing</p>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { label: "Cost", value: formatMoney(selectedProduct.costPrice) },
                    { label: "Price", value: formatMoney(selectedProduct.sellingPrice) },
                    {
                      label: "Margin",
                      value: `${selectedProduct.sellingPrice > 0 ? ((selectedProduct.sellingPrice - selectedProduct.costPrice) / selectedProduct.sellingPrice * 100).toFixed(1) : 0}%`
                    },
                  ].map((item) => (
                    <div key={item.label} className="bg-muted/50 rounded-lg p-2.5 text-center">
                      <p className="text-xs text-muted-foreground">{item.label}</p>
                      <p className="text-sm font-bold">{item.value}</p>
                    </div>
                  ))}
                </div>
                {(selectedProduct.taxRate ?? 0) > 0 && (
                  <p className="text-xs text-muted-foreground mt-1">Tax rate: {selectedProduct.taxRate}%</p>
                )}
              </div>

              <Separator />

              {/* Stock by warehouse */}
              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Stock by Warehouse</p>
                {(selectedProduct.stock ?? []).length === 0 ? (
                  <p className="text-sm text-muted-foreground">No stock records yet</p>
                ) : (
                  <div className="space-y-2">
                    {(selectedProduct.stock ?? []).map((s) => {
                      const whName = s.warehouse && "name" in s.warehouse ? String(s.warehouse.name) : "Unknown";
                      const isLow = s.quantity <= selectedProduct.reorderLevel;
                      return (
                        <div key={s._id} className="flex items-center justify-between p-2.5 rounded-lg bg-muted/40 border border-border">
                          <div className="flex items-center gap-2">
                            <div className="w-6 h-6 rounded bg-muted flex items-center justify-center">
                              <Archive className="w-3 h-3 text-muted-foreground" />
                            </div>
                            <span className="text-sm">{whName}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <Badge className={cn("text-xs",
                              s.quantity === 0 ? "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"
                              : isLow ? "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400"
                              : "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                            )}>
                              {s.quantity}
                            </Badge>
                            {s.reservedQuantity > 0 && (
                              <span className="text-xs text-muted-foreground">({s.reservedQuantity} reserved)</span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                    <div className="flex items-center justify-between p-2 rounded bg-primary/5 border border-primary/20">
                      <span className="text-xs font-medium text-primary">Reorder Level</span>
                      <span className="text-xs font-bold text-primary">{selectedProduct.reorderLevel}</span>
                    </div>
                  </div>
                )}
              </div>

              {/* Tags */}
              {(selectedProduct.tags ?? []).length > 0 && (
                <>
                  <Separator />
                  <div>
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Tags</p>
                    <div className="flex flex-wrap gap-1.5">
                      {(selectedProduct.tags ?? []).map((tag) => (
                        <span key={tag} className="text-xs bg-muted text-muted-foreground px-2 py-1 rounded-full flex items-center gap-1">
                          <Tag className="w-3 h-3" />{tag}
                        </span>
                      ))}
                    </div>
                  </div>
                </>
              )}

              <Separator />

              {/* Actions */}
              <div className="flex flex-col gap-2">
                {canManageMasterData && <Button size="sm" className="cursor-pointer" onClick={() => openEditProduct(
                  (products ?? []).find((p) => p._id === selectedProductId)!
                )}>
                  <Edit2 className="w-3 h-3 mr-2" />Edit Product
                </Button>}
                <div className="grid grid-cols-2 gap-2">
                  <Button size="sm" variant="secondary" className="cursor-pointer" onClick={() => {
                    setAdjustProductId(selectedProductId);
                    setAdjustProductName(selectedProduct.name);
                    setAdjustForm({ warehouseId: (selectedProduct.stock ?? [])[0]?.warehouseId ?? "", type: "add", quantity: "1", reason: "" });
                    setShowAdjust(true);
                  }}>
                    <BarChart3 className="w-3 h-3 mr-2" />Adjust
                  </Button>
                  <Button size="sm" variant="secondary" className="cursor-pointer" onClick={() => {
                    setTransferProductId(selectedProductId);
                    setTransferProductName(selectedProduct.name);
                    setTransferForm({ fromWarehouseId: (selectedProduct.stock ?? [])[0]?.warehouseId ?? "", toWarehouseId: "", quantity: "1", reason: "" });
                    setShowTransfer(true);
                  }}>
                    <ArrowLeftRight className="w-3 h-3 mr-2" />Transfer
                  </Button>
                </div>
                {canManageMasterData && <Button size="sm" variant="ghost" className="cursor-pointer text-muted-foreground"
                  onClick={async () => {
                    await toggleActive({ id: selectedProductId });
                    toast.success(selectedProduct.isActive ? "Product deactivated" : "Product activated");
                  }}>
                  {selectedProduct.isActive ? <EyeOff className="w-3 h-3 mr-2" /> : <Eye className="w-3 h-3 mr-2" />}
                  {selectedProduct.isActive ? "Deactivate" : "Activate"} Product
                </Button>}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Product Dialog ──────────────────────────────── */}
      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingId ? "Edit Product" : "Add New Product"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>SKU <span className="text-destructive">*</span></Label>
                <Input value={form.sku} onChange={(e) => setForm({ ...form, sku: e.target.value })} placeholder="SKU-001" />
              </div>
              <div className="space-y-1.5">
                <Label>Barcode</Label>
                <Input value={form.barcode} onChange={(e) => setForm({ ...form, barcode: e.target.value })} placeholder="1234567890" />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Name <span className="text-destructive">*</span></Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Product name" />
            </div>
            <div className="space-y-1.5">
              <Label>Description</Label>
              <Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={2} placeholder="Product description…" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Cost Price <span className="text-destructive">*</span></Label>
                <Input type="number" step="0.01" value={form.costPrice} onChange={(e) => setForm({ ...form, costPrice: e.target.value })} placeholder="0.00" />
              </div>
              <div className="space-y-1.5">
                <Label>Selling Price <span className="text-destructive">*</span></Label>
                <Input type="number" step="0.01" value={form.sellingPrice} onChange={(e) => setForm({ ...form, sellingPrice: e.target.value })} placeholder="0.00" />
              </div>
            </div>
            {form.costPrice && form.sellingPrice && parseFloat(form.sellingPrice) > 0 && (
              <p className="text-xs text-muted-foreground -mt-2">
                Margin: <span className="font-medium text-foreground">
                  {((parseFloat(form.sellingPrice) - parseFloat(form.costPrice)) / parseFloat(form.sellingPrice) * 100).toFixed(1)}%
                </span>
              </p>
            )}
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label>Tax Rate (%)</Label>
                <Input type="number" step="0.1" value={form.taxRate} onChange={(e) => setForm({ ...form, taxRate: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>Reorder Level</Label>
                <Input type="number" value={form.reorderLevel} onChange={(e) => setForm({ ...form, reorderLevel: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>Unit</Label>
                <Select value={form.unitId || "none"} onValueChange={(v) => setForm({ ...form, unitId: v === "none" ? "" : v })}>
                  <SelectTrigger><SelectValue placeholder="None" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None</SelectItem>
                    {(units ?? []).map((u) => <SelectItem key={u._id} value={u._id}>{u.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Category</Label>
              <Select value={form.categoryId || "none"} onValueChange={(v) => setForm({ ...form, categoryId: v === "none" ? "" : v })}>
                <SelectTrigger><SelectValue placeholder="Uncategorized" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Uncategorized</SelectItem>
                  {(categories ?? []).filter((c) => c.isActive).map((c) => (
                    <SelectItem key={c._id} value={c._id}>
                      <div className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full" style={{ background: c.color ?? "#6366f1" }} />
                        {c.name}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Image URL</Label>
              <Input value={form.imageUrl} onChange={(e) => setForm({ ...form, imageUrl: e.target.value })} placeholder="https://…" />
              {form.imageUrl && (
                <img src={form.imageUrl} alt="Preview" className="w-16 h-16 rounded-lg object-cover border border-border mt-1" onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
              )}
            </div>
            <div className="space-y-1.5">
              <Label className="flex items-center gap-1.5"><Tag className="w-3 h-3" />Tags</Label>
              <Input value={form.tags} onChange={(e) => setForm({ ...form, tags: e.target.value })} placeholder="electronics, new, featured (comma separated)" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setShowDialog(false)} className="cursor-pointer">Cancel</Button>
            <Button onClick={handleSaveProduct} className="cursor-pointer">
              {editingId ? "Update Product" : "Create Product"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Adjust Stock Dialog ─────────────────────────── */}
      <Dialog open={showAdjust} onOpenChange={setShowAdjust}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Adjust Stock</DialogTitle>
            {adjustProductName && <p className="text-sm text-muted-foreground">{adjustProductName}</p>}
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Warehouse</Label>
              <Select value={adjustForm.warehouseId} onValueChange={(v) => setAdjustForm({ ...adjustForm, warehouseId: v })}>
                <SelectTrigger><SelectValue placeholder="Select warehouse" /></SelectTrigger>
                <SelectContent>
                  {(warehouses ?? []).map((w) => <SelectItem key={w._id} value={w._id}>{w.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Type</Label>
                <Select value={adjustForm.type} onValueChange={(v) => setAdjustForm({ ...adjustForm, type: v as "add" | "remove" })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="add">Add Stock</SelectItem>
                    <SelectItem value="remove">Remove Stock</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Quantity</Label>
                <Input type="number" value={adjustForm.quantity} onChange={(e) => setAdjustForm({ ...adjustForm, quantity: e.target.value })} min="1" />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Reason</Label>
              <Input value={adjustForm.reason} onChange={(e) => setAdjustForm({ ...adjustForm, reason: e.target.value })} placeholder="e.g. Damaged goods, count correction…" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setShowAdjust(false)} className="cursor-pointer">Cancel</Button>
            <Button onClick={handleAdjustStock} className="cursor-pointer">Apply Adjustment</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {confirmationDialog}

      {/* ── Transfer Stock Dialog ───────────────────────── */}
      <Dialog open={showTransfer} onOpenChange={setShowTransfer}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Transfer Stock</DialogTitle>
            {transferProductName && <p className="text-sm text-muted-foreground">{transferProductName}</p>}
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>From Warehouse</Label>
              <Select value={transferForm.fromWarehouseId} onValueChange={(v) => setTransferForm({ ...transferForm, fromWarehouseId: v })}>
                <SelectTrigger><SelectValue placeholder="Source warehouse" /></SelectTrigger>
                <SelectContent>
                  {(warehouses ?? []).map((w) => <SelectItem key={w._id} value={w._id}>{w.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center justify-center">
              <ArrowLeftRight className="w-5 h-5 text-muted-foreground" />
            </div>
            <div className="space-y-1.5">
              <Label>To Warehouse</Label>
              <Select value={transferForm.toWarehouseId} onValueChange={(v) => setTransferForm({ ...transferForm, toWarehouseId: v })}>
                <SelectTrigger><SelectValue placeholder="Destination warehouse" /></SelectTrigger>
                <SelectContent>
                  {(warehouses ?? []).filter((w) => w._id !== transferForm.fromWarehouseId).map((w) => (
                    <SelectItem key={w._id} value={w._id}>{w.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Quantity</Label>
              <Input type="number" value={transferForm.quantity} onChange={(e) => setTransferForm({ ...transferForm, quantity: e.target.value })} min="1" />
            </div>
            <div className="space-y-1.5">
              <Label>Notes</Label>
              <Input value={transferForm.reason} onChange={(e) => setTransferForm({ ...transferForm, reason: e.target.value })} placeholder="Optional reason…" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setShowTransfer(false)} className="cursor-pointer">Cancel</Button>
            <Button onClick={handleTransfer} className="cursor-pointer">Transfer Stock</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
