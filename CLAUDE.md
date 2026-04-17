# Discord参加申請（Apply to Join）自動化ライブラリ実装仕様書

1. 概要と基本要件
Discordの非公開APIおよびWebSocketゲートウェイを使用して、ユーザーアカウント（セルフボット）でサーバーの参加申請を自動管理するNode.jsライブラリを構築してください。

通信方式: REST APIの呼び出しには fetch（Node.js組み込み、または node-fetch / axios）、リアルタイム検知には ws モジュールを使用します。

Base URL: https://discord.com/api/v9

認証: すべてのリクエストのヘッダーにユーザーの認証トークン（User Token）を指定します。Botトークンでは機能しません。

2. APIリクエストヘッダー仕様
REST APIへのリクエストには以下のヘッダーが必須です 。

```json
{
  "Authorization": "ユーザーのトークン",
  "Content-Type": "application/json"
}
```

3. WebSocket (Gateway) イベント仕様: 新規申請のリアルタイム検知
REST APIのポーリングを防ぐため、WebSocketに接続してリアルタイムで申請を検知する機能を実装してください。

接続先: wss://gateway.discord.gg/?v=9&encoding=json

ターゲットイベント: GUILD_JOIN_REQUEST_CREATE 

イベントの挙動: ユーザーが申請を送信し、ステータスが SUBMITTED になったタイミングで送信されます 。このイベントを受信するには、接続しているアカウントが該当サーバーで KICK_MEMBERS 権限を持っている必要があります 。

ペイロード（d オブジェクト）の構造:

```json
{
  "guild_id": "サーバーのID",
  "status": "SUBMITTED",
  "request": {
    "id": "申請のID",
    "user_id": "申請者のユーザーID",
    "created_at": "作成日時のタイムスタンプ",
    "form_responses":
  }
}
```

4. REST API エンドポイント仕様

4.1. 質問文（検証フォーム）の取得
エンドポイント: GET /guilds/{guild.id}/member-verification

概要: サーバーの参加条件や、設定されている質問一覧を取得します。

成功時のレスポンス（200 OK）:
form_fields 配列の中に質問データが含まれます 。

field_type: 質問の形式。TERMS（ルール同意）、TEXT_INPUT（短文）、PARAGRAPH（長文）、MULTIPLE_CHOICE（選択式）など 。

label: 質問のタイトル 。

choices: （選択式の場合）選択肢の配列 。

required: 必須かどうかの真偽値 。

4.2. 保留中の申請一覧と回答データの取得
エンドポイント: GET /guilds/{guild.id}/requests 

概要: 現在保留中、または過去の申請一覧を取得します。

クエリパラメータ:

status: 取得する状態。保留中の場合は SUBMITTED を指定します 。

limit: 取得件数（1〜100、デフォルト100） 。

before / after: ページネーション用のSnowflake ID 。

成功時のレスポンス（200 OK）:
guild_join_requests 配列として返却されます 。各申請オブジェクトには、ユーザーの回答内容を示す form_responses 配列が含まれます 。

4.3. 申請の承認・拒否操作
エンドポイント: PATCH /guilds/{guild.id}/requests/{user.id} 

概要: 特定のユーザーの申請を承認、または拒否します。対象ギルドの KICK_MEMBERS 権限が必要です 。

ペイロード (JSON):

```json
{
  "application_status": "APPROVED" // 承認の場合は "APPROVED"、拒否の場合は "REJECTED"
}
```

※拒否（REJECTED）を選択した場合、オプションで rejection_reason フィールド（最大160文字の文字列）を含めることで、拒否理由を送信することが可能です 。

5. エラーハンドリング
APIリクエスト時には以下のエラーを適切に処理するロジックを組み込んでください。

401 Unauthorized: 認証ヘッダーがない、またはトークンが無効 。

403 Forbidden: 対象のサーバーにおいて、アカウントに必要な権限がない 。

429 Too Many Requests: APIのレートリミット（呼び出し制限）に到達した 。

10068 (Discord固有エラーコード): Unknown Guild Member Verification Form。対象のサーバーで承認制システムが設定されていないか、エンドポイントが存在しません。

6. 実装上の指示（Claude Opusへ）
上記のREST APIエンドポイントとWebSocketペイロードを統合した、クラスベースのNode.jsラッパーを作成してください。

EventEmitter を継承し、WebSocketで GUILD_JOIN_REQUEST_CREATE を受信した際に、データを取り出しやすい形式で独自イベント（例: client.on('joinRequest', request =>...)）として発火させる仕組みを構築してください。

セルフボットとして動作するため、アカウント凍結リスクを下げる配慮（WebSocketのハートビート維持や、無駄なREST APIポーリングを避けてイベント駆動で処理を行う設計）を行ってください。
