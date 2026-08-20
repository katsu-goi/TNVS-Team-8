import { createHandler, AuthContext, RouteParams } from "../_shared/guard.ts";
import { jsonResponse } from "../_shared/cors.ts";
import { ok, fail } from "../_shared/envelope.ts";
import { adminDb } from "../_shared/db.ts";

const db = adminDb();

function notFound(message: string) {
  return jsonResponse(fail(message, "NOT_FOUND"), 404);
}

type NotifRow = {
  id: string;
  title: string;
  message: string | null;
  type: string;
  is_read: boolean;
  related_entity_type: string | null;
  related_entity_id: string | null;
  created_at: string;
};

function notifDto(n: NotifRow): Record<string, unknown> {
  return {
    id: n.id,
    title: n.title,
    message: n.message,
    type: n.type,
    read: n.is_read,
    relatedEntityType: n.related_entity_type,
    relatedEntityId: n.related_entity_id,
    createdAt: n.created_at,
  };
}

async function resolveOwned(id: string, userId: string): Promise<NotifRow | null> {
  const { data, error } = await db
    .from("employee_notifications")
    .select("*")
    .eq("id", id)
    .eq("recipient_id", userId)
    .eq("is_deleted", false)
    .maybeSingle();
  if (error) throw new Error(`notification lookup failed: ${error.message}`);
  return data ? (data as unknown as NotifRow) : null;
}

async function handleList(ctx: AuthContext | null, _req: Request, _body: unknown, _p: RouteParams) {
  const { data, error } = await db
    .from("employee_notifications")
    .select("*")
    .eq("recipient_id", ctx!.userId)
    .eq("is_deleted", false)
    .order("created_at", { ascending: false });
  if (error) throw new Error(`notifications load failed: ${error.message}`);
  return jsonResponse(ok((data as unknown as NotifRow[]).map(notifDto), "Notifications retrieved"), 200);
}

async function handleUnreadCount(ctx: AuthContext | null, _req: Request, _body: unknown, _p: RouteParams) {
  const { count, error } = await db
    .from("employee_notifications")
    .select("id", { count: "exact", head: true })
    .eq("recipient_id", ctx!.userId)
    .eq("is_read", false)
    .eq("is_deleted", false);
  if (error) throw new Error(`notifications count failed: ${error.message}`);
  return jsonResponse(ok(count ?? 0, "Unread count retrieved"), 200);
}

async function handleMarkRead(ctx: AuthContext | null, _req: Request, _body: unknown, p: RouteParams) {
  const n = await resolveOwned(p.id, ctx!.userId);
  if (!n) return notFound(`EmployeeNotification not found with id: ${p.id}`);
  const { data, error } = await db
    .from("employee_notifications")
    .update({ is_read: true })
    .eq("id", p.id)
    .select("*")
    .single();
  if (error) throw new Error(`notification update failed: ${error.message}`);
  return jsonResponse(ok(notifDto(data as unknown as NotifRow), "Notification marked as read"), 200);
}

async function handleMarkAllRead(ctx: AuthContext | null, _req: Request, _body: unknown, _p: RouteParams) {
  const { error } = await db
    .from("employee_notifications")
    .update({ is_read: true })
    .eq("recipient_id", ctx!.userId)
    .eq("is_read", false)
    .eq("is_deleted", false);
  if (error) throw new Error(`notifications update failed: ${error.message}`);
  return jsonResponse(ok("All notifications marked as read"), 200);
}

async function handleDismiss(ctx: AuthContext | null, _req: Request, _body: unknown, p: RouteParams) {
  const n = await resolveOwned(p.id, ctx!.userId);
  if (!n) return notFound(`EmployeeNotification not found with id: ${p.id}`);
  const { error } = await db
    .from("employee_notifications")
    .update({ is_deleted: true, deleted_at: new Date().toISOString(), deleted_by: ctx!.email })
    .eq("id", p.id);
  if (error) throw new Error(`notification dismiss failed: ${error.message}`);
  return jsonResponse(ok("Notification dismissed"), 200);
}

const routes = [
  { method: "GET", path: "/notifications", guard: { kind: "auth" }, handler: handleList },
  { method: "GET", path: "/notifications/unread-count", guard: { kind: "auth" }, handler: handleUnreadCount },
  { method: "POST", path: "/notifications/:id/read", guard: { kind: "auth" }, handler: handleMarkRead },
  { method: "POST", path: "/notifications/read-all", guard: { kind: "auth" }, handler: handleMarkAllRead },
  { method: "POST", path: "/notifications/:id/dismiss", guard: { kind: "auth" }, handler: handleDismiss },
] as const;

Deno.serve(createHandler(routes as never, { name: "notifications" }));