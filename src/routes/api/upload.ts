/**
 * Image upload & processing API route.
 *
 * Handles planner photo uploads, runs OCR, parses events,
 * stores them in the database, and optionally triggers calendar sync.
 */
import { json } from "@tanstack/react-start";
import { createAPIFileRoute } from "@tanstack/react-start/api";
import { getSessionFromToken, parseSessionCookie } from "~/lib/auth";
import { processImage, terminateWorker } from "~/lib/ocr/processor";
import { parseOCRText, ParsedEvent } from "~/lib/ocr/parser";
import { sql } from "~/db";

// Max upload size: 20MB
const MAX_UPLOAD_SIZE = 20 * 1024 * 1024;

export const APIRoute = createAPIFileRoute("/api/upload")({
  // POST /api/upload — upload and process a planner photo
  POST: async ({ request }) => {
    const token = parseSessionCookie(request.headers.get("cookie"));
    if (!token) {
      return json({ error: "Not authenticated" }, { status: 401 });
    }

    const session = await getSessionFromToken(token);
    if (!session) {
      return json({ error: "Not authenticated" }, { status: 401 });
    }

    // Check usage limits
    const userRows = await sql()`
      SELECT subscription_tier FROM users WHERE id = ${session.userId}
    `;
    const tier = String((userRows[0] as Record<string, unknown>).subscription_tier);

    if (tier === "free") {
      const currentMonth = await sql()`
        SELECT COUNT(*) as count
        FROM sync_history
        WHERE user_id = ${session.userId}
          AND started_at >= date_trunc('month', now())
      `;
      const count = (currentMonth[0] as Record<string, unknown>).count as number;
      if (count >= 10) {
        return json({
          error: "Monthly sync limit reached. Upgrade to Pro for unlimited syncs.",
          upgradeRequired: true,
        }, { status: 403 });
      }
    }

    try {
      const formData = await request.formData();
      const file = formData.get("image") as File | null;

      if (!file) {
        return json({ error: "No image file provided." }, { status: 400 });
      }

      if (!file.type.startsWith("image/")) {
        return json({ error: "File must be an image." }, { status: 400 });
      }

      if (file.size > MAX_UPLOAD_SIZE) {
        return json({ error: "Image too large. Maximum size is 20MB." }, { status: 400 });
      }

      // Read the file into a buffer
      const arrayBuffer = await file.arrayBuffer();
      const imageBuffer = Buffer.from(arrayBuffer);

      // Step 1: Run OCR
      let ocrResult;
      try {
        ocrResult = await processImage(imageBuffer);
      } catch (err) {
        console.error("OCR processing failed:", err);
        return json({ error: "OCR processing failed. Please try a clearer image." }, { status: 500 });
      }

      if (!ocrResult.text || ocrResult.text.trim().length === 0) {
        return json({ error: "No text could be extracted from the image. Please try a clearer photo." }, { status: 422 });
      }

      // Step 2: Parse events from OCR text
      const parserResult = parseOCRText(ocrResult);

      // Step 3: Store parsed events in the database
      const storedEvents: Array<Record<string, unknown>> = [];

      for (const event of parserResult.events) {
        const rows = await sql()`
          INSERT INTO parsed_events (
            user_id, title, description, start_time, end_time, is_all_day,
            location, recurrence_rule, source_image_url, confidence_score, status
          )
          VALUES (
            ${session.userId},
            ${event.title},
            ${event.description || ""},
            ${event.startTime},
            ${event.endTime || null},
            ${event.isAllDay || false},
            ${event.location || ""},
            ${event.recurrenceRule || ""},
            '',
            ${event.confidenceScore},
            'pending'
          )
          RETURNING id, title, start_time, confidence_score, is_all_day, location
        `;
        storedEvents.push(rows[0] as Record<string, unknown>);
      }

      // Step 4: Optionally trigger auto-sync if user has connected calendars
      let autoSynced = false;
      const connections = await sql()`
        SELECT id FROM calendar_connections
        WHERE user_id = ${session.userId} AND is_active = true
        LIMIT 1
      `;

      if (connections.length > 0 && storedEvents.length > 0) {
        autoSynced = true;
        // Trigger sync in background
        syncEventsToCalendars(session.userId, storedEvents.map((e) => String(e.id)));
      }

      // Clean up OCR worker to free memory
      terminateWorker().catch(() => {});

      return json({
        success: true,
        ocrConfidence: ocrResult.confidence,
        ocrText: ocrResult.text.slice(0, 500), // Send first 500 chars as preview
        events: storedEvents.map((e) => ({
          id: String(e.id),
          title: String(e.title),
          startTime: String(e.start_time),
          confidenceScore: Number(e.confidence_score),
          isAllDay: Boolean(e.is_all_day),
          location: String(e.location || ""),
        })),
        summary: `Found ${storedEvents.length} event${storedEvents.length !== 1 ? "s" : ""}`,
        autoSynced,
      });
    } catch (err) {
      console.error("Upload error:", err);
      return json({ error: "An unexpected error occurred during processing." }, { status: 500 });
    }
  },
});

/**
 * Background sync events to connected calendars.
 * This runs asynchronously after the response is sent.
 */
async function syncEventsToCalendars(
  userId: string,
  eventIds: string[],
): Promise<void> {
  try {
    for (const eventId of eventIds) {
      const events = await sql()`
        SELECT id, user_id, title, description, start_time, end_time,
               is_all_day, location, recurrence_rule, source_image_url, confidence_score
        FROM parsed_events
        WHERE id = ${eventId} AND user_id = ${userId}
      `;

      if (events.length === 0) continue;

      const event = events[0] as Record<string, unknown>;

      // Import and call sync engine
      const { syncToAllCalendars } = await import("~/lib/calendar/sync-engine");
      await syncToAllCalendars({
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
    }
  } catch (err) {
    console.error("Background sync failed:", err);
  }
}