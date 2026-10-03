-- CreateEnum
CREATE TYPE "ServiceState" AS ENUM ('ACTIVE', 'SUSPENDED', 'TERMINATED');

-- CreateEnum
CREATE TYPE "LocationStatus" AS ENUM ('ACTIVE', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "StandStatus" AS ENUM ('UNASSIGNED', 'ACTIVE', 'INACTIVE');

-- CreateEnum
CREATE TYPE "LinkEventType" AS ENUM ('SCAN', 'MESSAGE_CLICK', 'GOOGLE_CLICK', 'FEEDBACK_OPEN', 'FEEDBACK_SENT');

-- CreateEnum
CREATE TYPE "LinkSource" AS ENUM ('NFC', 'QR', 'MESSAGE', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "DeviceType" AS ENUM ('MOBILE', 'TABLET', 'DESKTOP', 'OTHER');

-- CreateEnum
CREATE TYPE "FeedbackStatus" AS ENUM ('NEW', 'READ', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "ReplyState" AS ENUM ('UNANSWERED', 'DRAFTED', 'PENDING_APPROVAL', 'ANSWERED');

-- CreateEnum
CREATE TYPE "ReplyTone" AS ENUM ('WARM', 'FORMAL', 'SHORT');

-- CreateEnum
CREATE TYPE "ReplyStatus" AS ENUM ('DRAFT', 'PENDING_APPROVAL', 'PUBLISHED', 'FAILED', 'DISCARDED');

-- CreateEnum
CREATE TYPE "ReplyOrigin" AS ENUM ('AI', 'HUMAN', 'EXTERNAL');

-- CreateEnum
CREATE TYPE "ReplyAction" AS ENUM ('GENERATED', 'EDITED', 'APPROVED', 'PUBLISHED', 'PUBLISH_FAILED', 'DISCARDED', 'SYNCED');

-- CreateEnum
CREATE TYPE "PolicyCategory" AS ENUM ('NONE', 'SPAM_FAKE', 'OFF_TOPIC', 'CONFLICT_OF_INTEREST', 'OFFENSIVE', 'HARASSMENT', 'PERSONAL_INFO', 'IMPERSONATION');

-- CreateEnum
CREATE TYPE "ViolationStatus" AS ENUM ('TO_SUBMIT', 'SUBMITTED', 'REMOVED', 'REJECTED', 'DISMISSED');

-- CreateEnum
CREATE TYPE "Channel" AS ENUM ('EMAIL', 'SMS');

-- CreateEnum
CREATE TYPE "ContactSource" AS ENUM ('MANUAL', 'CSV', 'WEBHOOK');

-- CreateEnum
CREATE TYPE "ConsentAction" AS ENUM ('GRANTED', 'WITHDRAWN');

-- CreateEnum
CREATE TYPE "SuppressionReason" AS ENUM ('UNSUBSCRIBE', 'STOP', 'BOUNCE', 'COMPLAINT', 'MANUAL');

-- CreateEnum
CREATE TYPE "TemplateKind" AS ENUM ('REQUEST', 'REMINDER');

-- CreateEnum
CREATE TYPE "CampaignStatus" AS ENUM ('ACTIVE', 'PAUSED', 'STOPPED');

-- CreateEnum
CREATE TYPE "ReviewRequestStatus" AS ENUM ('SCHEDULED', 'SENT', 'REMINDED', 'CLICKED', 'SKIPPED', 'FAILED');

-- CreateEnum
CREATE TYPE "AttributionMethod" AS ENUM ('NAME_MATCH', 'TIME_WINDOW');

-- CreateEnum
CREATE TYPE "MessageKind" AS ENUM ('REQUEST', 'REMINDER', 'ALERT', 'REPORT', 'TRANSACTIONAL');

-- CreateEnum
CREATE TYPE "MessageStatus" AS ENUM ('QUEUED', 'SENT', 'DELIVERED', 'FAILED', 'BOUNCED');

-- CreateEnum
CREATE TYPE "PlanCode" AS ENUM ('ESSENTIEL', 'PRO');

-- CreateEnum
CREATE TYPE "SubscriptionStatus" AS ENUM ('TRIALING', 'ACTIVE', 'PAST_DUE', 'UNPAID', 'CANCELED', 'INCOMPLETE');

-- CreateEnum
CREATE TYPE "FileKind" AS ENUM ('LOGO', 'REPORT', 'QR_SHEET', 'IMPORT');

-- CreateEnum
CREATE TYPE "ReportStatus" AS ENUM ('PENDING', 'READY', 'SENT', 'FAILED');

-- CreateTable
CREATE TABLE "user" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "emailVerified" BOOLEAN NOT NULL DEFAULT false,
    "image" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "role" TEXT DEFAULT 'user',
    "banned" BOOLEAN DEFAULT false,
    "banReason" TEXT,
    "banExpires" TIMESTAMP(3),
    "phone" TEXT,
    "locale" TEXT NOT NULL DEFAULT 'fr',

    CONSTRAINT "user_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "session" (
    "id" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "token" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "userId" TEXT NOT NULL,
    "impersonatedBy" TEXT,

    CONSTRAINT "session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "account" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "accessToken" TEXT,
    "refreshToken" TEXT,
    "idToken" TEXT,
    "accessTokenExpiresAt" TIMESTAMP(3),
    "refreshTokenExpiresAt" TIMESTAMP(3),
    "scope" TEXT,
    "password" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "verification" (
    "id" TEXT NOT NULL,
    "identifier" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "verification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "organization" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "logo" TEXT,
    "metadata" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "onboardedAt" TIMESTAMP(3),
    "serviceState" "ServiceState" NOT NULL DEFAULT 'ACTIVE',
    "timezone" TEXT NOT NULL DEFAULT 'Europe/Paris',
    "locale" TEXT NOT NULL DEFAULT 'fr',
    "billingEmail" TEXT,

    CONSTRAINT "organization_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "member" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "member_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invitation" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "role" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "inviterId" TEXT NOT NULL,

    CONSTRAINT "invitation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification_pref" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "alertEmail" BOOLEAN NOT NULL DEFAULT true,
    "alertSms" BOOLEAN NOT NULL DEFAULT false,
    "alertPhone" TEXT,
    "monthlyReport" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "notification_pref_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "location" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "address" TEXT,
    "city" TEXT,
    "postalCode" TEXT,
    "category" TEXT NOT NULL,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "timezone" TEXT NOT NULL DEFAULT 'Europe/Paris',
    "brandColor" TEXT NOT NULL DEFAULT '#2563eb',
    "logoFileId" TEXT,
    "gbpAccountId" TEXT,
    "gbpLocationId" TEXT,
    "placeId" TEXT,
    "googleReviewUrl" TEXT,
    "googleRating" DOUBLE PRECISION,
    "googleReviewCount" INTEGER,
    "status" "LocationStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "location_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "baseline_snapshot" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "capturedAt" TIMESTAMP(3) NOT NULL,
    "rating" DOUBLE PRECISION NOT NULL,
    "reviewCount" INTEGER NOT NULL,
    "velocityPerWeek" DOUBLE PRECISION NOT NULL,
    "responseRate" DOUBLE PRECISION NOT NULL,
    "avgResponseHours" DOUBLE PRECISION,

    CONSTRAINT "baseline_snapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "location_daily_stat" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "rating" DOUBLE PRECISION,
    "totalReviews" INTEGER NOT NULL,
    "newReviews" INTEGER NOT NULL DEFAULT 0,
    "ratingSum" INTEGER NOT NULL DEFAULT 0,
    "repliedReviews" INTEGER NOT NULL DEFAULT 0,
    "responseHoursSum" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "scans" INTEGER NOT NULL DEFAULT 0,
    "googleClicks" INTEGER NOT NULL DEFAULT 0,
    "feedbacks" INTEGER NOT NULL DEFAULT 0,
    "messagesSent" INTEGER NOT NULL DEFAULT 0,
    "messageClicks" INTEGER NOT NULL DEFAULT 0,
    "attributedReviews" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "location_daily_stat_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stand" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "organizationId" TEXT,
    "locationId" TEXT,
    "label" TEXT,
    "status" "StandStatus" NOT NULL DEFAULT 'UNASSIGNED',
    "assignedAt" TIMESTAMP(3),
    "deactivatedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "stand_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "link_event" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "standId" TEXT,
    "reviewRequestId" TEXT,
    "type" "LinkEventType" NOT NULL,
    "source" "LinkSource" NOT NULL DEFAULT 'UNKNOWN',
    "deviceType" "DeviceType" NOT NULL DEFAULT 'OTHER',
    "os" TEXT,
    "visitorHash" TEXT,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "link_event_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "private_feedback" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "standId" TEXT,
    "reviewRequestId" TEXT,
    "message" TEXT NOT NULL,
    "contactName" TEXT,
    "contactEmail" TEXT,
    "contactPhone" TEXT,
    "wantsReply" BOOLEAN NOT NULL DEFAULT false,
    "status" "FeedbackStatus" NOT NULL DEFAULT 'NEW',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "private_feedback_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "review" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "googleReviewId" TEXT NOT NULL,
    "authorName" TEXT NOT NULL,
    "authorPhotoUrl" TEXT,
    "rating" INTEGER NOT NULL,
    "comment" TEXT,
    "language" TEXT,
    "createdAtGoogle" TIMESTAMP(3) NOT NULL,
    "updatedAtGoogle" TIMESTAMP(3) NOT NULL,
    "removedAt" TIMESTAMP(3),
    "sentiment" DOUBLE PRECISION,
    "topics" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "replyState" "ReplyState" NOT NULL DEFAULT 'UNANSWERED',
    "firstRepliedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "review_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "review_sync_state" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "lastSyncedAt" TIMESTAMP(3),
    "lastSuccessAt" TIMESTAMP(3),
    "lastError" TEXT,
    "reviewsSeen" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "review_sync_state_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reply_settings" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "tone" "ReplyTone" NOT NULL DEFAULT 'WARM',
    "signature" TEXT,
    "alwaysMention" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "neverMention" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "autoPublishMinStars" INTEGER NOT NULL DEFAULT 4,
    "autoPublishAll" BOOLEAN NOT NULL DEFAULT false,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "reply_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "review_reply" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "reviewId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "status" "ReplyStatus" NOT NULL,
    "origin" "ReplyOrigin" NOT NULL,
    "guardrailFlags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "model" TEXT,
    "promptVersion" TEXT,
    "publishedAt" TIMESTAMP(3),
    "publishedById" TEXT,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "review_reply_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reply_revision" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "replyId" TEXT NOT NULL,
    "action" "ReplyAction" NOT NULL,
    "body" TEXT NOT NULL,
    "actorUserId" TEXT,
    "impersonatorId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reply_revision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "review_classification" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "reviewId" TEXT NOT NULL,
    "category" "PolicyCategory" NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL,
    "explanation" TEXT NOT NULL,
    "model" TEXT,
    "promptVersion" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "review_classification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "violation_report" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "reviewId" TEXT NOT NULL,
    "category" "PolicyCategory" NOT NULL,
    "reasonText" TEXT NOT NULL,
    "explanation" TEXT NOT NULL,
    "status" "ViolationStatus" NOT NULL DEFAULT 'TO_SUBMIT',
    "submittedAt" TIMESTAMP(3),
    "submittedById" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "violation_report_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contact" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "source" "ContactSource" NOT NULL,
    "externalId" TEXT,
    "lastVisitAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "contact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "consent_event" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "channel" "Channel" NOT NULL,
    "action" "ConsentAction" NOT NULL,
    "source" TEXT NOT NULL,
    "evidence" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "consent_event_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "suppression" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "channel" "Channel" NOT NULL,
    "valueHash" TEXT NOT NULL,
    "reason" "SuppressionReason" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "suppression_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "message_template" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT,
    "channel" "Channel" NOT NULL,
    "kind" "TemplateKind" NOT NULL,
    "locale" TEXT NOT NULL DEFAULT 'fr',
    "name" TEXT NOT NULL,
    "subject" TEXT,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "message_template_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "campaign" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "channels" "Channel"[],
    "emailTemplateId" TEXT,
    "smsTemplateId" TEXT,
    "reminderEnabled" BOOLEAN NOT NULL DEFAULT true,
    "delayAfterVisitHours" INTEGER NOT NULL DEFAULT 2,
    "reminderAfterDays" INTEGER NOT NULL DEFAULT 3,
    "status" "CampaignStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "campaign_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "review_request" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "campaignId" TEXT,
    "token" TEXT NOT NULL,
    "channel" "Channel" NOT NULL,
    "visitAt" TIMESTAMP(3),
    "scheduledAt" TIMESTAMP(3) NOT NULL,
    "status" "ReviewRequestStatus" NOT NULL DEFAULT 'SCHEDULED',
    "skipReason" TEXT,
    "sentAt" TIMESTAMP(3),
    "reminderScheduledAt" TIMESTAMP(3),
    "remindedAt" TIMESTAMP(3),
    "clickedAt" TIMESTAMP(3),
    "attributedReviewId" TEXT,
    "attribution" "AttributionMethod",
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "review_request_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "message" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT,
    "channel" "Channel" NOT NULL,
    "kind" "MessageKind" NOT NULL,
    "to" TEXT NOT NULL,
    "subject" TEXT,
    "body" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "providerMessageId" TEXT,
    "status" "MessageStatus" NOT NULL DEFAULT 'QUEUED',
    "error" TEXT,
    "reviewRequestId" TEXT,
    "sentAt" TIMESTAMP(3),
    "deliveredAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "message_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inbound_webhook" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "lastUsedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "inbound_webhook_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "competitor" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "placeId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT,
    "distanceM" INTEGER,
    "tracked" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "competitor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "competitor_snapshot" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "competitorId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "rating" DOUBLE PRECISION NOT NULL,
    "reviewCount" INTEGER NOT NULL,

    CONSTRAINT "competitor_snapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subscription" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "plan" "PlanCode" NOT NULL,
    "status" "SubscriptionStatus" NOT NULL,
    "stripeCustomerId" TEXT,
    "stripeSubscriptionId" TEXT,
    "trialEndsAt" TIMESTAMP(3),
    "currentPeriodEnd" TIMESTAMP(3),
    "cancelAtPeriodEnd" BOOLEAN NOT NULL DEFAULT false,
    "canceledAt" TIMESTAMP(3),
    "graceEndsAt" TIMESTAMP(3),
    "setupFeePaidAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "subscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stripe_event" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "processedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stripe_event_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stored_file" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT,
    "kind" "FileKind" NOT NULL,
    "storageKey" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "mime" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stored_file_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "monthly_report" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "locationId" TEXT,
    "month" DATE NOT NULL,
    "fileId" TEXT,
    "status" "ReportStatus" NOT NULL DEFAULT 'PENDING',
    "error" TEXT,
    "emailedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "monthly_report_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_log" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT,
    "actorUserId" TEXT,
    "impersonatorId" TEXT,
    "action" TEXT NOT NULL,
    "entity" TEXT,
    "entityId" TEXT,
    "data" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_log_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mock_gbp_location" (
    "gbpLocationId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "placeId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mock_gbp_location_pkey" PRIMARY KEY ("gbpLocationId")
);

-- CreateTable
CREATE TABLE "mock_gbp_review" (
    "id" TEXT NOT NULL,
    "gbpLocationId" TEXT NOT NULL,
    "reviewId" TEXT NOT NULL,
    "reviewerName" TEXT NOT NULL,
    "reviewerPhoto" TEXT,
    "starRating" INTEGER NOT NULL,
    "comment" TEXT,
    "createTime" TIMESTAMP(3) NOT NULL,
    "updateTime" TIMESTAMP(3) NOT NULL,
    "replyComment" TEXT,
    "replyUpdateTime" TIMESTAMP(3),
    "deleted" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "mock_gbp_review_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mock_place" (
    "placeId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "address" TEXT,
    "latitude" DOUBLE PRECISION NOT NULL,
    "longitude" DOUBLE PRECISION NOT NULL,
    "rating" DOUBLE PRECISION NOT NULL,
    "userRatingCount" INTEGER NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "mock_place_pkey" PRIMARY KEY ("placeId")
);

-- CreateIndex
CREATE UNIQUE INDEX "user_email_key" ON "user"("email");

-- CreateIndex
CREATE UNIQUE INDEX "session_token_key" ON "session"("token");

-- CreateIndex
CREATE INDEX "session_userId_idx" ON "session"("userId");

-- CreateIndex
CREATE INDEX "account_userId_idx" ON "account"("userId");

-- CreateIndex
CREATE INDEX "verification_identifier_idx" ON "verification"("identifier");

-- CreateIndex
CREATE UNIQUE INDEX "organization_slug_key" ON "organization"("slug");

-- CreateIndex
CREATE INDEX "member_userId_idx" ON "member"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "member_organizationId_userId_key" ON "member"("organizationId", "userId");

-- CreateIndex
CREATE INDEX "invitation_organizationId_idx" ON "invitation"("organizationId");

-- CreateIndex
CREATE INDEX "invitation_email_idx" ON "invitation"("email");

-- CreateIndex
CREATE UNIQUE INDEX "notification_pref_memberId_key" ON "notification_pref"("memberId");

-- CreateIndex
CREATE INDEX "notification_pref_organizationId_idx" ON "notification_pref"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "location_gbpLocationId_key" ON "location"("gbpLocationId");

-- CreateIndex
CREATE INDEX "location_organizationId_idx" ON "location"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "baseline_snapshot_locationId_key" ON "baseline_snapshot"("locationId");

-- CreateIndex
CREATE INDEX "baseline_snapshot_organizationId_idx" ON "baseline_snapshot"("organizationId");

-- CreateIndex
CREATE INDEX "location_daily_stat_organizationId_date_idx" ON "location_daily_stat"("organizationId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "location_daily_stat_locationId_date_key" ON "location_daily_stat"("locationId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "stand_code_key" ON "stand"("code");

-- CreateIndex
CREATE INDEX "stand_organizationId_idx" ON "stand"("organizationId");

-- CreateIndex
CREATE INDEX "link_event_organizationId_occurredAt_idx" ON "link_event"("organizationId", "occurredAt");

-- CreateIndex
CREATE INDEX "link_event_locationId_occurredAt_idx" ON "link_event"("locationId", "occurredAt");

-- CreateIndex
CREATE INDEX "link_event_standId_occurredAt_idx" ON "link_event"("standId", "occurredAt");

-- CreateIndex
CREATE INDEX "private_feedback_organizationId_createdAt_idx" ON "private_feedback"("organizationId", "createdAt");

-- CreateIndex
CREATE INDEX "review_organizationId_createdAtGoogle_idx" ON "review"("organizationId", "createdAtGoogle");

-- CreateIndex
CREATE INDEX "review_locationId_createdAtGoogle_idx" ON "review"("locationId", "createdAtGoogle");

-- CreateIndex
CREATE UNIQUE INDEX "review_locationId_googleReviewId_key" ON "review"("locationId", "googleReviewId");

-- CreateIndex
CREATE UNIQUE INDEX "review_sync_state_locationId_key" ON "review_sync_state"("locationId");

-- CreateIndex
CREATE INDEX "review_sync_state_organizationId_idx" ON "review_sync_state"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "reply_settings_locationId_key" ON "reply_settings"("locationId");

-- CreateIndex
CREATE INDEX "reply_settings_organizationId_idx" ON "reply_settings"("organizationId");

-- CreateIndex
CREATE INDEX "review_reply_organizationId_status_idx" ON "review_reply"("organizationId", "status");

-- CreateIndex
CREATE INDEX "review_reply_reviewId_idx" ON "review_reply"("reviewId");

-- CreateIndex
CREATE INDEX "reply_revision_replyId_idx" ON "reply_revision"("replyId");

-- CreateIndex
CREATE INDEX "reply_revision_organizationId_idx" ON "reply_revision"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "review_classification_reviewId_key" ON "review_classification"("reviewId");

-- CreateIndex
CREATE INDEX "review_classification_organizationId_idx" ON "review_classification"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "violation_report_reviewId_key" ON "violation_report"("reviewId");

-- CreateIndex
CREATE INDEX "violation_report_organizationId_status_idx" ON "violation_report"("organizationId", "status");

-- CreateIndex
CREATE INDEX "contact_locationId_idx" ON "contact"("locationId");

-- CreateIndex
CREATE UNIQUE INDEX "contact_organizationId_email_key" ON "contact"("organizationId", "email");

-- CreateIndex
CREATE UNIQUE INDEX "contact_organizationId_phone_key" ON "contact"("organizationId", "phone");

-- CreateIndex
CREATE INDEX "consent_event_contactId_channel_createdAt_idx" ON "consent_event"("contactId", "channel", "createdAt");

-- CreateIndex
CREATE INDEX "consent_event_organizationId_idx" ON "consent_event"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "suppression_organizationId_channel_valueHash_key" ON "suppression"("organizationId", "channel", "valueHash");

-- CreateIndex
CREATE INDEX "message_template_organizationId_idx" ON "message_template"("organizationId");

-- CreateIndex
CREATE INDEX "campaign_organizationId_idx" ON "campaign"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "review_request_token_key" ON "review_request"("token");

-- CreateIndex
CREATE UNIQUE INDEX "review_request_attributedReviewId_key" ON "review_request"("attributedReviewId");

-- CreateIndex
CREATE INDEX "review_request_organizationId_status_scheduledAt_idx" ON "review_request"("organizationId", "status", "scheduledAt");

-- CreateIndex
CREATE UNIQUE INDEX "review_request_contactId_locationId_key" ON "review_request"("contactId", "locationId");

-- CreateIndex
CREATE INDEX "message_organizationId_createdAt_idx" ON "message"("organizationId", "createdAt");

-- CreateIndex
CREATE INDEX "message_providerMessageId_idx" ON "message"("providerMessageId");

-- CreateIndex
CREATE UNIQUE INDEX "inbound_webhook_tokenHash_key" ON "inbound_webhook"("tokenHash");

-- CreateIndex
CREATE INDEX "inbound_webhook_organizationId_idx" ON "inbound_webhook"("organizationId");

-- CreateIndex
CREATE INDEX "competitor_organizationId_idx" ON "competitor"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "competitor_locationId_placeId_key" ON "competitor"("locationId", "placeId");

-- CreateIndex
CREATE INDEX "competitor_snapshot_organizationId_idx" ON "competitor_snapshot"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "competitor_snapshot_competitorId_date_key" ON "competitor_snapshot"("competitorId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "subscription_organizationId_key" ON "subscription"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "subscription_stripeCustomerId_key" ON "subscription"("stripeCustomerId");

-- CreateIndex
CREATE UNIQUE INDEX "subscription_stripeSubscriptionId_key" ON "subscription"("stripeSubscriptionId");

-- CreateIndex
CREATE UNIQUE INDEX "stored_file_storageKey_key" ON "stored_file"("storageKey");

-- CreateIndex
CREATE INDEX "stored_file_organizationId_idx" ON "stored_file"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "monthly_report_organizationId_locationId_month_key" ON "monthly_report"("organizationId", "locationId", "month");

-- CreateIndex
CREATE INDEX "audit_log_organizationId_createdAt_idx" ON "audit_log"("organizationId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "mock_gbp_review_reviewId_key" ON "mock_gbp_review"("reviewId");

-- CreateIndex
CREATE INDEX "mock_gbp_review_gbpLocationId_updateTime_idx" ON "mock_gbp_review"("gbpLocationId", "updateTime");

-- AddForeignKey
ALTER TABLE "session" ADD CONSTRAINT "session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "account" ADD CONSTRAINT "account_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "member" ADD CONSTRAINT "member_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "member" ADD CONSTRAINT "member_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invitation" ADD CONSTRAINT "invitation_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invitation" ADD CONSTRAINT "invitation_inviterId_fkey" FOREIGN KEY ("inviterId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_pref" ADD CONSTRAINT "notification_pref_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "member"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "location" ADD CONSTRAINT "location_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "baseline_snapshot" ADD CONSTRAINT "baseline_snapshot_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "location"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "location_daily_stat" ADD CONSTRAINT "location_daily_stat_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "location"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stand" ADD CONSTRAINT "stand_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "location"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "link_event" ADD CONSTRAINT "link_event_standId_fkey" FOREIGN KEY ("standId") REFERENCES "stand"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "private_feedback" ADD CONSTRAINT "private_feedback_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "location"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "private_feedback" ADD CONSTRAINT "private_feedback_standId_fkey" FOREIGN KEY ("standId") REFERENCES "stand"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "review" ADD CONSTRAINT "review_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "location"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "review_sync_state" ADD CONSTRAINT "review_sync_state_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "location"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reply_settings" ADD CONSTRAINT "reply_settings_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "location"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "review_reply" ADD CONSTRAINT "review_reply_reviewId_fkey" FOREIGN KEY ("reviewId") REFERENCES "review"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reply_revision" ADD CONSTRAINT "reply_revision_replyId_fkey" FOREIGN KEY ("replyId") REFERENCES "review_reply"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "review_classification" ADD CONSTRAINT "review_classification_reviewId_fkey" FOREIGN KEY ("reviewId") REFERENCES "review"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "violation_report" ADD CONSTRAINT "violation_report_reviewId_fkey" FOREIGN KEY ("reviewId") REFERENCES "review"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contact" ADD CONSTRAINT "contact_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "location"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consent_event" ADD CONSTRAINT "consent_event_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "contact"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campaign" ADD CONSTRAINT "campaign_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "location"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "review_request" ADD CONSTRAINT "review_request_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "location"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "review_request" ADD CONSTRAINT "review_request_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "contact"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "review_request" ADD CONSTRAINT "review_request_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "campaign"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "message" ADD CONSTRAINT "message_reviewRequestId_fkey" FOREIGN KEY ("reviewRequestId") REFERENCES "review_request"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "competitor" ADD CONSTRAINT "competitor_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "location"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "competitor_snapshot" ADD CONSTRAINT "competitor_snapshot_competitorId_fkey" FOREIGN KEY ("competitorId") REFERENCES "competitor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscription" ADD CONSTRAINT "subscription_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
