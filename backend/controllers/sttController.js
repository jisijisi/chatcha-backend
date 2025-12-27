import fs from 'fs';

export async function transcribe(req, res) {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No audio file uploaded' });
    }

    // Currently this is a placeholder endpoint. The file is saved by multer
    // to a temporary location (req.file.path). Integrate a cloud STT provider
    // (OpenAI/Whisper, Google Speech-to-Text, etc.) here to perform real
    // transcription and return the text. For now we delete the uploaded
    // file and return an informational response so the frontend flow works.

    // Schedule deletion of uploaded file
    fs.unlink(req.file.path, (err) => {
      if (err) console.warn('Failed to delete uploaded audio:', err);
    });

    return res.json({ transcript: null, message: 'Audio received. Configure STT provider to transcribe.' });
  } catch (err) {
    console.error('STT transcribe error:', err);
    return res.status(500).json({ error: 'Server error processing audio' });
  }
}
