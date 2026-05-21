export interface ParsedReminder {
  action: "set" | "list" | "cancel";
  time?: Date;
  text?: string;
  cancelId?: string;
}

const MONTH_NAMES: Record<string, number> = {
  january: 0,
  jan: 0,
  february: 1,
  feb: 1,
  march: 2,
  mar: 2,
  april: 3,
  apr: 3,
  may: 4,
  june: 5,
  jun: 5,
  july: 6,
  jul: 6,
  august: 7,
  aug: 7,
  september: 8,
  sep: 8,
  sept: 8,
  october: 9,
  oct: 9,
  november: 10,
  nov: 10,
  december: 11,
  dec: 11,
};

const DAY_NAMES: Record<string, number> = {
  sunday: 0,
  sun: 0,
  monday: 1,
  mon: 1,
  tuesday: 2,
  tue: 2,
  tues: 2,
  wednesday: 3,
  wed: 3,
  thursday: 4,
  thu: 4,
  thur: 4,
  thurs: 4,
  friday: 5,
  fri: 5,
  saturday: 6,
  sat: 6,
};

const LIST_RE = /^(?:!RemindMe|RemindMe!)\s+list\s*$/i;
const CANCEL_RE = /^(?:!RemindMe|RemindMe!)\s+cancel\s+(\S+)\s*$/i;
const COMMAND_RE = /^(?:!RemindMe|RemindMe!)\s+(.+)$/is;
const RELATIVE_RE =
  /^(\d+)\s*(minute|minutes|min|hour|hours|hr|day|days|week|weeks|wk|month|months|mo|year|years|yr)\s*(.*)$/i;
const ISO_DATE_RE = /^(\d{4})-(\d{2})-(\d{2})(?:\s+(.+))?$/;
const TEXT_DATE_RE =
  /^([A-Za-z]+)\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})(?:\s+(.+))?$/;
const NEXT_DAY_RE = /^next\s+(.+)$/i;

export function parseReminderCommand(text: string): ParsedReminder | null {
  const trimmed = text.trim();

  if (LIST_RE.test(trimmed)) {
    return { action: "list" };
  }

  const cancelMatch = trimmed.match(CANCEL_RE);
  if (cancelMatch) {
    return { action: "cancel", cancelId: cancelMatch[1] };
  }

  const cmdMatch = trimmed.match(COMMAND_RE);
  if (!cmdMatch) return null;

  const timeStr = cmdMatch[1].trim();

  let time = parseRelativeTime(timeStr);
  if (!time) time = parseAbsoluteTime(timeStr);
  if (!time) time = parseNamedTime(timeStr);
  if (!time) return null;

  return { action: "set", time };
}

export function parseRelativeTime(input: string): Date | null {
  const match = input.match(RELATIVE_RE);
  if (!match) return null;

  const amount = parseInt(match[1], 10);
  if (amount <= 0) return null;

  const unit = match[2].toLowerCase();

  const now = new Date();

  switch (unit) {
    case "minute":
    case "minutes":
    case "min":
      now.setMinutes(now.getMinutes() + amount);
      break;
    case "hour":
    case "hours":
    case "hr":
      now.setHours(now.getHours() + amount);
      break;
    case "day":
    case "days":
      now.setDate(now.getDate() + amount);
      break;
    case "week":
    case "weeks":
    case "wk":
      now.setDate(now.getDate() + amount * 7);
      break;
    case "month":
    case "months":
    case "mo":
      now.setMonth(now.getMonth() + amount);
      break;
    case "year":
    case "years":
    case "yr":
      now.setFullYear(now.getFullYear() + amount);
      break;
    default:
      return null;
  }

  return now;
}

export function parseAbsoluteTime(input: string): Date | null {
  const isoMatch = input.match(ISO_DATE_RE);
  if (isoMatch) {
    const year = parseInt(isoMatch[1], 10);
    const month = parseInt(isoMatch[2], 10) - 1;
    const day = parseInt(isoMatch[3], 10);
    const date = new Date(year, month, day, 12, 0, 0, 0);
    if (!isNaN(date.getTime())) {
      return date;
    }
  }

  const textMatch = input.match(TEXT_DATE_RE);
  if (textMatch) {
    const monthName = textMatch[1].toLowerCase();
    const month = MONTH_NAMES[monthName];
    if (month === undefined) return null;
    const day = parseInt(textMatch[2], 10);
    const year = parseInt(textMatch[3], 10);
    const date = new Date(year, month, day, 12, 0, 0, 0);
    if (!isNaN(date.getTime())) {
      return date;
    }
  }

  return null;
}

export function parseNamedTime(input: string): Date | null {
  const trimmed = input.trim().toLowerCase();

  if (trimmed === "tomorrow") {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    d.setHours(9, 0, 0, 0);
    return d;
  }

  if (trimmed === "next week") {
    const d = new Date();
    d.setDate(d.getDate() + 7);
    d.setHours(9, 0, 0, 0);
    return d;
  }

  if (trimmed === "next month") {
    const d = new Date();
    d.setMonth(d.getMonth() + 1);
    d.setHours(9, 0, 0, 0);
    return d;
  }

  if (trimmed === "next year") {
    const d = new Date();
    d.setFullYear(d.getFullYear() + 1);
    d.setHours(9, 0, 0, 0);
    return d;
  }

  const nextDayMatch = trimmed.match(NEXT_DAY_RE);
  if (nextDayMatch) {
    const dayName = nextDayMatch[1].trim().toLowerCase();
    const targetDay = DAY_NAMES[dayName];
    if (targetDay !== undefined) {
      const d = new Date();
      const currentDay = d.getDay();
      let daysUntil = targetDay - currentDay;
      if (daysUntil <= 0) daysUntil += 7;
      d.setDate(d.getDate() + daysUntil);
      d.setHours(9, 0, 0, 0);
      return d;
    }
  }

  if (trimmed.startsWith("in ")) {
    const inMatch = trimmed.match(
      /^in\s+(\d+)\s+(minute|minutes|min|hour|hours|hr|day|days|week|weeks|wk|month|months|mo|year|years|yr)$/i,
    );
    if (inMatch) {
      return parseRelativeTime(`${inMatch[1]} ${inMatch[2]}`);
    }
  }

  return null;
}

export function formatReminderDate(date: Date): string {
  const now = new Date();
  const diffMs = date.getTime() - now.getTime();

  if (diffMs < 0) return "already passed";

  const diffMinutes = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMinutes / 60);
  const diffDays = Math.floor(diffHours / 24);
  const diffWeeks = Math.floor(diffDays / 7);
  const diffMonths = Math.floor(diffDays / 30);
  const diffYears = Math.floor(diffDays / 365);

  if (diffMinutes < 60) {
    return diffMinutes <= 1 ? "in 1 minute" : `in ${diffMinutes} minutes`;
  }
  if (diffHours < 24) {
    return diffHours <= 1 ? "in 1 hour" : `in ${diffHours} hours`;
  }
  if (diffDays < 7) {
    return diffDays <= 1 ? "tomorrow" : `in ${diffDays} days`;
  }
  if (diffDays < 30) {
    return diffWeeks <= 1 ? "in 1 week" : `in ${diffWeeks} weeks`;
  }
  if (diffDays < 365) {
    return diffMonths <= 1 ? "in 1 month" : `in ${diffMonths} months`;
  }
  return diffYears <= 1 ? "in 1 year" : `in ${diffYears} years`;
}

export function formatReminderAbsolute(date: Date): string {
  return date.toLocaleString("en-US", {
    weekday: "short",
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  });
}
