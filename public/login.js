const loginForm = document.querySelector("#loginForm");
const registerForm = document.querySelector("#registerForm");
const twoFactorForm = document.querySelector("#twoFactorForm");
const authMessage = document.querySelector("#authMessage");
const showLogin = document.querySelector("#showLogin");
const showRegister = document.querySelector("#showRegister");
const restartAuth = document.querySelector("#restartAuth");
let currentChallengeToken = "";

const requestedRedirect = new URLSearchParams(window.location.search).get("next") || "/";
const redirectTo = requestedRedirect.startsWith("/") && !requestedRedirect.startsWith("//")
  ? requestedRedirect
  : "/";

function setMode(mode) {
  const isLogin = mode === "login";
  loginForm.hidden = !isLogin;
  registerForm.hidden = isLogin;
  twoFactorForm.hidden = true;
  showLogin.classList.toggle("active", isLogin);
  showRegister.classList.toggle("active", !isLogin);
  showLogin.disabled = false;
  showRegister.disabled = false;
  currentChallengeToken = "";
  authMessage.textContent = "";
  authMessage.classList.remove("error");
}

function showTwoFactorChallenge(result) {
  currentChallengeToken = result.challengeToken;
  loginForm.hidden = true;
  registerForm.hidden = true;
  twoFactorForm.hidden = false;
  showLogin.disabled = true;
  showRegister.disabled = true;
  twoFactorForm.reset();
  twoFactorForm.elements.code.focus();
  const codeHint = result.developmentCode ? ` Code: ${result.developmentCode}` : "";
  authMessage.textContent = `Enter the 6-digit code sent to ${result.destination}.${codeHint}`;
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
    if (result.requiresTwoFactor) {
      showTwoFactorChallenge(result);
      return;
    }
    window.location.href = redirectTo;
  } catch (error) {
    authMessage.textContent = error.message;
    authMessage.classList.add("error");
  } finally {
    button.disabled = false;
  }
}

async function submitTwoFactor(event) {
  event.preventDefault();
  authMessage.textContent = "";
  authMessage.classList.remove("error");
  const button = twoFactorForm.querySelector(".submit-button");
  button.disabled = true;
  try {
    const response = await fetch("/api/user/2fa/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        challengeToken: currentChallengeToken,
        code: twoFactorForm.elements.code.value
      })
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.errors?.join(" ") || "Could not verify this code.");
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
restartAuth.addEventListener("click", () => setMode("login"));
loginForm.addEventListener("submit", event => submitAuth(event, "/api/user/login"));
registerForm.addEventListener("submit", event => submitAuth(event, "/api/user/register"));
twoFactorForm.addEventListener("submit", submitTwoFactor);
