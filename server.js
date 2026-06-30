const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const mysql = require("mysql2/promise");

const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, "public");
const ADMIN_USERNAME = process.env.ADMIN_USERNAME || "admin";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "admin123";
const ADMIN_PHONE = process.env.ADMIN_PHONE || "8293532857";
const OTP_SMS_WEBHOOK_URL = process.env.OTP_SMS_WEBHOOK_URL || "";
const SMS_PROVIDER = String(process.env.SMS_PROVIDER || "").toLowerCase();
const SMS_DEFAULT_COUNTRY_CODE = process.env.SMS_DEFAULT_COUNTRY_CODE || "91";
const FAST2SMS_API_KEY = process.env.FAST2SMS_API_KEY || "";
const TWILIO_ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID || "";
const TWILIO_AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN || "";
const TWILIO_FROM_PHONE = process.env.TWILIO_FROM_PHONE || "";
const CSRF_SECRET = process.env.CSRF_SECRET || crypto.randomBytes(32).toString("hex");
const ADMIN_SESSION_HOURS = 8;
const ADMIN_IDLE_TIMEOUT_MINUTES = Number(process.env.ADMIN_IDLE_TIMEOUT_MINUTES || 30);
const ADMIN_LOCK_MAX_FAILURES = Number(process.env.ADMIN_LOCK_MAX_FAILURES || 5);
const ADMIN_LOCK_MINUTES = Number(process.env.ADMIN_LOCK_MINUTES || 15);
const USER_SESSION_HOURS = 24 * 7;
const TWO_FACTOR_CODE_MINUTES = 5;
const TWO_FACTOR_MAX_ATTEMPTS = 5;
const RATE_LIMITS = {
  userLogin: { maxAttempts: 10, windowMs: 15 * 60 * 1000 },
  userRegister: { maxAttempts: 5, windowMs: 60 * 60 * 1000 },
  adminLogin: { maxAttempts: 5, windowMs: 15 * 60 * 1000 }
};

const defaultProducts = [
  {
    id: 1,
    name: "Margherita Pizza",
    category: "Pizza",
    price: 249,
    rating: 4.8,
    prepTime: "20 min",
    description: "Classic mozzarella, basil, and bright tomato sauce on a crisp crust.",
    image: "https://images.unsplash.com/photo-1604382355076-af4b0eb60143?auto=format&fit=crop&w=900&q=80"
  },
  {
    id: 2,
    name: "Paneer Tikka Bowl",
    category: "Bowls",
    price: 199,
    rating: 4.7,
    prepTime: "18 min",
    description: "Charred paneer, saffron rice, cucumber salad, and mint chutney.",
    image: "https://images.unsplash.com/photo-1567188040759-fb8a883dc6d8?auto=format&fit=crop&w=900&q=80"
  },
  {
    id: 3,
    name: "Spicy Chicken Burger",
    category: "Burgers",
    price: 179,
    rating: 4.6,
    prepTime: "15 min",
    description: "Crispy chicken, pepper mayo, lettuce, onions, and toasted brioche.",
    image: "https://images.unsplash.com/photo-1568901346375-23c9450c58cd?auto=format&fit=crop&w=900&q=80"
  },
  {
    id: 4,
    name: "Veg Hakka Noodles",
    category: "Noodles",
    price: 149,
    rating: 4.5,
    prepTime: "14 min",
    description: "Wok-tossed noodles with crunchy vegetables and a savory chili glaze.",
    image: "https://images.unsplash.com/photo-1612929633738-8fe44f7ec841?auto=format&fit=crop&w=900&q=80"
  },
  {
    id: 5,
    name: "Chocolate Shake",
    category: "Drinks",
    price: 119,
    rating: 4.9,
    prepTime: "8 min",
    description: "Creamy chocolate shake finished with cocoa and whipped cream.",
    image: "https://images.unsplash.com/photo-1572490122747-3968b75cc699?auto=format&fit=crop&w=900&q=80"
  },
  {
    id: 6,
    name: "Masala Dosa",
    category: "South Indian",
    price: 139,
    rating: 4.8,
    prepTime: "16 min",
    description: "Golden dosa filled with spiced potato, served with sambar and chutney.",
    image: "https://images.unsplash.com/photo-1668236543090-82eba5ee5976?auto=format&fit=crop&w=900&q=80"
  }
];

const DATA_DIR = path.join(__dirname, "data");
const PRODUCTS_FILE = path.join(DATA_DIR, "products.json");
const ORDERS_FILE = path.join(DATA_DIR, "orders.json");
const USERS_FILE = path.join(DATA_DIR, "users.json");
const COUPONS_FILE = path.join(DATA_DIR, "coupons.json");
const DB_NAME = process.env.MYSQL_DATABASE || process.env.DB_NAME || "food_order";
const DB_CONFIG = {
  host: process.env.MYSQL_HOST || process.env.DB_HOST || "localhost",
  port: Number(process.env.MYSQL_PORT || process.env.DB_PORT || 3306),
  user: process.env.MYSQL_USER || process.env.DB_USER || "root",
  password: process.env.MYSQL_PASSWORD || process.env.DB_PASSWORD || ""
};
const DB_IDENTIFIER = DB_NAME.replace(/`/g, "``");
let dbPool;
let products = defaultProducts;
const defaultCoupons = [
  {
    code: "FRESH10",
    description: "10% off orders above Rs 199",
    type: "percent",
    value: 10,
    minSubtotal: 199,
    maxDiscount: 100,
    active: true
  },
  {
    code: "SAVE50",
    description: "Rs 50 off orders above Rs 299",
    type: "fixed",
    value: 50,
    minSubtotal: 299,
    active: true
  },
  {
    code: "FREESHIP",
    description: "Free delivery above Rs 149",
    type: "free_delivery",
    value: 0,
    minSubtotal: 149,
    active: true
  }
];

let orders = [];

let users = [];
let coupons = defaultCoupons;
const rateLimitBuckets = new Map();

function readJsonFile(filePath, fallback) {
  try {
    if (!fs.existsSync(filePath)) return fallback;
    const parsed = JSON.parse(fs.readFileSync(filePath, "utf8"));
    return Array.isArray(parsed) ? parsed : fallback;
  } catch (error) {
    console.error(`Could not read ${path.basename(filePath)} for migration:`, error.message);
    return fallback;
  }
}

function parseJsonColumn(value, fallback) {
  if (value === null || value === undefined) return fallback;
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value);
  } catch (error) {
    return fallback;
  }
}

function formatSqlDate(value) {
  const date = value ? new Date(value) : new Date();
  return Number.isNaN(date.getTime()) ? new Date() : date;
}

function rowToProduct(row) {
  return {
    id: Number(row.id),
    name: row.name,
    category: row.category,
    price: Number(row.price),
    rating: Number(row.rating),
    prepTime: row.prep_time,
    description: row.description,
    image: row.image
  };
}

function rowToUser(row) {
  return {
    id: row.id,
    name: row.name,
    phone: row.phone,
    photoUrl: row.photo_url || "",
    addresses: parseJsonColumn(row.addresses, []),
    wishlist: parseJsonColumn(row.wishlist, []),
    passwordHash: row.password_hash,
    createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at
  };
}

function rowToCoupon(row) {
  return {
    code: row.code,
    description: row.description,
    type: row.type,
    value: Number(row.value),
    minSubtotal: Number(row.min_subtotal),
    maxDiscount: row.max_discount === null ? null : Number(row.max_discount),
    active: Boolean(row.active)
  };
}

function rowToOrder(row) {
  return {
    id: row.id,
    userId: row.user_id || undefined,
    name: row.name,
    phone: row.phone,
    address: row.address,
    paymentType: row.payment_type || "Cash on delivery",
    onlinePaymentMethod: row.online_payment_method || "",
    items: parseJsonColumn(row.items, []),
    subtotal: Number(row.subtotal),
    deliveryFee: Number(row.delivery_fee),
    discount: Number(row.discount || 0),
    coupon: parseJsonColumn(row.coupon, null),
    total: Number(row.total),
    status: row.status,
    createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at
  };
}

async function query(sql, params = []) {
  const [rows] = await dbPool.execute(sql, params);
  return rows;
}

async function ensureColumn(tableName, columnName, definition) {
  const rows = await query(
    `SELECT COLUMN_NAME
     FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND COLUMN_NAME = ?
     LIMIT 1`,
    [DB_NAME, tableName, columnName]
  );
  if (rows.length) return;

  const safeTable = tableName.replace(/`/g, "``");
  const safeColumn = columnName.replace(/`/g, "``");
  await query(`ALTER TABLE \`${safeTable}\` ADD COLUMN \`${safeColumn}\` ${definition}`);
}

async function initializeDatabase() {
  if (process.env.NODE_ENV === "production" && ["root", ""].includes(String(DB_CONFIG.user || "").toLowerCase())) {
    console.warn("Production database user should not be root. Configure a least-privilege MYSQL_USER for the app.");
  }

  const setupConnection = await mysql.createConnection(DB_CONFIG);
  await setupConnection.query(`CREATE DATABASE IF NOT EXISTS \`${DB_IDENTIFIER}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
  await setupConnection.end();

  dbPool = mysql.createPool({
    ...DB_CONFIG,
    database: DB_NAME,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
  });

  await ensureSchema();
  await deleteExpiredAuthRows();
  await seedDatabaseIfEmpty();
  await loadData();
}

async function ensureSchema() {
  await query(`
    CREATE TABLE IF NOT EXISTS products (
      id INT PRIMARY KEY AUTO_INCREMENT,
      name VARCHAR(120) NOT NULL,
      category VARCHAR(80) NOT NULL,
      price DECIMAL(10,2) NOT NULL,
      rating DECIMAL(3,1) NOT NULL,
      prep_time VARCHAR(40) NOT NULL,
      description TEXT NOT NULL,
      image TEXT NOT NULL
    )
  `);
  await query(`
    CREATE TABLE IF NOT EXISTS users (
      id VARCHAR(36) PRIMARY KEY,
      name VARCHAR(120) NOT NULL,
      phone VARCHAR(40) NOT NULL UNIQUE,
      photo_url TEXT NULL,
      addresses JSON NOT NULL,
      wishlist JSON NOT NULL,
      password_hash VARCHAR(255) NOT NULL,
      created_at DATETIME(3) NOT NULL
    )
  `);
  await query(`
    CREATE TABLE IF NOT EXISTS coupons (
      code VARCHAR(18) PRIMARY KEY,
      description VARCHAR(255) NOT NULL,
      type VARCHAR(40) NOT NULL,
      value DECIMAL(10,2) NOT NULL,
      min_subtotal DECIMAL(10,2) NOT NULL DEFAULT 0,
      max_discount DECIMAL(10,2) NULL,
      active BOOLEAN NOT NULL DEFAULT TRUE
    )
  `);
  await query(`
    CREATE TABLE IF NOT EXISTS orders (
      id VARCHAR(16) PRIMARY KEY,
      user_id VARCHAR(36) NULL,
      name VARCHAR(120) NOT NULL,
      phone VARCHAR(40) NOT NULL,
      address TEXT NOT NULL,
      payment_type VARCHAR(40) NOT NULL DEFAULT 'Cash on delivery',
      online_payment_method VARCHAR(40) NOT NULL DEFAULT '',
      items JSON NOT NULL,
      subtotal DECIMAL(10,2) NOT NULL,
      delivery_fee DECIMAL(10,2) NOT NULL,
      discount DECIMAL(10,2) NOT NULL DEFAULT 0,
      coupon JSON NULL,
      total DECIMAL(10,2) NOT NULL,
      status VARCHAR(40) NOT NULL,
      created_at DATETIME(3) NOT NULL,
      INDEX orders_user_id_idx (user_id),
      INDEX orders_phone_idx (phone),
      INDEX orders_created_at_idx (created_at)
    )
  `);
  await query(`
    CREATE TABLE IF NOT EXISTS auth_sessions (
      token_hash CHAR(64) PRIMARY KEY,
      session_type ENUM('admin', 'user') NOT NULL,
      user_id VARCHAR(36) NULL,
      expires_at DATETIME(3) NOT NULL,
      last_seen_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      INDEX auth_sessions_type_idx (session_type),
      INDEX auth_sessions_user_id_idx (user_id),
      INDEX auth_sessions_expires_at_idx (expires_at)
    )
  `);
  await query(`
    CREATE TABLE IF NOT EXISTS two_factor_challenges (
      token_hash CHAR(64) PRIMARY KEY,
      challenge_type ENUM('admin', 'user') NOT NULL,
      user_id VARCHAR(36) NULL,
      code_hash CHAR(64) NOT NULL,
      attempts INT NOT NULL DEFAULT 0,
      expires_at DATETIME(3) NOT NULL,
      created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      INDEX two_factor_type_idx (challenge_type),
      INDEX two_factor_user_id_idx (user_id),
      INDEX two_factor_expires_at_idx (expires_at)
    )
  `);
  await query(`
    CREATE TABLE IF NOT EXISTS admin_login_history (
      id BIGINT PRIMARY KEY AUTO_INCREMENT,
      username VARCHAR(120) NOT NULL,
      ip_address VARCHAR(80) NOT NULL,
      user_agent TEXT NULL,
      successful BOOLEAN NOT NULL DEFAULT FALSE,
      failure_reason VARCHAR(120) NULL,
      created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      INDEX admin_login_history_username_idx (username),
      INDEX admin_login_history_ip_idx (ip_address),
      INDEX admin_login_history_created_at_idx (created_at)
    )
  `);
  await query(`
    CREATE TABLE IF NOT EXISTS admin_account_locks (
      username VARCHAR(120) PRIMARY KEY,
      failed_attempts INT NOT NULL DEFAULT 0,
      locked_until DATETIME(3) NULL,
      last_failed_at DATETIME(3) NULL,
      updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3)
    )
  `);
  await query(`
    CREATE TABLE IF NOT EXISTS admin_activity_logs (
      id BIGINT PRIMARY KEY AUTO_INCREMENT,
      username VARCHAR(120) NOT NULL,
      action VARCHAR(80) NOT NULL,
      ip_address VARCHAR(80) NOT NULL,
      user_agent TEXT NULL,
      details JSON NULL,
      created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      INDEX admin_activity_username_idx (username),
      INDEX admin_activity_action_idx (action),
      INDEX admin_activity_created_at_idx (created_at)
    )
  `);
  await ensureColumn("auth_sessions", "last_seen_at", "DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)");
}

async function seedDatabaseIfEmpty() {
  const [{ count: productCount }] = await query("SELECT COUNT(*) AS count FROM products");
  if (Number(productCount) === 0) {
    const savedProducts = readJsonFile(PRODUCTS_FILE, defaultProducts);
    for (const product of savedProducts) await saveProduct(product);
  }

  const [{ count: couponCount }] = await query("SELECT COUNT(*) AS count FROM coupons");
  if (Number(couponCount) === 0) {
    const savedCoupons = readJsonFile(COUPONS_FILE, defaultCoupons);
    for (const coupon of savedCoupons) await saveCoupon(coupon);
  }

  const [{ count: userCount }] = await query("SELECT COUNT(*) AS count FROM users");
  if (Number(userCount) === 0) {
    const savedUsers = readJsonFile(USERS_FILE, []);
    for (const user of savedUsers) await saveUser(user);
  }

  const [{ count: orderCount }] = await query("SELECT COUNT(*) AS count FROM orders");
  if (Number(orderCount) === 0) {
    const savedOrders = readJsonFile(ORDERS_FILE, []);
    for (const order of savedOrders) await saveOrder(order);
  }
}

async function loadData() {
  products = (await query("SELECT * FROM products ORDER BY id")).map(rowToProduct);
  coupons = (await query("SELECT * FROM coupons ORDER BY code")).map(rowToCoupon);
  users = (await query("SELECT * FROM users ORDER BY created_at")).map(rowToUser);
  orders = (await query("SELECT * FROM orders ORDER BY created_at")).map(rowToOrder);
}

async function saveProduct(product) {
  await query(
    `INSERT INTO products (id, name, category, price, rating, prep_time, description, image)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       name = VALUES(name),
       category = VALUES(category),
       price = VALUES(price),
       rating = VALUES(rating),
       prep_time = VALUES(prep_time),
       description = VALUES(description),
       image = VALUES(image)`,
    [product.id || null, product.name, product.category, product.price, product.rating, product.prepTime, product.description, product.image]
  );
}

async function deleteProduct(productId) {
  await query("DELETE FROM products WHERE id = ?", [productId]);
}

async function saveUser(user) {
  await query(
    `INSERT INTO users (id, name, phone, photo_url, addresses, wishlist, password_hash, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       name = VALUES(name),
       phone = VALUES(phone),
       photo_url = VALUES(photo_url),
       addresses = VALUES(addresses),
       wishlist = VALUES(wishlist),
       password_hash = VALUES(password_hash)`,
    [
      user.id,
      user.name,
      user.phone,
      user.photoUrl || "",
      JSON.stringify(Array.isArray(user.addresses) ? user.addresses : []),
      JSON.stringify(Array.isArray(user.wishlist) ? user.wishlist : []),
      user.passwordHash,
      formatSqlDate(user.createdAt)
    ]
  );
}

async function saveCoupon(coupon) {
  await query(
    `INSERT INTO coupons (code, description, type, value, min_subtotal, max_discount, active)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       description = VALUES(description),
       type = VALUES(type),
       value = VALUES(value),
       min_subtotal = VALUES(min_subtotal),
       max_discount = VALUES(max_discount),
       active = VALUES(active)`,
    [
      normalizeCouponCode(coupon.code),
      coupon.description,
      coupon.type,
      coupon.value,
      coupon.minSubtotal || 0,
      coupon.maxDiscount === undefined ? null : coupon.maxDiscount,
      coupon.active !== false
    ]
  );
}

async function saveOrder(order) {
  await query(
    `INSERT INTO orders (
       id, user_id, name, phone, address, payment_type, online_payment_method,
       items, subtotal, delivery_fee, discount, coupon, total, status, created_at
     )
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       user_id = VALUES(user_id),
       name = VALUES(name),
       phone = VALUES(phone),
       address = VALUES(address),
       payment_type = VALUES(payment_type),
       online_payment_method = VALUES(online_payment_method),
       items = VALUES(items),
       subtotal = VALUES(subtotal),
       delivery_fee = VALUES(delivery_fee),
       discount = VALUES(discount),
       coupon = VALUES(coupon),
       total = VALUES(total),
       status = VALUES(status)`,
    [
      order.id,
      order.userId || null,
      order.name,
      order.phone,
      order.address,
      order.paymentType || "Cash on delivery",
      order.onlinePaymentMethod || "",
      JSON.stringify(Array.isArray(order.items) ? order.items : []),
      order.subtotal,
      order.deliveryFee,
      order.discount || 0,
      order.coupon ? JSON.stringify(order.coupon) : null,
      order.total,
      order.status,
      formatSqlDate(order.createdAt)
    ]
  );
}

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml"
};

const securityHeaders = {
  "Content-Security-Policy": [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self'",
    "img-src 'self' data: https:",
    "connect-src 'self'",
    "font-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'"
  ].join("; "),
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Strict-Transport-Security": "max-age=15552000; includeSubDomains",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()"
};

function withSecurityHeaders(headers = {}) {
  return {
    ...securityHeaders,
    ...headers
  };
}

function sendJson(res, statusCode, payload, headers = {}) {
  res.writeHead(statusCode, withSecurityHeaders({
    "Content-Type": "application/json; charset=utf-8",
    ...headers
  }));
  res.end(JSON.stringify(payload));
}

function readRequestBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", chunk => {
      body += chunk;
      if (body.length > 1_000_000) {
        req.destroy();
        reject(new Error("Request body too large"));
      }
    });
    req.on("end", () => resolve(body));
    req.on("error", reject);
  });
}

function parseCookies(req) {
  return Object.fromEntries(
    String(req.headers.cookie || "")
      .split(";")
      .map(cookie => cookie.trim().split("="))
      .filter(parts => parts.length === 2)
      .map(([key, value]) => [key, decodeURIComponent(value)])
  );
}

function hashToken(token) {
  return crypto.createHash("sha256").update(String(token)).digest("hex");
}

function signCsrfToken(sessionToken, nonce) {
  return crypto
    .createHmac("sha256", CSRF_SECRET)
    .update(`${sessionToken}:${nonce}`)
    .digest("hex");
}

function createCsrfToken(sessionToken) {
  const nonce = crypto.randomBytes(16).toString("hex");
  return `${nonce}.${signCsrfToken(sessionToken, nonce)}`;
}

function verifyCsrfToken(sessionToken, csrfToken) {
  const [nonce, signature] = String(csrfToken || "").split(".");
  if (!sessionToken || !nonce || !signature) return false;
  return safeEqual(signature, signCsrfToken(sessionToken, nonce));
}

function normalizeRateLimitPart(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9@.+_-]/g, "");
}

function getClientIp(req) {
  const forwardedFor = String(req.headers["x-forwarded-for"] || "").split(",")[0].trim();
  return forwardedFor || req.socket.remoteAddress || "unknown";
}

function getRateLimitResult(limitName, keys) {
  const limit = RATE_LIMITS[limitName];
  const now = Date.now();
  const normalizedKeys = keys.map(key => `${limitName}:${normalizeRateLimitPart(key)}`).filter(Boolean);
  let blockedUntil = 0;

  for (const key of normalizedKeys) {
    const bucket = rateLimitBuckets.get(key);
    if (!bucket || bucket.resetAt <= now) {
      rateLimitBuckets.delete(key);
      continue;
    }
    if (bucket.count >= limit.maxAttempts) blockedUntil = Math.max(blockedUntil, bucket.resetAt);
  }

  if (blockedUntil > now) {
    return {
      allowed: false,
      retryAfterSeconds: Math.ceil((blockedUntil - now) / 1000)
    };
  }

  for (const key of normalizedKeys) {
    const bucket = rateLimitBuckets.get(key);
    if (!bucket || bucket.resetAt <= now) {
      rateLimitBuckets.set(key, { count: 1, resetAt: now + limit.windowMs });
    } else {
      bucket.count += 1;
    }
  }

  return { allowed: true, retryAfterSeconds: 0 };
}

function enforceRateLimit(req, res, limitName, identifier = "") {
  const ip = getClientIp(req);
  const keys = [`ip:${ip}`];
  if (identifier) keys.push(`id:${identifier}`);
  const result = getRateLimitResult(limitName, keys);
  if (result.allowed) return false;

  sendJson(
    res,
    429,
    { errors: [`Too many attempts. Please try again in ${result.retryAfterSeconds} seconds.`] },
    { "Retry-After": String(result.retryAfterSeconds) }
  );
  return true;
}

function getRequestUserAgent(req) {
  return String(req.headers["user-agent"] || "").slice(0, 1000);
}

async function recordAdminLoginAttempt(req, username, successful, failureReason = "") {
  await query(
    `INSERT INTO admin_login_history (username, ip_address, user_agent, successful, failure_reason)
     VALUES (?, ?, ?, ?, ?)`,
    [
      String(username || "").trim() || "unknown",
      getClientIp(req),
      getRequestUserAgent(req),
      Boolean(successful),
      failureReason || null
    ]
  );
}

async function getAdminLock(username) {
  const rows = await query(
    "SELECT failed_attempts, locked_until FROM admin_account_locks WHERE username = ? LIMIT 1",
    [username]
  );
  const lock = rows[0];
  if (!lock) return { locked: false, retryAfterSeconds: 0, failedAttempts: 0 };

  const lockedUntil = lock.locked_until ? new Date(lock.locked_until).getTime() : 0;
  if (lockedUntil > Date.now()) {
    return {
      locked: true,
      retryAfterSeconds: Math.ceil((lockedUntil - Date.now()) / 1000),
      failedAttempts: Number(lock.failed_attempts || 0)
    };
  }

  return { locked: false, retryAfterSeconds: 0, failedAttempts: Number(lock.failed_attempts || 0) };
}

async function recordAdminLoginFailure(username) {
  const lock = await getAdminLock(username);
  const failedAttempts = lock.failedAttempts + 1;
  const lockedUntil = failedAttempts >= ADMIN_LOCK_MAX_FAILURES
    ? new Date(Date.now() + ADMIN_LOCK_MINUTES * 60 * 1000)
    : null;

  await query(
    `INSERT INTO admin_account_locks (username, failed_attempts, locked_until, last_failed_at)
     VALUES (?, ?, ?, NOW(3))
     ON DUPLICATE KEY UPDATE
       failed_attempts = VALUES(failed_attempts),
       locked_until = VALUES(locked_until),
       last_failed_at = NOW(3)`,
    [username, failedAttempts, lockedUntil]
  );

  return {
    locked: Boolean(lockedUntil),
    retryAfterSeconds: lockedUntil ? Math.ceil((lockedUntil.getTime() - Date.now()) / 1000) : 0
  };
}

async function resetAdminLoginFailures(username) {
  await query("DELETE FROM admin_account_locks WHERE username = ?", [username]);
}

async function recordAdminActivity(req, action, details = {}) {
  await query(
    `INSERT INTO admin_activity_logs (username, action, ip_address, user_agent, details)
     VALUES (?, ?, ?, ?, ?)`,
    [
      ADMIN_USERNAME,
      action,
      getClientIp(req),
      getRequestUserAgent(req),
      details && Object.keys(details).length ? JSON.stringify(details) : null
    ]
  );
}

async function deleteExpiredAuthRows() {
  await query("DELETE FROM auth_sessions WHERE expires_at < NOW(3)");
  await query(
    "DELETE FROM auth_sessions WHERE session_type = 'admin' AND last_seen_at < ?",
    [new Date(Date.now() - ADMIN_IDLE_TIMEOUT_MINUTES * 60 * 1000)]
  );
  await query("DELETE FROM two_factor_challenges WHERE expires_at < NOW(3)");
}

async function createAuthSession(type, userId, hours) {
  const token = crypto.randomBytes(32).toString("hex");
  await query(
    "INSERT INTO auth_sessions (token_hash, session_type, user_id, expires_at, last_seen_at) VALUES (?, ?, ?, ?, NOW(3))",
    [hashToken(token), type, userId || null, new Date(Date.now() + hours * 60 * 60 * 1000)]
  );
  return token;
}

async function deleteAuthSession(token, type) {
  if (!token) return;
  await query(
    "DELETE FROM auth_sessions WHERE token_hash = ? AND session_type = ?",
    [hashToken(token), type]
  );
}

async function isAdmin(req) {
  const token = parseCookies(req).freshbite_admin;
  if (!token) return false;
  const sessions = await query(
    "SELECT expires_at, last_seen_at FROM auth_sessions WHERE token_hash = ? AND session_type = 'admin' LIMIT 1",
    [hashToken(token)]
  );
  const session = sessions[0];
  if (!session) return false;
  const now = Date.now();
  const expired = new Date(session.expires_at).getTime() < now;
  const idle = new Date(session.last_seen_at).getTime() + ADMIN_IDLE_TIMEOUT_MINUTES * 60 * 1000 < now;
  if (expired || idle) {
    await deleteAuthSession(token, "admin");
    return false;
  }
  await query("UPDATE auth_sessions SET last_seen_at = NOW(3) WHERE token_hash = ? AND session_type = 'admin'", [hashToken(token)]);
  return true;
}

function enforceAdminCsrf(req, res) {
  const sessionToken = parseCookies(req).freshbite_admin;
  const csrfToken = req.headers["x-csrf-token"];
  if (verifyCsrfToken(sessionToken, csrfToken)) return false;

  sendJson(res, 403, { errors: ["Invalid or missing CSRF token. Please refresh the admin page and try again."] });
  return true;
}

function publicUser(user) {
  return {
    id: user.id,
    name: user.name,
    phone: user.phone,
    photoUrl: user.photoUrl || "",
    addresses: Array.isArray(user.addresses) ? user.addresses : [],
    wishlist: Array.isArray(user.wishlist) ? user.wishlist : [],
    createdAt: user.createdAt
  };
}

async function getUser(req) {
  const token = parseCookies(req).freshbite_user;
  if (!token) return null;
  const sessions = await query(
    "SELECT user_id, expires_at FROM auth_sessions WHERE token_hash = ? AND session_type = 'user' LIMIT 1",
    [hashToken(token)]
  );
  const session = sessions[0];
  if (!session) return null;
  if (new Date(session.expires_at).getTime() < Date.now()) {
    await deleteAuthSession(token, "user");
    return null;
  }
  return users.find(user => user.id === session.user_id) || null;
}

function safeEqual(value, expected) {
  const valueBuffer = Buffer.from(String(value));
  const expectedBuffer = Buffer.from(String(expected));
  return valueBuffer.length === expectedBuffer.length && crypto.timingSafeEqual(valueBuffer, expectedBuffer);
}

function hashPassword(password, salt = crypto.randomBytes(16).toString("hex")) {
  const hash = crypto.pbkdf2Sync(String(password), salt, 120000, 32, "sha256").toString("hex");
  return `${salt}:${hash}`;
}

function verifyPassword(password, storedHash) {
  const [salt, expectedHash] = String(storedHash || "").split(":");
  if (!salt || !expectedHash) return false;
  const actualHash = hashPassword(password, salt).split(":")[1];
  return safeEqual(actualHash, expectedHash);
}

function getStrongPasswordErrors(password, user) {
  const errors = [];
  if (password.length < 10) errors.push("Password must have at least 10 characters.");
  if (!/[a-z]/.test(password)) errors.push("Password must include a lowercase letter.");
  if (!/[A-Z]/.test(password)) errors.push("Password must include an uppercase letter.");
  if (!/\d/.test(password)) errors.push("Password must include a number.");
  if (!/[^A-Za-z0-9]/.test(password)) errors.push("Password must include a symbol.");
  if (/\s/.test(password)) errors.push("Password cannot contain spaces.");
  if (user.phone && password.includes(user.phone)) errors.push("Password cannot include your phone number.");
  const normalizedName = String(user.name || "").toLowerCase().replace(/\s+/g, "");
  if (normalizedName.length >= 3 && password.toLowerCase().includes(normalizedName)) {
    errors.push("Password cannot include your name.");
  }
  return errors;
}

function validateUserPayload(payload, options = {}) {
  const { requireName = true, strongPassword = true } = options;
  const user = {
    name: String(payload.name || "").trim(),
    phone: String(payload.phone || "").trim(),
    password: String(payload.password || ""),
    photoUrl: String(payload.photoUrl || "").trim()
  };
  const errors = [];
  if (requireName && user.name.length < 2) errors.push("Please enter your name.");
  if (user.phone.length < 7) errors.push("Please enter a valid phone number.");
  if (strongPassword) {
    errors.push(...getStrongPasswordErrors(user.password, user));
  } else if (!user.password) {
    errors.push("Please enter your password.");
  }
  if (user.photoUrl && !/^https?:\/\//i.test(user.photoUrl) && !user.photoUrl.startsWith("/")) {
    errors.push("Enter a valid profile photo URL.");
  }
  return { user, errors };
}

function validateProduct(payload) {
  const product = {
    name: String(payload.name || "").trim(),
    category: String(payload.category || "").trim(),
    price: Number(payload.price),
    rating: Number(payload.rating),
    prepTime: String(payload.prepTime || "").trim(),
    description: String(payload.description || "").trim(),
    image: String(payload.image || "").trim()
  };
  const errors = [];
  if (product.name.length < 2) errors.push("Product name must have at least 2 characters.");
  if (product.category.length < 2) errors.push("Category is required.");
  if (!Number.isFinite(product.price) || product.price <= 0) errors.push("Price must be greater than zero.");
  if (!Number.isFinite(product.rating) || product.rating < 0 || product.rating > 5) errors.push("Rating must be between 0 and 5.");
  if (!product.prepTime) errors.push("Preparation time is required.");
  if (product.description.length < 8) errors.push("Description must have at least 8 characters.");
  if (!/^https?:\/\//i.test(product.image) && !product.image.startsWith("/")) errors.push("Enter a valid image URL.");
  return { product, errors };
}

function generateCouponCode(prefix = "PROMO") {
  const safePrefix = String(prefix || "PROMO").replace(/[^A-Z0-9]/gi, "").toUpperCase().slice(0, 6) || "PROMO";
  let code = "";
  do {
    code = `${safePrefix}${crypto.randomBytes(3).toString("hex").toUpperCase()}`;
  } while (coupons.some(coupon => normalizeCouponCode(coupon.code) === code));
  return code;
}

function validateCouponPayload(payload) {
  const coupon = {
    code: normalizeCouponCode(payload.code || generateCouponCode(payload.prefix)),
    description: String(payload.description || "").trim(),
    type: String(payload.type || "").trim(),
    value: Number(payload.value),
    minSubtotal: Number(payload.minSubtotal || 0),
    maxDiscount: payload.maxDiscount === "" || payload.maxDiscount === undefined ? null : Number(payload.maxDiscount),
    active: payload.active !== false
  };
  const errors = [];
  if (!/^[A-Z0-9]{4,18}$/.test(coupon.code)) errors.push("Coupon code must be 4 to 18 letters or numbers.");
  if (coupons.some(entry => normalizeCouponCode(entry.code) === coupon.code)) errors.push("This coupon code already exists.");
  if (!["percent", "fixed", "free_delivery"].includes(coupon.type)) errors.push("Choose a valid coupon type.");
  if (coupon.type !== "free_delivery" && (!Number.isFinite(coupon.value) || coupon.value <= 0)) errors.push("Discount value must be greater than zero.");
  if (coupon.type === "percent" && coupon.value > 100) errors.push("Percent discount cannot be more than 100.");
  if (!Number.isFinite(coupon.minSubtotal) || coupon.minSubtotal < 0) errors.push("Minimum subtotal must be zero or more.");
  if (coupon.maxDiscount !== null && (!Number.isFinite(coupon.maxDiscount) || coupon.maxDiscount <= 0)) errors.push("Maximum discount must be greater than zero.");
  if (!coupon.description) {
    if (coupon.type === "percent") coupon.description = `${coupon.value}% off orders above Rs ${coupon.minSubtotal}`;
    if (coupon.type === "fixed") coupon.description = `Rs ${coupon.value} off orders above Rs ${coupon.minSubtotal}`;
    if (coupon.type === "free_delivery") coupon.description = `Free delivery above Rs ${coupon.minSubtotal}`;
  }
  return { coupon, errors };
}

function normalizeCouponCode(code) {
  return String(code || "").trim().toUpperCase();
}

function getCoupon(code) {
  const normalizedCode = normalizeCouponCode(code);
  return coupons.find(coupon => normalizeCouponCode(coupon.code) === normalizedCode && coupon.active !== false);
}

function calculateCouponDiscount(code, subtotal, deliveryFee) {
  const normalizedCode = normalizeCouponCode(code);
  if (!normalizedCode) {
    return { discount: 0, coupon: null, errors: [] };
  }

  const coupon = getCoupon(normalizedCode);
  if (!coupon) {
    return { discount: 0, coupon: null, errors: ["Invalid promo code."] };
  }
  if (subtotal < Number(coupon.minSubtotal || 0)) {
    return { discount: 0, coupon: null, errors: [`${coupon.code} requires a subtotal of at least Rs ${coupon.minSubtotal}.`] };
  }

  let discount = 0;
  if (coupon.type === "percent") {
    discount = Math.floor(subtotal * Number(coupon.value || 0) / 100);
    if (Number.isFinite(Number(coupon.maxDiscount))) discount = Math.min(discount, Number(coupon.maxDiscount));
  } else if (coupon.type === "fixed") {
    discount = Number(coupon.value || 0);
  } else if (coupon.type === "free_delivery") {
    discount = deliveryFee;
  } else {
    return { discount: 0, coupon: null, errors: ["This promo code is not available."] };
  }

  discount = Math.max(0, Math.min(Math.round(discount), subtotal + deliveryFee));
  return {
    discount,
    coupon: {
      code: normalizeCouponCode(coupon.code),
      description: coupon.description || "",
      type: coupon.type
    },
    errors: []
  };
}

function getWishlistProducts(user) {
  const wishlist = Array.isArray(user.wishlist) ? user.wishlist.map(Number) : [];
  return wishlist
    .map(id => products.find(product => product.id === id))
    .filter(Boolean);
}

async function setUserSession(res, user) {
  const token = await createAuthSession("user", user.id, USER_SESSION_HOURS);
  res.setHeader("Set-Cookie", `freshbite_user=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${USER_SESSION_HOURS * 60 * 60}`);
}

function hashTwoFactorCode(code) {
  return crypto.createHash("sha256").update(String(code)).digest("hex");
}

function maskPhone(phone) {
  const digits = String(phone || "").replace(/\D/g, "");
  if (digits.length <= 4) return "your phone";
  return `phone ending ${digits.slice(-4)}`;
}

function shouldExposeTwoFactorCode(smsSent) {
  return process.env.NODE_ENV !== "production" || !smsSent;
}

function getSmsProvider() {
  if (SMS_PROVIDER) return SMS_PROVIDER;
  if (FAST2SMS_API_KEY) return "fast2sms";
  if (TWILIO_ACCOUNT_SID && TWILIO_AUTH_TOKEN && TWILIO_FROM_PHONE) return "twilio";
  if (OTP_SMS_WEBHOOK_URL) return "webhook";
  return "";
}

function toIndianSmsNumber(phone) {
  const digits = String(phone || "").replace(/\D/g, "");
  return digits.length > 10 && digits.startsWith(SMS_DEFAULT_COUNTRY_CODE)
    ? digits.slice(SMS_DEFAULT_COUNTRY_CODE.length)
    : digits;
}

function toE164Phone(phone) {
  const value = String(phone || "").trim();
  if (value.startsWith("+")) return value;
  const digits = value.replace(/\D/g, "");
  if (digits.length === 10) return `+${SMS_DEFAULT_COUNTRY_CODE}${digits}`;
  return digits.startsWith(SMS_DEFAULT_COUNTRY_CODE) ? `+${digits}` : `+${SMS_DEFAULT_COUNTRY_CODE}${digits}`;
}

async function sendSmsWithWebhook(phone, code, message) {
  if (!OTP_SMS_WEBHOOK_URL) throw new Error("OTP_SMS_WEBHOOK_URL is not configured.");

  const response = await fetch(OTP_SMS_WEBHOOK_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ phone, code, message })
  });
  if (!response.ok) throw new Error(`OTP SMS webhook failed with status ${response.status}.`);
}

async function sendSmsWithFast2Sms(phone, message) {
  if (!FAST2SMS_API_KEY) throw new Error("FAST2SMS_API_KEY is not configured.");

  const response = await fetch("https://www.fast2sms.com/dev/bulkV2", {
    method: "POST",
    headers: {
      Authorization: FAST2SMS_API_KEY,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      route: "q",
      message,
      language: "english",
      numbers: toIndianSmsNumber(phone)
    })
  });
  if (!response.ok) throw new Error(`Fast2SMS failed with status ${response.status}.`);
}

async function sendSmsWithTwilio(phone, message) {
  if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN || !TWILIO_FROM_PHONE) {
    throw new Error("Twilio credentials are not configured.");
  }

  const body = new URLSearchParams({
    To: toE164Phone(phone),
    From: TWILIO_FROM_PHONE,
    Body: message
  });
  const credentials = Buffer.from(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`).toString("base64");
  const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/Messages.json`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${credentials}`,
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body
  });
  if (!response.ok) throw new Error(`Twilio failed with status ${response.status}.`);
}

async function sendTwoFactorCode(phone, code, label) {
  const message = `Your FreshBite OTP is ${code}. It expires in ${TWO_FACTOR_CODE_MINUTES} minutes.`;
  const provider = getSmsProvider();
  if (!provider) {
    console.log(`${label} OTP for ${phone}: ${code}`);
    return false;
  }

  try {
    if (provider === "fast2sms") await sendSmsWithFast2Sms(phone, message);
    else if (provider === "twilio") await sendSmsWithTwilio(phone, message);
    else if (provider === "webhook") await sendSmsWithWebhook(phone, code, message);
    else throw new Error(`Unknown SMS_PROVIDER '${provider}'.`);
    console.log(`${label} OTP sent by SMS to ${maskPhone(phone)} using ${provider}.`);
    return true;
  } catch (error) {
    console.error(`${label} SMS failed: ${error.message} Showing OTP as fallback.`);
  }
  console.log(`${label} OTP for ${phone}: ${code}`);
  return false;
}

async function createTwoFactorChallenge(user) {
  const token = crypto.randomBytes(32).toString("hex");
  const code = String(crypto.randomInt(100000, 1000000));
  const expiresAt = Date.now() + TWO_FACTOR_CODE_MINUTES * 60 * 1000;
  await query(
    `INSERT INTO two_factor_challenges (token_hash, challenge_type, user_id, code_hash, attempts, expires_at)
     VALUES (?, 'user', ?, ?, 0, ?)`,
    [hashToken(token), user.id, hashTwoFactorCode(code), new Date(expiresAt)]
  );
  const smsSent = await sendTwoFactorCode(user.phone, code, "Customer");
  return {
    token,
    expiresInSeconds: TWO_FACTOR_CODE_MINUTES * 60,
    destination: maskPhone(user.phone),
    developmentCode: shouldExposeTwoFactorCode(smsSent) ? code : undefined
  };
}

async function createAdminTwoFactorChallenge() {
  const token = crypto.randomBytes(32).toString("hex");
  const code = String(crypto.randomInt(100000, 1000000));
  const expiresAt = Date.now() + TWO_FACTOR_CODE_MINUTES * 60 * 1000;
  await query(
    `INSERT INTO two_factor_challenges (token_hash, challenge_type, user_id, code_hash, attempts, expires_at)
     VALUES (?, 'admin', NULL, ?, 0, ?)`,
    [hashToken(token), hashTwoFactorCode(code), new Date(expiresAt)]
  );
  const smsSent = await sendTwoFactorCode(ADMIN_PHONE, code, `Admin ${ADMIN_USERNAME}`);
  return {
    token,
    expiresInSeconds: TWO_FACTOR_CODE_MINUTES * 60,
    destination: maskPhone(ADMIN_PHONE),
    developmentCode: shouldExposeTwoFactorCode(smsSent) ? code : undefined
  };
}

async function getTwoFactorChallenge(token, type) {
  await deleteExpiredAuthRows();
  const challenges = await query(
    `SELECT token_hash, user_id, code_hash, attempts, expires_at
     FROM two_factor_challenges
     WHERE token_hash = ? AND challenge_type = ?
     LIMIT 1`,
    [hashToken(token), type]
  );
  return challenges[0] || null;
}

async function incrementTwoFactorAttempts(tokenHash) {
  await query("UPDATE two_factor_challenges SET attempts = attempts + 1 WHERE token_hash = ?", [tokenHash]);
}

async function deleteTwoFactorChallenge(tokenHash) {
  await query("DELETE FROM two_factor_challenges WHERE token_hash = ?", [tokenHash]);
}

function serveStatic(req, res) {
  const safePath = req.url === "/" ? "/index.html" : decodeURIComponent(req.url.split("?")[0]);
  const filePath = path.normalize(path.join(PUBLIC_DIR, safePath));

  const relativePath = path.relative(PUBLIC_DIR, filePath);
  if (relativePath.startsWith("..") || path.isAbsolute(relativePath)) {
    res.writeHead(403, withSecurityHeaders({ "Content-Type": "text/plain; charset=utf-8" }));
    res.end("Forbidden");
    return;
  }

  fs.readFile(filePath, (error, content) => {
    if (error) {
      res.writeHead(404, withSecurityHeaders({ "Content-Type": "text/plain; charset=utf-8" }));
      res.end("Not found");
      return;
    }

    const contentType = mimeTypes[path.extname(filePath)] || "application/octet-stream";
    res.writeHead(200, withSecurityHeaders({ "Content-Type": contentType }));
    res.end(content);
  });
}

function validateOrder(payload) {
  const errors = [];
  const name = String(payload.name || "").trim();
  const phone = String(payload.phone || "").trim();
  const address = String(payload.address || "").trim();
  const paymentType = String(payload.paymentType || "").trim();
  const onlinePaymentMethod = String(payload.onlinePaymentMethod || "").trim();
  const items = Array.isArray(payload.items) ? payload.items : [];
  const allowedPaymentTypes = ["Cash on delivery", "Online payment"];
  const allowedOnlineMethods = ["UPI", "Card", "Net banking", "Wallet"];

  if (name.length < 2) errors.push("Please enter your name.");
  if (phone.length < 7) errors.push("Please enter a valid phone number.");
  if (address.length < 8) errors.push("Please enter a delivery address.");
  if (!allowedPaymentTypes.includes(paymentType)) errors.push("Please choose a payment method.");
  if (paymentType === "Online payment" && !allowedOnlineMethods.includes(onlinePaymentMethod)) {
    errors.push("Please choose how you want to pay online.");
  }
  if (items.length === 0) errors.push("Your cart is empty.");

  const normalizedItems = [];
  for (const item of items) {
    const product = products.find(entry => entry.id === Number(item.id));
    const quantity = Number(item.quantity);

    if (!product || !Number.isInteger(quantity) || quantity < 1 || quantity > 20) {
      errors.push("One or more cart items are invalid.");
      break;
    }

    normalizedItems.push({
      id: product.id,
      name: product.name,
      price: product.price,
      quantity
    });
  }

  return {
    errors,
    order: {
      name,
      phone,
      address,
      paymentType,
      onlinePaymentMethod: paymentType === "Online payment" ? onlinePaymentMethod : "",
      items: normalizedItems
    }
  };
}

const server = http.createServer(async (req, res) => {
  const requestPath = req.url.split("?")[0].replace(/\/+$/, "") || "/";

  if (req.method === "OPTIONS" && requestPath.startsWith("/api/")) {
    res.writeHead(204, withSecurityHeaders({
      "Allow": "GET,POST,PUT,DELETE,OPTIONS",
      "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type"
    }));
    res.end();
    return;
  }

  if (req.method === "GET" && requestPath === "/api/health") {
    sendJson(res, 200, { status: "ok" });
    return;
  }
  if (req.method === "GET" && requestPath === "/api/products") {
    sendJson(res, 200, products);
    return;
  }

  if (req.method === "POST" && requestPath === "/api/coupons/validate") {
    try {
      const payload = JSON.parse(await readRequestBody(req) || "{}");
      const items = Array.isArray(payload.items) ? payload.items : [];
      const errors = [];
      const normalizedItems = [];
      for (const item of items) {
        const product = products.find(entry => entry.id === Number(item.id));
        const quantity = Number(item.quantity);
        if (!product || !Number.isInteger(quantity) || quantity < 1 || quantity > 20) {
          errors.push("One or more cart items are invalid.");
          break;
        }
        normalizedItems.push({ price: product.price, quantity });
      }
      if (normalizedItems.length === 0) errors.push("Your cart is empty.");
      if (errors.length) {
        sendJson(res, 400, { errors });
        return;
      }
      const subtotal = normalizedItems.reduce((sum, item) => sum + item.price * item.quantity, 0);
      const deliveryFee = subtotal >= 499 ? 0 : 39;
      const couponResult = calculateCouponDiscount(payload.code, subtotal, deliveryFee);
      if (couponResult.errors.length) {
        sendJson(res, 400, { errors: couponResult.errors });
        return;
      }
      sendJson(res, 200, {
        subtotal,
        deliveryFee,
        discount: couponResult.discount,
        total: subtotal + deliveryFee - couponResult.discount,
        coupon: couponResult.coupon
      });
    } catch (error) {
      sendJson(res, 400, { errors: ["Could not apply this promo code."] });
    }
    return;
  }

  if (req.method === "GET" && requestPath === "/api/user/me") {
    const user = await getUser(req);
    if (!user) {
      sendJson(res, 401, { errors: ["User sign-in required."] });
      return;
    }
    sendJson(res, 200, publicUser(user));
    return;
  }

  if (req.method === "POST" && requestPath === "/api/user/register") {
    try {
      const payload = JSON.parse(await readRequestBody(req) || "{}");
      if (enforceRateLimit(req, res, "userRegister", payload.phone)) return;
      const { user, errors } = validateUserPayload(payload);
      if (users.some(entry => entry.phone === user.phone)) errors.push("An account already exists for this phone number.");
      if (errors.length) {
        sendJson(res, 400, { errors });
        return;
      }
      const createdUser = {
        id: crypto.randomUUID(),
        name: user.name,
        phone: user.phone,
        photoUrl: user.photoUrl,
        addresses: [],
        wishlist: [],
        passwordHash: hashPassword(user.password),
        createdAt: new Date().toISOString()
      };
      await saveUser(createdUser);
      users.push(createdUser);
      const challenge = await createTwoFactorChallenge(createdUser);
      sendJson(res, 201, {
        requiresTwoFactor: true,
        challengeToken: challenge.token,
        expiresInSeconds: challenge.expiresInSeconds,
        destination: challenge.destination,
        developmentCode: challenge.developmentCode
      });
    } catch (error) {
      sendJson(res, 400, { errors: ["Could not create your account."] });
    }
    return;
  }

  if (req.method === "POST" && requestPath === "/api/user/login") {
    try {
      const payload = JSON.parse(await readRequestBody(req) || "{}");
      if (enforceRateLimit(req, res, "userLogin", payload.phone)) return;
      const { user, errors } = validateUserPayload(payload, { requireName: false, strongPassword: false });
      const existingUser = users.find(entry => entry.phone === user.phone);
      if (errors.length || !existingUser || !verifyPassword(user.password, existingUser.passwordHash)) {
        sendJson(res, 401, { errors: ["Invalid phone number or password."] });
        return;
      }
      const challenge = await createTwoFactorChallenge(existingUser);
      sendJson(res, 200, {
        requiresTwoFactor: true,
        challengeToken: challenge.token,
        expiresInSeconds: challenge.expiresInSeconds,
        destination: challenge.destination,
        developmentCode: challenge.developmentCode
      });
    } catch (error) {
      sendJson(res, 400, { errors: ["Could not sign in."] });
    }
    return;
  }

  if (req.method === "POST" && requestPath === "/api/user/2fa/verify") {
    try {
      await deleteExpiredAuthRows();
      const payload = JSON.parse(await readRequestBody(req) || "{}");
      const token = String(payload.challengeToken || "");
      const code = String(payload.code || "").trim();
      const challenge = await getTwoFactorChallenge(token, "user");
      if (!challenge) {
        sendJson(res, 401, { errors: ["Verification code expired. Please sign in again."] });
        return;
      }
      if (!/^\d{6}$/.test(code)) {
        sendJson(res, 400, { errors: ["Enter the 6-digit verification code."] });
        return;
      }
      await incrementTwoFactorAttempts(challenge.token_hash);
      if (Number(challenge.attempts) + 1 > TWO_FACTOR_MAX_ATTEMPTS) {
        await deleteTwoFactorChallenge(challenge.token_hash);
        sendJson(res, 429, { errors: ["Too many verification attempts. Please sign in again."] });
        return;
      }
      if (!safeEqual(hashTwoFactorCode(code), challenge.code_hash)) {
        sendJson(res, 401, { errors: ["Invalid verification code."] });
        return;
      }
      const verifiedUser = users.find(entry => entry.id === challenge.user_id);
      if (!verifiedUser) {
        await deleteTwoFactorChallenge(challenge.token_hash);
        sendJson(res, 401, { errors: ["Account not found. Please sign in again."] });
        return;
      }
      await deleteTwoFactorChallenge(challenge.token_hash);
      await setUserSession(res, verifiedUser);
      sendJson(res, 200, publicUser(verifiedUser));
    } catch (error) {
      sendJson(res, 400, { errors: ["Could not verify this code."] });
    }
    return;
  }

  if (req.method === "POST" && requestPath === "/api/user/logout") {
    const token = parseCookies(req).freshbite_user;
    await deleteAuthSession(token, "user");
    res.setHeader("Set-Cookie", "freshbite_user=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0");
    sendJson(res, 200, { success: true });
    return;
  }

  if (req.method === "GET" && requestPath === "/api/wishlist") {
    const user = await getUser(req);
    if (!user) {
      sendJson(res, 401, { errors: ["Please sign in to view your wishlist."] });
      return;
    }
    sendJson(res, 200, getWishlistProducts(user));
    return;
  }

  if (req.method === "POST" && requestPath === "/api/wishlist") {
    const user = await getUser(req);
    if (!user) {
      sendJson(res, 401, { errors: ["Please sign in to save favorites."] });
      return;
    }
    try {
      const payload = JSON.parse(await readRequestBody(req) || "{}");
      const productId = Number(payload.productId);
      const product = products.find(entry => entry.id === productId);
      if (!product) {
        sendJson(res, 404, { errors: ["Dish not found."] });
        return;
      }
      const wishlist = Array.isArray(user.wishlist) ? user.wishlist.map(Number) : [];
      if (!wishlist.includes(productId)) user.wishlist = [productId, ...wishlist];
      await saveUser(user);
      sendJson(res, 200, getWishlistProducts(user));
    } catch (error) {
      sendJson(res, 400, { errors: ["Could not save this favorite."] });
    }
    return;
  }

  const wishlistDeleteMatch = requestPath.match(/^\/api\/wishlist\/(\d+)$/);
  if (req.method === "DELETE" && wishlistDeleteMatch) {
    const user = await getUser(req);
    if (!user) {
      sendJson(res, 401, { errors: ["Please sign in to update your wishlist."] });
      return;
    }
    const productId = Number(wishlistDeleteMatch[1]);
    user.wishlist = (Array.isArray(user.wishlist) ? user.wishlist : []).filter(id => Number(id) !== productId);
    await saveUser(user);
    sendJson(res, 200, getWishlistProducts(user));
    return;
  }

  if (req.method === "POST" && requestPath === "/api/admin/login") {
    try {
      const payload = JSON.parse(await readRequestBody(req) || "{}");
      const username = String(payload.username || "").trim();
      if (enforceRateLimit(req, res, "adminLogin", username)) {
        await recordAdminLoginAttempt(req, username, false, "rate_limited");
        return;
      }
      const lock = await getAdminLock(ADMIN_USERNAME);
      if (lock.locked) {
        await recordAdminLoginAttempt(req, username, false, "account_locked");
        sendJson(
          res,
          423,
          { errors: [`Admin account is locked. Please try again in ${lock.retryAfterSeconds} seconds.`] },
          { "Retry-After": String(lock.retryAfterSeconds) }
        );
        return;
      }
      const validUser = safeEqual(payload.username, ADMIN_USERNAME);
      const validPassword = safeEqual(payload.password, ADMIN_PASSWORD);
      if (!validUser || !validPassword) {
        const failed = await recordAdminLoginFailure(ADMIN_USERNAME);
        await recordAdminLoginAttempt(req, username, false, failed.locked ? "locked_after_failures" : "invalid_credentials");
        if (failed.locked) {
          sendJson(
            res,
            423,
            { errors: [`Too many failed admin logins. Account locked for ${ADMIN_LOCK_MINUTES} minutes.`] },
            { "Retry-After": String(failed.retryAfterSeconds) }
          );
          return;
        }
        sendJson(res, 401, { errors: ["Invalid admin username or password."] });
        return;
      }

      await resetAdminLoginFailures(ADMIN_USERNAME);
      const challenge = await createAdminTwoFactorChallenge();
      sendJson(res, 200, {
        requiresTwoFactor: true,
        challengeToken: challenge.token,
        expiresInSeconds: challenge.expiresInSeconds,
        destination: challenge.destination,
        developmentCode: challenge.developmentCode
      });
    } catch (error) {
      sendJson(res, 400, { errors: ["Could not sign in."] });
    }
    return;
  }

  if (req.method === "POST" && req.url === "/api/admin/2fa/verify") {
    try {
      await deleteExpiredAuthRows();
      const payload = JSON.parse(await readRequestBody(req) || "{}");
      const token = String(payload.challengeToken || "");
      const code = String(payload.code || "").trim();
      const challenge = await getTwoFactorChallenge(token, "admin");
      if (!challenge) {
        await recordAdminLoginAttempt(req, ADMIN_USERNAME, false, "otp_expired");
        sendJson(res, 401, { errors: ["Verification code expired. Please sign in again."] });
        return;
      }
      if (!/^\d{6}$/.test(code)) {
        await recordAdminLoginAttempt(req, ADMIN_USERNAME, false, "invalid_otp_format");
        sendJson(res, 400, { errors: ["Enter the 6-digit verification code."] });
        return;
      }
      await incrementTwoFactorAttempts(challenge.token_hash);
      if (Number(challenge.attempts) + 1 > TWO_FACTOR_MAX_ATTEMPTS) {
        await deleteTwoFactorChallenge(challenge.token_hash);
        await recordAdminLoginAttempt(req, ADMIN_USERNAME, false, "too_many_otp_attempts");
        sendJson(res, 429, { errors: ["Too many verification attempts. Please sign in again."] });
        return;
      }
      if (!safeEqual(hashTwoFactorCode(code), challenge.code_hash)) {
        await recordAdminLoginAttempt(req, ADMIN_USERNAME, false, "invalid_otp");
        sendJson(res, 401, { errors: ["Invalid verification code."] });
        return;
      }
      await deleteTwoFactorChallenge(challenge.token_hash);
      const sessionToken = await createAuthSession("admin", null, ADMIN_SESSION_HOURS);
      res.setHeader("Set-Cookie", `freshbite_admin=${sessionToken}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${ADMIN_SESSION_HOURS * 60 * 60}`);
      await recordAdminLoginAttempt(req, ADMIN_USERNAME, true);
      await recordAdminActivity(req, "login_success");
      sendJson(res, 200, { username: ADMIN_USERNAME });
    } catch (error) {
      sendJson(res, 400, { errors: ["Could not verify this code."] });
    }
    return;
  }

  if (req.method === "POST" && req.url === "/api/admin/logout") {
    if ((await isAdmin(req)) && enforceAdminCsrf(req, res)) return;
    const token = parseCookies(req).freshbite_admin;
    if (token) await recordAdminActivity(req, "logout");
    await deleteAuthSession(token, "admin");
    res.setHeader("Set-Cookie", "freshbite_admin=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0");
    sendJson(res, 200, { success: true });
    return;
  }

  if (req.method === "GET" && requestPath === "/api/admin/security") {
    if (!(await isAdmin(req))) {
      sendJson(res, 401, { errors: ["Admin sign-in required."] });
      return;
    }
    const loginHistory = await query(
      `SELECT username, ip_address, user_agent, successful, failure_reason, created_at
       FROM admin_login_history
       ORDER BY created_at DESC
       LIMIT 20`
    );
    const activityLogs = await query(
      `SELECT username, action, ip_address, user_agent, details, created_at
       FROM admin_activity_logs
       ORDER BY created_at DESC
       LIMIT 20`
    );
    sendJson(res, 200, {
      idleTimeoutMinutes: ADMIN_IDLE_TIMEOUT_MINUTES,
      lockMaxFailures: ADMIN_LOCK_MAX_FAILURES,
      lockMinutes: ADMIN_LOCK_MINUTES,
      loginHistory: loginHistory.map(row => ({
        username: row.username,
        ipAddress: row.ip_address,
        userAgent: row.user_agent || "",
        successful: Boolean(row.successful),
        failureReason: row.failure_reason || "",
        createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at
      })),
      activityLogs: activityLogs.map(row => ({
        username: row.username,
        action: row.action,
        ipAddress: row.ip_address,
        userAgent: row.user_agent || "",
        details: parseJsonColumn(row.details, null),
        createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at
      }))
    });
    return;
  }

  if (req.method === "GET" && requestPath === "/api/admin/csrf") {
    if (!(await isAdmin(req))) {
      sendJson(res, 401, { errors: ["Admin sign-in required."] });
      return;
    }
    sendJson(res, 200, { csrfToken: createCsrfToken(parseCookies(req).freshbite_admin) });
    return;
  }

  if (req.method === "GET" && req.url === "/api/admin/coupons") {
    if (!(await isAdmin(req))) {
      sendJson(res, 401, { errors: ["Admin sign-in required."] });
      return;
    }
    sendJson(res, 200, coupons);
    return;
  }

  if (req.method === "POST" && req.url === "/api/admin/coupons") {
    if (!(await isAdmin(req))) {
      sendJson(res, 401, { errors: ["Admin sign-in required."] });
      return;
    }
    if (enforceAdminCsrf(req, res)) return;
    try {
      const payload = JSON.parse(await readRequestBody(req) || "{}");
      const { coupon, errors } = validateCouponPayload(payload);
      if (errors.length) {
        sendJson(res, 400, { errors });
        return;
      }
      coupons.push(coupon);
      await saveCoupon(coupon);
      await recordAdminActivity(req, "coupon_create", { code: coupon.code });
      sendJson(res, 201, coupon);
    } catch (error) {
      sendJson(res, 400, { errors: ["Could not create promo code."] });
    }
    return;
  }

  const couponToggleMatch = req.url.match(/^\/api\/admin\/coupons\/([A-Z0-9]+)\/toggle$/i);
  if (req.method === "PUT" && couponToggleMatch) {
    if (!(await isAdmin(req))) {
      sendJson(res, 401, { errors: ["Admin sign-in required."] });
      return;
    }
    if (enforceAdminCsrf(req, res)) return;
    const coupon = coupons.find(entry => normalizeCouponCode(entry.code) === normalizeCouponCode(couponToggleMatch[1]));
    if (!coupon) {
      sendJson(res, 404, { errors: ["Promo code not found."] });
      return;
    }
    coupon.active = coupon.active === false;
    await saveCoupon(coupon);
    await recordAdminActivity(req, "coupon_toggle", { code: coupon.code, active: coupon.active !== false });
    sendJson(res, 200, coupon);
    return;
  }

  if (req.method === "POST" && req.url === "/api/admin/products") {
    if (!(await isAdmin(req))) {
      sendJson(res, 401, { errors: ["Admin sign-in required."] });
      return;
    }
    if (enforceAdminCsrf(req, res)) return;
    try {
      const payload = JSON.parse(await readRequestBody(req) || "{}");
      const { product, errors } = validateProduct(payload);
      if (errors.length) {
        sendJson(res, 400, { errors });
        return;
      }
      const createdProduct = { id: Math.max(0, ...products.map(item => item.id)) + 1, ...product };
      products.push(createdProduct);
      await saveProduct(createdProduct);
      await recordAdminActivity(req, "product_create", { productId: createdProduct.id, name: createdProduct.name });
      sendJson(res, 201, createdProduct);
    } catch (error) {
      sendJson(res, 400, { errors: ["Could not add the product."] });
    }
    return;
  }

  const productEditMatch = req.url.match(/^\/api\/admin\/products\/(\d+)$/);
  if (req.method === "DELETE" && productEditMatch) {
    if (!(await isAdmin(req))) {
      sendJson(res, 401, { errors: ["Admin sign-in required."] });
      return;
    }
    if (enforceAdminCsrf(req, res)) return;

    const productId = Number(productEditMatch[1]);
    const index = products.findIndex(product => product.id === productId);
    if (index === -1) {
      sendJson(res, 404, { errors: ["Product not found."] });
      return;
    }
    const [removedProduct] = products.splice(index, 1);
    await deleteProduct(productId);
    await recordAdminActivity(req, "product_delete", { productId, name: removedProduct.name });
    sendJson(res, 200, { success: true });
    return;
  }

  if (req.method === "PUT" && productEditMatch) {
    if (!(await isAdmin(req))) {
      sendJson(res, 401, { errors: ["Admin sign-in required."] });
      return;
    }
    if (enforceAdminCsrf(req, res)) return;
    try {
      const index = products.findIndex(product => product.id === Number(productEditMatch[1]));
      if (index === -1) {
        sendJson(res, 404, { errors: ["Product not found."] });
        return;
      }
      const payload = JSON.parse(await readRequestBody(req) || "{}");
      const { product, errors } = validateProduct(payload);
      if (errors.length) {
        sendJson(res, 400, { errors });
        return;
      }
      products[index] = { id: products[index].id, ...product };
      await saveProduct(products[index]);
      await recordAdminActivity(req, "product_update", { productId: products[index].id, name: products[index].name });
      sendJson(res, 200, products[index]);
    } catch (error) {
      sendJson(res, 400, { errors: ["Could not update the product."] });
    }
    return;
  }

  if (req.method === "POST" && req.url === "/api/orders") {
    const user = await getUser(req);
    if (!user) {
      sendJson(res, 401, { errors: ["Please sign in before placing an order."] });
      return;
    }
    try {
      const body = await readRequestBody(req);
      const payload = JSON.parse(body || "{}");
      payload.name = user.name;
      payload.phone = user.phone;
      const { errors, order } = validateOrder(payload);

      if (errors.length > 0) {
        sendJson(res, 400, { errors });
        return;
      }

      const subtotal = order.items.reduce((sum, item) => sum + item.price * item.quantity, 0);
      const deliveryFee = subtotal >= 499 ? 0 : 39;
      const couponResult = calculateCouponDiscount(payload.couponCode, subtotal, deliveryFee);
      if (couponResult.errors.length) {
        sendJson(res, 400, { errors: couponResult.errors });
        return;
      }
      const discount = couponResult.discount;
      const total = subtotal + deliveryFee - discount;
      const createdOrder = {
        id: crypto.randomUUID().slice(0, 8).toUpperCase(),
        userId: user.id,
        ...order,
        subtotal,
        deliveryFee,
        discount,
        coupon: couponResult.coupon,
        total,
        status: "Confirmed",
        createdAt: new Date().toISOString()
      };

      orders.push(createdOrder);
      const savedAddresses = Array.isArray(user.addresses) ? user.addresses : [];
      const normalizedAddress = order.address.replace(/\s+/g, " ").trim();
      const addressExists = savedAddresses.some(address => address.toLowerCase() === normalizedAddress.toLowerCase());
      if (!addressExists) {
        user.addresses = [normalizedAddress, ...savedAddresses].slice(0, 5);
        await saveUser(user);
      }
      await saveOrder(createdOrder);
      sendJson(res, 201, createdOrder);
    } catch (error) {
      sendJson(res, 400, { errors: ["Could not place the order. Please try again."] });
    }
    return;
  }

  if (req.method === "POST" && req.url === "/api/track-order") {
    try {
      const payload = JSON.parse(await readRequestBody(req) || "{}");
      const orderId = String(payload.orderId || "").trim().toUpperCase();
      const phone = String(payload.phone || "").trim();
      const order = orders.find(item => item.id === orderId && item.phone === phone);
      if (!order) {
        sendJson(res, 404, { errors: ["Order not found. Check the order ID and phone number."] });
        return;
      }
      sendJson(res, 200, {
        id: order.id,
        name: order.name,
        items: order.items,
        total: order.total,
        discount: order.discount || 0,
        coupon: order.coupon || null,
        paymentType: order.paymentType || "Cash on delivery",
        onlinePaymentMethod: order.onlinePaymentMethod || "",
        status: order.status,
        createdAt: order.createdAt
      });
    } catch (error) {
      sendJson(res, 400, { errors: ["Could not track this order."] });
    }
    return;
  }

  if (req.method === "POST" && req.url === "/api/my-orders") {
    const user = await getUser(req);
    if (!user) {
      sendJson(res, 401, { errors: ["Please sign in to view your orders."] });
      return;
    }
    try {
      const customerOrders = orders
        .filter(order => order.userId === user.id || order.phone === user.phone)
        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
        .map(order => ({
          id: order.id,
          name: order.name,
          address: order.address,
          items: order.items,
          subtotal: order.subtotal,
          deliveryFee: order.deliveryFee,
          discount: order.discount || 0,
          coupon: order.coupon || null,
          total: order.total,
          paymentType: order.paymentType || "Cash on delivery",
          onlinePaymentMethod: order.onlinePaymentMethod || "",
          status: order.status,
          createdAt: order.createdAt
        }));
      sendJson(res, 200, customerOrders);
    } catch (error) {
      sendJson(res, 400, { errors: ["Could not load your orders."] });
    }
    return;
  }

  const orderStatusMatch = req.url.match(/^\/api\/admin\/orders\/([A-Z0-9-]+)\/status$/i);
  if (req.method === "PUT" && orderStatusMatch) {
    if (!(await isAdmin(req))) {
      sendJson(res, 401, { errors: ["Admin sign-in required."] });
      return;
    }
    if (enforceAdminCsrf(req, res)) return;
    try {
      const payload = JSON.parse(await readRequestBody(req) || "{}");
      const allowedStatuses = ["Confirmed", "Preparing", "Out for delivery", "Delivered", "Cancelled"];
      if (!allowedStatuses.includes(payload.status)) {
        sendJson(res, 400, { errors: ["Invalid order status."] });
        return;
      }
      const order = orders.find(item => item.id === orderStatusMatch[1].toUpperCase());
      if (!order) {
        sendJson(res, 404, { errors: ["Order not found."] });
        return;
      }
      order.status = payload.status;
      await saveOrder(order);
      await recordAdminActivity(req, "order_status_update", { orderId: order.id, status: order.status });
      sendJson(res, 200, order);
    } catch (error) {
      sendJson(res, 400, { errors: ["Could not update order status."] });
    }
    return;
  }

  if (req.method === "GET" && req.url.startsWith("/api/orders")) {
    if (!(await isAdmin(req))) {
      sendJson(res, 401, { errors: ["Admin sign-in required."] });
      return;
    }
    sendJson(res, 200, orders);
    return;
  }

  if (req.method === "GET") {
    serveStatic(req, res);
    return;
  }

  sendJson(res, 405, { errors: ["Method not allowed"] });
});

initializeDatabase()
  .then(() => {
    server.listen(PORT, () => {
      console.log(`Food ordering app running at http://localhost:${PORT}`);
      console.log(`Using MySQL database '${DB_NAME}' on ${DB_CONFIG.host}:${DB_CONFIG.port}`);
    });
  })
  .catch(error => {
    const details = [error.code, error.sqlState, error.message].filter(Boolean).join(" - ");
    console.error("Could not initialize the MySQL database:", details || error);
    process.exit(1);
  });

server.on("error", error => {
  if (error.code === "EADDRINUSE") {
    console.error(`Port ${PORT} is already in use. Close the other app using it, then try again.`);
  } else {
    console.error("Could not start the server:", error.message);
  }
  process.exit(1);
});
