import { useEffect, useMemo, useState } from "react";
import { FileText, Handshake, Loader2, Pencil, Save, ShieldCheck, ShoppingCart } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { apiClient, getApiErrorMessage } from "@/api/client.ts";
import { Badge } from "@/components/ui/badge.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card.tsx";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog.tsx";
import { Input } from "@/components/ui/input.tsx";
import { PageContentLoader } from "@/components/ui/page-loader.tsx";
import { Textarea } from "@/components/ui/textarea.tsx";
import { useAuth } from "@/hooks/use-auth.ts";
import { toast } from "@/lib/system-message.ts";

type Policy = {
  slug: string;
  title: string;
  summary: string | null;
  content: string;
  isPublished: boolean;
  updatedAt: string | null;
  updatedBy: string | null;
};

const policyIcons: Record<string, LucideIcon> = {
  "terms-of-service": FileText,
  "privacy-policy": ShieldCheck,
  "supplier-policy": Handshake,
  "procurement-ordering-policy": ShoppingCart,
};

function formatUpdatedAt(value: string | null) {
  if (!value) return "Not updated yet";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Not updated yet" : date.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

export default function PoliciesPage() {
  const { user } = useAuth();
  const [policies, setPolicies] = useState<Policy[]>([]);
  const [selectedSlug, setSelectedSlug] = useState("terms-of-service");
  const [editing, setEditing] = useState<Policy | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const isSuperAdmin = user?.role === "super_admin";
  const selected = useMemo(() => policies.find((policy) => policy.slug === selectedSlug) ?? policies[0], [policies, selectedSlug]);

  useEffect(() => {
    let active = true;
    void apiClient.get<{ data: Policy[] }>("/policies")
      .then((response) => {
        if (!active) return;
        const nextPolicies = response.data.data ?? [];
        setPolicies(nextPolicies);
        if (nextPolicies.length) setSelectedSlug((current) => nextPolicies.some((policy) => policy.slug === current) ? current : nextPolicies[0].slug);
      })
      .catch((error) => { if (active) toast.error(getApiErrorMessage(error, "Unable to load policies")); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  const savePolicy = async () => {
    if (!editing) return;
    setSaving(true);
    try {
      const response = await apiClient.patch<{ data: Policy }>(`/policies/${encodeURIComponent(editing.slug)}`, {
        title: editing.title.trim(),
        summary: editing.summary?.trim() || null,
        content: editing.content.trim(),
        is_published: editing.isPublished,
      });
      setPolicies((current) => current.map((policy) => policy.slug === editing.slug ? response.data.data : policy));
      setEditing(null);
      toast.success("Policy updated successfully");
    } catch (error) {
      toast.error(getApiErrorMessage(error, "Unable to save policy"));
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <PageContentLoader variant="detail" />;

  return <div className="space-y-6 p-4 pb-24 md:p-6 md:pb-6">
    <div>
      <Badge variant="outline" className="mb-3 border-primary/20 bg-primary/5 text-primary">Governance &amp; compliance</Badge>
      <h1 className="text-2xl font-bold tracking-tight">Policies</h1>
      <p className="mt-1 max-w-3xl text-sm text-muted-foreground">Read the policies that guide how Procurement Sys is used, how supplier relationships are managed and how orders are controlled.</p>
    </div>

    <div className="grid gap-6 lg:grid-cols-[260px_minmax(0,1fr)]">
      <Card className="h-fit overflow-hidden">
        <CardHeader className="border-b bg-muted/20">
          <CardTitle className="text-sm">Policy library</CardTitle>
          <CardDescription>Select a policy to read.</CardDescription>
        </CardHeader>
        <CardContent className="p-2">
          <div className="space-y-1">
            {policies.map((policy) => {
              const Icon = policyIcons[policy.slug] ?? FileText;
              const active = selected?.slug === policy.slug;
              return <button key={policy.slug} type="button" onClick={() => setSelectedSlug(policy.slug)} className={`flex w-full items-start gap-3 rounded-lg px-3 py-3 text-left transition ${active ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:bg-primary/5 hover:text-foreground"}`}>
                <Icon className="mt-0.5 size-4 shrink-0" />
                <span className="min-w-0"><span className="block text-sm font-semibold">{policy.title}</span><span className={`mt-1 block text-xs ${active ? "text-primary-foreground/75" : "text-muted-foreground"}`}>{policy.isPublished ? "Published" : "Draft"}</span></span>
              </button>;
            })}
          </div>
        </CardContent>
      </Card>

      {selected ? <Card className="overflow-hidden shadow-sm">
        <div className="border-b bg-primary/[0.035] px-6 py-10 text-center md:px-10">
          <Badge variant="outline" className="mb-4 border-primary/20 bg-background/80 text-primary">Procurement Sys</Badge>
          <h2 className="text-2xl font-bold tracking-tight md:text-3xl">{selected.title}</h2>
          <p className="mt-2 text-sm text-muted-foreground">Last updated: {formatUpdatedAt(selected.updatedAt)}{selected.updatedBy ? ` by ${selected.updatedBy}` : ""}</p>
          <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
            <Badge variant={selected.isPublished ? "default" : "secondary"}>{selected.isPublished ? "Published" : "Draft"}</Badge>
            {isSuperAdmin && <Button variant="outline" size="sm" onClick={() => setEditing({ ...selected })}><Pencil className="size-4" />Edit policy</Button>}
          </div>
        </div>
        <CardContent className="px-6 py-8 md:px-10 md:py-10">
          {selected.summary && <p className="mb-8 rounded-lg border border-primary/10 bg-primary/[0.03] px-4 py-3 text-sm leading-6 text-muted-foreground">{selected.summary}</p>}
          <PolicyContent content={selected.content} />
        </CardContent>
      </Card> : <Card><CardContent className="py-20 text-center text-sm text-muted-foreground">No policies are available for this organization.</CardContent></Card>}
    </div>

    <Dialog open={Boolean(editing)} onOpenChange={(open) => { if (!open && !saving) setEditing(null); }}>
      <DialogContent className="max-w-4xl">
        <DialogHeader><DialogTitle>Edit {editing?.title ?? "policy"}</DialogTitle></DialogHeader>
        {editing && <div className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2"><label htmlFor="policy-title" className="text-sm font-medium">Title</label><Input id="policy-title" value={editing.title} onChange={(event) => setEditing({ ...editing, title: event.target.value })} /></div>
            <div className="space-y-2"><label htmlFor="policy-summary" className="text-sm font-medium">Summary</label><Input id="policy-summary" value={editing.summary ?? ""} onChange={(event) => setEditing({ ...editing, summary: event.target.value })} /></div>
          </div>
          <div className="space-y-2"><label htmlFor="policy-content" className="text-sm font-medium">Policy content</label><Textarea id="policy-content" value={editing.content} onChange={(event) => setEditing({ ...editing, content: event.target.value })} className="min-h-[420px] font-mono text-xs leading-5" /></div>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={editing.isPublished} onChange={(event) => setEditing({ ...editing, isPublished: event.target.checked })} className="size-4 accent-primary" />Published and visible to users</label>
        </div>}
        <DialogFooter><Button variant="outline" onClick={() => setEditing(null)} disabled={saving}>Cancel</Button><Button onClick={() => void savePolicy()} disabled={saving || !editing?.title.trim() || !editing?.content.trim()}>{saving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}Save policy</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  </div>;
}

function PolicyContent({ content }: { content: string }) {
  const blocks: Array<{ type: "heading" | "paragraph" | "bullets"; value: string | string[] }> = [];
  let paragraph: string[] = [];
  let bullets: string[] = [];
  const flush = () => {
    if (paragraph.length) { blocks.push({ type: "paragraph", value: paragraph.join(" ") }); paragraph = []; }
    if (bullets.length) { blocks.push({ type: "bullets", value: bullets }); bullets = []; }
  };

  content.split(/\r?\n/).forEach((rawLine) => {
    const line = rawLine.trim();
    if (!line) { flush(); return; }
    if (line.startsWith("# ") || line.startsWith("## ")) { flush(); blocks.push({ type: "heading", value: line.replace(/^#+\s*/, "") }); return; }
    if (line.startsWith("- ")) { if (paragraph.length) flush(); bullets.push(line.slice(2)); return; }
    if (bullets.length) flush();
    paragraph.push(line);
  });
  flush();

  return <div className="mx-auto max-w-4xl space-y-5 text-sm leading-7 text-muted-foreground">{blocks.map((block, index) => {
    if (block.type === "heading") return <h3 key={`${block.type}-${index}`} className="pt-3 text-base font-semibold text-foreground">{block.value}</h3>;
    if (block.type === "bullets") return <ul key={`${block.type}-${index}`} className="list-disc space-y-2 pl-6">{(block.value as string[]).map((item, itemIndex) => <li key={`${index}-${itemIndex}`}>{item}</li>)}</ul>;
    return <p key={`${block.type}-${index}`}>{block.value}</p>;
  })}</div>;
}
