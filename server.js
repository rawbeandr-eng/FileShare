const express = require('express');
const multer = require('multer');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const app = express();
const PORT = 3000;

// Simple CORS - allow everything for testing
app.use(cors());
app.use(express.json());

// Create uploads directory
const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

// File storage
const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadDir),
    filename: (req, file, cb) => {
        const uniqueName = Date.now() + '-' + Math.round(Math.random() * 1E9) + path.extname(file.originalname);
        cb(null, uniqueName);
    }
});

const upload = multer({ storage: storage });

// In-memory file storage (simpler than JSON file)
let files = [];

// Health check - SIMPLE AND FAST
app.get('/api/health', (req, res) => {
    console.log('Health check received');
    res.json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        files: files.length
    });
});

// Login - SIMPLE
app.post('/api/login', (req, res) => {
    const { username, password } = req.body;
    console.log('Login attempt:', username);

    if (username === 'abcd' && password === '1234') {
        const token = crypto.randomBytes(16).toString('hex');
        res.json({ success: true, token });
    } else {
        res.status(401).json({ error: 'Invalid credentials' });
    }
});

// Upload
app.post('/api/upload', upload.single('file'), (req, res) => {
    console.log('Upload request received');

    if (!req.file) {
        return res.status(400).json({ error: 'No file' });
    }

    const fileData = {
        id: Date.now() + '-' + Math.random().toString(36),
        name: req.file.originalname,
        size: req.file.size,
        path: req.file.filename,
        date: new Date().toISOString()
    };

    files.push(fileData);
    console.log('File uploaded:', fileData.name);
    res.json({ success: true, file: fileData });
});

// List files
app.get('/api/files', (req, res) => {
    console.log('File list requested');
    res.json({ files });
});

// Download
app.get('/api/download/:id', (req, res) => {
    const file = files.find(f => f.id === req.params.id);

    if (!file) {
        return res.status(404).json({ error: 'File not found' });
    }

    const filePath = path.join(uploadDir, file.path);

    if (!fs.existsSync(filePath)) {
        return res.status(404).json({ error: 'File missing' });
    }

    console.log('Downloading:', file.name);
    res.download(filePath, file.name);
});

// Delete
app.delete('/api/files/:id', (req, res) => {
    const index = files.findIndex(f => f.id === req.params.id);

    if (index === -1) {
        return res.status(404).json({ error: 'File not found' });
    }

    const file = files[index];
    const filePath = path.join(uploadDir, file.path);

    if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
    }

    files.splice(index, 1);
    console.log('File deleted:', file.name);
    res.json({ success: true });
});

// Start server
app.listen(PORT, () => {
    console.log('\n✅ Server running on http://localhost:' + PORT);
    console.log('📁 Upload directory:', uploadDir);
    console.log('\nWaiting for requests...\n');
});