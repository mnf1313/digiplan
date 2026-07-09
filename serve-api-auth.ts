import { neon } from "@neondatabase/serverless";
import bcrypt from "bcryptjs";

const SALT_ROUNDS = 10;
const SESSION_EXPIRY_DAYS = 30;
const SESSION_COOKIE_NAME = "digiplan_session";

function getDb() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL not set");
  return neon(url);
}

function generateToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function buildSessionCookie(token: string, expiresAt: Date): string {
  return `${SESSION_COOKIE_NAME}=${token}; HttpOnly; Path=/; SameSite=Lax; Expires=${expiresAt.toUTCString()}; Max-Age=${SESSION_EXPIRY_DAYS * 86400}`;
}

function clearSessionCookie(): string {
  return `${SESSION_COOKIE_NAME}=; HttpOnly; Path=/; SameSite=Lax; Expires=Thu, 01 Jan 1970 00:00:00 GMT; Max-Age=0`;
}

function parseSessionCookie(cookieHeader: string | null): string | null {
  if (!cookieHeader) return null;
  for (const part of cookieHeader.split(";")) {
    const trimmed = part.trim();
    if (trimmed.startsWith(`${SESSION_COOKIE_NAME}=`)) {
      return trimmed.slice(`${SESSION_COOKIE_NAME}=`.length);
    }
  }
  return null;
}

function json(data: unknown, init?: { status?: number; headers?: Record<string, string> }): Response {
  return new Response(JSON.stringify(data), {
    status: init?.status ?? 200,
    headers: { "content-type": "application/json", ...init?.headers },
  });
}

async function getUserByEmail(email: string) {
  const sql = getDb();
  const rows = await sql`SELECT id, email, name, password_hash FROM users WHERE email = ${email} LIMIT 1`;
  if (rows.length === 0) return null;
  return rows[0] as Record<string, unknown>;
}

async function getUserById(userId: string) {
  const sql = getDb();
  const rows = await sql`SELECT id, email, name, subscription_tier FROM users WHERE id = ${userId} LIMIT 1`;
  if (rows.length === 0) return null;
  return rows[0] as Record<string, unknown>;
}

async function createUser(email: string, name: string, passwordHash: string) {
  const sql = getDb();
  const rows = await sql`
    INSERT INTO users (email, name, password_hash)
    VALUES (${email}, ${name || email.split("@")[0]}, ${passwordHash})
    RETURNING id, email, name
  `;
  return rows[0] as Record<string, unknown>;
}

async function createSession(userId: string): Promise<{ token: string; expiresAt: Date }> {
  const token = generateToken();
  const expiresAt = new Date(Date.now() + SESSION_EXPIRY_DAYS * 24 * 60 * 60 * 1000);
  const sql = getDb();
  await sql`
    INSERT INTO sessions (user_id, token, expires_at)
    VALUES (${userId}, ${token}, ${expiresAt.toISOString()})
  `;
  return { token, expiresAt };
}

async function getSessionByToken(token: string) {
  const sql = getDb();
  const rows = await sql`
    SELECT id, user_id FROM sessions 
    WHERE token = ${token} AND expires_at > now() LIMIT 1
  `;
  if (rows.length === 0) return null;
  return rows[0] as Record<string, unknown>;
}

async function deleteSession(token: string) {
  const sql = getDb();
  await sql`DELETE FROM sessions WHERE token = ${token}`;
}

export default async function authHandler(req: Request): Promise<Response> {
  try {
    // GET — check session
    if (req.method === "GET") {
      const token = parseSessionCookie(req.headers.get("cookie"));
      if (!token) return json({ authenticated: false, user: null });

      const session = await getSessionByToken(token);
      if (!session) return json({ authenticated: false, user: null });

      const user = await getUserById(String(session.user_id));
      if (!user) return json({ authenticated: false, user: null });

      return json({
        authenticated: true,
        user: { id: user.id, email: user.email, name: user.name, subscriptionTier: user.subscription_tier },
      });
    }

    // POST — signup, login, logout
    if (req.method === "POST") {
      const body = await req.json() as { action: string; email?: string; password?: string; name?: string };

      if (body.action === "signup") {
        const { email, password, name } = body;
        if (!email || !password) return json({ success: false, error: "Email and password are required." }, { status: 400 });
        if (password.length < 6) return json({ success: false, error: "Password must be at least 6 characters." }, { status: 400 });

        const existing = await getUserByEmail(email);
        if (existing) return json({ success: false, error: "An account with this email already exists." }, { status: 409 });

        const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
        const user = await createUser(email, name || "", passwordHash);
        const session = await createSession(String(user.id));
        const cookie = buildSessionCookie(session.token, session.expiresAt);

        return json({ success: true, user: { id: user.id, email: user.email, name: user.name } }, { status: 201, headers: { "Set-Cookie": cookie } });
      }

      if (body.action === "login") {
        const { email, password } = body;
        if (!email || !password) return json({ success: false, error: "Email and password are required." }, { status: 400 });

        const user = await getUserByEmail(email);
        if (!user) return json({ success: false, error: "Invalid email or password." }, { status: 401 });

        const valid = await bcrypt.compare(password || "", String(user.password_hash));
        if (!valid) return json({ success: false, error: "Invalid email or password." }, { status: 401 });

        const session = await createSession(String(user.id));
        const cookie = buildSessionCookie(session.token, session.expiresAt);

        return json({ success: true, user: { id: user.id, email: user.email, name: user.name } }, { status: 200, headers: { "Set-Cookie": cookie } });
      }

      if (body.action === "logout") {
        const token = parseSessionCookie(req.headers.get("cookie"));
        if (token) await deleteSession(token);
        return json({ success: true }, { headers: { "Set-Cookie": clearSessionCookie() } });
      }

      return json({ success: false, error: `Unknown action: ${body.action}` }, { status: 400 });
    }

    return json({ success: false, error: "Method not allowed" }, { status: 405 });
  } catch (err) {
    console.error("Auth handler error:", err);
    return json({ success: false, error: "Internal server error." }, { status: 500 });
  }
}