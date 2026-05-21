import { Devvit, Post } from "@devvit/public-api";
import {
  parseReminderCommand,
  formatReminderDate,
  formatReminderAbsolute,
} from "./parser.js";
import {
  scheduleReminder,
  cancelReminder,
  getActiveReminders,
  processDueReminders,
  getUserReminderCount,
} from "./scheduler.js";
import { getConfig } from "./config.js";

Devvit.configure({
  redditAPI: true,
  redis: true,
});

Devvit.addTrigger({
  event: "AppInstall",
  onEvent: async (_event, context) => {
    console.log("RemindMeBot installed. Scheduling cron job...");
    try {
      await context.scheduler.runJob({
        name: "check-reminders",
        cron: "* * * * *",
      });
      console.log("Cron job scheduled successfully.");
    } catch (err) {
      console.error("Failed to schedule cron job:", err);
    }
  },
});

Devvit.addTrigger({
  event: "AppUpgrade",
  onEvent: async (_event, context) => {
    console.log("RemindMeBot upgraded. Re-scheduling cron job...");
    try {
      await context.scheduler.runJob({
        name: "check-reminders",
        cron: "* * * * *",
      });
      console.log("Cron job scheduled successfully.");
    } catch (err) {
      console.error("Failed to schedule cron job:", err);
    }
  },
});

Devvit.addSchedulerJob({
  name: "check-reminders",
  onRun: async (_event, context) => {
    const delivered = await processDueReminders(context);
    if (delivered > 0) {
      console.log(`Delivered ${delivered} reminder(s).`);
    }
  },
});

Devvit.addTrigger({
  event: "CommentCreate",
  onEvent: async (event, context) => {
    try {
      await handleComment(event, context);
    } catch (err) {
      console.error("Error handling comment:", err);
    }
  },
});

async function handleComment(
  event: { commentId?: string },
  context: Devvit.Context,
): Promise<void> {
  const commentId = event.commentId;
  if (!commentId) return;

  const comment = await context.reddit.getCommentById(commentId);
  if (!comment || !comment.body || comment.authorId === undefined) return;

  const body = comment.body;
  const parsed = parseReminderCommand(body);
  if (!parsed) return;

  const config = await getConfig(context);
  if (!config.enabled) return;

  if (parsed.action === "list") {
    const reminders = await getActiveReminders(comment.authorId, context);
    if (reminders.length === 0) {
      await context.reddit.submitComment({
        commentId: comment.id,
        text: "You don't have any active reminders. Create one with `!RemindMe 3 days`.",
      });
      return;
    }

    const lines = reminders.map((r, i) => {
      const date = new Date(r.reminderTime);
      return `${i + 1}. **${formatReminderDate(date)}** (${formatReminderAbsolute(date)}) — ID: \`${r.id}\``;
    });

    const reply = [
      `You have ${reminders.length} active reminder(s):`,
      "",
      ...lines,
      "",
      `To cancel: \`!RemindMe cancel <ID>\``,
    ].join("\n");

    await context.reddit.submitComment({
      commentId: comment.id,
      text: reply,
    });
    return;
  }

  if (parsed.action === "cancel") {
    if (!parsed.cancelId) {
      await context.reddit.submitComment({
        commentId: comment.id,
        text: "Usage: `!RemindMe cancel <reminder ID>`",
      });
      return;
    }

    const cancelled = await cancelReminder(
      comment.authorId,
      parsed.cancelId,
      context,
    );
    if (cancelled) {
      await context.reddit.submitComment({
        commentId: comment.id,
        text: `Reminder \`${parsed.cancelId}\` has been cancelled.`,
      });
    } else {
      await context.reddit.submitComment({
        commentId: comment.id,
        text: `Could not find reminder \`${parsed.cancelId}\`. It may have already been delivered or the ID is incorrect. Use \`!RemindMe list\` to see your active reminders.`,
      });
    }
    return;
  }

  if (parsed.action === "set") {
    if (!parsed.time) return;

    const now = Date.now();
    const maxDurationMs = config.maxReminderDurationDays * 24 * 60 * 60 * 1000;

    if (parsed.time.getTime() <= now) {
      await context.reddit.submitComment({
        commentId: comment.id,
        text: "That time is in the past! Please set a future time. Example: `!RemindMe 3 days`",
      });
      return;
    }

    if (parsed.time.getTime() - now > maxDurationMs) {
      await context.reddit.submitComment({
        commentId: comment.id,
        text: `Sorry, the maximum reminder duration for this subreddit is ${config.maxReminderDurationDays} days. Please set a closer date.`,
      });
      return;
    }

    const currentCount = await getUserReminderCount(comment.authorId, context);
    if (currentCount >= config.maxRemindersPerUser) {
      await context.reddit.submitComment({
        commentId: comment.id,
        text: `You already have ${config.maxRemindersPerUser} active reminders. Cancel one with \`!RemindMe cancel <ID>\` or use \`!RemindMe list\` to see them.`,
      });
      return;
    }

    const postId = (comment as any).postId;
    let post: Post | null = null;
    try {
      post = await context.reddit.getPostById(postId);
    } catch {
      await context.reddit.submitComment({
        commentId: comment.id,
        text: "Could not find the post for this comment.",
      });
      return;
    }
    if (!post) {
      await context.reddit.submitComment({
        commentId: comment.id,
        text: "Could not find the post for this comment.",
      });
      return;
    }

    const reminderId = await scheduleReminder(
      {
        userId: comment.authorId,
        username: comment.authorName,
        postId: post.id,
        postUrl:
          post.permalink || `/r/${post.subredditName}/comments/${post.id}/`,
        postTitle: post.title || "Untitled",
        commentId: comment.id,
        reminderTime: parsed.time.getTime(),
        originalText: body,
      },
      context,
    );

    const relative = formatReminderDate(parsed.time);
    const absolute = formatReminderAbsolute(parsed.time);

    await context.reddit.submitComment({
      commentId: comment.id,
      text: `I will remind you ${relative} (${absolute}). Reminder ID: \`${reminderId}\``,
    });

    return;
  }
}

export default Devvit;
