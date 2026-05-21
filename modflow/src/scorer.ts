import { Devvit } from "@devvit/public-api";
import { ModFlowSettings, getSettings } from "./config.js";

export interface ScoreResult {
  total: number;
  velocityScore: number;
  reportScore: number;
  karmaScore: number;
  ageScore: number;
  automodScore: number;
  breakdown: string;
}

export interface ScoringInput {
  upvotes: number;
  createdUtc: number;
  reports: number;
  authorKarma: number;
  authorCreatedUtc: number;
  title: string;
  body: string;
  isPost: boolean;
  domain?: string;
  flairText?: string;
  url?: string;
}

const SPAM_KEYWORDS = [
  "free",
  "click here",
  "subscribe",
  "check out my",
  "upvote",
  "vote for me",
  "giveaway",
  "lottery",
  "win a",
  "congratulations you",
  "act now",
  "limited time",
  "buy now",
  "discount",
  "promo code",
  "earn money",
  "work from home",
  "make money fast",
  "bitcoin",
  "crypto",
  "nft",
  "onlyfans",
  "referral",
  "sign up",
];

const EXCESSIVE_PUNCTUATION = /[!?]{3,}/;
const ALL_CAPS_RATIO = 0.6;
const URL_SHORTENERS = [
  "bit.ly",
  "tinyurl",
  "goo.gl",
  "shorturl",
  "short.link",
];

function isAllCapsRatioHigh(text: string): boolean {
  const letters = text.replace(/[^a-zA-Z]/g, "");
  if (letters.length < 5) return false;
  const upper = letters.replace(/[a-z]/g, "");
  return upper.length / letters.length > ALL_CAPS_RATIO;
}

function countAutoModPatterns(
  title: string,
  body: string,
  domain?: string,
  url?: string,
): number {
  let matches = 0;
  const content = `${title} ${body}`.toLowerCase();

  for (const keyword of SPAM_KEYWORDS) {
    if (content.includes(keyword)) matches++;
  }

  if (EXCESSIVE_PUNCTUATION.test(title)) matches++;
  if (isAllCapsRatioHigh(title)) matches++;

  if (domain) {
    const domainLower = domain.toLowerCase();
    for (const shortener of URL_SHORTENERS) {
      if (domainLower.includes(shortener)) {
        matches += 2;
        break;
      }
    }
  }

  if (url && url.toLowerCase().includes("utm_")) matches++;

  return matches;
}

export function calculateScore(
  input: ScoringInput,
  settings: ModFlowSettings,
): ScoreResult {
  const now = Math.floor(Date.now() / 1000);

  const ageHours = Math.max(0.0167, (now - input.createdUtc) / 3600);
  const authorAgeDays = Math.max(0, (now - input.authorCreatedUtc) / 86400);

  const totalWeight =
    settings.velocityWeight +
    settings.reportWeight +
    settings.karmaWeight +
    settings.ageWeight +
    settings.automodWeight;

  const velocityRaw = input.upvotes / ageHours;
  const velocityNorm = Math.min(1, velocityRaw / 200);
  const velocityScore = (velocityNorm * settings.velocityWeight) / totalWeight;

  const reportNorm = Math.min(1, input.reports / 20);
  const reportScore = (reportNorm * settings.reportWeight) / totalWeight;

  let karmaNorm: number;
  if (input.authorKarma < 0) {
    karmaNorm = 1;
  } else if (input.authorKarma < 100) {
    karmaNorm = 0.9;
  } else if (input.authorKarma < 500) {
    karmaNorm = 0.5;
  } else if (input.authorKarma < 2000) {
    karmaNorm = 0.2;
  } else {
    karmaNorm = 0;
  }
  const karmaScore = (karmaNorm * settings.karmaWeight) / totalWeight;

  let ageNorm: number;
  if (authorAgeDays < 1) {
    ageNorm = 1;
  } else if (authorAgeDays < 7) {
    ageNorm = 0.8;
  } else if (authorAgeDays < 30) {
    ageNorm = 0.5;
  } else if (authorAgeDays < 365) {
    ageNorm = 0.2;
  } else {
    ageNorm = 0;
  }
  const ageScore = (ageNorm * settings.ageWeight) / totalWeight;

  const autoModMatches = countAutoModPatterns(
    input.title,
    input.body,
    input.domain,
    input.url,
  );
  const automodNorm = Math.min(1, autoModMatches / 5);
  const automodScore = (automodNorm * settings.automodWeight) / totalWeight;

  const total =
    Math.round(
      (velocityScore + reportScore + karmaScore + ageScore + automodScore) *
        10 *
        10,
    ) / 10;

  const clampedTotal = Math.max(0, Math.min(10, total));

  const breakdown = `V:${(velocityNorm * 10).toFixed(1)} R:${(reportNorm * 10).toFixed(1)} K:${(karmaNorm * 10).toFixed(1)} A:${(ageNorm * 10).toFixed(1)} AM:${(automodNorm * 10).toFixed(1)}`;

  return {
    total: clampedTotal,
    velocityScore: Math.round(velocityScore * 100) / 100,
    reportScore: Math.round(reportScore * 100) / 100,
    karmaScore: Math.round(karmaScore * 100) / 100,
    ageScore: Math.round(ageScore * 100) / 100,
    automodScore: Math.round(automodScore * 100) / 100,
    breakdown,
  };
}

export interface QueueItem {
  fullname: string;
  kind: "post" | "comment";
  title: string;
  body: string;
  author: string;
  score: number;
  upvoteRatio: number;
  reports: number;
  createdUtc: number;
  authorKarma: number;
  authorCreatedUtc: number;
  domain?: string;
  url?: string;
  flairText?: string;
  priority: ScoreResult;
  priorityColor: "red" | "yellow" | "green";
}

export function getPriorityColor(score: number): "red" | "yellow" | "green" {
  if (score >= 8) return "red";
  if (score >= 5) return "yellow";
  return "green";
}

export function getPriorityLabel(score: number): string {
  if (score >= 8) return "Urgent";
  if (score >= 5) return "Medium";
  return "Low";
}

export async function scoreModQueueItem(
  item: {
    kind: string;
    data: {
      name: string;
      title?: string;
      body?: string;
      selftext?: string;
      score: number;
      upvote_ratio?: number;
      num_reports: number | null;
      created_utc: number;
      author: { name: string; total_karma?: number; created_utc?: number };
      domain?: string;
      url?: string;
      link_flair_text?: string;
    };
  },
  context: Devvit.Context,
): Promise<QueueItem | null> {
  try {
    const settings = await getSettings(context);
    const authorInfo = item.data.author;

    let authorKarma = authorInfo.total_karma ?? 0;
    let authorCreatedUtc = authorInfo.created_utc ?? item.data.created_utc;

    if (!authorInfo.total_karma || !authorInfo.created_utc) {
      try {
        const redditUser = await context.reddit.getUser(authorInfo.name);
        if (redditUser) {
          authorKarma = redditUser.totalKarma ?? authorKarma;
          authorCreatedUtc = redditUser.createdUtc ?? authorCreatedUtc;
        }
      } catch {
        // Use defaults if user lookup fails
      }
    }

    const isPost = item.kind === "t3";
    const title = item.data.title ?? "";
    const body = item.data.body ?? item.data.selftext ?? "";
    const reports = item.data.num_reports ?? 0;
    const domain = item.data.domain;

    const input: ScoringInput = {
      upvotes: item.data.score,
      createdUtc: item.data.created_utc,
      reports,
      authorKarma,
      authorCreatedUtc,
      title,
      body,
      isPost,
      domain,
      url: item.data.url,
      flairText: item.data.link_flair_text,
    };

    const priority = calculateScore(input, settings);

    return {
      fullname: item.data.name,
      kind: isPost ? "post" : "comment",
      title,
      body: body.slice(0, 200),
      author: authorInfo.name,
      score: item.data.score,
      upvoteRatio: item.data.upvote_ratio ?? 0,
      reports,
      createdUtc: item.data.created_utc,
      authorKarma,
      authorCreatedUtc,
      domain,
      url: item.data.url,
      flairText: item.data.link_flair_text,
      priority,
      priorityColor: getPriorityColor(priority.total),
    };
  } catch (e) {
    console.error("Error scoring modqueue item:", e);
    return null;
  }
}

export async function cacheScore(
  context: Devvit.Context,
  subreddit: string,
  item: QueueItem,
): Promise<void> {
  const key = `modflow:score:${subreddit}:${item.fullname}`;
  await context.redis.set(key, JSON.stringify(item));
  await context.redis.zAdd(`modflow:priority:${subreddit}`, {
    member: item.fullname,
    score: item.priority.total,
  });
}

export async function getPriorityScores(
  context: Devvit.Context,
  subreddit: string,
  minScore?: number,
  maxScore?: number,
): Promise<QueueItem[]> {
  try {
    const key = `modflow:priority:${subreddit}`;
    const members = await context.redis.zRange(key, 0, -1, {
      by: "rank",
      reverse: true,
    });

    const items: QueueItem[] = [];
    for (const member of members) {
      const scoreKey = `modflow:score:${subreddit}:${member.member}`;
      const raw = await context.redis.get(scoreKey);
      if (raw) {
        try {
          const item = JSON.parse(raw) as QueueItem;
          if (minScore !== undefined && item.priority.total < minScore)
            continue;
          if (maxScore !== undefined && item.priority.total > maxScore)
            continue;
          items.push(item);
        } catch {
          // skip corrupt entries
        }
      }
    }

    return items;
  } catch (e) {
    console.error("Error fetching priority scores:", e);
    return [];
  }
}
