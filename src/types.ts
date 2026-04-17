export type ApplicationStatus = 'APPROVED' | 'REJECTED';
export type JoinRequestStatus = 'SUBMITTED' | 'APPROVED' | 'REJECTED';
export type FormFieldType =
  | 'TERMS'
  | 'TEXT_INPUT'
  | 'PARAGRAPH'
  | 'MULTIPLE_CHOICE';

export interface FormField {
  field_type: FormFieldType;
  label: string;
  choices?: string[];
  required: boolean;
  description?: string;
  automations?: unknown;
  placeholder?: string;
  response?: string;
  values?: string[];
}

export interface MemberVerification {
  version: string;
  form_fields: FormField[];
  description?: string;
}

export interface FormResponse {
  field_type: FormFieldType;
  label: string;
  /** For MULTIPLE_CHOICE this is a numeric index into `choices`. For text types it is a string. */
  response?: string | number;
  values?: string[];
  required: boolean;
  choices?: string[];
  automations?: unknown;
  description?: string;
}

export interface JoinRequest {
  id: string;
  user_id: string;
  guild_id: string;
  created_at: string;
  status: JoinRequestStatus;
  application_status?: JoinRequestStatus;
  rejection_reason?: string;
  last_seen?: string;
  form_responses: FormResponse[];
  interview_channel_id?: string;
  actioned_by_user?: unknown;
  actioned_at?: string;
  join_request_id?: string;
  user?: DiscordUser;
}

export interface JoinRequestsResponse {
  guild_join_requests: JoinRequest[];
  total_count?: number;
}

export interface GetRequestsOptions {
  status?: JoinRequestStatus;
  limit?: number;
  before?: string;
  after?: string;
}

export interface ApproveRejectOptions {
  action: ApplicationStatus;
  rejection_reason?: string;
}

export interface GatewayJoinRequestCreatePayload {
  guild_id: string;
  status: JoinRequestStatus;
  request: JoinRequest;
}

export interface ClientOptions {
  token: string;
}

export interface ClientEvents {
  joinRequest: [payload: GatewayJoinRequestCreatePayload];
  dispatch: [event: string, data: unknown];
  ready: [];
  disconnect: [code: number, reason: string];
  error: [error: Error];
}

export interface DiscordUser {
  id: string;
  username: string;
  global_name?: string | null;
  discriminator?: string;
  avatar?: string | null;
  bot?: boolean;
  system?: boolean;
  public_flags?: number;
}

export interface MessageReference {
  message_id?: string;
  channel_id?: string;
  guild_id?: string;
  fail_if_not_exists?: boolean;
}

export interface GuildMember {
  user?: DiscordUser;
  nick?: string | null;
  roles: string[];
  joined_at: string;
  premium_since?: string | null;
  pending?: boolean;
  permissions?: string;
}

export interface DiscordMessage {
  id: string;
  channel_id: string;
  guild_id?: string;
  type: number;
  content: string;
  author: DiscordUser;
  member?: GuildMember;
  timestamp: string;
  referenced_message?: DiscordMessage | null;
  message_reference?: MessageReference;
}

export interface SendMessageOptions {
  content?: string;
  message_reference?: MessageReference;
  allowed_mentions?: {
    parse?: ('users' | 'roles' | 'everyone')[];
    replied_user?: boolean;
  };
  embeds?: unknown[];
  tts?: boolean;
}
