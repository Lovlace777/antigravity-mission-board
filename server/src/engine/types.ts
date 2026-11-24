import type {
  ArtifactContentResponse,
  BoardResponse,
  BoardSettings,
  ConversationCard,
  ConversationDetail,
  HealthResponse,
  OverlayData,
  OverlayPatch,
  ReviewBatchResponse,
  SearchResponse,
} from '../../../shared/types.js';

export interface IBoardService {
  readonly mode: 'live' | 'demo';
  getHealth(): HealthResponse;
  getBoard(): BoardResponse;
  getConversationDetail(conversationId: string): ConversationDetail | null;
  readArtifact(conversationId: string, relativeFilePath: string): ArtifactContentResponse | null;
  patchOverlay(
    conversationId: string,
    patch: OverlayPatch,
  ): { overlay: OverlayData; card: ConversationCard | null };
  markReviewed(conversationId: string): { overlay: OverlayData; card: ConversationCard | null };
  markReviewedBatch(ids: string[], reviewedAt?: string | null): ReviewBatchResponse;
  search(query: string): SearchResponse;
  getSettings(): BoardSettings;
  patchSettings(patch: Partial<BoardSettings>): BoardSettings;
  close(): void;
}
