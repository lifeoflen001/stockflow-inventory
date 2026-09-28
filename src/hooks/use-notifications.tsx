import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { apiClient } from "@/api/client.ts";
import { useAuth } from "@/hooks/use-auth.ts";
import type { AppNotification, NotificationKind } from "@/types/notifications.ts";

type NotificationResponse = { data: AppNotification[]; meta?: { unread_count?: number } };
type NotificationContextValue = {
  notifications: AppNotification[];
  unreadCount: number;
  isLoading: boolean;
  markRead: (id: string) => Promise<void>;
  markAllRead: () => Promise<void>;
  broadcast: (payload: { title: string; message: string; kind: NotificationKind; action_url?: string }) => Promise<void>;
};

const NotificationContext = createContext<NotificationContextValue | null>(null);

export function NotificationsProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const lastId = useRef(0);
  const streamConnected = useRef(false);

  const load = useCallback(async () => {
    if (!user) return;
    try {
      const { data } = await apiClient.get<NotificationResponse>("/notifications", { params: { limit: 50 } });
      setNotifications(data.data ?? []);
      setUnreadCount(data.meta?.unread_count ?? data.data.filter((item) => !item.readAt).length);
      const newest = data.data.reduce((max, item) => Math.max(max, Number(item.id) || 0), 0);
      if (newest > lastId.current) lastId.current = newest;
    } catch (error) {
      console.error("Unable to load notifications", error);
    } finally {
      setIsLoading(false);
    }
  }, [user]);

  useEffect(() => {
    setNotifications([]);
    setUnreadCount(0);
    setIsLoading(Boolean(user));
    lastId.current = 0;
    streamConnected.current = false;
    if (!user) return;
    void load();
    const refreshTimer = window.setInterval(() => {
      if (document.visibilityState === "visible" && !streamConnected.current) void load();
    }, 30_000);
    return () => window.clearInterval(refreshTimer);
  }, [load, user]);

  useEffect(() => {
    if (!user) return;
    const token = window.localStorage.getItem("auth_token");
    if (!token) return;
    let cancelled = false;
    let reconnectTimer: number | undefined;
    let reconnectDelay = 1_000;

    const streamUrl = () => {
      const base = String(apiClient.defaults.baseURL ?? "/api/v1");
      return new URL(`${base.replace(/\/$/, "")}/notifications/stream`, window.location.origin);
    };
    const handleNotification = (notification: AppNotification) => {
      lastId.current = Math.max(lastId.current, Number(notification.id) || 0);
      setNotifications((current) => [notification, ...current.filter((item) => item.id !== notification.id)].slice(0, 50));
      if (!notification.readAt) setUnreadCount((count) => count + 1);
      window.dispatchEvent(new CustomEvent("stockflow:notification", { detail: notification }));
    };
    const readStream = async () => {
      try {
        const response = await fetch(`${streamUrl()}?after=${lastId.current}`, { headers: { Accept: "text/event-stream", Authorization: `Bearer ${token}` } });
        if (!response.ok || !response.body) throw new Error(`Notification stream returned ${response.status}`);
        streamConnected.current = true;
        reconnectDelay = 1_000;
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        while (!cancelled) {
          const chunk = await reader.read();
          if (chunk.done) break;
          buffer += decoder.decode(chunk.value, { stream: true });
          const blocks = buffer.split("\n\n");
          buffer = blocks.pop() ?? "";
          for (const block of blocks) {
            const line = block.split("\n").find((value) => value.startsWith("data: "));
            if (line) {
              try { handleNotification(JSON.parse(line.slice(6)) as AppNotification); } catch { /* Ignore malformed heartbeat data. */ }
            }
          }
        }
      } catch (error) {
        if (!cancelled) console.error("Notification stream disconnected", error);
      } finally {
        streamConnected.current = false;
        if (!cancelled) {
          const delay = reconnectDelay;
          reconnectDelay = Math.min(reconnectDelay * 2, 30_000);
          reconnectTimer = window.setTimeout(() => void readStream(), delay);
        }
      }
    };
    void readStream();
    return () => { cancelled = true; if (reconnectTimer) window.clearTimeout(reconnectTimer); };
  }, [user]);

  const markRead = useCallback(async (id: string) => {
    await apiClient.patch(`/notifications/${encodeURIComponent(id)}/read`);
    setNotifications((current) => current.map((item) => item.id === id ? { ...item, readAt: item.readAt ?? new Date().toISOString() } : item));
    setUnreadCount((count) => Math.max(0, count - 1));
  }, []);

  const markAllRead = useCallback(async () => {
    await apiClient.post("/notifications/read-all");
    setNotifications((current) => current.map((item) => ({ ...item, readAt: item.readAt ?? new Date().toISOString() })));
    setUnreadCount(0);
  }, []);

  const broadcast = useCallback(async (payload: { title: string; message: string; kind: NotificationKind; action_url?: string }) => {
    await apiClient.post("/notifications/broadcast", payload);
  }, []);

  const value = useMemo(() => ({ notifications, unreadCount, isLoading, markRead, markAllRead, broadcast }), [broadcast, isLoading, markAllRead, markRead, notifications, unreadCount]);
  return <NotificationContext.Provider value={value}>{children}</NotificationContext.Provider>;
}

export function useNotifications() {
  const context = useContext(NotificationContext);
  if (!context) throw new Error("useNotifications must be used inside NotificationsProvider");
  return context;
}
