/**
 * Auth server functions — callable from TanStack Start components.
 *
 * These functions run only on the server and handle auth operations
 * (signup, login, logout, getCurrentUser) with cookie-based session management.
 */
import { createServerFn } from "@tanstack/react-start";
import { getWebRequest } from "@tanstack/react-start/server";
import {
  hashPassword,
  verifyPassword,
  createSession,
  getSessionFromToken,
  getUserById,
  getUserByEmail,
  getUserWithPasswordByEmail,
  deleteSession,
  parseSessionCookie,
  buildSessionCookie,
  clearSessionCookie,
} from "./auth";

// ─── Signup ────────────────────────────────────────────────────────────────

export const signup = createServerFn({ method: "POST" })
  .validator((data: { email: string; password: string; name: string }) => data)
  .handler(async ({ data }) => {
    const { email, password, name } = data;

    if (!email || !password) {
      return { success: false, error: "Email and password are required." };
    }

    if (password.length < 6) {
      return {
        success: false,
        error: "Password must be at least 6 characters.",
      };
    }

    // Check if user exists
    const existing = await getUserByEmail(email);
    if (existing) {
      return { success: false, error: "An account with this email already exists." };
    }

    // Create user
    const passwordHash = await hashPassword(password);
    const { sql } = await import("~/db");
    const rows = await sql()`
      INSERT INTO users (email, name, password_hash)
      VALUES (${email}, ${name || email.split("@")[0]}, ${passwordHash})
      RETURNING id, email, name
    `;

    const user = rows[0] as Record<string, unknown>;

    // Create session
    const session = await createSession(String(user.id));
    const cookie = buildSessionCookie(session.token, session.expiresAt);

    return {
      success: true,
      user: {
        id: String(user.id),
        email: String(user.email),
        name: String(user.name),
      },
      cookie,
    };
  });

// ─── Login ─────────────────────────────────────────────────────────────────

export const login = createServerFn({ method: "POST" })
  .validator((data: { email: string; password: string }) => data)
  .handler(async ({ data }) => {
    const { email, password } = data;

    if (!email || !password) {
      return { success: false, error: "Email and password are required." };
    }

    const user = await getUserWithPasswordByEmail(email);
    if (!user) {
      return { success: false, error: "Invalid email or password." };
    }

    const valid = await verifyPassword(password, user.passwordHash);
    if (!valid) {
      return { success: false, error: "Invalid email or password." };
    }

    // Create session
    const session = await createSession(user.id);
    const cookie = buildSessionCookie(session.token, session.expiresAt);

    return {
      success: true,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
      },
      cookie,
    };
  });

// ─── Logout ────────────────────────────────────────────────────────────────

export const logout = createServerFn({ method: "POST" }).handler(async () => {
  const request = getWebRequest();
  if (!request) {
    return { success: false, error: "No request context." };
  }

  const token = parseSessionCookie(request.headers.get("cookie"));
  if (token) {
    await deleteSession(token);
  }

  return { success: true, cookie: clearSessionCookie() };
});

// ─── Get Current User ─────────────────────────────────────────────────────-

export const getCurrentUser = createServerFn({ method: "GET" }).handler(
  async () => {
    const request = getWebRequest();
    if (!request) {
      return { user: null };
    }

    const token = parseSessionCookie(request.headers.get("cookie"));
    if (!token) {
      return { user: null };
    }

    const session = await getSessionFromToken(token);
    if (!session) {
      return { user: null };
    }

    const user = await getUserById(session.userId);
    if (!user) {
      return { user: null };
    }

    return { user };
  },
);