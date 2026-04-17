import { EventEmitter } from 'node:events';
import WebSocket from 'ws';
import { GatewayJoinRequestCreatePayload } from './types.js';

const GATEWAY_URL = 'wss://gateway.discord.gg/?v=9&encoding=json';

const GatewayOpCode = {
  DISPATCH: 0,
  HEARTBEAT: 1,
  IDENTIFY: 2,
  RECONNECT: 7,
  INVALID_SESSION: 9,
  HELLO: 10,
  HEARTBEAT_ACK: 11,
  LAZY_REQUEST: 14,
} as const;

interface GatewayPayload {
  op: number;
  d: unknown;
  s?: number | null;
  t?: string | null;
}

export interface GatewayEvents {
  GUILD_JOIN_REQUEST_CREATE: [payload: GatewayJoinRequestCreatePayload];
  GUILD_JOIN_REQUEST_UPDATE: [payload: GatewayJoinRequestCreatePayload];
  GUILD_JOIN_REQUEST_DELETE: [payload: GatewayJoinRequestCreatePayload];
  dispatch: [event: string, data: unknown];
  ready: [];
  disconnect: [code: number, reason: string];
  error: [error: Error];
}

export declare interface DiscordGateway {
  on<K extends keyof GatewayEvents>(
    event: K,
    listener: (...args: GatewayEvents[K]) => void,
  ): this;
  once<K extends keyof GatewayEvents>(
    event: K,
    listener: (...args: GatewayEvents[K]) => void,
  ): this;
  off<K extends keyof GatewayEvents>(
    event: K,
    listener: (...args: GatewayEvents[K]) => void,
  ): this;
  emit<K extends keyof GatewayEvents>(
    event: K,
    ...args: GatewayEvents[K]
  ): boolean;
}

export class DiscordGateway extends EventEmitter {
  private ws: WebSocket | null = null;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private heartbeatInitialTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private heartbeatAcked = true;
  private sequence: number | null = null;
  private sessionId: string | null = null;
  private readonly token: string;
  private destroyed = false;

  constructor(token: string) {
    super();
    this.token = token;
  }

  connect(): void {
    if (this.ws) return;
    this.destroyed = false;
    this._createSocket();
  }

  destroy(): void {
    this.destroyed = true;
    this._cleanup();
  }

  /**
   * Subscribe to a guild via opcode 14 (Lazy Request).
   * Must be called after READY to receive guild-specific events
   * such as GUILD_JOIN_REQUEST_CREATE.
   */
  subscribeGuild(guildId: string, channelId?: string): void {
    const channels: Record<string, number[][]> = {};
    if (channelId) {
      channels[channelId] = [[0, 99]];
    }
    this._send({
      op: GatewayOpCode.LAZY_REQUEST,
      d: {
        guild_id: guildId,
        typing: true,
        activities: true,
        threads: true,
        ...(channelId ? { channels } : {}),
      },
    });
  }

  private _createSocket(): void {
    const ws = new WebSocket(GATEWAY_URL);
    this.ws = ws;

    ws.on('open', () => {
      this.heartbeatAcked = true;
    });

    ws.on('message', (data: WebSocket.RawData) => {
      let payload: GatewayPayload;
      try {
        payload = JSON.parse(data.toString()) as GatewayPayload;
      } catch {
        return;
      }
      this._handlePayload(payload);
    });

    ws.on('close', (code: number, reason: Buffer) => {
      this._cleanup();
      if (!this.destroyed) {
        this.emit('disconnect', code, reason.toString());
        // Auto-reconnect after a short delay
        this.reconnectTimer = setTimeout(() => {
          if (!this.destroyed) this._createSocket();
        }, 2000);
      }
    });

    ws.on('error', (err: Error) => {
      this.emit('error', err);
    });
  }

  private _handlePayload(payload: GatewayPayload): void {
    if (payload.s !== null && payload.s !== undefined) {
      this.sequence = payload.s;
    }

    switch (payload.op) {
      case GatewayOpCode.HELLO: {
        const d = payload.d as { heartbeat_interval: number };
        this._startHeartbeat(d.heartbeat_interval);
        this._identify();
        break;
      }

      case GatewayOpCode.HEARTBEAT_ACK:
        this.heartbeatAcked = true;
        break;

      case GatewayOpCode.HEARTBEAT:
        this._sendHeartbeat();
        break;

      case GatewayOpCode.RECONNECT:
        this._reconnect();
        break;

      case GatewayOpCode.INVALID_SESSION:
        this.sessionId = null;
        this.sequence = null;
        this.reconnectTimer = setTimeout(
          () => {
            if (!this.destroyed) this._identify();
          },
          1000 + Math.random() * 4000,
        );
        break;

      case GatewayOpCode.DISPATCH:
        this._handleDispatch(payload.t ?? '', payload.d);
        break;
    }
  }

  private _handleDispatch(event: string, data: unknown): void {
    this.emit('dispatch', event, data);

    if (event === 'READY') {
      const d = data as { session_id: string };
      this.sessionId = d.session_id;
      this.emit('ready');
      return;
    }

    if (event === 'GUILD_JOIN_REQUEST_CREATE') {
      this.emit(
        'GUILD_JOIN_REQUEST_CREATE',
        data as GatewayJoinRequestCreatePayload,
      );
    }

    if (event === 'GUILD_JOIN_REQUEST_UPDATE') {
      this.emit(
        'GUILD_JOIN_REQUEST_UPDATE',
        data as GatewayJoinRequestCreatePayload,
      );
    }

    if (event === 'GUILD_JOIN_REQUEST_DELETE') {
      this.emit(
        'GUILD_JOIN_REQUEST_DELETE',
        data as GatewayJoinRequestCreatePayload,
      );
    }
  }

  private _identify(): void {
    // User-token IDENTIFY — no `intents` (bot-only). Mimics a real Discord client.
    this._send({
      op: GatewayOpCode.IDENTIFY,
      d: {
        token: this.token,
        capabilities: 30717,
        properties: {
          os: 'Windows',
          browser: 'Chrome',
          device: '',
          system_locale: 'en-US',
          browser_user_agent:
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
          browser_version: '131.0.0.0',
          os_version: '10',
        },
        presence: {
          status: 'online',
          since: 0,
          activities: [],
          afk: false,
        },
        compress: false,
        client_state: {
          guild_versions: {},
          highest_last_message_id: '0',
          read_state_version: 0,
          user_guild_settings_version: -1,
          user_settings_version: -1,
          private_channels_version: '0',
          api_code_version: 0,
        },
      },
    });
  }

  private _startHeartbeat(interval: number): void {
    this._clearHeartbeatTimers();

    const jitter = Math.floor(Math.random() * interval);
    this.heartbeatInitialTimer = setTimeout(() => {
      this.heartbeatInitialTimer = null;
      if (this.destroyed || !this.ws || this.ws.readyState !== WebSocket.OPEN)
        return;
      this._sendHeartbeat();
      this.heartbeatTimer = setInterval(() => {
        if (!this.heartbeatAcked) {
          // Zombie connection — reconnect
          this._reconnect();
          return;
        }
        this._sendHeartbeat();
      }, interval);
    }, jitter);
  }

  private _sendHeartbeat(): void {
    this.heartbeatAcked = false;
    this._send({ op: GatewayOpCode.HEARTBEAT, d: this.sequence });
  }

  private _send(data: unknown): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(data));
    }
  }

  private _reconnect(): void {
    this._cleanup();
    if (!this.destroyed) this._createSocket();
  }

  private _clearHeartbeatTimers(): void {
    if (this.heartbeatInitialTimer) {
      clearTimeout(this.heartbeatInitialTimer);
      this.heartbeatInitialTimer = null;
    }
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  private _cleanup(): void {
    this._clearHeartbeatTimers();
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws) {
      this.ws.removeAllListeners();
      if (
        this.ws.readyState === WebSocket.OPEN ||
        this.ws.readyState === WebSocket.CONNECTING
      ) {
        this.ws.close();
      }
      this.ws = null;
    }
  }
}
