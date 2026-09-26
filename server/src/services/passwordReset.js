const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const prisma = require('../utils/prisma');
const ApiError = require('../utils/ApiError');
const { intEnv } = require('../ai/config');
const { isEmailConfigured, sendEmail } = require('../email');
const templates = require('../email/templates');
const { frontendBaseUrl } = require('../auth/googleOAuth');
const { isDemoEmail } = require('../utils/demoAccounts');

/**
 * Password reset.
 *  - The raw token is 256 random bits and exists ONLY inside the emailed link. The database keeps its
 *    SHA-256 hash, so a database leak cannot be used to reset anyone's password.
 *  - Tokens expire (PASSWORD_RESET_TTL_MINUTES, default 30) and work once.
 *  - A newer request supersedes older unused tokens; at most PASSWORD_RESET_MAX_PER_HOUR (default 3)
 *    are issued per account per hour.
 *  - Redeeming sets the new bcrypt-hashed password and passwordChangedAt, which makes every JWT issued
 *    before that moment invalid (see middleware/auth.js).
 */

const ttlMs = () => intEnv('PASSWORD_RESET_TTL_MINUTES', 30, { min: 5, max: 1440 }) * 60 * 1000;
const maxPerHour = () => intEnv('PASSWORD_RESET_MAX_PER_HOUR', 3, { min: 1, max: 20 });
const SALT_ROUNDS = () => Number(process.env.BCRYPT_SALT_ROUNDS || 10);

const hashToken = (token) => crypto.createHash('sha256').update(token).digest('hex');

/** True only when a real email provider AND a frontend URL for the link are configured. */
const isPasswordResetAvailable = () => isEmailConfigured() && Boolean(frontendBaseUrl());

const invalidToken = () =>
  new ApiError(400, 'This reset link is invalid or has expired. Please request a new one.', null, 'INVALID_RESET_TOKEN');

/** Creates a token for the user. Returns the RAW token (to be emailed), or null if rate-capped. */
async function issueResetToken(userId) {
  const now = Date.now();

  // Housekeeping: drop tokens that are long dead (nothing depends on them).
  await prisma.passwordResetToken.deleteMany({ where: { createdAt: { lt: new Date(now - 7 * 24 * 60 * 60 * 1000) } } });

  const recent = await prisma.passwordResetToken.count({ where: { userId, createdAt: { gte: new Date(now - 60 * 60 * 1000) } } });
  if (recent >= maxPerHour()) return null;

  // Older unused tokens stop working the moment a new one is issued (kept, not deleted, so the hourly cap still counts them).
  await prisma.passwordResetToken.updateMany({ where: { userId, usedAt: null }, data: { usedAt: new Date(now) } });

  const token = crypto.randomBytes(32).toString('base64url');
  await prisma.passwordResetToken.create({
    data: { userId, tokenHash: hashToken(token), expiresAt: new Date(now + ttlMs()) },
  });
  return token;
}

/** Builds and sends the reset email. Resolves/rejects with no details that could contain the token. */
async function sendResetEmail({ to, name, token }) {
  const base = frontendBaseUrl();
  // The token travels in the URL fragment: browsers never send it to servers or in Referer headers.
  const link = `${base}/reset-password#token=${token}`;
  const ttlMinutes = Math.round(ttlMs() / 60000);
  return sendEmail({ to, ...templates.passwordReset({ name, link, ttlMinutes }) });
}

/**
 * Validates the token, sets the new password, and consumes the token - atomically.
 * Every failure (unknown, expired, already used, account not eligible) is the same generic 400.
 */
async function redeemResetToken(token, newPassword) {
  if (typeof token !== 'string' || token.length < 20 || token.length > 200) throw invalidToken();
  const tokenHash = hashToken(token);

  // Cheap checks first, so unauthenticated callers cannot make us run bcrypt for junk tokens.
  const row = await prisma.passwordResetToken.findUnique({ where: { tokenHash }, include: { user: { select: { id: true, email: true } } } });
  if (!row || row.usedAt || row.expiresAt <= new Date() || isDemoEmail(row.user.email)) throw invalidToken();

  const passwordHash = await bcrypt.hash(newPassword, SALT_ROUNDS());

  await prisma.$transaction(async (tx) => {
    const now = new Date();
    // Claiming the token is the single-use guarantee: only one of several simultaneous requests can win.
    const claimed = await tx.passwordResetToken.updateMany({
      where: { tokenHash, usedAt: null, expiresAt: { gt: now } },
      data: { usedAt: now },
    });
    if (claimed.count !== 1) throw invalidToken();

    await tx.user.update({ where: { id: row.userId }, data: { password: passwordHash, passwordChangedAt: now } });
    // Any other outstanding tokens for this account die with the password change.
    await tx.passwordResetToken.updateMany({ where: { userId: row.userId, usedAt: null }, data: { usedAt: now } });
  });
}

module.exports = { isPasswordResetAvailable, issueResetToken, sendResetEmail, redeemResetToken, hashToken };
