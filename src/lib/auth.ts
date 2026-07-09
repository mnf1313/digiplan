/**
 * Auth library — session management, password hashing, and auth server functions.
 *
 * Uses bcryptjs for password hashing and stores sessions in Postgres via Neon.
 * Session tokens are managed via HTTP-only cookies in TanStack Start server functions.
 */
import bcrypt from "bcryptjs";
import { sql } from "~/db";

const SALT_ROUNDS = 10;
const SESSION_EXPIRY_DAYS = 30;

// ─── Session Token Generation ─────────────────────────────────────────────

function generateToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// ─── Password Hashing ──────────────────────────────────────────────────────

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, SALT_ROUNDS);
}

export async function verifyPassword(
  password: string,
  hash: string,
): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

// ─── Session Management ────────────────────────────────────────────────────

export interface Session {
  id: string;
  userId: string;
  token: string;
  expiresAt: Date;
}

export interface User {
  id: string;
  email: string;
  name: string;
  avatarUrl: string;
  subscriptionTier: "free" | "pro";
  createdAt: Date;
}

/**
 * Create a new session for a user. Inserts into DB and returns the session.
 */
export async function createSession(userId: string): Promise<Session> {
  const token = generateToken();
  const expiresAt = new Date(
    Date.now() + SESSION_EXPIRY_DAYS * 24 * 60 * 60 * 1000,
  );

  const rows = await sql()`
    INSERT INTO sessions (user_id, token, expires_at)
    VALUES (${userId}, ${token}, ${expiresAt.toISOString()})
    RETURNING id, user_id, token, expires_at
  `;

  const row = rows[0] as Record<string, unknown>;
  return {
    id: String(row.id),
    userId: String(row.user_id),
    token: String(row.token),
    expiresAt: new Date(String(row.expires_at)),
  };
}

/**
 * Validate a session token. Returns the session or null if invalid/expired.
 */
export async function getSessionFromToken(
  token: string,
): Promise<Session | null> {
  if (!token) return null;

  const rows = await sql()`
    SELECT id, user_id, token, expires_at
    FROM sessions
    WHERE token = ${token}
      AND expires_at > now()
    LIMIT 1
  `;

  if (rows.length === 0) return null;

  const row = rows[0] as Record<string, unknown>;
  return {
    id: String(row.id),
    userId: String(row.user_id),
    token: String(row.token),
    expiresAt: new Date(String(row.expires_at)),
  };
}

/**
 * Get user by ID.
 */
export async function getUserById(userId: string): Promise<User | null> {
  const rows = await sql()`
    SELECT id, email, name, avatar_url, subscription_tier, created_at
    FROM users
    WHERE id = ${userId}
    LIMIT 1
  `;

  if (rows.length === 0) return null;

  const row = rows[0] as Record<string, unknown>;
  return {
    id: String(row.id),
    email: String(row.email),
    name: String(row.name),
    avatarUrl: String(row.avatar_url ?? ""),
    subscriptionTier: String(row.subscription_tier) as "free" | "pro",
    createdAt: new Date(String(row.created_at)),
  };
}

/**
 * Get user by email.
 */
export async function getUserByEmail(email: string): Promise<User | null> {
  const rows = await sql()`
    SELECT id, email, name, avatar_url, subscription_tier, created_at
    FROM users
    WHERE email = ${email}
    LIMIT 1
  `;

  if (rows.length === 0) return null;

  const row = rows[0] as Record<string, unknown>;
  return {
    id: String(row.id),
    email: String(row.email),
    name: String(row.name),
    avatarUrl: String(row.avatar_url ?? ""),
    subscriptionTier: String(row.subscription_tier) as "free" | "pro",
    createdAt: new Date(String(row.created_at)),
  };
}

/**
 * Delete a session (logout).
 */
export async function deleteSession(token: string): Promise<void> {
  await sql()`DELETE FROM sessions WHERE token = ${token}`;
}

/**
 * Clean up expired sessions.
 */
export async function cleanExpiredSessions(): Promise<void> {
  await sql()`DELETE FROM sessions WHERE expires_at < now()`;
}

// ─── Cookie helpers for TanStack Start ────────────────────────────────────

export const SESSION_COOKIE_NAME = "digiplan_session";

/**
 * Parse the session cookie from a request's Cookie header.
 */
export function parseSessionCookie(
  cookieHeader: string | null,
): string | null {
  if (!cookieHeader) return null;
  for (const part of cookieHeader.split(";")) {
    const trimmed = part.trim();
    if (trimmed.startsWith(`${SESSION_COOKIE_NAME}=`)) {
      return trimmed.slice(`${SESSION_COOKIE_NAME}=`.length);
    }
  }
  return null;
}

/**
 * Build a Set-Cookie header value for the session cookie.
 */
export function buildSessionCookie(token: string, expiresAt: Date): string {
  return `${SESSION_COOKIE_NAME}=${token}; HttpOnly; Path=/; SameSite=Lax; Expires=${expiresAt.toUTCString()}; Max-Age=${SESSION_EXPIRY_DAYS * 86400}`;
}

/**
 * Build a Set-Cookie header value to clear the session cookie.
 */
export function clearSessionCookie(): string {
  return `${SESSION_COOKIE_NAME}=; HttpOnly; Path=/; SameSite=Lax; Expires=Thu, 01 Jan 1970 00:00:00 GMT; Max-Age=0`;
}

export async function getUserWithPasswordByEmail(
  email: string,
): Promise<{ id: string; email: string; name: string; passwordHash: string } | null> {
  const rows = await sql()`
    SELECT id, email, name, password_hash
    FROM users
    WHERE email = ${email}
    LIMIT 1
  `;

  if (rows.length === 0) return null;

  const row = rows[0] as Record<string, unknown>;
  return {
    id: String(row.id),
    email: String(row.email),
    name: String(row.name),
    passwordHash: String(row.password_hash),
  };
}