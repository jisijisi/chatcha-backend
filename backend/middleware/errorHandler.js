// middleware/errorHandler.js
export const errorHandler = (err, req, res, next) => {
    console.error('Unhandled error:', err);
    res.status(500).json({ 
        error: 'Internal server error',
        message: process.env.NODE_ENV === 'production' ? 'Something went wrong' : err.message
    });
};

// 404 handler
export const notFoundHandler = (req, res) => {
    res.status(404).json({ error: 'Endpoint not found' });
};