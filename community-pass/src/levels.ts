import { Devvit } from "@devvit/public-api";
import {
  UserScore,
  getScore,
  saveScore,
  getDefaultTrustLevel,
  getConfig,
  POINTS,
  TRUST_LEVEL_NAMES,
  DEFAULT_THRESHOLDS,
} from "./scoring.js";

export interface Privileges {
  autoApprovePosts: boolean;
  autoApproveComments: boolean;
  immuneToAutomod: boolean;
  restrictedMegathreads: boolean;
  canApproveLevel1: boolean;
}

export interface TrustLevel {
  level: number;
  name: string;
  pointsRequired: number;
  pointsNext: number | null;
  privileges: Privileges;
}

export interface LevelRequirements {
  level: number;
  name: string;
  minPoints: number;
  minAccountAgeDays: number;
  minApprovedPosts: number;
  requiresVouch: boolean;
}

const LEVEL_PRIVILEGES: Record<number, Privileges> = {
  1: {
    autoApprovePosts: false,
    autoApproveComments: false,
    immuneToAutomod: false,
    restrictedMegathreads: false,
    canApproveLevel1: false,
  },
  2: {
    autoApprovePosts: true,
    autoApproveComments: false,
    immuneToAutomod: false,
    restrictedMegathreads: false,
    canApproveLevel1: false,
  },
  3: {
    autoApprovePosts: true,
    autoApproveComments: true,
    immuneToAutomod: true,
    restrictedMegathreads: false,
    canApproveLevel1: false,
  },
  4: {
    autoApprovePosts: true,
    autoApproveComments: true,
    immuneToAutomod: true,
    restrictedMegathreads: true,
    canApproveLevel1: false,
  },
  5: {
    autoApprovePosts: true,
    autoApproveComments: true,
    immuneToAutomod: true,
    restrictedMegathreads: true,
    canApproveLevel1: true,
  },
};

export function getLevelRequirements(level: number): LevelRequirements {
  const thresholds = DEFAULT_THRESHOLDS;
  const minPoints = thresholds[level] ?? 0;

  const reqs: Record<number, Partial<LevelRequirements>> = {
    1: { minAccountAgeDays: 0, minApprovedPosts: 0, requiresVouch: false },
    2: { minAccountAgeDays: 1, minApprovedPosts: 1, requiresVouch: false },
    3: { minAccountAgeDays: 30, minApprovedPosts: 5, requiresVouch: false },
    4: { minAccountAgeDays: 90, minApprovedPosts: 20, requiresVouch: false },
    5: { minAccountAgeDays: 180, minApprovedPosts: 50, requiresVouch: true },
  };

  const base = reqs[level] ?? reqs[1]!;

  return {
    level,
    name: TRUST_LEVEL_NAMES[level] ?? "Unknown",
    minPoints,
    minAccountAgeDays: base.minAccountAgeDays ?? 0,
    minApprovedPosts: base.minApprovedPosts ?? 0,
    requiresVouch: base.requiresVouch ?? false,
  };
}

export function getPrivileges(level: number): Privileges {
  return LEVEL_PRIVILEGES[level] ?? LEVEL_PRIVILEGES[1]!;
}

export function meetsLevelRequirements(
  score: UserScore,
  level: number,
  thresholds: Record<number, number>,
): boolean {
  const reqs = getLevelRequirements(level);
  const pointsThreshold = thresholds[level] ?? reqs.minPoints;

  if (score.permanentBan) return false;
  if (score.points < pointsThreshold) return false;
  if (score.accountAgeDays < reqs.minAccountAgeDays) return false;
  if (level === 5 && !score.vouched) return false;

  return true;
}

export async function checkAndPromote(
  userId: string,
  context: Devvit.Context,
): Promise<number | null> {
  const score = await getScore(userId, context);
  if (!score) return null;

  if (score.permanentBan) return null;

  const thresholds = await getConfig(context);

  const sortedLevels = [5, 4, 3, 2];
  for (const level of sortedLevels) {
    if (score.trustLevel >= level) break;

    if (meetsLevelRequirements(score, level, thresholds)) {
      score.trustLevel = level;
      score.lastActivity = Date.now();
      await saveScore(score, context);
      return level;
    }
  }

  return null;
}

export function getLevelBadgeEmoji(level: number): string {
  switch (level) {
    case 1:
      return "⬜";
    case 2:
      return "🟩";
    case 3:
      return "🟦";
    case 4:
      return "🟪";
    case 5:
      return "🌟";
    default:
      return "⬜";
  }
}

export function getLevelColor(level: number): string {
  switch (level) {
    case 1:
      return "#9e9e9e";
    case 2:
      return "#4caf50";
    case 3:
      return "#2196f3";
    case 4:
      return "#9c27b0";
    case 5:
      return "#ffc107";
    default:
      return "#9e9e9e";
  }
}
