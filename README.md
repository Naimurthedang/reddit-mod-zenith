# Reddit Devvit Mod Tools — $45K Hackathon Suite

5 production-ready Devvit apps for the [Reddit $45K Mod Tools Hackathon](https://developers.reddit.com/) (deadline: May 28, 2026).

---

## Apps

### 1. 🤖 ModGuard AI — Smart Content Triage + AI Detection

**Category:** New Mod Tool · **Prize:** $10K Best New Tool

Scores every post/comment with an AI suspicion score (0–100) using behavioral signals — account age, posting velocity, comment-to-post ratio, phrase patterns, text entropy. Mods get a live dashboard with flagged content, top suspicious accounts, and one-click moderation.

```
modguard-ai/
├── package.json
├── tsconfig.json
└── src/
    ├── main.ts       # Entry point, triggers, menu items
    ├── scorer.ts     # 5-signal scoring engine
    ├── config.ts     # Settings (threshold, toggles, whitelist)
    ├── panel.ts      # Mod panel widget dashboard
    └── cleanup.ts    # Daily Redis data cleanup
```

### 2. ⚡ ModFlow — Intelligent Modqueue Prioritization

**Category:** New Mod Tool · **Prize:** $10K Best New Tool

Replaces the flat modqueue with a priority-ranked dashboard. Items scored 1–10 by viral velocity, reports, account trust. Color-coded urgency, bulk actions, and hot-post alerts via modmail.

```
modflow/
├── package.json
├── tsconfig.json
└── src/
    ├── main.ts       # Entry point, triggers, scheduler
    ├── scorer.ts     # Priority scoring engine
    ├── queue-view.ts # Custom dashboard UI
    └── config.ts     # Settings (weights, thresholds)
```

### 3. 📋 TaskerBot → Devvit Port — Mobile-First Mod Commands

**Category:** Ported Data API App · **Prize:** $10K Best Ported App

Port of the community-favorite Taskerbot. Mods type `!rule 1`, `!spam`, `!ban`, `!approve` in reports/comments to auto-remove with correct reasons, flair, and user messages. Native Devvit = no downtime, mobile-ready.

```
taskerbot-port/
├── package.json
├── tsconfig.json
└── src/
    ├── main.ts       # Entry point, triggers, settings
    ├── commands.ts   # !rule, !spam, !ban, !approve handlers
    ├── reasons.ts    # Removal reason CRUD + application
    ├── config.ts     # Command toggles, message templates
    └── log.ts        # Mod action log
```

### 4. 🎖 CommunityPass — Graduated Trust & Reputation System

**Category:** New Mod Tool

Trust levels 1–5 with auto-promotion: New → Known → Trusted → Veteran → Elder. Points earned for approved content, deducted for removals/bans. Custom Passport Card post shows user stats. Level 1 posts auto-held for review.

```
community-pass/
├── package.json
├── tsconfig.json
└── src/
    ├── main.tsx      # Entry point, triggers, mod actions
    ├── scoring.ts    # Point system + trust calculation
    ├── levels.ts     # Trust level promotion logic
    ├── passport.tsx  # Passport Card custom post UI
    └── config.ts     # Threshold settings
```

### 5. ⏰ RemindMeBot → Devvit Port — Reddit's Most-Used Bot

**Category:** Ported Data API App · **Prize:** $10K Best Ported App

Port of the iconic u/RemindMeBot. Users comment `!RemindMe 3 days` and get a PM when the time comes. Supports relative/absolute/named time parsing. Native Devvit = stable, no external server.

```
remindmebot-port/
├── package.json
├── tsconfig.json
└── src/
    ├── main.ts       # Entry point, cron job, mod panel
    ├── parser.ts     # Time parsing (relative/absolute/named)
    ├── scheduler.ts  # Redis storage + delivery engine
    └── config.ts     # Limits and controls
```

---

## How to Deploy

Each app is standalone. To deploy any of them:

```bash
# 1. Navigate to the app directory
cd modguard-ai

# 2. Install dependencies
npm install

# 3. Login to Devvit (first time only)
npx devvit login

# 4. Upload to your subreddit
npx devvit upload

# 5. Install in your subreddit
npx devvit install
```

### Prerequisites

- Node.js 18+
- A Reddit account with developer access
- Devvit CLI (`npx devvit`)

---

## Hackathon Strategy

Per the strategy guide (`reddit-hackathon-strategy.html`), the winning approach is:

1. **Submit ModGuard AI** for the $10K **Best New Tool** category
2. **Submit TaskerBot → Devvit** for the $10K **Best Ported App** category
3. Record a 2-minute demo video showing each tool in action
4. Post in r/ModSupport and r/Devvit for mod testimonials
5. Handle errors gracefully — judges test for polish

---

## File Stats

| App | Files | Lines |
|-----|-------|-------|
| ModGuard AI | 5 | 1,009 |
| ModFlow | 4 | 1,280 |
| TaskerBot Port | 5 | 767 |
| CommunityPass | 5 | 1,282 |
| RemindMeBot Port | 4 | 819 |
| **Total** | **23** | **5,157** |
