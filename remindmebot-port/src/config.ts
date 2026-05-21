import { Context, Devvit } from "@devvit/public-api";
import { getActiveReminderCount } from "./scheduler.js";

export const SETTINGS_KEYS = {
  ENABLED: "enabled",
  MAX_REMINDERS_PER_USER: "maxRemindersPerUser",
  MAX_REMINDER_DURATION_DAYS: "maxReminderDurationDays",
} as const;

export const SETTINGS_DEFAULTS = {
  [SETTINGS_KEYS.ENABLED]: true,
  [SETTINGS_KEYS.MAX_REMINDERS_PER_USER]: 5,
  [SETTINGS_KEYS.MAX_REMINDER_DURATION_DAYS]: 365,
} as const;

Devvit.addSettings([
  {
    name: SETTINGS_KEYS.ENABLED,
    label: "Enable RemindMeBot",
    helpText: "Turn RemindMeBot on or off for this subreddit.",
    type: "boolean",
    defaultValue: SETTINGS_DEFAULTS[SETTINGS_KEYS.ENABLED],
    scope: "subreddit",
  },
  {
    name: SETTINGS_KEYS.MAX_REMINDERS_PER_USER,
    label: "Max reminders per user",
    helpText: "Maximum number of active reminders a single user can have.",
    type: "number",
    defaultValue: SETTINGS_DEFAULTS[SETTINGS_KEYS.MAX_REMINDERS_PER_USER],
    scope: "subreddit",
  },
  {
    name: SETTINGS_KEYS.MAX_REMINDER_DURATION_DAYS,
    label: "Max reminder duration (days)",
    helpText: "The furthest in the future a reminder can be set (1-730 days).",
    type: "number",
    defaultValue: SETTINGS_DEFAULTS[SETTINGS_KEYS.MAX_REMINDER_DURATION_DAYS],
    scope: "subreddit",
  },
]);

export interface SubredditConfig {
  enabled: boolean;
  maxRemindersPerUser: number;
  maxReminderDurationDays: number;
}

export async function getConfig(context: Context): Promise<SubredditConfig> {
  const settings = await context.settings.getAll();

  return {
    enabled:
      settings[SETTINGS_KEYS.ENABLED] !== undefined
        ? Boolean(settings[SETTINGS_KEYS.ENABLED])
        : SETTINGS_DEFAULTS[SETTINGS_KEYS.ENABLED],
    maxRemindersPerUser:
      settings[SETTINGS_KEYS.MAX_REMINDERS_PER_USER] !== undefined
        ? Number(settings[SETTINGS_KEYS.MAX_REMINDERS_PER_USER])
        : SETTINGS_DEFAULTS[SETTINGS_KEYS.MAX_REMINDERS_PER_USER],
    maxReminderDurationDays:
      settings[SETTINGS_KEYS.MAX_REMINDER_DURATION_DAYS] !== undefined
        ? Number(settings[SETTINGS_KEYS.MAX_REMINDER_DURATION_DAYS])
        : SETTINGS_DEFAULTS[SETTINGS_KEYS.MAX_REMINDER_DURATION_DAYS],
  };
}

Devvit.addMenuItem({
  label: "RemindMeBot Stats",
  location: "subreddit",
  forUserType: "moderator",
  onPress: async (_event, context) => {
    const ui = context.ui;
    const config = await getConfig(context);
    const totalCount = await getActiveReminderCount(context);

    ui.showToast({
      text: `RemindMeBot: ${config.enabled ? "Enabled" : "Disabled"} | Total active reminders: ${totalCount} | Max per user: ${config.maxRemindersPerUser} | Max duration: ${config.maxReminderDurationDays} days`,
      appearance: "success",
    });
  },
});

Devvit.addMenuItem({
  label: "RemindMeBot Panel",
  location: "subreddit",
  forUserType: "moderator",
  onPress: async (_event, context) => {
    const ui = context.ui;

    ui.showForm(ModPanelForm);
  },
});

const ModPanelForm = Devvit.createForm(
  {
    title: "RemindMeBot — Mod Panel",
    acceptLabel: "Done",
    fields: [
      {
        name: "info",
        label: "Info",
        type: "paragraph",
        defaultValue: "View stats below. Use Settings to change config.",
        disabled: true,
      },
    ],
  },
  async (_event, context) => {
    const config = await getConfig(context);
    const totalCount = await getActiveReminderCount(context);

    const status = config.enabled ? "✅ Active" : "❌ Disabled";
    const lines = [
      `Status: ${status}`,
      `Total active reminders: ${totalCount}`,
      `Max reminders per user: ${config.maxRemindersPerUser}`,
      `Max reminder duration: ${config.maxReminderDurationDays} days`,
      ``,
      `To change settings, go to Mod Tools → Settings → RemindMeBot Settings.`,
    ];

    context.ui.showToast({
      text: lines.join(" | "),
      appearance: "success",
    });
  },
);
