
import fetch from 'node-fetch';
import fs from 'fs';

async function testTTS() {
    try {
        const text = "Shoh-pao";
        console.log(`Testing TTS with text: "${text}"`);

        const response = await fetch('http://localhost:3000/tts/speak', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text })
        });

        if (!response.ok) {
            console.error("Error:", response.status, response.statusText);
            const errText = await response.text();
            console.error(errText);
            return;
        }

        const buffer = await response.arrayBuffer();
        console.log(`Received audio buffer: ${buffer.byteLength} bytes`);
        
        const contentType = response.headers.get('content-type');
        console.log(`Content-Type: ${contentType}`);

    } catch (error) {
        console.error("Failed:", error);
    }
}

testTTS();
