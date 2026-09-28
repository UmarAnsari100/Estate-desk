ALTER TABLE "Property"
ADD COLUMN "sourceUrl" TEXT,
ADD COLUMN "sourceRepository" TEXT,
ADD COLUMN "sourceRevision" TEXT,
ADD COLUMN "sourceReference" TEXT,
ADD COLUMN "sourceUpdatedAt" TIMESTAMP(3),
ADD COLUMN "pricingDetails" JSONB,
ADD COLUMN "requiresReview" BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX "Property_sourceRepository_idx" ON "Property"("sourceRepository");
