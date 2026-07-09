/**
 * Notion API integration for DigiPlan.
 *
 * Handles OAuth 2.0 flow, database discovery, and event creation
 * via the Notion API.
 */
import { sql } from "~/db";

// ─── Types ────────────────────────────────────────────────────────────────

export interface NotionDatabase {
  id: string;
  title: string;
}

export interface NotionEvent {
  title: string;
  description?: string;
  startTime: string;
  endTime?: string;
  location?: string;
  recurrenceRule?: string;
}

// ─── OAuth Configuration ──────────────────────────────────────────────────

const NOTION_AUTH_URL = "https://api.notion.com/v1/oauth/authorize";
const NOTION_TOKEN_URL = "https://api.notion.com/v1/oauth/token";
const NOTION_API_URL = "https://api.notion.com/v1";

const NOTION_CLIENT_ID = () => process.env.NOTION_CLIENT_ID || "";
const NOTION_CLIENT_SECRET = () => process.env.NOTION_CLIENT_SECRET || "";
const NOTION_REDIRECT_URI = () =>
  process.env.NOTION_REDIRECT_URI || `${getBaseUrl()}/api/calendar/notion/callback`;

function getBaseUrl(): string {
  return process.env.PUBLIC_URL || "http://localhost:3000";
}

// ─── OAuth Flow ───────────────────────────────────────────────────────────

/**
 * Build the Notion OAuth authorization URL.
 */
export function getNotionAuthUrl(userId: string): string {
  const params = new URLSearchParams({
    client_id: NOTION_CLIENT_ID(),
    redirect_uri: NOTION_REDIRECT_URI(),
    response_type: "code",
    owner: "user",
    state: userId,
  });

  return `${NOTION_AUTH_URL}?${params.toString()}`;
}

/**
 * Exchange an authorization code for tokens and store them.
 */
export async function exchangeNotionCode(
  userId: string,
  code: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    const auth = btoa(`${NOTION_CLIENT_ID()}:${NOTION_CLIENT_SECRET()}`);

    const tokenResponse = await fetch(NOTION_TOKEN_URL, {
      method: "POST",
      headers: {
        Authorization: `Basic ${auth}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        code,
        grant_type: "authorization_code",
        redirect_uri: NOTION_REDIRECT_URI(),
      }),
    });

    const data = await tokenResponse.json();

    if (!tokenResponse.ok) {
      return { success: false, error: data.error_description || "Failed to exchange code" };
    }

    const accessToken = data.access_token as string;
    const workspaceName = data.workspace_name as string;
    const workspaceId = data.workspace_id as string;
    const botId = data.bot_id as string;

    // Notion tokens don't expire (no refresh token needed)
    // Store with a far-future expiry
    const farFuture = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000);

    await sql()`
      INSERT INTO calendar_connections (user_id, provider, access_token, refresh_token, token_expires_at, calendar_id, calendar_name, is_active)
      VALUES (${userId}, 'notion', ${accessToken}, ${botId}, ${farFuture.toISOString()}, ${workspaceId}, ${workspaceName || "Notion"}, true)
      ON CONFLICT (user_id, provider) DO UPDATE SET
        access_token = ${accessToken},
        token_expires_at = ${farFuture.toISOString()},
        calendar_id = ${workspaceId},
        calendar_name = ${workspaceName || "Notion"},
        is_active = true,
        updated_at = now()
    `;

    return { success: true };
  } catch (err) {
    return { success: false, error: String(err) };
  }
}

// ─── Notion API Calls ────────────────────────────────────────────────────

/**
 * Make a Notion API request with authentication.
 */
async function notionRequest(
  accessToken: string,
  method: string,
  path: string,
  body?: unknown,
): Promise<{ ok: boolean; status: number; data: unknown }> {
  const url = `${NOTION_API_URL}${path}`;

  const headers: Record<string, string> = {
    Authorization: `Bearer ${accessToken}`,
    "Notion-Version": "2022-06-28",
    "Content-Type": "application/json",
  };

  const response = await fetch(url, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  const data = await response.json();

  return { ok: response.ok, status: response.status, data };
}

/**
 * Search for databases that can be used for event storage.
 */
export async function searchNotionDatabases(
  accessToken: string,
): Promise<NotionDatabase[]> {
  const result = await notionRequest(accessToken, "POST", "/search", {
    filter: { property: "object", value: "database" },
    sort: { direction: "descending", timestamp: "last_edited_time" },
  });

  if (!result.ok) {
    throw new Error(`Notion search failed: ${JSON.stringify(result.data)}`);
  }

  const response = result.data as { results: Array<{ id: string; title: Array<{ plain_text: string }> }> };
  return (response.results || []).map((db) => ({
    id: db.id,
    title: db.title?.map((t) => t.plain_text).join("") || "Untitled",
  }));
}

/**
 * Create a page (event) in a Notion database.
 */
export async function createNotionEvent(
  accessToken: string,
  databaseId: string,
  event: NotionEvent,
): Promise<{ id: string } | null> {
  const properties: Record<string, unknown> = {
    title: {
      title: [{ text: { content: event.title } }],
    },
    "Date": {
      date: {
        start: event.startTime,
        end: event.endTime || null,
      },
    },
  };

  if (event.description) {
    properties["Description"] = {
      rich_text: [{ text: { content: event.description } }],
    };
  }

  if (event.location) {
    properties["Location"] = {
      rich_text: [{ text: { content: event.location } }],
    };
  }

  const result = await notionRequest(accessToken, "POST", "/pages", {
    parent: { database_id: databaseId },
    properties,
  });

  if (!result.ok) {
    console.error("Failed to create Notion page:", JSON.stringify(result.data));
    return null;
  }

  const response = result.data as { id: string };
  return { id: response.id };
}

// ─── Sync ─────────────────────────────────────────────────────────────────

/**
 * Sync a parsed event to Notion.
 */
export async function syncToNotion(
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
      SELECT access_token, calendar_id
      FROM calendar_connections
      WHERE id = ${connectionId} AND provider = 'notion'
    `;

    if (rows.length === 0) {
      return { success: false, error: "Notion connection not found" };
    }

    const conn = rows[0] as Record<string, unknown>;
    const accessToken = String(conn.access_token);
    const databaseId = String(conn.calendar_id);

    const result = await createNotionEvent(accessToken, databaseId, {
      title: event.title,
      description: event.description,
      startTime: event.startTime,
      endTime: event.endTime,
      location: event.location,
    });

    if (!result) {
      return { success: false, error: "Failed to create event in Notion" };
    }

    return { success: true, calendarEventId: result.id };
  } catch (err) {
    return { success: false, error: String(err) };
  }
}