/**
 * Google Calendar integration for PlannerBridge.
 *
 * Handles OAuth 2.0 flow, event creation, and calendar listing
 * via the Google Calendar API v3.
 */
import { sql } from "~/db";

// ─── Types ────────────────────────────────────────────────────────────────

export interface GoogleCalendarEvent {
  id?: string;
  summary: string;
  description?: string;
  start: { dateTime: string; timeZone?: string };
  end: { dateTime: string; timeZone?: string };
  location?: string;
  recurrence?: string[];
  source?: { title: string; url: string };
}

export interface GoogleCalendar {
  id: string;
  summary: string;
  description?: string;
  primary?: boolean;
}

// ─── OAuth Configuration ──────────────────────────────────────────────────

const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_CALENDAR_API = "https://www.googleapis.com/calendar/v3";

// These are set via environment variables by the owner
const GOOGLE_CLIENT_ID = () => process.env.GOOGLE_CLIENT_ID || "";
const GOOGLE_CLIENT_SECRET = () => process.env.GOOGLE_CLIENT_SECRET || "";
const GOOGLE_REDIRECT_URI = () =>
  process.env.GOOGLE_REDIRECT_URI || `${getBaseUrl()}/api/calendar/google/callback`;

function getBaseUrl(): string {
  // In preview, the site runs on port 3000
  // In production, use the public URL
  return process.env.PUBLIC_URL || `http://localhost:3000`;
}

// ─── OAuth Flow ───────────────────────────────────────────────────────────

/**
 * Build the Google OAuth authorization URL.
 */
export function getGoogleAuthUrl(userId: string): string {
  const params = new URLSearchParams({
    client_id: GOOGLE_CLIENT_ID(),
    redirect_uri: GOOGLE_REDIRECT_URI(),
    response_type: "code",
    scope: "https://www.googleapis.com/auth/calendar https://www.googleapis.com/auth/calendar.events",
    access_type: "offline",
    prompt: "consent",
    state: userId,
  });

  return `${GOOGLE_AUTH_URL}?${params.toString()}`;
}

/**
 * Exchange an authorization code for tokens and store them.
 */
export async function exchangeGoogleCode(
  userId: string,
  code: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    const tokenResponse = await fetch(GOOGLE_TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: GOOGLE_CLIENT_ID(),
        client_secret: GOOGLE_CLIENT_SECRET(),
        redirect_uri: GOOGLE_REDIRECT_URI(),
        grant_type: "authorization_code",
      }),
    });

    const tokens = await tokenResponse.json();

    if (!tokenResponse.ok) {
      return { success: false, error: tokens.error_description || "Failed to exchange code" };
    }

    const accessToken = tokens.access_token as string;
    const refreshToken = tokens.refresh_token as string;
    const expiresIn = tokens.expires_in as number;
    const expiresAt = new Date(Date.now() + expiresIn * 1000);

    // Get the primary calendar info
    const calendarInfo = await fetchGoogleCalendarList(accessToken);
    const primaryCalendar = calendarInfo.find((c) => c.primary) || calendarInfo[0];

    // Store in database
    await sql()`
      INSERT INTO calendar_connections (user_id, provider, access_token, refresh_token, token_expires_at, calendar_id, calendar_name, is_active)
      VALUES (${userId}, 'google', ${accessToken}, ${refreshToken}, ${expiresAt.toISOString()}, ${primaryCalendar?.id || "primary"}, ${primaryCalendar?.summary || "Google Calendar"}, true)
      ON CONFLICT (user_id, provider) DO UPDATE SET
        access_token = ${accessToken},
        refresh_token = ${refreshToken},
        token_expires_at = ${expiresAt.toISOString()},
        calendar_id = ${primaryCalendar?.id || "primary"},
        calendar_name = ${primaryCalendar?.summary || "Google Calendar"},
        is_active = true,
        updated_at = now()
    `;

    return { success: true };
  } catch (err) {
    return { success: false, error: String(err) };
  }
}

/**
 * Refresh an expired access token.
 */
export async function refreshGoogleToken(
  refreshToken: string,
  connectionId: string,
): Promise<string | null> {
  try {
    const response = await fetch(GOOGLE_TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        refresh_token: refreshToken,
        client_id: GOOGLE_CLIENT_ID(),
        client_secret: GOOGLE_CLIENT_SECRET(),
        grant_type: "refresh_token",
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      console.error("Failed to refresh Google token:", data);
      return null;
    }

    const newAccessToken = data.access_token as string;
    const expiresIn = data.expires_in as number;
    const expiresAt = new Date(Date.now() + expiresIn * 1000);

    // Update stored token
    await sql()`
      UPDATE calendar_connections
      SET access_token = ${newAccessToken},
          token_expires_at = ${expiresAt.toISOString()},
          updated_at = now()
      WHERE id = ${connectionId}
    `;

    return newAccessToken;
  } catch (err) {
    console.error("Error refreshing Google token:", err);
    return null;
  }
}

/**
 * Get a valid access token for a connection, refreshing if needed.
 */
export async function getValidGoogleToken(
  connectionId: string,
): Promise<string | null> {
  const rows = await sql()`
    SELECT access_token, refresh_token, token_expires_at
    FROM calendar_connections
    WHERE id = ${connectionId} AND provider = 'google'
  `;

  if (rows.length === 0) return null;

  const conn = rows[0] as Record<string, unknown>;
  const expiresAt = new Date(String(conn.token_expires_at));

  // If token is still valid (with 5 min buffer), return it
  if (expiresAt.getTime() > Date.now() + 5 * 60 * 1000) {
    return String(conn.access_token);
  }

  // Otherwise refresh
  return refreshGoogleToken(String(conn.refresh_token), connectionId);
}

// ─── Calendar API Calls ──────────────────────────────────────────────────

/**
 * List all calendars available to the user.
 */
export async function fetchGoogleCalendarList(
  accessToken: string,
): Promise<GoogleCalendar[]> {
  const response = await fetch(
    `${GOOGLE_CALENDAR_API}/users/me/calendarList`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
    },
  );

  if (!response.ok) {
    throw new Error(`Google Calendar API error: ${response.statusText}`);
  }

  const data = (await response.json()) as { items: GoogleCalendar[] };
  return data.items || [];
}

/**
 * Create a calendar event.
 */
export async function createGoogleCalendarEvent(
  accessToken: string,
  calendarId: string,
  event: GoogleCalendarEvent,
): Promise<{ id: string; htmlLink: string } | null> {
  const response = await fetch(
    `${GOOGLE_CALENDAR_API}/calendars/${encodeURIComponent(calendarId)}/events`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(event),
    },
  );

  if (!response.ok) {
    const error = await response.text();
    console.error("Failed to create Google Calendar event:", error);
    return null;
  }

  const result = (await response.json()) as { id: string; htmlLink: string };
  return result;
}

/**
 * Update a calendar event.
 */
export async function updateGoogleCalendarEvent(
  accessToken: string,
  calendarId: string,
  eventId: string,
  event: Partial<GoogleCalendarEvent>,
): Promise<boolean> {
  const response = await fetch(
    `${GOOGLE_CALENDAR_API}/calendars/${encodeURIComponent(calendarId)}/events/${eventId}`,
    {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(event),
    },
  );

  return response.ok;
}

/**
 * Delete a calendar event.
 */
export async function deleteGoogleCalendarEvent(
  accessToken: string,
  calendarId: string,
  eventId: string,
): Promise<boolean> {
  const response = await fetch(
    `${GOOGLE_CALENDAR_API}/calendars/${encodeURIComponent(calendarId)}/events/${eventId}`,
    { method: "DELETE", headers: { Authorization: `Bearer ${accessToken}` } },
  );

  return response.ok;
}

/**
 * Sync a parsed event to Google Calendar.
 */
export async function syncToGoogleCalendar(
  connectionId: string,
  event: {
    title: string;
    description?: string;
    startTime: string;
    endTime?: string;
    location?: string;
    recurrenceRule?: string;
  },
): Promise<{ success: boolean; calendarEventId?: string; error?: string }> {
  try {
    const token = await getValidGoogleToken(connectionId);
    if (!token) {
      return { success: false, error: "Unable to get valid access token" };
    }

    const conn = (await sql()`
      SELECT calendar_id FROM calendar_connections WHERE id = ${connectionId}
    `)[0] as Record<string, unknown> | undefined;

    if (!conn) {
      return { success: false, error: "Connection not found" };
    }

    const calendarId = String(conn.calendar_id);

    const googleEvent: GoogleCalendarEvent = {
      summary: event.title,
      description: event.description || "",
      start: {
        dateTime: new Date(event.startTime).toISOString(),
        timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      },
      end: {
        dateTime: event.endTime
          ? new Date(event.endTime).toISOString()
          : new Date(Date.now() + 60 * 60 * 1000).toISOString(),
        timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      },
      location: event.location || undefined,
    };

    if (event.recurrenceRule) {
      googleEvent.recurrence = [event.recurrenceRule];
    }

    const result = await createGoogleCalendarEvent(token, calendarId, googleEvent);
    if (!result) {
      return { success: false, error: "Failed to create event in Google Calendar" };
    }

    return { success: true, calendarEventId: result.id };
  } catch (err) {
    return { success: false, error: String(err) };
  }
}