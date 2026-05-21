import { Devvit } from "@devvit/public-api";

type SettingsDefinition = {
  name: string;
  label: string;
  type: "number" | "boolean" | "string";
  defaultValue: number | boolean | string;
  helpText: string;
};

export interface ModGuardSettings {
  threshold: number;
  checkAccountAge: boolean;
  checkPostingVelocity: boolean;
  checkCommentToPostRatio: boolean;
  checkPhrasePatterns: boolean;
  checkTextEntropy: boolean;
  whitelist: string[];
}

export const DEFAULT_SETTINGS: ModGuardSettings = {
  threshold: 75,
  checkAccountAge: true,
  checkPostingVelocity: true,
  checkCommentToPostRatio: true,
  checkPhrasePatterns: true,
  checkTextEntropy: true,
  whitelist: [],
};

export const SETTINGS_DEFINITIONS: SettingsDefinition[] = [
  {
    name: "threshold",
    label: "Suspicion Threshold for Auto-Hold",
    type: "number",
    defaultValue: 75,
    helpText:
      "Items scoring above this value (0–100) are automatically held for moderator review.",
  },
  {
    name: "checkAccountAge",
    label: "Signal: Account Age",
    type: "boolean",
    defaultValue: true,
    helpText: "Score based on how recently the account was created.",
  },
  {
    name: "checkPostingVelocity",
    label: "Signal: Posting Velocity",
    type: "boolean",
    defaultValue: true,
    helpText: "Score based on posts-per-hour rate in the last 24 hours.",
  },
  {
    name: "checkCommentToPostRatio",
    label: "Signal: Comment/Post Ratio",
    type: "boolean",
    defaultValue: true,
    helpText: "Score based on abnormal comment-to-post ratio.",
  },
  {
    name: "checkPhrasePatterns",
    label: "Signal: Phrase Pattern Detection",
    type: "boolean",
    defaultValue: true,
    helpText: "Score when identical phrases appear across multiple comments.",
  },
  {
    name: "checkTextEntropy",
    label: "Signal: Text Entropy",
    type: "boolean",
    defaultValue: true,
    helpText:
      "Score based on character entropy patterns typical of AI-generated text.",
  },
  {
    name: "whitelist",
    label: "Whitelisted Users",
    type: "string",
    defaultValue: "",
    helpText: "Comma-separated list of usernames exempt from scoring.",
  },
];

export async function loadSettings(
  context: Devvit.Context,
): Promise<ModGuardSettings> {
  try {
    const raw = await context.settings.getAll();
    const threshold =
      typeof raw.threshold === "number"
        ? raw.threshold
        : DEFAULT_SETTINGS.threshold;
    const whitelistStr = typeof raw.whitelist === "string" ? raw.whitelist : "";
    const whitelist = whitelistStr
      .split(",")
      .map((u: string) => u.trim().toLowerCase())
      .filter((u: string) => u.length > 0);

    return {
      threshold: Math.max(0, Math.min(100, threshold)),
      checkAccountAge: raw.checkAccountAge !== false,
      checkPostingVelocity: raw.checkPostingVelocity !== false,
      checkCommentToPostRatio: raw.checkCommentToPostRatio !== false,
      checkPhrasePatterns: raw.checkPhrasePatterns !== false,
      checkTextEntropy: raw.checkTextEntropy !== false,
      whitelist,
    };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function isWhitelisted(
  settings: ModGuardSettings,
  username: string,
): boolean {
  return settings.whitelist.includes(username.toLowerCase());
}
