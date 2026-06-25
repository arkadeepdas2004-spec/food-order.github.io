const trackingForm = document.querySelector("#trackingForm");
const trackingMessage = document.querySelector("#trackingMessage");
const trackingResult = document.querySelector("#trackingResult");
const trackingTitle = document.querySelector("#trackingTitle");
const trackingStatus = document.querySelector("#trackingStatus");
const trackingSteps = document.querySelector("#trackingSteps");
const trackingItems = document.querySelector("#trackingItems");
const trackingTotal = document.querySelector("#trackingTotal");

const statuses = ["Confirmed", "Preparing", "Out for delivery", "Delivered"];
const currency = new Intl.NumberFormat("en-IN", {
  style: "currency", currency: "INR", maximumFractionDigits: 0
});

function formatPrice(value) {
  return currency.format(value).replace(/\u20b9/, "Rs ");
}

function renderOrder(order) {
  trackingResult.hidden = false;
  trackingTitle.textContent = `Order #${order.id}`;
  trackingStatus.textContent = order.status;
  trackingStatus.classList.toggle("cancelled", order.status === "Cancelled");

  const currentIndex = statuses.indexOf(order.status);
  trackingSteps.innerHTML = "";
  statuses.forEach((status, index) => {
    const step = document.createElement("div");
    step.className = `tracking-step ${order.status !== "Cancelled" && index <= currentIndex ? "complete" : ""}`;
    const dot = document.createElement("span");
    dot.textContent = index < currentIndex ? "OK" : index + 1;
    const label = document.createElement("strong");
    label.textContent = status;
    step.append(dot, label);
    trackingSteps.appendChild(step);
  });

  trackingItems.innerHTML = "";
  order.items.forEach(item => {
    const row = document.createElement("div");
    const name = document.createElement("span");
    name.textContent = item.name;
    const quantity = document.createElement("strong");
    quantity.textContent = `x ${item.quantity}`;
    row.append(name, quantity);
    trackingItems.appendChild(row);
  });
  trackingTotal.textContent = formatPrice(order.total);
}

async function trackOrder(event) {
  if (event) event.preventDefault();
  trackingMessage.textContent = "";
  trackingMessage.classList.remove("error");
  const data = new FormData(trackingForm);
  const button = trackingForm.querySelector("button");
  button.disabled = true;
  try {
    const response = await fetch("/api/track-order", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ orderId: data.get("orderId"), phone: data.get("phone") })
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.errors?.[0] || "Could not track the order.");
    renderOrder(result);
  } catch (error) {
    trackingResult.hidden = true;
    trackingMessage.textContent = error.message;
    trackingMessage.classList.add("error");
  } finally {
    button.disabled = false;
  }
}

trackingForm.addEventListener("submit", trackOrder);

const lastOrder = readStoredJson("freshbite-last-order", null);
const orderIdFromUrl = new URLSearchParams(window.location.search).get("id");
if (lastOrder && (!orderIdFromUrl || lastOrder.id === orderIdFromUrl)) {
  trackingForm.elements.orderId.value = orderIdFromUrl || lastOrder.id;
  trackingForm.elements.phone.value = lastOrder.phone;
  trackOrder();
} else if (orderIdFromUrl) {
  trackingForm.elements.orderId.value = orderIdFromUrl;
}

function readStoredJson(key, fallback) {
  try {
    return JSON.parse(localStorage.getItem(key) || JSON.stringify(fallback));
  } catch (error) {
    localStorage.removeItem(key);
    return fallback;
  }
}
