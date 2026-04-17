import {
  ApproveRejectOptions,
  DiscordMessage,
  DiscordUser,
  GetRequestsOptions,
  JoinRequest,
  JoinRequestsResponse,
  MemberVerification,
  SendMessageOptions,
} from './types.js';

const BASE_URL = 'https://discord.com/api/v9';

export interface RestRequestOptions {
  /** Automatically wait and retry on 429 (default: true) */
  retryRateLimit?: boolean;
  /** Maximum 429 retries before giving up (default: 3) */
  maxRateLimitRetries?: number;
}

export class DiscordRestClient {
  private readonly headers: Record<string, string>;

  constructor(token: string) {
    // X-Super-Properties: base64-encoded client info required by some Discord endpoints
    const superProperties = Buffer.from(
      JSON.stringify({
        os: 'Windows',
        browser: 'Chrome',
        device: '',
        system_locale: 'en-US',
        browser_user_agent:
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
        browser_version: '131.0.0.0',
        os_version: '10',
        referrer: '',
        referring_domain: '',
        referrer_current: '',
        referring_domain_current: '',
        release_channel: 'stable',
        client_build_number: 349522,
        client_event_source: null,
      }),
    ).toString('base64');

    this.headers = {
      Authorization: token,
      'Content-Type': 'application/json',
      'X-Super-Properties': superProperties,
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    };
  }

  /**
   * Public low-level request method. Use it for custom endpoints not
   * covered by the typed helpers on this class.
   */
  async request<T>(
    method: string,
    path: string,
    body?: unknown,
    query?: Record<string, string>,
    options: RestRequestOptions = {},
  ): Promise<T> {
    const { retryRateLimit = true, maxRateLimitRetries = 3 } = options;

    let url = `${BASE_URL}${path}`;
    if (query && Object.keys(query).length > 0) {
      url += `?${new URLSearchParams(query).toString()}`;
    }

    let attempts = 0;
    while (true) {
      const response = await fetch(url, {
        method,
        headers: this.headers,
        body: body !== undefined ? JSON.stringify(body) : undefined,
      });

      if (response.ok) {
        if (response.status === 204) return undefined as unknown as T;
        return response.json() as Promise<T>;
      }

      const errorBody = await response.text().catch(() => '');
      let discordCode: number | undefined;
      let retryAfter = 1;
      try {
        const parsed = JSON.parse(errorBody) as {
          code?: number;
          retry_after?: number;
        };
        discordCode = parsed.code;
        if (parsed.retry_after !== undefined) retryAfter = parsed.retry_after;
      } catch {
        // ignore parse errors
      }

      if (discordCode === 10068) {
        throw new Error(
          'Unknown Guild Member Verification Form: join requests are not enabled on this server.',
        );
      }

      switch (response.status) {
        case 401:
          throw new Error('401 Unauthorized: Invalid or missing token.');
        case 403:
          throw new Error(
            '403 Forbidden: Missing KICK_MEMBERS permission in this guild.',
          );
        case 429: {
          if (retryRateLimit && attempts < maxRateLimitRetries) {
            attempts += 1;
            await new Promise((r) => setTimeout(r, retryAfter * 1000));
            continue;
          }
          throw new Error(
            `429 Too Many Requests: Rate limited. Retry after ${retryAfter}s.`,
          );
        }
        case 500:
        case 502:
        case 503:
        case 504: {
          if (attempts < maxRateLimitRetries) {
            attempts += 1;
            await new Promise((r) => setTimeout(r, 1000 * attempts));
            continue;
          }
          throw new Error(`HTTP ${response.status}: ${errorBody}`);
        }
        default:
          throw new Error(`HTTP ${response.status}: ${errorBody}`);
      }
    }
  }

  // -------- Join-request endpoints --------

  async getMemberVerification(guildId: string): Promise<MemberVerification> {
    return this.request<MemberVerification>(
      'GET',
      `/guilds/${guildId}/member-verification`,
    );
  }

  async getJoinRequests(
    guildId: string,
    options: GetRequestsOptions = {},
  ): Promise<JoinRequestsResponse> {
    const query: Record<string, string> = {};
    if (options.status !== undefined) query['status'] = options.status;
    if (options.limit !== undefined) query['limit'] = String(options.limit);
    if (options.before !== undefined) query['before'] = options.before;
    if (options.after !== undefined) query['after'] = options.after;

    return this.request<JoinRequestsResponse>(
      'GET',
      `/guilds/${guildId}/requests`,
      undefined,
      query,
    );
  }

  async approveOrReject(
    guildId: string,
    userId: string,
    options: ApproveRejectOptions,
  ): Promise<JoinRequest> {
    if (
      options.rejection_reason !== undefined &&
      options.rejection_reason.length > 160
    ) {
      throw new Error('rejection_reason must be 160 characters or fewer.');
    }

    return this.request<JoinRequest>(
      'PATCH',
      `/guilds/${guildId}/requests/${userId}`,
      options,
    );
  }

  async approve(guildId: string, userId: string): Promise<JoinRequest> {
    return this.approveOrReject(guildId, userId, {
      action: 'APPROVED',
    });
  }

  async reject(
    guildId: string,
    userId: string,
    reason?: string,
  ): Promise<JoinRequest> {
    return this.approveOrReject(guildId, userId, {
      action: 'REJECTED',
      ...(reason !== undefined ? { rejection_reason: reason } : {}),
    });
  }

  // -------- General helpers --------

  async getUser(userId: string): Promise<DiscordUser> {
    return this.request<DiscordUser>('GET', `/users/${userId}`);
  }

  async sendMessage(
    channelId: string,
    options: SendMessageOptions | string,
  ): Promise<DiscordMessage> {
    const body = typeof options === 'string' ? { content: options } : options;
    return this.request<DiscordMessage>(
      'POST',
      `/channels/${channelId}/messages`,
      body,
    );
  }
}
