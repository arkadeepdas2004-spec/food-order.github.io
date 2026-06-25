const accessPanel = document.querySelector("#ordersAccess");
const workspace = document.querySelector("#ordersWorkspace");
const phoneForm = document.querySelector("#ordersPhoneForm");
const ordersMessage = document.querySelector("#ordersMessage");
const currentOrders = document.querySelector("#currentOrders");
const pastOrders = document.querySelector("#pastOrders");
const currentCount = document.querySelector("#currentCount");
const pastCount = document.querySelector("#pastCount");
const orderDetail = document.querySelector("#orderDetail");
const changePhone = document.querySelector("#changePhone");

const progressStatuses = ["Confirmed", "Preparing", "Out for delivery", "Delivered"];
const currency = new Intl.NumberFormat("en-IN", {
  style: "currency", currency: "INR", maximumFractionDigits: 0
});
let allOrders = [];
let selectedOrderId = new URLSearchParams(window.location.search).get("id");
let currentUser = null;

function formatPrice(value) {
  return currency.format(value).replace(/\u20b9/, "Rs ");
}

function isPast(order) {
  return order.status === "Delivered" || order.status === "Cancelled";
}

function createOrderButton(order) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = `customer-order-card ${order.id === selectedOrderId ? "selected" : ""}`;
  const top = document.createElement("span");
  top.className = "customer-order-top";
  const id = document.createElement("strong");
  id.textContent = `#${order.id}`;
  const status = document.createElement("span");
  status.className = `customer-status ${order.status === "Cancelled" ? "cancelled" : ""}`;
  status.textContent = order.status;
  top.append(id, status);
  const summary = document.createElement("span");
  summary.textContent = order.items.map(item => `${item.quantity} x ${item.name}`).join(", ");
  const bottom = document.createElement("span");
  bottom.className = "customer-order-bottom";
  const date = document.createElement("span");
  date.textContent = new Date(order.createdAt).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" });
  const total = document.createElement("strong");
  total.textContent = formatPrice(order.total);
  bottom.append(date, total);
  button.append(top, summary, bottom);
  button.addEventListener("click", () => selectOrder(order.id));
  return button;
}

function renderTimeline(order, container) {
  if (isPast(order)) return;
  const heading = document.createElement("h3");
  heading.textContent = "Live order tracking";
  const timeline = document.createElement("div");
  timeline.className = "tracking-steps compact-tracking";
  const currentIndex = progressStatuses.indexOf(order.status);
  progressStatuses.forEach((status, index) => {
    const step = document.createElement("div");
    step.className = `tracking-step ${index <= currentIndex ? "complete" : ""}`;
    const dot = document.createElement("span");
    dot.textContent = index < currentIndex ? "OK" : index + 1;
    const label = document.createElement("strong");
    label.textContent = status;
    step.append(dot, label);
    timeline.appendChild(step);
  });
  container.append(heading, timeline);
}

function renderDetail(order) {
  orderDetail.innerHTML = "";
  const header = document.createElement("div");
  header.className = "detail-header";
  const copy = document.createElement("div");
  const eyebrow = document.createElement("p");
  eyebrow.className = "eyebrow";
  eyebrow.textContent = "Order details";
  const title = document.createElement("h2");
  title.textContent = `#${order.id}`;
  copy.append(eyebrow, title);
  const status = document.createElement("strong");
  status.className = `customer-status ${order.status === "Cancelled" ? "cancelled" : ""}`;
  status.textContent = order.status;
  header.append(copy, status);

  const meta = document.createElement("div");
  meta.className = "detail-meta";
  const paymentText = order.paymentType === "Online payment" && order.onlinePaymentMethod
    ? `${order.paymentType} - ${order.onlinePaymentMethod}`
    : order.paymentType || "Cash on delivery";
  meta.innerHTML = `<span>Ordered for <strong>${new Date(order.createdAt).toLocaleString("en-IN")}</strong></span><span>Deliver to <strong></strong></span><span>Payment <strong></strong></span>`;
  meta.querySelector("span:nth-child(2) strong").textContent = order.address;
  meta.querySelector("span:nth-child(3) strong").textContent = paymentText;

  const items = document.createElement("div");
  items.className = "detail-items";
  order.items.forEach(item => {
    const row = document.createElement("div");
    const name = document.createElement("span");
    name.textContent = item.name;
    const quantity = document.createElement("strong");
    quantity.textContent = `x ${item.quantity}`;
    const price = document.createElement("span");
    price.textContent = formatPrice(item.price * item.quantity);
    row.append(name, quantity, price);
    items.appendChild(row);
  });

  const totals = document.createElement("div");
  totals.className = "detail-totals";
  totals.innerHTML = `<div><span>Subtotal</span><strong>${formatPrice(order.subtotal)}</strong></div><div><span>Delivery</span><strong>${order.deliveryFee ? formatPrice(order.deliveryFee) : "Free"}</strong></div>${order.discount ? `<div><span>Promo ${order.coupon?.code || ""}</span><strong>-${formatPrice(order.discount)}</strong></div>` : ""}<div><span>Total</span><strong>${formatPrice(order.total)}</strong></div>`;
  orderDetail.append(header, meta);
  renderTimeline(order, orderDetail);
  orderDetail.append(items, totals);
}

function selectOrder(id) {
  selectedOrderId = id;
  const order = allOrders.find(item => item.id === id);
  renderOrderLists();
  if (order) renderDetail(order);
  history.replaceState(null, "", `/orders.html?id=${encodeURIComponent(id)}`);
}

function renderOrderLists() {
  const current = allOrders.filter(order => !isPast(order));
  const past = allOrders.filter(isPast);
  currentCount.textContent = current.length;
  pastCount.textContent = past.length;
  currentOrders.innerHTML = current.length ? "" : '<div class="empty-cart">No current orders.</div>';
  pastOrders.innerHTML = past.length ? "" : '<div class="empty-cart">No past orders yet.</div>';
  current.forEach(order => currentOrders.appendChild(createOrderButton(order)));
  past.forEach(order => pastOrders.appendChild(createOrderButton(order)));
}

async function loadMyOrders(event) {
  if (event) event.preventDefault();
  ordersMessage.textContent = "";
  ordersMessage.classList.remove("error");
  const button = phoneForm.querySelector("a");
  if (button) button.setAttribute("aria-disabled", "true");
  try {
    const response = await fetch("/api/my-orders", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({})
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.errors?.[0] || "Could not load orders.");
    allOrders = result;
    accessPanel.hidden = true;
    workspace.hidden = false;
    if (!selectedOrderId || !allOrders.some(order => order.id === selectedOrderId)) selectedOrderId = allOrders[0]?.id;
    renderOrderLists();
    const selectedOrder = allOrders.find(order => order.id === selectedOrderId);
    if (selectedOrder) {
      renderDetail(selectedOrder);
    } else {
      orderDetail.innerHTML = '<div class="empty-cart">No orders found for your account yet.</div>';
    }
  } catch (error) {
    ordersMessage.textContent = error.message;
    ordersMessage.classList.add("error");
    accessPanel.hidden = false;
    workspace.hidden = true;
  } finally {
    if (button) button.removeAttribute("aria-disabled");
  }
}

phoneForm.addEventListener("submit", event => event.preventDefault());
changePhone.addEventListener("click", async () => {
  await fetch("/api/user/logout", { method: "POST" });
  currentUser = null;
  allOrders = [];
  workspace.hidden = true;
  accessPanel.hidden = false;
});

fetch("/api/user/me")
  .then(response => {
    if (!response.ok) throw new Error();
    return response.json();
  })
  .then(user => {
    currentUser = user;
    loadMyOrders();
  })
  .catch(() => {
    accessPanel.hidden = false;
    workspace.hidden = true;
  });
