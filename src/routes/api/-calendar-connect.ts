/**
 * Calendar connection API routes.
 *
 * Handles: listing, connecting, and disconnecting calendar services.
 */
import { json } from "@tanstack/react-start";
import { createAPIFileRoute } from "@tanstack/react-start/api";
import { sql } from "~/db";
import { getSessionFromToken, getUserById, parseSessionCookie } from "~/lib/auth";
import { getGoogleAuthUrl } from "~/lib/calendar/google";
import { getNotionAuthUrl } from "~/lib/calendar/notion";

export const APIRoute = createAPIFileRoute("/api/calendar/connect")({
  // GET /api/calendar/connect — list connected calendars
  GET: async ({ request }) => {
    const token = parseSessionCookie(request.headers.get("cookie"));
    if (!token) {
      return json({ authenticated: false, connections: [] }, { status: 401 });
    }

    const session = await getSessionFromToken(token);
    if (!session) {
      return json({ authenticated: false, connections: [] }, { status: 401 });
    }

    const connections = await sql()`
      SELECT id, provider, calendar_name, calendar_id, is_active, created_at
      FROM calendar_connections
      WHERE user_id = ${session.userId}
      ORDER BY created_at DESC
    `;

    return json({
      connections: connections.map((c: Record<string, unknown>) => ({
        ...c,
        created_at: String(c.created_at),
      })),
    });
  },

  // POST /api/calendar/connect — initiate OAuth or disconnect
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
      action: string;
      provider?: string;
      connectionId?: string;
    };

    // ── Initiate OAuth for a provider ──
    if (body.action === "connect" && body.provider) {
      let authUrl = "";

      switch (body.provider) {
        case "google":
          authUrl = getGoogleAuthUrl(session.userId);
          break;
        case "notion":
          authUrl = getNotionAuthUrl(session.userId);
          break;
        case "apple":
          // Apple Calendar uses CalDAV with app-specific passwords
          // We'll handle this via a form to enter credentials
          return json({
            requiresInput: true,
            provider: "apple",
            fields: [
              { name: "username", label: "Apple ID email", type: "email" },
              { name: "appPassword", label: "App-specific password", type: "password" },
              { name: "calendarUrl", label: "CalDAV URL (optional)", type: "url", default: "https://caldav.icloud.com" },
            ],
          });
        default:
          return json({ error: `Unknown provider: ${body.provider}` }, { status: 400 });
      }

      return json({ authUrl });
    }

    // ── Connect Apple Calendar via CalDAV credentials ──
    if (body.action === "connect-apple" && body.provider === "apple") {
      const data = body as Record<string, unknown>;
      const username = String(data.username || "");
      const appPassword = String(data.appPassword || "");
      const calendarUrl = String(data.calendarUrl || "https://caldav.icloud.com");

      if (!username || !appPassword) {
        return json({ error: "Apple ID and app-specific password are required" }, { status: 400 });
      }

      // Store the connection
      await sql()`
        INSERT INTO calendar_connections (user_id, provider, access_token, refresh_token, calendar_id, calendar_name, is_active)
        VALUES (${session.userId}, 'apple', ${username}, ${appPassword}, ${calendarUrl}, 'iCloud Calendar', true)
        ON CONFLICT (user_id, provider) DO UPDATE SET
          access_token = ${username},
          refresh_token = ${appPassword},
          calendar_id = ${calendarUrl},
          is_active = true,
          updated_at = now()
      `;

      return json({ success: true, message: "Apple Calendar connected successfully" });
    }

    // ── Disconnect a calendar ──
    if (body.action === "disconnect" && body.connectionId) {
      await sql()`
        UPDATE calendar_connections
        SET is_active = false, updated_at = now()
        WHERE id = ${body.connectionId} AND user_id = ${session.userId}
      `;

      return json({ success: true });
    }

    // ── Delete a calendar connection ──
    if (body.action === "delete" && body.connectionId) {
      await sql()`
        DELETE FROM calendar_connections
        WHERE id = ${body.connectionId} AND user_id = ${session.userId}
      `;

      return json({ success: true });
    }

    return json({ error: "Invalid action" }, { status: 400 });
  },
});