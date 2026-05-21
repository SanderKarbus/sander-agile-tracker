const express = require('express');
const fs = require('fs');
const path = require('path');
const app = express();
const PORT = 3000;

const DATA_FILE = path.join(__dirname, 'data', 'stories.json');

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Abifunktsioonid andmete lugemiseks ja kirjutamiseks
function readData() {
  if (!fs.existsSync(DATA_FILE)) {
    // Algandmed (sinu juhendi näidised), et leht poleks alguses tühi
    const initialData = [
      {
        id: 1,
        title: "Kasutajana tahan lisada uue story, et saaksin tööülesande backlogi panna.",
        description: "Vormis saab sisestada andmeid.",
        createdAt: "2026-05-19 06:13",
        updatedAt: "2026-05-19 06:13",
        status: "todo",
        points: 3,
        priority: 1,
        acceptanceCriteria: ["Salvestamisel ilmub story Todo veergu."],
        comments: [],
        mockupUrl: ""
      },
      {
        id: 2,
        title: "Kasutajana tahan muuta story staatust, et näidata töö edenemist.",
        description: "Story liigub õige staatuse veergu.",
        createdAt: "2026-05-19 05:58",
        updatedAt: "2026-05-19 05:58",
        status: "doing",
        points: 5,
        priority: 2,
        acceptanceCriteria: ["Lubatud staatused: todo, doing, done."],
        comments: [],
        mockupUrl: ""
      }
    ];
    fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
    fs.writeFileSync(DATA_FILE, JSON.stringify(initialData, null, 2));
    return initialData;
  }
  return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
}

function writeData(data) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

// ─── REST API ENDPOINTID ─────────────────────────────────────────

// GET /api/stories - Küsi kaikki storyd
app.get('/api/stories', (req, res) => {
  const stories = readData();
  stories.sort((a, b) => (a.priority || 0) - (b.priority || 0));
  res.json(stories);
});

// GET /api/stories/:id - Küsi üks konkreetne story
app.get('/api/stories/:id', (req, res) => {
  const stories = readData();
  const story = stories.find(s => s.id === parseInt(req.params.id));
  if (!story) return res.status(404).json({ error: "Storyt ei leitud" });
  res.json(story);
});

// POST /api/stories - Lisa uus story (TÄIENDATUD: pildi link)
app.post('/api/stories', (req, res) => {
  const { title, description, points, acceptanceCriteria, mockupUrl } = req.body;
  
  // Punktide range valideerimine vastavalt juhendi nõuetele
  const parsedPoints = parseInt(points);
  if (isNaN(parsedPoints) || parsedPoints < 0) {
    return res.status(400).json({ error: "Punktid peavad olema mitunegatiivne täisarv!" });
  }
  if (!title || title.trim() === "") {
    return res.status(400).json({ error: "Pealkiri ei tohi olla tühi!" });
  }

  const stories = readData();
  const now = new Date().toISOString().replace('T', ' ').substring(0, 16);
  const newStory = {
    id: stories.length > 0 ? Math.max(...stories.map(s => s.id)) + 1 : 1,
    title,
    description: description || "",
    mockupUrl: mockupUrl || "",
    createdAt: now,
    updatedAt: now,
    status: "todo",
    points: parsedPoints,
    priority: Math.max(...stories.map(s => s.priority), 0) + 1,
    acceptanceCriteria: Array.isArray(acceptanceCriteria) ? acceptanceCriteria : [acceptanceCriteria || "Vastuvõtutingimus puudub"],
    comments: []
  };

  stories.push(newStory);
  writeData(stories);
  res.status(201).json(newStory);
});

// PUT /api/stories/:id - Muuda storyt (TÄIENDATUD: pildi link)
app.put('/api/stories/:id', (req, res) => {
  const stories = readData();
  const idx = stories.findIndex(s => s.id === parseInt(req.params.id));
  if (idx === -1) return res.status(404).json({ error: "Storyt ei leitud" });

  const parsedPoints = parseInt(req.body.points);
  if (isNaN(parsedPoints) || parsedPoints < 0) {
    return res.status(400).json({ error: "Punktid peavad olema mitunegatiivne täisarv!" });
  }

  const now = new Date().toISOString().replace('T', ' ').substring(0, 16);
  stories[idx] = {
    ...stories[idx],
    title: req.body.title || stories[idx].title,
    description: req.body.description || stories[idx].description,
    mockupUrl: req.body.mockupUrl !== undefined ? req.body.mockupUrl : stories[idx].mockupUrl,
    points: parsedPoints,
    status: req.body.status || stories[idx].status,
    acceptanceCriteria: req.body.acceptanceCriteria || stories[idx].acceptanceCriteria,
    updatedAt: now
  };

  writeData(stories);
  res.json(stories[idx]);
});

// DELETE /api/stories/:id - Kustuta story
app.delete('/api/stories/:id', (req, res) => {
  let stories = readData();
  const initialLength = stories.length;
  stories = stories.filter(s => s.id !== parseInt(req.params.id));
  
  if (stories.length === initialLength) {
    return res.status(404).json({ error: "Storyt ei leitud" });
  }

  writeData(stories);
  res.json({ success: true });
});

// PATCH /api/stories/:id/status - Muuda staatust (Drag-and-drop jaoks)
app.patch('/api/stories/:id/status', (req, res) => {
  const stories = readData();
  const story = stories.find(s => s.id === parseInt(req.params.id));
  if (!story) return res.status(404).json({ error: "Storyt ei leitud" });

  const { status } = req.body;
  if (!['todo', 'doing', 'done'].includes(status)) {
    return res.status(400).json({ error: "Vigane staatus" });
  }

  story.status = status;
  writeData(stories);
  res.json(story);
});

// PATCH /api/stories/reorder - Järjestuse muutmine backlogis
app.patch('/api/stories/reorder', (req, res) => {
  const { ids } = req.body;
  if (!Array.isArray(ids)) return res.status(400).json({ error: "Vigane sisend" });

  const stories = readData();
  
  stories.forEach(story => {
    const newIdx = ids.indexOf(story.id);
    if (newIdx !== -1) {
      story.priority = newIdx + 1;
    }
  });

  writeData(stories);
  res.json({ success: true });
});

// POST /api/stories/:id/comments - Kommentaari lisamine
app.post('/api/stories/:id/comments', (req, res) => {
  const { text } = req.body;
  if (!text || text.trim() === "") return res.status(400).json({ error: "Kommentaar ei tohi olla tühi" });

  const stories = readData();
  const story = stories.find(s => s.id === parseInt(req.params.id));
  if (!story) return res.status(404).json({ error: "Storyt ei leitud" });

  const now = new Date();
  const createdAt = now.toISOString().replace('T', ' ').substring(0, 16);

  const newComment = {
    id: story.comments.length > 0 ? Math.max(...story.comments.map(c => c.id)) + 1 : 1,
    text,
    createdAt
  };

  story.comments.push(newComment);
  writeData(stories);
  res.status(201).json(newComment);
});

// PUT /api/stories/:storyId/comments/:commentId - Kommentaari muutmine (BOONUS)
app.put('/api/stories/:storyId/comments/:commentId', (req, res) => {
  const { text } = req.body;
  if (!text || text.trim() === "") return res.status(400).json({ error: "Kommentaar ei tohi olla tühi" });

  const stories = readData();
  const story = stories.find(s => s.id === parseInt(req.params.storyId));
  if (!story) return res.status(404).json({ error: "Storyt ei leitud" });

  const comment = story.comments.find(c => c.id === parseInt(req.params.commentId));
  if (!comment) return res.status(404).json({ error: "Kommentaari ei leitud" });

  comment.text = text;
  writeData(stories);
  res.json(comment);
});

// DELETE /api/stories/:storyId/comments/:commentId - Kommentaari kustutamine (BOONUS)
app.delete('/api/stories/:storyId/comments/:commentId', (req, res) => {
  const stories = readData();
  const story = stories.find(s => s.id === parseInt(req.params.storyId));
  if (!story) return res.status(404).json({ error: "Storyt ei leitud" });

  const initialLength = story.comments.length;
  story.comments = story.comments.filter(c => c.id !== parseInt(req.params.commentId));

  if (story.comments.length === initialLength) {
    return res.status(404).json({ error: "Kommentaari ei leitud" });
  }

  writeData(stories);
  res.json({ success: true });
});

app.listen(PORT, () => {
  console.log(`Agile Tracker backend töötab pordil ${PORT}`);
});
