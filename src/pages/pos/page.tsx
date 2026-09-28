import { useState, useMemo, useRef, useCallback } from "react";
import { useApiQuery, useApiMutation } from "@/hooks/use-api.ts";
import { endpoints } from "@/api/endpoints.ts";
import { Button } from "@/components/ui/button.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Label } from "@/components/ui/label.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import { Card, CardContent } from "@/components/ui/card.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select.tsx";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog.tsx";
import { Separator } from "@/components/ui/separator.tsx";
import { toast } from "@/lib/system-message.ts";
import { cn } from "@/lib/utils.ts";
import {
  Search, Plus, Minus, ShoppingCart, Package,
  User, CreditCard, Banknote, Smartphone, CheckCircle2,
  Printer, X, ChevronLeft, Tag, Percent,
  Clock, BarChart3, Zap,
} from "lucide-react";
import { format, parseISO } from "date-fns";
import type { EntityId } from "@/types/api.ts";
import { PageContentLoader } from "@/components/ui/page-loader.tsx";

type CartItem = {
  productId: EntityId<"products">;
  name: string;
  sku: string;
  imageUrl?: string;
  unitPrice: number;
  quantity: number;
  discountRate: number;
  taxRate: number;
  stock: number;
  category?: string;
};

type ReceiptData = {
  saleId: EntityId<"sales">;
  saleNumber: string;
  total: number;
  change: number;
  paid: number;
  subtotal: number;
  taxAmount: number;
  discountAmount: number;
  paymentMethod: string;
  items: { name: string; qty: number; price: number; total: number }[];
  customerName?: string;
  warehouseName?: string;
};

const PAYMENT_METHODS = [
  { value: "cash", label: "Cash", icon: Banknote, color: "text-green-600" },
  { value: "card", label: "Card", icon: CreditCard, color: "text-blue-600" },
  { value: "mobile", label: "Mobile Pay", icon: Smartphone, color: "text-purple-600" },
] as const;

type PosTab = "pos" | "daily";

export default function POSPage() {
  const [activeTab, setActiveTab] = useState<PosTab>("pos");
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [cart, setCart] = useState<CartItem[]>([]);
  const [customerId, setCustomerId] = useState<string>("");
  const [warehouseId, setWarehouseId] = useState<string>("");
  const [paymentMethod, setPaymentMethod] = useState<"cash" | "card" | "mobile" | "credit">("cash");
  const [discount, setDiscount] = useState("0");
  const [paidAmount, setPaidAmount] = useState("");
  const [showCheckout, setShowCheckout] = useState(false);
  const [receiptData, setReceiptData] = useState<ReceiptData | null>(null);
  const [showReceipt, setShowReceipt] = useState(false);
  const [editingItemId, setEditingItemId] = useState<EntityId<"products"> | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const products = useApiQuery(endpoints.inventory.listProducts, { includeInactive: false });
  const customers = useApiQuery(endpoints.customers.listCustomers);
  const warehouses = useApiQuery(endpoints.warehouses.listWarehouses);
  const categories = useApiQuery(endpoints.inventory.listCategories);
  const todaySales = useApiQuery(endpoints.sales.listSales, { limit: 20 });
  const dailySummary = useApiQuery(endpoints.sales.getDailySummary, {});
  const createSale = useApiMutation(endpoints.sales.createSale);

  const defaultWarehouse = warehouses?.[0]?._id ?? "";
  const effectiveWarehouse = warehouseId || defaultWarehouse;

  const selectedCustomer = (customers ?? []).find((c) => c._id === customerId);

  const filtered = useMemo(() => {
    return (products ?? [])
      .filter((p) => {
        const matchSearch =
          p.name.toLowerCase().includes(search.toLowerCase()) ||
          p.sku.toLowerCase().includes(search.toLowerCase()) ||
          (p.barcode ?? "").includes(search);
        const matchCat = categoryFilter === "all" || p.categoryId === categoryFilter;
        return matchSearch && matchCat;
      })
      .slice(0, 40);
  }, [products, search, categoryFilter]);

  const addToCart = useCallback((product: NonNullable<typeof products>[0]) => {
    setCart((prev) => {
      const existing = prev.find((i) => i.productId === product._id);
      if (existing) {
        if (existing.quantity >= product.totalStock) {
          toast.error("Insufficient stock");
          return prev;
        }
        return prev.map((i) =>
          i.productId === product._id ? { ...i, quantity: i.quantity + 1 } : i,
        );
      }
      if (product.totalStock <= 0) {
        toast.error("Out of stock");
        return prev;
      }
      // Apply customer discount
      const customerDiscount = selectedCustomer?.discountRate ?? 0;
      return [
        ...prev,
        {
          productId: product._id,
          name: product.name,
          sku: product.sku,
          imageUrl: product.imageUrl,
          unitPrice: product.sellingPrice,
          quantity: 1,
          discountRate: customerDiscount,
          taxRate: product.taxRate ?? 0,
          stock: product.totalStock,
          category: product.category?.name,
        },
      ];
    });
  }, [selectedCustomer]);

  const updateQty = (productId: EntityId<"products">, delta: number) => {
    setCart((prev) =>
      prev.map((i) => {
        if (i.productId !== productId) return i;
        const newQty = i.quantity + delta;
        if (newQty <= 0) return i;
        if (newQty > i.stock) {
          toast.error("Insufficient stock");
          return i;
        }
        return { ...i, quantity: newQty };
      }),
    );
  };

  const updateItemDiscount = (productId: EntityId<"products">, rate: number) => {
    setCart((prev) =>
      prev.map((i) =>
        i.productId === productId ? { ...i, discountRate: Math.min(100, Math.max(0, rate)) } : i,
      ),
    );
  };

  const setItemQty = (productId: EntityId<"products">, qty: number) => {
    if (qty <= 0) {
      setCart((prev) => prev.filter((i) => i.productId !== productId));
      return;
    }
    setCart((prev) =>
      prev.map((i) => {
        if (i.productId !== productId) return i;
        if (qty > i.stock) { toast.error("Insufficient stock"); return i; }
        return { ...i, quantity: qty };
      }),
    );
  };

  const removeFromCart = (productId: EntityId<"products">) => {
    setCart((prev) => prev.filter((i) => i.productId !== productId));
  };

  const totals = useMemo(() => {
    let subtotal = 0;
    let taxAmount = 0;
    for (const item of cart) {
      const lineBase = item.quantity * item.unitPrice * (1 - item.discountRate / 100);
      subtotal += lineBase;
      taxAmount += lineBase * (item.taxRate / 100);
    }
    const discountAmt = parseFloat(discount) || 0;
    const total = Math.max(0, subtotal + taxAmount - discountAmt);
    const paid = parseFloat(paidAmount) || 0;
    const change = Math.max(0, paid - total);
    return { subtotal, taxAmount, discountAmt, total, paid, change };
  }, [cart, discount, paidAmount]);

  const handleCompleteSale = async () => {
    if (!cart.length) { toast.error("Cart is empty"); return; }
    if (!effectiveWarehouse) { toast.error("Select a warehouse"); return; }
    const paid = parseFloat(paidAmount) || 0;
    if (paymentMethod === "cash" && paid < totals.total && paid > 0) {
      toast.error("Insufficient cash amount");
      return;
    }
    try {
      const result = await createSale({
        customerId: customerId ? (customerId as EntityId<"customers">) : undefined,
        warehouseId: effectiveWarehouse as EntityId<"warehouses">,
        paymentMethod,
        items: cart.map((i) => ({
          productId: i.productId,
          quantity: i.quantity,
          unitPrice: i.unitPrice,
          discountRate: i.discountRate,
          taxRate: i.taxRate,
        })),
        discountAmount: totals.discountAmt,
        paidAmount: paid || totals.total,
      });

      const warehouse = (warehouses ?? []).find((w) => w._id === effectiveWarehouse);
      setReceiptData({
        saleId: result.saleId as EntityId<"sales">,
        saleNumber: result.saleNumber,
        total: result.totalAmount,
        change: result.changeAmount,
        paid: paid || result.totalAmount,
        subtotal: totals.subtotal,
        taxAmount: totals.taxAmount,
        discountAmount: totals.discountAmt,
        paymentMethod,
        items: cart.map((i) => ({
          name: i.name,
          qty: i.quantity,
          price: i.unitPrice * (1 - i.discountRate / 100),
          total: i.quantity * i.unitPrice * (1 - i.discountRate / 100),
        })),
        customerName: selectedCustomer?.name,
        warehouseName: warehouse?.name,
      });

      setCart([]);
      setDiscount("0");
      setPaidAmount("");
      setCustomerId("");
      setShowCheckout(false);
      setShowReceipt(true);
      toast.success(`Sale ${result.saleNumber} completed!`);
      searchRef.current?.focus();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed to complete sale";
      toast.error(msg);
    }
  };

  const cartTotal = cart.reduce((sum, i) => sum + i.quantity, 0);

  if (products === undefined || warehouses === undefined) return <PageContentLoader variant="cards" />;

  return (
    <div className="flex h-[calc(100vh-3.5rem)] overflow-hidden flex-col">
      {/* Top tab bar */}
      <div className="flex items-center gap-1 px-4 py-2 border-b border-border bg-background shrink-0">
        <button
          onClick={() => setActiveTab("pos")}
          className={cn(
            "flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors cursor-pointer",
            activeTab === "pos" ? "bg-primary/10 text-primary" : "text-muted-foreground hover:text-foreground hover:bg-muted",
          )}
        >
          <ShoppingCart className="w-3.5 h-3.5" />
          Point of Sale
          {cartTotal > 0 && (
            <Badge className="h-4 min-w-4 text-[10px] px-1 rounded-full">{cartTotal}</Badge>
          )}
        </button>
        <button
          onClick={() => setActiveTab("daily")}
          className={cn(
            "flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors cursor-pointer",
            activeTab === "daily" ? "bg-primary/10 text-primary" : "text-muted-foreground hover:text-foreground hover:bg-muted",
          )}
        >
          <BarChart3 className="w-3.5 h-3.5" />
          Today's Summary
        </button>
      </div>

      {/* ─── POS Tab ─────────────────────────────────────────── */}
      {activeTab === "pos" && (
        <div className="flex flex-1 overflow-hidden">
          {/* Products panel */}
          <div className="flex-1 flex flex-col min-w-0 border-r border-border overflow-hidden">
            {/* Search + filters */}
            <div className="p-3 border-b border-border space-y-2 shrink-0">
              <div className="flex items-center gap-2">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    ref={searchRef}
                    placeholder="Search name, SKU, barcode…"
                    className="pl-9"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    autoFocus
                  />
                </div>
                {(warehouses?.length ?? 0) > 1 && (
                  <Select value={effectiveWarehouse} onValueChange={setWarehouseId}>
                    <SelectTrigger className="w-36 shrink-0"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {(warehouses ?? []).map((w) => (
                        <SelectItem key={w._id} value={w._id}>{w.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>
              {/* Category pills */}
              <div className="flex gap-1.5 overflow-x-auto pb-0.5">
                <button
                  onClick={() => setCategoryFilter("all")}
                  className={cn(
                    "px-2.5 py-1 rounded-full text-xs font-medium whitespace-nowrap transition-colors cursor-pointer shrink-0",
                    categoryFilter === "all"
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-muted-foreground hover:text-foreground",
                  )}
                >
                  All
                </button>
                {(categories ?? []).filter((c) => c.isActive).map((cat) => (
                  <button
                    key={cat._id}
                    onClick={() => setCategoryFilter(cat._id)}
                    className={cn(
                      "px-2.5 py-1 rounded-full text-xs font-medium whitespace-nowrap transition-colors cursor-pointer shrink-0",
                      categoryFilter === cat._id
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted text-muted-foreground hover:text-foreground",
                    )}
                    style={categoryFilter === cat._id ? {} : { borderColor: cat.color ?? undefined }}
                  >
                    {cat.name}
                  </button>
                ))}
              </div>
            </div>

            {/* Product grid */}
            <div className="flex-1 overflow-y-auto p-3">
              {products === undefined ? (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 gap-2">
                  {Array.from({ length: 10 }).map((_, i) => (
                    <Skeleton key={i} className="h-28 rounded-xl" />
                  ))}
                </div>
              ) : filtered.length === 0 ? (
                <div className="text-center py-16 text-muted-foreground">
                  <Package className="w-10 h-10 mx-auto mb-2 opacity-30" />
                  <p className="text-sm">No products found</p>
                </div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 gap-2">
                  {filtered.map((product) => {
                    const inCart = cart.find((i) => i.productId === product._id);
                    const isOut = product.totalStock <= 0;
                    const isLow = !isOut && product.totalStock <= product.reorderLevel;
                    return (
                      <button
                        key={product._id}
                        onClick={() => addToCart(product)}
                        disabled={isOut}
                        className={cn(
                          "relative text-left p-2.5 rounded-xl border transition-all duration-100 cursor-pointer group select-none",
                          isOut
                            ? "opacity-40 cursor-not-allowed border-border bg-muted/30"
                            : inCart
                            ? "border-primary/60 bg-primary/5 shadow-sm"
                            : "border-border hover:border-primary/40 hover:bg-accent/40",
                        )}
                      >
                        {inCart && (
                          <div className="absolute top-1.5 right-1.5 w-5 h-5 bg-primary text-primary-foreground text-[10px] font-bold rounded-full flex items-center justify-center">
                            {inCart.quantity}
                          </div>
                        )}
                        <div className="w-10 h-10 rounded-lg bg-muted overflow-hidden flex items-center justify-center mb-2">
                          {product.imageUrl ? (
                            <img src={product.imageUrl} alt={product.name} className="w-full h-full object-cover" />
                          ) : (
                            <Package className="w-5 h-5 text-muted-foreground" />
                          )}
                        </div>
                        <p className="text-xs font-semibold leading-tight line-clamp-2 mb-1">{product.name}</p>
                        <p className="text-xs text-muted-foreground font-mono">{product.sku}</p>
                        <p className="text-sm font-bold text-primary mt-1">${product.sellingPrice.toFixed(2)}</p>
                        <p className={cn("text-[10px] mt-0.5", isOut ? "text-red-500" : isLow ? "text-amber-500" : "text-muted-foreground")}>
                          {isOut ? "Out of stock" : `${product.totalStock} left`}
                        </p>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Cart panel */}
          <div
            className={cn(
              "flex flex-col shrink-0 overflow-hidden bg-background",
              showCheckout ? "w-full absolute inset-0 z-20 md:relative md:z-auto md:w-[420px]" : "hidden md:flex w-80 lg:w-96",
            )}
          >
            {/* Cart header */}
            <div className="p-3 border-b border-border shrink-0">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  {showCheckout && (
                    <button onClick={() => setShowCheckout(false)} className="md:hidden cursor-pointer mr-1">
                      <ChevronLeft className="w-4 h-4" />
                    </button>
                  )}
                  <ShoppingCart className="w-4 h-4 text-primary" />
                  <span className="font-semibold text-sm">
                    {showCheckout ? "Checkout" : "Cart"}
                  </span>
                  {cart.length > 0 && (
                    <Badge className="text-xs h-5 px-1.5">{cart.reduce((s, i) => s + i.quantity, 0)} items</Badge>
                  )}
                </div>
                {cart.length > 0 && !showCheckout && (
                  <button
                    onClick={() => setCart([])}
                    className="text-xs text-muted-foreground hover:text-destructive transition-colors cursor-pointer"
                  >
                    Clear
                  </button>
                )}
              </div>

              {/* Customer selector */}
              <div className="mt-2.5 flex items-center gap-2">
                <User className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                <Select value={customerId || "none"} onValueChange={(v) => setCustomerId(v === "none" ? "" : v)}>
                  <SelectTrigger className="h-8 text-xs flex-1">
                    <SelectValue placeholder="Walk-in customer" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Walk-in customer</SelectItem>
                    {(customers ?? []).filter((c) => c.isActive).map((c) => (
                      <SelectItem key={c._id} value={c._id}>
                        <div className="flex items-center gap-2">
                          <span>{c.name}</span>
                          {(c.discountRate ?? 0) > 0 && (
                            <Badge variant="secondary" className="text-[10px] py-0 px-1">
                              {c.discountRate}% off
                            </Badge>
                          )}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Cart items */}
            <div className="flex-1 overflow-y-auto">
              {cart.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-muted-foreground py-12">
                  <ShoppingCart className="w-12 h-12 opacity-15 mb-3" />
                  <p className="text-sm font-medium">Cart is empty</p>
                  <p className="text-xs opacity-50 mt-1">Click a product to add it</p>
                </div>
              ) : (
                <div className="divide-y divide-border">
                  {cart.map((item) => (
                    <div key={item.productId} className="p-3">
                      <div className="flex items-start gap-2">
                        <div className="w-8 h-8 rounded-lg bg-muted overflow-hidden flex items-center justify-center shrink-0">
                          {item.imageUrl ? (
                            <img src={item.imageUrl} alt={item.name} className="w-full h-full object-cover" />
                          ) : (
                            <Package className="w-3.5 h-3.5 text-muted-foreground" />
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-start justify-between gap-1">
                            <p className="text-xs font-semibold leading-tight">{item.name}</p>
                            <button
                              onClick={() => removeFromCart(item.productId)}
                              className="text-muted-foreground hover:text-destructive transition-colors cursor-pointer shrink-0 ml-1"
                            >
                              <X className="w-3 h-3" />
                            </button>
                          </div>
                          <p className="text-[10px] text-muted-foreground font-mono">{item.sku}</p>

                          <div className="flex items-center justify-between mt-1.5 gap-2">
                            {/* Qty controls */}
                            <div className="flex items-center gap-1">
                              <button
                                onClick={() => updateQty(item.productId, -1)}
                                className="w-5 h-5 rounded border border-border flex items-center justify-center hover:bg-muted transition-colors cursor-pointer"
                              >
                                <Minus className="w-2.5 h-2.5" />
                              </button>
                              <input
                                type="number"
                                value={item.quantity}
                                onChange={(e) => setItemQty(item.productId, parseInt(e.target.value) || 0)}
                                className="w-8 text-center text-xs font-semibold bg-transparent border-none outline-none"
                                min={1}
                                max={item.stock}
                              />
                              <button
                                onClick={() => updateQty(item.productId, 1)}
                                className="w-5 h-5 rounded border border-border flex items-center justify-center hover:bg-muted transition-colors cursor-pointer"
                              >
                                <Plus className="w-2.5 h-2.5" />
                              </button>
                            </div>

                            {/* Price & discount */}
                            <div className="flex items-center gap-1.5 text-right">
                              {editingItemId === item.productId ? (
                                <div className="flex items-center gap-1">
                                  <Percent className="w-2.5 h-2.5 text-muted-foreground" />
                                  <input
                                    type="number"
                                    value={item.discountRate}
                                    onChange={(e) => updateItemDiscount(item.productId, parseFloat(e.target.value) || 0)}
                                    onBlur={() => setEditingItemId(null)}
                                    autoFocus
                                    className="w-12 text-xs border border-primary rounded px-1 py-0.5 bg-background outline-none"
                                    min={0}
                                    max={100}
                                    step={1}
                                  />
                                </div>
                              ) : (
                                <button
                                  onClick={() => setEditingItemId(item.productId)}
                                  className="flex items-center gap-0.5 text-[10px] text-muted-foreground hover:text-primary transition-colors cursor-pointer"
                                >
                                  <Tag className="w-2.5 h-2.5" />
                                  {item.discountRate > 0 ? (
                                    <span className="text-green-600 font-medium">{item.discountRate}% off</span>
                                  ) : (
                                    <span>Discount</span>
                                  )}
                                </button>
                              )}
                              <span className="text-sm font-bold text-primary w-14 text-right">
                                ${(item.quantity * item.unitPrice * (1 - item.discountRate / 100)).toFixed(2)}
                              </span>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Totals & checkout */}
            <div className="border-t border-border p-3 space-y-3 shrink-0">
              {/* Totals summary */}
              <div className="space-y-1 text-xs">
                <div className="flex justify-between text-muted-foreground">
                  <span>Subtotal</span>
                  <span className="font-mono">${totals.subtotal.toFixed(2)}</span>
                </div>
                {totals.taxAmount > 0 && (
                  <div className="flex justify-between text-muted-foreground">
                    <span>Tax</span>
                    <span className="font-mono">${totals.taxAmount.toFixed(2)}</span>
                  </div>
                )}
                {/* Order-level discount */}
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Order Discount ($)</span>
                  <Input
                    type="number"
                    value={discount}
                    onChange={(e) => setDiscount(e.target.value)}
                    className="w-20 h-5 text-xs text-right p-1"
                    min="0"
                    step="0.01"
                  />
                </div>
                <Separator />
                <div className="flex justify-between font-bold text-base">
                  <span>Total</span>
                  <span className="text-primary font-mono">${totals.total.toFixed(2)}</span>
                </div>
              </div>

              {/* Payment method */}
              <div className="grid grid-cols-3 gap-1.5">
                {PAYMENT_METHODS.map((pm) => (
                  <button
                    key={pm.value}
                    onClick={() => setPaymentMethod(pm.value)}
                    className={cn(
                      "flex flex-col items-center gap-1 py-2 rounded-lg border text-xs font-medium transition-all cursor-pointer",
                      paymentMethod === pm.value
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border text-muted-foreground hover:border-primary/40",
                    )}
                  >
                    <pm.icon className="w-3.5 h-3.5" />
                    {pm.label}
                  </button>
                ))}
              </div>

              {/* Cash-specific: amount tendered */}
              {paymentMethod === "cash" && (
                <div className="space-y-1.5">
                  <Label className="text-xs">Amount Tendered</Label>
                  <div className="flex gap-2">
                    <Input
                      type="number"
                      step="0.01"
                      value={paidAmount}
                      onChange={(e) => setPaidAmount(e.target.value)}
                      placeholder={totals.total.toFixed(2)}
                      className="h-8 text-sm font-mono"
                    />
                  </div>
                  {/* Quick cash buttons */}
                  <div className="flex gap-1 flex-wrap">
                    {[totals.total, Math.ceil(totals.total / 5) * 5, Math.ceil(totals.total / 10) * 10, Math.ceil(totals.total / 20) * 20].filter((v, i, arr) => arr.indexOf(v) === i).slice(0, 4).map((amount) => (
                      <button
                        key={amount}
                        onClick={() => setPaidAmount(amount.toFixed(2))}
                        className="text-[10px] px-2 py-1 rounded bg-muted hover:bg-muted/80 transition-colors cursor-pointer font-mono"
                      >
                        ${amount.toFixed(0)}
                      </button>
                    ))}
                  </div>
                  {totals.paid > 0 && totals.paid >= totals.total && (
                    <div className="flex items-center justify-between rounded-lg bg-green-50 dark:bg-green-900/20 px-2 py-1.5">
                      <span className="text-xs text-green-700 dark:text-green-400">Change</span>
                      <span className="text-sm font-bold text-green-600 font-mono">${totals.change.toFixed(2)}</span>
                    </div>
                  )}
                </div>
              )}

              {/* Complete button */}
              <Button
                className="w-full cursor-pointer h-11 text-sm font-semibold"
                disabled={cart.length === 0}
                onClick={handleCompleteSale}
              >
                <Zap className="w-4 h-4 mr-2" />
                Charge ${totals.total.toFixed(2)}
              </Button>

              {/* Mobile: show cart button */}
              <button
                className="md:hidden w-full py-2 text-xs text-muted-foreground border border-border rounded-lg cursor-pointer hover:bg-muted"
                onClick={() => setShowCheckout(false)}
              >
                ← Back to Products
              </button>
            </div>
          </div>

          {/* Mobile cart button */}
          {!showCheckout && cart.length > 0 && (
            <button
              className="md:hidden fixed bottom-20 right-4 z-30 flex items-center gap-2 bg-primary text-primary-foreground px-4 py-3 rounded-full shadow-lg cursor-pointer"
              onClick={() => setShowCheckout(true)}
            >
              <ShoppingCart className="w-4 h-4" />
              <span className="text-sm font-semibold">{cart.reduce((s, i) => s + i.quantity, 0)} items · ${totals.total.toFixed(2)}</span>
            </button>
          )}
        </div>
      )}

      {/* ─── Daily Summary Tab ──────────────────────────────── */}
      {activeTab === "daily" && (
        <div className="flex-1 overflow-y-auto p-5 pb-24 md:pb-6 space-y-5">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-bold">Today's Summary</h2>
              <p className="text-sm text-muted-foreground flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5" />
                {format(new Date(), "EEEE, MMMM d, yyyy")}
              </p>
            </div>
          </div>

          {/* KPI cards */}
          {dailySummary === undefined ? (
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-xl" />)}
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                {[
                  { label: "Revenue", value: `$${dailySummary.totalRevenue.toFixed(2)}`, sub: "Today", color: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" },
                  { label: "Transactions", value: dailySummary.totalTransactions.toString(), sub: "Completed sales", color: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400" },
                  { label: "Avg. Sale", value: `$${dailySummary.avgTransaction.toFixed(2)}`, sub: "Per transaction", color: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400" },
                  { label: "Discounts", value: `$${dailySummary.totalDiscount.toFixed(2)}`, sub: `Tax: $${dailySummary.totalTax.toFixed(2)}`, color: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400" },
                ].map((stat) => (
                  <Card key={stat.label}>
                    <CardContent className="p-4">
                      <p className="text-xs text-muted-foreground uppercase tracking-wider font-medium">{stat.label}</p>
                      <p className="text-xl font-bold mt-1">{stat.value}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">{stat.sub}</p>
                    </CardContent>
                  </Card>
                ))}
              </div>

              {/* Payment breakdown */}
              {Object.keys(dailySummary.byPaymentMethod).length > 0 && (
                <Card>
                  <CardContent className="p-4">
                    <p className="text-sm font-semibold mb-3">Payment Methods</p>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                      {(Object.entries(dailySummary.byPaymentMethod) as Array<[string, { amount: number; count: number }]>).map(([method, data]) => {
                        const Icon = method === "cash" ? Banknote : method === "card" ? CreditCard : Smartphone;
                        return (
                          <div key={method} className="flex items-center gap-3 p-3 rounded-lg bg-muted/40 border border-border">
                            <Icon className="w-4 h-4 text-muted-foreground shrink-0" />
                            <div>
                              <p className="text-xs text-muted-foreground capitalize">{method}</p>
                              <p className="text-sm font-bold">${data.amount.toFixed(2)}</p>
                              <p className="text-[10px] text-muted-foreground">{data.count} sales</p>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </CardContent>
                </Card>
              )}
            </>
          )}

          {/* Recent transactions today */}
          <Card>
            <CardContent className="p-0">
              <div className="px-4 py-3 border-b border-border">
                <p className="text-sm font-semibold">Recent Transactions</p>
              </div>
              {todaySales === undefined ? (
                <div className="p-4 space-y-2">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
              ) : todaySales.length === 0 ? (
                <div className="py-10 text-center">
                  <ShoppingCart className="w-8 h-8 text-muted-foreground/30 mx-auto mb-2" />
                  <p className="text-sm text-muted-foreground">No sales today yet</p>
                  <button
                    onClick={() => setActiveTab("pos")}
                    className="mt-2 text-xs text-primary hover:underline cursor-pointer"
                  >
                    Start a sale →
                  </button>
                </div>
              ) : (
                <div className="divide-y divide-border">
                  {todaySales.slice(0, 15).map((sale) => {
                    const PayIcon = sale.paymentMethod === "cash" ? Banknote : sale.paymentMethod === "card" ? CreditCard : Smartphone;
                    return (
                      <div key={sale._id} className="flex items-center justify-between px-4 py-2.5 hover:bg-muted/20">
                        <div className="flex items-center gap-3">
                          <div className="w-7 h-7 rounded-lg bg-muted flex items-center justify-center">
                            <PayIcon className="w-3.5 h-3.5 text-muted-foreground" />
                          </div>
                          <div>
                            <p className="text-xs font-mono font-semibold">{sale.saleNumber}</p>
                            <p className="text-[10px] text-muted-foreground">
                              {sale.customer?.name ?? "Walk-in"} · {format(parseISO(sale.createdAt), "h:mm a")}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-bold">${sale.totalAmount.toFixed(2)}</span>
                          <Badge className={cn("text-[10px] py-0 px-1.5",
                            sale.status === "completed" ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" : "bg-amber-100 text-amber-700"
                          )}>
                            {sale.status}
                          </Badge>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* ─── Receipt Dialog ──────────────────────────────────── */}
      <Dialog open={showReceipt} onOpenChange={setShowReceipt}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5 text-green-500" />
              Sale Complete
            </DialogTitle>
          </DialogHeader>

          {receiptData && (
            <div className="space-y-4">
              {/* Success icon */}
              <div className="text-center pt-1">
                <div className="w-16 h-16 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center mx-auto mb-2">
                  <CheckCircle2 className="w-8 h-8 text-green-500" />
                </div>
                <p className="font-bold font-mono text-lg">{receiptData.saleNumber}</p>
                {receiptData.customerName && (
                  <p className="text-xs text-muted-foreground flex items-center justify-center gap-1 mt-1">
                    <User className="w-3 h-3" />{receiptData.customerName}
                  </p>
                )}
              </div>

              {/* Receipt lines */}
              <div className="bg-muted/40 rounded-xl p-3 space-y-1.5 text-xs">
                {receiptData.items.map((item, idx) => (
                  <div key={idx} className="flex justify-between">
                    <span className="text-muted-foreground">{item.qty}× {item.name}</span>
                    <span className="font-mono">${item.total.toFixed(2)}</span>
                  </div>
                ))}
                <Separator className="my-1" />
                <div className="flex justify-between text-muted-foreground">
                  <span>Subtotal</span>
                  <span className="font-mono">${receiptData.subtotal.toFixed(2)}</span>
                </div>
                {receiptData.taxAmount > 0 && (
                  <div className="flex justify-between text-muted-foreground">
                    <span>Tax</span>
                    <span className="font-mono">${receiptData.taxAmount.toFixed(2)}</span>
                  </div>
                )}
                {receiptData.discountAmount > 0 && (
                  <div className="flex justify-between text-green-600">
                    <span>Discount</span>
                    <span className="font-mono">-${receiptData.discountAmount.toFixed(2)}</span>
                  </div>
                )}
                <Separator className="my-1" />
                <div className="flex justify-between font-bold text-sm">
                  <span>Total</span>
                  <span className="font-mono">${receiptData.total.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-muted-foreground">
                  <span>Paid ({receiptData.paymentMethod})</span>
                  <span className="font-mono">${receiptData.paid.toFixed(2)}</span>
                </div>
                {receiptData.change > 0 && (
                  <div className="flex justify-between font-semibold text-green-600">
                    <span>Change</span>
                    <span className="font-mono">${receiptData.change.toFixed(2)}</span>
                  </div>
                )}
              </div>

              {/* Actions */}
              <div className="flex gap-2">
                <Button variant="secondary" className="flex-1 cursor-pointer" onClick={() => setShowReceipt(false)}>
                  New Sale
                </Button>
                <Button className="flex-1 cursor-pointer" onClick={() => window.print()}>
                  <Printer className="w-4 h-4 mr-2" />Print
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
