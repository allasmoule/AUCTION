import type Database from "better-sqlite3";
import type { Server as SocketIOServer } from "socket.io";

export interface AuditInput {
  actorUserId?: number | null;
  actorUsername?: string;
  actorRole?: string;
  action: string;
  entityType?: string;
  entityId?: number | null;
  details?: Record<string, unknown>;
  ipAddress?: string;
}

export function logActivity(db: Database.Database, input: AuditInput): void {
  db.prepare(
    `INSERT INTO activity_logs (actor_user_id, actor_username, actor_role, action, entity_type, entity_id, details_json, ip_address)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    input.actorUserId ?? null,
    input.actorUsername || "system",
    input.actorRole || "system",
    input.action,
    input.entityType || "",
    input.entityId ?? null,
    JSON.stringify(input.details || {}),
    input.ipAddress || ""
  );
}

export interface NotificationInput {
  recipientUserId?: number | null;
  recipientRole?: string | null;
  recipientTeamId?: number | null;
  type: string;
  title: string;
  message: string;
  payload?: Record<string, unknown>;
}

export function createNotification(
  db: Database.Database,
  io: SocketIOServer | null,
  input: NotificationInput
): number {
  const info = db
    .prepare(
      `INSERT INTO notifications (recipient_user_id, recipient_role, recipient_team_id, type, title, message, payload_json)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      input.recipientUserId ?? null,
      input.recipientRole ?? null,
      input.recipientTeamId ?? null,
      input.type,
      input.title,
      input.message,
      JSON.stringify(input.payload || {})
    );

  const notification = {
    id: Number(info.lastInsertRowid),
    recipient_user_id: input.recipientUserId ?? null,
    recipient_role: input.recipientRole ?? null,
    recipient_team_id: input.recipientTeamId ?? null,
    type: input.type,
    title: input.title,
    message: input.message,
    payload: input.payload || {},
    is_read: 0,
    created_at: new Date().toISOString(),
  };

  if (io) {
    if (input.recipientTeamId) {
      io.to(`team:${input.recipientTeamId}`).emit("notification:new", notification);
    } else if (input.recipientUserId) {
      io.to(`user:${input.recipientUserId}`).emit("notification:new", notification);
    } else if (input.recipientRole) {
      io.to(`role:${input.recipientRole}`).emit("notification:new", notification);
    } else {
      io.emit("notification:new", notification);
    }
  }

  return notification.id;
}
