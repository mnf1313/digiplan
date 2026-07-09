/**
 * Unified sync engine for PlannerBridge.
 *
 * Takes parsed events from the image processing pipeline and pushes them
 * to all connected calendars. Handles rate limits, deduplication, and error reporting.
 */
import { sql } from "~/db";
import { syncToGoogleCalendar } from "./google";
import { syncToAppleCalendar } from "./caldav";
import { syncToNotion } from "./notion";

// ─── Types ────────────────────────────────────────────────────────────────

export interface ParsedEvent {
  id: string;
  userId: string;
  title: string;
  description?: string;
  startTime: string;
  endTime?: string;
  isAllDay?: boolean;
  location?: string;
  recurrenceRule?: string;
  sourceImageUrl?: string;
  confidenceScore?: number;
}

export interface SyncResult {
  syncId: string;
  connectionId: string;
  provider: string;
  success: boolean;
  calendarEventId?: string;
  error?: string;
}

// ─── Rate Limiting ────────────────────────────────────────────────────────

interface RateLimitState {
  [provider: string]: {
    lastCall: number;
    callsThisMinute: number;
  };
}

const rateLimits: RateLimitState = {};
const RATE_LIMITS = {
  google: 60, // 60 requests per minute
  apple: 30,  // 30 requests per minute
  notion: 3,  // 3 requests per second
};

async function checkRateLimit(provider: string): Promise<void> {
  const now = Date.now();
  const state = rateLimits[provider] || { lastCall: 0, callsThisMinute: 0 };

  // Reset counter if a minute has passed
  if (now - state.lastCall > 60000) {
    state.callsThisMinute = 0;
  }

  const limit = RATE_LIMITS[provider as keyof typeof RATE_LIMITS] || 30;
  if (state.callsThisMinute >= limit) {
    // Wait for the next minute
    const waitMs = 60000 - (now - state.lastCall);
    if (waitMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, waitMs));
    }
    state.callsThisMinute = 0;
  }

  state.lastCall = Date.now();
  state.callsThisMinute++;
  rateLimits[provider] = state;
}

// ─── Deduplication ────────────────────────────────────────────────────────

/**
 * Check if an event has already been synced to avoid duplicates.
 */
async function isDuplicate(
  userId: string,
  title: string,
  startTime: string,
  provider: string,
): Promise<boolean> {
  const rows = await sql()`
    SELECT pe.id
    FROM parsed_events pe
    JOIN calendar_connections cc ON cc.user_id = pe.user_id
    WHERE pe.user_id = ${userId}
      AND pe.title = ${title}
      AND pe.start_time = ${new Date(startTime).toISOString()}
      AND pe.status = 'synced'
      AND cc.provider = ${provider}
      AND pe.calendar_event_id != ''
    LIMIT 1
  `;

  return rows.length > 0;
}

// ─── Sync Engine ──────────────────────────────────────────────────────────

/**
 * Sync a parsed event to all active calendar connections for a user.
 */
export async function syncToAllCalendars(
  event: ParsedEvent,
): Promise<SyncResult[]> {
  const results: SyncResult[] = [];

  // Get all active calendar connections for the user
  const connections = await sql()`
    SELECT id, provider
    FROM calendar_connections
    WHERE user_id = ${event.userId}
      AND is_active = true
  `;

  if (connections.length === 0) {
    // Still record the sync attempt even if no connections
    await recordSyncHistory(event.userId, null, "completed", 0, 0, 0);
    return results;
  }

  // Create a sync history record
  const syncRows = await sql()`
    INSERT INTO sync_history (user_id, status, images_uploaded, events_parsed, events_synced, started_at)
    VALUES (${event.userId}, 'processing', 1, 1, 0, now())
    RETURNING id
  `;
  const syncId = String((syncRows[0] as Record<string, unknown>).id);

  let totalSynced = 0;

  for (const conn of connections as Array<{ id: string; provider: string }>) {
    // Check for duplicates
    const duplicate = await isDuplicate(
      event.userId,
      event.title,
      event.startTime,
      conn.provider,
    );

    if (duplicate) {
      results.push({
        syncId,
        connectionId: conn.id,
        provider: conn.provider,
        success: true,
        calendarEventId: "duplicate",
      });
      continue;
    }

    // Apply rate limiting
    await checkRateLimit(conn.provider);

    let result: { success: boolean; calendarEventId?: string; error?: string };

    try {
      switch (conn.provider) {
        case "google":
          result = await syncToGoogleCalendar(conn.id, event);
          break;
        case "apple":
          result = await syncToAppleCalendar(conn.id, event);
          break;
        case "notion":
          result = await syncToNotion(conn.id, event);
          break;
        default:
          result = { success: false, error: `Unknown provider: ${conn.provider}` };
      }
    } catch (err) {
      result = { success: false, error: String(err) };
    }

    results.push({
      syncId,
      connectionId: conn.id,
      provider: conn.provider,
      ...result,
    });

    if (result.success) {
      totalSynced++;
    }
  }

  // Update the parsed event with sync results
  if (event.id) {
    const successfulSync = results.find((r) => r.success);
    await sql()`
      UPDATE parsed_events
      SET status = ${totalSynced > 0 ? "synced" : "failed"},
          calendar_event_id = ${successfulSync?.calendarEventId || ""},
          updated_at = now()
      WHERE id = ${event.id}
    `;
  }

  // Update sync history
  const allFailed = results.every((r) => !r.success);
  await sql()`
    UPDATE sync_history
    SET status = ${allFailed ? "failed" : "completed"},
        events_synced = ${totalSynced},
        completed_at = now(),
        error_message = ${results.filter((r) => r.error).map((r) => r.error).join("; ")}
    WHERE id = ${syncId}
  `;

  return results;
}

/**
 * Record a sync history entry (for cases where there are no connections).
 */
async function recordSyncHistory(
  userId: string,
  connectionId: string | null,
  status: string,
  imagesUploaded: number,
  eventsParsed: number,
  eventsSynced: number,
): Promise<void> {
  await sql()`
    INSERT INTO sync_history (user_id, connection_id, status, images_uploaded, events_parsed, events_synced, completed_at)
    VALUES (${userId}, ${connectionId}, ${status}, ${imagesUploaded}, ${eventsParsed}, ${eventsSynced}, now())
  `;
}

// ─── Bulk Sync ────────────────────────────────────────────────────────────

/**
 * Sync multiple parsed events in bulk.
 */
export async function bulkSyncEvents(
  events: ParsedEvent[],
): Promise<{ results: SyncResult[]; totalSynced: number; totalFailed: number }> {
  let totalSynced = 0;
  let totalFailed = 0;
  const allResults: SyncResult[] = [];

  for (const event of events) {
    const results = await syncToAllCalendars(event);
    allResults.push(...results);

    const anySuccess = results.some((r) => r.success);
    if (anySuccess) {
      totalSynced++;
    } else {
      totalFailed++;
    }
  }

  return { results: allResults, totalSynced, totalFailed };
}