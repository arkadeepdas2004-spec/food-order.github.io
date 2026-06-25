const cartItems = document.querySelector("#cartItems");
const cartCount = document.querySelector("#cartCount");
const subtotalEl = document.querySelector("#subtotal");
const deliveryFeeEl = document.querySelector("#deliveryFee");
const totalEl = document.querySelector("#total");
const discountRow = document.querySelector("#discountRow");
const discountLabel = document.querySelector("#discountLabel");
const discountAmount = document.querySelector("#discountAmount");
const clearCartButton = document.querySelector("#clearCart");
const couponCodeInput = document.querySelector("#couponCode");
const applyCouponButton = document.querySelector("#applyCoupon");
const removeCouponButton = document.querySelector("#removeCoupon");
const couponMessage = document.querySelector("#couponMessage");
const checkoutForm = document.querySelector("#checkoutForm");
const formMessage = document.querySelector("#formMessage");
const checkoutAuthNotice = document.querySelector("#checkoutAuthNotice");
const savedAddressLabel = document.querySelector("#savedAddressLabel");
const savedAddressSelect = document.querySelector("#savedAddressSelect");
const onlinePaymentLabel = document.querySelector("#onlinePaymentLabel");
const onlinePaymentMethod = document.querySelector("#onlinePaymentMethod");
const submitButton = checkoutForm.querySelector('button[type="submit"]');

let products = [];
let cart = readStoredJson("freshbite-cart", []);
let currentUser = null;
let appliedCoupon = null;

const currency = new Intl.NumberFormat("en-IN", {
  style: "currency", currency: "INR", maximumFractionDigits: 0
});

function formatPrice(value) {
  return currency.format(value).replace(/\u20b9/, "Rs ");
}

function saveCart() {
  localStorage.setItem("freshbite-cart", JSON.stringify(cart));
}

function readStoredJson(key, fallback) {
  try {
    const value = JSON.parse(localStorage.getItem(key) || JSON.stringify(fallback));
    return Array.isArray(fallback) && !Array.isArray(value) ? fallback : value;
  } catch (error) {
    localStorage.removeItem(key);
    return fallback;
  }
}

function getProduct(id) {
  return products.find(product => product.id === id);
}

function getTotals() {
  const subtotal = cart.reduce((sum, item) => {
    const product = getProduct(item.id);
    return product ? sum + product.price * item.quantity : sum;
  }, 0);
  const deliveryFee = subtotal === 0 || subtotal >= 499 ? 0 : 39;
  const discount = appliedCoupon ? appliedCoupon.discount : 0;
  return { subtotal, deliveryFee, discount, total: Math.max(0, subtotal + deliveryFee - discount) };
}

function clearAppliedCoupon(message = "") {
  appliedCoupon = null;
  couponCodeInput.value = "";
  couponMessage.textContent = message;
  couponMessage.classList.toggle("error", false);
  removeCouponButton.hidden = true;
}

function updateQuantity(productId, delta) {
  if (appliedCoupon) clearAppliedCoupon("Promo removed because the cart changed.");
  cart = cart
    .map(item => item.id === productId ? { ...item, quantity: item.quantity + delta } : item)
    .filter(item => item.quantity > 0);
  renderCart();
}

function renderCart() {
  cartItems.innerHTML = "";
  if (cart.length === 0) {
    cartItems.innerHTML = '<div class="empty-cart">Your cart is empty. <a href="/">Choose something delicious.</a></div>';
  }

  cart.forEach(item => {
    const product = getProduct(item.id);
    if (!product) return;
    const row = document.createElement("article");
    row.className = "cart-row";

    const image = document.createElement("img");
    image.src = product.image;
    image.alt = "";

    const copy = document.createElement("div");
    copy.className = "cart-item-copy";
    const name = document.createElement("h3");
    name.textContent = product.name;
    const price = document.createElement("p");
    price.textContent = `${formatPrice(product.price)} each`;
    copy.append(name, price);

    const quantityControl = document.createElement("div");
    quantityControl.className = "quantity-control";
    quantityControl.setAttribute("aria-label", `${product.name} quantity`);
    const decrease = document.createElement("button");
    decrease.type = "button";
    decrease.dataset.action = "decrease";
    decrease.setAttribute("aria-label", "Remove one");
    decrease.textContent = "-";
    const quantity = document.createElement("strong");
    quantity.textContent = item.quantity;
    const increase = document.createElement("button");
    increase.type = "button";
    increase.dataset.action = "increase";
    increase.setAttribute("aria-label", "Add one");
    increase.textContent = "+";
    decrease.addEventListener("click", () => updateQuantity(product.id, -1));
    increase.addEventListener("click", () => updateQuantity(product.id, 1));
    quantityControl.append(decrease, quantity, increase);

    row.append(image, copy, quantityControl);
    cartItems.appendChild(row);
  });

  const totals = getTotals();
  cartCount.textContent = cart.reduce((sum, item) => sum + item.quantity, 0);
  subtotalEl.textContent = formatPrice(totals.subtotal);
  deliveryFeeEl.textContent = totals.deliveryFee === 0 ? "Free" : formatPrice(totals.deliveryFee);
  discountRow.hidden = totals.discount === 0;
  discountLabel.textContent = appliedCoupon?.coupon?.code ? `Promo ${appliedCoupon.coupon.code}` : "Promo discount";
  discountAmount.textContent = `-${formatPrice(totals.discount)}`;
  totalEl.textContent = formatPrice(totals.total);
  submitButton.disabled = cart.length === 0 || !currentUser;
  saveCart();
}

function renderSavedAddresses(addresses = []) {
  savedAddressSelect.innerHTML = "";
  savedAddressLabel.hidden = addresses.length === 0;
  if (addresses.length === 0) return;

  const placeholder = document.createElement("option");
  placeholder.value = "";
  placeholder.textContent = "Choose a saved address";
  savedAddressSelect.appendChild(placeholder);

  addresses.forEach((address, index) => {
    const option = document.createElement("option");
    option.value = address;
    option.textContent = index === 0 ? `Last used: ${address}` : address;
    savedAddressSelect.appendChild(option);
  });
}

function updatePaymentFields() {
  const paymentType = new FormData(checkoutForm).get("paymentType");
  const isOnline = paymentType === "Online payment";
  onlinePaymentLabel.hidden = !isOnline;
  onlinePaymentMethod.required = isOnline;
  if (!isOnline) onlinePaymentMethod.value = "";
}

async function loadCurrentUser() {
  try {
    const response = await fetch("/api/user/me");
    if (!response.ok) throw new Error();
    currentUser = await response.json();
    checkoutForm.elements.name.value = currentUser.name;
    checkoutForm.elements.phone.value = currentUser.phone;
    checkoutForm.elements.name.readOnly = true;
    checkoutForm.elements.phone.readOnly = true;
    renderSavedAddresses(currentUser.addresses || []);
    if (currentUser.addresses?.[0]) checkoutForm.elements.address.value = currentUser.addresses[0];
    checkoutAuthNotice.hidden = true;
  } catch (error) {
    currentUser = null;
    checkoutAuthNotice.hidden = false;
    renderSavedAddresses([]);
    formMessage.textContent = "Please sign in before placing an order.";
    formMessage.classList.add("error");
  }
}

async function placeOrder(event) {
  event.preventDefault();
  formMessage.textContent = "";
  formMessage.classList.remove("error");
  if (cart.length === 0) return;
  if (!currentUser) {
    window.location.href = "/login.html?next=/checkout.html";
    return;
  }

  const formData = new FormData(checkoutForm);
  const payload = {
    name: formData.get("name"), phone: formData.get("phone"),
    address: formData.get("address"),
    paymentType: formData.get("paymentType"),
    onlinePaymentMethod: formData.get("onlinePaymentMethod"),
    couponCode: appliedCoupon?.coupon?.code || "",
    items: cart
  };

  submitButton.disabled = true;
  submitButton.textContent = "Confirming order...";
  try {
    const response = await fetch("/api/orders", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload)
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.errors?.join(" ") || "Could not place the order.");
    cart = [];
    appliedCoupon = null;
    checkoutForm.reset();
    clearAppliedCoupon();
    renderCart();
    localStorage.setItem("freshbite-last-order", JSON.stringify({ id: result.id, phone: payload.phone }));
    window.location.href = `/orders.html?id=${encodeURIComponent(result.id)}`;
  } catch (error) {
    formMessage.textContent = error.message || "The kitchen is unreachable. Please try again.";
    formMessage.classList.add("error");
  } finally {
    submitButton.textContent = "Confirm order";
    submitButton.disabled = cart.length === 0 || !currentUser;
  }
}

async function applyCoupon() {
  couponMessage.textContent = "";
  couponMessage.classList.remove("error");
  const code = couponCodeInput.value.trim();
  if (!code) {
    couponMessage.textContent = "Enter a promo code.";
    couponMessage.classList.add("error");
    return;
  }
  if (cart.length === 0) return;

  applyCouponButton.disabled = true;
  try {
    const response = await fetch("/api/coupons/validate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code, items: cart })
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.errors?.join(" ") || "Could not apply promo code.");
    appliedCoupon = result;
    couponCodeInput.value = result.coupon.code;
    couponMessage.textContent = `${result.coupon.description || result.coupon.code} applied.`;
    removeCouponButton.hidden = false;
    renderCart();
  } catch (error) {
    appliedCoupon = null;
    couponMessage.textContent = error.message;
    couponMessage.classList.add("error");
    removeCouponButton.hidden = true;
    renderCart();
  } finally {
    applyCouponButton.disabled = false;
  }
}

clearCartButton.addEventListener("click", () => { cart = []; clearAppliedCoupon(); renderCart(); });
applyCouponButton.addEventListener("click", applyCoupon);
removeCouponButton.addEventListener("click", () => { clearAppliedCoupon("Promo removed."); renderCart(); });
couponCodeInput.addEventListener("keydown", event => {
  if (event.key === "Enter") {
    event.preventDefault();
    applyCoupon();
  }
});
checkoutForm.addEventListener("submit", placeOrder);
savedAddressSelect.addEventListener("change", () => {
  if (savedAddressSelect.value) checkoutForm.elements.address.value = savedAddressSelect.value;
});
checkoutForm.querySelectorAll('input[name="paymentType"]').forEach(input => {
  input.addEventListener("change", updatePaymentFields);
});
updatePaymentFields();

loadCurrentUser().finally(renderCart);

fetch("/api/products")
  .then(response => {
    if (!response.ok) throw new Error();
    return response.json();
  })
  .then(data => { products = data; renderCart(); })
  .catch(() => {
    cartItems.innerHTML = '<div class="empty-cart">Could not load your cart. Please refresh.</div>';
    submitButton.disabled = true;
  });
