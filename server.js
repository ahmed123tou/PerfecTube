require("dotenv").config();

const path = require("path");
const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const multer = require("multer");
const { MongoClient, ObjectId } = require("mongodb");

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || "change-me";
const YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY || "";
const MONGODB_URI = process.env.MONGODB_URI || "";

app.use(express.json({ limit: "3mb" }));
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, "public")));

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 1024 * 1024 }
});

const CHANNELS = [
  { id: "UC_MIKE_OFF_RECORD", handle: "@MikeOffRecord", name: "Mike Off Record", type: "Comedy & Clips" },
  { id: "UC_ANAHEIMM", handle: "@Anaheimm", name: "Anaheimm", type: "Comedy & Clips" },
  { id: "UC_WAGS_WALKS", handle: "@Wags_and_Walks_Pup_Up", name: "Wags & Walks Pup Up", type: "Animals" },
  { id: "UC_ITS_BASEPLATE", handle: "@ItsBaseplate", name: "ItsBaseplate", type: "Gaming" },
  { id: "UC_FAJARE_SOKHARI", handle: "@Fajaresokhari", name: "Fajaresokhari", type: "Clips" },
  { id: "UC_CLIPSDONUT", handle: "@clipsdonut", name: "clipsdonut", type: "Clips" },
  { id: "UC_MR_STAN01", handle: "@Mr.Stan01", name: "Mr. Stan", type: "Clips" },
  { id: "UC_UNCDAVIN", handle: "@UncDavin", name: "Unc Davin", type: "Comedy & Clips" },
  { id: "UC_LAVABLOX01", handle: "@LavaBlox01", name: "LavaBlox01", type: "Gaming" },
  { id: "UC_BLOBBYCLIPS", handle: "@BlobbyClips", name: "BlobbyClips", type: "Clips" },
  { id: "UC_PYLAROXD", handle: "@pylaroXD", name: "pylaroXD", type: "Gaming" },
  { id: "UC_COPYMASTER11", handle: "@CopyMaster11", name: "CopyMaster11", type: "Clips" },
  { id: "UC_RENOVATEDPOTATO", handle: "@RenovatedPotato", name: "RenovatedPotato", type: "Comedy & Clips" },
  { id: "UC_ONLYMISALIGNED", handle: "@onlyMisaligned", name: "onlyMisaligned", type: "Clips" },
  { id: "UC_RIPPEDROBBY", handle: "@RippedRobby", name: "RippedRobby", type: "Comedy & Clips" },
  { id: "UC_PIXIESGARDEN", handle: "@PixiesGardenReal", name: "PixiesGardenReal", type: "Animals" }
];

// The handles above are intentionally kept as the source list.
// The API resolves each handle to a real channel ID at runtime.
const resolvedChannels = new Map();

let db;
let users;
let reactions;
let comments;

async function connectDB() {
  if (!MONGODB_URI) {
    console.warn("MONGODB_URI is missing. Accounts/comments/reactions will not work until MongoDB is configured.");
    return;
  }
  const client = new MongoClient(MONGODB_URI);
  await client.connect();
  db = client.db("perfectube");
  users = db.collection("users");
  reactions = db.collection("reactions");
  comments = db.collection("comments");
  await users.createIndex({ usernameLower: 1 }, { unique: true });
  await reactions.createIndex({ userId: 1, videoId: 1 }, { unique: true });
  await comments.createIndex({ videoId: 1, createdAt: -1 });
  console.log("MongoDB connected.");
}

function requireDB(res) {
  if (!db) {
    res.status(503).json({ error: "Online database is not configured yet. Add MONGODB_URI on the server." });
    return false;
  }
  return true;
}

function makeToken(user) {
  return jwt.sign({ id: String(user._id), username: user.username }, JWT_SECRET, { expiresIn: "30d" });
}

function auth(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: "Login required." });
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    return res.status(401).json({ error: "Your session expired. Please log in again." });
  }
}

async function youtube(pathname, params = {}) {
  if (!YOUTUBE_API_KEY) throw new Error("YOUTUBE_API_KEY is missing.");
  const url = new URL("https://www.googleapis.com/youtube/v3/" + pathname);
  url.searchParams.set("key", YOUTUBE_API_KEY);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  const response = await fetch(url);
  const data = await response.json();
  if (!response.ok) throw new Error(data?.error?.message || "YouTube API request failed.");
  return data;
}

async function resolveHandle(handle) {
  if (resolvedChannels.has(handle)) return resolvedChannels.get(handle);
  const data = await youtube("channels", {
    part: "id,snippet,contentDetails",
    forHandle: handle.replace(/^@/, "")
  });
  const item = data.items?.[0];
  if (!item) throw new Error(`Could not find ${handle}`);
  resolvedChannels.set(handle, item);
  return item;
}

async function getVideosForChannel(channel) {
  const real = await resolveHandle(channel.handle);
  const uploads = real.contentDetails.relatedPlaylists.uploads;
  const data = await youtube("playlistItems", {
    part: "snippet,contentDetails",
    playlistId: uploads,
    maxResults: "15"
  });

  return (data.items || []).map(item => ({
    id: item.contentDetails.videoId,
    title: item.snippet.title,
    description: item.snippet.description,
    publishedAt: item.snippet.publishedAt,
    channelId: real.id,
    channelName: real.snippet.title,
    channelHandle: channel.handle,
    channelAvatar: real.snippet.thumbnails?.default?.url || "",
    thumbnail: `https://i.ytimg.com/vi/${item.contentDetails.videoId}/hqdefault.jpg`,
    url: `https://www.youtube.com/watch?v=${item.contentDetails.videoId}`,
    sourceType: channel.type
  }));
}

app.get("/api/config", (req, res) => {
  res.json({
    name: "Perfectube",
    channels: CHANNELS,
    online: Boolean(MONGODB_URI),
    youtubeConfigured: Boolean(YOUTUBE_API_KEY)
  });
});

app.get("/api/videos", async (req, res) => {
  try {
    const wanted = req.query.type || "All";
    const selected = CHANNELS.filter(c => wanted === "All" || c.type === wanted);
    const groups = await Promise.all(selected.map(async c => {
      try { return await getVideosForChannel(c); }
      catch (e) {
        console.error(c.handle, e.message);
        return [];
      }
    }));
    const videos = groups.flat().sort((a, b) => new Date(b.publishedAt) - new Date(a.publishedAt));
    res.json({ videos });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get("/api/me", auth, async (req, res) => {
  if (!requireDB(res)) return;
  const user = await users.findOne(
    { _id: new ObjectId(req.user.id) },
    { projection: { passwordHash: 0 } }
  );
  if (!user) return res.status(404).json({ error: "User not found." });
  res.json({ user });
});

app.post("/api/signup", upload.single("avatar"), async (req, res) => {
  if (!requireDB(res)) return;
  const username = String(req.body.username || "").trim();
  const password = String(req.body.password || "");

  if (!/^[a-zA-Z0-9_]{3,24}$/.test(username)) {
    return res.status(400).json({ error: "Name must be 3-24 characters using letters, numbers or underscores." });
  }
  if (password.length < 6) return res.status(400).json({ error: "Password must be at least 6 characters." });

  const usernameLower = username.toLowerCase();
  if (await users.findOne({ usernameLower })) {
    return res.status(409).json({ error: "That name is already taken." });
  }

  const passwordHash = await bcrypt.hash(password, 12);
  let avatar = "";
  if (req.file) {
    avatar = `data:${req.file.mimetype};base64,${req.file.buffer.toString("base64")}`;
  }

  const user = {
    username,
    usernameLower,
    passwordHash,
    avatar,
    createdAt: new Date()
  };
  const result = await users.insertOne(user);
  user._id = result.insertedId;

  res.json({
    token: makeToken(user),
    user: { _id: user._id, username: user.username, avatar: user.avatar }
  });
});

app.post("/api/login", async (req, res) => {
  if (!requireDB(res)) return;
  const username = String(req.body.username || "").trim().toLowerCase();
  const password = String(req.body.password || "");
  const user = await users.findOne({ usernameLower: username });
  if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
    return res.status(401).json({ error: "Wrong name or password." });
  }
  res.json({
    token: makeToken(user),
    user: { _id: user._id, username: user.username, avatar: user.avatar }
  });
});

app.post("/api/reaction", auth, async (req, res) => {
  if (!requireDB(res)) return;
  const videoId = String(req.body.videoId || "");
  const reaction = String(req.body.reaction || "none");
  if (!videoId || !["like", "dislike", "none"].includes(reaction)) {
    return res.status(400).json({ error: "Invalid reaction." });
  }

  const filter = { userId: req.user.id, videoId };
  if (reaction === "none") {
    await reactions.deleteOne(filter);
  } else {
    await reactions.updateOne(
      filter,
      { $set: { userId: req.user.id, videoId, reaction, updatedAt: new Date() } },
      { upsert: true }
    );
  }

  const counts = await reactions.aggregate([
    { $match: { videoId } },
    { $group: { _id: "$reaction", count: { $sum: 1 } } }
  ]).toArray();

  const result = { like: 0, dislike: 0 };
  counts.forEach(x => result[x._id] = x.count);

  const mine = await reactions.findOne(filter);
  res.json({ ...result, mine: mine?.reaction || "none" });
});

app.get("/api/reactions/:videoId", async (req, res) => {
  if (!requireDB(res)) return;
  const videoId = req.params.videoId;
  const counts = await reactions.aggregate([
    { $match: { videoId } },
    { $group: { _id: "$reaction", count: { $sum: 1 } } }
  ]).toArray();

  const result = { like: 0, dislike: 0, mine: "none" };
  counts.forEach(x => result[x._id] = x.count);

  const header = req.headers.authorization || "";
  if (header.startsWith("Bearer ")) {
    try {
      const payload = jwt.verify(header.slice(7), JWT_SECRET);
      const mine = await reactions.findOne({ userId: payload.id, videoId });
      if (mine) result.mine = mine.reaction;
    } catch {}
  }
  res.json(result);
});

app.get("/api/comments/:videoId", async (req, res) => {
  if (!requireDB(res)) return;
  const rows = await comments.find({ videoId: req.params.videoId }).sort({ createdAt: -1 }).limit(100).toArray();
  res.json({
    comments: rows.map(c => ({
      id: String(c._id),
      username: c.username,
      avatar: c.avatar,
      text: c.text,
      createdAt: c.createdAt
    }))
  });
});

app.post("/api/comments", auth, async (req, res) => {
  if (!requireDB(res)) return;
  const videoId = String(req.body.videoId || "");
  const text = String(req.body.text || "").trim();
  if (!videoId || !text) return res.status(400).json({ error: "Comment cannot be empty." });
  if (text.length > 500) return res.status(400).json({ error: "Comment is too long (500 characters max)." });

  const user = await users.findOne({ _id: new ObjectId(req.user.id) });
  if (!user) return res.status(404).json({ error: "User not found." });

  const doc = {
    videoId,
    userId: req.user.id,
    username: user.username,
    avatar: user.avatar,
    text,
    createdAt: new Date()
  };
  const result = await comments.insertOne(doc);
  res.json({
    comment: {
      id: String(result.insertedId),
      username: doc.username,
      avatar: doc.avatar,
      text: doc.text,
      createdAt: doc.createdAt
    }
  });
});

app.get("*splat", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

connectDB().then(() => {
  app.listen(PORT, () => console.log(`Perfectube running on port ${PORT}`));
}).catch(err => {
  console.error("Database connection failed:", err);
  app.listen(PORT, () => console.log(`Perfectube running on port ${PORT} without database`));
});
