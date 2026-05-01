// Middleware to validate API key for protected routes
function validateApiKey(req, res, next) {
    const apiKey = req.headers['x-mojulo-api-key'];
    
    if (!apiKey) {
        return res.status(401).json({ 
            error: 'Unauthorized',
            message: 'API key required' 
        });
    }
    
    if (apiKey !== process.env.MOJULO_API_KEY) {
        return res.status(401).json({ 
            error: 'Unauthorized',
            message: 'Invalid API key' 
        });
    }
    
    // Validation passed
    next();
}

module.exports = { validateApiKey };
