// config/cors.js
import cors from 'cors';

export const ALLOWED_ORIGINS = [
    'http://127.0.0.1:5500',
    'https://127.0.0.1:5500',
    'http://localhost:5500',
    'https://chatcha-cdo.netlify.app',
    'https://chatcdo.netlify.app',
    'https://chatcha-backend.onrender.com',
    // Fix: Added port 5501 matching your Error 400 origin
    'http://127.0.0.1:5501',
    'http://localhost:5501',
    'http://localhost:3000',
    'http://localhost:5173'
];

export const corsOptions = {
    origin: (origin, callback) => {
        // Allow requests with no origin (like mobile apps or curl requests)
        if (!origin) return callback(null, true);
        
        if (ALLOWED_ORIGINS.includes(origin) || 
            origin.startsWith('http://localhost') || 
            origin.includes('netlify.app') ||
            origin.includes('vercel.app')) { // Added Vercel for potential deployments
            callback(null, true);
        } else {
            console.warn('CORS blocked origin:', origin);
            callback(new Error('Not allowed by CORS'));
        }
    },
    allowedHeaders: ['Content-Type', 'Accept', 'Authorization', 'X-User-Email'],
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    credentials: true
};

export const corsHeaders = (req, res, next) => {
  res.header('Access-Control-Allow-Credentials', 'true');
  res.header('Cross-Origin-Opener-Policy', 'same-origin-allow-popups');
  res.header('Cross-Origin-Embedder-Policy', 'unsafe-none');
  res.header('X-Frame-Options', 'SAMEORIGIN');
  res.header('X-Content-Type-Options', 'nosniff');
  res.header('Referrer-Policy', 'strict-origin-when-cross-origin');
  next();
};