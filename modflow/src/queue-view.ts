import { Devvit } from '@devvit/public-api';
import { QueueItem, getPriorityColor, getPriorityLabel, scoreModQueueItem, cacheScore } from './scorer.js';
import { getSettings, ModFlowSettings } from './config.js';

type FilterMode = 'all' | 'urgent' | 'medium' | 'low' | 'posts' | 'comments';

interface ModAction {
  moderator: string;
  action: 'approve' | 'remove' | 'spam';
  timestamp: number;
  itemTitle: string;
}

async function logAction(
  context: Devvit.Context,
  fullname: string,
  action: ModAction['action'],
  moderator: string,
  itemTitle: string
): Promise<void> {
  const key = `modflow:actions:${fullname}`;
  const existing = await context.redis.get(key);
  const actions: ModAction[] = existing ? JSON.parse(existing) : [];
  actions.push({ moderator, action, timestamp: Date.now(), itemTitle });
  await context.redis.set(key, JSON.stringify(actions));
}

async function fetchModQueue(context: Devvit.CustomPostContext): Promise<QueueItem[]> {
  try {
    const subreddit = await context.reddit.getCurrentSubreddit();
    const subName = subreddit.name;

    const allItems: QueueItem[] = [];

    const postQueue = await context.reddit.getModQueue({
      subredditName: subName,
      type: 'post',
      limit: 50,
    });

    for await (const post of postQueue) {
      const authorData = {
        name: post.authorName ?? '[deleted]',
        total_karma: 0,
        created_utc: Math.floor(Date.now() / 1000) - 86400 * 30,
      };

      try {
        if (post.authorName) {
          const user = await context.reddit.getUser(post.authorName);
          if (user) {
            authorData.total_karma = user.totalKarma ?? 0;
            authorData.created_utc = user.createdUtc ?? authorData.created_utc;
          }
        }
      } catch {
        // continue with defaults
      }

      const rawItem = {
        kind: 't3',
        data: {
          name: post.id,
          title: post.title ?? '',
          body: post.selfText ?? '',
          selftext: post.selfText ?? '',
          score: post.score ?? 0,
          upvote_ratio: post.upvoteRatio ?? 0,
          num_reports: post.numReports ?? 0,
          created_utc: post.createdAt ?? Math.floor(Date.now() / 1000),
          author: authorData,
          domain: post.domain ?? '',
          url: post.url ?? '',
          link_flair_text: post.flairText ?? undefined,
        },
      };

      const scored = await scoreModQueueItem(rawItem, context as unknown as Devvit.Context);
      if (scored) {
        await cacheScore(context as unknown as Devvit.Context, subName, scored);
        allItems.push(scored);
      }
    }

    const commentQueue = await context.reddit.getModQueue({
      subredditName: subName,
      type: 'comment',
      limit: 50,
    });

    for await (const comment of commentQueue) {
      const authorData = {
        name: comment.authorName ?? '[deleted]',
        total_karma: 0,
        created_utc: Math.floor(Date.now() / 1000) - 86400 * 30,
      };

      try {
        if (comment.authorName) {
          const user = await context.reddit.getUser(comment.authorName);
          if (user) {
            authorData.total_karma = user.totalKarma ?? 0;
            authorData.created_utc = user.createdUtc ?? authorData.created_utc;
          }
        }
      } catch {
        // continue
      }

      const rawItem = {
        kind: 't1',
        data: {
          name: comment.id,
          title: '',
          body: comment.body ?? '',
          score: comment.score ?? 0,
          upvote_ratio: 0,
          num_reports: comment.numReports ?? 0,
          created_utc: comment.createdAt ?? Math.floor(Date.now() / 1000),
          author: authorData,
          domain: undefined,
          url: undefined,
          link_flair_text: undefined,
        },
      };

      const scored = await scoreModQueueItem(rawItem, context as unknown as Devvit.Context);
      if (scored) {
        await cacheScore(context as unknown as Devvit.Context, subName, scored);
        allItems.push(scored);
      }
    }

    allItems.sort((a, b) => b.priority.total - a.priority.total);
    return allItems;
  } catch (e) {
    console.error('Error fetching modqueue:', e);
    return [];
  }
}

export const ModFlowQueue: Devvit.CustomPostType = {
  name: 'ModFlow Queue',
  description: 'Priority-ranked modqueue dashboard',
  height: 'tall',
  render: (context: Devvit.CustomPostContext) => {
    const [items] = context.useState<QueueItem[]>(async () => {
      return await fetchModQueue(context);
    });

    const [settings] = context.useState<ModFlowSettings | null>(async () => {
      try {
        return await getSettings(context as unknown as Devvit.Context);
      } catch {
        return null;
      }
    });

    const [filter, setFilter] = context.useState<FilterMode>('all');
    const [actionMsg, setActionMsg] = context.useState<string | null>(null);
    const [bulkProcessing, setBulkProcessing] = context.useState(false);

    const isLoading = items.length === 0 && settings === undefined;

    const filteredItems = items.filter((item) => {
      switch (filter) {
        case 'urgent': return item.priorityColor === 'red';
        case 'medium': return item.priorityColor === 'yellow';
        case 'low': return item.priorityColor === 'green';
        case 'posts': return item.kind === 'post';
        case 'comments': return item.kind === 'comment';
        default: return true;
      }
    });

    const urgentCount = items.filter((i) => i.priorityColor === 'red').length;
    const mediumCount = items.filter((i) => i.priorityColor === 'yellow').length;
    const lowCount = items.filter((i) => i.priorityColor === 'green').length;

    const handleApprove = async (fullname: string, title: string) => {
      try {
        await context.reddit.approve(fullname);
        await logAction(context as unknown as Devvit.Context, fullname, 'approve', 'mod', title);
        setActionMsg(`Approved: "${title.slice(0, 40)}..."`);
      } catch {
        setActionMsg('Failed to approve item');
      }
    };

    const handleRemove = async (fullname: string, title: string, spam: boolean) => {
      try {
        await context.reddit.remove(fullname, { spam });
        await logAction(context as unknown as Devvit.Context, fullname, spam ? 'spam' : 'remove', 'mod', title);
        setActionMsg(`Removed: "${title.slice(0, 40)}..."`);
      } catch {
        setActionMsg('Failed to remove item');
      }
    };

    const handleBulkRemoveUrgent = async () => {
      setBulkProcessing(true);
      const urgent = items.filter((i) => i.priorityColor === 'red');
      let count = 0;
      for (const item of urgent) {
        try {
          await context.reddit.remove(item.fullname, { spam: false });
          await logAction(context as unknown as Devvit.Context, item.fullname, 'remove', 'mod', item.title);
          count++;
        } catch {
          // continue with remaining
        }
      }
      setActionMsg(`Bulk removed ${count} urgent item(s)`);
      setBulkProcessing(false);
    };

    const handleBulkApproveLow = async () => {
      setBulkProcessing(true);
      const low = items.filter((i) => i.priorityColor === 'green');
      let count = 0;
      for (const item of low) {
        try {
          await context.reddit.approve(item.fullname);
          await logAction(context as unknown as Devvit.Context, item.fullname, 'approve', 'mod', item.title);
          count++;
        } catch {
          // continue
        }
      }
      setActionMsg(`Bulk approved ${count} low-risk item(s)`);
      setBulkProcessing(false);
    };

    const formatAge = (createdUtc: number): string => {
      const days = Math.floor((Date.now() / 1000 - createdUtc) / 86400);
      if (days < 1) return '<1d';
      if (days < 30) return `${days}d`;
      if (days < 365) return `${Math.floor(days / 30)}mo`;
      return `${Math.floor(days / 365)}y`;
    };

    const formatAccountAge = (createdUtc: number): string => {
      const days = Math.floor((Date.now() / 1000 - createdUtc) / 86400);
      if (days < 1) return '<1 day';
      if (days === 1) return '1 day';
      if (days < 30) return `${days} days`;
      if (days < 365) return `${Math.floor(days / 30)} months`;
      return `${Math.floor(days / 365)} years`;
    };

    const getStatusIcon = (color: string): string => {
      switch (color) {
        case 'red': return '🔴';
        case 'yellow': return '🟡';
        case 'green': return '🟢';
        default: return '⚪';
      }
    };

    const getTypeLabel = (kind: string): string => {
      return kind === 'post' ? '📝 Post' : '💬 Comment';
    };

    const makeFilterButton = (label: string, mode: FilterMode) => {
      const isActive = filter === mode;
      return (
        <button
          onPress={() => setFilter(mode)}
          appearance={isActive ? 'primary' : 'secondary'}
          size="small"
        >
          {label}
        </button>
      );
    };

    if (isLoading) {
      return (
        <vstack height="100%" width="100%" alignment="center middle" padding="medium">
          <text size="xlarge" weight="bold">Loading ModFlow...</text>
          <spacer size="small" />
          <text color="secondary">Fetching and scoring modqueue items</text>
        </vstack>
      );
    }

    return (
      <vstack height="100%" width="100%" padding="small">
        {/* HEADER */}
        <vstack padding="small" border="thick" cornerRadius="medium">
          <hstack alignment="middle">
            <text size="xlarge" weight="bold">🔥 ModFlow Priority Queue</text>
            <spacer grow />
            <text size="small" color="secondary">{items.length} items</text>
          </hstack>
          <spacer size="xsmall" />
          <hstack gap="small">
            <text size="small" color="red" weight="bold">🔴 {urgentCount} Urgent</text>
            <text size="small" color="yellow" weight="bold">🟡 {mediumCount} Medium</text>
            <text size="small" color="green" weight="bold">🟢 {lowCount} Low</text>
          </hstack>
        </vstack>

        <spacer size="small" />

        {/* FILTERS */}
        <hstack gap="small" wrap={true} padding="small">
          {makeFilterButton('All', 'all')}
          {makeFilterButton('🔴 Urgent', 'urgent')}
          {makeFilterButton('🟡 Medium', 'medium')}
          {makeFilterButton('🟢 Low', 'low')}
          {makeFilterButton('📝 Posts', 'posts')}
          {makeFilterButton('💬 Comments', 'comments')}
        </hstack>

        <spacer size="xsmall" />

        {/* ACTION MESSAGE */}
        {actionMsg && (
          <vstack padding="small" backgroundColor="#1a3a1a" cornerRadius="small">
            <text color="green">{actionMsg}</text>
          </vstack>
        )}

        <spacer size="small" />

        {/* ITEM LIST */}
        <vstack grow gap="small">
          {filteredItems.length === 0 ? (
            <vstack alignment="center middle" padding="large">
              <text size="large" color="secondary">No items match this filter</text>
              <text size="small" color="tertiary">Try a different filter or check back later</text>
            </vstack>
          ) : (
            filteredItems.map((item) => (
              <vstack
                key={item.fullname}
                padding="small"
                border="thin"
                cornerRadius="small"
                backgroundColor={
                  item.priorityColor === 'red'
                    ? '#2a1010'
                    : item.priorityColor === 'yellow'
                    ? '#2a2510'
                    : '#102a10'
                }
              >
                <hstack alignment="middle">
                  <text size="large">{getStatusIcon(item.priorityColor)}</text>
                  <spacer size="xsmall" />
                  <text
                    size="large"
                    weight="bold"
                    color={
                      item.priorityColor === 'red'
                        ? 'red'
                        : item.priorityColor === 'yellow'
                        ? 'yellow'
                        : 'green'
                    }
                  >
                    {item.priority.total.toFixed(1)}
                  </text>
                  <spacer size="small" />
                  <text size="small" color="secondary">{getPriorityLabel(item.priority.total)}</text>
                  <spacer grow />
                  <text size="small" color="tertiary">{getTypeLabel(item.kind)}</text>
                </hstack>

                <spacer size="xsmall" />

                <text size="medium" weight="bold" wrap={true}>
                  {item.kind === 'post'
                    ? item.title
                    : item.body.slice(0, 120) + (item.body.length > 120 ? '...' : '')}
                </text>

                <spacer size="xsmall" />

                <hstack gap="medium" wrap={true}>
                  <text size="small" color="secondary">by u/{item.author}</text>
                  <text size="small" color="secondary">📊 {item.score} pts</text>
                  <text size="small" color={item.reports > 0 ? 'red' : 'secondary'}>
                    🚩 {item.reports} report{item.reports !== 1 ? 's' : ''}
                  </text>
                  <text size="small" color="secondary">⏰ {formatAge(item.createdUtc)} old</text>
                  <text
                    size="small"
                    color={item.authorCreatedUtc > Date.now() / 1000 - 86400 * 7 ? 'red' : 'secondary'}
                  >
                    👤 {formatAccountAge(item.authorCreatedUtc)}
                  </text>
                </hstack>

                <spacer size="xsmall" />

                <hstack gap="small">
                  <text size="xsmall" color="tertiary">{item.priority.breakdown}</text>
                </hstack>

                <spacer size="xsmall" />

                <hstack gap="small">
                  <button
                    size="small"
                    appearance="success"
                    onPress={() => handleApprove(item.fullname, item.title)}
                  >
                    ✓ Approve
                  </button>
                  <button
                    size="small"
                    appearance="destructive"
                    onPress={() => handleRemove(item.fullname, item.title, false)}
                  >
                    ✕ Remove
                  </button>
                  <button
                    size="small"
                    appearance="destructive"
                    onPress={() => handleRemove(item.fullname, item.title, true)}
                  >
                    🚫 Spam
                  </button>
                </hstack>
              </vstack>
            ))
          )}
        </vstack>

        <spacer size="medium" />

        {/* BULK ACTIONS */}
        {settings?.enableBulkActions && filteredItems.length > 0 && (
          <vstack padding="small" border="thick" cornerRadius="medium" gap="small">
            <text size="medium" weight="bold">Bulk Actions</text>
            <hstack gap="small" wrap={true}>
              <button
                appearance="destructive"
                disabled={bulkProcessing || urgentCount === 0}
                onPress={handleBulkRemoveUrgent}
              >
                {bulkProcessing ? 'Processing...' : `Remove All 🔴 Flagged (${urgentCount})`}
              </button>
              <button
                appearance="success"
                disabled={bulkProcessing || lowCount === 0}
                onPress={handleBulkApproveLow}
              >
                {bulkProcessing ? 'Processing...' : `Approve All 🟢 Low Risk (${lowCount})`}
              </button>
            </hstack>
          </vstack>
        )}

        <spacer size="small" />

        {/* FOOTER */}
        <vstack padding="xsmall">
          <text size="xsmall" color="tertiary">
            ModFlow v0.1.0 — Scores calculated from velocity, reports, karma, age, and AutoMod patterns
          </text>
        </vstack>
      </vstack>
    );
  },
};
