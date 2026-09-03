/* =========================================================
   PERFECTUBE — FULL APP.JS
   Fixed API compatibility + Shorts + infinite scroll +
   comments + replies + comment likes + emojis +
   video reactions + auth
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
  "🥲","😏","😒","🙄","😬","🤐","😐","😑","😶","😮","😲","🤤",
  "😪","😵","🥺","😤","😡","🤬","😱","😨",
  "👏","🙌","🫶","🤝","💪","✌️","🤞","🤟","👌","🫡","👋","🖐️",
  "🎯","🎬","📱","💻","⚡","🌟","🌈","☀️","🌙","☁️","❄️",
  "🍔","🍟","🌭","🍿","🍩","🍪","🍰","🎂","🍎","🍌","🍉","🍓",
  "⚽","🏀","🏈","⚾","🎾","🥇","🥈","🥉","🕹️","🎧"
];

/* =========================================================
   STATE
========================================================= */

let videos = [];
let shortsVideos = [];

let currentVideo = null;
let currentType = "All";
let currentPage = "home";

let token =
  localStorage.getItem("perfectube_token") || "";

let user = null;
let authMode = "signup";

let shortsIndex = 0;
let shortsLoading = false;

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
  if (!date) return "";

  const time = new Date(date).getTime();

  if (Number.isNaN(time)) {
    return "";
  }

  const sec = Math.floor(
    (Date.now() - time) / 1000
  );

  if (sec < 60) return "just now";
  if (sec < 3600) {
    return `${Math.floor(sec / 60)}m ago`;
  }
  if (sec < 86400) {
    return `${Math.floor(sec / 3600)}h ago`;
  }
  if (sec < 2592000) {
    return `${Math.floor(sec / 86400)}d ago`;
  }

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
  const headers = {
    ...(options.headers || {})
  };

  if (token) {
    headers.Authorization =
      `Bearer ${token}`;
  }

  const response = await fetch(url, {
    ...options,
    headers
  });

  const text = await response.text();

  let data = {};

  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = {};
  }

  if (!response.ok) {
    throw new Error(
      data.error ||
      `Request failed (${response.status})`
    );
  }

  return data;
}

/* =========================================================
   NORMALIZE VIDEO RESPONSE
========================================================= */

function normalizeVideosResponse(data) {
  /*
    Server currently returns:

      [
        {...},
        {...}
      ]

    Older frontend expected:

      {
        videos: [...]
      }

    Support both.
  */

  if (Array.isArray(data)) {
    return data;
  }

  if (Array.isArray(data?.videos)) {
    return data.videos;
  }

  if (Array.isArray(data?.items)) {
    return data.items;
  }

  return [];
}

/* =========================================================
   NORMALIZE COMMENTS RESPONSE
========================================================= */

function normalizeCommentsResponse(data) {
  if (Array.isArray(data)) {
    return data;
  }

  if (Array.isArray(data?.comments)) {
    return data.comments;
  }

  if (Array.isArray(data?.items)) {
    return data.items;
  }

  return [];
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
      $("#accountName").textContent =
        user.username;
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

    if (data.loggedIn && data.user) {
      user = data.user;
    } else {
      token = "";
      user = null;

      localStorage.removeItem(
        "perfectube_token"
      );
    }

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
  $("#empty")?.classList.add("hidden");

  if ($("#videoGrid")) {
    $("#videoGrid").innerHTML = "";
  }

  try {
    const data = await api(
      `/api/videos?type=${encodeURIComponent(
        currentType
      )}`
    );

    videos = normalizeVideosResponse(data);

    renderVideos();
    renderChannels();

    if (currentPage === "shorts") {
      prepareShorts();
    }
  } catch (e) {
    videos = [];

    if ($("#videoGrid")) {
      $("#videoGrid").innerHTML = `
        <div class="empty">
          Could not load videos.
          <br>
          <small>${esc(e.message)}</small>
        </div>
      `;
    }

    if ($("#shortsFeed")) {
      $("#shortsFeed").innerHTML = `
        <div class="empty">
          Could not load Shorts.
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
   VIDEO HELPERS
========================================================= */

function getVideoTitle(video) {
  return (
    video.title ||
    "Untitled video"
  );
}

function getChannelName(video) {
  return (
    video.channelName ||
    video.channelTitle ||
    video.channel?.name ||
    "Unknown channel"
  );
}

function getVideoUrl(video) {
  return (
    video.url ||
    `https://www.youtube.com/watch?v=${encodeURIComponent(
      video.id
    )}`
  );
}

function getEmbedUrl(video) {
  if (video.embedUrl) {
    return video.embedUrl;
  }

  return (
    `https://www.youtube.com/embed/` +
    `${encodeURIComponent(video.id)}` +
    `?autoplay=1&rel=0&playsinline=1`
  );
}

/* =========================================================
   NORMAL VIDEO GRID
========================================================= */

function renderVideos() {
  if (!$("#videoGrid")) return;

  let list = [...videos];

  const search =
    $("#search")?.value.trim().toLowerCase() ||
    "";

  if (search) {
    list = list.filter(video => {
      const title =
        getVideoTitle(video).toLowerCase();

      const channel =
        getChannelName(video).toLowerCase();

      const source =
        String(
          video.sourceType || ""
        ).toLowerCase();

      return (
        title.includes(search) ||
        channel.includes(search) ||
        source.includes(search)
      );
    });
  }

  $("#empty")?.classList.toggle(
    "hidden",
    list.length !== 0
  );

  if (!list.length) {
    $("#videoGrid").innerHTML = "";
    return;
  }

  $("#videoGrid").innerHTML =
    list.map(video => {
      const title =
        getVideoTitle(video);

      const channel =
        getChannelName(video);

      const thumbnail =
        video.thumbnail ||
        video.thumbnails?.high?.url ||
        video.thumbnails?.medium?.url ||
        video.thumbnails?.default?.url ||
        "";

      const source =
        video.sourceType ||
        "YouTube";

      return `
        <article
          class="video"
          data-video="${esc(video.id)}"
        >
          <div class="thumb">

            <img
              src="${esc(thumbnail)}"
              loading="lazy"
              alt=""
            >

            <span class="badge">
              ${esc(source)}
            </span>

          </div>

          <div class="videoBody">

            <div class="videoTitle">
              ${esc(title)}
            </div>

            <div class="channel">
              ${esc(channel)}
            </div>

            <div class="date">
              ${timeAgo(video.publishedAt)}
            </div>

          </div>
        </article>
      `;
    }).join("");

  $$(".video").forEach(card => {
    card.addEventListener(
      "click",
      () => {
        openVideo(
          card.dataset.video
        );
      }
    );
  });
}

/* =========================================================
   OPEN NORMAL VIDEO
========================================================= */

async function openVideo(id) {
  currentVideo =
    videos.find(
      video =>
        String(video.id) ===
        String(id)
    );

  if (!currentVideo) {
    /*
      Also allow opening a Shorts video
      that was loaded after the original
      video array.
    */
    currentVideo =
      shortsVideos.find(
        video =>
          String(video.id) ===
          String(id)
      );
  }

  if (!currentVideo) {
    toast("Video not found.");
    return;
  }

  const player = $("#player");

  if (player) {
    player.src =
      getEmbedUrl(currentVideo);
  }

  if ($("#videoTitle")) {
    $("#videoTitle").textContent =
      getVideoTitle(currentVideo);
  }

  if ($("#videoChannel")) {
    $("#videoChannel").textContent =
      getChannelName(currentVideo);
  }

  if ($("#youtubeBtn")) {
    $("#youtubeBtn").href =
      getVideoUrl(currentVideo);
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

    const likes =
      Number(
        data.likes ??
        data.like ??
        0
      );

    const dislikes =
      Number(
        data.dislikes ??
        data.dislike ??
        0
      );

    const reaction =
      Number(
        data.userReaction ??
        0
      );

    if ($("#likeCount")) {
      $("#likeCount").textContent =
        likes;
    }

    if ($("#dislikeCount")) {
      $("#dislikeCount").textContent =
        dislikes;
    }

    $("#likeBtn")?.classList.toggle(
      "selected",
      reaction === 1 ||
      data.mine === "like"
    );

    $("#dislikeBtn")?.classList.toggle(
      "selected",
      reaction === -1 ||
      data.mine === "dislike"
    );
  } catch {
    if ($("#likeCount")) {
      $("#likeCount").textContent =
        0;
    }

    if ($("#dislikeCount")) {
      $("#dislikeCount").textContent =
        0;
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
    await api(
      "/api/reaction",
      {
        method: "POST",

        headers: {
          "Content-Type":
            "application/json"
        },

        body: JSON.stringify({
          videoId:
            currentVideo.id,

          /*
            IMPORTANT:
            server.js expects "value",
            not "reaction".
          */
          value:
            type === "like"
              ? 1
              : -1
        })
      }
    );

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

    const list =
      normalizeCommentsResponse(data);

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
    const id =
      comment.id ||
      comment._id;

    if (!id) return;

    map.set(
      String(id),
      {
        ...comment,

        id: String(id),

        username:
          comment.username ||
          comment.user?.username ||
          "Unknown",

        avatar:
          comment.avatar ||
          comment.user?.avatar ||
          null,

        replies: []
      }
    );
  });

  const roots = [];

  comments.forEach(comment => {
    const id =
      comment.id ||
      comment._id;

    if (!id) return;

    const node =
      map.get(String(id));

    if (!node) return;

    if (
      comment.parentId &&
      map.has(
        String(comment.parentId)
      )
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

  const tree =
    buildCommentTree(list);

  $("#commentList").innerHTML =
    tree
      .map(comment =>
        renderComment(
          comment,
          0
        )
      )
      .join("");

  bindCommentButtons();
}

/* =========================================================
   SINGLE COMMENT
========================================================= */

function renderComment(
  comment,
  depth = 0
) {
  const avatar =
    comment.avatar ||
    defaultAvatar(
      comment.username
    );

  const likeCount =
    Number(
      comment.likeCount ??
      comment.likes ??
      0
    );

  const mine =
    Number(
      comment.userReaction ??
      0
    ) === 1 ||
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
            ${esc(
              comment.username ||
              "Unknown"
            )}
          </strong>

          <span class="commentDate">
            ${
              comment.createdAt
                ? timeAgo(
                    comment.createdAt
                  )
                : ""
            }
          </span>

        </div>

        <p class="commentText">
          ${formatEmojiText(
            comment.text || ""
          )}
        </p>

        <div class="commentActions">

          <button
            type="button"
            class="commentLikeBtn ${
              mine
                ? "selected"
                : ""
            }"
            data-comment-like="${esc(
              comment.id
            )}"
          >
            ❤️
            <span>
              ${likeCount}
            </span>
          </button>

          <button
            type="button"
            class="commentReplyBtn"
            data-comment-reply="${esc(
              comment.id
            )}"
          >
            ↩ Reply
          </button>

          <button
            type="button"
            class="commentEmojiBtn"
            data-comment-emoji="${esc(
              comment.id
            )}"
          >
            😀
          </button>

        </div>

        <div
          class="commentReplyBox hidden"
          id="replyBox-${esc(
            comment.id
          )}"
        >

          <form
            class="replyForm"
            data-parent="${esc(
              comment.id
            )}"
          >

            <input
              class="replyInput"
              maxlength="500"
              placeholder="Reply to ${esc(
                comment.username ||
                "this comment"
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
          id="commentEmoji-${esc(
            comment.id
          )}"
        >
          ${renderMiniEmojiPicker(
            comment.id
          )}
        </div>

        ${
          replies.length
            ? `
              <div class="commentReplies">
                ${replies
                  .map(reply =>
                    renderComment(
                      reply,
                      depth + 1
                    )
                  )
                  .join("")}
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

function renderMiniEmojiPicker(
  commentId
) {
  return `
    <div class="miniEmojiGrid">

      ${EMOJIS.map(
        emoji => `
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
        `
      ).join("")}

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
            button.dataset
              .commentLike
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
            button.dataset
              .commentReply
          );
        }
      );
    }
  );

  $$("[data-comment-emoji]").forEach(
    button => {
      button.addEventListener(
        "click",
        event => {
          event.stopPropagation();

          toggleCommentEmojiPicker(
            button.dataset
              .commentEmoji
          );
        }
      );
    }
  );

  $$(".replyForm").forEach(
    form => {
      form.addEventListener(
        "submit",
        postReply
      );
    }
  );

  $$("[data-emoji-target]").forEach(
    button => {
      button.addEventListener(
        "click",
        event => {
          event.stopPropagation();

          insertReplyEmoji(
            button.dataset
              .emojiTarget,

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

async function likeComment(
  commentId
) {
  if (!token) {
    openAuth("login");
    return;
  }

  try {
    /*
      Server expects "value".
    */

    await api(
      "/api/comment-reaction",
      {
        method: "POST",

        headers: {
          "Content-Type":
            "application/json"
        },

        body: JSON.stringify({
          commentId,

          value: 1
        })
      }
    );

    await loadComments();
  } catch (e) {
    toast(e.message);
  }
}

/* =========================================================
   REPLY BOX
========================================================= */

function toggleReplyBox(
  commentId
) {
  const box =
    $(
      `#replyBox-${CSS.escape(
        commentId
      )}`
    );

  if (!box) return;

  $$(".commentReplyBox").forEach(
    other => {
      if (other !== box) {
        other.classList.add(
          "hidden"
        );
      }
    }
  );

  box.classList.toggle(
    "hidden"
  );

  if (
    !box.classList.contains(
      "hidden"
    )
  ) {
    box
      .querySelector("input")
      ?.focus();
  }
}

/* =========================================================
   REPLY
========================================================= */

async function postReply(
  event
) {
  event.preventDefault();

  if (!token) {
    openAuth("login");
    return;
  }

  if (!currentVideo) return;

  const form =
    event.currentTarget;

  const parentId =
    form.dataset.parent;

  const input =
    form.querySelector(
      ".replyInput"
    );

  if (!input) return;

  const text =
    input.value.trim();

  if (!text) return;

  try {
    await api(
      "/api/comments",
      {
        method: "POST",

        headers: {
          "Content-Type":
            "application/json"
        },

        body: JSON.stringify({
          videoId:
            currentVideo.id,

          text,

          parentId
        })
      }
    );

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
    $(
      `#commentEmoji-${CSS.escape(
        commentId
      )}`
    );

  if (!picker) return;

  $$(".commentEmojiPicker").forEach(
    other => {
      if (other !== picker) {
        other.classList.add(
          "hidden"
        );
      }
    }
  );

  picker.classList.toggle(
    "hidden"
  );
}

function insertReplyEmoji(
  commentId,
  emoji
) {
  const box =
    $(
      `#replyBox-${CSS.escape(
        commentId
      )}`
    );

  if (!box) return;

  const input =
    box.querySelector(
      ".replyInput"
    );

  if (!input) return;

  input.value += emoji;

  input.focus();
}

/* =========================================================
   MAIN COMMENT EMOJI PICKER
========================================================= */

function setupCommentEmojiPicker() {
  const button =
    $("#commentEmojiOpen");

  const picker =
    $("#commentEmojiPicker");

  if (!button || !picker) {
    return;
  }

  picker.innerHTML =
    renderMainEmojiPicker();

  button.addEventListener(
    "click",
    event => {
      event.preventDefault();
      event.stopPropagation();

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
        emojiButton.dataset
          .mainEmoji
      );
    }
  );
}

function renderMainEmojiPicker() {
  return `
    <div class="mainEmojiGrid">

      ${EMOJIS.map(
        emoji => `
          <button
            type="button"
            data-main-emoji="${emoji}"
          >
            ${emoji}
          </button>
        `
      ).join("")}

    </div>
  `;
}

function insertMainCommentEmoji(
  emoji
) {
  const input =
    $("#commentText");

  if (!input) return;

  const start =
    input.selectionStart ??
    input.value.length;

  const end =
    input.selectionEnd ??
    input.value.length;

  input.value =
    input.value.slice(
      0,
      start
    ) +
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

async function postComment(
  event
) {
  event.preventDefault();

  if (!token) {
    openAuth("login");
    return;
  }

  if (!currentVideo) return;

  const input =
    $("#commentText");

  if (!input) return;

  const text =
    input.value.trim();

  if (!text) return;

  try {
    await api(
      "/api/comments",
      {
        method: "POST",

        headers: {
          "Content-Type":
            "application/json"
        },

        body: JSON.stringify({
          videoId:
            currentVideo.id,

          text
        })
      }
    );

    input.value = "";

    $("#commentEmojiPicker")
      ?.classList.add(
        "hidden"
      );

    await loadComments();
  } catch (e) {
    toast(e.message);
  }
}

/* =========================================================
   AUTH
========================================================= */

function openAuth(
  mode = "signup"
) {
  authMode = mode;

  $("#authModal")
    ?.classList.remove(
      "hidden"
    );

  $("#tabSignup")
    ?.classList.toggle(
      "selected",
      mode === "signup"
    );

  $("#tabLogin")
    ?.classList.toggle(
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

  $("#avatarLabel")
    ?.classList.toggle(
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

async function submitAuth(
  event
) {
  event.preventDefault();

  const username =
    $("#username")
      ?.value
      .trim() || "";

  const password =
    $("#password")
      ?.value || "";

  try {
    let data;

    if (
      authMode === "signup"
    ) {
      const form =
        new FormData();

      form.append(
        "username",
        username
      );

      form.append(
        "password",
        password
      );

      const avatar =
        $("#avatar")
          ?.files?.[0];

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
    user = data.user;

    localStorage.setItem(
      "perfectube_token",
      token
    );

    setAccount();

    $("#authModal")
      ?.classList.add(
        "hidden"
      );

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

  const map =
    new Map();

  videos.forEach(video => {
    const name =
      getChannelName(video);

    const handle =
      video.channelHandle ||
      video.channelId ||
      video.channel?.id ||
      "";

    const key =
      `${name}-${handle}`;

    if (!map.has(key)) {
      map.set(
        key,
        {
          ...video,
          channelName: name,
          channelHandle: handle
        }
      );
    }
  });

  const channels =
    [...map.values()];

  $("#channelGrid").innerHTML =
    channels.map(
      video => `
        <div class="channelItem">

          <strong>
            ${esc(
              getChannelName(video)
            )}
          </strong>

          <span>
            ${esc(
              video.channelHandle ||
              video.channelId ||
              ""
            )}
            ${
              video.sourceType
                ? ` · ${esc(
                    video.sourceType
                  )}`
                : ""
            }
          </span>

        </div>
      `
    ).join("");
}

/* =========================================================
   PAGE SWITCHING
========================================================= */

function showPage(
  page
) {
  currentPage = page;

  $$(".side[data-page]").forEach(
    button => {
      button.classList.toggle(
        "active",
        button.dataset.page ===
          page
      );
    }
  );

  if (
    page === "channels"
  ) {
    $("#videoGrid")
      ?.classList.add(
        "hidden"
      );

    $("#hero")
      ?.classList.add(
        "hidden"
      );

    $("#channelsPanel")
      ?.classList.remove(
        "hidden"
      );

    $("#shortsFeed")
      ?.classList.add(
        "hidden"
      );

    renderChannels();

    return;
  }

  if (
    page === "shorts"
  ) {
    $("#videoGrid")
      ?.classList.add(
        "hidden"
      );

    $("#hero")
      ?.classList.add(
        "hidden"
      );

    $("#channelsPanel")
      ?.classList.add(
        "hidden"
      );

    $("#shortsFeed")
      ?.classList.remove(
        "hidden"
      );

    if ($("#feedTitle")) {
      $("#feedTitle").textContent =
        "Shorts";
    }

    prepareShorts();

    return;
  }

  $("#videoGrid")
    ?.classList.remove(
      "hidden"
    );

  $("#hero")
    ?.classList.remove(
      "hidden"
    );

  $("#channelsPanel")
    ?.classList.add(
      "hidden"
    );

  $("#shortsFeed")
    ?.classList.add(
      "hidden"
    );

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

  shortsVideos =
    [...videos];

  shortsIndex = 0;

  renderShorts();
}

function createShortHTML(
  video,
  index
) {
  const title =
    getVideoTitle(video);

  const channel =
    getChannelName(video);

  const embed =
    video.embedUrl ||
    (
      `https://www.youtube.com/embed/` +
      `${encodeURIComponent(video.id)}` +
      `?rel=0&playsinline=1`
    );

  return `
    <article
      class="shortItem"
      data-short-index="${index}"
      data-video-id="${esc(
        video.id
      )}"
    >

      <div class="shortPlayer">

        <iframe
          src="${esc(embed)}"
          title="${esc(title)}"
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
                defaultAvatar(channel)
              )}"
              alt=""
            >

            <strong>
              ${esc(channel)}
            </strong>

          </div>

          <h2>
            ${esc(title)}
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
            type="button"
            class="shortAction"
            data-short-like="${esc(
              video.id
            )}"
          >
            ❤️
            <span>Like</span>
          </button>

          <button
            type="button"
            class="shortAction"
            data-short-comment="${esc(
              video.id
            )}"
          >
            💬
            <span>Comments</span>
          </button>

          <button
            type="button"
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
  `;
}

function renderShorts() {
  const feed =
    $("#shortsFeed");

  if (!feed) return;

  if (!shortsVideos.length) {
    feed.innerHTML = `
      <div class="empty">
        No videos available.
      </div>
    `;

    return;
  }

  feed.innerHTML =
    shortsVideos
      .map(
        (video, index) =>
          createShortHTML(
            video,
            index
          )
      )
      .join("");

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
            button.dataset
              .shortOpen
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
            button.dataset
              .shortComment
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
            button.dataset
              .shortLike;

          if (!token) {
            openAuth("login");
            return;
          }

          try {
            const data =
              await api(
                "/api/reaction",
                {
                  method:
                    "POST",

                  headers: {
                    "Content-Type":
                      "application/json"
                  },

                  body:
                    JSON.stringify({
                      videoId: id,
                      value: 1
                    })
                }
              );

            button.classList.toggle(
              "selected",
              Number(
                data.userReaction
              ) === 1
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
   SHORTS OBSERVER
========================================================= */

let shortsObserver = null;

function setupShortsObserver() {
  const feed =
    $("#shortsFeed");

  if (!feed) return;

  if (shortsObserver) {
    shortsObserver.disconnect();
  }

  const items =
    $$(".shortItem");

  if (!items.length) return;

  shortsObserver =
    new IntersectionObserver(
      entries => {
        entries.forEach(
          entry => {
            if (
              !entry.isIntersecting
            ) {
              return;
            }

            const item =
              entry.target;

            shortsIndex =
              Number(
                item.dataset
                  .shortIndex
              );

            maybeLoadMoreShorts();
          }
        );
      },
      {
        root: feed,
        threshold: 0.65
      }
    );

  items.forEach(item =>
    shortsObserver.observe(
      item
    )
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
    const data =
      await api(
        `/api/videos?type=${encodeURIComponent(
          currentType
        )}`
      );

    const more =
      normalizeVideosResponse(
        data
      );

    const existing =
      new Set(
        shortsVideos.map(
          video => video.id
        )
      );

    const newVideos =
      more.filter(
        video =>
          video.id &&
          !existing.has(
            video.id
          )
      );

    if (newVideos.length) {
      const start =
        shortsVideos.length;

      shortsVideos.push(
        ...newVideos
      );

      appendShorts(
        newVideos,
        start
      );
    }
  } catch (e) {
    console.warn(
      "Could not load more Shorts:",
      e.message
    );
  } finally {
    shortsLoading = false;
  }
}

/* =========================================================
   APPEND SHORTS
========================================================= */

function appendShorts(
  newVideos,
  startIndex
) {
  const feed =
    $("#shortsFeed");

  if (!feed) return;

  feed.insertAdjacentHTML(
    "beforeend",

    newVideos
      .map(
        (video, offset) =>
          createShortHTML(
            video,
            startIndex +
              offset
          )
      )
      .join("")
  );

  bindShortsButtons();
  setupShortsObserver();
}

/* =========================================================
   SHORTS KEYBOARD
========================================================= */

function setupShortcuts() {
  document.addEventListener(
    "keydown",
    event => {
      if (
        currentPage !==
        "shorts"
      ) {
        return;
      }

      if (
        event.target.matches(
          "input, textarea, select"
        )
      ) {
        return;
      }

      if (
        event.key ===
        "ArrowDown"
      ) {
        event.preventDefault();

        scrollShorts(1);
      }

      if (
        event.key ===
        "ArrowUp"
      ) {
        event.preventDefault();

        scrollShorts(-1);
      }

      if (
        event.key ===
        "PageDown"
      ) {
        event.preventDefault();

        scrollShorts(1);
      }

      if (
        event.key ===
        "PageUp"
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

function scrollShorts(
  direction
) {
  const feed =
    $("#shortsFeed");

  if (!feed) return;

  const items =
    $$(".shortItem");

  if (!items.length) return;

  let index =
    shortsIndex +
    direction;

  index =
    Math.max(
      0,
      Math.min(
        items.length - 1,
        index
      )
    );

  shortsIndex =
    index;

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
        currentPage !==
        "shorts"
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
        Math.abs(
          event.deltaY
        ) < 8
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
  const grid =
    $("#emojiGrid");

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
            button.dataset
              .emoji;

          const commentInput =
            $("#commentText");

          if (
            commentInput &&
            $("#videoModal") &&
            !$("#videoModal")
              .classList
              .contains(
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
            await navigator
              .clipboard
              .writeText(
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
          button.dataset.type ||
          "All";

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
    clearTimeout(
      searchTimer
    );

    searchTimer =
      setTimeout(
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
      currentPage ===
      "shorts"
    ) {
      prepareShorts();
    }

    toast(
      "Videos refreshed."
    );
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
  () =>
    openAuth("login")
);

$("#signupOpen")?.addEventListener(
  "click",
  () =>
    openAuth("signup")
);

$("#heroSignup")?.addEventListener(
  "click",
  () =>
    openAuth("signup")
);

$("#tabLogin")?.addEventListener(
  "click",
  () =>
    openAuth("login")
);

$("#tabSignup")?.addEventListener(
  "click",
  () =>
    openAuth("signup")
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
  () =>
    react("like")
);

$("#dislikeBtn")?.addEventListener(
  "click",
  () =>
    react("dislike")
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
   SHORTS PREVIOUS / NEXT BUTTONS
========================================================= */

$("#shortPrev")?.addEventListener(
  "click",
  event => {
    event.preventDefault();
    scrollShorts(-1);
  }
);

$("#shortNext")?.addEventListener(
  "click",
  event => {
    event.preventDefault();
    scrollShorts(1);
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
          $(
            "#" +
            button.dataset
              .close
          );

        if (!modal) return;

        modal.classList.add(
          "hidden"
        );

        if (
          modal.id ===
          "videoModal"
        ) {
          if ($("#player")) {
            $("#player").src =
              "";
          }

          currentVideo =
            null;
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
  const modal =
    $("#" + id);

  if (!modal) return;

  modal.addEventListener(
    "click",
    event => {
      if (
        event.target.id ===
        id
      ) {
        modal.classList.add(
          "hidden"
        );

        if (
          id ===
          "videoModal"
        ) {
          if ($("#player")) {
            $("#player").src =
              "";
          }

          currentVideo =
            null;
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
    if (
      event.key !==
      "Escape"
    ) {
      return;
    }

    $$(".modal:not(.hidden)")
      .forEach(
        modal => {
          modal.classList.add(
            "hidden"
          );
        }
      );

    if ($("#player")) {
      $("#player").src = "";
    }

    currentVideo = null;
  }
);

/* =========================================================
   CLOSE COMMENT EMOJI PICKERS
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
      ) ||
      event.target.closest(
        "#commentEmojiOpen"
      ) ||
      event.target.closest(
        "#commentEmojiPicker"
      )
    ) {
      return;
    }

    $$(".commentEmojiPicker")
      .forEach(
        picker => {
          picker.classList.add(
            "hidden"
          );
        }
      );

    $("#commentEmojiPicker")
      ?.classList.add(
        "hidden"
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
