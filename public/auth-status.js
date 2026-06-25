(async () => {
  const navs = document.querySelectorAll(".nav");
  if (!navs.length) return;

  function getInitials(name) {
    return String(name || "User")
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map(part => part[0]?.toUpperCase() || "")
      .join("") || "U";
  }

  function createAvatar(user, sizeClass = "") {
    const avatar = document.createElement("span");
    avatar.className = `user-avatar ${sizeClass}`.trim();

    if (user.photoUrl) {
      const image = document.createElement("img");
      image.src = user.photoUrl;
      image.alt = "";
      image.addEventListener("error", () => {
        image.remove();
        avatar.textContent = getInitials(user.name);
      });
      avatar.appendChild(image);
    } else {
      avatar.textContent = getInitials(user.name);
    }

    return avatar;
  }

  function createAccountMenu(user) {
    const wrapper = document.createElement("div");
    wrapper.className = "user-menu";

    const badge = document.createElement("button");
    badge.className = "user-badge";
    badge.type = "button";
    badge.setAttribute("aria-label", `Open account menu for ${user.name}`);
    badge.setAttribute("aria-expanded", "false");

    const avatar = createAvatar(user);
    const name = document.createElement("span");
    name.className = "user-name";
    name.textContent = user.name;
    badge.append(avatar, name);

    const panel = document.createElement("div");
    panel.className = "user-menu-panel";
    panel.hidden = true;

    const profile = document.createElement("div");
    profile.className = "user-menu-profile";
    const largeAvatar = createAvatar(user, "large");
    const details = document.createElement("div");
    const fullName = document.createElement("strong");
    fullName.textContent = user.name;
    const phone = document.createElement("span");
    phone.textContent = user.phone;
    details.append(fullName, phone);
    profile.append(largeAvatar, details);

    const ordersLink = document.createElement("a");
    ordersLink.href = "/orders.html";
    ordersLink.textContent = "My orders";

    const wishlistLink = document.createElement("a");
    wishlistLink.href = "/wishlist.html";
    wishlistLink.textContent = "Wishlist";

    const logoutButton = document.createElement("button");
    logoutButton.type = "button";
    logoutButton.textContent = "Logout";
    logoutButton.addEventListener("click", async () => {
      logoutButton.disabled = true;
      await fetch("/api/user/logout", { method: "POST" });
      window.location.href = "/login.html";
    });

    panel.append(profile, wishlistLink, ordersLink, logoutButton);
    wrapper.append(badge, panel);

    badge.addEventListener("click", event => {
      event.stopPropagation();
      panel.hidden = !panel.hidden;
      badge.setAttribute("aria-expanded", String(!panel.hidden));
    });

    document.addEventListener("click", event => {
      if (!wrapper.contains(event.target)) {
        panel.hidden = true;
        badge.setAttribute("aria-expanded", "false");
      }
    });

    document.addEventListener("keydown", event => {
      if (event.key === "Escape") {
        panel.hidden = true;
        badge.setAttribute("aria-expanded", "false");
      }
    });

    return wrapper;
  }

  try {
    const response = await fetch("/api/user/me");
    if (!response.ok) return;
    const user = await response.json();
    navs.forEach(nav => {
      nav.querySelectorAll('a[href^="/login.html"]').forEach(link => { link.hidden = true; });
      if (!nav.querySelector(".user-menu")) nav.appendChild(createAccountMenu(user));
    });
  } catch (error) {
    // Header account display is optional; pages still work if the session check fails.
  }
})();
