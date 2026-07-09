import { createFileRoute, Link } from "@tanstack/react-router";

export const Route = createFileRoute("/pricing")({
  component: PricingPage,
});

function PricingPage() {
  return (
    <div className="mx-auto max-w-6xl px-6 py-20">
      <div className="mb-16 text-center">
        <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">Simple pricing</h1>
        <p className="mt-4 text-lg text-gray-600 dark:text-gray-400">
          Start free. Upgrade when you need more.
        </p>
      </div>

      <div className="mx-auto grid max-w-3xl gap-8 md:grid-cols-2">
        {/* Free Tier */}
        <div className="rounded-2xl border border-gray-200 bg-white p-8 dark:border-gray-800 dark:bg-gray-900">
          <h2 className="text-xl font-bold">Free</h2>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">For casual planners</p>
          <p className="mt-6">
            <span className="text-4xl font-bold">$0</span>
            <span className="text-gray-500 dark:text-gray-400">/mo</span>
          </p>
          <ul className="mt-6 space-y-3 text-sm">
            {["10 syncs per month", "1 calendar connection", "Basic OCR parsing"].map(
              (item) => (
                <li key={item} className="flex items-center gap-2">
                  <svg className="h-4 w-4 flex-shrink-0 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
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
          <h2 className="text-xl font-bold">Pro</h2>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">For power planners</p>
          <p className="mt-6">
            <span className="text-4xl font-bold">$7</span>
            <span className="text-gray-500 dark:text-gray-400">/mo</span>
          </p>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">or $60/year</p>
          <ul className="mt-6 space-y-3 text-sm">
            {[
              "Unlimited syncs",
              "All calendar integrations",
              "Multi-page / notebook support",
              "Recurring event detection",
              "Team sharing features",
            ].map((item) => (
              <li key={item} className="flex items-center gap-2">
                <svg className="h-4 w-4 flex-shrink-0 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
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
  );
}