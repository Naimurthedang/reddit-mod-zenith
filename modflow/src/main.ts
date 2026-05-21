import { Devvit } from '@devvit/public-api';
import { SETTINGS_DEFINITIONS, getSettings } from './config.js';
import { scoreModQueueItem, cacheScore } from './scorer.js';
import { ModFlowQueue } from './queue-view.js';

Devvit.configure({
  redis: true,
  redditAPI: true,
});

// ──────────────────────────────────────────────
// SETTINGS
// ──────────────────────────────────────────────
Devvit.addSettings(SETTINGS_DEFINITIONS);

// ──────────────────────────────────────────────
// TRIGGERS
// ──────────────────────────────────────────────
Devvit.addTrigger({
  event: 'PostSubmit',
  onEvent: async (event, context) => {
    try {
      const post = event.data;
      if (!post || !post.subreddit) return;

      const subName = typeof post.subreddit === 'string' ? post.subreddit : post.subreddit.name;
      if (!subName) return;

      let authorName = '[deleted]';
      let authorKarma = 0;
      let authorCreatedUtc = Math.floor(Date.now() / 1000) - 86400 * 30;

      if (post.author) {
        const authorStr = typeof post.author === 'string' ? post.author : post.author.name;
        if (authorStr) {
          authorName = authorStr;
          try {
            const user = await context.reddit.getUser(authorStr);
            if (user) {
              authorKarma = user.totalKarma ?? 0;
              authorCreatedUtc = user.createdUtc ?? authorCreatedUtc;
            }
          } catch {
            // author data unavailable
          }
        }
      }

      const rawItem = {
        kind: 't3',
        data: {
          name: post.id ?? `t3_${Date.now()}`,
          title: post.title ?? '',
          body: post.selfText ?? '',
          selftext: post.selfText ?? '',
          score: 1,
          upvote_ratio: 1,
          num_reports: 0,
          created_utc: Math.floor(Date.now() / 1000),
          author: { name: authorName, total_karma: authorKarma, created_utc: authorCreatedUtc },
          domain: post.domain ?? '',
          url: post.url ?? '',
          link_flair_text: post.linkFlairText ?? undefined,
        },
      };

      const scored = await scoreModQueueItem(rawItem, context);
      if (scored) {
        await cacheScore(context, subName, scored);
      }

      const settings = await getSettings(context);

      const postId = post.id ?? '';
      const alerted = await context.redis.get(`modflow:alerted:${subName}:${postId}`);
      if (!alerted) {
        await checkViralAlert(postId, subName, context, settings.alertThreshold, settings.alertModmail);
      }
    } catch (e) {
      console.error('PostSubmit trigger error:', e);
    }
  },
});

Devvit.addTrigger({
  event: 'CommentSubmit',
  onEvent: async (event, context) => {
    try {
      const comment = event.data;
      if (!comment || !comment.subreddit) return;

      const subName = typeof comment.subreddit === 'string' ? comment.subreddit : comment.subreddit.name;
      if (!subName) return;

      let authorName = '[deleted]';
      let authorKarma = 0;
      let authorCreatedUtc = Math.floor(Date.now() / 1000) - 86400 * 30;

      if (comment.author) {
        const authorStr = typeof comment.author === 'string' ? comment.author : comment.author.name;
        if (authorStr) {
          authorName = authorStr;
          try {
            const user = await context.reddit.getUser(authorStr);
            if (user) {
              authorKarma = user.totalKarma ?? 0;
              authorCreatedUtc = user.createdUtc ?? authorCreatedUtc;
            }
          } catch {
            // author data unavailable
          }
        }
      }

      const rawItem = {
        kind: 't1',
        data: {
          name: comment.id ?? `t1_${Date.now()}`,
          title: '',
          body: comment.body ?? '',
          score: 1,
          upvote_ratio: 0,
          num_reports: 0,
          created_utc: Math.floor(Date.now() / 1000),
          author: { name: authorName, total_karma: authorKarma, created_utc: authorCreatedUtc },
          domain: undefined,
          url: undefined,
          link_flair_text: undefined,
        },
      };

      const scored = await scoreModQueueItem(rawItem, context);
      if (scored) {
        await cacheScore(context, subName, scored);
      }
    } catch (e) {
      console.error('CommentSubmit trigger error:', e);
    }
  },
});

// ──────────────────────────────────────────────
// MENU ITEM
// ──────────────────────────────────────────────
Devvit.addMenuItem({
  label: '🔥 Open ModFlow Dashboard',
  location: 'subreddit',
  forUserType: 'moderator',
  onPress: async (event, context) => {
    try {
      const subreddit = await context.reddit.getCurrentSubreddit();
      const subName = subreddit.name;
      const dashboardKey = `modflow:dashboard:${subName}`;
      let existingPostId = await context.redis.get(dashboardKey);

      if (existingPostId) {
        try {
          const existingPost = await context.reddit.getPostById(existingPostId);
          if (existingPost) {
            await context.ui.navigateTo(existingPost);
            return;
          }
        } catch {
          // post was deleted or inaccessible, create a new one
        }
      }

      const post = await context.reddit.submitPost({
        subredditName: subName,
        title: '🔥 ModFlow Priority Queue Dashboard',
        text: 'ModQueue priority scores and management. Refresh to rescore current items.',
        preview: (
          <vstack alignment="center middle" padding="large">
            <text size="xlarge" weight="bold">Loading ModFlow Dashboard...</text>
            <spacer size="small" />
            <text color="secondary">Scoring modqueue items by priority</text>
          </vstack>
        ),
      });

      if (post) {
        await context.redis.set(dashboardKey, post.id);
        await context.ui.navigateTo(post);
      }
    } catch (e) {
      console.error('Error opening dashboard:', e);
      context.ui.showToast('Failed to open ModFlow dashboard');
    }
  },
});

// ──────────────────────────────────────────────
// SCHEDULED JOB: Viral Post Checker
// ──────────────────────────────────────────────
Devvit.addSchedulerJob({
  name: 'checkViralPosts',
  onRun: async (event, context) => {
    try {
      const subreddit = await context.reddit.getCurrentSubreddit();
      const subName = subreddit.name;
      const settings = await getSettings(context);

      const modQueue = await context.reddit.getModQueue({
        subredditName: subName,
        type: 'post',
        limit: 25,
      });

      for await (const post of modQueue) {
        if (!post || !post.id) continue;

        const alerted = await context.redis.get(`modflow:alerted:${subName}:${post.id}`);
        if (alerted) continue;

        const postId = post.id;
        const reports = post.numReports ?? 0;
        if (reports === 0) continue;

        const createdAt = post.createdAt ?? Math.floor(Date.now() / 1000);
        const ageHours = Math.max(0.0167, (Date.now() / 1000 - createdAt) / 3600);
        const velocity = (post.score ?? 0) / ageHours;

        if (velocity >= settings.alertThreshold && reports > 0) {
          await sendViralAlert(postId, post.title ?? 'Untitled', subName, velocity, reports, context);
          await context.redis.set(`modflow:alerted:${subName}:${post.id}`, 'true');
        }
      }
    } catch (e) {
      console.error('Viral check job error:', e);
    }
  },
});

async function checkViralAlert(
  postId: string,
  subName: string,
  context: Devvit.Context,
  threshold: number,
  alertEnabled: boolean
): Promise<void> {
  if (!alertEnabled) return;

  try {
    const alerted = await context.redis.get(`modflow:alerted:${subName}:${postId}`);
    if (alerted) return;

    const post = await context.reddit.getPostById(postId);
    if (!post) return;

    const createdAt = post.createdAt ?? Math.floor(Date.now() / 1000);
    const ageHours = Math.max(0.0167, (Date.now() / 1000 - createdAt) / 3600);
    const velocity = (post.score ?? 0) / ageHours;

    if (velocity >= threshold && (post.numReports ?? 0) > 0) {
      await sendViralAlert(postId, post.title ?? 'Untitled', subName, velocity, post.numReports ?? 0, context);
      await context.redis.set(`modflow:alerted:${subName}:${postId}`, 'true');
    }
  } catch (e) {
    console.error('Error in viral alert check:', e);
  }
}

async function sendViralAlert(
  postId: string,
  title: string,
  subName: string,
  velocity: number,
  reports: number,
  context: Devvit.Context
): Promise<void> {
  try {
    const subreddit = await context.reddit.getCurrentSubreddit();
    const subject = `🚨 Hot Post Alert: "${title.slice(0, 80)}"`;
    const body = [
      `## 🚨 ModFlow Alert: Viral Post with Reports`,
      ``,
      `**Post:** [${title}](https://reddit.com/r/${subName}/comments/${postId.replace('t3_', '')})`,
      `**Upvote Velocity:** ${velocity.toFixed(1)} upvotes/hour`,
      `**Reports:** ${reports}`,
      `**Subreddit:** r/${subName}`,
      ``,
      `This post is gaining traction quickly and has received user reports.`,
      `Review it in ModFlow: https://reddit.com/r/${subName}`,
      ``,
      `---`,
      `*Sent by ModFlow v0.1.0*`,
    ].join('\n');

    await context.reddit.modMail.sendMessage({
      subject,
      body,
      to: { kind: 'subreddit', id: subreddit.id },
    });
  } catch (e) {
    console.error('Error sending viral alert modmail:', e);
  }
}

// ──────────────────────────────────────────────
// CUSTOM POST TYPE
// ──────────────────────────────────────────────
Devvit.addCustomPostType(ModFlowQueue);

// ──────────────────────────────────────────────
// SCHEDULER SETUP (runs on app install)
// ──────────────────────────────────────────────
async function setupScheduler(context: Devvit.Context): Promise<void> {
  try {
    const scheduled = await context.redis.get('modflow:scheduler:checkViralPosts');
    if (!scheduled) {
      await context.scheduler.runRepeated({
        name: 'checkViralPosts',
        cron: '*/5 * * * *',
      });
      await context.redis.set('modflow:scheduler:checkViralPosts', 'true');
    }
  } catch (e) {
    console.error('Error setting up scheduler:', e);
  }
}

Devvit.addTrigger({
  event: 'AppInstall',
  onEvent: async (event, context) => {
    await setupScheduler(context);
  },
});

Devvit.addTrigger({
  event: 'AppUpgrade',
  onEvent: async (event, context) => {
    await setupScheduler(context);
  },
});

export default Devvit;
