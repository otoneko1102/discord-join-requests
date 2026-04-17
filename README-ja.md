# discord-join-requests

Discordサーバーの参加申請（Apply to Join）をセルフボットで自動管理するための非公式Node.jsライブラリです。

> [!Warning]  
> このライブラリはDiscordの非公開APIとユーザートークン（セルフボット）を使用します。アカウント凍結のリスクがあるため、自己責任でご利用ください。

[English README](README.md)

## インストール

```bash
npm install discord-join-requests
```

## クイックスタート

```ts
import { JoinRequestsClient } from 'discord-join-requests';

const client = new JoinRequestsClient({ token: 'YOUR_USER_TOKEN' });

client.on('ready', () => {
  console.log('Discord Gatewayに接続しました');
});

client.on('joinRequest', async ({ guild_id, request }) => {
  console.log(`新しい申請: ユーザー ${request.user_id}`);
  console.log('回答:', request.form_responses);

  // 承認
  await client.approve(guild_id, request.user_id);

  // または拒否（理由は省略可・最大160文字）
  // await client.reject(guild_id, request.user_id, '条件を満たしていません。');
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

| オプション | 型 | 説明 |
|---|---|---|
| `token` | `string` | Discordのユーザートークン（Botトークンは不可） |

---

### イベント

#### `client.on('ready', () => void)`
WebSocket（Gateway）への接続・識別が完了したときに発火します。

#### `client.on('joinRequest', (payload) => void)`
ユーザーが参加申請を送信したとき（`GUILD_JOIN_REQUEST_CREATE`）に発火します。

**`payload` の構造**

| フィールド | 型 | 説明 |
|---|---|---|
| `guild_id` | `string` | サーバーID |
| `status` | `"SUBMITTED"` | 新規申請は常に `SUBMITTED` |
| `request` | `JoinRequest` | 申請の詳細（下記参照） |

#### `client.on('disconnect', (code, reason) => void)`
WebSocket接続が切断されたときに発火します。

#### `client.on('error', (error) => void)`
WebSocketまたは接続エラーが発生したときに発火します。

---

### メソッド

#### `client.connect()`
Discord Gatewayに接続し、イベントの受信を開始します。

#### `client.destroy()`
Gatewayから切断し、すべてのリソースを解放します。

#### `client.approve(guildId, userId)`
ユーザーの参加申請を承認します。

```ts
await client.approve('GUILD_ID', 'USER_ID');
```

#### `client.reject(guildId, userId, reason?)`
ユーザーの参加申請を拒否します。`reason`（拒否理由）は省略可で最大160文字。

```ts
await client.reject('GUILD_ID', 'USER_ID', '条件を満たしていません。');
```

#### `client.getJoinRequests(guildId, options?)`
サーバーの参加申請一覧を取得します。

```ts
const { guild_join_requests } = await client.getJoinRequests('GUILD_ID', {
  status: 'SUBMITTED', // 'SUBMITTED' | 'APPROVED' | 'REJECTED'
  limit: 100,          // 1〜100、デフォルト100
  before: 'SNOWFLAKE', // ページネーション
  after: 'SNOWFLAKE',  // ページネーション
});
```

#### `client.getMemberVerification(guildId)`
サーバーの参加申請フォームの質問一覧を取得します。

```ts
const form = await client.getMemberVerification('GUILD_ID');
console.log(form.form_fields);
```

---

## 型定義

### `JoinRequest`

| フィールド | 型 | 説明 |
|---|---|---|
| `id` | `string` | 申請ID |
| `user_id` | `string` | 申請者のユーザーID |
| `guild_id` | `string` | サーバーID |
| `created_at` | `string` | 申請日時（ISO 8601） |
| `status` | `JoinRequestStatus` | `SUBMITTED` / `APPROVED` / `REJECTED` |
| `rejection_reason` | `string?` | 拒否理由（拒否時のみ） |
| `form_responses` | `FormResponse[]` | 申請者のフォーム回答 |
| `actioned_by_user` | `unknown?` | 承認・拒否した管理者 |
| `actioned_at` | `string?` | 承認・拒否した日時 |

### `FormResponse`（フォームの回答）

| フィールド | 型 | 説明 |
|---|---|---|
| `field_type` | `FormFieldType` | `TERMS` / `TEXT_INPUT` / `PARAGRAPH` / `MULTIPLE_CHOICE` |
| `label` | `string` | 質問のタイトル |
| `response` | `string?` | テキスト回答 |
| `values` | `string[]?` | 選択した選択肢（`MULTIPLE_CHOICE` のみ） |
| `required` | `boolean` | 必須項目かどうか |

### `MemberVerification`（フォーム定義）

| フィールド | 型 | 説明 |
|---|---|---|
| `version` | `string` | フォームのバージョン（タイムスタンプ） |
| `form_fields` | `FormField[]` | 質問の一覧 |
| `description` | `string?` | フォームに表示されるサーバーの説明 |

### `FormField`（質問定義）

| フィールド | 型 | 説明 |
|---|---|---|
| `field_type` | `FormFieldType` | 質問の種類 |
| `label` | `string` | 質問のタイトル |
| `choices` | `string[]?` | 選択肢（`MULTIPLE_CHOICE` のみ） |
| `required` | `boolean` | 必須かどうか |
| `description` | `string?` | 質問の説明文 |
| `placeholder` | `string?` | プレースホルダーテキスト |

---

## エラーハンドリング

```ts
try {
  await client.approve(guildId, userId);
} catch (err) {
  // err.message にエラーの原因が入ります:
  // "401 Unauthorized: Invalid or missing token."
  // "403 Forbidden: Missing KICK_MEMBERS permission in this guild."
  // "429 Too Many Requests: Rate limited. Retry after 1s."
  // "Unknown Guild Member Verification Form: join requests are not enabled on this server."
}
```

| コード | 意味 |
|---|---|
| `401` | トークンが無効または未設定 |
| `403` | そのサーバーで `KICK_MEMBERS` 権限がない |
| `429` | レートリミット（APIの呼び出し制限） |
| `10068` | そのサーバーで参加申請機能が有効になっていない |

## ライセンス

MIT
