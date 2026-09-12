# Music Assistant Web

A simple and modern web interface for Music Assistant.

The goal is to provide an easy-to-use interface for music, radio, favorites,
playlists and Music Assistant players without exposing the complexity of the
full Music Assistant interface.

## Architecture

```text
Browser
   |
   | HTTP
   v
Frontend (React / Vite / TypeScript)
   |
   | /api
   v
Backend (Express / TypeScript)
   |
   | Music Assistant API
   v
Music Assistant
```

The Music Assistant token is only used by the backend and must never be exposed
to the browser.

## Requirements

- Git
- Node.js 22
- npm
- Network access to the Music Assistant server
- A Music Assistant API token

The repository contains a `.nvmrc` file, so with `nvm` you can select the
intended Node.js major version with:

```bash
nvm use
```

Both frontend and backend also declare Node.js 22 in their `package.json`
`engines` field.

## Development setup on a new computer

Clone the repository:

```bash
git clone https://github.com/unilsson/music-assistant-web.git
cd music-assistant-web
```

Create the local environment file. Never commit the real token:

```bash
cp .env.example .env
```

Edit `.env` and set at least:

```dotenv
HOST=127.0.0.1
PORT=3001
MUSIC_ASSISTANT_URL=http://your-music-assistant-host:8095
MUSIC_ASSISTANT_TOKEN=your-token
```

Install the backend dependencies exactly as locked:

```bash
cd backend
npm ci
```

Install the frontend dependencies exactly as locked:

```bash
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

## Dependency reproducibility

Both `backend/package-lock.json` and `frontend/package-lock.json` are committed
to the repository. Use `npm ci` rather than `npm install` when setting up an
existing checkout so the installed dependency tree matches the committed lock
files.

When dependencies are intentionally changed, run `npm install` in the affected
subdirectory and commit both `package.json` and the updated `package-lock.json`.

## Local files and secrets

The real `.env` file is intentionally ignored by Git and must be copied or
re-created on each development machine. Build output, `node_modules`, editor
files and other temporary/local files are also excluded through `.gitignore`.

Browser preferences such as selected player, selected Music/Radio view and
selected radio genre are stored in browser `localStorage`. They are not project
data and do not need to be copied between development machines.

## Build

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
