export type NotificationKind = "message" | "alert";
export type NotificationSeverity = "info" | "warning" | "critical";

export interface AppNotification {
  id: string;
  kind: NotificationKind;
  eventType?: string | null;
  severity?: NotificationSeverity;
  title: string;
  message: string;
  actionUrl?: string | null;
  icon?: string | null;
  metadata?: Record<string, unknown>;
  relatedType?: string | null;
  relatedId?: string | null;
  deliveryStatus?: "pending" | "delivered" | "failed" | "dead" | null;
  readAt?: string | null;
  createdAt?: string | null;
}
