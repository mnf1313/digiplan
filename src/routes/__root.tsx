import {
  HeadContent,
  Outlet,
  Scripts,
  createRootRoute,
  Link,
  useRouterState,
} from "@tanstack/react-router";
import type { ReactNode } from "react";
import { useState, useEffect } from "react";

import appCss from "~/styles/app.css?url";

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "DigiPlan — Snap your paper planner. Sync to digital." },
      {
        name: "description",
        content:
          "Snap a photo of your physical planner and have entries automatically synced to Google Calendar, Apple Calendar, and Notion.",
      },
    ],
    links: [{ rel: "stylesheet", href: appCss }],
  }),
  notFoundComponent: () => (
    <div className="flex min-h-dvh items-center justify-center px-6 text-center">
      <div>
        <h1 className="text-4xl font-bold tracking-tight">Page not found</h1>
        <p className="mt-2 text-gray-600 dark:text-gray-400">
          The page you're looking for doesn't exist.
        </p>
        <Link
          to="/"
          className="mt-6 inline-block rounded-lg bg-indigo-600 px-6 py-3 text-sm font-semibold text-white hover:bg-indigo-500"
        >
          Go home
        </Link>
      </div>
    </div>
  ),
  component: RootComponent,
});

function RootComponent() {
  const [user, setUser] = useState<{
    id: string;
    email: string;
    name: string;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  useEffect(() => {
    fetch("/api/auth")
      .then((r) => r.json())
      .then((data) => {
        if (data.authenticated) setUser(data.user);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const isAuthPage = ["/login", "/signup"].includes(pathname);

  return (
    <RootDocument>
      {/* ── Navbar ── */}
      <header className="sticky top-0 z-50 border-b border-gray-200 bg-white/80 backdrop-blur-md dark:border-gray-800 dark:bg-gray-950/80">
        <nav className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
          <Link to="/" className="flex items-center gap-2 text-xl font-bold tracking-tight">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-600 text-sm font-bold text-white">
              D
            </span>
            DigiPlan
          </Link>

          <div className="flex items-center gap-6">
            {!isAuthPage && (
              <>
                <Link
                  to="/"
                  className="hidden text-sm font-medium text-gray-600 hover:text-gray-900 sm:inline dark:text-gray-400 dark:hover:text-white"
                >
                  Home
                </Link>
                {user && (
                  <Link
                    to="/dashboard"
                    className="text-sm font-medium text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white"
                  >
                    Dashboard
                  </Link>
                )}
                {user && (
                  <Link
                    to="/upload"
                    className="text-sm font-medium text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white"
                  >
                    Upload
                  </Link>
                )}
              </>
            )}

            {!loading && (
              <>
                {user ? (
                  <div className="flex items-center gap-3">
                    <span className="hidden text-sm text-gray-500 sm:inline dark:text-gray-400">
                      {user.name}
                    </span>
                    <button
                      onClick={async () => {
                        await fetch("/api/auth", {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ action: "logout" }),
                        });
                        window.location.href = "/";
                      }}
                      className="rounded-lg bg-gray-100 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
                    >
                      Log out
                    </button>
                  </div>
                ) : !isAuthPage ? (
                  <div className="flex items-center gap-3">
                    <Link
                      to="/login"
                      className="text-sm font-medium text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white"
                    >
                      Log in
                    </Link>
                    <Link
                      to="/signup"
                      className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500"
                    >
                      Sign up
                    </Link>
                  </div>
                ) : null}
              </>
            )}
          </div>
        </nav>
      </header>

      {/* ── Page Content ── */}
      <Outlet />

      {/* ── Footer ── */}
      <footer className="border-t border-gray-200 bg-gray-50 py-12 dark:border-gray-800 dark:bg-gray-950">
        <div className="mx-auto max-w-6xl px-6">
          <div className="flex flex-col items-center justify-between gap-4 sm:flex-row">
            <Link to="/" className="flex items-center gap-2 text-lg font-bold tracking-tight">
              <span className="flex h-7 w-7 items-center justify-center rounded-md bg-indigo-600 text-xs font-bold text-white">
                D
              </span>
              DigiPlan
            </Link>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              &copy; {new Date().getFullYear()} DigiPlan. All rights reserved.
            </p>
          </div>
        </div>
      </footer>
    </RootDocument>
  );
}

function RootDocument({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body className="flex min-h-dvh flex-col">
        <div className="flex-1">{children}</div>
        <Scripts />
      </body>
    </html>
  );
}