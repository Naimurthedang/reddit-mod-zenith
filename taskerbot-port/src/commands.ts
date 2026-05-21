import { Devvit } from "@devvit/public-api";
import { getSettings, BotSettings } from "./config.js";
import {
  getReasons,
  applyRemoval,
  applySpamRemoval,
  TemplateVars,
  RemovalReason,
} from "./reasons.js";
import { logAction } from "./log.js";

export type CommandType = "rule" | "spam" | "ban" | "approve";

export interface ParsedCommand {
  type: CommandType;
  ruleNumber?: number;
  banDays?: number;
  banReason?: string;
  banMessage?: string;
}

const COMMAND_REGEX = /^!(rule|spam|ban|approve)\b(.*)$/im;

export function parseCommand(text: string): ParsedCommand | null {
  const match = COMMAND_REGEX.exec(text.trim());
  if (!match) return null;

  const type = match[1].toLowerCase() as CommandType;
  const rest = match[2].trim();

  switch (type) {
    case "rule": {
      const numMatch = rest.match(/^(\d+)/);
      if (!numMatch) return null;
      return { type, ruleNumber: parseInt(numMatch[1], 10) };
    }

    case "ban": {
      const banMatch = rest.match(/^(\d+)\s+"([^"]*)"(?:\s+"([^"]*)")?/);
      if (!banMatch) return null;
      return {
        type,
        banDays: parseInt(banMatch[1], 10),
        banReason: banMatch[2] || "",
        banMessage: banMatch[3] || "",
      };
    }

    case "spam":
    case "approve":
      return { type };

    default:
      return null;
  }
}

export async function executeCommand(
  command: ParsedCommand,
  targetId: string,
  moderatorName: string,
  subredditName: string,
  targetAuthor: string,
  targetTitle: string,
  targetUrl: string,
  context: Devvit.Context,
): Promise<{ success: boolean; message: string }> {
  const settings: BotSettings = getSettings(context);
  const cmdName = command.type;

  if (!settings.commandsEnabled[cmdName]) {
    return {
      success: false,
      message: `!${cmdName} command is disabled in settings`,
    };
  }

  try {
    switch (command.type) {
      case "rule": {
        const reasons: RemovalReason[] = await getReasons(context);
        const reason = reasons.find((r) => r.ruleNumber === command.ruleNumber);
        if (!reason) {
          return {
            success: false,
            message: `Removal reason for rule ${command.ruleNumber} not found. Add it in the taskerbot settings panel.`,
          };
        }

        const vars: TemplateVars = {
          author: targetAuthor,
          subreddit: subredditName,
          url: targetUrl,
          title: targetTitle,
        };

        await applyRemoval(
          targetId,
          reason,
          settings.messageHeader,
          settings.messageFooter,
          vars,
          context,
        );

        const cmdStr = `!rule ${command.ruleNumber}`;
        await logAction(
          {
            moderator: moderatorName,
            command: cmdStr,
            targetContent: targetTitle || targetId,
            targetAuthor,
            result: "success",
          },
          context,
        );

        return {
          success: true,
          message: `Removed with rule ${command.ruleNumber}: ${reason.displayName}`,
        };
      }

      case "spam": {
        await applySpamRemoval(targetId, context);

        await logAction(
          {
            moderator: moderatorName,
            command: "!spam",
            targetContent: targetTitle || targetId,
            targetAuthor,
            result: "success",
          },
          context,
        );

        return { success: true, message: "Marked as spam and removed" };
      }

      case "ban": {
        await context.reddit.banUser({
          subredditName,
          username: targetAuthor,
          reason: command.banReason || "Breaking subreddit rules",
          message: command.banMessage || "",
          duration: command.banDays,
        });

        await context.reddit.remove(targetId, { spam: false });

        const cmdStr = `!ban ${command.banDays} "${command.banReason || ""}"`;
        await logAction(
          {
            moderator: moderatorName,
            command: cmdStr,
            targetContent: targetTitle || targetId,
            targetAuthor,
            result: "success",
          },
          context,
        );

        return {
          success: true,
          message: `Banned u/${targetAuthor} for ${command.banDays} days`,
        };
      }

      case "approve": {
        await context.reddit.approve(targetId);

        await logAction(
          {
            moderator: moderatorName,
            command: "!approve",
            targetContent: targetTitle || targetId,
            targetAuthor,
            result: "success",
          },
          context,
        );

        return { success: true, message: "Content approved" };
      }

      default:
        return { success: false, message: "Unknown command" };
    }
  } catch (e) {
    const errorMessage = e instanceof Error ? e.message : String(e);
    await logAction(
      {
        moderator: moderatorName,
        command: `!${command.type}`,
        targetContent: targetTitle || targetId,
        targetAuthor,
        result: "failure",
        details: errorMessage,
      },
      context,
    );
    return { success: false, message: `Error: ${errorMessage}` };
  }
}
