import type { PolicyCategory, ReplyTone } from "@avis/db/enums";
import type { Topic } from "@avis/core/topics";

export interface ReplyInput {
  /** Only what is public on Google: no customer records are ever sent to the model. */
  review: { rating: number; comment?: string | null; authorDisplayName: string };
  business: { name: string; category: string; city?: string | null };
  settings: { tone: ReplyTone; signature?: string | null; alwaysMention: string[]; neverMention: string[] };
}

export interface ReplyOutput {
  body: string;
  language: string;
  model: string;
  promptVersion: string;
}

export interface ClassificationInput {
  review: { rating: number; comment?: string | null; authorDisplayName: string };
  business: { name: string; category: string };
}

export interface ClassificationOutput {
  category: PolicyCategory;
  confidence: number; // 0..1
  explanation: string; // French, shown to the owner
  sentiment: number; // -1..1
  topics: Topic[];
  language: string; // ISO 639-1
  model: string;
  promptVersion: string;
}

export interface LlmAdapter {
  readonly mode: "mock" | "anthropic";
  generateReply(input: ReplyInput): Promise<ReplyOutput>;
  classifyReview(input: ClassificationInput): Promise<ClassificationOutput>;
}
