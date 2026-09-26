const ApiError = require('../utils/ApiError');
const prisma = require('../utils/prisma');
const { verifyToken } = require('../utils/jwt');
const { isBlockedDemoUser } = require('../utils/demoAccounts');

const authenticate = async (req, res, next) => {
  try {
    const header = req.headers.authorization || '';
    const match = /^Bearer\s+(\S+)$/i.exec(header);
    const token = match ? match[1] : null;

    if (!token) {
      throw new ApiError(401, 'Authentication token missing.');
    }

    let payload;
    try {
      payload = verifyToken(token);
    } catch (err) {
      throw new ApiError(401, 'Invalid or expired token.');
    }

    if (typeof payload.sub !== 'string') {
      throw new ApiError(401, 'Invalid or expired token.');
    }

    const user = await prisma.user.findUnique({ where: { id: payload.sub } });
    if (!user) {
      throw new ApiError(401, 'User account no longer exists.');
    }

    // Demo accounts switched off (production default): sessions issued earlier stop working too.
    if (isBlockedDemoUser(user)) {
      throw new ApiError(401, 'Invalid or expired token.');
    }

    // A password reset invalidates every session issued before it. Tokens carry a millisecond issue time
    // (iatMs); older tokens without it fall back to `iat` (whole seconds, which errs on the side of rejecting).
    if (user.passwordChangedAt) {
      const issuedMs = typeof payload.iatMs === 'number' ? payload.iatMs : payload.iat * 1000;
      if (issuedMs < user.passwordChangedAt.getTime()) {
        throw new ApiError(401, 'Invalid or expired token.');
      }
    }

    req.user = { id: user.id, email: user.email, role: user.role, name: user.name };
    req.tokenIssuedAt = payload.iat; // seconds; lets sensitive actions require a recent sign-in
    next();
  } catch (err) {
    next(err);
  }
};

const requireRole = (...roles) => (req, res, next) => {
  if (!req.user || !roles.includes(req.user.role)) {
    return next(new ApiError(403, 'You do not have permission to access this resource.'));
  }
  next();
};

module.exports = { authenticate, requireRole };
