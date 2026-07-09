/**
 * AI parser for DigiPlan.
 *
 * Takes raw OCR text from a planner photo and extracts structured events:
 * dates, times, event titles, descriptions, locations, and recurring patterns.
 * Uses regex-based date/time detection combined with NLP-like heuristics.
 */
import { OCRResult } from "./processor";

// ─── Types ────────────────────────────────────────────────────────────────

export interface ParsedEvent {
  title: string;
  description?: string;
  startTime: string; // ISO 8601
  endTime?: string; // ISO 8601
  isAllDay?: boolean;
  location?: string;
  recurrenceRule?: string;
  confidenceScore: number;
  sourceText: string;
}

export interface ParserResult {
  events: ParsedEvent[];
  rawText: string;
  confidence: number;
}

// ─── Date/Time Patterns ───────────────────────────────────────────────────

// Match common date formats
const DATE_PATTERNS = [
  // "Mon 15 Jan" or "Monday 15 January"
  /(\b(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun)[a-z]*\s+\d{1,2}\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*)/gi,
  // "15 January 2026" or "15 Jan"
  /(\b\d{1,2}\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s*(?:\d{4})?)/gi,
  // "2026-01-15" or "2026/01/15"
  /(\b\d{4}[-/]\d{1,2}[-/]\d{1,2}\b)/g,
  // "01/15/2026" or "15/01/2026"
  /(\b\d{1,2}[-/]\d{1,2}[-/]\d{2,4}\b)/g,
  // "January 15" or "Jan 15"
  /(\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{1,2}(?:th|st|nd|rd)?)/gi,
];

// Match time formats
const TIME_PATTERNS = [
  // "9:00 AM" or "9:00am"
  /(\b\d{1,2}:\d{2}\s*(?:AM|PM|am|pm))/g,
  // "9 AM" or "9am"
  /(\b\d{1,2}\s*(?:AM|PM|am|pm))/g,
  // "14:30" (24h)
  /(\b(?:[01]\d|2[0-3]):[0-5]\d\b)/g,
  // "9:00-10:00" or "9am-10am"
  /(\b\d{1,2}:\d{2}\s*(?:AM|PM|am|pm)?\s*[-–]\s*\d{1,2}:\d{2}\s*(?:AM|PM|am|pm)?)/g,
];

// Match recurring event patterns
const RECURRENCE_PATTERNS = [
  { pattern: /(?:every|each)\s+(?:mon|tue|wed|thu|fri|sat|sun)[a-z]*/gi, rule: (m: string) => `FREQ=WEEKLY;BYDAY=${getDayAbbr(m)}` },
  { pattern: /(?:every|each)\s+weekday/gi, rule: () => "FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR" },
  { pattern: /(?:every|each)\s+week/gi, rule: () => "FREQ=WEEKLY" },
  { pattern: /(?:every|each)\s+month/gi, rule: () => "FREQ=MONTHLY" },
  { pattern: /(?:every|each)\s+year/gi, rule: () => "FREQ=YEARLY" },
  { pattern: /daily/gi, rule: () => "FREQ=DAILY" },
  { pattern: /weekly/gi, rule: () => "FREQ=WEEKLY" },
  { pattern: /monthly/gi, rule: () => "FREQ=MONTHLY" },
  { pattern: /yearly|annually/gi, rule: () => "FREQ=YEARLY" },
];

function getDayAbbr(match: string): string {
  const days: Record<string, string> = {
    mon: "MO", tue: "TU", wed: "WE", thu: "TH", fri: "FR", sat: "SA", sun: "SU",
  };
  for (const [key, val] of Object.entries(days)) {
    if (match.toLowerCase().includes(key)) return val;
  }
  return "MO";
}

// Match location patterns
const LOCATION_PATTERNS = [
  /(?:at|in|@)\s+([A-Za-z0-9\s,.'-]{3,50})/g,
  /(?:room|office|conference|meeting\s+room)\s+([A-Za-z0-9\s-]{2,30})/gi,
];

// Match common event keywords
const EVENT_KEYWORDS = [
  "meeting", "call", "standup", "lunch", "dinner", "breakfast", "coffee",
  "appointment", "deadline", "review", "sync", "workshop", "training",
  "presentation", "demo", "interview", "appointment", "class", "lecture",
  "gym", "workout", "yoga", "doctor", "dentist", "party", "birthday",
  "anniversary", "holiday", "vacation", "travel", "flight", "train",
  "conference", "webinar", "catch-up", "1:1", "one-on-one",
];

// ─── Date Parsing Helpers ────────────────────────────────────────────────

const MONTH_MAP: Record<string, number> = {
  jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
  jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
  january: 0, february: 1, march: 2, april: 3, june: 5,
  july: 6, august: 7, september: 8, october: 9, november: 10, december: 11,
};

function parseDateString(dateStr: string): Date | null {
  // Normalize
  const clean = dateStr.replace(/(?:th|st|nd|rd)\b/gi, "").trim();

  // Try built-in parser first
  const parsed = new Date(clean);
  if (!isNaN(parsed.getTime()) && parsed.getFullYear() > 2020) {
    return parsed;
  }

  // Try parsing "15 January" or "Jan 15"
  const parts = clean.split(/[\s,]+/).filter(Boolean);
  if (parts.length >= 2) {
    const month = MONTH_MAP[parts[0].toLowerCase()] ?? MONTH_MAP[parts[1]?.toLowerCase()];
    const day = parseInt(parts[parts[0].toLowerCase() in MONTH_MAP ? 1 : 0]);
    const year = parts[2] ? parseInt(parts[2]) : new Date().getFullYear();

    if (month !== undefined && !isNaN(day)) {
      return new Date(year, month, day);
    }
  }

  return null;
}

function parseTimeString(timeStr: string): { hours: number; minutes: number } | null {
  const clean = timeStr.trim().toUpperCase();

  // "9:00 AM" or "9:00am"
  const ampmMatch = clean.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)?$/);
  if (ampmMatch) {
    let hours = parseInt(ampmMatch[1]);
    const minutes = parseInt(ampmMatch[2]);
    const isPM = ampmMatch[3] === "PM";
    if (isPM && hours < 12) hours += 12;
    if (!isPM && hours === 12) hours = 0;
    return { hours, minutes };
  }

  // "9 AM" or "9am"
  const hourMatch = clean.match(/^(\d{1,2})\s*(AM|PM)?$/);
  if (hourMatch) {
    let hours = parseInt(hourMatch[1]);
    const isPM = hourMatch[2] === "PM";
    if (isPM && hours < 12) hours += 12;
    if (!isPM && hours === 12) hours = 0;
    return { hours, minutes: 0 };
  }

  // "14:30" (24h)
  const militaryMatch = clean.match(/^(\d{2}):(\d{2})$/);
  if (militaryMatch) {
    return { hours: parseInt(militaryMatch[1]), minutes: parseInt(militaryMatch[2]) };
  }

  return null;
}

function parseTimeRange(timeStr: string): { start: { hours: number; minutes: number }; end: { hours: number; minutes: number } } | null {
  const rangeMatch = timeStr.match(
    /(\d{1,2}:\d{2}\s*(?:AM|PM|am|pm)?)\s*[-–]\s*(\d{1,2}:\d{2}\s*(?:AM|PM|am|pm)?)/,
  );
  if (rangeMatch) {
    const start = parseTimeString(rangeMatch[1]);
    const end = parseTimeString(rangeMatch[2]);
    if (start && end) return { start, end };
  }
  return null;
}

// ─── Main Parser ─────────────────────────────────────────────────────────

/**
 * Parse OCR text and extract structured events.
 */
export function parseOCRText(ocrResult: OCRResult): ParserResult {
  const text = ocrResult.text;
  const lines = text.split("\n").filter((l) => l.trim().length > 0);
  const events: ParsedEvent[] = [];

  let currentDate: Date | null = null;

  for (const line of lines) {
    const trimmed = line.trim();

    // Check if this line is a date header
    for (const pattern of DATE_PATTERNS) {
      const match = trimmed.match(pattern);
      if (match) {
        const parsed = parseDateString(match[0]);
        if (parsed) {
          currentDate = parsed;
          break;
        }
      }
    }

    // Check for time ranges or times
    const timeMatches = [...trimmed.matchAll(TIME_PATTERNS[3])]; // Range first
    const timeMatch = timeMatches.length > 0
      ? timeMatches[0][0]
      : (trimmed.match(TIME_PATTERNS[0]) || trimmed.match(TIME_PATTERNS[2]))?.[0];

    if (!timeMatch) continue;

    // Extract the event title (text before/after the time)
    const timeIndex = trimmed.indexOf(timeMatch);
    const title = (timeIndex > 0 ? trimmed.slice(0, timeIndex) : trimmed.slice(timeIndex + timeMatch.length)).trim();

    // Skip lines that are just times
    if (!title || title.length === 0) continue;

    // Check for event keywords to boost confidence
    const hasKeyword = EVENT_KEYWORDS.some((kw) => title.toLowerCase().includes(kw));

    // Parse time
    const range = parseTimeRange(timeMatch);
    let startTime: Date;
    let endTime: Date | undefined;

    if (range) {
      startTime = currentDate ? new Date(currentDate) : new Date();
      startTime.setHours(range.start.hours, range.start.minutes, 0, 0);
      endTime = currentDate ? new Date(currentDate) : new Date();
      endTime.setHours(range.end.hours, range.end.minutes, 0, 0);
    } else {
      const parsed = parseTimeString(timeMatch);
      if (!parsed) continue;
      startTime = currentDate ? new Date(currentDate) : new Date();
      startTime.setHours(parsed.hours, parsed.minutes, 0, 0);
      // Default: 1 hour duration
      endTime = new Date(startTime.getTime() + 60 * 60 * 1000);
    }

    // Check for location
    let location: string | undefined;
    for (const locPattern of LOCATION_PATTERNS) {
      const locMatch = trimmed.match(locPattern);
      if (locMatch) {
        location = locMatch[1].trim();
        break;
      }
    }

    // Check for recurrence
    let recurrenceRule: string | undefined;
    for (const recPattern of RECURRENCE_PATTERNS) {
      if (recPattern.pattern.test(trimmed)) {
        recPattern.pattern.lastIndex = 0;
        const match = trimmed.match(recPattern.pattern);
        if (match) {
          recurrenceRule = recPattern.rule(match[0]);
          break;
        }
      }
    }

    // Calculate confidence score
    let confidence = ocrResult.confidence / 100;
    if (hasKeyword) confidence = Math.min(1, confidence + 0.15);
    if (currentDate) confidence = Math.min(1, confidence + 0.1);
    if (range) confidence = Math.min(1, confidence + 0.05);
    if (location) confidence = Math.min(1, confidence + 0.05);

    events.push({
      title: title.charAt(0).toUpperCase() + title.slice(1),
      startTime: startTime.toISOString(),
      endTime: endTime?.toISOString(),
      isAllDay: false,
      location,
      recurrenceRule,
      confidenceScore: Math.round(confidence * 100) / 100,
      sourceText: trimmed,
    });
  }

  // If no events found with times, try to extract all-day events from date headers
  if (events.length === 0) {
    for (const line of lines) {
      for (const pattern of DATE_PATTERNS) {
        const match = line.match(pattern);
        if (match) {
          const parsed = parseDateString(match[0]);
          if (parsed) {
            const title = line.replace(match[0], "").trim();
            if (title && title.length > 2) {
              events.push({
                title: title.charAt(0).toUpperCase() + title.slice(1),
                startTime: parsed.toISOString(),
                isAllDay: true,
                confidenceScore: 0.5,
                sourceText: line,
              });
            }
          }
        }
      }
    }
  }

  const overallConfidence = events.length > 0
    ? events.reduce((sum, e) => sum + e.confidenceScore, 0) / events.length
    : ocrResult.confidence / 100;

  return {
    events,
    rawText: text,
    confidence: overallConfidence,
  };
}

/**
 * Generate a human-readable summary of extracted events.
 */
export function formatEventsSummary(events: ParsedEvent[]): string {
  if (events.length === 0) return "No events detected.";
  return events
    .map((e) => {
      const start = new Date(e.startTime);
      const time = e.isAllDay
        ? "All day"
        : start.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
      return `  • ${e.title} — ${time} (${Math.round(e.confidenceScore * 100)}% confidence)`;
    })
    .join("\n");
}