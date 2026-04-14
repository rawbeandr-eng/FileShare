const express = require('express');
const multer = require('multer');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');

const app = express();
const PORT = process.env.PORT || 3000;

// CORS - Allow GitHub Pages and local development
app.use(cors({
    origin: [
        'https://rawbeandr-eng.github.io',
        'http://localhost:3000',
        'http://127.0.0.1:5500',
        'http://localhost:5500',
        'https://*.trycloudflare.com'  // Allow any trycloudflare subdomain
    ],
    credentials: true
}));

app.use(express.json());

// Create uploads directory
const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
    console.log('✅ Created uploads directory:', uploadDir);
}

// File storage configuration
const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadDir),
    filename: (req, file, cb) => {
        const uniqueName = `${Date.now()}-${crypto.randomBytes(8).toString('hex')}${path.extname(file.originalname)}`;
        cb(null, uniqueName);
    }
});

const upload = multer({
    storage: storage,
    limits: { fileSize: 100 * 1024 * 1024 } // 100MB
});

// File metadata storage
const metadataFile = path.join(__dirname, 'files-metadata.json');
let fileMetadata = [];

if (fs.existsSync(metadataFile)) {
    try {
        fileMetadata = JSON.parse(fs.readFileSync(metadataFile, 'utf8'));
        console.log(`📁 Loaded ${fileMetadata.length} existing files`);
    } catch (e) {
        console.error('Error loading metadata:', e);
    }
}

function saveMetadata() {
    fs.writeFileSync(metadataFile, JSON.stringify(fileMetadata, null, 2));
}

// Health check - FIXED VERSION
app.get('/api/health', (req, res) => {
    console.log('🏥 Health check requested');
    res.status(200).json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        files: fileMetadata.length,
        server: 'FileShare Server',
        version: '1.0.0'
    });
});

// Login endpoint
app.post('/api/login', (req, res) => {
    const { username, password } = req.body;
    console.log(`🔐 Login attempt for user: ${username}`);

    if (username === 'abcd' && password === '1234') {
        const token = crypto.randomBytes(32).toString('hex');
        console.log('✅ Login successful');
        res.json({ success: true, token });
    } else {
        console.log('❌ Login failed');
        res.status(401).json({ error: 'Invalid credentials' });
    }
});

// Upload file
app.post('/api/upload', upload.single('file'), (req, res) => {
    console.log('📤 Upload request received');

    if (!req.file) {
        console.log('❌ No file in request');
        return res.status(400).json({ error: 'No file uploaded' });
    }

    const fileData = {
        id: uuidv4(),
        name: req.file.originalname,
        size: req.file.size,
        type: req.file.mimetype,
        path: req.file.filename,
        date: new Date().toISOString()
    };

    fileMetadata.push(fileData);
    saveMetadata();

    console.log(`✅ File uploaded: ${fileData.name} (${fileData.size} bytes)`);
    res.json({ success: true, file: fileData });
});

// Get files
app.get('/api/files', (req, res) => {
    console.log(`📋 File list requested (${fileMetadata.length} files)`);
    res.json({ files: fileMetadata });
});

// Download file
app.get('/api/download/:id', (req, res) => {
    const file = fileMetadata.find(f => f.id === req.params.id);

    if (!file) {
        console.log(`❌ File not found: ${req.params.id}`);
        return res.status(404).json({ error: 'File not found' });
    }

    const filePath = path.join(uploadDir, file.path);

    if (!fs.existsSync(filePath)) {
        console.log(`❌ File missing from disk: ${filePath}`);
        return res.status(404).json({ error: 'File not found on disk' });
    }

    console.log(`⬇️ Downloading: ${file.name}`);
    res.download(filePath, file.name);
});

// Delete file
app.delete('/api/files/:id', (req, res) => {
    const fileIndex = fileMetadata.findIndex(f => f.id === req.params.id);

    if (fileIndex === -1) {
        console.log(`❌ File not found for deletion: ${req.params.id}`);
        return res.status(404).json({ error: 'File not found' });
    }

    const file = fileMetadata[fileIndex];
    const filePath = path.join(uploadDir, file.path);

    if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
        console.log(`🗑️ Deleted file: ${file.name}`);
    }

    fileMetadata.splice(fileIndex, 1);
    saveMetadata();

    res.json({ success: true });
});

// Start server
app.listen(PORT, () => {
    console.log(`
╔══════════════════════════════════════════════════════════╗
║                                                          ║
║         🚀 FileShare Server is Running!                  ║
║                                                          ║
║         📍 Local:    http://localhost:${PORT}                ║
║         📁 Uploads:  ${uploadDir}
║         📊 Files:    ${fileMetadata.length} files stored
║                                                          ║
║         Press Ctrl+C to stop the server                  ║
║                                                          ║
╚══════════════════════════════════════════════════════════╝
    `);
});