import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useDraftState } from "@/hooks/use-draft-state.ts";
import { useApiMutation, useApiQuery } from "@/hooks/use-api.ts";
import { endpoints } from "@/api/endpoints.ts";
import { getApiErrorMessage } from "@/api/client.ts";
import { downloadPettyCashPdf } from "@/lib/petty-cash-pdf.ts";
import { useAuth } from "@/hooks/use-auth.ts";
import { Button } from "@/components/ui/button.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Label } from "@/components/ui/label.tsx";
import { Textarea } from "@/components/ui/textarea.tsx";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card.tsx";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog.tsx";
import { toast } from "@/lib/system-message.ts";
import { Banknote, CalendarDays, Download, Eye, Plus, ReceiptText, Search, UserRound } from "lucide-react";
import { PageContentLoader } from "@/components/ui/page-loader.tsx";

type PettyCashVoucher = {
  id: string;
  voucherNumber: string;
  issuedAt: string;
  collector: string;
  requiredFor: string;
  amount: number;
  currency: string;
  notes?: string | null;
  issuedBy?: { id?: string; name?: string | null } | null;
};

type PettyCashForm = {
  issuedAt: string;
  collector: string;
  requiredFor: string;
  amount: string;
  notes: string;
};

const today = () => new Date().toISOString().slice(0, 10);
const emptyForm = (): PettyCashForm => ({ issuedAt: today(), collector: "", requiredFor: "", amount: "", notes: "" });
const formatAmount = (value: number, currency: string) => `${currency} ${Number(value || 0).toLocaleString("en-TZ", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const formatDate = (value: string) => value ? new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(value)) : "-";

export default function PettyCashPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const canIssue = user?.role === "super_admin" || user?.permissions.includes("petty_cash.create");
  const [showCreate, setShowCreate] = useState(false);
  const [search, setSearch] = useState("");
  const [form, setForm] = useDraftState("petty-cash-issue", emptyForm());
  const vouchersResponse = useApiQuery(endpoints.procurement.listPettyCash);
  const companiesResponse = useApiQuery(endpoints.organizationStructure.listCompanies);
  const createPettyCash = useApiMutation(endpoints.procurement.createPettyCash);
  const vouchers = useMemo(() => (vouchersResponse ?? []) as PettyCashVoucher[], [vouchersResponse]);
  const company = companiesResponse?.data?.[0];
  const currency = company?.currency ?? "TSHS";

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return vouchers;
    return vouchers.filter((voucher) => `${voucher.voucherNumber} ${voucher.collector} ${voucher.requiredFor} ${voucher.issuedBy?.name ?? ""}`.toLowerCase().includes(query));
  }, [search, vouchers]);

  const totalIssued = vouchers.reduce((sum, voucher) => sum + Number(voucher.amount || 0), 0);
  const currentMonth = vouchers.filter((voucher) => voucher.issuedAt?.slice(0, 7) === today().slice(0, 7));
  const currentMonthTotal = currentMonth.reduce((sum, voucher) => sum + Number(voucher.amount || 0), 0);

  const download = async (voucher: PettyCashVoucher) => {
    toast.loading("Preparing petty cash voucher PDF...");
    try {
      await downloadPettyCashPdf({ ...voucher, signatureUrl: user?.profile.signatureUrl }, company);
      toast.success("Petty cash pdf file downloaded successfully");
    } catch (cause) {
      toast.error(getApiErrorMessage(cause, "Unable to generate petty cash voucher PDF"));
    }
  };

  const issue = async () => {
    if (!form.issuedAt || !form.collector.trim() || !form.requiredFor.trim() || !form.amount || Number(form.amount) <= 0) {
      toast.error("Date, collector, purpose and a positive amount are required");
      return;
    }
    try {
      const created = await createPettyCash({
        issuedAt: form.issuedAt,
        collector: form.collector.trim(),
        requiredFor: form.requiredFor.trim(),
        amount: Number(form.amount),
        notes: form.notes.trim() || undefined,
      }) as PettyCashVoucher;
      setShowCreate(false);
      setForm(emptyForm());
      toast.success("Petty cash issued successfully");
      await download(created);
    } catch (cause) {
      toast.error(getApiErrorMessage(cause, "Unable to issue petty cash"));
    }
  };

  if (vouchersResponse === undefined) return <PageContentLoader variant="table" />;

  return (
    <div className="space-y-5 p-4 pb-24 md:p-6 md:pb-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2"><Banknote className="size-5 text-primary" /><h1 className="text-xl font-bold">Petty Cash Voucher</h1></div>
          <p className="mt-1 text-sm text-muted-foreground">Issue and track petty cash vouchers for organizational use.</p>
        </div>
        {canIssue && <Button onClick={() => { setForm(emptyForm()); setShowCreate(true); }}><Plus className="size-4" />Issue Petty Cash</Button>}
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Card><CardContent className="flex items-center gap-3 p-4"><ReceiptText className="size-5 text-primary" /><div><p className="text-xs text-muted-foreground">All vouchers</p><p className="text-lg font-semibold">{vouchers.length}</p></div></CardContent></Card>
        <Card><CardContent className="flex items-center gap-3 p-4"><CalendarDays className="size-5 text-primary" /><div><p className="text-xs text-muted-foreground">This month</p><p className="text-lg font-semibold">{currentMonth.length} · {formatAmount(currentMonthTotal, currency)}</p></div></CardContent></Card>
        <Card><CardContent className="flex items-center gap-3 p-4"><Banknote className="size-5 text-primary" /><div><p className="text-xs text-muted-foreground">Total issued</p><p className="text-lg font-semibold">{formatAmount(totalIssued, currency)}</p></div></CardContent></Card>
      </div>

      <Card>
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3 border-b py-4">
          <CardTitle className="text-base">Issued petty cash vouchers</CardTitle>
          <div className="relative w-full max-w-sm"><Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><Input className="pl-9" placeholder="Search voucher, collector or purpose..." value={search} onChange={(event) => setSearch(event.target.value)} /></div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-left text-xs text-muted-foreground"><tr><th className="px-4 py-3">Date</th><th className="px-4 py-3">Voucher</th><th className="px-4 py-3">Collector / Beneficiary</th><th className="px-4 py-3">Reason for voucher</th><th className="px-4 py-3 text-right">Amount</th><th className="px-4 py-3">Issued by</th><th className="px-4 py-3 text-right">Action</th></tr></thead>
              <tbody>{filtered.map((voucher) => <tr key={voucher.id} className="border-t hover:bg-muted/20"><td className="whitespace-nowrap px-4 py-3 text-muted-foreground">{formatDate(voucher.issuedAt)}</td><td className="px-4 py-3 font-mono text-xs font-semibold">{voucher.voucherNumber}</td><td className="px-4 py-3"><div className="flex items-center gap-2"><span className="flex size-7 items-center justify-center rounded-full bg-primary/10 text-primary"><UserRound className="size-3.5" /></span><span className="font-medium">{voucher.collector}</span></div></td><td className="max-w-[300px] px-4 py-3 text-muted-foreground">{voucher.requiredFor}</td><td className="whitespace-nowrap px-4 py-3 text-right font-semibold">{formatAmount(voucher.amount, voucher.currency || currency)}</td><td className="px-4 py-3 text-muted-foreground">{voucher.issuedBy?.name || "-"}</td><td className="px-4 py-3 text-right"><div className="flex items-center justify-end gap-1"><Button variant="ghost" size="icon" title="View petty cash details" onClick={() => navigate(`/petty-cash/${voucher.id}`)}><Eye className="size-4" /></Button><Button variant="ghost" size="icon" title="Download petty cash voucher PDF" onClick={() => void download(voucher)}><Download className="size-4" /></Button></div></td></tr>)}</tbody>
            </table>
            {!filtered.length && <div className="py-16 text-center text-sm text-muted-foreground">No petty cash vouchers found.</div>}
          </div>
        </CardContent>
      </Card>

      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="max-w-xl">
          <DialogHeader><DialogTitle>Issue Petty Cash</DialogTitle></DialogHeader>
          <div className="grid gap-4 py-2 sm:grid-cols-2">
            <div className="space-y-1.5"><Label htmlFor="petty-cash-date">Date</Label><Input id="petty-cash-date" type="date" value={form.issuedAt} onChange={(event) => setForm({ ...form, issuedAt: event.target.value })} /></div>
            <div className="space-y-1.5"><Label htmlFor="petty-cash-amount">Amount ({currency})</Label><Input id="petty-cash-amount" type="number" min="0.01" step="0.01" placeholder="0.00" value={form.amount} onChange={(event) => setForm({ ...form, amount: event.target.value })} /></div>
            <div className="space-y-1.5 sm:col-span-2"><Label htmlFor="petty-cash-collector">Collector / Beneficiary</Label><Input id="petty-cash-collector" placeholder="Name of the person receiving the cash" value={form.collector} onChange={(event) => setForm({ ...form, collector: event.target.value })} /></div>
            <div className="space-y-1.5 sm:col-span-2"><Label htmlFor="petty-cash-purpose">Reason for voucher</Label><Textarea id="petty-cash-purpose" rows={4} placeholder="Describe what the cash is required for" value={form.requiredFor} onChange={(event) => setForm({ ...form, requiredFor: event.target.value })} /></div>
            <div className="space-y-1.5 sm:col-span-2"><Label htmlFor="petty-cash-notes">Notes (optional)</Label><Textarea id="petty-cash-notes" rows={2} placeholder="Additional notes" value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} /></div>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setShowCreate(false)}>Cancel</Button><Button onClick={() => void issue()}><Banknote className="size-4" />Issue &amp; Download</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
