const express = require('express');
const multer = require('multer');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;

// Enable CORS for your GitHub Pages domain
app.use(cors({
    origin: ['https://rawbeandr-eng.github.io', 'http://localhost:3000'],
    credentials: true
}));

app.use(express.json());

// Ensure uploads directory exists
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
}

// Configure multer for file uploads
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, uploadsDir);
    },
    filename: (req, file, cb) => {
        // Generate unique filename while preserving original name in metadata
        const uniqueId = crypto.randomBytes(16).toString('hex');
        const ext = path.extname(file.originalname);
        cb(null, `${uniqueId}${ext}`);
    }
});

const upload = multer({
    storage: storage,
    limits: { fileSize: 100 * 1024 * 1024 }, // 100MB limit
    fileFilter: (req, file, cb) => {
        // Accept all file types
        cb(null, true);
    }
});

// In-memory user store (use proper DB in production)
const VALID_USERNAME = 'abcd';
const VALID_PASSWORD = '1234';

// File metadata store (use proper DB in production)
let fileDatabase = [];

// Load existing files on startup
const metadataPath = path.join(__dirname, 'metadata.json');
if (fs.existsSync(metadataPath)) {
    try {
        fileDatabase = JSON.parse(fs.readFileSync(metadataPath, 'utf8'));
    } catch (e) {
        console.error('Error loading metadata:', e);
    }
}

function saveMetadata() {
    fs.writeFileSync(metadataPath, JSON.stringify(fileDatabase, null, 2));
}

// Authentication middleware
function authMiddleware(req, res, next) {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
        return res.status(401).json({ error: 'No authorization header' });
    }

    const credentials = Buffer.from(authHeader.split(' ')[1], 'base64').toString();
    const [username, password] = credentials.split(':');

    if (username === VALID_USERNAME && password === VALID_PASSWORD) {
        next();
    } else {
        res.status(401).json({ error: 'Invalid credentials' });
    }
}

// Login endpoint (returns token)
app.post('/api/login', (req, res) => {
    const { username, password } = req.body;

    if (username === VALID_USERNAME && password === VALID_PASSWORD) {
        // In production, use JWT or session tokens
        res.json({
            success: true,
            token: Buffer.from(`${username}:${password}`).toString('base64')
        });
    } else {
        res.status(401).json({ success: false, error: 'Invalid credentials' });
    }
});

// Upload endpoint
app.post('/api/upload', authMiddleware, upload.single('file'), (req, res) => {
    if (!req.file) {
        return res.status(400).json({ error: 'No file uploaded' });
    }

    const fileData = {
        id: crypto.randomBytes(16).toString('hex'),
        originalName: req.file.originalname,
        storedName: req.file.filename,
        size: req.file.size,
        mimetype: req.file.mimetype,
        uploadDate: new Date().toISOString(),
        path: req.file.path
    };

    fileDatabase.push(fileData);
    saveMetadata();

    res.json({
        success: true,
        file: {
            id: fileData.id,
            name: fileData.originalName,
            size: fileData.size,
            date: fileData.uploadDate
        }
    });
});

// List files endpoint
app.get('/api/files', authMiddleware, (req, res) => {
    const files = fileDatabase.map(f => ({
        id: f.id,
        name: f.originalName,
        size: f.size,
        date: f.uploadDate,
        type: f.mimetype
    })).sort((a, b) => new Date(b.date) - new Date(a.date));

    res.json({ files });
});

// Download endpoint
app.get('/api/download/:id', authMiddleware, (req, res) => {
    const file = fileDatabase.find(f => f.id === req.params.id);

    if (!file) {
        return res.status(404).json({ error: 'File not found' });
    }

    // Check if file exists
    if (!fs.existsSync(file.path)) {
        return res.status(404).json({ error: 'File not found on server' });
    }

    // Set headers for download
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(file.originalName)}"`);
    res.setHeader('Content-Type', file.mimetype || 'application/octet-stream');
    res.setHeader('Content-Length', file.size);

    // Stream file to client
    const fileStream = fs.createReadStream(file.path);
    fileStream.pipe(res);

    fileStream.on('error', (err) => {
        console.error('Stream error:', err);
        res.status(500).json({ error: 'Error streaming file' });
    });
});

// Delete endpoint
app.delete('/api/files/:id', authMiddleware, (req, res) => {
    const index = fileDatabase.findIndex(f => f.id === req.params.id);

    if (index === -1) {
        return res.status(404).json({ error: 'File not found' });
    }

    const file = fileDatabase[index];

    // Delete physical file
    if (fs.existsSync(file.path)) {
        fs.unlinkSync(file.path);
    }

    // Remove from database
    fileDatabase.splice(index, 1);
    saveMetadata();

    res.json({ success: true });
});

// Health check
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', uptime: process.uptime() });
});

// Cleanup old files periodically (optional)
setInterval(() => {
    const maxAge = 7 * 24 * 60 * 60 * 1000; // 7 days
    const now = Date.now();

    fileDatabase = fileDatabase.filter(file => {
        const fileAge = now - new Date(file.uploadDate).getTime();
        if (fileAge > maxAge) {
            if (fs.existsSync(file.path)) {
                fs.unlinkSync(file.path);
                console.log(`Cleaned up old file: ${file.originalName}`);
            }
            return false;
        }
        return true;
    });

    saveMetadata();
}, 60 * 60 * 1000); // Check every hour

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    console.log(`Upload directory: ${uploadsDir}`);
});