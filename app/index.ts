import 'dotenv/config';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { Client, type TextBasedChannel } from 'discord.js-selfbot-youtsuho-v13';
import {
  FormResponse,
  GatewayJoinRequestCreatePayload,
  JoinRequest,
  JoinRequestsClient,
} from 'discord-join-requests';

// ---- Env ----
const TOKEN = process.env.TOKEN;
const GUILD_ID = process.env.GUILD_ID;
const CHANNEL_ID = process.env.CHANNEL_ID;

const splitCsv = (v: string | undefined): string[] =>
  (v ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

const MODERATOR_MEMBERS = splitCsv(process.env.MODERATOR_MEMBERS);
const MODERATOR_ROLES = splitCsv(process.env.MODERATOR_ROLES);

if (!TOKEN || !GUILD_ID || !CHANNEL_ID) {
  console.error(
    'Missing required environment variables: TOKEN, GUILD_ID, CHANNEL_ID.'
  );
  process.exit(1);
}

// ---- Storage ----
// Built file lives in app/dist/, source in app/ — both resolve requests/ at app/requests/.
const REQUESTS_DIR = path.resolve(import.meta.dirname, '..', 'requests');

interface StoredApplicant {
  id: string;
  username: string;
  global_name: string | null;
  discriminator?: string;
  avatar?: string | null;
}

interface StoredRequest {
  /** Raw GUILD_JOIN_REQUEST_CREATE payload from Discord */
  raw: GatewayJoinRequestCreatePayload;
  /** Applicant user info fetched via discord.js-selfbot */
  applicant?: StoredApplicant;
  /** Message ID of the notification posted to CHANNEL_ID */
  notificationMessageId?: string;
  /** Outcome once a moderator replies y/n */
  outcome?: 'APPROVED' | 'REJECTED';
  outcomeAt?: string;
  outcomeBy?: string;
  rejectionReason?: string;
}

async function ensureDir(): Promise<void> {
  await fs.mkdir(REQUESTS_DIR, { recursive: true });
}

async function saveRequest(id: string, data: StoredRequest): Promise<void> {
  await fs.writeFile(
    path.join(REQUESTS_DIR, `${id}.json`),
    JSON.stringify(data, null, 2),
    'utf8'
  );
}

async function loadRequest(id: string): Promise<StoredRequest | null> {
  try {
    const txt = await fs.readFile(path.join(REQUESTS_DIR, `${id}.json`), 'utf8');
    return JSON.parse(txt) as StoredRequest;
  } catch {
    return null;
  }
}

async function loadMessageMap(): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  const files = await fs.readdir(REQUESTS_DIR).catch(() => [] as string[]);
  for (const name of files) {
    if (!name.endsWith('.json')) continue;
    const id = name.slice(0, -5);
    const data = await loadRequest(id);
    if (data?.notificationMessageId && !data.outcome) {
      map.set(data.notificationMessageId, id);
    }
  }
  return map;
}

// ---- Message formatting ----
function formatAnswer(fr: FormResponse): string {
  if (fr.field_type === 'MULTIPLE_CHOICE') {
    // values array takes priority; fall back to response as index into choices
    if (fr.values && fr.values.length > 0) {
      return fr.values.join(', ');
    }
    if (typeof fr.response === 'number' && fr.choices) {
      return fr.choices[fr.response] ?? '(unknown choice)';
    }
    if (typeof fr.response === 'string' && fr.response.trim()) {
      return fr.response;
    }
    return '(no selection)';
  }
  if (fr.field_type === 'TERMS') {
    return '✔ Agreed';
  }
  const text = typeof fr.response === 'string' ? fr.response.trim() : '';
  return text || '(no answer)';
}

function formatRequestMessage(
  request: JoinRequest,
  applicant: StoredApplicant | undefined
): string {
  const lines: string[] = [];
  lines.push('**📝 新しい参加申請 / New Join Request**', '');

  const name = applicant
    ? applicant.global_name || applicant.username
    : `User ${request.user_id}`;
  lines.push(`**User:** ${name} (\`${request.user_id}\`)`);
  if (applicant?.username && applicant.username !== name) {
    lines.push(`**Username:** \`${applicant.username}\``);
  }
  lines.push(`**Request ID:** \`${request.id}\``);
  lines.push(
    `**Submitted:** <t:${Math.floor(new Date(request.created_at).getTime() / 1000)}:R>`
  );
  lines.push('');

  if (request.form_responses.length === 0) {
    lines.push('_No form responses._');
  } else {
    lines.push('**Answers:**');
    request.form_responses.forEach((fr, i) => {
      lines.push(`**Q${i + 1}.** ${fr.label}`);
      lines.push(`> ${formatAnswer(fr).split('\n').join('\n> ')}`);
    });
  }

  lines.push(
    '',
    '↩️ このメッセージに `y` で承認 / `n` で拒否 (reply `y` to approve, `n` to reject)'
  );

  return lines.join('\n');
}

// ---- Main ----
async function main(): Promise<void> {
  await ensureDir();
  const messageMap = await loadMessageMap();
  console.log(`[startup] restored ${messageMap.size} pending notification(s)`);

  // Gateway + messaging: discord.js-selfbot-youtsuho-v13
  const djs = new Client({});
  // Join-request specific: our library (separate gateway + REST for approve/reject)
  const jr = new JoinRequestsClient({ token: TOKEN! });

  djs.once('ready', () => {
    console.log(`[djs] logged in as ${djs.user?.tag ?? '(unknown)'}`);
  });

  jr.on('ready', () => {
    console.log('[jr] join-request gateway ready');
    // Subscribe to the target guild so we receive GUILD_JOIN_REQUEST_CREATE
    jr.subscribeGuild(GUILD_ID!, CHANNEL_ID!);
    console.log(`[jr] subscribed to guild ${GUILD_ID}`);
  });
  jr.on('disconnect', (c, r) => console.warn('[jr] disconnected:', c, r));
  jr.on('error', (e) => console.error('[jr] error:', e));

  // ---- Debug: log all dispatch events from our gateway ----
  jr.on('dispatch', (event, data) => {
    console.log(`[jr:dispatch] ${event}`);
    if (event.includes('JOIN_REQUEST')) {
      console.log(`[jr:dispatch:data]`, JSON.stringify(data, null, 2));
    }
  });

  // ---- Handle join request (CREATE or UPDATE with SUBMITTED status) ----
  const handleJoinRequest = async (payload: GatewayJoinRequestCreatePayload) => {
    if (payload.guild_id !== GUILD_ID) return;
    if (payload.status !== 'SUBMITTED') return;

    const { request } = payload;
    console.log(`[joinRequest] ${request.id} from user ${request.user_id}`);

    const stored: StoredRequest = { raw: payload };
    await saveRequest(request.id, stored).catch((e) =>
      console.error('[joinRequest] save failed:', e)
    );

    // Extract user info from the gateway payload (no need to fetch separately)
    if (request.user) {
      stored.applicant = {
        id: request.user.id,
        username: request.user.username,
        global_name: request.user.global_name ?? null,
        discriminator: request.user.discriminator,
        avatar: request.user.avatar,
      };
    } else {
      // Fallback: try fetching via discord.js-selfbot
      try {
        const user = await djs.users.fetch(request.user_id);
        stored.applicant = {
          id: user.id,
          username: user.username,
          global_name: user.globalName ?? null,
          discriminator: user.discriminator,
          avatar: user.avatar,
        };
      } catch (e) {
        console.warn('[joinRequest] user fetch failed:', (e as Error).message);
      }
    }

    try {
      const channel = await djs.channels.fetch(CHANNEL_ID!);
      if (!channel || !channel.isText()) {
        throw new Error(`Channel ${CHANNEL_ID} is not text-based or not accessible.`);
      }

      const notif = await (channel as TextBasedChannel).send({
        content: formatRequestMessage(request, stored.applicant),
        allowedMentions: { parse: [] },
      });

      stored.notificationMessageId = notif.id;
      messageMap.set(notif.id, request.id);
      await saveRequest(request.id, stored);
      console.log(`[joinRequest] posted notification ${notif.id}`);
    } catch (e) {
      console.error('[joinRequest] post failed:', e);
    }
  };

  jr.on('joinRequest', handleJoinRequest);
  jr.on('joinRequestUpdate', handleJoinRequest);

  // ---- Reply with y/n: approve/reject via jr ----
  djs.on('messageCreate', async (msg) => {
    if (msg.author.bot) return;
    if (msg.guildId !== GUILD_ID) return;
    if (msg.channelId !== CHANNEL_ID) return;

    const refId = msg.reference?.messageId;
    if (!refId) return;

    const requestId = messageMap.get(refId);
    if (!requestId) return;

    const stored = await loadRequest(requestId);
    if (!stored || stored.outcome) return;

    if (MODERATOR_MEMBERS.length > 0 || MODERATOR_ROLES.length > 0) {
      const memberAllowed = MODERATOR_MEMBERS.includes(msg.author.id);
      const roleAllowed = MODERATOR_ROLES.some((r) =>
        msg.member?.roles.cache.has(r) ?? false
      );
      if (!memberAllowed && !roleAllowed) {
        console.log(
          `[reply] ignoring non-moderator ${msg.author.id} (${msg.author.username})`
        );
        return;
      }
    }

    const content = msg.content.trim();
    const lower = content.toLowerCase();
    const approve = lower === 'y' || lower === 'yes' || lower === '承認';
    // reject: "n", "no", "拒否" optionally followed by a space and rejection reason
    const rejectMatch = content.match(/^(?:n|no|拒否)(?:\s+(.+))?$/is);
    const reject = rejectMatch !== null;
    if (!approve && !reject) return;

    const rejectionReason = rejectMatch?.[1]?.trim() || undefined;

    const { guild_id, user_id } = stored.raw.request;
    console.log(`[reply] ${approve ? 'approving' : 'rejecting'} request ${requestId} (guild=${guild_id}, user=${user_id})${rejectionReason ? ` reason: ${rejectionReason}` : ''}`);

    try {
      if (approve) {
        await jr.approve(guild_id, user_id);
        stored.outcome = 'APPROVED';
        console.log(`[reply] approved ${requestId}`);
      } else {
        await jr.reject(guild_id, user_id, rejectionReason);
        stored.outcome = 'REJECTED';
        stored.rejectionReason = rejectionReason;
        console.log(`[reply] rejected ${requestId}${rejectionReason ? ` (reason: ${rejectionReason})` : ''}`);
      }
      stored.outcomeAt = new Date().toISOString();
      stored.outcomeBy = msg.author.id;
      await saveRequest(requestId, stored);
      messageMap.delete(refId);

      await msg
        .reply({
          content: `${approve ? '✅ Approved' : '❌ Rejected'} — ${
            stored.applicant?.username ?? user_id
          }${rejectionReason ? `\n> 理由: ${rejectionReason}` : ''}`,
          allowedMentions: { parse: [], repliedUser: false },
        })
        .catch(() => {
          /* best-effort ack */
        });
    } catch (e) {
      console.error('[reply] action failed:', e);
      await msg
        .reply({
          content: `⚠️ Failed: ${(e as Error).message}`,
          allowedMentions: { parse: [], repliedUser: false },
        })
        .catch(() => {
          /* ignore */
        });
    }
  });

  await djs.login(TOKEN!);
  jr.connect();

  // ---- Startup diagnostic: check REST API access & pending requests ----
  try {
    const pending = await jr.getJoinRequests(GUILD_ID!, { status: 'SUBMITTED', limit: 5 });
    console.log(
      `[startup] REST check OK — ${pending.guild_join_requests.length} pending request(s) found via API`
    );
    for (const r of pending.guild_join_requests) {
      console.log(`  - request ${r.id} from user ${r.user_id} (${r.status})`);
    }
  } catch (e) {
    console.error(`[startup] REST check FAILED — ${(e as Error).message}`);
    console.error(
      '[startup] The token may lack KICK_MEMBERS permission or join requests are not enabled on this guild.'
    );
  }

  const shutdown = () => {
    console.log('\n[shutdown] closing...');
    jr.destroy();
    djs.destroy();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((err) => {
  console.error('[fatal]', err);
  process.exit(1);
});
