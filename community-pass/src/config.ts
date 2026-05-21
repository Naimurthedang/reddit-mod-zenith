import { Devvit } from "@devvit/public-api";
import { DEFAULT_THRESHOLDS } from "./scoring.js";

export interface AppConfig {
  thresholdL1: number;
  thresholdL2: number;
  thresholdL3: number;
  thresholdL4: number;
  thresholdL5: number;
  showFlair: boolean;
  autoPromote: boolean;
  autoReportLevel1: boolean;
}

export const DEFAULT_APP_CONFIG: AppConfig = {
  thresholdL1: DEFAULT_THRESHOLDS[1],
  thresholdL2: DEFAULT_THRESHOLDS[2],
  thresholdL3: DEFAULT_THRESHOLDS[3],
  thresholdL4: DEFAULT_THRESHOLDS[4],
  thresholdL5: DEFAULT_THRESHOLDS[5],
  showFlair: true,
  autoPromote: true,
  autoReportLevel1: true,
};

const CONFIG_KEY = "communitypass:config";

export async function loadConfig(context: Devvit.Context): Promise<AppConfig> {
  const raw = await context.redis.hGetAll(CONFIG_KEY);
  if (!raw || Object.keys(raw).length === 0) return { ...DEFAULT_APP_CONFIG };

  return {
    thresholdL1: parseInt(
      raw.thresholdL1 ?? String(DEFAULT_APP_CONFIG.thresholdL1),
      10,
    ),
    thresholdL2: parseInt(
      raw.thresholdL2 ?? String(DEFAULT_APP_CONFIG.thresholdL2),
      10,
    ),
    thresholdL3: parseInt(
      raw.thresholdL3 ?? String(DEFAULT_APP_CONFIG.thresholdL3),
      10,
    ),
    thresholdL4: parseInt(
      raw.thresholdL4 ?? String(DEFAULT_APP_CONFIG.thresholdL4),
      10,
    ),
    thresholdL5: parseInt(
      raw.thresholdL5 ?? String(DEFAULT_APP_CONFIG.thresholdL5),
      10,
    ),
    showFlair: raw.showFlair === "true",
    autoPromote: raw.autoPromote !== "false",
    autoReportLevel1: raw.autoReportLevel1 !== "false",
  };
}

export async function saveConfig(
  config: AppConfig,
  context: Devvit.Context,
): Promise<void> {
  await context.redis.hSet(CONFIG_KEY, {
    thresholdL1: String(config.thresholdL1),
    thresholdL2: String(config.thresholdL2),
    thresholdL3: String(config.thresholdL3),
    thresholdL4: String(config.thresholdL4),
    thresholdL5: String(config.thresholdL5),
    showFlair: config.showFlair ? "true" : "false",
    autoPromote: config.autoPromote ? "true" : "false",
    autoReportLevel1: config.autoReportLevel1 ? "true" : "false",
  });
}

export function getThresholdsFromConfig(
  config: AppConfig,
): Record<number, number> {
  return {
    1: config.thresholdL1,
    2: config.thresholdL2,
    3: config.thresholdL3,
    4: config.thresholdL4,
    5: config.thresholdL5,
  };
}

export const SETTINGS_FIELDS = [
  {
    type: "number" as const,
    name: "thresholdL1",
    label: "Level 1 (New) minimum points",
    helpText: "Default: 0",
    defaultValue: DEFAULT_APP_CONFIG.thresholdL1,
    minValue: 0,
  },
  {
    type: "number" as const,
    name: "thresholdL2",
    label: "Level 2 (Known) minimum points",
    helpText: "Default: 50",
    defaultValue: DEFAULT_APP_CONFIG.thresholdL2,
    minValue: 0,
  },
  {
    type: "number" as const,
    name: "thresholdL3",
    label: "Level 3 (Trusted) minimum points",
    helpText: "Default: 200",
    defaultValue: DEFAULT_APP_CONFIG.thresholdL3,
    minValue: 0,
  },
  {
    type: "number" as const,
    name: "thresholdL4",
    label: "Level 4 (Veteran) minimum points",
    helpText: "Default: 500",
    defaultValue: DEFAULT_APP_CONFIG.thresholdL4,
    minValue: 0,
  },
  {
    type: "number" as const,
    name: "thresholdL5",
    label: "Level 5 (Elder) minimum points",
    helpText: "Default: 1000. Requires mod vouch.",
    defaultValue: DEFAULT_APP_CONFIG.thresholdL5,
    minValue: 0,
  },
  {
    type: "boolean" as const,
    name: "showFlair",
    label: "Show trust level as user flair",
    helpText: "When enabled, trust level badges appear on user flair.",
    defaultValue: DEFAULT_APP_CONFIG.showFlair,
  },
  {
    type: "boolean" as const,
    name: "autoPromote",
    label: "Auto-promote users when they cross thresholds",
    helpText: "When disabled, users must be manually promoted by a mod.",
    defaultValue: DEFAULT_APP_CONFIG.autoPromote,
  },
  {
    type: "boolean" as const,
    name: "autoReportLevel1",
    label: "Report Level 1 posts to modqueue",
    helpText:
      "When enabled, posts from Level 1 users are automatically reported.",
    defaultValue: DEFAULT_APP_CONFIG.autoReportLevel1,
  },
];
