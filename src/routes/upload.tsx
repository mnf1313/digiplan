import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useState, useRef, useCallback, useEffect } from "react";

export const Route = createFileRoute("/upload")({
  component: UploadPage,
});

function UploadPage() {
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [user, setUser] = useState<{ id: string; email: string; name: string } | null>(null);
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [phase, setPhase] = useState<"idle" | "uploading" | "processing" | "done" | "error">("idle");
  const [progress, setProgress] = useState(0);
  const [errorMessage, setErrorMessage] = useState("");
  const [parsedEvents, setParsedEvents] = useState<
    { title: string; startTime: string; confidence: number }[]
  >([]);

  // Check auth on mount
  useEffect(() => {
    fetch("/api/auth")
      .then((r) => r.json())
      .then((data) => {
        if (data.authenticated) {
          setUser(data.user);
        } else {
          navigate({ to: "/login" });
        }
      })
      .catch(() => navigate({ to: "/login" }))
      .finally(() => setCheckingAuth(false));
  }, [navigate]);

  const handleFile = useCallback((file: File) => {
    // Validate file type
    if (!file.type.startsWith("image/")) {
      setErrorMessage("Please select an image file.");
      return;
    }

    // Show preview
    const reader = new FileReader();
    reader.onload = (e) => {
      setPreviewUrl(e.target?.result as string);
    };
    reader.readAsDataURL(file);

    setErrorMessage("");
    setPhase("uploading");
    setProgress(0);

    // Simulate upload progress
    let p = 0;
    const interval = setInterval(() => {
      p += 5;
      if (p >= 100) {
        clearInterval(interval);
        setProgress(100);

        // Move to processing phase
        setPhase("processing");
        setProgress(0);

        // Simulate AI parsing
        let pp = 0;
        const processInterval = setInterval(() => {
          pp += 10;
          setProgress(pp);
          if (pp >= 100) {
            clearInterval(processInterval);
            // Mock parsed events
            setParsedEvents([
              {
                title: "Team standup",
                startTime: "2026-07-09 09:00",
                confidence: 0.95,
              },
              {
                title: "Lunch with Sarah",
                startTime: "2026-07-09 12:30",
                confidence: 0.88,
              },
              {
                title: "Gym",
                startTime: "2026-07-09 18:00",
                confidence: 0.72,
              },
            ]);
            setPhase("done");
          }
        }, 300);
      }
    }, 100);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      const file = e.dataTransfer.files[0];
      if (file) handleFile(file);
    },
    [handleFile],
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) handleFile(file);
    },
    [handleFile],
  );

  const handleCameraCapture = useCallback(() => {
    // Use the file input with capture attribute
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    input.capture = "environment";
    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (file) handleFile(file);
    };
    input.click();
  }, [handleFile]);

  const resetUpload = useCallback(() => {
    setPreviewUrl(null);
    setPhase("idle");
    setProgress(0);
    setErrorMessage("");
    setParsedEvents([]);
  }, []);

  if (checkingAuth) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-indigo-600 border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl px-6 py-12">
      <div className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight">Upload planner photo</h1>
        <p className="mt-2 text-gray-600 dark:text-gray-400">
          Snap a photo of your planner page and we'll parse the entries.
        </p>
      </div>

      {/* ── Upload Zone ── */}
      {(phase === "idle" || phase === "error") && (
        <div
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onClick={() => fileInputRef.current?.click()}
          className={`cursor-pointer rounded-2xl border-2 border-dashed p-16 text-center transition-all ${
            isDragging
              ? "border-indigo-500 bg-indigo-50 dark:bg-indigo-950/50"
              : "border-gray-300 hover:border-indigo-400 hover:bg-gray-50 dark:border-gray-700 dark:hover:border-indigo-600 dark:hover:bg-gray-900"
          }`}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handleInputChange}
            className="hidden"
          />

          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-indigo-100 dark:bg-indigo-950">
            <svg
              className="h-8 w-8 text-indigo-600 dark:text-indigo-400"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
              />
            </svg>
          </div>

          <p className="text-lg font-semibold text-gray-700 dark:text-gray-300">
            Drag and drop your planner photo here
          </p>
          <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">or click to browse</p>

          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              handleCameraCapture();
            }}
            className="mx-auto mt-6 flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-5 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
          >
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z"
              />
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M15 13a3 3 0 11-6 0 3 3 0 016 0z"
              />
            </svg>
            Take a photo with camera
          </button>

          <p className="mt-4 text-xs text-gray-400">Supports JPG, PNG, WebP — max 20MB</p>
        </div>
      )}

      {/* ── Error Message ── */}
      {phase === "error" && (
        <div className="mb-6 rounded-xl border border-red-200 bg-red-50 p-4 dark:border-red-900 dark:bg-red-950">
          <p className="text-sm font-medium text-red-700 dark:text-red-400">{errorMessage}</p>
        </div>
      )}

      {/* ── Preview & Progress ── */}
      {previewUrl && (phase === "uploading" || phase === "processing") && (
        <div className="space-y-6">
          <div className="overflow-hidden rounded-2xl border border-gray-200 dark:border-gray-800">
            <img
              src={previewUrl}
              alt="Planner preview"
              className="max-h-96 w-full object-contain"
            />
          </div>

          <div className="rounded-2xl border border-gray-200 bg-white p-8 dark:border-gray-800 dark:bg-gray-900">
            <div className="mb-4 flex items-center gap-3">
              {phase === "uploading" ? (
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-100 dark:bg-blue-950">
                  <svg
                    className="h-5 w-5 animate-pulse text-blue-600 dark:text-blue-400"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M9 19l3 3m0 0l3-3m-3 3V10"
                    />
                  </svg>
                </div>
              ) : (
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-purple-100 dark:bg-purple-950">
                  <svg
                    className="h-5 w-5 animate-spin text-purple-600 dark:text-purple-400"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"
                    />
                  </svg>
                </div>
              )}
              <div>
                <p className="font-semibold text-gray-900 dark:text-white">
                  {phase === "uploading" ? "Uploading image..." : "Parsing your entries..."}
                </p>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  {phase === "uploading"
                    ? "Sending your photo for processing"
                    : "AI is reading your handwriting"}
                </p>
              </div>
            </div>

            {/* Progress bar */}
            <div className="h-2 w-full overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700">
              <div
                className="h-full rounded-full bg-indigo-600 transition-all duration-300"
                style={{ width: `${progress}%` }}
              />
            </div>
            <p className="mt-2 text-right text-xs text-gray-400">{progress}%</p>
          </div>

          <button
            onClick={resetUpload}
            className="text-sm font-medium text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
          >
            Cancel and upload a different photo
          </button>
        </div>
      )}

      {/* ── Parsed Results ── */}
      {phase === "done" && (
        <div className="space-y-6">
          <div className="overflow-hidden rounded-2xl border border-gray-200 dark:border-gray-800">
            <img
              src={previewUrl!}
              alt="Planner preview"
              className="max-h-48 w-full object-contain"
            />
          </div>

          <div className="rounded-2xl border border-green-200 bg-green-50 p-6 dark:border-green-900 dark:bg-green-950">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-green-100 dark:bg-green-950">
                <svg
                  className="h-6 w-6 text-green-600 dark:text-green-400"
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
              <div>
                <p className="font-semibold text-green-800 dark:text-green-300">
                  Parsing complete!
                </p>
                <p className="text-sm text-green-700 dark:text-green-400">
                  Found {parsedEvents.length} events
                </p>
              </div>
            </div>
          </div>

          {/* Events list */}
          <div className="space-y-3">
            <h2 className="text-lg font-semibold">Detected events</h2>
            {parsedEvents.map((event, i) => (
              <div
                key={i}
                className="flex items-center justify-between rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-900"
              >
                <div>
                  <p className="font-medium text-gray-900 dark:text-white">{event.title}</p>
                  <p className="text-sm text-gray-500 dark:text-gray-400">{event.startTime}</p>
                </div>
                <div className="flex items-center gap-3">
                  <span
                    className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
                      event.confidence > 0.9
                        ? "bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-400"
                        : event.confidence > 0.7
                          ? "bg-yellow-100 text-yellow-700 dark:bg-yellow-950 dark:text-yellow-400"
                          : "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-400"
                    }`}
                  >
                    {Math.round(event.confidence * 100)}%
                  </span>
                </div>
              </div>
            ))}
          </div>

          <div className="flex flex-col gap-3 sm:flex-row">
            <button
              onClick={resetUpload}
              className="flex-1 rounded-lg border border-gray-300 bg-white px-6 py-3 text-center text-sm font-semibold text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300 dark:hover:bg-gray-800"
            >
              Upload another photo
            </button>
            <Link
              to="/dashboard"
              className="flex-1 rounded-lg bg-indigo-600 px-6 py-3 text-center text-sm font-semibold text-white hover:bg-indigo-500"
            >
              View sync history
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}