import type { LlmAdapter } from "@avis/adapters";
import { forTenant } from "@avis/db";

/**
 * Pipeline for a newly synced review. Phase 1: language, sentiment and topics (and a policy
 * classification for 1–3★). Reply drafting (phase 4) and alerts/flagging (phase 6) plug in here.
 */
export async function processNewReview(llm: LlmAdapter, organizationId: string, reviewId: string) {
  const db = forTenant({ organizationId });
  const review = await db.review.findUniqueOrThrow({ where: { id: reviewId }, include: { location: true } });
  const result = await llm.classifyReview({
    review: { rating: review.rating, comment: review.comment, authorDisplayName: review.authorName },
    business: { name: review.location.name, category: review.location.category },
  });
  await db.review.update({
    where: { id: reviewId },
    data: { language: result.language, sentiment: result.sentiment, topics: result.topics },
  });
  if (review.rating <= 3) {
    const data = { category: result.category, confidence: result.confidence, explanation: result.explanation, model: result.model, promptVersion: result.promptVersion };
    await db.reviewClassification.upsert({
      where: { reviewId },
      create: { organizationId, reviewId, ...data },
      update: data,
    });
  }
  return result;
}
