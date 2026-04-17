# discord-join-requests

Unofficial Node.js library for automating Discord server join requests (Apply to Join) via self-bot.

> [!Warning]  
> This library uses Discord's private API and a user token (self-bot). Use at your own risk — account suspension may occur.

[日本語版はこちら](README-ja.md)

## Installation

```bash
npm install discord-join-requests
```

## Quick Start

```ts
import { JoinRequestsClient } from 'discord-join-requests';

const client = new JoinRequestsClient({ token: 'YOUR_USER_TOKEN' });

client.on('ready', () => {
  console.log('Connected to Discord Gateway');
});

client.on('joinRequest', async ({ guild_id, request }) => {
  console.log(`New request from user ${request.user_id}`);
  console.log('Answers:', request.form_responses);

  // Approve
  await client.approve(guild_id, request.user_id);

  // Or reject with an optional reason (max 160 chars)
  // await client.reject(guild_id, request.user_id, 'Does not meet requirements.');
});

client.on('error', (err) => console.error(err));

client.connect();
```

CommonJS:
```js
const { JoinRequestsClient } = require('discord-join-requests');
```

## API

### `new JoinRequestsClient(options)`

| Option | Type | Description |
|---|---|---|
| `token` | `string` | Discord user token (not a bot token) |

---

### Events

#### `client.on('ready', () => void)`
Fired when the WebSocket connection to the Gateway is established and identified.

#### `client.on('joinRequest', (payload) => void)`
Fired when a user submits a join request (`GUILD_JOIN_REQUEST_CREATE`).

**`payload`**

| Field | Type | Description |
|---|---|---|
| `guild_id` | `string` | Guild (server) ID |
| `status` | `"SUBMITTED"` | Always `SUBMITTED` for new requests |
| `request` | `JoinRequest` | Full request object (see below) |

#### `client.on('disconnect', (code, reason) => void)`
Fired when the WebSocket disconnects.

#### `client.on('error', (error) => void)`
Fired on WebSocket or connection errors.

---

### Methods

#### `client.connect()`
Connect to the Discord Gateway and start listening for events.

#### `client.destroy()`
Disconnect from the Gateway and clean up all resources.

#### `client.approve(guildId, userId)`
Approve a user's join request.

```ts
await client.approve('GUILD_ID', 'USER_ID');
```

#### `client.reject(guildId, userId, reason?)`
Reject a user's join request. `reason` is optional and must be ≤ 160 characters.

```ts
await client.reject('GUILD_ID', 'USER_ID', 'Does not meet requirements.');
```

#### `client.getJoinRequests(guildId, options?)`
Fetch a list of join requests for a guild.

```ts
const { guild_join_requests } = await client.getJoinRequests('GUILD_ID', {
  status: 'SUBMITTED', // 'SUBMITTED' | 'APPROVED' | 'REJECTED'
  limit: 100,          // 1–100, default 100
  before: 'SNOWFLAKE', // pagination
  after: 'SNOWFLAKE',  // pagination
});
```

#### `client.getMemberVerification(guildId)`
Fetch the join-request form questions for a guild.

```ts
const form = await client.getMemberVerification('GUILD_ID');
console.log(form.form_fields);
```

---

## Types

### `JoinRequest`

| Field | Type | Description |
|---|---|---|
| `id` | `string` | Request ID |
| `user_id` | `string` | Applicant's user ID |
| `guild_id` | `string` | Guild ID |
| `created_at` | `string` | ISO 8601 timestamp |
| `status` | `JoinRequestStatus` | `SUBMITTED` / `APPROVED` / `REJECTED` |
| `rejection_reason` | `string?` | Rejection reason if rejected |
| `form_responses` | `FormResponse[]` | Applicant's answers to the form |
| `actioned_by_user` | `unknown?` | Who approved/rejected |
| `actioned_at` | `string?` | When actioned |

### `FormResponse`

| Field | Type | Description |
|---|---|---|
| `field_type` | `FormFieldType` | `TERMS` / `TEXT_INPUT` / `PARAGRAPH` / `MULTIPLE_CHOICE` |
| `label` | `string` | Question text |
| `response` | `string?` | Text answer |
| `values` | `string[]?` | Selected choices (for `MULTIPLE_CHOICE`) |
| `required` | `boolean` | Whether the field was required |

### `MemberVerification`

| Field | Type | Description |
|---|---|---|
| `version` | `string` | Form version timestamp |
| `form_fields` | `FormField[]` | Array of question definitions |
| `description` | `string?` | Server description shown on the form |

### `FormField`

| Field | Type | Description |
|---|---|---|
| `field_type` | `FormFieldType` | Question type |
| `label` | `string` | Question title |
| `choices` | `string[]?` | Available choices (for `MULTIPLE_CHOICE`) |
| `required` | `boolean` | Whether the field is required |
| `description` | `string?` | Question description |
| `placeholder` | `string?` | Placeholder text |

---

## Error Handling

```ts
try {
  await client.approve(guildId, userId);
} catch (err) {
  // err.message describes the cause:
  // "401 Unauthorized: Invalid or missing token."
  // "403 Forbidden: Missing KICK_MEMBERS permission in this guild."
  // "429 Too Many Requests: Rate limited. Retry after 1s."
  // "Unknown Guild Member Verification Form: join requests are not enabled on this server."
}
```

| Code | Meaning |
|---|---|
| `401` | Invalid or missing user token |
| `403` | Missing `KICK_MEMBERS` permission in the guild |
| `429` | Rate limited |
| `10068` | Join requests not enabled on this server |

## License

MIT
