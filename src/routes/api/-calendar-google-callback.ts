/**
 * Google Calendar OAuth callback handler.
 *
 * Receives the authorization code from Google's OAuth flow,
 * exchanges it for tokens, and stores the connection.
 */
import { createAPIFileRoute } from "@tanstack/react-start/api";
import { exchangeGoogleCode } from "~/lib/calendar/google";
import { createSession, getUserById, getSessionFromToken, parseSessionCookie } from "~/lib/auth";

export const APIRoute = createAPIFileRoute("/api/calendar/google/callback")({
  GET: async ({ request }) => {
    const url = new URL(request.url);
    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state"); // userId

    if (!code || !state) {
      return new Response(
        `<html><body><h1>Error</h1><p>Missing authorization code or state parameter.</p></body></html>`,
        { status: 400, headers: { "Content-Type": "text/html" } },
      );
    }

    // Try to get user from session first, fall back to state param
    let userId = state;
    const token = parseSessionCookie(request.headers.get("cookie"));
    if (token) {
      const session = await getSessionFromToken(token);
      if (session) {
        userId = session.userId;
      }
    }

    const result = await exchangeGoogleCode(userId, code);

    if (result.success) {
      return new Response(
        `<html>
          <body style="font-family: system-ui, sans-serif; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; background: #f9fafb;">
            <div style="text-align: center; padding: 2rem;">
              <h1 style="color: #16a34a;">✅ Google Calendar connected!</h1>
              <p style="color: #6b7280;">You can close this window and return to PlannerBridge.</p>
              <a href="/dashboard" style="display: inline-block; margin-top: 1rem; padding: 0.75rem 1.5rem; background: #4f46e5; color: white; text-decoration: none; border-radius: 0.5rem; font-weight: 600;">Go to Dashboard</a>
            </div>
          </body>
        </html>`,
        { status: 200, headers: { "Content-Type": "text/html" } },
      );
    }

    return new Response(
      `<html>
        <body style="font-family: system-ui, sans-serif; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; background: #f9fafb;">
          <div style="text-align: center; padding: 2rem;">
            <h1 style="color: #dc2626;">❌ Connection failed</h1>
            <p style="color: #6b7280;">${result.error || "An unknown error occurred."}</p>
            <a href="/dashboard" style="display: inline-block; margin-top: 1rem; padding: 0.75rem 1.5rem; background: #4f46e5; color: white; text-decoration: none; border-radius: 0.5rem; font-weight: 600;">Try Again</a>
          </div>
        </body>
      </html>`,
      { status: 400, headers: { "Content-Type": "text/html" } },
    );
  },
});