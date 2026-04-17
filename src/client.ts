import { EventEmitter } from 'node:events';
import { DiscordGateway } from './gateway.js';
import { DiscordRestClient } from './rest.js';
import {
  ClientOptions,
  GatewayJoinRequestCreatePayload,
  GetRequestsOptions,
  JoinRequest,
  JoinRequestsResponse,
  MemberVerification,
} from './types.js';

export interface JoinRequestsClientEvents {
  joinRequest: [payload: GatewayJoinRequestCreatePayload];
  joinRequestUpdate: [payload: GatewayJoinRequestCreatePayload];
  joinRequestDelete: [payload: GatewayJoinRequestCreatePayload];
  dispatch: [event: string, data: unknown];
  ready: [];
  disconnect: [code: number, reason: string];
  error: [error: Error];
}

export declare interface JoinRequestsClient {
  on<K extends keyof JoinRequestsClientEvents>(
    event: K,
    listener: (...args: JoinRequestsClientEvents[K]) => void,
  ): this;
  once<K extends keyof JoinRequestsClientEvents>(
    event: K,
    listener: (...args: JoinRequestsClientEvents[K]) => void,
  ): this;
  off<K extends keyof JoinRequestsClientEvents>(
    event: K,
    listener: (...args: JoinRequestsClientEvents[K]) => void,
  ): this;
  emit<K extends keyof JoinRequestsClientEvents>(
    event: K,
    ...args: JoinRequestsClientEvents[K]
  ): boolean;
}

/**
 * Main client for managing Discord server join requests.
 *
 * @example
 * ```ts
 * const client = new JoinRequestsClient({ token: process.env.TOKEN! });
 *
 * client.on('ready', () => console.log('Connected to Discord gateway'));
 * client.on('joinRequest', async ({ guild_id, request }) => {
 *   await client.approve(guild_id, request.user_id);
 * });
 *
 * client.connect();
 * ```
 */
export class JoinRequestsClient extends EventEmitter {
  private readonly gateway: DiscordGateway;
  readonly rest: DiscordRestClient;

  constructor(options: ClientOptions) {
    super();

    this.rest = new DiscordRestClient(options.token);
    this.gateway = new DiscordGateway(options.token);

    this.gateway.on('GUILD_JOIN_REQUEST_CREATE', (payload) => {
      this.emit('joinRequest', payload);
    });

    this.gateway.on('GUILD_JOIN_REQUEST_UPDATE', (payload) => {
      this.emit('joinRequestUpdate', payload);
    });

    this.gateway.on('GUILD_JOIN_REQUEST_DELETE', (payload) => {
      this.emit('joinRequestDelete', payload);
    });

    this.gateway.on('dispatch', (event, data) => {
      this.emit('dispatch', event, data);
    });

    this.gateway.on('ready', () => {
      this.emit('ready');
    });

    this.gateway.on('disconnect', (code, reason) => {
      this.emit('disconnect', code, reason);
    });

    this.gateway.on('error', (err) => {
      this.emit('error', err);
    });
  }

  connect(): void {
    this.gateway.connect();
  }

  destroy(): void {
    this.gateway.destroy();
  }

  /**
   * Subscribe to a guild to receive guild-specific events (e.g. GUILD_JOIN_REQUEST_CREATE).
   * Must be called after the 'ready' event.
   */
  subscribeGuild(guildId: string, channelId?: string): void {
    this.gateway.subscribeGuild(guildId, channelId);
  }

  getMemberVerification(guildId: string): Promise<MemberVerification> {
    return this.rest.getMemberVerification(guildId);
  }

  getJoinRequests(
    guildId: string,
    options?: GetRequestsOptions,
  ): Promise<JoinRequestsResponse> {
    return this.rest.getJoinRequests(guildId, options);
  }

  approve(guildId: string, userId: string): Promise<JoinRequest> {
    return this.rest.approve(guildId, userId);
  }

  reject(
    guildId: string,
    userId: string,
    reason?: string,
  ): Promise<JoinRequest> {
    return this.rest.reject(guildId, userId, reason);
  }
}
