const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const fs = require('fs-extra');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3333;

app.use(cors());
app.use(bodyParser.json());

const serverDataPath = path.join(__dirname, 'data.json');
const seedPath = path.join(__dirname, '..', 'assets', 'data', 'library.json');

function generateId() {
  return `${Date.now()}-${Math.floor(Math.random() * 10000)}`;
}

function loadTracks() {
  if (fs.existsSync(serverDataPath)) {
    try {
      const raw = fs.readFileSync(serverDataPath, 'utf8');
      return JSON.parse(raw);
    } catch (e) {
      console.error('Failed to read data.json, falling back to seed', e);
    }
  }

  // fallback to seed library.json
  if (fs.existsSync(seedPath)) {
    try {
      const raw = fs.readFileSync(seedPath, 'utf8');
      const arr = JSON.parse(raw);
      // ensure id
      const mapped = arr.map((t) => ({ id: generateId(), ...t }));
      fs.writeFileSync(serverDataPath, JSON.stringify(mapped, null, 2));
      return mapped;
    } catch (e) {
      console.error('Failed to load seed library.json', e);
    }
  }

  return [];
}

let tracks = loadTracks();
const videosDataPath = path.join(__dirname, 'videos.json');

function loadVideos() {
  if (fs.existsSync(videosDataPath)) {
    try {
      const raw = fs.readFileSync(videosDataPath, 'utf8');
      return JSON.parse(raw);
    } catch (e) {
      console.error('Failed to read videos.json', e);
    }
  }
  return [];
}

function saveVideos(videos) {
  try {
    fs.writeFileSync(videosDataPath, JSON.stringify(videos, null, 2));
  } catch (e) {
    console.error('Failed to save videos.json', e);
  }
}

let videos = loadVideos();

function saveTracks() {
  try {
    fs.writeFileSync(serverDataPath, JSON.stringify(tracks, null, 2));
  } catch (e) {
    console.error('Failed to save data.json', e);
  }
}

// GET /tracks
app.get('/tracks', (req, res) => {
  res.json(tracks);
});

// GET /tracks/:id
app.get('/tracks/:id', (req, res) => {
  const t = tracks.find((x) => x.id === req.params.id);
  if (!t) return res.status(404).json({ error: 'Not found' });
  res.json(t);
});

// POST /tracks
app.post('/tracks', (req, res) => {
  const { url, title, artist, artwork } = req.body;
  if (!url || !title) return res.status(400).json({ error: 'url and title are required' });
  const t = { id: generateId(), url, title, artist, artwork };
  tracks.push(t);
  saveTracks();
  res.status(201).json(t);
});

// DELETE /tracks/:id
app.delete('/tracks/:id', (req, res) => {
  const idx = tracks.findIndex((x) => x.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Not found' });
  const removed = tracks.splice(idx, 1)[0];
  saveTracks();
  res.json(removed);
});

// SEARCH /tracks/search?q=query
app.get('/tracks/search', (req, res) => {
  const query = req.query.q?.toLowerCase() || '';
  if (!query) return res.json([]);
  const filtered = tracks.filter(t => 
    t.title?.toLowerCase().includes(query) ||
    t.artist?.toLowerCase().includes(query) ||
    t.url?.toLowerCase().includes(query) ||
    (t.playlist && t.playlist.some(p => p.toLowerCase().includes(query)))
  );
  res.json(filtered);
});

// ========== VIDEO APIs ==========

// GET /videos
app.get('/videos', (req, res) => {
  res.json(videos);
});

// GET /videos/:id
app.get('/videos/:id', (req, res) => {
  const v = videos.find((x) => x.id === req.params.id);
  if (!v) return res.status(404).json({ error: 'Not found' });
  res.json(v);
});

// POST /videos
app.post('/videos', (req, res) => {
  const { url, title, thumbnail, duration, localUri } = req.body;
  if (!url && !localUri) return res.status(400).json({ error: 'url or localUri is required' });
  if (!title) return res.status(400).json({ error: 'title is required' });
  const v = { 
    id: generateId(), 
    url: url || null, 
    localUri: localUri || null,
    title, 
    thumbnail: thumbnail || null,
    duration: duration || null,
    createdAt: new Date().toISOString()
  };
  videos.push(v);
  saveVideos(videos);
  res.status(201).json(v);
});

// DELETE /videos/:id
app.delete('/videos/:id', (req, res) => {
  const idx = videos.findIndex((x) => x.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Not found' });
  const removed = videos.splice(idx, 1)[0];
  saveVideos(videos);
  res.json(removed);
});

// SEARCH /videos/search?q=query
app.get('/videos/search', (req, res) => {
  const query = req.query.q?.toLowerCase() || '';
  if (!query) return res.json([]);
  const filtered = videos.filter(v => 
    v.title?.toLowerCase().includes(query) ||
    v.url?.toLowerCase().includes(query)
  );
  res.json(filtered);
});

app.listen(PORT, () => console.log(`PlayMusic API listening on http://localhost:${PORT}`));
