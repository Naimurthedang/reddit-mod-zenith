import { Devvit } from "@devvit/public-api";

export interface ModFlowSettings {
  velocityWeight: number;
  reportWeight: number;
  karmaWeight: number;
  ageWeight: number;
  automodWeight: number;
  alertThreshold: number;
  enableBulkActions: boolean;
  alertModmail: boolean;
}

export const DEFAULT_SETTINGS: ModFlowSettings = {
  velocityWeight: 3,
  reportWeight: 3,
  karmaWeight: 2,
  ageWeight: 1,
  automodWeight: 1,
  alertThreshold: 100,
  enableBulkActions: true,
  alertModmail: true,
};

export const SETTINGS_DEFINITIONS = [
  {
    name: "velocityWeight",
    label: "Upvote Velocity Weight",
    type: "number" as const,
    defaultValue: 3,
    min: 0,
    max: 10,
    step: 0.5,
    description: "How much post upvote speed matters (upvotes/hour)",
  },
  {
    name: "reportWeight",
    label: "Report Count Weight",
    type: "number" as const,
    defaultValue: 3,
    min: 0,
    max: 10,
    step: 0.5,
    description: "How much user report count matters",
  },
  {
    name: "karmaWeight",
    label: "Low Karma Weight",
    type: "number" as const,
    defaultValue: 2,
    min: 0,
    max: 10,
    step: 0.5,
    description:
      "How much low account karma matters (higher weight = newer/low-karma accounts flagged more)",
  },
  {
    name: "ageWeight",
    label: "Account Age Weight",
    type: "number" as const,
    defaultValue: 1,
    min: 0,
    max: 10,
    step: 0.5,
    description: "How much new account age matters",
  },
  {
    name: "automodWeight",
    label: "AutoMod Pattern Weight",
    type: "number" as const,
    defaultValue: 1,
    min: 0,
    max: 10,
    step: 0.5,
    description: "How much AutoMod pattern matches matter",
  },
  {
    name: "alertThreshold",
    label: "Hot Post Alert Threshold (upvotes/hr)",
    type: "number" as const,
    defaultValue: 100,
    min: 10,
    max: 10000,
    step: 10,
    description:
      "Upvotes per hour threshold to trigger a modmail alert when reports also exist",
  },
  {
    name: "enableBulkActions",
    label: "Enable Bulk Actions",
    type: "boolean" as const,
    defaultValue: true,
    description: "Show bulk approve/remove buttons in the dashboard",
  },
  {
    name: "alertModmail",
    label: "Send Modmail Alerts",
    type: "boolean" as const,
    defaultValue: true,
    description: "Send modmail when a post goes viral with reports",
  },
];

export async function getSettings(
  context: Devvit.Context,
): Promise<ModFlowSettings> {
  const raw = await context.settings.getAll();
  return {
    velocityWeight: Number(
      raw["velocityWeight"] ?? DEFAULT_SETTINGS.velocityWeight,
    ),
    reportWeight: Number(raw["reportWeight"] ?? DEFAULT_SETTINGS.reportWeight),
    karmaWeight: Number(raw["karmaWeight"] ?? DEFAULT_SETTINGS.karmaWeight),
    ageWeight: Number(raw["ageWeight"] ?? DEFAULT_SETTINGS.ageWeight),
    automodWeight: Number(
      raw["automodWeight"] ?? DEFAULT_SETTINGS.automodWeight,
    ),
    alertThreshold: Number(
      raw["alertThreshold"] ?? DEFAULT_SETTINGS.alertThreshold,
    ),
    enableBulkActions:
      raw["enableBulkActions"] === true || raw["enableBulkActions"] === "true",
    alertModmail:
      raw["alertModmail"] === true || raw["alertModmail"] === "true",
  };
}
