const jwt = require('jsonwebtoken');
const supabase = require('../config/supabase');

const protect = async (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer')) {
    return res.status(401).json({ error: 'Not authorized, no token' });
  }

  const token = authHeader.split(' ')[1];

  try {
    const jwtSecret = process.env.JWT_SECRET;
    if (!jwtSecret) {
      console.error('CRITICAL: JWT_SECRET environment variable is not set');
      return res.status(500).json({ error: 'Server configuration error' });
    }
    
    let decodedId = null;
    try {
      const decoded = jwt.verify(token, jwtSecret);
      decodedId = decoded.id;
    } catch (jwtErr) {
      return res.status(401).json({ error: 'Not authorized, token failed or expired' });
    }

    if (!decodedId) {
      return res.status(401).json({ error: 'Not authorized, invalid token payload' });
    }

    // Check if user still exists in DB
    const { data: user, error } = await supabase
      .from('users')
      .select('*')
      .eq('id', decodedId)
      .single();

    if (error || !user) {
      return res.status(401).json({ error: 'Not authorized, user not found' });
    }

    if (user.status && (user.status === 'blocked' || user.status === 'suspended')) {
      return res.status(403).json({ error: 'Your account has been suspended by the administrator.' });
    }

    // Never attach password hashes to req.user
    delete user.password;
    delete user.password_hash;

    req.user = user;
    next();
  } catch (error) {
    console.error('Auth middleware error:', error.message);
    return res.status(401).json({ error: 'Not authorized, token failed' });
  }
};

const admin = (req, res, next) => {
  const role = (req.user?.role || '').trim().toLowerCase();
  if (role === 'admin') {
    next();
  } else {
    res.status(403).json({ error: 'Not authorized as an admin' });
  }
};

const artisan = (req, res, next) => {
  const role = (req.user?.role || '').trim().toLowerCase();
  if (role === 'artisan' || role === 'admin') {
    next();
  } else {
    res.status(403).json({ error: 'Not authorized as an artisan' });
  }
};

const artisanOrAdmin = (req, res, next) => {
  const role = (req.user?.role || '').trim().toLowerCase();
  if (role === 'artisan' || role === 'admin') {
    next();
  } else {
    res.status(403).json({ error: 'Not authorized. Admin or Artisan access required.' });
  }
};

const artisanOnly = (req, res, next) => {
  const role = (req.user?.role || '').trim().toLowerCase();
  if (role === 'artisan') {
    next();
  } else {
    res.status(403).json({ error: 'Access denied. Only the related artisan can perform this action, not admin.' });
  }
};

const optionalProtect = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer')) {
    return next();
  }
  const token = authHeader.split(' ')[1];
  try {
    const jwtSecret = process.env.JWT_SECRET;
    if (!jwtSecret) return next();
    let decodedId = null;
    try {
      const decoded = jwt.verify(token, jwtSecret);
      decodedId = decoded.id;
    } catch (jwtErr) {
      return next();
    }
    if (!decodedId) return next();

    const { data: user } = await supabase.from('users').select('*').eq('id', decodedId).single();
    if (user && user.status !== 'blocked' && user.status !== 'suspended') {
      delete user.password;
      delete user.password_hash;
      req.user = user;
    }
  } catch {}
  next();
};

module.exports = { protect, admin, artisan, artisanOnly, artisanOrAdmin, optionalProtect };
