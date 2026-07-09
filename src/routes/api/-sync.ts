/**
 * Sync API route — triggers calendar sync operations.
 */
import { json } from "@tanstack/react-start";
import { createAPIFileRoute } from "@tanstack/react-start/api";
import { sql } from "~/db";
import { getSessionFromToken, parseSessionCookie } from "~/lib/auth";
import { syncToAllCalendars } from "~/lib/calendar/sync-engine";

export const APIRoute = createAPIFileRoute("/api/sync")({
  // GET /api/sync — get sync history
  GET: async ({ request }) => {
    const token = parseSessionCookie(request.headers.get("cookie"));
    if (!token) {
      return json({ error: "Not authenticated" }, { status: 401 });
    }

    const session = await getSessionFromToken(token);
    if (!session) {
      return json({ error: "Not authenticated" }, { status: 401 });
    }

    const syncs = await sql()`
      SELECT sh.id, sh.status, sh.images_uploaded, sh.events_parsed, sh.events_synced,
             sh.started_at, sh.completed_at, sh.error_message,
             cc.provider
      FROM sync_history sh
      LEFT JOIN calendar_connections cc ON cc.id = sh.connection_id
      WHERE sh.user_id = ${session.userId}
      ORDER BY sh.started_at DESC
      LIMIT 20
    `;

    return json({
      syncs: syncs.map((s: Record<string, unknown>) => ({
        ...s,
        started_at: String(s.started_at),
        completed_at: s.completed_at ? String(s.completed_at) : null,
      })),
    });
  },

  // POST /api/sync — trigger a sync for a parsed event
  POST: async ({ request }) => {
    const token = parseSessionCookie(request.headers.get("cookie"));
    if (!token) {
      return json({ error: "Not authenticated" }, { status: 401 });
    }

    const session = await getSessionFromToken(token);
    if (!session) {
      return json({ error: "Not authenticated" }, { status: 401 });
    }

    const body = (await request.json()) as {
      eventId?: string;
      action?: string;
    };

    // Check usage limits (free tier: 10 syncs/month)
    const currentMonth = await sql()`
      SELECT COUNT(*) as count
      FROM sync_history
      WHERE user_id = ${session.userId}
        AND started_at >= date_trunc('month', now())
    `;

    const count = (currentMonth[0] as Record<string, unknown>).count as number;

    // Get user's subscription tier
    const userRows = await sql()`
      SELECT subscription_tier FROM users WHERE id = ${session.userId}
    `;
    const tier = String((userRows[0] as Record<string, unknown>).subscription_tier);

    if (tier === "free" && count >= 10) {
      return json({
        error: "Monthly sync limit reached. Upgrade to Pro for unlimited syncs.",
        upgradeRequired: true,
      }, { status: 403 });
    }

    if (body.action === "sync-event" && body.eventId) {
      // Get the parsed event
      const events = await sql()`
        SELECT id, user_id, title, description, start_time, end_time,
               is_all_day, location, recurrence_rule, source_image_url, confidence_score
        FROM parsed_events
        WHERE id = ${body.eventId} AND user_id = ${session.userId}
      `;

      if (events.length === 0) {
        return json({ error: "Event not found" }, { status: 404 });
      }

      const event = events[0] as Record<string, unknown>;

      const results = await syncToAllCalendars({
        id: String(event.id),
        userId: String(event.user_id),
        title: String(event.title),
        description: String(event.description || ""),
        startTime: String(event.start_time),
        endTime: event.end_time ? String(event.end_time) : undefined,
        isAllDay: Boolean(event.is_all_day),
        location: String(event.location || ""),
        recurrenceRule: String(event.recurrence_rule || ""),
        sourceImageUrl: String(event.source_image_url || ""),
        confidenceScore: Number(event.confidence_score || 0),
      });

      return json({ results });
    }

    if (body.action === "sync-all") {
      // Get all pending parsed events
      const events = await sql()`
        SELECT id, user_id, title, description, start_time, end_time,
               is_all_day, location, recurrence_rule, source_image_url, confidence_score
        FROM parsed_events
        WHERE user_id = ${session.userId} AND status = 'pending'
        ORDER BY created_at ASC
        LIMIT 10
      `;

      const allResults = [];

      for (const event of events as Array<Record<string, unknown>>) {
        const results = await syncToAllCalendars({
          id: String(event.id),
          userId: String(event.user_id),
          title: String(event.title),
          description: String(event.description || ""),
          startTime: String(event.start_time),
          endTime: event.end_time ? String(event.end_time) : undefined,
          isAllDay: Boolean(event.is_all_day),
          location: String(event.location || ""),
          recurrenceRule: String(event.recurrence_rule || ""),
          sourceImageUrl: String(event.source_image_url || ""),
          confidenceScore: Number(event.confidence_score || 0),
        });
        allResults.push(...results);
      }

      return json({ results: allResults, count: events.length });
    }

    return json({ error: "Invalid action" }, { status: 400 });
  },
});