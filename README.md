# Perfectube

Perfectube is a YouTube-style website built around the channels you selected.

## What is included

- YouTube-style dark interface
- YouTube icon-style browser tab favicon
- Search
- Filters by video type
- Latest videos from the selected channels
- Embedded video player
- Open-on-YouTube button
- Sign up with name + password + optional profile picture
- Log in / log out
- Online MongoDB account storage
- Likes and dislikes
- Shared online comments
- Built-in Perfectube emoji collection
- Responsive desktop/mobile layout

## Important

The website does **not** scrape YouTube. It uses the official YouTube Data API v3 to retrieve public channel/video information.

You need two server-side environment variables before the video feed works:

- `YOUTUBE_API_KEY`
- `MONGODB_URI`

You also need:

- `JWT_SECRET`

## Local setup

1. Install Node.js 18+.
2. Run:

```bash
npm install
```

3. Copy `.env.example` to `.env`.
4. Fill in the variables.
5. Run:

```bash
npm start
```

6. Open `http://localhost:3000`.

## GitHub + online deployment

Push this folder to a GitHub repository.

Deploy the repository as a Node web service on a host such as Render.

Set these environment variables in the deployment dashboard:

```text
MONGODB_URI=...
YOUTUBE_API_KEY=...
JWT_SECRET=...
```

The server already serves the `public` folder, so you do not need a separate frontend deployment.

## MongoDB

Create a MongoDB Atlas database and copy its connection string into `MONGODB_URI`.

The app creates these collections automatically:

- users
- reactions
- comments

## YouTube API

Create a Google Cloud project, enable **YouTube Data API v3**, create an API key, and put it in `YOUTUBE_API_KEY`.

The server resolves the channel handles in `server.js`, then reads each channel's uploads playlist.

## Changing the channels

Open `server.js` and edit the `CHANNELS` array.

Each entry has:

- `handle`
- `name`
- `type`

The handle should be the channel handle such as `@ExampleChannel`.

## Notes about Shorts

The supplied channels are treated as the source list. The app reads their newest public uploads. YouTube's API does not provide a simple "only Shorts" switch for playlist uploads, so a production version can add duration-based filtering (Shorts are normally <= 60 seconds) if you want the feed to contain only Shorts.
