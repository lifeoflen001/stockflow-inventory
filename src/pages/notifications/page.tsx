import { useEffect, useMemo, useState } from "react";
import { useDraftState } from "@/hooks/use-draft-state.ts";
import { useNavigate } from "react-router-dom";
import { AlertTriangle, Bell, CheckCheck, Megaphone, MessageCircle, Plus, Send } from "lucide-react";
import { Badge } from "@/components/ui/badge.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Card, CardContent } from "@/components/ui/card.tsx";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select.tsx";
import { Textarea } from "@/components/ui/textarea.tsx";
import { useAuth } from "@/hooks/use-auth.ts";
import { useNotifications } from "@/hooks/use-notifications.tsx";
import { NotificationIcon, relativeTime } from "@/components/notifications/notification-center.tsx";
import type { NotificationKind } from "@/types/notifications.ts";
import { cn } from "@/lib/utils.ts";
import { toast } from "@/lib/system-message.ts";
import { PageContentLoader } from "@/components/ui/page-loader.tsx";
import { Switch } from "@/components/ui/switch.tsx";
import { apiClient } from "@/api/client.ts";

export default function NotificationsPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { notifications, unreadCount, isLoading, markRead, markAllRead, broadcast } = useNotifications();
  const [tab, setTab] = useState<"all" | NotificationKind>("all");
  const [broadcastOpen, setBroadcastOpen] = useState(false);
  const [preferences, setPreferences] = useState<Array<{ eventType: string; severity: string; mandatory: boolean; channels: Array<{ channel: string; enabled: boolean }> }>>([]);
  const [rules, setRules] = useState<Array<{ eventType: string; enabled: boolean; severity: string; mandatory: boolean; recipients: Record<string, unknown>; channels: string[] }>>([]);
  const [form, setForm] = useDraftState("notifications-broadcast", { title: "", message: "", kind: "message" as NotificationKind, action_url: "" });
  const filtered = useMemo(() => tab === "all" ? notifications : notifications.filter((item) => item.kind === tab), [notifications, tab]);
  useEffect(() => {
    void apiClient.get("/notifications/preferences").then((response) => setPreferences(response.data?.data ?? [])).catch(() => undefined);
    if (user?.role === "super_admin") void apiClient.get("/notifications/rules").then((response) => setRules(response.data?.data ?? [])).catch(() => undefined);
  }, [user?.role]);
  const setPreference = async (eventType: string, channel: string, enabled: boolean) => {
    try { await apiClient.patch(`/notifications/preferences/${encodeURIComponent(eventType)}`, { channel, enabled }); setPreferences((current) => current.map((item) => item.eventType === eventType ? { ...item, channels: item.channels.map((entry) => entry.channel === channel ? { ...entry, enabled } : entry) } : item)); }
    catch (error) { toast.error(error instanceof Error ? error.message : "Unable to save notification preference"); }
  };
  const setRule = async (rule: (typeof rules)[number], change: Partial<(typeof rules)[number]>) => {
    const updated = { ...rule, ...change };
    try { await apiClient.patch(`/notifications/rules/${encodeURIComponent(rule.eventType)}`, { enabled: updated.enabled, severity: updated.severity, mandatory: updated.mandatory, recipients: updated.recipients, channels: updated.channels }); setRules((current) => current.map((item) => item.eventType === rule.eventType ? updated : item)); }
    catch (error) { toast.error(error instanceof Error ? error.message : "Unable to save notification rule"); }
  };
  const sendBroadcast = async () => {
    if (!form.title.trim() || !form.message.trim()) return;
    try {
      await broadcast({ ...form, title: form.title.trim(), message: form.message.trim(), action_url: form.action_url.trim() || undefined });
      setBroadcastOpen(false);
      setForm({ title: "", message: "", kind: "message", action_url: "" });
      toast.success("Notification sent to all active users");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to send notification");
    }
  };

  if (isLoading) return <PageContentLoader variant="table" />;

  return <div className="space-y-6 p-4 pb-24 md:p-6 md:pb-6">
    <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between"><div><Badge variant="outline" className="mb-3 border-primary/20 bg-primary/5 text-primary">Workspace updates</Badge><h1 className="text-2xl font-bold tracking-tight">Notifications</h1><p className="mt-1 text-sm text-muted-foreground">Stay current with announcements, alerts and operational activity.</p></div>{user?.role === "super_admin" && <Button onClick={() => setBroadcastOpen(true)}><Plus className="size-4" />Broadcast notification</Button>}</div>
    <div className="flex flex-wrap items-center justify-between gap-3"><div className="flex gap-1 rounded-lg border bg-card p-1"><TabButton active={tab === "all"} onClick={() => setTab("all")}>All <span>{notifications.length}</span></TabButton><TabButton active={tab === "message"} onClick={() => setTab("message")}>Messages <span>{notifications.filter((item) => item.kind === "message").length}</span></TabButton><TabButton active={tab === "alert"} onClick={() => setTab("alert")}>Alerts <span>{notifications.filter((item) => item.kind === "alert").length}</span></TabButton></div>{unreadCount > 0 && <Button variant="outline" size="sm" onClick={() => void markAllRead()}><CheckCheck className="size-4" />Mark all as read</Button>}</div>
    <Card className="overflow-hidden shadow-sm"><CardContent className="p-0">{filtered.length ? <div className="divide-y">{filtered.map((notification) => <button type="button" key={notification.id} onClick={() => { if (!notification.readAt) void markRead(notification.id); if (notification.actionUrl) navigate(notification.actionUrl); }} className={cn("flex w-full items-start gap-4 px-4 py-4 text-left transition hover:bg-primary/5 md:px-6", !notification.readAt && "bg-primary/[0.035]")}><NotificationIcon notification={notification} /><span className="min-w-0 flex-1"><span className="flex flex-wrap items-center gap-2"><span className={cn("text-sm", !notification.readAt ? "font-semibold" : "font-medium")}>{notification.title}</span>{!notification.readAt && <Badge className="bg-primary/10 text-primary hover:bg-primary/10">New</Badge>}</span><span className="mt-1 block max-w-3xl text-sm leading-6 text-muted-foreground">{notification.message}</span><span className="mt-2 block text-[11px] font-medium uppercase tracking-wide text-muted-foreground/75">{notification.kind === "alert" ? "Alert" : "Message"} · {relativeTime(notification.createdAt)}</span></span>{notification.actionUrl && <Send className="mt-1 size-4 shrink-0 text-primary" />}</button>)}</div> : <div className="flex flex-col items-center gap-3 py-20 text-center"><Bell className="size-10 text-primary/35" /><h2 className="font-semibold">No notifications yet</h2><p className="max-w-md text-sm text-muted-foreground">New announcements and operational alerts for your organization will appear here in real time.</p></div>}</CardContent></Card>
    <Card><CardContent className="space-y-4 p-5"><div><h2 className="font-semibold">Your notification preferences</h2><p className="text-sm text-muted-foreground">Critical notifications marked mandatory by an administrator cannot be disabled.</p></div><div className="divide-y">{preferences.map((preference) => <div key={preference.eventType} className="flex flex-col gap-3 py-3 sm:flex-row sm:items-center sm:justify-between"><div><p className="text-sm font-medium">{preference.eventType.replaceAll("_", " ").replaceAll(".", " · ")}</p><p className="text-xs capitalize text-muted-foreground">{preference.severity}{preference.mandatory ? " · mandatory" : ""}</p></div><div className="flex items-center gap-5">{preference.channels.filter((channel) => channel.channel === "email").map((channel) => <label key={channel.channel} className="flex items-center gap-2 text-xs text-muted-foreground">Email <Switch checked={channel.enabled || preference.mandatory} disabled={preference.mandatory} onCheckedChange={(enabled) => void setPreference(preference.eventType, channel.channel, enabled)} /></label>)}</div></div>)}</div></CardContent></Card>
    {user?.role === "super_admin" && <Card><CardContent className="space-y-4 p-5"><div><h2 className="font-semibold">Operational notification rules</h2><p className="text-sm text-muted-foreground">Control which events are active, their severity, and whether critical alerts are enforced.</p></div><div className="divide-y">{rules.map((rule) => <div key={rule.eventType} className="flex flex-wrap items-center gap-3 py-3"><span className="min-w-52 flex-1 text-sm font-medium">{rule.eventType.replaceAll("_", " ").replaceAll(".", " · ")}</span><Switch checked={rule.enabled} onCheckedChange={(enabled) => void setRule(rule, { enabled })} /><select value={rule.severity} onChange={(event) => void setRule(rule, { severity: event.target.value })} className="h-9 rounded-md border bg-background px-2 text-xs"><option value="info">Informational</option><option value="warning">Warning</option><option value="critical">Critical</option></select><label className="flex items-center gap-2 text-xs text-muted-foreground"><Switch checked={rule.mandatory} onCheckedChange={(mandatory) => void setRule(rule, { mandatory })} />Mandatory</label></div>)}</div></CardContent></Card>}
    <Dialog open={broadcastOpen} onOpenChange={setBroadcastOpen}><DialogContent className="max-w-lg"><DialogHeader><DialogTitle>Broadcast notification</DialogTitle></DialogHeader><div className="space-y-4"><div className="space-y-2"><label className="text-sm font-medium">Title</label><Input value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} placeholder="e.g. Scheduled maintenance" /></div><div className="space-y-2"><label className="text-sm font-medium">Message</label><Textarea value={form.message} onChange={(event) => setForm({ ...form, message: event.target.value })} placeholder="Write the update that all active users should receive." /></div><div className="grid gap-4 sm:grid-cols-2"><div className="space-y-2"><label className="text-sm font-medium">Type</label><Select value={form.kind} onValueChange={(kind: NotificationKind) => setForm({ ...form, kind })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="message"><span className="flex items-center gap-2"><MessageCircle className="size-4" />Message</span></SelectItem><SelectItem value="alert"><span className="flex items-center gap-2"><AlertTriangle className="size-4" />Alert</span></SelectItem></SelectContent></Select></div><div className="space-y-2"><label className="text-sm font-medium">Action link <span className="font-normal text-muted-foreground">(optional)</span></label><Input value={form.action_url} onChange={(event) => setForm({ ...form, action_url: event.target.value })} placeholder="/announcements" /></div></div></div><DialogFooter><Button variant="outline" onClick={() => setBroadcastOpen(false)}>Cancel</Button><Button disabled={!form.title.trim() || !form.message.trim()} onClick={() => void sendBroadcast()}><Megaphone className="size-4" />Send to all users</Button></DialogFooter></DialogContent></Dialog>
  </div>;
}

function TabButton({ active, children, onClick }: { active: boolean; children: React.ReactNode; onClick: () => void }) {
  return <button type="button" onClick={onClick} className={cn("rounded-md px-3 py-2 text-xs font-semibold text-muted-foreground transition hover:text-foreground", active && "bg-primary text-primary-foreground shadow-sm")}>{children}</button>;
}
