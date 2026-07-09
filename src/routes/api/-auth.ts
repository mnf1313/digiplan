/**
 * Auth API route — /api/auth
 *
 * Handles signup, login, logout, and session verification.
 * Returns JSON responses with Set-Cookie headers for session management.
 */
import { json } from "@tanstack/react-start";
import { createAPIFileRoute } from "@tanstack/react-start/api";
import {
  hashPassword,
  verifyPassword,
  createSession,
  getSessionFromToken,
  getUserByEmail,
  getUserById,
  getUserWithPasswordByEmail,
  deleteSession,
  parseSessionCookie,
  buildSessionCookie,
  clearSessionCookie,
} from "~/lib/auth";

export const APIRoute = createAPIFileRoute("/api/auth")({
  // POST /api/auth — signup, login, or logout based on action
  POST: async ({ request }) => {
    try {
      const body = (await request.json()) as {
        action: string;
        email?: string;
        password?: string;
        name?: string;
      };

      // ── Signup ──────────────────────────────────────────────────
      if (body.action === "signup") {
        const { email, password, name } = body;

        if (!email || !password) {
          return json(
            { success: false, error: "Email and password are required." },
            { status: 400 },
          );
        }

        if (password.length < 6) {
          return json(
            { success: false, error: "Password must be at least 6 characters." },
            { status: 400 },
          );
        }

        const existing = await getUserByEmail(email);
        if (existing) {
          return json(
            { success: false, error: "An account with this email already exists." },
            { status: 409 },
          );
        }

        const passwordHash = await hashPassword(password);
        const { sql } = await import("~/db");
        const rows = await sql()`
          INSERT INTO users (email, name, password_hash)
          VALUES (${email}, ${name || email.split("@")[0]}, ${passwordHash})
          RETURNING id, email, name, created_at
        `;

        const user = rows[0] as Record<string, unknown>;
        const session = await createSession(String(user.id));
        const cookie = buildSessionCookie(session.token, session.expiresAt);

        return json(
          {
            success: true,
            user: {
              id: String(user.id),
              email: String(user.email),
              name: String(user.name),
            },
          },
          {
            status: 201,
            headers: { "Set-Cookie": cookie },
          },
        );
      }

      // ── Login ───────────────────────────────────────────────────
      if (body.action === "login") {
        const { email, password } = body;

        if (!email || !password) {
          return json(
            { success: false, error: "Email and password are required." },
            { status: 400 },
          );
        }

        const user = await getUserWithPasswordByEmail(email);
        if (!user) {
          return json(
            { success: false, error: "Invalid email or password." },
            { status: 401 },
          );
        }

        const valid = await verifyPassword(password, user.passwordHash);
        if (!valid) {
          return json(
            { success: false, error: "Invalid email or password." },
            { status: 401 },
          );
        }

        const session = await createSession(user.id);
        const cookie = buildSessionCookie(session.token, session.expiresAt);

        return json(
          {
            success: true,
            user: {
              id: user.id,
              email: user.email,
              name: user.name,
            },
          },
          {
            status: 200,
            headers: { "Set-Cookie": cookie },
          },
        );
      }

      // ── Logout ──────────────────────────────────────────────────
      if (body.action === "logout") {
        const token = parseSessionCookie(request.headers.get("cookie"));
        if (token) {
          await deleteSession(token);
        }

        return json(
          { success: true },
          {
            status: 200,
            headers: { "Set-Cookie": clearSessionCookie() },
          },
        );
      }

      return json(
        { success: false, error: `Unknown action: ${body.action}` },
        { status: 400 },
      );
    } catch (err) {
      console.error("Auth API error:", err);
      return json(
        { success: false, error: "Internal server error." },
        { status: 500 },
      );
    }
  },

  // GET /api/auth — check current session
  GET: async ({ request }) => {
    const token = parseSessionCookie(request.headers.get("cookie"));
    if (!token) {
      return json({ authenticated: false, user: null });
    }

    const session = await getSessionFromToken(token);
    if (!session) {
      return json({ authenticated: false, user: null });
    }

    const user = await getUserById(session.userId);
    if (!user) {
      return json({ authenticated: false, user: null });
    }

    return json({
      authenticated: true,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        subscriptionTier: user.subscriptionTier,
      },
    });
  },
});