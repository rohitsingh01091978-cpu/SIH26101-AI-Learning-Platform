const jwt = require('jsonwebtoken');

// The algorithm is pinned on both sign and verify so a token can never be
// accepted under a different (e.g. "none") algorithm.
const ALGORITHM = 'HS256';

function signToken(user) {
  return jwt.sign({ sub: user.id, role: user.role }, process.env.JWT_SECRET, {
    algorithm: ALGORITHM,
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
  });
}

// Throws on a bad signature, expired token, or malformed token.
function verifyToken(token) {
  return jwt.verify(token, process.env.JWT_SECRET, { algorithms: [ALGORITHM] });
}

module.exports = { signToken, verifyToken };
