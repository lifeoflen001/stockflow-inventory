import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AlertTriangle, Bell, CheckCheck, Megaphone, MessageCircle, Package } from "lucide-react";
import { Badge } from "@/components/ui/badge.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover.tsx";
import { useNotifications } from "@/hooks/use-notifications.tsx";
import type { AppNotification, NotificationKind } from "@/types/notifications.ts";
import { cn } from "@/lib/utils.ts";

export function relativeTime(value?: string | null) {
  if (!value) return "Just now";
  const seconds = Math.max(1, Math.floor((Date.now() - new Date(value).getTime()) / 1000));
  if (seconds < 60) return "Just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} ${minutes === 1 ? "min" : "mins"} ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} ${hours === 1 ? "hr" : "hrs"} ago`;
  const days = Math.floor(hours / 24);
  return `${days} ${days === 1 ? "day" : "days"} ago`;
}

export function NotificationIcon({ notification }: { notification: AppNotification }) {
  const Icon = notification.icon === "alert" || notification.kind === "alert" ? AlertTriangle : notification.icon === "megaphone" ? Megaphone : notification.icon === "package" ? Package : MessageCircle;
  const severity = notification.severity ?? (notification.kind === "alert" ? "warning" : "info");
  return <span className={cn("flex size-9 shrink-0 items-center justify-center rounded-full", severity === "critical" ? "bg-rose-50 text-rose-600 dark:bg-rose-950/40" : severity === "warning" ? "bg-amber-50 text-amber-600 dark:bg-amber-950/40" : "bg-primary/10 text-primary")}><Icon className="size-4" /></span>;
}

function NotificationRows({ items, onOpen }: { items: AppNotification[]; onOpen: (item: AppNotification) => void }) {
  if (!items.length) return <div className="flex flex-col items-center gap-2 px-5 py-12 text-center text-sm text-muted-foreground"><Bell className="size-8 text-primary/40" /><p>No notifications here.</p></div>;
  return <div className="max-h-[22rem] overflow-y-auto">{items.map((notification) => <button type="button" key={notification.id} onClick={() => onOpen(notification)} className={cn("flex w-full items-start gap-3 border-b px-4 py-3 text-left transition hover:bg-primary/5", !notification.readAt && "bg-primary/[0.035]")}><NotificationIcon notification={notification} /><span className="min-w-0 flex-1"><span className="flex items-start justify-between gap-2"><span className={cn("text-xs leading-5", !notification.readAt ? "font-semibold text-foreground" : "font-medium text-foreground/80")}>{notification.title}</span>{!notification.readAt && <span className="mt-1 size-2 shrink-0 rounded-full bg-primary" />}</span><span className="mt-0.5 block text-xs leading-5 text-muted-foreground">{notification.message}</span><span className="mt-1 block text-[10px] font-medium uppercase tracking-wide text-muted-foreground/80">{relativeTime(notification.createdAt)}</span></span></button>)}</div>;
}

export function NotificationCenter() {
  const navigate = useNavigate();
  const { notifications, unreadCount, markRead, markAllRead } = useNotifications();
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<"all" | NotificationKind>("all");
  const [removedIds, setRemovedIds] = useState<Set<string>>(() => new Set());
  const visibleNotifications = useMemo(() => notifications.filter((item) => !removedIds.has(item.id)), [notifications, removedIds]);
  const filtered = useMemo(() => tab === "all" ? visibleNotifications : visibleNotifications.filter((item) => item.kind === tab), [visibleNotifications, tab]);
  const openNotification = async (notification: AppNotification) => {
    const wasUnread = !notification.readAt;
    if (wasUnread) setRemovedIds((current) => new Set(current).add(notification.id));
    try {
      if (wasUnread) await markRead(notification.id);
    } catch {
      if (wasUnread) setRemovedIds((current) => { const next = new Set(current); next.delete(notification.id); return next; });
      return;
    }
    setOpen(false);
    if (notification.actionUrl) navigate(notification.actionUrl);
  };
  const markAllAndRemove = async () => {
    const unreadIds = notifications.filter((item) => !item.readAt && !removedIds.has(item.id)).map((item) => item.id);
    if (!unreadIds.length) return;
    setRemovedIds((current) => new Set([...current, ...unreadIds]));
    try {
      await markAllRead();
    } catch {
      setRemovedIds((current) => { const next = new Set(current); unreadIds.forEach((id) => next.delete(id)); return next; });
    }
  };

  return <Popover open={open} onOpenChange={setOpen}><PopoverTrigger asChild><Button variant="ghost" size="icon" aria-label="Notifications" className="relative"><Bell className="size-4" />{unreadCount > 0 && <Badge className="absolute -right-0.5 -top-0.5 flex size-4 items-center justify-center rounded-full bg-primary p-0 text-[9px]">{unreadCount > 99 ? "99+" : unreadCount}</Badge>}</Button></PopoverTrigger><PopoverContent align="end" className="w-[min(390px,calc(100vw-1.5rem))] overflow-hidden p-0 shadow-xl"><div className="bg-sidebar px-4 pb-0 pt-4 text-sidebar-foreground"><div className="flex items-center justify-between"><div><p className="text-sm font-bold">Notifications</p><p className="mt-0.5 text-[11px] text-sidebar-foreground/65">Updates from your workspace</p></div>{unreadCount > 0 && <Badge className="bg-sidebar-accent text-sidebar-accent-foreground hover:bg-sidebar-accent">{unreadCount} New</Badge>}</div><div className="mt-4 flex gap-1"><TabButton active={tab === "all"} onClick={() => setTab("all")}>All ({visibleNotifications.length})</TabButton><TabButton active={tab === "message"} onClick={() => setTab("message")}>Messages</TabButton><TabButton active={tab === "alert"} onClick={() => setTab("alert")}>Alerts</TabButton></div></div><NotificationRows items={filtered.slice(0, 8)} onOpen={openNotification} /><div className="flex items-center justify-between border-t bg-card px-4 py-3"><Button variant="link" size="sm" className="h-auto px-0 text-xs" onClick={() => { setOpen(false); navigate("/notifications"); }}>View All Notifications <span aria-hidden="true">→</span></Button>{unreadCount > 0 && <Button variant="ghost" size="sm" className="h-7 text-[11px]" onClick={() => void markAllAndRemove()}><CheckCheck className="size-3.5" />Mark read</Button>}</div></PopoverContent></Popover>;
}

function TabButton({ active, children, onClick }: { active: boolean; children: React.ReactNode; onClick: () => void }) {
  return <button type="button" onClick={onClick} className={cn("rounded-t-md px-3 py-2 text-xs font-semibold text-sidebar-foreground/60 transition hover:text-sidebar-foreground", active && "bg-sidebar-accent text-sidebar-accent-foreground")}>{children}</button>;
}
