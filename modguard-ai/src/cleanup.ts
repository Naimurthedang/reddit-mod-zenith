import { Devvit } from "@devvit/public-api";

const CLEANUP_JOB_NAME = "daily_cleanup";
const SCORE_KEY_PREFIX = "score:";
const DAILY_FLAG_PREFIX = "daily_flag_count:";
const DAILY_AVG_PREFIX = "daily_avg_score:";
const ACCOUNT_SCORES_KEY = "account_scores";
const LAST_CLEANUP_KEY = "last_cleanup_ts";

export function getDateString(date?: Date): string {
  const d = date || new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getDateBefore(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return getDateString(d);
}

function getDateRange(daysBack: number): string[] {
  const dates: string[] = [];
  for (let i = daysBack - 1; i >= 0; i--) {
    dates.push(getDateBefore(i));
  }
  return dates;
}

export async function recordScore(
  redis: Devvit.RedisClient,
  id: string,
  score: number,
  flagged: boolean,
): Promise<void> {
  const today = getDateString();

  const pipeline = redis.pipeline();
  pipeline.hSet(SCORE_KEY_PREFIX + id, {
    score: String(score),
    flagged: flagged ? "1" : "0",
    timestamp: String(Date.now()),
  });
  pipeline.expire(SCORE_KEY_PREFIX + id, 7 * 24 * 60 * 60);

  if (flagged) {
    pipeline.incrBy(DAILY_FLAG_PREFIX + today, 1);
  }

  pipeline.lPush(DAILY_AVG_PREFIX + today, String(score));
  pipeline.expire(DAILY_AVG_PREFIX + today, 30 * 24 * 60 * 60);

  await pipeline.exec();
}

export async function updateAccountScore(
  redis: Devvit.RedisClient,
  username: string,
  score: number,
): Promise<void> {
  await redis.zIncrBy(ACCOUNT_SCORES_KEY, username, score);
  await redis.expire(ACCOUNT_SCORES_KEY, 14 * 24 * 60 * 60);
}

export async function getDailyFlagCount(
  redis: Devvit.RedisClient,
  date?: string,
): Promise<number> {
  const key = DAILY_FLAG_PREFIX + (date || getDateString());
  const val = await redis.get(key);
  return val ? parseInt(val, 10) : 0;
}

export async function getDailyFlagCounts(
  redis: Devvit.RedisClient,
  days: number,
): Promise<{ date: string; count: number }[]> {
  const dates = getDateRange(days);
  const results = await Promise.all(
    dates.map(async (date) => ({
      date,
      count: await getDailyFlagCount(redis, date),
    })),
  );
  return results;
}

export async function getDailyAverages(
  redis: Devvit.RedisClient,
  days: number,
): Promise<{ date: string; avg: number }[]> {
  const dates = getDateRange(days);
  const results: { date: string; avg: number }[] = [];

  for (const date of dates) {
    const key = DAILY_AVG_PREFIX + date;
    const scores = await redis.lRange(key, 0, -1);
    if (scores.length > 0) {
      const sum = scores.reduce((acc, s) => acc + parseInt(s, 10), 0);
      results.push({ date, avg: Math.round(sum / scores.length) });
    } else {
      results.push({ date, avg: 0 });
    }
  }

  return results;
}

export async function getTopAccounts(
  redis: Devvit.RedisClient,
  limit: number = 5,
): Promise<{ username: string; score: number }[]> {
  const results = await redis.zRange(ACCOUNT_SCORES_KEY, 0, limit - 1, {
    reverse: true,
    by: "rank",
  });

  return results.map((r: { member: string; score: number }) => ({
    username: r.member,
    score: Math.round(r.score),
  }));
}

export async function runCleanup(
  redis: Devvit.RedisClient,
  log: Devvit.Logger,
): Promise<void> {
  log.info("[ModGuard] Starting daily cleanup...");

  const now = Date.now();
  const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;

  const dateKeys = await redis.keys(DAILY_FLAG_PREFIX + "*");
  let removed = 0;

  for (const key of dateKeys) {
    const dateStr = key.replace(DAILY_FLAG_PREFIX, "");
    const keyDate = new Date(dateStr);
    if (now - keyDate.getTime() > sevenDaysMs) {
      await redis.del(key);
      removed++;
    }
  }

  const avgKeys = await redis.keys(DAILY_AVG_PREFIX + "*");
  for (const key of avgKeys) {
    const dateStr = key.replace(DAILY_AVG_PREFIX, "");
    const keyDate = new Date(dateStr);
    if (now - keyDate.getTime() > sevenDaysMs) {
      await redis.del(key);
      removed++;
    }
  }

  await redis.set(LAST_CLEANUP_KEY, String(now));

  log.info(`[ModGuard] Cleanup complete. Removed ${removed} stale keys.`);
}

export { CLEANUP_JOB_NAME, LAST_CLEANUP_KEY };
