export interface AntiBanSettings {
  enabled: boolean;
  min_delay_seconds: number;
  max_delay_seconds: number;
  typing_simulation: boolean;
  max_messages_per_minute: number;
  daily_quota_per_number: number;
  read_receipt_simulation: boolean;
}

export interface SubscriptionPlan {
  id: string; // 'free' | 'starter' | 'business' | 'pro' or custom
  name: string;
  price: number;
  period: string;
  max_sessions: number;
  daily_msg_limit: number;
  monthly_msg_limit?: number;
  daily_ai_limit?: number; // Batas berapa pesan yg bisa direspon AI per hari
  monthly_ai_limit?: number; // Batas berapa pesan yg bisa direspon AI per bulan
  features: string[];
  popular?: boolean;
  is_active?: boolean;
  updated_at?: string;
}

export interface QrisConfig {
  image_url: string;
  account_name: string;
  bank_name: string;
  account_number: string;
  instructions: string;
  updated_at?: string;
}

export interface UserAccount {
  id: string;
  username: string;
  name: string;
  role: 'admin' | 'user';
  email: string;
  phone?: string;
  password?: string;
  is_active: boolean;
  email_verified: boolean;
  wa_verified: boolean;
  verification_otp?: string;
  otp_expires_at?: string;
  otp_failed_attempts?: number;
  plan_id: string;
  plan_status: 'pending_approval' | 'active' | 'rejected' | 'none';
  payment_note?: string;
  payment_receipt_url?: string;
  receipt_url?: string;
  receipt_base64?: string;
  ai_verified?: boolean;
  ai_verification_notes?: string;
  ai_verified_at?: string;
  requested_plan_id?: string;
  max_sessions: number;
  security_pin?: string;
  pin_failed_attempts: number;
  is_bot_locked: boolean;
  allowed_numbers?: string[];
  ai_enabled?: boolean;
  meta_ai_verified?: boolean;
  meta_ai_verified_phone?: string;
  meta_ai_verified_phones?: string[];
  meta_ai_verified_at?: string;
  api_key?: string;
  daily_messages_sent: number;
  monthly_messages_sent: number;
  daily_ai_sent?: number;
  monthly_ai_sent?: number;
  total_messages_count?: number;
  custom_gemini_key?: string; // Legacy masked indicator (no longer used at runtime; replaced by Meta AI via Baileys)
  custom_gemini_key_set?: boolean;
  has_security_pin?: boolean;
  custom_offline_message?: string; // User's custom offline fallback message
  custom_system_prompt?: string; // User's custom Meta AI system prompt
  default_cs_reply_enabled?: boolean; // Default CS auto reply toggle (default: false)
  default_cs_reply_text?: string; // Custom text for default CS auto reply
  auto_reply_enabled?: boolean; // Master toggle respon pesan otomatis (default: false)
  auto_reply_activated_at?: string; // Timestamp pertama kali user mengaktifkan respon otomatis pada paket gratis
  auto_reply_status?: AutoReplyStatusInfo; // Computed server status untuk UI & countdown
  rules_initialized?: boolean; // Whether initial sample rule has been initialized
  last_login_device?: string; // Device token of last login for 2FA detection
  last_quota_reset_date?: string;
  session_version?: number;
  assigned_app_id?: string;
  created_at: string;
  approved_at?: string;
}

export interface GlobalSlotStatus {
  max_global_sessions: number;
  total_occupied: number;
  paid_occupied: number;
  free_occupied: number;
  available_slots: number;
  all_slots_full: boolean;
  paid_slots_full: boolean;
  free_registrations_open: boolean;
  paid_registrations_open: boolean;
}

export interface AutoReplyStatusInfo {
  enabled: boolean;
  allowed: boolean;
  is_free_plan: boolean;
  expired: boolean;
  free_hours_limit: number;
  activated_at: string | null;
  expires_at: string | null;
  remaining_seconds: number | null;
  reason?: string;
}

export interface SmtpAccount {
  id: string;
  name: string;
  host: string;
  port: number;
  secure: boolean;
  user: string;
  pass: string;
  pass_masked?: string;
  pass_configured?: boolean;
  needs_password_reset?: boolean;
  sender_name: string;
  is_active: boolean;
  success_count: number;
  error_count: number;
  last_used_at?: string;
  last_error?: string;
  created_at: string;
}

export interface GeminiApiKey {
  id: string;
  name: string;
  key: string;
  is_active: boolean;
  usage_count: number;
  error_count: number;
  last_used_at?: string;
  last_error?: string;
  created_at: string;
}

export interface AiBotConfig {
  enabled: boolean;
  system_prompt: string;
  model: string;
  fallback_when_no_rule: boolean;
  temperature?: number;
  offline_fallback_message?: string;
}

export interface AppWhitelabelConfig {
  app_name: string;
  tagline: string;
  logo_url?: string;
  company_name: string;
  support_phone: string;
  primary_bot_phone: string; // Nomor WhatsApp Gateway Utama Aplikasi
  primary_bot_name: string;
  footer_text: string;
  api_enabled: boolean;
  updated_at?: string;
}

export interface AppNodeConfig {
  app_id: string;
  name?: string;
  max_connections: number;
  is_active: boolean;
  updated_at?: string;
}

export interface AppNodeRuntimeStatus extends AppNodeConfig {
  active_connections: number;
  connecting_connections?: number;
  hostname?: string;
  domain?: string;
  server_ip?: string;
  last_heartbeat_at?: string;
  online: boolean;
}

export interface ActiveSocketRecord {
  instance_id: string;
  app_id: string; // Explicit 'undefined' when process.env.APP_ID is unset
  server_ip: string;
  primary_ip: string;
  all_ips: string[];
  domain?: string;
  hostname?: string;
  pid?: number;
  status: 'active' | 'shutting_down' | 'killed' | 'offline';
  active_connections: number;
  connecting_connections: number;
  active_session_ids: string[];
  active_phones: string[];
  started_at: string;
  last_heartbeat_at: string;
  kill_reason?: string;
  killed_at?: string;
  online?: boolean;
  is_self?: boolean;
}

export interface KillTargetIpRule {
  ip: string;
  reason?: string;
  requested_at: string;
  requested_by?: string;
}

export interface TelegramConfigItem {
  id: string;
  name: string;
  bot_token: string;
  bot_token_masked?: string;
  bot_token_configured?: boolean;
  chat_id: string;
  is_active: boolean;
  created_at: string;
  updated_at?: string;
}

export interface SystemConfig {
  app_url: string;
  mysql_host?: string;
  mysql_port?: number;
  mysql_user?: string;
  mysql_password?: string;
  mysql_database?: string;
  free_auto_reply_hours?: number;
  max_global_sessions?: number;
  app_nodes?: AppNodeConfig[];
  kill_target_ips?: KillTargetIpRule[];
  admin_notify_phone?: string;
  telegram_bot_token?: string;
  telegram_chat_id?: string;
  telegram_enabled?: boolean;
  telegram_configs?: TelegramConfigItem[];
  ai_config: AiBotConfig;
  qris_config?: QrisConfig;
  whitelabel_config?: AppWhitelabelConfig;
}

export interface WhatsAppSessionConflictDetail {
  source_type: 'same_server' | 'remote_instance' | 'external_or_unknown';
  source_label: string;
  competing_session_id?: string;
  competing_session_name?: string;
  competing_phone?: string;
  competing_domain?: string;
  competing_ip?: string;
  competing_hostname?: string;
  competing_instance_id?: string;
  competing_last_active_at?: string;
  local_session_id?: string;
  local_session_name?: string;
  local_domain?: string;
  local_ip?: string;
  raw_reason?: string;
  detected_at: string;
  cooldown_until?: string;
  detail_note: string;
}

export interface WhatsAppSession {
  id: string;
  user_id?: string;
  session_name: string;
  phone_number: string;
  auth_method: 'qr_code' | 'pairing_code';
  status: 'connected' | 'connecting' | 'disconnected';
  runtime_status?: 'connected' | 'connecting' | 'disconnected';
  has_registered_creds?: boolean;
  is_primary: boolean;
  qr_code_data?: string;
  pairing_code?: string;
  connected_at?: string;
  last_activity_at?: string;
  total_messages_count?: number;
  expires_at?: string; // Masa berlaku sesi (untuk timer hitung mundur kedaluwarsa)
  ai_enabled?: boolean | null; // null/undefined = ikuti pengaturan akun; true/false = override khusus nomor ini
  custom_system_prompt?: string; // Kosong = ikuti prompt akun; isi = karakter AI khusus nomor ini
  disconnect_code?: number;
  disconnect_reason?: string;
  conflict_paused?: boolean;
  conflict_detail?: WhatsAppSessionConflictDetail;
  assigned_app_id?: string;
  assigned_server_ip?: string;
  connected_app_id?: string;
  connected_server_name?: string;
  connected_server_ip?: string;
  connected_server_domain?: string;
  connected_hostname?: string;
  last_send_verified_at?: string;
  multi_location_active?: boolean;
  failed_app_ids?: string[];
  assignment_status?: 'idle' | 'pending' | 'building' | 'connected' | 'delegated' | 'released' | 'error';
  assignment_error?: string;
  last_assignment_at?: string;
  created_at: string;
  updated_at: string;
}

export interface WhatsAppMessageLog {
  id: string;
  wam_id?: string;
  user_id?: string;
  session_id?: string;
  sender_phone: string;
  sender_name: string;
  message_body: string;
  direction: 'incoming' | 'outgoing';
  status: 'Sukses' | 'Gagal' | 'Diterima' | 'Terkirim';
  reply_body?: string;
  error_detail?: string;
  created_at: string;
  ai_generated?: boolean;
  matched_rule_id?: string;
}

export interface AutoReplyRule {
  id: string;
  user_id?: string;
  keyword: string;
  match_type: 'contains' | 'exact' | 'startsWith';
  response_text: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface BotStats {
  total_incoming: number;
  total_auto_replied: number;
  total_failed: number;
  total_ai_replied?: number;
  gateway_status: 'Active' | 'Inactive';
  db_status: 'offline' | 'online';
  last_message_at?: string;
  active_session_phone?: string;
  active_session_name?: string;
  primary_bot_phone?: string;
  total_connected_sessions?: number;
  daily_messages_sent?: number;
  daily_msg_limit?: number;
  monthly_messages_sent?: number;
  monthly_msg_limit?: number;
  daily_ai_sent?: number;
  daily_ai_limit?: number;
  monthly_ai_sent?: number;
  monthly_ai_limit?: number;
  free_auto_reply_hours?: number;
  max_global_sessions?: number;
  slot_status?: GlobalSlotStatus;
}

export interface EnvConfigMasked {
  db_status: 'offline' | 'online';
  db_host: string;
  db_name: string;
  app_url: string;
  active_phone_number?: string;
  primary_bot_phone?: string;
  smtp_accounts_count?: number;
  gemini_keys_count?: number;
  ai_reply_enabled?: boolean;
  meta_ai_connected?: boolean;
  meta_ai_sessions?: number;
  app_name?: string;
  system_phone?: string;
  free_auto_reply_hours?: number;
  max_global_sessions?: number;
}

export interface SimulatePayload {
  sender_phone: string;
  sender_name: string;
  message_body: string;
}

export interface MysqlConnectionStatus {
  connected: boolean;
  host?: string;
  port?: number;
  database?: string;
  version?: string;
  message?: string;
  error_code?: string;
  error_detail?: string;
  hint?: string;
  ssl_enabled?: boolean;
  checked_at?: string;
}

export interface CatalogProduct {
  id: string;
  user_id: string;
  title: string;
  description: string;
  price: number;
  image_url?: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface CatalogPaymentAccount {
  id: string;
  bank_name: string;
  account_number: string;
  account_holder: string;
}

export interface CatalogSettings {
  user_id: string;
  enabled: boolean;
  shop_name?: string;
  order_notify_phone?: string;
  bank_accounts?: CatalogPaymentAccount[];
  payment_notes?: string;
  qris_image_url?: string;
  updated_at: string;
}

export interface SuperadminWaQueueItem {
  id: string;
  recipient_phone: string;
  message: string;
  category: 'order_notification' | 'password_reset' | 'system_otp' | 'session_expired' | 'cluster_alert';
  owner_user_id?: string;
  invoice_number?: string;
  attempts: number;
  last_error?: string;
  created_at: string;
}

export interface PendingSessionExpiryAlert {
  id: string;
  key: string;
  user_id: string;
  session_id: string;
  session_name?: string;
  expired_phone?: string;
  first_detected_at: string;
  notify_after: string;
  reason?: string;
  updated_at: string;
}

export interface PendingMissedMessageItem {
  id: string;
  wam_id: string;
  extra_wam_ids?: string[];
  session_id: string;
  user_id: string;
  sender_phone: string;
  sender_name: string;
  remote_jid: string;
  fallback_pn_jid?: string;
  message_body: string;
  has_media?: boolean;
  message_ts_ms: number;
  attempts: number;
  last_error?: string;
  next_retry_at: number;
  created_at: string;
}

export interface RemoteBotChallenge {
  user_phone: string;
  user_id: string;
  pending_action: {
    type: 'edit_account' | 'send_message' | 'toggle_ai' | 'broadcast' | 'custom';
    payload: any;
  };
  correct_pin: string;
  pin_options: string[]; // 10 choices
  expires_at: number;
}
