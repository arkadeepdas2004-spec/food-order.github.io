const productGrid = document.querySelector("#productGrid");
const productTemplate = document.querySelector("#productTemplate");
const categoryTabs = document.querySelector("#categoryTabs");
const searchInput = document.querySelector("#searchInput");
const cartCount = document.querySelector("#cartCount");
const toast = document.querySelector("#toast");

let products = [];
let activeCategory = "All";
let cart = readStoredJson("freshbite-cart", []);
let wishlistIds = [];

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

function getCartProduct(item) {
  return products.find(product => product.id === item.id);
}

function renderCategories() {
  const categories = ["All", ...new Set(products.map(product => product.category))];
  categoryTabs.innerHTML = "";

  categories.forEach(category => {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = category;
    button.className = category === activeCategory ? "active" : "";
    button.addEventListener("click", () => {
      activeCategory = category;
      renderCategories();
      renderProducts();
    });
    categoryTabs.appendChild(button);
  });
}

function renderProducts() {
  const query = searchInput.value.trim().toLowerCase();
  const filteredProducts = products.filter(product => {
    const matchesCategory = activeCategory === "All" || product.category === activeCategory;
    const matchesQuery = [product.name, product.category, product.description]
      .join(" ")
      .toLowerCase()
      .includes(query);
    return matchesCategory && matchesQuery;
  });

  productGrid.innerHTML = "";

  filteredProducts.forEach(product => {
    const card = productTemplate.content.cloneNode(true);
    const image = card.querySelector("img");
    image.src = product.image;
    image.alt = product.name;
    card.querySelector(".category").textContent = product.category;
    card.querySelector(".rating").textContent = `${product.rating} rated`;
    card.querySelector("h3").textContent = product.name;
    card.querySelector("p").textContent = product.description;
    card.querySelector("strong").textContent = formatPrice(product.price);
    card.querySelector(".add-cart-button").addEventListener("click", () => addToCart(product.id));

    const wishlistButton = card.querySelector(".wishlist-toggle");
    const isFavorite = wishlistIds.includes(product.id);
    wishlistButton.classList.toggle("active", isFavorite);
    wishlistButton.textContent = isFavorite ? "Saved" : "Save";
    wishlistButton.setAttribute(
      "aria-label",
      isFavorite ? `Remove ${product.name} from wishlist` : `Save ${product.name} to wishlist`
    );
    wishlistButton.addEventListener("click", () => toggleWishlist(product.id));
    productGrid.appendChild(card);
  });

  if (filteredProducts.length === 0) {
    productGrid.innerHTML = '<div class="empty-cart">No dishes match your search.</div>';
  }
}

function renderCart() {
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
  renderCart();
  const product = getCartProduct({ id: productId });
  showToast(`${product.name} added to cart`);
}

async function toggleWishlist(productId) {
  const isFavorite = wishlistIds.includes(productId);
  try {
    const response = await fetch(isFavorite ? `/api/wishlist/${productId}` : "/api/wishlist", {
      method: isFavorite ? "DELETE" : "POST",
      headers: { "Content-Type": "application/json" },
      body: isFavorite ? undefined : JSON.stringify({ productId })
    });
    const result = await response.json();
    if (response.status === 401) {
      window.location.href = `/login.html?next=${encodeURIComponent("/")}`;
      return;
    }
    if (!response.ok) throw new Error(result.errors?.[0] || "Could not update wishlist.");
    wishlistIds = result.map(product => product.id);
    renderProducts();
    const product = getCartProduct({ id: productId });
    showToast(isFavorite ? `${product.name} removed from wishlist` : `${product.name} saved to wishlist`);
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

async function loadProducts() {
  try {
    const response = await fetch("/api/products");
    if (!response.ok) throw new Error("Menu request failed");
    products = await response.json();
    await loadWishlist();
    renderCategories();
    renderProducts();
    renderCart();
  } catch (error) {
    productGrid.innerHTML = '<div class="empty-cart">Could not load the menu. Refresh to try again.</div>';
  }
}

async function loadWishlist() {
  try {
    const response = await fetch("/api/wishlist");
    if (!response.ok) return;
    const items = await response.json();
    wishlistIds = items.map(product => product.id);
  } catch (error) {
    wishlistIds = [];
  }
}

searchInput.addEventListener("input", renderProducts);
loadProducts();
