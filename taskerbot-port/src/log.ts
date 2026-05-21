import { Devvit } from "@devvit/public-api";

const LOG_KEY = "taskerbot:logs";
const MAX_LOG_ENTRIES = 500;

export interface LogEntry {
  timestamp: string;
  moderator: string;
  command: string;
  targetContent: string;
  targetAuthor: string;
  result: "success" | "failure";
  details?: string;
}

export async function logAction(
  entry: Omit<LogEntry, "timestamp">,
  context: Devvit.Context,
): Promise<void> {
  const fullEntry: LogEntry = {
    ...entry,
    timestamp: new Date().toISOString(),
  };

  const raw = await context.redis.get(LOG_KEY);
  let entries: LogEntry[] = [];
  if (raw) {
    try {
      entries = JSON.parse(raw);
    } catch {
      entries = [];
    }
  }

  entries.unshift(fullEntry);

  if (entries.length > MAX_LOG_ENTRIES) {
    entries = entries.slice(0, MAX_LOG_ENTRIES);
  }

  await context.redis.set(LOG_KEY, JSON.stringify(entries));
}

export async function getLogs(context: Devvit.Context): Promise<LogEntry[]> {
  const raw = await context.redis.get(LOG_KEY);
  if (!raw) return [];
  try {
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

export function formatLogEntry(entry: LogEntry): string {
  const date = new Date(entry.timestamp);
  const timeStr = date.toLocaleString();
  const status = entry.result === "success" ? "✅" : "❌";
  return `${status} [${timeStr}] u/${entry.moderator}: ${entry.command} → ${entry.targetContent} (u/${entry.targetAuthor})`;
}
