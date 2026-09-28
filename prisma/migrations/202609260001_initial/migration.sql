-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "ConversationStatus" AS ENUM ('ACTIVE', 'WAITING', 'CLOSED');

-- CreateEnum
CREATE TYPE "Purpose" AS ENUM ('SALE', 'RENT');

-- CreateEnum
CREATE TYPE "PropertyStatus" AS ENUM ('AVAILABLE', 'RESERVED', 'SOLD', 'RENTED', 'INACTIVE');

-- CreateEnum
CREATE TYPE "LeadStatus" AS ENUM ('NEW', 'QUALIFYING', 'QUALIFIED', 'VIEWING_REQUESTED', 'FOLLOW_UP', 'WON', 'LOST');

-- CreateTable
CREATE TABLE "Admin" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Admin_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Customer" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "whatsappNumber" TEXT NOT NULL,
    "email" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Customer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Conversation" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "status" "ConversationStatus" NOT NULL DEFAULT 'ACTIVE',
    "aiEnabled" BOOLEAN NOT NULL DEFAULT true,
    "humanTakeover" BOOLEAN NOT NULL DEFAULT false,
    "assignedAdminId" TEXT,
    "lastMessageAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastInboundAt" TIMESTAMP(3),
    "unread" INTEGER NOT NULL DEFAULT 0,
    "simulated" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Conversation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Message" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "whatsappMessageId" TEXT,
    "replyToId" TEXT,
    "direction" TEXT NOT NULL,
    "sender" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'text',
    "content" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'RECEIVED',
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Message_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProcessingJob" (
    "id" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProcessingJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Property" (
    "id" TEXT NOT NULL,
    "propertyCode" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "purpose" "Purpose" NOT NULL,
    "propertyType" TEXT NOT NULL,
    "location" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "area" DECIMAL(12,2) NOT NULL,
    "areaUnit" TEXT NOT NULL,
    "bedrooms" INTEGER,
    "bathrooms" INTEGER,
    "price" DECIMAL(16,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'PKR',
    "description" TEXT NOT NULL,
    "amenities" TEXT[],
    "images" TEXT[],
    "status" "PropertyStatus" NOT NULL DEFAULT 'AVAILABLE',
    "featured" BOOLEAN NOT NULL DEFAULT false,
    "demo" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Property_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Lead" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "name" TEXT,
    "phone" TEXT NOT NULL,
    "purpose" "Purpose",
    "propertyType" TEXT,
    "preferredLocation" TEXT,
    "city" TEXT,
    "minimumBudget" DECIMAL(16,2),
    "maximumBudget" DECIMAL(16,2),
    "preferredArea" DECIMAL(12,2),
    "areaUnit" TEXT,
    "bedrooms" INTEGER,
    "preferredVisitDate" TEXT,
    "interestedPropertyId" TEXT,
    "status" "LeadStatus" NOT NULL DEFAULT 'NEW',
    "score" INTEGER,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Lead_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ViewingRequest" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "propertyId" TEXT,
    "requestedDate" TEXT,
    "preferredTime" TEXT,
    "customerName" TEXT,
    "status" TEXT NOT NULL DEFAULT 'REQUESTED',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ViewingRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BusinessSettings" (
    "id" TEXT NOT NULL DEFAULT 'singleton',
    "companyName" TEXT NOT NULL DEFAULT 'Estate Desk',
    "description" TEXT NOT NULL DEFAULT '',
    "phone" TEXT NOT NULL DEFAULT '',
    "email" TEXT NOT NULL DEFAULT '',
    "officeAddress" TEXT NOT NULL DEFAULT '',
    "website" TEXT NOT NULL DEFAULT '',
    "businessHours" TEXT NOT NULL DEFAULT '',
    "defaultGreeting" TEXT NOT NULL DEFAULT 'Hello! How can we help you find a property?',
    "supportedLanguages" TEXT[] DEFAULT ARRAY['English', 'Urdu', 'Roman Urdu']::TEXT[],

    CONSTRAINT "BusinessSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AISettings" (
    "id" TEXT NOT NULL DEFAULT 'singleton',
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "personality" TEXT NOT NULL DEFAULT 'Friendly and professional',
    "instructions" TEXT NOT NULL DEFAULT '',
    "defaultLanguage" TEXT NOT NULL DEFAULT 'English',
    "humanEscalationRules" TEXT NOT NULL DEFAULT '',
    "maxConversationHistory" INTEGER NOT NULL DEFAULT 20,
    "temperature" DOUBLE PRECISION NOT NULL DEFAULT 0.2,

    CONSTRAINT "AISettings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Admin_email_key" ON "Admin"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Customer_whatsappNumber_key" ON "Customer"("whatsappNumber");

-- CreateIndex
CREATE UNIQUE INDEX "Conversation_customerId_simulated_key" ON "Conversation"("customerId", "simulated");

-- CreateIndex
CREATE UNIQUE INDEX "Message_whatsappMessageId_key" ON "Message"("whatsappMessageId");

-- CreateIndex
CREATE UNIQUE INDEX "Message_replyToId_key" ON "Message"("replyToId");

-- CreateIndex
CREATE INDEX "Message_conversationId_createdAt_idx" ON "Message"("conversationId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ProcessingJob_messageId_key" ON "ProcessingJob"("messageId");

-- CreateIndex
CREATE INDEX "ProcessingJob_status_createdAt_idx" ON "ProcessingJob"("status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Property_propertyCode_key" ON "Property"("propertyCode");

-- CreateIndex
CREATE INDEX "Property_status_purpose_city_price_idx" ON "Property"("status", "purpose", "city", "price");

-- CreateIndex
CREATE UNIQUE INDEX "Lead_conversationId_key" ON "Lead"("conversationId");

-- AddForeignKey
ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_assignedAdminId_fkey" FOREIGN KEY ("assignedAdminId") REFERENCES "Admin"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProcessingJob" ADD CONSTRAINT "ProcessingJob_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "Message"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lead" ADD CONSTRAINT "Lead_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lead" ADD CONSTRAINT "Lead_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lead" ADD CONSTRAINT "Lead_interestedPropertyId_fkey" FOREIGN KEY ("interestedPropertyId") REFERENCES "Property"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ViewingRequest" ADD CONSTRAINT "ViewingRequest_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ViewingRequest" ADD CONSTRAINT "ViewingRequest_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE SET NULL ON UPDATE CASCADE;
