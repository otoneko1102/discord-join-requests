# Sample App

A working example that combines `discord-join-requests` with
[`discord.js-selfbot-youtsuho-v13`](https://www.npmjs.com/package/discord.js-selfbot-youtsuho-v13)
to auto-manage Discord server join requests.

[日本語版はこちら](README-ja.md)

## Architecture

| Concern | Library used |
|---|---|
| Detecting new join requests (`GUILD_JOIN_REQUEST_CREATE`) | `discord-join-requests` |
| Approving / rejecting requests (REST) | `discord-join-requests` |
| Posting messages, fetching channels/users, detecting replies | `discord.js-selfbot-youtsuho-v13` |

Both clients use the same user token and run independently side-by-side.

## What it does

1. Listens for new join requests in a specific guild (`GUILD_ID`)
2. Saves the raw gateway payload to `app/requests/{REQUEST_ID}.json`
3. Posts a formatted notification (applicant info + Q&A) to `CHANNEL_ID`
4. When a moderator replies to the notification with `y` / `yes` → **approve**
5. When a moderator replies with `n` / `no` → **reject**

## Setup

```bash
# 1. Build the parent library first (the sample imports from file:..)
cd ..
npm install
npm run build

# 2. Install sample deps
cd app
npm install

# 3. Configure env vars and run
cp .env.example .env          # fill in TOKEN, GUILD_ID, CHANNEL_ID
npm start                     # builds + runs with .env
```

## Scripts

| Command | What it does | Env file |
|---|---|---|
| `npm run build` | Compile `index.ts` → `dist/index.mjs` (via tsdown) | — |
| `npm start` | Build + run | `.env` |
| `npm run dev` | Build + run | `.env.local` |
| `npm run typecheck` | Type-check only (no emit) | — |

`.env.local` is intended for local dev overrides and is git-ignored. Both files use the same keys as `.env.example`.

## Environment variables

| Name | Required | Description |
|---|---|---|
| `TOKEN` | ✅ | Discord **user** token (not a bot token) |
| `GUILD_ID` | ✅ | Server ID to monitor |
| `CHANNEL_ID` | ✅ | Channel ID to post notifications in |
| `MODERATOR_MEMBERS` | optional | Comma-separated **user** IDs allowed to approve/reject |
| `MODERATOR_ROLES` | optional | Comma-separated **role** IDs allowed to approve/reject |

> If both `MODERATOR_MEMBERS` and `MODERATOR_ROLES` are empty, anyone in the channel can approve/reject. Otherwise, access is granted when the reply author matches **either** list.

## File layout

```
app/
├── index.ts          # the sample
├── package.json      # sample-only deps (including discord.js-selfbot-youtsuho-v13)
├── tsconfig.json     # sample-only TS config
├── tsdown.config.ts  # build config
├── dist/             # build output (git-ignored)
├── .env.example      # env template
├── .env              # used by `npm start`   (git-ignored)
├── .env.local        # used by `npm run dev` (git-ignored)
└── requests/         # runtime data (git-ignored)
    └── {REQUEST_ID}.json
```

## Stored JSON format

Each `app/requests/{REQUEST_ID}.json` looks like:

```json
{
  "raw": {
    "guild_id": "...",
    "status": "SUBMITTED",
    "request": {
      "id": "...",
      "user_id": "...",
      "form_responses": [ ... ]
    }
  },
  "applicant": {
    "id": "...",
    "username": "...",
    "global_name": "..."
  },
  "notificationMessageId": "...",
  "outcome": "APPROVED",
  "outcomeAt": "2026-04-17T12:34:56.000Z",
  "outcomeBy": "MODERATOR_USER_ID"
}
```

## Notes

- Selfbots violate Discord's Terms of Service — use at your own risk.
- State is persisted across restarts by scanning the JSON files at startup.
- If the notification message is deleted, the y/n reply flow stops working for that request. Fall back to calling `client.approve()` / `client.reject()` manually.
- The sample opens two gateway connections (one per library). Discord allows multiple simultaneous sessions per user.
