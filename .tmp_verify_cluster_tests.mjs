var __defProp = Object.defineProperty;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __esm = (fn, res) => function __init() {
  return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
};
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};

// src/lib/security.ts
import crypto from "crypto";
import fs from "fs";
import path from "path";
function loadOrGenerateRuntimeSecret() {
  const fromEnv = process.env.APP_ENCRYPTION_KEY?.trim() || process.env.SESSION_SECRET?.trim();
  if (fromEnv && fromEnv.length >= 16) {
    return fromEnv;
  }
  try {
    if (fs.existsSync(RUNTIME_SECRET_PATH)) {
      const stored = fs.readFileSync(RUNTIME_SECRET_PATH, "utf8").trim();
      if (stored.length >= 32) {
        return stored;
      }
    }
    const generated = crypto.randomBytes(48).toString("hex");
    fs.writeFileSync(RUNTIME_SECRET_PATH, generated, { mode: 384 });
    return generated;
  } catch {
    return crypto.randomBytes(48).toString("hex");
  }
}
function deriveKey(purpose) {
  return crypto.createHmac("sha256", ROOT_SECRET).update(purpose).digest();
}
function safeEqual(a, b) {
  if (typeof a !== "string" || typeof b !== "string") return false;
  const bufA = Buffer.from(a, "utf8");
  const bufB = Buffer.from(b, "utf8");
  if (bufA.length !== bufB.length) {
    crypto.timingSafeEqual(bufA, bufA);
    return false;
  }
  return crypto.timingSafeEqual(bufA, bufB);
}
function encryptData(text) {
  if (!text || typeof text !== "string") return "";
  if (text.startsWith("gcm:")) return text;
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", ENC_KEY_GCM, iv);
  let encrypted = cipher.update(text, "utf8", "hex");
  encrypted += cipher.final("hex");
  const tag = cipher.getAuthTag().toString("hex");
  return `gcm:${iv.toString("hex")}:${tag}:${encrypted}`;
}
function decryptData(encryptedText) {
  if (!encryptedText || typeof encryptedText !== "string") return "";
  if (encryptedText.startsWith("gcm:")) {
    const parts = encryptedText.split(":");
    if (parts.length !== 4) return "";
    try {
      const iv = Buffer.from(parts[1], "hex");
      const tag = Buffer.from(parts[2], "hex");
      const cipherHex = parts[3];
      const decipher = crypto.createDecipheriv("aes-256-gcm", ENC_KEY_GCM, iv);
      decipher.setAuthTag(tag);
      let decrypted = decipher.update(cipherHex, "hex", "utf8");
      decrypted += decipher.final("utf8");
      return decrypted;
    } catch {
      return "";
    }
  }
  if (encryptedText.includes(":")) {
    const parts = encryptedText.split(":");
    if (parts.length === 2 && /^[0-9a-f]{32}$/i.test(parts[0]) && /^[0-9a-f]+$/i.test(parts[1])) {
      try {
        const iv = Buffer.from(parts[0], "hex");
        const decipher = crypto.createDecipheriv("aes-256-cbc", LEGACY_CBC_KEY, iv);
        let dec = decipher.update(parts[1], "hex", "utf8");
        dec += decipher.final("utf8");
        return dec;
      } catch {
        return "";
      }
    }
  }
  return encryptedText;
}
function hashPassword(password) {
  if (!password) return "";
  const salt = crypto.randomBytes(16).toString("hex");
  const derived = crypto.scryptSync(password, salt, 64, { N: 16384, r: 8, p: 1 }).toString("hex");
  return `scrypt:${salt}:${derived}`;
}
function hashPin(pin) {
  if (!pin) return "";
  const salt = crypto.randomBytes(16).toString("hex");
  const derived = crypto.scryptSync(pin, salt, 32, { N: 16384, r: 8, p: 1 }).toString("hex");
  return `scrypt:${salt}:${derived}`;
}
function signToken(payload) {
  const sig = crypto.createHmac("sha256", SESSION_SIGNING_KEY).update(payload).digest("base64url");
  return `${payload}.${sig}`;
}
function verifySignedToken(token) {
  if (!token || typeof token !== "string") return null;
  const lastDot = token.lastIndexOf(".");
  if (lastDot <= 0) return null;
  const payload = token.slice(0, lastDot);
  const sig = token.slice(lastDot + 1);
  const expectedSig = crypto.createHmac("sha256", SESSION_SIGNING_KEY).update(payload).digest("base64url");
  return safeEqual(sig, expectedSig) ? payload : null;
}
function maskSensitiveString(str, showFirst = 4, showLast = 4) {
  if (!str) return "";
  if (str.length <= showFirst + showLast) {
    return "*".repeat(str.length);
  }
  const start = str.slice(0, showFirst);
  const end = str.slice(-showLast);
  return `${start}${"*".repeat(Math.min(12, str.length - showFirst - showLast))}${end}`;
}
function generateApiKey(prefix = "mgw_live_") {
  return `${prefix}${crypto.randomBytes(24).toString("hex")}`;
}
var RUNTIME_SECRET_PATH, ROOT_SECRET, ENC_KEY_GCM, SESSION_SIGNING_KEY, LEGACY_CBC_KEY;
var init_security = __esm({
  "src/lib/security.ts"() {
    RUNTIME_SECRET_PATH = path.resolve(process.cwd(), ".runtime_secret");
    ROOT_SECRET = loadOrGenerateRuntimeSecret();
    ENC_KEY_GCM = deriveKey("japriin-aes-gcm-v2");
    SESSION_SIGNING_KEY = deriveKey("japriin-session-hmac-v2");
    LEGACY_CBC_KEY = crypto.scryptSync(ROOT_SECRET, "japriin_legacy_cbc_salt", 32);
  }
});

// src/lib/mysqlService.ts
var mysqlService_exports = {};
__export(mysqlService_exports, {
  claimDeadAppFailoverInMysql: () => claimDeadAppFailoverInMysql,
  clearDeadAppFailoverClaimInMysql: () => clearDeadAppFailoverClaimInMysql,
  clearMessagesFromMysql: () => clearMessagesFromMysql,
  closeMysqlPool: () => closeMysqlPool,
  deleteAppNodeFromMysql: () => deleteAppNodeFromMysql,
  deleteBaileysAuthBackupFromMysql: () => deleteBaileysAuthBackupFromMysql,
  deleteBaileysAuthFromMysql: () => deleteBaileysAuthFromMysql,
  deleteGeminiKeyFromMysql: () => deleteGeminiKeyFromMysql,
  deleteRuleFromMysql: () => deleteRuleFromMysql,
  deleteSessionFromMysql: () => deleteSessionFromMysql,
  deleteSmtpAccountFromMysql: () => deleteSmtpAccountFromMysql,
  deleteUserFromMysql: () => deleteUserFromMysql,
  deleteWaSessionConflictFromMysql: () => deleteWaSessionConflictFromMysql,
  deleteWaSessionLeaseFromMysql: () => deleteWaSessionLeaseFromMysql,
  fetchAllActiveSocketsFromMysql: () => fetchAllActiveSocketsFromMysql,
  fetchAllAppNodesFromMysql: () => fetchAllAppNodesFromMysql,
  fetchAllBaileysAuthBackupsFromMysql: () => fetchAllBaileysAuthBackupsFromMysql,
  fetchAllWaSessionConflictsFromMysql: () => fetchAllWaSessionConflictsFromMysql,
  fetchAllWaSessionLeasesFromMysql: () => fetchAllWaSessionLeasesFromMysql,
  fetchDatabaseFromMysql: () => fetchDatabaseFromMysql,
  fetchLiveClusterSnapshotFromMysql: () => fetchLiveClusterSnapshotFromMysql,
  getCurrentAppId: () => getCurrentAppId,
  getDisplayAppId: () => getDisplayAppId,
  getEffectiveMysqlConfig: () => getEffectiveMysqlConfig,
  getMysqlPool: () => getMysqlPool,
  initMysqlSchemaIfNotExists: () => initMysqlSchemaIfNotExists,
  isAppIdEnvConfigured: () => isAppIdEnvConfigured,
  isMysqlConfigured: () => isMysqlConfigured,
  loadAllBaileysAuthSessionIdsFromMysql: () => loadAllBaileysAuthSessionIdsFromMysql,
  loadBaileysAuthFromMysql: () => loadBaileysAuthFromMysql,
  loadWaSessionLeaseFromMysql: () => loadWaSessionLeaseFromMysql,
  markActiveSocketKilledInMysql: () => markActiveSocketKilledInMysql,
  normalizeAppId: () => normalizeAppId,
  purgeOldMysqlLogs: () => purgeOldMysqlLogs,
  pushBaileysAuthBackupToMysql: () => pushBaileysAuthBackupToMysql,
  pushGeminiKeyToMysql: () => pushGeminiKeyToMysql,
  pushKvSettingToMysql: () => pushKvSettingToMysql,
  pushMessageToMysql: () => pushMessageToMysql,
  pushRuleToMysql: () => pushRuleToMysql,
  pushSessionToMysql: () => pushSessionToMysql,
  pushSmtpAccountToMysql: () => pushSmtpAccountToMysql,
  pushUserAssignedAppToMysql: () => pushUserAssignedAppToMysql,
  pushUserToMysql: () => pushUserToMysql,
  saveBaileysAuthToMysql: () => saveBaileysAuthToMysql,
  saveWaSessionConflictToMysql: () => saveWaSessionConflictToMysql,
  saveWaSessionLeaseToMysql: () => saveWaSessionLeaseToMysql,
  syncConfiguredAppNodesToMysql: () => syncConfiguredAppNodesToMysql,
  syncPushStructureAndData: () => syncPushStructureAndData,
  testMysqlConnection: () => testMysqlConnection,
  unkillSocketsByIpInMysql: () => unkillSocketsByIpInMysql,
  updateSessionAssignmentInMysql: () => updateSessionAssignmentInMysql,
  upsertActiveSocketToMysql: () => upsertActiveSocketToMysql,
  upsertAppNodeHeartbeatToMysql: () => upsertAppNodeHeartbeatToMysql
});
import mysql from "mysql2/promise";
function normalizeAppId(raw) {
  if (typeof raw !== "string") return "";
  const cleaned = raw.trim().toLowerCase().replace(/[^a-z0-9._-]/g, "").slice(0, 64);
  return cleaned === "undefined" ? "" : cleaned;
}
function getCurrentAppId() {
  const fromEnv = normalizeAppId(process.env.APP_ID);
  return fromEnv || "default";
}
function getDisplayAppId() {
  const fromEnv = normalizeAppId(process.env.APP_ID);
  return fromEnv || "undefined";
}
function isAppIdEnvConfigured() {
  return Boolean(normalizeAppId(process.env.APP_ID));
}
function getEffectiveMysqlConfig(configOverride) {
  const pickNonEmpty = (overrideVal, envVal, savedVal) => {
    if (typeof overrideVal === "string" && overrideVal.trim() !== "") {
      return overrideVal.trim();
    }
    if (typeof envVal === "string" && envVal.trim() !== "") {
      return envVal.trim();
    }
    return (savedVal || "").trim();
  };
  const hasAllEnv = Boolean(
    process.env.MYSQL_HOST?.trim() && process.env.MYSQL_USER?.trim() && process.env.MYSQL_DATABASE?.trim()
  );
  const sysConfig = hasAllEnv ? null : initDbFile().systemConfig;
  const host = pickNonEmpty(configOverride?.host, process.env.MYSQL_HOST, sysConfig?.mysql_host);
  const port = Number(configOverride?.port || process.env.MYSQL_PORT || sysConfig?.mysql_port || 3306) || 3306;
  const user = pickNonEmpty(configOverride?.user, process.env.MYSQL_USER, sysConfig?.mysql_user);
  const overridePass = typeof configOverride?.password === "string" && !configOverride.password.includes("****") ? configOverride.password : "";
  const rawPass = overridePass !== "" ? overridePass : process.env.MYSQL_PASSWORD || sysConfig?.mysql_password || "";
  const password = decryptData(rawPass);
  const database = pickNonEmpty(configOverride?.database, process.env.MYSQL_DATABASE, sysConfig?.mysql_database);
  const envSslRaw = (process.env.MYSQL_SSL || "").trim().toLowerCase();
  const envSsl = envSslRaw === "true" || envSslRaw === "1" || envSslRaw === "yes";
  const ssl = configOverride?.ssl !== void 0 ? Boolean(configOverride.ssl) : envSsl;
  return { host, port, user, password, database, ssl };
}
function formatMysqlErrorDiagnostic(err, cfg) {
  const collectedCodes = [];
  const collectedMessages = [];
  const inspectErr = (e, depth = 0) => {
    if (!e || depth > 4) return;
    if (typeof e.code === "string" && e.code.trim()) {
      collectedCodes.push(e.code.trim());
    }
    if (typeof e.sqlMessage === "string" && e.sqlMessage.trim()) {
      collectedMessages.push(e.sqlMessage.trim());
    } else if (typeof e.message === "string" && e.message.trim()) {
      collectedMessages.push(e.message.trim());
    }
    if (Array.isArray(e.errors)) {
      for (const sub of e.errors) {
        inspectErr(sub, depth + 1);
      }
    }
  };
  inspectErr(err);
  const uniqueCodes = Array.from(new Set(collectedCodes));
  const uniqueMessages = Array.from(new Set(collectedMessages));
  const primaryCode = uniqueCodes[0] || (typeof err?.errno === "number" ? `ERRNO_${err.errno}` : "MYSQL_CONNECTION_ERROR");
  const rawDetail = uniqueMessages.join(" | ") || `Gagal terhubung ke ${cfg.host}:${cfg.port}`;
  let hint = `Periksa kembali Host (${cfg.host}), Port (${cfg.port}), User (${cfg.user}), Password, dan Nama Database (${cfg.database}).`;
  if (primaryCode === "ECONNREFUSED") {
    if (cfg.host === "localhost" || cfg.host === "127.0.0.1" || cfg.host === "::1") {
      hint = `Tidak ada layanan MySQL yang berjalan di ${cfg.host}:${cfg.port} di dalam server/container ini. Jika database berada di cPanel/VPS/Cloud eksternal, isi Host dengan IP publik atau domain server database Anda (bukan localhost).`;
    } else {
      hint = `Server ${cfg.host}:${cfg.port} menolak koneksi TCP. Pastikan service MySQL/MariaDB aktif, port ${cfg.port} terbuka di firewall, dan MySQL mendengarkan koneksi remote (bind-address = 0.0.0.0).`;
    }
  } else if (primaryCode === "ETIMEDOUT" || primaryCode === "ENETUNREACH" || primaryCode === "EHOSTUNREACH") {
    hint = `Koneksi ke ${cfg.host}:${cfg.port} habis waktu (timeout) atau jaringan tidak terjangkau. Pada cPanel/VPS, pastikan port ${cfg.port} tidak diblokir firewall dan IP server aplikasi sudah ditambahkan di Remote MySQL / IP Whitelist.`;
  } else if (primaryCode === "ENOTFOUND" || primaryCode === "EAI_AGAIN") {
    hint = `Nama host "${cfg.host}" tidak ditemukan oleh DNS. Periksa penulisan domain/hostname atau gunakan alamat IP server database yang valid.`;
  } else if (primaryCode === "ER_ACCESS_DENIED_ERROR" || primaryCode === "ER_DBACCESS_DENIED_ERROR") {
    hint = `Username "${cfg.user}" atau password ditolak oleh MySQL, atau user belum diberi izin akses remote (@'%' / hostname) serta hak akses ke database "${cfg.database}".`;
  } else if (primaryCode === "ER_BAD_DB_ERROR") {
    hint = `Koneksi ke server berhasil, namun database "${cfg.database}" belum ada. Buat database tersebut terlebih dahulu di cPanel / phpMyAdmin / MySQL.`;
  } else if (primaryCode.includes("SSL") || rawDetail.toLowerCase().includes("ssl") || rawDetail.toLowerCase().includes("tls") || rawDetail.toLowerCase().includes("secure transport")) {
    hint = cfg.ssl ? `Handshake SSL/TLS gagal dengan ${cfg.host}:${cfg.port}. Periksa apakah server MySQL mendukung SSL atau set MYSQL_SSL_REJECT_UNAUTHORIZED=false jika menggunakan sertifikat self-signed.` : `Server MySQL Anda mewajibkan koneksi terenkripsi SSL/TLS. Aktifkan opsi SSL/TLS (atau set MYSQL_SSL=true di environment server).`;
  } else if (primaryCode === "ER_NOT_SUPPORTED_AUTH_MODE") {
    hint = `Metode autentikasi MySQL tidak didukung atau memerlukan SSL aktif. Coba aktifkan SSL atau ubah plugin auth user MySQL ke mysql_native_password / caching_sha2_password.`;
  }
  return {
    code: primaryCode,
    detail: rawDetail,
    hint
  };
}
function isMysqlConfigured(configOverride) {
  const cfg = getEffectiveMysqlConfig(configOverride);
  return Boolean(cfg.host && cfg.user && cfg.database);
}
function getMysqlPool(configOverride) {
  const cfg = getEffectiveMysqlConfig(configOverride);
  if (!cfg.host || !cfg.user || !cfg.database) {
    return null;
  }
  const sig = `${cfg.host}:${cfg.port}:${cfg.user}:${cfg.database}:${cfg.password.length}:${cfg.ssl ? "ssl" : "plain"}`;
  if (pool && currentPoolSignature === sig) {
    return pool;
  }
  if (pool && currentPoolSignature !== sig) {
    pool.end().catch(() => {
    });
    pool = null;
  }
  currentPoolSignature = sig;
  const poolLimit = Math.min(20, Math.max(2, Number(process.env.MYSQL_POOL_LIMIT) || 6));
  const poolOptions = {
    host: cfg.host,
    port: cfg.port,
    user: cfg.user,
    password: cfg.password,
    database: cfg.database,
    waitForConnections: true,
    connectionLimit: poolLimit,
    maxIdle: Math.min(3, poolLimit),
    idleTimeout: 6e4,
    queueLimit: 0,
    enableKeepAlive: true,
    keepAliveInitialDelay: 1e4,
    connectTimeout: 8e3
  };
  if (cfg.ssl) {
    poolOptions.ssl = {
      rejectUnauthorized: process.env.MYSQL_SSL_REJECT_UNAUTHORIZED !== "false"
    };
  }
  pool = mysql.createPool(poolOptions);
  return pool;
}
async function closeMysqlPool() {
  if (!pool) return;
  const active = pool;
  pool = null;
  currentPoolSignature = "";
  try {
    await active.end();
  } catch {
  }
}
function toMysqlDateTime(value, allowNull = true) {
  if (!value) {
    return allowNull ? null : (/* @__PURE__ */ new Date()).toISOString().slice(0, 19).replace("T", " ");
  }
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) {
    return allowNull ? null : (/* @__PURE__ */ new Date()).toISOString().slice(0, 19).replace("T", " ");
  }
  return d.toISOString().slice(0, 19).replace("T", " ");
}
function fromMysqlDateTime(value) {
  if (!value) return "";
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? "" : value.toISOString();
  }
  return String(value);
}
async function detectSchemaMeta(conn) {
  try {
    const [kvCols] = await conn.query(`SHOW COLUMNS FROM app_kv_store`);
    const kvFields = new Set(kvCols.map((c) => String(c.Field)));
    detectedSchemaMeta.kvKeyCol = kvFields.has("kv_key") ? "kv_key" : kvFields.has("setting_key") ? "setting_key" : "kv_key";
    detectedSchemaMeta.kvValCol = kvFields.has("kv_value") ? "kv_value" : kvFields.has("setting_value") ? "setting_value" : "kv_value";
  } catch {
  }
  try {
    const [smtpCols] = await conn.query(`SHOW COLUMNS FROM smtp_accounts`);
    const smtpFields = new Set(smtpCols.map((c) => String(c.Field)));
    detectedSchemaMeta.smtpUserCol = smtpFields.has("user_email") ? "user_email" : smtpFields.has("user") ? "user" : "user_email";
    detectedSchemaMeta.smtpPassCol = smtpFields.has("pass_encrypted") ? "pass_encrypted" : smtpFields.has("pass") ? "pass" : "pass_encrypted";
    detectedSchemaMeta.smtpHasLastError = smtpFields.has("last_error");
  } catch {
  }
  try {
    const [gemCols] = await conn.query(`SHOW COLUMNS FROM gemini_keys`);
    const gemFields = new Set(gemCols.map((c) => String(c.Field)));
    detectedSchemaMeta.geminiKeyCol = gemFields.has("key_encrypted") ? "key_encrypted" : gemFields.has("api_key") ? "api_key" : "key_encrypted";
  } catch {
  }
  try {
    const [waMsgTbl] = await conn.query(`SHOW TABLES LIKE 'whatsapp_messages'`);
    detectedSchemaMeta.hasWhatsappMessagesTable = Array.isArray(waMsgTbl) && waMsgTbl.length > 0;
  } catch {
    detectedSchemaMeta.hasWhatsappMessagesTable = false;
  }
  try {
    const [sessCols] = await conn.query(`SHOW COLUMNS FROM whatsapp_sessions`);
    const sessFields = new Set(sessCols.map((c) => String(c.Field)));
    detectedSchemaMeta.sessionsHasAiEnabled = sessFields.has("ai_enabled");
    detectedSchemaMeta.sessionsHasCustomPrompt = sessFields.has("custom_system_prompt");
    detectedSchemaMeta.sessionsHasConnectedAt = sessFields.has("connected_at");
    detectedSchemaMeta.sessionsHasLastActivityAt = sessFields.has("last_activity_at");
    detectedSchemaMeta.sessionsHasTotalMessagesCount = sessFields.has("total_messages_count");
    detectedSchemaMeta.sessionsHasAssignmentCols = sessFields.has("assigned_app_id") && sessFields.has("connected_app_id") && sessFields.has("failed_app_ids") && sessFields.has("assignment_status");
    detectedSchemaMeta.sessionsHasServerIpCols = sessFields.has("assigned_server_ip") && sessFields.has("connected_server_ip");
  } catch {
    detectedSchemaMeta.sessionsHasAiEnabled = false;
    detectedSchemaMeta.sessionsHasCustomPrompt = false;
    detectedSchemaMeta.sessionsHasConnectedAt = false;
    detectedSchemaMeta.sessionsHasLastActivityAt = false;
    detectedSchemaMeta.sessionsHasTotalMessagesCount = false;
    detectedSchemaMeta.sessionsHasAssignmentCols = false;
    detectedSchemaMeta.sessionsHasServerIpCols = false;
  }
  try {
    const [userCols] = await conn.query(`SHOW COLUMNS FROM app_users`);
    const userFields = new Set(userCols.map((c) => String(c.Field)));
    detectedSchemaMeta.usersHasTotalMessagesCount = userFields.has("total_messages_count");
    detectedSchemaMeta.usersHasAssignedAppId = userFields.has("assigned_app_id");
  } catch {
    detectedSchemaMeta.usersHasTotalMessagesCount = false;
    detectedSchemaMeta.usersHasAssignedAppId = false;
  }
}
async function initMysqlSchemaIfNotExists(configOverride) {
  if (!isMysqlConfigured(configOverride)) return false;
  if (isSchemaInitialized && !configOverride) return true;
  const cfg = getEffectiveMysqlConfig(configOverride);
  try {
    const p = getMysqlPool(configOverride);
    if (!p) return false;
    const conn = await p.getConnection();
    lastSchemaInitError = null;
    try {
      await conn.query(`
        CREATE TABLE IF NOT EXISTS message_logs (
          id VARCHAR(120) PRIMARY KEY,
          user_id VARCHAR(100),
          session_id VARCHAR(100),
          sender_phone VARCHAR(50),
          sender_name VARCHAR(150),
          message_body TEXT,
          reply_body TEXT,
          direction VARCHAR(30),
          status VARCHAR(30),
          ai_generated TINYINT(1) DEFAULT 0,
          matched_rule_id VARCHAR(100),
          created_at VARCHAR(50)
        ) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
      `);
      await conn.query(`ALTER TABLE message_logs ADD COLUMN user_id VARCHAR(100)`).catch(() => {
      });
      await conn.query(`ALTER TABLE message_logs ADD COLUMN session_id VARCHAR(100)`).catch(() => {
      });
      await conn.query(`
        CREATE TABLE IF NOT EXISTS whatsapp_sessions (
          id VARCHAR(120) PRIMARY KEY,
          user_id VARCHAR(100),
          session_name VARCHAR(150),
          phone_number VARCHAR(50),
          phone_number_id VARCHAR(100),
          access_token TEXT,
          auth_method VARCHAR(50),
          status VARCHAR(50),
          is_primary TINYINT(1) DEFAULT 0,
          ai_enabled TINYINT(1) NULL DEFAULT NULL,
          custom_system_prompt TEXT NULL,
          connected_at VARCHAR(50),
          last_activity_at VARCHAR(50),
          total_messages_count INT DEFAULT 0,
          assigned_app_id VARCHAR(64),
          assigned_server_ip VARCHAR(64),
          connected_app_id VARCHAR(64),
          connected_server_ip VARCHAR(64),
          failed_app_ids TEXT,
          assignment_status VARCHAR(32),
          assignment_error TEXT,
          last_assignment_at VARCHAR(50),
          expires_at VARCHAR(50),
          created_at VARCHAR(50),
          updated_at VARCHAR(50)
        ) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
      `);
      await conn.query(`ALTER TABLE whatsapp_sessions ADD COLUMN user_id VARCHAR(100)`).catch(() => {
      });
      await conn.query(`ALTER TABLE whatsapp_sessions ADD COLUMN connected_at VARCHAR(50)`).catch(() => {
      });
      await conn.query(`ALTER TABLE whatsapp_sessions ADD COLUMN last_activity_at VARCHAR(50)`).catch(() => {
      });
      await conn.query(`ALTER TABLE whatsapp_sessions ADD COLUMN total_messages_count INT DEFAULT 0`).catch(() => {
      });
      await conn.query(`ALTER TABLE whatsapp_sessions ADD COLUMN assigned_app_id VARCHAR(64)`).catch(() => {
      });
      await conn.query(`ALTER TABLE whatsapp_sessions ADD COLUMN assigned_server_ip VARCHAR(64)`).catch(() => {
      });
      await conn.query(`ALTER TABLE whatsapp_sessions ADD COLUMN connected_app_id VARCHAR(64)`).catch(() => {
      });
      await conn.query(`ALTER TABLE whatsapp_sessions ADD COLUMN connected_server_ip VARCHAR(64)`).catch(() => {
      });
      await conn.query(`ALTER TABLE whatsapp_sessions ADD COLUMN failed_app_ids TEXT`).catch(() => {
      });
      await conn.query(`ALTER TABLE whatsapp_sessions ADD COLUMN assignment_status VARCHAR(32)`).catch(() => {
      });
      await conn.query(`ALTER TABLE whatsapp_sessions ADD COLUMN assignment_error TEXT`).catch(() => {
      });
      await conn.query(`ALTER TABLE whatsapp_sessions ADD COLUMN last_assignment_at VARCHAR(50)`).catch(() => {
      });
      await conn.query(`ALTER TABLE whatsapp_sessions ADD COLUMN expires_at VARCHAR(50)`).catch(() => {
      });
      await conn.query(`ALTER TABLE whatsapp_sessions ADD COLUMN ai_enabled TINYINT(1) NULL DEFAULT NULL`).catch(() => {
      });
      await conn.query(`ALTER TABLE whatsapp_sessions ADD COLUMN custom_system_prompt TEXT NULL`).catch(() => {
      });
      await conn.query(`
        CREATE TABLE IF NOT EXISTS app_nodes (
          app_id VARCHAR(64) PRIMARY KEY,
          name VARCHAR(120),
          max_connections INT DEFAULT 10,
          is_active TINYINT(1) DEFAULT 1,
          active_connections INT DEFAULT 0,
          connecting_connections INT DEFAULT 0,
          hostname VARCHAR(150),
          domain VARCHAR(190),
          server_ip VARCHAR(100),
          last_heartbeat_at VARCHAR(50),
          updated_at VARCHAR(50)
        ) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
      `);
      await conn.query(`
        CREATE TABLE IF NOT EXISTS app_sockets (
          instance_id VARCHAR(64) PRIMARY KEY,
          app_id VARCHAR(64),
          server_ip VARCHAR(120),
          primary_ip VARCHAR(64),
          all_ips TEXT,
          domain VARCHAR(190),
          hostname VARCHAR(150),
          pid INT DEFAULT 0,
          status VARCHAR(32) DEFAULT 'active',
          active_connections INT DEFAULT 0,
          connecting_connections INT DEFAULT 0,
          active_session_ids LONGTEXT,
          active_phones LONGTEXT,
          started_at VARCHAR(50),
          last_heartbeat_at VARCHAR(50),
          kill_reason TEXT,
          killed_at VARCHAR(50),
          updated_at VARCHAR(50)
        ) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
      `);
      await conn.query(`
        CREATE TABLE IF NOT EXISTS app_users (
          id VARCHAR(120) PRIMARY KEY,
          username VARCHAR(100) UNIQUE,
          name VARCHAR(150),
          role VARCHAR(30),
          email VARCHAR(150),
          phone VARCHAR(50),
          password TEXT,
          is_active TINYINT(1) DEFAULT 0,
          email_verified TINYINT(1) DEFAULT 0,
          wa_verified TINYINT(1) DEFAULT 0,
          verification_otp VARCHAR(20),
          otp_expires_at VARCHAR(50),
          plan_id VARCHAR(50),
          plan_status VARCHAR(50),
          payment_note TEXT,
          payment_receipt_url TEXT,
          requested_plan_id VARCHAR(50),
          ai_verified TINYINT(1) DEFAULT 0,
          ai_verification_notes TEXT,
          ai_verified_at VARCHAR(50),
          security_pin TEXT,
          pin_failed_attempts INT DEFAULT 0,
          is_bot_locked TINYINT(1) DEFAULT 0,
          api_key VARCHAR(150),
          custom_gemini_key TEXT,
          auto_reply_enabled TINYINT(1) DEFAULT 0,
          auto_reply_activated_at VARCHAR(50),
          ai_enabled TINYINT(1) DEFAULT 0,
          meta_ai_verified TINYINT(1) DEFAULT 0,
          meta_ai_verified_phone VARCHAR(32),
          meta_ai_verified_phones TEXT,
          meta_ai_verified_at VARCHAR(50),
          custom_system_prompt TEXT,
          default_cs_reply_enabled TINYINT(1) DEFAULT 0,
          default_cs_reply_text TEXT,
          allowed_numbers LONGTEXT,
          max_sessions INT DEFAULT 1,
          daily_messages_sent INT DEFAULT 0,
          monthly_messages_sent INT DEFAULT 0,
          daily_ai_sent INT DEFAULT 0,
          monthly_ai_sent INT DEFAULT 0,
          total_messages_count INT DEFAULT 0,
          last_quota_reset_date VARCHAR(20),
          last_quota_reset_month VARCHAR(20),
          last_login_device VARCHAR(150),
          assigned_app_id VARCHAR(64),
          approved_at VARCHAR(50),
          created_at VARCHAR(50)
        ) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
      `);
      const alterQueries = [
        `ALTER TABLE app_users ADD COLUMN custom_gemini_key TEXT`,
        `ALTER TABLE app_users ADD COLUMN auto_reply_enabled TINYINT(1) DEFAULT 0`,
        `ALTER TABLE app_users ADD COLUMN auto_reply_activated_at VARCHAR(50)`,
        `ALTER TABLE app_users ADD COLUMN ai_enabled TINYINT(1) DEFAULT 0`,
        `ALTER TABLE app_users ADD COLUMN meta_ai_verified TINYINT(1) DEFAULT 0`,
        `ALTER TABLE app_users ADD COLUMN meta_ai_verified_phone VARCHAR(32)`,
        `ALTER TABLE app_users ADD COLUMN meta_ai_verified_phones TEXT`,
        `ALTER TABLE app_users ADD COLUMN meta_ai_verified_at VARCHAR(50)`,
        `ALTER TABLE app_users ADD COLUMN custom_system_prompt TEXT`,
        `ALTER TABLE app_users ADD COLUMN default_cs_reply_enabled TINYINT(1) DEFAULT 0`,
        `ALTER TABLE app_users ADD COLUMN default_cs_reply_text TEXT`,
        `ALTER TABLE app_users ADD COLUMN allowed_numbers LONGTEXT`,
        `ALTER TABLE app_users ADD COLUMN last_login_device VARCHAR(150)`,
        `ALTER TABLE app_users ADD COLUMN assigned_app_id VARCHAR(64)`,
        `ALTER TABLE app_users ADD COLUMN approved_at VARCHAR(50)`,
        `ALTER TABLE app_users ADD COLUMN monthly_messages_sent INT DEFAULT 0`,
        `ALTER TABLE app_users ADD COLUMN daily_ai_sent INT DEFAULT 0`,
        `ALTER TABLE app_users ADD COLUMN monthly_ai_sent INT DEFAULT 0`,
        `ALTER TABLE app_users ADD COLUMN total_messages_count INT DEFAULT 0`,
        `ALTER TABLE app_users ADD COLUMN last_quota_reset_month VARCHAR(20)`,
        `ALTER TABLE app_users ADD COLUMN custom_offline_message TEXT`
      ];
      for (const q of alterQueries) {
        await conn.query(q).catch(() => {
        });
      }
      await conn.query(`
        CREATE TABLE IF NOT EXISTS auto_reply_rules (
          id VARCHAR(120) PRIMARY KEY,
          user_id VARCHAR(100),
          keyword VARCHAR(255),
          match_type VARCHAR(30),
          response_text TEXT,
          is_active TINYINT(1) DEFAULT 1,
          created_at VARCHAR(50),
          updated_at VARCHAR(50)
        ) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
      `);
      await conn.query(`ALTER TABLE auto_reply_rules ADD COLUMN user_id VARCHAR(100)`).catch(() => {
      });
      await conn.query(`
        CREATE TABLE IF NOT EXISTS smtp_accounts (
          id VARCHAR(120) PRIMARY KEY,
          name VARCHAR(150),
          host VARCHAR(150),
          port INT,
          secure TINYINT(1),
          user_email VARCHAR(150),
          pass_encrypted TEXT,
          sender_name VARCHAR(150),
          is_active TINYINT(1) DEFAULT 1,
          success_count INT DEFAULT 0,
          error_count INT DEFAULT 0,
          last_error TEXT,
          last_used_at VARCHAR(50),
          created_at VARCHAR(50)
        ) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
      `);
      await conn.query(`ALTER TABLE smtp_accounts ADD COLUMN last_error TEXT`).catch(() => {
      });
      await conn.query(`
        CREATE TABLE IF NOT EXISTS gemini_keys (
          id VARCHAR(120) PRIMARY KEY,
          name VARCHAR(150),
          key_encrypted TEXT,
          is_active TINYINT(1) DEFAULT 1,
          usage_count INT DEFAULT 0,
          error_count INT DEFAULT 0,
          last_used_at VARCHAR(50),
          created_at VARCHAR(50)
        ) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
      `);
      await conn.query(`
        CREATE TABLE IF NOT EXISTS app_kv_store (
          kv_key VARCHAR(120) PRIMARY KEY,
          kv_value LONGTEXT,
          updated_at VARCHAR(50)
        ) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
      `);
      await detectSchemaMeta(conn);
      const sevenDaysAgoIso = new Date(Date.now() - 7 * 24 * 60 * 60 * 1e3).toISOString();
      await conn.query(`DELETE FROM message_logs WHERE created_at < ?`, [sevenDaysAgoIso]).catch(() => {
      });
      isSchemaInitialized = true;
      return true;
    } finally {
      conn.release();
    }
  } catch (err) {
    const diag = formatMysqlErrorDiagnostic(err, cfg);
    lastSchemaInitError = diag;
    console.warn(`[MySQL Schema Init] Fallback to local mode (${diag.code}): ${diag.detail}`);
    return false;
  }
}
async function purgeOldMysqlLogs() {
  if (!isMysqlConfigured()) return;
  try {
    const p = getMysqlPool();
    if (!p) return;
    const sevenDaysAgoIso = new Date(Date.now() - 7 * 24 * 60 * 60 * 1e3).toISOString();
    await p.query(`DELETE FROM message_logs WHERE created_at < ?`, [sevenDaysAgoIso]);
  } catch {
  }
}
async function pushMessageToMysql(m) {
  if (!isMysqlConfigured()) return;
  try {
    const ok = await initMysqlSchemaIfNotExists();
    if (!ok) return;
    const p = getMysqlPool();
    if (!p) return;
    await p.query(
      `INSERT INTO message_logs (id, user_id, session_id, sender_phone, sender_name, message_body, reply_body, direction, status, ai_generated, matched_rule_id, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         user_id = VALUES(user_id),
         session_id = VALUES(session_id),
         reply_body = VALUES(reply_body),
         status = VALUES(status),
         ai_generated = VALUES(ai_generated),
         matched_rule_id = VALUES(matched_rule_id)`,
      [
        m.id,
        m.user_id || "",
        m.session_id || "",
        m.sender_phone,
        m.sender_name || "",
        m.message_body,
        m.reply_body || "",
        m.direction,
        m.status,
        m.ai_generated ? 1 : 0,
        m.matched_rule_id || "",
        m.created_at
      ]
    );
    if (detectedSchemaMeta.hasWhatsappMessagesTable) {
      await p.query(
        `INSERT INTO whatsapp_messages (id, wam_id, sender_phone, sender_name, message_body, direction, status, reply_body, error_detail, ai_generated, created_at, user_id, session_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
           reply_body = VALUES(reply_body),
           status = VALUES(status),
           error_detail = VALUES(error_detail),
           ai_generated = VALUES(ai_generated)`,
        [
          m.id,
          m.wam_id || "",
          m.sender_phone,
          m.sender_name || "",
          m.message_body,
          m.direction,
          m.status,
          m.reply_body || "",
          m.error_detail || "",
          m.ai_generated ? 1 : 0,
          toMysqlDateTime(m.created_at, false),
          m.user_id || "",
          m.session_id || ""
        ]
      ).catch(() => {
      });
    }
  } catch (e) {
    console.warn("[MySQL Sync Message] skipped:", e?.message);
  }
}
async function clearMessagesFromMysql(userId) {
  if (!isMysqlConfigured()) return;
  try {
    const p = getMysqlPool();
    if (!p) return;
    if (userId) {
      await p.query(`DELETE FROM message_logs WHERE user_id = ?`, [userId]);
      if (detectedSchemaMeta.hasWhatsappMessagesTable) {
        await p.query(`DELETE FROM whatsapp_messages WHERE user_id = ?`, [userId]).catch(() => {
        });
      }
    } else {
      await p.query(`DELETE FROM message_logs`);
      if (detectedSchemaMeta.hasWhatsappMessagesTable) {
        await p.query(`DELETE FROM whatsapp_messages`).catch(() => {
        });
      }
    }
  } catch (e) {
    console.warn("[MySQL Clear Messages] skipped:", e?.message);
  }
}
async function pushSessionToMysql(s) {
  if (!isMysqlConfigured()) return;
  try {
    const ok = await initMysqlSchemaIfNotExists();
    if (!ok) return;
    const p = getMysqlPool();
    if (!p) return;
    const cleanPhone = s.phone_number ? s.phone_number.replace(/\D/g, "") : "";
    if (cleanPhone && s.user_id) {
      await p.query(
        `DELETE FROM whatsapp_sessions WHERE REPLACE(REPLACE(phone_number, '+', ''), '-', '') = ? AND user_id = ? AND id != ?`,
        [cleanPhone, s.user_id, s.id]
      ).catch(() => {
      });
    }
    const cols = [
      "id",
      "user_id",
      "session_name",
      "phone_number",
      "phone_number_id",
      "access_token",
      "auth_method",
      "status",
      "is_primary"
    ];
    const vals = [
      s.id,
      s.user_id || "",
      s.session_name,
      cleanPhone || s.phone_number,
      "",
      "",
      s.auth_method,
      s.status,
      s.is_primary ? 1 : 0
    ];
    const updates = [
      "user_id = VALUES(user_id)",
      "session_name = VALUES(session_name)",
      "phone_number = VALUES(phone_number)",
      "auth_method = VALUES(auth_method)",
      "status = VALUES(status)",
      "is_primary = VALUES(is_primary)"
    ];
    if (detectedSchemaMeta.sessionsHasAiEnabled && detectedSchemaMeta.sessionsHasCustomPrompt) {
      cols.push("ai_enabled", "custom_system_prompt");
      vals.push(
        typeof s.ai_enabled === "boolean" ? s.ai_enabled ? 1 : 0 : null,
        typeof s.custom_system_prompt === "string" ? s.custom_system_prompt : ""
      );
      updates.push("ai_enabled = VALUES(ai_enabled)", "custom_system_prompt = VALUES(custom_system_prompt)");
    }
    if (detectedSchemaMeta.sessionsHasConnectedAt) {
      cols.push("connected_at");
      vals.push(toMysqlDateTime(s.connected_at, true));
      updates.push("connected_at = VALUES(connected_at)");
    }
    if (detectedSchemaMeta.sessionsHasLastActivityAt) {
      cols.push("last_activity_at");
      vals.push(toMysqlDateTime(s.last_activity_at, true));
      updates.push("last_activity_at = VALUES(last_activity_at)");
    }
    if (detectedSchemaMeta.sessionsHasTotalMessagesCount) {
      cols.push("total_messages_count");
      vals.push(Math.max(0, Number(s.total_messages_count) || 0));
      updates.push("total_messages_count = VALUES(total_messages_count)");
    }
    if (detectedSchemaMeta.sessionsHasAssignmentCols) {
      cols.push(
        "assigned_app_id",
        "connected_app_id",
        "failed_app_ids",
        "assignment_status",
        "assignment_error",
        "last_assignment_at"
      );
      vals.push(
        normalizeAppId(s.assigned_app_id) || "",
        normalizeAppId(s.connected_app_id) || "",
        JSON.stringify(Array.isArray(s.failed_app_ids) ? s.failed_app_ids.map(normalizeAppId).filter(Boolean) : []),
        String(s.assignment_status || "idle").slice(0, 32),
        typeof s.assignment_error === "string" ? s.assignment_error.slice(0, 1e3) : "",
        s.last_assignment_at || ""
      );
      updates.push(
        "assigned_app_id = VALUES(assigned_app_id)",
        "connected_app_id = VALUES(connected_app_id)",
        "failed_app_ids = VALUES(failed_app_ids)",
        "assignment_status = VALUES(assignment_status)",
        "assignment_error = VALUES(assignment_error)",
        "last_assignment_at = VALUES(last_assignment_at)"
      );
    }
    if (detectedSchemaMeta.sessionsHasServerIpCols) {
      cols.push("assigned_server_ip", "connected_server_ip");
      vals.push(
        String(s.assigned_server_ip || "").trim().slice(0, 64),
        String(s.connected_server_ip || "").trim().slice(0, 64)
      );
      updates.push(
        "assigned_server_ip = VALUES(assigned_server_ip)",
        "connected_server_ip = VALUES(connected_server_ip)"
      );
    }
    cols.push("expires_at", "created_at", "updated_at");
    vals.push(
      toMysqlDateTime(s.expires_at, true),
      toMysqlDateTime(s.created_at, false),
      toMysqlDateTime(s.updated_at, false)
    );
    updates.push("expires_at = VALUES(expires_at)", "updated_at = VALUES(updated_at)");
    const placeholders = cols.map(() => "?").join(", ");
    await p.query(
      `INSERT INTO whatsapp_sessions (${cols.join(", ")})
       VALUES (${placeholders})
       ON DUPLICATE KEY UPDATE ${updates.join(", ")}`,
      vals
    );
  } catch (e) {
    console.warn("[MySQL Sync Session] skipped:", e?.message);
  }
}
async function deleteSessionFromMysql(id, phoneNumber) {
  if (!isMysqlConfigured()) return;
  try {
    const p = getMysqlPool();
    if (!p) return;
    await p.query(`DELETE FROM whatsapp_sessions WHERE id = ?`, [id]);
    if (phoneNumber) {
      const clean = phoneNumber.replace(/\D/g, "");
      if (clean) {
        await p.query(`DELETE FROM whatsapp_sessions WHERE REPLACE(REPLACE(phone_number, '+', ''), '-', '') = ?`, [clean]);
      }
    }
  } catch (e) {
    console.warn("[MySQL Delete Session] skipped:", e?.message);
  }
}
async function pushBaileysAuthBackupToMysql(sessionId, authFilesMap) {
  if (!isMysqlConfigured()) return;
  try {
    const ok = await initMysqlSchemaIfNotExists();
    if (!ok) return;
    const p = getMysqlPool();
    if (!p) return;
    const { kvKeyCol, kvValCol } = detectedSchemaMeta;
    const kvKey = `baileys_auth_${sessionId}`;
    const encryptedPayload = encryptData(JSON.stringify(authFilesMap));
    const now = toMysqlDateTime(/* @__PURE__ */ new Date(), false);
    await p.query(
      `INSERT INTO app_kv_store (${kvKeyCol}, ${kvValCol}, updated_at)
       VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE
         ${kvValCol} = VALUES(${kvValCol}),
         updated_at = VALUES(updated_at)`,
      [kvKey, encryptedPayload, now]
    );
  } catch (e) {
    console.warn("[MySQL Baileys Auth Backup] skipped:", e?.message);
  }
}
async function deleteBaileysAuthBackupFromMysql(sessionId) {
  if (!isMysqlConfigured()) return;
  try {
    const ok = await initMysqlSchemaIfNotExists();
    if (!ok) return;
    const p = getMysqlPool();
    if (!p) return;
    const { kvKeyCol } = detectedSchemaMeta;
    await p.query(`DELETE FROM app_kv_store WHERE ${kvKeyCol} = ?`, [`baileys_auth_${sessionId}`]);
  } catch {
  }
}
async function fetchAllBaileysAuthBackupsFromMysql() {
  const result = {};
  if (!isMysqlConfigured()) return result;
  try {
    const ok = await initMysqlSchemaIfNotExists();
    if (!ok) return result;
    const p = getMysqlPool();
    if (!p) return result;
    const { kvKeyCol, kvValCol } = detectedSchemaMeta;
    const [rows] = await p.query(
      `SELECT ${kvKeyCol} AS kv_key, ${kvValCol} AS kv_value FROM app_kv_store WHERE ${kvKeyCol} LIKE 'baileys_auth_%'`
    );
    for (const row of rows) {
      if (!row?.kv_key || !row?.kv_value) continue;
      const sessionId = String(row.kv_key).replace(/^baileys_auth_/, "");
      try {
        const raw = decryptData(String(row.kv_value));
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === "object") {
          result[sessionId] = parsed;
        }
      } catch {
      }
    }
  } catch {
  }
  return result;
}
async function pushUserToMysql(u) {
  if (!isMysqlConfigured()) return;
  try {
    const ok = await initMysqlSchemaIfNotExists();
    if (!ok) return;
    const p = getMysqlPool();
    if (!p) return;
    const totalMsgCol = detectedSchemaMeta.usersHasTotalMessagesCount ? ", total_messages_count" : "";
    const totalMsgPlaceholder = detectedSchemaMeta.usersHasTotalMessagesCount ? ", ?" : "";
    const totalMsgUpdate = detectedSchemaMeta.usersHasTotalMessagesCount ? ",\n         total_messages_count = VALUES(total_messages_count)" : "";
    const assignedAppCol = detectedSchemaMeta.usersHasAssignedAppId ? ", assigned_app_id" : "";
    const assignedAppPlaceholder = detectedSchemaMeta.usersHasAssignedAppId ? ", ?" : "";
    const assignedAppUpdate = detectedSchemaMeta.usersHasAssignedAppId ? ",\n         assigned_app_id = VALUES(assigned_app_id)" : "";
    const params = [
      u.id,
      u.username,
      u.name,
      u.role,
      u.email,
      u.phone || "",
      u.password,
      u.is_active ? 1 : 0,
      u.email_verified ? 1 : 0,
      u.wa_verified ? 1 : 0,
      u.verification_otp || "",
      u.otp_expires_at || "",
      u.plan_id || "free",
      u.plan_status || "active",
      u.payment_note || "",
      u.payment_receipt_url || "",
      u.requested_plan_id || "",
      u.ai_verified ? 1 : 0,
      u.ai_verification_notes || "",
      u.ai_verified_at || "",
      u.security_pin || "",
      u.pin_failed_attempts || 0,
      u.is_bot_locked ? 1 : 0,
      u.api_key || "",
      u.custom_gemini_key ? encryptData(u.custom_gemini_key) : "",
      u.custom_offline_message || "",
      u.role === "admin" ? u.auto_reply_enabled !== false ? 1 : 0 : u.auto_reply_enabled === true ? 1 : 0,
      u.auto_reply_activated_at || "",
      u.role === "admin" ? u.ai_enabled !== false ? 1 : 0 : u.ai_enabled === true ? 1 : 0,
      u.meta_ai_verified ? 1 : 0,
      u.meta_ai_verified_phone || "",
      Array.isArray(u.meta_ai_verified_phones) ? JSON.stringify(u.meta_ai_verified_phones) : "[]",
      u.meta_ai_verified_at || "",
      u.custom_system_prompt || "",
      u.role === "admin" ? u.default_cs_reply_enabled !== false ? 1 : 0 : u.default_cs_reply_enabled === true ? 1 : 0,
      u.default_cs_reply_text || "",
      u.allowed_numbers ? JSON.stringify(u.allowed_numbers) : "[]",
      1,
      // Force 1 max WA session per account
      u.daily_messages_sent || 0,
      u.monthly_messages_sent || 0,
      u.daily_ai_sent || 0,
      u.monthly_ai_sent || 0,
      ...detectedSchemaMeta.usersHasTotalMessagesCount ? [Math.max(0, Number(u.total_messages_count) || 0)] : [],
      u.last_quota_reset_date || "",
      u.last_quota_reset_month || "",
      u.last_login_device || "",
      ...detectedSchemaMeta.usersHasAssignedAppId ? [normalizeAppId(u.assigned_app_id) || ""] : [],
      u.approved_at || "",
      u.created_at
    ];
    await p.query(
      `INSERT INTO app_users (
        id, username, name, role, email, phone, password,
        is_active, email_verified, wa_verified, verification_otp, otp_expires_at,
        plan_id, plan_status, payment_note, payment_receipt_url, requested_plan_id,
        ai_verified, ai_verification_notes, ai_verified_at,
        security_pin, pin_failed_attempts, is_bot_locked, api_key,
        custom_gemini_key, custom_offline_message, auto_reply_enabled, auto_reply_activated_at, ai_enabled,
        meta_ai_verified, meta_ai_verified_phone, meta_ai_verified_phones, meta_ai_verified_at,
        custom_system_prompt,
        default_cs_reply_enabled, default_cs_reply_text, allowed_numbers,
        max_sessions, daily_messages_sent, monthly_messages_sent, daily_ai_sent, monthly_ai_sent${totalMsgCol},
        last_quota_reset_date, last_quota_reset_month, last_login_device${assignedAppCol}, approved_at, created_at
      )
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?${totalMsgPlaceholder}, ?, ?, ?${assignedAppPlaceholder}, ?, ?)
       ON DUPLICATE KEY UPDATE
         name = VALUES(name),
         role = VALUES(role),
         email = VALUES(email),
         phone = VALUES(phone),
         password = VALUES(password),
         is_active = VALUES(is_active),
         email_verified = VALUES(email_verified),
         wa_verified = VALUES(wa_verified),
         verification_otp = VALUES(verification_otp),
         otp_expires_at = VALUES(otp_expires_at),
         plan_id = VALUES(plan_id),
         plan_status = VALUES(plan_status),
         payment_note = VALUES(payment_note),
         payment_receipt_url = VALUES(payment_receipt_url),
         requested_plan_id = VALUES(requested_plan_id),
         ai_verified = VALUES(ai_verified),
         ai_verification_notes = VALUES(ai_verification_notes),
         ai_verified_at = VALUES(ai_verified_at),
         security_pin = VALUES(security_pin),
         pin_failed_attempts = VALUES(pin_failed_attempts),
         is_bot_locked = VALUES(is_bot_locked),
         api_key = VALUES(api_key),
         custom_gemini_key = VALUES(custom_gemini_key),
         custom_offline_message = VALUES(custom_offline_message),
         auto_reply_enabled = VALUES(auto_reply_enabled),
         auto_reply_activated_at = VALUES(auto_reply_activated_at),
         ai_enabled = VALUES(ai_enabled),
         meta_ai_verified = VALUES(meta_ai_verified),
         meta_ai_verified_phone = VALUES(meta_ai_verified_phone),
         meta_ai_verified_phones = VALUES(meta_ai_verified_phones),
         meta_ai_verified_at = VALUES(meta_ai_verified_at),
         custom_system_prompt = VALUES(custom_system_prompt),
         default_cs_reply_enabled = VALUES(default_cs_reply_enabled),
         default_cs_reply_text = VALUES(default_cs_reply_text),
         allowed_numbers = VALUES(allowed_numbers),
         max_sessions = VALUES(max_sessions),
         daily_messages_sent = VALUES(daily_messages_sent),
         monthly_messages_sent = VALUES(monthly_messages_sent),
         daily_ai_sent = VALUES(daily_ai_sent),
         monthly_ai_sent = VALUES(monthly_ai_sent)${totalMsgUpdate},
         last_quota_reset_date = VALUES(last_quota_reset_date),
         last_quota_reset_month = VALUES(last_quota_reset_month),
         last_login_device = VALUES(last_login_device)${assignedAppUpdate},
         approved_at = VALUES(approved_at)`,
      params
    );
  } catch (e) {
    console.warn("[MySQL Sync User] skipped:", e?.message);
  }
}
async function pushUserAssignedAppToMysql(userId, assignedAppId) {
  if (!isMysqlConfigured() || !userId) return;
  try {
    const ok = await initMysqlSchemaIfNotExists();
    if (!ok || !detectedSchemaMeta.usersHasAssignedAppId) return;
    const p = getMysqlPool();
    if (!p) return;
    await p.query(`UPDATE app_users SET assigned_app_id = ? WHERE id = ?`, [normalizeAppId(assignedAppId) || "", userId]);
  } catch (e) {
    console.warn("[MySQL Update User App] skipped:", e?.message);
  }
}
async function deleteUserFromMysql(id) {
  if (!isMysqlConfigured()) return;
  try {
    const p = getMysqlPool();
    if (!p) return;
    await p.query(`DELETE FROM app_users WHERE id = ?`, [id]);
    await p.query(`DELETE FROM whatsapp_sessions WHERE user_id = ?`, [id]);
    await p.query(`DELETE FROM auto_reply_rules WHERE user_id = ?`, [id]);
  } catch (e) {
    console.warn("[MySQL Delete User] skipped:", e?.message);
  }
}
async function pushRuleToMysql(r) {
  if (!isMysqlConfigured()) return;
  try {
    const ok = await initMysqlSchemaIfNotExists();
    if (!ok) return;
    const p = getMysqlPool();
    if (!p) return;
    await p.query(
      `INSERT INTO auto_reply_rules (id, user_id, keyword, match_type, response_text, is_active, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         user_id = VALUES(user_id),
         keyword = VALUES(keyword),
         match_type = VALUES(match_type),
         response_text = VALUES(response_text),
         is_active = VALUES(is_active),
         updated_at = VALUES(updated_at)`,
      [
        r.id,
        r.user_id || "",
        r.keyword,
        r.match_type,
        r.response_text,
        r.is_active ? 1 : 0,
        toMysqlDateTime(r.created_at, false),
        toMysqlDateTime(r.updated_at, false)
      ]
    );
  } catch (e) {
    console.warn("[MySQL Sync Rule] skipped:", e?.message);
  }
}
async function deleteRuleFromMysql(id) {
  if (!isMysqlConfigured()) return;
  try {
    const p = getMysqlPool();
    if (!p) return;
    await p.query(`DELETE FROM auto_reply_rules WHERE id = ?`, [id]);
  } catch (e) {
    console.warn("[MySQL Delete Rule] skipped:", e?.message);
  }
}
async function pushSmtpAccountToMysql(s) {
  if (!isMysqlConfigured()) return { ok: true };
  try {
    const ok = await initMysqlSchemaIfNotExists();
    if (!ok) return { ok: false, error: "Gagal inisialisasi skema database MySQL." };
    const p = getMysqlPool();
    if (!p) return { ok: false, error: "Koneksi pool MySQL tidak tersedia." };
    const { smtpUserCol, smtpPassCol, smtpHasLastError } = detectedSchemaMeta;
    if (smtpHasLastError) {
      await p.query(
        `INSERT INTO smtp_accounts (id, name, host, port, secure, ${smtpUserCol}, ${smtpPassCol}, sender_name, is_active, success_count, error_count, last_error, last_used_at, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
           name = VALUES(name),
           host = VALUES(host),
           port = VALUES(port),
           secure = VALUES(secure),
           ${smtpUserCol} = VALUES(${smtpUserCol}),
           ${smtpPassCol} = VALUES(${smtpPassCol}),
           sender_name = VALUES(sender_name),
           is_active = VALUES(is_active),
           success_count = VALUES(success_count),
           error_count = VALUES(error_count),
           last_error = VALUES(last_error),
           last_used_at = VALUES(last_used_at)`,
        [
          s.id,
          String(s.name || "").slice(0, 128),
          String(s.host || "smtp.gmail.com").slice(0, 128),
          Number(s.port) || 587,
          s.secure ? 1 : 0,
          String(s.user || "").slice(0, 128),
          String(s.pass || ""),
          String(s.sender_name || "").slice(0, 128),
          s.is_active ? 1 : 0,
          s.success_count || 0,
          s.error_count || 0,
          s.last_error || "",
          toMysqlDateTime(s.last_used_at, true),
          toMysqlDateTime(s.created_at, false)
        ]
      );
    } else {
      await p.query(
        `INSERT INTO smtp_accounts (id, name, host, port, secure, ${smtpUserCol}, ${smtpPassCol}, sender_name, is_active, success_count, error_count, last_used_at, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
           name = VALUES(name),
           host = VALUES(host),
           port = VALUES(port),
           secure = VALUES(secure),
           ${smtpUserCol} = VALUES(${smtpUserCol}),
           ${smtpPassCol} = VALUES(${smtpPassCol}),
           sender_name = VALUES(sender_name),
           is_active = VALUES(is_active),
           success_count = VALUES(success_count),
           error_count = VALUES(error_count),
           last_used_at = VALUES(last_used_at)`,
        [
          s.id,
          String(s.name || "").slice(0, 128),
          String(s.host || "smtp.gmail.com").slice(0, 128),
          Number(s.port) || 587,
          s.secure ? 1 : 0,
          String(s.user || "").slice(0, 128),
          String(s.pass || ""),
          String(s.sender_name || "").slice(0, 128),
          s.is_active ? 1 : 0,
          s.success_count || 0,
          s.error_count || 0,
          toMysqlDateTime(s.last_used_at, true),
          toMysqlDateTime(s.created_at, false)
        ]
      );
    }
    return { ok: true };
  } catch (e) {
    console.warn("[MySQL Sync SMTP] failed:", e?.message);
    return { ok: false, error: "Gagal menyimpan akun SMTP ke database MySQL." };
  }
}
async function deleteSmtpAccountFromMysql(id) {
  if (!isMysqlConfigured()) return { ok: true };
  try {
    const ok = await initMysqlSchemaIfNotExists();
    if (!ok) return { ok: false, error: "Gagal inisialisasi skema database MySQL." };
    const p = getMysqlPool();
    if (!p) return { ok: false, error: "Koneksi pool MySQL tidak tersedia." };
    await p.query(`DELETE FROM smtp_accounts WHERE id = ?`, [id]);
    return { ok: true };
  } catch (e) {
    console.warn("[MySQL Delete SMTP] failed:", e?.message);
    return { ok: false, error: "Gagal menghapus akun SMTP dari database MySQL." };
  }
}
async function pushGeminiKeyToMysql(k) {
  if (!isMysqlConfigured()) return;
  try {
    const ok = await initMysqlSchemaIfNotExists();
    if (!ok) return;
    const p = getMysqlPool();
    if (!p) return;
    const { geminiKeyCol } = detectedSchemaMeta;
    await p.query(
      `INSERT INTO gemini_keys (id, name, ${geminiKeyCol}, is_active, usage_count, error_count, last_used_at, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         name = VALUES(name),
         ${geminiKeyCol} = VALUES(${geminiKeyCol}),
         is_active = VALUES(is_active),
         usage_count = VALUES(usage_count),
         error_count = VALUES(error_count),
         last_used_at = VALUES(last_used_at)`,
      [
        k.id,
        k.name,
        k.key,
        k.is_active ? 1 : 0,
        k.usage_count || 0,
        k.error_count || 0,
        toMysqlDateTime(k.last_used_at, true),
        toMysqlDateTime(k.created_at, false)
      ]
    );
  } catch (e) {
    console.warn("[MySQL Sync Gemini Key] skipped:", e?.message);
  }
}
async function deleteGeminiKeyFromMysql(id) {
  if (!isMysqlConfigured()) return;
  try {
    const p = getMysqlPool();
    if (!p) return;
    await p.query(`DELETE FROM gemini_keys WHERE id = ?`, [id]);
  } catch (e) {
    console.warn("[MySQL Delete Gemini] skipped:", e?.message);
  }
}
async function pushKvSettingToMysql(key, value) {
  if (!isMysqlConfigured()) return;
  try {
    const ok = await initMysqlSchemaIfNotExists();
    if (!ok) return;
    const p = getMysqlPool();
    if (!p) return;
    const { kvKeyCol, kvValCol } = detectedSchemaMeta;
    const payload = typeof value === "string" ? value : JSON.stringify(value);
    const stored = key === "systemConfig" ? encryptData(payload) : payload;
    await p.query(
      `INSERT INTO app_kv_store (${kvKeyCol}, ${kvValCol}, updated_at)
       VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE
         ${kvValCol} = VALUES(${kvValCol}),
         updated_at = VALUES(updated_at)`,
      [key, stored, toMysqlDateTime(/* @__PURE__ */ new Date(), false)]
    );
  } catch (e) {
    console.warn("[MySQL Sync KV] skipped:", e?.message);
  }
}
async function saveBaileysAuthToMysql(sessionId, authFilesMap) {
  if (!isMysqlConfigured()) return;
  try {
    const ok = await initMysqlSchemaIfNotExists();
    if (!ok) return;
    const p = getMysqlPool();
    if (!p) return;
    const { kvKeyCol, kvValCol } = detectedSchemaMeta;
    const encrypted = encryptData(JSON.stringify(authFilesMap));
    await p.query(
      `INSERT INTO app_kv_store (${kvKeyCol}, ${kvValCol}, updated_at)
       VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE
         ${kvValCol} = VALUES(${kvValCol}),
         updated_at = VALUES(updated_at)`,
      [`baileys_auth_${sessionId}`, encrypted, toMysqlDateTime(/* @__PURE__ */ new Date(), false)]
    );
  } catch (e) {
    console.warn("[MySQL Save Baileys Auth] skipped:", e?.message);
  }
}
async function loadBaileysAuthFromMysql(sessionId) {
  if (!isMysqlConfigured()) return null;
  try {
    const ok = await initMysqlSchemaIfNotExists();
    if (!ok) return null;
    const p = getMysqlPool();
    if (!p) return null;
    const { kvKeyCol, kvValCol } = detectedSchemaMeta;
    const [rows] = await p.query(
      `SELECT ${kvValCol} AS kv_value FROM app_kv_store WHERE ${kvKeyCol} = ? LIMIT 1`,
      [`baileys_auth_${sessionId}`]
    );
    if (rows && rows.length > 0 && rows[0].kv_value) {
      const decrypted = decryptData(String(rows[0].kv_value));
      return JSON.parse(decrypted);
    }
    return null;
  } catch {
    return null;
  }
}
async function loadAllBaileysAuthSessionIdsFromMysql() {
  if (!isMysqlConfigured()) return [];
  try {
    const ok = await initMysqlSchemaIfNotExists();
    if (!ok) return [];
    const p = getMysqlPool();
    if (!p) return [];
    const { kvKeyCol } = detectedSchemaMeta;
    const [rows] = await p.query(
      `SELECT ${kvKeyCol} AS kv_key FROM app_kv_store WHERE ${kvKeyCol} LIKE 'baileys_auth_%'`
    );
    return rows.filter((r) => r?.kv_key).map((r) => String(r.kv_key).replace(/^baileys_auth_/, ""));
  } catch {
    return [];
  }
}
async function saveWaSessionLeaseToMysql(lease) {
  if (!isMysqlConfigured() || !lease?.session_id) return;
  try {
    const ok = await initMysqlSchemaIfNotExists();
    if (!ok) return;
    const p = getMysqlPool();
    if (!p) return;
    const { kvKeyCol, kvValCol } = detectedSchemaMeta;
    const encrypted = encryptData(JSON.stringify(lease));
    const nowStr = toMysqlDateTime(/* @__PURE__ */ new Date(), false);
    const keys = [`wa_lease_sid_${lease.session_id}`];
    const cleanPhone = String(lease.phone_number || "").replace(/\D/g, "");
    if (cleanPhone.length >= 8) {
      keys.push(`wa_lease_phone_${cleanPhone}`);
    }
    for (const k of keys) {
      await p.query(
        `INSERT INTO app_kv_store (${kvKeyCol}, ${kvValCol}, updated_at)
         VALUES (?, ?, ?)
         ON DUPLICATE KEY UPDATE
           ${kvValCol} = VALUES(${kvValCol}),
           updated_at = VALUES(updated_at)`,
        [k, encrypted, nowStr]
      );
    }
  } catch {
  }
}
async function loadWaSessionLeaseFromMysql(params) {
  if (!isMysqlConfigured()) return null;
  const keys = [];
  if (params.sessionId) keys.push(`wa_lease_sid_${params.sessionId}`);
  const cleanPhone = String(params.phoneNumber || "").replace(/\D/g, "");
  if (cleanPhone.length >= 8) keys.push(`wa_lease_phone_${cleanPhone}`);
  if (keys.length === 0) return null;
  try {
    const ok = await initMysqlSchemaIfNotExists();
    if (!ok) return null;
    const p = getMysqlPool();
    if (!p) return null;
    const { kvKeyCol, kvValCol } = detectedSchemaMeta;
    const placeholders = keys.map(() => "?").join(", ");
    const [rows] = await p.query(
      `SELECT ${kvValCol} AS kv_value FROM app_kv_store WHERE ${kvKeyCol} IN (${placeholders})`,
      keys
    );
    let best = null;
    for (const row of rows || []) {
      if (!row?.kv_value) continue;
      try {
        const plain = decryptData(String(row.kv_value));
        const parsed = JSON.parse(plain);
        if (!parsed || !parsed.instance_id || !parsed.session_id) continue;
        if (!best || (Number(parsed.heartbeat_at) || 0) > (Number(best.heartbeat_at) || 0)) {
          best = parsed;
        }
      } catch {
      }
    }
    return best;
  } catch {
    return null;
  }
}
async function deleteWaSessionLeaseFromMysql(params) {
  if (!isMysqlConfigured()) return;
  const keys = [];
  if (params.sessionId) keys.push(`wa_lease_sid_${params.sessionId}`);
  const cleanPhone = String(params.phoneNumber || "").replace(/\D/g, "");
  if (cleanPhone.length >= 8) keys.push(`wa_lease_phone_${cleanPhone}`);
  if (keys.length === 0) return;
  try {
    const ok = await initMysqlSchemaIfNotExists();
    if (!ok) return;
    const p = getMysqlPool();
    if (!p) return;
    const { kvKeyCol, kvValCol } = detectedSchemaMeta;
    for (const k of keys) {
      if (params.expectedInstanceId) {
        const [rows] = await p.query(
          `SELECT ${kvValCol} AS kv_value FROM app_kv_store WHERE ${kvKeyCol} = ? LIMIT 1`,
          [k]
        );
        const raw = rows?.[0]?.kv_value;
        if (raw) {
          try {
            const parsed = JSON.parse(decryptData(String(raw)));
            if (parsed?.instance_id && parsed.instance_id !== params.expectedInstanceId) {
              continue;
            }
          } catch {
          }
        }
      }
      await p.query(`DELETE FROM app_kv_store WHERE ${kvKeyCol} = ?`, [k]);
    }
  } catch {
  }
}
async function deleteBaileysAuthFromMysql(sessionId) {
  if (!isMysqlConfigured()) return;
  try {
    const ok = await initMysqlSchemaIfNotExists();
    if (!ok) return;
    const p = getMysqlPool();
    if (!p) return;
    const { kvKeyCol } = detectedSchemaMeta;
    await p.query(`DELETE FROM app_kv_store WHERE ${kvKeyCol} = ?`, [`baileys_auth_${sessionId}`]);
  } catch {
  }
}
async function fetchDatabaseFromMysql() {
  if (!isMysqlConfigured()) return null;
  try {
    const ok = await initMysqlSchemaIfNotExists();
    if (!ok) return null;
    const p = getMysqlPool();
    if (!p) return null;
    const { kvKeyCol, kvValCol, hasWhatsappMessagesTable } = detectedSchemaMeta;
    const [msgRows] = await p.query(`SELECT * FROM message_logs ORDER BY created_at DESC LIMIT 1000`);
    const [legacyMsgRows] = hasWhatsappMessagesTable ? await p.query(`SELECT * FROM whatsapp_messages ORDER BY created_at DESC LIMIT 1000`).catch(() => [[]]) : [[]];
    const mergedMsgMap = /* @__PURE__ */ new Map();
    for (const r of legacyMsgRows || []) {
      if (!r?.id) continue;
      mergedMsgMap.set(String(r.id), {
        ...r,
        created_at: fromMysqlDateTime(r.created_at),
        ai_generated: Boolean(r.ai_generated)
      });
    }
    for (const r of msgRows) {
      if (!r?.id) continue;
      mergedMsgMap.set(String(r.id), {
        ...r,
        created_at: fromMysqlDateTime(r.created_at),
        ai_generated: Boolean(r.ai_generated)
      });
    }
    const mergedMessages = Array.from(mergedMsgMap.values()).sort((a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime()).slice(0, 1e3);
    const [sessRows] = await p.query(`SELECT * FROM whatsapp_sessions`);
    const [appUserRows] = await p.query(`SELECT * FROM app_users`);
    const [legacyUserRows] = await p.query(`SELECT * FROM users`).catch(() => [[]]);
    const mergedUserMap = /* @__PURE__ */ new Map();
    for (const r of legacyUserRows || []) {
      if (r?.id) mergedUserMap.set(String(r.id), r);
    }
    for (const r of appUserRows) {
      if (r?.id) mergedUserMap.set(String(r.id), r);
    }
    const userRows = Array.from(mergedUserMap.values());
    const [ruleRows] = await p.query(`SELECT * FROM auto_reply_rules`);
    const [smtpRows] = await p.query(`SELECT * FROM smtp_accounts`);
    const [gemRows] = await p.query(`SELECT * FROM gemini_keys`);
    const [kvRows] = await p.query(
      `SELECT ${kvKeyCol} AS kv_key, ${kvValCol} AS kv_value FROM app_kv_store WHERE ${kvKeyCol} NOT LIKE 'baileys_auth_%'`
    );
    const remoteData = {
      messages: mergedMessages,
      sessions: sessRows.map((r) => {
        let parsedFailedApps = [];
        try {
          if (r.failed_app_ids) {
            const rawArr = JSON.parse(String(r.failed_app_ids));
            if (Array.isArray(rawArr)) {
              parsedFailedApps = rawArr.map((x) => normalizeAppId(x)).filter(Boolean);
            }
          }
        } catch {
          parsedFailedApps = [];
        }
        return {
          ...r,
          auth_method: r.auth_method === "pairing_code" ? "pairing_code" : "qr_code",
          is_primary: Boolean(r.is_primary),
          ai_enabled: r.ai_enabled === null || r.ai_enabled === void 0 ? null : Boolean(r.ai_enabled),
          custom_system_prompt: typeof r.custom_system_prompt === "string" ? r.custom_system_prompt : "",
          assigned_app_id: normalizeAppId(r.assigned_app_id) || void 0,
          assigned_server_ip: typeof r.assigned_server_ip === "string" && r.assigned_server_ip.trim() ? r.assigned_server_ip.trim() : void 0,
          connected_app_id: normalizeAppId(r.connected_app_id) || void 0,
          connected_server_ip: typeof r.connected_server_ip === "string" && r.connected_server_ip.trim() ? r.connected_server_ip.trim() : void 0,
          failed_app_ids: parsedFailedApps,
          assignment_status: r.assignment_status || void 0,
          assignment_error: typeof r.assignment_error === "string" && r.assignment_error ? r.assignment_error : void 0,
          last_assignment_at: r.last_assignment_at ? String(r.last_assignment_at) : void 0,
          connected_at: fromMysqlDateTime(r.connected_at),
          last_activity_at: fromMysqlDateTime(r.last_activity_at),
          total_messages_count: Number(r.total_messages_count) || 0,
          expires_at: fromMysqlDateTime(r.expires_at),
          created_at: fromMysqlDateTime(r.created_at),
          updated_at: fromMysqlDateTime(r.updated_at)
        };
      }),
      users: userRows.map((r) => {
        let parsedAllowed = [];
        try {
          if (r.allowed_numbers) parsedAllowed = JSON.parse(String(r.allowed_numbers));
        } catch {
          parsedAllowed = [];
        }
        let parsedMetaVerifiedPhones = [];
        try {
          if (r.meta_ai_verified_phones) parsedMetaVerifiedPhones = JSON.parse(String(r.meta_ai_verified_phones));
        } catch {
          parsedMetaVerifiedPhones = [];
        }
        return {
          ...r,
          is_active: Boolean(r.is_active),
          email_verified: Boolean(r.email_verified),
          wa_verified: Boolean(r.wa_verified),
          ai_verified: Boolean(r.ai_verified),
          meta_ai_verified: Boolean(r.meta_ai_verified),
          meta_ai_verified_phone: r.meta_ai_verified_phone || "",
          meta_ai_verified_phones: Array.isArray(parsedMetaVerifiedPhones) ? parsedMetaVerifiedPhones : [],
          meta_ai_verified_at: r.meta_ai_verified_at || "",
          is_bot_locked: Boolean(r.is_bot_locked),
          pin_failed_attempts: Number(r.pin_failed_attempts) || 0,
          max_sessions: 1,
          daily_messages_sent: Number(r.daily_messages_sent) || 0,
          monthly_messages_sent: Number(r.monthly_messages_sent) || 0,
          daily_ai_sent: Number(r.daily_ai_sent) || 0,
          monthly_ai_sent: Number(r.monthly_ai_sent) || 0,
          total_messages_count: Number(r.total_messages_count) || 0,
          custom_gemini_key: r.custom_gemini_key ? decryptData(String(r.custom_gemini_key)) : "",
          auto_reply_enabled: r.role === "admin" ? r.auto_reply_enabled !== 0 : Boolean(r.auto_reply_enabled),
          auto_reply_activated_at: r.auto_reply_activated_at || "",
          ai_enabled: r.role === "admin" ? r.ai_enabled !== 0 : Boolean(r.ai_enabled),
          default_cs_reply_enabled: r.role === "admin" ? r.default_cs_reply_enabled !== 0 : Boolean(r.default_cs_reply_enabled),
          allowed_numbers: parsedAllowed,
          assigned_app_id: normalizeAppId(r.assigned_app_id) || void 0,
          created_at: fromMysqlDateTime(r.created_at)
        };
      }),
      rules: ruleRows.map((r) => ({
        ...r,
        is_active: Boolean(r.is_active),
        created_at: fromMysqlDateTime(r.created_at),
        updated_at: fromMysqlDateTime(r.updated_at)
      })),
      smtpAccounts: smtpRows.map((r) => ({
        id: r.id,
        name: r.name,
        host: r.host,
        port: r.port,
        secure: Boolean(r.secure),
        user: r.user_email ?? r.user ?? "",
        pass: r.pass_encrypted ?? r.pass ?? "",
        sender_name: r.sender_name,
        is_active: Boolean(r.is_active),
        success_count: r.success_count,
        error_count: r.error_count,
        last_error: r.last_error ?? "",
        last_used_at: fromMysqlDateTime(r.last_used_at),
        created_at: fromMysqlDateTime(r.created_at)
      })),
      geminiKeys: gemRows.map((r) => ({
        id: r.id,
        name: r.name,
        key: r.key_encrypted ?? r.api_key ?? "",
        is_active: Boolean(r.is_active),
        usage_count: r.usage_count,
        error_count: r.error_count,
        last_used_at: fromMysqlDateTime(r.last_used_at),
        created_at: fromMysqlDateTime(r.created_at)
      })),
      kvMap: {}
    };
    for (const kv of kvRows) {
      const keyName = kv?.kv_key ?? kv?.setting_key;
      const rawValue = kv?.kv_value ?? kv?.setting_value;
      if (!keyName || typeof keyName !== "string") continue;
      if (keyName.startsWith("baileys_auth_") || keyName.startsWith("wa_lease_")) continue;
      if (rawValue === void 0 || rawValue === null) continue;
      try {
        const raw = keyName === "systemConfig" ? decryptData(String(rawValue)) : String(rawValue);
        if (!raw) continue;
        const parsed = JSON.parse(raw);
        remoteData[keyName] = parsed;
        remoteData.kvMap[keyName] = parsed;
      } catch {
      }
    }
    return remoteData;
  } catch (err) {
    console.warn("[MySQL Pull] failed:", err?.message);
    return null;
  }
}
async function testMysqlConnection(configOverride) {
  const cfg = getEffectiveMysqlConfig(configOverride);
  const missingFields = [];
  if (!cfg.host) missingFields.push("Host");
  if (!cfg.user) missingFields.push("User DB");
  if (!cfg.database) missingFields.push("Nama Database");
  if (missingFields.length > 0) {
    const missingText = missingFields.join(", ");
    return {
      connected: false,
      host: cfg.host || "",
      port: cfg.port,
      database: cfg.database || "",
      ssl_enabled: cfg.ssl,
      error_code: "MISSING_CONFIG",
      error_detail: `Field wajib belum diisi: ${missingText}.`,
      hint: `Lengkapi ${missingText} melalui Environment Variables / Secrets server (MYSQL_HOST, MYSQL_PORT, MYSQL_USER, MYSQL_PASSWORD, MYSQL_DATABASE) atau isi form Database Cloud Online lalu klik "Tes Hubungkan".`,
      message: `Konfigurasi MySQL belum lengkap (${missingText} kosong). Sistem berjalan menggunakan penyimpanan lokal aman.`,
      checked_at: (/* @__PURE__ */ new Date()).toISOString()
    };
  }
  if (/^\d+$/.test(cfg.host)) {
    return {
      connected: false,
      host: cfg.host,
      port: cfg.port,
      database: cfg.database,
      ssl_enabled: cfg.ssl,
      error_code: "INVALID_HOST_PORT_MIXUP",
      error_detail: `Nilai MYSQL_HOST terbaca "${cfg.host}" (hanya angka seperti nomor port, bukan alamat IP atau hostname).`,
      hint: `Isi MYSQL_HOST dengan alamat IP server (contoh: 195.88.211.190) atau domain database Anda, dan pastikan angka ${cfg.host} hanya diletakkan di MYSQL_PORT.`,
      message: `Konfigurasi MYSQL_HOST tidak valid ("${cfg.host}" terlihat seperti nomor port).`,
      checked_at: (/* @__PURE__ */ new Date()).toISOString()
    };
  }
  let tempConn = null;
  try {
    const connOptions = {
      host: cfg.host,
      port: cfg.port,
      user: cfg.user,
      password: cfg.password,
      database: cfg.database,
      connectTimeout: 6e3
    };
    if (cfg.ssl) {
      connOptions.ssl = {
        rejectUnauthorized: process.env.MYSQL_SSL_REJECT_UNAUTHORIZED !== "false"
      };
    }
    tempConn = await mysql.createConnection(connOptions);
    const [rows] = await tempConn.query(`SELECT VERSION() AS version`);
    const version = rows[0]?.version || "MySQL Online";
    return {
      connected: true,
      host: cfg.host,
      port: cfg.port,
      database: cfg.database,
      version,
      ssl_enabled: cfg.ssl,
      message: `Terhubung ke MySQL Server (${version}) di ${cfg.host}:${cfg.port}/${cfg.database}`,
      checked_at: (/* @__PURE__ */ new Date()).toISOString()
    };
  } catch (err) {
    const diag = formatMysqlErrorDiagnostic(err, cfg);
    return {
      connected: false,
      host: cfg.host,
      port: cfg.port,
      database: cfg.database,
      ssl_enabled: cfg.ssl,
      error_code: diag.code,
      error_detail: diag.detail,
      hint: diag.hint,
      message: `Koneksi MySQL gagal [${diag.code}]: ${diag.detail}`,
      checked_at: (/* @__PURE__ */ new Date()).toISOString()
    };
  } finally {
    if (tempConn) await tempConn.end().catch(() => {
    });
  }
}
async function syncPushStructureAndData(configOverride) {
  const logs = [];
  const cfg = getEffectiveMysqlConfig(configOverride);
  if (!cfg.host || !cfg.user || !cfg.database) {
    return {
      success: false,
      message: "Host, User, dan Database MySQL wajib diisi sebelum sinkronisasi.",
      logs: ["\u2717 Konfigurasi MySQL belum lengkap (Host / User / Database kosong)."]
    };
  }
  try {
    isSchemaInitialized = false;
    const ok = await initMysqlSchemaIfNotExists(configOverride);
    if (!ok) {
      const errMsg = lastSchemaInitError ? `[${lastSchemaInitError.code}] ${lastSchemaInitError.detail}` : "Koneksi atau pembuatan skema tabel gagal.";
      logs.push(`\u2717 Gagal membuat struktur tabel MySQL: ${errMsg}`);
      if (lastSchemaInitError?.hint) {
        logs.push(`\u2139 Saran: ${lastSchemaInitError.hint}`);
      }
      return {
        success: false,
        message: `Tidak dapat menginisialisasi tabel MySQL: ${errMsg}`,
        logs
      };
    }
    logs.push(`\u2713 Struktur tabel MySQL berhasil dibuat / diverifikasi (${cfg.host}:${cfg.port}/${cfg.database}).`);
    const db = initDbFile();
    let countUsers = 0;
    for (const u of db.users || []) {
      await pushUserToMysql(u);
      countUsers++;
    }
    logs.push(`\u2713 ${countUsers} akun pengguna disinkronkan.`);
    let countRules = 0;
    for (const r of db.rules || []) {
      await pushRuleToMysql(r);
      countRules++;
    }
    logs.push(`\u2713 ${countRules} aturan balasan otomatis disinkronkan.`);
    let countSess = 0;
    for (const s of db.sessions || []) {
      await pushSessionToMysql(s);
      countSess++;
    }
    logs.push(`\u2713 ${countSess} sesi WhatsApp disinkronkan.`);
    let countSmtp = 0;
    for (const s of db.smtpAccounts || []) {
      await pushSmtpAccountToMysql(s);
      countSmtp++;
    }
    logs.push(`\u2713 ${countSmtp} akun SMTP disinkronkan.`);
    await pushKvSettingToMysql("plans", db.plans);
    await pushKvSettingToMysql("antiBan", db.antiBan);
    await pushKvSettingToMysql("qris", db.systemConfig?.qris_config || {});
    await pushKvSettingToMysql("systemConfig", db.systemConfig);
    await pushKvSettingToMysql("stats", db.stats);
    await pushKvSettingToMysql("broadcastHistory", db.broadcastHistory || []);
    await pushKvSettingToMysql("catalogProducts", db.catalogProducts || []);
    await pushKvSettingToMysql("catalogSettings", db.catalogSettings || {});
    await pushKvSettingToMysql("superadminWaQueue", db.superadminWaQueue || []);
    await pushKvSettingToMysql("expiredSessionAlertKeys", db.expiredSessionAlertKeys || {});
    await pushKvSettingToMysql("pendingSessionExpiryAlerts", db.pendingSessionExpiryAlerts || []);
    await pushKvSettingToMysql("handledIncomingMessages", db.handledIncomingMessages || {});
    await pushKvSettingToMysql("chatReplyWatermark", db.chatReplyWatermark || {});
    await pushKvSettingToMysql("pendingMissedMessages", db.pendingMissedMessages || []);
    logs.push("\u2713 Konfigurasi paket, anti-ban, QRIS, katalog Mini Shop, antrean pemulihan pesan, dan pengaturan sistem disinkronkan.");
    return {
      success: true,
      message: "Struktur tabel & seluruh data berhasil disinkronkan ke MySQL!",
      logs
    };
  } catch (err) {
    const diag = formatMysqlErrorDiagnostic(err, cfg);
    logs.push(`\u2717 Error sinkronisasi [${diag.code}]: ${diag.detail}`);
    logs.push(`\u2139 Saran: ${diag.hint}`);
    return {
      success: false,
      message: `Gagal sinkronisasi ke MySQL [${diag.code}]: ${diag.detail}`,
      logs
    };
  }
}
async function upsertAppNodeHeartbeatToMysql(params) {
  if (!isMysqlConfigured()) return;
  const appId = normalizeAppId(params.app_id);
  if (!appId) return;
  try {
    const ok = await initMysqlSchemaIfNotExists();
    if (!ok) return;
    const p = getMysqlPool();
    if (!p) return;
    const nowIso = (/* @__PURE__ */ new Date()).toISOString();
    const maxConn = Math.min(1e4, Math.max(1, Math.floor(Number(params.max_connections) || 10)));
    await p.query(
      `INSERT INTO app_nodes (
         app_id, name, max_connections, is_active, active_connections, connecting_connections,
         hostname, domain, server_ip, last_heartbeat_at, updated_at
       )
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         active_connections = VALUES(active_connections),
         connecting_connections = VALUES(connecting_connections),
         hostname = VALUES(hostname),
         domain = VALUES(domain),
         server_ip = VALUES(server_ip),
         last_heartbeat_at = VALUES(last_heartbeat_at),
         updated_at = VALUES(updated_at)`,
      [
        appId,
        String(params.name || appId).slice(0, 120),
        maxConn,
        params.is_active !== false ? 1 : 0,
        Math.max(0, Math.floor(Number(params.active_connections) || 0)),
        Math.max(0, Math.floor(Number(params.connecting_connections) || 0)),
        String(params.hostname || "").slice(0, 150),
        String(params.domain || "").slice(0, 190),
        String(params.server_ip || "").slice(0, 100),
        nowIso,
        nowIso
      ]
    );
  } catch {
  }
}
async function syncConfiguredAppNodesToMysql(nodes) {
  if (!isMysqlConfigured()) return;
  try {
    const ok = await initMysqlSchemaIfNotExists();
    if (!ok) return;
    const p = getMysqlPool();
    if (!p) return;
    const nowIso = (/* @__PURE__ */ new Date()).toISOString();
    const validIds = [];
    for (const node of nodes) {
      const appId = normalizeAppId(node.app_id);
      if (!appId) continue;
      validIds.push(appId);
      const maxConn = Math.min(1e4, Math.max(1, Math.floor(Number(node.max_connections) || 10)));
      await p.query(
        `INSERT INTO app_nodes (
           app_id, name, max_connections, is_active, active_connections, connecting_connections, updated_at
         )
         VALUES (?, ?, ?, ?, 0, 0, ?)
         ON DUPLICATE KEY UPDATE
           name = VALUES(name),
           max_connections = VALUES(max_connections),
           is_active = VALUES(is_active),
           updated_at = VALUES(updated_at)`,
        [appId, String(node.name || appId).slice(0, 120), maxConn, node.is_active !== false ? 1 : 0, nowIso]
      );
    }
    if (validIds.length > 0) {
      const placeholders = validIds.map(() => "?").join(", ");
      await p.query(`DELETE FROM app_nodes WHERE app_id NOT IN (${placeholders})`, validIds);
    } else {
      await p.query(`DELETE FROM app_nodes`);
    }
  } catch {
  }
}
async function deleteAppNodeFromMysql(appIdRaw) {
  if (!isMysqlConfigured()) return;
  const appId = normalizeAppId(appIdRaw);
  if (!appId) return;
  try {
    const p = getMysqlPool();
    if (!p) return;
    await p.query(`DELETE FROM app_nodes WHERE app_id = ?`, [appId]);
  } catch {
  }
}
async function fetchAllAppNodesFromMysql() {
  if (!isMysqlConfigured()) return [];
  try {
    const ok = await initMysqlSchemaIfNotExists();
    if (!ok) return [];
    const p = getMysqlPool();
    if (!p) return [];
    const [rows] = await p.query(`SELECT * FROM app_nodes ORDER BY app_id ASC`);
    const now = Date.now();
    return (rows || []).map((r) => {
      const lastHb = r.last_heartbeat_at ? String(r.last_heartbeat_at) : "";
      const hbMs = lastHb ? Date.parse(lastHb) : 0;
      const online = Boolean(hbMs && now - hbMs < 180 * 1e3);
      return {
        app_id: normalizeAppId(r.app_id) || String(r.app_id),
        name: r.name ? String(r.name) : void 0,
        max_connections: Math.max(1, Number(r.max_connections) || 10),
        is_active: Boolean(r.is_active),
        active_connections: Math.max(0, Number(r.active_connections) || 0),
        connecting_connections: Math.max(0, Number(r.connecting_connections) || 0),
        hostname: r.hostname ? String(r.hostname) : void 0,
        domain: r.domain ? String(r.domain) : void 0,
        server_ip: r.server_ip ? String(r.server_ip) : void 0,
        last_heartbeat_at: lastHb || void 0,
        updated_at: r.updated_at ? String(r.updated_at) : void 0,
        online
      };
    });
  } catch {
    return [];
  }
}
async function saveWaSessionConflictToMysql(sessionId, detail) {
  if (!isMysqlConfigured() || !sessionId || !detail) return;
  try {
    const ok = await initMysqlSchemaIfNotExists();
    if (!ok) return;
    const p = getMysqlPool();
    if (!p) return;
    const { kvKeyCol, kvValCol } = detectedSchemaMeta;
    const payload = encryptData(JSON.stringify({ sessionId, detail, updatedAt: Date.now() }));
    await p.query(
      `INSERT INTO app_kv_store (${kvKeyCol}, ${kvValCol}, updated_at)
       VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE
         ${kvValCol} = VALUES(${kvValCol}),
         updated_at = VALUES(updated_at)`,
      [`wa_conflict_sid_${sessionId}`, payload, toMysqlDateTime(/* @__PURE__ */ new Date(), false)]
    );
  } catch {
  }
}
async function deleteWaSessionConflictFromMysql(sessionId) {
  if (!isMysqlConfigured() || !sessionId) return;
  try {
    const ok = await initMysqlSchemaIfNotExists();
    if (!ok) return;
    const p = getMysqlPool();
    if (!p) return;
    const { kvKeyCol } = detectedSchemaMeta;
    await p.query(`DELETE FROM app_kv_store WHERE ${kvKeyCol} = ?`, [`wa_conflict_sid_${sessionId}`]);
  } catch {
  }
}
async function fetchAllWaSessionConflictsFromMysql() {
  const out = {};
  if (!isMysqlConfigured()) return out;
  try {
    const ok = await initMysqlSchemaIfNotExists();
    if (!ok) return out;
    const p = getMysqlPool();
    if (!p) return out;
    const { kvKeyCol, kvValCol } = detectedSchemaMeta;
    const [rows] = await p.query(
      `SELECT ${kvKeyCol} AS kv_key, ${kvValCol} AS kv_value FROM app_kv_store WHERE ${kvKeyCol} LIKE 'wa_conflict_sid_%'`
    );
    for (const row of rows || []) {
      if (!row?.kv_key || !row?.kv_value) continue;
      const sid = String(row.kv_key).replace(/^wa_conflict_sid_/, "");
      try {
        const parsed = JSON.parse(decryptData(String(row.kv_value)));
        if (parsed?.detail && typeof parsed.detail === "object") {
          out[sid] = parsed.detail;
        }
      } catch {
      }
    }
  } catch {
  }
  return out;
}
async function fetchAllWaSessionLeasesFromMysql() {
  const out = {};
  if (!isMysqlConfigured()) return out;
  try {
    const ok = await initMysqlSchemaIfNotExists();
    if (!ok) return out;
    const p = getMysqlPool();
    if (!p) return out;
    const { kvKeyCol, kvValCol } = detectedSchemaMeta;
    const [rows] = await p.query(
      `SELECT ${kvKeyCol} AS kv_key, ${kvValCol} AS kv_value FROM app_kv_store WHERE ${kvKeyCol} LIKE 'wa_lease_sid_%'`
    );
    for (const row of rows || []) {
      if (!row?.kv_key || !row?.kv_value) continue;
      const sid = String(row.kv_key).replace(/^wa_lease_sid_/, "");
      try {
        const parsed = JSON.parse(decryptData(String(row.kv_value)));
        if (parsed?.session_id && parsed?.instance_id) {
          out[sid] = parsed;
        }
      } catch {
      }
    }
  } catch {
  }
  return out;
}
async function updateSessionAssignmentInMysql(sessionId, patch) {
  if (!isMysqlConfigured() || !sessionId) return;
  try {
    const ok = await initMysqlSchemaIfNotExists();
    if (!ok || !detectedSchemaMeta.sessionsHasAssignmentCols) return;
    const p = getMysqlPool();
    if (!p) return;
    const sets = [];
    const params = [];
    if (patch.assigned_app_id !== void 0) {
      sets.push("assigned_app_id = ?");
      params.push(normalizeAppId(patch.assigned_app_id) || "");
    }
    if (patch.assigned_server_ip !== void 0 && detectedSchemaMeta.sessionsHasServerIpCols) {
      sets.push("assigned_server_ip = ?");
      params.push(String(patch.assigned_server_ip || "").trim().slice(0, 64));
    }
    if (patch.connected_app_id !== void 0) {
      sets.push("connected_app_id = ?");
      params.push(normalizeAppId(patch.connected_app_id) || "");
    }
    if (patch.connected_server_ip !== void 0 && detectedSchemaMeta.sessionsHasServerIpCols) {
      sets.push("connected_server_ip = ?");
      params.push(String(patch.connected_server_ip || "").trim().slice(0, 64));
    }
    if (patch.failed_app_ids !== void 0) {
      sets.push("failed_app_ids = ?");
      params.push(JSON.stringify(patch.failed_app_ids.map(normalizeAppId).filter(Boolean)));
    }
    if (patch.assignment_status !== void 0) {
      sets.push("assignment_status = ?");
      params.push(String(patch.assignment_status || "idle").slice(0, 32));
    }
    if (patch.assignment_error !== void 0) {
      sets.push("assignment_error = ?");
      params.push(String(patch.assignment_error || "").slice(0, 1e3));
    }
    if (patch.last_assignment_at !== void 0) {
      sets.push("last_assignment_at = ?");
      params.push(String(patch.last_assignment_at || "").slice(0, 50));
    }
    if (patch.status !== void 0) {
      sets.push("status = ?");
      params.push(patch.status);
    }
    if (sets.length === 0) return;
    sets.push("updated_at = ?");
    params.push(toMysqlDateTime(/* @__PURE__ */ new Date(), false));
    params.push(sessionId);
    await p.query(
      `UPDATE whatsapp_sessions SET ${sets.join(", ")} WHERE id = ?`,
      params
    );
  } catch (e) {
    console.warn("[MySQL Assignment Update] skipped:", e?.message);
  }
}
function mapSocketRow(r, nowMs) {
  let parsedIps = [];
  try {
    if (r.all_ips) {
      const arr = JSON.parse(String(r.all_ips));
      if (Array.isArray(arr)) parsedIps = arr.map((x) => String(x || "").trim()).filter(Boolean);
    }
  } catch {
  }
  let parsedSids = [];
  try {
    if (r.active_session_ids) {
      const arr = JSON.parse(String(r.active_session_ids));
      if (Array.isArray(arr)) parsedSids = arr.map((x) => String(x || "").trim()).filter(Boolean);
    }
  } catch {
  }
  let parsedPhones = [];
  try {
    if (r.active_phones) {
      const arr = JSON.parse(String(r.active_phones));
      if (Array.isArray(arr)) parsedPhones = arr.map((x) => String(x || "").trim()).filter(Boolean);
    }
  } catch {
  }
  const lastHb = r.last_heartbeat_at ? String(r.last_heartbeat_at) : "";
  const hbMs = lastHb ? Date.parse(lastHb) : 0;
  const rawStatus = String(r.status || "active");
  const status = rawStatus === "killed" || rawStatus === "shutting_down" || rawStatus === "offline" ? rawStatus : "active";
  const online = status === "active" && Boolean(hbMs && nowMs - hbMs < 180 * 1e3);
  const effectiveStatus = status === "active" && !online && hbMs ? "offline" : status;
  const rawAppId = typeof r.app_id === "string" ? r.app_id.trim() : "";
  return {
    instance_id: String(r.instance_id || ""),
    app_id: rawAppId || "undefined",
    server_ip: String(r.server_ip || r.primary_ip || ""),
    primary_ip: String(r.primary_ip || ""),
    all_ips: parsedIps,
    domain: r.domain ? String(r.domain) : void 0,
    hostname: r.hostname ? String(r.hostname) : void 0,
    pid: Number(r.pid) || 0,
    status: effectiveStatus,
    active_connections: Math.max(0, Number(r.active_connections) || 0),
    connecting_connections: Math.max(0, Number(r.connecting_connections) || 0),
    active_session_ids: parsedSids,
    active_phones: parsedPhones,
    started_at: r.started_at ? String(r.started_at) : "",
    last_heartbeat_at: lastHb,
    kill_reason: r.kill_reason ? String(r.kill_reason) : void 0,
    killed_at: r.killed_at ? String(r.killed_at) : void 0,
    online
  };
}
async function upsertActiveSocketToMysql(record) {
  if (!isMysqlConfigured() || !record?.instance_id) return;
  try {
    const ok = await initMysqlSchemaIfNotExists();
    if (!ok) return;
    const p = getMysqlPool();
    if (!p) return;
    const nowIso = (/* @__PURE__ */ new Date()).toISOString();
    const displayAppId = normalizeAppId(record.app_id) || "undefined";
    await p.query(
      `INSERT INTO app_sockets (
         instance_id, app_id, server_ip, primary_ip, all_ips, domain, hostname, pid,
         status, active_connections, connecting_connections, active_session_ids, active_phones,
         started_at, last_heartbeat_at, kill_reason, killed_at, updated_at
       )
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         app_id = VALUES(app_id),
         server_ip = VALUES(server_ip),
         primary_ip = VALUES(primary_ip),
         all_ips = VALUES(all_ips),
         domain = VALUES(domain),
         hostname = VALUES(hostname),
         pid = VALUES(pid),
         status = VALUES(status),
         active_connections = VALUES(active_connections),
         connecting_connections = VALUES(connecting_connections),
         active_session_ids = VALUES(active_session_ids),
         active_phones = VALUES(active_phones),
         last_heartbeat_at = VALUES(last_heartbeat_at),
         kill_reason = VALUES(kill_reason),
         killed_at = VALUES(killed_at),
         updated_at = VALUES(updated_at)`,
      [
        record.instance_id.slice(0, 64),
        displayAppId.slice(0, 64),
        String(record.server_ip || "").slice(0, 120),
        String(record.primary_ip || "").slice(0, 64),
        JSON.stringify(Array.isArray(record.all_ips) ? record.all_ips.slice(0, 20) : []),
        String(record.domain || "").slice(0, 190),
        String(record.hostname || "").slice(0, 150),
        Math.max(0, Math.floor(Number(record.pid) || 0)),
        record.status,
        Math.max(0, Math.floor(Number(record.active_connections) || 0)),
        Math.max(0, Math.floor(Number(record.connecting_connections) || 0)),
        JSON.stringify(Array.isArray(record.active_session_ids) ? record.active_session_ids.slice(0, 200) : []),
        JSON.stringify(Array.isArray(record.active_phones) ? record.active_phones.slice(0, 200) : []),
        String(record.started_at || nowIso).slice(0, 50),
        String(record.last_heartbeat_at || nowIso).slice(0, 50),
        record.kill_reason ? String(record.kill_reason).slice(0, 500) : "",
        record.killed_at ? String(record.killed_at).slice(0, 50) : "",
        nowIso
      ]
    );
  } catch {
  }
}
async function markActiveSocketKilledInMysql(instanceId, reason) {
  if (!isMysqlConfigured() || !instanceId) return;
  try {
    const ok = await initMysqlSchemaIfNotExists();
    if (!ok) return;
    const p = getMysqlPool();
    if (!p) return;
    const nowIso = (/* @__PURE__ */ new Date()).toISOString();
    await p.query(
      `UPDATE app_sockets
       SET status = 'killed',
           active_connections = 0,
           connecting_connections = 0,
           active_session_ids = '[]',
           active_phones = '[]',
           kill_reason = ?,
           killed_at = ?,
           updated_at = ?
       WHERE instance_id = ?`,
      [String(reason || "Dimatikan oleh Admin").slice(0, 500), nowIso, nowIso, instanceId]
    );
  } catch {
  }
}
async function unkillSocketsByIpInMysql(ip) {
  if (!isMysqlConfigured() || !ip) return 0;
  const cleanIp = String(ip).trim();
  if (!cleanIp) return 0;
  try {
    const ok = await initMysqlSchemaIfNotExists();
    if (!ok) return 0;
    const p = getMysqlPool();
    if (!p) return 0;
    const nowIso = (/* @__PURE__ */ new Date()).toISOString();
    const [result] = await p.query(
      `UPDATE app_sockets
       SET status = 'offline',
           kill_reason = '',
           killed_at = '',
           updated_at = ?
       WHERE status = 'killed'
         AND (primary_ip = ? OR server_ip = ? OR server_ip LIKE ? OR all_ips LIKE ?)`,
      [nowIso, cleanIp, cleanIp, `${cleanIp} (%`, `%"${cleanIp}"%`]
    );
    return Number(result?.affectedRows || 0);
  } catch {
    return 0;
  }
}
async function claimDeadAppFailoverInMysql(deadAppId, claimerAppId, cooldownMs = 12e4) {
  if (!isMysqlConfigured() || !deadAppId) return true;
  try {
    const ok = await initMysqlSchemaIfNotExists();
    if (!ok) return true;
    const p = getMysqlPool();
    if (!p) return true;
    const { kvKeyCol, kvValCol } = detectedSchemaMeta;
    const key = `cluster_failover_guard_${deadAppId}`.slice(0, 180);
    const [rows] = await p.query(
      `SELECT ${kvValCol} AS kv_value FROM app_kv_store WHERE ${kvKeyCol} = ? LIMIT 1`,
      [key]
    );
    const now = Date.now();
    const rawVal = rows?.[0]?.kv_value;
    if (rawVal) {
      try {
        const parsed = JSON.parse(String(rawVal));
        const prevAt = Number(parsed?.at || 0);
        if (prevAt && now - prevAt < cooldownMs) {
          return false;
        }
      } catch {
      }
    }
    const payload = JSON.stringify({
      claimed_by: claimerAppId,
      at: now,
      iso: new Date(now).toISOString()
    });
    await p.query(
      `INSERT INTO app_kv_store (${kvKeyCol}, ${kvValCol}, updated_at)
       VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE
         ${kvValCol} = VALUES(${kvValCol}),
         updated_at = VALUES(updated_at)`,
      [key, payload, toMysqlDateTime(new Date(now), false)]
    );
    return true;
  } catch {
    return true;
  }
}
async function clearDeadAppFailoverClaimInMysql(deadAppId) {
  if (!isMysqlConfigured() || !deadAppId) return;
  try {
    const ok = await initMysqlSchemaIfNotExists();
    if (!ok) return;
    const p = getMysqlPool();
    if (!p) return;
    const { kvKeyCol } = detectedSchemaMeta;
    await p.query(`DELETE FROM app_kv_store WHERE ${kvKeyCol} = ?`, [`cluster_failover_guard_${deadAppId}`.slice(0, 180)]);
  } catch {
  }
}
async function fetchAllActiveSocketsFromMysql() {
  if (!isMysqlConfigured()) return [];
  try {
    const ok = await initMysqlSchemaIfNotExists();
    if (!ok) return [];
    const p = getMysqlPool();
    if (!p) return [];
    const [rows] = await p.query(
      `SELECT * FROM app_sockets ORDER BY last_heartbeat_at DESC`
    );
    const now = Date.now();
    return (rows || []).map((r) => mapSocketRow(r, now));
  } catch {
    return [];
  }
}
async function fetchLiveClusterSnapshotFromMysql() {
  if (!isMysqlConfigured()) return null;
  try {
    const ok = await initMysqlSchemaIfNotExists();
    if (!ok) return null;
    const p = getMysqlPool();
    if (!p) return null;
    const { kvKeyCol, kvValCol } = detectedSchemaMeta;
    const [sessRows] = await p.query(`SELECT * FROM whatsapp_sessions`);
    const [userAppRows] = detectedSchemaMeta.usersHasAssignedAppId ? await p.query(`SELECT id, assigned_app_id FROM app_users`).catch(() => [[]]) : [[]];
    const [nodeRows] = await p.query(`SELECT * FROM app_nodes ORDER BY app_id ASC`).catch(() => [[]]);
    const [socketRows] = await p.query(`SELECT * FROM app_sockets ORDER BY last_heartbeat_at DESC`).catch(() => [[]]);
    const [kvRows] = await p.query(
      `SELECT ${kvKeyCol} AS kv_key, ${kvValCol} AS kv_value FROM app_kv_store
       WHERE ${kvKeyCol} IN ('systemConfig', 'superadminWaQueue')
          OR ${kvKeyCol} LIKE 'wa_conflict_sid_%'
          OR ${kvKeyCol} LIKE 'wa_lease_sid_%'`
    );
    const usersAppMap = {};
    for (const ur of userAppRows || []) {
      if (ur?.id) {
        usersAppMap[String(ur.id)] = normalizeAppId(ur.assigned_app_id) || "";
      }
    }
    const sessions = (sessRows || []).map((r) => {
      let parsedFailedApps = [];
      try {
        if (r.failed_app_ids) {
          const arr = JSON.parse(String(r.failed_app_ids));
          if (Array.isArray(arr)) parsedFailedApps = arr.map((x) => normalizeAppId(x)).filter(Boolean);
        }
      } catch {
      }
      return {
        ...r,
        auth_method: r.auth_method === "pairing_code" ? "pairing_code" : "qr_code",
        is_primary: Boolean(r.is_primary),
        ai_enabled: r.ai_enabled === null || r.ai_enabled === void 0 ? null : Boolean(r.ai_enabled),
        custom_system_prompt: typeof r.custom_system_prompt === "string" ? r.custom_system_prompt : "",
        assigned_app_id: normalizeAppId(r.assigned_app_id) || void 0,
        assigned_server_ip: typeof r.assigned_server_ip === "string" && r.assigned_server_ip.trim() ? r.assigned_server_ip.trim() : void 0,
        connected_app_id: normalizeAppId(r.connected_app_id) || void 0,
        connected_server_ip: typeof r.connected_server_ip === "string" && r.connected_server_ip.trim() ? r.connected_server_ip.trim() : void 0,
        failed_app_ids: parsedFailedApps,
        assignment_status: r.assignment_status || void 0,
        assignment_error: typeof r.assignment_error === "string" && r.assignment_error ? r.assignment_error : void 0,
        last_assignment_at: r.last_assignment_at ? String(r.last_assignment_at) : void 0,
        connected_at: fromMysqlDateTime(r.connected_at),
        last_activity_at: fromMysqlDateTime(r.last_activity_at),
        total_messages_count: Number(r.total_messages_count) || 0,
        expires_at: fromMysqlDateTime(r.expires_at),
        created_at: fromMysqlDateTime(r.created_at),
        updated_at: fromMysqlDateTime(r.updated_at)
      };
    });
    const now = Date.now();
    const nodes = (nodeRows || []).map((r) => {
      const lastHb = r.last_heartbeat_at ? String(r.last_heartbeat_at) : "";
      const hbMs = lastHb ? Date.parse(lastHb) : 0;
      return {
        app_id: normalizeAppId(r.app_id) || String(r.app_id),
        name: r.name ? String(r.name) : void 0,
        max_connections: Math.max(1, Number(r.max_connections) || 10),
        is_active: Boolean(r.is_active),
        active_connections: Math.max(0, Number(r.active_connections) || 0),
        connecting_connections: Math.max(0, Number(r.connecting_connections) || 0),
        hostname: r.hostname ? String(r.hostname) : void 0,
        domain: r.domain ? String(r.domain) : void 0,
        server_ip: r.server_ip ? String(r.server_ip) : void 0,
        last_heartbeat_at: lastHb || void 0,
        updated_at: r.updated_at ? String(r.updated_at) : void 0,
        online: Boolean(hbMs && now - hbMs < 180 * 1e3)
      };
    });
    const sockets = (socketRows || []).map((r) => mapSocketRow(r, now));
    let systemConfig = null;
    let superadminWaQueue = null;
    const conflicts = {};
    const leases = {};
    for (const kv of kvRows || []) {
      const k = String(kv?.kv_key || "");
      const v = kv?.kv_value;
      if (!k || v === void 0 || v === null) continue;
      try {
        if (k === "systemConfig") {
          systemConfig = JSON.parse(decryptData(String(v)));
        } else if (k === "superadminWaQueue") {
          const parsedQ = JSON.parse(String(v));
          if (Array.isArray(parsedQ)) superadminWaQueue = parsedQ;
        } else if (k.startsWith("wa_conflict_sid_")) {
          const sid = k.slice("wa_conflict_sid_".length);
          const parsedC = JSON.parse(decryptData(String(v)));
          if (parsedC?.detail) conflicts[sid] = parsedC.detail;
        } else if (k.startsWith("wa_lease_sid_")) {
          const sid = k.slice("wa_lease_sid_".length);
          const parsedL = JSON.parse(decryptData(String(v)));
          if (parsedL?.session_id && parsedL?.instance_id) leases[sid] = parsedL;
        }
      } catch {
      }
    }
    return { sessions, usersAppMap, nodes, sockets, systemConfig, conflicts, leases, superadminWaQueue };
  } catch {
    return null;
  }
}
var pool, currentPoolSignature, isSchemaInitialized, lastSchemaInitError, detectedSchemaMeta;
var init_mysqlService = __esm({
  "src/lib/mysqlService.ts"() {
    init_security();
    init_db();
    pool = null;
    currentPoolSignature = "";
    isSchemaInitialized = false;
    lastSchemaInitError = null;
    detectedSchemaMeta = {
      kvKeyCol: "kv_key",
      kvValCol: "kv_value",
      smtpUserCol: "user_email",
      smtpPassCol: "pass_encrypted",
      smtpHasLastError: true,
      geminiKeyCol: "key_encrypted",
      hasWhatsappMessagesTable: false,
      sessionsHasAiEnabled: false,
      sessionsHasCustomPrompt: false,
      sessionsHasConnectedAt: false,
      sessionsHasLastActivityAt: false,
      sessionsHasTotalMessagesCount: false,
      sessionsHasAssignmentCols: false,
      sessionsHasServerIpCols: false,
      usersHasTotalMessagesCount: false,
      usersHasAssignedAppId: false
    };
  }
});

// src/lib/db.ts
import crypto2 from "crypto";
import fs2 from "fs";
import net from "net";
import path2 from "path";
function syncDbFileMtimeMarker() {
  try {
    const st = fs2.statSync(RUNTIME_DB_PATH);
    lastLoadedDbMtimeMs = st.mtimeMs;
    lastDiskStatCheckedAt = Date.now();
  } catch {
  }
}
function loadEncryptedLocalDb() {
  if (process.env.JAPRIIN_EPHEMERAL_DB === "1") return null;
  try {
    if (!fs2.existsSync(RUNTIME_DB_PATH)) return null;
    const raw = fs2.readFileSync(RUNTIME_DB_PATH, "utf8").trim();
    if (!raw) return null;
    const decrypted = decryptData(raw);
    if (!decrypted) return null;
    const parsed = JSON.parse(decrypted);
    if (!parsed || typeof parsed !== "object" || !Array.isArray(parsed.users)) {
      return null;
    }
    return {
      messages: Array.isArray(parsed.messages) ? parsed.messages : [],
      broadcastHistory: Array.isArray(parsed.broadcastHistory) ? parsed.broadcastHistory : [],
      rules: Array.isArray(parsed.rules) ? parsed.rules : [],
      sessions: Array.isArray(parsed.sessions) ? parsed.sessions : [],
      antiBan: parsed.antiBan ? { ...DEFAULT_ANTIBAN, ...parsed.antiBan } : DEFAULT_ANTIBAN,
      users: parsed.users.map((u) => ({ ...u, max_sessions: 1 })),
      plans: (Array.isArray(parsed.plans) && parsed.plans.length > 0 ? parsed.plans : DEFAULT_SUBSCRIPTION_PLANS).map(
        normalizeSubscriptionPlan
      ),
      smtpAccounts: Array.isArray(parsed.smtpAccounts) ? parsed.smtpAccounts : [],
      geminiKeys: Array.isArray(parsed.geminiKeys) ? parsed.geminiKeys : [],
      systemConfig: parsed.systemConfig ? {
        ...DEFAULT_SYSTEM_CONFIG,
        ...parsed.systemConfig,
        max_global_sessions: normalizeMaxGlobalSessions(parsed.systemConfig.max_global_sessions) ?? DEFAULT_MAX_GLOBAL_SESSIONS,
        ai_config: { ...DEFAULT_AI_CONFIG, ...parsed.systemConfig.ai_config || {} },
        qris_config: { ...DEFAULT_QRIS_CONFIG, ...parsed.systemConfig.qris_config || {} },
        whitelabel_config: {
          ...DEFAULT_WHITELABEL,
          ...parsed.systemConfig.whitelabel_config || {},
          logo_url: normalizeWhitelabelLogoUrl(parsed.systemConfig.whitelabel_config?.logo_url)
        },
        app_nodes: normalizeAppNodes(parsed.systemConfig.app_nodes),
        kill_target_ips: normalizeKillTargetIps(parsed.systemConfig.kill_target_ips),
        admin_notify_phone: normalizeAdminNotifyPhone(parsed.systemConfig.admin_notify_phone),
        telegram_bot_token: normalizeStoredTelegramToken(parsed.systemConfig.telegram_bot_token),
        telegram_chat_id: normalizeTelegramChatId(parsed.systemConfig.telegram_chat_id),
        telegram_enabled: parsed.systemConfig.telegram_enabled !== void 0 ? Boolean(parsed.systemConfig.telegram_enabled) : true,
        telegram_configs: normalizeTelegramConfigs(parsed.systemConfig.telegram_configs)
      } : DEFAULT_SYSTEM_CONFIG,
      catalogProducts: Array.isArray(parsed.catalogProducts) ? parsed.catalogProducts : [],
      catalogSettings: parsed.catalogSettings && typeof parsed.catalogSettings === "object" ? parsed.catalogSettings : {},
      superadminWaQueue: Array.isArray(parsed.superadminWaQueue) ? parsed.superadminWaQueue : [],
      expiredSessionAlertKeys: parsed.expiredSessionAlertKeys && typeof parsed.expiredSessionAlertKeys === "object" ? parsed.expiredSessionAlertKeys : {},
      pendingSessionExpiryAlerts: Array.isArray(parsed.pendingSessionExpiryAlerts) ? parsed.pendingSessionExpiryAlerts : [],
      handledIncomingMessages: parsed.handledIncomingMessages && typeof parsed.handledIncomingMessages === "object" ? parsed.handledIncomingMessages : {},
      chatReplyWatermark: parsed.chatReplyWatermark && typeof parsed.chatReplyWatermark === "object" ? parsed.chatReplyWatermark : {},
      pendingMissedMessages: Array.isArray(parsed.pendingMissedMessages) ? parsed.pendingMissedMessages : [],
      stats: parsed.stats || {
        total_incoming: 0,
        total_auto_replied: 0,
        total_failed: 0,
        total_ai_replied: 0
      }
    };
  } catch (err) {
    console.warn("[Local DB Load] Failed to decrypt/parse .runtime_db.enc:", err?.message);
    return null;
  }
}
function saveEncryptedLocalDb(data) {
  if (process.env.JAPRIIN_EPHEMERAL_DB === "1") return;
  try {
    const encrypted = encryptData(JSON.stringify(data));
    const tmpPath = `${RUNTIME_DB_PATH}.${process.pid}.tmp`;
    fs2.writeFileSync(tmpPath, encrypted, { mode: 384 });
    fs2.renameSync(tmpPath, RUNTIME_DB_PATH);
    syncDbFileMtimeMarker();
  } catch (err) {
    console.warn("[Local DB Save] Failed to persist .runtime_db.enc:", err?.message);
  }
}
async function saveEncryptedLocalDbAsync(data) {
  if (process.env.JAPRIIN_EPHEMERAL_DB === "1") return;
  if (isPersistingLocalDb) {
    needsAnotherPersist = true;
    return;
  }
  isPersistingLocalDb = true;
  try {
    const encrypted = encryptData(JSON.stringify(data));
    const tmpPath = `${RUNTIME_DB_PATH}.${process.pid}.tmp`;
    await fs2.promises.writeFile(tmpPath, encrypted, { mode: 384 });
    await fs2.promises.rename(tmpPath, RUNTIME_DB_PATH);
    syncDbFileMtimeMarker();
  } catch (err) {
    console.warn("[Local DB Save] Failed to persist .runtime_db.enc:", err?.message);
  } finally {
    isPersistingLocalDb = false;
    if (needsAnotherPersist && cachedMemoryDb) {
      needsAnotherPersist = false;
      saveEncryptedLocalDbAsync(cachedMemoryDb).catch(() => {
      });
    }
  }
}
function markMutated() {
  lastLocalMutationAt = Date.now();
}
function asyncSyncMessage(msg) {
  markMutated();
  Promise.resolve().then(() => (init_mysqlService(), mysqlService_exports)).then((m) => m.pushMessageToMysql(msg)).catch(() => {
  });
}
function asyncSyncSession(sess) {
  markMutated();
  Promise.resolve().then(() => (init_mysqlService(), mysqlService_exports)).then((m) => m.pushSessionToMysql(sess)).catch(() => {
  });
}
function asyncDeleteSession(id, phoneNumber) {
  markMutated();
  Promise.resolve().then(() => (init_mysqlService(), mysqlService_exports)).then((m) => m.deleteSessionFromMysql(id, phoneNumber)).catch(() => {
  });
}
function asyncSyncUser(u) {
  markMutated();
  Promise.resolve().then(() => (init_mysqlService(), mysqlService_exports)).then((m) => m.pushUserToMysql(u)).catch(() => {
  });
}
function asyncSyncKv(key, val) {
  markMutated();
  Promise.resolve().then(() => (init_mysqlService(), mysqlService_exports)).then((m) => m.pushKvSettingToMysql(key, val)).catch(() => {
  });
}
function replaceRuntimeDatabaseFromMysql(remote) {
  const db = initDbFile();
  if (!remote) return;
  if (remote.users && Array.isArray(remote.users) && remote.users.length > 0) {
    const localMap = new Map(db.users.map((u) => [u.id, u]));
    db.users = remote.users.map((ru) => {
      const local = localMap.get(ru.id);
      const emailVerified = Boolean(ru.email_verified) || Boolean(local?.email_verified);
      const waVerified = Boolean(ru.wa_verified) || Boolean(local?.wa_verified);
      const isActive = Boolean(ru.is_active) || Boolean(local?.is_active);
      return {
        ...local,
        ...ru,
        max_sessions: 1,
        wa_verified: waVerified,
        email_verified: emailVerified,
        is_active: isActive,
        plan_status: ru.plan_id === "free" || !ru.plan_id ? "active" : ru.plan_status || local?.plan_status || "active",
        last_login_device: local?.last_login_device || ru.last_login_device,
        assigned_app_id: ru.assigned_app_id !== void 0 ? normalizeAppIdValue(ru.assigned_app_id) || void 0 : normalizeAppIdValue(local?.assigned_app_id) || void 0,
        approved_at: local?.approved_at || ru.approved_at,
        rules_initialized: local?.rules_initialized ?? true
      };
    });
  }
  if (remote.smtpAccounts && Array.isArray(remote.smtpAccounts) && (remote.smtpAccounts.length > 0 || Array.isArray(remote.users) && remote.users.length > 0)) {
    const localSmtpMap = new Map((db.smtpAccounts || []).map((s) => [s.id, s]));
    db.smtpAccounts = remote.smtpAccounts.map((rs) => {
      const local = localSmtpMap.get(rs.id);
      const keepLocalError = !rs.last_error && Boolean(local?.last_error) && rs.pass === local?.pass && (rs.success_count || 0) <= (local?.success_count || 0);
      return {
        ...local,
        ...rs,
        last_error: rs.last_error || (keepLocalError ? local?.last_error : "")
      };
    });
  }
  if (remote.geminiKeys && Array.isArray(remote.geminiKeys) && remote.geminiKeys.length > 0) {
    db.geminiKeys = remote.geminiKeys;
  }
  if (remote.sessions && Array.isArray(remote.sessions) && remote.sessions.length > 0) {
    const localSessMap = new Map(db.sessions.map((s) => [s.id, s]));
    const remoteIds = new Set(remote.sessions.map((rs) => rs.id));
    const mergedSessions = remote.sessions.map((rs) => {
      const local = localSessMap.get(rs.id);
      const resolvedUserId = rs.user_id || local?.user_id || extractUserIdFromSessionId(rs.id, db.users || []);
      const resolvedStatus = local?.status === "connected" ? "connected" : rs.status || local?.status || "disconnected";
      const resolvedAiEnabled = "ai_enabled" in rs && rs.ai_enabled !== void 0 ? rs.ai_enabled === null ? null : Boolean(rs.ai_enabled) : local?.ai_enabled !== void 0 ? local.ai_enabled : null;
      const resolvedCustomPrompt = typeof rs.custom_system_prompt === "string" ? rs.custom_system_prompt : local?.custom_system_prompt || "";
      const resolvedFailedApps = Array.isArray(rs.failed_app_ids) ? rs.failed_app_ids.map((x) => normalizeAppIdValue(x)).filter(Boolean) : Array.isArray(local?.failed_app_ids) ? local.failed_app_ids : [];
      return {
        ...local,
        ...rs,
        user_id: resolvedUserId,
        status: resolvedStatus,
        is_primary: Boolean(rs.is_primary),
        ai_enabled: resolvedAiEnabled,
        custom_system_prompt: resolvedCustomPrompt,
        assigned_app_id: rs.assignment_status === "released" ? void 0 : normalizeAppIdValue(rs.assigned_app_id) || (rs.assigned_app_id === void 0 ? normalizeAppIdValue(local?.assigned_app_id) || void 0 : void 0),
        assigned_server_ip: normalizeServerIpValue(rs.assigned_server_ip) || (rs.assigned_server_ip === void 0 ? normalizeServerIpValue(local?.assigned_server_ip) || void 0 : void 0),
        connected_app_id: rs.assignment_status === "released" ? void 0 : normalizeAppIdValue(rs.connected_app_id) || (rs.connected_app_id === void 0 ? normalizeAppIdValue(local?.connected_app_id) || void 0 : void 0),
        connected_server_ip: rs.assignment_status === "released" ? void 0 : normalizeServerIpValue(rs.connected_server_ip) || (rs.connected_server_ip === void 0 ? normalizeServerIpValue(local?.connected_server_ip) || void 0 : void 0),
        failed_app_ids: resolvedFailedApps,
        assignment_status: rs.assignment_status || local?.assignment_status,
        assignment_error: rs.assignment_error !== void 0 ? rs.assignment_error : local?.assignment_error,
        last_assignment_at: rs.last_assignment_at || local?.last_assignment_at,
        connected_at: rs.connected_at || local?.connected_at || (resolvedStatus === "connected" ? (/* @__PURE__ */ new Date()).toISOString() : void 0),
        expires_at: rs.expires_at || local?.expires_at || new Date(Date.now() + 30 * 24 * 60 * 60 * 1e3).toISOString()
      };
    });
    for (const localSess of db.sessions) {
      if (localSess.id && !remoteIds.has(localSess.id) && (localSess.status === "connected" || Boolean(localSess.connected_at))) {
        mergedSessions.push(localSess);
      }
    }
    db.sessions = mergedSessions;
  }
  if (remote.rules && Array.isArray(remote.rules) && remote.rules.length > 0) {
    const localRuleMap = new Map(db.rules.map((r) => [r.id, r]));
    db.rules = remote.rules.map((rr) => {
      const local = localRuleMap.get(rr.id);
      let resolvedUserId = rr.user_id || local?.user_id;
      if (!resolvedUserId && typeof rr?.id === "string" && rr.id.startsWith("rule_halo_")) {
        resolvedUserId = rr.id.replace("rule_halo_", "");
      }
      return {
        ...local,
        ...rr,
        user_id: resolvedUserId || "user_superadmin",
        is_active: Boolean(rr.is_active)
      };
    });
  }
  if (remote.messages && Array.isArray(remote.messages) && remote.messages.length > 0) {
    db.messages = remote.messages;
  }
  if (remote.kvMap) {
    if (remote.kvMap.systemConfig) {
      db.systemConfig = {
        ...db.systemConfig,
        ...remote.kvMap.systemConfig,
        app_nodes: remote.kvMap.systemConfig.app_nodes !== void 0 ? normalizeAppNodes(remote.kvMap.systemConfig.app_nodes) : normalizeAppNodes(db.systemConfig.app_nodes),
        kill_target_ips: remote.kvMap.systemConfig.kill_target_ips !== void 0 ? normalizeKillTargetIps(remote.kvMap.systemConfig.kill_target_ips) : normalizeKillTargetIps(db.systemConfig.kill_target_ips),
        admin_notify_phone: remote.kvMap.systemConfig.admin_notify_phone !== void 0 ? normalizeAdminNotifyPhone(remote.kvMap.systemConfig.admin_notify_phone) : normalizeAdminNotifyPhone(db.systemConfig.admin_notify_phone),
        telegram_bot_token: remote.kvMap.systemConfig.telegram_bot_token !== void 0 ? normalizeStoredTelegramToken(remote.kvMap.systemConfig.telegram_bot_token) : normalizeStoredTelegramToken(db.systemConfig.telegram_bot_token),
        telegram_chat_id: remote.kvMap.systemConfig.telegram_chat_id !== void 0 ? normalizeTelegramChatId(remote.kvMap.systemConfig.telegram_chat_id) : normalizeTelegramChatId(db.systemConfig.telegram_chat_id),
        telegram_enabled: remote.kvMap.systemConfig.telegram_enabled !== void 0 ? Boolean(remote.kvMap.systemConfig.telegram_enabled) : db.systemConfig.telegram_enabled !== false,
        telegram_configs: remote.kvMap.systemConfig.telegram_configs !== void 0 ? normalizeTelegramConfigs(remote.kvMap.systemConfig.telegram_configs) : normalizeTelegramConfigs(db.systemConfig.telegram_configs),
        app_url: process.env.APP_URL?.trim() || remote.kvMap.systemConfig.app_url || db.systemConfig.app_url,
        mysql_host: process.env.MYSQL_HOST?.trim() || remote.kvMap.systemConfig.mysql_host || db.systemConfig.mysql_host,
        mysql_port: Number(process.env.MYSQL_PORT) || remote.kvMap.systemConfig.mysql_port || db.systemConfig.mysql_port,
        mysql_user: process.env.MYSQL_USER?.trim() || remote.kvMap.systemConfig.mysql_user || db.systemConfig.mysql_user,
        mysql_database: process.env.MYSQL_DATABASE?.trim() || remote.kvMap.systemConfig.mysql_database || db.systemConfig.mysql_database,
        mysql_password: process.env.MYSQL_PASSWORD ? encryptData(process.env.MYSQL_PASSWORD) : remote.kvMap.systemConfig.mysql_password || db.systemConfig.mysql_password
      };
    }
    if (remote.kvMap.qris && typeof remote.kvMap.qris === "object" && Object.keys(remote.kvMap.qris).length > 0) {
      db.systemConfig = {
        ...db.systemConfig,
        qris_config: {
          ...db.systemConfig.qris_config,
          ...remote.kvMap.qris
        }
      };
    }
    if (Array.isArray(remote.kvMap.plans) && remote.kvMap.plans.length > 0) {
      db.plans = remote.kvMap.plans.map((p) => normalizeSubscriptionPlan(p));
    }
    if (remote.kvMap.antiBan) {
      db.antiBan = { ...db.antiBan, ...remote.kvMap.antiBan };
    }
    if (Array.isArray(remote.kvMap.broadcastHistory)) {
      db.broadcastHistory = remote.kvMap.broadcastHistory;
    }
    if (Array.isArray(remote.kvMap.catalogProducts)) {
      db.catalogProducts = remote.kvMap.catalogProducts;
    }
    if (remote.kvMap.catalogSettings && typeof remote.kvMap.catalogSettings === "object") {
      db.catalogSettings = { ...db.catalogSettings || {}, ...remote.kvMap.catalogSettings };
    }
    if (Array.isArray(remote.kvMap.superadminWaQueue)) {
      const mergedQueue = /* @__PURE__ */ new Map();
      for (const item of remote.kvMap.superadminWaQueue) {
        if (item?.id) mergedQueue.set(item.id, item);
      }
      for (const item of db.superadminWaQueue || []) {
        if (item?.id) mergedQueue.set(item.id, item);
      }
      db.superadminWaQueue = Array.from(mergedQueue.values()).slice(0, 500);
    }
    if (remote.kvMap.expiredSessionAlertKeys && typeof remote.kvMap.expiredSessionAlertKeys === "object") {
      db.expiredSessionAlertKeys = { ...remote.kvMap.expiredSessionAlertKeys };
    }
    if (Array.isArray(remote.kvMap.pendingSessionExpiryAlerts)) {
      const mergedPending = /* @__PURE__ */ new Map();
      for (const item of remote.kvMap.pendingSessionExpiryAlerts) {
        if (item?.key) mergedPending.set(item.key, item);
      }
      for (const item of db.pendingSessionExpiryAlerts || []) {
        if (item?.key) {
          const prev = mergedPending.get(item.key);
          if (!prev || Date.parse(item.first_detected_at) <= Date.parse(prev.first_detected_at)) {
            mergedPending.set(item.key, item);
          }
        }
      }
      db.pendingSessionExpiryAlerts = Array.from(mergedPending.values()).slice(-500);
    }
    if (remote.kvMap.handledIncomingMessages && typeof remote.kvMap.handledIncomingMessages === "object") {
      const mergedHandled = {
        ...remote.kvMap.handledIncomingMessages,
        ...db.handledIncomingMessages || {}
      };
      db.handledIncomingMessages = pruneTimestampMap(mergedHandled, HANDLED_MSG_RETENTION_MS, MAX_HANDLED_INCOMING_MESSAGES);
    }
    if (remote.kvMap.chatReplyWatermark && typeof remote.kvMap.chatReplyWatermark === "object") {
      const mergedWm = { ...db.chatReplyWatermark || {} };
      for (const [k, v] of Object.entries(remote.kvMap.chatReplyWatermark)) {
        const ts = Number(v);
        if (Number.isFinite(ts) && ts > (mergedWm[k] || 0)) {
          mergedWm[k] = ts;
        }
      }
      db.chatReplyWatermark = pruneTimestampMap(mergedWm, CHAT_WATERMARK_RETENTION_MS, MAX_CHAT_REPLY_WATERMARKS);
    }
    if (Array.isArray(remote.kvMap.pendingMissedMessages)) {
      const cutoff = Date.now() - MISSED_MSG_RETENTION_MS;
      const mergedMissed = /* @__PURE__ */ new Map();
      for (const item of remote.kvMap.pendingMissedMessages) {
        if (!item?.id || !item?.session_id || !item?.wam_id) continue;
        const createdMs = Date.parse(item.created_at || "");
        if (Number.isFinite(createdMs) && createdMs < cutoff) continue;
        mergedMissed.set(item.id, item);
      }
      for (const item of db.pendingMissedMessages || []) {
        if (!item?.id || !item?.session_id || !item?.wam_id) continue;
        const createdMs = Date.parse(item.created_at || "");
        if (Number.isFinite(createdMs) && createdMs < cutoff) continue;
        mergedMissed.set(item.id, item);
      }
      db.pendingMissedMessages = Array.from(mergedMissed.values()).slice(-MAX_PENDING_MISSED_MESSAGES);
    }
    if (remote.kvMap.stats) {
      db.stats = { ...db.stats, ...remote.kvMap.stats };
    }
  }
}
function getMysqlModule() {
  if (!mysqlModulePromise) {
    mysqlModulePromise = Promise.resolve().then(() => (init_mysqlService(), mysqlService_exports));
  }
  return mysqlModulePromise;
}
function normalizeWhitelabelLogoUrl(rawUrl) {
  const trimmed = String(rawUrl || "").trim();
  if (!trimmed || trimmed === "/src/assets/images/japriin_logo_1791445508697.jpg" || trimmed === "src/assets/images/japriin_logo_1791445508697.jpg" || trimmed === "./src/assets/images/japriin_logo_1791445508697.jpg") {
    return "/logo.jpg";
  }
  return trimmed;
}
function normalizeMaxGlobalSessions(raw) {
  if (raw === void 0 || raw === null || raw === "") return null;
  const num = Number(raw);
  if (!Number.isFinite(num) || num < 1 || num > 1e4) return null;
  return Math.floor(num);
}
function normalizeAppIdValue(raw) {
  return String(raw ?? "").trim().toLowerCase().replace(/[^a-z0-9._-]/g, "").slice(0, 64);
}
function normalizeAdminNotifyPhone(raw) {
  if (raw === void 0 || raw === null) return "";
  let clean = String(raw).replace(/\D/g, "");
  if (!clean) return "";
  if (clean.startsWith("00")) clean = clean.slice(2);
  if (clean.startsWith("620")) clean = "62" + clean.slice(3);
  else if (clean.startsWith("0")) clean = "62" + clean.slice(1);
  else if (clean.startsWith("8")) clean = "62" + clean;
  if (clean.length < 8 || clean.length > 16) return "";
  return clean;
}
function normalizeAppNodes(raw) {
  if (!Array.isArray(raw)) return [];
  const seen = /* @__PURE__ */ new Map();
  const nowIso = (/* @__PURE__ */ new Date()).toISOString();
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const obj = item;
    const appId = normalizeAppIdValue(obj.app_id);
    if (!appId) continue;
    const maxRaw = Number(obj.max_connections);
    const maxConnections = Number.isFinite(maxRaw) && maxRaw >= 1 && maxRaw <= 1e4 ? Math.floor(maxRaw) : 10;
    const name = typeof obj.name === "string" && obj.name.trim() ? obj.name.trim().slice(0, 80) : void 0;
    seen.set(appId, {
      app_id: appId,
      name,
      max_connections: maxConnections,
      is_active: obj.is_active === void 0 ? true : Boolean(obj.is_active),
      updated_at: typeof obj.updated_at === "string" && obj.updated_at ? obj.updated_at : nowIso
    });
  }
  return Array.from(seen.values());
}
function normalizeServerIpValue(raw) {
  let s = String(raw ?? "").trim().toLowerCase();
  if (!s) return "";
  if (s.startsWith("::ffff:")) {
    const v4 = s.slice(7);
    if (net.isIP(v4) === 4) s = v4;
  }
  if (net.isIP(s) !== 0) return s;
  return "";
}
function normalizeKillTargetIps(raw) {
  if (!Array.isArray(raw)) return [];
  const seen = /* @__PURE__ */ new Map();
  const nowIso = (/* @__PURE__ */ new Date()).toISOString();
  for (const item of raw) {
    if (!item || typeof item !== "object") {
      if (typeof item === "string") {
        const cleanIp2 = normalizeServerIpValue(item);
        if (cleanIp2) {
          seen.set(cleanIp2, { ip: cleanIp2, requested_at: nowIso });
        }
      }
      continue;
    }
    const obj = item;
    const cleanIp = normalizeServerIpValue(obj.ip);
    if (!cleanIp) continue;
    const reason = typeof obj.reason === "string" && obj.reason.trim() ? obj.reason.trim().slice(0, 200) : void 0;
    const requestedBy = typeof obj.requested_by === "string" && obj.requested_by.trim() ? obj.requested_by.trim().slice(0, 80) : void 0;
    seen.set(cleanIp, {
      ip: cleanIp,
      reason,
      requested_at: typeof obj.requested_at === "string" && obj.requested_at ? obj.requested_at : nowIso,
      requested_by: requestedBy
    });
  }
  return Array.from(seen.values());
}
function getKillTargetIpsConfig(sysConfig) {
  const cfg = sysConfig || initDbFile().systemConfig;
  return normalizeKillTargetIps(cfg?.kill_target_ips);
}
function getAppNodesConfig(sysConfig) {
  const cfg = sysConfig || initDbFile().systemConfig;
  return normalizeAppNodes(cfg?.app_nodes);
}
function getAdminNotifyPhone(sysConfig) {
  const cfg = sysConfig || initDbFile().systemConfig;
  return normalizeAdminNotifyPhone(cfg?.admin_notify_phone);
}
function resolveClusterNotifyPhone(sysConfig) {
  const configured = getAdminNotifyPhone(sysConfig);
  if (configured) return configured;
  const db = initDbFile();
  const activeAdmin = (db.users || []).find(
    (u) => u.role === "admin" && u.is_active && normalizeAdminNotifyPhone(u.phone).length >= 8
  );
  return activeAdmin ? normalizeAdminNotifyPhone(activeAdmin.phone) : "";
}
function normalizeTelegramChatId(raw) {
  const s = String(raw ?? "").trim().slice(0, 64);
  if (!s) return "";
  if (/^-?\d{5,25}$/.test(s) || /^@[a-zA-Z0-9_]{5,32}$/.test(s)) {
    return s;
  }
  return "";
}
function isValidTelegramBotTokenFormat(raw) {
  const s = String(raw ?? "").trim();
  if (!s || s.length < 20 || s.length > 140) return false;
  return /^\d{5,16}:[A-Za-z0-9_-]{20,100}$/.test(s);
}
function normalizeStoredTelegramToken(raw) {
  const s = String(raw ?? "").trim();
  if (!s) return "";
  if (s.startsWith("gcm:")) {
    return decryptData(s) ? s : "";
  }
  if (s.includes("****")) return "";
  return encryptData(s);
}
function normalizeTelegramConfigs(raw) {
  if (!Array.isArray(raw)) return [];
  const seen = /* @__PURE__ */ new Map();
  const nowIso = (/* @__PURE__ */ new Date()).toISOString();
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const obj = item;
    const id = String(obj.id || "").trim().replace(/[^a-zA-Z0-9._-]/g, "").slice(0, 64);
    const chatId = normalizeTelegramChatId(obj.chat_id);
    const storedToken = normalizeStoredTelegramToken(obj.bot_token);
    if (!id || !chatId || !storedToken) continue;
    const name = typeof obj.name === "string" && obj.name.trim() ? obj.name.trim().slice(0, 80) : `Telegram ${chatId}`;
    seen.set(id, {
      id,
      name,
      bot_token: storedToken,
      chat_id: chatId,
      is_active: obj.is_active === void 0 ? true : Boolean(obj.is_active),
      created_at: typeof obj.created_at === "string" && obj.created_at ? obj.created_at : nowIso,
      updated_at: typeof obj.updated_at === "string" && obj.updated_at ? obj.updated_at : nowIso
    });
  }
  return Array.from(seen.values());
}
function getTelegramConfigs(sysConfig) {
  const cfg = sysConfig || initDbFile().systemConfig;
  return normalizeTelegramConfigs(cfg?.telegram_configs);
}
function sanitizeTelegramConfigsForAdmin(sysConfig) {
  const list = getTelegramConfigs(sysConfig);
  return list.map((item) => {
    const plain = decryptData(item.bot_token || "");
    return {
      id: item.id,
      name: item.name,
      bot_token: "",
      bot_token_masked: plain ? maskSensitiveString(plain, 6, 4) : "",
      bot_token_configured: Boolean(plain),
      chat_id: item.chat_id,
      is_active: item.is_active !== false,
      created_at: item.created_at,
      updated_at: item.updated_at
    };
  });
}
function getActiveTelegramTargets(sysConfig) {
  const cfg = sysConfig || initDbFile().systemConfig;
  const targets = [];
  const seenPair = /* @__PURE__ */ new Set();
  for (const item of getTelegramConfigs(cfg)) {
    if (item.is_active === false) continue;
    const plainToken = decryptData(item.bot_token || "").trim();
    const chatId = normalizeTelegramChatId(item.chat_id);
    if (!plainToken || !chatId) continue;
    const dedup = `${plainToken}::${chatId}`;
    if (seenPair.has(dedup)) continue;
    seenPair.add(dedup);
    targets.push({ id: item.id, name: item.name, botToken: plainToken, chatId });
  }
  if (cfg?.telegram_enabled !== false && cfg?.telegram_bot_token && cfg?.telegram_chat_id) {
    const plainToken = decryptData(String(cfg.telegram_bot_token)).trim();
    const chatId = normalizeTelegramChatId(cfg.telegram_chat_id);
    if (plainToken && chatId) {
      const dedup = `${plainToken}::${chatId}`;
      if (!seenPair.has(dedup)) {
        seenPair.add(dedup);
        targets.push({ id: "primary", name: "Telegram Utama", botToken: plainToken, chatId });
      }
    }
  }
  return targets;
}
function buildDefaultDatabaseUsers() {
  const envUser = process.env.INITIAL_ADMIN_USERNAME?.trim().toLowerCase();
  const envPass = process.env.INITIAL_ADMIN_PASSWORD;
  const envEmail = process.env.INITIAL_ADMIN_EMAIL?.trim().toLowerCase();
  const adminPin = process.env.SUPERADMIN_MASTER_PIN?.trim();
  if (!envUser || !envPass || envPass.length < 8 || !envEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(envEmail)) {
    return [];
  }
  return [
    {
      id: "user_superadmin",
      username: envUser,
      name: process.env.INITIAL_ADMIN_NAME?.trim() || "Super Administrator",
      role: "admin",
      email: envEmail,
      phone: process.env.INITIAL_ADMIN_PHONE ? normalizePhoneForUniqueness(process.env.INITIAL_ADMIN_PHONE) : "",
      password: hashPassword(envPass),
      is_active: true,
      email_verified: true,
      wa_verified: true,
      plan_id: "pro",
      plan_status: "active",
      max_sessions: 1,
      security_pin: adminPin ? hashPin(adminPin) : void 0,
      pin_failed_attempts: 0,
      is_bot_locked: false,
      api_key: generateApiKey("mgw_supe_"),
      daily_messages_sent: 0,
      monthly_messages_sent: 0,
      auto_reply_enabled: true,
      ai_enabled: true,
      default_cs_reply_enabled: true,
      default_cs_reply_text: "Halo kak *{nama}*! Terima kasih telah menghubungi kami. Tim Customer Service kami akan segera membalas pesan Anda sesegera mungkin.",
      rules_initialized: true,
      session_version: 1,
      created_at: (/* @__PURE__ */ new Date()).toISOString(),
      approved_at: (/* @__PURE__ */ new Date()).toISOString()
    }
  ];
}
function initDbFile() {
  const now = Date.now();
  if (cachedMemoryDb) {
    if (now - lastDiskStatCheckedAt > 1e3 && process.env.JAPRIIN_EPHEMERAL_DB !== "1") {
      lastDiskStatCheckedAt = now;
      try {
        if (fs2.existsSync(RUNTIME_DB_PATH)) {
          const diskMtime = fs2.statSync(RUNTIME_DB_PATH).mtimeMs;
          if (diskMtime > lastLoadedDbMtimeMs + 1) {
            const reloaded = loadEncryptedLocalDb();
            if (reloaded) {
              cachedMemoryDb = reloaded;
              lastLoadedDbMtimeMs = diskMtime;
            }
          }
        }
      } catch {
      }
    }
    return cachedMemoryDb;
  }
  const persisted = loadEncryptedLocalDb();
  if (persisted) {
    if (!persisted.users.some((u) => u.role === "admin" && u.is_active)) {
      const envAdmins = buildDefaultDatabaseUsers();
      if (envAdmins.length > 0) {
        persisted.users.unshift(...envAdmins);
      }
    }
    cachedMemoryDb = persisted;
    syncDbFileMtimeMarker();
    return persisted;
  }
  const initialDb = {
    messages: [],
    broadcastHistory: [],
    rules: [],
    sessions: [],
    antiBan: DEFAULT_ANTIBAN,
    users: buildDefaultDatabaseUsers(),
    plans: DEFAULT_SUBSCRIPTION_PLANS,
    smtpAccounts: [],
    geminiKeys: [],
    systemConfig: DEFAULT_SYSTEM_CONFIG,
    catalogProducts: [],
    catalogSettings: {},
    superadminWaQueue: [],
    expiredSessionAlertKeys: {},
    pendingSessionExpiryAlerts: [],
    handledIncomingMessages: {},
    chatReplyWatermark: {},
    pendingMissedMessages: [],
    stats: {
      total_incoming: 0,
      total_auto_replied: 0,
      total_failed: 0,
      total_ai_replied: 0
    }
  };
  cachedMemoryDb = initialDb;
  return initialDb;
}
function writeDbFile(data, immediate = false) {
  markMutated();
  cachedMemoryDb = data;
  if (immediate) {
    if (pendingPersistTimer) {
      clearTimeout(pendingPersistTimer);
      pendingPersistTimer = null;
    }
    saveEncryptedLocalDb(data);
    return;
  }
  if (pendingPersistTimer) {
    clearTimeout(pendingPersistTimer);
  }
  pendingPersistTimer = setTimeout(() => {
    pendingPersistTimer = null;
    if (cachedMemoryDb) {
      saveEncryptedLocalDbAsync(cachedMemoryDb).catch(() => {
      });
    }
  }, 2500);
  pendingPersistTimer.unref?.();
}
function normalizeSubscriptionPlan(plan) {
  if (!plan || plan.id !== "free") {
    return { ...plan, max_sessions: 1 };
  }
  const dailyMsgLimit = Math.max(1, Number(plan.daily_msg_limit) || 100);
  const monthlyMsgLimit = Math.max(dailyMsgLimit, Number(plan.monthly_msg_limit) || 500);
  const updatedFeatures = Array.isArray(plan.features) ? plan.features.map(
    (f) => /Batas\s+Respon\s+AI\s+25\s*\/\s*Hari/i.test(String(f)) ? "Respon AI Tanpa Batas Terpisah (Ikuti Batas Chat Harian)" : f
  ) : [];
  return {
    ...plan,
    max_sessions: 1,
    daily_msg_limit: dailyMsgLimit,
    monthly_msg_limit: monthlyMsgLimit,
    daily_ai_limit: dailyMsgLimit,
    monthly_ai_limit: monthlyMsgLimit,
    features: updatedFeatures
  };
}
function getSubscriptionPlans() {
  const db = initDbFile();
  return (db.plans || DEFAULT_SUBSCRIPTION_PLANS).map(normalizeSubscriptionPlan);
}
function getWhitelabelConfig() {
  const db = initDbFile();
  const wl = db.systemConfig?.whitelabel_config || DEFAULT_WHITELABEL;
  const normalizedLogo = normalizeWhitelabelLogoUrl(wl.logo_url);
  if (normalizedLogo !== wl.logo_url) {
    return { ...wl, logo_url: normalizedLogo };
  }
  return wl;
}
function getUserById(id) {
  const db = initDbFile();
  if (!id) return null;
  return db.users.find(
    (u) => u.id === id || u.username.toLowerCase() === id.toLowerCase() || id === "usr_user" && (u.id === "user_regular" || u.username === "user") || id === "user_regular" && (u.id === "usr_user" || u.username === "user") || id === "usr_admin" && (u.id === "user_admin" || u.username === "admin") || id === "usr_superadmin" && (u.id === "user_superadmin" || u.username === "superadmin")
  ) || null;
}
function isUserOnFreeTier(user) {
  return user.role !== "admin" && (!user.plan_id || user.plan_id === "free" || user.plan_status !== "active");
}
function resolveUserPlanForQuota(plans, user) {
  const fallbackFree = plans.find((p) => p.id === "free") || plans[0] || DEFAULT_SUBSCRIPTION_PLANS[0];
  if (isUserOnFreeTier(user)) {
    return normalizeSubscriptionPlan(fallbackFree);
  }
  const matched = plans.find((p) => p.id === user.plan_id) || fallbackFree;
  return normalizeSubscriptionPlan(matched);
}
function canUseDailyQuota(userId) {
  if (!userId) return { allowed: true, remaining: 999999, dailyLimit: 999999 };
  const db = initDbFile();
  const targetUser = getUserById(userId);
  if (!targetUser) return { allowed: false, remaining: 0, dailyLimit: 0, message: "Pengguna tidak ditemukan" };
  const user = db.users.find((u) => u.id === targetUser.id);
  if (!user) return { allowed: false, remaining: 0, dailyLimit: 0, message: "Pengguna tidak ditemukan" };
  const isAdmin = user.role === "admin";
  const plans = db.plans || DEFAULT_SUBSCRIPTION_PLANS;
  const userPlan = resolveUserPlanForQuota(plans, user);
  const dailyLimit = isAdmin ? 999999 : userPlan.daily_msg_limit || 100;
  const monthlyLimit = isAdmin ? 999999 : userPlan.monthly_msg_limit || 500;
  const today = (/* @__PURE__ */ new Date()).toISOString().split("T")[0];
  const currentMonth = today.substring(0, 7);
  let mutated = false;
  if (user.last_quota_reset_date !== today) {
    user.daily_messages_sent = 0;
    user.daily_ai_sent = 0;
    user.last_quota_reset_date = today;
    mutated = true;
  }
  if (user.last_quota_reset_month !== currentMonth) {
    user.monthly_messages_sent = 0;
    user.monthly_ai_sent = 0;
    user.last_quota_reset_month = currentMonth;
    mutated = true;
  }
  if (mutated) writeDbFile(db);
  if (!isAdmin && (user.daily_messages_sent || 0) >= dailyLimit) {
    return {
      allowed: false,
      remaining: 0,
      dailyLimit,
      message: `Kuota pesan harian Anda telah habis (${user.daily_messages_sent || 0}/${dailyLimit} pesan). Upgrade paket Anda untuk kuota lebih banyak.`
    };
  }
  if (!isAdmin && (user.monthly_messages_sent || 0) >= monthlyLimit) {
    return {
      allowed: false,
      remaining: 0,
      dailyLimit,
      message: `Kuota pesan bulanan Anda telah habis (${user.monthly_messages_sent || 0}/${monthlyLimit} pesan). Upgrade paket Anda untuk kuota lebih banyak.`
    };
  }
  return {
    allowed: true,
    remaining: isAdmin ? 999999 : Math.max(0, dailyLimit - (user.daily_messages_sent || 0)),
    dailyLimit: isAdmin ? 999999 : dailyLimit
  };
}
function deductUserDailyQuota(userId) {
  const db = initDbFile();
  const targetUser = getUserById(userId);
  if (!targetUser) return { allowed: false, remaining: 0, dailyLimit: 0, message: "Pengguna tidak ditemukan" };
  const user = db.users.find((u) => u.id === targetUser.id);
  if (!user) return { allowed: false, remaining: 0, dailyLimit: 0, message: "Pengguna tidak ditemukan" };
  const isAdmin = user.role === "admin";
  const plans = db.plans || DEFAULT_SUBSCRIPTION_PLANS;
  const userPlan = resolveUserPlanForQuota(plans, user);
  const dailyLimit = isAdmin ? 999999 : userPlan.daily_msg_limit || 100;
  const monthlyLimit = isAdmin ? 999999 : userPlan.monthly_msg_limit || 500;
  const today = (/* @__PURE__ */ new Date()).toISOString().split("T")[0];
  const currentMonth = today.substring(0, 7);
  if (user.last_quota_reset_date !== today) {
    user.daily_messages_sent = 0;
    user.daily_ai_sent = 0;
    user.last_quota_reset_date = today;
  }
  if (user.last_quota_reset_month !== currentMonth) {
    user.monthly_messages_sent = 0;
    user.monthly_ai_sent = 0;
    user.last_quota_reset_month = currentMonth;
  }
  if (!isAdmin && user.daily_messages_sent >= dailyLimit) {
    return {
      allowed: false,
      remaining: 0,
      dailyLimit,
      message: `Kuota pesan harian Anda telah habis (${user.daily_messages_sent}/${dailyLimit} pesan). Upgrade paket Anda untuk kuota lebih banyak.`
    };
  }
  if (!isAdmin && (user.monthly_messages_sent || 0) >= monthlyLimit) {
    return {
      allowed: false,
      remaining: 0,
      dailyLimit,
      message: `Kuota pesan bulanan Anda telah habis (${user.monthly_messages_sent || 0}/${monthlyLimit} pesan). Upgrade paket Anda untuk kuota lebih banyak.`
    };
  }
  user.daily_messages_sent = (user.daily_messages_sent || 0) + 1;
  user.monthly_messages_sent = (user.monthly_messages_sent || 0) + 1;
  writeDbFile(db);
  asyncSyncUser(user);
  return {
    allowed: true,
    remaining: isAdmin ? 999999 : Math.max(0, dailyLimit - user.daily_messages_sent),
    dailyLimit: isAdmin ? 999999 : dailyLimit
  };
}
function canUseAiQuota(userId) {
  if (!userId) {
    return {
      allowed: true,
      remainingDaily: 999999,
      dailyLimit: 999999,
      remainingMonthly: 999999,
      monthlyLimit: 999999
    };
  }
  const db = initDbFile();
  const targetUser = getUserById(userId);
  if (!targetUser) {
    return {
      allowed: false,
      remainingDaily: 0,
      dailyLimit: 0,
      remainingMonthly: 0,
      monthlyLimit: 0,
      message: "Pengguna tidak ditemukan"
    };
  }
  const user = db.users.find((u) => u.id === targetUser.id);
  if (!user) {
    return {
      allowed: false,
      remainingDaily: 0,
      dailyLimit: 0,
      remainingMonthly: 0,
      monthlyLimit: 0,
      message: "Pengguna tidak ditemukan"
    };
  }
  const isAdmin = user.role === "admin";
  const isFree = isUserOnFreeTier(user);
  const plans = db.plans || DEFAULT_SUBSCRIPTION_PLANS;
  const userPlan = resolveUserPlanForQuota(plans, user);
  const dailyMsgLimit = isAdmin ? 999999 : userPlan.daily_msg_limit || 100;
  const monthlyMsgLimit = isAdmin ? 999999 : userPlan.monthly_msg_limit || 500;
  const dailyAiLimit = isAdmin ? 999999 : isFree ? dailyMsgLimit : userPlan.daily_ai_limit ?? dailyMsgLimit;
  const monthlyAiLimit = isAdmin ? 999999 : isFree ? monthlyMsgLimit : userPlan.monthly_ai_limit ?? monthlyMsgLimit;
  const today = (/* @__PURE__ */ new Date()).toISOString().split("T")[0];
  const currentMonth = today.substring(0, 7);
  let mutated = false;
  if (user.last_quota_reset_date !== today) {
    user.daily_messages_sent = 0;
    user.daily_ai_sent = 0;
    user.last_quota_reset_date = today;
    mutated = true;
  }
  if (user.last_quota_reset_month !== currentMonth) {
    user.monthly_messages_sent = 0;
    user.monthly_ai_sent = 0;
    user.last_quota_reset_month = currentMonth;
    mutated = true;
  }
  if (mutated) writeDbFile(db);
  const currentDailyMsg = user.daily_messages_sent || 0;
  const currentMonthlyMsg = user.monthly_messages_sent || 0;
  const currentDailyAi = user.daily_ai_sent || 0;
  const currentMonthlyAi = user.monthly_ai_sent || 0;
  if (!isAdmin && currentDailyMsg >= dailyMsgLimit) {
    return {
      allowed: false,
      remainingDaily: 0,
      dailyLimit: dailyAiLimit,
      remainingMonthly: Math.max(0, monthlyMsgLimit - currentMonthlyMsg),
      monthlyLimit: monthlyAiLimit,
      message: `Batas chat harian Anda telah habis (${currentDailyMsg}/${dailyMsgLimit}). Respon AI mengikuti batas chat harian.`
    };
  }
  if (!isAdmin && currentMonthlyMsg >= monthlyMsgLimit) {
    return {
      allowed: false,
      remainingDaily: Math.max(0, dailyMsgLimit - currentDailyMsg),
      dailyLimit: dailyAiLimit,
      remainingMonthly: 0,
      monthlyLimit: monthlyAiLimit,
      message: `Batas chat bulanan Anda telah habis (${currentMonthlyMsg}/${monthlyMsgLimit}). Respon AI mengikuti batas chat bulanan.`
    };
  }
  if (!isAdmin && !isFree && currentDailyAi >= dailyAiLimit) {
    return {
      allowed: false,
      remainingDaily: 0,
      dailyLimit: dailyAiLimit,
      remainingMonthly: Math.max(0, monthlyAiLimit - currentMonthlyAi),
      monthlyLimit: monthlyAiLimit,
      message: `Batas kuota respon AI harian Anda telah habis (${currentDailyAi}/${dailyAiLimit}).`
    };
  }
  if (!isAdmin && !isFree && currentMonthlyAi >= monthlyAiLimit) {
    return {
      allowed: false,
      remainingDaily: Math.max(0, dailyAiLimit - currentDailyAi),
      dailyLimit: dailyAiLimit,
      remainingMonthly: 0,
      monthlyLimit: monthlyAiLimit,
      message: `Batas kuota respon AI bulanan Anda telah habis (${currentMonthlyAi}/${monthlyAiLimit}).`
    };
  }
  return {
    allowed: true,
    remainingDaily: isAdmin ? 999999 : isFree ? Math.max(0, dailyMsgLimit - currentDailyMsg) : Math.max(0, dailyAiLimit - currentDailyAi),
    dailyLimit: dailyAiLimit,
    remainingMonthly: isAdmin ? 999999 : isFree ? Math.max(0, monthlyMsgLimit - currentMonthlyMsg) : Math.max(0, monthlyAiLimit - currentMonthlyAi),
    monthlyLimit: monthlyAiLimit
  };
}
function deductUserAiQuota(userId) {
  const db = initDbFile();
  const targetUser = getUserById(userId);
  if (!targetUser) {
    return {
      allowed: false,
      remainingDaily: 0,
      dailyLimit: 0,
      remainingMonthly: 0,
      monthlyLimit: 0,
      message: "Pengguna tidak ditemukan"
    };
  }
  const user = db.users.find((u) => u.id === targetUser.id);
  if (!user) {
    return {
      allowed: false,
      remainingDaily: 0,
      dailyLimit: 0,
      remainingMonthly: 0,
      monthlyLimit: 0,
      message: "Pengguna tidak ditemukan"
    };
  }
  const isAdmin = user.role === "admin";
  const isFree = isUserOnFreeTier(user);
  const plans = db.plans || DEFAULT_SUBSCRIPTION_PLANS;
  const userPlan = resolveUserPlanForQuota(plans, user);
  const dailyMsgLimit = isAdmin ? 999999 : userPlan.daily_msg_limit || 100;
  const monthlyMsgLimit = isAdmin ? 999999 : userPlan.monthly_msg_limit || 500;
  const dailyAiLimit = isAdmin ? 999999 : isFree ? dailyMsgLimit : userPlan.daily_ai_limit ?? dailyMsgLimit;
  const monthlyAiLimit = isAdmin ? 999999 : isFree ? monthlyMsgLimit : userPlan.monthly_ai_limit ?? monthlyMsgLimit;
  const today = (/* @__PURE__ */ new Date()).toISOString().split("T")[0];
  const currentMonth = today.substring(0, 7);
  if (user.last_quota_reset_date !== today) {
    user.daily_messages_sent = 0;
    user.daily_ai_sent = 0;
    user.last_quota_reset_date = today;
  }
  if (user.last_quota_reset_month !== currentMonth) {
    user.monthly_messages_sent = 0;
    user.monthly_ai_sent = 0;
    user.last_quota_reset_month = currentMonth;
  }
  const currentDailyAi = user.daily_ai_sent || 0;
  const currentMonthlyAi = user.monthly_ai_sent || 0;
  if (!isAdmin && !isFree && currentDailyAi >= dailyAiLimit) {
    return {
      allowed: false,
      remainingDaily: 0,
      dailyLimit: dailyAiLimit,
      remainingMonthly: Math.max(0, monthlyAiLimit - currentMonthlyAi),
      monthlyLimit: monthlyAiLimit,
      message: `Batas kuota respon AI harian Anda telah habis (${currentDailyAi}/${dailyAiLimit}).`
    };
  }
  if (!isAdmin && !isFree && currentMonthlyAi >= monthlyAiLimit) {
    return {
      allowed: false,
      remainingDaily: Math.max(0, dailyAiLimit - currentDailyAi),
      dailyLimit: dailyAiLimit,
      remainingMonthly: 0,
      monthlyLimit: monthlyAiLimit,
      message: `Batas kuota respon AI bulanan Anda telah habis (${currentMonthlyAi}/${monthlyAiLimit}).`
    };
  }
  user.daily_ai_sent = currentDailyAi + 1;
  user.monthly_ai_sent = currentMonthlyAi + 1;
  writeDbFile(db);
  return {
    allowed: true,
    remainingDaily: isAdmin ? 999999 : isFree ? Math.max(0, dailyMsgLimit - (user.daily_messages_sent || 0)) : Math.max(0, dailyAiLimit - user.daily_ai_sent),
    dailyLimit: dailyAiLimit,
    remainingMonthly: isAdmin ? 999999 : isFree ? Math.max(0, monthlyMsgLimit - (user.monthly_messages_sent || 0)) : Math.max(0, monthlyAiLimit - user.monthly_ai_sent),
    monthlyLimit: monthlyAiLimit
  };
}
function getSystemConfig() {
  const db = initDbFile();
  return db.systemConfig;
}
function normalizeFreeAutoReplyHours(raw) {
  if (raw === void 0 || raw === null || raw === "") return null;
  const num = Number(raw);
  if (!Number.isFinite(num) || num < 0 || num > 720) return null;
  return Math.round(num * 100) / 100;
}
function getMaxGlobalSessions(sysConfig) {
  const cfg = sysConfig || initDbFile().systemConfig;
  const parsed = normalizeMaxGlobalSessions(cfg?.max_global_sessions);
  return parsed !== null ? parsed : DEFAULT_MAX_GLOBAL_SESSIONS;
}
function getUserAutoReplyStatus(userOrId, _sysConfig) {
  const user = typeof userOrId === "string" ? getUserById(userOrId) : userOrId || null;
  if (!user) {
    return {
      enabled: false,
      allowed: false,
      is_free_plan: true,
      expired: false,
      free_hours_limit: 0,
      activated_at: null,
      expires_at: null,
      remaining_seconds: null,
      reason: "Akun pengguna tidak ditemukan."
    };
  }
  const isFreePlan = user.role !== "admin" && (!user.plan_id || user.plan_id === "free" || user.plan_status !== "active");
  if (!user.is_active || !user.email_verified) {
    return {
      enabled: false,
      allowed: false,
      is_free_plan: isFreePlan,
      expired: false,
      free_hours_limit: 0,
      activated_at: user.auto_reply_activated_at || null,
      expires_at: null,
      remaining_seconds: null,
      reason: "Akun belum aktif atau belum terverifikasi email."
    };
  }
  const enabled = user.role === "admin" ? user.auto_reply_enabled !== false : user.auto_reply_enabled === true;
  return {
    enabled,
    allowed: enabled,
    is_free_plan: isFreePlan,
    expired: false,
    free_hours_limit: 0,
    activated_at: user.auto_reply_activated_at || null,
    expires_at: null,
    remaining_seconds: null,
    reason: enabled ? void 0 : "Respon pesan otomatis sedang dimatikan (nonaktif)."
  };
}
function updateSystemConfig(updates) {
  const db = initDbFile();
  const safeUpdates = { ...updates };
  if (typeof safeUpdates.mysql_password === "string") {
    const trimmed = safeUpdates.mysql_password.trim();
    if (!trimmed) {
      delete safeUpdates.mysql_password;
    } else if (!trimmed.startsWith("gcm:")) {
      safeUpdates.mysql_password = encryptData(trimmed);
    }
  }
  if (safeUpdates.free_auto_reply_hours !== void 0) {
    const cleanHours = normalizeFreeAutoReplyHours(safeUpdates.free_auto_reply_hours);
    if (cleanHours !== null) {
      safeUpdates.free_auto_reply_hours = cleanHours;
    } else {
      delete safeUpdates.free_auto_reply_hours;
    }
  }
  if (safeUpdates.max_global_sessions !== void 0) {
    const cleanMaxGlobal = normalizeMaxGlobalSessions(safeUpdates.max_global_sessions);
    if (cleanMaxGlobal !== null) {
      safeUpdates.max_global_sessions = cleanMaxGlobal;
    } else {
      delete safeUpdates.max_global_sessions;
    }
  }
  if (safeUpdates.app_nodes !== void 0) {
    safeUpdates.app_nodes = normalizeAppNodes(safeUpdates.app_nodes);
  }
  if (safeUpdates.kill_target_ips !== void 0) {
    safeUpdates.kill_target_ips = normalizeKillTargetIps(safeUpdates.kill_target_ips);
  }
  if (safeUpdates.admin_notify_phone !== void 0) {
    safeUpdates.admin_notify_phone = normalizeAdminNotifyPhone(safeUpdates.admin_notify_phone);
  }
  if (safeUpdates.telegram_bot_token !== void 0) {
    safeUpdates.telegram_bot_token = normalizeStoredTelegramToken(safeUpdates.telegram_bot_token);
  }
  if (safeUpdates.telegram_chat_id !== void 0) {
    safeUpdates.telegram_chat_id = normalizeTelegramChatId(safeUpdates.telegram_chat_id);
  }
  if (safeUpdates.telegram_enabled !== void 0) {
    safeUpdates.telegram_enabled = Boolean(safeUpdates.telegram_enabled);
  }
  if (safeUpdates.telegram_configs !== void 0) {
    safeUpdates.telegram_configs = normalizeTelegramConfigs(safeUpdates.telegram_configs);
  }
  db.systemConfig = { ...db.systemConfig, ...safeUpdates };
  writeDbFile(db, true);
  asyncSyncKv("systemConfig", db.systemConfig);
  if (safeUpdates.app_nodes !== void 0) {
    Promise.resolve().then(() => (init_mysqlService(), mysqlService_exports)).then((m) => m.syncConfiguredAppNodesToMysql(db.systemConfig.app_nodes || [])).catch(() => {
    });
  }
  return db.systemConfig;
}
function purgeExpiredLogs(dbInstance, force = false) {
  const now = Date.now();
  if (!force && now - lastLogPurgeCheckAt < LOG_PURGE_COOLDOWN_MS) {
    return 0;
  }
  lastLogPurgeCheckAt = now;
  const db = dbInstance || initDbFile();
  const cutoffMs = now - LOG_RETENTION_MS;
  let removedCount = 0;
  if (Array.isArray(db.messages) && db.messages.length > 0) {
    const beforeLen = db.messages.length;
    db.messages = db.messages.filter((m) => {
      if (!m.created_at) return true;
      const ts = new Date(m.created_at).getTime();
      return isNaN(ts) || ts >= cutoffMs;
    });
    removedCount += beforeLen - db.messages.length;
  }
  if (Array.isArray(db.broadcastHistory) && db.broadcastHistory.length > 0) {
    const beforeBcLen = db.broadcastHistory.length;
    db.broadcastHistory = db.broadcastHistory.filter((b) => {
      if (!b.created_at) return true;
      const ts = new Date(b.created_at).getTime();
      return isNaN(ts) || ts >= cutoffMs;
    });
    removedCount += beforeBcLen - db.broadcastHistory.length;
  }
  if (removedCount > 0) {
    writeDbFile(db);
    getMysqlModule().then((m) => {
      if (m.isMysqlConfigured()) return m.purgeOldMysqlLogs();
    }).catch(() => {
    });
    console.log(`[Auto-Clean 7 Hari] Berhasil menghapus otomatis ${removedCount} log pesan/broadcast yang berusia > 7 hari.`);
  }
  return removedCount;
}
function isSecretOtpMessageContent(text) {
  if (!text) return false;
  const lower = text.toLowerCase();
  return lower.includes("kode verifikasi") || lower.includes("kode otp") || lower.includes("verifikasi dua langkah") || lower.includes("reset password");
}
function addMessageLog(logData) {
  const db = initDbFile();
  purgeExpiredLogs(db);
  if (isSecretOtpMessageContent(logData.message_body) || isSecretOtpMessageContent(logData.reply_body)) {
    return {
      ...logData,
      id: `msg_otp_hidden_${Date.now()}`,
      created_at: (/* @__PURE__ */ new Date()).toISOString()
    };
  }
  let assignedUserId = logData.user_id;
  if (!assignedUserId && logData.session_id) {
    const s = db.sessions.find((ses) => ses.id === logData.session_id);
    if (s && s.user_id) assignedUserId = s.user_id;
  }
  if (!assignedUserId) {
    const regularUsers = db.users.filter((u) => u.role === "user");
    if (regularUsers.length === 1) assignedUserId = regularUsers[0].id;
  }
  const newLog = {
    ...logData,
    user_id: assignedUserId,
    id: `msg_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
    created_at: (/* @__PURE__ */ new Date()).toISOString()
  };
  db.messages.unshift(newLog);
  if (db.messages.length > 1e3) {
    db.messages = db.messages.slice(0, 1e3);
  }
  if (logData.direction === "incoming") {
    db.stats.total_incoming = (db.stats.total_incoming || 0) + 1;
    db.stats.last_message_at = (/* @__PURE__ */ new Date()).toISOString();
  }
  if (logData.reply_body) {
    db.stats.total_auto_replied = (db.stats.total_auto_replied || 0) + 1;
    if (logData.ai_generated) {
      db.stats.total_ai_replied = (db.stats.total_ai_replied || 0) + 1;
    }
  }
  if (logData.status === "Gagal") {
    db.stats.total_failed = (db.stats.total_failed || 0) + 1;
  }
  const msgDelta = logData.reply_body ? 2 : 1;
  recordSessionMessageActivity(logData.session_id, assignedUserId, msgDelta);
  writeDbFile(db);
  asyncSyncMessage(newLog);
  return newLog;
}
function addBroadcastHistory(entry) {
  const db = initDbFile();
  purgeExpiredLogs(db);
  if (!Array.isArray(db.broadcastHistory)) {
    db.broadcastHistory = [];
  }
  const newItem = {
    ...entry,
    id: `bc_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
    created_at: (/* @__PURE__ */ new Date()).toISOString()
  };
  db.broadcastHistory.unshift(newItem);
  if (db.broadcastHistory.length > 200) {
    db.broadcastHistory = db.broadcastHistory.slice(0, 200);
  }
  writeDbFile(db);
  asyncSyncKv("broadcastHistory", db.broadcastHistory);
  return newItem;
}
function deduplicateSessionsList(sessions) {
  if (!sessions || sessions.length <= 1) return { deduplicated: sessions || [], modified: false };
  const map = /* @__PURE__ */ new Map();
  let modified = false;
  for (const sess of sessions) {
    const cleanPhone = sess.phone_number ? sess.phone_number.replace(/\D/g, "") : sess.id;
    const key = sess.user_id ? `${sess.user_id}_${cleanPhone}` : cleanPhone;
    if (!map.has(key)) {
      map.set(key, sess);
    } else {
      modified = true;
      const existing = map.get(key);
      if (sess.status === "connected" && existing.status !== "connected") {
        map.set(key, sess);
      } else if (new Date(sess.updated_at || 0) > new Date(existing.updated_at || 0)) {
        map.set(key, sess);
      }
    }
  }
  return { deduplicated: Array.from(map.values()), modified };
}
function getWhatsAppSessions() {
  const db = initDbFile();
  const { deduplicated, modified } = deduplicateSessionsList(db.sessions || []);
  if (modified) {
    db.sessions = deduplicated;
    writeDbFile(db);
  }
  return db.sessions;
}
function getSessionById(id) {
  const db = initDbFile();
  const cleanId = String(id || "").trim();
  if (!cleanId) return null;
  const direct = db.sessions.find((s) => s.id === cleanId);
  if (direct) return direct;
  if (/^\+?\d{8,16}$/.test(cleanId)) {
    const cleanDigits = normalizePhoneForUniqueness(cleanId);
    if (cleanDigits.length >= 8) {
      return db.sessions.find(
        (s) => s.phone_number && normalizePhoneForUniqueness(s.phone_number) === cleanDigits
      ) || null;
    }
  }
  return db.sessions.find((s) => s.phone_number === cleanId) || null;
}
function isSessionOwnedByUserId(sessionId, userId) {
  if (!sessionId || !userId) return false;
  const cleanSession = String(sessionId).trim();
  const cleanUser = String(userId).trim();
  if (!cleanSession || !cleanUser) return false;
  if (cleanSession === cleanUser) return true;
  const escaped = cleanUser.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(`^(?:session_user_|session_pair_|session_meta_|session_)?${escaped}(?:$|[._-])`);
  return pattern.test(cleanSession);
}
function extractUserIdFromSessionId(sessionId, users) {
  if (!sessionId) return void 0;
  const sortedUsers = [...users].sort((a, b) => b.id.length - a.id.length);
  for (const u of sortedUsers) {
    if (isSessionOwnedByUserId(sessionId, u.id)) {
      return u.id;
    }
  }
  return void 0;
}
function getSessionsByUserId(userId) {
  const db = initDbFile();
  const allSessions = getWhatsAppSessions();
  const user = getUserById(userId);
  if (!user) return [];
  const userPhoneClean = user.phone ? normalizePhoneForUniqueness(user.phone) : "";
  return allSessions.filter((s) => {
    if (s.user_id && (s.user_id === user.id || s.user_id === userId)) return true;
    if (s.id && isSessionOwnedByUserId(s.id, user.id)) return true;
    if (!s.user_id && userPhoneClean && s.phone_number && normalizePhoneForUniqueness(s.phone_number) === userPhoneClean) {
      s.user_id = user.id;
      writeDbFile(db);
      return true;
    }
    return false;
  });
}
function addWhatsAppSession(sessionData) {
  const db = initDbFile();
  const cleanPhone = sessionData.phone_number ? sessionData.phone_number.replace(/\D/g, "") : "";
  let targetUserId = sessionData.user_id;
  if (!targetUserId && cleanPhone) {
    const matchedU = db.users.find((u) => u.phone && u.phone.replace(/\D/g, "") === cleanPhone);
    if (matchedU) targetUserId = matchedU.id;
  }
  if (!targetUserId && sessionData.id) {
    targetUserId = extractUserIdFromSessionId(sessionData.id, db.users);
  }
  const defaultExpiry = new Date(Date.now() + 30 * 24 * 60 * 60 * 1e3).toISOString();
  const existingIndex = db.sessions.findIndex((s) => {
    if (sessionData.id && s.id === sessionData.id) return true;
    const sClean = s.phone_number ? s.phone_number.replace(/\D/g, "") : "";
    if (cleanPhone && sClean && cleanPhone === sClean) {
      if (targetUserId && s.user_id) {
        return s.user_id === targetUserId;
      }
      return false;
    }
    return false;
  });
  if (existingIndex !== -1) {
    const existing = db.sessions[existingIndex];
    const resolvedOwnerId = targetUserId || existing.user_id;
    if (sessionData.is_primary) {
      db.sessions.forEach((s) => {
        if (!resolvedOwnerId || s.user_id === resolvedOwnerId) {
          s.is_primary = false;
        }
      });
    }
    const nowIso2 = (/* @__PURE__ */ new Date()).toISOString();
    const nextConnectedAt = sessionData.connected_at || existing.connected_at || (sessionData.status === "connected" ? nowIso2 : void 0);
    db.sessions[existingIndex] = {
      ...existing,
      ...sessionData,
      id: sessionData.id || existing.id,
      phone_number: cleanPhone || sessionData.phone_number || existing.phone_number,
      status: sessionData.status || existing.status,
      user_id: resolvedOwnerId,
      session_name: sessionData.session_name || existing.session_name,
      connected_at: nextConnectedAt,
      last_activity_at: sessionData.last_activity_at || existing.last_activity_at || (sessionData.status === "connected" ? nowIso2 : existing.connected_at),
      total_messages_count: sessionData.total_messages_count !== void 0 ? Math.max(0, Number(sessionData.total_messages_count) || 0) : existing.total_messages_count ?? 0,
      expires_at: sessionData.expires_at || existing.expires_at || defaultExpiry,
      updated_at: nowIso2
    };
    writeDbFile(db, true);
    asyncSyncSession(db.sessions[existingIndex]);
    return db.sessions[existingIndex];
  }
  const nowIso = (/* @__PURE__ */ new Date()).toISOString();
  const newSession = {
    ...sessionData,
    user_id: targetUserId,
    phone_number: cleanPhone || sessionData.phone_number,
    id: sessionData.id || `sess_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
    connected_at: sessionData.connected_at || (sessionData.status === "connected" ? nowIso : void 0),
    last_activity_at: sessionData.last_activity_at || (sessionData.status === "connected" ? nowIso : void 0),
    total_messages_count: Math.max(0, Number(sessionData.total_messages_count) || 0),
    expires_at: sessionData.expires_at || defaultExpiry,
    created_at: nowIso,
    updated_at: nowIso
  };
  if (newSession.is_primary) {
    db.sessions.forEach((s) => {
      if (!targetUserId || s.user_id === targetUserId) {
        s.is_primary = false;
      }
    });
  }
  db.sessions.push(newSession);
  writeDbFile(db, true);
  asyncSyncSession(newSession);
  return newSession;
}
function updateWhatsAppSession(id, updates) {
  const db = initDbFile();
  const index = db.sessions.findIndex((s) => s.id === id || s.phone_number === id);
  if (index === -1) return null;
  const targetOwnerId = updates.user_id || db.sessions[index].user_id;
  if (updates.is_primary) {
    db.sessions.forEach((s) => {
      if (!targetOwnerId || s.user_id === targetOwnerId) {
        s.is_primary = false;
      }
    });
  }
  db.sessions[index] = {
    ...db.sessions[index],
    ...updates,
    updated_at: (/* @__PURE__ */ new Date()).toISOString()
  };
  writeDbFile(db, true);
  asyncSyncSession(db.sessions[index]);
  return db.sessions[index];
}
function recordSessionMessageActivity(sessionId, userId, countDelta = 1, persistImmediately = false) {
  const db = initDbFile();
  const nowIso = (/* @__PURE__ */ new Date()).toISOString();
  const delta = Math.max(0, Math.floor(countDelta));
  let changed = false;
  let sess;
  if (sessionId) {
    sess = db.sessions.find((s) => s.id === sessionId || s.phone_number === sessionId);
  }
  if (!sess && userId) {
    const owned = db.sessions.filter(
      (s) => s.user_id === userId || isSessionOwnedByUserId(s.id, userId)
    );
    sess = owned.find((s) => s.status === "connected") || owned[0];
  }
  const resolvedUserId = userId || sess?.user_id || (sess ? extractUserIdFromSessionId(sess.id, db.users) : void 0);
  if (sess) {
    const prevLastAt = sess.last_activity_at ? Date.parse(sess.last_activity_at) : 0;
    const baseCount = typeof sess.total_messages_count === "number" && Number.isFinite(sess.total_messages_count) ? sess.total_messages_count : (db.messages || []).filter((m) => m.session_id === sess.id).length;
    sess.last_activity_at = nowIso;
    sess.total_messages_count = Math.max(0, baseCount + delta);
    changed = true;
    if (delta > 0 || !prevLastAt || Date.now() - prevLastAt >= 60 * 1e3) {
      asyncSyncSession(sess);
    }
  }
  if (resolvedUserId) {
    const uIdx = db.users.findIndex((u) => u.id === resolvedUserId);
    if (uIdx !== -1) {
      const u = db.users[uIdx];
      const baseUserCount = typeof u.total_messages_count === "number" && Number.isFinite(u.total_messages_count) ? u.total_messages_count : Math.max(
        Number(u.monthly_messages_sent || 0),
        (db.messages || []).filter((m) => m.user_id === u.id).length
      );
      u.total_messages_count = Math.max(0, baseUserCount + delta);
      changed = true;
      if (delta > 0) {
        asyncSyncUser(u);
      }
    }
  }
  if (changed) {
    writeDbFile(db, persistImmediately);
  }
}
function deleteWhatsAppSession(id) {
  const db = initDbFile();
  const cleanId = String(id || "").trim();
  if (!cleanId) return false;
  const initialLength = db.sessions.length;
  const isPhoneInput = /^\+?\d{8,16}$/.test(cleanId);
  const inputPhoneNorm = isPhoneInput ? normalizePhoneForUniqueness(cleanId) : "";
  const targetSession = db.sessions.find(
    (s) => s.id === cleanId || isPhoneInput && s.phone_number && normalizePhoneForUniqueness(s.phone_number) === inputPhoneNorm
  );
  const targetPhone = targetSession?.phone_number ? normalizePhoneForUniqueness(targetSession.phone_number) : inputPhoneNorm;
  db.sessions = db.sessions.filter((s) => {
    if (s.id === cleanId) return false;
    if (targetPhone && s.phone_number) {
      const sPhone = normalizePhoneForUniqueness(s.phone_number);
      const sameOwner = !targetSession?.user_id || !s.user_id || s.user_id === targetSession.user_id;
      if (sPhone === targetPhone && sameOwner) return false;
    }
    return true;
  });
  if (db.sessions.length !== initialLength) {
    writeDbFile(db, true);
    asyncDeleteSession(targetSession?.id || cleanId, targetPhone || void 0);
    return true;
  }
  return false;
}
function normalizePhoneForUniqueness(phone) {
  if (!phone) return "";
  let digits = String(phone).replace(/\D/g, "");
  if (digits.startsWith("0")) {
    digits = "62" + digits.slice(1);
  } else if (digits.startsWith("8")) {
    digits = "628" + digits.slice(1);
  }
  return digits;
}
function isUsablePublicBaseUrl(raw) {
  if (!raw || typeof raw !== "string") return false;
  const trimmed = raw.trim().replace(/\/+$/, "");
  if (!trimmed || trimmed === "MY_APP_URL") return false;
  try {
    const parsed = new URL(trimmed);
    return parsed.protocol === "https:" || parsed.protocol === "http:";
  } catch {
    return false;
  }
}
function isLoopbackBaseUrl(raw) {
  try {
    const host = new URL(raw).hostname.toLowerCase();
    return host === "localhost" || host === "127.0.0.1" || host === "::1";
  } catch {
    return false;
  }
}
function resolvePublicAppBaseUrl(fallbackOrigin) {
  const envUrl = (process.env.APP_URL || "").trim().replace(/\/+$/, "");
  if (isUsablePublicBaseUrl(envUrl) && !isLoopbackBaseUrl(envUrl)) {
    return envUrl;
  }
  const sysUrl = (getSystemConfig().app_url || "").trim().replace(/\/+$/, "");
  if (isUsablePublicBaseUrl(sysUrl) && !isLoopbackBaseUrl(sysUrl)) {
    return sysUrl;
  }
  if (isUsablePublicBaseUrl(runtimePublicBaseUrl) && !isLoopbackBaseUrl(runtimePublicBaseUrl)) {
    return runtimePublicBaseUrl;
  }
  if (fallbackOrigin && isUsablePublicBaseUrl(fallbackOrigin)) {
    return fallbackOrigin.trim().replace(/\/+$/, "");
  }
  if (isUsablePublicBaseUrl(envUrl)) return envUrl;
  if (isUsablePublicBaseUrl(runtimePublicBaseUrl)) return runtimePublicBaseUrl;
  if (isUsablePublicBaseUrl(sysUrl)) return sysUrl;
  return "";
}
function resolveProductImagePublicUrl(imageUrl, fallbackOrigin) {
  const clean = String(imageUrl || "").trim();
  if (!clean) return void 0;
  if (/^https?:\/\//i.test(clean)) return clean;
  if (clean.startsWith("/")) {
    const base = resolvePublicAppBaseUrl(fallbackOrigin);
    return base ? `${base}${clean}` : clean;
  }
  return void 0;
}
function resolveCanonicalCatalogUserId(userId) {
  const clean = String(userId || "").trim();
  if (!clean) return "";
  return getUserById(clean)?.id || clean;
}
function sanitizeCatalogBankAccounts(rawAccounts) {
  if (!Array.isArray(rawAccounts)) return [];
  const cleaned = [];
  for (const item of rawAccounts.slice(0, 10)) {
    if (!item || typeof item !== "object") continue;
    const raw = item;
    const bankName = String(raw.bank_name || "").trim().slice(0, 50);
    const accNumber = String(raw.account_number || "").trim().slice(0, 50);
    const accHolder = String(raw.account_holder || "").trim().slice(0, 80);
    if (!bankName && !accNumber) continue;
    cleaned.push({
      id: typeof raw.id === "string" && raw.id.trim() ? raw.id.trim().slice(0, 48) : `bank_${crypto2.randomBytes(4).toString("hex")}`,
      bank_name: bankName || "Bank / E-Wallet",
      account_number: accNumber,
      account_holder: accHolder
    });
  }
  return cleaned;
}
function sanitizeOrderNotifyPhone(rawPhone) {
  const clean = normalizePhoneForUniqueness(String(rawPhone || "").trim());
  if (!clean || clean.length < 8) return "";
  return clean.slice(0, 16);
}
function getCatalogForUser(userId) {
  const db = initDbFile();
  const canonicalId = resolveCanonicalCatalogUserId(userId);
  if (!Array.isArray(db.catalogProducts)) db.catalogProducts = [];
  if (!db.catalogSettings || typeof db.catalogSettings !== "object") db.catalogSettings = {};
  const existingSettings = db.catalogSettings[canonicalId] || db.catalogSettings[userId];
  const settings = existingSettings ? {
    user_id: canonicalId,
    enabled: Boolean(existingSettings.enabled),
    shop_name: existingSettings.shop_name || "",
    order_notify_phone: sanitizeOrderNotifyPhone(existingSettings.order_notify_phone),
    bank_accounts: sanitizeCatalogBankAccounts(existingSettings.bank_accounts),
    payment_notes: typeof existingSettings.payment_notes === "string" ? existingSettings.payment_notes.slice(0, 1e3) : "",
    qris_image_url: typeof existingSettings.qris_image_url === "string" ? existingSettings.qris_image_url.trim().slice(0, 512) : "",
    updated_at: existingSettings.updated_at || (/* @__PURE__ */ new Date()).toISOString()
  } : {
    user_id: canonicalId,
    enabled: false,
    shop_name: "",
    order_notify_phone: "",
    bank_accounts: [],
    payment_notes: "",
    qris_image_url: "",
    updated_at: (/* @__PURE__ */ new Date()).toISOString()
  };
  const products = db.catalogProducts.filter((p) => p.user_id === canonicalId || p.user_id === userId).sort((a, b) => new Date(b.updated_at || b.created_at).getTime() - new Date(a.updated_at || a.created_at).getTime());
  return { settings, products };
}
function resolveOrderNotificationRecipientPhone(userId) {
  if (!userId) return "";
  const canonicalId = resolveCanonicalCatalogUserId(userId);
  const { settings } = getCatalogForUser(canonicalId);
  const customNotifyPhone = sanitizeOrderNotifyPhone(settings.order_notify_phone);
  if (customNotifyPhone) {
    return customNotifyPhone;
  }
  const owner = getUserById(canonicalId) || getUserById(userId);
  const userPhone = sanitizeOrderNotifyPhone(owner?.phone);
  if (userPhone) {
    return userPhone;
  }
  const db = initDbFile();
  const userSessions = (db.sessions || []).filter(
    (s) => (s.user_id === canonicalId || s.user_id === userId) && sanitizeOrderNotifyPhone(s.phone_number)
  );
  const preferredSession = userSessions.find((s) => s.status === "connected" && s.is_primary) || userSessions.find((s) => s.status === "connected") || userSessions.find((s) => s.is_primary) || userSessions[0];
  return preferredSession ? sanitizeOrderNotifyPhone(preferredSession.phone_number) : "";
}
function getActiveCatalogForAi(userId) {
  if (!userId) {
    return { enabled: false, products: [], bankAccounts: [] };
  }
  const { settings, products } = getCatalogForUser(userId);
  const bankAccounts = sanitizeCatalogBankAccounts(settings.bank_accounts);
  const paymentNotes = settings.payment_notes?.trim() || void 0;
  const qrisImageUrl = settings.qris_image_url?.trim() || void 0;
  const qrisPublicUrl = resolveProductImagePublicUrl(qrisImageUrl);
  const orderNotifyPhone = resolveOrderNotificationRecipientPhone(userId) || void 0;
  if (!settings.enabled) {
    return {
      enabled: false,
      shopName: settings.shop_name?.trim() || void 0,
      orderNotifyPhone,
      products: [],
      bankAccounts,
      paymentNotes,
      qrisImageUrl,
      qrisPublicUrl
    };
  }
  const activeProducts = products.filter((p) => p.is_active && p.title.trim().length > 0);
  if (activeProducts.length === 0) {
    return {
      enabled: false,
      shopName: settings.shop_name?.trim() || void 0,
      orderNotifyPhone,
      products: [],
      bankAccounts,
      paymentNotes,
      qrisImageUrl,
      qrisPublicUrl
    };
  }
  return {
    enabled: true,
    shopName: settings.shop_name?.trim() || void 0,
    orderNotifyPhone,
    products: activeProducts.map((p) => ({
      title: p.title,
      description: p.description,
      price: p.price,
      image_url: resolveProductImagePublicUrl(p.image_url)
    })),
    bankAccounts,
    paymentNotes,
    qrisImageUrl,
    qrisPublicUrl
  };
}
function getSuperadminWaQueue() {
  const db = initDbFile();
  if (!Array.isArray(db.superadminWaQueue)) db.superadminWaQueue = [];
  return [...db.superadminWaQueue];
}
function enqueueSuperadminWaMessage(item) {
  const db = initDbFile();
  if (!Array.isArray(db.superadminWaQueue)) db.superadminWaQueue = [];
  const cleanPhone = normalizePhoneForUniqueness(item.recipient_phone);
  if (!cleanPhone || cleanPhone.length < 8) {
    throw new Error("Nomor WhatsApp tujuan antrean tidak valid.");
  }
  if ((item.category === "order_notification" || item.category === "session_expired") && item.invoice_number) {
    const existing = db.superadminWaQueue.find(
      (q) => q.category === item.category && q.invoice_number === item.invoice_number && normalizePhoneForUniqueness(q.recipient_phone) === cleanPhone
    );
    if (existing) {
      return existing;
    }
  }
  const entry = {
    id: `saq_${Date.now()}_${crypto2.randomBytes(4).toString("hex")}`,
    recipient_phone: cleanPhone,
    message: String(item.message || "").slice(0, 4e3),
    category: item.category,
    owner_user_id: item.owner_user_id,
    invoice_number: item.invoice_number,
    attempts: 0,
    last_error: item.last_error,
    created_at: (/* @__PURE__ */ new Date()).toISOString()
  };
  db.superadminWaQueue.push(entry);
  if (db.superadminWaQueue.length > MAX_SUPERADMIN_WA_QUEUE) {
    db.superadminWaQueue = db.superadminWaQueue.slice(-MAX_SUPERADMIN_WA_QUEUE);
  }
  writeDbFile(db, true);
  asyncSyncKv("superadminWaQueue", db.superadminWaQueue);
  return entry;
}
function updateSuperadminWaQueueItem(id, updates) {
  const db = initDbFile();
  if (!Array.isArray(db.superadminWaQueue)) return null;
  const idx = db.superadminWaQueue.findIndex((q) => q.id === id);
  if (idx === -1) return null;
  db.superadminWaQueue[idx] = { ...db.superadminWaQueue[idx], ...updates };
  writeDbFile(db, true);
  asyncSyncKv("superadminWaQueue", db.superadminWaQueue);
  return db.superadminWaQueue[idx];
}
function removeSuperadminWaQueueItem(id) {
  const db = initDbFile();
  if (!Array.isArray(db.superadminWaQueue)) return false;
  const before = db.superadminWaQueue.length;
  db.superadminWaQueue = db.superadminWaQueue.filter((q) => q.id !== id);
  if (db.superadminWaQueue.length !== before) {
    recentlyRemovedQueueIds.set(id, Date.now());
    if (recentlyRemovedQueueIds.size > 500) {
      const oldest = recentlyRemovedQueueIds.keys().next().value;
      if (oldest) recentlyRemovedQueueIds.delete(oldest);
    }
    writeDbFile(db, true);
    asyncSyncKv("superadminWaQueue", db.superadminWaQueue);
    return true;
  }
  return false;
}
function applyLiveClusterSnapshotToDb(snapshot) {
  const db = initDbFile();
  let changed = false;
  if (snapshot.usersAppMap && typeof snapshot.usersAppMap === "object" && Array.isArray(db.users)) {
    for (const u of db.users) {
      if (!u?.id || !(u.id in snapshot.usersAppMap)) continue;
      const remoteApp = normalizeAppIdValue(snapshot.usersAppMap[u.id]) || void 0;
      if ((normalizeAppIdValue(u.assigned_app_id) || void 0) !== remoteApp) {
        u.assigned_app_id = remoteApp;
        changed = true;
      }
    }
  }
  if (snapshot.systemConfig && typeof snapshot.systemConfig === "object") {
    const nextNodes = snapshot.systemConfig.app_nodes !== void 0 ? normalizeAppNodes(snapshot.systemConfig.app_nodes) : normalizeAppNodes(db.systemConfig.app_nodes);
    const nextKillTargetIps = snapshot.systemConfig.kill_target_ips !== void 0 ? normalizeKillTargetIps(snapshot.systemConfig.kill_target_ips) : normalizeKillTargetIps(db.systemConfig.kill_target_ips);
    const nextAdminPhone = snapshot.systemConfig.admin_notify_phone !== void 0 ? normalizeAdminNotifyPhone(snapshot.systemConfig.admin_notify_phone) : normalizeAdminNotifyPhone(db.systemConfig.admin_notify_phone);
    const nextTelegramToken = snapshot.systemConfig.telegram_bot_token !== void 0 ? normalizeStoredTelegramToken(snapshot.systemConfig.telegram_bot_token) : normalizeStoredTelegramToken(db.systemConfig.telegram_bot_token);
    const nextTelegramChatId = snapshot.systemConfig.telegram_chat_id !== void 0 ? normalizeTelegramChatId(snapshot.systemConfig.telegram_chat_id) : normalizeTelegramChatId(db.systemConfig.telegram_chat_id);
    const nextTelegramEnabled = snapshot.systemConfig.telegram_enabled !== void 0 ? Boolean(snapshot.systemConfig.telegram_enabled) : db.systemConfig.telegram_enabled !== false;
    const nextTelegramConfigs = snapshot.systemConfig.telegram_configs !== void 0 ? normalizeTelegramConfigs(snapshot.systemConfig.telegram_configs) : normalizeTelegramConfigs(db.systemConfig.telegram_configs);
    db.systemConfig = {
      ...db.systemConfig,
      app_nodes: nextNodes,
      kill_target_ips: nextKillTargetIps,
      admin_notify_phone: nextAdminPhone,
      telegram_bot_token: nextTelegramToken,
      telegram_chat_id: nextTelegramChatId,
      telegram_enabled: nextTelegramEnabled,
      telegram_configs: nextTelegramConfigs
    };
    changed = true;
  }
  if (Array.isArray(snapshot.sessions)) {
    const localMap = new Map(db.sessions.map((s) => [s.id, s]));
    const remoteIds = new Set(snapshot.sessions.map((s) => s.id));
    const merged = snapshot.sessions.map((rs) => {
      const local = localMap.get(rs.id);
      const localTs = local?.last_assignment_at ? Date.parse(local.last_assignment_at) : 0;
      const remoteTs = rs.last_assignment_at ? Date.parse(rs.last_assignment_at) : 0;
      const preferLocalAssignment = localTs > remoteTs && Date.now() - localTs < 2e4;
      const effectiveAssignStatus = preferLocalAssignment ? local?.assignment_status : rs.assignment_status || local?.assignment_status;
      const isReleased = effectiveAssignStatus === "released";
      return {
        ...local,
        ...rs,
        user_id: rs.user_id || local?.user_id || extractUserIdFromSessionId(rs.id, db.users || []),
        status: isReleased ? "disconnected" : rs.status || local?.status || "disconnected",
        assigned_app_id: isReleased ? void 0 : preferLocalAssignment ? normalizeAppIdValue(local?.assigned_app_id) || void 0 : normalizeAppIdValue(rs.assigned_app_id) || void 0,
        assigned_server_ip: void 0,
        connected_app_id: isReleased ? void 0 : preferLocalAssignment ? normalizeAppIdValue(local?.connected_app_id) || void 0 : normalizeAppIdValue(rs.connected_app_id) || void 0,
        connected_server_ip: isReleased ? void 0 : preferLocalAssignment ? normalizeServerIpValue(local?.connected_server_ip) || normalizeServerIpValue(rs.connected_server_ip) || void 0 : normalizeServerIpValue(rs.connected_server_ip) || void 0,
        failed_app_ids: preferLocalAssignment ? local?.failed_app_ids || [] : Array.isArray(rs.failed_app_ids) ? rs.failed_app_ids.map(normalizeAppIdValue).filter(Boolean) : [],
        assignment_status: effectiveAssignStatus,
        assignment_error: preferLocalAssignment ? local?.assignment_error : rs.assignment_error,
        last_assignment_at: preferLocalAssignment ? local?.last_assignment_at : rs.last_assignment_at
      };
    });
    for (const localSess of db.sessions) {
      if (localSess.id && !remoteIds.has(localSess.id) && (localSess.status === "connected" || Boolean(localSess.connected_at))) {
        merged.push(localSess);
      }
    }
    db.sessions = merged;
    changed = true;
  }
  if (Array.isArray(snapshot.superadminWaQueue)) {
    const now = Date.now();
    for (const [qid, removedAt] of recentlyRemovedQueueIds.entries()) {
      if (now - removedAt > 12e4) recentlyRemovedQueueIds.delete(qid);
    }
    const mergedQueue = /* @__PURE__ */ new Map();
    for (const item of snapshot.superadminWaQueue) {
      if (item?.id && !recentlyRemovedQueueIds.has(item.id)) {
        mergedQueue.set(item.id, item);
      }
    }
    for (const item of db.superadminWaQueue || []) {
      if (item?.id && !recentlyRemovedQueueIds.has(item.id)) {
        mergedQueue.set(item.id, item);
      }
    }
    db.superadminWaQueue = Array.from(mergedQueue.values()).slice(-MAX_SUPERADMIN_WA_QUEUE);
    changed = true;
  }
  if (changed) {
    writeDbFile(db, false);
  }
}
function hasSessionExpiryAlertSent(keys) {
  const db = initDbFile();
  const map = db.expiredSessionAlertKeys;
  if (!map || typeof map !== "object") return false;
  return keys.some((k) => Boolean(k && map[k]));
}
function markSessionExpiryAlertSent(keys) {
  const cleanKeys = keys.map((k) => String(k || "").trim()).filter(Boolean);
  if (cleanKeys.length === 0) return;
  const db = initDbFile();
  if (!db.expiredSessionAlertKeys || typeof db.expiredSessionAlertKeys !== "object") {
    db.expiredSessionAlertKeys = {};
  }
  const nowIso = (/* @__PURE__ */ new Date()).toISOString();
  for (const k of cleanKeys) {
    db.expiredSessionAlertKeys[k] = nowIso;
  }
  const entries = Object.entries(db.expiredSessionAlertKeys);
  if (entries.length > 1e3) {
    db.expiredSessionAlertKeys = Object.fromEntries(entries.slice(-1e3));
  }
  writeDbFile(db, true);
  asyncSyncKv("expiredSessionAlertKeys", db.expiredSessionAlertKeys);
}
function clearSessionExpiryAlertSent(keys) {
  const cleanKeys = keys.map((k) => String(k || "").trim()).filter(Boolean);
  if (cleanKeys.length === 0) return;
  const db = initDbFile();
  const map = db.expiredSessionAlertKeys;
  if (!map || typeof map !== "object") return;
  let changed = false;
  for (const k of cleanKeys) {
    if (k in map) {
      delete map[k];
      changed = true;
    }
  }
  if (changed) {
    writeDbFile(db, true);
    asyncSyncKv("expiredSessionAlertKeys", db.expiredSessionAlertKeys);
  }
}
function getPendingSessionExpiryAlerts() {
  const db = initDbFile();
  if (!Array.isArray(db.pendingSessionExpiryAlerts)) db.pendingSessionExpiryAlerts = [];
  return [...db.pendingSessionExpiryAlerts];
}
function upsertPendingSessionExpiryAlert(params) {
  const db = initDbFile();
  if (!Array.isArray(db.pendingSessionExpiryAlerts)) {
    db.pendingSessionExpiryAlerts = [];
  }
  const nowMs = Date.now();
  const nowIso = new Date(nowMs).toISOString();
  const cleanKey = String(params.key || "").trim();
  const existingIdx = db.pendingSessionExpiryAlerts.findIndex((a) => a.key === cleanKey);
  if (existingIdx !== -1) {
    const prev = db.pendingSessionExpiryAlerts[existingIdx];
    const updated = {
      ...prev,
      session_id: params.session_id || prev.session_id,
      session_name: params.session_name || prev.session_name,
      expired_phone: params.expired_phone || prev.expired_phone,
      reason: params.reason || prev.reason,
      updated_at: nowIso
    };
    db.pendingSessionExpiryAlerts[existingIdx] = updated;
    writeDbFile(db, true);
    asyncSyncKv("pendingSessionExpiryAlerts", db.pendingSessionExpiryAlerts);
    return { item: updated, created: false };
  }
  const created = {
    id: `psea_${nowMs}_${crypto2.randomBytes(4).toString("hex")}`,
    key: cleanKey,
    user_id: params.user_id,
    session_id: params.session_id,
    session_name: params.session_name,
    expired_phone: params.expired_phone,
    first_detected_at: nowIso,
    notify_after: new Date(nowMs + Math.max(0, params.grace_ms)).toISOString(),
    reason: params.reason,
    updated_at: nowIso
  };
  db.pendingSessionExpiryAlerts.push(created);
  if (db.pendingSessionExpiryAlerts.length > 500) {
    db.pendingSessionExpiryAlerts = db.pendingSessionExpiryAlerts.slice(-500);
  }
  writeDbFile(db, true);
  asyncSyncKv("pendingSessionExpiryAlerts", db.pendingSessionExpiryAlerts);
  return { item: created, created: true };
}
function removePendingSessionExpiryAlert(idOrKey) {
  const db = initDbFile();
  if (!Array.isArray(db.pendingSessionExpiryAlerts) || !idOrKey) return false;
  const before = db.pendingSessionExpiryAlerts.length;
  db.pendingSessionExpiryAlerts = db.pendingSessionExpiryAlerts.filter(
    (a) => a.id !== idOrKey && a.key !== idOrKey
  );
  if (db.pendingSessionExpiryAlerts.length !== before) {
    writeDbFile(db, true);
    asyncSyncKv("pendingSessionExpiryAlerts", db.pendingSessionExpiryAlerts);
    return true;
  }
  return false;
}
function clearPendingSessionExpiryAlertsByKeys(params) {
  const db = initDbFile();
  if (!Array.isArray(db.pendingSessionExpiryAlerts) || db.pendingSessionExpiryAlerts.length === 0) {
    return 0;
  }
  const cleanPhone = params.phone ? normalizePhoneForUniqueness(params.phone) : "";
  const before = db.pendingSessionExpiryAlerts.length;
  db.pendingSessionExpiryAlerts = db.pendingSessionExpiryAlerts.filter((a) => {
    if (params.userId && a.user_id !== params.userId) return true;
    const matchSid = Boolean(params.sessionId && a.session_id === params.sessionId);
    const matchPhone = Boolean(
      cleanPhone && a.expired_phone && normalizePhoneForUniqueness(a.expired_phone) === cleanPhone
    );
    return !(matchSid || matchPhone);
  });
  const removed = before - db.pendingSessionExpiryAlerts.length;
  if (removed > 0) {
    writeDbFile(db, true);
    asyncSyncKv("pendingSessionExpiryAlerts", db.pendingSessionExpiryAlerts);
  }
  return removed;
}
function scheduleThrottledKvSync(key, valueGetter, delayMs = 8e3) {
  markMutated();
  if (throttledKvTimers.has(key)) return;
  const timer = setTimeout(() => {
    throttledKvTimers.delete(key);
    try {
      asyncSyncKv(key, valueGetter());
    } catch {
    }
  }, delayMs);
  timer.unref?.();
  throttledKvTimers.set(key, timer);
}
function pruneTimestampMap(map, retentionMs, maxEntries, now = Date.now()) {
  const cutoff = now - retentionMs;
  const entries = Object.entries(map || {}).filter(
    ([k, v]) => Boolean(k) && typeof v === "number" && Number.isFinite(v) && v >= cutoff
  );
  if (entries.length > maxEntries) {
    entries.sort((a, b) => a[1] - b[1]);
    return Object.fromEntries(entries.slice(-maxEntries));
  }
  return Object.fromEntries(entries);
}
function hasIncomingMessageBeenHandled(wamId, sessionId) {
  const cleanId = String(wamId || "").trim();
  if (!cleanId) return false;
  const db = initDbFile();
  const map = db.handledIncomingMessages;
  if (map && typeof map === "object") {
    if (sessionId && map[`${sessionId}::${cleanId}`]) return true;
    if (map[cleanId]) return true;
  }
  return (db.messages || []).some(
    (m) => m.wam_id === cleanId && (!sessionId || !m.session_id || m.session_id === sessionId) && m.direction === "incoming" && (m.status === "Sukses" || m.status === "Diterima")
  );
}
function markIncomingMessagesHandled(wamIds, sessionId, timestampMs = Date.now()) {
  const cleanIds = Array.from(
    new Set(wamIds.map((id) => String(id || "").trim()).filter(Boolean))
  );
  if (cleanIds.length === 0) return;
  const db = initDbFile();
  if (!db.handledIncomingMessages || typeof db.handledIncomingMessages !== "object") {
    db.handledIncomingMessages = {};
  }
  const now = Date.now();
  const recordTs = Number.isFinite(timestampMs) && timestampMs > 0 ? Math.max(timestampMs, now - HANDLED_MSG_RETENTION_MS + 6e4) : now;
  for (const id of cleanIds) {
    const key = sessionId ? `${sessionId}::${id}` : id;
    db.handledIncomingMessages[key] = Math.max(db.handledIncomingMessages[key] || 0, recordTs);
  }
  if (Object.keys(db.handledIncomingMessages).length > MAX_HANDLED_INCOMING_MESSAGES) {
    db.handledIncomingMessages = pruneTimestampMap(
      db.handledIncomingMessages,
      HANDLED_MSG_RETENTION_MS,
      MAX_HANDLED_INCOMING_MESSAGES,
      now
    );
  }
  writeDbFile(db);
  scheduleThrottledKvSync("handledIncomingMessages", () => initDbFile().handledIncomingMessages || {});
}
function getChatReplyWatermark(sessionId, cleanPhone, remoteJid) {
  if (!sessionId) return 0;
  const db = initDbFile();
  const map = db.chatReplyWatermark;
  if (!map || typeof map !== "object") return 0;
  let maxTs = 0;
  const normPhone = cleanPhone ? normalizePhoneForUniqueness(cleanPhone) : "";
  if (normPhone && normPhone.length >= 8) {
    const ts = Number(map[`${sessionId}::pn:${normPhone}`] || 0);
    if (Number.isFinite(ts) && ts > maxTs) maxTs = ts;
  }
  const cleanJid = String(remoteJid || "").trim();
  if (cleanJid) {
    const ts = Number(map[`${sessionId}::jid:${cleanJid}`] || 0);
    if (Number.isFinite(ts) && ts > maxTs) maxTs = ts;
  }
  return maxTs;
}
function recordChatReplyWatermark(sessionId, params) {
  if (!sessionId) return;
  const normPhone = params.cleanPhone ? normalizePhoneForUniqueness(params.cleanPhone) : "";
  const cleanJid = String(params.remoteJid || "").trim();
  if ((!normPhone || normPhone.length < 8) && !cleanJid) return;
  const db = initDbFile();
  if (!db.chatReplyWatermark || typeof db.chatReplyWatermark !== "object") {
    db.chatReplyWatermark = {};
  }
  const tsMs = typeof params.timestampMs === "number" && Number.isFinite(params.timestampMs) && params.timestampMs > 0 ? params.timestampMs : Date.now();
  let changed = false;
  if (normPhone && normPhone.length >= 8) {
    const pnKey = `${sessionId}::pn:${normPhone}`;
    if (tsMs > (db.chatReplyWatermark[pnKey] || 0)) {
      db.chatReplyWatermark[pnKey] = tsMs;
      changed = true;
    }
  }
  if (cleanJid) {
    const jidKey = `${sessionId}::jid:${cleanJid}`;
    if (tsMs > (db.chatReplyWatermark[jidKey] || 0)) {
      db.chatReplyWatermark[jidKey] = tsMs;
      changed = true;
    }
  }
  if (!changed) return;
  if (Object.keys(db.chatReplyWatermark).length > MAX_CHAT_REPLY_WATERMARKS) {
    db.chatReplyWatermark = pruneTimestampMap(
      db.chatReplyWatermark,
      CHAT_WATERMARK_RETENTION_MS,
      MAX_CHAT_REPLY_WATERMARKS
    );
  }
  writeDbFile(db);
  scheduleThrottledKvSync("chatReplyWatermark", () => initDbFile().chatReplyWatermark || {});
}
function getPendingMissedMessages(sessionId) {
  const db = initDbFile();
  if (!Array.isArray(db.pendingMissedMessages)) {
    db.pendingMissedMessages = [];
    return [];
  }
  const cutoff = Date.now() - MISSED_MSG_RETENTION_MS;
  const beforeLen = db.pendingMissedMessages.length;
  db.pendingMissedMessages = db.pendingMissedMessages.filter((item) => {
    if (!item?.id || !item?.session_id || !item?.user_id || !item?.wam_id) return false;
    const createdMs = Date.parse(item.created_at || "");
    return !Number.isFinite(createdMs) || createdMs >= cutoff;
  });
  if (db.pendingMissedMessages.length !== beforeLen) {
    writeDbFile(db);
    scheduleThrottledKvSync("pendingMissedMessages", () => initDbFile().pendingMissedMessages || [], 4e3);
  }
  const list = sessionId ? db.pendingMissedMessages.filter((item) => item.session_id === sessionId) : db.pendingMissedMessages;
  return [...list].sort((a, b) => (a.message_ts_ms || 0) - (b.message_ts_ms || 0));
}
function upsertPendingMissedMessage(item) {
  const cleanSid = String(item.session_id || "").trim();
  const cleanUid = String(item.user_id || "").trim();
  const cleanPhone = String(item.sender_phone || "").trim();
  const cleanWamId = String(item.wam_id || "").trim();
  const cleanBody = String(item.message_body || "").trim();
  const cleanRemoteJid = String(item.remote_jid || "").trim();
  if (!cleanSid || !cleanUid || !cleanPhone || !cleanWamId || !cleanBody || !cleanRemoteJid) {
    return null;
  }
  const db = initDbFile();
  if (!Array.isArray(db.pendingMissedMessages)) {
    db.pendingMissedMessages = [];
  }
  const nowMs = Date.now();
  const retryAt = nowMs + Math.max(2e3, item.nextRetryDelayMs ?? 15e3);
  const incomingExtras = Array.isArray(item.extra_wam_ids) ? item.extra_wam_ids.filter(Boolean) : [];
  const existingIdx = db.pendingMissedMessages.findIndex(
    (q) => q.session_id === cleanSid && q.user_id === cleanUid && (q.remote_jid === cleanRemoteJid || q.sender_phone === cleanPhone)
  );
  if (existingIdx !== -1) {
    const prev = db.pendingMissedMessages[existingIdx];
    const knownWamIds = /* @__PURE__ */ new Set([prev.wam_id, ...prev.extra_wam_ids || []]);
    const isDuplicateWam = knownWamIds.has(cleanWamId);
    const nextBody = isDuplicateWam ? prev.message_body : prev.message_body === cleanBody ? prev.message_body : `${prev.message_body}
${cleanBody}`.slice(-1500);
    for (const id of [cleanWamId, ...incomingExtras]) {
      knownWamIds.add(id);
    }
    const allIds = Array.from(knownWamIds);
    const updated = {
      ...prev,
      sender_name: item.sender_name || prev.sender_name,
      fallback_pn_jid: item.fallback_pn_jid || prev.fallback_pn_jid,
      message_body: nextBody,
      has_media: Boolean(prev.has_media || item.has_media),
      extra_wam_ids: allIds.filter((id) => id !== prev.wam_id).slice(-12),
      message_ts_ms: Math.max(prev.message_ts_ms || 0, item.message_ts_ms || nowMs),
      last_error: item.last_error || prev.last_error,
      next_retry_at: Math.min(prev.next_retry_at || retryAt, retryAt)
    };
    db.pendingMissedMessages[existingIdx] = updated;
    writeDbFile(db, true);
    scheduleThrottledKvSync("pendingMissedMessages", () => initDbFile().pendingMissedMessages || [], 4e3);
    return updated;
  }
  const created = {
    id: `pmm_${nowMs}_${crypto2.randomBytes(4).toString("hex")}`,
    wam_id: cleanWamId,
    extra_wam_ids: incomingExtras.filter((id) => id !== cleanWamId).slice(-12),
    session_id: cleanSid,
    user_id: cleanUid,
    sender_phone: cleanPhone,
    sender_name: String(item.sender_name || "Pengguna WhatsApp").slice(0, 100),
    remote_jid: cleanRemoteJid,
    fallback_pn_jid: item.fallback_pn_jid,
    message_body: cleanBody.slice(0, 1500),
    has_media: Boolean(item.has_media),
    message_ts_ms: item.message_ts_ms || nowMs,
    attempts: 0,
    last_error: item.last_error,
    next_retry_at: retryAt,
    created_at: new Date(nowMs).toISOString()
  };
  db.pendingMissedMessages.push(created);
  if (db.pendingMissedMessages.length > MAX_PENDING_MISSED_MESSAGES) {
    db.pendingMissedMessages = db.pendingMissedMessages.slice(-MAX_PENDING_MISSED_MESSAGES);
  }
  writeDbFile(db, true);
  scheduleThrottledKvSync("pendingMissedMessages", () => initDbFile().pendingMissedMessages || [], 4e3);
  return created;
}
function updatePendingMissedMessage(id, updates) {
  if (!id) return null;
  const db = initDbFile();
  if (!Array.isArray(db.pendingMissedMessages)) return null;
  const idx = db.pendingMissedMessages.findIndex((q) => q.id === id);
  if (idx === -1) return null;
  db.pendingMissedMessages[idx] = { ...db.pendingMissedMessages[idx], ...updates };
  writeDbFile(db);
  scheduleThrottledKvSync("pendingMissedMessages", () => initDbFile().pendingMissedMessages || [], 4e3);
  return db.pendingMissedMessages[idx];
}
function removePendingMissedMessage(id) {
  if (!id) return false;
  const db = initDbFile();
  if (!Array.isArray(db.pendingMissedMessages) || db.pendingMissedMessages.length === 0) return false;
  const before = db.pendingMissedMessages.length;
  db.pendingMissedMessages = db.pendingMissedMessages.filter((q) => q.id !== id);
  if (db.pendingMissedMessages.length !== before) {
    writeDbFile(db, true);
    scheduleThrottledKvSync("pendingMissedMessages", () => initDbFile().pendingMissedMessages || [], 4e3);
    return true;
  }
  return false;
}
function clearPendingMissedMessagesForSession(sessionId) {
  if (!sessionId) return 0;
  const db = initDbFile();
  if (!Array.isArray(db.pendingMissedMessages) || db.pendingMissedMessages.length === 0) return 0;
  const before = db.pendingMissedMessages.length;
  db.pendingMissedMessages = db.pendingMissedMessages.filter((q) => q.session_id !== sessionId);
  const removed = before - db.pendingMissedMessages.length;
  if (removed > 0) {
    writeDbFile(db, true);
    scheduleThrottledKvSync("pendingMissedMessages", () => initDbFile().pendingMissedMessages || [], 4e3);
  }
  return removed;
}
var RUNTIME_DB_PATH, cachedMemoryDb, lastLocalMutationAt, lastLoadedDbMtimeMs, lastDiskStatCheckedAt, pendingPersistTimer, isPersistingLocalDb, needsAnotherPersist, mysqlModulePromise, isMysqlSyncInFlight, mysqlBgSyncTimer, LOG_RETENTION_DAYS, LOG_RETENTION_MS, DEFAULT_ANTIBAN, DEFAULT_AI_CONFIG, DEFAULT_QRIS_CONFIG, DEFAULT_WHITELABEL, DEFAULT_SUBSCRIPTION_PLANS, DEFAULT_FREE_AUTO_REPLY_HOURS, DEFAULT_MAX_GLOBAL_SESSIONS, SESSION_INACTIVITY_PURGE_DAYS, SESSION_INACTIVITY_PURGE_MS, DEFAULT_SYSTEM_CONFIG, activeRemoteChallenges, challengeCleanupTimer, lastLogPurgeCheckAt, LOG_PURGE_COOLDOWN_MS, logCleanupTimer, slotAllocationChain, addSession, updateSession, deleteSession, updateUser, isPhoneMetaAiVerifiedForUser, markUserMetaAiVerified, resolveEffectiveSessionAiSettings, getAntiBanSettings, runtimePublicBaseUrl, MAX_SUPERADMIN_WA_QUEUE, recentlyRemovedQueueIds, HANDLED_MSG_RETENTION_MS, MAX_HANDLED_INCOMING_MESSAGES, CHAT_WATERMARK_RETENTION_MS, MAX_CHAT_REPLY_WATERMARKS, MISSED_MSG_RETENTION_MS, MAX_PENDING_MISSED_MESSAGES, throttledKvTimers;
var init_db = __esm({
  "src/lib/db.ts"() {
    init_security();
    RUNTIME_DB_PATH = path2.resolve(process.cwd(), ".runtime_db.enc");
    cachedMemoryDb = null;
    lastLocalMutationAt = 0;
    lastLoadedDbMtimeMs = 0;
    lastDiskStatCheckedAt = 0;
    pendingPersistTimer = null;
    isPersistingLocalDb = false;
    needsAnotherPersist = false;
    mysqlModulePromise = null;
    isMysqlSyncInFlight = false;
    mysqlBgSyncTimer = setInterval(() => {
      if (isMysqlSyncInFlight || Date.now() - lastLocalMutationAt < 4e3) {
        return;
      }
      isMysqlSyncInFlight = true;
      getMysqlModule().then(async (m) => {
        if (!m.isMysqlConfigured()) return;
        const remote = await m.fetchDatabaseFromMysql();
        if (Date.now() - lastLocalMutationAt < 4e3) {
          return;
        }
        if (remote) {
          replaceRuntimeDatabaseFromMysql(remote);
        }
      }).catch(() => {
      }).finally(() => {
        isMysqlSyncInFlight = false;
      });
    }, 3 * 60 * 1e3);
    mysqlBgSyncTimer.unref?.();
    LOG_RETENTION_DAYS = 7;
    LOG_RETENTION_MS = LOG_RETENTION_DAYS * 24 * 60 * 60 * 1e3;
    DEFAULT_ANTIBAN = {
      enabled: true,
      min_delay_seconds: 1,
      max_delay_seconds: 4,
      typing_simulation: true,
      max_messages_per_minute: 15,
      daily_quota_per_number: 500,
      read_receipt_simulation: true
    };
    DEFAULT_AI_CONFIG = {
      enabled: true,
      system_prompt: "Anda adalah Customer Service Assistant untuk bisnis yang ramah nama kamu Anita, sopan, ringkas, dan solutif. Jawab pertanyaan pelanggan dengan ramah dalam Bahasa Indonesia yang natural. Jika tidak tahu pasti mengenai stok atau harga spesifik, sampaikan bahwa tim CS manusia akan segera merespons. Ingat jangan menjawab sesuatu yg kamu tidak ketahui pasti jawab saja team kami akan segera membalas untuk hal itu.",
      model: "meta-ai-whatsapp",
      fallback_when_no_rule: true,
      temperature: 0.7,
      offline_fallback_message: "Halo! Terima kasih telah menghubungi kami. Maaf saat ini petugas/CS kami sedang offline. Kami akan membalas pesan Anda sesegera mungkin."
    };
    DEFAULT_QRIS_CONFIG = {
      image_url: "https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=00020101021126580014ID.LINKAJA.WWW01189360091432263435130208123456785204581253033605802ID5913JAPRIIN6007BANDUNG61054011562070703A016304E8A2",
      account_name: "Japriin Official",
      bank_name: "QRIS (Semua Bank / E-Wallet) & Bank BCA",
      account_number: "123-456-7890 a.n Japriin Media",
      instructions: "1. Buka aplikasi M-Banking atau E-Wallet (BCA, Mandiri, BRI, GoPay, OVO, Dana, ShopeePay)\n2. Scan barcode QRIS di atas atau transfer ke rekening BCA 123-456-7890\n3. Masukkan nominal sesuai harga paket yang dipilih\n4. Simpan / Screenshot bukti struk transfer\n5. Upload foto struk di bawah untuk diperiksa oleh Superadmin"
    };
    DEFAULT_WHITELABEL = {
      app_name: "Japriin",
      tagline: "Whitelabel WhatsApp Gateway, Interactive REST API & Remote AI Bot",
      logo_url: "/logo.jpg",
      company_name: "Maudigi Teknologi Indonesia",
      support_phone: "081234567890",
      primary_bot_phone: "085761010112",
      primary_bot_name: "Japriin Assistant Pusat",
      footer_text: "Dikelola secara profesional oleh maudigi.com",
      api_enabled: true,
      updated_at: (/* @__PURE__ */ new Date()).toISOString()
    };
    DEFAULT_SUBSCRIPTION_PLANS = [
      {
        id: "free",
        name: "Paket Gratis",
        price: 0,
        period: "selamanya",
        max_sessions: 1,
        daily_msg_limit: 100,
        monthly_msg_limit: 500,
        daily_ai_limit: 100,
        monthly_ai_limit: 500,
        is_active: true,
        features: [
          "1 Nomor WhatsApp Terhubung",
          "Balas Otomatis Penuh Tanpa Batas Jam",
          "100 Pesan Otomatis / Hari",
          "Respon AI Tanpa Batas Terpisah (Ikuti Batas Chat Harian)",
          "100% Tanpa Watermark (Pesan Murni)",
          "Akses Remote Bot Assistant WA",
          "Aturan Balas Otomatis Bebas Atur",
          "Simulasi Ketik Proteksi Anti-Ban",
          "Langsung Aktif Tanpa Biaya (Rp 0)"
        ]
      },
      {
        id: "starter",
        name: "Paket Starter",
        price: 5e4,
        period: "/ bulan",
        max_sessions: 1,
        daily_msg_limit: 500,
        monthly_msg_limit: 15e3,
        daily_ai_limit: 150,
        monthly_ai_limit: 3e3,
        is_active: true,
        features: [
          "1 Nomor WhatsApp Terhubung",
          "500 Pesan Otomatis / Hari",
          "Batas Respon AI 150 / Hari (3.000/bln)",
          "100% Tanpa Watermark / No Ads",
          "Prioritas Slot Kapasitas Server (Aman dari Geseran)",
          "Akses Developer REST API v1",
          "Sistem Proteksi Anti-Ban Guard",
          "Aturan Balas Otomatis Tanpa Batas",
          "Log Pesan & Export data.sql"
        ]
      },
      {
        id: "business",
        name: "Paket Business",
        price: 85e3,
        period: "/ bulan",
        max_sessions: 1,
        daily_msg_limit: 2500,
        monthly_msg_limit: 75e3,
        daily_ai_limit: 500,
        monthly_ai_limit: 15e3,
        popular: true,
        is_active: true,
        features: [
          "1 Nomor WhatsApp Terhubung",
          "2.500 Pesan Otomatis / Hari",
          "Batas Respon AI 500 / Hari (15.000/bln)",
          "100% Tanpa Watermark (Whitelabel)",
          "Prioritas Slot Kapasitas Server (Aman dari Geseran)",
          "Interactive REST API v1 Terbuka",
          "Advance Anti-Ban & Jeda Acak",
          "Simulasi Ketik Status & Read Receipt",
          "Fitur Balas Otomatis AI (Multi-Key)"
        ]
      },
      {
        id: "pro",
        name: "Paket Unlimited Pro",
        price: 99e3,
        period: "/ bulan",
        max_sessions: 1,
        daily_msg_limit: 1e4,
        monthly_msg_limit: 3e5,
        daily_ai_limit: 2e3,
        monthly_ai_limit: 6e4,
        is_active: true,
        features: [
          "1 Nomor WhatsApp Terhubung",
          "10.000 Pesan Otomatis / Hari",
          "Batas Respon AI 2.000 / Hari (60.000/bln)",
          "100% Tanpa Watermark / Pure Clean",
          "Prioritas Slot Kapasitas Server (Aman dari Geseran)",
          "Prioritas Anti-Ban Behavioral Guard",
          "Fitur Balas AI Multi-Key Tanpa Batas",
          "Akses Developer REST API v1 & DB Cloud Sync"
        ]
      }
    ];
    DEFAULT_FREE_AUTO_REPLY_HOURS = 0;
    DEFAULT_MAX_GLOBAL_SESSIONS = 10;
    SESSION_INACTIVITY_PURGE_DAYS = 3;
    SESSION_INACTIVITY_PURGE_MS = SESSION_INACTIVITY_PURGE_DAYS * 24 * 60 * 60 * 1e3;
    DEFAULT_SYSTEM_CONFIG = {
      app_url: process.env.APP_URL || "http://localhost:3000",
      mysql_host: process.env.MYSQL_HOST || "",
      mysql_port: parseInt(process.env.MYSQL_PORT || "3306", 10) || 3306,
      mysql_user: process.env.MYSQL_USER || "",
      mysql_password: process.env.MYSQL_PASSWORD ? encryptData(process.env.MYSQL_PASSWORD) : "",
      mysql_database: process.env.MYSQL_DATABASE || "",
      free_auto_reply_hours: DEFAULT_FREE_AUTO_REPLY_HOURS,
      max_global_sessions: DEFAULT_MAX_GLOBAL_SESSIONS,
      ai_config: DEFAULT_AI_CONFIG,
      qris_config: DEFAULT_QRIS_CONFIG,
      whitelabel_config: DEFAULT_WHITELABEL,
      app_nodes: [],
      kill_target_ips: [],
      admin_notify_phone: process.env.INITIAL_ADMIN_PHONE ? normalizeAdminNotifyPhone(process.env.INITIAL_ADMIN_PHONE) : "",
      telegram_bot_token: "",
      telegram_chat_id: "",
      telegram_enabled: true,
      telegram_configs: []
    };
    activeRemoteChallenges = /* @__PURE__ */ new Map();
    challengeCleanupTimer = setInterval(() => {
      if (activeRemoteChallenges.size === 0) return;
      const now = Date.now();
      for (const [phone, challenge] of activeRemoteChallenges.entries()) {
        if (challenge.expires_at < now) {
          activeRemoteChallenges.delete(phone);
        }
      }
    }, 6e4);
    challengeCleanupTimer.unref?.();
    lastLogPurgeCheckAt = 0;
    LOG_PURGE_COOLDOWN_MS = 5 * 60 * 1e3;
    logCleanupTimer = setInterval(() => {
      try {
        purgeExpiredLogs(void 0, true);
        getMysqlModule().then((m) => {
          if (m.isMysqlConfigured()) return m.purgeOldMysqlLogs();
        }).catch(() => {
        });
      } catch {
      }
    }, 30 * 60 * 1e3);
    logCleanupTimer.unref?.();
    slotAllocationChain = Promise.resolve();
    addSession = addWhatsAppSession;
    updateSession = updateWhatsAppSession;
    deleteSession = deleteWhatsAppSession;
    updateUser = (id, updates) => {
      const db = initDbFile();
      const idx = db.users.findIndex((u) => u.id === id);
      if (idx === -1) return null;
      db.users[idx] = { ...db.users[idx], ...updates };
      writeDbFile(db);
      asyncSyncUser(db.users[idx]);
      return db.users[idx];
    };
    isPhoneMetaAiVerifiedForUser = (user, phone) => {
      if (!user) return false;
      const cleanPhone = phone ? normalizePhoneForUniqueness(phone) : "";
      const list = Array.isArray(user.meta_ai_verified_phones) ? user.meta_ai_verified_phones.map((p) => normalizePhoneForUniqueness(p)).filter(Boolean) : [];
      if (cleanPhone) {
        if (list.includes(cleanPhone)) return true;
        if (user.meta_ai_verified && user.meta_ai_verified_phone) {
          return normalizePhoneForUniqueness(user.meta_ai_verified_phone) === cleanPhone;
        }
        return false;
      }
      return Boolean(user.meta_ai_verified && (list.length > 0 || user.meta_ai_verified_phone));
    };
    markUserMetaAiVerified = (userId, phoneNumber) => {
      const db = initDbFile();
      const idx = db.users.findIndex((u) => u.id === userId);
      if (idx === -1) return null;
      const cleanPhone = normalizePhoneForUniqueness(phoneNumber || "");
      const current = db.users[idx];
      const existingList = Array.isArray(current.meta_ai_verified_phones) ? current.meta_ai_verified_phones.map((p) => normalizePhoneForUniqueness(p)).filter(Boolean) : [];
      if (cleanPhone && !existingList.includes(cleanPhone)) {
        existingList.push(cleanPhone);
      }
      const cappedList = existingList.slice(-20);
      const nowIso = (/* @__PURE__ */ new Date()).toISOString();
      db.users[idx] = {
        ...current,
        meta_ai_verified: true,
        meta_ai_verified_phone: cleanPhone || current.meta_ai_verified_phone || "",
        meta_ai_verified_phones: cappedList,
        meta_ai_verified_at: nowIso
      };
      writeDbFile(db);
      asyncSyncUser(db.users[idx]);
      return db.users[idx];
    };
    resolveEffectiveSessionAiSettings = (params) => {
      const { user, session, sysConfig } = params;
      const autoReplyStatus = user ? getUserAutoReplyStatus(user, sysConfig) : null;
      const masterAutoReplyAllowed = autoReplyStatus ? autoReplyStatus.allowed : true;
      const accountAiEnabled = user ? user.role === "admin" ? Boolean(masterAutoReplyAllowed && sysConfig.ai_config?.enabled && sysConfig.ai_config?.fallback_when_no_rule) : Boolean(masterAutoReplyAllowed && user.ai_enabled === true) : Boolean(sysConfig.ai_config?.enabled && sysConfig.ai_config?.fallback_when_no_rule);
      const hasSessionAiOverride = typeof session?.ai_enabled === "boolean";
      const aiEnabled = masterAutoReplyAllowed ? hasSessionAiOverride ? Boolean(session.ai_enabled) : accountAiEnabled : false;
      const aiSource = hasSessionAiOverride ? "session_override" : "account_default";
      const sessionPrompt = typeof session?.custom_system_prompt === "string" ? session.custom_system_prompt.trim() : "";
      const userPrompt = typeof user?.custom_system_prompt === "string" ? user.custom_system_prompt.trim() : "";
      const sysPrompt = typeof sysConfig.ai_config?.system_prompt === "string" ? sysConfig.ai_config.system_prompt.trim() : "";
      if (sessionPrompt) {
        return {
          aiEnabled,
          aiSource,
          systemPrompt: sessionPrompt,
          promptSource: "session_override"
        };
      }
      if (userPrompt) {
        return {
          aiEnabled,
          aiSource,
          systemPrompt: userPrompt,
          promptSource: "account_default"
        };
      }
      return {
        aiEnabled,
        aiSource,
        systemPrompt: sysPrompt || void 0,
        promptSource: "system_default"
      };
    };
    getAntiBanSettings = () => {
      const db = initDbFile();
      return db.antiBan || DEFAULT_ANTIBAN;
    };
    runtimePublicBaseUrl = "";
    MAX_SUPERADMIN_WA_QUEUE = 500;
    recentlyRemovedQueueIds = /* @__PURE__ */ new Map();
    HANDLED_MSG_RETENTION_MS = 48 * 60 * 60 * 1e3;
    MAX_HANDLED_INCOMING_MESSAGES = 3e3;
    CHAT_WATERMARK_RETENTION_MS = 7 * 24 * 60 * 60 * 1e3;
    MAX_CHAT_REPLY_WATERMARKS = 2e3;
    MISSED_MSG_RETENTION_MS = 24 * 60 * 60 * 1e3;
    MAX_PENDING_MISSED_MESSAGES = 200;
    throttledKvTimers = /* @__PURE__ */ new Map();
  }
});

// <stdin>
init_db();
import assert from "node:assert/strict";

// src/lib/baileysManager.ts
init_db();
import makeWASocketImport, {
  useMultiFileAuthState,
  makeCacheableSignalKeyStore,
  generateMessageIDV2 as generateMessageIDV22,
  DisconnectReason,
  fetchLatestBaileysVersion,
  delay
} from "@whiskeysockets/baileys";
import crypto5 from "crypto";
import net2 from "net";
import os from "os";
import dns from "dns/promises";
import pino from "pino";
import QRCode from "qrcode";
import path4 from "path";
import fs4 from "fs";

// src/lib/metaAiService.ts
import crypto3 from "crypto";
import {
  S_WHATSAPP_NET,
  aesDecryptGCM,
  areJidsSameUser,
  buildAckStanza,
  encodeSignedDeviceIdentity,
  encodeWAMessage,
  generateMessageIDV2,
  generateWAMessage,
  getBinaryNodeChild,
  getBinaryNodeChildren,
  isJidBot,
  isJidMetaAI,
  jidDecode as jidDecode2,
  jidNormalizedUser,
  parseAndInjectE2ESessions,
  proto,
  unpadRandomMax16
} from "@whiskeysockets/baileys";

// src/lib/aiAuditLogger.ts
import fs3 from "fs";
import path3 from "path";
var LOG_DIR = path3.resolve(process.cwd(), "logs");
var AUDIT_LOG_PATH = path3.join(LOG_DIR, "meta-ai-audit.log");
var AUDIT_ROTATED_PATH = path3.join(LOG_DIR, "meta-ai-audit.prev.log");
var MAX_AUDIT_FILE_BYTES = 2 * 1024 * 1024;
var MAX_RECENT_MEMORY = 250;
var recentMemoryAuditLogs = [];
function isEphemeralTestMode() {
  return process.env.JAPRIIN_EPHEMERAL_DB === "1";
}
function sanitizeLogField(value, maxLen = 240) {
  if (value === void 0 || value === null) return "";
  return String(value).replace(/[\r\n\t\x00-\x1f\x7f]+/g, " ").replace(/\s+/g, " ").trim().slice(0, maxLen);
}
function maskPhoneForAudit(phone) {
  const digits = String(phone || "").replace(/\D/g, "");
  if (!digits) return "-";
  if (digits.length <= 6) return `${digits.slice(0, 2)}***`;
  return `${digits.slice(0, 4)}****${digits.slice(-3)}`;
}
function ensureAuditLogDir() {
  try {
    if (!fs3.existsSync(LOG_DIR)) {
      fs3.mkdirSync(LOG_DIR, { recursive: true, mode: 448 });
    }
    return true;
  } catch {
    return false;
  }
}
function rotateAuditLogIfNeeded() {
  try {
    if (!fs3.existsSync(AUDIT_LOG_PATH)) return;
    const stat = fs3.statSync(AUDIT_LOG_PATH);
    if (stat.size >= MAX_AUDIT_FILE_BYTES) {
      if (fs3.existsSync(AUDIT_ROTATED_PATH)) {
        fs3.unlinkSync(AUDIT_ROTATED_PATH);
      }
      fs3.renameSync(AUDIT_LOG_PATH, AUDIT_ROTATED_PATH);
    }
  } catch {
  }
}
function recordAiAuditEvent(input) {
  const record = {
    timestamp: (/* @__PURE__ */ new Date()).toISOString(),
    level: input.level,
    stage: input.stage,
    session_id: sanitizeLogField(input.session_id, 80) || void 0,
    user_id: sanitizeLogField(input.user_id, 80) || void 0,
    customer_code: sanitizeLogField(input.customer_code, 40) || void 0,
    sender_masked: input.sender_masked ? sanitizeLogField(input.sender_masked, 32) : input.senderPhone ? maskPhoneForAudit(input.senderPhone) : void 0,
    error_code: sanitizeLogField(input.error_code, 64) || void 0,
    reason: sanitizeLogField(input.reason, 400) || "-",
    latency_ms: typeof input.latency_ms === "number" && Number.isFinite(input.latency_ms) ? Math.max(0, Math.round(input.latency_ms)) : void 0
  };
  recentMemoryAuditLogs.unshift(record);
  if (recentMemoryAuditLogs.length > MAX_RECENT_MEMORY) {
    recentMemoryAuditLogs.length = MAX_RECENT_MEMORY;
  }
  if (!isEphemeralTestMode() && ensureAuditLogDir()) {
    try {
      rotateAuditLogIfNeeded();
      const line = `${JSON.stringify(record)}
`;
      fs3.appendFileSync(AUDIT_LOG_PATH, line, { encoding: "utf-8", mode: 384 });
    } catch {
    }
  }
  return record;
}

// src/lib/signalRecovery.ts
import { DEFAULT_CONNECTION_CONFIG, jidDecode } from "@whiskeysockets/baileys";
var LIBSIGNAL_GUARD_SYMBOL = Symbol.for("japriin.libsignalConsoleGuardState");
var DEFAULT_RESET_COOLDOWN_MS = 15e3;
var DEFAULT_WARN_COOLDOWN_MS = 3e4;
var MAX_TRACKED_PEERS = 500;
function getGuardState() {
  const g = globalThis;
  if (!g[LIBSIGNAL_GUARD_SYMBOL]) {
    g[LIBSIGNAL_GUARD_SYMBOL] = {
      installed: false,
      activeDecryptDepth: 0,
      suppressedLogsCount: 0,
      originalConsoleError: console.error.bind(console)
    };
  }
  return g[LIBSIGNAL_GUARD_SYMBOL];
}
function isLibsignalNoiseMessage(args) {
  if (!Array.isArray(args) || args.length === 0) return false;
  const first = typeof args[0] === "string" ? args[0] : "";
  if (!first) return false;
  if (first === "Failed to decrypt message with any known session...") {
    return true;
  }
  if (first.startsWith("Session error:")) {
    return true;
  }
  return false;
}
function installLibsignalConsoleGuard() {
  const state = getGuardState();
  if (state.installed) return;
  state.originalConsoleError = console.error.bind(console);
  console.error = (...args) => {
    if (state.activeDecryptDepth > 0 && isLibsignalNoiseMessage(args)) {
      state.suppressedLogsCount += 1;
      return;
    }
    state.originalConsoleError(...args);
  };
  state.installed = true;
}
async function withSignalDecryptScope(fn) {
  installLibsignalConsoleGuard();
  const state = getGuardState();
  state.activeDecryptDepth += 1;
  try {
    return await fn();
  } finally {
    state.activeDecryptDepth = Math.max(0, state.activeDecryptDepth - 1);
  }
}
function getSignalErrorMessage(err) {
  if (!err) return "";
  if (typeof err === "string") return err;
  if (typeof err?.message === "string") return err.message;
  try {
    return String(err);
  } catch {
    return "";
  }
}
function isRecoverableSignalMacError(err) {
  const msg = getSignalErrorMessage(err);
  if (!msg) return false;
  return /Bad MAC|No matching sessions found|No matching sessions|No session record|No sessions available|MessageCounterError|Key used already or never filled|Chain closed|Invalid PreKey ID|Over 2000 messages/i.test(
    msg
  );
}
function shouldResetCorruptedSignalSession(err) {
  const msg = getSignalErrorMessage(err);
  if (!msg) return false;
  if (/MessageCounterError|Key used already or never filled|No session record|No sessions available/i.test(msg)) {
    return false;
  }
  return /Bad MAC|No matching sessions found|No matching sessions|Chain closed|Invalid PreKey ID|Over 2000 messages/i.test(
    msg
  );
}
function setBoundedMap(map, key, value, maxSize = MAX_TRACKED_PEERS) {
  if (map.has(key)) {
    map.delete(key);
  } else if (map.size >= maxSize) {
    const oldest = map.keys().next().value;
    if (oldest !== void 0) {
      map.delete(oldest);
    }
  }
  map.set(key, value);
}
function normalizePeerRecoveryKey(repo, jid) {
  try {
    if (typeof repo?.jidToSignalProtocolAddress === "function") {
      return String(repo.jidToSignalProtocolAddress(jid));
    }
  } catch {
  }
  return String(jid || "").trim();
}
async function expandSignalAliasJids(authKeys, jids) {
  const uniqueInput = Array.from(new Set((jids || []).map((j) => String(j || "").trim()).filter(Boolean)));
  if (uniqueInput.length === 0) return [];
  const expanded = new Set(uniqueInput);
  if (!authKeys || typeof authKeys.get !== "function") {
    return Array.from(expanded);
  }
  const pnLookupUsers = /* @__PURE__ */ new Set();
  const lidLookupKeys = /* @__PURE__ */ new Set();
  const parsedList = [];
  for (const jid of uniqueInput) {
    try {
      const dec = jidDecode(jid);
      if (!dec?.user) continue;
      const device = dec.device || 0;
      const server = dec.server || "";
      parsedList.push({ raw: jid, user: dec.user, device, server });
      if (server === "s.whatsapp.net" || server === "hosted") {
        pnLookupUsers.add(dec.user);
      } else if (server === "lid" || server === "hosted.lid") {
        lidLookupKeys.add(`${dec.user}_reverse`);
      }
    } catch {
    }
  }
  const lookupKeys = [...pnLookupUsers, ...lidLookupKeys];
  if (lookupKeys.length === 0) {
    return Array.from(expanded);
  }
  let mappingData = {};
  try {
    mappingData = await authKeys.get("lid-mapping", lookupKeys) || {};
  } catch {
    return Array.from(expanded);
  }
  for (const item of parsedList) {
    const devSuffix = item.device ? `:${item.device}` : "";
    if (item.server === "s.whatsapp.net" || item.server === "hosted") {
      const lidUser = mappingData[item.user];
      if (typeof lidUser === "string" && lidUser.trim()) {
        const lidServer = item.server === "hosted" ? "hosted.lid" : "lid";
        expanded.add(`${lidUser.trim()}${devSuffix}@${lidServer}`);
      }
    } else if (item.server === "lid" || item.server === "hosted.lid") {
      const pnUser = mappingData[`${item.user}_reverse`];
      if (typeof pnUser === "string" && pnUser.trim()) {
        const pnServer = item.server === "hosted.lid" ? "hosted" : "s.whatsapp.net";
        expanded.add(`${pnUser.trim()}${devSuffix}@${pnServer}`);
      }
    }
  }
  return Array.from(expanded);
}
function wrapSignalRepositoryWithRecovery(baseRepo, authKeys, options) {
  if (!baseRepo || baseRepo.__signalRecoveryWrapped) {
    return baseRepo;
  }
  installLibsignalConsoleGuard();
  const resetCooldownMs = options?.resetCooldownMs ?? DEFAULT_RESET_COOLDOWN_MS;
  const warnCooldownMs = options?.warnCooldownMs ?? DEFAULT_WARN_COOLDOWN_MS;
  const warnLogger = options?.warnLogger ?? ((msg) => console.warn(msg));
  const recentResetAt = /* @__PURE__ */ new Map();
  const recentWarnAt = /* @__PURE__ */ new Map();
  const origDecryptMessage = typeof baseRepo.decryptMessage === "function" ? baseRepo.decryptMessage.bind(baseRepo) : null;
  const origDecryptGroupMessage = typeof baseRepo.decryptGroupMessage === "function" ? baseRepo.decryptGroupMessage.bind(baseRepo) : null;
  const origDeleteSession = typeof baseRepo.deleteSession === "function" ? baseRepo.deleteSession.bind(baseRepo) : null;
  const deleteExpandedSessions = async (jids) => {
    const cleanJids = (jids || []).map((j) => String(j || "").trim()).filter(Boolean);
    if (cleanJids.length === 0) return;
    const expanded = await expandSignalAliasJids(authKeys, cleanJids);
    const targetJids = expanded.length > 0 ? expanded : cleanJids;
    if (origDeleteSession) {
      await origDeleteSession(targetJids);
      return;
    }
    if (authKeys && typeof authKeys.set === "function" && typeof baseRepo.jidToSignalProtocolAddress === "function") {
      const updates = {};
      for (const j of targetJids) {
        try {
          updates[String(baseRepo.jidToSignalProtocolAddress(j))] = null;
        } catch {
        }
      }
      if (Object.keys(updates).length > 0) {
        await authKeys.set({ session: updates });
      }
    }
  };
  const wrapped = {
    ...baseRepo,
    __signalRecoveryWrapped: true,
    deleteSession: deleteExpandedSessions,
    decryptGroupMessage: origDecryptGroupMessage ? async (params) => withSignalDecryptScope(() => origDecryptGroupMessage(params)) : baseRepo.decryptGroupMessage,
    decryptMessage: origDecryptMessage ? async (params) => {
      const jid = String(params?.jid || "");
      const peerKey = normalizePeerRecoveryKey(baseRepo, jid);
      try {
        const plain = await withSignalDecryptScope(() => origDecryptMessage(params));
        recentResetAt.delete(peerKey);
        return plain;
      } catch (err) {
        const errMsg = getSignalErrorMessage(err) || "Unknown Signal decrypt error";
        const now = Date.now();
        let sessionReset = false;
        if (shouldResetCorruptedSignalSession(err)) {
          const lastReset = recentResetAt.get(peerKey) || 0;
          if (now - lastReset >= resetCooldownMs) {
            setBoundedMap(recentResetAt, peerKey, now);
            try {
              await deleteExpandedSessions([jid]);
              sessionReset = true;
            } catch {
            }
          }
        }
        if (isRecoverableSignalMacError(err)) {
          const lastWarn = recentWarnAt.get(peerKey) || 0;
          if (now - lastWarn >= warnCooldownMs) {
            setBoundedMap(recentWarnAt, peerKey, now);
            warnLogger(
              sessionReset ? `[Signal Recovery] Dekripsi ${params?.type || "msg"} dari ${jid} gagal (${errMsg}); sesi Signal lama di-reset otomatis untuk sinkronisasi retry prekey.` : `[Signal Recovery] Dekripsi ${params?.type || "msg"} dari ${jid} gagal sementara (${errMsg}); menunggu retry/resync Baileys.`
            );
          }
          try {
            options?.onRecovery?.({
              jid,
              type: String(params?.type || "msg"),
              error: errMsg,
              sessionReset
            });
          } catch {
          }
        }
        throw err;
      }
    } : baseRepo.decryptMessage
  };
  Object.setPrototypeOf(wrapped, Object.getPrototypeOf(baseRepo));
  return wrapped;
}
function createResilientSignalRepository(auth, logger, pnToLIDFunc, options) {
  const factory = options?.baseFactory || DEFAULT_CONNECTION_CONFIG.makeSignalRepository;
  const baseRepo = factory(auth, logger, pnToLIDFunc);
  return wrapSignalRepositoryWithRecovery(baseRepo, auth?.keys, options);
}

// src/lib/metaAiService.ts
var socketProvider = null;
var allSocketsProvider = null;
var ensureSocketProvider = null;
var sessionQueues = /* @__PURE__ */ new Map();
var sessionQueueDepth = /* @__PURE__ */ new Map();
var activeWaiters = /* @__PURE__ */ new Map();
var recentMetaPrompts = /* @__PURE__ */ new Map();
var sessionMetaAiLids = /* @__PURE__ */ new Map();
var sessionPreferredMetaJid = /* @__PURE__ */ new Map();
var sessionBotEntries = /* @__PURE__ */ new Map();
var sessionBotPersonas = /* @__PURE__ */ new Map();
var pendingBotSecrets = /* @__PURE__ */ new Map();
var sessionLatestBotSecret = /* @__PURE__ */ new Map();
var sessionLastPromptAt = /* @__PURE__ */ new Map();
var sessionPromptTimestamps = /* @__PURE__ */ new Map();
var sessionCooldowns = /* @__PURE__ */ new Map();
var senderQueryHistory = /* @__PURE__ */ new Map();
var responseCache = /* @__PURE__ */ new Map();
var botSignalReadyCache = /* @__PURE__ */ new Map();
var sessionRejectedBotJids = /* @__PURE__ */ new Map();
var sessionConsecutiveSends = /* @__PURE__ */ new Map();
var sessionLastMetaError = /* @__PURE__ */ new Map();
var sessionDecryptHint = /* @__PURE__ */ new Map();
var wrappedSockets = /* @__PURE__ */ new WeakMap();
var MAX_QUEUE_DEPTH = 35;
var HARD_TIMEOUT_MS = 3e4;
var SILENT_FALLBACK_RETRY_MS = 4500;
var SETTLE_DEBOUNCE_MS = 950;
var FAST_FINAL_SETTLE_MS = 300;
var PROMPT_ECHO_TTL_MS = 9e4;
var BOT_SECRET_TTL_MS = 180 * 1e3;
var MAX_BOT_SECRETS = 120;
var MAX_RECENT_PROMPTS = 200;
var MAX_TRACKED_SESSIONS = 200;
var MAX_RESPONSE_CACHE = 200;
var RESPONSE_CACHE_TTL_MS = 10 * 60 * 1e3;
var MAX_SENDER_HISTORY = 500;
var SENDER_BURST_WINDOW_MS = 60 * 1e3;
var SENDER_BURST_MAX = 25;
var MIN_INTER_QUERY_MS = 1e3;
var INTER_QUERY_JITTER_MS = 450;
var MAX_PROMPTS_PER_MIN = 25;
var MAX_PROMPTS_PER_HOUR = 600;
var BOT_LIST_CACHE_TTL_MS = 30 * 60 * 1e3;
var BOT_LIST_EMPTY_CACHE_TTL_MS = 5 * 60 * 1e3;
var BOT_SIGNAL_READY_TTL_MS = 60 * 60 * 1e3;
var BOT_JID_REJECT_TTL_MS = 60 * 1e3;
var metaAiMaintenanceTimer = setInterval(() => {
  const now = Date.now();
  prunePendingBotSecrets(now);
  pruneRecentPrompts(now);
  for (const [k, v] of responseCache.entries()) {
    if (v.expiresAt <= now) responseCache.delete(k);
  }
  for (const [k, exp] of botSignalReadyCache.entries()) {
    if (exp <= now) botSignalReadyCache.delete(k);
  }
  for (const [sid, map] of sessionRejectedBotJids.entries()) {
    for (const [jidKey, exp] of map.entries()) {
      if (exp <= now) map.delete(jidKey);
    }
    if (map.size === 0) sessionRejectedBotJids.delete(sid);
  }
  for (const [sid, cd] of sessionCooldowns.entries()) {
    if (cd.until > 0 && cd.until <= now && cd.consecutiveTimeouts === 0) {
      sessionCooldowns.delete(sid);
    }
  }
  const oneHourAgo = now - 60 * 60 * 1e3;
  for (const [sid, arr] of sessionPromptTimestamps.entries()) {
    const filtered = arr.filter((t) => t > oneHourAgo);
    if (filtered.length === 0) sessionPromptTimestamps.delete(sid);
    else if (filtered.length !== arr.length) sessionPromptTimestamps.set(sid, filtered);
  }
  const burstCutoff = now - SENDER_BURST_WINDOW_MS;
  for (const [k, arr] of senderQueryHistory.entries()) {
    const filtered = arr.filter((t) => t > burstCutoff);
    if (filtered.length === 0) senderQueryHistory.delete(k);
    else if (filtered.length !== arr.length) senderQueryHistory.set(k, filtered);
  }
}, 5 * 60 * 1e3);
metaAiMaintenanceTimer.unref?.();
var DEFAULT_META_AI_BOT_JID = "867051314767696@bot";
var DEFAULT_META_AI_PERSONA_ID = "867051314767696$760019659443059";
var FALLBACK_META_AI_JIDS = Array.from(
  /* @__PURE__ */ new Set([
    DEFAULT_META_AI_BOT_JID,
    "13135550002@s.whatsapp.net"
  ])
);
function isRoutableOutgoingMetaJid(jid) {
  if (!jid || typeof jid !== "string") return false;
  const clean = jid.trim();
  if (!clean) return false;
  if (clean.endsWith("@c.us")) return false;
  if (clean.toLowerCase() === "13135550002@bot") return false;
  return clean.endsWith("@bot") || clean.endsWith("@lid") || clean.endsWith("@s.whatsapp.net");
}
function registerConnectedSocketProvider(provider, allProvider, ensureProvider) {
  socketProvider = provider;
  if (allProvider) {
    allSocketsProvider = allProvider;
  }
  if (ensureProvider) {
    ensureSocketProvider = ensureProvider;
  }
}
async function ensureConnectedMetaAiSocketForUser(userId, preferredSessionId) {
  const existing = socketProvider ? socketProvider(userId, preferredSessionId) : null;
  if (existing && isSocketOpen(existing.socket)) {
    return existing;
  }
  if (ensureSocketProvider) {
    try {
      const ensured = await ensureSocketProvider(userId, preferredSessionId);
      if (ensured && isSocketOpen(ensured.socket)) {
        return ensured;
      }
    } catch {
    }
  }
  const retry = socketProvider ? socketProvider(userId, preferredSessionId) : null;
  return retry && isSocketOpen(retry.socket) ? retry : null;
}
function isMetaAiJid(jid) {
  if (!jid || typeof jid !== "string") return false;
  const trimmed = jid.trim();
  if (!trimmed) return false;
  try {
    if (typeof isJidMetaAI === "function" && isJidMetaAI(trimmed)) return true;
  } catch {
  }
  try {
    if (typeof isJidBot === "function" && isJidBot(trimmed)) return true;
  } catch {
  }
  try {
    if (areJidsSameUser(trimmed, DEFAULT_META_AI_BOT_JID)) return true;
    if (areJidsSameUser(trimmed, "13135550002@s.whatsapp.net")) return true;
  } catch {
  }
  const normalized = (() => {
    try {
      return jidNormalizedUser(trimmed).toLowerCase();
    } catch {
      return trimmed.toLowerCase();
    }
  })();
  const [userPart = "", domainPart = ""] = normalized.split("@");
  const bareUser = userPart.split(":")[0];
  if (domainPart === "bot") return true;
  if (bareUser === "867051314767696" || bareUser === "13135550002") return true;
  if (/^1313555\d{4}$/.test(bareUser) || /^131655500\d{2}$/.test(bareUser)) return true;
  if (normalized === "meta_ai@s.whatsapp.net") return true;
  return false;
}
function isSessionMetaAiJid(sessionId, jid) {
  if (!jid || typeof jid !== "string") return false;
  if (isMetaAiJid(jid)) return true;
  const knownLid = sessionMetaAiLids.get(sessionId);
  if (knownLid) {
    try {
      if (knownLid === jid || areJidsSameUser(knownLid, jid)) return true;
    } catch {
      if (knownLid === jid) return true;
    }
  }
  const cachedBots = sessionBotEntries.get(sessionId)?.entries || [];
  for (const bot of cachedBots) {
    try {
      if (bot.jid === jid || areJidsSameUser(bot.jid, jid)) return true;
    } catch {
      if (bot.jid === jid) return true;
    }
  }
  return false;
}
function capMapSize(map, maxSize) {
  while (map.size > maxSize) {
    const firstKey = map.keys().next().value;
    if (firstKey === void 0) break;
    map.delete(firstKey);
  }
}
function rememberSessionMetaAiLid(sessionId, candidateJid, setPreferred = false) {
  if (!sessionId || !candidateJid || typeof candidateJid !== "string") return;
  const raw = candidateJid.trim();
  if (!raw) return;
  const clean = raw.endsWith("@c.us") ? safeNormalizeJid(raw) : raw;
  if (!clean || !isRoutableOutgoingMetaJid(clean)) return;
  if (clean.endsWith("@lid")) {
    sessionMetaAiLids.set(sessionId, clean);
    capMapSize(sessionMetaAiLids, MAX_TRACKED_SESSIONS);
  }
  if (setPreferred && (clean.endsWith("@lid") || isMetaAiJid(clean))) {
    sessionPreferredMetaJid.set(sessionId, clean);
    capMapSize(sessionPreferredMetaJid, MAX_TRACKED_SESSIONS);
  }
}
function rememberBotPersona(sessionId, jid, personaId) {
  if (!sessionId || !jid || !personaId) return;
  let map = sessionBotPersonas.get(sessionId);
  if (!map) {
    map = /* @__PURE__ */ new Map();
    sessionBotPersonas.set(sessionId, map);
    capMapSize(sessionBotPersonas, MAX_TRACKED_SESSIONS);
  }
  map.set(jid, personaId);
  const norm = safeNormalizeJid(jid);
  if (norm) map.set(norm, personaId);
  capMapSize(map, 50);
}
function safeNormalizeJid(jid) {
  if (!jid || typeof jid !== "string") return "";
  const trimmed = jid.trim();
  if (!trimmed) return "";
  try {
    const norm = jidNormalizedUser(trimmed);
    return norm || trimmed;
  } catch {
    return trimmed;
  }
}
function markSessionRejectedBotJid(sessionId, jid, ttlMs = BOT_JID_REJECT_TTL_MS) {
  if (!sessionId || !jid || typeof jid !== "string") return;
  const clean = jid.trim();
  if (!clean) return;
  let map = sessionRejectedBotJids.get(sessionId);
  if (!map) {
    map = /* @__PURE__ */ new Map();
    sessionRejectedBotJids.set(sessionId, map);
    capMapSize(sessionRejectedBotJids, MAX_TRACKED_SESSIONS);
  }
  const expiresAt = Date.now() + ttlMs;
  map.set(clean, expiresAt);
  const norm = safeNormalizeJid(clean);
  if (norm) map.set(norm, expiresAt);
  capMapSize(map, 20);
}
function isSessionBotJidRejected(sessionId, jid, now = Date.now()) {
  if (!sessionId || !jid) return false;
  const map = sessionRejectedBotJids.get(sessionId);
  if (!map) return false;
  const clean = jid.trim();
  const norm = safeNormalizeJid(clean);
  for (const candidate of [clean, norm]) {
    if (!candidate) continue;
    const exp = map.get(candidate);
    if (exp !== void 0) {
      if (exp > now) return true;
      map.delete(candidate);
    }
  }
  if (map.size === 0) sessionRejectedBotJids.delete(sessionId);
  return false;
}
function prunePendingBotSecrets(now = Date.now()) {
  for (const [key, entry] of pendingBotSecrets.entries()) {
    if (entry.expiresAt <= now) {
      pendingBotSecrets.delete(key);
    }
  }
  while (pendingBotSecrets.size > MAX_BOT_SECRETS) {
    const firstKey = pendingBotSecrets.keys().next().value;
    if (!firstKey) break;
    pendingBotSecrets.delete(firstKey);
  }
  for (const [sid, entry] of sessionLatestBotSecret.entries()) {
    if (entry.expiresAt <= now) {
      sessionLatestBotSecret.delete(sid);
    }
  }
}
function storePendingBotSecret(sessionId, msgId, botJid, messageSecret) {
  const now = Date.now();
  prunePendingBotSecrets(now);
  const entry = {
    sessionId,
    msgId,
    botJid,
    messageSecret: Buffer.from(messageSecret),
    expiresAt: now + BOT_SECRET_TTL_MS
  };
  pendingBotSecrets.set(`${sessionId}::${msgId}`, entry);
  sessionLatestBotSecret.set(sessionId, entry);
}
function applyBotMessageHKDF(messageSecret) {
  return Buffer.from(
    crypto3.hkdfSync("sha256", Buffer.from(messageSecret), Buffer.alloc(0), Buffer.from("Bot Message", "utf8"), 32)
  );
}
function decryptMsmsgCiphertext(params) {
  const { messageSecret, encPayload, encIv, msgIds, origSenders, modificationSenders, hint, onMatch } = params;
  if (!messageSecret?.length || !encPayload?.length || !encIv?.length) return null;
  const payloadBuf = Buffer.from(encPayload);
  const ivBuf = Buffer.from(encIv);
  const secretBuf = Buffer.from(messageSecret);
  const botSecretBuf = applyBotMessageHKDF(secretBuf);
  const uniqueIds = Array.from(new Set(msgIds.filter(Boolean)));
  const uniqueOrigSenders = Array.from(new Set(origSenders.filter(Boolean)));
  const uniqueModSenders = Array.from(new Set(modificationSenders.filter(Boolean)));
  const keyVariants = [
    { ikm: botSecretBuf, modType: "" },
    { ikm: secretBuf, modType: "Bot Message" }
  ];
  const tryDecryptOne = (ikm, modType, msgId, origSender, modSender) => {
    try {
      const useCaseSecret = Buffer.concat([
        Buffer.from(msgId, "utf8"),
        Buffer.from(origSender, "utf8"),
        Buffer.from(modSender, "utf8"),
        Buffer.from(modType, "utf8")
      ]);
      const aesKey = Buffer.from(crypto3.hkdfSync("sha256", ikm, Buffer.alloc(0), useCaseSecret, 32));
      const aad = Buffer.from(`${msgId}\0${modSender}`, "utf8");
      const plaintext = aesDecryptGCM(payloadBuf, aesKey, ivBuf, aad);
      const decoded = proto.Message.decode(plaintext);
      if (decoded && typeof decoded === "object") {
        onMatch?.({ modType, origSender, modSender });
        return decoded;
      }
    } catch {
    }
    return null;
  };
  if (hint && hint.origSender && hint.modSender && uniqueIds.length > 0) {
    const hintKey = hint.modType === "Bot Message" ? secretBuf : botSecretBuf;
    const hintModType = hint.modType === "Bot Message" ? "Bot Message" : "";
    const fast = tryDecryptOne(hintKey, hintModType, uniqueIds[0], hint.origSender, hint.modSender);
    if (fast) return fast;
  }
  for (const { ikm, modType } of keyVariants) {
    for (const msgId of uniqueIds) {
      for (const origSender of uniqueOrigSenders) {
        for (const modSender of uniqueModSenders) {
          const decoded = tryDecryptOne(ikm, modType, msgId, origSender, modSender);
          if (decoded) return decoded;
        }
      }
    }
  }
  return null;
}
function unwrapBaileysMessageContent(message, depth = 0) {
  if (!message || typeof message !== "object" || depth > 8) return null;
  if (message.editedMessage?.message) {
    return unwrapBaileysMessageContent(message.editedMessage.message, depth + 1);
  }
  if (message.protocolMessage?.editedMessage) {
    return unwrapBaileysMessageContent(message.protocolMessage.editedMessage, depth + 1);
  }
  if (message.ephemeralMessage?.message) {
    return unwrapBaileysMessageContent(message.ephemeralMessage.message, depth + 1);
  }
  if (message.viewOnceMessage?.message) {
    return unwrapBaileysMessageContent(message.viewOnceMessage.message, depth + 1);
  }
  if (message.viewOnceMessageV2?.message) {
    return unwrapBaileysMessageContent(message.viewOnceMessageV2.message, depth + 1);
  }
  if (message.viewOnceMessageV2Extension?.message) {
    return unwrapBaileysMessageContent(message.viewOnceMessageV2Extension.message, depth + 1);
  }
  if (message.deviceSentMessage?.message) {
    return unwrapBaileysMessageContent(message.deviceSentMessage.message, depth + 1);
  }
  if (message.documentWithCaptionMessage?.message) {
    return unwrapBaileysMessageContent(message.documentWithCaptionMessage.message, depth + 1);
  }
  if (message.associatedChildMessage?.message) {
    return unwrapBaileysMessageContent(message.associatedChildMessage.message, depth + 1);
  }
  if (message.botInvokeMessage?.message) {
    return unwrapBaileysMessageContent(message.botInvokeMessage.message, depth + 1);
  }
  return message;
}
function extractRichResponseText(rich) {
  if (!rich || typeof rich !== "object" || !Array.isArray(rich.submessages)) return "";
  const chunks = [];
  for (const sub of rich.submessages) {
    if (!sub || typeof sub !== "object") continue;
    const direct = sub.messageText || sub.text || sub.caption || sub.latexMetadata?.text || "";
    if (typeof direct === "string" && direct.trim()) {
      chunks.push(direct.trim());
    }
    const codeBlocks = sub.codeMetadata?.codeBlocks;
    if (Array.isArray(codeBlocks) && codeBlocks.length > 0) {
      const codeLines = codeBlocks.map((b) => typeof b?.codeContent === "string" ? b.codeContent : b?.text || "").filter((s) => typeof s === "string" && s.length > 0);
      if (codeLines.length > 0) {
        chunks.push(codeLines.join("\n"));
      }
    }
    const rows = sub.tableMetadata?.rows;
    if (Array.isArray(rows) && rows.length > 0) {
      const tableText = rows.map((r) => Array.isArray(r?.items) ? r.items.map((cell) => String(cell || "").trim()).join(" | ") : "").filter(Boolean).join("\n");
      if (tableText) {
        chunks.push(tableText);
      }
    }
  }
  return chunks.join("\n").trim();
}
function extractTextFromBaileysMessage(message) {
  const unwrapped = unwrapBaileysMessageContent(message);
  if (!unwrapped || typeof unwrapped !== "object") return "";
  const text = unwrapped.conversation || unwrapped.extendedTextMessage?.text || unwrapped.imageMessage?.caption || unwrapped.videoMessage?.caption || unwrapped.documentMessage?.caption || unwrapped.buttonsResponseMessage?.selectedDisplayText || unwrapped.listResponseMessage?.title || unwrapped.templateButtonReplyMessage?.selectedDisplayText || extractRichResponseText(unwrapped.richResponseMessage) || extractRichResponseText(message?.richResponseMessage) || "";
  return typeof text === "string" ? text.trim() : "";
}
function isPlaceholderMetaAiReply(text) {
  const normalized = String(text || "").trim();
  if (!normalized) return true;
  if (/^(\.{1,6}|…+)$/.test(normalized)) return true;
  if (/^(thinking|memikirkan|sedang berpikir|sedang memproses|processing|generating|loading|mengetik|typing)(\.{0,5}|…)?$/i.test(
    normalized
  )) {
    return true;
  }
  return false;
}
function pruneRecentPrompts(now = Date.now()) {
  for (const [k, exp] of recentMetaPrompts.entries()) {
    if (exp <= now) {
      recentMetaPrompts.delete(k);
    }
  }
  capMapSize(recentMetaPrompts, MAX_RECENT_PROMPTS);
}
function rememberPromptEcho(sessionId, text) {
  const clean = text.trim();
  if (!clean) return;
  const now = Date.now();
  pruneRecentPrompts(now);
  recentMetaPrompts.set(`${sessionId}::${clean}`, now + PROMPT_ECHO_TTL_MS);
}
function hasMismatchedCustomerCode(text, expectedCustomerCode) {
  if (!expectedCustomerCode) return false;
  const matches = String(text || "").match(/\[?\bcustomer_(\d{4,6})\b\]?/gi);
  if (!matches || matches.length === 0) return false;
  const expectedLower = expectedCustomerCode.toLowerCase();
  const normalizedCodes = matches.map((m) => m.replace(/[\[\]\s]/g, "").toLowerCase());
  return !normalizedCodes.includes(expectedLower);
}
function stripCustomerCodeTags(rawText) {
  return String(rawText || "").replace(/^\s*\[?\bcustomer_\d{4,6}\b\]?\s*[:\-–—]?\s*/i, "").replace(/\[?\bcustomer_\d{4,6}\b\]?\s*[:\-–—]?\s*/gi, "").replace(/\n{3,}/g, "\n\n").trim();
}
function cleanMetaAiReply(rawText) {
  let text = stripCustomerCodeTags(String(rawText || "").trim());
  if (!text) return "";
  const leadInPatterns = [
    /^(?:tentu|baik|oke|siap|nah|bisa banget|saran aku|kalau aku jadi kamu|coba balas gini)[!,.\s]*(?:(?:berikut|ini)(?:\s+adalah)?|(?:kamu|anda)\s+bisa\s+(?:balas|jawab|kirim|gunakan))?\s*(?:contoh|opsi|saran|draft|teks)?\s*(?:balasan(?:nya)?|jawaban(?:nya)?|respon(?:nya)?|kalimat(?:nya)?)(?:\s+[^\n:]{1,50})?\s*:\s*\n*/i,
    /^(?:berikut(?:\s+adalah)?|ini(?:\s+adalah)?)\s+(?:contoh|opsi|saran|draft|teks)?\s*(?:balasan(?:nya)?|jawaban(?:nya)?|respon(?:nya)?|kalimat(?:nya)?)(?:\s+[^\n:]{1,50})?\s*:\s*\n*/i,
    /^(?:contoh|saran|draft|opsi)?\s*(?:balasan(?:nya)?|jawaban(?:nya)?|respon(?:nya)?)(?:\s+(?:singkat|wa|whatsapp|ramah|sopan|terbaik))?\s*:\s*\n*/i,
    /^(?:kamu|anda)\s+bisa\s+(?:balas|jawab|kirim)\s+(?:seperti\s+ini|kayak\s+gini|dengan\s+kalimat\s+ini|gini)?\s*:\s*\n*/i
  ];
  for (const rx of leadInPatterns) {
    const stripped = text.replace(rx, "").trim();
    if (stripped.length >= 2) {
      text = stripped;
      break;
    }
  }
  if (text.startsWith('"') && text.endsWith('"') && text.indexOf('"', 1) === text.length - 1 || text.startsWith("\u201C") && text.endsWith("\u201D") || text.startsWith("'") && text.endsWith("'") && text.indexOf("'", 1) === text.length - 1) {
    const inner = text.slice(1, -1).trim();
    if (inner.length >= 2) text = inner;
  }
  text = text.replace(/\*\*([^*\n]+)\*\*/g, "*$1*");
  return stripCustomerCodeTags(text);
}
function reconcileCatalogImageLinksInReply(replyText, customerMessage, catalogProducts) {
  const baseReply = String(replyText || "").trim();
  if (!baseReply) return "";
  const withImages = (catalogProducts || []).filter(
    (p) => Boolean(p && typeof p.title === "string" && p.title.trim() && typeof p.image_url === "string" && /^https?:\/\//i.test(p.image_url.trim()))
  ).map((p) => ({ ...p, title: p.title.trim(), image_url: p.image_url.trim() }));
  if (withImages.length === 0) return baseReply;
  const replyLower = baseReply.toLowerCase();
  const msgLower = String(customerMessage || "").toLowerCase();
  const ranked = withImages.map((p) => {
    const titleLower = p.title.toLowerCase();
    const tokens = titleLower.split(/[^a-z0-9]+/i).filter((t) => t.length >= 2);
    let score = 0;
    if (replyLower.includes(titleLower)) score += 12;
    if (msgLower.includes(titleLower)) score += 10;
    for (const t of tokens) {
      if (replyLower.includes(t)) score += 3;
      if (msgLower.includes(t)) score += 2;
    }
    return { product: p, score };
  }).sort((a, b) => b.score - a.score);
  const matched = ranked.filter((r) => r.score > 0).map((r) => r.product);
  const bestTargets = matched.length > 0 ? matched.slice(0, 3) : withImages.length === 1 ? [withImages[0]] : withImages.slice(0, 3);
  const primaryTarget = bestTargets[0];
  const placeholderRegex = /[\[(]\s*(?:tautan|link|url|foto|gambar)\s+(?:(?:gambar|foto|produk)\s+)?(?:tidak|belum)\s+(?:tersedia|ada|dapat\s+ditampilkan|bisa\s+ditampilkan|bisa\s+dikirim)[^\]\)]*[\])]|[\[(]\s*(?:link|tautan|url)\s*(?:gambar|foto|produk)?\s*[\])]|(?<=:\s*)(?:tautan|link|url|foto|gambar)\s+(?:tidak|belum)\s+(?:tersedia|ada)\b\.?/gi;
  const replacementText = matched.length > 1 ? matched.slice(0, 3).map((p) => `${p.title}: ${p.image_url}`).join("\n") : primaryTarget.image_url;
  let repaired = baseReply.replace(placeholderRegex, replacementText).replace(/[ \t]+\n/g, "\n").trim();
  const alreadyHasProductUrl = withImages.some((p) => repaired.includes(p.image_url));
  const customerAskedForPhoto = /\b(foto|gambar|pict?|image|lihat|liat|penampakan|modelnya|contohnya)\b/i.test(
    customerMessage || ""
  );
  if (!alreadyHasProductUrl && customerAskedForPhoto) {
    const linksBlock = bestTargets.length === 1 ? `Foto ${primaryTarget.title}: ${primaryTarget.image_url}` : bestTargets.map((p) => `Foto ${p.title}: ${p.image_url}`).join("\n");
    repaired = `${repaired}

${linksBlock}`.trim();
  }
  return repaired;
}
function isEchoOfPrompt(sessionId, candidateText, waiter) {
  const clean = candidateText.trim();
  if (!clean) return true;
  if (waiter && clean === waiter.promptSent.trim()) return true;
  const key = `${sessionId}::${clean}`;
  const exp = recentMetaPrompts.get(key);
  if (exp && exp > Date.now()) return true;
  return false;
}
function finalizeWaiter(sessionId, result) {
  const waiter = activeWaiters.get(sessionId);
  if (!waiter || waiter.settled) return;
  waiter.settled = true;
  clearTimeout(waiter.hardTimer);
  if (waiter.settleTimer) {
    clearTimeout(waiter.settleTimer);
    waiter.settleTimer = null;
  }
  if (waiter.retryTimer) {
    clearTimeout(waiter.retryTimer);
    waiter.retryTimer = null;
  }
  activeWaiters.delete(sessionId);
  waiter.resolve(result);
}
function ingestMetaAiCandidateText(sessionId, candidateText, sourceJid, isFinalEdit = false) {
  const waiter = activeWaiters.get(sessionId);
  if (!waiter || waiter.settled) return;
  const trimmed = String(candidateText || "").trim();
  if (!trimmed) return;
  if (isEchoOfPrompt(sessionId, trimmed, waiter)) return;
  if (isPlaceholderMetaAiReply(trimmed)) return;
  if (waiter.customerCode && hasMismatchedCustomerCode(trimmed, waiter.customerCode)) {
    console.warn(`[Meta AI Isolation] Mengabaikan respon silang (${waiter.customerCode} diharapkan) agar jawaban antar pelanggan tidak tertukar.`);
    return;
  }
  waiter.hasSignal = true;
  if (waiter.retryTimer) {
    clearTimeout(waiter.retryTimer);
    waiter.retryTimer = null;
  }
  if (sourceJid) {
    rememberSessionMetaAiLid(sessionId, sourceJid, true);
  }
  waiter.latestText = trimmed;
  if (waiter.settleTimer) {
    clearTimeout(waiter.settleTimer);
  }
  const waitSettleMs = isFinalEdit ? FAST_FINAL_SETTLE_MS : SETTLE_DEBOUNCE_MS;
  waiter.settleTimer = setTimeout(() => {
    const current = activeWaiters.get(sessionId);
    if (!current || current.settled) return;
    if (current.latestText) {
      finalizeWaiter(sessionId, { ok: true, text: current.latestText });
    }
  }, waitSettleMs);
}
function isMetaAiRawMessageNode(sessionId, node) {
  if (!node || typeof node !== "object" || node.tag !== "message") return false;
  const from = node.attrs?.from;
  const participant = node.attrs?.participant;
  const recipient = node.attrs?.recipient;
  const senderPn = node.attrs?.sender_pn;
  const senderLid = node.attrs?.sender_lid;
  if (isSessionMetaAiJid(sessionId, from) || isSessionMetaAiJid(sessionId, participant) || isSessionMetaAiJid(sessionId, recipient) || isSessionMetaAiJid(sessionId, senderPn) || isSessionMetaAiJid(sessionId, senderLid)) {
    return true;
  }
  if (typeof from === "string" && from.endsWith("@bot")) return true;
  const encNodes = getBinaryNodeChildren(node, "enc");
  if (encNodes.some((enc) => enc?.attrs?.type === "msmsg")) {
    return true;
  }
  return false;
}
async function handleRawMetaAiMessageNode(sessionId, sock, node) {
  if (!isMetaAiRawMessageNode(sessionId, node)) return false;
  const from = String(node.attrs?.from || "");
  const participant = node.attrs?.participant ? String(node.attrs.participant) : void 0;
  const msgId = String(node.attrs?.id || "");
  const rawSender = participant || from;
  const normSender = safeNormalizeJid(rawSender);
  const metaNode = getBinaryNodeChild(node, "meta");
  const botNode = getBinaryNodeChild(node, "bot");
  const unavailableNode = getBinaryNodeChild(node, "unavailable");
  const targetId = String(metaNode?.attrs?.target_id || metaNode?.attrs?.["target-id"] || "").trim();
  const targetSenderRaw = String(
    metaNode?.attrs?.target_sender_jid || metaNode?.attrs?.target_sender || ""
  ).trim();
  const editType = String(botNode?.attrs?.edit || node.attrs?.edit || "").trim().toLowerCase();
  const editTargetId = String(
    botNode?.attrs?.edit_target_id || botNode?.attrs?.["edit-target-id"] || ""
  ).trim();
  const children = Array.isArray(node.content) ? node.content : [];
  const cryptoNodes = children.filter(
    (c) => c && (c.tag === "enc" || c.tag === "plaintext") && c.content instanceof Uint8Array
  );
  let decryptedProtoMsg = null;
  let sawMsmsg = false;
  let lastSignalDecryptError = null;
  const ownIdRaw = String(sock?.authState?.creds?.me?.id || sock?.user?.id || "").trim();
  const ownLidRaw = String(sock?.authState?.creds?.me?.lid || sock?.user?.lid || "").trim();
  const origSenders = [
    safeNormalizeJid(targetSenderRaw),
    targetSenderRaw,
    safeNormalizeJid(ownLidRaw),
    safeNormalizeJid(ownIdRaw),
    ownLidRaw,
    ownIdRaw
  ].filter(Boolean);
  const primaryDecryptId = (editType === "inner" || editType === "last") && editTargetId ? editTargetId : msgId;
  const modSenders = [normSender, rawSender].filter(Boolean);
  const secretEntryCandidates = [];
  const seenSecrets = /* @__PURE__ */ new Set();
  const pushSecretEntry = (entry) => {
    if (entry?.messageSecret && !seenSecrets.has(entry.messageSecret)) {
      seenSecrets.add(entry.messageSecret);
      secretEntryCandidates.push(entry);
    }
  };
  if (targetId) {
    pushSecretEntry(pendingBotSecrets.get(`${sessionId}::${targetId}`));
  }
  pushSecretEntry(sessionLatestBotSecret.get(sessionId));
  if (secretEntryCandidates.length < 3) {
    const sessionEntries = Array.from(pendingBotSecrets.values()).filter((e) => e.sessionId === sessionId);
    for (let idx = sessionEntries.length - 1; idx >= 0 && secretEntryCandidates.length < 3; idx--) {
      pushSecretEntry(sessionEntries[idx]);
    }
  }
  const secretCandidates = secretEntryCandidates.map((e) => e.messageSecret);
  const msgIdCandidates = [
    targetId,
    ...secretEntryCandidates.map((e) => e.msgId),
    primaryDecryptId,
    msgId,
    editTargetId
  ].filter(Boolean);
  for (const cNode of cryptoNodes) {
    const e2eType = cNode.tag === "plaintext" ? "plaintext" : String(cNode.attrs?.type || "");
    const contentBytes = cNode.content;
    try {
      if (e2eType === "msmsg") {
        sawMsmsg = true;
        const msMsg = proto.MessageSecretMessage.decode(contentBytes);
        if (msMsg?.encPayload?.length && msMsg?.encIv?.length) {
          const hint = sessionDecryptHint.get(sessionId) || null;
          for (const secretEntry of secretEntryCandidates) {
            const pairedMsgIds = [
              targetId,
              secretEntry.msgId,
              primaryDecryptId,
              msgId,
              editTargetId
            ].filter(Boolean);
            const decoded = decryptMsmsgCiphertext({
              messageSecret: secretEntry.messageSecret,
              encPayload: msMsg.encPayload,
              encIv: msMsg.encIv,
              msgIds: pairedMsgIds.length > 0 ? pairedMsgIds : msgIdCandidates,
              origSenders,
              modificationSenders: modSenders,
              hint,
              onMatch: (meta) => {
                sessionDecryptHint.set(sessionId, meta);
                capMapSize(sessionDecryptHint, MAX_TRACKED_SESSIONS);
              }
            });
            if (decoded) {
              decryptedProtoMsg = decoded;
              break;
            }
          }
        }
      } else if (e2eType === "plaintext") {
        decryptedProtoMsg = proto.Message.decode(contentBytes);
      } else if ((e2eType === "msg" || e2eType === "pkmsg") && sock?.signalRepository?.decryptMessage) {
        try {
          const plainBuf = await withSignalDecryptScope(
            () => sock.signalRepository.decryptMessage({
              jid: rawSender,
              type: e2eType,
              ciphertext: contentBytes
            })
          );
          decryptedProtoMsg = proto.Message.decode(unpadRandomMax16(plainBuf));
        } catch (signalErr) {
          lastSignalDecryptError = signalErr;
          if (isRecoverableSignalMacError(signalErr)) {
            for (const cacheKey of Array.from(botSignalReadyCache.keys())) {
              if (cacheKey.startsWith(`${sessionId}::`)) {
                botSignalReadyCache.delete(cacheKey);
              }
            }
            if (shouldResetCorruptedSignalSession(signalErr) && typeof sock?.signalRepository?.deleteSession === "function") {
              await sock.signalRepository.deleteSession([rawSender]).catch(() => {
              });
            }
            recordAiAuditEvent({
              level: "WARN",
              stage: "meta_ai_stanza",
              session_id: sessionId,
              error_code: "SIGNAL_BAD_MAC_RESET",
              reason: `Dekripsi Signal ${e2eType} dari ${rawSender} gagal (${signalErr?.message || signalErr}); cache sesi Meta AI di-reset.`
            });
          }
        }
      }
    } catch {
    }
    if (decryptedProtoMsg) break;
  }
  let sentRetry = false;
  if (!decryptedProtoMsg && lastSignalDecryptError && !unavailableNode && !sawMsmsg && typeof sock?.sendRetryRequest === "function") {
    try {
      await sock.sendRetryRequest(node, true);
      sentRetry = true;
    } catch {
      sentRetry = false;
    }
  }
  if (!sentRetry && typeof sock?.sendNode === "function") {
    try {
      const ackNode = buildAckStanza(node, void 0, sock?.authState?.creds?.me?.id);
      await sock.sendNode(ackNode);
    } catch {
    }
  }
  if (decryptedProtoMsg) {
    const syntheticMsg = {
      key: {
        remoteJid: from,
        remoteJidAlt: node.attrs?.sender_pn || node.attrs?.sender_lid || void 0,
        fromMe: (ownIdRaw ? areJidsSameUser(from, ownIdRaw) : false) || (ownLidRaw ? areJidsSameUser(from, ownLidRaw) : false),
        id: msgId,
        participant
      },
      messageTimestamp: node.attrs?.t ? Number(node.attrs.t) : Math.floor(Date.now() / 1e3),
      message: decryptedProtoMsg
    };
    handleMetaAiIncomingUpsert(sessionId, syntheticMsg, editType === "last");
    return true;
  }
  if (unavailableNode) {
    const unavailableType = String(unavailableNode.attrs?.type || "unavailable");
    console.warn(`[Meta AI] Session=${sessionId} menerima stanza unavailable (${unavailableType}) dari ${from}`);
    const errMsg = unavailableType === "bot_unavailable_fanout" ? "Akun WhatsApp ini menerima status bot_unavailable_fanout dari Meta AI (fitur Meta AI belum diaktifkan/belum pernah chat di HP)." : `Meta AI mengembalikan status tidak tersedia (${unavailableType}).`;
    sessionLastMetaError.set(sessionId, { code: unavailableType, message: errMsg, at: Date.now() });
    capMapSize(sessionLastMetaError, MAX_TRACKED_SESSIONS);
    recordAiAuditEvent({
      level: "ERROR",
      stage: "meta_ai_stanza",
      session_id: sessionId,
      error_code: unavailableType,
      reason: errMsg
    });
    const waiter = activeWaiters.get(sessionId);
    if (waiter && !waiter.settled && unavailableType === "bot_unavailable_fanout") {
      waiter.lastAckError = errMsg;
      sessionPreferredMetaJid.delete(sessionId);
      setSessionMetaCooldown(sessionId, 1e4, waiter.lastAckError);
    }
    return true;
  }
  if (sawMsmsg) {
    console.warn(`[Meta AI] Session=${sessionId} menerima msmsg dari ${from} (msgId=${msgId}, targetId=${targetId || "-"}) namun gagal didekripsi.`);
    recordAiAuditEvent({
      level: "ERROR",
      stage: "msmsg_decrypt",
      session_id: sessionId,
      error_code: "MSMSG_DECRYPT_FAILED",
      reason: `Menerima payload msmsg terenkripsi dari ${from} (msgId=${msgId}) namun gagal didekripsi.`
    });
  }
  return true;
}
function handleMetaAiMessageAckNode(sessionId, ackNode) {
  const ackId = String(ackNode?.attrs?.id || "").trim();
  const ackErr = ackNode?.attrs?.error ? String(ackNode.attrs.error).trim() : "";
  if (!ackId || !ackErr) return;
  const waiter = activeWaiters.get(sessionId);
  if (!waiter || waiter.settled || !waiter.pendingAckMsgIds.has(ackId)) return;
  const errDesc = ackErr === "463" ? "WhatsApp menolak pengiriman ke Meta AI (error 463: pembatasan kontak/token privasi)." : ackErr === "479" ? "Stanza Meta AI ditolak server WhatsApp (error 479: SMAX_INVALID)." : ackErr === "488" ? "Stanza Meta AI ditolak server WhatsApp (error 488: NackUnrecognizedStanza / fitur atau format bot belum didukung pada sesi ini)." : ackErr === "429" ? "Meta AI membatasi frekuensi pesan sementara (error 429)." : `Server WhatsApp mengembalikan error ACK ${ackErr} saat mengirim ke Meta AI.`;
  waiter.lastAckError = errDesc;
  sessionLastMetaError.set(sessionId, { code: `ACK_${ackErr}`, message: errDesc, at: Date.now() });
  capMapSize(sessionLastMetaError, MAX_TRACKED_SESSIONS);
  recordAiAuditEvent({
    level: "ERROR",
    stage: "meta_ai_ack",
    session_id: sessionId,
    customer_code: waiter.customerCode,
    error_code: `ACK_${ackErr}`,
    reason: errDesc
  });
  if (ackErr === "463" || ackErr === "429") {
    console.log(`[Meta AI Routing] Session=${sessionId} msgId=${ackId} ack_code=${ackErr}; membersihkan cache jalur & beralih.`);
    sessionPreferredMetaJid.delete(sessionId);
    for (const cacheKey of Array.from(botSignalReadyCache.keys())) {
      if (cacheKey.startsWith(`${sessionId}::`)) {
        botSignalReadyCache.delete(cacheKey);
      }
    }
    if (ackErr === "429") {
      setSessionMetaCooldown(sessionId, 15e3, errDesc);
    }
    if (waiter.fallbackAttemptFn) {
      const runFallback = waiter.fallbackAttemptFn;
      void runFallback().then((attempted) => {
        const current = activeWaiters.get(sessionId);
        if (!attempted && current && !current.settled && !current.hasSignal && !current.latestText) {
          finalizeWaiter(sessionId, { ok: false, reason: errDesc });
        }
      }).catch(() => {
        const current = activeWaiters.get(sessionId);
        if (current && !current.settled && !current.hasSignal && !current.latestText) {
          finalizeWaiter(sessionId, { ok: false, reason: errDesc });
        }
      });
      return;
    }
    finalizeWaiter(sessionId, { ok: false, reason: errDesc });
    return;
  }
  if (ackErr === "488" || ackErr === "479") {
    const rejectedTargetJid = waiter.msgIdToTargetJid.get(ackId);
    if (rejectedTargetJid) {
      markSessionRejectedBotJid(sessionId, rejectedTargetJid);
    }
    sessionPreferredMetaJid.delete(sessionId);
    for (const cacheKey of Array.from(botSignalReadyCache.keys())) {
      if (cacheKey.startsWith(`${sessionId}::`)) {
        botSignalReadyCache.delete(cacheKey);
      }
    }
  }
  if (waiter.fallbackAttemptFn) {
    if (waiter.retryTimer) {
      clearTimeout(waiter.retryTimer);
      waiter.retryTimer = null;
    }
    const runFallback = waiter.fallbackAttemptFn;
    console.log(`[Meta AI Routing] Session=${sessionId} msgId=${ackId} ack_code=${ackErr}; mencoba jalur kandidat berikutnya atau fallback.`);
    void runFallback().then((attempted) => {
      const current = activeWaiters.get(sessionId);
      if (!attempted && current && !current.settled && !current.hasSignal && !current.latestText) {
        finalizeWaiter(sessionId, { ok: false, reason: errDesc });
      }
    }).catch(() => {
      const current = activeWaiters.get(sessionId);
      if (current && !current.settled && !current.hasSignal && !current.latestText) {
        finalizeWaiter(sessionId, { ok: false, reason: errDesc });
      }
    });
    return;
  }
  console.log(`[Meta AI Routing] Session=${sessionId} msgId=${ackId} ack_code=${ackErr}; beralih ke balasan fallback.`);
  finalizeWaiter(sessionId, { ok: false, reason: errDesc });
}
function attachMetaAiRawSocketHandlers(sock, sessionId) {
  const ws = sock?.ws;
  if (!ws || typeof ws.emit !== "function") {
    return () => {
    };
  }
  const existingState = wrappedSockets.get(ws);
  if (existingState) {
    existingState.sessionId = sessionId;
    existingState.socket = sock;
    existingState.active = true;
    return () => {
      existingState.active = false;
      existingState.socket = null;
    };
  }
  const state = { active: true, sessionId, socket: sock };
  wrappedSockets.set(ws, state);
  const origEmit = ws.emit.bind(ws);
  ws.emit = function(event, ...args) {
    if (state.active && state.socket) {
      if (event === "CB:message" && args[0]) {
        const node = args[0];
        if (isMetaAiRawMessageNode(state.sessionId, node)) {
          void handleRawMetaAiMessageNode(state.sessionId, state.socket, node).catch((err) => {
            console.warn("[Meta AI Raw Message Handler Error]", err?.message || err);
          });
          return true;
        }
      } else if ((event === "CB:ack,class:message" || event === "CB:ack" && args[0]?.attrs?.class === "message") && args[0]) {
        try {
          handleMetaAiMessageAckNode(state.sessionId, args[0]);
        } catch {
        }
      }
    }
    return origEmit(event, ...args);
  };
  return () => {
    state.active = false;
    state.socket = null;
  };
}
function handleMetaAiIncomingUpsert(sessionId, msg, isFinalEdit = false) {
  const candidateJids = [
    msg?.key?.remoteJid,
    msg?.key?.remoteJidAlt,
    msg?.key?.participant,
    msg?.message?.deviceSentMessage?.destinationJid
  ].filter(Boolean);
  const isRichBotMsg = Boolean(
    activeWaiters.has(sessionId) && (msg?.message?.richResponseMessage || msg?.message?.editedMessage?.message?.richResponseMessage || msg?.message?.protocolMessage?.editedMessage?.richResponseMessage)
  );
  const matched = isRichBotMsg || candidateJids.some((j) => isSessionMetaAiJid(sessionId, j));
  if (!matched) return false;
  for (const j of candidateJids) {
    if (j.endsWith("@lid") || isMetaAiJid(j) || isRichBotMsg) {
      rememberSessionMetaAiLid(sessionId, j, !msg?.key?.fromMe);
    }
  }
  if (msg?.key?.fromMe) {
    const ownText = extractTextFromBaileysMessage(msg?.message);
    if (ownText) rememberPromptEcho(sessionId, ownText);
    return true;
  }
  const primaryJid = msg?.key?.remoteJid || msg?.key?.remoteJidAlt || candidateJids[0];
  const text = extractTextFromBaileysMessage(msg?.message);
  if (text) {
    ingestMetaAiCandidateText(sessionId, text, primaryJid, isFinalEdit);
  } else {
    const waiter = activeWaiters.get(sessionId);
    if (waiter && !waiter.settled) {
      waiter.hasSignal = true;
    }
  }
  return true;
}
function handleMetaAiIncomingUpdate(sessionId, updates) {
  if (!Array.isArray(updates) || updates.length === 0) return 0;
  let handled = 0;
  for (const item of updates) {
    const candidateJids = [
      item?.key?.remoteJid,
      item?.key?.remoteJidAlt,
      item?.key?.participant
    ].filter(Boolean);
    if (!candidateJids.some((j) => isSessionMetaAiJid(sessionId, j))) continue;
    handled++;
    if (item?.key?.fromMe) continue;
    const primaryJid = item?.key?.remoteJid || item?.key?.remoteJidAlt || candidateJids[0];
    const candidateMsg = item?.update?.message || item?.update?.messageStubParameters?.[0] || item?.message || null;
    if (candidateMsg && typeof candidateMsg === "object") {
      const text = extractTextFromBaileysMessage(candidateMsg);
      if (text) {
        ingestMetaAiCandidateText(sessionId, text, primaryJid);
      }
    } else if (typeof candidateMsg === "string") {
      ingestMetaAiCandidateText(sessionId, candidateMsg, primaryJid);
    }
  }
  return handled;
}
function clearMetaAiSession(sessionId) {
  if (!sessionId) return;
  finalizeWaiter(sessionId, {
    ok: false,
    reason: "Sesi WhatsApp terputus saat menunggu balasan Meta AI."
  });
  sessionQueueDepth.delete(sessionId);
  sessionQueues.delete(sessionId);
  sessionMetaAiLids.delete(sessionId);
  sessionPreferredMetaJid.delete(sessionId);
  sessionBotEntries.delete(sessionId);
  sessionBotPersonas.delete(sessionId);
  sessionLatestBotSecret.delete(sessionId);
  sessionLastPromptAt.delete(sessionId);
  sessionPromptTimestamps.delete(sessionId);
  sessionCooldowns.delete(sessionId);
  sessionRejectedBotJids.delete(sessionId);
  sessionLastMetaError.delete(sessionId);
  sessionDecryptHint.delete(sessionId);
  sessionConsecutiveSends.delete(sessionId);
  const now = Date.now();
  for (const [cacheKey, cacheVal] of responseCache.entries()) {
    if (!cacheVal || cacheVal.expiresAt <= now) {
      responseCache.delete(cacheKey);
    }
  }
  for (const key of Array.from(pendingBotSecrets.keys())) {
    if (key.startsWith(`${sessionId}::`)) {
      pendingBotSecrets.delete(key);
    }
  }
  for (const key of Array.from(recentMetaPrompts.keys())) {
    if (key.startsWith(`${sessionId}::`)) {
      recentMetaPrompts.delete(key);
    }
  }
  for (const key of Array.from(senderQueryHistory.keys())) {
    if (key.startsWith(`${sessionId}::`)) {
      senderQueryHistory.delete(key);
    }
  }
  for (const key of Array.from(botSignalReadyCache.keys())) {
    if (key.startsWith(`${sessionId}::`)) {
      botSignalReadyCache.delete(key);
    }
  }
}
function setSessionMetaCooldown(sessionId, durationMs, reason) {
  if (!sessionId) return;
  const now = Date.now();
  const prev = sessionCooldowns.get(sessionId);
  sessionCooldowns.set(sessionId, {
    until: Math.max(prev?.until || 0, now + durationMs),
    consecutiveTimeouts: prev?.consecutiveTimeouts || 0,
    reason
  });
  capMapSize(sessionCooldowns, MAX_TRACKED_SESSIONS);
}
function getActiveSessionCooldown(sessionId) {
  const entry = sessionCooldowns.get(sessionId);
  if (!entry) return null;
  if (entry.until <= Date.now()) {
    sessionCooldowns.delete(sessionId);
    return null;
  }
  return entry;
}
async function waitAndRecordSessionRateWindow(sessionId) {
  const oneHourAgo = Date.now() - 60 * 60 * 1e3;
  let timestamps = (sessionPromptTimestamps.get(sessionId) || []).filter((t) => t > oneHourAgo);
  if (timestamps.length >= MAX_PROMPTS_PER_HOUR) {
    sessionPromptTimestamps.set(sessionId, timestamps);
    return {
      allowed: false,
      reason: `Batas aman per jam tercapai (${timestamps.length}/${MAX_PROMPTS_PER_HOUR}) untuk mencegah pembatasan akun WhatsApp.`
    };
  }
  let now = Date.now();
  let inLastMin = timestamps.filter((t) => t > now - 6e4);
  if (inLastMin.length >= MAX_PROMPTS_PER_MIN) {
    const oldestInMin = Math.min(...inLastMin);
    const waitMs = Math.min(62e3, Math.max(1500, oldestInMin + 60500 - now));
    console.log(`[Meta AI Queue] Antrean rapi ${sessionId}: menunggu ${(waitMs / 1e3).toFixed(1)}d agar aman dari deteksi spam Meta.`);
    await new Promise((r) => setTimeout(r, waitMs));
    now = Date.now();
    timestamps = timestamps.filter((t) => t > now - 60 * 60 * 1e3);
  }
  timestamps.push(now);
  sessionPromptTimestamps.set(sessionId, timestamps);
  capMapSize(sessionPromptTimestamps, MAX_TRACKED_SESSIONS);
  return { allowed: true };
}
function checkAndRecordSenderBurst(sessionId, senderPhone, now = Date.now()) {
  const cleanPhone = String(senderPhone || "").replace(/\D/g, "");
  if (!cleanPhone || cleanPhone === "628999000111") return true;
  const key = `${sessionId}::${cleanPhone}`;
  const cutoff = now - SENDER_BURST_WINDOW_MS;
  const recent = (senderQueryHistory.get(key) || []).filter((t) => t > cutoff);
  if (recent.length >= SENDER_BURST_MAX) {
    senderQueryHistory.set(key, recent);
    return false;
  }
  recent.push(now);
  senderQueryHistory.set(key, recent);
  if (senderQueryHistory.size > MAX_SENDER_HISTORY) {
    for (const [k, arr] of senderQueryHistory.entries()) {
      if (!arr.some((t) => t > cutoff)) senderQueryHistory.delete(k);
    }
    capMapSize(senderQueryHistory, MAX_SENDER_HISTORY);
  }
  return true;
}
function buildResponseCacheKey(userId, instruction, messageBody, autoReplyRules, catalogShopName, catalogProducts) {
  const normMsg = messageBody.trim().toLowerCase().replace(/\s+/g, " ");
  const rulesDigest = Array.isArray(autoReplyRules) && autoReplyRules.length > 0 ? autoReplyRules.map((r) => `${r.keyword}=${r.response_text}`).join("|") : "";
  const catalogDigest = Array.isArray(catalogProducts) && catalogProducts.length > 0 ? `${catalogShopName || ""}|${catalogProducts.map((p) => `${p.title}:${p.price}:${p.description || ""}:${p.image_url || ""}`).join("|")}` : "";
  const ctxHash = crypto3.createHash("sha1").update(`${userId || "global"}::${instruction.trim()}::${rulesDigest}::${catalogDigest}`).digest("hex").slice(0, 12);
  return `${ctxHash}::${normMsg}`;
}
function getCachedMetaResponse(key) {
  const entry = responseCache.get(key);
  if (!entry) return null;
  if (entry.expiresAt <= Date.now()) {
    responseCache.delete(key);
    return null;
  }
  return entry.replyText;
}
function storeCachedMetaResponse(key, replyText) {
  const now = Date.now();
  for (const [k, v] of responseCache.entries()) {
    if (v.expiresAt <= now) responseCache.delete(k);
  }
  responseCache.set(key, { replyText, expiresAt: now + RESPONSE_CACHE_TTL_MS });
  capMapSize(responseCache, MAX_RESPONSE_CACHE);
}
async function enqueueSessionTask(sessionId, task) {
  const currentDepth = sessionQueueDepth.get(sessionId) || 0;
  if (currentDepth >= MAX_QUEUE_DEPTH) {
    throw new Error("Antrean Meta AI untuk sesi ini penuh. Silakan coba sesaat lagi.");
  }
  sessionQueueDepth.set(sessionId, currentDepth + 1);
  const previous = sessionQueues.get(sessionId) || Promise.resolve();
  const currentRun = previous.catch(() => void 0).then(() => task());
  const chainHandle = currentRun.finally(() => {
    const remaining = (sessionQueueDepth.get(sessionId) || 1) - 1;
    if (remaining <= 0) {
      sessionQueueDepth.delete(sessionId);
      if (sessionQueues.get(sessionId) === chainHandle) {
        sessionQueues.delete(sessionId);
      }
    } else {
      sessionQueueDepth.set(sessionId, remaining);
    }
  });
  sessionQueues.set(sessionId, chainHandle);
  return currentRun;
}
function pickRandom(items) {
  return items[crypto3.randomInt(0, items.length)];
}
function compactInstructionForHumanChat(rawInstruction) {
  return rawInstruction.replace(/\[[^\]]{1,40}\]\s*[:\-]?/g, "").replace(/\{nama\}/gi, "kak").replace(/\{pesan\}/gi, "pertanyaannya").replace(/\s+/g, " ").trim().slice(0, 550);
}
function summarizeRulesNaturally(rules, userMessage) {
  if (!Array.isArray(rules) || rules.length === 0) return "";
  const msgWords = new Set(
    userMessage.toLowerCase().split(/[^a-z0-9]+/i).filter((w) => w.length >= 3)
  );
  const valid = rules.filter((r) => r && typeof r.keyword === "string" && typeof r.response_text === "string").map((r) => {
    const kw = r.keyword.trim().slice(0, 50);
    const resp = r.response_text.replace(/\{nama\}/gi, "kak").replace(/\{pesan\}/gi, "pertanyaannya").replace(/\s+/g, " ").trim().slice(0, 120);
    const score = kw.toLowerCase().split(/[^a-z0-9]+/i).filter((w) => w.length >= 3 && msgWords.has(w)).length;
    return { kw, resp, score };
  }).filter((r) => r.kw.length > 0 && r.resp.length > 0);
  if (valid.length === 0) return "";
  valid.sort((a, b) => b.score - a.score);
  const picked = valid.slice(0, 5);
  const pairJoiners = [
    (k, v) => `kalau tanya soal "${k}" biasanya kujawab "${v}"`,
    (k, v) => `misal bahas "${k}" jawabanku "${v}"`,
    (k, v) => `jika ada yang nanya "${k}" aku balas "${v}"`,
    (k, v) => `soal "${k}" patokannya "${v}"`
  ];
  const formatter = pickRandom(pairJoiners);
  const body = picked.map((r) => formatter(r.kw, r.resp)).join("; ");
  return body.slice(0, 420);
}
var HUMAN_OPENERS = [
  "",
  "",
  "Eh ",
  "Kak, ",
  "Meta, ",
  "Halo, ",
  "Nanya dong, ",
  "Bantu mikir bentar dong, ",
  "Minta pendapatmu dong, ",
  "Lagi bingung nih, ",
  "Tolongin aku bentar ya, ",
  "Mau tanya dong, ",
  "Bisa bantu nggak, ",
  "Eh bantuin bentar dong, ",
  "Saran dong, ",
  "Punya ide nggak, ",
  "Bro, ",
  "Maaf ganggu bentar, "
];
var HUMAN_RULES_INTROS = [
  "aku punya aturan jawaban ke customer kalau dia tanya hal tertentu, misalnya: ",
  "di tempatku ada patokan balasan buat customer, kayak gini: ",
  "biasanya kalau pembeli nanya soal tertentu aku punya standar jawabannya: ",
  "aku udah biasa pakai patokan respon gini ke pelanggan: ",
  "catatan jawaban standarku ke customer tuh kurang lebih begini: ",
  "kalau ada yang tanya topik tertentu biasanya aku arahin gini: ",
  "aku punya beberapa aturan jawaban ke pembeli, contohnya: ",
  "patokan balasan yang biasa kupakai di tokoku tuh gini: "
];
var HUMAN_INFO_INTROS = [
  "aku juga punya gaya layanan dan info usahaku begini: ",
  "terus ini catatan cara jawab sama info layananku: ",
  "cara jawab dan gaya pelayanan di tempatku tuh kurang lebih gini: ",
  "catatan karakter CS dan ketentuan tokoku tuh kayak gini: ",
  "buat pegangan nada bicara, ini gaya layananku: ",
  "nah di usahaku gaya komunikasi ke pembeli begini: ",
  "aku melayani customer berpatokan sama catatan gaya jawab ini: ",
  "nih gambaran karakter CS sama ketentuan dari tempatku: ",
  "biar nyambung sama gaya CS-ku, ini catatannya: ",
  "gaya bahasaku sama keterangan layananku kurang lebih begini: ",
  "ini patokan gaya jawab dan karakterku ke customer: ",
  "catatan nada layanan yang kupakai tuh ini: "
];
var HUMAN_CATALOG_INTROS = [
  "aku punya daftar produk jualanku saat ini: ",
  "terus ini katalog produk yang lagi kutawarkan sekarang: ",
  "kalau ada yang tanya barang atau harga, ini list produkku: ",
  "di mini shop-ku ada beberapa produk yang siap dipesan, rinciannya ini: ",
  "daftar produk, harga, sama foto barang yang kujual tuh begini: ",
  "kebetulan aku punya katalog dagangan yang aktif nih: ",
  "ini pilihan produk yang tersedia di tempatku saat ini: ",
  "catatan stok produk sama daftar harga yang lagi jalan tuh ini: ",
  "kalau pembelinya nanyain produk, patokannya dari daftar jualanku ini: ",
  "biar jelas soal harga dan fotonya, ini katalog produkku sekarang: ",
  "aku lagi nawarin produk-produk ini ke customer: ",
  "list jualan di tempatku lengkap sama harga dan link fotonya begini: "
];
var HUMAN_CATALOG_LINK_NUDGES = [
  "kalau customernya minta foto atau gambar produk, langsung tulis dan salin persis link URL foto yang ada di daftarku tadi ya, jangan diganti tulisan tautan tidak tersedia",
  "oh iya kalau pembelinya nanya gambar atau foto barang, langsung sertakan aja link https fotonya apa adanya dari daftar tadi ya",
  "catatan penting: kalau pembeli minta liat gambar, tempel langsung link foto lengkap yang kutulis di atas dan jangan pernah menulis tautan tidak tersedia",
  "kalau ada yang minta foto produknya, langsung salin link URL fotonya dari daftar produk tadi ke dalam balasanmu ya",
  "misal dia pengen lihat contoh fotonya, tinggal cantumin aja langsung link gambar produk yang sesuai dari daftarku di atas",
  "jangan lupa kalau pembelinya minta lihat foto, kirimkan langsung link gambar produknya persis seperti URL di atas ya",
  "kalau dia tanya penampakan atau gambar barangnya, langsung selipin link foto https dari listku di atas tanpa disingkat atau disensor",
  "pastikan kalau customer minta foto atau gambar, URL foto produk yang ada di daftarku ikut ditulis utuh di balasan ya",
  "misal customernya minta gambar, langsung kasih link foto produk yang sesuai persis dari catatan di atas ya, jangan bilang tautan tidak tersedia",
  "kalau pembeli pengen cek fotonya, langsung aja tempel link gambar produk tadi di jawabanmu biar dia tinggal klik",
  "kalau ditanyain foto barangnya, salin persis link fotonya dari list produk di atas ke chat balasan ya",
  "khusus kalau dia minta lihat gambar atau modelnya, langsung kirim link URL foto dari daftarku di atas apa adanya ya"
];
function formatCatalogNaturally(products, shopName) {
  if (!Array.isArray(products) || products.length === 0) {
    return { summary: "", hasImageLinks: false };
  }
  const cleanShop = String(shopName || "").trim().slice(0, 60);
  const photoPhases = [
    (_title, url) => `link foto: ${url}`,
    (title, url) => `foto ${title}: ${url}`,
    (_title, url) => `link gambarnya: ${url}`,
    (title, url) => `gambar ${title} bisa dilihat di ${url}`
  ];
  const photoFormatter = pickRandom(photoPhases);
  const items = [];
  let hasImageLinks = false;
  for (const raw of products.slice(0, 15)) {
    if (!raw || typeof raw.title !== "string") continue;
    const title = raw.title.replace(/\s+/g, " ").trim().slice(0, 100);
    if (!title) continue;
    const priceNum = Number.isFinite(Number(raw.price)) ? Math.max(0, Math.round(Number(raw.price))) : 0;
    const priceText = priceNum > 0 ? `Rp${priceNum.toLocaleString("id-ID")}` : "harga tanya admin";
    const desc = typeof raw.description === "string" ? raw.description.replace(/\s+/g, " ").trim().slice(0, 180) : "";
    const imgUrl = typeof raw.image_url === "string" && raw.image_url.trim() ? raw.image_url.trim().slice(0, 300) : "";
    let line = `${title} (${priceText})`;
    if (desc) line += ` - ${desc}`;
    if (imgUrl) {
      hasImageLinks = true;
      line += `, ${photoFormatter(title, imgUrl)}`;
    }
    items.push(line);
  }
  if (items.length === 0) return { summary: "", hasImageLinks: false };
  const shopPrefix = cleanShop ? `(Toko ${cleanShop}) ` : "";
  return {
    summary: `${shopPrefix}${items.join(" ; ")}`.slice(0, 1600),
    hasImageLinks
  };
}
var HUMAN_CUSTOMER_INTROS = [
  "nah barusan ada customer tanya begini:",
  "ini ada pembeli chat masuk nanya gini:",
  "tadi ada pelanggan ngechat ke aku begini:",
  "barusan ada calon pembeli kirim pesan gini:",
  "ada customer masuk WA nanya kayak gini:",
  "nih barusan ada yang chat nanyain:",
  "terus ada pembeli yang nanya begini ke aku:",
  "pas banget ada customer kirim chat:",
  "ada orang nanya lewat WA bunyinya gini:",
  "barusan masuk chat dari customer:",
  "ini ada pertanyaan masuk dari pembeli:",
  "ada pelanggan yang barusan tanya:",
  "nih ada chat masuk dari calon pembeli:",
  "tadi ada customer kirim pesan kayak gini:",
  "barusan ada yang ngechat nanya gini:",
  "ini barusan ada customer yang bilang:"
];
var HUMAN_CLOSING_ASKS = [
  "tolong bantu aku jawab dong",
  "aku harus jawab apa ya",
  "aku balas apa kira kira bagusnya",
  "aku cocok jawab apa ya?",
  "enaknya aku balas gimana ya biar ramah?",
  "kira-kira balesan yang pas gimana ya?",
  "menurutmu aku cocoknya jawab apa nih?",
  "bantu bikinin kata-kata balesannya dong",
  "aku mesti respon gimana ya biar enak dibaca?",
  "kasih ide dong aku enaknya jawab apa ke dia",
  "kalau posisi gini bagusnya aku bales gimana ya?",
  "bantu dong aku bingung mau ngetik jawaban apa",
  "tolong susunin kalimat balesan yang ramah dong",
  "menurutmu kata-kata yang paling enak buat jawab ini apa ya?",
  "bagusnya aku bales apa nih yang sopan dan jelas?",
  "kalau kamu jadi aku bakal jawab gimana?",
  "bantu rangkai jawaban yang santai tapi sopan dong",
  "aku tinggal kirim aja nih, enaknya bales gimana ya?",
  "minta tolong bikinin satu balesan yang oke dong",
  "tolong kasih saran jawaban terbaiknya dong",
  "enaknya ngomong apa ya ke customernya?",
  "bantu ketikin jawaban yang singkat tapi jelas dong",
  "gimana ya cara jawab yang paling ramah buat chat itu?",
  "aku mesti ngetik apa nih buat jawab pertanyaan dia?",
  "bantu kasih satu balesan yang luwes dong",
  "kasih tau dong aku sebaiknya bales gimana ke pembeli ini?",
  "tolong buatin jawaban yang ramah buat kukirim balik ya",
  "aku bingung nih ngerangkai katanya, bantu jawab dong",
  "kira-kira respon paling pas buat pertanyaan ini apa ya?",
  "bantu aku jawab chat customer ini dong biar nggak salah ngomong",
  "menurutmu balesan yang paling meyakinkan gimana ya?",
  "enaknya aku bales apa ya biar customernya puas?",
  "tolong bantu mikirin balesan yang sopan dan nggak kaku dong",
  "kasih contoh satu jawaban yang enak dibaca dong",
  "aku cocoknya ngetik balesan kayak gimana ya?",
  "bantu bikin kalimat respon yang natural dong"
];
var HUMAN_DIRECT_NUDGES = [
  "langsung kasih teks jawabannya aja ya biar tinggal kukirim",
  "tulis satu kalimat siap kirim aja ya, nggak usah pakai pembuka",
  "langsung buatin isi balesannya aja ya",
  "kasih satu versi aja yang siap langsung kukirim ke WA-nya",
  "cukup tulisin teks balasannya aja ya biar langsung kupake",
  "jawabannya langsung kalimat buat dikirim ke customer aja ya",
  "tulisin satu opsi yang paling oke aja biar tinggal ku-copy",
  "bikinin satu balasan singkat aja yang siap kirim ya",
  "nggak usah panjang-panjang, langsung teks buat bales ke dia aja",
  "cukup kasih teks jadinya aja ya yang ramah dan singkat",
  "buat satu balasan singkat aja yang enak langsung dikirim",
  "langsung susun kata-kata jadinya aja ya tanpa basa-basi",
  "satu jawaban singkat aja cukup kok, biar langsung kukirim",
  "kasih langsung teks yang bisa langsung kupakai buat bales ya",
  "tulisin aja langsung kalimat balasannya ya",
  "singkat dan ramah aja ya, langsung kalimat buat dia"
];
function buildMetaAiPrompt(params) {
  const rawInstruction = (params.customSystemPrompt || "").trim();
  const instruction = compactInstructionForHumanChat(rawInstruction);
  const userMessage = String(params.messageBody || "").trim().slice(0, 1200);
  const rulesSummary = summarizeRulesNaturally(params.autoReplyRules, userMessage);
  const { summary: catalogSummary, hasImageLinks } = formatCatalogNaturally(
    params.catalogProducts,
    params.catalogShopName
  );
  const customerCode = params.customerCode ? String(params.customerCode).trim() : "";
  const opener = customerCode ? "" : pickRandom(HUMAN_OPENERS);
  const customerIntro = pickRandom(HUMAN_CUSTOMER_INTROS);
  const closingAsk = pickRandom(HUMAN_CLOSING_ASKS);
  const directNudge = pickRandom(HUMAN_DIRECT_NUDGES);
  const contextSegments = [];
  if (rulesSummary) {
    contextSegments.push(`${pickRandom(HUMAN_RULES_INTROS)}${rulesSummary}.`);
  }
  if (catalogSummary) {
    const linkNudge = hasImageLinks ? ` (${pickRandom(HUMAN_CATALOG_LINK_NUDGES)}).` : "";
    contextSegments.push(`${pickRandom(HUMAN_CATALOG_INTROS)}${catalogSummary}${linkNudge}`);
  }
  if (params.orderSummary) {
    contextSegments.push(
      `${params.orderSummary} (Aturan order, checkout & verifikasi bayar: jika customer memesan item, tampilkan rincian invoice & total harganya lalu tanyakan apakah ada produk lain yang ingin ditambahkan lagi; jika dia konfirmasi tidak ada tambahan / sudah oke / checkout, tampilkan total akhir lalu tanyakan mau bayar pakai metode apa dari daftar metode pembayaran yang tersedia; jika customer mengonfirmasi sudah membayar / mengirim bukti bayar dan pesanan sudah oke/lengkap, verifikasi dan akhiri balasanmu dengan tag [[ORDER_PAID]]).`
    );
  }
  if (params.paymentSummary) {
    contextSegments.push(
      `Metode pembayaran tersedia di tokoku: ${params.paymentSummary}. Jika customer memilih bayar pakai QRIS, sertakan kode [[SEND_QRIS]] agar sistem langsung mengirim gambar QRIS. Jika memilih transfer rekening, sertakan [[SEND_REK]] atau nomor rekeningnya.`
    );
  }
  if (Array.isArray(params.customerHistory) && params.customerHistory.length > 0) {
    const histLines = params.customerHistory.slice(-6).map((h) => `${h.role === "customer" ? "Pembeli" : "CS"}: ${String(h.text || "").replace(/\s+/g, " ").slice(0, 180)}`).join(" | ");
    if (histLines) {
      contextSegments.push(`Riwayat percakapan sebelumnya khusus ${customerCode || "pembeli ini"}: ${histLines}.`);
    }
  }
  if (instruction) {
    contextSegments.push(`${pickRandom(HUMAN_INFO_INTROS)}${instruction}`);
  }
  const contextBlock = contextSegments.join(" ").trim();
  const quotedMsg = crypto3.randomInt(0, 2) === 0 ? `"${userMessage}"` : userMessage;
  const codeHeader = customerCode ? `[ID Chat Terisolasi: ${customerCode} \u2014 fokus HANYA menjawab chat ${customerCode}, JANGAN campur dengan pelanggan lain, awali jawabanmu dengan [${customerCode}]]
` : "";
  if (codeHeader) {
    const ctxLine = contextBlock ? `Konteks: ${contextBlock}

` : "";
    return `${codeHeader}${ctxLine}Chat dari ${customerCode}: ${quotedMsg}
${closingAsk.replace(/\?+$/, "")}, ${directNudge}.`.trim();
  }
  const layout = crypto3.randomInt(0, 4);
  const cleanClosing = closingAsk.replace(/\?+$/, "");
  const cleanCustomerIntro = customerIntro.replace(/:+$/, "");
  if (contextBlock) {
    switch (layout) {
      case 0:
        return `${opener}${contextBlock}

${customerIntro} ${quotedMsg}
${cleanClosing}, ${directNudge}.`.trim();
      case 1:
        return `${opener}${customerIntro} ${quotedMsg} \u2014 ${cleanClosing}?

Sekadar info, ${contextBlock} (${directNudge}).`.trim();
      case 2:
        return `${opener}${contextBlock} Terus ${cleanCustomerIntro.charAt(0).toLowerCase() + cleanCustomerIntro.slice(1)}: ${quotedMsg}. Menurutmu ${cleanClosing}? (${directNudge})`.trim();
      default:
        return `${opener}${customerIntro}
${quotedMsg}

${cleanClosing}, ${directNudge}. Sebagai patokan: ${contextBlock}`.trim();
    }
  }
  switch (layout) {
    case 0:
      return `${opener}${customerIntro} ${quotedMsg}
${cleanClosing}, ${directNudge}.`.trim();
    case 1:
      return `${opener}${customerIntro} ${quotedMsg} \u2014 ${cleanClosing}? ${directNudge.charAt(0).toUpperCase() + directNudge.slice(1)}.`.trim();
    case 2:
      return `${opener}${cleanClosing} kalau ${cleanCustomerIntro.charAt(0).toLowerCase() + cleanCustomerIntro.slice(1)}: ${quotedMsg}
(${directNudge})`.trim();
    default:
      return `${opener}${customerIntro}
${quotedMsg}

${cleanClosing} (${directNudge}).`.trim();
  }
}
function isSocketOpen(socket) {
  if (!socket || typeof socket.sendMessage !== "function" && typeof socket.relayMessage !== "function") return false;
  if (socket.ws) {
    if (typeof socket.ws.isOpen === "boolean") return socket.ws.isOpen;
    if (typeof socket.ws.readyState === "number") return socket.ws.readyState === 1;
  }
  return Boolean(socket.user?.id);
}
async function fetchAccountBotList(sessionId, socket) {
  const now = Date.now();
  const cached = sessionBotEntries.get(sessionId);
  if (cached && cached.expiresAt > now) {
    return cached.entries;
  }
  if (typeof socket?.getBotListV2 !== "function") {
    return [];
  }
  try {
    const rawList = await Promise.race([
      socket.getBotListV2(),
      new Promise((resolve) => setTimeout(() => resolve(null), 3500))
    ]);
    if (Array.isArray(rawList)) {
      const cleaned = rawList.filter((b) => typeof b?.jid === "string" && isRoutableOutgoingMetaJid(b.jid)).map((b) => ({
        jid: b.jid.trim(),
        personaId: typeof b.personaId === "string" && b.personaId.trim() ? b.personaId.trim() : void 0
      }));
      for (const b of cleaned) {
        rememberBotPersona(sessionId, b.jid, b.personaId);
      }
      sessionBotEntries.set(sessionId, {
        entries: cleaned,
        expiresAt: now + (cleaned.length > 0 ? BOT_LIST_CACHE_TTL_MS : BOT_LIST_EMPTY_CACHE_TTL_MS)
      });
      return cleaned;
    }
  } catch {
  }
  return [];
}
async function lookupMetaAiLidViaSignal(sessionId, socket) {
  const getLIDForPN = socket?.signalRepository?.lidMapping?.getLIDForPN;
  if (typeof getLIDForPN !== "function") return null;
  try {
    const resolvedLid = await Promise.race([
      getLIDForPN.call(socket.signalRepository.lidMapping, "13135550002@s.whatsapp.net"),
      new Promise((resolve) => setTimeout(() => resolve(null), 2500))
    ]);
    if (typeof resolvedLid === "string" && resolvedLid.trim()) {
      const clean = jidNormalizedUser(resolvedLid.trim());
      rememberSessionMetaAiLid(sessionId, clean);
      return clean;
    }
  } catch {
  }
  return null;
}
async function ensureBotDeviceCached(socket, targetJid) {
  if (!targetJid.endsWith("@bot") || !socket?.userDevicesCache?.set) return;
  const decoded = jidDecode2(targetJid);
  if (!decoded?.user) return;
  try {
    let existingDevices = [];
    if (typeof socket.userDevicesCache.get === "function") {
      const cached = await socket.userDevicesCache.get(decoded.user).catch(() => void 0);
      if (Array.isArray(cached) && cached.length > 0) {
        existingDevices = cached;
      }
    }
    if (existingDevices.length === 0 && typeof socket.getUSyncDevices === "function") {
      existingDevices = await Promise.race([
        socket.getUSyncDevices([targetJid], true, false),
        new Promise((resolve) => setTimeout(() => resolve([]), 3500))
      ]).catch(() => []);
    }
    const hasTarget = Array.isArray(existingDevices) && existingDevices.some((d) => d?.user === decoded.user);
    if (!hasTarget) {
      const deviceRecord = [{ user: decoded.user, device: 0, domainType: decoded.domainType || 0, server: "bot" }];
      if (typeof socket.userDevicesCache.mset === "function") {
        await socket.userDevicesCache.mset([{ key: decoded.user, value: deviceRecord }]);
      } else {
        await socket.userDevicesCache.set(decoded.user, deviceRecord);
      }
    }
  } catch {
  }
}
async function ensureBotSignalSessionAndDevice(sessionId, socket, targetJid) {
  if (!targetJid.endsWith("@bot")) return true;
  const cacheKey = `${sessionId}::${targetJid}`;
  const cachedUntil = botSignalReadyCache.get(cacheKey);
  if (cachedUntil && cachedUntil > Date.now()) {
    await ensureBotDeviceCached(socket, targetJid);
    return true;
  }
  const decoded = jidDecode2(targetJid);
  if (!decoded?.user) return false;
  const repo = socket?.signalRepository;
  let hasSession = false;
  if (repo?.validateSession) {
    try {
      const val = await repo.validateSession(targetJid);
      hasSession = Boolean(val?.exists);
    } catch {
      hasSession = false;
    }
  }
  if (!hasSession && typeof socket?.assertSessions === "function") {
    try {
      await Promise.race([
        socket.assertSessions([targetJid], true),
        new Promise((resolve) => setTimeout(() => resolve(null), 5e3))
      ]);
      if (repo?.validateSession) {
        const recheckAssert = await repo.validateSession(targetJid);
        hasSession = Boolean(recheckAssert?.exists);
      }
    } catch {
    }
  }
  if (!hasSession && typeof socket?.query === "function" && repo) {
    try {
      const res = await Promise.race([
        socket.query({
          tag: "iq",
          attrs: {
            xmlns: "encrypt",
            type: "get",
            to: S_WHATSAPP_NET
          },
          content: [
            {
              tag: "key",
              attrs: {},
              content: [{ tag: "user", attrs: { jid: targetJid } }]
            }
          ]
        }),
        new Promise((_, reject) => setTimeout(() => reject(new Error("Timeout query prekey Meta AI")), 6e3))
      ]);
      if (res) {
        await parseAndInjectE2ESessions(res, repo);
        if (repo.validateSession) {
          const recheck = await repo.validateSession(targetJid);
          hasSession = Boolean(recheck?.exists);
        } else {
          hasSession = true;
        }
      }
    } catch (err) {
      console.warn(`[Meta AI Session] Gagal fetch prekey untuk ${targetJid}: ${err?.message || err}`);
    }
  }
  await ensureBotDeviceCached(socket, targetJid);
  if (hasSession) {
    botSignalReadyCache.set(cacheKey, Date.now() + BOT_SIGNAL_READY_TTL_MS);
    capMapSize(botSignalReadyCache, MAX_TRACKED_SESSIONS * 2);
  } else {
    botSignalReadyCache.delete(cacheKey);
  }
  return hasSession;
}
async function resolveMetaAiCandidateJids(sessionId, socket) {
  const ordered = [];
  const preferred = sessionPreferredMetaJid.get(sessionId);
  if (preferred && isRoutableOutgoingMetaJid(preferred)) {
    ordered.push(preferred);
  }
  const bots = await fetchAccountBotList(sessionId, socket);
  const cachedEntry = sessionBotEntries.get(sessionId);
  const accountExplicitlyListedNoBots = Boolean(cachedEntry && cachedEntry.entries.length === 0);
  const metaBotFirst = [
    ...bots.filter((b) => b.jid === DEFAULT_META_AI_BOT_JID || b.jid.startsWith("867051314767696")),
    ...bots.filter((b) => b.jid !== DEFAULT_META_AI_BOT_JID && !b.jid.startsWith("867051314767696"))
  ];
  for (const bot of metaBotFirst) {
    ordered.push(bot.jid);
  }
  let discoveredLid = sessionMetaAiLids.get(sessionId) || null;
  if (!discoveredLid) {
    discoveredLid = await lookupMetaAiLidViaSignal(sessionId, socket);
  }
  if (!discoveredLid && typeof socket?.onWhatsApp === "function") {
    try {
      const checkRes = await Promise.race([
        socket.onWhatsApp("13135550002"),
        new Promise((resolve) => setTimeout(() => resolve(null), 2500))
      ]);
      if (Array.isArray(checkRes) && checkRes[0]) {
        const resolved = checkRes[0]?.lid || checkRes[0]?.jid;
        if (typeof resolved === "string" && resolved.trim()) {
          const cleanResolved = resolved.trim().endsWith("@c.us") ? safeNormalizeJid(resolved.trim()) : resolved.trim();
          if (isRoutableOutgoingMetaJid(cleanResolved)) {
            rememberSessionMetaAiLid(sessionId, cleanResolved);
            discoveredLid = cleanResolved;
          }
        }
      }
    } catch {
    }
  }
  if (accountExplicitlyListedNoBots && discoveredLid && isRoutableOutgoingMetaJid(discoveredLid)) {
    ordered.push(discoveredLid);
  }
  ordered.push(DEFAULT_META_AI_BOT_JID);
  if (discoveredLid && isRoutableOutgoingMetaJid(discoveredLid)) {
    ordered.push(discoveredLid);
  }
  for (const fallbackJid of FALLBACK_META_AI_JIDS) {
    if (isRoutableOutgoingMetaJid(fallbackJid)) {
      ordered.push(fallbackJid);
    }
  }
  const dedupedValid = Array.from(new Set(ordered.filter((j) => isRoutableOutgoingMetaJid(j))));
  const nonRejected = dedupedValid.filter((j) => !isSessionBotJidRejected(sessionId, j));
  if (nonRejected.length === 0) return dedupedValid;
  const nonRejectedSet = new Set(nonRejected);
  return [...nonRejected, ...dedupedValid.filter((j) => !nonRejectedSet.has(j))];
}
async function simulateHumanMetaTyping(socket, targetJid, _promptText) {
  if (typeof socket?.sendPresenceUpdate !== "function") return;
  const preDelayMs = crypto3.randomInt(100, 220);
  await new Promise((r) => setTimeout(r, preDelayMs));
  void Promise.race([
    socket.sendPresenceUpdate("composing", targetJid),
    new Promise((r) => setTimeout(r, 600))
  ]).catch(() => {
  });
  const typingMs = crypto3.randomInt(150, 300);
  await new Promise((r) => setTimeout(r, typingMs));
  void Promise.race([
    socket.sendPresenceUpdate("paused", targetJid),
    new Promise((r) => setTimeout(r, 500))
  ]).catch(() => {
  });
}
var ownCompanionDevicesCache = /* @__PURE__ */ new Map();
async function sendBotDirectStanza(socket, targetJid, waMessage, msgId) {
  if (!targetJid.endsWith("@bot")) return false;
  if (typeof socket?.sendNode !== "function" || typeof socket?.signalRepository?.encryptMessage !== "function") {
    return false;
  }
  const meId = String(socket?.authState?.creds?.me?.id || socket?.user?.id || "").trim();
  const meLid = String(socket?.authState?.creds?.me?.lid || socket?.user?.lid || "").trim();
  if (!meId || !meLid) return false;
  const meLidDecoded = jidDecode2(meLid);
  if (!meLidDecoded?.user) return false;
  const normalizedOwnLid = jidNormalizedUser(meLid);
  let ownDevices = [];
  const cachedOwn = ownCompanionDevicesCache.get(normalizedOwnLid);
  if (cachedOwn && cachedOwn.exp > Date.now()) {
    ownDevices = cachedOwn.devices;
  } else if (typeof socket.getUSyncDevices === "function") {
    try {
      const fetched = await Promise.race([
        socket.getUSyncDevices([normalizedOwnLid], true, false),
        new Promise((resolve) => setTimeout(() => resolve([]), 2200))
      ]);
      if (Array.isArray(fetched) && fetched.length > 0) {
        ownDevices = fetched;
        ownCompanionDevicesCache.set(normalizedOwnLid, { devices: fetched, exp: Date.now() + 5 * 60 * 1e3 });
        capMapSize(ownCompanionDevicesCache, MAX_TRACKED_SESSIONS);
      }
    } catch {
      ownDevices = [];
    }
  }
  const meRecipients = [];
  const seenOwnJids = /* @__PURE__ */ new Set();
  const isSameOwnDevice = (candidateJid) => {
    if (candidateJid === meId || candidateJid === meLid) return true;
    const dec = jidDecode2(candidateJid);
    return Boolean(
      dec && dec.user === meLidDecoded.user && (dec.device || 0) === (meLidDecoded.device || 0)
    );
  };
  for (const dev of ownDevices) {
    const devJid = typeof dev?.jid === "string" ? dev.jid.trim() : "";
    if (!devJid || seenOwnJids.has(devJid) || isSameOwnDevice(devJid)) continue;
    const dec = jidDecode2(devJid);
    if (!dec || dec.user !== meLidDecoded.user) continue;
    seenOwnJids.add(devJid);
    meRecipients.push(devJid);
  }
  if (!seenOwnJids.has(normalizedOwnLid) && !isSameOwnDevice(normalizedOwnLid)) {
    meRecipients.push(normalizedOwnLid);
  }
  if (meRecipients.length > 0 && typeof socket.assertSessions === "function") {
    try {
      await Promise.race([
        socket.assertSessions(meRecipients),
        new Promise((resolve) => setTimeout(resolve, 2500))
      ]);
    } catch {
    }
  }
  const runTransaction = async (work) => {
    const tx = socket?.authState?.keys?.transaction;
    if (typeof tx === "function") {
      return await tx.call(socket.authState.keys, work, meId);
    }
    return await work();
  };
  const participantNodes = [];
  let shouldIncludeDeviceIdentity = false;
  await runTransaction(async () => {
    if (meRecipients.length > 0) {
      const meMsg = {
        deviceSentMessage: {
          destinationJid: targetJid,
          message: waMessage
        },
        messageContextInfo: waMessage.messageContextInfo
      };
      const encodedDsm = encodeWAMessage(meMsg);
      for (const meDeviceJid of meRecipients) {
        try {
          const { type, ciphertext } = await socket.signalRepository.encryptMessage({
            jid: meDeviceJid,
            data: encodedDsm
          });
          if (type === "pkmsg") shouldIncludeDeviceIdentity = true;
          participantNodes.push({
            tag: "to",
            attrs: { jid: meDeviceJid },
            content: [
              {
                tag: "enc",
                attrs: { v: "2", type },
                content: ciphertext
              }
            ]
          });
        } catch {
        }
      }
    }
    const encodedTarget = encodeWAMessage(waMessage);
    const { type: botEncType, ciphertext: botCiphertext } = await socket.signalRepository.encryptMessage({
      jid: targetJid,
      data: encodedTarget
    });
    if (botEncType === "pkmsg") {
      shouldIncludeDeviceIdentity = true;
    }
    participantNodes.push({
      tag: "to",
      attrs: { jid: targetJid },
      content: [
        {
          tag: "enc",
          attrs: { v: "2", type: botEncType },
          content: botCiphertext
        }
      ]
    });
  });
  const binaryNodeContent = [
    {
      tag: "participants",
      attrs: {},
      content: participantNodes
    }
  ];
  const account = socket?.authState?.creds?.account;
  if (shouldIncludeDeviceIdentity && account) {
    binaryNodeContent.push({
      tag: "device-identity",
      attrs: {},
      content: encodeSignedDeviceIdentity(account, true)
    });
  }
  const stanza = {
    tag: "message",
    attrs: {
      id: msgId,
      to: targetJid,
      type: "text"
    },
    content: binaryNodeContent
  };
  await socket.sendNode(stanza);
  try {
    socket?.messageRetryManager?.addRecentMessage?.(targetJid, msgId, waMessage);
  } catch {
  }
  return true;
}
async function sendPromptToSingleJid(sessionId, socket, targetJid, promptText, waiter) {
  const isBotDomain = targetJid.endsWith("@bot");
  const messageSecret = crypto3.randomBytes(32);
  if (isBotDomain) {
    const sessionOk = await ensureBotSignalSessionAndDevice(sessionId, socket, targetJid);
    if (!sessionOk) {
      throw new Error(`Sesi Signal ke ${targetJid} tidak tersedia dari server WhatsApp.`);
    }
  }
  const userJid = socket?.authState?.creds?.me?.id || socket?.user?.id || "";
  const msgId = generateMessageIDV2(userJid);
  storePendingBotSecret(sessionId, msgId, targetJid, messageSecret);
  if (waiter && !waiter.settled) {
    waiter.pendingAckMsgIds.add(msgId);
    waiter.msgIdToTargetJid.set(msgId, targetJid);
  }
  const cachedBotsEntry = sessionBotEntries.get(sessionId);
  const accountExplicitlyListedNoBots = Boolean(cachedBotsEntry && cachedBotsEntry.entries.length === 0);
  const personaId = sessionBotPersonas.get(sessionId)?.get(targetJid) || sessionBotPersonas.get(sessionId)?.get(safeNormalizeJid(targetJid)) || (!accountExplicitlyListedNoBots && targetJid.startsWith("867051314767696") ? DEFAULT_META_AI_PERSONA_ID : void 0);
  if (typeof socket?.relayMessage === "function" && userJid) {
    const fullMsg = await generateWAMessage(
      targetJid,
      { text: promptText },
      {
        userJid,
        messageId: msgId,
        logger: typeof socket?.logger?.child === "function" ? socket.logger : void 0,
        upload: socket.waUploadToServer
      }
    );
    if (fullMsg.message) {
      fullMsg.message.messageContextInfo = {
        ...fullMsg.message.messageContextInfo || {},
        messageSecret,
        ...isBotDomain && personaId ? { botMetadata: { personaId } } : {}
      };
    }
    await simulateHumanMetaTyping(socket, targetJid, promptText);
    sessionLastPromptAt.set(sessionId, Date.now());
    let sentViaDirectBot = false;
    if (isBotDomain && fullMsg.message) {
      try {
        sentViaDirectBot = await Promise.race([
          sendBotDirectStanza(socket, targetJid, fullMsg.message, msgId),
          new Promise(
            (_, reject) => setTimeout(() => reject(new Error("Timeout mengirim prompt ke Meta AI")), 1e4)
          )
        ]);
      } catch (directErr) {
        if (directErr instanceof Error && directErr.message.includes("Timeout mengirim prompt")) {
          throw directErr;
        }
        sentViaDirectBot = false;
      }
    }
    if (!sentViaDirectBot) {
      await Promise.race([
        socket.relayMessage(targetJid, fullMsg.message, { messageId: msgId }),
        new Promise((_, reject) => setTimeout(() => reject(new Error("Timeout mengirim prompt ke Meta AI")), 1e4))
      ]);
    }
    if (!sessionMetaAiLids.has(sessionId)) {
      await lookupMetaAiLidViaSignal(sessionId, socket);
    }
    return targetJid;
  }
  await simulateHumanMetaTyping(socket, targetJid, promptText);
  sessionLastPromptAt.set(sessionId, Date.now());
  const sentMsg = await Promise.race([
    socket.sendMessage(targetJid, { text: promptText }),
    new Promise((_, reject) => setTimeout(() => reject(new Error("Timeout mengirim prompt ke Meta AI")), 1e4))
  ]);
  if (sentMsg?.key?.id) {
    const realSecret = sentMsg?.message?.messageContextInfo?.messageSecret;
    if (realSecret?.length) {
      storePendingBotSecret(sessionId, sentMsg.key.id, sentMsg?.key?.remoteJid || targetJid, Buffer.from(realSecret));
    }
    waiter?.pendingAckMsgIds.add(sentMsg.key.id);
    waiter?.msgIdToTargetJid.set(sentMsg.key.id, sentMsg?.key?.remoteJid || targetJid);
  }
  if (sentMsg?.key?.remoteJid && typeof sentMsg.key.remoteJid === "string") {
    rememberSessionMetaAiLid(sessionId, sentMsg.key.remoteJid);
  }
  if (!sessionMetaAiLids.has(sessionId)) {
    await lookupMetaAiLidViaSignal(sessionId, socket);
  }
  return sentMsg?.key?.remoteJid || targetJid;
}
async function sendPromptToMetaAi(sessionId, socket, promptText, waiter) {
  let lastError = null;
  const candidates = await resolveMetaAiCandidateJids(sessionId, socket);
  for (let i = 0; i < candidates.length; i++) {
    const targetJid = candidates[i];
    try {
      const usedJid = await sendPromptToSingleJid(sessionId, socket, targetJid, promptText, waiter);
      if (usedJid) {
        sessionPreferredMetaJid.set(sessionId, usedJid);
        capMapSize(sessionPreferredMetaJid, MAX_TRACKED_SESSIONS);
      }
      return {
        usedJid,
        remainingCandidates: candidates.slice(i + 1)
      };
    } catch (err) {
      lastError = err;
    }
  }
  if (lastError) {
    throw lastError instanceof Error ? lastError : new Error(String(lastError));
  }
  throw new Error("Tidak ada JID Meta AI yang dapat digunakan untuk mengirim pesan.");
}
async function warmMetaAiSession(sessionId, socket) {
  if (!sessionId || !isSocketOpen(socket)) return;
  try {
    attachMetaAiRawSocketHandlers(socket, sessionId);
    const bots = await fetchAccountBotList(sessionId, socket);
    if (!isSocketOpen(socket)) return;
    if (!sessionMetaAiLids.has(sessionId)) {
      await lookupMetaAiLidViaSignal(sessionId, socket);
    }
    if (!isSocketOpen(socket)) return;
    const preferredBot = bots.find((b) => b.jid === DEFAULT_META_AI_BOT_JID || b.jid.startsWith("867051314767696"))?.jid || bots[0]?.jid || DEFAULT_META_AI_BOT_JID;
    if (preferredBot.endsWith("@bot")) {
      await ensureBotSignalSessionAndDevice(sessionId, socket, preferredBot);
    }
  } catch {
  }
}
async function askMetaAiViaBaileys(params, offlineFallbackText) {
  const fallbackReply = (offlineFallbackText || "").trim() || "Halo! Terima kasih telah menghubungi kami. Pesan Anda sudah kami terima dan akan segera ditindaklanjuti oleh tim CS kami.";
  const startedAt = Date.now();
  const cleanMessage = String(params.messageBody || "").trim();
  if (!cleanMessage) {
    return {
      replyText: fallbackReply,
      usedAi: false,
      isOfflineFallback: true,
      retryable: false,
      source: "offline_fallback",
      sessionId: params.sessionId,
      errorReason: "Pesan pelanggan kosong."
    };
  }
  if (!socketProvider) {
    const err = "Provider sesi WhatsApp Baileys belum diinisialisasi.";
    recordAiAuditEvent({
      level: "ERROR",
      stage: "socket_lookup",
      user_id: params.userId,
      session_id: params.sessionId,
      customer_code: params.customerCode,
      senderPhone: params.senderPhone,
      error_code: "NO_SOCKET_PROVIDER",
      reason: err
    });
    return {
      replyText: fallbackReply,
      usedAi: false,
      isOfflineFallback: true,
      retryable: true,
      source: "offline_fallback",
      errorReason: err
    };
  }
  let entry = socketProvider(params.userId, params.sessionId);
  if (!entry || !isSocketOpen(entry.socket)) {
    entry = await ensureConnectedMetaAiSocketForUser(params.userId, params.sessionId);
  }
  if (!entry || !isSocketOpen(entry.socket)) {
    const err = "Belum ada perangkat WhatsApp Baileys yang terhubung untuk akun ini.";
    recordAiAuditEvent({
      level: "WARN",
      stage: "socket_lookup",
      user_id: params.userId,
      session_id: params.sessionId,
      customer_code: params.customerCode,
      senderPhone: params.senderPhone,
      error_code: "SOCKET_DISCONNECTED",
      reason: err
    });
    return {
      replyText: fallbackReply,
      usedAi: false,
      isOfflineFallback: true,
      retryable: true,
      source: "offline_fallback",
      errorReason: err
    };
  }
  const isManualTestChat = String(params.senderPhone || "").replace(/\D/g, "") === "628999000111";
  const hasIsolatedSessionState = Boolean(
    params.customerCode || params.orderSummary || Array.isArray(params.customerHistory) && params.customerHistory.length > 0 || Array.isArray(params.catalogProducts) && params.catalogProducts.length > 0
  );
  const canUseResponseCache = !isManualTestChat && !hasIsolatedSessionState && cleanMessage.length <= 240;
  const cacheKey = buildResponseCacheKey(
    params.userId,
    params.customSystemPrompt || "",
    cleanMessage,
    params.autoReplyRules,
    params.catalogShopName,
    params.catalogProducts
  );
  if (canUseResponseCache) {
    const cachedReply = getCachedMetaResponse(cacheKey);
    if (cachedReply) {
      return {
        replyText: cachedReply,
        usedAi: true,
        isOfflineFallback: false,
        retryable: false,
        source: "meta_ai_whatsapp",
        sessionId: entry.sessionId
      };
    }
  }
  const activeCooldown = getActiveSessionCooldown(entry.sessionId);
  if (activeCooldown) {
    recordAiAuditEvent({
      level: "WARN",
      stage: "cooldown_guard",
      user_id: params.userId,
      session_id: entry.sessionId,
      customer_code: params.customerCode,
      senderPhone: params.senderPhone,
      error_code: "COOLDOWN_ACTIVE",
      reason: activeCooldown.reason
    });
    const isPermanentBotUnavailable = activeCooldown.reason.includes("bot_unavailable_fanout");
    return {
      replyText: fallbackReply,
      usedAi: false,
      isOfflineFallback: true,
      retryable: !isPermanentBotUnavailable,
      source: "offline_fallback",
      sessionId: entry.sessionId,
      errorReason: activeCooldown.reason
    };
  }
  if (!checkAndRecordSenderBurst(entry.sessionId, params.senderPhone)) {
    const err = "Pengirim sedang dalam jeda anti-flood singkat untuk melindungi akun Meta AI.";
    recordAiAuditEvent({
      level: "WARN",
      stage: "anti_flood",
      user_id: params.userId,
      session_id: entry.sessionId,
      customer_code: params.customerCode,
      senderPhone: params.senderPhone,
      error_code: "SENDER_BURST_LIMIT",
      reason: err
    });
    return {
      replyText: fallbackReply,
      usedAi: false,
      isOfflineFallback: true,
      retryable: true,
      source: "offline_fallback",
      sessionId: entry.sessionId,
      errorReason: err
    };
  }
  const promptText = buildMetaAiPrompt(params);
  const runQueuedMetaQuery = async (targetSessionId) => {
    return await enqueueSessionTask(targetSessionId, async () => {
      const liveEntry = socketProvider ? socketProvider(params.userId, targetSessionId) : null;
      if (!liveEntry || !isSocketOpen(liveEntry.socket)) {
        return {
          ok: false,
          socketDropped: true,
          reason: "Perangkat WhatsApp Baileys terputus sebelum mengirim ke Meta AI."
        };
      }
      const cooldownInsideQueue = getActiveSessionCooldown(liveEntry.sessionId);
      if (cooldownInsideQueue) {
        return { ok: false, reason: cooldownInsideQueue.reason };
      }
      const lastAt = sessionLastPromptAt.get(liveEntry.sessionId) || 0;
      const consecutive = (sessionConsecutiveSends.get(liveEntry.sessionId) || 0) + 1;
      sessionConsecutiveSends.set(liveEntry.sessionId, consecutive);
      const breatherMs = consecutive % 6 === 0 ? crypto3.randomInt(1800, 3e3) : 0;
      const minGapMs = MIN_INTER_QUERY_MS + crypto3.randomInt(0, INTER_QUERY_JITTER_MS) + breatherMs;
      const elapsed = Date.now() - lastAt;
      if (lastAt > 0 && elapsed < minGapMs) {
        await new Promise((r) => setTimeout(r, minGapMs - elapsed));
      }
      const rateCheck = await waitAndRecordSessionRateWindow(liveEntry.sessionId);
      if (!rateCheck.allowed) {
        return { ok: false, reason: rateCheck.reason };
      }
      attachMetaAiRawSocketHandlers(liveEntry.socket, liveEntry.sessionId);
      if (activeWaiters.has(liveEntry.sessionId)) {
        finalizeWaiter(liveEntry.sessionId, { ok: false, reason: "Waiter digantikan oleh antrean baru." });
      }
      rememberPromptEcho(liveEntry.sessionId, promptText);
      return await new Promise(async (resolve) => {
        const hardTimer = setTimeout(() => {
          const current = activeWaiters.get(liveEntry.sessionId);
          if (current && !current.settled && current.latestText) {
            finalizeWaiter(liveEntry.sessionId, { ok: true, text: current.latestText });
          } else {
            sessionPreferredMetaJid.delete(liveEntry.sessionId);
            for (const key of Array.from(botSignalReadyCache.keys())) {
              if (key.startsWith(`${liveEntry.sessionId}::`)) {
                botSignalReadyCache.delete(key);
              }
            }
            finalizeWaiter(liveEntry.sessionId, {
              ok: false,
              reason: current?.lastAckError || "Meta AI di WhatsApp tidak merespons tepat waktu (timeout). Pastikan fitur Meta AI aktif pada akun WhatsApp yang tertaut."
            });
          }
        }, HARD_TIMEOUT_MS);
        const waiter = {
          sessionId: liveEntry.sessionId,
          customerCode: params.customerCode,
          promptSent: promptText,
          sentAt: Date.now(),
          latestText: "",
          hasSignal: false,
          settled: false,
          pendingAckMsgIds: /* @__PURE__ */ new Set(),
          msgIdToTargetJid: /* @__PURE__ */ new Map(),
          resolve,
          hardTimer,
          settleTimer: null,
          retryTimer: null
        };
        activeWaiters.set(liveEntry.sessionId, waiter);
        try {
          const sendRes = await sendPromptToMetaAi(liveEntry.sessionId, liveEntry.socket, promptText, waiter);
          if (sendRes.remainingCandidates.length > 0 && !waiter.settled && !waiter.hasSignal) {
            let candidateIdx = 0;
            const tryNextCandidate = async () => {
              const current = activeWaiters.get(liveEntry.sessionId);
              if (!current || current.settled || current.hasSignal || current.latestText) return false;
              if (current.fallbackInProgress) return true;
              current.fallbackInProgress = true;
              try {
                while (candidateIdx < sendRes.remainingCandidates.length) {
                  const nextJid = sendRes.remainingCandidates[candidateIdx++];
                  try {
                    await sendPromptToSingleJid(liveEntry.sessionId, liveEntry.socket, nextJid, promptText, current);
                    if (candidateIdx >= sendRes.remainingCandidates.length) {
                      current.fallbackAttemptFn = void 0;
                    } else if (!current.settled && !current.hasSignal) {
                      current.retryTimer = setTimeout(() => {
                        void tryNextCandidate();
                      }, SILENT_FALLBACK_RETRY_MS);
                    }
                    return true;
                  } catch {
                  }
                }
                current.fallbackAttemptFn = void 0;
                return false;
              } finally {
                current.fallbackInProgress = false;
              }
            };
            waiter.fallbackAttemptFn = tryNextCandidate;
            waiter.retryTimer = setTimeout(() => {
              void tryNextCandidate();
            }, SILENT_FALLBACK_RETRY_MS);
          }
        } catch (sendErr) {
          const errStr = String(sendErr?.message || "");
          const droppedNow = !isSocketOpen(liveEntry.socket) || /closed|terputus|connection/i.test(errStr);
          finalizeWaiter(liveEntry.sessionId, {
            ok: false,
            reason: errStr || "Gagal mengirim pesan ke kontak Meta AI."
          });
          if (droppedNow) {
          }
        }
      });
    });
  };
  try {
    let queryResult = await runQueuedMetaQuery(entry.sessionId);
    const lostSocketMidQuery = !queryResult.ok && (queryResult.socketDropped || /terputus|closed|connection|not open/i.test(queryResult.reason || ""));
    if (lostSocketMidQuery) {
      await new Promise((r) => setTimeout(r, 1200));
      const recovered = await ensureConnectedMetaAiSocketForUser(params.userId, params.sessionId || entry.sessionId);
      if (recovered && isSocketOpen(recovered.socket)) {
        entry = recovered;
        queryResult = await runQueuedMetaQuery(recovered.sessionId);
      }
    }
    if (queryResult.ok && queryResult.text) {
      sessionCooldowns.delete(entry.sessionId);
      sessionLastMetaError.delete(entry.sessionId);
      const cleanedBase = cleanMetaAiReply(queryResult.text) || stripCustomerCodeTags(queryResult.text);
      const cleaned = reconcileCatalogImageLinksInReply(cleanedBase, cleanMessage, params.catalogProducts);
      if (canUseResponseCache && cleaned) {
        storeCachedMetaResponse(cacheKey, cleaned);
      }
      recordAiAuditEvent({
        level: "INFO",
        stage: "meta_ai_reply",
        user_id: params.userId,
        session_id: entry.sessionId,
        customer_code: params.customerCode,
        senderPhone: params.senderPhone,
        reason: "Meta AI berhasil merespons pelanggan.",
        latency_ms: Date.now() - startedAt
      });
      return {
        replyText: cleaned,
        usedAi: true,
        isOfflineFallback: false,
        retryable: false,
        source: "meta_ai_whatsapp",
        sessionId: entry.sessionId
      };
    }
    const errReason = queryResult.reason || "Meta AI tidak memberikan balasan.";
    const lowerReason = errReason.toLowerCase();
    const isPermanentUnavailable = lowerReason.includes("bot_unavailable_fanout");
    const isRetryableFailure = !isPermanentUnavailable;
    recordAiAuditEvent({
      level: "ERROR",
      stage: lowerReason.includes("timeout") ? "meta_ai_timeout" : "meta_ai_reply",
      user_id: params.userId,
      session_id: entry.sessionId,
      customer_code: params.customerCode,
      senderPhone: params.senderPhone,
      error_code: lowerReason.includes("timeout") ? "META_AI_TIMEOUT" : "META_AI_NO_REPLY",
      reason: errReason,
      latency_ms: Date.now() - startedAt
    });
    return {
      replyText: fallbackReply,
      usedAi: false,
      isOfflineFallback: true,
      retryable: isRetryableFailure,
      source: "offline_fallback",
      sessionId: entry.sessionId,
      errorReason: errReason
    };
  } catch (err) {
    const errMsg = err?.message || "Gagal memproses antrean Meta AI.";
    recordAiAuditEvent({
      level: "ERROR",
      stage: "meta_ai_reply",
      user_id: params.userId,
      session_id: entry.sessionId,
      customer_code: params.customerCode,
      senderPhone: params.senderPhone,
      error_code: "META_AI_QUEUE_EXCEPTION",
      reason: errMsg,
      latency_ms: Date.now() - startedAt
    });
    return {
      replyText: fallbackReply,
      usedAi: false,
      isOfflineFallback: true,
      retryable: true,
      source: "offline_fallback",
      sessionId: entry.sessionId,
      errorReason: errMsg
    };
  }
}

// src/lib/baileysManager.ts
init_mysqlService();

// src/lib/telegramService.ts
init_db();
var telegramAlertCooldowns = /* @__PURE__ */ new Map();
function escapeTelegramHtml(input) {
  return String(input ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
function capCooldownMap() {
  if (telegramAlertCooldowns.size <= 500) return;
  const now = Date.now();
  for (const [k, exp] of telegramAlertCooldowns.entries()) {
    if (exp <= now) telegramAlertCooldowns.delete(k);
  }
  while (telegramAlertCooldowns.size > 500) {
    const oldest = telegramAlertCooldowns.keys().next().value;
    if (!oldest) break;
    telegramAlertCooldowns.delete(oldest);
  }
}
async function postTelegramSendMessage(params) {
  const token = String(params.botToken || "").trim();
  const chatId = String(params.chatId || "").trim();
  if (!token || !chatId) {
    return { ok: false, error: "Bot token atau Chat ID Telegram kosong." };
  }
  const endpoint = `https://api.telegram.org/bot${encodeURIComponent(token)}/sendMessage`;
  const bodyPayload = {
    chat_id: chatId,
    text: String(params.text || "").slice(0, 3900),
    disable_web_page_preview: true
  };
  if (params.parseMode !== null) {
    bodyPayload.parse_mode = params.parseMode || "HTML";
  }
  try {
    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(bodyPayload),
      signal: AbortSignal.timeout(7e3)
    });
    const data = await res.json().catch(() => null);
    if (!res.ok || !data?.ok) {
      const desc = typeof data?.description === "string" && data.description ? data.description.slice(0, 220) : `HTTP ${res.status}`;
      return { ok: false, status: res.status, error: desc };
    }
    return { ok: true, status: res.status };
  } catch (err) {
    return { ok: false, error: err?.message ? String(err.message).slice(0, 180) : "Timeout / gagal terhubung ke Telegram API" };
  }
}
async function sendTelegramAlert(params) {
  if (params.dedupKey) {
    const now = Date.now();
    const existingUntil = telegramAlertCooldowns.get(params.dedupKey) || 0;
    if (existingUntil > now) {
      return { sent: 0, failed: 0, skippedCooldown: true };
    }
    const cd = Math.max(5e3, params.cooldownMs ?? 12e4);
    telegramAlertCooldowns.set(params.dedupKey, now + cd);
    capCooldownMap();
  }
  const targets = getActiveTelegramTargets();
  if (targets.length === 0) {
    return { sent: 0, failed: 0 };
  }
  const appName = getWhitelabelConfig()?.app_name || "Japriin";
  const icon = params.severity === "critical" ? "\u{1F6A8}" : params.severity === "warn" ? "\u26A0\uFE0F" : params.severity === "success" ? "\u2705" : "\u2139\uFE0F";
  const bodyLines = (params.lines || []).filter(Boolean).join("\n");
  const fullMessage = `${icon} <b>${escapeTelegramHtml(params.title)}</b>
<i>${escapeTelegramHtml(appName)} \xB7 ${escapeTelegramHtml((/* @__PURE__ */ new Date()).toLocaleString("id-ID"))}</i>

` + bodyLines;
  let sent = 0;
  let failed = 0;
  const results = await Promise.allSettled(
    targets.map(
      (t) => postTelegramSendMessage({
        botToken: t.botToken,
        chatId: t.chatId,
        text: fullMessage,
        parseMode: "HTML"
      })
    )
  );
  for (const r of results) {
    if (r.status === "fulfilled" && r.value.ok) {
      sent++;
    } else {
      failed++;
      const errMsg = r.status === "fulfilled" ? r.value.error : String(r.reason || "unknown");
      console.warn("[Telegram Alert] Gagal mengirim notifikasi:", errMsg);
    }
  }
  return { sent, failed };
}

// src/lib/baileysManager.ts
init_security();

// src/lib/orderAssistant.ts
import crypto4 from "crypto";
var CUSTOMER_TTL_MS = 6 * 60 * 60 * 1e3;
var MAX_TRACKED_CUSTOMERS = 1e3;
var MAX_HISTORY_TURNS = 8;
var customerContexts = /* @__PURE__ */ new Map();
var maintenanceTimer = setInterval(() => {
  const cutoff = Date.now() - CUSTOMER_TTL_MS;
  for (const [k, v] of customerContexts.entries()) {
    if (v.updatedAt < cutoff) {
      customerContexts.delete(k);
    }
  }
}, 10 * 60 * 1e3);
maintenanceTimer.unref?.();
function normalizePhoneKey(phone) {
  const digits = String(phone || "").replace(/\D/g, "");
  if (!digits) return String(phone || "guest").trim().toLowerCase();
  if (digits.startsWith("0")) return `62${digits.slice(1)}`;
  return digits;
}
function buildCustomerCode(scopeId, senderPhone) {
  const norm = normalizePhoneKey(senderPhone);
  const digest = crypto4.createHash("sha256").update(`${scopeId || "global"}::${norm}`).digest();
  const num = 1e4 + digest.readUInt32BE(0) % 9e4;
  return `customer_${num}`;
}
function generateInvoiceNumber(customerCode) {
  const d = /* @__PURE__ */ new Date();
  const ymd = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
  const suffix = customerCode.replace(/\D/g, "").slice(-3) || "001";
  const rand = crypto4.randomInt(100, 999);
  return `INV-${ymd}-${suffix}${rand}`;
}
function evictOldestIfNeeded() {
  if (customerContexts.size <= MAX_TRACKED_CUSTOMERS) return;
  let oldestKey = null;
  let oldestTime = Infinity;
  for (const [k, v] of customerContexts.entries()) {
    if (v.updatedAt < oldestTime) {
      oldestTime = v.updatedAt;
      oldestKey = k;
    }
  }
  if (oldestKey) customerContexts.delete(oldestKey);
}
function getOrCreateCustomerContext(scopeId, senderPhone) {
  const normPhone = normalizePhoneKey(senderPhone);
  const key = `${scopeId || "global"}::${normPhone}`;
  const now = Date.now();
  const existing = customerContexts.get(key);
  if (existing && now - existing.updatedAt < CUSTOMER_TTL_MS) {
    existing.updatedAt = now;
    return existing;
  }
  const customerCode = buildCustomerCode(scopeId, normPhone);
  const fresh = {
    key,
    customerCode,
    history: [],
    cart: [],
    stage: "browsing",
    invoiceNumber: generateInvoiceNumber(customerCode),
    selectedPaymentMethod: void 0,
    notifiedPaidInvoices: [],
    updatedAt: now
  };
  customerContexts.set(key, fresh);
  evictOldestIfNeeded();
  return fresh;
}
function recordCustomerTurn(scopeId, senderPhone, role, text) {
  const clean = String(text || "").trim();
  if (!clean) return;
  const ctx = getOrCreateCustomerContext(scopeId, senderPhone);
  ctx.history.push({
    role,
    text: clean.slice(0, 600),
    at: Date.now()
  });
  if (ctx.history.length > MAX_HISTORY_TURNS) {
    ctx.history = ctx.history.slice(-MAX_HISTORY_TURNS);
  }
  ctx.updatedAt = Date.now();
}
function formatRupiahId(value) {
  const safe = Number.isFinite(value) ? Math.max(0, Math.round(value)) : 0;
  return `Rp${safe.toLocaleString("id-ID")}`;
}
function calculateCartTotal(cart) {
  return cart.reduce((sum, item) => sum + Math.max(0, item.unitPrice) * Math.max(1, item.qty), 0);
}
function formatInvoiceText(cart, invoiceNumber, shopName) {
  if (!cart || cart.length === 0) return "";
  const total = calculateCartTotal(cart);
  const header = shopName ? `\u{1F9FE} *INVOICE PESANAN \u2014 ${shopName}*` : `\u{1F9FE} *INVOICE PESANAN*`;
  const lines = cart.map((item, idx) => {
    const subtotal = item.unitPrice * item.qty;
    const unitInfo = item.unitPrice > 0 ? `${formatRupiahId(item.unitPrice)} x ${item.qty} = *${formatRupiahId(subtotal)}*` : `${item.qty} pcs (harga dikonfirmasi admin)`;
    return `${idx + 1}. ${item.title}
   ${unitInfo}`;
  });
  return [
    header,
    `No. Invoice: \`${invoiceNumber}\``,
    "",
    ...lines,
    "",
    `\u{1F4B0} *Total Tagihan: ${total > 0 ? formatRupiahId(total) : "Sesuai konfirmasi admin"}*`
  ].join("\n");
}
function formatAvailablePaymentMethodsList(catalog) {
  const opts = [];
  if (catalog.bankAccounts.length > 0 || catalog.paymentNotes) {
    const bankNames = catalog.bankAccounts.map((b) => b.bank_name).filter(Boolean);
    opts.push(bankNames.length > 0 ? `\u{1F3E6} *Transfer Rekening* (${bankNames.join(" / ")})` : `\u{1F3E6} *Transfer Rekening*`);
  }
  if (catalog.qrisImageUrl) {
    opts.push(`\u{1F4F1} *QRIS* (Scan QR Instan)`);
  }
  return opts.join("\n");
}
function formatRekeningDetailsText(catalog) {
  const lines = ["\u{1F3E6} *Detail Transfer Rekening Pembayaran:*"];
  for (const acc of catalog.bankAccounts) {
    const holder = acc.account_holder ? ` a.n. *${acc.account_holder}*` : "";
    lines.push(`\u2022 *${acc.bank_name}*: \`${acc.account_number}\`${holder}`);
  }
  if (catalog.paymentNotes) {
    lines.push("");
    lines.push(catalog.paymentNotes);
  }
  return lines.join("\n").trim();
}
var STOP_WORDS = /* @__PURE__ */ new Set([
  "saya",
  "aku",
  "mau",
  "pesan",
  "pesankan",
  "pesen",
  "order",
  "beli",
  "ambil",
  "tambah",
  "tambahkan",
  "sebanyak",
  "jumlah",
  "qty",
  "buah",
  "pcs",
  "unit",
  "ekor",
  "paket",
  "bungkus",
  "botol",
  "box",
  "yang",
  "yg",
  "nya",
  "dong",
  "kak",
  "min",
  "admin",
  "tolong",
  "bisa",
  "minta",
  "ya",
  "ada",
  "harga",
  "berapa",
  "berapaan",
  "itu",
  "ini",
  "ke",
  "di",
  "dan",
  "atau",
  "sama",
  "dengan",
  "untuk",
  "buat"
]);
var WORD_NUMBERS = {
  satu: 1,
  dua: 2,
  tiga: 3,
  empat: 4,
  lima: 5,
  enam: 6,
  tujuh: 7,
  delapan: 8,
  sembilan: 9,
  sepuluh: 10
};
function parseQtyNearMatch(messageLower, titleLower) {
  const escaped = titleLower.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const afterTitle = messageLower.match(new RegExp(`${escaped}\\s*(?:sebanyak|jumlah|qty|x|kali)?\\s*(\\d{1,3})\\b`, "i"));
  if (afterTitle) return Math.min(999, Math.max(1, Number(afterTitle[1])));
  const beforeTitle = messageLower.match(new RegExp(`\\b(\\d{1,3})\\s*(?:pcs|buah|paket|unit|box|x)?\\s*${escaped}`, "i"));
  if (beforeTitle) return Math.min(999, Math.max(1, Number(beforeTitle[1])));
  const genericSebanyak = messageLower.match(/\b(?:sebanyak|jumlah|qty|order|pesan|pesankan|beli)\s+(\d{1,3})\b/i);
  if (genericSebanyak) return Math.min(999, Math.max(1, Number(genericSebanyak[1])));
  const standaloneQty = messageLower.match(/\b(\d{1,3})\s*(?:pcs|buah|paket|unit|box|botol|item|x)\b/i);
  if (standaloneQty) return Math.min(999, Math.max(1, Number(standaloneQty[1])));
  for (const [word, num] of Object.entries(WORD_NUMBERS)) {
    if (new RegExp(`\\b(?:sebanyak|pesan|pesankan|beli|order)\\s+${word}\\b|\\b${word}\\s+${escaped}`, "i").test(messageLower)) {
      return num;
    }
  }
  return 1;
}
function detectOrderedProducts(messageText, products) {
  if (!Array.isArray(products) || products.length === 0) return [];
  const lower = messageText.toLowerCase();
  const hasOrderVerb = /\b(pesan(?:kan)?|pesen|order|beli|checkout|cekout|tambah(?:kan)?|ambil(?:kan)?|mau\s+(?:beli|pesan|order|ambil))\b/i.test(lower);
  const hasExplicitQty = /\b\d{1,3}\s*(?:pcs|buah|paket|unit|box|botol|item|x)?\b/i.test(lower);
  if (!hasOrderVerb && !hasExplicitQty) return [];
  const segments = lower.split(/(?:,|\bdan\b|\bsama\b|\+|\n)+/).map((s) => s.trim()).filter(Boolean);
  const detected = /* @__PURE__ */ new Map();
  for (const segment of segments.length > 0 ? segments : [lower]) {
    let bestProduct = null;
    let bestScore = 0;
    for (const p of products) {
      const titleLower = p.title.toLowerCase().trim();
      if (!titleLower) continue;
      let score = 0;
      if (segment.includes(titleLower)) {
        score = 100 + titleLower.length;
      } else {
        const tokens = titleLower.split(/[^a-z0-9]+/i).filter((t) => t.length >= 2 && !STOP_WORDS.has(t));
        if (tokens.length > 0) {
          let hits = 0;
          for (const t of tokens) {
            if (new RegExp(`\\b${t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(segment)) {
              hits++;
            }
          }
          if (hits > 0 && (hits === tokens.length || tokens.length >= 2 && hits >= Math.ceil(tokens.length * 0.6))) {
            score = hits * 20;
          }
        }
      }
      if (score > bestScore) {
        bestScore = score;
        bestProduct = p;
      }
    }
    if (bestProduct && bestScore >= 20) {
      const qty = parseQtyNearMatch(segment, bestProduct.title.toLowerCase().trim());
      const prev = detected.get(bestProduct.title);
      if (prev) {
        prev.qty += qty;
      } else {
        detected.set(bestProduct.title, {
          title: bestProduct.title,
          qty,
          unitPrice: Math.max(0, Math.round(Number(bestProduct.price) || 0))
        });
      }
    }
  }
  return Array.from(detected.values());
}
function isCancelOrderIntent(lower) {
  return /\b(batal(?:kan)?|cancel|kosongkan|reset\s*pesanan|ganti\s*semua|ga\s*jadi|gak\s*jadi|tidak\s*jadi)\b/i.test(lower);
}
function isConfirmNoMoreItemsIntent(lower) {
  if (lower.length > 90) return false;
  return /^(?:tidak|nggak|enggak|engga|gak|ga|tdk|no|nope|tidak\s*ada|nggak\s*ada|gak\s*ada|tdk\s*ada|cukup|sudah|udah|udh|oke|ok|okey|siap|pas|lanjut|checkout|cekout|total(?:in|kan)?|mau\s*bayar|lanjut\s*bayar)(?:\s+(?:kak|min|admin|terima\s*kasih|makasih|aja|saja|kok|ya|nih|deh|itu\s*aja|itu\s*saja))*[!.\s]*$/i.test(
    lower.trim()
  ) || /\b(tidak\s+ada\s+tambahan|sudah\s+(?:oke|ok|cukup|pas|semua)|itu\s+(?:aja|saja)|lanjut\s+checkout|proses\s+checkout|mau\s+bayar\s+sekarang)\b/i.test(lower);
}
function detectPaymentSelection(lower, stage, catalog) {
  const isGeneralInquiry = /\b(metode\s*(?:pembayaran|bayar)|bayar(?:nya)?\s*(?:pakai|pake|via|lewat)\s*apa|pembayaran\s*apa|bisa\s*bayar\s*apa|pilihan\s*bayar)\b/i.test(lower);
  const wantsQris = /\b(qris|qr\s*code|kode\s*qr|barcode\s*qris|scan\s*qr|pake\s*qris|pakai\s*qris|bayar\s*qris|via\s*qris|minta\s*qris|kirim\s*qris)\b/i.test(lower) || stage === "awaiting_payment" && /\bqr\b/i.test(lower);
  const bankNames = catalog.bankAccounts.map((b) => b.bank_name.toLowerCase().trim()).filter((n) => n.length >= 2);
  const mentionsBankName = bankNames.some((name) => {
    const firstWord = name.split(/\s+/)[0];
    return firstWord.length >= 2 && new RegExp(`\\b${firstWord.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(lower);
  });
  const wantsRek = /\b(rek|rekening|no\s*rek|norek|transfer(?:\s+bank)?|tf|via\s*bank|pake\s*rek|pakai\s*rek|bayar\s*rek|minta\s*rek|kirim\s*rek)\b/i.test(lower) || mentionsBankName;
  if (isGeneralInquiry && wantsQris && wantsRek) {
    return null;
  }
  if (wantsQris && wantsRek) {
    return null;
  }
  if (wantsQris && catalog.qrisImageUrl) {
    return "qris";
  }
  if (wantsRek && (catalog.bankAccounts.length > 0 || catalog.paymentNotes)) {
    return "rekening";
  }
  return null;
}
function isPaymentProofOrConfirmationIntent(messageText, hasMediaAttachment = false) {
  const lower = String(messageText || "").trim().toLowerCase();
  if (hasMediaAttachment && (!lower || /\b(bukti|struk|tf|transfer|bayar|qris|lunas|transaksi|berhasil|sukses|resi|mutasi|ss)\b/i.test(lower))) {
    return true;
  }
  return /\b(sudah|udah|udh|telah|selesai|baru\s*saja|brsn)\s*(bayar|transfer|tf|kirim(?:\s+uang|\s+dana)?|scan|qris|lunas|checkout\s*bayar)\b/i.test(lower) || /\b(ini\s*bukti(?:nya)?|bukti\s*(?:bayar|transfer|tf|pembayaran|qris)|pembayaran\s*(?:berhasil|sukses|selesai|lunas)|sudah\s*lunas|done\s*(?:bayar|transfer|tf)|terima\s*kasih\s*sudah\s*tf)\b/i.test(lower);
}
function prepareOrderFlowForIncomingMessage(params) {
  const { scopeId, senderPhone, messageText, catalog, hasMediaAttachment = false } = params;
  const ctx = getOrCreateCustomerContext(scopeId, senderPhone);
  const cleanMsg = String(messageText || "").trim();
  const lower = cleanMsg.toLowerCase();
  if (isCancelOrderIntent(lower)) {
    ctx.cart = [];
    ctx.stage = "browsing";
    ctx.selectedPaymentMethod = void 0;
    ctx.invoiceNumber = generateInvoiceNumber(ctx.customerCode);
    ctx.updatedAt = Date.now();
  }
  const isPaymentSubmission = ctx.cart.length > 0 && isPaymentProofOrConfirmationIntent(cleanMsg, hasMediaAttachment);
  const paymentChoice = isPaymentSubmission ? null : detectPaymentSelection(lower, ctx.stage, catalog);
  if (paymentChoice === "qris" && catalog.qrisImageUrl) {
    const invoiceBlock = ctx.cart.length > 0 ? `${formatInvoiceText(ctx.cart, ctx.invoiceNumber, catalog.shopName)}

` : "";
    const caption = `${invoiceBlock}\u{1F4F1} *Pembayaran via QRIS*
Silakan scan kode QRIS di atas untuk menyelesaikan pembayaran.${ctx.cart.length > 0 ? `

Jika sudah melakukan pembayaran, mohon kirimkan bukti transfer / konfirmasi bayar beserta nomor invoice \`${ctx.invoiceNumber}\` ya kak.` : ""}`;
    ctx.stage = ctx.cart.length > 0 ? "awaiting_payment_proof" : "browsing";
    if (ctx.cart.length > 0) ctx.selectedPaymentMethod = "qris";
    ctx.updatedAt = Date.now();
    return {
      context: ctx,
      directReply: {
        text: caption,
        sendQrisImage: true,
        qrisImageUrl: catalog.qrisImageUrl,
        qrisPublicUrl: catalog.qrisPublicUrl,
        sendRekeningText: false,
        reason: "direct_qris_dispatch"
      },
      orderSummaryForPrompt: "",
      paymentSummaryForPrompt: "",
      isPaymentSubmission: false
    };
  }
  if (paymentChoice === "rekening" && (catalog.bankAccounts.length > 0 || catalog.paymentNotes)) {
    const invoiceBlock = ctx.cart.length > 0 ? `${formatInvoiceText(ctx.cart, ctx.invoiceNumber, catalog.shopName)}

` : "";
    const rekText = formatRekeningDetailsText(catalog);
    const fullText = `${invoiceBlock}${rekText}` + (ctx.cart.length > 0 ? `

Jika sudah melakukan transfer, silakan kirim bukti pembayaran / konfirmasi bayar beserta nomor invoice \`${ctx.invoiceNumber}\` ya kak. Terima kasih!` : "");
    ctx.stage = ctx.cart.length > 0 ? "awaiting_payment_proof" : "browsing";
    if (ctx.cart.length > 0) ctx.selectedPaymentMethod = "rekening";
    ctx.updatedAt = Date.now();
    return {
      context: ctx,
      directReply: {
        text: fullText,
        sendQrisImage: false,
        sendRekeningText: true,
        reason: "direct_rekening_dispatch"
      },
      orderSummaryForPrompt: "",
      paymentSummaryForPrompt: "",
      isPaymentSubmission: false
    };
  }
  if (catalog.enabled && catalog.products.length > 0) {
    const ordered = isPaymentSubmission ? [] : detectOrderedProducts(cleanMsg, catalog.products);
    if (ordered.length > 0) {
      if (ctx.cart.length === 0) {
        ctx.invoiceNumber = generateInvoiceNumber(ctx.customerCode);
        ctx.selectedPaymentMethod = void 0;
      }
      for (const item of ordered) {
        const existing = ctx.cart.find((c) => c.title.toLowerCase() === item.title.toLowerCase());
        if (existing) {
          existing.qty += item.qty;
          existing.unitPrice = item.unitPrice;
        } else {
          ctx.cart.push(item);
        }
      }
      ctx.stage = "confirming_items";
      ctx.updatedAt = Date.now();
    } else if (ctx.cart.length > 0 && ctx.stage === "confirming_items" && isConfirmNoMoreItemsIntent(lower)) {
      ctx.stage = "awaiting_payment";
      ctx.updatedAt = Date.now();
    }
  }
  let orderSummaryForPrompt = "";
  if (ctx.cart.length > 0) {
    const itemsDesc = ctx.cart.map((i) => `${i.title} x${i.qty} @ Rp${i.unitPrice.toLocaleString("id-ID")} = Rp${(i.unitPrice * i.qty).toLocaleString("id-ID")}`).join("; ");
    const total = calculateCartTotal(ctx.cart);
    const methodInfo = ctx.selectedPaymentMethod ? `, metode_dipilih=${ctx.selectedPaymentMethod.toUpperCase()}` : "";
    const paymentVerifyHint = isPaymentSubmission ? ` PENTING VERIFIKASI PEMBAYARAN: Pembeli mengirim konfirmasi/bukti pembayaran (${hasMediaAttachment ? "dengan lampiran foto/dokumen" : "konfirmasi teks"}). Evaluasi apakah orderan sudah lengkap & pembayaran oke/valid; jika sudah oke dan terverifikasi dibayar, balas ramah bahwa pembayaran diterima & pesanan diteruskan ke admin/owner serta WAJIB akhiri balasanmu dengan tag [[ORDER_PAID]].` : "";
    orderSummaryForPrompt = `Status keranjang ${ctx.customerCode} (Invoice ${ctx.invoiceNumber}, tahap=${ctx.stage}${methodInfo}): ${itemsDesc}. Total tagihan = Rp${total.toLocaleString("id-ID")}.${paymentVerifyHint}`;
  }
  const paymentParts = [];
  if (catalog.bankAccounts.length > 0 || catalog.paymentNotes) {
    const banks = catalog.bankAccounts.map((b) => `${b.bank_name} ${b.account_number}${b.account_holder ? ` a.n ${b.account_holder}` : ""}`).join(" | ");
    paymentParts.push(banks ? `Transfer Rekening (${banks})` : "Transfer Rekening");
  }
  if (catalog.qrisImageUrl) {
    paymentParts.push("QRIS (gambar QR akan dikirim otomatis oleh sistem jika balasanku menyertakan [[SEND_QRIS]])");
  }
  const paymentSummaryForPrompt = paymentParts.length > 0 ? paymentParts.join(" dan ") : "";
  return {
    context: ctx,
    directReply: null,
    orderSummaryForPrompt,
    paymentSummaryForPrompt,
    isPaymentSubmission
  };
}
function buildDeterministicOrderFallbackReply(params) {
  const { context, catalog, isPaymentSubmission } = params;
  if (!context.cart || context.cart.length === 0) return null;
  const invoiceText = formatInvoiceText(context.cart, context.invoiceNumber, catalog.shopName);
  const paymentMethodsList = formatAvailablePaymentMethodsList(catalog);
  if (isPaymentSubmission) {
    return `${invoiceText}

\u23F3 Terima kasih! Konfirmasi pembayaran untuk invoice \`${context.invoiceNumber}\` sudah diterima dan sedang menunggu verifikasi AI/Admin.`;
  }
  if (context.stage === "awaiting_payment" || context.stage === "awaiting_payment_proof") {
    if (context.stage === "awaiting_payment_proof") {
      return `${invoiceText}

Silakan kirimkan bukti transfer / konfirmasi pembayaran untuk invoice \`${context.invoiceNumber}\` ya kak agar bisa segera diverifikasi dan diproses.`;
    }
    if (paymentMethodsList) {
      return `${invoiceText}

\u2705 Semua pesanan sudah ditotalkan ya kak.
Mau bayar pakai metode apa?

${paymentMethodsList}

Balas dengan pilihan metode bayarnya (misal ketik *Rekening* atau *QRIS*) ya kak.`;
    }
    return `${invoiceText}

\u2705 Pesanan sudah kami totalkan ya kak. Admin kami akan segera menginformasikan detail pembayarannya.`;
  }
  return `${invoiceText}

Apakah ada produk lain yang ingin ditambahkan lagi kak? Jika sudah cukup dan tidak ada tambahan, balas *cukup* / *checkout* untuk melanjutkan ke pemilihan metode pembayaran.`;
}
function isPositiveAiPaymentVerificationReply(cleanReply) {
  const lower = cleanReply.toLowerCase();
  const hasNegative = /\b(belum|tidak|gagal|kurang|salah|mohon\s+kirim(?:kan)?\s+ulang|kirim\s+bukti|belum\s+kami\s+terima|harap\s+transfer|silakan\s+transfer|pilih\s+metode)\b/i.test(
    lower
  );
  if (hasNegative) return false;
  return /\b(terverifikasi|verifikasi\s*(?:berhasil|selesai|ok|oke)|pembayaran(?:nya)?\s*(?:sudah\s*)?(?:kami\s*)?(?:terima|diterima|masuk|berhasil|sukses|valid|lunas|oke|ok)|pesanan(?:nya)?\s*(?:segera\s*)?(?:kami\s*)?(?:proses|diproses|diteruskan|disiapkan)|terima\s*kasih\s*(?:atas\s*)?pembayaran(?:nya)?)\b/i.test(
    lower
  );
}
function parseAndHandleAiPaymentDirectives(aiReplyText, catalog, options) {
  let cleanText = String(aiReplyText || "").trim();
  const hasQrisDirective = /\[\[\s*SEND_QRIS\s*\]\]|\[SEND_QRIS\]/i.test(cleanText);
  const hasRekDirective = /\[\[\s*SEND_REK\s*\]\]|\[SEND_REK\]/i.test(cleanText);
  const hasPaidDirective = /\[\[\s*ORDER_PAID\s*\]\]|\[ORDER_PAID\]/i.test(cleanText);
  cleanText = cleanText.replace(/\[\[?\s*SEND_QRIS\s*\]?\]/gi, "").replace(/\[\[?\s*SEND_REK\s*\]?\]/gi, "").replace(/\[\[?\s*ORDER_PAID\s*\]?\]/gi, "").replace(/\n{3,}/g, "\n\n").trim();
  let appendedRekening = false;
  if (hasRekDirective && (catalog.bankAccounts.length > 0 || catalog.paymentNotes)) {
    const firstAcc = catalog.bankAccounts[0]?.account_number || "";
    if (!firstAcc || !cleanText.includes(firstAcc)) {
      const rekBlock = formatRekeningDetailsText(catalog);
      cleanText = cleanText ? `${cleanText}

${rekBlock}` : rekBlock;
      appendedRekening = true;
    }
  }
  const sendQrisImage = Boolean(hasQrisDirective && catalog.qrisImageUrl);
  if (sendQrisImage && !cleanText) {
    cleanText = "\u{1F4F1} Berikut kode QRIS untuk pembayaran pesanan Anda. Silakan scan dan kirimkan bukti pembayaran jika sudah selesai ya kak.";
  }
  const ctx = options?.customerContext;
  const hasActiveOrder = Boolean(ctx && ctx.cart.length > 0);
  const alreadyNotified = Boolean(
    ctx && ctx.notifiedPaidInvoices && ctx.notifiedPaidInvoices.includes(ctx.invoiceNumber)
  );
  const semanticPaidConfirmed = Boolean(
    hasActiveOrder && options?.isPaymentSubmission && (ctx?.stage === "awaiting_payment" || ctx?.stage === "awaiting_payment_proof" || ctx?.stage === "confirming_items") && isPositiveAiPaymentVerificationReply(cleanText)
  );
  const orderPaidVerified = Boolean(
    hasActiveOrder && !alreadyNotified && (hasPaidDirective || semanticPaidConfirmed)
  );
  if (orderPaidVerified && !cleanText) {
    cleanText = "\u2705 Terima kasih! Pembayaran Anda telah diverifikasi dan pesanan Anda langsung kami teruskan ke pemilik toko untuk segera diproses.";
  }
  return {
    cleanText,
    sendQrisImage,
    qrisImageUrl: sendQrisImage ? catalog.qrisImageUrl : void 0,
    qrisPublicUrl: sendQrisImage ? catalog.qrisPublicUrl : void 0,
    appendedRekening,
    orderPaidVerified
  };
}
function completeAndConsumeVerifiedPaidOrder(scopeId, senderPhone) {
  const ctx = getOrCreateCustomerContext(scopeId, senderPhone);
  if (!ctx.cart || ctx.cart.length === 0) return null;
  if (!Array.isArray(ctx.notifiedPaidInvoices)) ctx.notifiedPaidInvoices = [];
  if (ctx.notifiedPaidInvoices.includes(ctx.invoiceNumber)) {
    return null;
  }
  const snapshot = {
    customerCode: ctx.customerCode,
    invoiceNumber: ctx.invoiceNumber,
    cart: ctx.cart.map((i) => ({ ...i })),
    totalAmount: calculateCartTotal(ctx.cart),
    selectedPaymentMethod: ctx.selectedPaymentMethod
  };
  ctx.notifiedPaidInvoices.push(ctx.invoiceNumber);
  if (ctx.notifiedPaidInvoices.length > 30) {
    ctx.notifiedPaidInvoices = ctx.notifiedPaidInvoices.slice(-30);
  }
  ctx.cart = [];
  ctx.stage = "browsing";
  ctx.selectedPaymentMethod = void 0;
  ctx.invoiceNumber = generateInvoiceNumber(ctx.customerCode);
  ctx.updatedAt = Date.now();
  return snapshot;
}
function formatOwnerOrderNotificationMessage(params) {
  const { snapshot, shopName, customerPhone, customerName, customerNote, hasMediaAttachment } = params;
  const cleanCustDigits = String(customerPhone || "").replace(/\D/g, "");
  const waLink = cleanCustDigits.length >= 8 ? `https://wa.me/${cleanCustDigits}` : "-";
  const methodLabel = snapshot.selectedPaymentMethod === "qris" ? "QRIS" : snapshot.selectedPaymentMethod === "rekening" ? "Transfer Rekening" : "Terverifikasi AI";
  const itemLines = snapshot.cart.map((item, idx) => {
    const subtotal = item.unitPrice * item.qty;
    const priceText = item.unitPrice > 0 ? `${item.qty} x ${formatRupiahId(item.unitPrice)} = *${formatRupiahId(subtotal)}*` : `${item.qty} pcs`;
    return `${idx + 1}. *${item.title}*
   ${priceText}`;
  });
  const cleanNote = String(customerNote || "").trim().slice(0, 220);
  const proofNote = hasMediaAttachment ? `${cleanNote ? `${cleanNote} ` : ""}(+ lampiran bukti transfer/foto)` : cleanNote || "Konfirmasi pembayaran via chat";
  const titleLine = shopName ? `\u{1F6D2} *ORDERAN BARU TERVERIFIKASI \u2014 ${shopName.toUpperCase()}*` : `\u{1F6D2} *ORDERAN BARU TERVERIFIKASI LUNAS*`;
  return [
    titleLine,
    "",
    `\u{1F9FE} *No. Invoice:* \`${snapshot.invoiceNumber}\``,
    `\u{1F194} *ID Chat:* \`${snapshot.customerCode}\``,
    `\u{1F464} *Pelanggan:* ${customerName || "Pelanggan"} (+${cleanCustDigits || customerPhone})`,
    `\u{1F4AC} *Chat Customer:* ${waLink}`,
    "",
    `\u{1F4E6} *Daftar Pesanan:*`,
    ...itemLines,
    "",
    `\u{1F4B0} *Total Tagihan:* *${snapshot.totalAmount > 0 ? formatRupiahId(snapshot.totalAmount) : "Sesuai kesepakatan"}*`,
    `\u{1F4B3} *Metode Pembayaran:* ${methodLabel} \u2705 _(Terverifikasi AI)_`,
    `\u{1F4DD} *Catatan Pembayaran:* ${proofNote}`,
    `\u{1F552} *Waktu Verifikasi:* ${(/* @__PURE__ */ new Date()).toLocaleString("id-ID", { timeZone: "Asia/Jakarta" })} WIB`
  ].join("\n");
}

// src/lib/baileysManager.ts
var BAILEYS_BROWSER = ["Ubuntu", "Chrome", "22.04.4"];
var DEFAULT_BAILEYS_VERSION = [2, 3e3, 1043857760];
var BAILEYS_SILENT_LOGGER = pino({ level: "silent" });
var cachedBaileysVersion = null;
var versionFetchPromise = null;
async function resolveBaileysVersion() {
  if (cachedBaileysVersion) return cachedBaileysVersion;
  if (versionFetchPromise) return versionFetchPromise;
  versionFetchPromise = Promise.race([
    fetchLatestBaileysVersion().then((res) => res.version),
    new Promise(
      (resolve) => setTimeout(() => resolve(DEFAULT_BAILEYS_VERSION), 3500)
    )
  ]).catch(() => DEFAULT_BAILEYS_VERSION).then((ver) => {
    cachedBaileysVersion = ver || DEFAULT_BAILEYS_VERSION;
    versionFetchPromise = null;
    return cachedBaileysVersion;
  });
  return versionFetchPromise;
}
function isSocketTrulyOpen(sock) {
  if (!sock) return false;
  if (sock.ws) {
    if (sock.ws.isClosed === true) return false;
    if (typeof sock.ws.isOpen === "boolean") return sock.ws.isOpen;
    if (typeof sock.ws.readyState === "number") return sock.ws.readyState === 1;
    if (typeof sock.ws.socket?.readyState === "number") return sock.ws.socket.readyState === 1;
  }
  return true;
}
function isSocketConnecting(sock) {
  if (!sock?.ws) return false;
  if (typeof sock.ws.isConnecting === "boolean") return sock.ws.isConnecting;
  if (typeof sock.ws.readyState === "number") return sock.ws.readyState === 0;
  if (typeof sock.ws.socket?.readyState === "number") return sock.ws.socket.readyState === 0;
  return false;
}
function normalizePhoneNumber(phone) {
  if (!phone) return "";
  let clean = phone.replace(/\D/g, "");
  if (clean.startsWith("00")) {
    clean = clean.slice(2);
  }
  if (clean.startsWith("620")) {
    clean = "62" + clean.slice(3);
  } else if (clean.startsWith("0")) {
    clean = "62" + clean.slice(1);
  } else if (clean.startsWith("8")) {
    clean = "62" + clean;
  }
  return clean;
}
var makeWASocket = makeWASocketImport.default || makeWASocketImport;
var activeSessions = /* @__PURE__ */ new Map();
var sessionStartLocks = /* @__PURE__ */ new Map();
var authBackupTimers = /* @__PURE__ */ new Map();
var lastAuthBackupAt = /* @__PURE__ */ new Map();
var lastAuthBackupHashes = /* @__PURE__ */ new Map();
var reconnectTimers = /* @__PURE__ */ new Map();
var sessionConflictStates = /* @__PURE__ */ new Map();
var inFlightExpiryAlerts = /* @__PURE__ */ new Set();
var recentMessageProtoCache = /* @__PURE__ */ new Map();
var sessionDisconnectDiagnostics = /* @__PURE__ */ new Map();
var sessionConflictDetails = /* @__PURE__ */ new Map();
var remoteSessionConflictCache = /* @__PURE__ */ new Map();
var sessionSendVerifiedAt = /* @__PURE__ */ new Map();
var lastLeaseRefreshAt = /* @__PURE__ */ new Map();
var remoteSessionLeaseCache = /* @__PURE__ */ new Map();
var REMOTE_LEASE_CACHE_TTL_MS = 15 * 1e3;
var REMOTE_LEASE_FRESH_MS = 90 * 1e3;
var RUNTIME_INSTANCE_ID = crypto5.randomBytes(6).toString("hex");
var RUNTIME_HOSTNAME = os.hostname();
var lastResolvedIdentity = null;
var resolvedDomainIpCache = null;
var AUTH_DIR = path4.resolve(process.cwd(), "baileys_auth_sessions");
var UNSCANNED_HANDSHAKE_TTL_MS = 3 * 60 * 1e3;
var AUTH_BACKUP_DEBOUNCE_MS = 4e3;
var AUTH_BACKUP_COOLDOWN_MS = 15e3;
var PRUNE_COOLDOWN_MS = 12e4;
var MYSQL_AUTH_PRUNE_INTERVAL_MS = 10 * 60 * 1e3;
var SESSION_EXPIRY_ALERT_GRACE_MS = 60 * 60 * 1e3;
var STABLE_OPEN_THRESHOLD_MS = 25 * 1e3;
var MAX_AUTO_CONFLICT_RETRIES = 0;
var CONFLICT_COOLDOWN_MS = 24 * 60 * 60 * 1e3;
var LOCAL_LEASE_FILENAME = ".runtime_lease.json";
var LOCAL_CLOSE_MARKER_FILENAME = ".last_close_at";
var LOCAL_LEASE_STALE_MS = 75 * 1e3;
var HANDOFF_CLOSE_GRACE_MS = 3200;
function recordSessionSendVerified(sessionId, phoneNumber, atMs = Date.now()) {
  if (sessionId) {
    sessionSendVerifiedAt.set(sessionId, atMs);
  }
  const cleanPhone = normalizePhoneNumber(phoneNumber || "");
  if (cleanPhone.length >= 8) {
    sessionSendVerifiedAt.set(`phone:${cleanPhone}`, atMs);
  }
}
function getLatestSessionSendVerifiedAt(sessionId, phoneNumber) {
  const bySid = sessionId ? sessionSendVerifiedAt.get(sessionId) || 0 : 0;
  const cleanPhone = normalizePhoneNumber(phoneNumber || "");
  const byPhone = cleanPhone.length >= 8 ? sessionSendVerifiedAt.get(`phone:${cleanPhone}`) || 0 : 0;
  return Math.max(bySid, byPhone);
}
var initialStartupPending = false;
var initialStartupPendingAt = 0;
function setBaileysStartupPending(pending) {
  initialStartupPending = pending;
  initialStartupPendingAt = pending ? Date.now() : 0;
}
function isBaileysStartupPending() {
  if (!initialStartupPending) return false;
  if (Date.now() - initialStartupPendingAt > 15e3) {
    initialStartupPending = false;
    return false;
  }
  return true;
}
function createTtlCacheStore(ttlMs, maxEntries = 1500) {
  const store = /* @__PURE__ */ new Map();
  const purgeIfNeeded = () => {
    if (store.size <= maxEntries) return;
    const now = Date.now();
    for (const [k, entry] of store.entries()) {
      if (entry.exp <= now) store.delete(k);
    }
    while (store.size > maxEntries) {
      const oldestKey = store.keys().next().value;
      if (!oldestKey) break;
      store.delete(oldestKey);
    }
  };
  return {
    get(key) {
      const entry = store.get(key);
      if (!entry) return void 0;
      if (entry.exp <= Date.now()) {
        store.delete(key);
        return void 0;
      }
      return entry.val;
    },
    set(key, value) {
      store.delete(key);
      store.set(key, { val: value, exp: Date.now() + ttlMs });
      purgeIfNeeded();
      return true;
    },
    del(key) {
      return store.delete(key) ? 1 : 0;
    },
    flushAll() {
      store.clear();
    },
    mget(keys) {
      const out = {};
      const now = Date.now();
      for (const key of keys) {
        const entry = store.get(key);
        if (entry && entry.exp > now) {
          out[key] = entry.val;
        } else if (entry) {
          store.delete(key);
        }
      }
      return Promise.resolve(out);
    },
    mset(entries) {
      const exp = Date.now() + ttlMs;
      for (const { key, value } of entries) {
        store.delete(key);
        store.set(key, { val: value, exp });
      }
      purgeIfNeeded();
      return true;
    },
    close() {
    }
  };
}
var sessionUserDevicesCaches = /* @__PURE__ */ new Map();
var sessionMsgRetryCaches = /* @__PURE__ */ new Map();
var sessionSignalKeyStores = /* @__PURE__ */ new Map();
function getSessionCacheStores(sessionId) {
  let userDevicesCache = sessionUserDevicesCaches.get(sessionId);
  if (!userDevicesCache) {
    userDevicesCache = createTtlCacheStore(5 * 60 * 1e3, 1500);
    sessionUserDevicesCaches.set(sessionId, userDevicesCache);
  }
  let msgRetryCounterCache = sessionMsgRetryCaches.get(sessionId);
  if (!msgRetryCounterCache) {
    msgRetryCounterCache = createTtlCacheStore(10 * 60 * 1e3, 800);
    sessionMsgRetryCaches.set(sessionId, msgRetryCounterCache);
  }
  return { userDevicesCache, msgRetryCounterCache };
}
function clearSessionCacheStores(sessionId) {
  sessionUserDevicesCaches.get(sessionId)?.flushAll();
  sessionUserDevicesCaches.delete(sessionId);
  sessionMsgRetryCaches.get(sessionId)?.flushAll();
  sessionMsgRetryCaches.delete(sessionId);
  sessionSignalKeyStores.delete(sessionId);
}
function persistCredsAtomicSync(sessionFolder, creds) {
  if (!sessionFolder || !creds) return;
  fs4.mkdirSync(sessionFolder, { recursive: true, mode: 448 });
  const target = path4.join(sessionFolder, "creds.json");
  const tmp = path4.join(sessionFolder, `.creds.${process.pid}.${Date.now()}.tmp`);
  const serialized = JSON.stringify(creds, (k, v) => {
    if (v instanceof Uint8Array || Buffer.isBuffer(v)) {
      return { type: "Buffer", data: Array.from(v) };
    }
    if (v && typeof v === "object" && v.type === "Buffer" && Array.isArray(v.data)) {
      return v;
    }
    return v;
  });
  fs4.writeFileSync(tmp, serialized, { encoding: "utf-8", mode: 384 });
  fs4.renameSync(tmp, target);
}
async function createResilientMultiFileAuthState(sessionId, sessionFolder) {
  fs4.mkdirSync(sessionFolder, { recursive: true, mode: 448 });
  const { state, saveCreds: rawSaveCreds } = await useMultiFileAuthState(sessionFolder);
  const ensureFolderAndHydrate = async () => {
    if (!fs4.existsSync(sessionFolder)) {
      fs4.mkdirSync(sessionFolder, { recursive: true, mode: 448 });
    }
    const credsPath = path4.join(sessionFolder, "creds.json");
    if (!fs4.existsSync(credsPath)) {
      await hydrateSessionAuthFolderFromMysql(sessionId).catch(() => false);
      if (!fs4.existsSync(credsPath) && state?.creds) {
        try {
          persistCredsAtomicSync(sessionFolder, state.creds);
        } catch {
          await rawSaveCreds();
        }
      }
    }
  };
  const resilientRawKeys = {
    async get(type, ids) {
      try {
        if (!fs4.existsSync(sessionFolder)) {
          await ensureFolderAndHydrate();
        }
        return await state.keys.get(type, ids);
      } catch (err) {
        if (err?.code === "ENOENT") {
          await ensureFolderAndHydrate();
          return await state.keys.get(type, ids);
        }
        throw err;
      }
    },
    async set(data) {
      try {
        if (!fs4.existsSync(sessionFolder)) {
          await ensureFolderAndHydrate();
        }
        await state.keys.set(data);
      } catch (err) {
        if (err?.code === "ENOENT") {
          await ensureFolderAndHydrate();
          await state.keys.set(data);
        } else {
          throw err;
        }
      }
    },
    async clear() {
      if (typeof state.keys.clear === "function") {
        await state.keys.clear();
      }
    }
  };
  const saveCreds = async () => {
    try {
      await ensureFolderAndHydrate();
      await rawSaveCreds();
    } catch (err) {
      if (err?.code === "ENOENT") {
        await ensureFolderAndHydrate();
        await rawSaveCreds();
      } else {
        throw err;
      }
    }
  };
  return {
    state: {
      creds: state.creds,
      keys: resilientRawKeys
    },
    saveCreds
  };
}
function buildCachedAuthState(sessionId, state) {
  const cachedKeys = makeCacheableSignalKeyStore(state.keys, BAILEYS_SILENT_LOGGER);
  sessionSignalKeyStores.set(sessionId, cachedKeys);
  return {
    creds: state.creds,
    keys: cachedKeys
  };
}
function rememberProtoMessage(key, message) {
  const id = key?.id ? String(key.id) : "";
  if (!id || !message) return;
  const cacheKey = `${key?.remoteJid || ""}:${id}`;
  if (recentMessageProtoCache.has(cacheKey)) {
    recentMessageProtoCache.delete(cacheKey);
  }
  recentMessageProtoCache.set(cacheKey, message);
  if (recentMessageProtoCache.size > 250) {
    const oldest = recentMessageProtoCache.keys().next().value;
    if (oldest) recentMessageProtoCache.delete(oldest);
  }
}
function getLocalNonInternalIpv4() {
  try {
    const ifaces = os.networkInterfaces();
    const privateIps = [];
    for (const entries of Object.values(ifaces)) {
      if (!entries) continue;
      for (const info of entries) {
        if (!info || info.internal || info.family !== "IPv4" || !info.address) continue;
        const addr = info.address;
        const isPrivate = addr.startsWith("10.") || addr.startsWith("192.168.") || addr.startsWith("169.254.") || /^172\.(1[6-9]|2\d|3[01])\./.test(addr);
        if (!isPrivate) return addr;
        privateIps.push(addr);
      }
    }
    return privateIps[0] || "";
  } catch {
    return "";
  }
}
function normalizeComparableDomain(raw) {
  const s = String(raw || "").trim().toLowerCase();
  if (!s) return "";
  try {
    const withProto = /^https?:\/\//i.test(s) ? s : `https://${s}`;
    const parsed = new URL(withProto);
    const host = parsed.hostname.toLowerCase();
    const port = parsed.port && parsed.port !== "80" && parsed.port !== "443" ? `:${parsed.port}` : "";
    return `${host}${port}`;
  } catch {
    return s.replace(/^https?:\/\//i, "").split("/")[0].replace(/:(80|443)$/, "").trim().toLowerCase();
  }
}
function extractPrimaryIp(raw) {
  const s = String(raw || "").trim();
  if (!s) return "";
  const beforeParen = s.split("(")[0].trim();
  return beforeParen.split(/\s+/)[0].trim().toLowerCase();
}
function isSameDomainAndIpIdentity(local, remote) {
  const localDom = normalizeComparableDomain(local.domain);
  const remoteDom = normalizeComparableDomain(remote.domain);
  if (!localDom || !remoteDom || localDom !== remoteDom) {
    return false;
  }
  const localIp = extractPrimaryIp(local.serverIp);
  const remoteIp = extractPrimaryIp(remote.server_ip);
  if (!localIp || !remoteIp) {
    return false;
  }
  return localIp === remoteIp;
}
function getCachedOrFallbackIdentity() {
  if (lastResolvedIdentity) return lastResolvedIdentity;
  const baseUrl = resolvePublicAppBaseUrl();
  const domain = normalizeComparableDomain(baseUrl) || RUNTIME_HOSTNAME;
  const serverIp = (process.env.SERVER_PUBLIC_IP || "").trim() || getLocalNonInternalIpv4() || "127.0.0.1";
  return { domain, serverIp, hostname: RUNTIME_HOSTNAME };
}
async function resolveCurrentServerIdentity() {
  const baseUrl = resolvePublicAppBaseUrl();
  let domain = "";
  let hostnameOnly = "";
  if (baseUrl) {
    try {
      const parsed = new URL(baseUrl);
      domain = parsed.host || parsed.hostname || "";
      hostnameOnly = parsed.hostname || "";
    } catch {
      domain = baseUrl.replace(/^https?:\/\//i, "").split("/")[0] || "";
      hostnameOnly = domain.split(":")[0] || "";
    }
  }
  if (!domain) {
    domain = RUNTIME_HOSTNAME;
  }
  const envPublicIp = (process.env.SERVER_PUBLIC_IP || "").trim();
  const localNicIp = getLocalNonInternalIpv4();
  let publicDnsIp = envPublicIp;
  const isPublicDomain = Boolean(hostnameOnly) && hostnameOnly !== "localhost" && hostnameOnly !== "127.0.0.1" && hostnameOnly !== "::1" && !/^\d{1,3}(\.\d{1,3}){3}$/.test(hostnameOnly);
  if (!publicDnsIp && isPublicDomain) {
    if (resolvedDomainIpCache && resolvedDomainIpCache.host === hostnameOnly && Date.now() - resolvedDomainIpCache.at < 10 * 60 * 1e3) {
      publicDnsIp = resolvedDomainIpCache.ip;
    } else {
      try {
        const res = await Promise.race([
          dns.lookup(hostnameOnly, { family: 4 }),
          new Promise((resolve) => setTimeout(() => resolve(null), 1200))
        ]);
        if (res && typeof res.address === "string" && res.address) {
          publicDnsIp = res.address;
          resolvedDomainIpCache = { host: hostnameOnly, ip: publicDnsIp, at: Date.now() };
        }
      } catch {
      }
    }
  } else if (!publicDnsIp && /^\d{1,3}(\.\d{1,3}){3}$/.test(hostnameOnly)) {
    publicDnsIp = hostnameOnly;
  }
  let serverIp = publicDnsIp || localNicIp || "127.0.0.1";
  if (publicDnsIp && localNicIp && publicDnsIp !== localNicIp) {
    serverIp = `${publicDnsIp} (NIC: ${localNicIp})`;
  }
  lastResolvedIdentity = { domain, serverIp, hostname: RUNTIME_HOSTNAME };
  return lastResolvedIdentity;
}
void resolveCurrentServerIdentity().catch(() => {
});
var SOCKET_STARTED_AT = (/* @__PURE__ */ new Date()).toISOString();
var IP_KILL_CHECK_INTERVAL_MS = 3 * 60 * 1e3;
var isSelfKilledByIpRule = false;
var selfKilledReason = "";
var selfKilledAt;
var lastSocketPublishAt = 0;
function collectAllLocalIpAddresses() {
  const ipSet = /* @__PURE__ */ new Set();
  const addIfValidIp = (candidate) => {
    const clean = normalizeServerIpValue(candidate);
    if (clean && net2.isIP(clean) !== 0) {
      ipSet.add(clean);
    }
  };
  const identity = getCachedOrFallbackIdentity();
  addIfValidIp(extractPrimaryIp(identity.serverIp));
  const nicMatch = identity.serverIp?.match(/NIC:\s*([^)]+)/i);
  if (nicMatch?.[1]) addIfValidIp(nicMatch[1]);
  addIfValidIp(process.env.SERVER_PUBLIC_IP);
  addIfValidIp(resolvedDomainIpCache?.ip);
  try {
    const ifaces = os.networkInterfaces();
    for (const entries of Object.values(ifaces)) {
      if (!entries) continue;
      for (const info of entries) {
        if (!info || info.internal || !info.address) continue;
        addIfValidIp(info.address);
      }
    }
  } catch {
  }
  return Array.from(ipSet);
}
function isTargetServerIpLocal(targetIp) {
  const cleanTarget = normalizeServerIpValue(extractPrimaryIp(targetIp));
  if (!cleanTarget) return false;
  const localIps = collectAllLocalIpAddresses();
  return localIps.includes(cleanTarget);
}
function buildCurrentSocketRecord(statusOverride) {
  const idNow = getCachedOrFallbackIdentity();
  const allIps = collectAllLocalIpAddresses();
  const primaryIp = normalizeServerIpValue(extractPrimaryIp(idNow.serverIp)) || allIps[0] || "127.0.0.1";
  const now = Date.now();
  const activeSessionIds = [];
  const activePhonesSet = /* @__PURE__ */ new Set();
  let connectingCount = 0;
  for (const [sid, mem] of activeSessions.entries()) {
    if (mem.superseded) continue;
    const isConnected = mem.status === "connected" && (!mem.socket || isSocketTrulyOpen(mem.socket));
    const isConnecting = mem.status === "connecting" && now - mem.lastUpdated < 12e4;
    if (isConnected) {
      activeSessionIds.push(sid);
      const p = normalizePhoneNumber(mem.phoneNumber || getSessionById(sid)?.phone_number || "");
      if (p.length >= 8) activePhonesSet.add(p);
    } else if (isConnecting) {
      connectingCount++;
      activeSessionIds.push(sid);
      const p = normalizePhoneNumber(mem.phoneNumber || getSessionById(sid)?.phone_number || "");
      if (p.length >= 8) activePhonesSet.add(p);
    }
  }
  const effectiveStatus = statusOverride || (isSelfKilledByIpRule ? "killed" : "active");
  return {
    instance_id: RUNTIME_INSTANCE_ID,
    app_id: getDisplayAppId(),
    // Eksplisit 'undefined' jika env APP_ID tidak disetel
    server_ip: idNow.serverIp,
    primary_ip: primaryIp,
    all_ips: allIps.length > 0 ? allIps : [primaryIp],
    domain: idNow.domain,
    hostname: idNow.hostname,
    pid: process.pid,
    status: effectiveStatus,
    active_connections: activeSessionIds.length,
    connecting_connections: connectingCount,
    active_session_ids: activeSessionIds,
    active_phones: Array.from(activePhonesSet),
    started_at: SOCKET_STARTED_AT,
    last_heartbeat_at: (/* @__PURE__ */ new Date()).toISOString(),
    kill_reason: isSelfKilledByIpRule ? selfKilledReason : void 0,
    killed_at: isSelfKilledByIpRule ? selfKilledAt : void 0,
    online: effectiveStatus === "active",
    is_self: true
  };
}
async function publishCurrentSocketRecord(options) {
  if (!lastResolvedIdentity) {
    await resolveCurrentServerIdentity().catch(() => {
    });
  }
  const now = Date.now();
  const record = buildCurrentSocketRecord(options?.statusOverride);
  if (!options?.force && now - lastSocketPublishAt < 25e3) {
    return record;
  }
  lastSocketPublishAt = now;
  if (isMysqlConfigured()) {
    await upsertActiveSocketToMysql(record).catch(() => {
    });
  }
  return record;
}
async function isIpCurrentlyActiveInCluster(targetIp) {
  const cleanIp = normalizeServerIpValue(extractPrimaryIp(targetIp));
  if (!cleanIp) return { active: false };
  if (!isSelfKilledByIpRule && isTargetServerIpLocal(cleanIp)) {
    return {
      active: true,
      appId: getDisplayAppId(),
      reason: `IP ${cleanIp} adalah host yang sedang AKTIF/ONLINE (APP_ID: ${getDisplayAppId()}) sehingga dilindungi dan tidak dapat di-kill.`
    };
  }
  if (isMysqlConfigured()) {
    const dbSockets = await fetchAllActiveSocketsFromMysql().catch(() => []);
    const now = Date.now();
    const activeMatch = dbSockets.find((s) => {
      if (!s || s.status !== "active") return false;
      const hbMs = s.last_heartbeat_at ? Date.parse(s.last_heartbeat_at) : 0;
      const isOnline = s.online || Boolean(hbMs && now - hbMs <= 12e4);
      if (!isOnline) return false;
      return normalizeServerIpValue(s.primary_ip) === cleanIp || normalizeServerIpValue(extractPrimaryIp(s.server_ip)) === cleanIp || Array.isArray(s.all_ips) && s.all_ips.some((x) => normalizeServerIpValue(x) === cleanIp);
    });
    if (activeMatch) {
      return {
        active: true,
        appId: activeMatch.app_id || "undefined",
        reason: `IP ${cleanIp} sedang AKTIF/ONLINE pada socket APP_ID "${activeMatch.app_id || "undefined"}" dan tidak boleh di-kill.`
      };
    }
  }
  return { active: false };
}
async function recoverFromIpKillSwitch(source = "unkill") {
  const wasKilled = isSelfKilledByIpRule;
  isSelfKilledByIpRule = false;
  selfKilledReason = "";
  selfKilledAt = void 0;
  startBaileysBackgroundLoops();
  await publishCurrentSocketRecord({ force: true, statusOverride: "active" }).catch(() => {
  });
  if (wasKilled) {
    console.log(`[Socket Unkill Recovery] IP host ini dipulihkan (${source}). Mengaktifkan kembali socket WhatsApp...`);
    void sendTelegramAlert({
      title: "Socket Server Dipulihkan (Unkill)",
      severity: "success",
      dedupKey: `unkill_recover_${RUNTIME_INSTANCE_ID}`,
      cooldownMs: 3e4,
      lines: [
        `\u2022 APP_ID: <code>${escapeTelegramHtml(getDisplayAppId())}</code>`,
        `\u2022 Host: <code>${escapeTelegramHtml(getCachedOrFallbackIdentity().domain || RUNTIME_HOSTNAME)}</code>`,
        `\u2022 IP: <code>${escapeTelegramHtml(extractPrimaryIp(getCachedOrFallbackIdentity().serverIp) || "-")}</code>`,
        `\u2022 Sumber: ${escapeTelegramHtml(source)}`,
        `Status socket kembali AKTIF dan sesi WhatsApp sedang dipulihkan.`
      ]
    }).catch(() => {
    });
  }
  void restoreSavedBaileysSessions().then(() => runAppNodeAssignmentTick("unkill_recovery")).catch(() => {
  });
}
async function unkillTargetIp(targetIp, requestedBy = "superadmin") {
  const cleanIp = normalizeServerIpValue(extractPrimaryIp(targetIp));
  if (!cleanIp || net2.isIP(cleanIp) === 0) {
    throw new Error("Alamat IP tidak valid.");
  }
  const currentList = getKillTargetIpsConfig();
  const nextList = normalizeKillTargetIps(currentList.filter((item) => item.ip !== cleanIp));
  updateSystemConfig({ kill_target_ips: nextList });
  const mysqlUpdatedRows = await unkillSocketsByIpInMysql(cleanIp).catch(() => 0);
  const localIps = collectAllLocalIpAddresses();
  const matchesLocal = localIps.includes(cleanIp);
  const stillMatchedByAnotherRule = nextList.some((r) => localIps.includes(r.ip));
  let recoveredLocally = false;
  if ((matchesLocal || isSelfKilledByIpRule) && !stillMatchedByAnotherRule && isSelfKilledByIpRule) {
    recoveredLocally = true;
    await recoverFromIpKillSwitch(`unkill_by_${requestedBy}`);
  } else {
    void sendTelegramAlert({
      title: "IP Berhasil Di-Unkill",
      severity: "info",
      dedupKey: `unkill_ip_${cleanIp}`,
      cooldownMs: 15e3,
      lines: [
        `\u2022 IP: <code>${escapeTelegramHtml(cleanIp)}</code>`,
        `\u2022 Oleh: ${escapeTelegramHtml(requestedBy)}`,
        `\u2022 Socket MySQL direset: ${mysqlUpdatedRows}`,
        `Server dengan IP tersebut kini diizinkan aktif kembali.`
      ]
    }).catch(() => {
    });
  }
  return {
    success: true,
    ip: cleanIp,
    recovered_locally: recoveredLocally,
    mysql_updated_rows: mysqlUpdatedRows,
    message: recoveredLocally ? `IP ${cleanIp} berhasil di-unkill dan socket server ini langsung diaktifkan kembali.` : `IP ${cleanIp} berhasil di-unkill dan aturan shutdown dicabut.`
  };
}
async function checkAndEnforceIpKillSwitch(source = "interval_3m") {
  try {
    if (!lastResolvedIdentity) {
      await resolveCurrentServerIdentity().catch(() => {
      });
    }
    if (isMysqlConfigured()) {
      const snap = await fetchLiveClusterSnapshotFromMysql().catch(() => null);
      if (snap) {
        applyLiveClusterSnapshotToDb(snap);
      }
    }
    const rules = getKillTargetIpsConfig();
    const localIps = collectAllLocalIpAddresses();
    const matched = rules.length > 0 ? rules.find((r) => localIps.includes(r.ip)) : void 0;
    if (!matched) {
      if (isSelfKilledByIpRule) {
        await recoverFromIpKillSwitch(`rule_removed_${source}`);
        return { killed: false, recovered: true };
      }
      return { killed: false };
    }
    if (!isSelfKilledByIpRule) {
      isSelfKilledByIpRule = true;
      selfKilledReason = matched.reason || `Dimatikan otomatis oleh daftar Kill IP Admin (${matched.ip})`;
      selfKilledAt = (/* @__PURE__ */ new Date()).toISOString();
      console.warn(
        `[Socket Kill-Switch] IP server (${matched.ip}) ditemukan di daftar target shutdown [${source}]. Mematikan seluruh socket WhatsApp lokal...`
      );
      if (isMysqlConfigured()) {
        await markActiveSocketKilledInMysql(RUNTIME_INSTANCE_ID, selfKilledReason).catch(() => {
        });
      }
      await publishCurrentSocketRecord({ force: true, statusOverride: "killed" }).catch(() => {
      });
      await shutdownBaileysManager({ selfKilled: true, reason: selfKilledReason }).catch(() => {
      });
      void sendTelegramAlert({
        title: "Socket Server Dimatikan (Kill-Switch IP)",
        severity: "warn",
        dedupKey: `self_kill_${RUNTIME_INSTANCE_ID}`,
        cooldownMs: 6e4,
        lines: [
          `\u2022 APP_ID: <code>${escapeTelegramHtml(getDisplayAppId())}</code>`,
          `\u2022 IP Cocok: <code>${escapeTelegramHtml(matched.ip)}</code>`,
          `\u2022 Alasan: ${escapeTelegramHtml(selfKilledReason)}`,
          `\u2022 Sumber: ${escapeTelegramHtml(source)}`
        ]
      }).catch(() => {
      });
    } else {
      await publishCurrentSocketRecord({ force: true, statusOverride: "killed" }).catch(() => {
      });
    }
    return { killed: true, matchedIp: matched.ip, reason: selfKilledReason };
  } catch {
    return { killed: isSelfKilledByIpRule };
  }
}
var ipKillCheckTimer = setInterval(() => {
  checkAndEnforceIpKillSwitch("interval_3m").catch(() => {
  });
}, IP_KILL_CHECK_INTERVAL_MS);
ipKillCheckTimer.unref?.();
setTimeout(() => {
  publishCurrentSocketRecord({ force: true }).catch(() => {
  });
}, 2500).unref?.();
function isPidAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return err?.code === "EPERM";
  }
}
function writeLocalRuntimeLease(sessionId, params) {
  const folder = safeSessionFolderPath(sessionId);
  if (!folder) return;
  try {
    if (!fs4.existsSync(folder)) {
      fs4.mkdirSync(folder, { recursive: true, mode: 448 });
    }
    const now = Date.now();
    const idNow = getCachedOrFallbackIdentity();
    const payload = {
      instance_id: RUNTIME_INSTANCE_ID,
      pid: process.pid,
      hostname: RUNTIME_HOSTNAME,
      domain: idNow.domain,
      server_ip: idNow.serverIp,
      session_id: sessionId,
      user_id: params.userId,
      phone_number: params.phoneNumber ? normalizePhoneNumber(params.phoneNumber) : void 0,
      status: params.status,
      started_at: params.startedAt || now,
      heartbeat_at: now
    };
    const target = path4.join(folder, LOCAL_LEASE_FILENAME);
    const tmp = path4.join(folder, `.runtime_lease.${process.pid}.${now}.tmp`);
    fs4.writeFileSync(tmp, JSON.stringify(payload), { encoding: "utf-8", mode: 384 });
    fs4.renameSync(tmp, target);
  } catch {
  }
}
function readLocalRuntimeLease(sessionId) {
  const folder = safeSessionFolderPath(sessionId);
  if (!folder) return null;
  try {
    const target = path4.join(folder, LOCAL_LEASE_FILENAME);
    if (!fs4.existsSync(target)) return null;
    const parsed = JSON.parse(fs4.readFileSync(target, "utf-8"));
    if (!parsed || typeof parsed.pid !== "number" || !parsed.instance_id) return null;
    return parsed;
  } catch {
    return null;
  }
}
function removeLocalRuntimeLease(sessionId, expectedInstanceId) {
  const folder = safeSessionFolderPath(sessionId);
  if (!folder) return;
  try {
    const target = path4.join(folder, LOCAL_LEASE_FILENAME);
    if (!fs4.existsSync(target)) return;
    if (expectedInstanceId) {
      const existing = readLocalRuntimeLease(sessionId);
      if (existing && existing.instance_id !== expectedInstanceId && existing.pid !== process.pid && isPidAlive(existing.pid)) {
        return;
      }
    }
    fs4.rmSync(target, { force: true });
  } catch {
  }
}
function recordLastCloseTimestamp(sessionId, closedAt = Date.now()) {
  const folder = safeSessionFolderPath(sessionId);
  if (!folder || !fs4.existsSync(folder)) return;
  try {
    const target = path4.join(folder, LOCAL_CLOSE_MARKER_FILENAME);
    const tmp = path4.join(folder, `.last_close.${process.pid}.${closedAt}.tmp`);
    fs4.writeFileSync(
      tmp,
      JSON.stringify({
        closed_at: closedAt,
        instance_id: RUNTIME_INSTANCE_ID,
        pid: process.pid
      }),
      { encoding: "utf-8", mode: 384 }
    );
    fs4.renameSync(tmp, target);
  } catch {
  }
}
function readLastCloseTimestamp(sessionId) {
  const folder = safeSessionFolderPath(sessionId);
  if (!folder) return 0;
  try {
    const target = path4.join(folder, LOCAL_CLOSE_MARKER_FILENAME);
    if (!fs4.existsSync(target)) return 0;
    const parsed = JSON.parse(fs4.readFileSync(target, "utf-8"));
    const ts = Number(parsed?.closed_at || 0);
    return Number.isFinite(ts) && ts > 0 ? ts : 0;
  } catch {
    return 0;
  }
}
async function waitForHandoffCloseGraceIfNeeded(sessionId, graceMs = HANDOFF_CLOSE_GRACE_MS) {
  const now = Date.now();
  const lastCloseAt = readLastCloseTimestamp(sessionId);
  const prevDiskLease = readLocalRuntimeLease(sessionId);
  let recentDeadCloseAt = lastCloseAt;
  if (prevDiskLease && prevDiskLease.hostname === RUNTIME_HOSTNAME && prevDiskLease.pid !== process.pid && !isPidAlive(prevDiskLease.pid)) {
    const leaseActivityAt = Number(prevDiskLease.heartbeat_at || prevDiskLease.started_at || 0);
    if (leaseActivityAt > recentDeadCloseAt) {
      recentDeadCloseAt = leaseActivityAt;
    }
    removeLocalRuntimeLease(sessionId);
  }
  if (!recentDeadCloseAt) return 0;
  const elapsed = now - recentDeadCloseAt;
  if (elapsed >= 0 && elapsed < graceMs) {
    const waitTime = Math.min(graceMs, graceMs - elapsed);
    await delay(waitTime);
    return waitTime;
  }
  return 0;
}
function findLiveLocalSiblingLease(params) {
  const now = Date.now();
  const cleanPhone = normalizePhoneNumber(params.cleanPhone || "");
  const localIdentity = getCachedOrFallbackIdentity();
  const isFreshLiveSibling = (lease) => {
    if (!lease) return false;
    if (lease.instance_id === RUNTIME_INSTANCE_ID) return false;
    if (lease.hostname === RUNTIME_HOSTNAME && lease.pid === process.pid) return false;
    if (now - (Number(lease.heartbeat_at) || 0) > LOCAL_LEASE_STALE_MS) return false;
    if (lease.hostname === RUNTIME_HOSTNAME) {
      if (!isPidAlive(lease.pid)) return false;
    } else if (lease.domain || lease.server_ip) {
      if (!isSameDomainAndIpIdentity(localIdentity, lease)) return false;
    } else {
      return false;
    }
    if (params.userId && lease.user_id && lease.user_id !== params.userId) return false;
    return true;
  };
  if (params.sessionId) {
    const direct = readLocalRuntimeLease(params.sessionId);
    if (isFreshLiveSibling(direct)) return direct;
  }
  if (cleanPhone.length >= 8 && fs4.existsSync(AUTH_DIR)) {
    try {
      for (const folder of fs4.readdirSync(AUTH_DIR)) {
        const lease = readLocalRuntimeLease(folder);
        if (!isFreshLiveSibling(lease)) continue;
        const leasePhone = normalizePhoneNumber(lease.phone_number || getCredsPhoneOnDisk(folder) || "");
        if (leasePhone === cleanPhone) {
          return lease;
        }
      }
    } catch {
    }
  }
  return null;
}
function isAuthorizedClusterLease(lease, assignedAppId) {
  const leaseAppId = normalizeAppId(lease.app_id);
  if (!leaseAppId || leaseAppId === "default") return false;
  const currentAppId = getCurrentAppId();
  if (leaseAppId === currentAppId) return false;
  const normalizedAssigned = normalizeAppId(assignedAppId);
  if (normalizedAssigned) {
    return leaseAppId === normalizedAssigned;
  }
  const configuredNodes = getAppNodesConfig();
  return configuredNodes.some((n) => n.app_id === leaseAppId && n.is_active !== false);
}
function classifyLeaseObject(lease, params) {
  if (!lease || !lease.instance_id || lease.instance_id === RUNTIME_INSTANCE_ID) {
    return { status: "none" };
  }
  const now = Date.now();
  if (now - (Number(lease.heartbeat_at) || 0) > REMOTE_LEASE_FRESH_MS) {
    return { status: "none" };
  }
  if (params.userId && lease.user_id && lease.user_id !== params.userId) {
    return { status: "none" };
  }
  if (isAuthorizedClusterLease(lease, params.assignedAppId)) {
    return { status: "remote_cluster_node", lease };
  }
  if (isSameDomainAndIpIdentity(params.identity, lease)) {
    return { status: "same_domain_ip", lease };
  }
  return { status: "different_ip", lease };
}
function getCachedRemoteLeaseClassification(params) {
  const now = Date.now();
  const identity = getCachedOrFallbackIdentity();
  const keys = [
    params.sessionId ? `sid:${params.sessionId}` : "",
    params.cleanPhone && params.cleanPhone.length >= 8 ? `phone:${params.cleanPhone}` : ""
  ].filter(Boolean);
  for (const k of keys) {
    const cached = remoteSessionLeaseCache.get(k);
    if (!cached || now - cached.fetchedAt > REMOTE_LEASE_CACHE_TTL_MS * 2) continue;
    const res = classifyLeaseObject(cached.lease, {
      userId: params.userId,
      assignedAppId: params.assignedAppId,
      identity
    });
    if (res.status !== "none") return res;
  }
  return { status: "none" };
}
async function evaluateRemoteLeaseForSession(params) {
  const identity = await resolveCurrentServerIdentity();
  const cleanPhone = normalizePhoneNumber(params.cleanPhone || "");
  const resolvedAssignedAppId = params.assignedAppId || (params.sessionId ? getSessionById(params.sessionId)?.assigned_app_id : void 0);
  const cacheKeys = [
    params.sessionId ? `sid:${params.sessionId}` : "",
    cleanPhone.length >= 8 ? `phone:${cleanPhone}` : ""
  ].filter(Boolean);
  const now = Date.now();
  if (!params.forceRefresh && cacheKeys.length > 0) {
    for (const k of cacheKeys) {
      const cached = remoteSessionLeaseCache.get(k);
      if (cached && now - cached.fetchedAt <= REMOTE_LEASE_CACHE_TTL_MS) {
        const res = classifyLeaseObject(cached.lease, {
          userId: params.userId,
          assignedAppId: resolvedAssignedAppId,
          identity
        });
        if (res.status !== "none" || !cached.lease) {
          return { ...res, identity };
        }
      }
    }
  }
  if (!isMysqlConfigured() || !params.sessionId && cleanPhone.length < 8) {
    return { status: "none", identity };
  }
  try {
    const lease = await Promise.race([
      loadWaSessionLeaseFromMysql({
        sessionId: params.sessionId,
        phoneNumber: cleanPhone || void 0
      }),
      new Promise((resolve) => setTimeout(() => resolve(null), 1200))
    ]);
    const fetchedAt = Date.now();
    for (const k of cacheKeys) {
      remoteSessionLeaseCache.set(k, { lease, fetchedAt });
    }
    const res = classifyLeaseObject(lease, {
      userId: params.userId,
      assignedAppId: resolvedAssignedAppId,
      identity
    });
    return { ...res, identity };
  } catch {
    return { status: "none", identity };
  }
}
async function refreshRemoteSessionLeasesIfNeeded(sessions) {
  if (!isMysqlConfigured() || !Array.isArray(sessions) || sessions.length === 0) return;
  const now = Date.now();
  const staleSessions = sessions.filter((s) => {
    if (!s?.id) return false;
    const mem = activeSessions.get(s.id);
    if (mem && !mem.superseded && mem.status === "connected" && isSocketTrulyOpen(mem.socket)) {
      return false;
    }
    const cached = remoteSessionLeaseCache.get(`sid:${s.id}`);
    return !cached || now - cached.fetchedAt > REMOTE_LEASE_CACHE_TTL_MS;
  });
  if (staleSessions.length === 0) return;
  await Promise.allSettled(
    staleSessions.map(
      (s) => evaluateRemoteLeaseForSession({
        sessionId: s.id,
        userId: s.user_id,
        cleanPhone: s.phone_number
      })
    )
  );
}
async function publishActiveSessionLease(sessionData, force = false) {
  if (!sessionData?.sessionId || sessionData.superseded) return;
  const now = Date.now();
  const prevAt = lastLeaseRefreshAt.get(sessionData.sessionId) || 0;
  if (!force && now - prevAt < 25e3) return;
  lastLeaseRefreshAt.set(sessionData.sessionId, now);
  const dbSess = getSessionById(sessionData.sessionId);
  const cleanPhone = normalizePhoneNumber(
    sessionData.phoneNumber || dbSess?.phone_number || getCredsPhoneOnDisk(sessionData.sessionId) || ""
  );
  writeLocalRuntimeLease(sessionData.sessionId, {
    userId: sessionData.userId,
    phoneNumber: cleanPhone || void 0,
    status: sessionData.status === "connected" ? "connected" : "connecting",
    startedAt: sessionData.openedAt || sessionData.handshakeStartedAt || now
  });
  if (!sessionData.userId || !isMysqlConfigured()) return;
  try {
    const identity = await resolveCurrentServerIdentity();
    const lease = {
      instance_id: RUNTIME_INSTANCE_ID,
      app_id: getCurrentAppId(),
      session_id: sessionData.sessionId,
      session_name: dbSess?.session_name || (cleanPhone ? `WA - ${cleanPhone}` : sessionData.sessionId),
      phone_number: cleanPhone,
      user_id: sessionData.userId,
      domain: identity.domain,
      server_ip: identity.serverIp,
      hostname: identity.hostname,
      connected_at: sessionData.openedAt || now,
      heartbeat_at: now
    };
    const fetchedAt = Date.now();
    remoteSessionLeaseCache.set(`sid:${sessionData.sessionId}`, { lease, fetchedAt });
    if (cleanPhone.length >= 8) {
      remoteSessionLeaseCache.set(`phone:${cleanPhone}`, { lease, fetchedAt });
    }
    await saveWaSessionLeaseToMysql(lease);
  } catch {
  }
}
function buildRemoteConflictDetailSync(lease, sessionId, sessionName) {
  const identity = getCachedOrFallbackIdentity();
  const cleanPhone = normalizePhoneNumber(lease.phone_number || "");
  return {
    source_type: "remote_instance",
    source_label: "Server Lain dengan IP Berbeda (Koneksi Ganda)",
    competing_session_id: lease.session_id,
    competing_session_name: lease.session_name || sessionName || lease.session_id,
    competing_phone: cleanPhone || void 0,
    competing_domain: lease.domain || "-",
    competing_ip: lease.server_ip || "-",
    competing_hostname: lease.hostname,
    competing_instance_id: lease.instance_id.slice(0, 8),
    competing_last_active_at: new Date(lease.heartbeat_at || Date.now()).toISOString(),
    local_session_id: sessionId,
    local_session_name: sessionName || sessionId,
    local_domain: identity.domain,
    local_ip: identity.serverIp,
    raw_reason: "Stream active on remote server with different IP",
    detected_at: (/* @__PURE__ */ new Date()).toISOString(),
    detail_note: `Sesi WhatsApp ini sedang aktif di server dengan IP berbeda (${lease.server_ip || "-"}, domain "${lease.domain || "-"}"). Tutup koneksi WhatsApp di server lain tersebut terlebih dahulu, baru klik "Sambungkan Ulang".`
  };
}
async function captureAndStoreConflictDiagnostic(params) {
  const { sessionId, ownerId, cleanPhone, sessionName, disconnectErr, disconnectErrMsg, cooldownUntil } = params;
  const identity = await resolveCurrentServerIdentity();
  const detectedIso = (/* @__PURE__ */ new Date()).toISOString();
  const cooldownIso = cooldownUntil ? new Date(cooldownUntil).toISOString() : void 0;
  const errLocation = disconnectErr?.data?.attrs?.location ? String(disconnectErr.data.attrs.location).trim() : "";
  const rawReasonParts = [disconnectErrMsg, errLocation ? `location=${errLocation}` : ""].filter(Boolean);
  const rawReason = rawReasonParts.join(" | ").slice(0, 180) || "Stream Errored (conflict)";
  if (cleanPhone && cleanPhone.length >= 8) {
    for (const s of activeSessions.values()) {
      if (s.sessionId === sessionId) continue;
      if (s.userId && ownerId && s.userId !== ownerId) continue;
      const otherPhone = normalizePhoneNumber(s.phoneNumber || getCredsPhoneOnDisk(s.sessionId) || "");
      if (otherPhone && otherPhone === cleanPhone && (s.status === "connected" && isSocketTrulyOpen(s.socket) || s.status === "connecting")) {
        const otherDb = getSessionById(s.sessionId);
        const otherName = otherDb?.session_name || s.sessionId;
        sessionConflictDetails.delete(sessionId);
        return {
          source_type: "same_server",
          source_label: "Sesi Duplikat di Aplikasi Ini",
          competing_session_id: s.sessionId,
          competing_session_name: otherName,
          competing_phone: otherPhone,
          competing_domain: identity.domain,
          competing_ip: identity.serverIp,
          competing_hostname: identity.hostname,
          competing_instance_id: RUNTIME_INSTANCE_ID.slice(0, 8),
          competing_last_active_at: new Date(s.lastUpdated || Date.now()).toISOString(),
          local_session_id: sessionId,
          local_session_name: sessionName || sessionId,
          local_domain: identity.domain,
          local_ip: identity.serverIp,
          raw_reason: rawReason,
          detected_at: detectedIso,
          cooldown_until: cooldownIso,
          detail_note: `Nomor +${cleanPhone} sudah aktif pada sesi "${otherName}" (${s.sessionId}) di server aplikasi ini (${identity.domain}).`
        };
      }
    }
  }
  const localSibling = findLiveLocalSiblingLease({ sessionId, userId: ownerId, cleanPhone });
  if (localSibling) {
    sessionConflictDetails.delete(sessionId);
    return {
      source_type: "same_server",
      source_label: "Worker / Proses Lain pada Server Ini",
      competing_session_id: localSibling.session_id,
      competing_session_name: sessionName || localSibling.session_id,
      competing_phone: localSibling.phone_number || cleanPhone,
      competing_domain: identity.domain,
      competing_ip: identity.serverIp,
      competing_hostname: localSibling.hostname || identity.hostname,
      competing_instance_id: localSibling.instance_id.slice(0, 8),
      competing_last_active_at: new Date(localSibling.heartbeat_at).toISOString(),
      local_session_id: sessionId,
      local_session_name: sessionName || sessionId,
      local_domain: identity.domain,
      local_ip: identity.serverIp,
      raw_reason: rawReason,
      detected_at: detectedIso,
      cooldown_until: cooldownIso,
      detail_note: `Sesi sudah aktif pada proses worker lain (PID ${localSibling.pid}) di server aplikasi ini (${identity.domain}).`
    };
  }
  if (isMysqlConfigured()) {
    try {
      const lease = await Promise.race([
        loadWaSessionLeaseFromMysql({ sessionId, phoneNumber: cleanPhone }),
        new Promise((resolve) => setTimeout(() => resolve(null), 1500))
      ]);
      if (lease && (!ownerId || lease.user_id === ownerId) && Date.now() - (Number(lease.heartbeat_at) || 0) < 30 * 60 * 1e3) {
        const isSameInstance = lease.instance_id === RUNTIME_INSTANCE_ID;
        const isSameApp = isSameInstance || isSameDomainAndIpIdentity(identity, lease);
        if (isSameApp) {
          const detail3 = {
            source_type: "same_server",
            source_label: "Koneksi Aktif pada Domain & IP Aplikasi Ini",
            competing_session_id: lease.session_id,
            competing_session_name: lease.session_name || lease.session_id,
            competing_phone: lease.phone_number || cleanPhone,
            competing_domain: lease.domain || identity.domain,
            competing_ip: lease.server_ip || identity.serverIp,
            competing_hostname: lease.hostname,
            competing_instance_id: lease.instance_id.slice(0, 8),
            competing_last_active_at: new Date(lease.heartbeat_at).toISOString(),
            local_session_id: sessionId,
            local_session_name: sessionName || sessionId,
            local_domain: identity.domain,
            local_ip: identity.serverIp,
            raw_reason: rawReason,
            detected_at: detectedIso,
            cooldown_until: cooldownIso,
            detail_note: `Sesi sudah aktif di domain dan IP yang sama (${lease.domain || identity.domain}, IP ${lease.server_ip || identity.serverIp}).`
          };
          return detail3;
        }
        const detail2 = {
          source_type: "remote_instance",
          source_label: "Server / IP Berbeda (Koneksi Ganda Terdeteksi)",
          competing_session_id: lease.session_id,
          competing_session_name: lease.session_name || lease.session_id,
          competing_phone: lease.phone_number || cleanPhone,
          competing_domain: lease.domain || "-",
          competing_ip: lease.server_ip || "-",
          competing_hostname: lease.hostname,
          competing_instance_id: lease.instance_id.slice(0, 8),
          competing_last_active_at: new Date(lease.heartbeat_at).toISOString(),
          local_session_id: sessionId,
          local_session_name: sessionName || sessionId,
          local_domain: identity.domain,
          local_ip: identity.serverIp,
          raw_reason: rawReason,
          detected_at: detectedIso,
          cooldown_until: cooldownIso,
          detail_note: `WhatsApp nomor ini sedang aktif di server dengan IP berbeda (${lease.server_ip || "-"}, domain "${lease.domain || "-"}"). Tutup/hentikan koneksi pada server tersebut terlebih dahulu, lalu klik "Sambungkan Ulang".`
        };
        sessionConflictDetails.set(sessionId, detail2);
        remoteSessionConflictCache.set(sessionId, { detail: detail2, fetchedAt: Date.now() });
        void saveWaSessionConflictToMysql(sessionId, detail2).catch(() => {
        });
        return detail2;
      }
    } catch {
    }
  }
  const detail = {
    source_type: "external_or_unknown",
    source_label: "Server Lain (IP Berbeda) / Aplikasi Eksternal",
    competing_session_id: sessionId,
    competing_session_name: sessionName || sessionId,
    competing_phone: cleanPhone,
    local_session_id: sessionId,
    local_session_name: sessionName || sessionId,
    local_domain: identity.domain,
    local_ip: identity.serverIp,
    raw_reason: rawReason,
    detected_at: detectedIso,
    cooldown_until: cooldownIso,
    detail_note: `Sesi WhatsApp ini sedang terhubung di server/perangkat lain dengan IP berbeda di luar ${identity.domain} (IP ${identity.serverIp}). Tutup koneksi WhatsApp pada server/aplikasi lain tersebut terlebih dahulu, lalu klik "Sambungkan Ulang".`
  };
  sessionConflictDetails.set(sessionId, detail);
  remoteSessionConflictCache.set(sessionId, { detail, fetchedAt: Date.now() });
  void saveWaSessionConflictToMysql(sessionId, detail).catch(() => {
  });
  return detail;
}
function recordDisconnectDiagnostic(sessionId, statusCode, errMessage) {
  let reason = `status_${statusCode ?? "unknown"}`;
  if (statusCode === DisconnectReason.loggedOut || statusCode === 401) {
    reason = "401_logged_out_dari_hp_atau_server_wa";
  } else if (statusCode === DisconnectReason.connectionReplaced || statusCode === 440) {
    reason = "440_konflik_koneksi_ganda";
  } else if (statusCode === DisconnectReason.badSession || statusCode === 500) {
    reason = "500_bad_session_key_desync";
  } else if (statusCode === DisconnectReason.restartRequired || statusCode === 515) {
    reason = "515_restart_required";
  } else if (statusCode === DisconnectReason.timedOut || statusCode === 408) {
    reason = "408_websocket_timeout";
  } else if (statusCode === DisconnectReason.connectionClosed || statusCode === 428) {
    reason = "428_connection_closed";
  } else if (errMessage) {
    reason = `${statusCode ?? "err"}: ${errMessage.slice(0, 100)}`;
  }
  sessionDisconnectDiagnostics.set(sessionId, {
    code: statusCode,
    reason,
    at: Date.now()
  });
}
function clearSessionExpiryNotificationCooldown(sessionId, ownerUserId, phone) {
  const cleanPhone = normalizePhoneNumber(phone || "");
  const keysToClear = [];
  if (sessionId) keysToClear.push(sessionId);
  if (ownerUserId) {
    if (sessionId) keysToClear.push(`${ownerUserId}:${sessionId}`);
    if (cleanPhone) keysToClear.push(`${ownerUserId}:${cleanPhone}`);
  }
  clearSessionExpiryAlertSent(keysToClear);
  clearPendingSessionExpiryAlertsByKeys({
    userId: ownerUserId,
    sessionId,
    phone: cleanPhone
  });
}
function verifyExpiredAlertState(params) {
  const owner = getUserById(params.userId);
  if (!isOwnerActiveAndRegistered(owner)) {
    return "recovered";
  }
  const now = Date.now();
  const cleanPhone = normalizePhoneNumber(params.expiredPhone || "");
  for (const s of activeSessions.values()) {
    const ownerMatch = s.userId === owner.id || isSessionOwnedByUserId(s.sessionId, owner.id) || Boolean(getSessionById(s.sessionId)?.user_id === owner.id);
    if (!ownerMatch) continue;
    const memPhone = normalizePhoneNumber(s.phoneNumber || "");
    const sameDevice = s.sessionId === params.sessionId || cleanPhone.length >= 8 && memPhone === cleanPhone;
    if (!sameDevice) continue;
    if (s.status === "connected" && isSocketTrulyOpen(s.socket)) {
      return "recovered";
    }
    if (s.status === "connecting" && now - s.lastUpdated < 45e3) {
      return "wait";
    }
  }
  const userDbSessions = getSessionsByUserId(owner.id);
  for (const s of userDbSessions) {
    const dbPhone = normalizePhoneNumber(s.phone_number || "");
    const sameDevice = s.id === params.sessionId || cleanPhone.length >= 8 && dbPhone === cleanPhone;
    if (!sameDevice) continue;
    const notExpiredByDate = !s.expires_at || Date.parse(s.expires_at) > now;
    if (s.status === "connected" && notExpiredByDate && hasRegisteredCredsOnDisk(s.id)) {
      return "recovered";
    }
  }
  return "expired";
}
function buildProfessionalExpiredSessionMessage(params) {
  const wl = getWhitelabelConfig();
  const appName = (wl?.app_name || "Japriin").trim();
  const publicUrl = resolvePublicAppBaseUrl();
  const cleanPhone = normalizePhoneNumber(params.expiredPhone || "");
  const deviceLabel = cleanPhone ? `+${cleanPhone}` : params.sessionName && !params.sessionName.startsWith("session_") ? params.sessionName : "Perangkat WhatsApp Anda";
  const urlBlock = publicUrl ? `
Tautan login: ${publicUrl}
` : "\n";
  return `Halo *${params.ownerName}*,

Kami informasikan bahwa tautan perangkat WhatsApp Anda (*${deviceLabel}*) di *${appName}* saat ini sudah kedaluwarsa atau terputus selama lebih dari 1 jam.

Silakan login ke akun *${appName}* Anda dan tautkan kembali perangkat pada menu *Koneksi WA* agar sesi dan layanan pengiriman pesan Anda kembali berjalan lancar.${urlBlock}
Terima kasih.
_Pesan pengingat ini hanya dikirim satu kali sampai perangkat Anda ditautkan kembali._`;
}
async function notifyUserSessionExpired(params) {
  const dbSess = getSessionById(params.sessionId);
  const resolvedPhone = normalizePhoneNumber(
    params.expiredPhone || dbSess?.phone_number || getCredsPhoneOnDisk(params.sessionId) || ""
  );
  const owner = resolveActiveVerifiedOwner(params.sessionId, params.userId || dbSess?.user_id, resolvedPhone);
  if (!isOwnerActiveAndRegistered(owner)) {
    return { notified: false, skipped: "owner_inactive" };
  }
  const recipientPhone = normalizePhoneNumber(owner.phone || "");
  if (!recipientPhone || recipientPhone.length < 8) {
    return { notified: false, skipped: "missing_owner_phone" };
  }
  const dedupeKeys = Array.from(
    new Set(
      [
        resolvedPhone ? `${owner.id}:${resolvedPhone}` : `${owner.id}:${params.sessionId}`,
        `${owner.id}:${params.sessionId}`
      ].filter(Boolean)
    )
  );
  if (dedupeKeys.some((k) => inFlightExpiryAlerts.has(k)) || hasSessionExpiryAlertSent(dedupeKeys)) {
    return { notified: false, skipped: "already_notified_until_relogin" };
  }
  const alertKey = resolvedPhone ? `${owner.id}:${resolvedPhone}` : `${owner.id}:${params.sessionId}`;
  const graceMs = typeof params.graceMs === "number" && params.graceMs >= 0 ? params.graceMs : SESSION_EXPIRY_ALERT_GRACE_MS;
  const { item, created } = upsertPendingSessionExpiryAlert({
    key: alertKey,
    user_id: owner.id,
    session_id: params.sessionId,
    session_name: params.sessionName || dbSess?.session_name,
    expired_phone: resolvedPhone || void 0,
    reason: params.reason,
    grace_ms: graceMs
  });
  if (created) {
    console.log(
      `[Baileys Expiry Alert Scheduled] User=${owner.username} Session=${params.sessionId} (+${resolvedPhone || "-"}) ditunda 1 jam (kirim setelah ${item.notify_after}).`
    );
  }
  return { notified: false, scheduled: true, queued: false };
}
var isProcessingPendingExpiryAlerts = false;
async function processPendingSessionExpiryAlerts(reason = "watchdog") {
  if (isProcessingPendingExpiryAlerts) {
    return { checked: 0, sent: 0, cancelled: 0, waiting: 0 };
  }
  const pending = getPendingSessionExpiryAlerts();
  if (pending.length === 0) {
    return { checked: 0, sent: 0, cancelled: 0, waiting: 0 };
  }
  isProcessingPendingExpiryAlerts = true;
  let checked = 0;
  let sent = 0;
  let cancelled = 0;
  let waiting = 0;
  try {
    const now = Date.now();
    for (const alert of pending) {
      checked++;
      const preCheck = verifyExpiredAlertState({
        userId: alert.user_id,
        sessionId: alert.session_id,
        expiredPhone: alert.expired_phone
      });
      if (preCheck === "recovered") {
        removePendingSessionExpiryAlert(alert.id);
        cancelled++;
        continue;
      }
      const notifyAfterMs = Date.parse(alert.notify_after || "");
      if (Number.isFinite(notifyAfterMs) && now < notifyAfterMs) {
        waiting++;
        continue;
      }
      if (preCheck === "wait") {
        waiting++;
        continue;
      }
      const owner = getUserById(alert.user_id);
      if (!isOwnerActiveAndRegistered(owner)) {
        removePendingSessionExpiryAlert(alert.id);
        cancelled++;
        continue;
      }
      const recipientPhone = normalizePhoneNumber(owner.phone || "");
      if (!recipientPhone || recipientPhone.length < 8) {
        removePendingSessionExpiryAlert(alert.id);
        cancelled++;
        continue;
      }
      const cleanExpiredPhone = normalizePhoneNumber(alert.expired_phone || "");
      const dedupeKeys = Array.from(
        new Set(
          [
            cleanExpiredPhone ? `${owner.id}:${cleanExpiredPhone}` : `${owner.id}:${alert.session_id}`,
            `${owner.id}:${alert.session_id}`
          ].filter(Boolean)
        )
      );
      if (hasSessionExpiryAlertSent(dedupeKeys)) {
        removePendingSessionExpiryAlert(alert.id);
        cancelled++;
        continue;
      }
      const saSession = resolveConnectedSuperadminSession();
      if (!saSession) {
        waiting++;
        continue;
      }
      if (owner.role === "admin" && saSession.sessionId === alert.session_id) {
        waiting++;
        continue;
      }
      const finalCheck = verifyExpiredAlertState({
        userId: alert.user_id,
        sessionId: alert.session_id,
        expiredPhone: alert.expired_phone
      });
      if (finalCheck === "recovered") {
        removePendingSessionExpiryAlert(alert.id);
        cancelled++;
        continue;
      }
      if (finalCheck === "wait") {
        waiting++;
        continue;
      }
      if (dedupeKeys.some((k) => inFlightExpiryAlerts.has(k))) {
        waiting++;
        continue;
      }
      const message = buildProfessionalExpiredSessionMessage({
        ownerName: owner.name || owner.username,
        expiredPhone: alert.expired_phone,
        sessionName: alert.session_name
      });
      for (const k of dedupeKeys) inFlightExpiryAlerts.add(k);
      try {
        await sendDirectlyViaSuperadminSocket(saSession, recipientPhone, message);
        markSessionExpiryAlertSent(dedupeKeys);
        removePendingSessionExpiryAlert(alert.id);
        sent++;
        console.log(
          `[Baileys Expiry Alert Sent:${reason}] User=${owner.username} (${recipientPhone}) ExpiredPhone=+${cleanExpiredPhone || "-"} Session=${alert.session_id}`
        );
        if (pending.length > 1) {
          await delay(3500 + crypto5.randomInt(0, 1500));
        }
      } catch (err) {
        waiting++;
        console.warn(
          `[Baileys Expiry Alert Retry] Gagal kirim notifikasi expired ke ${recipientPhone}, ditahan untuk percobaan berikutnya:`,
          err?.message || err
        );
      } finally {
        for (const k of dedupeKeys) inFlightExpiryAlerts.delete(k);
      }
    }
  } finally {
    isProcessingPendingExpiryAlerts = false;
  }
  return { checked, sent, cancelled, waiting };
}
function buildBaileysSocketConfig(version, logger, authState, extraCaches) {
  installLibsignalConsoleGuard();
  return {
    version,
    logger,
    printQRInTerminal: false,
    auth: authState,
    browser: BAILEYS_BROWSER,
    syncFullHistory: false,
    shouldSyncHistoryMessage: () => false,
    generateHighQualityLinkPreview: false,
    linkPreviewImageThumbnailWidth: 0,
    markOnlineOnConnect: false,
    shouldIgnoreJid: (jid) => {
      if (!jid) return false;
      if (isMetaAiJid(jid)) return false;
      return jid.endsWith("@g.us") || jid === "status@broadcast" || jid.endsWith("@broadcast") || jid.endsWith("@newsletter");
    },
    connectTimeoutMs: 3e4,
    defaultQueryTimeoutMs: 2e4,
    keepAliveIntervalMs: 15e3,
    qrTimeout: 6e4,
    retryRequestDelayMs: 1e3,
    maxMsgRetryCount: 4,
    enableAutoSessionRecreation: true,
    makeSignalRepository: (auth, sockLogger, pnToLIDFunc) => createResilientSignalRepository(auth, sockLogger, pnToLIDFunc),
    ...extraCaches?.userDevicesCache ? { userDevicesCache: extraCaches.userDevicesCache } : {},
    ...extraCaches?.msgRetryCounterCache ? { msgRetryCounterCache: extraCaches.msgRetryCounterCache } : {},
    getMessage: async (key) => {
      if (!key?.id) return void 0;
      return recentMessageProtoCache.get(`${key.remoteJid || ""}:${key.id}`) || void 0;
    },
    transactionOpts: {
      maxCommitRetries: 5,
      delayBetweenTriesMs: 500
    }
  };
}
var ensureSessionLocks = /* @__PURE__ */ new Map();
function socketMatchesUser(s, userId, userDbSessions) {
  if (!userId) return true;
  if (s.userId && s.userId !== userId) return false;
  if (s.userId === userId || isSessionOwnedByUserId(s.sessionId, userId)) {
    if (!s.userId) s.userId = userId;
    return true;
  }
  const dbSess = getSessionById(s.sessionId);
  if (dbSess?.user_id) {
    if (dbSess.user_id !== userId) return false;
    if (!s.userId) s.userId = userId;
    return true;
  }
  const ownedSessions = userDbSessions ?? getSessionsByUserId(userId);
  const memPhone = normalizePhoneNumber(s.phoneNumber || "");
  const matched = ownedSessions.some(
    (dbS) => dbS.id === s.sessionId || memPhone.length >= 8 && dbS.phone_number && normalizePhoneNumber(dbS.phone_number) === memPhone
  );
  if (matched && !s.userId) {
    s.userId = userId;
  }
  return matched;
}
function findLiveSocketEntry(userId, preferredSessionId) {
  const userDbSessions = userId ? getSessionsByUserId(userId) : void 0;
  if (preferredSessionId) {
    const pref = activeSessions.get(preferredSessionId);
    if (pref && pref.status === "connected" && pref.socket && isSocketTrulyOpen(pref.socket) && (!userId || socketMatchesUser(pref, userId, userDbSessions))) {
      return {
        sessionId: pref.sessionId,
        userId: pref.userId,
        phoneNumber: pref.phoneNumber || void 0,
        socket: pref.socket
      };
    }
  }
  const candidates = Array.from(activeSessions.values()).filter((s) => {
    if (s.status !== "connected" || !s.socket || !isSocketTrulyOpen(s.socket)) return false;
    return !userId || socketMatchesUser(s, userId, userDbSessions);
  });
  const picked = candidates.find((s) => s.is_primary) || candidates[0];
  if (!picked) return null;
  return {
    sessionId: picked.sessionId,
    userId: picked.userId,
    phoneNumber: picked.phoneNumber || void 0,
    socket: picked.socket
  };
}
async function ensureConnectedSessionForUser(userId, preferredSessionId) {
  const immediate = findLiveSocketEntry(userId, preferredSessionId);
  if (immediate) return immediate;
  if (!userId && !preferredSessionId) return null;
  const lockKey = `${userId || ""}::${preferredSessionId || ""}`;
  const inFlight = ensureSessionLocks.get(lockKey);
  if (inFlight) return inFlight;
  const promise = (async () => {
    try {
      const userDbSessions = userId ? getSessionsByUserId(userId) : [];
      const connectingMatch = Array.from(activeSessions.values()).find((s) => {
        if (s.status !== "connecting") return false;
        if (preferredSessionId && s.sessionId === preferredSessionId) {
          return !userId || socketMatchesUser(s, userId, userDbSessions);
        }
        return userId ? socketMatchesUser(s, userId, userDbSessions) : false;
      });
      if (connectingMatch) {
        let tries = 0;
        while (tries < 16 && connectingMatch.status === "connecting") {
          await delay(400);
          const ready = findLiveSocketEntry(userId, preferredSessionId);
          if (ready) return ready;
          tries++;
        }
        const afterWait = findLiveSocketEntry(userId, preferredSessionId);
        if (afterWait) return afterWait;
        if (connectingMatch.status === "connecting" && (reconnectTimers.has(connectingMatch.sessionId) || sessionStartLocks.has(connectingMatch.sessionId) || connectingMatch.socket && (isSocketTrulyOpen(connectingMatch.socket) || isSocketConnecting(connectingMatch.socket)))) {
          return null;
        }
      }
      const candidates = [];
      const addCandidate = (id, phone, uid) => {
        if (!id) return;
        if (!candidates.some((c) => c.id === id)) {
          candidates.push({ id, phone, userId: uid });
        }
      };
      if (preferredSessionId) {
        const prefDb = getSessionById(preferredSessionId);
        if (!userId || (prefDb ? prefDb.user_id === userId || isSessionOwnedByUserId(prefDb.id, userId) : isSessionOwnedByUserId(preferredSessionId, userId))) {
          addCandidate(preferredSessionId, prefDb?.phone_number, prefDb?.user_id || userId);
        }
      }
      const sortedDb = [...userDbSessions].filter((s) => !s.expires_at || new Date(s.expires_at).getTime() >= Date.now()).sort((a, b) => {
        const scoreStatus = (st) => st === "connected" ? 2 : st === "connecting" ? 1 : 0;
        const statusDiff = scoreStatus(b.status) - scoreStatus(a.status);
        if (statusDiff !== 0) return statusDiff;
        return Number(Boolean(b.is_primary)) - Number(Boolean(a.is_primary));
      });
      for (const s of sortedDb) {
        addCandidate(s.id, s.phone_number, s.user_id || userId);
      }
      if (userId && fs4.existsSync(AUTH_DIR) && sortedDb.length > 0) {
        const targetPhones = new Set(
          sortedDb.map((s) => normalizePhoneNumber(s.phone_number || "")).filter((p) => p.length >= 8)
        );
        for (const folder of fs4.readdirSync(AUTH_DIR)) {
          const summary = readCredsSummary(folder);
          if (!summary.registered) continue;
          if (isSessionOwnedByUserId(folder, userId) || summary.phone && targetPhones.has(summary.phone)) {
            const owner = resolveActiveVerifiedOwner(folder, void 0, summary.phone);
            if (!owner || owner.id === userId) {
              addCandidate(folder, summary.phone, userId);
            }
          }
        }
      }
      if (isRestoringSessions) {
        let restoreWait = 0;
        while (restoreWait < 10 && isRestoringSessions) {
          await delay(300);
          const ready = findLiveSocketEntry(userId, preferredSessionId);
          if (ready) return ready;
          restoreWait++;
        }
      }
      for (const cand of candidates) {
        const candDb = getSessionById(cand.id);
        if (candDb && !isSessionOwnedByCurrentAppNode(candDb)) {
          continue;
        }
        if (isSessionInConflictCooldown(cand.id)) {
          continue;
        }
        const candMem = activeSessions.get(cand.id);
        if (reconnectTimers.has(cand.id) || sessionStartLocks.has(cand.id) || candMem && candMem.status === "connecting" && candMem.socket && (isSocketTrulyOpen(candMem.socket) || isSocketConnecting(candMem.socket))) {
          continue;
        }
        const candPhone = normalizePhoneNumber(cand.phone || getCredsPhoneOnDisk(cand.id) || "");
        if (candPhone && hasOtherActiveOrConnectingSocketForPhone(cand.id, candPhone, cand.userId || userId)) {
          continue;
        }
        if (findLiveLocalSiblingLease({
          sessionId: cand.id,
          userId: cand.userId || userId,
          cleanPhone: candPhone
        })) {
          continue;
        }
        const remoteLease = await evaluateRemoteLeaseForSession({
          sessionId: cand.id,
          userId: cand.userId || userId,
          cleanPhone: candPhone,
          assignedAppId: candDb?.assigned_app_id
        });
        if (remoteLease.status === "same_domain_ip" || remoteLease.status === "remote_cluster_node" || remoteLease.status === "different_ip") {
          continue;
        }
        let hasCreds = hasRegisteredCredsOnDisk(cand.id);
        if (!hasCreds) {
          hasCreds = await hydrateSessionAuthFolderFromMysql(cand.id).catch(() => false);
        }
        if (!hasCreds) continue;
        const state = await getOrStartBaileysSession(cand.id, cand.phone, cand.userId || userId);
        let tries = 0;
        while (tries < 14 && state.status === "connecting") {
          await delay(400);
          const ready = findLiveSocketEntry(userId, preferredSessionId || cand.id);
          if (ready) {
            const activeMem = activeSessions.get(ready.sessionId);
            if (activeMem) activeMem.lastOutgoingAt = Date.now();
            return ready;
          }
          tries++;
        }
        const finalCheck = findLiveSocketEntry(userId, preferredSessionId || cand.id);
        if (finalCheck) {
          const activeMem = activeSessions.get(finalCheck.sessionId);
          if (activeMem) activeMem.lastOutgoingAt = Date.now();
          return finalCheck;
        }
      }
      return null;
    } finally {
      ensureSessionLocks.delete(lockKey);
    }
  })();
  ensureSessionLocks.set(lockKey, promise);
  return promise;
}
registerConnectedSocketProvider(
  (userId, preferredSessionId) => findLiveSocketEntry(userId, preferredSessionId),
  () => Array.from(activeSessions.values()).filter((s) => s.status === "connected" && s.socket && isSocketTrulyOpen(s.socket)).map((s) => ({
    sessionId: s.sessionId,
    userId: s.userId,
    phoneNumber: s.phoneNumber || void 0,
    socket: s.socket
  })),
  ensureConnectedSessionForUser
);
if (!fs4.existsSync(AUTH_DIR)) {
  fs4.mkdirSync(AUTH_DIR, { recursive: true, mode: 448 });
}
function sanitizeSessionId(rawId) {
  const cleaned = String(rawId || "").trim();
  if (!cleaned || !/^[a-zA-Z0-9_.-]{1,128}$/.test(cleaned) || cleaned.includes("..")) {
    throw new Error("ID sesi WhatsApp tidak valid.");
  }
  return cleaned;
}
var CATALOG_UPLOAD_DIR = path4.resolve(process.cwd(), "uploads", "catalog");
var SAFE_LOCAL_CATALOG_FILE_RE = /^(?:prod|qris)_[a-f0-9-]+\.(png|jpg|webp|gif)$/i;
function resolveLocalCatalogImageBuffer(url) {
  if (!url) return null;
  let relPath = String(url).trim();
  if (/^https?:\/\//i.test(relPath)) {
    try {
      relPath = new URL(relPath).pathname;
    } catch {
      return null;
    }
  }
  if (!relPath.startsWith("/api/catalog/images/")) return null;
  const filename = path4.basename(relPath);
  if (!SAFE_LOCAL_CATALOG_FILE_RE.test(filename)) return null;
  const resolved = path4.resolve(CATALOG_UPLOAD_DIR, filename);
  if (!resolved.startsWith(CATALOG_UPLOAD_DIR + path4.sep)) return null;
  try {
    if (!fs4.existsSync(resolved)) return null;
    const stat = fs4.statSync(resolved);
    if (!stat.isFile() || stat.size < 50 || stat.size > 5 * 1024 * 1024) return null;
    return fs4.readFileSync(resolved);
  } catch {
    return null;
  }
}
function safeSessionFolderPath(sessionId) {
  try {
    const safeId = sanitizeSessionId(sessionId);
    const resolved = path4.resolve(AUTH_DIR, safeId);
    if (!resolved.startsWith(AUTH_DIR + path4.sep)) return null;
    return resolved;
  } catch {
    return null;
  }
}
function clearSessionTimers(sessionId) {
  const b = authBackupTimers.get(sessionId);
  if (b) {
    clearTimeout(b);
    authBackupTimers.delete(sessionId);
  }
  const r = reconnectTimers.get(sessionId);
  if (r) {
    clearTimeout(r);
    reconnectTimers.delete(sessionId);
  }
  const mem = activeSessions.get(sessionId);
  if (mem?.stabilityTimer) {
    clearTimeout(mem.stabilityTimer);
    mem.stabilityTimer = void 0;
  }
}
function isPermanentLogoutCode(statusCode) {
  return statusCode === DisconnectReason.loggedOut || statusCode === 401;
}
function isRestartRequiredCode(statusCode) {
  return statusCode === DisconnectReason.restartRequired || statusCode === 515;
}
function isConnectionReplacedCode(statusCode) {
  return statusCode === DisconnectReason.connectionReplaced || statusCode === 440;
}
function isSessionInConflictCooldown(sessionId) {
  if (!sessionId) return false;
  const entry = sessionConflictStates.get(sessionId);
  if (!entry) return false;
  if (entry.cooldownUntil > Date.now()) {
    return true;
  }
  if (entry.cooldownUntil > 0 && entry.cooldownUntil <= Date.now()) {
    sessionConflictStates.delete(sessionId);
  }
  return false;
}
function clearSessionConflictState(sessionId) {
  if (!sessionId) return;
  sessionConflictStates.delete(sessionId);
  sessionConflictDetails.delete(sessionId);
  remoteSessionConflictCache.delete(sessionId);
  const mem = activeSessions.get(sessionId);
  if (mem) {
    mem.consecutiveConflicts = 0;
    mem.conflictCooldownUntil = void 0;
  }
}
function computePersistentReconnectDelay(retryCount, statusCode) {
  if (isRestartRequiredCode(statusCode)) {
    return 350;
  }
  if (isConnectionReplacedCode(statusCode)) {
    if (retryCount <= 1) return 5e3 + crypto5.randomInt(0, 2e3);
    if (retryCount === 2) return 11e3 + crypto5.randomInt(0, 3e3);
    return 2e4 + crypto5.randomInt(0, 5e3);
  }
  const exp = Math.min(5, Math.max(0, retryCount - 1));
  return Math.min(15e3, Math.round(2e3 * Math.pow(1.45, exp)));
}
function extractBareJidUserDigits(jid) {
  if (!jid) return "";
  return String(jid).trim().replace(/@.*/, "").split(":")[0].replace(/\D/g, "");
}
function readCredsSummary(sessionId) {
  const mem = activeSessions.get(sessionId);
  const memPhone = normalizePhoneNumber(
    mem?.phoneNumber || (mem?.socket?.user?.id ? String(mem.socket.user.id).split("@")[0].split(":")[0] : "") || (mem?.socket?.authState?.creds?.me?.id ? String(mem.socket.authState.creds.me.id).split("@")[0].split(":")[0] : "") || ""
  );
  const memLid = extractBareJidUserDigits(
    mem?.socket?.user?.lid || mem?.socket?.authState?.creds?.me?.lid || ""
  );
  const memRegistered = Boolean(
    mem && (mem.status === "connected" || mem.socket?.authState?.creds?.registered || mem.socket?.user?.id)
  );
  try {
    const folder = safeSessionFolderPath(sessionId);
    if (!folder) return { registered: memRegistered, phone: memPhone, lid: memLid };
    const credsPath = path4.join(folder, "creds.json");
    if (!fs4.existsSync(credsPath)) return { registered: memRegistered, phone: memPhone, lid: memLid };
    const raw = fs4.readFileSync(credsPath, "utf-8");
    if (!raw || !raw.trim()) {
      return { registered: memRegistered, phone: memPhone, lid: memLid };
    }
    const parsed = JSON.parse(raw);
    const meId = parsed?.me?.id ? String(parsed.me.id) : "";
    const meLid = parsed?.me?.lid ? extractBareJidUserDigits(String(parsed.me.lid)) : "";
    return {
      registered: Boolean(parsed && (parsed.registered || meId)) || memRegistered,
      phone: (meId ? normalizePhoneNumber(meId.split("@")[0].split(":")[0]) : "") || memPhone,
      lid: meLid || memLid
    };
  } catch {
    return { registered: memRegistered, phone: memPhone, lid: memLid };
  }
}
function getCredsPhoneOnDisk(sessionId) {
  return readCredsSummary(sessionId).phone;
}
function resolveActiveVerifiedOwner(sessionId, candidateUserId, candidatePhone) {
  const db = initDbFile();
  const cleanPhone = normalizePhoneNumber(candidatePhone || "");
  if (candidateUserId) {
    const u = getUserById(candidateUserId);
    if (u) return u;
  }
  const dbSess = getSessionById(sessionId);
  if (dbSess?.user_id) {
    const u = getUserById(dbSess.user_id);
    if (u) return u;
  }
  const extractedId = extractUserIdFromSessionId(sessionId, db.users);
  if (extractedId) {
    const u = getUserById(extractedId);
    if (u) return u;
  }
  if (cleanPhone && cleanPhone.length >= 8) {
    const matchedSessionOwner = db.sessions.find(
      (s) => s.user_id && s.phone_number && normalizePhoneNumber(s.phone_number) === cleanPhone
    );
    if (matchedSessionOwner?.user_id) {
      const u = getUserById(matchedSessionOwner.user_id);
      if (u) return u;
    }
    const matchedU = db.users.find(
      (u) => u.phone && normalizePhoneNumber(u.phone) === cleanPhone
    );
    if (matchedU) return matchedU;
  }
  return null;
}
function isOwnerActiveAndRegistered(owner) {
  return Boolean(owner && owner.is_active && owner.email_verified);
}
async function flushAuthFolderBackupNow(sessionId) {
  if (!sessionId || !isMysqlConfigured()) return;
  const folder = safeSessionFolderPath(sessionId);
  if (!folder) return;
  try {
    if (!hasRegisteredCredsOnDisk(sessionId)) return;
    const dirEntries = await fs4.promises.readdir(folder, { withFileTypes: true }).catch(() => null);
    if (!dirEntries) return;
    const files = dirEntries.filter((d) => d.isFile() && !d.name.startsWith(".") && d.name.endsWith(".json")).map((d) => d.name).sort();
    const filesMap = {};
    const hash = crypto5.createHash("sha256");
    for (const file of files) {
      const fp = path4.join(folder, file);
      const content = await fs4.promises.readFile(fp, "utf-8");
      filesMap[file] = content;
      hash.update(file).update("\0").update(content).update("\0");
    }
    if (!filesMap["creds.json"]) return;
    const digest = hash.digest("hex");
    if (lastAuthBackupHashes.get(sessionId) === digest) {
      return;
    }
    await saveBaileysAuthToMysql(sessionId, filesMap);
    lastAuthBackupHashes.set(sessionId, digest);
    lastAuthBackupAt.set(sessionId, Date.now());
  } catch {
  }
}
function scheduleAuthFolderBackup(sessionId, immediate = false) {
  if (!sessionId || !isMysqlConfigured()) return;
  const folder = safeSessionFolderPath(sessionId);
  if (!folder) return;
  const prev = authBackupTimers.get(sessionId);
  if (prev) clearTimeout(prev);
  if (immediate) {
    void flushAuthFolderBackupNow(sessionId);
    return;
  }
  const lastAt = lastAuthBackupAt.get(sessionId) || 0;
  const waitMs = Math.max(AUTH_BACKUP_DEBOUNCE_MS, lastAt + AUTH_BACKUP_COOLDOWN_MS - Date.now());
  const timer = setTimeout(() => {
    authBackupTimers.delete(sessionId);
    void flushAuthFolderBackupNow(sessionId);
  }, waitMs);
  timer.unref?.();
  authBackupTimers.set(sessionId, timer);
}
async function hydrateSessionAuthFolderFromMysql(sessionId) {
  const folder = safeSessionFolderPath(sessionId);
  if (!folder) return false;
  if (hasRegisteredCredsOnDisk(sessionId)) return true;
  try {
    const filesMap = await loadBaileysAuthFromMysql(sessionId);
    if (!filesMap || !filesMap["creds.json"]) return false;
    if (!fs4.existsSync(folder)) {
      fs4.mkdirSync(folder, { recursive: true, mode: 448 });
    }
    for (const [filename, content] of Object.entries(filesMap)) {
      const base = path4.basename(filename);
      if (base === filename && base.endsWith(".json") && typeof content === "string") {
        fs4.writeFileSync(path4.join(folder, base), content, { encoding: "utf-8", mode: 384 });
      }
    }
    return hasRegisteredCredsOnDisk(sessionId);
  } catch {
    return false;
  }
}
function cleanSessionFolder(folderName) {
  const targetFolder = safeSessionFolderPath(folderName);
  if (!targetFolder) return;
  try {
    if (fs4.existsSync(targetFolder)) {
      fs4.rmSync(targetFolder, { recursive: true, force: true });
      console.log(`[Baileys] Auth folder deleted: ${targetFolder}`);
    }
  } catch (err) {
    console.error(`[Baileys] Error cleaning session folder ${folderName}:`, err);
  }
}
var commandState = /* @__PURE__ */ new Map();
var COMMAND_STATE_TTL_MS = 15 * 60 * 1e3;
var processedMessageIds = /* @__PURE__ */ new Set();
var incomingChatQueues = /* @__PURE__ */ new Map();
function enqueueIncomingChatTask(chatKey, task) {
  const prev = incomingChatQueues.get(chatKey) || Promise.resolve();
  const next = prev.catch(() => {
  }).then(task).catch((err) => {
    console.error(`[Baileys Incoming Queue Error:${chatKey}]`, err);
  }).finally(() => {
    if (incomingChatQueues.get(chatKey) === next) {
      incomingChatQueues.delete(chatKey);
    }
  });
  incomingChatQueues.set(chatKey, next);
}
function cleanupExpiredCommandStates(now = Date.now()) {
  if (commandState.size === 0) return;
  for (const [key, entry] of commandState.entries()) {
    if (!entry.updatedAt || now - entry.updatedAt > COMMAND_STATE_TTL_MS) {
      commandState.delete(key);
    }
  }
}
function rememberProcessedMsgId(id) {
  if (!id) return;
  processedMessageIds.add(id);
  if (processedMessageIds.size > 500) {
    const first = processedMessageIds.values().next().value;
    if (first) processedMessageIds.delete(first);
  }
}
function resolveIncomingSenderIdentity(sock, msg, remoteJid) {
  const isLidThread = remoteJid.endsWith("@lid") || remoteJid.endsWith("@hosted.lid");
  const rawRemoteDigits = extractBareJidUserDigits(remoteJid);
  let pnJid = null;
  if (!isLidThread && (remoteJid.endsWith("@s.whatsapp.net") || remoteJid.endsWith("@c.us") || remoteJid.endsWith("@hosted"))) {
    pnJid = remoteJid;
  } else {
    const altCandidates = [
      msg?.key?.remoteJidAlt,
      msg?.key?.participantAlt,
      msg?.key?.participant
    ].filter((v) => typeof v === "string" && v.trim().length > 0);
    pnJid = altCandidates.find(
      (j) => j.endsWith("@s.whatsapp.net") || j.endsWith("@c.us") || j.endsWith("@hosted")
    ) || null;
  }
  if (!pnJid && isLidThread && sock?.signalRepository?.lidMapping?.getPNForLID) {
  }
  const resolvedPhoneRaw = pnJid ? pnJid.replace(/@.*/, "").split(":")[0] : remoteJid.replace(/@.*/, "").split(":")[0];
  const senderPhone = normalizePhoneNumber(resolvedPhoneRaw) || resolvedPhoneRaw.replace(/\D/g, "") || resolvedPhoneRaw;
  const cleanSender = senderPhone.replace(/\D/g, "");
  const fallbackPnJid = cleanSender.length >= 8 && (!isLidThread || Boolean(pnJid)) ? `${cleanSender}@s.whatsapp.net` : pnJid && pnJid.endsWith("@s.whatsapp.net") ? pnJid : null;
  return {
    senderPhone,
    cleanSender,
    rawRemoteDigits,
    isLidThread,
    fallbackPnJid
  };
}
async function sendSocketMessageWithAckGuard(sock, jid, content, options) {
  if (!sock || !isSocketTrulyOpen(sock)) {
    throw new Error("Koneksi WebSocket WhatsApp sedang tertutup atau terputus.");
  }
  const timeoutMs = Math.max(8e3, options?.timeoutMs ?? 24e3);
  const myJid = sock?.authState?.creds?.me?.id || sock?.user?.id || "";
  const msgId = options?.sendOptions?.messageId || generateMessageIDV22(myJid);
  const attemptSendToJid = async (targetJid, useMsgId) => {
    const ws = sock?.ws;
    let ackSuccess = false;
    let ackError = null;
    let resolveAckEarly;
    const ackEarlyPromise = new Promise((resolve) => {
      resolveAckEarly = resolve;
    });
    const onAck = (ackNode) => {
      try {
        const id = String(ackNode?.attrs?.id || "").trim();
        if (!id || id !== useMsgId) return;
        const errCode = ackNode?.attrs?.error ? String(ackNode.attrs.error).trim() : "";
        if (errCode) {
          ackError = errCode;
        } else {
          ackSuccess = true;
          if (options?.sessionData) {
            options.sessionData.lastUpdated = Date.now();
          }
        }
        resolveAckEarly();
      } catch {
      }
    };
    if (ws && typeof ws.on === "function") {
      ws.on("CB:ack,class:message", onAck);
      ws.on("CB:ack", onAck);
    }
    let timeoutTimer = null;
    try {
      recordBotSentMessageId(useMsgId);
      const sendPromise = sock.sendMessage(targetJid, content, {
        ...options?.sendOptions || {},
        messageId: useMsgId
      });
      sendPromise.catch(() => {
      });
      const timeoutPromise = new Promise((_, reject) => {
        timeoutTimer = setTimeout(() => {
          reject(
            new Error(
              `Batas waktu pengiriman ke nomor tujuan habis (Timeout ${Math.round(timeoutMs / 1e3)}d)`
            )
          );
        }, timeoutMs);
      });
      const ackWinPromise = ackEarlyPromise.then(async () => {
        if (ackError) {
          throw new Error(`Server WhatsApp menolak pesan (ACK error ${ackError}).`);
        }
        const finished = await Promise.race([
          sendPromise.then((res2) => ({ done: true, res: res2 })).catch(() => ({ done: false, res: null })),
          delay(350).then(() => ({ done: false, res: null }))
        ]);
        return finished.res || {
          key: { id: useMsgId, remoteJid: targetJid, fromMe: true },
          messageTimestamp: Math.floor(Date.now() / 1e3),
          ackConfirmedEarly: true
        };
      });
      const res = await Promise.race([sendPromise, ackWinPromise, timeoutPromise]);
      if (options?.sessionData) {
        options.sessionData.lastUpdated = Date.now();
      }
      return res;
    } catch (err) {
      if (ackSuccess && !ackError) {
        return {
          key: { id: useMsgId, remoteJid: targetJid, fromMe: true },
          messageTimestamp: Math.floor(Date.now() / 1e3),
          ackConfirmedEarly: true
        };
      }
      throw err;
    } finally {
      if (timeoutTimer) clearTimeout(timeoutTimer);
      if (ws && typeof ws.off === "function") {
        ws.off("CB:ack,class:message", onAck);
        ws.off("CB:ack", onAck);
      } else if (ws && typeof ws.removeListener === "function") {
        ws.removeListener("CB:ack,class:message", onAck);
        ws.removeListener("CB:ack", onAck);
      }
    }
  };
  try {
    return await attemptSendToJid(jid, msgId);
  } catch (err) {
    const altJid = options?.fallbackJid;
    if (altJid && altJid !== jid && isSocketTrulyOpen(sock)) {
      const retryId = generateMessageIDV22(myJid);
      return await attemptSendToJid(altJid, retryId);
    }
    throw err;
  }
}
function parseSendOrBroadcastTasks(rawArgs) {
  const cleanedInput = rawArgs.replace(/^\/(?:send|broadcast|kirim|kirimpesan)\b\s*/i, "").trim();
  if (!cleanedInput) return [];
  const nonEmptyLines = cleanedInput.split(/\r?\n/).map((l) => l.replace(/^\/(?:send|broadcast|kirim|kirimpesan)\b\s*/i, "").trim()).filter(Boolean);
  if (nonEmptyLines.length > 1) {
    const perLineTasks = [];
    let allLinesHaveOwnMsg = true;
    for (const line of nonEmptyLines) {
      const m = line.match(/^(\+?[0-9][0-9\-()]{7,15})\s*[:|\-]?\s+(.+)$/);
      if (m) {
        const digits = m[1].replace(/\D/g, "");
        const msg = m[2].trim();
        const msgDigitsOnly = msg.replace(/[\s,;+\-()]/g, "");
        const looksLikePhoneList = /^[0-9]+$/.test(msgDigitsOnly) && msgDigitsOnly.length >= 8;
        if (digits.length >= 8 && digits.length <= 16 && msg && !looksLikePhoneList) {
          perLineTasks.push({ targetPhone: digits, messageToSend: msg });
        } else {
          allLinesHaveOwnMsg = false;
          break;
        }
      } else {
        allLinesHaveOwnMsg = false;
        break;
      }
    }
    if (allLinesHaveOwnMsg && perLineTasks.length > 1) {
      return perLineTasks;
    }
  }
  const kvMatch = cleanedInput.match(/^to=([^\s&]+)[,\s&]+(?:text|msg|pesan)=([\s\S]+)$/i);
  if (kvMatch) {
    const phones2 = kvMatch[1].split(/[,;]+/).map((p) => p.replace(/\D/g, "")).filter((p) => p.length >= 8 && p.length <= 16);
    const msg = kvMatch[2].trim();
    if (phones2.length > 0 && msg) {
      return Array.from(new Set(phones2)).map((targetPhone) => ({ targetPhone, messageToSend: msg }));
    }
  }
  if (cleanedInput.includes("|")) {
    const pipeIdx = cleanedInput.indexOf("|");
    const phoneSection = cleanedInput.substring(0, pipeIdx);
    const msgPart = cleanedInput.substring(pipeIdx + 1).trim();
    const phones2 = phoneSection.split(/[\s,;]+/).map((p) => p.replace(/\D/g, "")).filter((p) => p.length >= 8 && p.length <= 16);
    if (phones2.length > 0 && msgPart) {
      return Array.from(new Set(phones2)).map((targetPhone) => ({ targetPhone, messageToSend: msgPart }));
    }
  }
  const phones = [];
  let pos = 0;
  while (pos < cleanedInput.length) {
    const wsMatch = cleanedInput.slice(pos).match(/^[\s,;]+/);
    if (wsMatch) pos += wsMatch[0].length;
    const tokMatch = cleanedInput.slice(pos).match(/^([^\s]+)/);
    if (!tokMatch) break;
    const token = tokMatch[1];
    const subParts = token.split(/[,;]+/).filter(Boolean);
    const isAllPhones = subParts.length > 0 && subParts.every((sp) => {
      const digits = sp.replace(/\D/g, "");
      return /^[\d+\-()]+$/.test(sp) && digits.length >= 8 && digits.length <= 16;
    });
    if (isAllPhones) {
      subParts.forEach((sp) => phones.push(sp.replace(/\D/g, "")));
      pos += token.length;
    } else {
      break;
    }
  }
  if (phones.length > 0) {
    const msgPart = cleanedInput.slice(pos).replace(/^[\s:,\-|]+/, "").trim();
    if (msgPart) {
      return Array.from(new Set(phones)).map((targetPhone) => ({ targetPhone, messageToSend: msgPart }));
    }
  }
  const flexMatch = cleanedInput.match(/^(\+?[0-9][0-9\-\s]{7,17}?)\s+([\s\S]+)$/);
  if (flexMatch) {
    const digits = flexMatch[1].replace(/\D/g, "");
    if (digits.length >= 8 && digits.length <= 16 && flexMatch[2].trim()) {
      return [{ targetPhone: digits, messageToSend: flexMatch[2].trim() }];
    }
  }
  return [];
}
var recentBotOutgoingTexts = /* @__PURE__ */ new Map();
var recentBotSentMsgIds = /* @__PURE__ */ new Map();
var BOT_MSG_ID_TTL_MS = 15 * 60 * 1e3;
var ownerManualReplyWatermarks = /* @__PURE__ */ new Map();
var MAX_OWNER_MANUAL_WATERMARKS = 2e3;
function recordBotSentMessageId(msgId) {
  const cleanId = typeof msgId === "string" ? msgId.trim() : "";
  if (!cleanId) return;
  const now = Date.now();
  recentBotSentMsgIds.set(cleanId, now);
  if (recentBotSentMsgIds.size > 1e3) {
    for (const [k, t] of recentBotSentMsgIds.entries()) {
      if (now - t > BOT_MSG_ID_TTL_MS) recentBotSentMsgIds.delete(k);
    }
    while (recentBotSentMsgIds.size > 1e3) {
      const first = recentBotSentMsgIds.keys().next().value;
      if (!first) break;
      recentBotSentMsgIds.delete(first);
    }
  }
}
function isRecentBotSentMessageId(msgId) {
  const cleanId = typeof msgId === "string" ? msgId.trim() : "";
  if (!cleanId) return false;
  const at = recentBotSentMsgIds.get(cleanId);
  if (!at) return false;
  if (Date.now() - at > BOT_MSG_ID_TTL_MS) {
    recentBotSentMsgIds.delete(cleanId);
    return false;
  }
  return true;
}
function recordOwnerManualReplyWatermark(sessionId, params) {
  if (!sessionId) return;
  const tsMs = typeof params.timestampMs === "number" && Number.isFinite(params.timestampMs) && params.timestampMs > 0 ? params.timestampMs : Date.now();
  const normPhone = params.cleanPhone ? normalizePhoneNumber(params.cleanPhone) : "";
  const cleanJid = String(params.remoteJid || "").trim();
  if (normPhone && normPhone.length >= 8) {
    const pnKey = `${sessionId}::pn:${normPhone}`;
    if (tsMs > (ownerManualReplyWatermarks.get(pnKey) || 0)) {
      ownerManualReplyWatermarks.set(pnKey, tsMs);
    }
  }
  if (cleanJid) {
    const jidKey = `${sessionId}::jid:${cleanJid}`;
    if (tsMs > (ownerManualReplyWatermarks.get(jidKey) || 0)) {
      ownerManualReplyWatermarks.set(jidKey, tsMs);
    }
  }
  if (ownerManualReplyWatermarks.size > MAX_OWNER_MANUAL_WATERMARKS) {
    const cutoff = Date.now() - 24 * 60 * 60 * 1e3;
    for (const [k, t] of ownerManualReplyWatermarks.entries()) {
      if (t < cutoff) ownerManualReplyWatermarks.delete(k);
    }
    while (ownerManualReplyWatermarks.size > MAX_OWNER_MANUAL_WATERMARKS) {
      const first = ownerManualReplyWatermarks.keys().next().value;
      if (!first) break;
      ownerManualReplyWatermarks.delete(first);
    }
  }
}
function hasNewerOwnerManualReply(sessionId, cleanPhone, remoteJid, incomingMsgTsMs) {
  if (!sessionId || !incomingMsgTsMs || incomingMsgTsMs <= 0) return false;
  let maxOwnerTs = 0;
  const normPhone = cleanPhone ? normalizePhoneNumber(cleanPhone) : "";
  if (normPhone && normPhone.length >= 8) {
    const ts = ownerManualReplyWatermarks.get(`${sessionId}::pn:${normPhone}`) || 0;
    if (ts > maxOwnerTs) maxOwnerTs = ts;
  }
  const cleanJid = String(remoteJid || "").trim();
  if (cleanJid) {
    const ts = ownerManualReplyWatermarks.get(`${sessionId}::jid:${cleanJid}`) || 0;
    if (ts > maxOwnerTs) maxOwnerTs = ts;
  }
  return maxOwnerTs > 0 && maxOwnerTs >= incomingMsgTsMs;
}
function recordBotOutgoing(text) {
  if (!text) return;
  const key = text.trim();
  recentBotOutgoingTexts.set(key, Date.now());
  if (recentBotOutgoingTexts.size > 300) {
    const now = Date.now();
    for (const [k, time] of recentBotOutgoingTexts.entries()) {
      if (now - time > 45e3) recentBotOutgoingTexts.delete(k);
    }
  }
}
function isRecentBotOutgoing(text) {
  if (!text) return false;
  const key = text.trim();
  const time = recentBotOutgoingTexts.get(key);
  if (time && Date.now() - time < 45e3) {
    return true;
  }
  return false;
}
function isDeviceSentEnvelope(msg) {
  let cursor = msg?.message;
  for (let depth = 0; depth < 6 && cursor && typeof cursor === "object"; depth++) {
    if (cursor.deviceSentMessage) return true;
    cursor = cursor.ephemeralMessage?.message || cursor.viewOnceMessage?.message || cursor.viewOnceMessageV2?.message || cursor.viewOnceMessageV2Extension?.message || cursor.documentWithCaptionMessage?.message || cursor.editedMessage?.message || cursor.protocolMessage?.editedMessage || null;
  }
  return false;
}
function isLidStyleJid(jid) {
  if (!jid) return false;
  return /@(?:hosted\.)?lid$/i.test(String(jid).trim());
}
function collectSessionSelfIdentifiers(params) {
  const { sock, sessionId, sessionData, dbSession } = params;
  const selfPhones = /* @__PURE__ */ new Set();
  const selfLids = /* @__PURE__ */ new Set();
  const addPhoneCandidate = (raw) => {
    const digits = extractBareJidUserDigits(raw);
    if (!digits) return;
    const norm = normalizePhoneNumber(digits) || digits;
    if (norm.length >= 8) selfPhones.add(norm);
  };
  const addLidCandidate = (raw) => {
    const digits = extractBareJidUserDigits(raw);
    if (digits && digits.length >= 6) selfLids.add(digits);
  };
  addPhoneCandidate(sessionData?.phoneNumber);
  addPhoneCandidate(dbSession?.phone_number);
  addPhoneCandidate(sock?.user?.id);
  addPhoneCandidate(sock?.authState?.creds?.me?.id);
  addLidCandidate(sock?.user?.lid);
  addLidCandidate(sock?.authState?.creds?.me?.lid);
  const diskSummary = readCredsSummary(sessionId);
  addPhoneCandidate(diskSummary.phone);
  addLidCandidate(diskSummary.lid);
  return { selfPhones, selfLids };
}
function matchesAnySelfIdentifier(rawJidOrPhone, selfPhones, selfLids) {
  if (!rawJidOrPhone || typeof rawJidOrPhone !== "string") return false;
  const trimmed = rawJidOrPhone.trim();
  if (!trimmed) return false;
  const digits = extractBareJidUserDigits(trimmed);
  if (!digits) return false;
  if (isLidStyleJid(trimmed)) {
    return selfLids.has(digits);
  }
  if (/@(?:s\.whatsapp\.net|c\.us|hosted)$/i.test(trimmed)) {
    const norm2 = normalizePhoneNumber(digits) || digits;
    return norm2.length >= 8 && selfPhones.has(norm2);
  }
  const norm = normalizePhoneNumber(digits) || digits;
  return norm.length >= 8 && selfPhones.has(norm) || selfLids.has(digits);
}
function evaluateSelfOrBotMessage(params) {
  const {
    sock,
    sessionId,
    sessionData,
    dbSession,
    msg,
    resolvedTargetPhone,
    lidMappedPeerPhone,
    rawMessageText
  } = params;
  const msgKey = msg?.key;
  const msgId = typeof msgKey?.id === "string" ? msgKey.id.trim() : "";
  const isBotMsgId = Boolean(msgId && isRecentBotSentMessageId(msgId));
  const isBotText = Boolean(rawMessageText && isRecentBotOutgoing(rawMessageText));
  const isBotEcho = isBotMsgId || isBotText;
  const { selfPhones, selfLids } = collectSessionSelfIdentifiers({
    sock,
    sessionId,
    sessionData,
    dbSession
  });
  const remoteJid = String(
    msgKey?.remoteJid || msg?.message?.deviceSentMessage?.destinationJid || ""
  ).trim();
  const isPeerLidThread = isLidStyleJid(remoteJid);
  const isSelfChatTarget = Boolean(
    remoteJid && matchesAnySelfIdentifier(remoteJid, selfPhones, selfLids) || !isPeerLidThread && resolvedTargetPhone && matchesAnySelfIdentifier(resolvedTargetPhone, selfPhones, selfLids) || lidMappedPeerPhone && matchesAnySelfIdentifier(lidMappedPeerPhone, selfPhones, selfLids)
  );
  if (isBotEcho) {
    return {
      isFromSelfOrBot: true,
      isSelfChatTarget,
      isBotEcho: true,
      reason: isBotMsgId ? "botMsgId" : "botTextEcho"
    };
  }
  if (msgKey?.fromMe) {
    return {
      isFromSelfOrBot: true,
      isSelfChatTarget,
      isBotEcho: false,
      reason: "fromMe"
    };
  }
  if (isDeviceSentEnvelope(msg)) {
    return {
      isFromSelfOrBot: true,
      isSelfChatTarget,
      isBotEcho: false,
      reason: "deviceSentMessage"
    };
  }
  const authorOrAltCandidates = [
    msgKey?.participant,
    msgKey?.participantAlt,
    msg?.participant,
    msgKey?.senderPn,
    msgKey?.senderLid,
    msgKey?.remoteJidAlt
  ];
  for (const candidate of authorOrAltCandidates) {
    if (matchesAnySelfIdentifier(candidate, selfPhones, selfLids)) {
      return {
        isFromSelfOrBot: true,
        isSelfChatTarget,
        isBotEcho: false,
        reason: "selfAuthorOrAlt"
      };
    }
  }
  if (isSelfChatTarget) {
    return {
      isFromSelfOrBot: true,
      isSelfChatTarget: true,
      isBotEcho: false,
      reason: "selfTarget"
    };
  }
  return {
    isFromSelfOrBot: false,
    isSelfChatTarget: false,
    isBotEcho: false,
    reason: "external"
  };
}
var OFFLINE_CATCHUP_COALESCE_MS = 1600;
var OFFLINE_CATCHUP_MAX_AGE_MS = 24 * 60 * 60 * 1e3;
var MISSED_RETRY_BACKOFF_MS = [2e4, 6e4, 18e4];
var MAX_MISSED_RETRY_ATTEMPTS = 4;
var offlineCatchupBuffers = /* @__PURE__ */ new Map();
var missedCatchupLocks = /* @__PURE__ */ new Set();
var socketPingFailures = /* @__PURE__ */ new Map();
function extractMessageTimestampMs(msg) {
  const tsVal = msg?.messageTimestamp;
  let num = 0;
  if (typeof tsVal === "number") {
    num = tsVal;
  } else if (tsVal && typeof tsVal === "object") {
    if (typeof tsVal.toNumber === "function") {
      try {
        num = Number(tsVal.toNumber());
      } catch {
        num = Number(tsVal.low || 0);
      }
    } else {
      num = Number(tsVal.low || tsVal || 0);
    }
  } else if (typeof tsVal === "string") {
    num = Number(tsVal);
  }
  if (!Number.isFinite(num) || num <= 0) {
    return Date.now();
  }
  return num > 1e12 ? num : num * 1e3;
}
function unwrapIncomingMessageText(msg) {
  let innerMsg = msg?.message;
  for (let depth = 0; depth < 6 && innerMsg && typeof innerMsg === "object"; depth++) {
    const nextLayer = innerMsg.deviceSentMessage?.message || innerMsg.ephemeralMessage?.message || innerMsg.viewOnceMessage?.message || innerMsg.viewOnceMessageV2?.message || innerMsg.viewOnceMessageV2Extension?.message || innerMsg.documentWithCaptionMessage?.message || null;
    if (!nextLayer) break;
    innerMsg = nextLayer;
  }
  const hasMediaAttachment = Boolean(
    innerMsg?.imageMessage || innerMsg?.documentMessage || msg?.message?.imageMessage || msg?.message?.documentMessage
  );
  const rawMessageText = String(
    innerMsg?.conversation || innerMsg?.extendedTextMessage?.text || innerMsg?.imageMessage?.caption || innerMsg?.videoMessage?.caption || innerMsg?.documentMessage?.caption || msg?.message?.conversation || msg?.message?.extendedTextMessage?.text || ""
  ).trim();
  return { innerMsg, rawMessageText, hasMediaAttachment };
}
function clearOfflineCatchupBuffersForSession(sessionId) {
  const prefix = `${sessionId}:`;
  for (const [k, buf] of offlineCatchupBuffers.entries()) {
    if (k.startsWith(prefix)) {
      clearTimeout(buf.timer);
      offlineCatchupBuffers.delete(k);
    }
  }
}
async function processIncomingCustomerMessage(params) {
  const {
    sock,
    sessionId,
    sessionData,
    msgKey,
    remoteJid,
    fallbackPnJid,
    senderPhone,
    cleanSender,
    senderName,
    messageText,
    rawMessageText,
    hasMediaAttachment,
    msgTsMs
  } = params;
  const db = initDbFile();
  const primaryWamId = String(msgKey?.id || `baileys_in_${Date.now()}`);
  const allWamIds = Array.from(
    new Set([primaryWamId, ...params.extraWamIds || []].filter(Boolean))
  );
  let dbSession = getSessionById(sessionId);
  if (!dbSession && sessionData?.phoneNumber) {
    const cleanSessionPhone = normalizePhoneNumber(sessionData.phoneNumber);
    dbSession = db.sessions.find(
      (s) => s.phone_number && normalizePhoneNumber(s.phone_number) === cleanSessionPhone
    ) || null;
  }
  const pipelineSelfCheck = evaluateSelfOrBotMessage({
    sock,
    sessionId,
    sessionData,
    dbSession,
    msg: { key: { ...msgKey || {}, id: primaryWamId, remoteJid } },
    resolvedTargetPhone: cleanSender || senderPhone,
    rawMessageText
  });
  if (pipelineSelfCheck.isFromSelfOrBot) {
    console.log(
      `[Baileys Self-Guard Blocked Pipeline] Session=${sessionId} reason=${pipelineSelfCheck.reason} target=${remoteJid}`
    );
    markIncomingMessagesHandled(allWamIds, sessionId, msgTsMs);
    return { outcome: "permanent_skip" };
  }
  if (hasNewerOwnerManualReply(sessionId, cleanSender, remoteJid, msgTsMs)) {
    markIncomingMessagesHandled(allWamIds, sessionId, msgTsMs);
    return { outcome: "permanent_skip" };
  }
  if (params.isCatchup || params.isRetryFromQueue) {
    const watermarkTs = getChatReplyWatermark(sessionId, cleanSender, remoteJid);
    if (watermarkTs > 0 && msgTsMs <= watermarkTs) {
      markIncomingMessagesHandled(allWamIds, sessionId, msgTsMs);
      return { outcome: "permanent_skip" };
    }
  }
  let sessionUserId = dbSession?.user_id || sessionData?.userId;
  if (!sessionUserId && sessionData?.phoneNumber) {
    const cleanPhone = normalizePhoneNumber(sessionData.phoneNumber);
    const matchedUser = db.users.find(
      (u) => u.phone && normalizePhoneNumber(u.phone) === cleanPhone
    );
    if (matchedUser) sessionUserId = matchedUser.id;
  }
  if (!sessionUserId) {
    sessionUserId = extractUserIdFromSessionId(sessionId, db.users);
  }
  if (dbSession && sessionUserId && !dbSession.user_id) {
    dbSession.user_id = sessionUserId;
    updateSession(dbSession.id, { user_id: sessionUserId });
  }
  const sessionUser = sessionUserId ? getUserById(sessionUserId) : null;
  if (!isOwnerActiveAndRegistered(sessionUser)) {
    console.warn(
      `[Baileys Security] Session ${sessionId} has no active registered user. Purging session.`
    );
    if (!params.isRetryFromQueue) {
      purgeBaileysSessionCompletely(sessionId, sessionData?.phoneNumber || void 0).catch(() => {
      });
    }
    return { outcome: "permanent_skip" };
  }
  const autoReplyStatus = getUserAutoReplyStatus(sessionUser);
  if (!autoReplyStatus.allowed) {
    const gateReason = autoReplyStatus.reason || "Respon pesan otomatis sedang nonaktif.";
    recordAiAuditEvent({
      level: "WARN",
      stage: "auto_reply_gate",
      session_id: sessionId,
      user_id: sessionUser.id,
      senderPhone,
      error_code: autoReplyStatus.expired ? "FREE_TRIAL_EXPIRED" : "AUTO_REPLY_DISABLED",
      reason: gateReason
    });
    if (!params.isRetryFromQueue) {
      addMessageLog({
        wam_id: primaryWamId,
        user_id: sessionUser.id,
        session_id: sessionId,
        sender_phone: senderPhone,
        sender_name: senderName,
        message_body: messageText,
        direction: "incoming",
        status: "Diterima",
        reply_body: gateReason,
        error_detail: `[Auto-Reply Nonaktif] ${gateReason}`,
        ai_generated: false
      });
    }
    markIncomingMessagesHandled(allWamIds, sessionId, msgTsMs);
    return { outcome: "permanent_skip" };
  }
  if (sessionUser) {
    const dailyGate = canUseDailyQuota(sessionUser.id);
    if (!dailyGate.allowed) {
      const quotaMsg = dailyGate.message || "Kuota chat harian/bulanan Anda telah habis.";
      recordAiAuditEvent({
        level: "WARN",
        stage: "quota_gate",
        session_id: sessionId,
        user_id: sessionUser.id,
        senderPhone,
        error_code: "DAILY_CHAT_QUOTA_EXCEEDED",
        reason: quotaMsg
      });
      if (!params.isRetryFromQueue) {
        addMessageLog({
          wam_id: primaryWamId,
          user_id: sessionUser.id,
          session_id: sessionId,
          sender_phone: senderPhone,
          sender_name: senderName,
          message_body: messageText,
          direction: "incoming",
          status: "Diterima",
          reply_body: quotaMsg,
          error_detail: `[Batas Chat Harian Habis] ${quotaMsg}`,
          ai_generated: false
        });
      }
      markIncomingMessagesHandled(allWamIds, sessionId, msgTsMs);
      return { outcome: "permanent_skip" };
    }
  }
  const antiBan = getAntiBanSettings();
  let replyText = "";
  let isAi = false;
  let aiDiagnosticReason;
  let aiRetryableFail = false;
  let sendQrisImage = false;
  let qrisImageUrl;
  let qrisPublicUrl;
  let orderPaidVerified = false;
  let currentOrderFlow = null;
  let currentActiveCatalog = null;
  const resolvedOwnerId = sessionUser?.id || sessionUserId;
  const scopeId = resolvedOwnerId || sessionId;
  const sysConfig = getSystemConfig();
  const effectiveAi = resolveEffectiveSessionAiSettings({
    user: sessionUser,
    session: dbSession,
    sysConfig
  });
  const userPersonalPrompt = effectiveAi.systemPrompt;
  const canUseAi = effectiveAi.aiEnabled;
  const activeCatalog = getActiveCatalogForAi(resolvedOwnerId);
  currentActiveCatalog = activeCatalog;
  const orderFlow = prepareOrderFlowForIncomingMessage({
    scopeId,
    senderPhone,
    messageText,
    catalog: activeCatalog,
    hasMediaAttachment
  });
  currentOrderFlow = orderFlow;
  const priorHistory = orderFlow.context.history.slice(-6).map((h) => ({ role: h.role, text: h.text }));
  if (!params.isRetryFromQueue) {
    recordCustomerTurn(scopeId, senderPhone, "customer", messageText);
  }
  const isCsEnabled = sessionUser ? sessionUser.role === "admin" ? sessionUser.default_cs_reply_enabled !== false : sessionUser.default_cs_reply_enabled === true : true;
  if (orderFlow.directReply) {
    replyText = orderFlow.directReply.text;
    sendQrisImage = orderFlow.directReply.sendQrisImage;
    qrisImageUrl = orderFlow.directReply.qrisImageUrl;
    qrisPublicUrl = orderFlow.directReply.qrisPublicUrl;
    isAi = false;
    console.log(
      `[Baileys Order System] Fast-path "${orderFlow.directReply.reason}" untuk ${orderFlow.context.customerCode} (QRIS=${sendQrisImage})`
    );
  } else {
    const aiQuotaCheck = sessionUser ? canUseAiQuota(sessionUser.id) : {
      allowed: true,
      remainingDaily: 999999,
      dailyLimit: 999999,
      remainingMonthly: 999999,
      monthlyLimit: 999999
    };
    if (canUseAi && aiQuotaCheck.allowed) {
      try {
        console.log(
          `[Baileys Meta AI${params.isCatchup ? " Catch-Up" : ""}] Forwarding ${orderFlow.context.customerCode} via session ${sessionId} (catalog=${activeCatalog.enabled ? `${activeCatalog.products.length} produk` : "off"})...`
        );
        const aiRes = await askMetaAiViaBaileys({
          userId: resolvedOwnerId,
          sessionId,
          senderPhone,
          senderName,
          messageBody: messageText,
          customSystemPrompt: userPersonalPrompt,
          catalogShopName: activeCatalog.shopName,
          catalogProducts: activeCatalog.enabled ? activeCatalog.products : void 0,
          customerCode: orderFlow.context.customerCode,
          customerHistory: priorHistory,
          orderSummary: orderFlow.orderSummaryForPrompt || void 0,
          paymentSummary: orderFlow.paymentSummaryForPrompt || void 0
        });
        if (aiRes.usedAi && aiRes.replyText) {
          const directive = parseAndHandleAiPaymentDirectives(aiRes.replyText, activeCatalog, {
            customerContext: orderFlow.context,
            isPaymentSubmission: orderFlow.isPaymentSubmission
          });
          replyText = directive.cleanText;
          sendQrisImage = directive.sendQrisImage;
          qrisImageUrl = directive.qrisImageUrl;
          qrisPublicUrl = directive.qrisPublicUrl;
          orderPaidVerified = directive.orderPaidVerified;
          isAi = true;
          if (sessionUser && sessionData?.phoneNumber && !isPhoneMetaAiVerifiedForUser(sessionUser, sessionData.phoneNumber)) {
            markUserMetaAiVerified(sessionUser.id, sessionData.phoneNumber);
          }
        } else if (aiRes.errorReason) {
          aiDiagnosticReason = `[Meta AI] ${aiRes.errorReason}`;
          aiRetryableFail = aiRes.retryable !== false;
          console.log(`[Baileys Meta AI Fallback] ${aiRes.errorReason}`);
        }
      } catch (aiErr) {
        const msgErr = aiErr?.message || "Error internal saat memanggil Meta AI.";
        aiDiagnosticReason = `[Meta AI Exception] ${msgErr}`;
        aiRetryableFail = true;
        recordAiAuditEvent({
          level: "ERROR",
          stage: "meta_ai_reply",
          session_id: sessionId,
          user_id: resolvedOwnerId,
          customer_code: orderFlow.context.customerCode,
          senderPhone,
          error_code: "BAILEYS_AI_EXCEPTION",
          reason: msgErr
        });
        console.error("[Baileys Meta AI Reply Error]", aiErr);
      }
    } else if (!canUseAi) {
      const disabledReason = dbSession?.ai_enabled === false ? "Sakelar Meta AI pada perangkat WhatsApp ini sedang nonaktif." : sessionUser?.role === "admin" ? "Sakelar Meta AI pada pengaturan sistem sedang nonaktif." : "Sakelar Meta AI pada akun pengguna sedang nonaktif.";
      aiDiagnosticReason = `[Meta AI Nonaktif] ${disabledReason}`;
      recordAiAuditEvent({
        level: "WARN",
        stage: "ai_gate",
        session_id: sessionId,
        user_id: resolvedOwnerId,
        customer_code: orderFlow.context.customerCode,
        senderPhone,
        error_code: "AI_DISABLED",
        reason: disabledReason
      });
    } else if (canUseAi && !aiQuotaCheck.allowed) {
      const quotaReason = aiQuotaCheck.message || "Kuota balasan Meta AI harian/bulanan habis.";
      aiDiagnosticReason = `[Kuota AI Habis] ${quotaReason}`;
      recordAiAuditEvent({
        level: "WARN",
        stage: "quota_gate",
        session_id: sessionId,
        user_id: resolvedOwnerId,
        customer_code: orderFlow.context.customerCode,
        senderPhone,
        error_code: "AI_QUOTA_EXCEEDED",
        reason: quotaReason
      });
      console.log(
        `[Baileys Meta AI Quota] User ${sessionUser?.username} kuota AI habis (${aiQuotaCheck.message}). Beralih ke pesan offline.`
      );
    }
    if (!replyText && orderFlow.context.cart.length > 0) {
      const deterministicOrderReply = buildDeterministicOrderFallbackReply({
        context: orderFlow.context,
        catalog: activeCatalog,
        messageText,
        isPaymentSubmission: orderFlow.isPaymentSubmission
      });
      if (deterministicOrderReply) {
        replyText = deterministicOrderReply;
      }
    }
    const shouldQueueMetaRetry = !replyText && aiRetryableFail && (!isSocketTrulyOpen(sock) || params.isCatchup || params.isRetryFromQueue || !isCsEnabled);
    if (shouldQueueMetaRetry) {
      if (!params.isRetryFromQueue) {
        upsertPendingMissedMessage({
          wam_id: primaryWamId,
          extra_wam_ids: params.extraWamIds,
          session_id: sessionId,
          user_id: resolvedOwnerId,
          sender_phone: senderPhone,
          sender_name: senderName,
          remote_jid: remoteJid,
          fallback_pn_jid: fallbackPnJid || void 0,
          message_body: messageText,
          has_media: hasMediaAttachment,
          message_ts_ms: msgTsMs,
          last_error: aiDiagnosticReason,
          nextRetryDelayMs: MISSED_RETRY_BACKOFF_MS[0]
        });
        addMessageLog({
          wam_id: primaryWamId,
          session_id: dbSession?.id || sessionId,
          user_id: sessionUserId,
          sender_phone: senderPhone,
          sender_name: senderName,
          message_body: messageText,
          direction: "incoming",
          status: "Gagal",
          error_detail: aiDiagnosticReason,
          ai_generated: false
        });
      }
      return {
        outcome: "retryable_fail",
        error: aiDiagnosticReason || "Meta AI gagal merespons sementara"
      };
    }
    if (!replyText && isCsEnabled) {
      const customOfflineMsg = sessionUser?.default_cs_reply_text || sessionUser?.custom_offline_message || sysConfig.ai_config.offline_fallback_message || "Halo *{nama}*, terima kasih telah menghubungi kami. Tim Customer Service kami akan segera membalas pesan Anda sesegera mungkin.";
      replyText = customOfflineMsg.replace(/\{nama\}/gi, senderName).replace(/\{pesan\}/gi, messageText);
    }
  }
  let sendSucceeded = false;
  let sendErrorDetail;
  let sendDroppedSocket = false;
  const replyTargetJid = remoteJid;
  const resolveLiveSessionSocketForReply = async (waitForReconnect = true) => {
    if (sessionData?.superseded) {
      return { sock: null, sessionData: null };
    }
    const current = activeSessions.get(sessionId);
    if (current?.socket && isSocketTrulyOpen(current.socket)) {
      return { sock: current.socket, sessionData: current };
    }
    if (sock && isSocketTrulyOpen(sock) && (!current || current.socket === sock)) {
      return { sock, sessionData: current || sessionData };
    }
    if (waitForReconnect && !isSessionInConflictCooldown(sessionId)) {
      const isReconnecting = () => reconnectTimers.has(sessionId) || sessionStartLocks.has(sessionId) || activeSessions.get(sessionId)?.status === "connecting";
      if (!isReconnecting() && !params.isRetryFromQueue) {
        const dbSessNow = getSessionById(sessionId);
        const cleanSessPhone = normalizePhoneNumber(
          dbSessNow?.phone_number || getCredsPhoneOnDisk(sessionId) || ""
        );
        const hasSiblingSocket = Boolean(
          cleanSessPhone && hasOtherActiveOrConnectingSocketForPhone(sessionId, cleanSessPhone, resolvedOwnerId)
        );
        if (dbSessNow?.status === "connected" && hasRegisteredCredsOnDisk(sessionId) && !hasSiblingSocket) {
          void getOrStartBaileysSession(sessionId, dbSessNow.phone_number, resolvedOwnerId).catch(() => {
          });
        }
      }
      const deadline = Date.now() + 3500;
      while (Date.now() < deadline && !isSessionInConflictCooldown(sessionId)) {
        const refreshed = activeSessions.get(sessionId);
        if (refreshed?.socket && isSocketTrulyOpen(refreshed.socket)) {
          return { sock: refreshed.socket, sessionData: refreshed };
        }
        if (!isReconnecting()) break;
        await delay(300);
      }
    }
    const finalCheck = activeSessions.get(sessionId);
    if (finalCheck?.socket && isSocketTrulyOpen(finalCheck.socket)) {
      return { sock: finalCheck.socket, sessionData: finalCheck };
    }
    return { sock: null, sessionData: finalCheck || sessionData };
  };
  if (replyText) {
    const preTarget = await resolveLiveSessionSocketForReply(false);
    const preSock = preTarget.sock;
    if (preSock && !msgKey?.fromMe && antiBan.read_receipt_simulation && typeof preSock?.readMessages === "function" && isSocketTrulyOpen(preSock)) {
      try {
        await delay(100 + crypto5.randomInt(0, 180));
        await Promise.race([
          Promise.resolve().then(() => preSock.readMessages([msgKey])),
          delay(2500)
        ]);
      } catch {
      }
    }
    let presenceSock = preSock;
    try {
      if (antiBan.enabled) {
        const minS = Math.max(1, Math.min(3, antiBan.min_delay_seconds || 1));
        const maxS = Math.max(minS, Math.min(5, antiBan.max_delay_seconds || 3));
        const baseMs = minS * 1e3;
        const spanMs = Math.max(300, (maxS - minS) * 1e3);
        const lengthFactor = Math.min(1, replyText.length / 180);
        const jitterMs = crypto5.randomInt(0, Math.max(200, Math.floor(spanMs * 0.4)));
        const randomDelayMs = Math.min(
          maxS * 1e3,
          Math.round(baseMs + spanMs * 0.5 * lengthFactor + jitterMs)
        );
        console.log(
          `[Baileys Anti-Ban] Typing simulation & random delay (${(randomDelayMs / 1e3).toFixed(1)}s) for ${senderPhone}...`
        );
        if (presenceSock && isSocketTrulyOpen(presenceSock) && antiBan.typing_simulation && typeof presenceSock?.sendPresenceUpdate === "function") {
          void Promise.race([
            Promise.resolve().then(() => presenceSock.sendPresenceUpdate("composing", replyTargetJid)),
            delay(1200)
          ]).catch(() => {
          });
        }
        await delay(randomDelayMs);
        const midTarget = await resolveLiveSessionSocketForReply(false);
        if (midTarget.sock) presenceSock = midTarget.sock;
        if (presenceSock && isSocketTrulyOpen(presenceSock) && antiBan.typing_simulation && typeof presenceSock?.sendPresenceUpdate === "function") {
          void Promise.race([
            Promise.resolve().then(() => presenceSock.sendPresenceUpdate("paused", replyTargetJid)),
            delay(800)
          ]).catch(() => {
          });
        }
      }
      const liveTarget = await resolveLiveSessionSocketForReply(true);
      let activeSock = liveTarget.sock;
      let activeSessionData = liveTarget.sessionData;
      if (activeSock) presenceSock = activeSock;
      if (!activeSock || !isSocketTrulyOpen(activeSock)) {
        sendDroppedSocket = true;
        sendErrorDetail = isSessionInConflictCooldown(sessionId) ? "Koneksi WhatsApp sedang dijeda sementara karena konflik sesi ganda (440); balasan diantrekan." : "Koneksi WebSocket WhatsApp sedang tertutup atau terputus.";
        recordAiAuditEvent({
          level: "WARN",
          stage: "reply_send",
          session_id: sessionId,
          user_id: resolvedOwnerId,
          customer_code: currentOrderFlow?.context.customerCode,
          senderPhone,
          error_code: "REPLY_SOCKET_UNAVAILABLE_QUEUED",
          reason: sendErrorDetail
        });
        console.warn(`[Baileys Auto-Reply Queued] To ${senderPhone}: ${sendErrorDetail}`);
      } else if (hasNewerOwnerManualReply(sessionId, cleanSender, remoteJid, msgTsMs)) {
        console.log(
          `[Baileys Manual-Override Suppress] Pemilik membalas manual ke ${senderPhone}; membatalkan pengiriman balasan AI otomatis.`
        );
        markIncomingMessagesHandled(allWamIds, sessionId, msgTsMs);
        return { outcome: "permanent_skip" };
      } else {
        recordBotOutgoing(replyText);
        let sentQrisSuccessfully = false;
        if (sendQrisImage && (qrisImageUrl || qrisPublicUrl)) {
          const localQrisBuf = resolveLocalCatalogImageBuffer(qrisImageUrl || qrisPublicUrl);
          const imageSource = localQrisBuf ? localQrisBuf : qrisPublicUrl && /^https?:\/\//i.test(qrisPublicUrl) ? { url: qrisPublicUrl } : null;
          if (imageSource) {
            try {
              await sendSocketMessageWithAckGuard(
                activeSock,
                replyTargetJid,
                {
                  image: imageSource,
                  caption: replyText
                },
                { timeoutMs: 3e4, fallbackJid: fallbackPnJid, sessionData: activeSessionData }
              );
              sentQrisSuccessfully = true;
              sendSucceeded = true;
              console.log(`[Baileys System QRIS Sent] To ${senderPhone} (${qrisImageUrl})`);
            } catch (qrisErr) {
              const qrisErrText = String(qrisErr?.message || "Koneksi WebSocket WhatsApp sedang tertutup atau terputus.");
              const socketDroppedOnQris = !isSocketTrulyOpen(activeSock) || /closed|terputus|connection/i.test(qrisErrText);
              if (socketDroppedOnQris) {
                const recoveredTarget = await resolveLiveSessionSocketForReply(true);
                if (recoveredTarget.sock && isSocketTrulyOpen(recoveredTarget.sock)) {
                  activeSock = recoveredTarget.sock;
                  activeSessionData = recoveredTarget.sessionData;
                  presenceSock = activeSock;
                  console.warn("[Baileys QRIS Send Fallback to Text] Koneksi sempat pulih; melanjutkan fallback teks.", qrisErrText);
                } else {
                  sendDroppedSocket = true;
                  sendErrorDetail = qrisErrText;
                  recordAiAuditEvent({
                    level: "WARN",
                    stage: "reply_send",
                    session_id: sessionId,
                    user_id: resolvedOwnerId,
                    customer_code: currentOrderFlow?.context.customerCode,
                    senderPhone,
                    error_code: "REPLY_QRIS_SOCKET_DROPPED_QUEUED",
                    reason: qrisErrText
                  });
                  console.warn(`[Baileys Auto-Reply Queued] Pengiriman QRIS ke ${senderPhone} ditunda karena koneksi WA terputus.`);
                }
              } else {
                console.warn("[Baileys QRIS Send Fallback to Text]", qrisErr);
              }
            }
          }
        }
        if (!sentQrisSuccessfully && !sendDroppedSocket) {
          if (!isSocketTrulyOpen(activeSock)) {
            const refreshedTarget = await resolveLiveSessionSocketForReply(true);
            activeSock = refreshedTarget.sock;
            activeSessionData = refreshedTarget.sessionData;
          }
          if (!activeSock || !isSocketTrulyOpen(activeSock)) {
            sendDroppedSocket = true;
            sendErrorDetail = "Koneksi WebSocket WhatsApp sedang tertutup atau terputus.";
            recordAiAuditEvent({
              level: "WARN",
              stage: "reply_send",
              session_id: sessionId,
              user_id: resolvedOwnerId,
              customer_code: currentOrderFlow?.context.customerCode,
              senderPhone,
              error_code: "REPLY_SOCKET_UNAVAILABLE_QUEUED",
              reason: sendErrorDetail
            });
            console.warn(`[Baileys Auto-Reply Queued] To ${senderPhone}: ${sendErrorDetail}`);
          } else {
            try {
              await sendSocketMessageWithAckGuard(
                activeSock,
                replyTargetJid,
                { text: replyText },
                { timeoutMs: 22e3, fallbackJid: fallbackPnJid, sessionData: activeSessionData }
              );
              sendSucceeded = true;
              console.log(
                `[Baileys Auto-Reply Sent ${isAi ? "(AI)" : ""}${params.isCatchup ? " [Catch-Up]" : ""}] To ${senderPhone}: "${replyText}"`
              );
            } catch (replySendErr) {
              const replyErrText = String(
                replySendErr?.message || "Gagal mengirim balasan otomatis ke WhatsApp"
              );
              sendErrorDetail = replyErrText;
              const currentLiveMem = activeSessions.get(sessionId);
              sendDroppedSocket = !isSocketTrulyOpen(activeSock) || !isSocketTrulyOpen(currentLiveMem?.socket) || /closed|terputus|connection|timeout/i.test(replyErrText);
              const queuedOnDrop = sendDroppedSocket && !params.isRetryFromQueue;
              recordAiAuditEvent({
                level: queuedOnDrop ? "WARN" : "ERROR",
                stage: "reply_send",
                session_id: sessionId,
                user_id: resolvedOwnerId,
                customer_code: currentOrderFlow?.context.customerCode,
                senderPhone,
                error_code: queuedOnDrop ? "REPLY_SEND_QUEUED" : "REPLY_SEND_FAILED",
                reason: replyErrText
              });
              if (queuedOnDrop) {
                console.warn(`[Baileys Auto-Reply Queued] To ${senderPhone}:`, sendErrorDetail);
              } else {
                console.error(`[Baileys Auto-Reply Send Error] To ${senderPhone}:`, sendErrorDetail);
              }
            }
          }
        }
      }
    } finally {
      if (!sendSucceeded && presenceSock && isSocketTrulyOpen(presenceSock) && antiBan.enabled && antiBan.typing_simulation && typeof presenceSock?.sendPresenceUpdate === "function") {
        void Promise.race([
          Promise.resolve().then(() => presenceSock.sendPresenceUpdate("paused", replyTargetJid)),
          delay(600)
        ]).catch(() => {
        });
      }
    }
    if (sendSucceeded) {
      recordCustomerTurn(scopeId, senderPhone, "assistant", replyText);
      recordSessionMessageActivity(dbSession?.id || sessionId);
      markIncomingMessagesHandled(allWamIds, sessionId, msgTsMs);
      recordChatReplyWatermark(sessionId, {
        cleanPhone: cleanSender,
        remoteJid,
        timestampMs: Math.max(Date.now(), msgTsMs)
      });
      if (sessionUser) {
        const msgDeduct = deductUserDailyQuota(sessionUser.id);
        if (isAi) {
          const aiDeduct = deductUserAiQuota(sessionUser.id);
          console.log(
            `[Baileys Quota Deducted] AI User ${sessionUser.username}: Daily AI=${aiDeduct.remainingDaily}/${aiDeduct.dailyLimit}, Monthly AI=${aiDeduct.remainingMonthly}/${aiDeduct.monthlyLimit}`
          );
        } else {
          console.log(
            `[Baileys Quota Deducted] Msg User ${sessionUser.username}: Daily Msg=${msgDeduct.remaining}/${msgDeduct.dailyLimit}`
          );
        }
      }
    } else if (sendDroppedSocket) {
      if (!params.isRetryFromQueue) {
        upsertPendingMissedMessage({
          wam_id: primaryWamId,
          extra_wam_ids: params.extraWamIds,
          session_id: sessionId,
          user_id: resolvedOwnerId,
          sender_phone: senderPhone,
          sender_name: senderName,
          remote_jid: remoteJid,
          fallback_pn_jid: fallbackPnJid || void 0,
          message_body: messageText,
          has_media: hasMediaAttachment,
          message_ts_ms: msgTsMs,
          last_error: sendErrorDetail,
          nextRetryDelayMs: MISSED_RETRY_BACKOFF_MS[0]
        });
        addMessageLog({
          wam_id: primaryWamId,
          session_id: dbSession?.id || sessionId,
          user_id: sessionUserId,
          sender_phone: senderPhone,
          sender_name: senderName,
          message_body: messageText,
          direction: "incoming",
          status: "Gagal",
          error_detail: sendErrorDetail,
          ai_generated: isAi
        });
      }
      return { outcome: "retryable_fail", error: sendErrorDetail };
    }
  } else if (!aiRetryableFail) {
    markIncomingMessagesHandled(allWamIds, sessionId, msgTsMs);
  }
  if (orderPaidVerified && currentOrderFlow) {
    const paidSnapshot = completeAndConsumeVerifiedPaidOrder(scopeId, senderPhone);
    if (paidSnapshot) {
      const ownerTargetPhone = resolveOrderNotificationRecipientPhone(resolvedOwnerId) || currentActiveCatalog?.orderNotifyPhone || "";
      if (ownerTargetPhone) {
        const ownerNotifyMsg = formatOwnerOrderNotificationMessage({
          snapshot: paidSnapshot,
          shopName: currentActiveCatalog?.shopName,
          customerPhone: senderPhone,
          customerName: senderName,
          customerNote: rawMessageText,
          hasMediaAttachment
        });
        await sendOrQueueViaSuperadminWa({
          recipientPhone: ownerTargetPhone,
          message: ownerNotifyMsg,
          category: "order_notification",
          ownerUserId: resolvedOwnerId,
          invoiceNumber: paidSnapshot.invoiceNumber
        }).catch((err) => console.warn("[Order Owner Notify Error]", err?.message || err));
      } else {
        console.warn(
          `[Order Owner Notify] Nomor tujuan pemilik usaha belum tersedia untuk user ${resolvedOwnerId} (Invoice ${paidSnapshot.invoiceNumber}).`
        );
      }
    }
  }
  const combinedErrorDetail = [aiDiagnosticReason, sendErrorDetail].filter(Boolean).join(" | ") || void 0;
  if (!params.isRetryFromQueue || sendSucceeded || !aiRetryableFail) {
    addMessageLog({
      wam_id: primaryWamId,
      session_id: dbSession?.id || sessionId,
      user_id: sessionUserId,
      sender_phone: senderPhone,
      sender_name: senderName,
      message_body: messageText,
      direction: "incoming",
      status: replyText ? sendSucceeded ? "Sukses" : "Gagal" : aiDiagnosticReason ? "Gagal" : "Diterima",
      reply_body: replyText || void 0,
      error_detail: combinedErrorDetail,
      ai_generated: isAi
    });
  }
  if (replyText && sendSucceeded) {
    return { outcome: "sent" };
  }
  if (!replyText && aiRetryableFail) {
    return { outcome: "retryable_fail", error: combinedErrorDetail };
  }
  return { outcome: "received_no_reply", error: combinedErrorDetail };
}
async function processPendingMissedMessagesForSession(sessionId, reason = "watchdog") {
  if (!sessionId || missedCatchupLocks.has(sessionId)) return 0;
  const mem = activeSessions.get(sessionId);
  if (!mem || mem.status !== "connected" || !isSocketTrulyOpen(mem.socket)) {
    return 0;
  }
  const owner = resolveActiveVerifiedOwner(sessionId, mem.userId, mem.phoneNumber || void 0);
  if (!isOwnerActiveAndRegistered(owner)) {
    return 0;
  }
  const queue = getPendingMissedMessages(sessionId);
  if (queue.length === 0) return 0;
  missedCatchupLocks.add(sessionId);
  let recoveredCount = 0;
  try {
    const now = Date.now();
    const batch = queue.filter((item) => (item.next_retry_at || 0) <= now).slice(0, 8);
    if (batch.length > 0) {
      console.log(
        `[Baileys Missed Catch-Up:${reason}] Memeriksa ${batch.length} pesan tertunda untuk sesi ${sessionId}...`
      );
    }
    for (const item of batch) {
      const latestMem = activeSessions.get(sessionId);
      if (!latestMem || latestMem.status !== "connected" || !isSocketTrulyOpen(latestMem.socket)) {
        break;
      }
      if (item.user_id !== owner.id) {
        removePendingMissedMessage(item.id);
        continue;
      }
      const watermarkTs = getChatReplyWatermark(sessionId, item.sender_phone, item.remote_jid);
      if (hasIncomingMessageBeenHandled(item.wam_id, sessionId) || watermarkTs > 0 && item.message_ts_ms <= watermarkTs) {
        markIncomingMessagesHandled([item.wam_id, ...item.extra_wam_ids || []], sessionId, item.message_ts_ms);
        removePendingMissedMessage(item.id);
        continue;
      }
      const res = await new Promise((resolve) => {
        enqueueIncomingChatTask(`${sessionId}:${item.remote_jid}`, async () => {
          const outcome = await processIncomingCustomerMessage({
            sock: latestMem.socket,
            sessionId,
            sessionData: latestMem,
            msgKey: {
              id: item.wam_id,
              remoteJid: item.remote_jid,
              fromMe: false
            },
            remoteJid: item.remote_jid,
            fallbackPnJid: item.fallback_pn_jid || null,
            senderPhone: item.sender_phone,
            cleanSender: item.sender_phone.replace(/\D/g, ""),
            senderName: item.sender_name || "Pengguna WhatsApp",
            messageText: item.message_body,
            rawMessageText: item.message_body,
            hasMediaAttachment: Boolean(item.has_media),
            msgTsMs: item.message_ts_ms,
            extraWamIds: item.extra_wam_ids,
            isCatchup: true,
            isRetryFromQueue: true
          });
          resolve(outcome);
        });
      });
      if (res.outcome === "sent") {
        recoveredCount++;
        removePendingMissedMessage(item.id);
      } else if (res.outcome === "permanent_skip" || res.outcome === "received_no_reply") {
        removePendingMissedMessage(item.id);
      } else {
        const nextAttempts = (item.attempts || 0) + 1;
        if (nextAttempts >= MAX_MISSED_RETRY_ATTEMPTS) {
          removePendingMissedMessage(item.id);
          markIncomingMessagesHandled([item.wam_id, ...item.extra_wam_ids || []], sessionId, item.message_ts_ms);
          addMessageLog({
            wam_id: item.wam_id,
            session_id: sessionId,
            user_id: item.user_id,
            sender_phone: item.sender_phone,
            sender_name: item.sender_name,
            message_body: item.message_body,
            direction: "incoming",
            status: "Gagal",
            error_detail: res.error || "Batas percobaan ulang catch-up Meta AI tercapai",
            ai_generated: false
          });
        } else {
          const backoffMs = MISSED_RETRY_BACKOFF_MS[Math.min(nextAttempts - 1, MISSED_RETRY_BACKOFF_MS.length - 1)];
          updatePendingMissedMessage(item.id, {
            attempts: nextAttempts,
            next_retry_at: Date.now() + backoffMs,
            last_error: res.error
          });
        }
      }
      if (batch.length > 1) {
        await delay(500);
      }
    }
  } finally {
    missedCatchupLocks.delete(sessionId);
  }
  return recoveredCount;
}
function attachSocketMessageListener(sock, sessionId, sessionData) {
  sessionData.detachRawHandlers?.();
  sessionData.detachRawHandlers = attachMetaAiRawSocketHandlers(sock, sessionId);
  sock.ev.on("messages.update", (updates) => {
    if (sessionData.superseded) return;
    sessionData.lastUpdated = Date.now();
    try {
      handleMetaAiIncomingUpdate(sessionId, updates);
    } catch (err) {
      console.warn("[Baileys Meta AI Update Error]", err);
    }
  });
  const handleSingleIncomingMessage = async (mType, msg) => {
    if (sessionData.superseded || !msg?.message) return;
    sessionData.lastUpdated = Date.now();
    if (msg.key?.id) {
      rememberProtoMessage(msg.key, msg.message);
    }
    const remoteJid = msg.key?.remoteJid || msg.message?.deviceSentMessage?.destinationJid;
    if (!remoteJid) return;
    if (handleMetaAiIncomingUpsert(sessionId, msg)) {
      return;
    }
    if (remoteJid.endsWith("@g.us") || remoteJid === "status@broadcast" || remoteJid.endsWith("@broadcast") || remoteJid.endsWith("@newsletter")) {
      return;
    }
    const msgId = msg.key?.id;
    if (msgId && (processedMessageIds.has(msgId) || hasIncomingMessageBeenHandled(msgId, sessionId))) {
      return;
    }
    const msgTsMs = extractMessageTimestampMs(msg);
    const nowMs = Date.now();
    const isOldAppendCatchup = mType === "append" && nowMs - msgTsMs > 45e3;
    if (isOldAppendCatchup) {
      const dbSess = getSessionById(sessionId);
      const baselineMs = dbSess?.connected_at ? Date.parse(dbSess.connected_at) : sessionData.openedAt || nowMs;
      const floorMs = Math.max(
        (Number.isFinite(baselineMs) && baselineMs > 0 ? baselineMs : nowMs) - 12e4,
        nowMs - OFFLINE_CATCHUP_MAX_AGE_MS
      );
      if (msgTsMs < floorMs || msgTsMs > nowMs + 12e4) {
        if (msgId) markIncomingMessagesHandled([msgId], sessionId, msgTsMs);
        return;
      }
    }
    const { rawMessageText, hasMediaAttachment } = unwrapIncomingMessageText(msg);
    cleanupExpiredCommandStates();
    let identity = resolveIncomingSenderIdentity(sock, msg, remoteJid);
    let lidMappedPeerPhone = "";
    if (identity.isLidThread && typeof sock?.signalRepository?.lidMapping?.getPNForLID === "function") {
      try {
        const mappedPn = await Promise.race([
          sock.signalRepository.lidMapping.getPNForLID(remoteJid),
          new Promise((resolve) => setTimeout(() => resolve(null), 1500))
        ]);
        if (typeof mappedPn === "string" && mappedPn.trim()) {
          const cleanMapped = mappedPn.trim().replace(/@.*/, "").split(":")[0];
          const normMapped = normalizePhoneNumber(cleanMapped) || cleanMapped.replace(/\D/g, "");
          if (normMapped.length >= 8) {
            lidMappedPeerPhone = normMapped;
            if (!identity.fallbackPnJid) {
              identity = {
                senderPhone: normMapped,
                cleanSender: normMapped,
                rawRemoteDigits: identity.rawRemoteDigits,
                isLidThread: true,
                fallbackPnJid: `${normMapped}@s.whatsapp.net`
              };
            }
          }
        }
      } catch {
      }
    }
    const { senderPhone, cleanSender, isLidThread, fallbackPnJid } = identity;
    const db = initDbFile();
    const dbSession = getSessionById(sessionId);
    const selfCheck = evaluateSelfOrBotMessage({
      sock,
      sessionId,
      sessionData,
      dbSession,
      msg,
      resolvedTargetPhone: cleanSender || senderPhone,
      lidMappedPeerPhone: lidMappedPeerPhone || void 0,
      rawMessageText
    });
    if (selfCheck.isBotEcho) {
      if (msgId) {
        markIncomingMessagesHandled([msgId], sessionId, msgTsMs);
        rememberProcessedMsgId(msgId);
      }
      console.log(
        `[Baileys Anti-Echo] Discarding reflected message (${selfCheck.reason}) from bot output: "${(rawMessageText || msgId || "").substring(0, 30)}..."`
      );
      return;
    }
    if (selfCheck.isFromSelfOrBot && !selfCheck.isSelfChatTarget) {
      if (msgId) {
        markIncomingMessagesHandled([msgId], sessionId, msgTsMs);
        rememberProcessedMsgId(msgId);
      }
      const { selfPhones } = collectSessionSelfIdentifiers({
        sock,
        sessionId,
        sessionData,
        dbSession
      });
      const safeWatermarkPhone = lidMappedPeerPhone || (cleanSender && (!isLidThread || !selfPhones.has(cleanSender)) ? cleanSender : "");
      recordChatReplyWatermark(sessionId, {
        cleanPhone: safeWatermarkPhone,
        remoteJid,
        timestampMs: msgTsMs
      });
      recordOwnerManualReplyWatermark(sessionId, {
        cleanPhone: safeWatermarkPhone,
        remoteJid,
        timestampMs: msgTsMs
      });
      if (!isOldAppendCatchup) {
        console.log(
          `[Baileys Self-Reply Guard] Abaikan balasan manual perangkat sendiri (${selfCheck.reason}) ke ${safeWatermarkPhone || remoteJid}; tidak diteruskan ke Meta AI.`
        );
      }
      return;
    }
    if (!rawMessageText && (!hasMediaAttachment || selfCheck.isFromSelfOrBot)) {
      return;
    }
    const messageText = rawMessageText || "[Pelanggan mengirim lampiran gambar/dokumen bukti pembayaran]";
    const replyTargetJid = remoteJid;
    const senderName = msg.pushName || "Pengguna WhatsApp";
    const trimmedMsg = messageText.trim();
    const stateKey = `${sessionId}:${remoteJid}`;
    const hasActiveDialog = commandState.has(stateKey) || commandState.has(senderPhone) || commandState.has(remoteJid);
    const isSlashCommand = trimmedMsg.startsWith("/");
    if (selfCheck.isFromSelfOrBot && selfCheck.isSelfChatTarget && (!isSlashCommand && !hasActiveDialog)) {
      if (msgId) {
        markIncomingMessagesHandled([msgId], sessionId, msgTsMs);
        rememberProcessedMsgId(msgId);
      }
      return;
    }
    const sockPhone = normalizePhoneNumber(
      sock.user?.id ? sock.user.id.split("@")[0].split(":")[0] : ""
    );
    const isSelf = selfCheck.isFromSelfOrBot;
    if (isOldAppendCatchup) {
      if (isSelf || isSlashCommand || hasActiveDialog) {
        if (msgId) markIncomingMessagesHandled([msgId], sessionId, msgTsMs);
        return;
      }
      const watermarkTs = getChatReplyWatermark(sessionId, cleanSender, remoteJid);
      if (watermarkTs > 0 && msgTsMs <= watermarkTs) {
        if (msgId) markIncomingMessagesHandled([msgId], sessionId, msgTsMs);
        return;
      }
      if (msgId) rememberProcessedMsgId(msgId);
      const bufKey = `${sessionId}:${remoteJid}`;
      const existingBuf = offlineCatchupBuffers.get(bufKey);
      if (existingBuf) {
        clearTimeout(existingBuf.timer);
        if (existingBuf.texts.length < 6) {
          existingBuf.texts.push(messageText);
        }
        if (msgId && existingBuf.wamIds.length < 12 && !existingBuf.wamIds.includes(msgId)) {
          existingBuf.wamIds.push(msgId);
        }
        existingBuf.hasMedia = existingBuf.hasMedia || hasMediaAttachment;
        existingBuf.latestTsMs = Math.max(existingBuf.latestTsMs, msgTsMs);
        existingBuf.msgKey = msg.key;
        existingBuf.timer = setTimeout(() => {
          const flushed = offlineCatchupBuffers.get(bufKey);
          offlineCatchupBuffers.delete(bufKey);
          if (!flushed) return;
          const combinedText = flushed.texts.join("\n").slice(0, 1400);
          const primaryId = flushed.wamIds[0] || flushed.msgKey?.id || `catchup_${Date.now()}`;
          const extraIds = flushed.wamIds.slice(1);
          enqueueIncomingChatTask(bufKey, async () => {
            await processIncomingCustomerMessage({
              sock: flushed.sock,
              sessionId: flushed.sessionId,
              sessionData: flushed.sessionData,
              msgKey: { ...flushed.msgKey, id: primaryId },
              remoteJid: flushed.remoteJid,
              fallbackPnJid: flushed.fallbackPnJid,
              senderPhone: flushed.senderPhone,
              cleanSender: flushed.cleanSender,
              senderName: flushed.senderName,
              messageText: combinedText,
              rawMessageText: combinedText,
              hasMediaAttachment: flushed.hasMedia,
              msgTsMs: flushed.latestTsMs,
              extraWamIds: extraIds,
              isCatchup: true,
              isRetryFromQueue: false
            });
          });
        }, OFFLINE_CATCHUP_COALESCE_MS);
        existingBuf.timer.unref?.();
        return;
      }
      const timer = setTimeout(() => {
        const flushed = offlineCatchupBuffers.get(bufKey);
        offlineCatchupBuffers.delete(bufKey);
        if (!flushed) return;
        const combinedText = flushed.texts.join("\n").slice(0, 1400);
        const primaryId = flushed.wamIds[0] || flushed.msgKey?.id || `catchup_${Date.now()}`;
        const extraIds = flushed.wamIds.slice(1);
        enqueueIncomingChatTask(bufKey, async () => {
          await processIncomingCustomerMessage({
            sock: flushed.sock,
            sessionId: flushed.sessionId,
            sessionData: flushed.sessionData,
            msgKey: { ...flushed.msgKey, id: primaryId },
            remoteJid: flushed.remoteJid,
            fallbackPnJid: flushed.fallbackPnJid,
            senderPhone: flushed.senderPhone,
            cleanSender: flushed.cleanSender,
            senderName: flushed.senderName,
            messageText: combinedText,
            rawMessageText: combinedText,
            hasMediaAttachment: flushed.hasMedia,
            msgTsMs: flushed.latestTsMs,
            extraWamIds: extraIds,
            isCatchup: true,
            isRetryFromQueue: false
          });
        });
      }, OFFLINE_CATCHUP_COALESCE_MS);
      timer.unref?.();
      offlineCatchupBuffers.set(bufKey, {
        timer,
        sessionId,
        sock,
        sessionData,
        remoteJid,
        fallbackPnJid,
        senderPhone,
        cleanSender,
        senderName,
        msgKey: msg.key,
        texts: [messageText],
        wamIds: msgId ? [msgId] : [],
        hasMedia: hasMediaAttachment,
        latestTsMs: msgTsMs
      });
      return;
    }
    rememberProcessedMsgId(msgId);
    console.log(
      `[Baileys Incoming] Session=${sessionId} From=${senderPhone} (${senderName}) jid=${remoteJid} fromMe=${Boolean(msg.key.fromMe)} media=${hasMediaAttachment}: "${messageText}"`
    );
    const matchedSessionBySender = db.sessions.find((s) => {
      if (!s.phone_number || !cleanSender) return false;
      const sp = normalizePhoneNumber(s.phone_number);
      return sp.length >= 8 && sp === cleanSender;
    });
    const user = db.users.find((u) => {
      if (!u.phone || !cleanSender) return false;
      const p = normalizePhoneNumber(u.phone);
      return p.length >= 8 && p === cleanSender;
    }) || (matchedSessionBySender?.user_id ? getUserById(matchedSessionBySender.user_id) : null) || (sessionData.userId ? getUserById(sessionData.userId) : null);
    const isOwner = Boolean(
      user?.phone && cleanSender && normalizePhoneNumber(user.phone) === cleanSender
    );
    const isAllowed = Boolean(
      user?.allowed_numbers && cleanSender && user.allowed_numbers.some((n) => {
        const norm = normalizePhoneNumber(n);
        return norm.length >= 8 && norm === cleanSender;
      })
    );
    if ((isSlashCommand || hasActiveDialog) && (selfCheck.isSelfChatTarget || !isSelf && (isOwner || isAllowed))) {
      const clearSenderDialogState = () => {
        commandState.delete(stateKey);
        commandState.delete(senderPhone);
        commandState.delete(remoteJid);
      };
      const sendCommandReply = async (replyBody) => {
        recordBotOutgoing(replyBody);
        await sendSocketMessageWithAckGuard(
          sock,
          replyTargetJid,
          { text: replyBody },
          { timeoutMs: 18e3, fallbackJid: fallbackPnJid, sessionData }
        );
      };
      const resolveOutboundSocket = () => {
        if (user) {
          const userSessions = Array.from(activeSessions.values()).filter(
            (s) => s.userId === user.id && s.status === "connected" && s.socket && isSocketTrulyOpen(s.socket)
          );
          const primaryUserSession = userSessions.find((s) => s.is_primary) || userSessions[0];
          if (primaryUserSession?.socket) return primaryUserSession.socket;
        }
        return sock;
      };
      const executeSendOrBroadcastTasks = async (tasks) => {
        const sockToUse = resolveOutboundSocket();
        if (tasks.length === 1) {
          const { targetPhone, messageToSend } = tasks[0];
          if (user) {
            const quota = deductUserDailyQuota(user.id);
            if (!quota.allowed) {
              const quotaMsg = `\u274C *Gagal Kirim:* ${quota.message || "Batas kuota harian Anda telah habis."}`;
              await sendCommandReply(quotaMsg);
              return;
            }
          }
          const cleanTarget = normalizePhoneNumber(targetPhone);
          const targetJid = `${cleanTarget}@s.whatsapp.net`;
          try {
            recordBotOutgoing(messageToSend);
            await sendSocketMessageWithAckGuard(
              sockToUse,
              targetJid,
              { text: messageToSend },
              { timeoutMs: 22e3, sessionData }
            );
            addMessageLog({
              wam_id: `cmd_out_${Date.now()}`,
              session_id: sessionId,
              user_id: user?.id || sessionData.userId,
              sender_phone: cleanTarget,
              sender_name: `Tujuan (${cleanTarget})`,
              message_body: messageToSend,
              direction: "outgoing",
              status: "Sukses",
              reply_body: "Dikirim via Remote WhatsApp Command (/send)"
            });
            const successReply = `\u2705 *Pesan Berhasil Terkirim!*

\u2022 Nomor Tujuan: *${cleanTarget}*
\u2022 Isi Pesan: "${messageToSend}"
\u2022 Via Gateway: *${sessionData.phoneNumber || sockPhone || "Japriin"}*`;
            await sendCommandReply(successReply);
          } catch (sendErr) {
            const errMsg = `\u274C *Gagal mengirim pesan ke ${cleanTarget}:* ${sendErr?.message || "Error koneksi gateway"}`;
            await sendCommandReply(errMsg);
          }
          return;
        }
        const startNotice = `\u23F3 *Memproses Broadcast ke ${tasks.length} Nomor...*
Mohon tunggu, pesan sedang dikirim bertahap dengan proteksi Anti-Ban Guard.`;
        await sendCommandReply(startNotice);
        let successCount = 0;
        let failedCount = 0;
        const successPhones = [];
        for (let i = 0; i < tasks.length; i++) {
          const { targetPhone, messageToSend } = tasks[i];
          const cleanTarget = normalizePhoneNumber(targetPhone);
          if (!cleanTarget || cleanTarget.length < 8) {
            failedCount++;
            continue;
          }
          if (user) {
            const quota = deductUserDailyQuota(user.id);
            if (!quota.allowed) {
              failedCount++;
              continue;
            }
          }
          const targetJid = `${cleanTarget}@s.whatsapp.net`;
          try {
            recordBotOutgoing(messageToSend);
            await sendSocketMessageWithAckGuard(
              sockToUse,
              targetJid,
              { text: messageToSend },
              { timeoutMs: 22e3, sessionData }
            );
            successCount++;
            successPhones.push(cleanTarget);
            addMessageLog({
              wam_id: `bc_cmd_${Date.now()}_${i}`,
              session_id: sessionId,
              user_id: user?.id || sessionData.userId,
              sender_phone: cleanTarget,
              sender_name: `Broadcast (${cleanTarget})`,
              message_body: messageToSend,
              direction: "outgoing",
              status: "Sukses",
              reply_body: "Dikirim via Broadcast WhatsApp (/broadcast)"
            });
          } catch (err) {
            failedCount++;
            addMessageLog({
              wam_id: `bc_fail_${Date.now()}_${i}`,
              session_id: sessionId,
              user_id: user?.id || sessionData.userId,
              sender_phone: cleanTarget,
              sender_name: `Broadcast (${cleanTarget})`,
              message_body: messageToSend,
              direction: "outgoing",
              status: "Gagal",
              error_detail: err?.message || "Gagal kirim broadcast"
            });
          }
          if (i < tasks.length - 1) {
            await delay(1e3 + Math.floor(Math.random() * 800));
          }
        }
        addBroadcastHistory({
          user_id: user?.id || sessionData.userId,
          session_id: sessionId,
          recipients_count: tasks.length,
          message: tasks[0]?.messageToSend || "Broadcast Multi-Pesan",
          status: failedCount === tasks.length ? "failed" : "completed",
          success_count: successCount,
          failed_count: failedCount
        });
        const summaryReply = `\u2705 *Broadcast Selesai Diproses!*

\u2022 Total Tujuan: *${tasks.length} Nomor*
\u2022 Berhasil Terkirim: *${successCount} Nomor*
\u2022 Gagal: *${failedCount} Nomor*
` + (successPhones.length > 0 ? `\u2022 Penerima: *${successPhones.slice(0, 6).join(", ")}${successPhones.length > 6 ? ` (+${successPhones.length - 6} lainnya)` : ""}*
` : "") + `\u2022 Via Gateway: *${sessionData.phoneNumber || sockPhone || "Japriin"}*
\u2022 Log Retensi: *Otomatis dihapus setelah 7 hari*`;
        await sendCommandReply(summaryReply);
      };
      if (isSlashCommand) {
        const parts = trimmedMsg.split(/\s+/);
        const cmd = parts[0].toLowerCase();
        if (cmd === "/batal" || cmd === "/cancel") {
          clearSenderDialogState();
          await sendCommandReply(`\u2713 *Perintah interaktif telah dibatalkan.*`);
          return;
        }
        if (cmd === "/status" || cmd === "/saldo" || cmd === "/kuota" || cmd === "/cekkuota" || cmd === "/statusbot") {
          const u = user || (sessionData.userId ? getUserById(sessionData.userId) : null);
          const plan = db.plans.find((p) => p.id === u?.plan_id) || db.plans[0];
          const usedToday = u?.daily_messages_sent || 0;
          const remainingToday = Math.max(0, (plan?.daily_msg_limit || 100) - usedToday);
          const statusReply = `\u{1F4CA} *Status Japriin Gateway*

\u2022 Akun: *${u?.name || "Operator"}* (@${u?.username || "user"})
\u2022 Paket: *${plan?.name || "Pro"}*
\u2022 Nomor Gateway: *${sessionData.phoneNumber || sockPhone || "Terhubung"}*
\u2022 Sisa Kuota Hari Ini: *${remainingToday} / ${plan?.daily_msg_limit || 100} pesan*
\u2022 Status Gateway: *TERHUBUNG (Anti-Ban Guard Aktif)*

_Ketik */send* untuk mengirim pesan ke nomor tujuan._`;
          await sendCommandReply(statusReply);
          return;
        }
        if (cmd === "/help" || cmd === "/bantuan" || cmd === "/menu") {
          const helpReply = `\u{1F916} *Panduan Japriin Remote Command Bridge*

Anda dapat mengirim pesan dari Nomor Sistem maupun Nomor Sendiri dengan perintah berikut:

1\uFE0F\u20E3 */send*
   Membuka template interaktif kirim pesan.

2\uFE0F\u20E3 */send <nomor_tujuan> <isi_pesan>*
   Kirim pesan langsung dalam 1 langkah.
   _Contoh: /send 08123456789 Halo kak, pesanan sudah dikirim._

3\uFE0F\u20E3 */status* atau */kuota*
   Cek sisa kuota harian & status koneksi bot.

4\uFE0F\u20E3 */batal*
   Batalkan dialog kirim pesan yang sedang aktif.

\u{1F4A1} _Standar Anti-Loop: Chat biasa tanpa awalan / ke nomor sendiri otomatis diabaikan agar tidak memicu balasan berulang (looping)._`;
          await sendCommandReply(helpReply);
          return;
        }
        if (cmd === "/send" || cmd === "/broadcast" || cmd === "/kirim" || cmd === "/kirimpesan") {
          const fullArgs = trimmedMsg.substring(cmd.length).trim();
          const tasks = parseSendOrBroadcastTasks(fullArgs);
          if (tasks.length > 0) {
            clearSenderDialogState();
            await executeSendOrBroadcastTasks(tasks);
            return;
          }
          const nowTs = Date.now();
          commandState.set(stateKey, { step: "awaiting_direct_target", updatedAt: nowTs });
          commandState.set(senderPhone, { step: "awaiting_direct_target", updatedAt: nowTs });
          const promptMsg = `\u{1F4F1} *Template Kirim Pesan & Broadcast (Japriin Bridge)*

Silakan balas pesan ini dengan salah satu format berikut:

1\uFE0F\u20E3 *Kirim ke 1 Nomor:*
*08123456789 Halo kak, pesanan Anda sudah siap dikirim.*

2\uFE0F\u20E3 *Broadcast ke Banyak Nomor (1 Pesan Sama):*
*08123456789, 08198765432, 08571234567 Halo kak, promo spesial hari ini!*
_(Nomor juga bisa disusun per baris baru lalu diikuti isi pesan di bawahnya)_

3\uFE0F\u20E3 *Broadcast Banyak Pesan Berbeda (Per Baris):*
*08123456789 Halo kak Budi, pesanan siap*
*08198765432 Halo kak Ani, pesanan dikirim*

_Ketik */batal* untuk membatalkan pengiriman._`;
          await sendCommandReply(promptMsg);
          return;
        }
        const unknownCmdReply = `\u2139\uFE0F Perintah *${cmd}* tidak dikenali.

Gunakan perintah standar berikut:
\u2022 */send* \u2014 Template kirim pesan / broadcast
\u2022 */send <nomor> <pesan>* \u2014 Kirim pesan langsung
\u2022 */broadcast <nomor1>,<nomor2> <pesan>* \u2014 Broadcast banyak nomor
\u2022 */status* \u2014 Cek kuota & status gateway
\u2022 */help* \u2014 Panduan lengkap`;
        await sendCommandReply(unknownCmdReply);
        return;
      }
      const activeState = commandState.get(stateKey) || commandState.get(senderPhone) || commandState.get(remoteJid);
      if (activeState && activeState.step === "awaiting_direct_target") {
        const tasks = parseSendOrBroadcastTasks(trimmedMsg);
        if (tasks.length > 0) {
          clearSenderDialogState();
          await executeSendOrBroadcastTasks(tasks);
          return;
        }
        const helpFormat = `\u26A0\uFE0F *Format Pengiriman Belum Sesuai*

Silakan kirim dengan format:
\u{1F449} *<nomor_tujuan> <isi_pesan>*
\u{1F449} *<nomor1>, <nomor2>, <nomor3> <isi_pesan>*

Contoh:
*08123456789 Halo Kak, pesanan sudah dikirim*

_Atau ketik */batal* untuk keluar dari mode kirim pesan._`;
        await sendCommandReply(helpFormat);
        return;
      }
    }
    if (isSelf) {
      console.log(
        `[Baileys Self-Chat Ignored] Pesan dari perangkat sendiri (${senderPhone}) bukan perintah '/'. Dilewati.`
      );
      return;
    }
    await processIncomingCustomerMessage({
      sock,
      sessionId,
      sessionData,
      msgKey: msg.key,
      remoteJid,
      fallbackPnJid,
      senderPhone,
      cleanSender,
      senderName,
      messageText,
      rawMessageText,
      hasMediaAttachment,
      msgTsMs,
      isCatchup: false,
      isRetryFromQueue: false
    });
  };
  sock.ev.on("messages.upsert", (m) => {
    if (sessionData.superseded) return;
    try {
      if (m.type !== "notify" && m.type !== "append") return;
      const incomingList = Array.isArray(m.messages) ? m.messages : [];
      for (const msg of incomingList) {
        if (!msg?.message) continue;
        const jid = msg.key?.remoteJid || msg.message?.deviceSentMessage?.destinationJid;
        if (!jid || jid.endsWith("@g.us") || jid === "status@broadcast" || jid.endsWith("@broadcast") || jid.endsWith("@newsletter") || isMetaAiJid(jid)) {
          continue;
        }
        const id = resolveIncomingSenderIdentity(sock, msg, jid);
        const { rawMessageText } = unwrapIncomingMessageText(msg);
        const preSelfCheck = evaluateSelfOrBotMessage({
          sock,
          sessionId,
          sessionData,
          msg,
          resolvedTargetPhone: id.cleanSender || id.senderPhone,
          rawMessageText
        });
        if (!preSelfCheck.isFromSelfOrBot || preSelfCheck.isSelfChatTarget || preSelfCheck.isBotEcho) {
          continue;
        }
        const msgTs = extractMessageTimestampMs(msg);
        recordChatReplyWatermark(sessionId, {
          cleanPhone: id.cleanSender,
          remoteJid: jid,
          timestampMs: msgTs
        });
        recordOwnerManualReplyWatermark(sessionId, {
          cleanPhone: id.cleanSender,
          remoteJid: jid,
          timestampMs: msgTs
        });
      }
      for (const msg of incomingList) {
        const chatKeyJid = msg?.key?.remoteJid || msg?.message?.deviceSentMessage?.destinationJid || "default";
        enqueueIncomingChatTask(
          `${sessionId}:${chatKeyJid}`,
          () => handleSingleIncomingMessage(m.type, msg)
        );
      }
    } catch (err) {
      console.error("[Baileys Message Listener Error]", err);
    }
  });
}
function closeSocketSafelyWithoutLogout(sock, sessionData, sessionId, options) {
  if (sessionData) {
    sessionData.superseded = true;
    sessionData.closedByApp = true;
  }
  if (sessionData?.stabilityTimer) {
    clearTimeout(sessionData.stabilityTimer);
    sessionData.stabilityTimer = void 0;
  }
  if (sessionId) {
    if (options?.recordCloseMarker !== false) {
      recordLastCloseTimestamp(sessionId);
    }
    removeLocalRuntimeLease(sessionId, RUNTIME_INSTANCE_ID);
  }
  if (sock) {
    try {
      sock.ev?.removeAllListeners?.("connection.update");
      sock.ev?.removeAllListeners?.("creds.update");
      sock.ev?.removeAllListeners?.("messages.upsert");
      sock.ev?.removeAllListeners?.("messages.update");
      sock.end?.(void 0);
      try {
        sock.ws?.close?.();
      } catch {
      }
      if (!options?.deferWsListenerRemoval) {
        sock.ws?.removeAllListeners?.();
        try {
          sock.ws?.on?.("error", () => {
          });
        } catch {
        }
      }
    } catch {
    }
  }
  sessionData?.detachRawHandlers?.();
  if (sessionId) {
    clearMetaAiSession(sessionId);
  }
}
async function closeSocketAndWait(sock, sessionData, sessionId, waitMs = 2e3) {
  if (sessionData) {
    sessionData.superseded = true;
    sessionData.closedByApp = true;
  }
  const ws = sock?.ws;
  const rawSocket = ws?.socket;
  const needsWsWait = Boolean(
    ws && ws.isClosed !== true && (sessionData?.status === "connected" || isSocketTrulyOpen(sock) || isSocketConnecting(sock))
  );
  let wsClosePromise = null;
  if (needsWsWait && (typeof ws.once === "function" || typeof rawSocket?.once === "function")) {
    wsClosePromise = new Promise((resolve) => {
      let done = false;
      const finish = () => {
        if (done) return;
        done = true;
        resolve();
      };
      try {
        rawSocket?.once?.("close", finish);
        ws.once?.("close", finish);
      } catch {
        finish();
      }
      setTimeout(finish, waitMs);
    });
  }
  closeSocketSafelyWithoutLogout(sock, sessionData, sessionId, {
    deferWsListenerRemoval: Boolean(wsClosePromise)
  });
  if (wsClosePromise) {
    await wsClosePromise;
    try {
      ws?.removeAllListeners?.();
      ws?.on?.("error", () => {
      });
    } catch {
    }
    await delay(350);
  } else if (needsWsWait) {
    await delay(750);
  }
}
function cleanupDuplicateSessionsForOwnerPhone(keepSessionId, ownerUserId, cleanPhone) {
  if (!keepSessionId || !cleanPhone || cleanPhone.length < 8) return;
  for (const [sid, mem] of Array.from(activeSessions.entries())) {
    if (sid === keepSessionId) continue;
    const memPhone = normalizePhoneNumber(mem.phoneNumber || getCredsPhoneOnDisk(sid) || "");
    const sameUser = !mem.userId || !ownerUserId || mem.userId === ownerUserId || isSessionOwnedByUserId(sid, ownerUserId);
    if (sameUser && memPhone === cleanPhone) {
      console.log(`[Baileys Dedup] Menutup socket duplikat "${sid}" untuk +${cleanPhone} (mempertahankan "${keepSessionId}").`);
      mem.superseded = true;
      mem.closedByApp = true;
      clearSessionTimers(sid);
      closeSocketSafelyWithoutLogout(mem.socket, mem, sid);
      activeSessions.delete(sid);
      sessionDisconnectDiagnostics.delete(sid);
      clearSessionConflictState(sid);
      cleanSessionFolder(sid);
      deleteBaileysAuthFromMysql(sid).catch(() => {
      });
    }
  }
  if (fs4.existsSync(AUTH_DIR)) {
    try {
      for (const folder of fs4.readdirSync(AUTH_DIR)) {
        if (folder === keepSessionId) continue;
        const folderPhone = getCredsPhoneOnDisk(folder);
        if (folderPhone !== cleanPhone) continue;
        const dbMeta = getSessionById(folder);
        const sameOwner = dbMeta?.user_id && dbMeta.user_id === ownerUserId || isSessionOwnedByUserId(folder, ownerUserId);
        if (sameOwner) {
          console.log(`[Baileys Dedup] Menghapus folder auth duplikat "${folder}" untuk +${cleanPhone}.`);
          clearSessionTimers(folder);
          sessionDisconnectDiagnostics.delete(folder);
          clearSessionConflictState(folder);
          cleanSessionFolder(folder);
          deleteBaileysAuthFromMysql(folder).catch(() => {
          });
        }
      }
    } catch {
    }
  }
}
function hasOtherActiveOrConnectingSocketForPhone(excludeSessionId, cleanPhone, ownerUserId) {
  if (!cleanPhone || cleanPhone.length < 8) return null;
  const now = Date.now();
  for (const [sid, mem] of activeSessions.entries()) {
    if (sid === excludeSessionId || mem.superseded) continue;
    const memPhone = normalizePhoneNumber(mem.phoneNumber || getCredsPhoneOnDisk(sid) || "");
    if (memPhone !== cleanPhone) continue;
    if (ownerUserId && mem.userId && mem.userId !== ownerUserId && !isSessionOwnedByUserId(sid, ownerUserId)) {
      continue;
    }
    const isConnected = mem.status === "connected" && isSocketTrulyOpen(mem.socket);
    const isConnecting = mem.status === "connecting" && (reconnectTimers.has(sid) || sessionStartLocks.has(sid) || mem.socket && (isSocketTrulyOpen(mem.socket) || isSocketConnecting(mem.socket)) && now - mem.lastUpdated < 6e4);
    if (isConnected || isConnecting) {
      return mem;
    }
  }
  return null;
}
async function closeCompetingSocketsForOwnerPhone(keepSessionId, cleanPhone, ownerUserId) {
  if (!cleanPhone || cleanPhone.length < 8) return;
  for (const [sid, mem] of Array.from(activeSessions.entries())) {
    if (sid === keepSessionId) continue;
    const memPhone = normalizePhoneNumber(mem.phoneNumber || getCredsPhoneOnDisk(sid) || "");
    if (memPhone !== cleanPhone) continue;
    const sameUser = !ownerUserId || !mem.userId || mem.userId === ownerUserId || isSessionOwnedByUserId(sid, ownerUserId);
    if (!sameUser) continue;
    clearSessionTimers(sid);
    await closeSocketAndWait(mem.socket, mem, sid, 2e3);
    if (activeSessions.get(sid) === mem) {
      activeSessions.delete(sid);
    }
    sessionDisconnectDiagnostics.delete(sid);
    clearSessionConflictState(sid);
  }
}
async function getOrStartBaileysSession(rawSessionId = "session_primary_default", phoneNumber, userId, options) {
  const sessionId = sanitizeSessionId(rawSessionId);
  if (isSelfKilledByIpRule) {
    if (options?.isAutoReconnect) {
      return {
        sessionId,
        userId,
        socket: null,
        qrCodeUrl: null,
        pairingCode: null,
        status: "disconnected",
        phoneNumber: phoneNumber || null,
        lastUpdated: Date.now(),
        handshakeStartedAt: Date.now(),
        retryCount: 0
      };
    }
    throw new Error(`Socket WhatsApp pada server ini telah dimatikan oleh aturan Admin (${selfKilledReason || "Kill IP"}).`);
  }
  const candidateUserForGuard = userId || getSessionById(sessionId)?.user_id;
  const ownerForGuard = candidateUserForGuard ? getUserById(candidateUserForGuard) : void 0;
  if (options?.assignedAppId) {
    const cleanTargetApp = normalizeAppId(options.assignedAppId);
    const existingMeta = getSessionById(sessionId);
    if (existingMeta && cleanTargetApp) {
      updateSession(sessionId, {
        assigned_app_id: cleanTargetApp,
        assigned_server_ip: void 0,
        assignment_status: existingMeta.assignment_status === "released" ? "pending" : existingMeta.assignment_status
      });
    }
  }
  const existing = activeSessions.get(sessionId);
  const dbSessForGuard = getSessionById(sessionId);
  if (existing && !existing.superseded && existing.status === "connected" && isSocketTrulyOpen(existing.socket)) {
    if (!options?.bypassNodeGuard && dbSessForGuard && !isSessionOwnedByCurrentAppNode(dbSessForGuard, void 0, ownerForGuard)) {
      await releaseLocalSocketForDelegation(sessionId).catch(() => {
      });
    } else {
      if (userId && !existing.userId) existing.userId = userId;
      return existing;
    }
  }
  const guardTarget = dbSessForGuard || {
    id: sessionId,
    user_id: candidateUserForGuard,
    assigned_app_id: options?.assignedAppId ? normalizeAppId(options.assignedAppId) || void 0 : void 0
  };
  if (!options?.bypassNodeGuard && !isSessionOwnedByCurrentAppNode(guardTarget, void 0, ownerForGuard)) {
    if (existing) {
      await releaseLocalSocketForDelegation(sessionId).catch(() => {
      });
    }
    return {
      sessionId,
      userId: candidateUserForGuard,
      socket: null,
      qrCodeUrl: null,
      pairingCode: null,
      status: dbSessForGuard?.status === "connected" ? "connected" : "disconnected",
      phoneNumber: phoneNumber || dbSessForGuard?.phone_number || null,
      lastUpdated: Date.now(),
      handshakeStartedAt: Date.now(),
      retryCount: 0
    };
  }
  if (options?.forceReconnect) {
    clearSessionConflictState(sessionId);
    sessionDisconnectDiagnostics.delete(sessionId);
  } else if (isSessionInConflictCooldown(sessionId)) {
    if (existing) {
      return existing;
    }
    const cooldownState = sessionConflictStates.get(sessionId);
    const pausedSnapshot = {
      sessionId,
      userId,
      socket: null,
      qrCodeUrl: null,
      pairingCode: null,
      status: "disconnected",
      phoneNumber: phoneNumber || getCredsPhoneOnDisk(sessionId) || null,
      lastUpdated: Date.now(),
      handshakeStartedAt: Date.now(),
      retryCount: cooldownState?.count || 0,
      consecutiveConflicts: cooldownState?.count || 0,
      conflictCooldownUntil: cooldownState?.cooldownUntil,
      disconnectedSince: cooldownState?.lastConflictAt || Date.now()
    };
    activeSessions.set(sessionId, pausedSnapshot);
    return pausedSnapshot;
  }
  const candidatePhone = normalizePhoneNumber(
    phoneNumber || existing?.phoneNumber || dbSessForGuard?.phone_number || getCredsPhoneOnDisk(sessionId) || ""
  );
  const candidateUserId = userId || existing?.userId || dbSessForGuard?.user_id;
  if (candidatePhone && !options?.forceReconnect) {
    const competing = hasOtherActiveOrConnectingSocketForPhone(sessionId, candidatePhone, candidateUserId);
    if (competing) {
      return competing;
    }
  }
  if (!options?.forceReconnect) {
    const siblingLease = findLiveLocalSiblingLease({
      sessionId,
      userId: candidateUserId,
      cleanPhone: candidatePhone
    });
    if (siblingLease) {
      sessionDisconnectDiagnostics.delete(sessionId);
      clearSessionConflictState(sessionId);
      const delegatedSnapshot = existing || {
        sessionId,
        userId: candidateUserId,
        socket: null,
        qrCodeUrl: null,
        pairingCode: null,
        status: siblingLease.status,
        phoneNumber: candidatePhone || siblingLease.phone_number || null,
        lastUpdated: Date.now(),
        handshakeStartedAt: siblingLease.started_at || Date.now(),
        retryCount: 0
      };
      return delegatedSnapshot;
    }
    const remoteLeaseCheck = await evaluateRemoteLeaseForSession({
      sessionId,
      userId: candidateUserId,
      cleanPhone: candidatePhone,
      assignedAppId: dbSessForGuard?.assigned_app_id
    });
    if ((remoteLeaseCheck.status === "same_domain_ip" || remoteLeaseCheck.status === "remote_cluster_node") && remoteLeaseCheck.lease) {
      sessionDisconnectDiagnostics.delete(sessionId);
      clearSessionConflictState(sessionId);
      const delegatedSnapshot = existing || {
        sessionId,
        userId: candidateUserId,
        socket: null,
        qrCodeUrl: null,
        pairingCode: null,
        status: "connected",
        phoneNumber: candidatePhone || remoteLeaseCheck.lease.phone_number || null,
        lastUpdated: Date.now(),
        handshakeStartedAt: remoteLeaseCheck.lease.connected_at || Date.now(),
        openedAt: remoteLeaseCheck.lease.connected_at || Date.now(),
        retryCount: 0
      };
      return delegatedSnapshot;
    }
    if (remoteLeaseCheck.status === "different_ip" && remoteLeaseCheck.lease) {
      const cooldownUntil = Date.now() + CONFLICT_COOLDOWN_MS;
      const detail = buildRemoteConflictDetailSync(
        remoteLeaseCheck.lease,
        sessionId,
        getSessionById(sessionId)?.session_name
      );
      detail.cooldown_until = new Date(cooldownUntil).toISOString();
      sessionConflictStates.set(sessionId, {
        count: MAX_AUTO_CONFLICT_RETRIES + 1,
        cooldownUntil,
        lastConflictAt: Date.now()
      });
      sessionConflictDetails.set(sessionId, detail);
      const pausedSnapshot = {
        sessionId,
        userId: candidateUserId,
        socket: null,
        qrCodeUrl: null,
        pairingCode: null,
        status: "disconnected",
        phoneNumber: candidatePhone || remoteLeaseCheck.lease.phone_number || null,
        lastUpdated: Date.now(),
        handshakeStartedAt: Date.now(),
        retryCount: MAX_AUTO_CONFLICT_RETRIES + 1,
        consecutiveConflicts: MAX_AUTO_CONFLICT_RETRIES + 1,
        conflictCooldownUntil: cooldownUntil,
        disconnectedSince: Date.now()
      };
      activeSessions.set(sessionId, pausedSnapshot);
      return pausedSnapshot;
    }
  }
  if (!options?.forceReconnect && !options?.isAutoReconnect && existing && !existing.superseded && existing.status === "connecting" && (reconnectTimers.has(sessionId) || sessionStartLocks.has(sessionId) || existing.socket && (isSocketTrulyOpen(existing.socket) || isSocketConnecting(existing.socket)) && Date.now() - existing.lastUpdated < 6e4)) {
    if (userId && !existing.userId) existing.userId = userId;
    return existing;
  }
  const inFlight = sessionStartLocks.get(sessionId);
  if (inFlight) {
    return inFlight;
  }
  const initPromise = (async () => {
    try {
      clearSessionTimers(sessionId);
      if (options?.forceReconnect && candidatePhone) {
        await closeCompetingSocketsForOwnerPhone(sessionId, candidatePhone, candidateUserId);
      }
      const current = activeSessions.get(sessionId);
      const preservedUserId = userId || current?.userId;
      const preservedPhone = phoneNumber || current?.phoneNumber || null;
      const prevRetries = options?.forceReconnect ? 0 : current?.retryCount || 0;
      const prevConflicts = options?.forceReconnect ? 0 : current?.consecutiveConflicts ?? sessionConflictStates.get(sessionId)?.count ?? 0;
      if (current) {
        current.superseded = true;
        current.closedByApp = true;
      }
      if (current && current.socket) {
        await closeSocketAndWait(current.socket, current, sessionId, 2e3);
      }
      if (activeSessions.get(sessionId) === current) {
        activeSessions.delete(sessionId);
      }
      await waitForHandoffCloseGraceIfNeeded(sessionId);
      const sessionFolder = safeSessionFolderPath(sessionId);
      if (!sessionFolder) {
        throw new Error("Folder sesi WhatsApp tidak valid.");
      }
      if (!fs4.existsSync(sessionFolder)) {
        fs4.mkdirSync(sessionFolder, { recursive: true, mode: 448 });
      }
      if (!hasRegisteredCredsOnDisk(sessionId)) {
        await hydrateSessionAuthFolderFromMysql(sessionId);
      } else {
        scheduleAuthFolderBackup(sessionId);
      }
      const { state, saveCreds } = await createResilientMultiFileAuthState(sessionId, sessionFolder);
      const cachedAuthState = buildCachedAuthState(sessionId, state);
      const cacheStores = getSessionCacheStores(sessionId);
      const version = await resolveBaileysVersion();
      const sock = makeWASocket(
        buildBaileysSocketConfig(version, BAILEYS_SILENT_LOGGER, cachedAuthState, cacheStores)
      );
      try {
        sock.ws?.on?.("error", () => {
        });
      } catch {
      }
      const sessionData = {
        sessionId,
        userId: preservedUserId,
        socket: sock,
        qrCodeUrl: null,
        pairingCode: null,
        status: "connecting",
        phoneNumber: preservedPhone,
        lastUpdated: Date.now(),
        handshakeStartedAt: current?.handshakeStartedAt || Date.now(),
        retryCount: prevRetries,
        consecutiveConflicts: prevConflicts,
        superseded: false,
        closedByApp: false
      };
      try {
        let lastPassiveFrameTouch = 0;
        sock.ws?.on?.("frame", () => {
          if (sessionData.superseded || sessionData.status !== "connected") return;
          const t = Date.now();
          if (t - lastPassiveFrameTouch >= 15e3) {
            lastPassiveFrameTouch = t;
            sessionData.lastUpdated = t;
          }
        });
      } catch {
      }
      activeSessions.set(sessionId, sessionData);
      writeLocalRuntimeLease(sessionId, {
        userId: preservedUserId,
        phoneNumber: preservedPhone || void 0,
        status: "connecting",
        startedAt: sessionData.handshakeStartedAt
      });
      let credsSaveQueue = Promise.resolve();
      sock.ev.on("creds.update", () => {
        if (sessionData.superseded) return;
        credsSaveQueue = credsSaveQueue.then(async () => {
          if (sessionData.superseded) return;
          try {
            await saveCreds();
            scheduleAuthFolderBackup(sessionId);
          } catch (saveErr) {
            console.warn("[Baileys] Error saving creds:", saveErr);
          }
        });
      });
      sock.ev.on("connection.update", async (update) => {
        if (sessionData.superseded) return;
        const { connection, lastDisconnect, qr } = update;
        if (qr) {
          try {
            const qrUrl = await QRCode.toDataURL(qr, { margin: 2, width: 300 });
            if (sessionData.superseded) return;
            sessionData.qrCodeUrl = qrUrl;
            sessionData.lastUpdated = Date.now();
            activeSessions.set(sessionId, sessionData);
          } catch (e) {
            console.error("[Baileys] Error generating QR data URL:", e);
          }
        }
        if (connection === "open") {
          if (sessionData.superseded) {
            closeSocketSafelyWithoutLogout(sock, sessionData, sessionId);
            return;
          }
          const rawSockUser = sock.user?.id ? sock.user.id.split("@")[0].split(":")[0] : "";
          const connectedUser = normalizePhoneNumber(rawSockUser || phoneNumber || sessionData.phoneNumber || "");
          if (!connectedUser || connectedUser.length < 8) {
            console.warn(`[Baileys] Connected session ${sessionId} missing valid phone identity; purging.`);
            await purgeBaileysSessionCompletely(sessionId);
            return;
          }
          const db = initDbFile();
          const owner = resolveActiveVerifiedOwner(sessionId, sessionData.userId, connectedUser);
          if (!isOwnerActiveAndRegistered(owner)) {
            console.warn(`[Baileys Security] Connected session ${sessionId} (${connectedUser}) has no active registered user in app. Purging immediately.`);
            await purgeBaileysSessionCompletely(sessionId, connectedUser);
            return;
          }
          console.log(`[Baileys] WhatsApp Connected successfully for session: ${sessionId} (Owner: ${owner.username})`);
          try {
            await credsSaveQueue;
            await saveCreds();
          } catch {
          }
          if (sessionData.superseded) {
            closeSocketSafelyWithoutLogout(sock, sessionData, sessionId);
            return;
          }
          const openAt = Date.now();
          sessionData.status = "connected";
          sessionData.phoneNumber = connectedUser;
          sessionData.qrCodeUrl = null;
          sessionData.pairingCode = null;
          sessionData.lastUpdated = openAt;
          sessionData.handshakeStartedAt = openAt;
          sessionData.openedAt = openAt;
          sessionData.disconnectedSince = void 0;
          sessionData.conflictCooldownUntil = void 0;
          sessionData.userId = owner.id;
          sessionData.is_primary = Boolean(getSessionById(sessionId)?.is_primary);
          clearSessionExpiryNotificationCooldown(sessionId, owner.id, connectedUser);
          sessionDisconnectDiagnostics.delete(sessionId);
          clearSessionConflictState(sessionId);
          cleanupDuplicateSessionsForOwnerPhone(sessionId, owner.id, connectedUser);
          activeSessions.set(sessionId, sessionData);
          scheduleAuthFolderBackup(sessionId);
          void publishActiveSessionLease(sessionData, true);
          if (sessionData.stabilityTimer) clearTimeout(sessionData.stabilityTimer);
          sessionData.stabilityTimer = setTimeout(() => {
            const latest = activeSessions.get(sessionId);
            if (latest === sessionData && !latest.superseded && latest.status === "connected" && isSocketTrulyOpen(latest.socket)) {
              latest.retryCount = 0;
              latest.consecutiveConflicts = 0;
              clearSessionConflictState(sessionId);
              sessionDisconnectDiagnostics.delete(sessionId);
            }
          }, STABLE_OPEN_THRESHOLD_MS);
          sessionData.stabilityTimer.unref?.();
          const isPairingMethod = Boolean(phoneNumber) || sessionId.includes("_pair_");
          const existingDb = getSessionById(sessionId) || db.sessions.find(
            (s) => s.user_id === owner.id && s.phone_number && normalizePhoneNumber(s.phone_number) === connectedUser
          );
          const expiryDate = new Date(Date.now() + 365 * 24 * 60 * 60 * 1e3).toISOString();
          const openNowIso = (/* @__PURE__ */ new Date()).toISOString();
          const currentAppId = getCurrentAppId();
          const displayAppId = getDisplayAppId();
          const resolvedIdNow = await resolveCurrentServerIdentity().catch(() => getCachedOrFallbackIdentity());
          const primaryServerIp = normalizeServerIpValue(extractPrimaryIp(resolvedIdNow.serverIp)) || collectAllLocalIpAddresses()[0] || "";
          const effectiveAssignedApp = normalizeAppId(existingDb?.assigned_app_id) || normalizeAppId(options?.assignedAppId) || normalizeAppId(owner?.assigned_app_id) || currentAppId;
          if (effectiveAssignedApp && effectiveAssignedApp !== currentAppId) {
            console.warn(
              `[Cluster Exclusivity] Sesi ${sessionId} (${connectedUser}) terhubung di ${currentAppId} padahal ditugaskan ke ${effectiveAssignedApp}. Melepas socket lokal agar hanya berjalan di ${effectiveAssignedApp}.`
            );
            if (existingDb) {
              updateSession(existingDb.id, {
                id: sessionId,
                status: "disconnected",
                phone_number: connectedUser,
                user_id: owner.id,
                assigned_app_id: effectiveAssignedApp,
                assigned_server_ip: void 0,
                connected_app_id: "",
                connected_server_ip: "",
                assignment_status: "delegated",
                assignment_error: `Dialihkan eksklusif ke APP_ID ${effectiveAssignedApp}`,
                last_assignment_at: openNowIso,
                expires_at: existingDb.expires_at || expiryDate
              });
            } else {
              addSession({
                id: sessionId,
                session_name: isPairingMethod ? `WA Pair - ${connectedUser}` : `WA - ${connectedUser}`,
                phone_number: connectedUser,
                auth_method: isPairingMethod ? "pairing_code" : "qr_code",
                status: "disconnected",
                user_id: owner.id,
                is_primary: true,
                assigned_app_id: effectiveAssignedApp,
                assignment_status: "delegated",
                assignment_error: `Dialihkan eksklusif ke APP_ID ${effectiveAssignedApp}`,
                last_assignment_at: openNowIso,
                connected_at: openNowIso,
                expires_at: expiryDate
              });
            }
            void updateSessionAssignmentInMysql(sessionId, {
              assigned_app_id: effectiveAssignedApp,
              assigned_server_ip: "",
              connected_app_id: "",
              connected_server_ip: "",
              assignment_status: "delegated",
              assignment_error: `Dialihkan eksklusif ke APP_ID ${effectiveAssignedApp}`,
              last_assignment_at: openNowIso,
              status: "disconnected"
            }).catch(() => {
            });
            await releaseLocalSocketForDelegation(sessionId).catch(() => {
            });
            return;
          }
          void deleteWaSessionConflictFromMysql(sessionId).catch(() => {
          });
          if (existingDb) {
            if (existingDb.id !== sessionId) {
              sessionDisconnectDiagnostics.delete(existingDb.id);
              clearSessionConflictState(existingDb.id);
              void deleteWaSessionConflictFromMysql(existingDb.id).catch(() => {
              });
            }
            const existingExpiryMs = existingDb.expires_at ? Date.parse(existingDb.expires_at) : 0;
            updateSession(existingDb.id, {
              id: sessionId,
              status: "connected",
              phone_number: connectedUser,
              user_id: owner.id,
              assigned_app_id: effectiveAssignedApp,
              assigned_server_ip: void 0,
              connected_app_id: displayAppId,
              connected_server_ip: primaryServerIp || void 0,
              failed_app_ids: [],
              assignment_status: "connected",
              assignment_error: "",
              last_assignment_at: openNowIso,
              connected_at: existingDb.connected_at || openNowIso,
              last_activity_at: openNowIso,
              expires_at: existingExpiryMs > Date.now() + 30 * 24 * 60 * 60 * 1e3 ? existingDb.expires_at : expiryDate
            });
          } else {
            addSession({
              id: sessionId,
              session_name: isPairingMethod ? `WA Pair - ${connectedUser}` : `WA - ${connectedUser}`,
              phone_number: connectedUser,
              auth_method: isPairingMethod ? "pairing_code" : "qr_code",
              status: "connected",
              user_id: owner.id,
              is_primary: true,
              assigned_app_id: effectiveAssignedApp,
              connected_app_id: displayAppId,
              connected_server_ip: primaryServerIp || void 0,
              failed_app_ids: [],
              assignment_status: "connected",
              assignment_error: "",
              last_assignment_at: openNowIso,
              connected_at: openNowIso,
              last_activity_at: openNowIso,
              expires_at: expiryDate
            });
          }
          void updateSessionAssignmentInMysql(sessionId, {
            assigned_app_id: effectiveAssignedApp,
            assigned_server_ip: "",
            connected_app_id: displayAppId,
            connected_server_ip: primaryServerIp || void 0,
            failed_app_ids: [],
            assignment_status: "connected",
            assignment_error: "",
            last_assignment_at: openNowIso,
            status: "connected"
          }).catch(() => {
          });
          void publishCurrentSocketRecord({ force: true }).catch(() => {
          });
          const warmTimer = setTimeout(() => {
            const latest = activeSessions.get(sessionId);
            if (latest === sessionData && !latest.superseded && latest.status === "connected" && isSocketTrulyOpen(latest.socket)) {
              void warmMetaAiSession(sessionId, sock);
              void processPendingMissedMessagesForSession(sessionId, "session_open");
            }
          }, 2200);
          warmTimer.unref?.();
          if (owner.role === "admin") {
            setTimeout(() => {
              drainSuperadminWaQueue("admin_session_open").catch(() => {
              });
              processPendingSessionExpiryAlerts("admin_session_open").catch(() => {
              });
            }, 2500);
          }
        } else if (connection === "close") {
          if (sessionData.stabilityTimer) {
            clearTimeout(sessionData.stabilityTimer);
            sessionData.stabilityTimer = void 0;
          }
          const latestBeforeClose = activeSessions.get(sessionId);
          if (sessionData.superseded || latestBeforeClose && latestBeforeClose !== sessionData && latestBeforeClose.socket && latestBeforeClose.socket !== sock) {
            return;
          }
          const statusCode = lastDisconnect?.error?.output?.statusCode;
          const disconnectErrMsg = lastDisconnect?.error?.message ? String((lastDisconnect?.error).message) : "";
          const isPermanentLogout = isPermanentLogoutCode(statusCode);
          const isRestartRequired = isRestartRequiredCode(statusCode);
          const isConflict440 = isConnectionReplacedCode(statusCode);
          const hasInMemRegistered = Boolean(sock.authState?.creds?.registered || sock.user?.id);
          if (hasInMemRegistered || isRestartRequired) {
            try {
              await credsSaveQueue;
              await saveCreds();
            } catch {
            }
          }
          const latestAfterSave = activeSessions.get(sessionId);
          if (sessionData.superseded || latestAfterSave && latestAfterSave !== sessionData && latestAfterSave.socket && latestAfterSave.socket !== sock) {
            return;
          }
          const existingMeta = getSessionById(sessionId);
          const isRegistered = hasRegisteredCredsOnDisk(sessionId) || hasInMemRegistered || Boolean(existingMeta?.connected_at);
          if (isRestartRequired) {
            console.log(
              `[Baileys] Handshake restart required (status ${statusCode ?? 515}, registered: ${isRegistered}) untuk ${sessionId}; menyambung ulang soket...`
            );
          } else if (isConflict440) {
            console.log(
              `[Baileys] Sesi ${sessionId} mengalami pergantian stream (status 440, registered: ${isRegistered}); mengevaluasi pemulihan otomatis...`
            );
          } else {
            console.log(
              `[Baileys] Connection closed for ${sessionId}. Status: ${statusCode}. Registered: ${isRegistered}. PermanentLogout: ${isPermanentLogout}${disconnectErrMsg ? `. Reason: ${disconnectErrMsg}` : ""}`
            );
          }
          try {
            sessionData.detachRawHandlers?.();
            sock.ev?.removeAllListeners?.("connection.update");
            sock.ev?.removeAllListeners?.("creds.update");
            sock.ev?.removeAllListeners?.("messages.upsert");
            sock.ev?.removeAllListeners?.("messages.update");
            sock.ws?.removeAllListeners?.();
            try {
              sock.ws?.on?.("error", () => {
              });
            } catch {
            }
          } catch {
          }
          recordLastCloseTimestamp(sessionId);
          removeLocalRuntimeLease(sessionId, RUNTIME_INSTANCE_ID);
          sessionData.qrCodeUrl = null;
          sessionData.pairingCode = null;
          sessionData.socket = null;
          if (isPermanentLogout) {
            sessionDisconnectDiagnostics.delete(sessionId);
            clearSessionConflictState(sessionId);
            console.warn(`[Baileys Auto-Purge] Sesi ${sessionId} logout permanen (status ${statusCode}). Menghapus kredensial & data sesi...`);
            const wasPreviouslyLinked = isRegistered || Boolean(sessionData.phoneNumber) || existingMeta?.status === "connected";
            if (wasPreviouslyLinked) {
              await notifyUserSessionExpired({
                sessionId,
                sessionName: existingMeta?.session_name,
                expiredPhone: sessionData.phoneNumber || existingMeta?.phone_number,
                userId: sessionData.userId || existingMeta?.user_id,
                reason: statusCode === DisconnectReason.loggedOut || statusCode === 401 ? "keluar / terputus dari Perangkat Tertaut di HP" : `terputus permanen (kode ${statusCode})`
              }).catch(() => {
              });
              const ownerLogout = sessionData.userId || existingMeta?.user_id ? getUserById(sessionData.userId || existingMeta?.user_id) : void 0;
              void sendTelegramAlert({
                title: "Perangkat WhatsApp Terputus / Logout Permanen",
                severity: "warn",
                dedupKey: `wa_logout_${sessionId}`,
                cooldownMs: 6e4,
                lines: [
                  `\u2022 Nomor WA: <code>+${escapeTelegramHtml(sessionData.phoneNumber || existingMeta?.phone_number || "-")}</code>`,
                  `\u2022 Sesi: ${escapeTelegramHtml(existingMeta?.session_name || sessionId)}`,
                  `\u2022 Pemilik: ${escapeTelegramHtml(ownerLogout ? `${ownerLogout.name} (@${ownerLogout.username})` : sessionData.userId || "-")}`,
                  `\u2022 APP_ID: <code>${escapeTelegramHtml(getDisplayAppId())}</code>`,
                  `\u2022 Kode Status: <code>${escapeTelegramHtml(String(statusCode ?? "-"))}</code>`
                ]
              }).catch(() => {
              });
            }
            await purgeBaileysSessionCompletely(sessionId, sessionData.phoneNumber || void 0);
            return;
          }
          if (!isRegistered && !isRestartRequired) {
            console.log(`[Baileys Auto-Purge] Sesi ${sessionId} belum terhubung/timeout (${statusCode}). Menghapus folder & cache sementara...`);
            await purgeBaileysSessionCompletely(sessionId, sessionData.phoneNumber || void 0);
            return;
          }
          const owner = resolveActiveVerifiedOwner(sessionId, sessionData.userId, sessionData.phoneNumber || getCredsPhoneOnDisk(sessionId));
          if (!isOwnerActiveAndRegistered(owner)) {
            console.warn(`[Baileys Auto-Purge] Pemilik sesi ${sessionId} tidak aktif/terdaftar lagi. Menghapus sesi...`);
            await purgeBaileysSessionCompletely(sessionId, sessionData.phoneNumber || void 0);
            return;
          }
          const cleanSockPhone = normalizePhoneNumber(sessionData.phoneNumber || getCredsPhoneOnDisk(sessionId) || "");
          const competingInProcess = isConflict440 && cleanSockPhone ? hasOtherActiveOrConnectingSocketForPhone(sessionId, cleanSockPhone, owner.id) : null;
          if (competingInProcess) {
            console.log(
              `[Baileys Dedup] Socket ${sessionId} mengalah kepada sesi aktif "${competingInProcess.sessionId}" untuk +${cleanSockPhone}; tanpa memicu peringatan konflik.`
            );
            clearSessionTimers(sessionId);
            clearMetaAiSession(sessionId);
            sessionDisconnectDiagnostics.delete(sessionId);
            clearSessionConflictState(sessionId);
            if (activeSessions.get(sessionId) === sessionData) {
              activeSessions.delete(sessionId);
            }
            return;
          }
          recordDisconnectDiagnostic(sessionId, statusCode, disconnectErrMsg);
          if (isConflict440) {
            const liveLocalSibling = findLiveLocalSiblingLease({
              sessionId,
              userId: owner.id,
              cleanPhone: cleanSockPhone
            });
            if (liveLocalSibling) {
              clearSessionTimers(sessionId);
              clearMetaAiSession(sessionId);
              sessionDisconnectDiagnostics.delete(sessionId);
              clearSessionConflictState(sessionId);
              if (activeSessions.get(sessionId) === sessionData) {
                activeSessions.delete(sessionId);
              }
              return;
            }
            const remoteLease440 = await evaluateRemoteLeaseForSession({
              sessionId,
              userId: owner.id,
              cleanPhone: cleanSockPhone,
              assignedAppId: existingMeta?.assigned_app_id,
              forceRefresh: true
            });
            if (remoteLease440.status === "same_domain_ip" || remoteLease440.status === "remote_cluster_node") {
              clearSessionTimers(sessionId);
              clearMetaAiSession(sessionId);
              sessionDisconnectDiagnostics.delete(sessionId);
              clearSessionConflictState(sessionId);
              if (activeSessions.get(sessionId) === sessionData) {
                activeSessions.delete(sessionId);
              }
              return;
            }
            const nowMs = Date.now();
            const nextConflictCount = (sessionConflictStates.get(sessionId)?.count || sessionData.consecutiveConflicts || 0) + 1;
            sessionData.consecutiveConflicts = nextConflictCount;
            sessionData.retryCount = Math.max((sessionData.retryCount || 0) + 1, nextConflictCount);
            const cooldownUntil = nowMs + CONFLICT_COOLDOWN_MS;
            const recordedCount = Math.max(nextConflictCount, MAX_AUTO_CONFLICT_RETRIES + 1);
            sessionConflictStates.set(sessionId, {
              count: recordedCount,
              cooldownUntil,
              lastConflictAt: nowMs
            });
            clearSessionTimers(sessionId);
            sessionData.status = "disconnected";
            sessionData.disconnectedSince = nowMs;
            sessionData.conflictCooldownUntil = cooldownUntil;
            sessionData.lastUpdated = nowMs;
            activeSessions.set(sessionId, sessionData);
            const cDetail = await captureAndStoreConflictDiagnostic({
              sessionId,
              ownerId: owner.id,
              cleanPhone: cleanSockPhone,
              sessionName: existingMeta?.session_name,
              disconnectErr: lastDisconnect?.error,
              disconnectErrMsg,
              cooldownUntil
            }).catch(() => null);
            if (cDetail?.source_type === "same_server") {
              clearSessionConflictState(sessionId);
              sessionDisconnectDiagnostics.delete(sessionId);
              if (activeSessions.get(sessionId) === sessionData) {
                activeSessions.delete(sessionId);
              }
              return;
            }
            if (remoteLease440.status === "different_ip" && remoteLease440.lease) {
              console.warn(
                `[Baileys Conflict Guard] Sesi ${sessionId} terdeteksi aktif di server lain (${remoteLease440.lease.domain || "-"} / IP ${remoteLease440.lease.server_ip || "-"}). Auto-reconnect dihentikan agar tidak bentrok.`
              );
              return;
            }
            console.warn(
              `[Baileys Conflict Guard] Sesi ${sessionId} mengalami konflik 440. Auto-reconnect tidak dipaksa agar sesi aktif tidak terganggu.${cDetail?.competing_ip ? ` Sumber lain: ${cDetail.competing_domain || "-"} (IP ${cDetail.competing_ip}).` : ""}`
            );
            void sendTelegramAlert({
              title: "Konflik Koneksi WhatsApp (440)",
              severity: "warn",
              dedupKey: `conflict_440_${sessionId}`,
              cooldownMs: 3e5,
              lines: [
                `\u2022 Nomor WA: <code>+${escapeTelegramHtml(cleanSockPhone || "-")}</code>`,
                `\u2022 Sesi: ${escapeTelegramHtml(existingMeta?.session_name || sessionId)}`,
                `\u2022 APP_ID Terdampak: <code>${escapeTelegramHtml(getDisplayAppId())}</code>`,
                cDetail?.competing_ip ? `\u2022 Sumber Lain: ${escapeTelegramHtml(cDetail.competing_domain || "-")} (IP <code>${escapeTelegramHtml(cDetail.competing_ip)}</code>)` : "\u2022 Sumber Lain: Kemungkinan stream / perangkat ganda (cooldown aktif)"
              ]
            }).catch(() => {
            });
            return;
          } else if (!isRestartRequired) {
            sessionData.retryCount = (sessionData.retryCount || 0) + 1;
          }
          if (!isRegistered && sessionData.retryCount > 5) {
            console.warn(`[Baileys Auto-Purge] Handshake baru ${sessionId} gagal berulang (${sessionData.retryCount}x) tanpa tertaut. Menghapus sesi sementara...`);
            await purgeBaileysSessionCompletely(sessionId, sessionData.phoneNumber || void 0);
            return;
          }
          sessionData.status = "connecting";
          sessionData.lastUpdated = Date.now();
          activeSessions.set(sessionId, sessionData);
          const reconnectDelay = computePersistentReconnectDelay(sessionData.retryCount, statusCode);
          if (isRestartRequired) {
            console.log(
              `[Baileys Persistent Reconnect] Melanjutkan handshake sesi ${sessionId} dalam ${Math.round(reconnectDelay)}ms...`
            );
          } else {
            console.log(
              `[Baileys Persistent Reconnect] Menghubungkan ulang sesi ${sessionId} dalam ${Math.round(reconnectDelay)}ms (percobaan ke-${sessionData.retryCount})...`
            );
          }
          clearSessionTimers(sessionId);
          const rTimer = setTimeout(async () => {
            reconnectTimers.delete(sessionId);
            if (sessionData.superseded) return;
            try {
              await credsSaveQueue;
            } catch {
            }
            if (sessionData.superseded) return;
            if (!resolveActiveVerifiedOwner(sessionId, sessionData.userId, sessionData.phoneNumber || getCredsPhoneOnDisk(sessionId))) {
              await purgeBaileysSessionCompletely(sessionId);
              return;
            }
            getOrStartBaileysSession(
              sessionId,
              phoneNumber || sessionData.phoneNumber || void 0,
              sessionData.userId,
              { isAutoReconnect: true }
            ).catch(() => {
            });
          }, reconnectDelay);
          rTimer.unref?.();
          reconnectTimers.set(sessionId, rTimer);
        }
      });
      attachSocketMessageListener(sock, sessionId, sessionData);
      return sessionData;
    } finally {
      sessionStartLocks.delete(sessionId);
    }
  })();
  sessionStartLocks.set(sessionId, initPromise);
  return initPromise;
}
async function requestBaileysPairingCode(rawSessionId, phoneNumber, userId, options) {
  if (isSelfKilledByIpRule) {
    throw new Error(`Socket WhatsApp pada server ini telah dimatikan oleh aturan Admin (${selfKilledReason || "Kill IP"}).`);
  }
  const sessionId = sanitizeSessionId(rawSessionId);
  const cleanPhone = normalizePhoneNumber(phoneNumber);
  if (!cleanPhone || cleanPhone.length < 9) {
    throw new Error("Nomor telepon tidak valid. Gunakan format lengkap (contoh: 0812... atau 62812...).");
  }
  const dbSessForPair = getSessionById(sessionId);
  const ownerForPair = userId || dbSessForPair?.user_id ? getUserById(userId || dbSessForPair?.user_id) : void 0;
  const pairGuardTarget = dbSessForPair || {
    id: sessionId,
    user_id: userId,
    assigned_app_id: options?.assignedAppId ? normalizeAppId(options.assignedAppId) || void 0 : void 0
  };
  if (!options?.bypassNodeGuard && !isSessionOwnedByCurrentAppNode(pairGuardTarget, void 0, ownerForPair)) {
    await releaseLocalSocketForDelegation(sessionId).catch(() => {
    });
    const targetApp = resolveEffectiveAssignedAppId(pairGuardTarget, ownerForPair);
    throw new Error(
      `Sesi pairing ini ditugaskan secara eksklusif ke APP_ID "${targetApp || "lain"}".`
    );
  }
  clearSessionTimers(sessionId);
  clearSessionConflictState(sessionId);
  sessionDisconnectDiagnostics.delete(sessionId);
  let pendingStartLock = sessionStartLocks.get(sessionId);
  while (pendingStartLock) {
    await pendingStartLock.catch(() => {
    });
    pendingStartLock = sessionStartLocks.get(sessionId);
  }
  let resolvePairLock;
  const pairSetupLock = new Promise((resolve) => {
    resolvePairLock = resolve;
  });
  sessionStartLocks.set(sessionId, pairSetupLock);
  let sessionData;
  let sock;
  let saveCreds;
  try {
    await closeCompetingSocketsForOwnerPhone(sessionId, cleanPhone, userId);
    const existing = activeSessions.get(sessionId);
    if (existing) {
      existing.superseded = true;
      existing.closedByApp = true;
    }
    if (existing && existing.socket) {
      await closeSocketAndWait(existing.socket, existing, sessionId, 2e3);
    }
    if (activeSessions.get(sessionId) === existing) {
      activeSessions.delete(sessionId);
    }
    await waitForHandoffCloseGraceIfNeeded(sessionId);
    const sessionFolder = safeSessionFolderPath(sessionId);
    if (!sessionFolder) {
      throw new Error("ID sesi WhatsApp tidak valid.");
    }
    if (fs4.existsSync(sessionFolder)) {
      try {
        fs4.rmSync(sessionFolder, { recursive: true, force: true });
      } catch (e) {
        console.warn("[Baileys] Warning cleaning session folder for new pairing:", e);
      }
    }
    fs4.mkdirSync(sessionFolder, { recursive: true, mode: 448 });
    const authRes = await createResilientMultiFileAuthState(sessionId, sessionFolder);
    saveCreds = authRes.saveCreds;
    const cachedAuthState = buildCachedAuthState(sessionId, authRes.state);
    const cacheStores = getSessionCacheStores(sessionId);
    const version = await resolveBaileysVersion();
    sock = makeWASocket(
      buildBaileysSocketConfig(version, BAILEYS_SILENT_LOGGER, cachedAuthState, cacheStores)
    );
    try {
      sock.ws?.on?.("error", () => {
      });
    } catch {
    }
    sessionData = {
      sessionId,
      userId,
      socket: sock,
      qrCodeUrl: null,
      pairingCode: null,
      status: "connecting",
      phoneNumber: cleanPhone,
      lastUpdated: Date.now(),
      handshakeStartedAt: Date.now(),
      retryCount: 0,
      consecutiveConflicts: 0,
      superseded: false,
      closedByApp: false
    };
    try {
      let lastPairPassiveFrameTouch = 0;
      sock.ws?.on?.("frame", () => {
        if (sessionData.superseded || sessionData.status !== "connected") return;
        const t = Date.now();
        if (t - lastPairPassiveFrameTouch >= 15e3) {
          lastPairPassiveFrameTouch = t;
          sessionData.lastUpdated = t;
        }
      });
    } catch {
    }
    activeSessions.set(sessionId, sessionData);
    writeLocalRuntimeLease(sessionId, {
      userId,
      phoneNumber: cleanPhone,
      status: "connecting",
      startedAt: sessionData.handshakeStartedAt
    });
  } catch (setupErr) {
    sessionStartLocks.delete(sessionId);
    resolvePairLock(sessionData);
    throw setupErr;
  }
  let pairCredsSaveQueue = Promise.resolve();
  sock.ev.on("creds.update", () => {
    if (sessionData.superseded) return;
    pairCredsSaveQueue = pairCredsSaveQueue.then(async () => {
      if (sessionData.superseded) return;
      try {
        await saveCreds();
        scheduleAuthFolderBackup(sessionId);
      } catch (saveErr) {
        console.warn("[Baileys Pairing] Error saving creds:", saveErr);
      }
    });
  });
  sock.ev.on("connection.update", async (update) => {
    if (sessionData.superseded) return;
    const { connection, lastDisconnect } = update;
    if (connection === "open") {
      if (sessionData.superseded) {
        closeSocketSafelyWithoutLogout(sock, sessionData, sessionId);
        return;
      }
      const rawSockUser = sock.user?.id ? sock.user.id.split("@")[0].split(":")[0] : "";
      const connectedUser = normalizePhoneNumber(rawSockUser || cleanPhone);
      const owner = resolveActiveVerifiedOwner(sessionId, sessionData.userId || userId, connectedUser);
      if (!isOwnerActiveAndRegistered(owner)) {
        console.warn(`[Baileys Pairing Security] Connected session ${sessionId} has no active registered owner. Purging.`);
        await purgeBaileysSessionCompletely(sessionId, connectedUser);
        return;
      }
      console.log(`[Baileys Pairing] Connected & Linked successfully! User: ${sock.user?.id}`);
      try {
        await pairCredsSaveQueue;
        await saveCreds();
      } catch {
      }
      if (sessionData.superseded) {
        closeSocketSafelyWithoutLogout(sock, sessionData, sessionId);
        return;
      }
      const openAt = Date.now();
      sessionData.status = "connected";
      sessionData.phoneNumber = connectedUser;
      sessionData.pairingCode = null;
      sessionData.lastUpdated = openAt;
      sessionData.handshakeStartedAt = openAt;
      sessionData.openedAt = openAt;
      sessionData.disconnectedSince = void 0;
      sessionData.conflictCooldownUntil = void 0;
      sessionData.userId = owner.id;
      clearSessionExpiryNotificationCooldown(sessionId, owner.id, connectedUser);
      sessionDisconnectDiagnostics.delete(sessionId);
      clearSessionConflictState(sessionId);
      cleanupDuplicateSessionsForOwnerPhone(sessionId, owner.id, connectedUser);
      activeSessions.set(sessionId, sessionData);
      scheduleAuthFolderBackup(sessionId);
      void publishActiveSessionLease(sessionData, true);
      if (sessionData.stabilityTimer) clearTimeout(sessionData.stabilityTimer);
      sessionData.stabilityTimer = setTimeout(() => {
        const latest = activeSessions.get(sessionId);
        if (latest === sessionData && !latest.superseded && latest.status === "connected" && isSocketTrulyOpen(latest.socket)) {
          latest.retryCount = 0;
          latest.consecutiveConflicts = 0;
          clearSessionConflictState(sessionId);
          sessionDisconnectDiagnostics.delete(sessionId);
        }
      }, STABLE_OPEN_THRESHOLD_MS);
      sessionData.stabilityTimer.unref?.();
      const db = initDbFile();
      const existingDb = getSessionById(sessionId) || db.sessions.find(
        (s) => s.user_id === owner.id && s.phone_number && normalizePhoneNumber(s.phone_number) === connectedUser
      );
      const expiryDate = new Date(Date.now() + 365 * 24 * 60 * 60 * 1e3).toISOString();
      const pairOpenIso = (/* @__PURE__ */ new Date()).toISOString();
      const currentAppId = getCurrentAppId();
      const displayAppId = getDisplayAppId();
      const resolvedIdNow = await resolveCurrentServerIdentity().catch(() => getCachedOrFallbackIdentity());
      const primaryServerIp = normalizeServerIpValue(extractPrimaryIp(resolvedIdNow.serverIp)) || collectAllLocalIpAddresses()[0] || "";
      const effectiveAssignedApp = normalizeAppId(existingDb?.assigned_app_id) || normalizeAppId(options?.assignedAppId) || normalizeAppId(owner?.assigned_app_id) || currentAppId;
      if (effectiveAssignedApp && effectiveAssignedApp !== currentAppId) {
        console.warn(
          `[Cluster Exclusivity] Pairing ${sessionId} (${connectedUser}) terhubung di ${currentAppId} padahal ditugaskan ke ${effectiveAssignedApp}. Melepas socket lokal.`
        );
        if (existingDb) {
          updateSession(existingDb.id, {
            id: sessionId,
            status: "disconnected",
            phone_number: connectedUser,
            user_id: owner.id,
            assigned_app_id: effectiveAssignedApp,
            assigned_server_ip: void 0,
            connected_app_id: "",
            connected_server_ip: "",
            assignment_status: "delegated",
            assignment_error: `Dialihkan eksklusif ke APP_ID ${effectiveAssignedApp}`,
            last_assignment_at: pairOpenIso,
            expires_at: existingDb.expires_at || expiryDate
          });
        } else {
          addSession({
            id: sessionId,
            session_name: `WA Pair - ${connectedUser}`,
            phone_number: connectedUser,
            auth_method: "pairing_code",
            status: "disconnected",
            user_id: owner.id,
            is_primary: true,
            assigned_app_id: effectiveAssignedApp,
            assignment_status: "delegated",
            assignment_error: `Dialihkan eksklusif ke APP_ID ${effectiveAssignedApp}`,
            last_assignment_at: pairOpenIso,
            connected_at: pairOpenIso,
            expires_at: expiryDate
          });
        }
        void updateSessionAssignmentInMysql(sessionId, {
          assigned_app_id: effectiveAssignedApp,
          assigned_server_ip: "",
          connected_app_id: "",
          connected_server_ip: "",
          assignment_status: "delegated",
          assignment_error: `Dialihkan eksklusif ke APP_ID ${effectiveAssignedApp}`,
          last_assignment_at: pairOpenIso,
          status: "disconnected"
        }).catch(() => {
        });
        await releaseLocalSocketForDelegation(sessionId).catch(() => {
        });
        return;
      }
      void deleteWaSessionConflictFromMysql(sessionId).catch(() => {
      });
      if (existingDb) {
        if (existingDb.id !== sessionId) {
          sessionDisconnectDiagnostics.delete(existingDb.id);
          clearSessionConflictState(existingDb.id);
          void deleteWaSessionConflictFromMysql(existingDb.id).catch(() => {
          });
        }
        const existingExpiryMs = existingDb.expires_at ? Date.parse(existingDb.expires_at) : 0;
        updateSession(existingDb.id, {
          id: sessionId,
          status: "connected",
          phone_number: connectedUser,
          user_id: owner.id,
          assigned_app_id: effectiveAssignedApp,
          assigned_server_ip: void 0,
          connected_app_id: displayAppId,
          connected_server_ip: primaryServerIp || void 0,
          failed_app_ids: [],
          assignment_status: "connected",
          assignment_error: "",
          last_assignment_at: pairOpenIso,
          connected_at: existingDb.connected_at || pairOpenIso,
          last_activity_at: pairOpenIso,
          expires_at: existingExpiryMs > Date.now() + 30 * 24 * 60 * 60 * 1e3 ? existingDb.expires_at : expiryDate
        });
      } else {
        addSession({
          id: sessionId,
          session_name: `WA Pair - ${connectedUser}`,
          phone_number: connectedUser,
          auth_method: "pairing_code",
          status: "connected",
          user_id: owner.id,
          is_primary: true,
          assigned_app_id: effectiveAssignedApp,
          connected_app_id: displayAppId,
          connected_server_ip: primaryServerIp || void 0,
          failed_app_ids: [],
          assignment_status: "connected",
          assignment_error: "",
          last_assignment_at: pairOpenIso,
          connected_at: pairOpenIso,
          last_activity_at: pairOpenIso,
          expires_at: expiryDate
        });
      }
      void updateSessionAssignmentInMysql(sessionId, {
        assigned_app_id: effectiveAssignedApp,
        assigned_server_ip: "",
        connected_app_id: displayAppId,
        connected_server_ip: primaryServerIp || void 0,
        failed_app_ids: [],
        assignment_status: "connected",
        assignment_error: "",
        last_assignment_at: pairOpenIso,
        status: "connected"
      }).catch(() => {
      });
      void publishCurrentSocketRecord({ force: true }).catch(() => {
      });
      const pairWarmTimer = setTimeout(() => {
        const latest = activeSessions.get(sessionId);
        if (latest === sessionData && !latest.superseded && latest.status === "connected" && isSocketTrulyOpen(latest.socket)) {
          void warmMetaAiSession(sessionId, sock);
          void processPendingMissedMessagesForSession(sessionId, "pairing_open");
        }
      }, 2200);
      pairWarmTimer.unref?.();
      if (owner.role === "admin") {
        setTimeout(() => {
          drainSuperadminWaQueue("admin_pairing_open").catch(() => {
          });
          processPendingSessionExpiryAlerts("admin_pairing_open").catch(() => {
          });
        }, 2500);
      }
    } else if (connection === "close") {
      if (sessionData.stabilityTimer) {
        clearTimeout(sessionData.stabilityTimer);
        sessionData.stabilityTimer = void 0;
      }
      const latestBeforeClose = activeSessions.get(sessionId);
      if (sessionData.superseded || latestBeforeClose && latestBeforeClose !== sessionData && latestBeforeClose.socket && latestBeforeClose.socket !== sock) {
        return;
      }
      const statusCode = lastDisconnect?.error?.output?.statusCode;
      const disconnectErrMsg = lastDisconnect?.error?.message ? String((lastDisconnect?.error).message) : "";
      const isPermanentLogout = isPermanentLogoutCode(statusCode);
      const isPairRestartRequired = isRestartRequiredCode(statusCode);
      const isPairConflict440 = isConnectionReplacedCode(statusCode);
      const hasInMemRegistered = Boolean(sock.authState?.creds?.registered || sock.user?.id);
      if (hasInMemRegistered || isPairRestartRequired) {
        try {
          await pairCredsSaveQueue;
          await saveCreds();
        } catch {
        }
      }
      const latestSession = activeSessions.get(sessionId);
      if (sessionData.superseded || latestSession && latestSession !== sessionData && latestSession.socket && latestSession.socket !== sock) {
        return;
      }
      const existingMeta = getSessionById(sessionId);
      const isRegistered = hasRegisteredCredsOnDisk(sessionId) || hasInMemRegistered || Boolean(existingMeta?.connected_at);
      if (isPairRestartRequired) {
        console.log(
          `[Baileys Pairing] Handshake restart required (code ${statusCode ?? 515}, registered: ${isRegistered}) untuk ${sessionId}; menyambung ulang sesi...`
        );
      } else if (isPairConflict440) {
        console.log(
          `[Baileys Pairing] Sesi ${sessionId} mengalami pergantian stream (status 440, registered: ${isRegistered}); mengevaluasi pemulihan otomatis...`
        );
      } else {
        console.log(
          `[Baileys Pairing] Connection closed ${sessionId}, code: ${statusCode}, registered: ${isRegistered}${disconnectErrMsg ? `, reason: ${disconnectErrMsg}` : ""}`
        );
      }
      try {
        sessionData.detachRawHandlers?.();
        sock.ev?.removeAllListeners?.("connection.update");
        sock.ev?.removeAllListeners?.("creds.update");
        sock.ev?.removeAllListeners?.("messages.upsert");
        sock.ev?.removeAllListeners?.("messages.update");
        sock.ws?.removeAllListeners?.();
        try {
          sock.ws?.on?.("error", () => {
          });
        } catch {
        }
      } catch {
      }
      recordLastCloseTimestamp(sessionId);
      removeLocalRuntimeLease(sessionId, RUNTIME_INSTANCE_ID);
      sessionData.socket = null;
      if (isPermanentLogout || !isRegistered && !isPairRestartRequired) {
        sessionDisconnectDiagnostics.delete(sessionId);
        clearSessionConflictState(sessionId);
        console.warn(`[Baileys Pairing Auto-Purge] Sesi pairing ${sessionId} terputus/batal (${statusCode}). Menghapus sesi sementara...`);
        if (isPermanentLogout && (isRegistered || existingMeta?.status === "connected")) {
          await notifyUserSessionExpired({
            sessionId,
            sessionName: existingMeta?.session_name,
            expiredPhone: sessionData.phoneNumber || cleanPhone || existingMeta?.phone_number,
            userId: sessionData.userId || userId || existingMeta?.user_id,
            reason: statusCode === DisconnectReason.loggedOut || statusCode === 401 ? "keluar / terputus dari Perangkat Tertaut di HP" : `terputus permanen (kode ${statusCode})`
          }).catch(() => {
          });
        }
        await purgeBaileysSessionCompletely(sessionId, cleanPhone);
        return;
      }
      const pairOwner = resolveActiveVerifiedOwner(sessionId, sessionData.userId || userId, sessionData.phoneNumber || cleanPhone);
      if (!isOwnerActiveAndRegistered(pairOwner)) {
        console.warn(`[Baileys Pairing Auto-Purge] Pemilik sesi pairing ${sessionId} tidak aktif/terdaftar. Menghapus sesi...`);
        await purgeBaileysSessionCompletely(sessionId, cleanPhone);
        return;
      }
      const competingPairInProcess = isPairConflict440 && cleanPhone ? hasOtherActiveOrConnectingSocketForPhone(sessionId, cleanPhone, pairOwner.id) : null;
      if (competingPairInProcess) {
        console.log(
          `[Baileys Pairing Dedup] Socket ${sessionId} mengalah kepada sesi aktif "${competingPairInProcess.sessionId}" untuk +${cleanPhone}; tanpa peringatan konflik.`
        );
        clearSessionTimers(sessionId);
        clearMetaAiSession(sessionId);
        sessionDisconnectDiagnostics.delete(sessionId);
        clearSessionConflictState(sessionId);
        if (activeSessions.get(sessionId) === sessionData) {
          activeSessions.delete(sessionId);
        }
        return;
      }
      recordDisconnectDiagnostic(sessionId, statusCode, disconnectErrMsg);
      if (isPairConflict440) {
        const liveLocalSibling = findLiveLocalSiblingLease({
          sessionId,
          userId: pairOwner.id,
          cleanPhone
        });
        if (liveLocalSibling) {
          clearSessionTimers(sessionId);
          clearMetaAiSession(sessionId);
          sessionDisconnectDiagnostics.delete(sessionId);
          clearSessionConflictState(sessionId);
          if (activeSessions.get(sessionId) === sessionData) {
            activeSessions.delete(sessionId);
          }
          return;
        }
        const remoteLease440 = await evaluateRemoteLeaseForSession({
          sessionId,
          userId: pairOwner.id,
          cleanPhone,
          assignedAppId: existingMeta?.assigned_app_id,
          forceRefresh: true
        });
        if (remoteLease440.status === "same_domain_ip" || remoteLease440.status === "remote_cluster_node") {
          clearSessionTimers(sessionId);
          clearMetaAiSession(sessionId);
          sessionDisconnectDiagnostics.delete(sessionId);
          clearSessionConflictState(sessionId);
          if (activeSessions.get(sessionId) === sessionData) {
            activeSessions.delete(sessionId);
          }
          return;
        }
        const nowMs = Date.now();
        const nextConflictCount = (sessionConflictStates.get(sessionId)?.count || sessionData.consecutiveConflicts || 0) + 1;
        sessionData.consecutiveConflicts = nextConflictCount;
        sessionData.retryCount = Math.max((sessionData.retryCount || 0) + 1, nextConflictCount);
        const cooldownUntil = nowMs + CONFLICT_COOLDOWN_MS;
        const recordedCount = Math.max(nextConflictCount, MAX_AUTO_CONFLICT_RETRIES + 1);
        sessionConflictStates.set(sessionId, {
          count: recordedCount,
          cooldownUntil,
          lastConflictAt: nowMs
        });
        clearSessionTimers(sessionId);
        sessionData.status = "disconnected";
        sessionData.disconnectedSince = nowMs;
        sessionData.conflictCooldownUntil = cooldownUntil;
        sessionData.lastUpdated = nowMs;
        activeSessions.set(sessionId, sessionData);
        const pairDetail = await captureAndStoreConflictDiagnostic({
          sessionId,
          ownerId: pairOwner.id,
          cleanPhone,
          sessionName: existingMeta?.session_name,
          disconnectErr: lastDisconnect?.error,
          disconnectErrMsg,
          cooldownUntil
        }).catch(() => null);
        if (pairDetail?.source_type === "same_server") {
          clearSessionConflictState(sessionId);
          sessionDisconnectDiagnostics.delete(sessionId);
          if (activeSessions.get(sessionId) === sessionData) {
            activeSessions.delete(sessionId);
          }
          return;
        }
        console.warn(
          `[Baileys Pairing Conflict Guard] Sesi ${sessionId} mengalami konflik 440. Auto-reconnect tidak dipaksa.${pairDetail?.competing_ip ? ` Server aktif: ${pairDetail.competing_domain || "-"} (IP ${pairDetail.competing_ip}).` : ""}`
        );
        return;
      } else if (!isPairRestartRequired) {
        sessionData.retryCount = (sessionData.retryCount || 0) + 1;
      }
      if (!isRegistered && sessionData.retryCount > 5) {
        await purgeBaileysSessionCompletely(sessionId, cleanPhone);
        return;
      }
      sessionData.status = "connecting";
      sessionData.lastUpdated = Date.now();
      activeSessions.set(sessionId, sessionData);
      const pairReconnectDelay = computePersistentReconnectDelay(sessionData.retryCount, statusCode);
      if (isPairRestartRequired) {
        console.log(
          `[Baileys Pairing Reconnect] Melanjutkan penautan ${sessionId} setelah restart 515 dalam ${Math.round(pairReconnectDelay)}ms...`
        );
      } else {
        console.log(
          `[Baileys Pairing Persistent Reconnect] Stream closed (${statusCode}). Reconnecting ${sessionId} (attempt ${sessionData.retryCount})...`
        );
      }
      clearSessionTimers(sessionId);
      const rTimer = setTimeout(async () => {
        reconnectTimers.delete(sessionId);
        if (sessionData.superseded) return;
        try {
          await pairCredsSaveQueue;
        } catch {
        }
        if (sessionData.superseded) return;
        if (!resolveActiveVerifiedOwner(sessionId, sessionData.userId || userId, sessionData.phoneNumber || cleanPhone)) {
          await purgeBaileysSessionCompletely(sessionId, cleanPhone);
          return;
        }
        getOrStartBaileysSession(sessionId, cleanPhone, sessionData.userId || userId, { isAutoReconnect: true }).catch(() => {
        });
      }, pairReconnectDelay);
      rTimer.unref?.();
      reconnectTimers.set(sessionId, rTimer);
    }
  });
  attachSocketMessageListener(sock, sessionId, sessionData);
  sessionStartLocks.delete(sessionId);
  resolvePairLock(sessionData);
  let tries = 0;
  while (tries < 18 && !sessionData.superseded && !sock.ws?.isOpen && !sock.ws?.isClosed) {
    await delay(300);
    tries++;
  }
  await delay(800);
  if (sessionData.superseded) {
    throw new Error("Permintaan Kode Pairing dibatalkan karena sesi digantikan oleh koneksi baru.");
  }
  if (!sock.authState.creds.registered) {
    try {
      const rawCode = await sock.requestPairingCode(cleanPhone);
      const formattedCode = rawCode?.match(/.{1,4}/g)?.join("-") || rawCode;
      sessionData.pairingCode = formattedCode;
      sessionData.lastUpdated = Date.now();
      activeSessions.set(sessionId, sessionData);
      return formattedCode;
    } catch (err) {
      console.error("[Baileys] Request pairing code error:", err);
      const alreadyLinkedOrRestarting = Boolean(sock.authState?.creds?.registered) || hasRegisteredCredsOnDisk(sessionId) || reconnectTimers.has(sessionId);
      if (!alreadyLinkedOrRestarting) {
        await purgeBaileysSessionCompletely(sessionId, cleanPhone);
      }
      throw new Error(err?.message || "Gagal meminta Kode Pairing dari WhatsApp.");
    }
  } else {
    throw new Error("Sesi ini sudah terdaftar dan terhubung.");
  }
}
function getLiveSessionRuntimeStatus(dbSess) {
  const cleanPhone = normalizePhoneNumber(dbSess.phone_number || "");
  const matchingSessions = [];
  const exactMem = activeSessions.get(dbSess.id);
  if (exactMem && !exactMem.superseded && (!exactMem.userId || !dbSess.user_id || exactMem.userId === dbSess.user_id)) {
    matchingSessions.push(exactMem);
  }
  for (const s of activeSessions.values()) {
    if (s === exactMem || s.superseded) continue;
    if (s.userId && dbSess.user_id && s.userId !== dbSess.user_id) continue;
    if (dbSess.user_id && !s.userId && !isSessionOwnedByUserId(s.sessionId, dbSess.user_id)) {
      const otherDb = getSessionById(s.sessionId);
      if (otherDb?.user_id && otherDb.user_id !== dbSess.user_id) continue;
    }
    const sPhone = normalizePhoneNumber(s.phoneNumber || getCredsPhoneOnDisk(s.sessionId) || "");
    if (s.sessionId === dbSess.id || cleanPhone.length >= 8 && sPhone === cleanPhone) {
      matchingSessions.push(s);
    }
  }
  let hasCreds = hasRegisteredCredsOnDisk(dbSess.id);
  if (!hasCreds) {
    for (const m of matchingSessions) {
      if (m.sessionId !== dbSess.id && hasRegisteredCredsOnDisk(m.sessionId)) {
        hasCreds = true;
        break;
      }
    }
  }
  const liveConnected = matchingSessions.find(
    (m) => m.status === "connected" && m.socket && isSocketTrulyOpen(m.socket)
  );
  if (liveConnected) {
    const rawDetailWhileOpen = sessionConflictDetails.get(dbSess.id) || sessionConflictDetails.get(liveConnected.sessionId) || remoteSessionConflictCache.get(dbSess.id)?.detail || remoteSessionConflictCache.get(liveConnected.sessionId)?.detail;
    const isExternalMultiLocation = Boolean(rawDetailWhileOpen && rawDetailWhileOpen.source_type !== "same_server");
    sessionDisconnectDiagnostics.delete(dbSess.id);
    clearSessionConflictState(dbSess.id);
    if (liveConnected.sessionId !== dbSess.id) {
      sessionDisconnectDiagnostics.delete(liveConnected.sessionId);
      clearSessionConflictState(liveConnected.sessionId);
    }
    return {
      runtime_status: "connected",
      has_registered_creds: true,
      conflict_paused: false,
      conflict_detail: isExternalMultiLocation ? rawDetailWhileOpen : void 0,
      multi_location_active: isExternalMultiLocation
    };
  }
  const primaryMem = matchingSessions[0];
  const resolvedSid = primaryMem?.sessionId || dbSess.id;
  const diag = sessionDisconnectDiagnostics.get(resolvedSid) || sessionDisconnectDiagnostics.get(dbSess.id);
  const hasConnectingMatch = matchingSessions.some(
    (m) => m.status === "connecting" || reconnectTimers.has(m.sessionId) || sessionStartLocks.has(m.sessionId)
  ) || reconnectTimers.has(dbSess.id) || sessionStartLocks.has(dbSess.id);
  if (hasConnectingMatch) {
    return {
      runtime_status: "connecting",
      has_registered_creds: hasCreds,
      disconnect_code: diag?.code,
      disconnect_reason: diag?.reason,
      conflict_paused: false
    };
  }
  const liveLocalSibling = findLiveLocalSiblingLease({
    sessionId: dbSess.id,
    userId: dbSess.user_id,
    cleanPhone
  });
  if (liveLocalSibling) {
    if (liveLocalSibling.status === "connected") {
      sessionDisconnectDiagnostics.delete(dbSess.id);
      clearSessionConflictState(dbSess.id);
      if (resolvedSid !== dbSess.id) {
        sessionDisconnectDiagnostics.delete(resolvedSid);
        clearSessionConflictState(resolvedSid);
      }
      return {
        runtime_status: "connected",
        has_registered_creds: true,
        conflict_paused: false
      };
    }
    return {
      runtime_status: "connecting",
      has_registered_creds: hasCreds,
      conflict_paused: false
    };
  }
  const fullDbMeta = getSessionById(dbSess.id);
  const cachedRemote = getCachedRemoteLeaseClassification({
    sessionId: dbSess.id,
    userId: dbSess.user_id,
    cleanPhone,
    assignedAppId: fullDbMeta?.assigned_app_id
  });
  if (cachedRemote.status === "same_domain_ip" || cachedRemote.status === "remote_cluster_node") {
    sessionDisconnectDiagnostics.delete(dbSess.id);
    clearSessionConflictState(dbSess.id);
    if (resolvedSid !== dbSess.id) {
      sessionDisconnectDiagnostics.delete(resolvedSid);
      clearSessionConflictState(resolvedSid);
    }
    return {
      runtime_status: "connected",
      has_registered_creds: true,
      conflict_paused: false
    };
  }
  if (cachedRemote.status === "different_ip" && cachedRemote.lease) {
    const existingDetail = sessionConflictDetails.get(resolvedSid) || sessionConflictDetails.get(dbSess.id);
    const conflictDetail = existingDetail && existingDetail.source_type === "remote_instance" ? existingDetail : buildRemoteConflictDetailSync(cachedRemote.lease, dbSess.id);
    return {
      runtime_status: "connected",
      has_registered_creds: true,
      conflict_paused: false,
      conflict_detail: conflictDetail,
      multi_location_active: true
    };
  }
  const rawConflictDetail = sessionConflictDetails.get(resolvedSid) || sessionConflictDetails.get(dbSess.id) || remoteSessionConflictCache.get(resolvedSid)?.detail || remoteSessionConflictCache.get(dbSess.id)?.detail;
  const isSameServerNonConflict = rawConflictDetail?.source_type === "same_server";
  if (isSameServerNonConflict) {
    clearSessionConflictState(resolvedSid);
    clearSessionConflictState(dbSess.id);
  }
  const verifiedAtMs = Math.max(
    getLatestSessionSendVerifiedAt(dbSess.id, cleanPhone),
    getLatestSessionSendVerifiedAt(resolvedSid, cleanPhone)
  );
  const lastDiagAt = diag?.at || 0;
  if (verifiedAtMs > 0 && verifiedAtMs >= lastDiagAt && hasCreds) {
    return {
      runtime_status: "connected",
      has_registered_creds: hasCreds,
      conflict_paused: false,
      conflict_detail: !isSameServerNonConflict ? rawConflictDetail : void 0,
      multi_location_active: Boolean(rawConflictDetail && !isSameServerNonConflict)
    };
  }
  const hasRemotePersistedConflict = Boolean(
    !isSameServerNonConflict && rawConflictDetail && (remoteSessionConflictCache.has(resolvedSid) || remoteSessionConflictCache.has(dbSess.id))
  );
  const conflictPaused = !isSameServerNonConflict && (isSessionInConflictCooldown(resolvedSid) || isSessionInConflictCooldown(dbSess.id) || hasRemotePersistedConflict);
  return {
    runtime_status: "disconnected",
    has_registered_creds: hasCreds,
    disconnect_code: conflictPaused ? diag?.code || 440 : diag?.code,
    disconnect_reason: conflictPaused ? diag?.reason || "440_konflik_koneksi_ganda" : diag?.reason,
    conflict_paused: conflictPaused,
    conflict_detail: conflictPaused ? rawConflictDetail : void 0
  };
}
async function purgeBaileysSessionCompletely(idOrPhone, explicitPhone, options) {
  if (!idOrPhone) return;
  clearSessionTimers(idOrPhone);
  const sess = getSessionById(idOrPhone);
  const credsPhone = getCredsPhoneOnDisk(idOrPhone);
  const rawPhoneInput = /^\+?\d{8,16}$/.test(idOrPhone.trim()) ? idOrPhone.trim() : "";
  const targetPhone = normalizePhoneNumber(explicitPhone || sess?.phone_number || credsPhone || rawPhoneInput);
  const targetUserId = sess?.user_id;
  deleteSession(idOrPhone);
  deleteBaileysAuthFromMysql(idOrPhone).catch(() => {
  });
  deleteWaSessionLeaseFromMysql({
    sessionId: idOrPhone,
    phoneNumber: targetPhone,
    expectedInstanceId: RUNTIME_INSTANCE_ID
  }).catch(() => {
  });
  sessionConflictDetails.delete(idOrPhone);
  lastLeaseRefreshAt.delete(idOrPhone);
  if (sess?.id && sess.id !== idOrPhone) {
    clearSessionTimers(sess.id);
    deleteSession(sess.id);
    deleteBaileysAuthFromMysql(sess.id).catch(() => {
    });
    deleteWaSessionLeaseFromMysql({
      sessionId: sess.id,
      phoneNumber: targetPhone,
      expectedInstanceId: RUNTIME_INSTANCE_ID
    }).catch(() => {
    });
    sessionConflictDetails.delete(sess.id);
    lastLeaseRefreshAt.delete(sess.id);
  }
  if (rawPhoneInput && targetPhone.length >= 8) {
    deleteSession(targetPhone);
  }
  const keysToRemove = [];
  for (const [key, sessionData] of activeSessions.entries()) {
    const memPhone = normalizePhoneNumber(sessionData.phoneNumber || "");
    const sameOwner = !targetUserId || !sessionData.userId || sessionData.userId === targetUserId;
    const isExactMatch = key === idOrPhone || Boolean(sess && key === sess.id);
    const isSamePhoneMatch = Boolean(targetPhone && targetPhone.length >= 8 && sameOwner && memPhone && memPhone === targetPhone);
    if (isExactMatch || isSamePhoneMatch) {
      clearSessionTimers(key);
      if (sessionData.socket) {
        if (options?.allowRemoteLogout) {
          try {
            await Promise.race([
              sessionData.socket.logout().catch(() => {
              }),
              new Promise((res) => setTimeout(res, 600))
            ]);
          } catch {
          }
        }
        try {
          sessionData.socket.ev?.removeAllListeners?.("connection.update");
          sessionData.socket.ev?.removeAllListeners?.("creds.update");
          sessionData.socket.ev?.removeAllListeners?.("messages.upsert");
          sessionData.socket.ev?.removeAllListeners?.("messages.update");
          sessionData.socket.end(void 0);
          sessionData.socket.ws?.removeAllListeners?.();
        } catch {
        }
      }
      sessionData.detachRawHandlers?.();
      clearMetaAiSession(key);
      keysToRemove.push(key);
    }
  }
  for (const k of keysToRemove) {
    activeSessions.delete(k);
    lastAuthBackupAt.delete(k);
    lastAuthBackupHashes.delete(k);
    socketPingFailures.delete(k);
    clearOfflineCatchupBuffersForSession(k);
    clearPendingMissedMessagesForSession(k);
    clearSessionCacheStores(k);
    cleanSessionFolder(k);
    deleteBaileysAuthFromMysql(k).catch(() => {
    });
    for (const stateKey of Array.from(commandState.keys())) {
      if (stateKey.startsWith(`${k}:`)) {
        commandState.delete(stateKey);
      }
    }
  }
  clearOfflineCatchupBuffersForSession(idOrPhone);
  clearPendingMissedMessagesForSession(idOrPhone);
  cleanSessionFolder(idOrPhone);
  if (sess?.id) {
    clearOfflineCatchupBuffersForSession(sess.id);
    clearPendingMissedMessagesForSession(sess.id);
    cleanSessionFolder(sess.id);
  }
  if (rawPhoneInput && targetPhone.length >= 8) {
    cleanSessionFolder(`session_${targetPhone}`);
    cleanSessionFolder(`session_pair_${targetPhone}`);
  }
}
var pruneInFlightPromise = null;
var lastPruneCompletedAt = 0;
var lastMysqlAuthPruneAt = 0;
async function pruneInactiveAndUnregisteredBaileysSessions(force = false) {
  if (pruneInFlightPromise) {
    return pruneInFlightPromise;
  }
  const now = Date.now();
  if (!force && now - lastPruneCompletedAt < PRUNE_COOLDOWN_MS) {
    return 0;
  }
  pruneInFlightPromise = (async () => {
    let purgedCount = 0;
    const db = initDbFile();
    const purgedIds = /* @__PURE__ */ new Set();
    const doPurge = async (sid, phone, reason) => {
      if (!sid || purgedIds.has(sid)) return;
      const liveMem = activeSessions.get(sid);
      if (sessionStartLocks.has(sid) || reconnectTimers.has(sid) || liveMem && (liveMem.status === "connected" || isSocketTrulyOpen(liveMem.socket) || liveMem.status === "connecting" && Date.now() - liveMem.handshakeStartedAt <= UNSCANNED_HANDSHAKE_TTL_MS)) {
        return;
      }
      purgedIds.add(sid);
      purgedCount++;
      console.log(`[Baileys Auto-Purge] Menghapus sesi "${sid}" (${reason || "inactive/unregistered"}).`);
      await purgeBaileysSessionCompletely(sid, phone);
    };
    try {
      for (const s of [...db.sessions]) {
        const mem = activeSessions.get(s.id);
        const hasOpenSocket = Boolean(mem && mem.status === "connected" && isSocketTrulyOpen(mem.socket));
        const owner = resolveActiveVerifiedOwner(s.id, s.user_id, s.phone_number);
        if (!isOwnerActiveAndRegistered(owner)) {
          await doPurge(s.id, s.phone_number, "pemilik akun tidak terdaftar atau nonaktif");
          continue;
        }
        const sessionHasPersistentAi = Boolean(owner && (owner.role === "admin" || owner.ai_enabled || owner.meta_ai_verified));
        if (s.expires_at && new Date(s.expires_at).getTime() < now) {
          if (hasOpenSocket || sessionHasPersistentAi) {
            updateSession(s.id, {
              expires_at: new Date(now + 365 * 24 * 60 * 60 * 1e3).toISOString()
            });
          } else {
            if (s.phone_number) {
              await notifyUserSessionExpired({
                sessionId: s.id,
                sessionName: s.session_name,
                expiredPhone: s.phone_number,
                userId: s.user_id,
                reason: "masa aktif sesi login telah habis (expired)"
              }).catch(() => {
              });
            }
            await doPurge(s.id, s.phone_number, "masa aktif sesi berakhir");
            continue;
          }
        }
        const lastActivityIso = s.last_activity_at || s.connected_at || s.updated_at || s.created_at;
        const lastActivityMs = lastActivityIso ? Date.parse(lastActivityIso) : NaN;
        const isLinkedSession = s.status === "connected" || Boolean(s.connected_at) || hasRegisteredCredsOnDisk(s.id);
        if (!hasOpenSocket && !sessionHasPersistentAi && isLinkedSession && Number.isFinite(lastActivityMs) && now - lastActivityMs >= SESSION_INACTIVITY_PURGE_MS) {
          await doPurge(
            s.id,
            s.phone_number,
            "tidak ada pesan masuk atau balasan selama 3 hari berturut-turut"
          );
          continue;
        }
        if (s.status === "disconnected" && !hasOpenSocket && !hasRegisteredCredsOnDisk(s.id)) {
          const hydrated = isMysqlConfigured() ? await hydrateSessionAuthFolderFromMysql(s.id).catch(() => false) : false;
          if (!hydrated) {
            if (s.phone_number && s.connected_at) {
              await notifyUserSessionExpired({
                sessionId: s.id,
                sessionName: s.session_name,
                expiredPhone: s.phone_number,
                userId: s.user_id,
                reason: "sesi WhatsApp terputus dan kredensial login tidak aktif lagi"
              }).catch(() => {
              });
            }
            await doPurge(s.id, s.phone_number, "status sesi disconnected tanpa kredensial tersimpan");
            continue;
          }
        }
        const updatedMs = new Date(s.updated_at || s.created_at || 0).getTime();
        if (s.status === "connecting" && !s.connected_at && !hasRegisteredCredsOnDisk(s.id) && (!mem || now - mem.handshakeStartedAt > UNSCANNED_HANDSHAKE_TTL_MS) && now - updatedMs > UNSCANNED_HANDSHAKE_TTL_MS) {
          await doPurge(s.id, s.phone_number, "handshake QR/pairing kadaluarsa tanpa scan");
          continue;
        }
      }
      for (const [sid, mem] of Array.from(activeSessions.entries())) {
        if (purgedIds.has(sid)) continue;
        const summary = readCredsSummary(sid);
        const dbSess = getSessionById(sid);
        const memRegistered = Boolean(mem.socket?.authState?.creds?.registered || mem.socket?.user?.id || mem.status === "connected");
        const owner = resolveActiveVerifiedOwner(sid, mem.userId, mem.phoneNumber || summary.phone);
        if (!isOwnerActiveAndRegistered(owner)) {
          await doPurge(sid, mem.phoneNumber || summary.phone, "socket memori tidak memiliki pemilik terdaftar aktif");
          continue;
        }
        if (!summary.registered && !memRegistered && !dbSess?.connected_at && now - mem.handshakeStartedAt > UNSCANNED_HANDSHAKE_TTL_MS) {
          await doPurge(sid, mem.phoneNumber || void 0, "QR/pairing belum tersambung > 3 menit");
          continue;
        }
        if (mem.status === "disconnected" && !isSocketTrulyOpen(mem.socket)) {
          if (!summary.registered && !memRegistered && !dbSess?.connected_at) {
            await doPurge(sid, mem.phoneNumber || summary.phone, "socket terputus tanpa kredensial");
            continue;
          }
          if (mem.disconnectedSince && now - mem.disconnectedSince > 10 * 60 * 1e3) {
            clearSessionTimers(sid);
            clearMetaAiSession(sid);
            activeSessions.delete(sid);
          }
        }
      }
      if (fs4.existsSync(AUTH_DIR)) {
        for (const entry of fs4.readdirSync(AUTH_DIR)) {
          if (purgedIds.has(entry)) continue;
          const folderPath = safeSessionFolderPath(entry);
          if (!folderPath) continue;
          try {
            const stat = fs4.lstatSync(folderPath);
            if (!stat.isDirectory()) continue;
            const mem = activeSessions.get(entry);
            const dbSess = getSessionById(entry);
            const { registered: isRegistered, phone: credsPhone } = readCredsSummary(entry);
            const memRegistered = Boolean(mem && (mem.status === "connected" || mem.socket?.authState?.creds?.registered || mem.socket?.user?.id));
            if (!isRegistered && !memRegistered && !dbSess?.connected_at) {
              const isFreshConnecting = mem && mem.status === "connecting" && now - mem.handshakeStartedAt <= UNSCANNED_HANDSHAKE_TTL_MS;
              if (!isFreshConnecting && now - stat.mtimeMs > UNSCANNED_HANDSHAKE_TTL_MS) {
                await doPurge(entry, credsPhone, "folder auth tidak terdaftar & kadaluarsa");
              }
              continue;
            }
            const owner = resolveActiveVerifiedOwner(entry, dbSess?.user_id || mem?.userId, dbSess?.phone_number || credsPhone);
            if (!isOwnerActiveAndRegistered(owner)) {
              await doPurge(entry, credsPhone, "folder auth milik user yang sudah terhapus/nonaktif");
              continue;
            }
            if (!dbSess && owner) {
              addSession({
                id: entry,
                session_name: `WA - ${credsPhone || entry}`,
                phone_number: credsPhone || "",
                auth_method: "qr_code",
                status: "connected",
                user_id: owner.id,
                is_primary: true,
                expires_at: new Date(now + 365 * 24 * 60 * 60 * 1e3).toISOString()
              });
            }
          } catch {
          }
        }
      }
      if (isMysqlConfigured() && (force || now - lastMysqlAuthPruneAt >= MYSQL_AUTH_PRUNE_INTERVAL_MS)) {
        lastMysqlAuthPruneAt = now;
        const mysqlAuthIds = await loadAllBaileysAuthSessionIdsFromMysql().catch(() => []);
        for (const sid of mysqlAuthIds) {
          if (purgedIds.has(sid)) continue;
          const mem = activeSessions.get(sid);
          if (mem && (mem.status === "connected" || isSocketTrulyOpen(mem.socket))) continue;
          const dbSess = getSessionById(sid);
          const owner = resolveActiveVerifiedOwner(sid, dbSess?.user_id, dbSess?.phone_number);
          const hasDiskCreds = hasRegisteredCredsOnDisk(sid);
          if (!isOwnerActiveAndRegistered(owner) || !dbSess && !hasDiskCreds) {
            await doPurge(sid, dbSess?.phone_number, "backup auth MySQL tidak memiliki pemilik/sesi aktif");
          }
        }
      }
      return purgedCount;
    } finally {
      lastPruneCompletedAt = Date.now();
      pruneInFlightPromise = null;
    }
  })();
  return pruneInFlightPromise;
}
function hasRegisteredCredsOnDisk(sessionId) {
  return readCredsSummary(sessionId).registered;
}
var isRestoringSessions = false;
async function restoreSavedBaileysSessions() {
  if (isRestoringSessions || isSelfKilledByIpRule) return;
  isRestoringSessions = true;
  try {
    await checkAndEnforceIpKillSwitch("startup_restore").catch(() => {
    });
    if (isSelfKilledByIpRule) return;
    const mysqlBackedUpIds = await loadAllBaileysAuthSessionIdsFromMysql().catch(() => []);
    for (const sid of mysqlBackedUpIds) {
      const dbSess = getSessionById(sid);
      const owner = resolveActiveVerifiedOwner(sid, dbSess?.user_id, dbSess?.phone_number);
      if (!isOwnerActiveAndRegistered(owner)) continue;
      if (dbSess?.expires_at && new Date(dbSess.expires_at).getTime() < Date.now()) continue;
      await hydrateSessionAuthFolderFromMysql(sid).catch(() => false);
    }
    await pruneInactiveAndUnregisteredBaileysSessions(true).catch(() => {
    });
    const dbSessions = getWhatsAppSessions();
    const diskFolders = fs4.existsSync(AUTH_DIR) ? fs4.readdirSync(AUTH_DIR) : [];
    const sessionIdsToRestore = /* @__PURE__ */ new Set();
    const canAutoStartOwner = (owner) => {
      return isOwnerActiveAndRegistered(owner);
    };
    for (const sid of mysqlBackedUpIds) {
      const dbSess = getSessionById(sid);
      const owner = resolveActiveVerifiedOwner(sid, dbSess?.user_id, dbSess?.phone_number);
      if (!canAutoStartOwner(owner)) continue;
      if (dbSess?.expires_at && new Date(dbSess.expires_at).getTime() < Date.now()) continue;
      await hydrateSessionAuthFolderFromMysql(sid);
      if (hasRegisteredCredsOnDisk(sid)) {
        sessionIdsToRestore.add(sid);
      }
    }
    dbSessions.forEach((s) => {
      if (s.id && hasRegisteredCredsOnDisk(s.id)) {
        const owner = resolveActiveVerifiedOwner(s.id, s.user_id, s.phone_number);
        const notExpired = !s.expires_at || new Date(s.expires_at).getTime() >= Date.now();
        if (canAutoStartOwner(owner) && notExpired) {
          sessionIdsToRestore.add(s.id);
        }
      }
    });
    diskFolders.forEach((folder) => {
      const folderPath = safeSessionFolderPath(folder);
      if (!folderPath) return;
      if (fs4.lstatSync(folderPath).isDirectory() && hasRegisteredCredsOnDisk(folder)) {
        const dbSess = getSessionById(folder);
        const credsPhone = getCredsPhoneOnDisk(folder);
        const owner = resolveActiveVerifiedOwner(folder, dbSess?.user_id, dbSess?.phone_number || credsPhone);
        const notExpired = !dbSess?.expires_at || new Date(dbSess.expires_at).getTime() >= Date.now();
        if (canAutoStartOwner(owner) && notExpired) {
          sessionIdsToRestore.add(folder);
        }
      }
    });
    const dedupedByOwnerPhone = /* @__PURE__ */ new Map();
    for (const sid of sessionIdsToRestore) {
      const dbSess = getSessionById(sid);
      const phone = normalizePhoneNumber(dbSess?.phone_number || getCredsPhoneOnDisk(sid) || "");
      const owner = resolveActiveVerifiedOwner(sid, dbSess?.user_id, phone);
      if (!owner) continue;
      const dedupKey = phone ? `${owner.id}:${phone}` : sid;
      const existingSid = dedupedByOwnerPhone.get(dedupKey);
      if (!existingSid) {
        dedupedByOwnerPhone.set(dedupKey, sid);
      } else {
        const existingIsDb = Boolean(getSessionById(existingSid));
        const currentIsDb = Boolean(dbSess);
        if (!existingIsDb && currentIsDb) {
          dedupedByOwnerPhone.set(dedupKey, sid);
        }
      }
    }
    const finalSessionIdsToRestore = Array.from(dedupedByOwnerPhone.values());
    for (const sid of finalSessionIdsToRestore) {
      const dbSess = getSessionById(sid);
      const phone = normalizePhoneNumber(dbSess?.phone_number || getCredsPhoneOnDisk(sid) || "");
      const owner = resolveActiveVerifiedOwner(sid, dbSess?.user_id, phone);
      if (owner && phone) {
        cleanupDuplicateSessionsForOwnerPhone(sid, owner.id, phone);
      }
    }
    console.log(
      `[Baileys Persistent Storage] Found ${finalSessionIdsToRestore.length} active WhatsApp session(s) to restore.`
    );
    for (const s of dbSessions) {
      if (s.id && s.status === "connected" && !finalSessionIdsToRestore.includes(s.id)) {
        updateSession(s.id, { status: "disconnected" });
        const owner = resolveActiveVerifiedOwner(s.id, s.user_id, s.phone_number);
        if (!isOwnerActiveAndRegistered(owner)) continue;
        const isExpiredByDate = Boolean(s.expires_at && new Date(s.expires_at).getTime() < Date.now());
        await notifyUserSessionExpired({
          sessionId: s.id,
          sessionName: s.session_name,
          expiredPhone: s.phone_number,
          userId: owner.id,
          reason: isExpiredByDate ? "masa aktif sesi berakhir saat aplikasi di-restart" : "kredensial login tidak ditemukan setelah build/restart server"
        }).catch(() => {
        });
      }
    }
    await resolveCurrentServerIdentity().catch(() => {
    });
    const restoreLeaseTargets = finalSessionIdsToRestore.map((sid) => {
      const dbSess = getSessionById(sid);
      return {
        id: sid,
        user_id: dbSess?.user_id,
        phone_number: dbSess?.phone_number || getCredsPhoneOnDisk(sid) || void 0
      };
    });
    await refreshRemoteSessionLeasesIfNeeded(restoreLeaseTargets).catch(() => {
    });
    for (const sid of finalSessionIdsToRestore) {
      if (isSelfKilledByIpRule) break;
      const existing = activeSessions.get(sid);
      if (!existing || existing.status !== "connected" || !isSocketTrulyOpen(existing.socket)) {
        try {
          const dbSess = getSessionById(sid);
          const ownerForRestore = dbSess?.user_id ? getUserById(dbSess.user_id) : void 0;
          if (dbSess && !isSessionOwnedByCurrentAppNode(dbSess, void 0, ownerForRestore)) {
            const targetApp = resolveEffectiveAssignedAppId(dbSess, ownerForRestore);
            console.log(
              `[Baileys Auto-Restore] Skip ${sid}: ${dbSess.assignment_status === "released" ? "status dilepas dari socket" : `ditugaskan ke APP_ID "${targetApp || "-"}"`} (APP_ID ini: "${getDisplayAppId()}").`
            );
            continue;
          }
          const cleanPhone = normalizePhoneNumber(dbSess?.phone_number || getCredsPhoneOnDisk(sid) || "");
          const localSibling = findLiveLocalSiblingLease({
            sessionId: sid,
            userId: dbSess?.user_id,
            cleanPhone
          });
          if (localSibling) {
            console.log(`[Baileys Auto-Restore] Skip ${sid}: sudah aktif pada proses lokal lain (PID ${localSibling.pid}).`);
            continue;
          }
          const remoteLease = await evaluateRemoteLeaseForSession({
            sessionId: sid,
            userId: dbSess?.user_id,
            cleanPhone,
            assignedAppId: dbSess?.assigned_app_id
          });
          if (remoteLease.status === "same_domain_ip" || remoteLease.status === "remote_cluster_node") {
            console.log(`[Baileys Auto-Restore] Skip ${sid}: sudah aktif pada cluster / host aktif.`);
            continue;
          }
          if (remoteLease.status === "different_ip") {
            console.log(`[Baileys Auto-Restore] Skip ${sid}: sedang aktif di server/IP berbeda (${remoteLease.lease?.server_ip || "-"}). Tidak memaksa konek ulang.`);
            continue;
          }
          if (isMultiNodeOrchestrationEnabled()) {
            const maxConn = getCurrentNodeMaxConnections();
            if (countLocalOccupiedConnections(sid) >= maxConn) {
              console.log(`[Baileys Auto-Restore] Kapasitas node ${getCurrentAppId()} penuh (${maxConn}); mendelegasikan ${sid} ke node lain...`);
              if (dbSess) {
                await delegateSessionToNextNodeOrError(
                  dbSess,
                  `Kapasitas koneksi node ${getCurrentAppId()} penuh (${maxConn}) saat startup`,
                  { markCurrentFailed: false }
                ).catch(() => {
                });
              }
              continue;
            }
          }
          console.log(`[Baileys Auto-Restore] Rehydrating session: ${sid}...`);
          await getOrStartBaileysSession(sid, dbSess?.phone_number, dbSess?.user_id);
          await delay(250);
        } catch (err) {
          console.error(`[Baileys Auto-Restore Error] Failed to restore session ${sid}:`, err);
        }
      }
    }
  } catch (err) {
    console.error("[Baileys Restore Error]", err);
  } finally {
    isRestoringSessions = false;
    setBaileysStartupPending(false);
    void publishCurrentSocketRecord({ force: true }).catch(() => {
    });
    if (!isSelfKilledByIpRule) {
      setTimeout(() => {
        runAppNodeAssignmentTick("post_restore").catch(() => {
        });
      }, 3e3).unref?.();
    }
  }
}
var lastHealthCheckAt = 0;
var healthCheckInFlightPromise = null;
async function runBaileysPeriodicHealthCheck() {
  if (isBaileysStartupPending() || isRestoringSessions || isSelfKilledByIpRule) {
    return { checked: 0, healed: 0, notified: 0 };
  }
  if (healthCheckInFlightPromise) {
    return healthCheckInFlightPromise;
  }
  healthCheckInFlightPromise = (async () => {
    const now = Date.now();
    lastHealthCheckAt = now;
    let checked = 0;
    let healed = 0;
    let notified = 0;
    cleanupExpiredCommandStates(now);
    if (recentBotOutgoingTexts.size > 0) {
      for (const [k, time] of recentBotOutgoingTexts.entries()) {
        if (now - time > 45e3) recentBotOutgoingTexts.delete(k);
      }
    }
    await pruneInactiveAndUnregisteredBaileysSessions();
    const dbSessions = getWhatsAppSessions();
    for (const [sid, mem] of Array.from(activeSessions.entries())) {
      if (mem.superseded) continue;
      const sMeta = dbSessions.find((x) => x.id === sid);
      const owner = sMeta?.user_id || mem.userId ? getUserById(sMeta?.user_id || mem.userId) : void 0;
      if (sMeta && !isSessionOwnedByCurrentAppNode(sMeta, void 0, owner)) {
        await releaseLocalSocketForDelegation(sid).catch(() => {
        });
      }
    }
    const healthLeaseTargets = dbSessions.filter((s) => {
      if (!s.id || s.status !== "connected") return false;
      if (s.expires_at && new Date(s.expires_at).getTime() < now) return false;
      const mem = activeSessions.get(s.id);
      return !(mem && !mem.superseded && mem.status === "connected" && isSocketTrulyOpen(mem.socket));
    });
    if (healthLeaseTargets.length > 0) {
      await refreshRemoteSessionLeasesIfNeeded(healthLeaseTargets).catch(() => {
      });
    }
    for (const s of dbSessions) {
      if (!s.id || s.status !== "connected") continue;
      if (s.expires_at && new Date(s.expires_at).getTime() < now) continue;
      const nodeOwner = s.user_id ? getUserById(s.user_id) : void 0;
      if (!isSessionOwnedByCurrentAppNode(s, void 0, nodeOwner)) continue;
      checked++;
      const liveStatus = getLiveSessionRuntimeStatus(s);
      const mem = activeSessions.get(s.id);
      if (mem && !mem.superseded && mem.status === "connected" && isSocketTrulyOpen(mem.socket)) {
        let socketHealthy = true;
        if (now - mem.lastUpdated > 9e4 && typeof mem.socket?.query === "function") {
          try {
            await Promise.race([
              mem.socket.query({
                tag: "iq",
                attrs: { to: "s.whatsapp.net", type: "get", xmlns: "w:p" },
                content: [{ tag: "ping", attrs: {} }]
              }),
              new Promise((_, reject) => setTimeout(() => reject(new Error("ping_timeout")), 6e3))
            ]);
            socketPingFailures.delete(s.id);
            mem.lastUpdated = Date.now();
            recordSessionSendVerified(s.id, s.phone_number);
          } catch {
            socketHealthy = false;
            const fails = (socketPingFailures.get(s.id) || 0) + 1;
            socketPingFailures.set(s.id, fails);
            if (fails >= 3 && !isSessionInConflictCooldown(s.id)) {
              socketPingFailures.delete(s.id);
              console.warn(`[Baileys Watchdog] Socket zombie terdeteksi untuk ${s.id}; menyambung ulang...`);
              await closeSocketAndWait(mem.socket, mem, s.id, 1800);
              if (activeSessions.get(s.id) === mem) {
                activeSessions.delete(s.id);
              }
              healed++;
              getOrStartBaileysSession(s.id, s.phone_number, s.user_id, { forceReconnect: true }).catch(() => {
              });
              continue;
            }
          }
        }
        if (socketHealthy) {
          void publishActiveSessionLease(mem);
          if (getPendingMissedMessages(s.id).length > 0) {
            void processPendingMissedMessagesForSession(s.id, "watchdog");
          }
        }
        continue;
      }
      if (liveStatus.runtime_status === "connected" || liveStatus.runtime_status === "connecting" || liveStatus.conflict_paused) {
        continue;
      }
      if (reconnectTimers.has(s.id) || sessionStartLocks.has(s.id) || isRestoringSessions) {
        continue;
      }
      if (isSessionInConflictCooldown(s.id)) {
        continue;
      }
      const isConnectingRecently = mem && !mem.superseded && mem.status === "connecting" && now - mem.lastUpdated < 6e4;
      if (isConnectingRecently) continue;
      const cleanPhone = normalizePhoneNumber(s.phone_number || getCredsPhoneOnDisk(s.id) || "");
      if (cleanPhone && hasOtherActiveOrConnectingSocketForPhone(s.id, cleanPhone, s.user_id)) {
        continue;
      }
      const owner = resolveActiveVerifiedOwner(s.id, s.user_id, s.phone_number);
      if (!isOwnerActiveAndRegistered(owner ?? null)) continue;
      let hasCreds = hasRegisteredCredsOnDisk(s.id);
      if (!hasCreds) {
        hasCreds = await hydrateSessionAuthFolderFromMysql(s.id).catch(() => false);
      }
      if (!hasCreds) {
        updateSession(s.id, { status: "disconnected" });
        const alertRes = await notifyUserSessionExpired({
          sessionId: s.id,
          sessionName: s.session_name,
          expiredPhone: s.phone_number,
          userId: owner.id,
          reason: "kredensial login WhatsApp sudah tidak valid atau terputus"
        }).catch(() => ({ notified: false }));
        if (alertRes.notified) notified++;
        continue;
      }
      if (mem && mem.status === "disconnected" && mem.disconnectedSince && now - mem.disconnectedSince >= 5 * 60 * 1e3) {
        const alertRes = await notifyUserSessionExpired({
          sessionId: s.id,
          sessionName: s.session_name,
          expiredPhone: s.phone_number,
          userId: owner.id,
          reason: "koneksi WhatsApp terputus lebih dari 5 menit dan gagal pulih otomatis"
        }).catch(() => ({ notified: false }));
        if (alertRes.notified) notified++;
      }
      console.log(
        `[Baileys Watchdog] Auto-healing session ${s.id} (${s.phone_number || "active"})...`
      );
      healed++;
      getOrStartBaileysSession(s.id, s.phone_number, owner.id || s.user_id).catch(() => {
      });
    }
    if (getSuperadminWaQueue().length > 0 && resolveConnectedSuperadminSession()) {
      drainSuperadminWaQueue("watchdog").catch(() => {
      });
    }
    const pendingRes = await processPendingSessionExpiryAlerts("watchdog").catch(() => ({
      checked: 0,
      sent: 0,
      cancelled: 0,
      waiting: 0
    }));
    notified += pendingRes.sent;
    return { checked, healed, notified };
  })().finally(() => {
    healthCheckInFlightPromise = null;
  });
  return healthCheckInFlightPromise;
}
var baileysWatchdogTimer = setInterval(() => {
  runBaileysPeriodicHealthCheck().catch(() => {
  });
}, 25e3);
baileysWatchdogTimer.unref?.();
var appNodeTaskTimer = null;
var interAppKeepaliveTimer = null;
async function shutdownBaileysManager(options) {
  if (baileysWatchdogTimer) {
    clearInterval(baileysWatchdogTimer);
    baileysWatchdogTimer = null;
  }
  if (appNodeTaskTimer) {
    clearInterval(appNodeTaskTimer);
    appNodeTaskTimer = null;
  }
  if (!options?.selfKilled) {
    clearInterval(ipKillCheckTimer);
    if (interAppKeepaliveTimer) {
      clearInterval(interAppKeepaliveTimer);
      interAppKeepaliveTimer = null;
    }
  }
  for (const buf of offlineCatchupBuffers.values()) {
    clearTimeout(buf.timer);
  }
  offlineCatchupBuffers.clear();
  for (const sid of Array.from(authBackupTimers.keys())) {
    clearSessionTimers(sid);
  }
  for (const sid of Array.from(reconnectTimers.keys())) {
    clearSessionTimers(sid);
  }
  const closeTasks = [];
  for (const [sid, sessionData] of activeSessions.entries()) {
    sessionData.superseded = true;
    sessionData.closedByApp = true;
    if (sessionData.stabilityTimer) {
      clearTimeout(sessionData.stabilityTimer);
      sessionData.stabilityTimer = void 0;
    }
    recordLastCloseTimestamp(sid);
    const cleanPhone = normalizePhoneNumber(sessionData.phoneNumber || getCredsPhoneOnDisk(sid) || "");
    closeTasks.push(closeSocketAndWait(sessionData.socket, sessionData, sid, 1400).catch(() => {
    }));
    if (isMysqlConfigured()) {
      closeTasks.push(
        deleteWaSessionLeaseFromMysql({
          sessionId: sid,
          phoneNumber: cleanPhone || void 0,
          expectedInstanceId: RUNTIME_INSTANCE_ID
        }).catch(() => {
        })
      );
    }
  }
  if (closeTasks.length > 0) {
    await Promise.race([
      Promise.allSettled(closeTasks).then(() => {
      }),
      delay(1800)
    ]);
  }
  activeSessions.clear();
  sessionStartLocks.clear();
  sessionConflictStates.clear();
  socketPingFailures.clear();
  missedCatchupLocks.clear();
  lastAuthBackupAt.clear();
  lastAuthBackupHashes.clear();
  commandState.clear();
  processedMessageIds.clear();
  recentBotOutgoingTexts.clear();
  incomingChatQueues.clear();
  for (const sid of Array.from(sessionUserDevicesCaches.keys())) {
    clearSessionCacheStores(sid);
  }
  if (options?.selfKilled) {
    await publishCurrentSocketRecord({ force: true, statusOverride: "killed" }).catch(() => {
    });
  } else {
    await publishCurrentSocketRecord({ force: true, statusOverride: "offline" }).catch(() => {
    });
  }
}
var isDrainingSuperadminQueue = false;
function resolveConnectedSuperadminSession() {
  const isAdminSession = (s) => {
    if (s.status !== "connected" || !s.socket || !isSocketTrulyOpen(s.socket)) return false;
    const ownerId = s.userId || getSessionById(s.sessionId)?.user_id;
    const owner = ownerId ? getUserById(ownerId) : null;
    return Boolean(owner && owner.role === "admin" && owner.is_active);
  };
  const candidates = Array.from(activeSessions.values()).filter(isAdminSession);
  if (candidates.length === 0) return null;
  return candidates.find((s) => s.is_primary) || candidates[0];
}
async function sendDirectlyViaSuperadminSocket(saSession, recipientPhone, text) {
  const cleanRecipient = normalizePhoneNumber(recipientPhone);
  if (!cleanRecipient || cleanRecipient.length < 8) {
    throw new Error(`Nomor WhatsApp tujuan tidak valid (${recipientPhone}).`);
  }
  const jid = `${cleanRecipient}@s.whatsapp.net`;
  recordBotOutgoing(text);
  if (typeof saSession.socket?.sendPresenceUpdate === "function") {
    void Promise.race([Promise.resolve().then(() => saSession.socket.sendPresenceUpdate("composing", jid)), delay(800)]).catch(() => {
    });
  }
  const result = await sendSocketMessageWithAckGuard(
    saSession.socket,
    jid,
    { text },
    { timeoutMs: 24e3, sessionData: saSession }
  );
  return result?.key?.id;
}
async function sendOrQueueViaSuperadminWa(params) {
  const cleanRecipient = normalizePhoneNumber(params.recipientPhone);
  if (!cleanRecipient || cleanRecipient.length < 8) {
    return {
      sent: false,
      queued: false,
      error: `Nomor WhatsApp tujuan tidak valid (${params.recipientPhone || "-"}).`
    };
  }
  let saSession = resolveConnectedSuperadminSession();
  if (!saSession) {
    const adminConnecting = Array.from(activeSessions.values()).find((s) => {
      if (s.status !== "connecting") return false;
      const ownerId = s.userId || getSessionById(s.sessionId)?.user_id;
      const owner = ownerId ? getUserById(ownerId) : null;
      return Boolean(owner && owner.role === "admin" && owner.is_active);
    });
    if (adminConnecting) {
      let tries = 0;
      while (tries < 6 && adminConnecting.status === "connecting") {
        await delay(500);
        tries++;
      }
      saSession = resolveConnectedSuperadminSession();
    }
  }
  if (saSession) {
    try {
      await sendDirectlyViaSuperadminSocket(saSession, cleanRecipient, params.message);
      console.log(
        `[Superadmin WA Direct] (${params.category}) Sent to ${cleanRecipient} via ${saSession.sessionId}`
      );
      if (params.category === "order_notification" && params.ownerUserId) {
        addMessageLog({
          wam_id: `sa_ord_${Date.now()}`,
          session_id: saSession.sessionId,
          user_id: params.ownerUserId,
          sender_phone: cleanRecipient,
          sender_name: `Owner Usaha (${cleanRecipient})`,
          message_body: `[Notifikasi Order ${params.invoiceNumber || ""}] Dikirim oleh Superadmin WA`.trim(),
          direction: "outgoing",
          status: "Sukses",
          reply_body: params.message.slice(0, 1200)
        });
      }
      return { sent: true, queued: false, sessionId: saSession.sessionId };
    } catch (err) {
      console.warn(
        `[Superadmin WA Queue Fallback] Gagal kirim langsung (${params.category}) ke ${cleanRecipient}: ${err?.message}. Memasukkan ke antrean...`
      );
      const queuedEntry2 = enqueueSuperadminWaMessage({
        recipient_phone: cleanRecipient,
        message: params.message,
        category: params.category,
        owner_user_id: params.ownerUserId,
        invoice_number: params.invoiceNumber,
        last_error: err?.message || "Gagal kirim langsung"
      });
      return { sent: false, queued: true, queueId: queuedEntry2.id, error: err?.message };
    }
  }
  const queuedEntry = enqueueSuperadminWaMessage({
    recipient_phone: cleanRecipient,
    message: params.message,
    category: params.category,
    owner_user_id: params.ownerUserId,
    invoice_number: params.invoiceNumber,
    last_error: "WhatsApp Superadmin belum terhubung"
  });
  console.log(
    `[Superadmin WA Queued] (${params.category}) Ditambahkan ke antrean untuk ${cleanRecipient} (ID: ${queuedEntry.id})`
  );
  return { sent: false, queued: true, queueId: queuedEntry.id };
}
async function drainSuperadminWaQueue(reason = "manual") {
  if (isDrainingSuperadminQueue) {
    return { processed: 0, sent: 0, failed: 0, remaining: getSuperadminWaQueue().length };
  }
  const initialQueue = getSuperadminWaQueue();
  if (initialQueue.length === 0) {
    return { processed: 0, sent: 0, failed: 0, remaining: 0 };
  }
  if (!resolveConnectedSuperadminSession()) {
    return { processed: 0, sent: 0, failed: 0, remaining: initialQueue.length };
  }
  isDrainingSuperadminQueue = true;
  let processed = 0;
  let sent = 0;
  let failed = 0;
  try {
    console.log(
      `[Superadmin WA Queue Drain:${reason}] Memproses ${initialQueue.length} pesan antrean secara perlahan (anti-ban)...`
    );
    for (let i = 0; i < initialQueue.length; i++) {
      const item = initialQueue[i];
      const liveSa = resolveConnectedSuperadminSession();
      if (!liveSa) {
        console.warn("[Superadmin WA Queue Drain] Koneksi WA Superadmin terputus saat menguras antrean; sisa pesan ditahan.");
        break;
      }
      processed++;
      try {
        if (item.category === "session_expired" && item.owner_user_id) {
          const sidFromInvoice = item.invoice_number?.startsWith(`exp_${item.owner_user_id}_`) ? item.invoice_number.slice(`exp_${item.owner_user_id}_`.length) : "";
          const stateCheck = verifyExpiredAlertState({
            userId: item.owner_user_id,
            sessionId: sidFromInvoice,
            expiredPhone: sidFromInvoice
          });
          if (stateCheck === "recovered") {
            removeSuperadminWaQueueItem(item.id);
            continue;
          }
          if (stateCheck === "wait") {
            continue;
          }
        }
        await sendDirectlyViaSuperadminSocket(liveSa, item.recipient_phone, item.message);
        removeSuperadminWaQueueItem(item.id);
        sent++;
        console.log(
          `[Superadmin WA Queue Drain] Terkirim (${i + 1}/${initialQueue.length}) -> ${item.recipient_phone} [${item.category}]`
        );
        if (item.category === "order_notification" && item.owner_user_id) {
          addMessageLog({
            wam_id: `sa_qord_${Date.now()}`,
            session_id: liveSa.sessionId,
            user_id: item.owner_user_id,
            sender_phone: item.recipient_phone,
            sender_name: `Owner Usaha (${item.recipient_phone})`,
            message_body: `[Notifikasi Order Antrean ${item.invoice_number || ""}] Dikirim oleh Superadmin WA`.trim(),
            direction: "outgoing",
            status: "Sukses",
            reply_body: item.message.slice(0, 1200)
          });
        }
      } catch (sendErr) {
        failed++;
        const nextAttempts = (item.attempts || 0) + 1;
        if (nextAttempts >= 8) {
          console.warn(
            `[Superadmin WA Queue Drain] Menghapus item antrean ${item.id} setelah ${nextAttempts}x gagal (${sendErr?.message}).`
          );
          removeSuperadminWaQueueItem(item.id);
        } else {
          updateSuperadminWaQueueItem(item.id, {
            attempts: nextAttempts,
            last_error: sendErr?.message || "Gagal kirim dari antrean"
          });
        }
      }
      if (i < initialQueue.length - 1) {
        const slowPaceMs = 3500 + crypto5.randomInt(0, 2500);
        await delay(slowPaceMs);
      }
    }
  } finally {
    isDrainingSuperadminQueue = false;
  }
  return {
    processed,
    sent,
    failed,
    remaining: getSuperadminWaQueue().length
  };
}
var lastClusterErrorAlertAt = /* @__PURE__ */ new Map();
var CLUSTER_ERROR_ALERT_COOLDOWN_MS = 15 * 60 * 1e3;
function isMultiNodeOrchestrationEnabled(sysConfig) {
  const nodes = getAppNodesConfig(sysConfig);
  return nodes.length > 0 || isAppIdEnvConfigured();
}
function countLocalOccupiedConnections(excludeSessionId) {
  const occupiedKeys = /* @__PURE__ */ new Set();
  const now = Date.now();
  for (const [sid, mem] of activeSessions.entries()) {
    if (excludeSessionId && sid === excludeSessionId) continue;
    if (mem.superseded) continue;
    const isConn = mem.status === "connected" && (!mem.socket || isSocketTrulyOpen(mem.socket));
    const isConnecting = mem.status === "connecting" && now - mem.lastUpdated < 12e4;
    if (isConn || isConnecting) {
      occupiedKeys.add(sid);
    }
  }
  for (const sid of sessionStartLocks.keys()) {
    if (excludeSessionId && sid === excludeSessionId) continue;
    occupiedKeys.add(sid);
  }
  const currentAppId = getCurrentAppId();
  for (const s of getWhatsAppSessions()) {
    if (!s?.id || excludeSessionId && s.id === excludeSessionId) continue;
    if (s.expires_at && Date.parse(s.expires_at) < now) continue;
    const assignedApp = normalizeAppId(s.assigned_app_id);
    const connectedApp = normalizeAppId(s.connected_app_id);
    if (assignedApp !== currentAppId && connectedApp !== currentAppId) continue;
    const buildingAt = s.last_assignment_at ? Date.parse(s.last_assignment_at) : 0;
    const isFreshBuilding = s.assignment_status === "building" && (!buildingAt || now - buildingAt < 12e4);
    const isConnectedOwned = s.assignment_status === "connected" || s.status === "connected" && s.assignment_status !== "error" && s.assignment_status !== "delegated";
    if (isConnectedOwned || isFreshBuilding) {
      occupiedKeys.add(s.id);
    }
  }
  return occupiedKeys.size;
}
function getCurrentNodeMaxConnections(sysConfig, dbNodesFromMysql) {
  const cfg = sysConfig || getSystemConfig();
  const configuredNodes = getAppNodesConfig(cfg);
  const currentAppId = getCurrentAppId();
  if (configuredNodes.length > 0) {
    const match = configuredNodes.find((n) => n.app_id === currentAppId);
    if (!match) return 0;
    return match.is_active === false ? 0 : Math.max(1, match.max_connections);
  }
  if (Array.isArray(dbNodesFromMysql) && dbNodesFromMysql.length > 0) {
    const match = dbNodesFromMysql.find((n) => n.app_id === currentAppId);
    if (match) {
      return match.is_active === false ? 0 : Math.max(1, match.max_connections);
    }
  }
  return getMaxGlobalSessions(cfg);
}
function resolveEffectiveAssignedAppId(session, owner) {
  if (session?.assignment_status === "released") {
    return "";
  }
  const sessionApp = normalizeAppId(session?.assigned_app_id);
  if (sessionApp) return sessionApp;
  const resolvedOwner = owner ?? (session?.user_id ? getUserById(session.user_id) : void 0);
  return normalizeAppId(resolvedOwner?.assigned_app_id);
}
function isSessionOwnedByCurrentAppNode(session, sysConfig, owner) {
  if (isSelfKilledByIpRule) return false;
  if (session?.assignment_status === "released") return false;
  const effectiveApp = resolveEffectiveAssignedAppId(session, owner);
  if (effectiveApp) {
    return effectiveApp === getCurrentAppId();
  }
  if (!isMultiNodeOrchestrationEnabled(sysConfig)) return true;
  return true;
}
function buildEffectiveClusterNodes(params) {
  const cfg = params.sysConfig || getSystemConfig();
  const configured = getAppNodesConfig(cfg);
  const currentAppId = getCurrentAppId();
  const mysqlMap = new Map(
    (params.dbNodesFromMysql || []).map((n) => [normalizeAppId(n.app_id), n])
  );
  const nodeMap = /* @__PURE__ */ new Map();
  const localConnectedCount = Array.from(activeSessions.values()).filter(
    (s) => !s.superseded && s.status === "connected" && (!s.socket || isSocketTrulyOpen(s.socket))
  ).length;
  const localConnectingCount = Array.from(activeSessions.values()).filter(
    (s) => !s.superseded && s.status === "connecting" && Date.now() - s.lastUpdated < 12e4
  ).length;
  for (const cfgNode of configured) {
    const rt = mysqlMap.get(cfgNode.app_id);
    const isSelf = cfgNode.app_id === currentAppId;
    nodeMap.set(cfgNode.app_id, {
      app_id: cfgNode.app_id,
      name: cfgNode.name || rt?.name,
      max_connections: Math.max(1, cfgNode.max_connections),
      is_active: cfgNode.is_active !== false,
      active_connections: isSelf ? countLocalOccupiedConnections() : rt?.active_connections || 0,
      connecting_connections: isSelf ? localConnectingCount : rt?.connecting_connections || 0,
      hostname: isSelf ? RUNTIME_HOSTNAME : rt?.hostname,
      domain: isSelf ? getCachedOrFallbackIdentity().domain : rt?.domain,
      server_ip: isSelf ? getCachedOrFallbackIdentity().serverIp : rt?.server_ip,
      last_heartbeat_at: isSelf ? (/* @__PURE__ */ new Date()).toISOString() : rt?.last_heartbeat_at,
      updated_at: cfgNode.updated_at || rt?.updated_at,
      online: isSelf ? true : Boolean(rt?.online)
    });
  }
  for (const rt of params.dbNodesFromMysql || []) {
    const id = normalizeAppId(rt.app_id);
    if (!id || nodeMap.has(id)) continue;
    if (configured.length === 0) {
      const isSelf = id === currentAppId;
      nodeMap.set(id, {
        ...rt,
        app_id: id,
        active_connections: isSelf ? countLocalOccupiedConnections() : rt.active_connections,
        connecting_connections: isSelf ? localConnectingCount : rt.connecting_connections,
        online: isSelf ? true : rt.online
      });
    }
  }
  if (nodeMap.size === 0 && isAppIdEnvConfigured()) {
    nodeMap.set(currentAppId, {
      app_id: currentAppId,
      name: `Server ${currentAppId}`,
      max_connections: getMaxGlobalSessions(cfg),
      is_active: true,
      active_connections: countLocalOccupiedConnections(),
      connecting_connections: localConnectingCount,
      hostname: RUNTIME_HOSTNAME,
      domain: getCachedOrFallbackIdentity().domain,
      server_ip: getCachedOrFallbackIdentity().serverIp,
      last_heartbeat_at: (/* @__PURE__ */ new Date()).toISOString(),
      online: true
    });
  }
  const activeLeasesByApp = /* @__PURE__ */ new Map();
  const now = Date.now();
  for (const lease of Object.values(params.leases || {})) {
    const lid = normalizeAppId(lease?.app_id);
    if (!lid || !lease?.session_id) continue;
    if (now - (Number(lease.heartbeat_at) || 0) > REMOTE_LEASE_FRESH_MS) continue;
    if (!activeLeasesByApp.has(lid)) activeLeasesByApp.set(lid, /* @__PURE__ */ new Set());
    activeLeasesByApp.get(lid).add(lease.session_id);
  }
  const assignedPendingByApp = /* @__PURE__ */ new Map();
  for (const s of params.sessions || []) {
    if (!s?.id) continue;
    const targetApp = normalizeAppId(s.assigned_app_id);
    const connApp = normalizeAppId(s.connected_app_id);
    if (connApp && s.status === "connected") {
      if (!activeLeasesByApp.has(connApp)) activeLeasesByApp.set(connApp, /* @__PURE__ */ new Set());
      activeLeasesByApp.get(connApp).add(s.id);
    }
    if (targetApp && (s.assignment_status === "delegated" || s.assignment_status === "pending" || s.assignment_status === "building")) {
      if (!assignedPendingByApp.has(targetApp)) assignedPendingByApp.set(targetApp, /* @__PURE__ */ new Set());
      assignedPendingByApp.get(targetApp).add(s.id);
    }
  }
  for (const node of nodeMap.values()) {
    const isSelf = node.app_id === currentAppId;
    const leaseCount = activeLeasesByApp.get(node.app_id)?.size || 0;
    const pendingCount = assignedPendingByApp.get(node.app_id)?.size || 0;
    if (isSelf) {
      node.active_connections = Math.max(localConnectedCount + localConnectingCount, countLocalOccupiedConnections());
    } else {
      node.active_connections = Math.max(node.active_connections || 0, leaseCount) + pendingCount;
    }
  }
  return Array.from(nodeMap.values());
}
function selectEligibleDelegationTarget(nodes, excludedAppIds, options) {
  const candidates = nodes.filter((n) => {
    const appId = normalizeAppId(n.app_id);
    if (!appId) return false;
    if (n.is_active === false) return false;
    if (excludedAppIds.has(appId)) return false;
    return (n.active_connections || 0) < Math.max(1, n.max_connections || 1);
  });
  if (candidates.length === 0) return null;
  const preferEmpty = options?.preferEmptyFirst !== false;
  candidates.sort((a, b) => {
    const onlineA = a.online ? 0 : 1;
    const onlineB = b.online ? 0 : 1;
    if (onlineA !== onlineB) return onlineA - onlineB;
    if (preferEmpty) {
      const emptyA = (a.active_connections || 0) === 0 ? 0 : 1;
      const emptyB = (b.active_connections || 0) === 0 ? 0 : 1;
      if (emptyA !== emptyB) return emptyA - emptyB;
    }
    const ratioA = (a.active_connections || 0) / Math.max(1, a.max_connections || 1);
    const ratioB = (b.active_connections || 0) / Math.max(1, b.max_connections || 1);
    if (ratioA !== ratioB) return ratioA - ratioB;
    return (a.active_connections || 0) - (b.active_connections || 0);
  });
  return candidates[0];
}
async function releaseLocalSocketForDelegation(sessionId) {
  if (!sessionId) return;
  clearSessionTimers(sessionId);
  const mem = activeSessions.get(sessionId);
  if (mem) {
    mem.superseded = true;
    mem.closedByApp = true;
    if (mem.socket) {
      await closeSocketAndWait(mem.socket, mem, sessionId, 1600).catch(() => {
      });
    }
    mem.detachRawHandlers?.();
    clearMetaAiSession(sessionId);
    if (activeSessions.get(sessionId) === mem) {
      activeSessions.delete(sessionId);
    }
  }
  removeLocalRuntimeLease(sessionId, RUNTIME_INSTANCE_ID);
  lastLeaseRefreshAt.delete(sessionId);
  deleteWaSessionLeaseFromMysql({
    sessionId,
    expectedInstanceId: RUNTIME_INSTANCE_ID
  }).catch(() => {
  });
  void publishCurrentSocketRecord({ force: true }).catch(() => {
  });
}
async function delegateSessionToNextNodeOrError(session, reason, opts) {
  const sysConfig = getSystemConfig();
  const currentAppId = getCurrentAppId();
  const allSessions = getWhatsAppSessions();
  const nodes = buildEffectiveClusterNodes({
    sysConfig,
    dbNodesFromMysql: opts.dbNodes,
    sessions: allSessions,
    leases: opts.leases || {}
  });
  const prevFailed = Array.isArray(session.failed_app_ids) ? session.failed_app_ids.map(normalizeAppIdValue).filter(Boolean) : [];
  const nextFailedIds = opts.markCurrentFailed ? Array.from(/* @__PURE__ */ new Set([...prevFailed, currentAppId])) : prevFailed;
  const excluded = /* @__PURE__ */ new Set([...prevFailed, ...nextFailedIds, currentAppId]);
  const target = selectEligibleDelegationTarget(nodes, excluded);
  const nowIso = (/* @__PURE__ */ new Date()).toISOString();
  await releaseLocalSocketForDelegation(session.id).catch(() => {
  });
  if (target) {
    const cleanReason = String(reason || `Dialihkan dari ${currentAppId}`).slice(0, 500);
    updateSession(session.id, {
      assigned_app_id: target.app_id,
      connected_app_id: "",
      failed_app_ids: nextFailedIds,
      assignment_status: "delegated",
      assignment_error: cleanReason,
      last_assignment_at: nowIso
    });
    await updateSessionAssignmentInMysql(session.id, {
      assigned_app_id: target.app_id,
      connected_app_id: "",
      failed_app_ids: nextFailedIds,
      assignment_status: "delegated",
      assignment_error: cleanReason,
      last_assignment_at: nowIso
    });
    console.log(
      `[Cluster Orchestration] Sesi ${session.id} (+${session.phone_number || "-"}) didelegasikan: ${currentAppId} -> ${target.app_id} (${cleanReason})`
    );
    return { delegatedTo: target.app_id, exhausted: false };
  }
  const finalError = `${reason || "Gagal membangun koneksi"} (Semua server penuh atau gagal: ${Array.from(excluded).join(", ")})`;
  updateSession(session.id, {
    assigned_app_id: "",
    connected_app_id: "",
    failed_app_ids: nextFailedIds,
    assignment_status: "error",
    assignment_error: finalError.slice(0, 800),
    last_assignment_at: nowIso,
    status: "disconnected"
  });
  await updateSessionAssignmentInMysql(session.id, {
    assigned_app_id: "",
    connected_app_id: "",
    failed_app_ids: nextFailedIds,
    assignment_status: "error",
    assignment_error: finalError.slice(0, 800),
    last_assignment_at: nowIso,
    status: "disconnected"
  });
  console.error(
    `[Cluster Orchestration] ERROR: Sesi ${session.id} (+${session.phone_number || "-"}) gagal di semua server (${Array.from(excluded).join(", ")}).`
  );
  const notifyPhone = resolveClusterNotifyPhone(sysConfig);
  const lastAlertAt = lastClusterErrorAlertAt.get(session.id) || 0;
  if (Date.now() - lastAlertAt >= CLUSTER_ERROR_ALERT_COOLDOWN_MS) {
    lastClusterErrorAlertAt.set(session.id, Date.now());
    const owner = session.user_id ? getUserById(session.user_id) : null;
    if (notifyPhone) {
      const alertText = `\u{1F6A8} *PERINGATAN CLUSTER GATEWAY*

Sesi WhatsApp gagal dihubungkan pada seluruh server yang tersedia.
\u2022 Nomor WA: +${session.phone_number || "-"}
\u2022 Sesi: ${session.session_name || session.id}
\u2022 Pemilik: ${owner ? `${owner.name} (@${owner.username})` : session.user_id || "-"}
\u2022 Server Dicoba: ${Array.from(excluded).join(", ")}
\u2022 Keterangan: ${reason || "Gagal membangun socket Baileys / kapasitas penuh"}

Silakan periksa menu *Server & Monitor Koneksi* di Superadmin.`;
      await sendOrQueueViaSuperadminWa({
        recipientPhone: notifyPhone,
        message: alertText,
        category: "cluster_alert",
        ownerUserId: session.user_id,
        invoiceNumber: `cl_${session.id}`
      }).catch(() => {
      });
    }
    void sendTelegramAlert({
      title: "Koneksi WA Gagal di Semua Node Cluster",
      severity: "critical",
      dedupKey: `cluster_exhausted_${session.id}`,
      cooldownMs: CLUSTER_ERROR_ALERT_COOLDOWN_MS,
      lines: [
        `\u2022 Nomor WA: <code>+${escapeTelegramHtml(session.phone_number || "-")}</code>`,
        `\u2022 Sesi: ${escapeTelegramHtml(session.session_name || session.id)}`,
        `\u2022 Pemilik: ${escapeTelegramHtml(owner ? `${owner.name} (@${owner.username})` : session.user_id || "-")}`,
        `\u2022 Node Dicoba: <code>${escapeTelegramHtml(Array.from(excluded).join(", ") || "-")}</code>`,
        `\u2022 Penyebab: ${escapeTelegramHtml(reason || "Gagal membangun socket Baileys / kapasitas penuh")}`
      ]
    }).catch(() => {
    });
  }
  return { delegatedTo: null, exhausted: true, errorMessage: finalError };
}
var INTER_APP_PING_INTERVAL_MS = 2e4;
var DEAD_NODE_STALE_MS = 9e4;
var peerPingStates = /* @__PURE__ */ new Map();
var lastKeepaliveRoundAt = "";
var lastInboundPingAt = "";
var lastInboundPingFrom = "";
var interAppKeepaliveInFlight = false;
function isSafePeerOriginUrl(rawUrl) {
  const s = String(rawUrl || "").trim();
  if (!s || s.length > 300) return null;
  const candidate = s.includes("://") ? s : `https://${s}`;
  try {
    const u = new URL(candidate);
    if (u.protocol !== "https:" && u.protocol !== "http:") return null;
    const host = u.hostname.toLowerCase();
    if (!host || host === "localhost" || host === "127.0.0.1" || host === "::1" || host === "0.0.0.0" || host === "::" || host === "169.254.169.254" || host === "metadata.google.internal" || host === "metadata" || host === "100.100.100.200" || host.startsWith("169.254.") || host.endsWith(".internal")) {
      return null;
    }
    return u.origin;
  } catch {
    return null;
  }
}
function collectPeerOriginsFromCluster(params) {
  const currentAppId = getCurrentAppId();
  const byApp = /* @__PURE__ */ new Map();
  const now = Date.now();
  for (const sock of params.dbSockets || []) {
    if (!sock || sock.instance_id === RUNTIME_INSTANCE_ID) continue;
    if (sock.status === "killed") continue;
    const hbMs = sock.last_heartbeat_at ? Date.parse(sock.last_heartbeat_at) : 0;
    if (!sock.online && (!hbMs || now - hbMs > 18e4)) continue;
    const origin = isSafePeerOriginUrl(sock.domain || "");
    if (!origin) continue;
    if (params.selfOrigin && origin === params.selfOrigin) continue;
    const appId = normalizeAppId(sock.app_id) || sock.instance_id;
    if (appId === currentAppId) continue;
    const existing = byApp.get(appId);
    const conns = Number(sock.active_connections || 0);
    if (!existing || conns >= existing.peerConnections) {
      byApp.set(appId, { appId, origin, peerConnections: conns });
    }
  }
  for (const node of params.dbNodes || []) {
    const appId = normalizeAppId(node.app_id);
    if (!appId || appId === currentAppId || byApp.has(appId)) continue;
    if (node.is_active === false) continue;
    const hbMs = node.last_heartbeat_at ? Date.parse(node.last_heartbeat_at) : 0;
    if (!node.online && (!hbMs || now - hbMs > 18e4)) continue;
    const origin = isSafePeerOriginUrl(node.domain || "");
    if (!origin) continue;
    if (params.selfOrigin && origin === params.selfOrigin) continue;
    byApp.set(appId, {
      appId,
      origin,
      peerConnections: Number(node.active_connections || 0)
    });
  }
  const localConns = countLocalOccupiedConnections();
  return Array.from(byApp.values()).sort((a, b) => {
    const aContrast = localConns === 0 ? a.peerConnections > 0 ? 0 : 1 : a.peerConnections === 0 ? 0 : 1;
    const bContrast = localConns === 0 ? b.peerConnections > 0 ? 0 : 1 : b.peerConnections === 0 ? 0 : 1;
    if (aContrast !== bContrast) return aContrast - bContrast;
    return a.appId.localeCompare(b.appId);
  });
}
async function pingSinglePeerClusterOrigin(params) {
  const startedAt = Date.now();
  const currentAppId = getDisplayAppId();
  const token = signToken(
    JSON.stringify({
      typ: "cluster_ping",
      fromApp: currentAppId,
      fromInstance: RUNTIME_INSTANCE_ID,
      ts: startedAt
    })
  );
  try {
    const res = await fetch(`${params.origin}/api/cluster/ping`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Cluster-Ping-Token": token
      },
      body: JSON.stringify({
        from_app_id: currentAppId,
        from_instance_id: RUNTIME_INSTANCE_ID,
        active_connections: countLocalOccupiedConnections(),
        trigger_tick: Boolean(params.triggerTick)
      }),
      signal: AbortSignal.timeout(params.timeoutMs || 4500)
    });
    const latencyMs = Date.now() - startedAt;
    const body = await res.json().catch(() => null);
    if (!res.ok || !body?.ok) {
      return { ok: false, latencyMs, error: body?.error || `HTTP ${res.status}` };
    }
    return {
      ok: true,
      killed: Boolean(body.killed),
      latencyMs
    };
  } catch (err) {
    return {
      ok: false,
      latencyMs: Date.now() - startedAt,
      error: err?.message ? String(err.message).slice(0, 120) : "Timeout / unreachable"
    };
  }
}
function handleIncomingClusterPing(opts) {
  lastInboundPingAt = (/* @__PURE__ */ new Date()).toISOString();
  lastInboundPingFrom = String(opts.fromApp || opts.fromInstance || "peer").slice(0, 64);
  if (opts.triggerTick && !isSelfKilledByIpRule && !isBaileysStartupPending()) {
    setTimeout(() => {
      runAppNodeAssignmentTick("peer_ping_trigger").catch(() => {
      });
    }, 350).unref?.();
  }
  return {
    ok: true,
    app_id: getDisplayAppId(),
    instance_id: RUNTIME_INSTANCE_ID,
    active_connections: countLocalOccupiedConnections(),
    killed: isSelfKilledByIpRule,
    timestamp: lastInboundPingAt
  };
}
function getInterAppPingStatus() {
  return {
    enabled: Boolean(interAppKeepaliveTimer),
    interval_ms: INTER_APP_PING_INTERVAL_MS,
    last_round_at: lastKeepaliveRoundAt || void 0,
    last_inbound_ping_at: lastInboundPingAt || void 0,
    last_inbound_ping_from: lastInboundPingFrom || void 0,
    local_active_connections: countLocalOccupiedConnections(),
    peers: Array.from(peerPingStates.values())
  };
}
async function runInterAppKeepaliveTick() {
  if (interAppKeepaliveInFlight || isBaileysStartupPending()) return;
  interAppKeepaliveInFlight = true;
  try {
    if (isSelfKilledByIpRule) {
      await checkAndEnforceIpKillSwitch("killed_recovery_poll").catch(() => {
      });
      return;
    }
    const identity = await resolveCurrentServerIdentity().catch(() => getCachedOrFallbackIdentity());
    const selfOrigin = isSafePeerOriginUrl(identity.domain || resolvePublicAppBaseUrl() || "") || void 0;
    const currentAppId = getCurrentAppId();
    const displayAppId = getDisplayAppId();
    let dbSockets = [];
    let dbNodes = [];
    if (isMysqlConfigured()) {
      await publishCurrentSocketRecord({ force: true }).catch(() => {
      });
      const sysCfg = getSystemConfig();
      const snap = await fetchLiveClusterSnapshotFromMysql().catch(() => null);
      if (snap) {
        applyLiveClusterSnapshotToDb(snap);
        dbSockets = snap.sockets || [];
        dbNodes = snap.nodes || [];
      }
      const maxConnForHb = getCurrentNodeMaxConnections(sysCfg, dbNodes);
      const configuredNode = getAppNodesConfig(sysCfg).find((n) => n.app_id === currentAppId);
      const localConnecting = Array.from(activeSessions.values()).filter(
        (s) => !s.superseded && s.status === "connecting" && Date.now() - s.lastUpdated < 12e4
      ).length;
      await upsertAppNodeHeartbeatToMysql({
        app_id: currentAppId,
        name: configuredNode?.name,
        max_connections: configuredNode?.max_connections ?? maxConnForHb,
        is_active: configuredNode ? configuredNode.is_active !== false : true,
        active_connections: countLocalOccupiedConnections(),
        connecting_connections: localConnecting,
        hostname: identity.hostname,
        domain: identity.domain,
        server_ip: identity.serverIp
      }).catch(() => {
      });
    }
    const peers = collectPeerOriginsFromCluster({ dbSockets, dbNodes, selfOrigin });
    lastKeepaliveRoundAt = (/* @__PURE__ */ new Date()).toISOString();
    for (const peer of peers) {
      const pingRes = await pingSinglePeerClusterOrigin({
        appId: peer.appId,
        origin: peer.origin,
        triggerTick: false,
        timeoutMs: 4500
      });
      const prev = peerPingStates.get(peer.appId);
      const nowIso = (/* @__PURE__ */ new Date()).toISOString();
      if (pingRes.ok && !pingRes.killed) {
        peerPingStates.set(peer.appId, {
          appId: peer.appId,
          origin: peer.origin,
          peerConnections: peer.peerConnections,
          lastOk: true,
          lastPingAt: nowIso,
          lastSuccessAt: nowIso,
          consecutiveFailures: 0,
          lastLatencyMs: pingRes.latencyMs
        });
        if (isMysqlConfigured()) {
          void clearDeadAppFailoverClaimInMysql(peer.appId).catch(() => {
          });
        }
      } else {
        const nextFails = (prev?.consecutiveFailures || 0) + 1;
        peerPingStates.set(peer.appId, {
          appId: peer.appId,
          origin: peer.origin,
          peerConnections: peer.peerConnections,
          lastOk: false,
          lastPingAt: nowIso,
          lastSuccessAt: prev?.lastSuccessAt,
          consecutiveFailures: nextFails,
          lastLatencyMs: pingRes.latencyMs,
          lastError: pingRes.killed ? "Socket killed" : pingRes.error
        });
        if (nextFails === 3) {
          void sendTelegramAlert({
            title: `Ping Antar-App Gagal (${peer.appId})`,
            severity: "warn",
            dedupKey: `peer_ping_fail_${peer.appId}`,
            cooldownMs: 3e5,
            lines: [
              `\u2022 Node Tujuan: <code>${escapeTelegramHtml(peer.appId)}</code>`,
              `\u2022 Origin: <code>${escapeTelegramHtml(peer.origin)}</code>`,
              `\u2022 Pengirim Ping: <code>${escapeTelegramHtml(displayAppId)}</code>`,
              `\u2022 Gagal Berturut: ${nextFails}x`,
              `\u2022 Error: ${escapeTelegramHtml(pingRes.killed ? "Socket dimatikan (killed)" : pingRes.error || "Tidak merespons")}`
            ]
          }).catch(() => {
          });
        }
      }
    }
  } finally {
    interAppKeepaliveInFlight = false;
  }
}
function computeSessionFailoverPriority(sess, owner, plansById) {
  const isPrimary = Boolean(sess.is_primary);
  if (owner?.role === "admin") {
    return { tier: 0, tierLabel: "SUPERADMIN", price: Number.MAX_SAFE_INTEGER, isPrimary };
  }
  const planId = String(owner?.plan_id || "free").trim();
  const planPrice = Number(plansById.get(planId)?.price || 0);
  const isPaidActive = Boolean(
    owner && owner.plan_status === "active" && planId !== "free" && planPrice > 0
  );
  if (isPaidActive) {
    return { tier: 1, tierLabel: "PREMIUM", price: planPrice, isPrimary };
  }
  return { tier: 2, tierLabel: "GRATIS", price: 0, isPrimary };
}
function sortSessionsByFailoverPriority(sessions, getOwnerFn, plansById) {
  return [...sessions].sort((a, b) => {
    const ownerA = a.user_id ? getOwnerFn(a.user_id) : void 0;
    const ownerB = b.user_id ? getOwnerFn(b.user_id) : void 0;
    const pA = computeSessionFailoverPriority(a, ownerA, plansById);
    const pB = computeSessionFailoverPriority(b, ownerB, plansById);
    if (pA.tier !== pB.tier) return pA.tier - pB.tier;
    if (pA.price !== pB.price) return pB.price - pA.price;
    if (pA.isPrimary !== pB.isPrimary) return pA.isPrimary ? -1 : 1;
    const tsA = a.connected_at ? Date.parse(a.connected_at) : 0;
    const tsB = b.connected_at ? Date.parse(b.connected_at) : 0;
    if (tsA !== tsB) return tsA - tsB;
    return a.id.localeCompare(b.id);
  });
}
async function detectAndMigrateDeadNodeSessions(params) {
  const currentAppId = getCurrentAppId();
  const displayAppId = getDisplayAppId();
  const sysConfig = getSystemConfig();
  const allSessions = getWhatsAppSessions();
  const now = Date.now();
  if (!isMultiNodeOrchestrationEnabled(sysConfig) && params.dbSockets.length <= 1 && params.dbNodes.length <= 1) {
    return;
  }
  const socketsByApp = /* @__PURE__ */ new Map();
  for (const sock of params.dbSockets) {
    const appId = normalizeAppId(sock.app_id);
    if (!appId) continue;
    const arr = socketsByApp.get(appId) || [];
    arr.push(sock);
    socketsByApp.set(appId, arr);
  }
  const nodeByApp = /* @__PURE__ */ new Map();
  for (const node of params.dbNodes) {
    const appId = normalizeAppId(node.app_id);
    if (!appId) continue;
    nodeByApp.set(appId, node);
  }
  const onlineActiveAppIds = /* @__PURE__ */ new Set();
  if (!isSelfKilledByIpRule) {
    onlineActiveAppIds.add(currentAppId);
  }
  for (const [appId, arr] of socketsByApp.entries()) {
    const hasFreshActiveSock = arr.some((s) => {
      if (s.status === "killed") return false;
      const hbMs = s.last_heartbeat_at ? Date.parse(s.last_heartbeat_at) : 0;
      return s.status === "active" && Boolean(hbMs && now - hbMs <= DEAD_NODE_STALE_MS);
    });
    if (hasFreshActiveSock) onlineActiveAppIds.add(appId);
  }
  for (const [appId, n] of nodeByApp.entries()) {
    if (n.is_active === false) continue;
    const allKilled = (socketsByApp.get(appId) || []).length > 0 && (socketsByApp.get(appId) || []).every((s) => s.status === "killed");
    if (allKilled) continue;
    const hbMs = n.last_heartbeat_at ? Date.parse(n.last_heartbeat_at) : 0;
    if (n.online || hbMs && now - hbMs <= DEAD_NODE_STALE_MS) {
      onlineActiveAppIds.add(appId);
    }
  }
  const sortedOnlineLeaders = Array.from(onlineActiveAppIds).sort();
  if (sortedOnlineLeaders.length === 0 || sortedOnlineLeaders[0] !== currentAppId) {
    return;
  }
  const candidateAppIds = /* @__PURE__ */ new Set();
  for (const appId of socketsByApp.keys()) {
    if (appId !== currentAppId && !onlineActiveAppIds.has(appId)) candidateAppIds.add(appId);
  }
  for (const appId of nodeByApp.keys()) {
    if (appId !== currentAppId && !onlineActiveAppIds.has(appId)) candidateAppIds.add(appId);
  }
  for (const s of allSessions) {
    if (!s || s.assignment_status === "released" || s.assignment_status === "error") continue;
    const cApp = normalizeAppId(s.connected_app_id);
    const aApp = normalizeAppId(s.assigned_app_id);
    if (cApp && cApp !== currentAppId && !onlineActiveAppIds.has(cApp)) candidateAppIds.add(cApp);
    if (aApp && aApp !== currentAppId && !onlineActiveAppIds.has(aApp)) candidateAppIds.add(aApp);
  }
  if (candidateAppIds.size === 0) return;
  const plansById = /* @__PURE__ */ new Map();
  for (const p of getSubscriptionPlans()) {
    plansById.set(p.id, { price: Number(p.price || 0) });
  }
  for (const deadAppId of candidateAppIds) {
    const appSockets = socketsByApp.get(deadAppId) || [];
    const appNode = nodeByApp.get(deadAppId);
    const isKilledSocket = appSockets.length > 0 && appSockets.every((s) => s.status === "killed");
    const latestHbMs = Math.max(
      appNode?.last_heartbeat_at ? Date.parse(appNode.last_heartbeat_at) : 0,
      ...appSockets.map((s) => s.last_heartbeat_at ? Date.parse(s.last_heartbeat_at) : 0),
      0
    );
    const isConfirmedStale = isKilledSocket || (latestHbMs > 0 ? now - latestHbMs >= DEAD_NODE_STALE_MS : appNode?.online === false);
    if (!isConfirmedStale) continue;
    if (!isKilledSocket) {
      const peerDomain = appSockets.find((s) => isSafePeerOriginUrl(s.domain || ""))?.domain || appNode?.domain || "";
      const safeOrigin = isSafePeerOriginUrl(peerDomain);
      if (safeOrigin) {
        const probe = await pingSinglePeerClusterOrigin({
          appId: deadAppId,
          origin: safeOrigin,
          triggerTick: false,
          timeoutMs: 3500
        });
        if (probe.ok && !probe.killed) {
          continue;
        }
      }
    }
    const affectedSessions = allSessions.filter((s) => {
      if (!s?.id) return false;
      if (s.assignment_status === "released" || s.assignment_status === "error") return false;
      if (s.expires_at && Date.parse(s.expires_at) < now) return false;
      const owner = resolveActiveVerifiedOwner(s.id, s.user_id, s.phone_number);
      if (!isOwnerActiveAndRegistered(owner)) return false;
      const connApp = normalizeAppId(s.connected_app_id);
      const assignApp = normalizeAppId(s.assigned_app_id);
      return connApp === deadAppId || assignApp === deadAppId;
    });
    if (affectedSessions.length === 0) {
      void sendTelegramAlert({
        title: `App Node ${deadAppId} Offline / Mati`,
        severity: isKilledSocket ? "critical" : "warn",
        dedupKey: `node_offline_${deadAppId}`,
        cooldownMs: 6e5,
        lines: [
          `\u2022 Node Mati: <code>${escapeTelegramHtml(deadAppId)}</code>`,
          `\u2022 Status: ${isKilledSocket ? "Dimatikan (Kill IP)" : "Offline / Heartbeat Terhenti"}`,
          `\u2022 Dideteksi Oleh: <code>${escapeTelegramHtml(displayAppId)}</code>`,
          `\u2022 Sesi WA Terdampak: 0 (tidak ada sesi perlu dipindah).`
        ]
      }).catch(() => {
      });
      continue;
    }
    if (isMysqlConfigured()) {
      const claimed = await claimDeadAppFailoverInMysql(deadAppId, currentAppId, 9e4).catch(() => false);
      if (!claimed) continue;
    }
    const effectiveNodes = buildEffectiveClusterNodes({
      sysConfig,
      dbNodesFromMysql: params.dbNodes,
      sessions: allSessions,
      leases: params.leases
    });
    const workingNodes = effectiveNodes.filter((n) => n.app_id !== deadAppId && onlineActiveAppIds.has(n.app_id) && n.is_active !== false).map((n) => ({
      ...n,
      online: true,
      active_connections: Math.max(0, Number(n.active_connections || 0))
    }));
    const prioritizedSessions = sortSessionsByFailoverPriority(
      affectedSessions,
      (uid) => uid ? getUserById(uid) : void 0,
      plansById
    );
    const succeededList = [];
    const failedList = [];
    const targetOriginsToKick = /* @__PURE__ */ new Set();
    const nowIso = (/* @__PURE__ */ new Date()).toISOString();
    for (const s of prioritizedSessions) {
      const owner = resolveActiveVerifiedOwner(s.id, s.user_id, s.phone_number);
      const prio = computeSessionFailoverPriority(s, owner, plansById);
      const cleanPhone = normalizePhoneNumber(s.phone_number || getCredsPhoneOnDisk(s.id) || "");
      const phoneLabel = cleanPhone ? `+${cleanPhone}` : s.id;
      const excluded = /* @__PURE__ */ new Set([deadAppId]);
      const target = selectEligibleDelegationTarget(workingNodes, excluded, { preferEmptyFirst: true });
      if (target) {
        target.active_connections = (target.active_connections || 0) + 1;
        const moveReason = `Auto-failover: ${deadAppId} ${isKilledSocket ? "dimatikan" : "mati/offline"} -> dipindah ke ${target.app_id}`;
        updateSession(s.id, {
          status: "disconnected",
          assigned_app_id: target.app_id,
          assigned_server_ip: void 0,
          connected_app_id: "",
          connected_server_ip: void 0,
          failed_app_ids: Array.from(/* @__PURE__ */ new Set([...(s.failed_app_ids || []).map(normalizeAppIdValue).filter(Boolean), deadAppId])),
          assignment_status: "delegated",
          assignment_error: moveReason.slice(0, 500),
          last_assignment_at: nowIso
        });
        await updateSessionAssignmentInMysql(s.id, {
          status: "disconnected",
          assigned_app_id: target.app_id,
          assigned_server_ip: "",
          connected_app_id: "",
          connected_server_ip: "",
          failed_app_ids: Array.from(/* @__PURE__ */ new Set([...(s.failed_app_ids || []).map(normalizeAppIdValue).filter(Boolean), deadAppId])),
          assignment_status: "delegated",
          assignment_error: moveReason.slice(0, 500),
          last_assignment_at: nowIso
        }).catch(() => {
        });
        if (owner && normalizeAppId(owner.assigned_app_id) === deadAppId) {
          updateUser(owner.id, { assigned_app_id: target.app_id });
          if (isMysqlConfigured()) {
            void pushUserAssignedAppToMysql(owner.id, target.app_id).catch(() => {
            });
          }
        }
        if (isMysqlConfigured()) {
          void deleteWaSessionLeaseFromMysql({
            sessionId: s.id,
            phoneNumber: cleanPhone || void 0
          }).catch(() => {
          });
        }
        if (target.app_id !== currentAppId) {
          const targetSockOrigin = params.dbSockets.find((x) => normalizeAppId(x.app_id) === target.app_id && isSafePeerOriginUrl(x.domain || ""))?.domain || target.domain || "";
          const safeTargetOrigin = isSafePeerOriginUrl(targetSockOrigin);
          if (safeTargetOrigin) targetOriginsToKick.add(safeTargetOrigin);
        }
        succeededList.push({ phone: phoneLabel, tierLabel: prio.tierLabel, targetApp: target.app_id });
      } else {
        const failReason = `Node ${deadAppId} mati dan tidak ada node aktif dengan slot kosong tersisa`;
        updateSession(s.id, {
          status: "disconnected",
          assigned_app_id: "",
          connected_app_id: "",
          assignment_status: "error",
          assignment_error: failReason,
          last_assignment_at: nowIso
        });
        await updateSessionAssignmentInMysql(s.id, {
          status: "disconnected",
          assigned_app_id: "",
          connected_app_id: "",
          assignment_status: "error",
          assignment_error: failReason,
          last_assignment_at: nowIso
        }).catch(() => {
        });
        failedList.push({ phone: phoneLabel, tierLabel: prio.tierLabel, reason: "Kapasitas node online penuh / tidak tersedia" });
      }
    }
    for (const origin of targetOriginsToKick) {
      void pingSinglePeerClusterOrigin({
        appId: "failover_target",
        origin,
        triggerTick: true,
        timeoutMs: 4500
      }).catch(() => {
      });
    }
    const detailLines = [
      `\u2022 Node Mati: <code>${escapeTelegramHtml(deadAppId)}</code> (${isKilledSocket ? "Kill IP" : "Offline / Stale"})`,
      `\u2022 Dieksekusi Oleh: <code>${escapeTelegramHtml(displayAppId)}</code>`,
      `\u2022 Total WA Terdampak: <b>${prioritizedSessions.length}</b>`,
      `\u2022 Berhasil Dipindah: <b>${succeededList.length}</b> \u2705`,
      `\u2022 Gagal Dipindah: <b>${failedList.length}</b> \u274C`,
      `\u2022 Urutan Prioritas: <i>Superadmin \u2192 Paket Premium \u2192 Paket Gratis</i>`
    ];
    if (succeededList.length > 0) {
      detailLines.push("");
      detailLines.push("<b>Rincian Berhasil Dipindah:</b>");
      for (const item of succeededList.slice(0, 15)) {
        detailLines.push(`  \u2713 [${item.tierLabel}] <code>${escapeTelegramHtml(item.phone)}</code> \u2192 <code>${escapeTelegramHtml(item.targetApp)}</code>`);
      }
      if (succeededList.length > 15) {
        detailLines.push(`  ... +${succeededList.length - 15} sesi lainnya`);
      }
    }
    if (failedList.length > 0) {
      detailLines.push("");
      detailLines.push("<b>Rincian Gagal Dipindah:</b>");
      for (const item of failedList.slice(0, 10)) {
        detailLines.push(`  \u2717 [${item.tierLabel}] <code>${escapeTelegramHtml(item.phone)}</code> (${escapeTelegramHtml(item.reason)})`);
      }
    }
    console.warn(
      `[Cluster Failover] Node ${deadAppId} mati -> dipindah ${succeededList.length}/${prioritizedSessions.length} sesi (gagal: ${failedList.length}).`
    );
    void sendTelegramAlert({
      title: `Failover Otomatis Node ${deadAppId} Mati`,
      severity: failedList.length > 0 ? "critical" : "warn",
      dedupKey: `dead_node_failover_${deadAppId}`,
      cooldownMs: 9e4,
      lines: detailLines
    }).catch(() => {
    });
  }
}
function startBaileysBackgroundLoops() {
  if (!baileysWatchdogTimer) {
    baileysWatchdogTimer = setInterval(() => {
      runBaileysPeriodicHealthCheck().catch(() => {
      });
    }, 25e3);
    baileysWatchdogTimer.unref?.();
  }
  if (!appNodeTaskTimer) {
    appNodeTaskTimer = setInterval(() => {
      runAppNodeAssignmentTick("minute_scheduler").catch(() => {
      });
    }, 3e4);
    appNodeTaskTimer.unref?.();
  }
  if (!interAppKeepaliveTimer) {
    interAppKeepaliveTimer = setInterval(() => {
      runInterAppKeepaliveTick().catch(() => {
      });
    }, INTER_APP_PING_INTERVAL_MS);
    interAppKeepaliveTimer.unref?.();
  }
}
var appNodeTaskTickInFlight = false;
async function runAppNodeAssignmentTick(reason = "minute_scheduler", options) {
  const currentAppId = getCurrentAppId();
  if (appNodeTaskTickInFlight || isBaileysStartupPending() || isRestoringSessions || isSelfKilledByIpRule) {
    return { appId: currentAppId, checked: 0, built: 0, delegated: 0, errors: 0 };
  }
  appNodeTaskTickInFlight = true;
  let checked = 0;
  let built = 0;
  let delegated = 0;
  let errors = 0;
  try {
    let dbNodes = [];
    let dbSockets = [];
    let leases = {};
    const identity = await resolveCurrentServerIdentity().catch(() => getCachedOrFallbackIdentity());
    const localPrimaryIp = normalizeServerIpValue(extractPrimaryIp(identity.serverIp)) || collectAllLocalIpAddresses()[0] || "";
    const displayAppId = getDisplayAppId();
    if (isMysqlConfigured()) {
      const snap = await fetchLiveClusterSnapshotFromMysql().catch(() => null);
      if (snap) {
        applyLiveClusterSnapshotToDb(snap);
        dbNodes = snap.nodes || [];
        dbSockets = snap.sockets || [];
        leases = snap.leases || {};
        for (const [sid, detail] of Object.entries(snap.conflicts || {})) {
          remoteSessionConflictCache.set(sid, { detail, fetchedAt: Date.now() });
        }
        for (const [sid, lease] of Object.entries(snap.leases || {})) {
          remoteSessionLeaseCache.set(`sid:${sid}`, { lease, fetchedAt: Date.now() });
          const cleanP = normalizePhoneNumber(lease.phone_number || "");
          if (cleanP.length >= 8) {
            remoteSessionLeaseCache.set(`phone:${cleanP}`, { lease, fetchedAt: Date.now() });
          }
        }
      }
      const sysCfg = getSystemConfig();
      const maxConnForHb = getCurrentNodeMaxConnections(sysCfg, dbNodes);
      const configuredNode = getAppNodesConfig(sysCfg).find((n) => n.app_id === currentAppId);
      const localConnecting = Array.from(activeSessions.values()).filter(
        (s) => !s.superseded && s.status === "connecting" && Date.now() - s.lastUpdated < 12e4
      ).length;
      await upsertAppNodeHeartbeatToMysql({
        app_id: currentAppId,
        name: configuredNode?.name,
        max_connections: configuredNode?.max_connections ?? maxConnForHb,
        is_active: configuredNode ? configuredNode.is_active !== false : true,
        active_connections: countLocalOccupiedConnections(),
        connecting_connections: localConnecting,
        hostname: identity.hostname,
        domain: identity.domain,
        server_ip: identity.serverIp
      }).catch(() => {
      });
    }
    await publishCurrentSocketRecord({ force: reason !== "minute_scheduler" }).catch(() => {
    });
    await detectAndMigrateDeadNodeSessions({ dbNodes, dbSockets, leases }).catch((err) => {
      console.warn("[Cluster Failover] Gagal memeriksa dead node:", err?.message || err);
    });
    if (getSuperadminWaQueue().length > 0 && resolveConnectedSuperadminSession()) {
      void drainSuperadminWaQueue(`node_tick_${reason}`).catch(() => {
      });
    }
    const sysConfig = getSystemConfig();
    const now = Date.now();
    const allSessions = getWhatsAppSessions();
    for (const [sid, mem] of Array.from(activeSessions.entries())) {
      if (mem.superseded) continue;
      const sMeta = allSessions.find((x) => x.id === sid);
      const owner = sMeta?.user_id || mem.userId ? getUserById(sMeta?.user_id || mem.userId) : void 0;
      const memPhone = normalizePhoneNumber(mem.phoneNumber || sMeta?.phone_number || getCredsPhoneOnDisk(sid) || "");
      let releaseReason = "";
      if (sMeta?.assignment_status === "released") {
        releaseReason = "sesi dilepas dari socket oleh Admin";
      } else if (!isSessionOwnedByCurrentAppNode(sMeta || { id: sid, user_id: mem.userId }, sysConfig, owner)) {
        const targetApp = resolveEffectiveAssignedAppId(sMeta || { id: sid, user_id: mem.userId }, owner);
        releaseReason = `ditugaskan eksklusif ke APP_ID "${targetApp || "lain"}" (bukan "${displayAppId}")`;
      } else if (memPhone.length >= 8) {
        const competingSessionOtherApp = allSessions.find((x) => {
          if (!x || x.id === sid || x.assignment_status === "error") return false;
          if (normalizePhoneNumber(x.phone_number || "") !== memPhone) return false;
          if (x.assignment_status === "released") {
            const xTs = x.last_assignment_at ? Date.parse(x.last_assignment_at) : 0;
            const mTs = sMeta?.last_assignment_at ? Date.parse(sMeta.last_assignment_at) : 0;
            return xTs >= mTs;
          }
          const xOwner = x.user_id ? getUserById(x.user_id) : void 0;
          const xTargetApp = resolveEffectiveAssignedAppId(x, xOwner);
          return Boolean(xTargetApp && xTargetApp !== currentAppId);
        });
        if (competingSessionOtherApp) {
          const cOwner = competingSessionOtherApp.user_id ? getUserById(competingSessionOtherApp.user_id) : void 0;
          const cTargetApp = resolveEffectiveAssignedAppId(competingSessionOtherApp, cOwner);
          releaseReason = competingSessionOtherApp.assignment_status === "released" ? `nomor +${memPhone} dilepas dari cluster` : `nomor +${memPhone} aktif/ditugaskan di APP_ID "${cTargetApp || "lain"}"`;
        } else {
          const remoteSamePhoneLease = Object.values(leases).find((l) => {
            if (!l || l.instance_id === RUNTIME_INSTANCE_ID) return false;
            if (normalizePhoneNumber(l.phone_number || "") !== memPhone) return false;
            if (now - (Number(l.heartbeat_at) || 0) > REMOTE_LEASE_FRESH_MS) return false;
            const lApp = normalizeAppId(l.app_id);
            return Boolean(lApp && lApp !== currentAppId && (Number(l.heartbeat_at) || 0) > (mem.openedAt || 0));
          });
          if (remoteSamePhoneLease) {
            releaseReason = `nomor +${memPhone} sudah berjalan di APP_ID "${remoteSamePhoneLease.app_id}"`;
          }
        }
      }
      if (releaseReason) {
        console.log(`[Cluster Exclusivity] Melepas socket lokal ${sid} (+${memPhone || "-"}): ${releaseReason}.`);
        await releaseLocalSocketForDelegation(sid);
      }
    }
    const dbUsersSnapshot = initDbFile().users || [];
    const hasExplicitAppAssignments = allSessions.some((s) => Boolean(normalizeAppId(s.assigned_app_id))) || dbUsersSnapshot.some((u) => Boolean(normalizeAppId(u.assigned_app_id)));
    if (!isMultiNodeOrchestrationEnabled(sysConfig) && !hasExplicitAppAssignments) {
      return { appId: currentAppId, checked: 0, built: 0, delegated: 0, errors: 0 };
    }
    const maxConn = getCurrentNodeMaxConnections(sysConfig, dbNodes);
    const configuredNodes = getAppNodesConfig(sysConfig);
    const currentIsActive = configuredNodes.length === 0 || maxConn > 0;
    const tasksForThisNode = [];
    for (const s of allSessions) {
      if (!s?.id) continue;
      if (s.assignment_status === "released") continue;
      if (s.expires_at && Date.parse(s.expires_at) < now) continue;
      const owner = resolveActiveVerifiedOwner(s.id, s.user_id, s.phone_number);
      if (!isOwnerActiveAndRegistered(owner)) continue;
      if (!isSessionOwnedByCurrentAppNode(s, sysConfig, owner)) continue;
      const effectiveTargetApp = resolveEffectiveAssignedAppId(s, owner);
      const isPendingOrDelegated = s.assignment_status === "delegated" || s.assignment_status === "pending" || s.assignment_status === "building";
      const needsBuild = isPendingOrDelegated || s.status === "connected" && s.assignment_status !== "error";
      if (!needsBuild) continue;
      if (effectiveTargetApp) {
        if (effectiveTargetApp === currentAppId) {
          tasksForThisNode.push(s);
        }
      } else if (currentIsActive && configuredNodes.length > 0) {
        if (hasRegisteredCredsOnDisk(s.id) || countLocalOccupiedConnections(s.id) < maxConn) {
          tasksForThisNode.push(s);
        }
      }
    }
    const defaultBuildSessionFn = async (sess) => {
      const mem = activeSessions.get(sess.id);
      if (mem && !mem.superseded && mem.status === "connected" && isSocketTrulyOpen(mem.socket)) {
        return { ok: true };
      }
      const sessOwner = sess.user_id ? getUserById(sess.user_id) : void 0;
      const effectiveApp = resolveEffectiveAssignedAppId(sess, sessOwner);
      const remoteExisting = await evaluateRemoteLeaseForSession({
        sessionId: sess.id,
        userId: sess.user_id,
        cleanPhone: sess.phone_number,
        assignedAppId: effectiveApp || void 0
      }).catch(() => ({ status: "none", lease: void 0 }));
      if (remoteExisting.status !== "none" && remoteExisting.lease) {
        const remoteLeaseApp = normalizeAppId(remoteExisting.lease.app_id);
        const remoteLeaseIp = normalizeServerIpValue(extractPrimaryIp(remoteExisting.lease.server_ip));
        if (!effectiveApp || remoteLeaseApp === effectiveApp) {
          if (remoteLeaseApp) {
            updateSession(sess.id, {
              status: "connected",
              connected_app_id: remoteLeaseApp,
              connected_server_ip: remoteLeaseIp || void 0,
              assignment_status: "connected",
              assignment_error: ""
            });
          }
          return { ok: true };
        }
      }
      if (isSessionInConflictCooldown(sess.id)) {
        const cDetail = sessionConflictDetails.get(sess.id) || remoteSessionConflictCache.get(sess.id)?.detail;
        return {
          ok: false,
          conflict: true,
          reason: cDetail?.raw_reason || "Konflik koneksi WhatsApp (440)"
        };
      }
      let hasCreds = hasRegisteredCredsOnDisk(sess.id);
      if (!hasCreds) {
        hasCreds = await hydrateSessionAuthFolderFromMysql(sess.id).catch(() => false);
      }
      if (!hasCreds && sess.auth_method === "pairing_code" && sess.phone_number) {
        try {
          const code = await requestBaileysPairingCode(sess.id, sess.phone_number, sess.user_id, {
            bypassNodeGuard: true,
            assignedAppId: effectiveApp || currentAppId
          });
          updateSession(sess.id, {
            pairing_code: code,
            assignment_status: "building",
            assignment_error: `Kode Pairing aktif (${code}) berjalan di APP_ID ${displayAppId}`
          });
          await updateSessionAssignmentInMysql(sess.id, {
            assigned_app_id: effectiveApp || currentAppId,
            assigned_server_ip: "",
            assignment_status: "building",
            assignment_error: `Kode Pairing aktif (${code}) berjalan di APP_ID ${displayAppId}`
          }).catch(() => {
          });
          return { ok: true };
        } catch (pairErr) {
          return { ok: false, reason: pairErr?.message || "Gagal meminta kode pairing di APP_ID target" };
        }
      }
      if (!hasCreds) {
        return { ok: false, reason: "Kredensial WhatsApp tidak tersedia pada server / MySQL" };
      }
      const started = await getOrStartBaileysSession(sess.id, sess.phone_number, sess.user_id, {
        bypassNodeGuard: true,
        assignedAppId: effectiveApp || currentAppId
      });
      let tries = 0;
      while (tries < 40) {
        const latest = activeSessions.get(sess.id);
        if (latest && !latest.superseded && latest.status === "connected" && isSocketTrulyOpen(latest.socket)) {
          return { ok: true };
        }
        if (isSessionInConflictCooldown(sess.id)) {
          const cDetail = sessionConflictDetails.get(sess.id) || remoteSessionConflictCache.get(sess.id)?.detail;
          return { ok: false, conflict: true, reason: cDetail?.raw_reason || "Konflik koneksi WhatsApp (440)" };
        }
        if (latest && latest.status === "disconnected") {
          const diag2 = sessionDisconnectDiagnostics.get(sess.id);
          return {
            ok: false,
            conflict: diag2?.code === 440,
            reason: diag2?.reason || "Koneksi terputus saat inisialisasi socket"
          };
        }
        if (!latest && tries > 4) {
          const diag2 = sessionDisconnectDiagnostics.get(sess.id);
          return { ok: false, reason: diag2?.reason || "Socket gagal dipertahankan" };
        }
        await delay(500);
        tries++;
      }
      const finalLatest = activeSessions.get(sess.id);
      if (finalLatest && !finalLatest.superseded && finalLatest.status === "connected" && isSocketTrulyOpen(finalLatest.socket)) {
        return { ok: true };
      }
      if (started?.status === "connected") return { ok: true };
      const diag = sessionDisconnectDiagnostics.get(sess.id);
      return { ok: false, reason: diag?.reason || "Timeout membangun koneksi WhatsApp (20 detik)" };
    };
    const runBuild = options?.buildSessionFn || defaultBuildSessionFn;
    for (const s of tasksForThisNode) {
      checked++;
      const sOwner = s.user_id ? getUserById(s.user_id) : void 0;
      const sEffectiveApp = resolveEffectiveAssignedAppId(s, sOwner);
      const mem = activeSessions.get(s.id);
      if (mem && !mem.superseded && mem.status === "connected" && isSocketTrulyOpen(mem.socket)) {
        if (s.connected_app_id !== displayAppId || s.connected_server_ip !== localPrimaryIp || s.assignment_status !== "connected" || normalizeAppId(s.assigned_app_id) !== (sEffectiveApp || currentAppId)) {
          const okIso = (/* @__PURE__ */ new Date()).toISOString();
          updateSession(s.id, {
            assigned_app_id: sEffectiveApp || currentAppId,
            assigned_server_ip: void 0,
            connected_app_id: displayAppId,
            connected_server_ip: localPrimaryIp || void 0,
            failed_app_ids: [],
            assignment_status: "connected",
            assignment_error: "",
            last_assignment_at: okIso
          });
          await updateSessionAssignmentInMysql(s.id, {
            assigned_app_id: sEffectiveApp || currentAppId,
            assigned_server_ip: "",
            connected_app_id: displayAppId,
            connected_server_ip: localPrimaryIp || void 0,
            failed_app_ids: [],
            assignment_status: "connected",
            assignment_error: "",
            last_assignment_at: okIso,
            status: "connected"
          });
        }
        continue;
      }
      if (isSessionInConflictCooldown(s.id) && s.assignment_status !== "delegated" && s.assignment_status !== "pending") {
        continue;
      }
      if (mem && !mem.superseded && mem.status === "connecting" && mem.pairingCode) {
        continue;
      }
      const isExplicitlyPinnedApp = Boolean(normalizeAppId(s.assigned_app_id) || normalizeAppId(sOwner?.assigned_app_id));
      const occupiedExcludingThis = countLocalOccupiedConnections(s.id);
      if (isMultiNodeOrchestrationEnabled(sysConfig) && !isExplicitlyPinnedApp && (maxConn <= 0 || occupiedExcludingThis >= maxConn)) {
        const capReason = maxConn <= 0 ? `Server ${currentAppId} sedang dinonaktifkan` : `Batas kapasitas server ${currentAppId} penuh (${occupiedExcludingThis}/${maxConn})`;
        const delRes = await delegateSessionToNextNodeOrError(s, capReason, {
          markCurrentFailed: false,
          dbNodes,
          leases
        });
        if (delRes.exhausted) errors++;
        else delegated++;
        continue;
      }
      const buildingIso = (/* @__PURE__ */ new Date()).toISOString();
      updateSession(s.id, {
        assigned_app_id: sEffectiveApp || currentAppId,
        assigned_server_ip: void 0,
        assignment_status: "building",
        last_assignment_at: buildingIso
      });
      await updateSessionAssignmentInMysql(s.id, {
        assigned_app_id: sEffectiveApp || currentAppId,
        assigned_server_ip: "",
        assignment_status: "building",
        last_assignment_at: buildingIso
      });
      const buildRes = await runBuild(s);
      if (buildRes.ok) {
        built++;
        const okIso = (/* @__PURE__ */ new Date()).toISOString();
        const latestSess = getSessionById(s.id);
        const stillPairing = latestSess?.assignment_status === "building" && Boolean(latestSess?.pairing_code);
        if (!stillPairing) {
          void deleteWaSessionConflictFromMysql(s.id).catch(() => {
          });
          clearSessionConflictState(s.id);
          updateSession(s.id, {
            status: "connected",
            assigned_app_id: sEffectiveApp || currentAppId,
            assigned_server_ip: void 0,
            connected_app_id: displayAppId,
            connected_server_ip: localPrimaryIp || void 0,
            failed_app_ids: [],
            assignment_status: "connected",
            assignment_error: "",
            last_assignment_at: okIso
          });
          await updateSessionAssignmentInMysql(s.id, {
            status: "connected",
            assigned_app_id: sEffectiveApp || currentAppId,
            assigned_server_ip: "",
            connected_app_id: displayAppId,
            connected_server_ip: localPrimaryIp || void 0,
            failed_app_ids: [],
            assignment_status: "connected",
            assignment_error: "",
            last_assignment_at: okIso
          });
        }
      } else {
        const failReason = buildRes.reason || `Gagal membangun koneksi pada APP_ID ${displayAppId}`;
        if (buildRes.conflict) {
          continue;
        }
        if (isExplicitlyPinnedApp) {
          errors++;
          const errIso = (/* @__PURE__ */ new Date()).toISOString();
          updateSession(s.id, {
            assignment_status: "error",
            assignment_error: failReason.slice(0, 500),
            last_assignment_at: errIso
          });
          await updateSessionAssignmentInMysql(s.id, {
            assignment_status: "error",
            assignment_error: failReason.slice(0, 500),
            last_assignment_at: errIso
          }).catch(() => {
          });
          continue;
        }
        const delRes = await delegateSessionToNextNodeOrError(s, failReason, {
          markCurrentFailed: true,
          dbNodes,
          leases
        });
        if (delRes.exhausted) errors++;
        else delegated++;
      }
    }
  } finally {
    appNodeTaskTickInFlight = false;
  }
  return { appId: currentAppId, checked, built, delegated, errors };
}
startBaileysBackgroundLoops();

// <stdin>
init_security();
async function main() {
  const plansMap = /* @__PURE__ */ new Map([
    ["free", { price: 0 }],
    ["starter", { price: 5e4 }],
    ["pro", { price: 15e4 }]
  ]);
  const usersMap = /* @__PURE__ */ new Map([
    ["u_free", { id: "u_free", role: "user", plan_id: "free", plan_status: "active" }],
    ["u_starter", { id: "u_starter", role: "user", plan_id: "starter", plan_status: "active" }],
    ["u_pro", { id: "u_pro", role: "user", plan_id: "pro", plan_status: "active" }],
    ["u_admin", { id: "u_admin", role: "admin", plan_id: "free", plan_status: "active" }],
    ["u_expired_pro", { id: "u_expired_pro", role: "user", plan_id: "pro", plan_status: "expired" }]
  ]);
  const sessions = [
    { id: "s_free", user_id: "u_free", is_primary: true },
    { id: "s_exp", user_id: "u_expired_pro", is_primary: true },
    { id: "s_starter", user_id: "u_starter", is_primary: true },
    { id: "s_pro", user_id: "u_pro", is_primary: false },
    { id: "s_admin", user_id: "u_admin", is_primary: true }
  ];
  const sorted = sortSessionsByFailoverPriority(sessions, (uid) => usersMap.get(uid), plansMap);
  assert.deepEqual(
    sorted.map((s) => s.id),
    ["s_admin", "s_pro", "s_starter", "s_exp", "s_free"],
    "Failover priority must be Superadmin -> Pro -> Starter -> Free/Expired"
  );
  const nodes = [
    { app_id: "app02", online: true, is_active: true, active_connections: 2, max_connections: 10 },
    { app_id: "app03", online: true, is_active: true, active_connections: 0, max_connections: 5 },
    { app_id: "app04", online: false, is_active: true, active_connections: 0, max_connections: 5 }
  ];
  const chosen = selectEligibleDelegationTarget(nodes, /* @__PURE__ */ new Set(["app01"]), { preferEmptyFirst: true });
  assert.equal(chosen?.app_id, "app03", "Must prefer online empty 0-WA node first");
  assert.equal(isValidTelegramBotTokenFormat("123456789:AAH_valid_Token-1234567890abcdef"), true);
  assert.equal(isValidTelegramBotTokenFormat("invalid-token"), false);
  assert.equal(normalizeTelegramChatId("-1001234567890"), "-1001234567890");
  assert.equal(normalizeTelegramChatId("abc"), "");
  updateSystemConfig({
    telegram_configs: [
      { id: "tg_1", name: "Ops", bot_token: "123456789:AAH_SecretTokenExample_12345", chat_id: "-100998877", is_active: true, created_at: (/* @__PURE__ */ new Date()).toISOString() },
      { id: "tg_2", name: "Paused", bot_token: "987654321:BBH_PausedTokenExample_9999", chat_id: "55443322", is_active: false, created_at: (/* @__PURE__ */ new Date()).toISOString() }
    ]
  });
  const rawStored = getTelegramConfigs();
  assert(rawStored[0].bot_token.startsWith("gcm:"), "Stored Telegram token must be AES-256-GCM encrypted");
  const maskedForAdmin = sanitizeTelegramConfigsForAdmin();
  assert(!maskedForAdmin[0].bot_token.includes("AAH_SecretTokenExample"), "Admin sanitized config must never expose raw token");
  assert(maskedForAdmin[0].bot_token_masked?.includes("*"), "Masked token must be returned");
  const activeTargets = getActiveTelegramTargets();
  assert.equal(activeTargets.length, 1);
  assert.equal(activeTargets[0].botToken, "123456789:AAH_SecretTokenExample_12345");
  assert.equal(escapeTelegramHtml("<script>a&b</script>"), "&lt;script&gt;a&amp;b&lt;/script&gt;");
  const activeLocal = await isIpCurrentlyActiveInCluster("127.0.0.1");
  assert.equal(typeof activeLocal.active, "boolean");
  updateSystemConfig({ kill_target_ips: [{ ip: "203.0.113.55", reason: "test", requested_at: (/* @__PURE__ */ new Date()).toISOString() }] });
  const unkillRes = await unkillTargetIp("203.0.113.55", "tester");
  assert.equal(unkillRes.success, true);
  await assert.rejects(() => unkillTargetIp("not-an-ip", "tester"));
  const tok = signToken(JSON.stringify({ typ: "cluster_ping", fromApp: "app02", ts: Date.now() }));
  assert(verifySignedToken(tok));
  assert.equal(verifySignedToken(tok + "tamper"), null);
  const pingOut = handleIncomingClusterPing({ fromApp: "app02", activeConnections: 1 });
  assert.equal(pingOut.ok, true);
  assert.equal(getInterAppPingStatus().last_inbound_ping_from, "app02");
  await shutdownBaileysManager();
  console.log("ALL CLUSTER/FAILOVER/TELEGRAM/UNKILL VERIFICATION CHECKS PASSED");
  process.exit(0);
}
main().catch((err) => {
  console.error(err);
  process.exit(1);
});
