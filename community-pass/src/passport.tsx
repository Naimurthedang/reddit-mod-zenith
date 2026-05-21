import { Devvit } from "@devvit/public-api";
import { UserScore } from "./scoring.js";
import {
  getLevelBadgeEmoji,
  getLevelColor,
  getLevelRequirements,
  getPrivileges,
} from "./levels.js";

export interface PassportData {
  userId: string;
  username: string;
  score: UserScore;
  levelName: string;
  badge: string;
  levelColor: string;
  requirements: ReturnType<typeof getLevelRequirements>;
  privileges: ReturnType<typeof getPrivileges>;
  pointsToNext: number | null;
}

export async function getPassportData(
  userId: string,
  username: string,
  score: UserScore,
  context: Devvit.Context,
): Promise<PassportData> {
  const levelName =
    score.trustLevel === 1
      ? "New"
      : score.trustLevel === 2
        ? "Known"
        : score.trustLevel === 3
          ? "Trusted"
          : score.trustLevel === 4
            ? "Veteran"
            : "Elder";
  const badge = getLevelBadgeEmoji(score.trustLevel);
  const levelColor = getLevelColor(score.trustLevel);
  const reqs = getLevelRequirements(score.trustLevel);
  const privileges = getPrivileges(score.trustLevel);

  let pointsToNext: number | null = null;
  if (score.trustLevel < 5) {
    const nextLevelReqs = getLevelRequirements(score.trustLevel + 1);
    pointsToNext = Math.max(0, nextLevelReqs.minPoints - score.points);
  }

  return {
    userId,
    username,
    score,
    levelName,
    badge,
    levelColor,
    requirements: reqs,
    privileges,
    pointsToNext,
  };
}

function PrivilegeRow(props: { granted: boolean; label: string }) {
  return (
    <hstack gap="small" padding="xsmall">
      <text color={props.granted ? "#4caf50" : "#666666"}>
        {props.granted ? "✓" : "—"}
      </text>
      <text color={props.granted ? "#cccccc" : "#666666"} size="small">
        {props.label}
      </text>
    </hstack>
  );
}

function StatRow(props: { label: string; value: string }) {
  return (
    <hstack gap="small" padding="xsmall">
      <text size="small" color="#888888">
        {props.label}:
      </text>
      <text size="small" weight="bold">
        {props.value}
      </text>
    </hstack>
  );
}

function ProgressBar(props: { current: number; max: number; color: string }) {
  const ratio = props.max > 0 ? Math.min(props.current / props.max, 1) : 0;
  const pct = Math.round(ratio * 100);

  return (
    <vstack gap="xsmall">
      <hstack>
        <text size="small" color="#888888">
          {props.current} / {props.max} pts
        </text>
      </hstack>
      <hstack height="8px" width="100%" backgroundColor="#333333">
        <hstack height="100%" width={`${pct}%`} backgroundColor={props.color} />
      </hstack>
    </vstack>
  );
}

export function PassportCard(props: { data: PassportData }) {
  const { data } = props;
  const { score } = data;

  const nextLevelThreshold =
    data.trustLevel < 5
      ? getLevelRequirements(data.trustLevel + 1).minPoints
      : score.points;

  return (
    <vstack
      padding="medium"
      backgroundColor="#1a1a2e"
      cornerRadius="large"
      borderColor={data.levelColor}
      borderWidth="thick"
    >
      <vstack padding="medium" gap="medium">
        <hstack alignment="middle" gap="small">
          <text size="xlarge">{data.badge}</text>
          <vstack>
            <text size="large" weight="bold" color="#ffffff">
              {data.username}
            </text>
            <text size="small" color={data.levelColor} weight="bold">
              Level {score.trustLevel} — {data.levelName}
            </text>
          </vstack>
        </hstack>

        <vstack
          padding="medium"
          backgroundColor="#16213e"
          cornerRadius="medium"
          gap="small"
        >
          <text size="small" weight="bold" color="#ffffff">
            STATISTICS
          </text>
          <StatRow label="Points" value={String(score.points)} />
          <StatRow label="Approved Posts" value={String(score.totalApproved)} />
          <StatRow label="Removed Posts" value={String(score.totalRemoved)} />
          <StatRow label="Bans" value={String(score.totalBans)} />
          <StatRow label="Account Age" value={`${score.accountAgeDays} days`} />
          <StatRow label="Vouched" value={score.vouched ? "Yes" : "No"} />
        </vstack>

        {data.pointsToNext !== null && score.trustLevel < 5 && (
          <vstack
            padding="medium"
            backgroundColor="#16213e"
            cornerRadius="medium"
            gap="small"
          >
            <text size="small" weight="bold" color="#ffffff">
              PROGRESS TO LEVEL {score.trustLevel + 1}
            </text>
            <ProgressBar
              current={score.points}
              max={nextLevelThreshold}
              color={data.levelColor}
            />
            {data.pointsToNext > 0 && (
              <text size="small" color="#ffc107">
                {data.pointsToNext} more points needed
              </text>
            )}
          </vstack>
        )}

        <vstack
          padding="medium"
          backgroundColor="#16213e"
          cornerRadius="medium"
          gap="xsmall"
        >
          <text size="small" weight="bold" color="#ffffff">
            PRIVILEGES
          </text>
          <PrivilegeRow
            granted={data.privileges.autoApprovePosts}
            label="Auto-approved posts"
          />
          <PrivilegeRow
            granted={data.privileges.autoApproveComments}
            label="Auto-approved comments"
          />
          <PrivilegeRow
            granted={data.privileges.immuneToAutomod}
            label="Immune to Automod holds"
          />
          <PrivilegeRow
            granted={data.privileges.restrictedMegathreads}
            label="Restricted megathread access"
          />
          <PrivilegeRow
            granted={data.privileges.canApproveLevel1}
            label="Can approve Level 1 posts"
          />
        </vstack>

        {score.permanentBan && (
          <vstack
            padding="small"
            backgroundColor="#d32f2f"
            cornerRadius="small"
          >
            <text weight="bold" color="#ffffff" alignment="center">
              PERMANENTLY BANNED
            </text>
          </vstack>
        )}
      </vstack>
    </vstack>
  );
}
