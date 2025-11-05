# PlayMusic Local API

This is a tiny Express API shipped inside the workspace for local development.

Available endpoints (default port 3333):
- GET  /tracks         — list all tracks
- GET  /tracks/:id     — get a single track
- POST /tracks         — create a track ({ url, title, artist?, artwork? })
- DELETE /tracks/:id   — delete a track

Data persistence
- The server persists data to `server/data.json`.
- On first run, if `server/data.json` doesn't exist the server will try to seed data from `assets/data/library.json`.

Run

Open a terminal in the `server/` folder and run:

```powershell
npm install
npm start
```

Notes
- The server uses CORS so you can call it from the Expo app on the same machine (use your computer IP instead of localhost when testing on a physical device).
- This is a simple development server and not meant for production.
