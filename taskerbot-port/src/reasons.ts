import { Devvit } from "@devvit/public-api";

const REASONS_KEY = "taskerbot:reasons";

export interface RemovalReason {
  ruleNumber: number;
  displayName: string;
  messageTemplate: string;
  flairText: string;
}

export async function getReasons(
  context: Devvit.Context,
): Promise<RemovalReason[]> {
  const raw = await context.redis.get(REASONS_KEY);
  if (!raw) return [];
  try {
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

export async function addReason(
  reason: RemovalReason,
  context: Devvit.Context,
): Promise<void> {
  const reasons = await getReasons(context);
  const idx = reasons.findIndex((r) => r.ruleNumber === reason.ruleNumber);
  if (idx >= 0) {
    reasons[idx] = reason;
  } else {
    reasons.push(reason);
  }
  await context.redis.set(REASONS_KEY, JSON.stringify(reasons));
}

export async function deleteReason(
  ruleNumber: number,
  context: Devvit.Context,
): Promise<void> {
  const reasons = await getReasons(context);
  const filtered = reasons.filter((r) => r.ruleNumber !== ruleNumber);
  await context.redis.set(REASONS_KEY, JSON.stringify(filtered));
}

export interface TemplateVars {
  author: string;
  subreddit: string;
  url: string;
  title: string;
}

export function renderTemplate(template: string, vars: TemplateVars): string {
  return template
    .replace(/\{author\}/g, vars.author)
    .replace(/\{subreddit\}/g, vars.subreddit)
    .replace(/\{url\}/g, vars.url)
    .replace(/\{title\}/g, vars.title);
}

export function buildRemovalMessage(
  reason: RemovalReason,
  header: string,
  footer: string,
  vars: TemplateVars,
): string {
  const parts: string[] = [];
  if (header) parts.push(renderTemplate(header, vars));
  parts.push(renderTemplate(reason.messageTemplate, vars));
  if (footer) parts.push(renderTemplate(footer, vars));
  return parts.join("\n\n");
}

export async function applyRemoval(
  targetId: string,
  reason: RemovalReason,
  header: string,
  footer: string,
  vars: TemplateVars,
  context: Devvit.Context,
): Promise<void> {
  await context.reddit.remove(targetId, { spam: false });

  if (targetId.startsWith("t3_")) {
    try {
      const message = buildRemovalMessage(reason, header, footer, vars);
      await context.reddit.submitComment({
        postId: targetId,
        text: message,
      });

      if (reason.flairText) {
        await context.reddit.setPostFlair({
          postId: targetId,
          text: reason.flairText,
        });
      }
    } catch (e) {
      throw e;
    }
  }
}

export async function applySpamRemoval(
  targetId: string,
  context: Devvit.Context,
): Promise<void> {
  await context.reddit.remove(targetId, { spam: true });
}
