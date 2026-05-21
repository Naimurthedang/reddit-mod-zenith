import { Devvit } from "@devvit/public-api";

export interface UserScore {
  userId: string;
  points: number;
  trustLevel: number;
  totalApproved: number;
  totalRemoved: number;
  totalBans: number;
  accountAgeDays: number;
  lastActivity: number;
  vouched: boolean;
  permanentBan: boolean;
}

export const POINTS = {
  APPROVED_POST: 10,
  APPROVED_COMMENT: 2,
  MOD_VOUCH: 50,
  MONTH_ACTIVITY: 20,
  REMOVED_POST: -30,
  TEMP_BAN: -100,
} as const;

export const DEFAULT_THRESHOLDS: Record<number, number> = {
  1: 0,
  2: 50,
  3: 200,
  4: 500,
  5: 1000,
};

export const TRUST_LEVEL_NAMES: Record<number, string> = {
  1: "New",
  2: "Known",
  3: "Trusted",
  4: "Veteran",
  5: "Elder",
};

const REDIS_USER_KEY = (userId: string) => `communitypass:user:${userId}`;

export async function getScore(
  userId: string,
  context: Devvit.Context,
): Promise<UserScore | null> {
  const data = await context.redis.hGetAll(REDIS_USER_KEY(userId));
  if (!data || Object.keys(data).length === 0) return null;

  return {
    userId,
    points: parseInt(data.points ?? "0", 10),
    trustLevel: parseInt(data.trustLevel ?? "1", 10),
    totalApproved: parseInt(data.totalApproved ?? "0", 10),
    totalRemoved: parseInt(data.totalRemoved ?? "0", 10),
    totalBans: parseInt(data.totalBans ?? "0", 10),
    accountAgeDays: parseInt(data.accountAgeDays ?? "0", 10),
    lastActivity: parseInt(data.lastActivity ?? "0", 10),
    vouched: data.vouched === "true",
    permanentBan: data.permanentBan === "true",
  };
}

export async function saveScore(
  score: UserScore,
  context: Devvit.Context,
): Promise<void> {
  const key = REDIS_USER_KEY(score.userId);
  await context.redis.hSet(key, {
    points: String(score.points),
    trustLevel: String(score.trustLevel),
    totalApproved: String(score.totalApproved),
    totalRemoved: String(score.totalRemoved),
    totalBans: String(score.totalBans),
    accountAgeDays: String(score.accountAgeDays),
    lastActivity: String(score.lastActivity),
    vouched: score.vouched ? "true" : "false",
    permanentBan: score.permanentBan ? "true" : "false",
  });
}

export async function addPoints(
  userId: string,
  points: number,
  reason: string,
  context: Devvit.Context,
): Promise<void> {
  let score = await getScore(userId, context);
  if (!score) {
    score = {
      userId,
      points: 0,
      trustLevel: 1,
      totalApproved: 0,
      totalRemoved: 0,
      totalBans: 0,
      accountAgeDays: 0,
      lastActivity: Date.now(),
      vouched: false,
      permanentBan: false,
    };
  }

  score.points += points;
  score.lastActivity = Date.now();
  await saveScore(score, context);
}

export async function deductPoints(
  userId: string,
  points: number,
  reason: string,
  context: Devvit.Context,
): Promise<void> {
  await addPoints(userId, -Math.abs(points), reason, context);
}

export async function calculatePoints(
  authorId: string,
  context: Devvit.Context,
): Promise<number> {
  let score = await getScore(authorId, context);
  if (!score) return 0;
  return score.points;
}

export function getDefaultTrustLevel(
  points: number,
  thresholds?: Record<number, number>,
): number {
  const th = thresholds ?? DEFAULT_THRESHOLDS;
  const sorted = Object.entries(th).sort((a, b) => b[1] - a[1]);

  for (const [level, threshold] of sorted) {
    if (points >= threshold) return parseInt(level, 10);
  }

  return 1;
}

export async function getConfig(
  context: Devvit.Context,
): Promise<Record<number, number>> {
  const raw = await context.redis.hGetAll("communitypass:config");
  if (!raw || Object.keys(raw).length === 0) return { ...DEFAULT_THRESHOLDS };

  return {
    1: parseInt(raw.thresholdL1 ?? String(DEFAULT_THRESHOLDS[1]), 10),
    2: parseInt(raw.thresholdL2 ?? String(DEFAULT_THRESHOLDS[2]), 10),
    3: parseInt(raw.thresholdL3 ?? String(DEFAULT_THRESHOLDS[3]), 10),
    4: parseInt(raw.thresholdL4 ?? String(DEFAULT_THRESHOLDS[4]), 10),
    5: parseInt(raw.thresholdL5 ?? String(DEFAULT_THRESHOLDS[5]), 10),
  };
}

export function formatPoints(points: number): string {
  if (points >= 0) return points.toString();
  return `-${Math.abs(points)}`;
}
