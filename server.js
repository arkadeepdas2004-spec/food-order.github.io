const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, "public");
const ADMIN_USERNAME = process.env.ADMIN_USERNAME || "admin";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "admin123";
const ADMIN_SESSION_HOURS = 8;
const USER_SESSION_HOURS = 24 * 7;

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

try {
  if (fs.existsSync(PRODUCTS_FILE)) {
    const savedProducts = JSON.parse(fs.readFileSync(PRODUCTS_FILE, "utf8"));
    if (Array.isArray(savedProducts)) products = savedProducts;
  }
} catch (error) {
  console.error("Could not load saved products; using the default menu.");
}

let orders = [];
try {
  if (fs.existsSync(ORDERS_FILE)) {
    const savedOrders = JSON.parse(fs.readFileSync(ORDERS_FILE, "utf8"));
    if (Array.isArray(savedOrders)) orders = savedOrders;
  }
} catch (error) {
  console.error("Could not load saved orders; starting with an empty order list.");
}
const adminSessions = new Map();
const userSessions = new Map();

let users = [];
try {
  if (fs.existsSync(USERS_FILE)) {
    const savedUsers = JSON.parse(fs.readFileSync(USERS_FILE, "utf8"));
    if (Array.isArray(savedUsers)) users = savedUsers;
  }
} catch (error) {
  console.error("Could not load saved users; starting with an empty user list.");
}

let usersNeedSave = false;
users.forEach(user => {
  if (!Array.isArray(user.wishlist)) {
    user.wishlist = [];
    usersNeedSave = true;
  }
});

let coupons = defaultCoupons;
try {
  if (fs.existsSync(COUPONS_FILE)) {
    const savedCoupons = JSON.parse(fs.readFileSync(COUPONS_FILE, "utf8"));
    if (Array.isArray(savedCoupons)) coupons = savedCoupons;
  }
} catch (error) {
  console.error("Could not load saved coupons; using default promo codes.");
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

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "X-Content-Type-Options": "nosniff"
  });
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

function isAdmin(req) {
  const token = parseCookies(req).freshbite_admin;
  const expiresAt = token && adminSessions.get(token);
  if (!expiresAt || expiresAt < Date.now()) {
    if (token) adminSessions.delete(token);
    return false;
  }
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

function getUser(req) {
  const token = parseCookies(req).freshbite_user;
  const session = token && userSessions.get(token);
  if (!session || session.expiresAt < Date.now()) {
    if (token) userSessions.delete(token);
    return null;
  }
  return users.find(user => user.id === session.userId) || null;
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

function validateUserPayload(payload, requireName = true) {
  const user = {
    name: String(payload.name || "").trim(),
    phone: String(payload.phone || "").trim(),
    password: String(payload.password || ""),
    photoUrl: String(payload.photoUrl || "").trim()
  };
  const errors = [];
  if (requireName && user.name.length < 2) errors.push("Please enter your name.");
  if (user.phone.length < 7) errors.push("Please enter a valid phone number.");
  if (user.password.length < 6) errors.push("Password must have at least 6 characters.");
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

function saveProducts() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(PRODUCTS_FILE, JSON.stringify(products, null, 2));
}

function saveOrders() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(ORDERS_FILE, JSON.stringify(orders, null, 2));
}

function saveUsers() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
}

function saveCoupons() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(COUPONS_FILE, JSON.stringify(coupons, null, 2));
}

if (usersNeedSave) saveUsers();

function getWishlistProducts(user) {
  const wishlist = Array.isArray(user.wishlist) ? user.wishlist.map(Number) : [];
  return wishlist
    .map(id => products.find(product => product.id === id))
    .filter(Boolean);
}

function setUserSession(res, user) {
  const token = crypto.randomBytes(32).toString("hex");
  userSessions.set(token, {
    userId: user.id,
    expiresAt: Date.now() + USER_SESSION_HOURS * 60 * 60 * 1000
  });
  res.setHeader("Set-Cookie", `freshbite_user=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${USER_SESSION_HOURS * 60 * 60}`);
}

function serveStatic(req, res) {
  const safePath = req.url === "/" ? "/index.html" : decodeURIComponent(req.url.split("?")[0]);
  const filePath = path.normalize(path.join(PUBLIC_DIR, safePath));

  const relativePath = path.relative(PUBLIC_DIR, filePath);
  if (relativePath.startsWith("..") || path.isAbsolute(relativePath)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  fs.readFile(filePath, (error, content) => {
    if (error) {
      res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("Not found");
      return;
    }

    const contentType = mimeTypes[path.extname(filePath)] || "application/octet-stream";
    res.writeHead(200, { "Content-Type": contentType });
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
    res.writeHead(204, {
      "Allow": "GET,POST,PUT,DELETE,OPTIONS",
      "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type"
    });
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
    const user = getUser(req);
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
      users.push(createdUser);
      saveUsers();
      setUserSession(res, createdUser);
      sendJson(res, 201, publicUser(createdUser));
    } catch (error) {
      sendJson(res, 400, { errors: ["Could not create your account."] });
    }
    return;
  }

  if (req.method === "POST" && requestPath === "/api/user/login") {
    try {
      const payload = JSON.parse(await readRequestBody(req) || "{}");
      const { user, errors } = validateUserPayload(payload, false);
      const existingUser = users.find(entry => entry.phone === user.phone);
      if (errors.length || !existingUser || !verifyPassword(user.password, existingUser.passwordHash)) {
        sendJson(res, 401, { errors: ["Invalid phone number or password."] });
        return;
      }
      setUserSession(res, existingUser);
      sendJson(res, 200, publicUser(existingUser));
    } catch (error) {
      sendJson(res, 400, { errors: ["Could not sign in."] });
    }
    return;
  }

  if (req.method === "POST" && requestPath === "/api/user/logout") {
    const token = parseCookies(req).freshbite_user;
    if (token) userSessions.delete(token);
    res.setHeader("Set-Cookie", "freshbite_user=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0");
    sendJson(res, 200, { success: true });
    return;
  }

  if (req.method === "GET" && requestPath === "/api/wishlist") {
    const user = getUser(req);
    if (!user) {
      sendJson(res, 401, { errors: ["Please sign in to view your wishlist."] });
      return;
    }
    sendJson(res, 200, getWishlistProducts(user));
    return;
  }

  if (req.method === "POST" && requestPath === "/api/wishlist") {
    const user = getUser(req);
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
      saveUsers();
      sendJson(res, 200, getWishlistProducts(user));
    } catch (error) {
      sendJson(res, 400, { errors: ["Could not save this favorite."] });
    }
    return;
  }

  const wishlistDeleteMatch = requestPath.match(/^\/api\/wishlist\/(\d+)$/);
  if (req.method === "DELETE" && wishlistDeleteMatch) {
    const user = getUser(req);
    if (!user) {
      sendJson(res, 401, { errors: ["Please sign in to update your wishlist."] });
      return;
    }
    const productId = Number(wishlistDeleteMatch[1]);
    user.wishlist = (Array.isArray(user.wishlist) ? user.wishlist : []).filter(id => Number(id) !== productId);
    saveUsers();
    sendJson(res, 200, getWishlistProducts(user));
    return;
  }

  if (req.method === "POST" && req.url === "/api/admin/login") {
    try {
      const payload = JSON.parse(await readRequestBody(req) || "{}");
      const validUser = safeEqual(payload.username, ADMIN_USERNAME);
      const validPassword = safeEqual(payload.password, ADMIN_PASSWORD);
      if (!validUser || !validPassword) {
        sendJson(res, 401, { errors: ["Invalid admin username or password."] });
        return;
      }

      const token = crypto.randomBytes(32).toString("hex");
      adminSessions.set(token, Date.now() + ADMIN_SESSION_HOURS * 60 * 60 * 1000);
      res.setHeader("Set-Cookie", `freshbite_admin=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${ADMIN_SESSION_HOURS * 60 * 60}`);
      sendJson(res, 200, { username: ADMIN_USERNAME });
    } catch (error) {
      sendJson(res, 400, { errors: ["Could not sign in."] });
    }
    return;
  }

  if (req.method === "POST" && req.url === "/api/admin/logout") {
    const token = parseCookies(req).freshbite_admin;
    if (token) adminSessions.delete(token);
    res.setHeader("Set-Cookie", "freshbite_admin=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0");
    sendJson(res, 200, { success: true });
    return;
  }

  if (req.method === "GET" && req.url === "/api/admin/coupons") {
    if (!isAdmin(req)) {
      sendJson(res, 401, { errors: ["Admin sign-in required."] });
      return;
    }
    sendJson(res, 200, coupons);
    return;
  }

  if (req.method === "POST" && req.url === "/api/admin/coupons") {
    if (!isAdmin(req)) {
      sendJson(res, 401, { errors: ["Admin sign-in required."] });
      return;
    }
    try {
      const payload = JSON.parse(await readRequestBody(req) || "{}");
      const { coupon, errors } = validateCouponPayload(payload);
      if (errors.length) {
        sendJson(res, 400, { errors });
        return;
      }
      coupons.push(coupon);
      saveCoupons();
      sendJson(res, 201, coupon);
    } catch (error) {
      sendJson(res, 400, { errors: ["Could not create promo code."] });
    }
    return;
  }

  const couponToggleMatch = req.url.match(/^\/api\/admin\/coupons\/([A-Z0-9]+)\/toggle$/i);
  if (req.method === "PUT" && couponToggleMatch) {
    if (!isAdmin(req)) {
      sendJson(res, 401, { errors: ["Admin sign-in required."] });
      return;
    }
    const coupon = coupons.find(entry => normalizeCouponCode(entry.code) === normalizeCouponCode(couponToggleMatch[1]));
    if (!coupon) {
      sendJson(res, 404, { errors: ["Promo code not found."] });
      return;
    }
    coupon.active = coupon.active === false;
    saveCoupons();
    sendJson(res, 200, coupon);
    return;
  }

  if (req.method === "POST" && req.url === "/api/admin/products") {
    if (!isAdmin(req)) {
      sendJson(res, 401, { errors: ["Admin sign-in required."] });
      return;
    }
    try {
      const payload = JSON.parse(await readRequestBody(req) || "{}");
      const { product, errors } = validateProduct(payload);
      if (errors.length) {
        sendJson(res, 400, { errors });
        return;
      }
      const createdProduct = { id: Math.max(0, ...products.map(item => item.id)) + 1, ...product };
      products.push(createdProduct);
      saveProducts();
      sendJson(res, 201, createdProduct);
    } catch (error) {
      sendJson(res, 400, { errors: ["Could not add the product."] });
    }
    return;
  }

  const productEditMatch = req.url.match(/^\/api\/admin\/products\/(\d+)$/);
  if (req.method === "PUT" && productEditMatch) {
    if (!isAdmin(req)) {
      sendJson(res, 401, { errors: ["Admin sign-in required."] });
      return;
    }
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
      saveProducts();
      sendJson(res, 200, products[index]);
    } catch (error) {
      sendJson(res, 400, { errors: ["Could not update the product."] });
    }
    return;
  }

  if (req.method === "POST" && req.url === "/api/orders") {
    const user = getUser(req);
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
        saveUsers();
      }
      saveOrders();
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
    const user = getUser(req);
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
    if (!isAdmin(req)) {
      sendJson(res, 401, { errors: ["Admin sign-in required."] });
      return;
    }
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
      saveOrders();
      sendJson(res, 200, order);
    } catch (error) {
      sendJson(res, 400, { errors: ["Could not update order status."] });
    }
    return;
  }

  if (req.method === "GET" && req.url.startsWith("/api/orders")) {
    if (!isAdmin(req)) {
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

server.listen(PORT, () => {
  console.log(`Food ordering app running at http://localhost:${PORT}`);
});

server.on("error", error => {
  if (error.code === "EADDRINUSE") {
    console.error(`Port ${PORT} is already in use. Close the other app using it, then try again.`);
  } else {
    console.error("Could not start the server:", error.message);
  }
  process.exit(1);
});
