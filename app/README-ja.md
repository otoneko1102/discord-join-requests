# サンプルアプリ

`discord-join-requests` と
[`discord.js-selfbot-youtsuho-v13`](https://www.npmjs.com/package/discord.js-selfbot-youtsuho-v13)
を組み合わせた、実際に動作する参加申請自動管理サンプルです。

[English](README.md)

## アーキテクチャ

| 役割 | 使用ライブラリ |
|---|---|
| 参加申請の検知（`GUILD_JOIN_REQUEST_CREATE`） | `discord-join-requests` |
| 承認・拒否（REST） | `discord-join-requests` |
| メッセージ投稿・チャンネル/ユーザー取得・リプライ検知 | `discord.js-selfbot-youtsuho-v13` |

両クライアントとも同じユーザートークンを使い、独立並行で動作します。

## やること

1. 指定したサーバー（`GUILD_ID`）の新規参加申請をリアルタイム検知
2. 生データを `app/requests/{申請ID}.json` に保存
3. 指定チャンネル（`CHANNEL_ID`）に申請者情報・質問・回答を整形して通知
4. 管理者がその通知に `y` / `yes` でリプライ → **承認**
5. 管理者がその通知に `n` / `no` でリプライ → **拒否**

## セットアップ

```bash
# 1. 親ライブラリをビルド（サンプルは file:.. で親を参照）
cd ..
npm install
npm run build

# 2. サンプルの依存をインストール
cd app
npm install

# 3. 環境変数を設定して起動
cp .env.example .env          # TOKEN, GUILD_ID, CHANNEL_ID を設定
npm start                     # ビルド + .env で起動
```

## スクリプト

| コマンド | 内容 | 使う env ファイル |
|---|---|---|
| `npm run build` | `index.ts` → `dist/index.mjs` をビルド（tsdown） | — |
| `npm start` | ビルド + 起動 | `.env` |
| `npm run dev` | ビルド + 起動 | `.env.local` |
| `npm run typecheck` | 型チェックのみ（出力なし） | — |

`.env.local` はローカル開発用の上書き設定で、gitignore対象です。キーは `.env.example` と同じです。

## 環境変数

| 名前 | 必須 | 説明 |
|---|---|---|
| `TOKEN` | ✅ | Discordの**ユーザートークン**（Botトークンは不可） |
| `GUILD_ID` | ✅ | 監視するサーバーのID |
| `CHANNEL_ID` | ✅ | 通知を投稿するチャンネルのID |
| `MODERATOR_MEMBERS` | 任意 | 承認/拒否を実行できる**ユーザー**IDのカンマ区切り |
| `MODERATOR_ROLES` | 任意 | 承認/拒否を実行できる**ロール**IDのカンマ区切り |

> 両方とも空ならチャンネルを見られる全員が操作可能。どちらかが設定されていれば、**いずれか**に該当するメンバーのみ操作可能。

## ファイル構成

```
app/
├── index.ts          # サンプル本体
├── package.json      # サンプル専用依存（discord.js-selfbot-youtsuho-v13など）
├── tsconfig.json     # サンプル専用TS設定
├── tsdown.config.ts  # ビルド設定
├── dist/             # ビルド出力（gitignore対象）
├── .env.example      # 環境変数テンプレート
├── .env              # `npm start` 用    （gitignore対象）
├── .env.local        # `npm run dev` 用  （gitignore対象）
└── requests/         # ランタイムデータ（gitignore対象）
    └── {申請ID}.json
```

## 保存されるJSONの構造

`app/requests/{申請ID}.json` の中身:

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
  "outcomeBy": "承認した管理者のユーザーID"
}
```

## 注意事項

- セルフボットはDiscordの利用規約に抵触します。自己責任でご利用ください。
- 再起動時はJSONファイルを読み込んで状態を復元します。
- 通知メッセージが削除されると、その申請は y/n リプライでは操作できなくなります（その場合は `client.approve()` / `client.reject()` を手動で呼んでください）。
- サンプルはライブラリごとに1本ずつ、合計2本のGateway接続を開きます。Discordは同一ユーザーの複数同時セッションを許容しています。
