import { Context } from "@devvit/public-api";

export interface Reminder {
  id: string;
  userId: string;
  username: string;
  postId: string;
  postUrl: string;
  postTitle: string;
  commentId: string;
  reminderTime: number;
  originalText: string;
  createdAt: number;
}

export interface ReminderInput {
  userId: string;
  username: string;
  postId: string;
  postUrl: string;
  postTitle: string;
  commentId: string;
  reminderTime: number;
  originalText: string;
}

const REMINDERS_SORTED_KEY = "reminders:due";
const COUNTER_KEY = "reminders:counter";
const USER_PREFIX = "user:";
const REMINDER_PREFIX = "reminder:";

function reminderKey(id: string): string {
  return `${REMINDER_PREFIX}${id}`;
}

function userRemindersKey(userId: string): string {
  return `${USER_PREFIX}${userId}:reminders`;
}

function hashToReminder(
  id: string,
  data: Record<string, string>,
): Reminder | null {
  if (!data.userId) return null;
  return {
    id,
    userId: data.userId,
    username: data.username || "",
    postId: data.postId || "",
    postUrl: data.postUrl || "",
    postTitle: data.postTitle || "",
    commentId: data.commentId || "",
    reminderTime: parseInt(data.reminderTime, 10) || 0,
    originalText: data.originalText || "",
    createdAt: parseInt(data.createdAt, 10) || 0,
  };
}

export async function scheduleReminder(
  input: ReminderInput,
  context: Context,
): Promise<string> {
  const counter = await context.redis.incr(COUNTER_KEY);
  const id = `rem_${counter}`;
  const now = Date.now();

  await context.redis.hSet(reminderKey(id), {
    userId: input.userId,
    username: input.username,
    postId: input.postId,
    postUrl: input.postUrl,
    postTitle: input.postTitle,
    commentId: input.commentId,
    reminderTime: String(input.reminderTime),
    originalText: input.originalText,
    createdAt: String(now),
  });

  await context.redis.zAdd(REMINDERS_SORTED_KEY, {
    member: id,
    score: input.reminderTime,
  });

  await context.redis.sAdd(userRemindersKey(input.userId), id);

  return id;
}

export async function cancelReminder(
  userId: string,
  reminderId: string,
  context: Context,
): Promise<boolean> {
  const data = await context.redis.hGetAll(reminderKey(reminderId));
  if (!data || data.userId !== userId) return false;

  await context.redis.del(reminderKey(reminderId));
  await context.redis.zRem(REMINDERS_SORTED_KEY, reminderId);
  await context.redis.sRem(userRemindersKey(userId), reminderId);

  return true;
}

export async function getActiveReminders(
  userId: string,
  context: Context,
): Promise<Reminder[]> {
  const ids = await context.redis.sMembers(userRemindersKey(userId));
  if (ids.length === 0) return [];

  const reminders: Reminder[] = [];
  const pipeline = ids.map((id) => context.redis.hGetAll(reminderKey(id)));
  const results = await Promise.all(pipeline);

  for (let i = 0; i < ids.length; i++) {
    const reminder = hashToReminder(ids[i], results[i]);
    if (reminder) reminders.push(reminder);
  }

  reminders.sort((a, b) => a.reminderTime - b.reminderTime);

  return reminders;
}

export async function getReminderById(
  reminderId: string,
  context: Context,
): Promise<Reminder | null> {
  const data = await context.redis.hGetAll(reminderKey(reminderId));
  if (!data || !data.userId) return null;
  return hashToReminder(reminderId, data);
}

export async function processDueReminders(context: Context): Promise<number> {
  const now = Date.now();

  const dueIds = await context.redis.zRangeByScore(
    REMINDERS_SORTED_KEY,
    0,
    now,
  );
  if (dueIds.length === 0) return 0;

  let delivered = 0;

  for (const id of dueIds) {
    try {
      const data = await context.redis.hGetAll(reminderKey(id));
      if (!data || !data.userId) {
        await context.redis.zRem(REMINDERS_SORTED_KEY, id);
        continue;
      }

      const postTitle = data.postTitle || "a post on Reddit";
      const postUrl = data.postUrl || "";
      const fullUrl = postUrl.startsWith("http")
        ? postUrl
        : `https://reddit.com${postUrl}`;

      const messageBody = [
        `Hey! You asked to be reminded about:`,
        ``,
        `**${postTitle}**`,
        ``,
        `[Click here to view the thread](${fullUrl})`,
        ``,
        `*This is an automated reminder from RemindMeBot.*`,
      ].join("\n");

      await context.reddit.sendPrivateMessage({
        to: data.username,
        subject: "RemindMeBot: Your reminder is due!",
        text: messageBody,
      });

      await context.redis.del(reminderKey(id));
      await context.redis.zRem(REMINDERS_SORTED_KEY, id);
      await context.redis.sRem(userRemindersKey(data.userId), id);

      delivered++;
    } catch (err) {
      console.error(`Failed to deliver reminder ${id}:`, err);
    }
  }

  return delivered;
}

export async function getActiveReminderCount(
  context: Context,
): Promise<number> {
  return context.redis.zCard(REMINDERS_SORTED_KEY);
}

export async function getUserReminderCount(
  userId: string,
  context: Context,
): Promise<number> {
  return context.redis.sCard(userRemindersKey(userId));
}
