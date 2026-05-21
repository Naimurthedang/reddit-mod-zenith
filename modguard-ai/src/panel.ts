import { Devvit } from '@devvit/public-api';
import { getDailyFlagCount, getDailyAverages, getTopAccounts } from './cleanup.js';

const DASHBOARD_POST_TITLE = 'ModGuard AI — Moderation Dashboard';

Devvit.addCustomPostType({
  name: 'ModGuard Dashboard',
  height: 'tall',
  render: (context) => {
    const { redis, reddit, useState, ui } = context;

    const [todayFlagged] = useState(async () => {
      return await getDailyFlagCount(redis);
    });

    const [weeklyAverages] = useState(async () => {
      return await getDailyAverages(redis, 7);
    });

    const [topAccounts] = useState(async () => {
      return await getTopAccounts(redis, 5);
    });

    const [selectedPostId, setSelectedPostId] = useState('');

    const handleApprove = async (postId: string) => {
      try {
        await reddit.approve(postId);
        ui.showToast({ text: 'Post approved', appearance: 'success' });
      } catch (e) {
        ui.showToast({ text: 'Failed to approve post', appearance: 'error' });
      }
    };

    const handleRemove = async (postId: string) => {
      try {
        await reddit.remove(postId);
        ui.showToast({ text: 'Post removed', appearance: 'success' });
      } catch (e) {
        ui.showToast({ text: 'Failed to remove post', appearance: 'error' });
      }
    };

    const maxCount = Math.max(1, ...weeklyAverages.map((d) => d.avg));
    const barMaxHeight = 80;

    return (
      <vstack padding="medium" gap="medium">
        <text size="xlarge" weight="bold">
          🛡️ ModGuard AI Dashboard
        </text>

        <hstack gap="medium">
          <vstack
            backgroundColor="#1a1a2e"
            cornerRadius="medium"
            padding="medium"
            alignment="center middle"
            gap="small"
          >
            <text size="large" color="#e94560">
              {String(todayFlagged)}
            </text>
            <text size="small" color="#cccccc">
              Flagged Today
            </text>
          </vstack>

          <vstack
            backgroundColor="#1a1a2e"
            cornerRadius="medium"
            padding="medium"
            alignment="center middle"
            gap="small"
          >
            <text size="large" color="#0f3460">
              {String(topAccounts.length)}
            </text>
            <text size="small" color="#cccccc">
              Top Suspects
            </text>
          </vstack>
        </hstack>

        <vstack gap="small">
          <text size="medium" weight="bold">
            7-Day Suspicion Trend
          </text>
          <hstack gap="small" alignment="end">
            {weeklyAverages.map((day) => {
              const barHeight = Math.max(4, (day.avg / maxCount) * barMaxHeight);
              const label = day.date.slice(5);

              return (
                <vstack
                  alignment="center"
                  gap="xsmall"
                  grow
                >
                  <vstack
                    backgroundColor="#e94560"
                    width="100%"
                    height={`${barHeight}px`}
                    cornerRadius="small"
                  />
                  <text size="xsmall" color="#999999">
                    {label}
                  </text>
                  <text size="xsmall" color="#cccccc">
                    {day.avg > 0 ? String(day.avg) : ''}
                  </text>
                </vstack>
              );
            })}
          </hstack>
        </vstack>

        <vstack gap="small">
          <text size="medium" weight="bold">
            Top Suspicious Accounts
          </text>
          {topAccounts.length === 0 ? (
            <text color="#666666">No accounts flagged yet.</text>
          ) : (
            topAccounts.map((account, i) => (
              <hstack
                key={account.username}
                gap="small"
                padding="small"
                backgroundColor="#16213e"
                cornerRadius="small"
              >
                <text color="#e94560" weight="bold">
                  #{i + 1}
                </text>
                <text color="#ffffff" weight="bold">
                  u/{account.username}
                </text>
                <text color="#ffd700">
                  Score: {String(account.score)}
                </text>
              </hstack>
            ))
          )}
        </vstack>

        <vstack gap="small">
          <text size="medium" weight="bold">
            Quick Actions
          </text>
          <text size="small" color="#999999">
            Enter a post ID to approve or remove:
          </text>
          <hstack gap="small">
            <textbox
              placeholder="t3_xxxxxx"
              value={selectedPostId}
              onInput={(e) => setSelectedPostId(e?.value || '')}
            />
          </hstack>
          <hstack gap="small">
            <button
              appearance="success"
              disabled={!selectedPostId}
              onPress={() => handleApprove(selectedPostId)}
            >
              Approve
            </button>
            <button
              appearance="destructive"
              disabled={!selectedPostId}
              onPress={() => handleRemove(selectedPostId)}
            >
              Remove
            </button>
          </hstack>
        </vstack>

        <vstack gap="xsmall">
          <text size="small" color="#666666">
            ModGuard AI v0.1.0 — Scores are calculated from behavioral signals.
          </text>
          <text size="small" color="#666666">
            Auto-hold threshold can be adjusted in app settings.
          </text>
        </vstack>
      </vstack>
    );
  },
});

Devvit.addMenuItem({
  label: 'Open ModGuard Dashboard',
  location: 'subreddit',
  forUserType: 'moderator',
  handler: async (event, context) => {
    const { reddit, ui } = context;
    try {
      const subreddit = await reddit.getCurrentSubreddit();

      const posts = await reddit.getPosts({
        subredditName: subreddit.name,
        sort: 'new',
        limit: 100,
      });

      let dashboardPost: typeof posts[0] | undefined;

      for await (const p of posts) {
        if (p.title === DASHBOARD_POST_TITLE) {
          dashboardPost = p;
          break;
        }
      }

      if (dashboardPost) {
        ui.navigateTo(dashboardPost);
        return;
      }

      const post = await reddit.submitPost({
        subredditName: subreddit.name,
        title: DASHBOARD_POST_TITLE,
        customPostType: 'ModGuard Dashboard',
      });

      ui.navigateTo(post);
    } catch (e) {
      ui.showToast({ text: 'Could not open dashboard', appearance: 'error' });
    }
  },
});
