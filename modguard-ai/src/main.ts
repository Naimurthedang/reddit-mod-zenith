import { Devvit } from "@devvit/public-api";
import { loadSettings, SETTINGS_DEFINITIONS } from "./config.js";
import { calculateScore } from "./scorer.js";
import {
  recordScore,
  updateAccountScore,
  runCleanup,
  CLEANUP_JOB_NAME,
  LAST_CLEANUP_KEY,
} from "./cleanup.js";

Devvit.addSettings(SETTINGS_DEFINITIONS);

Devvit.addTrigger({
  event: "PostSubmit",
  handler: async (event, context) => {
    const { reddit, redis, log } = context;
    const postId = event.postId ?? event.post?.id;
    if (!postId) return;

    try {
      const post = await reddit.getPostById(postId);
      if (!post || !post.authorName) return;

      const settings = await loadSettings(context);

      if (settings.whitelist.includes(post.authorName.toLowerCase())) {
        return;
      }

      const text = `${post.title ?? ""} ${post.body ?? ""}`.trim();

      if (!text) return;

      const scoreResult = await calculateScore({
        reddit,
        redis,
        settings,
        authorUsername: post.authorName,
        authorId: post.authorId ?? "",
        text,
      });

      await recordScore(redis, postId, scoreResult.total, scoreResult.flagged);
      await updateAccountScore(redis, post.authorName, scoreResult.total);

      let flairText = "🤖 AI Risk";
      if (scoreResult.total >= 75) {
        flairText = "🤖 AI Risk: HIGH";
      } else if (scoreResult.total >= 50) {
        flairText = "🤖 AI Risk: MED";
      } else {
        flairText = "🤖 AI Risk: LOW";
      }

      try {
        const currentSub =
          post.subredditName ??
          (await reddit.getCurrentSubreddit().then((s) => s.name));
        await reddit.setPostFlair({
          subredditName: currentSub,
          postId: post.id,
          text: flairText,
        });
      } catch (flairErr) {
        log.warn(`[ModGuard] Could not set flair for ${postId}: ${flairErr}`);
      }

      if (scoreResult.flagged) {
        try {
          await reddit.report({
            id: postId,
            reason: `ModGuard AI: Suspicion score ${scoreResult.total}/100 — auto-flagged for review`,
          });
        } catch {
          log.warn(
            `[ModGuard] Could not report post ${postId} — no mod permissions`,
          );
        }
      }

      log.info(
        `[ModGuard] Post ${postId} by u/${post.authorName} scored ${scoreResult.total}/100 (flagged: ${scoreResult.flagged})`,
      );
    } catch (err) {
      log.error(`[ModGuard] Error processing PostSubmit for ${postId}: ${err}`);
    }
  },
});

Devvit.addTrigger({
  event: "CommentSubmit",
  handler: async (event, context) => {
    const { reddit, redis, log } = context;
    const commentId = event.commentId ?? event.comment?.id;
    if (!commentId) return;

    try {
      const comment = await reddit.getCommentById(commentId);
      if (!comment || !comment.authorName) return;

      const settings = await loadSettings(context);

      if (settings.whitelist.includes(comment.authorName.toLowerCase())) {
        return;
      }

      const text = (comment.body ?? "").trim();
      if (!text || text.length < 10) return;

      const scoreResult = await calculateScore({
        reddit,
        redis,
        settings,
        authorUsername: comment.authorName,
        authorId: comment.authorId ?? "",
        text,
      });

      await recordScore(
        redis,
        commentId,
        scoreResult.total,
        scoreResult.flagged,
      );
      await updateAccountScore(redis, comment.authorName, scoreResult.total);

      if (scoreResult.flagged) {
        try {
          await reddit.report({
            id: commentId,
            reason: `ModGuard AI: Suspicion score ${scoreResult.total}/100 — auto-flagged for review`,
          });
        } catch {
          log.warn(`[ModGuard] Could not report comment ${commentId}`);
        }
      }

      log.info(
        `[ModGuard] Comment ${commentId} by u/${comment.authorName} scored ${scoreResult.total}/100`,
      );
    } catch (err) {
      log.error(
        `[ModGuard] Error processing CommentSubmit for ${commentId}: ${err}`,
      );
    }
  },
});

Devvit.addTrigger({
  event: "AppInstall",
  handler: async (event, context) => {
    const { scheduler, redis, log } = context;

    log.info("[ModGuard] App installed — scheduling daily cleanup...");
    await redis.set(LAST_CLEANUP_KEY, String(Date.now()));

    await scheduler.runJob({
      name: CLEANUP_JOB_NAME,
      cron: "0 4 * * *",
      data: {},
    });

    log.info("[ModGuard] Daily cleanup scheduled for 04:00 UTC.");
  },
});

Devvit.addTrigger({
  event: "AppUpgrade",
  handler: async (event, context) => {
    const { scheduler, redis, log } = context;

    log.info("[ModGuard] App upgraded — ensuring cleanup job is scheduled...");

    try {
      await scheduler.runJob({
        name: CLEANUP_JOB_NAME,
        cron: "0 4 * * *",
        data: {},
      });
    } catch {
      log.info("[ModGuard] Cleanup job may already be scheduled.");
    }

    await redis.set(LAST_CLEANUP_KEY, String(Date.now()));
  },
});

Devvit.addSchedulerJob({
  name: CLEANUP_JOB_NAME,
  handler: async (event, context) => {
    const { redis, log } = context;
    await runCleanup(redis, log);
  },
});

Devvit.addMenuItem({
  label: "Check Post Score",
  location: "post",
  forUserType: "moderator",
  handler: async (event, context) => {
    const { redis, ui } = context;
    const postId = event.targetId;

    if (!postId) {
      ui.showToast({
        text: "Could not identify this post",
        appearance: "error",
      });
      return;
    }

    try {
      const scoreData = await redis.hGetAll(`score:${postId}`);
      if (!scoreData || Object.keys(scoreData).length === 0) {
        ui.showToast({
          text: "No score data for this post",
          appearance: "info",
        });
        return;
      }

      const score = scoreData.score ?? "?";
      const flagged = scoreData.flagged === "1";
      const timestamp = scoreData.timestamp
        ? new Date(parseInt(scoreData.timestamp, 10)).toLocaleString()
        : "unknown";

      ui.showToast({
        text: `Score: ${score}/100 | Flagged: ${flagged ? "YES" : "NO"} | ${timestamp}`,
        appearance: flagged ? "warning" : "success",
      });
    } catch {
      ui.showToast({ text: "Error fetching score", appearance: "error" });
    }
  },
});

export default Devvit;
