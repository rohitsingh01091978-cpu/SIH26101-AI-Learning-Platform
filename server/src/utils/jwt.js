const jwt = require('jsonwebtoken');

// The algorithm is pinned on both sign and verify so a token can never be
// accepted under a different (e.g. "none") algorithm.
const ALGORITHM = 'HS256';

function signToken(user) {
  // iatMs: issue time with millisecond precision (the standard `iat` claim is whole seconds), so a
  // password reset can tell sessions created just before it from sign-ins made right after it.
  return jwt.sign({ sub: user.id, role: user.role, iatMs: Date.now() }, process.env.JWT_SECRET, {
    algorithm: ALGORITHM,
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
  });
}

// Throws on a bad signature, expired token, or malformed token.
function verifyToken(token) {
  return jwt.verify(token, process.env.JWT_SECRET, { algorithms: [ALGORITHM] });
}

module.exports = { signToken, verifyToken };
