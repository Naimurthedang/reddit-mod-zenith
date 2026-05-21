import { Devvit } from "@devvit/public-api";

export interface BotSettings {
  messageHeader: string;
  messageFooter: string;
  commandsEnabled: {
    rule: boolean;
    spam: boolean;
    ban: boolean;
    approve: boolean;
  };
  modOnlyMode: boolean;
}

export const DEFAULT_SETTINGS: BotSettings = {
  messageHeader:
    "Hi {author}, your submission has been removed for the following reason:",
  messageFooter: "",
  commandsEnabled: {
    rule: true,
    spam: true,
    ban: true,
    approve: true,
  },
  modOnlyMode: true,
};

export function getSettings(
  context: Pick<Devvit.Context, "settings">,
): BotSettings {
  const s = context.settings as Record<string, string | boolean | undefined>;
  return {
    messageHeader:
      (s.messageHeader as string) ?? DEFAULT_SETTINGS.messageHeader,
    messageFooter:
      (s.messageFooter as string) ?? DEFAULT_SETTINGS.messageFooter,
    commandsEnabled: {
      rule: s.ruleEnabled !== false,
      spam: s.spamEnabled !== false,
      ban: s.banEnabled !== false,
      approve: s.approveEnabled !== false,
    },
    modOnlyMode: s.modOnlyMode !== false,
  };
}
