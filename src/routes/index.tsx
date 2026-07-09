import { createFileRoute, Link } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  component: Home,
});

function Home() {
  return (
    <main>
      {/* ── Hero Section ── */}
      <section className="relative overflow-hidden px-6 pb-32 pt-20 sm:pt-32">
        <div className="absolute inset-0 -z-10 bg-gradient-to-br from-indigo-50 via-white to-purple-50 dark:from-gray-950 dark:via-gray-950 dark:to-indigo-950" />
        <div className="absolute inset-0 -z-10 bg-[radial-gradient(circle_at_30%_20%,rgba(99,102,241,0.08),transparent_50%)] dark:bg-[radial-gradient(circle_at_30%_20%,rgba(99,102,241,0.15),transparent_50%)]" />

        <div className="mx-auto max-w-6xl text-center">
          <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-indigo-200 bg-indigo-50 px-4 py-1.5 text-sm font-medium text-indigo-700 dark:border-indigo-800 dark:bg-indigo-950 dark:text-indigo-300">
            <span className="h-2 w-2 rounded-full bg-indigo-500" />
            Paper + Digital. Finally unified.
          </div>

          <h1 className="mx-auto max-w-4xl text-5xl font-bold tracking-tight sm:text-7xl">
            Snap your paper planner.
            <br />
            <span className="bg-gradient-to-r from-indigo-600 to-purple-600 bg-clip-text text-transparent">
              It syncs to digital.
            </span>
          </h1>

          <p className="mx-auto mt-6 max-w-2xl text-lg text-gray-600 dark:text-gray-400 sm:text-xl">
            Take a photo of your handwritten planner — stickers, highlights, and all — and
            have every entry automatically parsed and synced to Google Calendar, Apple Calendar,
            or Notion. No more typing everything twice.
          </p>

          <div className="mt-10 flex items-center justify-center gap-4">
            <Link
              to="/signup"
              className="rounded-xl bg-indigo-600 px-8 py-4 text-base font-semibold text-white shadow-lg shadow-indigo-200 hover:bg-indigo-500 dark:shadow-indigo-950"
            >
              Get started free
            </Link>
            <a
              href="#how-it-works"
              className="rounded-xl border border-gray-300 bg-white px-8 py-4 text-base font-semibold text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300 dark:hover:bg-gray-800"
            >
              How it works
            </a>
          </div>

          <p className="mt-4 text-sm text-gray-500 dark:text-gray-500">
            Free plan: 10 syncs/month. No credit card required.
          </p>
        </div>
      </section>

      {/* ── How It Works ── */}
      <section id="how-it-works" className="px-6 py-24">
        <div className="mx-auto max-w-6xl">
          <div className="mb-16 text-center">
            <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
              Three simple steps
            </h2>
            <p className="mt-4 text-lg text-gray-600 dark:text-gray-400">
              From paper to pixel in seconds.
            </p>
          </div>

          <div className="grid gap-8 md:grid-cols-3">
            {[
              {
                step: "01",
                title: "Snap a photo",
                description:
                  "Open the app and take a picture of your planner page — any layout, any handwriting, any stickers.",
                icon: "📸",
              },
              {
                step: "02",
                title: "AI parses it",
                description:
                  "Our engine reads dates, times, titles, and recurring events from your handwriting with high accuracy.",
                icon: "🧠",
              },
              {
                step: "03",
                title: "Syncs everywhere",
                description:
                  "Events appear in Google Calendar, Apple Calendar, or Notion — automatically, with no retyping.",
                icon: "🔄",
              },
            ].map((item) => (
              <div
                key={item.step}
                className="group rounded-2xl border border-gray-200 bg-white p-8 transition-all hover:border-indigo-200 hover:shadow-lg dark:border-gray-800 dark:bg-gray-900 dark:hover:border-indigo-800"
              >
                <span className="mb-4 block text-4xl">{item.icon}</span>
                <span className="mb-2 block text-sm font-semibold text-indigo-600 dark:text-indigo-400">
                  Step {item.step}
                </span>
                <h3 className="mb-3 text-xl font-bold">{item.title}</h3>
                <p className="leading-relaxed text-gray-600 dark:text-gray-400">
                  {item.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Features ── */}
      <section className="border-t border-gray-200 bg-gray-50 px-6 py-24 dark:border-gray-800 dark:bg-gray-950">
        <div className="mx-auto max-w-6xl">
          <div className="mb-16 text-center">
            <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
              Everything you need
            </h2>
            <p className="mt-4 text-lg text-gray-600 dark:text-gray-400">
              Designed for people who love their paper planner but need digital alerts.
            </p>
          </div>

          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {[
              {
                title: "Multi-calendar sync",
                description:
                  "Connect Google Calendar, Apple Calendar (CalDAV), and Notion — all at once, all in sync.",
              },
              {
                title: "Recurring events",
                description:
                  "Detects weekly meetings, monthly reminders, and repeating patterns from your handwriting.",
              },
              {
                title: "Handwriting OCR",
                description:
                  "Trained on real bullet journals and daily planners — works with messy handwriting too.",
              },
              {
                title: "Privacy first",
                description:
                  "Your images are encrypted and auto-deleted after processing. We never train on your data.",
              },
              {
                title: "Multiple notebooks",
                description:
                  "Switch between work, personal, and hobby planners. Each syncs independently.",
              },
              {
                title: "Review before sync",
                description:
                  "Preview parsed events before they go to your calendar. Edit or dismiss individual entries.",
              },
            ].map((feature) => (
              <div
                key={feature.title}
                className="rounded-xl border border-gray-200 bg-white p-6 dark:border-gray-800 dark:bg-gray-900"
              >
                <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-indigo-100 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300">
                  <svg
                    className="h-5 w-5"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M5 13l4 4L19 7"
                    />
                  </svg>
                </div>
                <h3 className="mb-2 text-lg font-semibold">{feature.title}</h3>
                <p className="text-sm leading-relaxed text-gray-600 dark:text-gray-400">
                  {feature.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Pricing ── */}
      <section className="px-6 py-24">
        <div className="mx-auto max-w-6xl">
          <div className="mb-16 text-center">
            <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
              Simple pricing
            </h2>
            <p className="mt-4 text-lg text-gray-600 dark:text-gray-400">
              Start free. Upgrade when you need more.
            </p>
          </div>

          <div className="mx-auto grid max-w-3xl gap-8 md:grid-cols-2">
            {/* Free Tier */}
            <div className="rounded-2xl border border-gray-200 bg-white p-8 dark:border-gray-800 dark:bg-gray-900">
              <h3 className="text-xl font-bold">Free</h3>
              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                For casual planners
              </p>
              <p className="mt-6">
                <span className="text-4xl font-bold">$0</span>
                <span className="text-gray-500 dark:text-gray-400">/mo</span>
              </p>
              <ul className="mt-6 space-y-3 text-sm">
                {["10 syncs per month", "1 calendar connection", "Basic OCR parsing"].map(
                  (item) => (
                    <li key={item} className="flex items-center gap-2">
                      <svg
                        className="h-4 w-4 flex-shrink-0 text-green-500"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M5 13l4 4L19 7"
                        />
                      </svg>
                      {item}
                    </li>
                  ),
                )}
              </ul>
              <Link
                to="/signup"
                className="mt-8 block w-full rounded-lg border border-gray-300 bg-white px-4 py-3 text-center text-sm font-semibold text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300 dark:hover:bg-gray-800"
              >
                Get started free
              </Link>
            </div>

            {/* Pro Tier */}
            <div className="relative rounded-2xl border-2 border-indigo-500 bg-white p-8 shadow-xl shadow-indigo-100 dark:border-indigo-500 dark:bg-gray-900 dark:shadow-indigo-950">
              <span className="absolute -top-3 left-6 rounded-full bg-indigo-600 px-4 py-1 text-xs font-semibold text-white">
                Popular
              </span>
              <h3 className="text-xl font-bold">Pro</h3>
              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                For power planners
              </p>
              <p className="mt-6">
                <span className="text-4xl font-bold">$7</span>
                <span className="text-gray-500 dark:text-gray-400">/mo</span>
              </p>
              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                or $60/year
              </p>
              <ul className="mt-6 space-y-3 text-sm">
                {[
                  "Unlimited syncs",
                  "All calendar integrations",
                  "Multi-page / notebook support",
                  "Recurring event detection",
                  "Team sharing features",
                ].map((item) => (
                  <li key={item} className="flex items-center gap-2">
                    <svg
                      className="h-4 w-4 flex-shrink-0 text-green-500"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M5 13l4 4L19 7"
                      />
                    </svg>
                    {item}
                  </li>
                ))}
              </ul>
              <Link
                to="/signup"
                className="mt-8 block w-full rounded-lg bg-indigo-600 px-4 py-3 text-center text-sm font-semibold text-white shadow-sm hover:bg-indigo-500"
              >
                Start free trial
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* ── CTA ── */}
      <section className="bg-indigo-600 px-6 py-24 dark:bg-indigo-950">
        <div className="mx-auto max-w-3xl text-center">
          <h2 className="text-3xl font-bold tracking-tight text-white sm:text-4xl">
            Ready to bridge your planning?
          </h2>
          <p className="mt-4 text-lg text-indigo-200">
            Stop duplicating entries. Start syncing — free.
          </p>
          <Link
            to="/signup"
            className="mt-8 inline-block rounded-xl bg-white px-8 py-4 text-base font-semibold text-indigo-600 shadow-lg hover:bg-indigo-50"
          >
            Get started for free
          </Link>
        </div>
      </section>
    </main>
  );
}