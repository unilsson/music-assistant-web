# Music Assistant Web

A simple and modern web interface for Music Assistant.

The goal is to provide an easy-to-use interface for music, radio, favorites,
playlists and Music Assistant players without exposing the complexity of the
full Music Assistant interface.

## Roadmap

Planned features, product ideas and design principles are collected in
[`ROADMAP.md`](ROADMAP.md).

## Architecture

The production Docker image contains both the built React frontend and the
Express backend:

```text
Browser
   |
   | HTTP
   v
Music Assistant Web container
   |
   +-- Express /api/*
   +-- built React/Vite frontend
   |
   | Music Assistant API
   v
Music Assistant
```

The Music Assistant token is only used by the backend and must never be exposed
to the browser.

## Recommended setup: Docker Compose

Requirements:

- Git
- Docker Engine
- Docker Compose plugin
- Network access from the Docker host to Music Assistant
- A Music Assistant API token

Clone the repository:

```bash
git clone https://github.com/unilsson/music-assistant-web.git
cd music-assistant-web
```

Create the local environment file:

```bash
cp .env.example .env
```

Edit `.env` and set at least:

```dotenv
WEB_PORT=3001
MUSIC_ASSISTANT_URL=http://your-music-assistant-host:8095
MUSIC_ASSISTANT_TOKEN=your-token
```

Do not commit the real token.

Build and start the application:

```bash
docker compose up -d --build
```

Check container state:

```bash
docker compose ps
```

Follow logs:

```bash
docker compose logs -f
```

The application is then available on:

```text
http://docker-host:3001
```

Change `WEB_PORT` in `.env` if another host port is preferred. The container
always listens on port 3001 internally.

The container includes a Docker health check against `/api/health`.

### Updating a local or homelab deployment

For the normal Git-based workflow:

```bash
git pull
docker compose up -d --build
```

Docker rebuilds the frontend and backend and replaces the running container.
This is also the intended simple deployment model for a homelab host.

## Native development without Docker

Node.js 22 is used by both the frontend and backend. The repository contains a
`.nvmrc` file:

```bash
nvm use
```

Install dependencies exactly as locked:

```bash
cd backend
npm ci
cd ../frontend
npm ci
```

Start the backend in one terminal:

```bash
cd backend
npm run dev
```

Start the frontend in another terminal:

```bash
cd frontend
npm run dev
```

The Vite development server proxies `/api` requests to the backend.

## Production image

The root `Dockerfile` is a multi-stage build:

1. Node 22 builds the Vite frontend.
2. Node 22 compiles the Express/TypeScript backend.
3. The runtime image installs backend production dependencies only.
4. Express serves both `/api/*` and the built frontend.

No Music Assistant token or other `.env` value is copied into the image.

## Dependency reproducibility

Both `backend/package-lock.json` and `frontend/package-lock.json` are committed
to the repository. Docker and native development both use `npm ci`.

When dependencies are intentionally changed, run `npm install` in the affected
subdirectory and commit both `package.json` and the updated
`package-lock.json`.

## Local files and secrets

The real `.env` file is intentionally ignored by Git and Docker build context.
Build output, `node_modules`, editor files and other temporary/local files are
also excluded.

Browser preferences such as selected player, selected Music/Radio view and
selected radio genre are stored in browser `localStorage`. They are not project
data and do not need to be copied between development machines.

Local Docker Compose override files such as `compose.override.yml` are ignored,
so machine-specific deployment changes can remain local.

## Build without Docker

Backend:

```bash
cd backend
npm run build
```

Frontend:

```bash
cd frontend
npm run build
```


## Podcasts – Sprint 1

The **Podcasts** tab uses the podcast library already configured in Music Assistant.
No separate podcast server, RSS parser, API key or additional container is needed.

1. In Music Assistant (`http://YOUR_MA_SERVER:8095`), configure a podcast music source such as iTunes Podcast Search.
2. Add podcasts to the Music Assistant library.
3. In Music Assistant Web, choose **Podcasts**, select a show, and click **Play** on an episode.
4. The selected Music Assistant player is shared with Music and Radio.
5. Shows are presented as artwork cards, with episodes loaded in pages of 50 using **Visa fler avsnitt**.

Playback always uses an episode returned by Music Assistant for the selected library podcast. The backend checks that the episode belongs to the displayed podcast page before forwarding playback to Music Assistant. The existing Music Assistant access token remains backend-only.

The first sprint is intentionally limited to **library browsing, episode listing, playback and pause**. Podcast search/subscription management, dedicated podcast seeking and listening-progress displays are follow-up sprints.

### Testing the sprint on ThinkPad (production checkout)

The existing deployment is located at `~/Production/music-assistant-web`, not `~/docker`.
**Before a production merge**, test the feature branch in that checkout:

```bash
ssh thinkpad
cd ~/Production/music-assistant-web
git status -sb                      # ensure local edits are committed/safe
git fetch origin
git switch sprint-podcast-1
git pull --ff-only origin sprint-podcast-1
docker compose up -d --build
docker compose ps
curl -fsS http://localhost:3001/api/health
curl -fsS http://localhost:3001/api/podcasts
```

If `WEB_PORT` in the local `.env` is different from 3001, use that port for the curl commands.
Opening the application in a browser and playing an episode verifies the complete path to Music Assistant.

The local `.env` is intentionally ignored by Git. **Do not delete or commit it.**

To return to the current production main branch:

```bash
cd ~/Production/music-assistant-web
git switch main
git pull --ff-only origin main
docker compose up -d --build
```

Check `git status -sb` first and do not use `git reset --hard` on this deployment.
