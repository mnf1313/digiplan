/**
 * Apple Calendar (CalDAV) integration for DigiPlan.
 *
 * Implements a CalDAV client for iCloud calendars.
 * Handles: PROPFIND (discover calendars), PUT (create/update events),
 * and DELETE (remove events).
 */
import { sql } from "~/db";

// ─── Types ────────────────────────────────────────────────────────────────

export interface CalDAVCalendar {
  href: string;
  displayName: string;
  description?: string;
  color?: string;
}

export interface CalDAVEvent {
  id?: string;
  summary: string;
  description?: string;
  startTime: string;
  endTime?: string;
  location?: string;
  recurrenceRule?: string;
}

// ─── CalDAV XML Templates ─────────────────────────────────────────────────

const PROPFIND_REQUEST = `<?xml version="1.0" encoding="utf-8"?>
<d:propfind xmlns:d="DAV:" xmlns:cs="http://calendarserver.org/ns/"
            xmlns:c="urn:ietf:params:xml:ns:caldav">
  <d:prop>
    <d:displayname />
    <cs:getctag />
    <c:calendar-description />
    <c:calendar-color />
  </d:prop>
</d:propfind>`;

/**
 * Build a VCALENDAR/VEVENT string for CalDAV PUT requests.
 */
function buildVEvent(event: CalDAVEvent): string {
  const now = new Date().toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";
  const start = new Date(event.startTime).toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";
  const end = event.endTime
    ? new Date(event.endTime).toISOString().replace(/[-:]/g, "").split(".")[0] + "Z"
    : new Date(Date.now() + 3600000).toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";
  const uid = event.id || crypto.randomUUID();

  let ical = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//DigiPlan//EN",
    "BEGIN:VEVENT",
    `UID:${uid}`,
    `DTSTART:${start}`,
    `DTEND:${end}`,
    `SUMMARY:${escapeIcalText(event.summary)}`,
    `DTSTAMP:${now}`,
  ];

  if (event.description) {
    ical.push(`DESCRIPTION:${escapeIcalText(event.description)}`);
  }
  if (event.location) {
    ical.push(`LOCATION:${escapeIcalText(event.location)}`);
  }
  if (event.recurrenceRule) {
    ical.push(`RRULE:${event.recurrenceRule}`);
  }

  ical.push("END:VEVENT", "END:VCALENDAR");
  return ical.join("\r\n");
}

function escapeIcalText(text: string): string {
  return text.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\n/g, "\\n");
}

// ─── CalDAV HTTP Client ──────────────────────────────────────────────────

/**
 * Make a CalDAV request with proper authentication and headers.
 */
async function caldavRequest(
  baseUrl: string,
  username: string,
  appPassword: string,
  method: string,
  path: string,
  body?: string,
  contentType?: string,
): Promise<{ ok: boolean; status: number; text: string }> {
  const auth = btoa(`${username}:${appPassword}`);
  const url = `${baseUrl.replace(/\/$/, "")}${path}`;

  const headers: Record<string, string> = {
    Authorization: `Basic ${auth}`,
    "User-Agent": "DigiPlan/1.0",
  };

  if (body) {
    headers["Content-Type"] = contentType || "text/calendar; charset=utf-8";
  }

  const response = await fetch(url, { method, headers, body });

  return {
    ok: response.ok,
    status: response.status,
    text: await response.text(),
  };
}

// ─── Calendar Discovery (PROPFIND) ────────────────────────────────────────

/**
 * Discover calendars via PROPFIND.
 */
export async function discoverCalendars(
  baseUrl: string,
  username: string,
  appPassword: string,
): Promise<CalDAVCalendar[]> {
  const result = await caldavRequest(
    baseUrl,
    username,
    appPassword,
    "PROPFIND",
    "/",
    PROPFIND_REQUEST,
    "application/xml; charset=utf-8",
  );

  if (!result.ok) {
    throw new Error(`CalDAV PROPFIND failed: ${result.status} ${result.text}`);
  }

  // Parse the XML response to extract calendar info
  const calendars: CalDAVCalendar[] = [];
  const hrefRegex = /<d:href>([^<]+)<\/d:href>/g;
  const displayNameRegex = /<d:displayname[^>]*>([^<]*)<\/d:displayname>/g;
  const descriptionRegex = /<c:calendar-description[^>]*>([^<]*)<\/c:calendar-description>/g;

  const hrefs = [...result.text.matchAll(hrefRegex)].map((m) => m[1]);
  const displayNames = [...result.text.matchAll(displayNameRegex)].map((m) => m[1]);
  const descriptions = [...result.text.matchAll(descriptionRegex)].map((m) => m[1]);

  for (let i = 0; i < hrefs.length; i++) {
    if (hrefs[i].endsWith("/")) continue; // Skip collections
    calendars.push({
      href: hrefs[i],
      displayName: displayNames[i] || "Calendar",
      description: descriptions[i] || undefined,
    });
  }

  return calendars;
}

// ─── Event CRUD ───────────────────────────────────────────────────────────

/**
 * Create an event in a CalDAV calendar.
 * Returns the event UID on success.
 */
export async function createCalDAVEvent(
  baseUrl: string,
  username: string,
  appPassword: string,
  calendarHref: string,
  event: CalDAVEvent,
): Promise<string | null> {
  const uid = crypto.randomUUID();
  const eventPath = `${calendarHref}${uid}.ics`;
  const icalData = buildVEvent({ ...event, id: uid });

  const result = await caldavRequest(
    baseUrl,
    username,
    appPassword,
    "PUT",
    eventPath,
    icalData,
    "text/calendar; charset=utf-8",
  );

  if (result.ok || result.status === 201 || result.status === 204) {
    return uid;
  }

  console.error("CalDAV PUT failed:", result.status, result.text);
  return null;
}

/**
 * Delete an event from a CalDAV calendar.
 */
export async function deleteCalDAVEvent(
  baseUrl: string,
  username: string,
  appPassword: string,
  calendarHref: string,
  eventUid: string,
): Promise<boolean> {
  const eventPath = `${calendarHref}${eventUid}.ics`;
  const result = await caldavRequest(baseUrl, username, appPassword, "DELETE", eventPath);
  return result.ok || result.status === 204;
}

// ─── Sync ─────────────────────────────────────────────────────────────────

/**
 * Sync a parsed event to Apple Calendar via CalDAV.
 */
export async function syncToAppleCalendar(
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
    const rows = await sql()`
      SELECT access_token, refresh_token, calendar_id
      FROM calendar_connections
      WHERE id = ${connectionId} AND provider = 'apple'
    `;

    if (rows.length === 0) {
      return { success: false, error: "Apple Calendar connection not found" };
    }

    const conn = rows[0] as Record<string, unknown>;

    // Apple Calendar (CalDAV) stores credentials as access_token = username, refresh_token = app password
    const username = String(conn.access_token);
    const appPassword = String(conn.refresh_token);
    const calendarHref = String(conn.calendar_id);

    // Default iCloud CalDAV endpoint
    const baseUrl = "https://caldav.icloud.com";

    const caldavEvent: CalDAVEvent = {
      summary: event.title,
      description: event.description,
      startTime: event.startTime,
      endTime: event.endTime,
      location: event.location,
      recurrenceRule: event.recurrenceRule,
    };

    const uid = await createCalDAVEvent(baseUrl, username, appPassword, calendarHref, caldavEvent);

    if (!uid) {
      return { success: false, error: "Failed to create event in Apple Calendar" };
    }

    return { success: true, calendarEventId: uid };
  } catch (err) {
    return { success: false, error: String(err) };
  }
}