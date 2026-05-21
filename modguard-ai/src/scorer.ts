import { Devvit } from "@devvit/public-api";
import { ModGuardSettings } from "./config.js";

export interface SignalResult {
  accountAge: number;
  postingVelocity: number;
  commentToPostRatio: number;
  phrasePatterns: number;
  textEntropy: number;
}

export interface ScoreResult {
  total: number;
  signals: SignalResult;
  flagged: boolean;
}

export async function calculateScore(params: {
  reddit: Devvit.RedditAPIClient;
  redis: Devvit.RedisClient;
  settings: ModGuardSettings;
  authorUsername: string;
  authorId: string;
  text: string;
}): Promise<ScoreResult> {
  const { reddit, redis, settings, authorUsername, authorId, text } = params;

  const signals: SignalResult = {
    accountAge: 0,
    postingVelocity: 0,
    commentToPostRatio: 0,
    phrasePatterns: 0,
    textEntropy: 0,
  };

  const promises: Promise<void>[] = [];

  if (settings.checkAccountAge) {
    promises.push(
      checkAccountAge(reddit, authorUsername).then((s) => {
        signals.accountAge = s;
      }),
    );
  }

  if (settings.checkPostingVelocity) {
    promises.push(
      checkPostingVelocity(reddit, authorUsername).then((s) => {
        signals.postingVelocity = s;
      }),
    );
  }

  if (settings.checkCommentToPostRatio) {
    promises.push(
      checkCommentToPostRatio(reddit, authorUsername).then((s) => {
        signals.commentToPostRatio = s;
      }),
    );
  }

  if (settings.checkPhrasePatterns) {
    promises.push(
      checkPhrasePatterns(reddit, authorUsername).then((s) => {
        signals.phrasePatterns = s;
      }),
    );
  }

  if (settings.checkTextEntropy) {
    signals.textEntropy = checkTextEntropy(text);
  }

  await Promise.all(promises);

  const total = Math.min(
    100,
    Math.max(
      0,
      signals.accountAge +
        signals.postingVelocity +
        signals.commentToPostRatio +
        signals.phrasePatterns +
        signals.textEntropy,
    ),
  );

  return {
    total,
    signals,
    flagged: total >= settings.threshold,
  };
}

async function checkAccountAge(
  reddit: Devvit.RedditAPIClient,
  username: string,
): Promise<number> {
  try {
    const user = await reddit.getUserByUsername(username);
    if (!user) return 0;

    const ageMs = Date.now() - user.createdAt.getTime();
    const ageDays = ageMs / (1000 * 60 * 60 * 24);

    if (ageDays < 1) return 30;
    if (ageDays < 7) return 25;
    if (ageDays < 14) return 20;
    if (ageDays < 30) return 15;
    if (ageDays < 60) return 10;
    if (ageDays < 90) return 5;
    return 0;
  } catch {
    return 0;
  }
}

async function checkPostingVelocity(
  reddit: Devvit.RedditAPIClient,
  username: string,
): Promise<number> {
  try {
    const now = Date.now();
    const cutoff = new Date(now - 24 * 60 * 60 * 1000);

    const recentPosts = await reddit.getPostsByUser({
      username,
      limit: 100,
    });

    const postsIn24h = recentPosts.filter(
      (p) => new Date(p.createdAt) >= cutoff,
    ).length;
    const hours = 24;
    const rate = postsIn24h / hours;

    if (rate > 2) return 25;
    if (rate > 1) return 20;
    if (rate > 0.5) return 15;
    if (rate > 0.25) return 10;
    if (rate > 0.1) return 5;
    return 0;
  } catch {
    return 0;
  }
}

async function checkCommentToPostRatio(
  reddit: Devvit.RedditAPIClient,
  username: string,
): Promise<number> {
  try {
    const recentPosts = await reddit.getPostsByUser({ username, limit: 50 });
    const recentComments = await reddit.getCommentsByUser({
      username,
      limit: 50,
    });

    const postCount = recentPosts.length;
    const commentCount = recentComments.length;

    if (postCount === 0 && commentCount === 0) return 0;

    const ratio = commentCount / Math.max(postCount, 1);

    if (postCount > 10 && ratio < 0.1) return 15;
    if (postCount > 5 && ratio < 0.2) return 10;
    if (postCount > 2 && ratio < 0.3) return 5;

    if (commentCount > 20 && ratio > 20) return 15;
    if (commentCount > 10 && ratio > 10) return 10;
    if (ratio > 5) return 5;

    return 0;
  } catch {
    return 0;
  }
}

async function checkPhrasePatterns(
  reddit: Devvit.RedditAPIClient,
  username: string,
): Promise<number> {
  try {
    const recentComments = await reddit.getCommentsByUser({
      username,
      limit: 25,
    });

    if (recentComments.length < 2) return 0;

    const normalized = recentComments.map((c) =>
      c.body
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, "")
        .trim(),
    );

    const phraseCounts = new Map<string, number>();
    const minPhraseLen = 8;

    for (const text of normalized) {
      const words = text.split(/\s+/).filter(Boolean);
      for (let i = 0; i <= words.length - 4; i++) {
        const phrase = words.slice(i, i + 4).join(" ");
        if (phrase.length >= minPhraseLen) {
          phraseCounts.set(phrase, (phraseCounts.get(phrase) || 0) + 1);
        }
      }
    }

    let maxRepeats = 0;
    for (const count of phraseCounts.values()) {
      if (count > maxRepeats) maxRepeats = count;
    }

    if (maxRepeats >= 5) return 15;
    if (maxRepeats === 4) return 12;
    if (maxRepeats === 3) return 8;
    if (maxRepeats === 2) return 3;
    return 0;
  } catch {
    return 0;
  }
}

function checkTextEntropy(text: string): number {
  if (!text || text.length < 20) return 0;

  const entropy = calculateShannonEntropy(text);
  const normalizedEntropy = entropy / Math.log2(Math.min(text.length, 128));

  if (normalizedEntropy > 0.85 && normalizedEntropy < 0.92) return 15;
  if (normalizedEntropy > 0.82 && normalizedEntropy <= 0.85) return 12;
  if (normalizedEntropy >= 0.92 && normalizedEntropy < 0.95) return 10;
  if (normalizedEntropy > 0.78 && normalizedEntropy <= 0.82) return 8;
  if (normalizedEntropy >= 0.95 && normalizedEntropy < 0.97) return 5;

  return 0;
}

function calculateShannonEntropy(text: string): number {
  const freq = new Map<string, number>();
  const len = text.length;

  for (const char of text) {
    freq.set(char, (freq.get(char) || 0) + 1);
  }

  let entropy = 0;
  for (const count of freq.values()) {
    const p = count / len;
    entropy -= p * Math.log2(p);
  }

  return entropy;
}
