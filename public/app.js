/* =========================================================
   PERFECTUBE — FULL APP.JS
   Shorts feed + infinite scroll + comments + replies +
   comment likes + emojis + video reactions + auth
========================================================= */

const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];

/* =========================================================
   EMOJIS
========================================================= */

const EMOJIS = [
  "😎","😂","😭","🔥","💀","❤️","🤣","🗿","👀","🤨","😈","✨",
  "🐶","🐱","🐸","🦆","🍕","🍿","🎮","🏆","🚀","💯","⭐","🎉",
  "👍","👎","🙏","🤯","😳","🤔","😴","🥶","🥳","🤡","👑","💥",
  "😀","😃","😄","😁","😆","😅","🤣","😊","🙂","🙃","😉","😌",
  "😍","🥰","😘","😗","😙","😚","😋","😛","😝","😜","🤪","🤩",
  "🥲","😏","😒","🙄","😬","🤐","🤔","😐","😑","😶","🙃","😮",
  "😲","😴","🤤","😪","😵","🤐","🥺","😤","😡","🤬","😱","😨",
  "👏","🙌","🫶","🤝","💪","✌️","🤞","🤟","👌","🫡","👋","🖐️",
  "🎯","🎬","📱","💻","🔥","⚡","🌟","🌈","☀️","🌙","☁️","❄️",
  "🍔","🍟","🌭","🍿","🍩","🍪","🍰","🎂","🍎","🍌","🍉","🍓",
  "⚽","🏀","🏈","⚾","🎾","🏆","🥇","🥈","🥉","🎮","🕹️","🎧"
];

/* =========================================================
   STATE
========================================================= */

let videos = [];
let shortsVideos = [];

let currentVideo = null;
let currentType = "All";
let currentPage = "home";

let token = localStorage.getItem("perfectube_token") || "";
let user = null;

let authMode = "signup";

let shortsIndex = 0;
let shortsLoading = false;
let shortsInitialized = false;

let commentReplyId = null;
let openCommentEmojiPicker = false;

let searchTimer = null;

/* =========================================================
   TOAST
========================================================= */

function toast(message) {
  const el = $("#toast");

  if (!el) return;

  el.textContent = message;
  el.classList.add("show");

  clearTimeout(window.toastTimer);

  window.toastTimer = setTimeout(() => {
    el.classList.remove("show");
  }, 2600);
}

/* =========================================================
   ESCAPE HTML
========================================================= */

function esc(value = "") {
  return String(value).replace(
    /[&<>"']/g,
    c => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;"
    }[c])
  );
}

/* =========================================================
   TIME AGO
========================================================= */

function timeAgo(date) {
  const sec = Math.floor(
    (Date.now() - new Date(date)) / 1000
  );

  if (sec < 60) return "just now";
  if (sec < 3600) return `${Math.floor(sec / 60)}m ago`;
  if (sec < 86400) return `${Math.floor(sec / 3600)}h ago`;
  if (sec < 2592000) return `${Math.floor(sec / 86400)}d ago`;

  return new Date(date).toLocaleDateString();
}

/* =========================================================
   DEFAULT AVATAR
========================================================= */

function defaultAvatar(name) {
  const letter = encodeURIComponent(
    (name || "?")[0].toUpperCase()
  );

  return `data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="80" height="80"><rect width="100%" height="100%" fill="%23262d39"/><text x="50%" y="58%" text-anchor="middle" font-size="38" fill="white">${letter}</text></svg>`;
}

/* =========================================================
   API
========================================================= */

async function api(url, options = {}) {
  const headers = options.headers
    ? { ...options.headers }
    : {};

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const response = await fetch(url, {
    ...options,
    headers
  });

  const data = await response
    .json()
    .catch(() => ({}));

  if (!response.ok) {
    throw new Error(
      data.error || "Something went wrong."
    );
  }

  return data;
}

/* =========================================================
   ACCOUNT
========================================================= */

function setAccount() {
  if (user) {
    $("#loginOpen")?.classList.add("hidden");
    $("#signupOpen")?.classList.add("hidden");

    $("#account")?.classList.remove("hidden");

    if ($("#accountName")) {
      $("#accountName").textContent = user.username;
    }

    if ($("#accountAvatar")) {
      $("#accountAvatar").src =
        user.avatar ||
        defaultAvatar(user.username);
    }
  } else {
    $("#loginOpen")?.classList.remove("hidden");
    $("#signupOpen")?.classList.remove("hidden");

    $("#account")?.classList.add("hidden");
  }
}

async function loadMe() {
  if (!token) {
    setAccount();
    return;
  }

  try {
    const data = await api("/api/me");

    user = data.user;

    setAccount();
  } catch {
    token = "";
    user = null;

    localStorage.removeItem(
      "perfectube_token"
    );

    setAccount();
  }
}

/* =========================================================
   VIDEOS
========================================================= */

async function loadVideos() {
  $("#loading")?.classList.remove("hidden");

  if ($("#videoGrid")) {
    $("#videoGrid").innerHTML = "";
  }

  $("#empty")?.classList.add("hidden");

  try {
    const data = await api(
      `/api/videos?type=${encodeURIComponent(currentType)}`
    );

    videos = data.videos || [];

    renderVideos();

    if (currentPage === "shorts") {
      prepareShorts();
    }
  } catch (e) {
    if ($("#videoGrid")) {
      $("#videoGrid").innerHTML = `
        <div class="empty">
          Could not load videos.
          <br>
          <small>${esc(e.message)}</small>
        </div>
      `;
    }
  } finally {
    $("#loading")?.classList.add("hidden");
  }
}

/* =========================================================
   NORMAL VIDEO GRID
========================================================= */

function renderVideos() {
  if (!$("#videoGrid")) return;

  let list = videos;

  const search =
    $("#search")?.value.trim().toLowerCase() || "";

  if (search) {
    list = list.filter(v =>
      String(v.title || "")
        .toLowerCase()
        .includes(search) ||
      String(v.channelName || "")
        .toLowerCase()
        .includes(search) ||
      String(v.sourceType || "")
        .toLowerCase()
        .includes(search)
    );
  }

  $("#empty")?.classList.toggle(
    "hidden",
    list.length !== 0
  );

  $("#videoGrid").innerHTML = list.map(v => `
    <article
      class="video"
      data-video="${esc(v.id)}"
    >
      <div class="thumb">
        <img
          src="${esc(v.thumbnail)}"
          loading="lazy"
          alt=""
        >

        <span class="badge">
          ${esc(v.sourceType)}
        </span>
      </div>

      <div class="videoBody">
        <div class="videoTitle">
          ${esc(v.title)}
        </div>

        <div class="channel">
          ${esc(v.channelName)}
        </div>

        <div class="date">
          ${timeAgo(v.publishedAt)}
        </div>
      </div>
    </article>
  `).join("");

  $$(".video").forEach(card => {
    card.addEventListener("click", () => {
      openVideo(card.dataset.video);
    });
  });
}

/* =========================================================
   OPEN NORMAL VIDEO
========================================================= */

async function openVideo(id) {
  currentVideo =
    videos.find(v => String(v.id) === String(id));

  if (!currentVideo) return;

  const player = $("#player");

  if (player) {
    player.src =
      `https://www.youtube.com/embed/${encodeURIComponent(
        currentVideo.id
      )}?autoplay=1&rel=0`;
  }

  if ($("#videoTitle")) {
    $("#videoTitle").textContent =
      currentVideo.title;
  }

  if ($("#videoChannel")) {
    $("#videoChannel").textContent =
      currentVideo.channelName;
  }

  if ($("#youtubeBtn")) {
    $("#youtubeBtn").href =
      currentVideo.url;
  }

  $("#videoModal")?.classList.remove(
    "hidden"
  );

  await Promise.all([
    loadReaction(),
    loadComments()
  ]);
}

/* =========================================================
   VIDEO REACTION
========================================================= */

async function loadReaction() {
  if (!currentVideo) return;

  try {
    const data = await api(
      `/api/reactions/${encodeURIComponent(
        currentVideo.id
      )}`
    );

    if ($("#likeCount")) {
      $("#likeCount").textContent =
        data.like || 0;
    }

    if ($("#dislikeCount")) {
      $("#dislikeCount").textContent =
        data.dislike || 0;
    }

    $("#likeBtn")?.classList.toggle(
      "selected",
      data.mine === "like"
    );

    $("#dislikeBtn")?.classList.toggle(
      "selected",
      data.mine === "dislike"
    );
  } catch {
    if ($("#likeCount")) {
      $("#likeCount").textContent = 0;
    }

    if ($("#dislikeCount")) {
      $("#dislikeCount").textContent = 0;
    }
  }
}

async function react(type) {
  if (!currentVideo) return;

  if (!token) {
    openAuth("login");
    return;
  }

  try {
    await api("/api/reaction", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        videoId: currentVideo.id,
        reaction: type
      })
    });

    await loadReaction();
  } catch (e) {
    toast(e.message);
  }
}

/* =========================================================
   COMMENTS
========================================================= */

async function loadComments() {
  if (!currentVideo) return;

  try {
    const data = await api(
      `/api/comments/${encodeURIComponent(
        currentVideo.id
      )}`
    );

    const list = data.comments || [];

    if ($("#commentCount")) {
      $("#commentCount").textContent =
        list.length;
    }

    renderComments(list);
  } catch (e) {
    if ($("#commentList")) {
      $("#commentList").innerHTML = `
        <p class="channel">
          ${esc(e.message)}
        </p>
      `;
    }
  }
}

/* =========================================================
   COMMENT TREE
========================================================= */

function buildCommentTree(comments) {
  const map = new Map();

  comments.forEach(comment => {
    map.set(String(comment.id), {
      ...comment,
      replies: []
    });
  });

  const roots = [];

  comments.forEach(comment => {
    const node =
      map.get(String(comment.id));

    if (
      comment.parentId &&
      map.has(String(comment.parentId))
    ) {
      map
        .get(String(comment.parentId))
        .replies
        .push(node);
    } else {
      roots.push(node);
    }
  });

  return roots;
}

/* =========================================================
   RENDER COMMENTS
========================================================= */

function renderComments(list) {
  if (!$("#commentList")) return;

  if (!list.length) {
    $("#commentList").innerHTML = `
      <p class="channel">
        No comments yet. Be the first.
      </p>
    `;

    return;
  }

  const tree = buildCommentTree(list);

  $("#commentList").innerHTML =
    tree.map(comment =>
      renderComment(comment, 0)
    ).join("");

  bindCommentButtons();
}

/* =========================================================
   SINGLE COMMENT
========================================================= */

function renderComment(comment, depth = 0) {
  const avatar =
    comment.avatar ||
    defaultAvatar(comment.username);

  const likeCount =
    Number(comment.likeCount || 0);

  const mine =
    Boolean(comment.mineLike);

  const replies =
    comment.replies || [];

  return `
    <div
      class="comment"
      data-comment-id="${esc(comment.id)}"
      style="--comment-depth:${Math.min(
        depth,
        5
      )}"
    >
      <img
        class="avatar"
        src="${esc(avatar)}"
        alt=""
      >

      <div class="commentContent">
        <div class="commentTop">
          <strong>
            ${esc(comment.username)}
          </strong>

          <span class="commentDate">
            ${comment.createdAt
              ? timeAgo(comment.createdAt)
              : ""}
          </span>
        </div>

        <p class="commentText">
          ${formatEmojiText(comment.text)}
        </p>

        <div class="commentActions">

          <button
            class="commentLikeBtn ${
              mine ? "selected" : ""
            }"
            data-comment-like="${esc(comment.id)}"
          >
            ❤️
            <span>
              ${likeCount}
            </span>
          </button>

          <button
            class="commentReplyBtn"
            data-comment-reply="${esc(comment.id)}"
          >
            ↩ Reply
          </button>

          <button
            class="commentEmojiBtn"
            data-comment-emoji="${esc(comment.id)}"
          >
            😀
          </button>

        </div>

        <div
          class="commentReplyBox hidden"
          id="replyBox-${esc(comment.id)}"
        >
          <form
            class="replyForm"
            data-parent="${esc(comment.id)}"
          >
            <input
              class="replyInput"
              maxlength="500"
              placeholder="Reply to ${esc(
                comment.username
              )}..."
            >

            <button
              class="primaryBtn"
              type="submit"
            >
              Reply
            </button>
          </form>
        </div>

        <div
          class="commentEmojiPicker hidden"
          id="commentEmoji-${esc(comment.id)}"
        >
          ${renderMiniEmojiPicker(comment.id)}
        </div>

        ${
          replies.length
            ? `
              <div class="commentReplies">
                ${replies.map(reply =>
                  renderComment(
                    reply,
                    depth + 1
                  )
                ).join("")}
              </div>
            `
            : ""
        }

      </div>
    </div>
  `;
}

/* =========================================================
   EMOJI TEXT
========================================================= */

function formatEmojiText(text = "") {
  return esc(text).replace(
    /\n/g,
    "<br>"
  );
}

/* =========================================================
   MINI EMOJI PICKER
========================================================= */

function renderMiniEmojiPicker(commentId) {
  return `
    <div class="miniEmojiGrid">
      ${EMOJIS.map(emoji => `
        <button
          type="button"
          class="miniEmoji"
          data-emoji-target="${esc(
            commentId
          )}"
          data-emoji="${emoji}"
        >
          ${emoji}
        </button>
      `).join("")}
    </div>
  `;
}

/* =========================================================
   BIND COMMENT BUTTONS
========================================================= */

function bindCommentButtons() {
  $$("[data-comment-like]").forEach(
    button => {
      button.addEventListener(
        "click",
        () => {
          likeComment(
            button.dataset.commentLike
          );
        }
      );
    }
  );

  $$("[data-comment-reply]").forEach(
    button => {
      button.addEventListener(
        "click",
        () => {
          toggleReplyBox(
            button.dataset.commentReply
          );
        }
      );
    }
  );

  $$("[data-comment-emoji]").forEach(
    button => {
      button.addEventListener(
        "click",
        () => {
          toggleCommentEmojiPicker(
            button.dataset.commentEmoji
          );
        }
      );
    }
  );

  $$(".replyForm").forEach(form => {
    form.addEventListener(
      "submit",
      postReply
    );
  });

  $$("[data-emoji-target]").forEach(
    button => {
      button.addEventListener(
        "click",
        () => {
          insertReplyEmoji(
            button.dataset.emojiTarget,
            button.dataset.emoji
          );
        }
      );
    }
  );
}

/* =========================================================
   LIKE COMMENT
========================================================= */

async function likeComment(commentId) {
  if (!token) {
    openAuth("login");
    return;
  }

  try {
    await api("/api/comment-reaction", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        commentId,
        reaction: "like"
      })
    });

    await loadComments();
  } catch (e) {
    toast(e.message);
  }
}

/* =========================================================
   REPLY BOX
========================================================= */

function toggleReplyBox(commentId) {
  const box =
    $(`#replyBox-${CSS.escape(commentId)}`);

  if (!box) return;

  $$(".commentReplyBox").forEach(
    other => {
      if (other !== box) {
        other.classList.add("hidden");
      }
    }
  );

  box.classList.toggle("hidden");

  if (!box.classList.contains("hidden")) {
    box
      .querySelector("input")
      ?.focus();
  }
}

/* =========================================================
   REPLY
========================================================= */

async function postReply(event) {
  event.preventDefault();

  if (!token) {
    openAuth("login");
    return;
  }

  const form = event.currentTarget;

  const parentId =
    form.dataset.parent;

  const input =
    form.querySelector(".replyInput");

  const text =
    input.value.trim();

  if (!text) return;

  if (!currentVideo) return;

  try {
    await api("/api/comments", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        videoId: currentVideo.id,
        text,
        parentId
      })
    });

    input.value = "";

    await loadComments();
  } catch (e) {
    toast(e.message);
  }
}

/* =========================================================
   COMMENT EMOJI PICKER
========================================================= */

function toggleCommentEmojiPicker(
  commentId
) {
  const picker =
    $(`#commentEmoji-${CSS.escape(commentId)}`);

  if (!picker) return;

  $$(".commentEmojiPicker").forEach(
    other => {
      if (other !== picker) {
        other.classList.add("hidden");
      }
    }
  );

  picker.classList.toggle("hidden");
}

function insertReplyEmoji(
  commentId,
  emoji
) {
  const box =
    $(`#replyBox-${CSS.escape(commentId)}`);

  if (!box) return;

  const input =
    box.querySelector(".replyInput");

  if (!input) return;

  input.value += emoji;

  input.focus();
}

/* =========================================================
   MAIN COMMENT EMOJI PICKER
========================================================= */

function setupCommentEmojiPicker() {
  const button = $("#commentEmojiOpen");
  const picker = $("#commentEmojiPicker");

  if (!button || !picker) return;

  picker.innerHTML =
    renderMainEmojiPicker();

  button.addEventListener(
    "click",
    event => {
      event.preventDefault();

      picker.classList.toggle(
        "hidden"
      );
    }
  );

  picker.addEventListener(
    "click",
    event => {
      const emojiButton =
        event.target.closest(
          "[data-main-emoji]"
        );

      if (!emojiButton) return;

      insertMainCommentEmoji(
        emojiButton.dataset.mainEmoji
      );
    }
  );
}

function renderMainEmojiPicker() {
  return `
    <div class="mainEmojiGrid">
      ${EMOJIS.map(emoji => `
        <button
          type="button"
          data-main-emoji="${emoji}"
        >
          ${emoji}
        </button>
      `).join("")}
    </div>
  `;
}

function insertMainCommentEmoji(
  emoji
) {
  const input = $("#commentText");

  if (!input) return;

  const start =
    input.selectionStart ??
    input.value.length;

  const end =
    input.selectionEnd ??
    input.value.length;

  input.value =
    input.value.slice(0, start) +
    emoji +
    input.value.slice(end);

  input.focus();

  const position =
    start + emoji.length;

  input.setSelectionRange(
    position,
    position
  );
}

/* =========================================================
   POST MAIN COMMENT
========================================================= */

async function postComment(event) {
  event.preventDefault();

  if (!token) {
    openAuth("login");
    return;
  }

  if (!currentVideo) return;

  const input = $("#commentText");

  if (!input) return;

  const text =
    input.value.trim();

  if (!text) return;

  try {
    await api("/api/comments", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        videoId: currentVideo.id,
        text
      })
    });

    input.value = "";

    $("#commentEmojiPicker")
      ?.classList.add("hidden");

    await loadComments();
  } catch (e) {
    toast(e.message);
  }
}

/* =========================================================
   AUTH
========================================================= */

function openAuth(mode = "signup") {
  authMode = mode;

  $("#authModal")?.classList.remove(
    "hidden"
  );

  $("#tabSignup")?.classList.toggle(
    "selected",
    mode === "signup"
  );

  $("#tabLogin")?.classList.toggle(
    "selected",
    mode === "login"
  );

  if ($("#authTitle")) {
    $("#authTitle").textContent =
      mode === "signup"
        ? "Create your Perfectube account"
        : "Log in to Perfectube";
  }

  if ($("#authSubtitle")) {
    $("#authSubtitle").textContent =
      mode === "signup"
        ? "Pick a name, password and profile picture."
        : "Use your Perfectube name and password.";
  }

  if ($("#authSubmit")) {
    $("#authSubmit").textContent =
      mode === "signup"
        ? "Sign up"
        : "Log in";
  }

  $("#avatarLabel")?.classList.toggle(
    "hidden",
    mode !== "signup"
  );

  if ($("#password")) {
    $("#password").autocomplete =
      mode === "signup"
        ? "new-password"
        : "current-password";
  }
}

async function submitAuth(event) {
  event.preventDefault();

  const username =
    $("#username")?.value.trim() || "";

  const password =
    $("#password")?.value || "";

  try {
    let data;

    if (authMode === "signup") {
      const form = new FormData();

      form.append(
        "username",
        username
      );

      form.append(
        "password",
        password
      );

      const avatar =
        $("#avatar")?.files?.[0];

      if (avatar) {
        form.append(
          "avatar",
          avatar
        );
      }

      data = await api(
        "/api/signup",
        {
          method: "POST",
          body: form
        }
      );
    } else {
      data = await api(
        "/api/login",
        {
          method: "POST",
          headers: {
            "Content-Type":
              "application/json"
          },
          body: JSON.stringify({
            username,
            password
          })
        }
      );
    }

    token = data.token;

    localStorage.setItem(
      "perfectube_token",
      token
    );

    user = data.user;

    setAccount();

    $("#authModal")
      ?.classList.add("hidden");

    $("#authForm")?.reset();

    toast(
      authMode === "signup"
        ? "Welcome to Perfectube!"
        : "Welcome back!"
    );
  } catch (e) {
    toast(e.message);
  }
}

/* =========================================================
   CHANNELS
========================================================= */

function renderChannels() {
  if (!$("#channelGrid")) return;

  const channels = [
    ...new Map(
      videos.map(v => [
        v.channelHandle,
        v
      ])
    ).values()
  ];

  $("#channelGrid").innerHTML =
    channels.map(v => `
      <div class="channelItem">
        <strong>
          ${esc(v.channelName)}
        </strong>

        <span>
          ${esc(v.channelHandle)}
          ·
          ${esc(v.sourceType)}
        </span>
      </div>
    `).join("");
}

/* =========================================================
   PAGE SWITCHING
========================================================= */

function showPage(page) {
  currentPage = page;

  $$(".side[data-page]").forEach(
    button => {
      button.classList.toggle(
        "active",
        button.dataset.page === page
      );
    }
  );

  if (page === "channels") {
    $("#videoGrid")
      ?.classList.add("hidden");

    $("#hero")
      ?.classList.add("hidden");

    $("#channelsPanel")
      ?.classList.remove("hidden");

    $("#shortsFeed")
      ?.classList.add("hidden");

    renderChannels();

    return;
  }

  if (page === "shorts") {
    $("#videoGrid")
      ?.classList.add("hidden");

    $("#hero")
      ?.classList.add("hidden");

    $("#channelsPanel")
      ?.classList.add("hidden");

    $("#shortsFeed")
      ?.classList.remove("hidden");

    if ($("#feedTitle")) {
      $("#feedTitle").textContent =
        "Shorts";
    }

    prepareShorts();

    return;
  }

  $("#videoGrid")
    ?.classList.remove("hidden");

  $("#hero")
    ?.classList.remove("hidden");

  $("#channelsPanel")
    ?.classList.add("hidden");

  $("#shortsFeed")
    ?.classList.add("hidden");

  if ($("#feedTitle")) {
    $("#feedTitle").textContent =
      "Latest videos";
  }
}

/* =========================================================
   SHORTS
========================================================= */

function prepareShorts() {
  if (!videos.length) {
    shortsVideos = [];
    renderShorts();
    return;
  }

  shortsVideos = [...videos];

  shortsIndex = 0;
  shortsInitialized = true;

  renderShorts();
}

function renderShorts() {
  const feed = $("#shortsFeed");

  if (!feed) return;

  if (!shortsVideos.length) {
    feed.innerHTML = `
      <div class="empty">
        No Shorts available.
      </div>
    `;

    return;
  }

  feed.innerHTML =
    shortsVideos.map(
      (video, index) => `
        <article
          class="shortItem"
          data-short-index="${index}"
          data-video-id="${esc(video.id)}"
        >
          <div class="shortPlayer">
            <iframe
              src="https://www.youtube.com/embed/${encodeURIComponent(
                video.id
              )}?rel=0&playsinline=1"
              title="${esc(video.title)}"
              loading="lazy"
              allow="autoplay; encrypted-media; picture-in-picture"
              allowfullscreen
            ></iframe>
          </div>

          <div class="shortOverlay">
            <div class="shortInfo">

              <div class="shortChannel">
                <img
                  src="${esc(
                    video.channelAvatar ||
                    defaultAvatar(
                      video.channelName
                    )
                  )}"
                  alt=""
                >

                <strong>
                  ${esc(video.channelName)}
                </strong>
              </div>

              <h2>
                ${esc(video.title)}
              </h2>

              <p>
                ${esc(
                  video.description ||
                  ""
                )}
              </p>
            </div>

            <div class="shortActions">

              <button
                class="shortAction"
                data-short-like="${esc(
                  video.id
                )}"
              >
                ❤️
                <span>Like</span>
              </button>

              <button
                class="shortAction"
                data-short-comment="${esc(
                  video.id
                )}"
              >
                💬
                <span>Comments</span>
              </button>

              <button
                class="shortAction"
                data-short-open="${esc(
                  video.id
                )}"
              >
                ▶
                <span>Open</span>
              </button>

            </div>
          </div>
        </article>
      `
    ).join("");

  bindShortsButtons();
  setupShortsObserver();
}

/* =========================================================
   SHORTS BUTTONS
========================================================= */

function bindShortsButtons() {
  $$("[data-short-open]").forEach(
    button => {
      button.addEventListener(
        "click",
        event => {
          event.stopPropagation();

          openVideo(
            button.dataset.shortOpen
          );
        }
      );
    }
  );

  $$("[data-short-comment]").forEach(
    button => {
      button.addEventListener(
        "click",
        event => {
          event.stopPropagation();

          openVideo(
            button.dataset.shortComment
          );
        }
      );
    }
  );

  $$("[data-short-like]").forEach(
    button => {
      button.addEventListener(
        "click",
        async event => {
          event.stopPropagation();

          const id =
            button.dataset.shortLike;

          if (!token) {
            openAuth("login");
            return;
          }

          try {
            await api("/api/reaction", {
              method: "POST",
              headers: {
                "Content-Type":
                  "application/json"
              },
              body: JSON.stringify({
                videoId: id,
                reaction: "like"
              })
            });

            button.classList.toggle(
              "selected"
            );
          } catch (e) {
            toast(e.message);
          }
        }
      );
    }
  );
}

/* =========================================================
   SHORTS INTERSECTION OBSERVER
========================================================= */

function setupShortsObserver() {
  const feed = $("#shortsFeed");

  if (!feed) return;

  const items =
    $$(".shortItem");

  if (!items.length) return;

  const observer =
    new IntersectionObserver(
      entries => {
        entries.forEach(entry => {
          if (
            !entry.isIntersecting
          ) {
            return;
          }

          const item =
            entry.target;

          shortsIndex =
            Number(
              item.dataset.shortIndex
            );

          maybeLoadMoreShorts();
        });
      },
      {
        root: feed,
        threshold: 0.65
      }
    );

  items.forEach(item =>
    observer.observe(item)
  );
}

/* =========================================================
   INFINITE SHORTS
========================================================= */

async function maybeLoadMoreShorts() {
  if (shortsLoading) return;

  if (
    shortsIndex <
    shortsVideos.length - 3
  ) {
    return;
  }

  shortsLoading = true;

  try {
    const data = await api(
      `/api/videos?type=${encodeURIComponent(
        currentType
      )}`
    );

    const more =
      data.videos || [];

    const existing =
      new Set(
        shortsVideos.map(v => v.id)
      );

    const newVideos =
      more.filter(
        v => !existing.has(v.id)
      );

    if (newVideos.length) {
      shortsVideos.push(
        ...newVideos
      );

      appendShorts(newVideos);
    }
  } catch {
    /* Keep current feed working. */
  } finally {
    shortsLoading = false;
  }
}

function appendShorts(newVideos) {
  const feed = $("#shortsFeed");

  if (!feed) return;

  const start =
    shortsVideos.length -
    newVideos.length;

  feed.insertAdjacentHTML(
    "beforeend",
    newVideos.map(
      (video, offset) => `
        <article
          class="shortItem"
          data-short-index="${start + offset}"
          data-video-id="${esc(video.id)}"
        >
          <div class="shortPlayer">
            <iframe
              src="https://www.youtube.com/embed/${encodeURIComponent(
                video.id
              )}?rel=0&playsinline=1"
              title="${esc(video.title)}"
              loading="lazy"
              allow="autoplay; encrypted-media; picture-in-picture"
              allowfullscreen
            ></iframe>
          </div>

          <div class="shortOverlay">
            <div class="shortInfo">

              <div class="shortChannel">
                <img
                  src="${esc(
                    video.channelAvatar ||
                    defaultAvatar(
                      video.channelName
                    )
                  )}"
                  alt=""
                >

                <strong>
                  ${esc(video.channelName)}
                </strong>
              </div>

              <h2>
                ${esc(video.title)}
              </h2>

              <p>
                ${esc(
                  video.description ||
                  ""
                )}
              </p>
            </div>

            <div class="shortActions">

              <button
                class="shortAction"
                data-short-like="${esc(
                  video.id
                )}"
              >
                ❤️
                <span>Like</span>
              </button>

              <button
                class="shortAction"
                data-short-comment="${esc(
                  video.id
                )}"
              >
                💬
                <span>Comments</span>
              </button>

              <button
                class="shortAction"
                data-short-open="${esc(
                  video.id
                )}"
              >
                ▶
                <span>Open</span>
              </button>

            </div>
          </div>
        </article>
      `
    ).join("")
  );

  bindShortsButtons();
  setupShortsObserver();
}

/* =========================================================
   SHORTS KEYBOARD NAVIGATION
========================================================= */

function setupShortcuts() {
  document.addEventListener(
    "keydown",
    event => {
      if (
        currentPage !== "shorts"
      ) {
        return;
      }

      if (
        event.target.matches(
          "input, textarea"
        )
      ) {
        return;
      }

      if (
        event.key === "ArrowDown"
      ) {
        event.preventDefault();

        scrollShorts(1);
      }

      if (
        event.key === "ArrowUp"
      ) {
        event.preventDefault();

        scrollShorts(-1);
      }

      if (
        event.key === "PageDown"
      ) {
        event.preventDefault();

        scrollShorts(1);
      }

      if (
        event.key === "PageUp"
      ) {
        event.preventDefault();

        scrollShorts(-1);
      }
    }
  );
}

/* =========================================================
   SHORTS SCROLL
========================================================= */

function scrollShorts(direction) {
  const feed = $("#shortsFeed");

  if (!feed) return;

  const items =
    $$(".shortItem");

  if (!items.length) return;

  let index =
    shortsIndex + direction;

  index = Math.max(
    0,
    Math.min(
      items.length - 1,
      index
    )
  );

  shortsIndex = index;

  items[index].scrollIntoView({
    behavior: "smooth",
    block: "start"
  });

  if (
    index >=
    items.length - 3
  ) {
    maybeLoadMoreShorts();
  }
}

/* =========================================================
   MOUSE WHEEL SHORTS
========================================================= */

function setupShortsWheel() {
  document.addEventListener(
    "wheel",
    event => {
      if (
        currentPage !== "shorts"
      ) {
        return;
      }

      const feed =
        $("#shortsFeed");

      if (!feed) return;

      if (
        event.target.closest(
          ".modal"
        )
      ) {
        return;
      }

      if (
        Math.abs(event.deltaY) < 8
      ) {
        return;
      }

      event.preventDefault();

      scrollShorts(
        event.deltaY > 0
          ? 1
          : -1
      );
    },
    {
      passive: false
    }
  );
}

/* =========================================================
   MAIN EMOJI MODAL
========================================================= */

function setupEmojis() {
  const grid = $("#emojiGrid");

  if (!grid) return;

  grid.innerHTML =
    EMOJIS.map(
      emoji => `
        <button
          class="emoji"
          data-emoji="${emoji}"
          type="button"
        >
          ${emoji}
        </button>
      `
    ).join("");

  $$(".emoji").forEach(
    button => {
      button.addEventListener(
        "click",
        async () => {
          const emoji =
            button.dataset.emoji;

          const commentInput =
            $("#commentText");

          if (
            commentInput &&
            $("#videoModal") &&
            !$("#videoModal").classList.contains(
              "hidden"
            )
          ) {
            insertMainCommentEmoji(
              emoji
            );

            $("#emojiModal")
              ?.classList.add(
                "hidden"
              );

            return;
          }

          try {
            await navigator.clipboard.writeText(
              emoji
            );

            toast(
              `${emoji} copied!`
            );
          } catch {
            toast(emoji);
          }
        }
      );
    }
  );
}

/* =========================================================
   FILTERS
========================================================= */

$$(".filter").forEach(
  button => {
    button.addEventListener(
      "click",
      async () => {
        $$(".filter").forEach(
          b =>
            b.classList.remove(
              "active"
            )
        );

        button.classList.add(
          "active"
        );

        currentType =
          button.dataset.type;

        showPage("home");

        await loadVideos();
      }
    );
  }
);

/* =========================================================
   SIDEBAR
========================================================= */

$$(".side[data-page]").forEach(
  button => {
    button.addEventListener(
      "click",
      () => {
        showPage(
          button.dataset.page
        );
      }
    );
  }
);

/* =========================================================
   SEARCH
========================================================= */

$("#search")?.addEventListener(
  "input",
  () => {
    clearTimeout(searchTimer);

    searchTimer = setTimeout(
      () => {
        renderVideos();
      },
      100
    );
  }
);

$("#searchBtn")?.addEventListener(
  "click",
  renderVideos
);

/* =========================================================
   REFRESH
========================================================= */

$("#refreshBtn")?.addEventListener(
  "click",
  async () => {
    await loadVideos();

    if (
      currentPage === "shorts"
    ) {
      prepareShorts();
    }

    toast("Videos refreshed.");
  }
);

/* =========================================================
   HOME
========================================================= */

$("#homeBtn")?.addEventListener(
  "click",
  () => {
    showPage("home");
  }
);

/* =========================================================
   AUTH BUTTONS
========================================================= */

$("#loginOpen")?.addEventListener(
  "click",
  () => openAuth("login")
);

$("#signupOpen")?.addEventListener(
  "click",
  () => openAuth("signup")
);

$("#heroSignup")?.addEventListener(
  "click",
  () => openAuth("signup")
);

$("#tabLogin")?.addEventListener(
  "click",
  () => openAuth("login")
);

$("#tabSignup")?.addEventListener(
  "click",
  () => openAuth("signup")
);

$("#authForm")?.addEventListener(
  "submit",
  submitAuth
);

/* =========================================================
   LOGOUT
========================================================= */

$("#logoutBtn")?.addEventListener(
  "click",
  () => {
    token = "";
    user = null;

    localStorage.removeItem(
      "perfectube_token"
    );

    setAccount();

    toast("Logged out.");
  }
);

/* =========================================================
   VIDEO REACTIONS
========================================================= */

$("#likeBtn")?.addEventListener(
  "click",
  () => react("like")
);

$("#dislikeBtn")?.addEventListener(
  "click",
  () => react("dislike")
);

/* =========================================================
   COMMENTS
========================================================= */

$("#commentForm")?.addEventListener(
  "submit",
  postComment
);

/* =========================================================
   EMOJI MODAL
========================================================= */

$("#emojiOpen")?.addEventListener(
  "click",
  () => {
    $("#emojiModal")
      ?.classList.remove(
        "hidden"
      );
  }
);

/* =========================================================
   MODAL CLOSE
========================================================= */

$$("[data-close]").forEach(
  button => {
    button.addEventListener(
      "click",
      () => {
        const modal =
          $("#" +
            button.dataset.close);

        if (!modal) return;

        modal.classList.add(
          "hidden"
        );

        if (
          modal.id ===
          "videoModal"
        ) {
          if ($("#player")) {
            $("#player").src = "";
          }

          currentVideo = null;
        }
      }
    );
  }
);

/* =========================================================
   CLICK OUTSIDE MODALS
========================================================= */

[
  "authModal",
  "videoModal",
  "emojiModal"
].forEach(id => {
  const modal = $("#" + id);

  if (!modal) return;

  modal.addEventListener(
    "click",
    event => {
      if (
        event.target.id === id
      ) {
        modal.classList.add(
          "hidden"
        );

        if (
          id === "videoModal"
        ) {
          if ($("#player")) {
            $("#player").src = "";
          }

          currentVideo = null;
        }
      }
    }
  );
});

/* =========================================================
   ESC CLOSE
========================================================= */

document.addEventListener(
  "keydown",
  event => {
    if (event.key !== "Escape") {
      return;
    }

    $$(".modal:not(.hidden)").forEach(
      modal => {
        modal.classList.add(
          "hidden"
        );
      }
    );

    if ($("#player")) {
      $("#player").src = "";
    }
  }
);

/* =========================================================
   CLOSE COMMENT EMOJI PICKERS WHEN CLICKING OUTSIDE
========================================================= */

document.addEventListener(
  "click",
  event => {
    if (
      event.target.closest(
        ".commentEmojiBtn"
      ) ||
      event.target.closest(
        ".commentEmojiPicker"
      )
    ) {
      return;
    }

    $$(".commentEmojiPicker").forEach(
      picker => {
        picker.classList.add(
          "hidden"
        );
      }
    );
  }
);

/* =========================================================
   INITIALIZE
========================================================= */

async function init() {
  setupEmojis();
  setupCommentEmojiPicker();
  setupShortcuts();
  setupShortsWheel();

  await loadMe();
  await loadVideos();

  showPage("home");
}

init();
