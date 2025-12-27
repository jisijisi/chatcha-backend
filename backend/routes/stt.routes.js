import express from 'express';
import multer from 'multer';
import * as sttController from '../controllers/sttController.js';

const router = express.Router();
const upload = multer({ dest: 'uploads/' });

// POST /stt/transcribe - accepts a single file field named 'file'
router.post('/transcribe', upload.single('file'), sttController.transcribe);

export default router;
