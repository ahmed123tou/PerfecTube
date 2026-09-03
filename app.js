const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];

const EMOJIS = [
  "😎","😂","😭","🔥","💀","❤️","🤣","🗿","👀","🤨","😈","✨",
  "🐶","🐱","🐸","🦆","🍕","🍿","🎮","🏆","🚀","💯","⭐","🎉",
  "👍","👎","🙏","🤯","😳","🤔","😴","🥶","🥳","🤡","👑","💥"
];

let videos = [];
let currentVideo = null;
let currentType = "All";
let currentPage = "home";
let token = localStorage.getItem("perfectube_token") || "";
let user = null;
let authMode = "signup";

function toast(message) {
  const el = $("#toast");
  el.textContent = message;
  el.classList.add("show");
  clearTimeout(window.toastTimer);
  window.toastTimer = setTimeout(() => el.classList.remove("show"), 2600);
}

function esc(value="") {
  return value.replace(/[&<>"']/g, c => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;" }[c]));
}

function timeAgo(date) {
  const sec = Math.floor((Date.now() - new Date(date)) / 1000);
  if (sec < 60) return "just now";
  if (sec < 3600) return `${Math.floor(sec/60)}m ago`;
  if (sec < 86400) return `${Math.floor(sec/3600)}h ago`;
  if (sec < 2592000) return `${Math.floor(sec/86400)}d ago`;
  return new Date(date).toLocaleDateString();
}

function setAccount() {
  if (user) {
    $("#loginOpen").classList.add("hidden");
    $("#signupOpen").classList.add("hidden");
    $("#account").classList.remove("hidden");
    $("#accountName").textContent = user.username;
    $("#accountAvatar").src = user.avatar || defaultAvatar(user.username);
  } else {
    $("#loginOpen").classList.remove("hidden");
    $("#signupOpen").classList.remove("hidden");
    $("#account").classList.add("hidden");
  }
}

function defaultAvatar(name) {
  const letter = encodeURIComponent((name || "?")[0].toUpperCase());
  return `data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="80" height="80"><rect width="100%" height="100%" fill="%23262d39"/><text x="50%" y="58%" text-anchor="middle" font-size="38" fill="white">${letter}</text></svg>`;
}

async function api(url, options={}) {
  const headers = options.headers ? {...options.headers} : {};
  if (token) headers.Authorization = `Bearer ${token}`;
  const response = await fetch(url, {...options, headers});
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "Something went wrong.");
  return data;
}

async function loadMe() {
  if (!token) return;
  try {
    const data = await api("/api/me");
    user = data.user;
    setAccount();
  } catch {
    token = "";
    localStorage.removeItem("perfectube_token");
  }
}

async function loadVideos() {
  $("#loading").classList.remove("hidden");
  $("#videoGrid").innerHTML = "";
  $("#empty").classList.add("hidden");

  try {
    const data = await api(`/api/videos?type=${encodeURIComponent(currentType)}`);
    videos = data.videos || [];
    renderVideos();
  } catch (e) {
    $("#videoGrid").innerHTML = `<div class="empty">Could not load videos.<br><small>${esc(e.message)}</small></div>`;
  } finally {
    $("#loading").classList.add("hidden");
  }
}

function renderVideos() {
  let list = videos;
  const search = $("#search").value.trim().toLowerCase();
  if (search) {
    list = list.filter(v =>
      v.title.toLowerCase().includes(search) ||
      v.channelName.toLowerCase().includes(search) ||
      v.sourceType.toLowerCase().includes(search)
    );
  }
  $("#empty").classList.toggle("hidden", list.length !== 0);
  $("#videoGrid").innerHTML = list.map(v => `
    <article class="video" data-video="${esc(v.id)}">
      <div class="thumb">
        <img src="${esc(v.thumbnail)}" loading="lazy" alt="">
        <span class="badge">${esc(v.sourceType)}</span>
      </div>
      <div class="videoBody">
        <div class="videoTitle">${esc(v.title)}</div>
        <div class="channel">${esc(v.channelName)}</div>
        <div class="date">${timeAgo(v.publishedAt)}</div>
      </div>
    </article>
  `).join("");
  $$(".video").forEach(card => card.addEventListener("click", () => openVideo(card.dataset.video)));
}

async function openVideo(id) {
  currentVideo = videos.find(v => v.id === id);
  if (!currentVideo) return;
  $("#player").src = `https://www.youtube.com/embed/${encodeURIComponent(id)}?autoplay=1&rel=0`;
  $("#videoTitle").textContent = currentVideo.title;
  $("#videoChannel").textContent = currentVideo.channelName;
  $("#youtubeBtn").href = currentVideo.url;
  $("#videoModal").classList.remove("hidden");
  await Promise.all([loadReaction(), loadComments()]);
}

async function loadReaction() {
  try {
    const data = await api(`/api/reactions/${encodeURIComponent(currentVideo.id)}`);
    $("#likeCount").textContent = data.like || 0;
    $("#dislikeCount").textContent = data.dislike || 0;
    $("#likeBtn").classList.toggle("selected", data.mine === "like");
    $("#dislikeBtn").classList.toggle("selected", data.mine === "dislike");
  } catch {
    $("#likeCount").textContent = 0;
    $("#dislikeCount").textContent = 0;
  }
}

async function react(type) {
  if (!token) return openAuth("login");
  try {
    await api("/api/reaction", {
      method:"POST",
      headers:{"Content-Type":"application/json"},
      body:JSON.stringify({videoId:currentVideo.id,reaction:type})
    });
    await loadReaction();
  } catch(e) { toast(e.message); }
}

async function loadComments() {
  try {
    const data = await api(`/api/comments/${encodeURIComponent(currentVideo.id)}`);
    const list = data.comments || [];
    $("#commentCount").textContent = list.length;
    $("#commentList").innerHTML = list.length ? list.map(c => `
      <div class="comment">
        <img class="avatar" src="${esc(c.avatar || defaultAvatar(c.username))}" alt="">
        <div><strong>${esc(c.username)}</strong><p>${esc(c.text)}</p></div>
      </div>
    `).join("") : `<p class="channel">No comments yet. Be the first.</p>`;
  } catch(e) {
    $("#commentList").innerHTML = `<p class="channel">${esc(e.message)}</p>`;
  }
}

async function postComment(event) {
  event.preventDefault();
  if (!token) return openAuth("login");
  const input = $("#commentText");
  const text = input.value.trim();
  if (!text) return;
  try {
    await api("/api/comments", {
      method:"POST",
      headers:{"Content-Type":"application/json"},
      body:JSON.stringify({videoId:currentVideo.id,text})
    });
    input.value = "";
    await loadComments();
  } catch(e) { toast(e.message); }
}

function openAuth(mode="signup") {
  authMode = mode;
  $("#authModal").classList.remove("hidden");
  $("#tabSignup").classList.toggle("selected", mode === "signup");
  $("#tabLogin").classList.toggle("selected", mode === "login");
  $("#authTitle").textContent = mode === "signup" ? "Create your Perfectube account" : "Log in to Perfectube";
  $("#authSubtitle").textContent = mode === "signup" ? "Pick a name, password and profile picture." : "Use your Perfectube name and password.";
  $("#authSubmit").textContent = mode === "signup" ? "Sign up" : "Log in";
  $("#avatarLabel").classList.toggle("hidden", mode !== "signup");
  $("#password").autocomplete = mode === "signup" ? "new-password" : "current-password";
}

async function submitAuth(event) {
  event.preventDefault();
  const username = $("#username").value.trim();
  const password = $("#password").value;
  try {
    let data;
    if (authMode === "signup") {
      const form = new FormData();
      form.append("username", username);
      form.append("password", password);
      if ($("#avatar").files[0]) form.append("avatar", $("#avatar").files[0]);
      data = await api("/api/signup", {method:"POST", body:form});
    } else {
      data = await api("/api/login", {
        method:"POST",
        headers:{"Content-Type":"application/json"},
        body:JSON.stringify({username,password})
      });
    }
    token = data.token;
    localStorage.setItem("perfectube_token", token);
    user = data.user;
    setAccount();
    $("#authModal").classList.add("hidden");
    $("#authForm").reset();
    toast(authMode === "signup" ? "Welcome to Perfectube!" : "Welcome back!");
  } catch(e) { toast(e.message); }
}

function renderChannels() {
  const channels = [...new Map(videos.map(v => [v.channelHandle, v])).values()];
  $("#channelGrid").innerHTML = channels.map(v => `
    <div class="channelItem">
      <strong>${esc(v.channelName)}</strong>
      <span>${esc(v.channelHandle)} · ${esc(v.sourceType)}</span>
    </div>
  `).join("");
}

function showPage(page) {
  currentPage = page;
  $$(".side[data-page]").forEach(b => b.classList.toggle("active", b.dataset.page === page));
  if (page === "channels") {
    $("#videoGrid").classList.add("hidden");
    $("#hero").classList.add("hidden");
    $("#channelsPanel").classList.remove("hidden");
    renderChannels();
  } else {
    $("#videoGrid").classList.remove("hidden");
    $("#hero").classList.remove("hidden");
    $("#channelsPanel").classList.add("hidden");
    $("#feedTitle").textContent = page === "shorts" ? "Shorts feed" : "Latest videos";
  }
}

function setupEmojis() {
  $("#emojiGrid").innerHTML = EMOJIS.map(e => `<button class="emoji" data-emoji="${e}">${e}</button>`).join("");
  $$(".emoji").forEach(b => b.addEventListener("click", async () => {
    try { await navigator.clipboard.writeText(b.dataset.emoji); toast(`${b.dataset.emoji} copied!`); }
    catch { toast(b.dataset.emoji); }
  }));
}

$$(".filter").forEach(btn => btn.addEventListener("click", async () => {
  $$(".filter").forEach(b => b.classList.remove("active"));
  btn.classList.add("active");
  currentType = btn.dataset.type;
  showPage("home");
  await loadVideos();
}));

$$(".side[data-page]").forEach(btn => btn.addEventListener("click", () => showPage(btn.dataset.page)));
$("#search").addEventListener("input", renderVideos);
$("#searchBtn").addEventListener("click", renderVideos);
$("#refreshBtn").addEventListener("click", loadVideos);
$("#homeBtn").addEventListener("click", () => showPage("home"));
$("#loginOpen").addEventListener("click", () => openAuth("login"));
$("#signupOpen").addEventListener("click", () => openAuth("signup"));
$("#heroSignup").addEventListener("click", () => openAuth("signup"));
$("#tabLogin").addEventListener("click", () => openAuth("login"));
$("#tabSignup").addEventListener("click", () => openAuth("signup"));
$("#authForm").addEventListener("submit", submitAuth);
$("#logoutBtn").addEventListener("click", () => {
  token = ""; user = null;
  localStorage.removeItem("perfectube_token");
  setAccount();
  toast("Logged out.");
});
$("#likeBtn").addEventListener("click", () => react("like"));
$("#dislikeBtn").addEventListener("click", () => react("dislike"));
$("#commentForm").addEventListener("submit", postComment);
$("#emojiOpen").addEventListener("click", () => $("#emojiModal").classList.remove("hidden"));

$$("[data-close]").forEach(btn => btn.addEventListener("click", () => {
  const modal = $("#" + btn.dataset.close);
  modal.classList.add("hidden");
  if (modal.id === "videoModal") $("#player").src = "";
}));

["authModal","videoModal","emojiModal"].forEach(id => {
  $("#" + id).addEventListener("click", e => {
    if (e.target.id === id) {
      $("#" + id).classList.add("hidden");
      if (id === "videoModal") $("#player").src = "";
    }
  });
});

(async function init() {
  setupEmojis();
  await loadMe();
  await loadVideos();
})();
