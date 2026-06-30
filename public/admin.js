const loginPanel = document.querySelector("#loginPanel");
const dashboard = document.querySelector("#dashboard");
const loginForm = document.querySelector("#loginForm");
const adminTwoFactorForm = document.querySelector("#adminTwoFactorForm");
const loginMessage = document.querySelector("#loginMessage");
const restartAdminLogin = document.querySelector("#restartAdminLogin");
const ordersList = document.querySelector("#ordersList");
const adminSummary = document.querySelector("#adminSummary");
const refreshButton = document.querySelector("#refreshOrders");
const logoutButton = document.querySelector("#logoutButton");
const productForm = document.querySelector("#productForm");
const productMessage = document.querySelector("#productMessage");
const adminProducts = document.querySelector("#adminProducts");
const saveProductButton = document.querySelector("#saveProduct");
const cancelEditButton = document.querySelector("#cancelEdit");
const couponForm = document.querySelector("#couponForm");
const couponAdminMessage = document.querySelector("#couponAdminMessage");
const adminCoupons = document.querySelector("#adminCoupons");
const saveCouponButton = document.querySelector("#saveCoupon");
const adminLoginHistory = document.querySelector("#adminLoginHistory");
const adminActivityLogs = document.querySelector("#adminActivityLogs");
let products = [];
let coupons = [];
let adminChallengeToken = "";
let adminCsrfToken = "";

const currency = new Intl.NumberFormat("en-IN", {
  style: "currency", currency: "INR", maximumFractionDigits: 0
});

function formatPrice(value) {
  return currency.format(value).replace(/\u20b9/, "Rs ");
}

function showLogin(message = "") {
  loginPanel.hidden = false;
  dashboard.hidden = true;
  loginForm.hidden = false;
  adminTwoFactorForm.hidden = true;
  adminChallengeToken = "";
  adminCsrfToken = "";
  loginMessage.textContent = message;
  loginMessage.classList.toggle("error", Boolean(message));
}

function showDashboard() {
  loginPanel.hidden = true;
  dashboard.hidden = false;
}

function showAdminOtp(result) {
  adminChallengeToken = result.challengeToken;
  loginForm.hidden = true;
  adminTwoFactorForm.hidden = false;
  adminTwoFactorForm.reset();
  adminTwoFactorForm.elements.code.focus();
  const codeHint = result.developmentCode ? ` Code: ${result.developmentCode}` : "";
  const destination = result.destination ? ` sent to ${result.destination}` : "";
  loginMessage.textContent = `Enter the 6-digit admin OTP${destination}.${codeHint}`;
  loginMessage.classList.remove("error");
}

function createOrderCard(order) {
  const card = document.createElement("article");
  card.className = "admin-order-card";

  const header = document.createElement("div");
  header.className = "admin-order-header";
  const customer = document.createElement("div");
  const name = document.createElement("h2");
  name.textContent = order.name;
  const details = document.createElement("p");
  const paymentText = order.paymentType === "Online payment" && order.onlinePaymentMethod
    ? `${order.paymentType} - ${order.onlinePaymentMethod}`
    : order.paymentType || "Cash on delivery";
  const couponText = order.discount ? ` · Promo ${order.coupon?.code || ""} saved ${formatPrice(order.discount)}` : "";
  details.textContent = `${order.phone} · ${order.address} · ${paymentText}${couponText}`;
  customer.append(name, details);

  const meta = document.createElement("div");
  meta.className = "admin-order-meta";
  const id = document.createElement("strong");
  id.textContent = `#${order.id}`;
  const time = document.createElement("span");
  time.textContent = new Date(order.createdAt).toLocaleString("en-IN");
  meta.append(id, time);
  header.append(customer, meta);

  const itemTable = document.createElement("div");
  itemTable.className = "admin-items";
  order.items.forEach(item => {
    const row = document.createElement("div");
    const itemName = document.createElement("span");
    itemName.textContent = item.name;
    const quantity = document.createElement("strong");
    quantity.textContent = `Qty ${item.quantity}`;
    const amount = document.createElement("span");
    amount.textContent = formatPrice(item.price * item.quantity);
    row.append(itemName, quantity, amount);
    itemTable.appendChild(row);
  });

  const footer = document.createElement("div");
  footer.className = "admin-order-footer";
  const status = document.createElement("select");
  status.className = "status-select";
  ["Confirmed", "Preparing", "Out for delivery", "Delivered", "Cancelled"].forEach(value => {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = value;
    option.selected = value === order.status;
    status.appendChild(option);
  });
  status.setAttribute("aria-label", `Status for order ${order.id}`);
  status.addEventListener("change", async () => {
    status.disabled = true;
    try {
      await ensureAdminCsrfToken();
      const response = await fetch(`/api/admin/orders/${order.id}/status`, {
        method: "PUT",
        headers: adminJsonHeaders(),
        body: JSON.stringify({ status: status.value })
      });
      if (!response.ok) throw new Error();
      await loadSecurityLogs();
    } catch (error) {
      status.value = order.status;
      window.alert("Could not update the order status.");
    } finally {
      status.disabled = false;
    }
  });
  const total = document.createElement("strong");
  total.textContent = `Total ${formatPrice(order.total)}`;
  footer.append(status, total);
  card.append(header, itemTable, footer);
  return card;
}

function resetProductForm() {
  productForm.reset();
  productForm.elements.id.value = "";
  saveProductButton.textContent = "Add product";
  cancelEditButton.hidden = true;
}

function editProduct(product) {
  Object.entries(product).forEach(([key, value]) => {
    if (productForm.elements[key]) productForm.elements[key].value = value;
  });
  saveProductButton.textContent = "Save changes";
  cancelEditButton.hidden = false;
  productForm.scrollIntoView({ behavior: "smooth", block: "center" });
}

function describeCoupon(coupon) {
  if (coupon.type === "percent") {
    const cap = coupon.maxDiscount ? `, max ${formatPrice(coupon.maxDiscount)}` : "";
    return `${coupon.value}% off above ${formatPrice(coupon.minSubtotal || 0)}${cap}`;
  }
  if (coupon.type === "fixed") return `${formatPrice(coupon.value)} off above ${formatPrice(coupon.minSubtotal || 0)}`;
  return `Free delivery above ${formatPrice(coupon.minSubtotal || 0)}`;
}

function renderCoupons() {
  adminCoupons.innerHTML = "";
  if (coupons.length === 0) {
    adminCoupons.innerHTML = '<div class="empty-cart">No promo codes yet.</div>';
    return;
  }
  coupons.forEach(coupon => {
    const row = document.createElement("article");
    row.className = "admin-product-row";
    const badge = document.createElement("div");
    badge.className = `coupon-code-badge ${coupon.active === false ? "inactive" : ""}`;
    badge.textContent = coupon.code;
    const copy = document.createElement("div");
    const title = document.createElement("strong");
    title.textContent = coupon.description || describeCoupon(coupon);
    const details = document.createElement("span");
    details.textContent = `${describeCoupon(coupon)} · ${coupon.active === false ? "Inactive" : "Active"}`;
    copy.append(title, details);
    const toggleButton = document.createElement("button");
    toggleButton.type = "button";
    toggleButton.className = "text-button";
    toggleButton.textContent = coupon.active === false ? "Enable" : "Disable";
    toggleButton.addEventListener("click", () => toggleCoupon(coupon.code, toggleButton));
    row.append(badge, copy, toggleButton);
    adminCoupons.appendChild(row);
  });
}

function renderProducts() {
  adminProducts.innerHTML = "";
  products.forEach(product => {
    const card = document.createElement("article");
    card.className = "admin-product-row";
    const image = document.createElement("img");
    image.src = product.image;
    image.alt = "";
    const copy = document.createElement("div");
    const name = document.createElement("strong");
    name.textContent = product.name;
    const details = document.createElement("span");
    details.textContent = `${product.category} · ${formatPrice(product.price)} · ${product.rating} ★`;
    copy.append(name, details);
    const editButton = document.createElement("button");
    editButton.type = "button";
    editButton.className = "text-button";
    editButton.textContent = "Edit";
    editButton.addEventListener("click", () => editProduct(product));
    const deleteButton = document.createElement("button");
    deleteButton.type = "button";
    deleteButton.className = "text-button danger-button";
    deleteButton.textContent = "Delete";
    deleteButton.addEventListener("click", () => deleteProduct(product, deleteButton));
    card.append(image, copy, editButton, deleteButton);
    adminProducts.appendChild(card);
  });
}

function formatLogTime(value) {
  return new Date(value).toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit"
  });
}

function humanizeAction(action) {
  return String(action || "")
    .split("_")
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function renderSecurityLogs(security) {
  adminLoginHistory.innerHTML = "";
  adminActivityLogs.innerHTML = "";

  if (!security.loginHistory.length) {
    adminLoginHistory.innerHTML = '<div class="empty-cart">No admin login attempts yet.</div>';
  } else {
    security.loginHistory.forEach(entry => {
      const row = document.createElement("article");
      row.className = `security-log-row ${entry.successful ? "success" : "failure"}`;
      const title = document.createElement("strong");
      title.textContent = entry.successful ? "Successful sign in" : "Failed sign in";
      const details = document.createElement("span");
      details.textContent = `${entry.username} - ${entry.ipAddress} - ${formatLogTime(entry.createdAt)}${entry.failureReason ? ` - ${entry.failureReason}` : ""}`;
      row.append(title, details);
      adminLoginHistory.appendChild(row);
    });
  }

  if (!security.activityLogs.length) {
    adminActivityLogs.innerHTML = '<div class="empty-cart">No admin activity yet.</div>';
  } else {
    security.activityLogs.forEach(entry => {
      const row = document.createElement("article");
      row.className = "security-log-row";
      const title = document.createElement("strong");
      title.textContent = humanizeAction(entry.action);
      const details = document.createElement("span");
      const extra = entry.details ? ` - ${Object.entries(entry.details).map(([key, value]) => `${key}: ${value}`).join(", ")}` : "";
      details.textContent = `${entry.ipAddress} - ${formatLogTime(entry.createdAt)}${extra}`;
      row.append(title, details);
      adminActivityLogs.appendChild(row);
    });
  }
}

async function loadAdminCsrfToken() {
  const response = await fetch("/api/admin/csrf");
  if (!response.ok) throw new Error("Could not prepare admin security token.");
  const result = await response.json();
  adminCsrfToken = result.csrfToken;
}

async function ensureAdminCsrfToken() {
  if (!adminCsrfToken) await loadAdminCsrfToken();
}

function adminJsonHeaders() {
  return {
    "Content-Type": "application/json",
    "X-CSRF-Token": adminCsrfToken
  };
}

async function loadProducts() {
  const response = await fetch("/api/products");
  if (!response.ok) throw new Error("Could not load products.");
  products = await response.json();
  renderProducts();
}

async function loadCoupons() {
  const response = await fetch("/api/admin/coupons");
  if (!response.ok) throw new Error("Could not load promo codes.");
  coupons = await response.json();
  renderCoupons();
}

async function loadSecurityLogs() {
  const response = await fetch("/api/admin/security");
  if (!response.ok) throw new Error("Could not load admin security logs.");
  renderSecurityLogs(await response.json());
}

async function toggleCoupon(code, button) {
  button.disabled = true;
  try {
    await ensureAdminCsrfToken();
    const response = await fetch(`/api/admin/coupons/${encodeURIComponent(code)}/toggle`, {
      method: "PUT",
      headers: { "X-CSRF-Token": adminCsrfToken }
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.errors?.[0] || "Could not update promo code.");
    await loadCoupons();
    await loadSecurityLogs();
  } catch (error) {
    window.alert(error.message);
  } finally {
    button.disabled = false;
  }
}

async function deleteProduct(product, button) {
  if (!window.confirm(`Delete ${product.name}?`)) return;
  button.disabled = true;
  try {
    await ensureAdminCsrfToken();
    const response = await fetch(`/api/admin/products/${product.id}`, {
      method: "DELETE",
      headers: { "X-CSRF-Token": adminCsrfToken }
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.errors?.[0] || "Could not delete product.");
    await loadProducts();
    await loadSecurityLogs();
  } catch (error) {
    window.alert(error.message);
  } finally {
    button.disabled = false;
  }
}

async function loadOrders() {
  ordersList.innerHTML = '<div class="empty-cart">Loading orders...</div>';
  try {
    const response = await fetch("/api/orders");
    if (response.status === 401) {
      showLogin("Please sign in as admin.");
      return;
    }
    if (!response.ok) throw new Error("Could not load orders.");
    const orders = await response.json();
    showDashboard();
    await loadAdminCsrfToken();
    const itemCount = orders.reduce((sum, order) =>
      sum + order.items.reduce((itemSum, item) => itemSum + item.quantity, 0), 0);
    adminSummary.innerHTML = `<div><strong>${orders.length}</strong><span>Orders</span></div><div><strong>${itemCount}</strong><span>Items ordered</span></div>`;
    ordersList.innerHTML = "";
    if (orders.length === 0) {
      ordersList.innerHTML = '<div class="empty-cart">No customer orders yet.</div>';
    } else {
      orders.slice().reverse().forEach(order => ordersList.appendChild(createOrderCard(order)));
    }
    await loadProducts();
    await loadCoupons();
    await loadSecurityLogs();
  } catch (error) {
    ordersList.innerHTML = `<div class="empty-cart">${error.message}</div>`;
  }
}

loginForm.addEventListener("submit", async event => {
  event.preventDefault();
  loginMessage.textContent = "";
  const button = loginForm.querySelector("button");
  const data = new FormData(loginForm);
  button.disabled = true;
  try {
    const response = await fetch("/api/admin/login", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: data.get("username"), password: data.get("password") })
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.errors?.[0] || "Could not sign in.");
    if (result.requiresTwoFactor) {
      showAdminOtp(result);
      return;
    }
    loginForm.reset();
    await loadOrders();
  } catch (error) {
    showLogin(error.message);
  } finally {
    button.disabled = false;
  }
});

adminTwoFactorForm.addEventListener("submit", async event => {
  event.preventDefault();
  loginMessage.textContent = "";
  loginMessage.classList.remove("error");
  const button = adminTwoFactorForm.querySelector(".submit-button");
  button.disabled = true;
  try {
    const response = await fetch("/api/admin/2fa/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        challengeToken: adminChallengeToken,
        code: adminTwoFactorForm.elements.code.value
      })
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.errors?.[0] || "Could not verify OTP.");
    adminChallengeToken = "";
    loginForm.reset();
    adminTwoFactorForm.reset();
    await loadOrders();
  } catch (error) {
    loginMessage.textContent = error.message;
    loginMessage.classList.add("error");
  } finally {
    button.disabled = false;
  }
});

restartAdminLogin.addEventListener("click", () => showLogin());

refreshButton.addEventListener("click", loadOrders);
logoutButton.addEventListener("click", async () => {
  try {
    await ensureAdminCsrfToken();
    await fetch("/api/admin/logout", { method: "POST", headers: { "X-CSRF-Token": adminCsrfToken } });
  } finally {
    showLogin();
  }
});

cancelEditButton.addEventListener("click", resetProductForm);

productForm.addEventListener("submit", async event => {
  event.preventDefault();
  productMessage.textContent = "";
  productMessage.classList.remove("error");
  const data = new FormData(productForm);
  const id = data.get("id");
  const payload = Object.fromEntries(data.entries());
  delete payload.id;
  payload.price = Number(payload.price);
  payload.rating = Number(payload.rating);
  saveProductButton.disabled = true;
  try {
    await ensureAdminCsrfToken();
    const response = await fetch(id ? `/api/admin/products/${id}` : "/api/admin/products", {
      method: id ? "PUT" : "POST",
      headers: adminJsonHeaders(),
      body: JSON.stringify(payload)
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.errors?.join(" ") || "Could not save product.");
    productMessage.textContent = id ? "Product updated." : "Product added.";
    resetProductForm();
    await loadProducts();
    await loadSecurityLogs();
  } catch (error) {
    productMessage.textContent = error.message;
    productMessage.classList.add("error");
  } finally {
    saveProductButton.disabled = false;
  }
});

couponForm.addEventListener("submit", async event => {
  event.preventDefault();
  couponAdminMessage.textContent = "";
  couponAdminMessage.classList.remove("error");
  const data = new FormData(couponForm);
  const payload = Object.fromEntries(data.entries());
  payload.value = Number(payload.value);
  payload.minSubtotal = Number(payload.minSubtotal);
  if (payload.maxDiscount === "") {
    delete payload.maxDiscount;
  } else {
    payload.maxDiscount = Number(payload.maxDiscount);
  }
  saveCouponButton.disabled = true;
  try {
    await ensureAdminCsrfToken();
    const response = await fetch("/api/admin/coupons", {
      method: "POST",
      headers: adminJsonHeaders(),
      body: JSON.stringify(payload)
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.errors?.join(" ") || "Could not create promo code.");
    couponAdminMessage.textContent = `Promo ${result.code} generated.`;
    couponForm.reset();
    couponForm.elements.minSubtotal.value = "0";
    await loadCoupons();
    await loadSecurityLogs();
  } catch (error) {
    couponAdminMessage.textContent = error.message;
    couponAdminMessage.classList.add("error");
  } finally {
    saveCouponButton.disabled = false;
  }
});

loadOrders();
