import { Devvit } from "@devvit/public-api";
import { parseCommand, executeCommand } from "./commands.js";
import { getReasons, addReason, deleteReason } from "./reasons.js";
import { getLogs, formatLogEntry } from "./log.js";

Devvit.configure({
  redditAPI: true,
  redis: true,
});

// ─── Settings ──────────────────────────────────────────────────────

Devvit.addSettings([
  {
    name: "messageHeader",
    label: "Removal Message Header",
    type: "string",
    defaultValue:
      "Hi {author}, your submission has been removed for the following reason:",
    helpText: "Use {author}, {subreddit}, {url}, {title} as variables",
  },
  {
    name: "messageFooter",
    label: "Removal Message Footer",
    type: "string",
    defaultValue: "",
    helpText: "Appended after the reason message. Use the same variables.",
  },
  {
    name: "ruleEnabled",
    label: "Enable !rule command",
    type: "boolean",
    defaultValue: true,
  },
  {
    name: "spamEnabled",
    label: "Enable !spam command",
    type: "boolean",
    defaultValue: true,
  },
  {
    name: "banEnabled",
    label: "Enable !ban command",
    type: "boolean",
    defaultValue: true,
  },
  {
    name: "approveEnabled",
    label: "Enable !approve command",
    type: "boolean",
    defaultValue: true,
  },
  {
    name: "modOnlyMode",
    label: "Mod-Only Mode",
    type: "boolean",
    defaultValue: true,
    helpText:
      "Only moderators can use commands. Disable to let anyone use them.",
  },
]);

// ─── Forms ─────────────────────────────────────────────────────────

const AddReasonForm = Devvit.createForm(
  {
    title: "Add / Edit Removal Reason",
    description: "If the rule number already exists, it will be updated.",
    fields: [
      {
        name: "ruleNumber",
        label: "Rule Number",
        type: "number",
        required: true,
        helpText: "The number used in !rule {number}",
      },
      {
        name: "displayName",
        label: "Display Name",
        type: "string",
        required: true,
        helpText: 'Short name like "Spam" or "Off-Topic"',
      },
      {
        name: "messageTemplate",
        label: "Message Template",
        type: "string",
        required: true,
        helpText: "Use {author}, {subreddit}, {url}, {title} as variables",
      },
      {
        name: "flairText",
        label: "Flair Text (optional)",
        type: "string",
        required: false,
        helpText:
          "Post flair text to apply after removal. Leave empty for no flair.",
      },
    ],
    acceptLabel: "Save Reason",
  },
  async (event, context) => {
    const reason = {
      ruleNumber: event.values.ruleNumber as number,
      displayName: event.values.displayName as string,
      messageTemplate: event.values.messageTemplate as string,
      flairText: (event.values.flairText as string) || "",
    };
    await addReason(reason, context);
    context.ui.showToast(`Removal reason "${reason.displayName}" saved`);
  },
);

const DeleteReasonForm = Devvit.createForm(
  async (context) => {
    const reasons = await getReasons(context);
    return {
      title: "Delete Removal Reason",
      description: "Select a reason to remove.",
      fields: [
        {
          name: "ruleNumber",
          label: "Removal Reason",
          type: "select",
          required: true,
          options: reasons.map((r) => ({
            label: `Rule ${r.ruleNumber}: ${r.displayName}`,
            value: String(r.ruleNumber),
          })),
        },
      ],
      acceptLabel: "Delete Selected",
    };
  },
  async (event, context) => {
    const selected = event.values.ruleNumber as string[];
    if (!selected || selected.length === 0) {
      context.ui.showToast("No reason selected");
      return;
    }
    const ruleNumber = parseInt(selected[0], 10);
    const reasons = await getReasons(context);
    const reason = reasons.find((r) => r.ruleNumber === ruleNumber);
    await deleteReason(ruleNumber, context);
    context.ui.showToast(
      `Removal reason "${reason?.displayName ?? ruleNumber}" deleted`,
    );
  },
);

const ListReasonsForm = Devvit.createForm(
  async (context) => {
    const reasons = await getReasons(context);
    const displayText =
      reasons.length === 0
        ? "No removal reasons configured yet."
        : reasons
            .map(
              (r) =>
                `Rule ${r.ruleNumber}: ${r.displayName}\n` +
                `  Message: ${r.messageTemplate}\n` +
                `  Flair: ${r.flairText || "(none)"}`,
            )
            .join("\n\n");

    return {
      title: "Removal Reasons",
      description: `${reasons.length} reason(s) configured`,
      fields: [
        {
          name: "content",
          label: "",
          type: "paragraph",
          required: false,
          defaultValue: displayText,
        },
      ],
      acceptLabel: "Close",
    };
  },
  async (_event, _context) => {
    // no-op, just close
  },
);

const ViewLogForm = Devvit.createForm(
  async (context) => {
    const logs = await getLogs(context);
    const displayText =
      logs.length === 0
        ? "No actions logged yet."
        : logs.map(formatLogEntry).join("\n");

    return {
      title: "Mod Action Log",
      description: `${logs.length} action(s) recorded`,
      fields: [
        {
          name: "content",
          label: "",
          type: "paragraph",
          required: false,
          defaultValue: displayText,
        },
      ],
      acceptLabel: "Close",
    };
  },
  async (_event, _context) => {
    // no-op, just close
  },
);

// ─── Menu Items ────────────────────────────────────────────────────

Devvit.addMenuItem({
  location: "subreddit",
  label: "[Taskerbot] Add / Edit Removal Reason",
  forUserType: "moderator",
  onPress: async (_event, context) => {
    context.ui.showForm(AddReasonForm);
  },
});

Devvit.addMenuItem({
  location: "subreddit",
  label: "[Taskerbot] Delete Removal Reason",
  forUserType: "moderator",
  onPress: async (_event, context) => {
    context.ui.showForm(DeleteReasonForm);
  },
});

Devvit.addMenuItem({
  location: "subreddit",
  label: "[Taskerbot] List Removal Reasons",
  forUserType: "moderator",
  onPress: async (_event, context) => {
    context.ui.showForm(ListReasonsForm);
  },
});

Devvit.addMenuItem({
  location: "subreddit",
  label: "[Taskerbot] View Mod Log",
  forUserType: "moderator",
  onPress: async (_event, context) => {
    context.ui.showForm(ViewLogForm);
  },
});

// ─── Utility ───────────────────────────────────────────────────────

async function userIsModerator(
  username: string,
  subredditName: string,
  context: Devvit.Context,
): Promise<boolean> {
  try {
    const subreddit =
      await context.reddit.getSubredditInfoByName(subredditName);
    const mods: { name?: string }[] = await subreddit.getModerators();
    return mods.some((m) => m.name?.toLowerCase() === username.toLowerCase());
  } catch {
    return false;
  }
}

async function handleComment(
  commentId: string,
  context: Devvit.Context,
): Promise<void> {
  const comment = await context.reddit.getCommentById(commentId);
  if (!comment || !comment.body) return;

  const text = comment.body;
  const parsed = parseCommand(text);
  if (!parsed) return;

  const subredditName = comment.subredditName;
  if (!subredditName) return;

  const settings = context.settings as Record<
    string,
    string | boolean | undefined
  >;
  if (settings.modOnlyMode !== false) {
    const isMod = await userIsModerator(
      comment.authorName,
      subredditName,
      context,
    );
    if (!isMod) return;
  }

  const parentId = comment.parentId;
  if (!parentId) return;

  let targetId: string;
  let targetAuthor: string;
  let targetTitle: string;
  let targetUrl: string;

  if (parentId.startsWith("t3_")) {
    const post = await context.reddit.getPostById(parentId);
    targetId = post.id;
    targetAuthor = post.authorName;
    targetTitle = post.title || "(no title)";
    targetUrl = post.permalink || parentId;
  } else if (parentId.startsWith("t1_")) {
    const parentComment = await context.reddit.getCommentById(parentId);
    targetId = parentComment.id;
    targetAuthor = parentComment.authorName;
    targetTitle = `Comment by u/${parentComment.authorName}`;
    targetUrl = parentId;
  } else {
    return;
  }

  const result = await executeCommand(
    parsed,
    targetId,
    comment.authorName,
    subredditName,
    targetAuthor,
    targetTitle,
    targetUrl,
    context,
  );
}

// ─── Triggers ──────────────────────────────────────────────────────

Devvit.addTrigger({
  event: "CommentCreate",
  onEvent: async (event, context) => {
    const commentId = (event as { commentId?: string }).commentId;
    if (!commentId) return;

    try {
      await handleComment(commentId, context);
    } catch (e) {
      console.error("Taskerbot CommentCreate handler error:", e);
    }
  },
});

export default Devvit;
