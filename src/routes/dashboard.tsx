import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import {
  getSessionFromToken,
  getUserById,
  parseSessionCookie,
} from "~/lib/auth";

type User = {
  id: string;
  email: string;
  name: string;
  subscriptionTier: string;
};

type SyncRecord = {
  id: string;
  status: string;
  images_uploaded: number;
  events_parsed: number;
  events_synced: number;
  started_at: string;
  completed_at: string | null;
  error_message: string;
};

type CalendarConnection = {
  id: string;
  provider: string;
  calendar_name: string;
  is_active: boolean;
};

// ── Server Functions ──────────────────────────────────────────────────────

const getServerUser = createServerFn({ method: "GET" }).handler(async () => {
  const { getRequest } = await import("@tanstack/react-start/server");
  const request = getRequest();
  if (!request) return { user: null };

  const token = parseSessionCookie(request.headers.get("cookie"));
  if (!token) return { user: null };

  const session = await getSessionFromToken(token);
  if (!session) return { user: null };

  const user = await getUserById(session.userId);
  if (!user) return { user: null };

  return { user };
});

const getServerDashboard = createServerFn({ method: "GET" }).handler(
  async () => {
    const { getRequest } = await import("@tanstack/react-start/server");
    const request = getRequest();
    if (!request) return { syncs: [], connections: [] };

    const token = parseSessionCookie(request.headers.get("cookie"));
    if (!token) return { syncs: [], connections: [] };

    const session = await getSessionFromToken(token);
    if (!session) return { syncs: [], connections: [] };

    const { sql } = await import("~/db");

    const syncs = (await sql()`
      SELECT id, status, images_uploaded, events_parsed, events_synced,
             started_at, completed_at, error_message
      FROM sync_history
      WHERE user_id = ${session.userId}
      ORDER BY started_at DESC
      LIMIT 10
    `) as unknown as SyncRecord[];

    const connections = (await sql()`
      SELECT id, provider, calendar_name, is_active
      FROM calendar_connections
      WHERE user_id = ${session.userId}
      ORDER BY created_at DESC
    `) as unknown as CalendarConnection[];

    return {
      syncs: syncs.map((s: Record<string, unknown>) => ({
        ...s,
        started_at: String(s.started_at),
        completed_at: s.completed_at ? String(s.completed_at) : null,
      })),
      connections: connections.map((c: Record<string, unknown>) => ({
        ...c,
      })),
    };
  },
);

// ── Route ─────────────────────────────────────────────────────────────────

export const Route = createFileRoute("/dashboard")({
  component: DashboardPage,
  loader: async () => {
    const { user } = await getServerUser();
    if (!user) {
      return { user: null, redirect: "/login" as const };
    }
    return { user, redirect: null };
  },
});

// ── Component ─────────────────────────────────────────────────────────────

function DashboardPage() {
  const navigate = useNavigate();
  const loaderData = Route.useLoaderData();
  const [syncs, setSyncs] = useState<SyncRecord[]>([]);
  const [connections, setConnections] = useState<CalendarConnection[]>([]);
  const [loggingOut, setLoggingOut] = useState(false);

  useEffect(() => {
    if (loaderData.redirect) {
      navigate({ to: loaderData.redirect });
      return;
    }

    getServerDashboard().then((data) => {
      setSyncs(data.syncs as SyncRecord[]);
      setConnections(data.connections as CalendarConnection[]);
    });
  }, [loaderData, navigate]);

  const user = loaderData.user;
  if (!user) return null;

  const handleLogout = async () => {
    setLoggingOut(true);
    await fetch("/api/auth", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "logout" }),
    });
    navigate({ to: "/" });
  };

  const providerIcons: Record<string, string> = {
    google: "🔴",
    apple: "⚫",
    notion: "⚪",
  };

  return (
    <div className="min-h-dvh bg-gray-50 dark:bg-gray-950">
      {/* Header */}
      <header className="border-b border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
          <Link
            to="/dashboard"
            className="text-lg font-bold tracking-tight text-gray-900 dark:text-white"
          >
            DigiPlan
          </Link>
          <div className="flex items-center gap-4">
            <span className="text-sm text-gray-600 dark:text-gray-400">
              {user.name || user.email}
            </span>
            <span className="rounded-full bg-indigo-100 px-2.5 py-0.5 text-xs font-medium text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300">
              {user.subscriptionTier === "pro" ? "Pro" : "Free"}
            </span>
            <button
              onClick={handleLogout}
              disabled={loggingOut}
              className="rounded-lg px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800"
            >
              {loggingOut ? "Logging out..." : "Log out"}
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl space-y-8 px-6 py-8">
        {/* Welcome */}
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-gray-900 dark:text-white">
            Welcome, {user.name || user.email}
          </h2>
          <p className="mt-1 text-gray-600 dark:text-gray-400">
            Upload a photo of your planner to sync events to your connected calendars.
          </p>
        </div>

        {/* Quick Upload CTA */}
        <div className="rounded-xl border-2 border-dashed border-indigo-300 bg-indigo-50 p-8 text-center dark:border-indigo-700 dark:bg-indigo-950/30">
          <p className="text-lg font-semibold text-indigo-700 dark:text-indigo-300">
            📸 Snap your planner page
          </p>
          <p className="mt-1 text-sm text-indigo-600 dark:text-indigo-400">
            Upload coming soon — connect your calendars first
          </p>
        </div>

        {/* Connected Calendars */}
        <section>
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
              Connected Calendars
            </h3>
            <button className="rounded-lg bg-indigo-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-indigo-500">
              + Add Calendar
            </button>
          </div>

          {connections.length === 0 ? (
            <div className="rounded-xl border border-gray-200 bg-white p-6 text-center dark:border-gray-800 dark:bg-gray-900">
              <p className="text-sm text-gray-500 dark:text-gray-400">
                No calendars connected yet.
              </p>
              <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">
                Connect Google Calendar, Apple Calendar, or Notion to start syncing.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {connections.map((conn) => (
                <div
                  key={conn.id}
                  className="flex items-center justify-between rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-900"
                >
                  <div className="flex items-center gap-3">
                    <span className="text-xl">
                      {providerIcons[conn.provider] || "📅"}
                    </span>
                    <div>
                      <p className="font-medium text-gray-900 dark:text-white">
                        {conn.calendar_name || conn.provider.charAt(0).toUpperCase() + conn.provider.slice(1)}
                      </p>
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        {conn.is_active ? "Active" : "Disconnected"}
                      </p>
                    </div>
                  </div>
                  <span
                    className={`h-2.5 w-2.5 rounded-full ${conn.is_active ? "bg-green-500" : "bg-gray-300"}`}
                  />
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Sync History */}
        <section>
          <h3 className="mb-4 text-lg font-semibold text-gray-900 dark:text-white">
            Recent Syncs
          </h3>

          {syncs.length === 0 ? (
            <div className="rounded-xl border border-gray-200 bg-white p-6 text-center dark:border-gray-800 dark:bg-gray-900">
              <p className="text-sm text-gray-500 dark:text-gray-400">
                No syncs yet.
              </p>
              <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">
                Upload a planner photo to see your sync history here.
              </p>
            </div>
          ) : (
            <div className="overflow-hidden rounded-xl border border-gray-200 dark:border-gray-800">
              <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-800">
                <thead className="bg-gray-50 dark:bg-gray-900">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
                      Status
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
                      Events
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
                      Date
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 bg-white dark:divide-gray-800 dark:bg-gray-900">
                  {syncs.map((sync) => (
                    <tr key={sync.id}>
                      <td className="whitespace-nowrap px-4 py-3">
                        <span
                          className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
                            sync.status === "completed"
                              ? "bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-300"
                              : sync.status === "failed"
                                ? "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300"
                                : sync.status === "processing"
                                  ? "bg-yellow-100 text-yellow-700 dark:bg-yellow-950 dark:text-yellow-300"
                                  : "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300"
                          }`}
                        >
                          {sync.status}
                        </span>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-700 dark:text-gray-300">
                        {sync.events_parsed} parsed / {sync.events_synced} synced
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-500 dark:text-gray-400">
                        {new Date(sync.started_at).toLocaleDateString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}