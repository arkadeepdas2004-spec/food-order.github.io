const accessPanel = document.querySelector("#wishlistAccess");
const workspace = document.querySelector("#wishlistWorkspace");
const wishlistGrid = document.querySelector("#wishlistGrid");
const wishlistTemplate = document.querySelector("#wishlistTemplate");
const cartCount = document.querySelector("#cartCount");
const toast = document.querySelector("#toast");

let wishlistItems = [];
let cart = readStoredJson("freshbite-cart", []);

const currency = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 0
});

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

function formatPrice(value) {
  return currency.format(value).replace(/\u20b9/, "Rs ");
}

function renderCartCount() {
  const itemCount = cart.reduce((sum, item) => sum + item.quantity, 0);
  cartCount.textContent = itemCount;
  saveCart();
}

function addToCart(productId) {
  const item = cart.find(entry => entry.id === productId);
  if (item) {
    item.quantity += 1;
  } else {
    cart.push({ id: productId, quantity: 1 });
  }
  renderCartCount();
  const product = wishlistItems.find(entry => entry.id === productId);
  showToast(`${product.name} added to cart`);
}

function renderWishlist() {
  wishlistGrid.innerHTML = "";

  if (wishlistItems.length === 0) {
    wishlistGrid.innerHTML = '<div class="empty-cart">Your wishlist is empty. Browse the menu and tap the heart on dishes you love.</div>';
    return;
  }

  wishlistItems.forEach(product => {
    const card = wishlistTemplate.content.cloneNode(true);
    const image = card.querySelector("img");
    image.src = product.image;
    image.alt = product.name;
    card.querySelector(".category").textContent = product.category;
    card.querySelector(".rating").textContent = `${product.rating} rated`;
    card.querySelector("h3").textContent = product.name;
    card.querySelector("p").textContent = product.description;
    card.querySelector("strong").textContent = formatPrice(product.price);
    card.querySelector(".add-cart-button").addEventListener("click", () => addToCart(product.id));
    card.querySelector(".remove-wishlist-button").addEventListener("click", () => removeFromWishlist(product.id));
    wishlistGrid.appendChild(card);
  });
}

async function removeFromWishlist(productId) {
  const product = wishlistItems.find(entry => entry.id === productId);
  try {
    const response = await fetch(`/api/wishlist/${productId}`, { method: "DELETE" });
    const result = await response.json();
    if (!response.ok) throw new Error(result.errors?.[0] || "Could not remove this favorite.");
    wishlistItems = result;
    renderWishlist();
    showToast(`${product.name} removed from wishlist`);
  } catch (error) {
    showToast(error.message);
  }
}

let toastTimer;
function showToast(message) {
  toast.textContent = message;
  toast.classList.add("visible");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("visible"), 1800);
}

async function loadWishlist() {
  renderCartCount();
  try {
    const response = await fetch("/api/wishlist");
    const result = await response.json();
    if (!response.ok) throw new Error(result.errors?.[0] || "Could not load wishlist.");
    wishlistItems = result;
    accessPanel.hidden = true;
    workspace.hidden = false;
    renderWishlist();
  } catch (error) {
    accessPanel.hidden = false;
    workspace.hidden = true;
  }
}

loadWishlist();
