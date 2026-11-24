import type {
  ArtifactContentResponse,
  BoardResponse,
  BoardSettings,
  ConversationCard,
  ConversationDetail,
  HealthResponse,
  OverlayData,
  OverlayPatch,
  ReviewBatchRequest,
  ReviewBatchResponse,
  SearchResponse,
  SseEvent,
} from '@shared/types';

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(text || `HTTP ${res.status}`);
  }
  return (await res.json()) as T;
}

export function fetchHealth(): Promise<HealthResponse> {
  return requestJson<HealthResponse>('/api/health');
}

export function fetchBoard(): Promise<BoardResponse> {
  return requestJson<BoardResponse>('/api/board');
}

export function fetchConversationDetail(id: string): Promise<ConversationDetail> {
  return requestJson<ConversationDetail>(`/api/conversations/${encodeURIComponent(id)}`);
}

export function fetchArtifactContent(
  conversationId: string,
  relativePath: string,
): Promise<ArtifactContentResponse> {
  const qs = new URLSearchParams({ file: relativePath }).toString();
  return requestJson<ArtifactContentResponse>(
    `/api/conversations/${encodeURIComponent(conversationId)}/artifact?${qs}`,
  );
}

export function patchConversationOverlay(
  id: string,
  patch: OverlayPatch,
): Promise<{ overlay: OverlayData; card: ConversationCard | null }> {
  return requestJson<{ overlay: OverlayData; card: ConversationCard | null }>(
    `/api/conversations/${encodeURIComponent(id)}/overlay`,
    {
      method: 'PATCH',
      body: JSON.stringify(patch),
    },
  );
}

export function markConversationReviewed(
  id: string,
): Promise<{ overlay: OverlayData; card: ConversationCard | null }> {
  return requestJson<{ overlay: OverlayData; card: ConversationCard | null }>(
    `/api/conversations/${encodeURIComponent(id)}/review`,
    {
      method: 'POST',
    },
  );
}

export function reviewConversationsBatch(
  body: ReviewBatchRequest,
): Promise<ReviewBatchResponse> {
  return requestJson<ReviewBatchResponse>('/api/conversations/review-batch', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export function searchConversations(
  query: string,
  signal?: AbortSignal,
): Promise<SearchResponse> {
  const qs = new URLSearchParams({ q: query }).toString();
  return requestJson<SearchResponse>(`/api/search?${qs}`, { signal });
}

export function patchSettings(patch: Partial<BoardSettings>): Promise<BoardSettings> {
  return requestJson<BoardSettings>('/api/settings', {
    method: 'PATCH',
    body: JSON.stringify(patch),
  });
}

export type SseStatus = 'connecting' | 'connected' | 'disconnected';

export interface SseSubscriptionHandlers {
  onEvent: (event: SseEvent) => void;
  onStatusChange: (status: SseStatus) => void;
}

export function subscribeBoardEvents(handlers: SseSubscriptionHandlers): () => void {
  let closed = false;
  let source: EventSource | null = null;
  let retryTimer: ReturnType<typeof setTimeout> | null = null;
  let retryDelay = 1200;

  const connect = () => {
    if (closed) return;
    handlers.onStatusChange('connecting');
    try {
      source = new EventSource('/api/events');
    } catch {
      handlers.onStatusChange('disconnected');
      scheduleReconnect();
      return;
    }

    source.onopen = () => {
      retryDelay = 1200;
      handlers.onStatusChange('connected');
    };

    source.onmessage = (msg) => {
      try {
        const parsed = JSON.parse(msg.data) as SseEvent;
        if (parsed.type === 'connected' || parsed.type === 'heartbeat') {
          handlers.onStatusChange('connected');
        }
        handlers.onEvent(parsed);
      } catch {
        // ignore malformed SSE frames
      }
    };

    source.onerror = () => {
      if (source) {
        source.close();
        source = null;
      }
      if (!closed) {
        handlers.onStatusChange('disconnected');
        scheduleReconnect();
      }
    };
  };

  const scheduleReconnect = () => {
    if (closed || retryTimer) return;
    retryTimer = setTimeout(() => {
      retryTimer = null;
      retryDelay = Math.min(retryDelay * 1.6, 12000);
      connect();
    }, retryDelay);
  };

  connect();

  return () => {
    closed = true;
    if (retryTimer) clearTimeout(retryTimer);
    if (source) source.close();
  };
}
