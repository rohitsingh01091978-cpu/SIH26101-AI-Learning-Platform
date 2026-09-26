-- Google sign-in support. Purely additive: existing rows keep their password and
-- become authProvider = 'local'. Password becomes nullable because accounts that
-- only sign in with Google have no password.
ALTER TABLE "users" ALTER COLUMN "password" DROP NOT NULL;
ALTER TABLE "users" ADD COLUMN "authProvider" TEXT NOT NULL DEFAULT 'local';
ALTER TABLE "users" ADD COLUMN "googleId" TEXT;
CREATE UNIQUE INDEX "users_googleId_key" ON "users"("googleId");
