const loginForm = document.querySelector("#loginForm");
const registerForm = document.querySelector("#registerForm");
const authMessage = document.querySelector("#authMessage");
const showLogin = document.querySelector("#showLogin");
const showRegister = document.querySelector("#showRegister");

const requestedRedirect = new URLSearchParams(window.location.search).get("next") || "/";
const redirectTo = requestedRedirect.startsWith("/") && !requestedRedirect.startsWith("//")
  ? requestedRedirect
  : "/";

function setMode(mode) {
  const isLogin = mode === "login";
  loginForm.hidden = !isLogin;
  registerForm.hidden = isLogin;
  showLogin.classList.toggle("active", isLogin);
  showRegister.classList.toggle("active", !isLogin);
  authMessage.textContent = "";
  authMessage.classList.remove("error");
}

async function submitAuth(event, endpoint) {
  event.preventDefault();
  authMessage.textContent = "";
  authMessage.classList.remove("error");
  const form = event.currentTarget;
  const button = form.querySelector("button");
  button.disabled = true;
  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(Object.fromEntries(new FormData(form).entries()))
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.errors?.join(" ") || "Could not continue.");
    window.location.href = redirectTo;
  } catch (error) {
    authMessage.textContent = error.message;
    authMessage.classList.add("error");
  } finally {
    button.disabled = false;
  }
}

showLogin.addEventListener("click", () => setMode("login"));
showRegister.addEventListener("click", () => setMode("register"));
loginForm.addEventListener("submit", event => submitAuth(event, "/api/user/login"));
registerForm.addEventListener("submit", event => submitAuth(event, "/api/user/register"));
