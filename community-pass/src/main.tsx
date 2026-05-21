import { Devvit } from "@devvit/public-api";
import {
  getScore,
  saveScore,
  addPoints,
  deductPoints,
  POINTS,
  TRUST_LEVEL_NAMES,
} from "./scoring.js";
import {
  checkAndPromote,
  getLevelBadgeEmoji,
  getLevelColor,
} from "./levels.js";
import { getPassportData, PassportCard } from "./passport.js";
import { loadConfig, getThresholdsFromConfig } from "./config.js";

Devvit.configure({
  reddit: true,
  redis: true,
});

const LEVEL1_HELD_POSTS = "communitypass:held:posts";
const MOD_VOUCH_KEY = "communitypass:vouched";

async function getAccountAgeDays(
  username: string,
  context: Devvit.Context,
): Promise<number> {
  try {
    const user = await context.reddit.getUserByUsername(username);
    const created = new Date(user.createdAt).getTime();
    const now = Date.now();
    return Math.floor((now - created) / (1000 * 60 * 60 * 24));
  } catch {
    return 0;
  }
}

async function getOrCreateScore(
  userId: string,
  username: string | undefined,
  context: Devvit.Context,
): Promise<ReturnType<typeof getScore> extends Promise<infer T> ? T : never> {
  let score = await getScore(userId, context);

  if (!score) {
    const accountAgeDays = username
      ? await getAccountAgeDays(username, context)
      : 0;
    score = {
      userId,
      points: Math.min(accountAgeDays * 2, 40),
      trustLevel: 1,
      totalApproved: 0,
      totalRemoved: 0,
      totalBans: 0,
      accountAgeDays,
      lastActivity: Date.now(),
      vouched: false,
      permanentBan: false,
    };
    await saveScore(score, context);
  }

  return score;
}

Devvit.addTrigger({
  event: "PostSubmit",
  onEvent: async (event, context) => {
    try {
      const post = event.post;
      if (!post || !post.authorId) return;

      const authorId = post.authorId;
      const score = await getOrCreateScore(authorId, post.authorName, context);

      const config = await loadConfig(context);
      const thresholds = getThresholdsFromConfig(config);
      const trustLevel = score.trustLevel;

      if (trustLevel === 1 && config.autoReportLevel1) {
        await context.redis.hSet(LEVEL1_HELD_POSTS, {
          [post.id]: String(authorId),
        });
        try {
          const subreddit = await context.reddit.getCurrentSubreddit();
          await context.reddit.setPostFlair({
            subredditName: subreddit.name,
            postId: post.id,
            flairText: `🟡 Needs Review | L1 (${score.points} pts)`,
          });
        } catch {}
      }

      if (config.autoPromote) {
        await checkAndPromote(authorId, context);
      }

      if (config.showFlair) {
        try {
          const badge = getLevelBadgeEmoji(trustLevel);
          await context.reddit.setUserFlair({
            subredditName: (await context.reddit.getCurrentSubreddit()).name,
            username: post.authorName ?? "",
            flairText: `${badge} L${trustLevel}${trustLevel < 5 ? ` (${score.points} pts)` : ""}`,
          });
        } catch {}
      }
    } catch (err) {
      console.error("CommunityPass PostSubmit error:", err);
    }
  },
});

Devvit.addTrigger({
  event: "CommentSubmit",
  onEvent: async (event, context) => {
    try {
      const comment = event.comment;
      if (!comment || !comment.authorId) return;

      const authorId = comment.authorId;
      const score = await getOrCreateScore(
        authorId,
        comment.authorName,
        context,
      );
      score.lastActivity = Date.now();
      await saveScore(score, context);

      const config = await loadConfig(context);
      if (config.autoPromote) {
        await checkAndPromote(authorId, context);
      }
    } catch (err) {
      console.error("CommunityPass CommentSubmit error:", err);
    }
  },
});

Devvit.addTrigger({
  event: "ModActions",
  onEvent: async (event, context) => {
    try {
      const action = event.action;
      if (!action) return;

      switch (action) {
        case "approve": {
          const target = event.target;
          if (target?.authorId) {
            await addPoints(
              target.authorId,
              POINTS.APPROVED_POST,
              "Post approved",
              context,
            );
            const score = await getScore(target.authorId, context);
            if (score) {
              score.totalApproved += 1;
              await saveScore(score, context);
            }

            await context.redis.hDel(LEVEL1_HELD_POSTS, target.id ?? "");

            const config = await loadConfig(context);
            if (config.autoPromote) {
              await checkAndPromote(target.authorId, context);
            }
          }
          break;
        }
        case "remove": {
          const target = event.target;
          if (target?.authorId) {
            await deductPoints(
              target.authorId,
              Math.abs(POINTS.REMOVED_POST),
              "Post removed",
              context,
            );
            const score = await getScore(target.authorId, context);
            if (score) {
              score.totalRemoved += 1;
              await saveScore(score, context);
            }
          }
          break;
        }
        case "ban": {
          const targetUser = event.target;
          if (targetUser?.authorId) {
            await deductPoints(
              targetUser.authorId,
              Math.abs(POINTS.TEMP_BAN),
              "Temporary ban",
              context,
            );
            const score = await getScore(targetUser.authorId, context);
            if (score) {
              score.totalBans += 1;
              await saveScore(score, context);
            }
          }
          break;
        }
        case "permanent_ban": {
          const targetUser = event.target;
          if (targetUser?.authorId) {
            const score = await getOrCreateScore(
              targetUser.authorId,
              targetUser.authorName,
              context,
            );
            score.permanentBan = true;
            score.points = Math.min(score.points, -100);
            score.totalBans += 1;
            await saveScore(score, context);
          }
          break;
        }
        case "unban": {
          const targetUser = event.target;
          if (targetUser?.authorId) {
            const score = await getScore(targetUser.authorId, context);
            if (score) {
              score.permanentBan = false;
              await saveScore(score, context);
            }
          }
          break;
        }
      }
    } catch (err) {
      console.error("CommunityPass ModActions error:", err);
    }
  },
});

const vouchForm = Devvit.createForm(
  {
    fields: [
      {
        type: "string",
        name: "username",
        label: "Username to vouch for",
        helpText: "Enter the exact Reddit username.",
        required: true,
      },
      {
        type: "paragraph",
        name: "reason",
        label: "Reason for vouching",
        helpText: "Why does this user deserve a vouch?",
        required: false,
      },
    ],
    title: "CommunityPass: Vouch User",
    acceptLabel: "Submit Vouch",
  },
  async (formEvent, context) => {
    try {
      const { username, reason } = formEvent.values as {
        username: string;
        reason?: string;
      };

      let targetUser: { id: string; username: string } | null = null;
      try {
        targetUser = await context.reddit.getUserByUsername(username);
      } catch {
        context.ui.showToast(`User "${username}" not found.`);
        return;
      }

      const targetUserId = targetUser.id;
      let score = await getScore(targetUserId, context);

      if (!score) {
        const accountAgeDays = await getAccountAgeDays(
          targetUser.username,
          context,
        );
        score = {
          userId: targetUserId,
          points: 40,
          trustLevel: 1,
          totalApproved: 0,
          totalRemoved: 0,
          totalBans: 0,
          accountAgeDays,
          lastActivity: Date.now(),
          vouched: true,
          permanentBan: false,
        };
      } else {
        score.vouched = true;
        score.lastActivity = Date.now();
      }

      score.points += POINTS.MOD_VOUCH;
      await saveScore(score, context);

      await context.redis.hSet(MOD_VOUCH_KEY, { [targetUserId]: username });

      const config = await loadConfig(context);
      if (config.autoPromote) {
        const newLevel = await checkAndPromote(targetUserId, context);
        if (newLevel) {
          context.ui.showToast(
            `Vouched for u/${username}! They've been promoted to level ${newLevel} (${TRUST_LEVEL_NAMES[newLevel]}).`,
          );
          return;
        }
      }

      context.ui.showToast(
        `Vouched for u/${username}! Score: ${score.points} pts.`,
      );
    } catch (err) {
      context.ui.showToast(
        "Failed to vouch user. Check the username and try again.",
      );
      console.error("Vouch error:", err);
    }
  },
);

const setLevelForm = Devvit.createForm(
  {
    fields: [
      {
        type: "string",
        name: "username",
        label: "Username to set level for",
        required: true,
      },
      {
        type: "select",
        name: "level",
        label: "Trust Level",
        required: true,
        options: [
          { label: "1 - New (all posts held)", value: "1" },
          { label: "2 - Known (auto-approved)", value: "2" },
          { label: "3 - Trusted (full rights)", value: "3" },
          { label: "4 - Veteran (megathreads)", value: "4" },
          { label: "5 - Elder (can approve)", value: "5" },
        ],
      },
    ],
    title: "CommunityPass: Set Trust Level",
    acceptLabel: "Update",
  },
  async (formEvent, context) => {
    try {
      const values = formEvent.values as { username: string; level: string[] };
      const { username, level } = values;
      const targetLevel = parseInt(level[0], 10);

      let targetUser: { id: string; username: string } | null = null;
      try {
        targetUser = await context.reddit.getUserByUsername(username);
      } catch {
        context.ui.showToast(`User "${username}" not found.`);
        return;
      }

      const score = await getOrCreateScore(targetUser.id, username, context);
      score.trustLevel = targetLevel;
      score.lastActivity = Date.now();
      await saveScore(score, context);

      context.ui.showToast(
        `Set u/${username} to Level ${targetLevel} (${TRUST_LEVEL_NAMES[targetLevel]}).`,
      );
    } catch (err) {
      context.ui.showToast("Failed to set trust level.");
      console.error("SetLevel error:", err);
    }
  },
);

Devvit.addMenuItem({
  label: "CommunityPass: View Passport",
  location: "post",
  onPress: async (event, context) => {
    try {
      const postId = event.targetId;
      const post = await context.reddit.getPostById(postId);
      const authorId = post.authorId;
      const authorName = post.authorName ?? "Unknown";

      const score = await getOrCreateScore(authorId, authorName, context);
      const passportData = await getPassportData(
        authorId,
        authorName,
        score,
        context,
      );
      const badge = getLevelBadgeEmoji(score.trustLevel);
      const levelColor = getLevelColor(score.trustLevel);
      const levelName = TRUST_LEVEL_NAMES[score.trustLevel] ?? "Unknown";

      context.ui.showToast(
        `${badge} u/${authorName} — Level ${score.trustLevel} (${levelName}) — ${score.points} pts`,
      );
    } catch (err) {
      context.ui.showToast("Could not load passport data.");
      console.error("ViewPassport error:", err);
    }
  },
});

Devvit.addMenuItem({
  label: "CommunityPass: Vouch User",
  location: "subreddit",
  forUserType: "moderator",
  onPress: (event, context) => {
    context.ui.showForm(vouchForm);
  },
});

Devvit.addMenuItem({
  label: "CommunityPass: Set Trust Level",
  location: "subreddit",
  forUserType: "moderator",
  onPress: (event, context) => {
    context.ui.showForm(setLevelForm);
  },
});

Devvit.addMenuItem({
  label: "CommunityPass: My Passport Card",
  location: "subreddit",
  onPress: async (event, context) => {
    try {
      const currentUser = await context.reddit.getCurrentUser();
      if (!currentUser) {
        context.ui.showToast("Could not identify current user.");
        return;
      }

      const score = await getOrCreateScore(
        currentUser.id,
        currentUser.username,
        context,
      );
      const passportData = await getPassportData(
        currentUser.id,
        currentUser.username,
        score,
        context,
      );
      const badge = getLevelBadgeEmoji(score.trustLevel);
      const levelName = TRUST_LEVEL_NAMES[score.trustLevel] ?? "Unknown";

      context.ui.showToast(
        `${badge} You are Level ${score.trustLevel} (${levelName}) — ${score.points} pts`,
      );
    } catch (err) {
      context.ui.showToast("Could not load your passport.");
      console.error("MyPassport error:", err);
    }
  },
});

Devvit.addCustomPostType({
  name: "CommunityPass Passport",
  description:
    "Displays a user's CommunityPass trust level and reputation score.",
  render: async (context) => {
    try {
      const postId = context.postId;
      if (!postId) {
        return (
          <vstack padding="medium">
            <text>Could not load passport.</text>
          </vstack>
        );
      }

      const post = await context.reddit.getPostById(postId);
      const authorId = post.authorId;
      const authorName = post.authorName ?? "Unknown";

      const score = await getOrCreateScore(authorId, authorName, context);
      const passportData = await getPassportData(
        authorId,
        authorName,
        score,
        context,
      );

      return <PassportCard data={passportData} />;
    } catch (err) {
      console.error("PassportCard render error:", err);
      return (
        <vstack padding="medium">
          <text>Error loading passport data.</text>
        </vstack>
      );
    }
  },
});

Devvit.addSettings([
  {
    type: "number",
    name: "thresholdL1",
    label: "Level 1 (New) minimum points",
    helpText: "Default: 0",
    defaultValue: 0,
    minValue: 0,
  },
  {
    type: "number",
    name: "thresholdL2",
    label: "Level 2 (Known) minimum points",
    helpText: "Default: 50",
    defaultValue: 50,
    minValue: 0,
  },
  {
    type: "number",
    name: "thresholdL3",
    label: "Level 3 (Trusted) minimum points",
    helpText: "Default: 200",
    defaultValue: 200,
    minValue: 0,
  },
  {
    type: "number",
    name: "thresholdL4",
    label: "Level 4 (Veteran) minimum points",
    helpText: "Default: 500",
    defaultValue: 500,
    minValue: 0,
  },
  {
    type: "number",
    name: "thresholdL5",
    label: "Level 5 (Elder) minimum points",
    helpText: "Default: 1000. Requires mod vouch.",
    defaultValue: 1000,
    minValue: 0,
  },
  {
    type: "boolean",
    name: "showFlair",
    label: "Show trust level as user flair",
    helpText: "When enabled, trust level badges appear on user flair.",
    defaultValue: true,
  },
  {
    type: "boolean",
    name: "autoPromote",
    label: "Auto-promote users when they cross thresholds",
    helpText: "When disabled, users must be manually promoted by a mod.",
    defaultValue: true,
  },
  {
    type: "boolean",
    name: "autoReportLevel1",
    label: "Report Level 1 posts to modqueue",
    helpText:
      "When enabled, posts from Level 1 users are automatically reported.",
    defaultValue: true,
  },
]);

export default Devvit;
