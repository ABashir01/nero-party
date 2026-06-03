# Nero Party

Nero Party is a realtime listening party app. One person hosts a room, everyone joins from an invite link, the room listens to the same YouTube track together, guests rate each song privately, and the app reveals the winning song when the party ends.

## Video Link
https://www.loom.com/share/b7985069aea84a0cbdacbef1aec7915a

## Stack

- Frontend: React + Vite
- Backend: Express + Socket.IO
- Database: Prisma + SQLite
- Search and metadata: YouTube Data API v3
- Playback: YouTube IFrame Player API

## Run locally

### 1. Install dependencies

```powershell
npm install
```

### 2. Create the environment file

```powershell
Copy-Item .env.example .env
```

Your backend reads the root `.env` file from this repository.

### 3. Create a YouTube Data API key

1. Go to the [Google Cloud Console](https://console.cloud.google.com/).
2. Create a project or select an existing one.
3. Enable `YouTube Data API v3`.
4. Create an API key.
5. Restrict the key to `YouTube Data API v3`.

For local development, leave the application restriction as `None`. The app sends YouTube Data API requests from the backend, so you do not want an HTTP referrer restriction for this key.

### 4. Fill in `.env`

```env
PORT=3000
FRONTEND_ORIGIN=http://localhost:5173
YOUTUBE_API_KEY=your_key_here
```

The YouTube Data API key is used for search and metadata. The embedded YouTube player does not need a separate key.

### 5. Set up the database

```powershell
Set-Location backend
npx prisma migrate dev
Set-Location ..
```

### 6. Start the app

```powershell
npm run dev
```

That starts:

- Frontend: `http://localhost:5173`
- Backend: `http://localhost:3000`

If you change `.env`, restart the backend so the new values are loaded.

## Project structure

```text
nero-party/
|-- backend/
|   |-- prisma/
|   `-- src/
|-- frontend/
|   `-- src/
`-- README.md
```
