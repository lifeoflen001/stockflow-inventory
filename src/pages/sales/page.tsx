import { useState } from "react";
import { useApiQuery } from "@/hooks/use-api.ts";
import { endpoints } from "@/api/endpoints.ts";
import { Card, CardContent } from "@/components/ui/card.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog.tsx";
import { Separator } from "@/components/ui/separator.tsx";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select.tsx";
import { cn } from "@/lib/utils.ts";
import { format, parseISO, isToday, isYesterday, subDays, startOfDay } from "date-fns";
import {
  Search, Receipt, CreditCard, Banknote, Smartphone,
  TrendingUp, DollarSign, ShoppingBag, Eye,
  User, Warehouse, Tag, ChevronDown, ChevronUp,
} from "lucide-react";
import type { EntityId } from "@/types/api.ts";

const paymentIcons = {
  cash: Banknote,
  card: CreditCard,
  mobile: Smartphone,
  credit: CreditCard,
};

const statusColors: Record<string, string> = {
  completed: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
  refunded: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
  partial_refund: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
};

type DateFilter = "all" | "today" | "yesterday" | "7days" | "30days";

export default function SalesHistoryPage() {
  const [search, setSearch] = useState("");
  const [dateFilter, setDateFilter] = useState<DateFilter>("all");
  const [paymentFilter, setPaymentFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [selectedSaleId, setSelectedSaleId] = useState<EntityId<"sales"> | null>(null);
  const [expandedSaleId, setExpandedSaleId] = useState<EntityId<"sales"> | null>(null);

  const sales = useApiQuery(endpoints.sales.listSales, { limit: 200 });
  const selectedSale = useApiQuery(
    endpoints.sales.getSale,
    selectedSaleId ? { id: selectedSaleId } : "skip",
  );

  const filtered = (sales ?? []).filter((s) => {
    const matchSearch =
      s.saleNumber.toLowerCase().includes(search.toLowerCase()) ||
      (s.customer?.name ?? "").toLowerCase().includes(search.toLowerCase()) ||
      (s.cashier?.name ?? "").toLowerCase().includes(search.toLowerCase());

    const matchPayment = paymentFilter === "all" || s.paymentMethod === paymentFilter;
    const matchStatus = statusFilter === "all" || s.status === statusFilter;

    let matchDate = true;
    if (dateFilter !== "all") {
      const d = parseISO(s.createdAt);
      if (dateFilter === "today") matchDate = isToday(d);
      else if (dateFilter === "yesterday") matchDate = isYesterday(d);
      else if (dateFilter === "7days") matchDate = d >= subDays(startOfDay(new Date()), 7);
      else if (dateFilter === "30days") matchDate = d >= subDays(startOfDay(new Date()), 30);
    }

    return matchSearch && matchPayment && matchStatus && matchDate;
  });

  const totalRevenue = filtered.reduce((sum, s) => sum + (s.status === "completed" ? s.totalAmount : 0), 0);
  const totalTax = filtered.reduce((sum, s) => sum + (s.status === "completed" ? s.taxAmount : 0), 0);
  const totalDiscount = filtered.reduce((sum, s) => sum + (s.status === "completed" ? s.discountAmount : 0), 0);
  const completedCount = filtered.filter((s) => s.status === "completed").length;
  const avgSale = completedCount > 0 ? totalRevenue / completedCount : 0;

  const formatDate = (iso: string) => {
    const d = parseISO(iso);
    if (isToday(d)) return `Today ${format(d, "h:mm a")}`;
    if (isYesterday(d)) return `Yesterday ${format(d, "h:mm a")}`;
    return format(d, "MMM d, h:mm a");
  };

  return (
    <div className="p-5 space-y-5 pb-24 md:pb-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold">Sales History</h2>
          <p className="text-sm text-muted-foreground">
            {sales?.length ?? 0} total transactions
          </p>
        </div>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { label: "Revenue", value: `$${totalRevenue.toLocaleString("en-US", { minimumFractionDigits: 2 })}`, icon: DollarSign, color: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" },
          { label: "Transactions", value: completedCount.toString(), icon: ShoppingBag, color: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400" },
          { label: "Avg. Sale", value: `$${avgSale.toFixed(2)}`, icon: TrendingUp, color: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400" },
          { label: "Tax Collected", value: `$${totalTax.toFixed(2)}`, icon: Tag, color: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400" },
        ].map((stat) => (
          <Card key={stat.label}>
            <CardContent className="p-4">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-xs text-muted-foreground uppercase tracking-wider font-medium">{stat.label}</p>
                  <p className="text-lg font-bold mt-0.5">{stat.value}</p>
                  {stat.label === "Revenue" && totalDiscount > 0 && (
                    <p className="text-[10px] text-muted-foreground">-${totalDiscount.toFixed(2)} discounts</p>
                  )}
                </div>
                <div className={cn("w-8 h-8 rounded-lg flex items-center justify-center", stat.color)}>
                  <stat.icon className="w-3.5 h-3.5" />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search sale #, customer, cashier…"
            className="pl-9"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Select value={dateFilter} onValueChange={(v) => setDateFilter(v as DateFilter)}>
          <SelectTrigger className="w-36">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Time</SelectItem>
            <SelectItem value="today">Today</SelectItem>
            <SelectItem value="yesterday">Yesterday</SelectItem>
            <SelectItem value="7days">Last 7 Days</SelectItem>
            <SelectItem value="30days">Last 30 Days</SelectItem>
          </SelectContent>
        </Select>
        <Select value={paymentFilter} onValueChange={setPaymentFilter}>
          <SelectTrigger className="w-32">
            <SelectValue placeholder="Payment" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Payments</SelectItem>
            <SelectItem value="cash">Cash</SelectItem>
            <SelectItem value="card">Card</SelectItem>
            <SelectItem value="mobile">Mobile</SelectItem>
            <SelectItem value="credit">Credit</SelectItem>
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-32">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="completed">Completed</SelectItem>
            <SelectItem value="refunded">Refunded</SelectItem>
            <SelectItem value="partial_refund">Partial Refund</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          {sales === undefined ? (
            <div className="p-4 space-y-3">
              {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-14 w-full" />)}
            </div>
          ) : filtered.length === 0 ? (
            <div className="py-16 text-center">
              <Receipt className="w-10 h-10 text-muted-foreground/40 mx-auto mb-3" />
              <p className="text-sm text-muted-foreground">No sales found</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/30">
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">Sale #</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground hidden md:table-cell">Date</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground hidden lg:table-cell">Customer</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground hidden lg:table-cell">Cashier</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">Payment</th>
                    <th className="text-right px-4 py-3 font-medium text-muted-foreground">Amount</th>
                    <th className="text-center px-4 py-3 font-medium text-muted-foreground">Status</th>
                    <th className="text-right px-4 py-3 font-medium text-muted-foreground">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((sale) => {
                    const PayIcon = paymentIcons[sale.paymentMethod];
                    const isExpanded = expandedSaleId === sale._id;
                    return (
                      <>
                        <tr
                          key={sale._id}
                          className="border-b border-border last:border-0 hover:bg-muted/20 transition-colors"
                        >
                          <td className="px-4 py-3 font-mono text-xs font-semibold">{sale.saleNumber}</td>
                          <td className="px-4 py-3 text-muted-foreground text-xs hidden md:table-cell">
                            {formatDate(sale.createdAt)}
                          </td>
                          <td className="px-4 py-3 hidden lg:table-cell">
                            <div className="flex items-center gap-1.5">
                              <User className="w-3 h-3 text-muted-foreground" />
                              <span className="text-sm">{sale.customer?.name ?? <span className="text-muted-foreground italic">Walk-in</span>}</span>
                            </div>
                          </td>
                          <td className="px-4 py-3 text-xs text-muted-foreground hidden lg:table-cell">
                            {sale.cashier?.name ?? "—"}
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-1.5">
                              <PayIcon className="w-3 h-3 text-muted-foreground" />
                              <span className="text-xs capitalize">{sale.paymentMethod}</span>
                            </div>
                          </td>
                          <td className="px-4 py-3 text-right font-mono font-semibold">
                            ${sale.totalAmount.toFixed(2)}
                          </td>
                          <td className="px-4 py-3 text-center">
                            <Badge className={cn("text-xs", statusColors[sale.status])}>
                              {sale.status.replace("_", " ")}
                            </Badge>
                          </td>
                          <td className="px-4 py-3 text-right">
                            <div className="flex items-center justify-end gap-1">
                              <Button
                                variant="ghost"
                                size="icon"
                                className="w-7 h-7 cursor-pointer"
                                title="View details"
                                onClick={() => {
                                  setSelectedSaleId(sale._id);
                                }}
                              >
                                <Eye className="w-3 h-3" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="w-7 h-7 cursor-pointer"
                                title="Expand"
                                onClick={() => setExpandedSaleId(isExpanded ? null : sale._id)}
                              >
                                {isExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                              </Button>
                            </div>
                          </td>
                        </tr>
                        {isExpanded && (
                          <tr key={`${sale._id}-expanded`} className="bg-muted/10 border-b border-border">
                            <td colSpan={8} className="px-6 py-3">
                              <div className="flex gap-6 text-xs text-muted-foreground flex-wrap">
                                <div className="flex items-center gap-1.5">
                                  <Warehouse className="w-3 h-3" />
                                  <span>Warehouse: {sale.warehouse?.name ?? "—"}</span>
                                </div>
                                <div>Subtotal: <span className="font-mono text-foreground">${sale.subtotal.toFixed(2)}</span></div>
                                <div>Tax: <span className="font-mono text-foreground">${sale.taxAmount.toFixed(2)}</span></div>
                                {sale.discountAmount > 0 && (
                                  <div>Discount: <span className="font-mono text-green-600">-${sale.discountAmount.toFixed(2)}</span></div>
                                )}
                                {sale.changeAmount > 0 && (
                                  <div>Change: <span className="font-mono text-foreground">${sale.changeAmount.toFixed(2)}</span></div>
                                )}
                                {sale.notes && <div>Notes: {sale.notes}</div>}
                              </div>
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

      {/* Sale Detail Dialog */}
      <Dialog open={!!selectedSaleId} onOpenChange={(open) => { if (!open) setSelectedSaleId(null); }}>
        <DialogContent className="max-w-md max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Receipt className="w-4 h-4" />
              {selectedSale?.saleNumber ?? "Loading…"}
            </DialogTitle>
          </DialogHeader>

          {selectedSale === undefined ? (
            <div className="space-y-3 py-2">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-8 w-full" />)}</div>
          ) : selectedSale === null ? (
            <p className="text-muted-foreground text-sm py-4">Sale not found</p>
          ) : (
            <div className="space-y-4 py-1">
              {/* Meta */}
              <div className="grid grid-cols-2 gap-2 text-xs">
                {[
                  { label: "Date", value: format(parseISO(selectedSale.createdAt), "MMM d, yyyy h:mm a") },
                  { label: "Status", value: selectedSale.status.replace("_", " ") },
                  { label: "Cashier", value: selectedSale.cashier?.name ?? "—" },
                  { label: "Warehouse", value: selectedSale.warehouse?.name ?? "—" },
                  { label: "Customer", value: selectedSale.customer?.name ?? "Walk-in" },
                  { label: "Payment", value: selectedSale.paymentMethod },
                ].map(({ label, value }) => (
                  <div key={label} className="bg-muted/40 rounded-lg p-2.5">
                    <p className="text-muted-foreground">{label}</p>
                    <p className="font-semibold capitalize">{value}</p>
                  </div>
                ))}
              </div>

              {/* Items */}
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Items</p>
                <div className="bg-muted/30 rounded-xl divide-y divide-border/50">
                  {(selectedSale.items ?? []).map((item) => (
                    <div key={item._id} className="flex items-center justify-between px-3 py-2.5 text-xs">
                      <div>
                        <p className="font-medium">{item.product?.name ?? "Unknown"}</p>
                        <p className="text-muted-foreground font-mono">{item.product?.sku}</p>
                        {item.discountRate > 0 && (
                          <p className="text-green-600">-{item.discountRate}% discount</p>
                        )}
                      </div>
                      <div className="text-right">
                        <p className="font-mono">${item.unitPrice.toFixed(2)} × {item.quantity}</p>
                        <p className="font-bold font-mono">${item.total.toFixed(2)}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <Separator />

              {/* Totals */}
              <div className="space-y-1 text-sm">
                <div className="flex justify-between text-muted-foreground text-xs">
                  <span>Subtotal</span>
                  <span className="font-mono">${selectedSale.subtotal.toFixed(2)}</span>
                </div>
                {selectedSale.taxAmount > 0 && (
                  <div className="flex justify-between text-muted-foreground text-xs">
                    <span>Tax</span>
                    <span className="font-mono">${selectedSale.taxAmount.toFixed(2)}</span>
                  </div>
                )}
                {selectedSale.discountAmount > 0 && (
                  <div className="flex justify-between text-green-600 text-xs">
                    <span>Discount</span>
                    <span className="font-mono">-${selectedSale.discountAmount.toFixed(2)}</span>
                  </div>
                )}
                <div className="flex justify-between font-bold text-base pt-1">
                  <span>Total</span>
                  <span className="font-mono">${selectedSale.totalAmount.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-muted-foreground text-xs">
                  <span>Paid</span>
                  <span className="font-mono">${selectedSale.paidAmount.toFixed(2)}</span>
                </div>
                {selectedSale.changeAmount > 0 && (
                  <div className="flex justify-between font-semibold text-green-600 text-xs">
                    <span>Change</span>
                    <span className="font-mono">${selectedSale.changeAmount.toFixed(2)}</span>
                  </div>
                )}
              </div>

              <Button className="w-full cursor-pointer" variant="secondary" onClick={() => window.print()}>
                <Receipt className="w-4 h-4 mr-2" />Print Receipt
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
