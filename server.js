/* =========================================================
   PERFECTUBE — SERVER.JS
   ---------------------------------------------------------
   Express + MongoDB + YouTube API

   FEATURES
   - Local accounts
   - Login / signup
   - Avatar uploads
   - JWT authentication
   - Video reactions
   - Comments
   - Comment replies
   - Comment likes
   - Custom emojis
   - YouTube video feed
   - Real Shorts filtering
   - Curated Shorts channel groups
   - Trending / Funny / Hot sources
   - Recommended sources
   - YouTube pagination
   - Basic content safety filtering
========================================================= */

require("dotenv").config();

const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const multer = require("multer");
const { MongoClient, ObjectId } = require("mongodb");

/* =========================================================
   CONFIG
========================================================= */

const app = express();

const PORT =
  Number(process.env.PORT) || 10000;

const JWT_SECRET =
  process.env.JWT_SECRET ||
  "perfectube-development-secret";

const MONGODB_URI =
  process.env.MONGODB_URI;

const YOUTUBE_API_KEY =
  process.env.YOUTUBE_API_KEY;

/* =========================================================
   MIDDLEWARE
========================================================= */

app.use(
  express.json({
    limit: "2mb"
  })
);

app.use(
  express.urlencoded({
    extended: true,
    limit: "2mb"
  })
);

/* =========================================================
   STATIC FILES
========================================================= */

app.use(
  express.static("public")
);

/* =========================================================
   MULTER
========================================================= */

const upload =
  multer({
    storage:
      multer.memoryStorage(),

    limits: {
      fileSize:
        2 * 1024 * 1024
    }
  });

/* =========================================================
   DATABASE
========================================================= */

let mongoClient = null;
let db = null;

let usersCollection = null;
let reactionsCollection = null;
let commentsCollection = null;
let commentReactionsCollection = null;
let emojisCollection = null;

async function connectDatabase() {
  if (!MONGODB_URI) {
    console.warn(
      "MONGODB_URI is not configured."
    );

    return;
  }

  try {
    mongoClient =
      new MongoClient(
        MONGODB_URI
      );

    await mongoClient.connect();

    db =
      mongoClient.db();

    usersCollection =
      db.collection("users");

    reactionsCollection =
      db.collection("reactions");

    commentsCollection =
      db.collection("comments");

    commentReactionsCollection =
      db.collection(
        "commentReactions"
      );

    emojisCollection =
      db.collection("emojis");

    console.log(
      "Connected to MongoDB."
    );
  } catch (error) {
    console.error(
      "MongoDB connection failed:",
      error
    );

    mongoClient = null;
    db = null;
  }
}

/* =========================================================
   DATABASE SAFETY
========================================================= */

function requireDatabase(res) {
  if (!db) {
    res.status(503).json({
      error:
        "Database is not connected."
    });

    return false;
  }

  return true;
}

/* =========================================================
   YOUTUBE CHANNELS
========================================================= */

/*
   These are the creators you supplied.

   We use handles rather than inventing channel IDs.
   The server resolves the handles through YouTube.
*/

/* -------------------------
   TRENDING
------------------------- */

const TRENDING_CHANNELS = [
  "@MistahDinoReal",
  "@rockcries",
  "@GuestNotFound_1",
  "@RanielHerco",
  "@TheLastChip",
  "@Ramo_Akh",
  "@mrchillllllll",
  "@MrSolidCat",
  "@FedeUT46",
  "@michaelstoren."
];

/* -------------------------
   FUNNY
------------------------- */

const FUNNY_CHANNELS = [
  "@kreekgato",
  "@basementcat-gg",
  "@SanAzure7",
  "@quirkblox",
  "@TheLastChip",
  "@Ramo_Akh",
  "@mrchillllllll",
  "@MrSolidCat",
  "@michaelstoren.",
  "@BlobbyClips",
  "@Daydih",
  "@therealplaymakerz",
  "@Ninye"
];

/* -------------------------
   HOT
------------------------- */

const HOT_CHANNELS = [
  "@TheLastChip",
  "@Ramo_Akh",
  "@rankrush_001",
  "@mrchillllllll",
  "@michaelstoren.",
  "@Daydih",
  "@Ninye",
  "@fasttopsreal"
];

/* -------------------------
   RECOMMENDED
------------------------- */

const RECOMMENDED_CHANNELS = [
  "@fasttopsreal"
];

/* =========================================================
   EXTRA CREATORS
========================================================= */

/*
   Rant and music sources can be added later
   through the same structure.

   IN2RANT is intentionally NOT included.
*/

const RANT_CHANNELS = [];

const MUSIC_CHANNELS = [];

/* =========================================================
   CHANNEL GROUPS
========================================================= */

const CHANNEL_GROUPS = {
  trending:
    TRENDING_CHANNELS,

  funny:
    FUNNY_CHANNELS,

  hot:
    HOT_CHANNELS,

  recommended:
    RECOMMENDED_CHANNELS,

  rant:
    RANT_CHANNELS,

  music:
    MUSIC_CHANNELS
};

/* =========================================================
   CHANNEL RESOLUTION CACHE
========================================================= */

const resolvedChannels =
  new Map();

/* =========================================================
   YOUTUBE REQUEST
========================================================= */

async function youtubeRequest(
  endpoint,
  params = {}
) {
  if (!YOUTUBE_API_KEY) {
    throw new Error(
      "YOUTUBE_API_KEY is not configured."
    );
  }

  const url =
    new URL(
      `https://www.googleapis.com/youtube/v3/${endpoint}`
    );

  Object.entries({
    ...params,
    key:
      YOUTUBE_API_KEY
  }).forEach(
    ([key, value]) => {
      if (
        value !== undefined &&
        value !== null &&
        value !== ""
      ) {
        url.searchParams.set(
          key,
          String(value)
        );
      }
    }
  );

  const response =
    await fetch(
      url.toString()
    );

  const text =
    await response.text();

  let data = {};

  try {
    data =
      text
        ? JSON.parse(text)
        : {};
  } catch {
    data = {};
  }

  if (!response.ok) {
    const message =
      data?.error?.message ||
      `YouTube API error (${response.status})`;

    throw new Error(
      message
    );
  }

  return data;
}

/* =========================================================
   RESOLVE CHANNEL HANDLE
========================================================= */

async function resolveChannel(
  handle
) {
  if (
    resolvedChannels.has(
      handle
    )
  ) {
    return resolvedChannels.get(
      handle
    );
  }

  /*
     Search for the channel.

     We don't hard-code IDs because the supplied
     URLs use YouTube handles.
  */

  const cleanHandle =
    String(handle || "")
      .trim()
      .replace(/^@/, "");

  if (!cleanHandle) {
    return null;
  }

  try {
    const data =
      await youtubeRequest(
        "search",
        {
          part:
            "snippet",

          q:
            cleanHandle,

          type:
            "channel",

          maxResults:
            5
        }
      );

    const items =
      Array.isArray(
        data.items
      )
        ? data.items
        : [];

    if (!items.length) {
      return null;
    }

    /*
       Prefer an exact-looking title/handle match,
       otherwise use the first channel result.
    */

    const normalized =
      cleanHandle
        .toLowerCase()
        .replace(
          /[^a-z0-9]/g,
          ""
        );

    let selected =
      items.find(item => {
        const title =
          String(
            item?.snippet
              ?.channelTitle ||
            ""
          )
            .toLowerCase()
            .replace(
              /[^a-z0-9]/g,
              ""
            );

        return (
          title ===
          normalized
        );
      });

    if (!selected) {
      selected =
        items[0];
    }

    const channelId =
      selected?.id
        ?.channelId;

    if (!channelId) {
      return null;
    }

    const result = {
      id:
        channelId,

      handle:
        handle,

      name:
        selected?.snippet
          ?.channelTitle ||
        handle
    };

    resolvedChannels.set(
      handle,
      result
    );

    return result;
  } catch (error) {
    console.error(
      `Could not resolve channel ${handle}:`,
      error.message
    );

    return null;
  }
}

/* =========================================================
   CONTENT SAFETY
========================================================= */

/*
   This is an additional filter.

   YouTube's safeSearch is also requested.

   This does NOT guarantee perfect moderation.
*/

const BLOCKED_CONTENT_PATTERNS = [
  /\bself[\s-]?harm\b/i,
  /\bsuicide\b/i,
  /\bkill yourself\b/i,
  /\bsexual\b/i,
  /\bsexually explicit\b/i,
  /\bporn\b/i,
  /\bnude\b/i,
  /\bnudity\b/i,
  /\bonlyfans\b/i,
  /\bdrugs?\b/i,
  /\bcocaine\b/i,
  /\bheroin\b/i,
  /\bmeth\b/i,
  /\bweed\b/i,
  /\bmarijuana\b/i,
  /\bvape\b/i,
  /\bbetting\b/i,
  /\bgambling\b/i,
  /\bcasino\b/i,
  /\bweapon\b/i,
  /\bgore\b/i
];

function isSafeVideo(
  video
) {
  const text =
    [
      video?.title,
      video?.description
    ]
      .filter(Boolean)
      .join(" ");

  return !BLOCKED_CONTENT_PATTERNS.some(
    pattern =>
      pattern.test(text)
  );
}

/* =========================================================
   ISO 8601 DURATION
========================================================= */

function parseYouTubeDuration(
  duration
) {
  if (
    typeof duration !==
    "string"
  ) {
    return 0;
  }

  const match =
    duration.match(
      /^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/
    );

  if (!match) {
    return 0;
  }

  const hours =
    Number(
      match[1] || 0
    );

  const minutes =
    Number(
      match[2] || 0
    );

  const seconds =
    Number(
      match[3] || 0
    );

  return (
    hours * 3600 +
    minutes * 60 +
    seconds
  );
}

/* =========================================================
   CHANNEL VIDEOS
========================================================= */

async function getChannelVideos(
  channel,
  options = {}
) {
  const {
    maxResults = 12,
    shorts = false,
    pageToken = ""
  } = options;

  const searchParams = {
    part:
      "snippet",

    channelId:
      channel.id,

    maxResults:
      Math.min(
        Number(maxResults) || 12,
        50
      ),

    order:
      "date",

    type:
      "video",

    safeSearch:
      "strict"
  };

  /*
     Shorts feed:
     - short-duration candidates
     - embeddable
     - playable outside youtube.com
  */

  if (shorts) {
    searchParams.videoDuration =
      "short";

    searchParams.videoEmbeddable =
      "true";

    searchParams.videoSyndicated =
      "true";
  }

  if (pageToken) {
    searchParams.pageToken =
      pageToken;
  }

  const searchData =
    await youtubeRequest(
      "search",
      searchParams
    );

  const items =
    Array.isArray(
      searchData.items
    )
      ? searchData.items
      : [];

  const ids =
    items
      .map(
        item =>
          item?.id
            ?.videoId
      )
      .filter(Boolean);

  if (!ids.length) {
    return {
      videos: [],
      nextPageToken:
        searchData.nextPageToken ||
        null
    };
  }

  const videoData =
    await youtubeRequest(
      "videos",
      {
        part:
          "snippet,contentDetails,statistics",

        id:
          ids.join(",")
      }
    );

  const videos =
    Array.isArray(
      videoData.items
    )
      ? videoData.items
      : [];

  const result =
    videos
      .map(video => {
        const snippet =
          video.snippet || {};

        const details =
          video.contentDetails ||
          {};

        const stats =
          video.statistics ||
          {};

        const durationSeconds =
          parseYouTubeDuration(
            details.duration
          );

        return {
          id:
            video.id,

          title:
            snippet.title ||
            "Untitled video",

          description:
            snippet.description ||
            "",

          publishedAt:
            snippet.publishedAt ||
            null,

          channelId:
            snippet.channelId ||
            channel.id,

          channelTitle:
            snippet.channelTitle ||
            channel.name,

          channelName:
            snippet.channelTitle ||
            channel.name,

          channelHandle:
            channel.handle,

          thumbnail:
            snippet
              ?.thumbnails
              ?.high
              ?.url ||
            snippet
              ?.thumbnails
              ?.medium
              ?.url ||
            snippet
              ?.thumbnails
              ?.default
              ?.url ||
            "",

          thumbnails:
            snippet.thumbnails ||
            {},

          duration:
            details.duration ||
            "",

          durationSeconds,

          views:
            Number(
              stats.viewCount || 0
            ),

          likes:
            Number(
              stats.likeCount || 0
            ),

          comments:
            Number(
              stats.commentCount || 0
            ),

          url:
            `https://www.youtube.com/watch?v=${encodeURIComponent(
              video.id
            )}`,

          embedUrl:
            `https://www.youtube.com/embed/${encodeURIComponent(
              video.id
            )}?rel=0&playsinline=1`,

          sourceType:
            "YouTube",

          channel: {
            id:
              channel.id,

            name:
              channel.name,

            handle:
              channel.handle
          }
        };
      })
      .filter(
        video =>
          isSafeVideo(video)
      );

  /*
     YouTube's API "short" filter means
     under four minutes.

     For Perfectube's Shorts feed we use
     an additional stricter three-minute
     application filter.
  */

  const filtered =
    shorts
      ? result.filter(
          video =>
            video.durationSeconds >
              0 &&
            video.durationSeconds <=
              180
        )
      : result;

  return {
    videos:
      filtered,

    nextPageToken:
      searchData.nextPageToken ||
      null
  };
}

/* =========================================================
   GET CHANNEL GROUP
========================================================= */

async function resolveGroup(
  groupName
) {
  const handles =
    CHANNEL_GROUPS[
      groupName
    ] || [];

  const channels = [];

  for (const handle of handles) {
    const channel =
      await resolveChannel(
        handle
      );

    if (channel) {
      channels.push(
        channel
      );
    }
  }

  return channels;
}

/* =========================================================
   GET SHORTS
========================================================= */

async function getShortsFeed(
  group = "trending",
  pageToken = ""
) {
  let handles =
    CHANNEL_GROUPS[
      group
    ];

  if (
    !Array.isArray(handles) ||
    !handles.length
  ) {
    handles =
      TRENDING_CHANNELS;
  }

  /*
     To avoid huge API usage, fetch a limited
     number of creators per request.
  */

  const channels = [];

  for (
    const handle of handles
  ) {
    const channel =
      await resolveChannel(
        handle
      );

    if (channel) {
      channels.push(
        channel
      );
    }
  }

  if (!channels.length) {
    return {
      videos: [],
      nextPageToken: null
    };
  }

  const allVideos = [];

  /*
     If a page token is supplied, request that
     page from each selected channel.
  */

  for (
    const channel of channels
  ) {
    try {
      const result =
        await getChannelVideos(
          channel,
          {
            maxResults:
              10,

            shorts:
              true,

            pageToken
          }
        );

      allVideos.push(
        ...result.videos
      );
    } catch (error) {
      console.error(
        `Shorts error for ${channel.handle}:`,
        error.message
      );
    }
  }

  /*
     Remove duplicates.
  */

  const uniqueMap =
    new Map();

  for (
    const video of allVideos
  ) {
    if (
      video?.id &&
      !uniqueMap.has(
        video.id
      )
    ) {
      uniqueMap.set(
        video.id,
        video
      );
    }
  }

  const unique =
    Array.from(
      uniqueMap.values()
    );

  /*
     Mix the selected creators so one creator
     does not completely dominate the feed.
  */

  unique.sort(
    () =>
      Math.random() - 0.5
  );

  return {
    videos:
      unique,

    /*
       Channel-specific page tokens cannot safely
       be combined into one universal cursor.

       The frontend can request again for more
       curated results.
    */

    nextPageToken:
      null
  };
}

/* =========================================================
   GET NORMAL FEED
========================================================= */

async function getNormalFeed(
  type = "all"
) {
  let handles = [];

  if (
    type === "funny"
  ) {
    handles =
      FUNNY_CHANNELS;
  } else if (
    type === "hot"
  ) {
    handles =
      HOT_CHANNELS;
  } else if (
    type === "recommended"
  ) {
    handles =
      RECOMMENDED_CHANNELS;
  } else {
    /*
       Home feed combines the main creator
       groups rather than the old random
       unrelated channels.
    */

    handles = [
      ...TRENDING_CHANNELS,
      ...FUNNY_CHANNELS,
      ...HOT_CHANNELS
    ];
  }

  /*
     Remove duplicate handles.
  */

  handles =
    [
      ...new Set(handles)
    ];

  const channels = [];

  for (
    const handle of handles
  ) {
    const channel =
      await resolveChannel(
        handle
      );

    if (channel) {
      channels.push(
        channel
      );
    }
  }

  const results = [];

  for (
    const channel of channels
  ) {
    try {
      const result =
        await getChannelVideos(
          channel,
          {
            maxResults:
              6,

            shorts:
              false
          }
        );

      results.push(
        ...result.videos
      );
    } catch (error) {
      console.error(
        `Feed error for ${channel.handle}:`,
        error.message
      );
    }

    /*
       Keep the API usage under control.
    */

    if (
      results.length >=
      80
    ) {
      break;
    }
  }

  const uniqueMap =
    new Map();

  for (
    const video of results
  ) {
    if (
      video?.id &&
      !uniqueMap.has(
        video.id
      )
    ) {
      uniqueMap.set(
        video.id,
        video
      );
    }
  }

  const unique =
    Array.from(
      uniqueMap.values()
    );

  unique.sort(
    () =>
      Math.random() - 0.5
  );

  return unique.slice(
    0,
    80
  );
}

/* =========================================================
   HEALTH
========================================================= */

app.get(
  "/api/health",
  (req, res) => {
    res.json({
      ok: true,
      database:
        Boolean(db),
      youtube:
        Boolean(
          YOUTUBE_API_KEY
        )
    });
  }
);

/* =========================================================
   VIDEOS API
========================================================= */

app.get(
  "/api/videos",
  async (req, res) => {
    try {
      if (!YOUTUBE_API_KEY) {
        return res.status(503).json({
          error:
            "YOUTUBE_API_KEY is not configured."
        });
      }

      const type =
        String(
          req.query.type ||
          "all"
        ).toLowerCase();

      /*
         SHORTS
      */

      if (
        type === "shorts"
      ) {
        const group =
          String(
            req.query.group ||
            "trending"
          ).toLowerCase();

        const result =
          await getShortsFeed(
            group
          );

        /*
           Keep compatibility with the
           current app.js.
        */

        return res.json(
          result.videos
        );
      }

      /*
         NORMAL FEED
      */

      const videos =
        await getNormalFeed(
          type
        );

      return res.json(
        videos
      );
    } catch (error) {
      console.error(
        "/api/videos error:",
        error
      );

      return res.status(500).json({
        error:
          "Could not load videos.",
        details:
          error.message
      });
    }
  }
);

/* =========================================================
   CHANNELS API
========================================================= */

app.get(
  "/api/channels",
  async (req, res) => {
    try {
      const group =
        String(
          req.query.group ||
          "trending"
        ).toLowerCase();

      const handles =
        CHANNEL_GROUPS[
          group
        ] || [];

      const channels = [];

      for (
        const handle of handles
      ) {
        const channel =
          await resolveChannel(
            handle
          );

        if (channel) {
          channels.push(
            channel
          );
        }
      }

      res.json(
        channels
      );
    } catch (error) {
      console.error(
        "/api/channels error:",
        error
      );

      res.status(500).json({
        error:
          "Could not load channels."
      });
    }
  }
);

/* =========================================================
   AUTH HELPERS
========================================================= */

function createToken(
  user
) {
  return jwt.sign(
    {
      id:
        String(user._id),

      username:
        user.username
    },

    JWT_SECRET,

    {
      expiresIn:
        "30d"
    }
  );
}

function safeUser(
  user
) {
  if (!user) {
    return null;
  }

  return {
    id:
      String(user._id),

    username:
      user.username,

    avatar:
      user.avatar ||
      null,

    createdAt:
      user.createdAt ||
      null
  };
}

function getAuthToken(
  req
) {
  const header =
    req.headers.authorization ||
    "";

  if (
    header.startsWith(
      "Bearer "
    )
  ) {
    return header.slice(
      7
    );
  }

  return null;
}

async function getCurrentUser(
  req
) {
  if (!db) {
    return null;
  }

  const token =
    getAuthToken(req);

  if (!token) {
    return null;
  }

  try {
    const decoded =
      jwt.verify(
        token,
        JWT_SECRET
      );

    if (
      !decoded?.id
    ) {
      return null;
    }

    const user =
      await usersCollection.findOne(
        {
          _id:
            new ObjectId(
              decoded.id
            )
        }
      );

    return user || null;
  } catch {
    return null;
  }
}

/* =========================================================
   ME
========================================================= */

app.get(
  "/api/me",
  async (req, res) => {
    if (
      !requireDatabase(res)
    ) {
      return;
    }

    const user =
      await getCurrentUser(
        req
      );

    if (!user) {
      return res.json({
        loggedIn: false,
        user: null
      });
    }

    res.json({
      loggedIn: true,
      user:
        safeUser(user)
    });
  }
);

/* =========================================================
   SIGNUP
========================================================= */

app.post(
  "/api/signup",
  upload.single("avatar"),
  async (req, res) => {
    if (
      !requireDatabase(res)
    ) {
      return;
    }

    try {
      const username =
        String(
          req.body.username ||
          ""
        ).trim();

      const password =
        String(
          req.body.password ||
          ""
        );

      if (
        username.length <
        3
      ) {
        return res.status(400).json({
          error:
            "Username must be at least 3 characters."
        });
      }

      if (
        username.length >
        24
      ) {
        return res.status(400).json({
          error:
            "Username is too long."
        });
      }

      if (
        password.length <
        6
      ) {
        return res.status(400).json({
          error:
            "Password must be at least 6 characters."
        });
      }

      const existing =
        await usersCollection.findOne(
          {
            username:
              username
          }
        );

      if (existing) {
        return res.status(409).json({
          error:
            "Username is already taken."
        });
      }

      const passwordHash =
        await bcrypt.hash(
          password,
          12
        );

      let avatar =
        null;

      if (
        req.file
      ) {
        const mime =
          req.file.mimetype ||
          "";

        if (
          !mime.startsWith(
            "image/"
          )
        ) {
          return res.status(400).json({
            error:
              "Avatar must be an image."
          });
        }

        avatar =
          `data:${mime};base64,${req.file.buffer.toString(
            "base64"
          )}`;
      }

      const user = {
        username,

        passwordHash,

        avatar,

        createdAt:
          new Date()
      };

      const result =
        await usersCollection.insertOne(
          user
        );

      user._id =
        result.insertedId;

      const token =
        createToken(user);

      res.status(201).json({
        token,

        user:
          safeUser(user)
      });
    } catch (error) {
      console.error(
        "Signup error:",
        error
      );

      res.status(500).json({
        error:
          "Could not create account."
      });
    }
  }
);

/* =========================================================
   LOGIN
========================================================= */

app.post(
  "/api/login",
  async (req, res) => {
    if (
      !requireDatabase(res)
    ) {
      return;
    }

    try {
      const username =
        String(
          req.body.username ||
          ""
        ).trim();

      const password =
        String(
          req.body.password ||
          ""
        );

      const user =
        await usersCollection.findOne(
          {
            username
          }
        );

      if (!user) {
        return res.status(401).json({
          error:
            "Invalid username or password."
        });
      }

      const valid =
        await bcrypt.compare(
          password,
          user.passwordHash
        );

      if (!valid) {
        return res.status(401).json({
          error:
            "Invalid username or password."
        });
      }

      const token =
        createToken(user);

      res.json({
        token,

        user:
          safeUser(user)
      });
    } catch (error) {
      console.error(
        "Login error:",
        error
      );

      res.status(500).json({
        error:
          "Could not log in."
      });
    }
  }
);

/* =========================================================
   VIDEO REACTIONS
========================================================= */

app.get(
  "/api/reactions/:videoId",
  async (req, res) => {
    if (
      !requireDatabase(res)
    ) {
      return;
    }

    try {
      const videoId =
        String(
          req.params.videoId
        );

      const user =
        await getCurrentUser(
          req
        );

      const rows =
        await reactionsCollection
          .find({
            videoId
          })
          .toArray();

      let likes = 0;
      let dislikes = 0;
      let userReaction = 0;

      for (
        const row of rows
      ) {
        if (
          Number(row.value) ===
          1
        ) {
          likes++;
        }

        if (
          Number(row.value) ===
          -1
        ) {
          dislikes++;
        }

        if (
          user &&
          String(
            row.userId
          ) ===
            String(
              user._id
            )
        ) {
          userReaction =
            Number(
              row.value
            );
        }
      }

      res.json({
        likes,

        dislikes,

        userReaction,

        mine:
          userReaction === 1
            ? "like"
            : userReaction === -1
            ? "dislike"
            : null
      });
    } catch (error) {
      console.error(
        "Reaction GET error:",
        error
      );

      res.status(500).json({
        error:
          "Could not load reactions."
      });
    }
  }
);

/* =========================================================
   CREATE / UPDATE VIDEO REACTION
========================================================= */

app.post(
  "/api/reaction",
  async (req, res) => {
    if (
      !requireDatabase(res)
    ) {
      return;
    }

    const user =
      await getCurrentUser(
        req
      );

    if (!user) {
      return res.status(401).json({
        error:
          "You must be logged in."
      });
    }

    try {
      const videoId =
        String(
          req.body.videoId ||
          ""
        );

      const value =
        Number(
          req.body.value
        );

      if (
        !videoId ||
        ![1, -1].includes(
          value
        )
      ) {
        return res.status(400).json({
          error:
            "Invalid reaction."
        });
      }

      const existing =
        await reactionsCollection.findOne(
          {
            videoId,

            userId:
              String(
                user._id
              )
          }
        );

      if (
        existing &&
        Number(existing.value) ===
          value
      ) {
        await reactionsCollection.deleteOne(
          {
            _id:
              existing._id
          }
        );
      } else if (existing) {
        await reactionsCollection.updateOne(
          {
            _id:
              existing._id
          },
          {
            $set: {
              value,

              updatedAt:
                new Date()
            }
          }
        );
      } else {
        await reactionsCollection.insertOne(
          {
            videoId,

            userId:
              String(
                user._id
              ),

            value,

            createdAt:
              new Date()
          }
        );
      }

      const rows =
        await reactionsCollection
          .find({
            videoId
          })
          .toArray();

      let likes = 0;
      let dislikes = 0;
      let userReaction = 0;

      for (
        const row of rows
      ) {
        if (
          Number(row.value) ===
          1
        ) {
          likes++;
        }

        if (
          Number(row.value) ===
          -1
        ) {
          dislikes++;
        }

        if (
          String(
            row.userId
          ) ===
            String(
              user._id
            )
        ) {
          userReaction =
            Number(
              row.value
            );
        }
      }

      res.json({
        likes,
        dislikes,
        userReaction
      });
    } catch (error) {
      console.error(
        "Reaction POST error:",
        error
      );

      res.status(500).json({
        error:
          "Could not save reaction."
      });
    }
  }
);

/* =========================================================
   COMMENTS GET
========================================================= */

app.get(
  "/api/comments/:videoId",
  async (req, res) => {
    if (
      !requireDatabase(res)
    ) {
      return;
    }

    try {
      const videoId =
        String(
          req.params.videoId
        );

      const comments =
        await commentsCollection
          .find({
            videoId
          })
          .sort({
            createdAt:
              1
          })
          .toArray();

      const user =
        await getCurrentUser(
          req
        );

      const ids =
        comments.map(
          comment =>
            String(
              comment._id
            )
        );

      const likes =
        ids.length
          ? await commentReactionsCollection
              .find({
                commentId: {
                  $in:
                    ids
                }
              })
              .toArray()
          : [];

      const likeCounts =
        new Map();

      const mine =
        new Set();

      for (
        const reaction of likes
      ) {
        const id =
          String(
            reaction.commentId
          );

        if (
          Number(
            reaction.value
          ) === 1
        ) {
          likeCounts.set(
            id,
            (
              likeCounts.get(
                id
              ) || 0
            ) + 1
          );
        }

        if (
          user &&
          String(
            reaction.userId
          ) ===
            String(
              user._id
            ) &&
          Number(
            reaction.value
          ) === 1
        ) {
          mine.add(id);
        }
      }

      const result =
        comments.map(
          comment => ({
            id:
              String(
                comment._id
              ),

            _id:
              String(
                comment._id
              ),

            videoId:
              comment.videoId,

            text:
              comment.text,

            parentId:
              comment.parentId ||
              null,

            username:
              comment.username ||
              "Unknown",

            avatar:
              comment.avatar ||
              null,

            createdAt:
              comment.createdAt,

            likeCount:
              likeCounts.get(
                String(
                  comment._id
                )
              ) || 0,

            userReaction:
              mine.has(
                String(
                  comment._id
                )
              )
                ? 1
                : 0
          })
        );

      res.json(
        result
      );
    } catch (error) {
      console.error(
        "Comments GET error:",
        error
      );

      res.status(500).json({
        error:
          "Could not load comments."
      });
    }
  }
);

/* =========================================================
   CREATE COMMENT / REPLY
========================================================= */

app.post(
  "/api/comments",
  async (req, res) => {
    if (
      !requireDatabase(res)
    ) {
      return;
    }

    const user =
      await getCurrentUser(
        req
      );

    if (!user) {
      return res.status(401).json({
        error:
          "You must be logged in."
      });
    }

    try {
      const videoId =
        String(
          req.body.videoId ||
          ""
        );

      const text =
        String(
          req.body.text ||
          ""
        ).trim();

      const parentId =
        req.body.parentId
          ? String(
              req.body.parentId
            )
          : null;

      if (!videoId) {
        return res.status(400).json({
          error:
            "Video ID is required."
        });
      }

      if (!text) {
        return res.status(400).json({
          error:
            "Comment cannot be empty."
        });
      }

      if (
        text.length >
        500
      ) {
        return res.status(400).json({
          error:
            "Comment is too long."
        });
      }

      const comment = {
        videoId,

        text,

        parentId,

        username:
          user.username,

        avatar:
          user.avatar ||
          null,

        userId:
          String(
            user._id
          ),

        createdAt:
          new Date()
      };

      const result =
        await commentsCollection.insertOne(
          comment
        );

      res.status(201).json({
        id:
          String(
            result.insertedId
          ),

        comment: {
          ...comment,

          id:
            String(
              result.insertedId
            )
        }
      });
    } catch (error) {
      console.error(
        "Comment POST error:",
        error
      );

      res.status(500).json({
        error:
          "Could not create comment."
      });
    }
  }
);

/* =========================================================
   COMMENT REACTION
========================================================= */

app.post(
  "/api/comment-reaction",
  async (req, res) => {
    if (
      !requireDatabase(res)
    ) {
      return;
    }

    const user =
      await getCurrentUser(
        req
      );

    if (!user) {
      return res.status(401).json({
        error:
          "You must be logged in."
      });
    }

    try {
      const commentId =
        String(
          req.body.commentId ||
          ""
        );

      const value =
        Number(
          req.body.value
        );

      if (
        !commentId ||
        ![1, -1].includes(
          value
        )
      ) {
        return res.status(400).json({
          error:
            "Invalid comment reaction."
        });
      }

      const existing =
        await commentReactionsCollection.findOne(
          {
            commentId,

            userId:
              String(
                user._id
              )
          }
        );

      if (
        existing &&
        Number(existing.value) ===
          value
      ) {
        await commentReactionsCollection.deleteOne(
          {
            _id:
              existing._id
          }
        );
      } else if (existing) {
        await commentReactionsCollection.updateOne(
          {
            _id:
              existing._id
          },
          {
            $set: {
              value
            }
          }
        );
      } else {
        await commentReactionsCollection.insertOne(
          {
            commentId,

            userId:
              String(
                user._id
              ),

            value,

            createdAt:
              new Date()
          }
        );
      }

      const rows =
        await commentReactionsCollection
          .find({
            commentId
          })
          .toArray();

      const likes =
        rows.filter(
          row =>
            Number(
              row.value
            ) === 1
        ).length;

      const userReaction =
        rows.find(
          row =>
            String(
              row.userId
            ) ===
              String(
                user._id
              )
        );

      res.json({
        likes,

        userReaction:
          userReaction
            ? Number(
                userReaction.value
              )
            : 0
      });
    } catch (error) {
      console.error(
        "Comment reaction error:",
        error
      );

      res.status(500).json({
        error:
          "Could not save comment reaction."
      });
    }
  }
);

/* =========================================================
   CUSTOM EMOJIS
========================================================= */

app.get(
  "/api/emojis",
  async (req, res) => {
    if (
      !requireDatabase(res)
    ) {
      return;
    }

    try {
      const emojis =
        await emojisCollection
          .find({})
          .sort({
            createdAt:
              -1
          })
          .limit(500)
          .toArray();

      res.json(
        emojis.map(
          emoji => ({
            id:
              String(
                emoji._id
              ),

            name:
              emoji.name,

            value:
              emoji.value,

            image:
              emoji.image ||
              null,

            createdAt:
              emoji.createdAt
          })
        )
      );
    } catch (error) {
      console.error(
        "Emoji GET error:",
        error
      );

      res.status(500).json({
        error:
          "Could not load emojis."
      });
    }
  }
);

/* =========================================================
   CREATE CUSTOM EMOJI
========================================================= */

app.post(
  "/api/emojis",
  upload.single("image"),
  async (req, res) => {
    if (
      !requireDatabase(res)
    ) {
      return;
    }

    const user =
      await getCurrentUser(
        req
      );

    if (!user) {
      return res.status(401).json({
        error:
          "You must be logged in."
      });
    }

    try {
      const name =
        String(
          req.body.name ||
          ""
        ).trim();

      const value =
        String(
          req.body.value ||
          ""
        ).trim();

      if (
        !name &&
        !value &&
        !req.file
      ) {
        return res.status(400).json({
          error:
            "Emoji content is required."
        });
      }

      if (
        name.length >
        32
      ) {
        return res.status(400).json({
          error:
            "Emoji name is too long."
        });
      }

      let image =
        null;

      if (
        req.file
      ) {
        const mime =
          req.file.mimetype ||
          "";

        if (
          !mime.startsWith(
            "image/"
          )
        ) {
          return res.status(400).json({
            error:
              "Emoji image must be an image."
          });
        }

        image =
          `data:${mime};base64,${req.file.buffer.toString(
            "base64"
          )}`;
      }

      const emoji = {
        name:
          name ||
          "custom",

        value:
          value ||
          "",

        image,

        userId:
          String(
            user._id
          ),

        username:
          user.username,

        createdAt:
          new Date()
      };

      const result =
        await emojisCollection.insertOne(
          emoji
        );

      res.status(201).json({
        id:
          String(
            result.insertedId
          ),

        emoji: {
          ...emoji,

          id:
            String(
              result.insertedId
            )
        }
      });
    } catch (error) {
      console.error(
        "Emoji POST error:",
        error
      );

      res.status(500).json({
        error:
          "Could not create emoji."
      });
    }
  }
);

/* =========================================================
   DELETE CUSTOM EMOJI
========================================================= */

app.delete(
  "/api/emojis/:id",
  async (req, res) => {
    if (
      !requireDatabase(res)
    ) {
      return;
    }

    const user =
      await getCurrentUser(
        req
      );

    if (!user) {
      return res.status(401).json({
        error:
          "You must be logged in."
      });
    }

    try {
      const id =
        req.params.id;

      if (
        !ObjectId.isValid(id)
      ) {
        return res.status(400).json({
          error:
            "Invalid emoji ID."
        });
      }

      const emoji =
        await emojisCollection.findOne(
          {
            _id:
              new ObjectId(id)
          }
        );

      if (!emoji) {
        return res.status(404).json({
          error:
            "Emoji not found."
        });
      }

      if (
        String(
          emoji.userId
        ) !==
        String(
          user._id
        )
      ) {
        return res.status(403).json({
          error:
            "You can only delete your own emojis."
        });
      }

      await emojisCollection.deleteOne(
        {
          _id:
            new ObjectId(id)
        }
      );

      res.json({
        success: true
      });
    } catch (error) {
      console.error(
        "Emoji DELETE error:",
        error
      );

      res.status(500).json({
        error:
          "Could not delete emoji."
      });
    }
  }
);

/* =========================================================
   FALLBACK
========================================================= */

app.get(
  "*",
  (req, res) => {
    /*
       Express 5 may reject some wildcard syntax
       depending on the installed version.

       Static index handling is kept simple.
    */

    res.sendFile(
      require("path").join(
        process.cwd(),
        "public",
        "index.html"
      )
    );
  }
);

/* =========================================================
   START
========================================================= */

async function start() {
  await connectDatabase();

  app.listen(
    PORT,
    "0.0.0.0",
    () => {
      console.log(
        `Perfectube running on port ${PORT}`
      );

      console.log(
        `YouTube API: ${
          YOUTUBE_API_KEY
            ? "configured"
            : "NOT configured"
        }`
      );

      console.log(
        `MongoDB: ${
          db
            ? "connected"
            : "NOT connected"
        }`
      );
    }
  );
}

start();
