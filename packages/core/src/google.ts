/** Public Google URLs. Nothing here calls Google APIs. */

/** Opens the "write a review" dialog for a place. */
export function googleWriteReviewUrl(placeId: string): string {
  return `https://search.google.com/local/writereview?placeid=${encodeURIComponent(placeId)}`;
}

/**
 * Google's official page for reporting a review that violates policy (opened by the owner, by hand).
 * Kept in one place so it can be updated if Google moves it.
 */
export const GOOGLE_REVIEW_REMOVAL_URL = "https://support.google.com/business/workflow/9945796";
