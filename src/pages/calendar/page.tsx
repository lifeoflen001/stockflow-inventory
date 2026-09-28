import { useCallback, useEffect, useMemo, useState } from "react";
import { addDays, addMonths, addWeeks, eachDayOfInterval, endOfMonth, endOfWeek, format, isSameDay, isSameMonth, startOfMonth, startOfWeek, subMonths, subWeeks } from "date-fns";
import { Banknote, CalendarDays, CheckCircle2, ChevronLeft, ChevronRight, ClipboardList, ShoppingCart, Truck, UsersRound, type LucideIcon } from "lucide-react";
import { apiClient, getApiErrorMessage } from "@/api/client.ts";
import { toast } from "@/lib/system-message.ts";
import { Button } from "@/components/ui/button.tsx";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card.tsx";
import { cn } from "@/lib/utils.ts";
import { PageContentLoader } from "@/components/ui/page-loader.tsx";

type EventType = "meeting" | "requisition" | "approval" | "purchase_order" | "delivery" | "payment";
type CalendarEvent = { id: string; title: string; type: EventType; startsAt: string; endsAt: string | null; allDay: boolean; description?: string | null };

const eventLabels: Record<EventType, string> = {
  meeting: "Meetings",
  requisition: "Requisitions",
  approval: "Approvals",
  purchase_order: "Purchase orders",
  delivery: "Deliveries",
  payment: "Payments",
};

const styles: Record<EventType, { dot: string; item: string; text: string; icon: LucideIcon }> = {
  meeting: { dot: "bg-blue-600", item: "border-blue-200 bg-blue-50 dark:border-blue-900 dark:bg-blue-950/40", text: "text-blue-700 dark:text-blue-300", icon: UsersRound },
  requisition: { dot: "bg-violet-600", item: "border-violet-200 bg-violet-50 dark:border-violet-900 dark:bg-violet-950/40", text: "text-violet-700 dark:text-violet-300", icon: ClipboardList },
  approval: { dot: "bg-amber-600", item: "border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/40", text: "text-amber-700 dark:text-amber-300", icon: CheckCircle2 },
  purchase_order: { dot: "bg-indigo-600", item: "border-indigo-200 bg-indigo-50 dark:border-indigo-900 dark:bg-indigo-950/40", text: "text-indigo-700 dark:text-indigo-300", icon: ShoppingCart },
  delivery: { dot: "bg-emerald-600", item: "border-emerald-200 bg-emerald-50 dark:border-emerald-900 dark:bg-emerald-950/40", text: "text-emerald-700 dark:text-emerald-300", icon: Truck },
  payment: { dot: "bg-rose-600", item: "border-rose-200 bg-rose-50 dark:border-rose-900 dark:bg-rose-950/40", text: "text-rose-700 dark:text-rose-300", icon: Banknote },
};

export default function CalendarPage() {
  const [cursor, setCursor] = useState(new Date());
  const [view, setView] = useState<"month" | "week" | "day">("month");
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [upcoming, setUpcoming] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const range = useMemo(() => view === "month"
    ? { from: startOfWeek(startOfMonth(cursor)), to: endOfWeek(endOfMonth(cursor)) }
    : view === "week"
      ? { from: startOfWeek(cursor), to: endOfWeek(cursor) }
      : { from: cursor, to: cursor }, [cursor, view]);
  const days = useMemo(() => eachDayOfInterval({ start: range.from, end: range.to }), [range]);
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await apiClient.get<{ data: { events: CalendarEvent[]; upcoming: CalendarEvent[] } }>("/calendar", {
        params: { from: format(range.from, "yyyy-MM-dd"), to: format(range.to, "yyyy-MM-dd") },
      });
      setEvents(data.data.events);
      setUpcoming(data.data.upcoming);
    } catch (cause) {
      toast.error(getApiErrorMessage(cause, "Unable to load calendar"));
    } finally {
      setLoading(false);
    }
  }, [range]);
  useEffect(() => { void load(); }, [load]);

  const navigate = (direction: number) => setCursor((date) => view === "month"
    ? (direction > 0 ? addMonths(date, 1) : subMonths(date, 1))
    : view === "week"
      ? (direction > 0 ? addWeeks(date, 1) : subWeeks(date, 1))
      : addDays(date, direction));
  const title = view === "month"
    ? format(cursor, "MMMM yyyy")
    : view === "week"
      ? `${format(range.from, "MMM d")} – ${format(range.to, "MMM d, yyyy")}`
      : format(cursor, "EEEE, MMMM d, yyyy");
  const counts = (Object.keys(styles) as EventType[]).map((type) => [type, events.filter((event) => event.type === type).length] as const);
  if (loading) return <PageContentLoader variant="detail" />;

  return <div className="space-y-4 p-6 pb-24 md:pb-6">
    <div>
      <h2 className="text-xl font-bold">Calendar</h2>
      <p className="text-sm text-muted-foreground">Procurement dates and activities for your account and role.</p>
    </div>
    <div className="rounded-xl border bg-muted/20 p-5">
      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
        <Card className="min-w-0">
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2 border-b px-4 py-3 text-xs text-muted-foreground">
            <span>Legend:</span>
            {(Object.keys(styles) as EventType[]).map((type) => <span key={type} className="flex items-center gap-1.5"><span className={cn("size-2.5 rounded-full", styles[type].dot)} />{eventLabels[type]}</span>)}
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3 p-4">
            <div className="flex gap-2">
              <div className="flex overflow-hidden rounded-md border">
                <Button variant="ghost" size="icon" className="rounded-none" onClick={() => navigate(-1)}><ChevronLeft className="size-4" /></Button>
                <Button variant="ghost" size="icon" className="rounded-none border-l" onClick={() => navigate(1)}><ChevronRight className="size-4" /></Button>
              </div>
              <Button variant="secondary" onClick={() => setCursor(new Date())}>today</Button>
            </div>
            <h3 className="text-xl font-semibold md:text-2xl">{title}</h3>
            <div className="flex overflow-hidden rounded-md border">
              {(["month", "week", "day"] as const).map((mode) => <Button key={mode} variant={view === mode ? "default" : "ghost"} size="sm" className="rounded-none capitalize" onClick={() => setView(mode)}>{mode}</Button>)}
            </div>
          </div>
          <CalendarGrid view={view} days={days} cursor={cursor} events={events} />
        </Card>
        <div className="space-y-4">
          <Card>
            <CardHeader className="border-b py-4"><CardTitle className="flex items-center gap-2 text-sm"><CalendarDays className="size-4 text-primary" />Upcoming Procurement</CardTitle></CardHeader>
            <CardContent className="max-h-[335px] overflow-y-auto p-0">
              {upcoming.length ? upcoming.map((event) => <Upcoming key={event.id} event={event} />) : <div className="px-5 py-12 text-center"><CalendarDays className="mx-auto size-8 text-muted-foreground" /><p className="mt-3 text-sm font-medium">No upcoming procurement activity</p><p className="text-xs text-muted-foreground">Approvals, deliveries and payment tasks will appear here.</p></div>}
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="border-b py-4"><CardTitle className="text-sm">This {view === "day" ? "Day" : view === "week" ? "Week" : "Month"}</CardTitle></CardHeader>
            <CardContent className="space-y-3 pt-4">
              {counts.map(([type, count]) => <div key={type} className="flex justify-between text-sm text-muted-foreground"><span>{eventLabels[type]}</span><span className={styles[type].text}>{count}</span></div>)}
              <div className="flex justify-between border-t pt-3 text-sm font-medium"><span>Total activities</span><span>{events.length}</span></div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  </div>;
}

function CalendarGrid({ view, days, cursor, events }: { view: "month" | "week" | "day"; days: Date[]; cursor: Date; events: CalendarEvent[] }) {
  if (view === "day") return <div className="min-h-[520px] border-t p-4"><DayEvents day={cursor} events={events} /></div>;
  return <div>
    <div className="grid grid-cols-7 border-t">{["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => <div key={day} className="border-b border-r py-2 text-center text-xs font-semibold last:border-r-0">{day}</div>)}</div>
    <div className="grid grid-cols-7">{days.map((day) => {
      const dayEvents = events.filter((event) => isSameDay(new Date(event.startsAt), day));
      return <div key={day.toISOString()} className={cn("min-h-28 border-b border-r p-1.5 last:border-r-0", view === "month" && !isSameMonth(day, cursor) && "bg-muted/25 text-muted-foreground", isSameDay(day, new Date()) && "bg-amber-50/70 dark:bg-amber-950/20")}>
        <div className="mb-1 text-right text-xs">{format(day, "d")}</div>
        <div className="space-y-1">{dayEvents.slice(0, 3).map((event) => <EventPill key={event.id} event={event} />)}{dayEvents.length > 3 && <p className="px-1 text-[10px] text-muted-foreground">+{dayEvents.length - 3} more</p>}</div>
      </div>;
    })}</div>
  </div>;
}

function DayEvents({ day, events }: { day: Date; events: CalendarEvent[] }) {
  const matches = events.filter((event) => isSameDay(new Date(event.startsAt), day));
  return matches.length ? <div className="space-y-2">{matches.map((event) => <div key={event.id} className={cn("rounded-md border p-3", styles[event.type].item)}><p className={cn("font-medium", styles[event.type].text)}>{event.title}</p><p className="mt-1 text-xs text-muted-foreground">{event.allDay ? "All day" : format(new Date(event.startsAt), "h:mm a")}</p>{event.description && <p className="mt-1 text-xs text-muted-foreground">{event.description}</p>}</div>)}</div> : <div className="py-24 text-center text-sm text-muted-foreground">No events scheduled for this day.</div>;
}

function EventPill({ event }: { event: CalendarEvent }) { return <div title={event.title} className={cn("truncate rounded-sm border px-1.5 py-1 text-[10px]", styles[event.type].item, styles[event.type].text)}>{event.title}</div>; }
function Upcoming({ event }: { event: CalendarEvent }) { const Icon = styles[event.type].icon; return <div className="flex gap-3 border-b p-4 last:border-0"><div className={cn("flex size-9 shrink-0 items-center justify-center rounded-lg border", styles[event.type].item)}><Icon className={cn("size-4", styles[event.type].text)} /></div><div className="min-w-0"><p className="truncate text-sm font-medium">{event.title}</p><p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground"><CalendarDays className="size-3" />{format(new Date(event.startsAt), "yyyy-MM-dd")}</p>{event.description && <p className="mt-1 truncate text-xs text-muted-foreground">{event.description}</p>}</div></div>; }
