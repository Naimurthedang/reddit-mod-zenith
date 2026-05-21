# Reddit Devvit Mod Tools — Implementation Plan

> **Goal:** Build 5 Reddit Devvit mod tools for the $45K Mod Tools Hackathon (deadline May 28, 2026)

**Architecture:** Each tool is an independent Devvit app with its own package.json, tsconfig, and src/. All apps use `@devvit/public-api` and Devvit's Redis KV store. Each has a settings/config page, event triggers, and mod-facing UI.

**Tech Stack:** TypeScript, `@devvit/public-api`, Devvit KV Store (Redis), Devvit Scheduler, Devvit ModPanel widgets

---

## App 1: ModGuard AI — Smart Content Triage + AI Detection

- **Files:** `modguard-ai/package.json`, `modguard-ai/tsconfig.json`, `modguard-ai/src/main.ts`, `modguard-ai/src/scorer.ts`, `modguard-ai/src/config.ts`, `modguard-ai/src/panel.ts`
- AI suspicion scoring (0-100) using behavioral signals: account age, posting velocity, comment-to-post ratio, text entropy
- Mod-only flair and auto-hold for high-suspicion content
- Config page with threshold/signal/whitelist settings
- Dashboard panel widget with statistics
- Daily cleanup via scheduler

## App 2: ModFlow — Intelligent Modqueue Prioritization

- **Files:** `modflow/package.json`, `modflow/tsconfig.json`, `modflow/src/main.ts`, `modflow/src/scorer.ts`, `modflow/src/queue-view.ts`, `modflow/src/config.ts`
- Priority scoring (1-10) based on viral velocity, reports, account trust
- Custom modqueue view with color-coded items and bulk actions
- Hot post alerts via modmail
- Configurable weight sliders and thresholds

## App 3: TaskerBot Port — Mobile-First Mod Commands

- **Files:** `taskerbot-port/package.json`, `taskerbot-port/tsconfig.json`, `taskerbot-port/src/main.ts`, `taskerbot-port/src/commands.ts`, `taskerbot-port/src/reasons.ts`, `taskerbot-port/src/config.ts`
- Command detection: !rule, !spam, !ban, !approve
- Removal reason system stored in KV store
- Config UI for managing reasons
- Mod action logging

## App 4: CommunityPass — Trust & Reputation System

- **Files:** `community-pass/package.json`, `community-pass/tsconfig.json`, `community-pass/src/main.ts`, `community-pass/src/scoring.ts`, `community-pass/src/levels.ts`, `community-pass/src/passport.ts`, `community-pass/src/config.ts`
- Trust levels 1-5 with graduated privileges
- Point-based scoring system
- Custom "Passport Card" post
- Flair integration

## App 5: RemindMeBot Port — Reminder System

- **Files:** `remindmebot-port/package.json`, `remindmebot-port/tsconfig.json`, `remindmebot-port/src/main.ts`, `remindmebot-port/src/parser.ts`, `remindmebot-port/src/scheduler.ts`, `remindmebot-port/src/config.ts`
- Time parsing (relative/absolute/named)
- Redis sorted set storage
- Scheduler-based delivery via PM
- Mod controls and user commands (!RemindMe list, !RemindMe cancel)
