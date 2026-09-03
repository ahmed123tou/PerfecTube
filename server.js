require("dotenv").config();

const express = require("express");
const path = require("path");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const multer = require("multer");
const { MongoClient, ObjectId } = require("mongodb");

const app = express();

const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || "change-this-secret";
const MONGODB_URI = process.env.MONGODB_URI;
const YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY;

app.use(express.json({ limit: "5mb" }));
app.use(express.urlencoded({ extended: true, limit: "5mb" }));

app.use(express.static(path.join(__dirname, "public")));

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 2 * 1024 * 1024
  }
});

/* =========================================================
   CHANNELS
========================================================= */

const CHANNELS = [
  {
    id: "UCX6OQ3DkcsbYNE6H8uQQuVA",
    name: "MrBeast",
    avatar: "https://yt3.googleusercontent.com/ytc/AIdro_lY7"
  },
  {
    id: "UCq-Fj5jknLsUf-MWSy4_brA",
    name: "T-Series"
  },
  {
    id: "UC-lHJZR3Gqxm24_Vd_AJ5Yw",
    name: "PewDiePie"
  },
  {
    id: "UCcabW7890RKJzL968QWEykA",
    name: "Mark Rober"
  },
  {
    id: "UCVHFbqXqoYvEWM1Ddxl0QDg",
    name: "Veritasium"
  },
  {
    id: "UCsXVk37bltHxD1rDPwtNM8Q",
    name: "Kurzgesagt"
  },
  {
    id: "UCYO_jab_esuFRV4b17AJtAw",
    name: "3Blue1Brown"
  },
  {
    id: "UC8butISFwT-Wl7EV0hUK0BQ",
    name: "freeCodeCamp"
  },
  {
    id: "UC4a-Gbdw7vOaccHmFo40b9g",
    name: "The Infographics Show"
  },
  {
    id: "UCsT0YIqwnpJCM-mx7-gSA4Q",
    name: "TED"
  },
  {
    id: "UCbRP3c757lWg9M-U7TyEkXA",
    name: "Cocomelon"
  },
  {
    id: "UCpEhnqL0y41EpW2TvWAHD7Q",
    name: "Alan Chikin Chow"
  },
  {
    id: "UCYzPXprvl5Y-Sf0g4vX-m6g",
    name: "Dude Perfect"
  },
  {
    id: "UCqECaJ8Gagnn7YCbPEzWH6g",
    name: "Ariana Grande"
  },
  {
    id: "UCvC4D8onUfXzvjTOM-dBfEA",
    name: "Marques Brownlee"
  }
];

/* =========================================================
   MONGODB
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
    console.error("❌ MONGODB_URI is missing.");
    return;
  }

  try {
    mongoClient = new MongoClient(MONGODB_URI);

    await mongoClient.connect();

    db = mongoClient.db();

    usersCollection = db.collection("users");
    reactionsCollection = db.collection("reactions");
    commentsCollection = db.collection("comments");
    commentReactionsCollection = db.collection("commentReactions");
    emojisCollection = db.collection("emojis");

    await usersCollection.createIndex(
      { usernameLower: 1 },
      { unique: true }
    );

    await reactionsCollection.createIndex(
      { userId: 1, videoId: 1 },
      { unique: true }
    );

    await commentsCollection.createIndex({
      videoId: 1,
      createdAt: 1
    });

    await commentsCollection.createIndex({
      parentId: 1
    });

    await commentReactionsCollection.createIndex(
      { userId: 1, commentId: 1 },
      { unique: true }
    );

    await emojisCollection.createIndex(
      { nameLower: 1 },
      { unique: true }
    );

    console.log("✅ MongoDB connected.");
  } catch (error) {
    console.error("❌ MongoDB connection failed:", error.message);
  }
}

/* =========================================================
   HELPERS
========================================================= */

function isDatabaseReady() {
  return !!db;
}

function requireDatabase(res) {
  if (!isDatabaseReady()) {
    res.status(503).json({
      error: "Database is not connected."
    });

    return false;
  }

  return true;
}

function createToken(user) {
  return jwt.sign(
    {
      id: user._id.toString(),
      username: user.username
    },
    JWT_SECRET,
    {
      expiresIn: "30d"
    }
  );
}

function getTokenFromRequest(req) {
  const header = req.headers.authorization;

  if (!header) return null;

  if (!header.startsWith("Bearer ")) {
    return null;
  }

  return header.slice(7);
}

function getAuthUser(req) {
  const token = getTokenFromRequest(req);

  if (!token) return null;

  try {
    return jwt.verify(token, JWT_SECRET);
  } catch {
    return null;
  }
}

function requireAuth(req, res, next) {
  const user = getAuthUser(req);

  if (!user) {
    return res.status(401).json({
      error: "You must be logged in."
    });
  }

  req.user = user;
  next();
}

function optionalAuth(req, res, next) {
  req.user = getAuthUser(req);
  next();
}

function safeObjectId(value) {
  if (!value) return null;

  try {
    return new ObjectId(value);
  } catch {
    return null;
  }
}

function cleanUsername(username) {
  return String(username || "").trim();
}

function cleanUsernameLower(username) {
  return cleanUsername(username).toLowerCase();
}

function cleanCommentText(text) {
  return String(text || "").trim();
}

function normalizeReaction(value) {
  if (
    value === "like" ||
    value === "liked" ||
    value === 1 ||
    value === "1"
  ) {
    return 1;
  }

  if (
    value === "dislike" ||
    value === "disliked" ||
    value === -1 ||
    value === "-1"
  ) {
    return -1;
  }

  return 0;
}

function formatUser(user) {
  if (!user) {
    return {
      id: null,
      username: "Unknown",
      avatar: null
    };
  }

  return {
    id: user._id ? user._id.toString() : user.id || null,
    username: user.username || "Unknown",
    avatar: user.avatar || null
  };
}

function formatComment(comment, userMap, reactionMap) {
  const author =
    userMap.get(String(comment.userId)) || {
      username: comment.username || "Unknown",
      avatar: comment.avatar || null,
      id: String(comment.userId || "")
    };

  const reaction = reactionMap.get(String(comment._id));

  return {
    id: comment._id.toString(),
    _id: comment._id.toString(),

    videoId: comment.videoId,

    text: comment.text,

    parentId: comment.parentId || null,

    user: {
      id: author.id || null,
      username: author.username || "Unknown",
      avatar: author.avatar || null
    },

    username: author.username || "Unknown",
    avatar: author.avatar || null,

    createdAt: comment.createdAt,

    likes: reaction?.likes || 0,
    dislikes: reaction?.dislikes || 0,

    likeCount: reaction?.likes || 0,
    dislikeCount: reaction?.dislikes || 0,

    userReaction: reaction?.userReaction || 0
  };
}

/* =========================================================
   YOUTUBE API
========================================================= */

async function youtubeRequest(endpoint, params = {}) {
  if (!YOUTUBE_API_KEY) {
    throw new Error("YOUTUBE_API_KEY is missing.");
  }

  const searchParams = new URLSearchParams({
    ...params,
    key: YOUTUBE_API_KEY
  });

  const url =
    `https://www.googleapis.com/youtube/v3/${endpoint}?` +
    searchParams.toString();

  const response = await fetch(url);

  if (!response.ok) {
    const text = await response.text();

    throw new Error(
      `YouTube API error ${response.status}: ${text}`
    );
  }

  return response.json();
}

async function getChannelVideos(channel, maxResults = 12) {
  const searchData = await youtubeRequest("search", {
    part: "snippet",
    channelId: channel.id,
    maxResults,
    order: "date",
    type: "video"
  });

  const ids = (searchData.items || [])
    .map(item => item.id?.videoId)
    .filter(Boolean);

  if (!ids.length) {
    return [];
  }

  const videoData = await youtubeRequest("videos", {
    part: "snippet,contentDetails,statistics",
    id: ids.join(",")
  });

  return (videoData.items || []).map(video => ({
    id: video.id,

    title: video.snippet?.title || "Untitled",

    description: video.snippet?.description || "",

    publishedAt: video.snippet?.publishedAt || null,

    channelId: video.snippet?.channelId || channel.id,

    channelTitle:
      video.snippet?.channelTitle ||
      channel.name,

    thumbnail:
      video.snippet?.thumbnails?.maxres?.url ||
      video.snippet?.thumbnails?.high?.url ||
      video.snippet?.thumbnails?.medium?.url ||
      video.snippet?.thumbnails?.default?.url ||
      "",

    thumbnails: video.snippet?.thumbnails || {},

    duration:
      video.contentDetails?.duration || null,

    views:
      Number(video.statistics?.viewCount || 0),

    likes:
      Number(video.statistics?.likeCount || 0),

    comments:
      Number(video.statistics?.commentCount || 0),

    url:
      `https://www.youtube.com/watch?v=${video.id}`,

    embedUrl:
      `https://www.youtube.com/embed/${video.id}`,

    channel: {
      id: video.snippet?.channelId || channel.id,
      name:
        video.snippet?.channelTitle ||
        channel.name
    }
  }));
}

/* =========================================================
   CONFIG
========================================================= */

app.get("/api/config", (req, res) => {
  res.json({
    siteName: "PerfecTube",
    youtubeEnabled: !!YOUTUBE_API_KEY,
    databaseEnabled: !!MONGODB_URI,
    features: {
      shorts: true,
      comments: true,
      commentLikes: true,
      replies: true,
      emojis: true,
      reactions: true
    }
  });
});

/* =========================================================
   VIDEOS
========================================================= */

app.get("/api/videos", async (req, res) => {
  try {
    const type = String(req.query.type || "all");

    if (!YOUTUBE_API_KEY) {
      return res.status(503).json({
        error: "YouTube API key is not configured."
      });
    }

    let results = [];

    const shuffledChannels = [...CHANNELS].sort(
      () => Math.random() - 0.5
    );

    for (const channel of shuffledChannels) {
      try {
        const amount =
          type === "shorts"
            ? 15
            : 10;

        const videos = await getChannelVideos(
          channel,
          amount
        );

        results.push(...videos);

        if (results.length >= 60) {
          break;
        }
      } catch (error) {
        console.error(
          `YouTube channel ${channel.name} failed:`,
          error.message
        );
      }
    }

    const unique = [];
    const seen = new Set();

    for (const video of results) {
      if (!video.id) continue;

      if (seen.has(video.id)) continue;

      seen.add(video.id);
      unique.push(video);
    }

    unique.sort(
      () => Math.random() - 0.5
    );

    res.json(unique);
  } catch (error) {
    console.error("Videos error:", error);

    res.status(500).json({
      error: "Failed to load videos."
    });
  }
});

/* =========================================================
   CURRENT USER
========================================================= */

app.get(
  "/api/me",
  optionalAuth,
  async (req, res) => {
    if (!req.user) {
      return res.json({
        loggedIn: false,
        user: null
      });
    }

    if (!requireDatabase(res)) return;

    try {
      const userId = safeObjectId(req.user.id);

      if (!userId) {
        return res.json({
          loggedIn: false,
          user: null
        });
      }

      const user =
        await usersCollection.findOne(
          { _id: userId },
          {
            projection: {
              passwordHash: 0
            }
          }
        );

      if (!user) {
        return res.json({
          loggedIn: false,
          user: null
        });
      }

      res.json({
        loggedIn: true,
        user: formatUser(user)
      });
    } catch (error) {
      console.error("Me error:", error);

      res.status(500).json({
        error: "Failed to load user."
      });
    }
  }
);

/* =========================================================
   SIGNUP
========================================================= */

app.post("/api/signup", async (req, res) => {
  if (!requireDatabase(res)) return;

  try {
    const username = cleanUsername(req.body.username);
    const password = String(req.body.password || "");

    if (username.length < 3) {
      return res.status(400).json({
        error: "Username must be at least 3 characters."
      });
    }

    if (username.length > 24) {
      return res.status(400).json({
        error: "Username must be 24 characters or less."
      });
    }

    if (!/^[a-zA-Z0-9_.-]+$/.test(username)) {
      return res.status(400).json({
        error:
          "Username can only contain letters, numbers, _, - and ."
      });
    }

    if (password.length < 6) {
      return res.status(400).json({
        error: "Password must be at least 6 characters."
      });
    }

    const usernameLower =
      cleanUsernameLower(username);

    const existing =
      await usersCollection.findOne({
        usernameLower
      });

    if (existing) {
      return res.status(409).json({
        error: "Username is already taken."
      });
    }

    const passwordHash =
      await bcrypt.hash(password, 12);

    const user = {
      username,
      usernameLower,
      passwordHash,
      avatar: null,
      createdAt: new Date()
    };

    const result =
      await usersCollection.insertOne(user);

    user._id = result.insertedId;

    const token = createToken(user);

    res.status(201).json({
      token,

      user: formatUser(user)
    });
  } catch (error) {
    console.error("Signup error:", error);

    if (error.code === 11000) {
      return res.status(409).json({
        error: "Username is already taken."
      });
    }

    res.status(500).json({
      error: "Signup failed."
    });
  }
});

/* =========================================================
   LOGIN
========================================================= */

app.post("/api/login", async (req, res) => {
  if (!requireDatabase(res)) return;

  try {
    const username =
      cleanUsernameLower(req.body.username);

    const password =
      String(req.body.password || "");

    if (!username || !password) {
      return res.status(400).json({
        error: "Username and password are required."
      });
    }

    const user =
      await usersCollection.findOne({
        usernameLower: username
      });

    if (!user) {
      return res.status(401).json({
        error: "Invalid username or password."
      });
    }

    const valid =
      await bcrypt.compare(
        password,
        user.passwordHash
      );

    if (!valid) {
      return res.status(401).json({
        error: "Invalid username or password."
      });
    }

    const token = createToken(user);

    res.json({
      token,

      user: formatUser(user)
    });
  } catch (error) {
    console.error("Login error:", error);

    res.status(500).json({
      error: "Login failed."
    });
  }
});

/* =========================================================
   AVATAR UPLOAD
========================================================= */

async function saveAvatar(req, res) {
  if (!requireDatabase(res)) return;

  try {
    if (!req.user) {
      return res.status(401).json({
        error: "You must be logged in."
      });
    }

    let avatar = null;

    if (req.file) {
      const mime = req.file.mimetype || "";

      if (!mime.startsWith("image/")) {
        return res.status(400).json({
          error: "Only image files are allowed."
        });
      }

      avatar =
        `data:${mime};base64,` +
        req.file.buffer.toString("base64");
    } else if (req.body.avatar) {
      avatar = String(req.body.avatar);

      if (avatar.length > 2_500_000) {
        return res.status(400).json({
          error: "Avatar is too large."
        });
      }
    } else {
      return res.status(400).json({
        error: "No avatar was provided."
      });
    }

    const userId =
      safeObjectId(req.user.id);

    if (!userId) {
      return res.status(400).json({
        error: "Invalid user."
      });
    }

    await usersCollection.updateOne(
      { _id: userId },
      {
        $set: {
          avatar,
          updatedAt: new Date()
        }
      }
    );

    res.json({
      success: true,
      avatar
    });
  } catch (error) {
    console.error("Avatar error:", error);

    res.status(500).json({
      error: "Failed to update avatar."
    });
  }
}

app.post(
  "/api/avatar",
  requireAuth,
  upload.single("avatar"),
  saveAvatar
);

app.post(
  "/api/upload-avatar",
  requireAuth,
  upload.single("avatar"),
  saveAvatar
);

/* =========================================================
   VIDEO REACTIONS
========================================================= */

app.post(
  "/api/reaction",
  requireAuth,
  async (req, res) => {
    if (!requireDatabase(res)) return;

    try {
      const videoId =
        String(req.body.videoId || "").trim();

      const value =
        normalizeReaction(req.body.value);

      if (!videoId) {
        return res.status(400).json({
          error: "Video ID is required."
        });
      }

      const userId =
        String(req.user.id);

      const existing =
        await reactionsCollection.findOne({
          userId,
          videoId
        });

      if (value === 0) {
        if (existing) {
          await reactionsCollection.deleteOne({
            _id: existing._id
          });
        }
      } else {
        await reactionsCollection.updateOne(
          {
            userId,
            videoId
          },
          {
            $set: {
              userId,
              videoId,
              value,
              updatedAt: new Date()
            }
          },
          {
            upsert: true
          }
        );
      }

      const counts =
        await getVideoReactionCounts(
          videoId,
          userId
        );

      res.json(counts);
    } catch (error) {
      console.error("Reaction error:", error);

      res.status(500).json({
        error: "Failed to update reaction."
      });
    }
  }
);

async function getVideoReactionCounts(
  videoId,
  userId = null
) {
  const rows =
    await reactionsCollection
      .aggregate([
        {
          $match: {
            videoId
          }
        },
        {
          $group: {
            _id: "$value",
            count: {
              $sum: 1
            }
          }
        }
      ])
      .toArray();

  let likes = 0;
  let dislikes = 0;

  for (const row of rows) {
    if (row._id === 1) {
      likes = row.count;
    }

    if (row._id === -1) {
      dislikes = row.count;
    }
  }

  let userReaction = 0;

  if (userId) {
    const own =
      await reactionsCollection.findOne({
        userId,
        videoId
      });

    if (own) {
      userReaction = own.value;
    }
  }

  return {
    likes,
    dislikes,

    like: likes,
    dislike: dislikes,

    userReaction
  };
}

app.get(
  "/api/reactions/:videoId",
  optionalAuth,
  async (req, res) => {
    if (!requireDatabase(res)) return;

    try {
      const userId =
        req.user
          ? String(req.user.id)
          : null;

      const counts =
        await getVideoReactionCounts(
          req.params.videoId,
          userId
        );

      res.json(counts);
    } catch (error) {
      console.error(
        "Reaction counts error:",
        error
      );

      res.status(500).json({
        error: "Failed to load reactions."
      });
    }
  }
);

/* =========================================================
   COMMENTS
========================================================= */

app.get(
  "/api/comments/:videoId",
  optionalAuth,
  async (req, res) => {
    if (!requireDatabase(res)) return;

    try {
      const videoId =
        String(req.params.videoId || "").trim();

      if (!videoId) {
        return res.status(400).json({
          error: "Video ID is required."
        });
      }

      const comments =
        await commentsCollection
          .find({
            videoId
          })
          .sort({
            createdAt: 1
          })
          .toArray();

      if (!comments.length) {
        return res.json([]);
      }

      const userIds = [
        ...new Set(
          comments
            .map(comment =>
              String(comment.userId)
            )
            .filter(Boolean)
        )
      ];

      const objectIds = userIds
        .map(id => safeObjectId(id))
        .filter(Boolean);

      const users =
        await usersCollection
          .find({
            _id: {
              $in: objectIds
            }
          })
          .project({
            passwordHash: 0
          })
          .toArray();

      const userMap = new Map();

      for (const user of users) {
        userMap.set(
          user._id.toString(),
          {
            id: user._id.toString(),
            username: user.username,
            avatar: user.avatar || null
          }
        );
      }

      const commentIds =
        comments.map(comment =>
          comment._id.toString()
        );

      const reactionRows =
        await commentReactionsCollection
          .find({
            commentId: {
              $in: commentIds
            }
          })
          .toArray();

      const reactionMap =
        new Map();

      for (const commentId of commentIds) {
        const rows =
          reactionRows.filter(
            row =>
              row.commentId === commentId
          );

        let likes = 0;
        let dislikes = 0;
        let userReaction = 0;

        for (const row of rows) {
          if (row.value === 1) {
            likes++;
          }

          if (row.value === -1) {
            dislikes++;
          }

          if (
            req.user &&
            row.userId === String(req.user.id)
          ) {
            userReaction = row.value;
          }
        }

        reactionMap.set(
          commentId,
          {
            likes,
            dislikes,
            userReaction
          }
        );
      }

      const formatted =
        comments.map(comment =>
          formatComment(
            comment,
            userMap,
            reactionMap
          )
        );

      res.json(formatted);
    } catch (error) {
      console.error(
        "Comments load error:",
        error
      );

      res.status(500).json({
        error: "Failed to load comments."
      });
    }
  }
);

/* =========================================================
   CREATE COMMENT / REPLY
========================================================= */

app.post(
  "/api/comments",
  requireAuth,
  async (req, res) => {
    if (!requireDatabase(res)) return;

    try {
      const videoId =
        String(req.body.videoId || "").trim();

      const text =
        cleanCommentText(req.body.text);

      const parentId =
        req.body.parentId
          ? String(req.body.parentId)
          : null;

      if (!videoId) {
        return res.status(400).json({
          error: "Video ID is required."
        });
      }

      if (!text) {
        return res.status(400).json({
          error: "Comment cannot be empty."
        });
      }

      if (text.length > 2000) {
        return res.status(400).json({
          error:
            "Comment must be 2000 characters or less."
        });
      }

      if (parentId) {
        const parentObjectId =
          safeObjectId(parentId);

        if (!parentObjectId) {
          return res.status(400).json({
            error: "Invalid reply."
          });
        }

        const parent =
          await commentsCollection.findOne({
            _id: parentObjectId
          });

        if (!parent) {
          return res.status(404).json({
            error: "Parent comment not found."
          });
        }

        if (parent.videoId !== videoId) {
          return res.status(400).json({
            error:
              "Reply must belong to the same video."
          });
        }
      }

      const userId =
        String(req.user.id);

      const userObjectId =
        safeObjectId(userId);

      const user =
        userObjectId
          ? await usersCollection.findOne(
              { _id: userObjectId },
              {
                projection: {
                  passwordHash: 0
                }
              }
            )
          : null;

      const comment = {
        videoId,

        userId,

        text,

        parentId,

        createdAt: new Date()
      };

      const result =
        await commentsCollection.insertOne(
          comment
        );

      comment._id =
        result.insertedId;

      res.status(201).json({
        id: comment._id.toString(),
        _id: comment._id.toString(),

        videoId,

        text,

        parentId,

        user: formatUser(user),

        username:
          user?.username ||
          req.user.username ||
          "Unknown",

        avatar:
          user?.avatar ||
          null,

        createdAt:
          comment.createdAt,

        likes: 0,
        dislikes: 0,

        likeCount: 0,
        dislikeCount: 0,

        userReaction: 0
      });
    } catch (error) {
      console.error(
        "Comment creation error:",
        error
      );

      res.status(500).json({
        error: "Failed to post comment."
      });
    }
  }
);

/* =========================================================
   COMMENT LIKE / DISLIKE
========================================================= */

app.post(
  "/api/comment-reaction",
  requireAuth,
  async (req, res) => {
    if (!requireDatabase(res)) return;

    try {
      const commentId =
        String(req.body.commentId || "").trim();

      const value =
        normalizeReaction(req.body.value);

      if (!commentId) {
        return res.status(400).json({
          error: "Comment ID is required."
        });
      }

      const objectId =
        safeObjectId(commentId);

      if (!objectId) {
        return res.status(400).json({
          error: "Invalid comment ID."
        });
      }

      const comment =
        await commentsCollection.findOne({
          _id: objectId
        });

      if (!comment) {
        return res.status(404).json({
          error: "Comment not found."
        });
      }

      const userId =
        String(req.user.id);

      const existing =
        await commentReactionsCollection.findOne({
          userId,
          commentId
        });

      if (value === 0) {
        if (existing) {
          await commentReactionsCollection.deleteOne({
            _id: existing._id
          });
        }
      } else {
        await commentReactionsCollection.updateOne(
          {
            userId,
            commentId
          },
          {
            $set: {
              userId,
              commentId,
              value,
              updatedAt: new Date()
            }
          },
          {
            upsert: true
          }
        );
      }

      const rows =
        await commentReactionsCollection
          .find({
            commentId
          })
          .toArray();

      let likes = 0;
      let dislikes = 0;
      let userReaction = 0;

      for (const row of rows) {
        if (row.value === 1) {
          likes++;
        }

        if (row.value === -1) {
          dislikes++;
        }

        if (row.userId === userId) {
          userReaction = row.value;
        }
      }

      res.json({
        success: true,

        likes,
        dislikes,

        likeCount: likes,
        dislikeCount: dislikes,

        userReaction
      });
    } catch (error) {
      console.error(
        "Comment reaction error:",
        error
      );

      res.status(500).json({
        error:
          "Failed to update comment reaction."
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
    if (!requireDatabase(res)) return;

    try {
      const emojis =
        await emojisCollection
          .find({})
          .sort({
            createdAt: 1
          })
          .limit(500)
          .toArray();

      res.json(
        emojis.map(emoji => ({
          id: emoji._id.toString(),
          name: emoji.name,
          emoji: emoji.emoji,
          image: emoji.image || null,
          createdAt: emoji.createdAt
        }))
      );
    } catch (error) {
      console.error(
        "Emoji load error:",
        error
      );

      res.status(500).json({
        error: "Failed to load emojis."
      });
    }
  }
);

app.post(
  "/api/emojis",
  requireAuth,
  async (req, res) => {
    if (!requireDatabase(res)) return;

    try {
      const name =
        String(req.body.name || "")
          .trim()
          .replace(/\s+/g, "_");

      const emoji =
        String(req.body.emoji || "")
        .trim();

      const image =
        req.body.image
          ? String(req.body.image)
          : null;

      if (!name) {
        return res.status(400).json({
          error: "Emoji name is required."
        });
      }

      if (!/^[a-zA-Z0-9_-]+$/.test(name)) {
        return res.status(400).json({
          error:
            "Emoji name can only contain letters, numbers, _ and -."
        });
      }

      if (name.length > 32) {
        return res.status(400).json({
          error:
            "Emoji name must be 32 characters or less."
        });
      }

      if (!emoji && !image) {
        return res.status(400).json({
          error:
            "Provide an emoji character or image."
        });
      }

      if (image && image.length > 2_000_000) {
        return res.status(400).json({
          error: "Emoji image is too large."
        });
      }

      const doc = {
        name,
        nameLower: name.toLowerCase(),
        emoji: emoji || null,
        image: image || null,
        creatorId: String(req.user.id),
        createdAt: new Date()
      };

      const result =
        await emojisCollection.insertOne(doc);

      res.status(201).json({
        id: result.insertedId.toString(),
        name: doc.name,
        emoji: doc.emoji,
        image: doc.image,
        createdAt: doc.createdAt
      });
    } catch (error) {
      if (error.code === 11000) {
        return res.status(409).json({
          error: "That emoji name already exists."
        });
      }

      console.error(
        "Emoji creation error:",
        error
      );

      res.status(500).json({
        error: "Failed to create emoji."
      });
    }
  }
);

/* =========================================================
   DELETE CUSTOM EMOJI
========================================================= */

app.delete(
  "/api/emojis/:id",
  requireAuth,
  async (req, res) => {
    if (!requireDatabase(res)) return;

    try {
      const emojiId =
        safeObjectId(req.params.id);

      if (!emojiId) {
        return res.status(400).json({
          error: "Invalid emoji ID."
        });
      }

      const emoji =
        await emojisCollection.findOne({
          _id: emojiId
        });

      if (!emoji) {
        return res.status(404).json({
          error: "Emoji not found."
        });
      }

      const creatorId =
        String(emoji.creatorId);

      if (
        creatorId !==
        String(req.user.id)
      ) {
        return res.status(403).json({
          error:
            "You can only delete emojis you created."
        });
      }

      await emojisCollection.deleteOne({
        _id: emojiId
      });

      res.json({
        success: true
      });
    } catch (error) {
      console.error(
        "Emoji deletion error:",
        error
      );

      res.status(500).json({
        error: "Failed to delete emoji."
      });
    }
  }
);

/* =========================================================
   HEALTH CHECK
========================================================= */

app.get("/api/health", (req, res) => {
  res.json({
    ok: true,
    database: !!db,
    youtube: !!YOUTUBE_API_KEY,
    uptime: process.uptime()
  });
});

/* =========================================================
   API 404
========================================================= */

app.use("/api", (req, res) => {
  res.status(404).json({
    error: "API endpoint not found."
  });
});

/* =========================================================
   GLOBAL ERROR HANDLER
========================================================= */

app.use((error, req, res, next) => {
  console.error("Server error:", error);

  if (res.headersSent) {
    return next(error);
  }

  res.status(500).json({
    error: "Internal server error."
  });
});

/* =========================================================
   FRONTEND FALLBACK
========================================================= */

app.get("*splat", (req, res) => {
  res.sendFile(
    path.join(__dirname, "public", "index.html")
  );
});

/* =========================================================
   START SERVER
========================================================= */

async function startServer() {
  await connectDatabase();

  app.listen(PORT, () => {
    console.log("");
    console.log("========================================");
    console.log("        PerfecTube Server");
    console.log("========================================");
    console.log(`🚀 Running on port ${PORT}`);
    console.log(
      `📁 Frontend: ${path.join(__dirname, "public")}`
    );
    console.log(
      `🍃 MongoDB: ${db ? "Connected" : "Not connected"}`
    );
    console.log(
      `▶️ YouTube API: ${
        YOUTUBE_API_KEY
          ? "Configured"
          : "Not configured"
      }`
    );
    console.log("========================================");
    console.log("");
  });
}

startServer().catch(error => {
  console.error(
    "❌ Failed to start PerfecTube:",
    error
  );

  process.exit(1);
});
