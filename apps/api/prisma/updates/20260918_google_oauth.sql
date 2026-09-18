-- Actualización para una base existente con el esquema previo a Google OAuth.
-- Ejecutar una sola vez. Para bases nuevas, usar schema.prisma completo.
BEGIN;

ALTER TABLE "users" ADD COLUMN "googleSubject" TEXT;
CREATE UNIQUE INDEX "users_googleSubject_key" ON "users"("googleSubject");

CREATE TABLE "oauth_requests" (
    "tokenHash" TEXT NOT NULL,
    "bindingHash" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "subjectId" TEXT,
    "nonce" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "oauth_requests_pkey" PRIMARY KEY ("tokenHash")
);
CREATE INDEX "oauth_requests_expiresAt_idx" ON "oauth_requests"("expiresAt");

COMMIT;
