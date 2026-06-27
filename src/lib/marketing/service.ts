import { generateUUID } from './identity';
import { getConsentState, updateConsentState } from './consent';
import {
  getOrSetAnonymousId,
  getOrSetSessionId,
  getDeviceContext,
  getUTMContext,
  getClickIds,
  getReferrer,
} from './identity';
import { MarketingEvent, MarketingEventName, ConsentState } from './types';
import { EventDispatcher } from './dispatcher';
import { EVENT_REGISTRY } from './registry';

// Manage journey Correlation ID
export function getOrSetCorrelationId(): string {
  if (typeof window === 'undefined') return '';
  const key = 'panther_correlation_id';
  let correlationId = window.sessionStorage.getItem(key);
  if (!correlationId) {
    correlationId = generateUUID();
    window.sessionStorage.setItem(key, correlationId);
  }
  return correlationId;
}

export const MarketingPlatformService = {
  track(
    eventName: MarketingEventName,
    properties: Record<string, any> = {},
    userId: string | null = null
  ): void {
    if (typeof window === 'undefined') return;

    const registryDef = EVENT_REGISTRY[eventName];
    const eventVersion = registryDef?.eventVersion || '1.0.0';
    const schemaVersion = registryDef?.schemaVersion || '1.0.0';

    const searchParams = new URLSearchParams(window.location.search);
    const event: MarketingEvent = {
      eventId: generateUUID(),
      schemaVersion,
      eventVersion,
      providerMappingVersion: '1.0.0',
      eventName,
      timestamp: new Date().toISOString(),
      sessionId: getOrSetSessionId(),
      anonymousId: getOrSetAnonymousId(),
      userId,
      properties,
      correlationId: getOrSetCorrelationId(),
      context: {
        page: {
          url: window.location.href,
          path: window.location.pathname,
          referrer: getReferrer(),
          title: document.title,
          utm: getUTMContext(searchParams),
          clickIds: getClickIds(searchParams),
        },
        device: getDeviceContext(),
        consent: getConsentState(),
      },
      source: 'client',
    };

    // Queue in EventDispatcher
    EventDispatcher.getInstance().enqueue(event);
  },

  page(
    url?: string,
    path?: string,
    title?: string,
    referrer?: string,
    userId: string | null = null
  ): void {
    const currentUrl = url || (typeof window !== 'undefined' ? window.location.href : '');
    const currentPath = path || (typeof window !== 'undefined' ? window.location.pathname : '');
    const currentTitle = title || (typeof window !== 'undefined' ? document.title : '');
    const currentReferrer = referrer || getReferrer();

    this.track(
      'page_viewed',
      {
        url: currentUrl,
        path: currentPath,
        title: currentTitle,
        referrer: currentReferrer,
      },
      userId
    );
  },

  identify(userId: string | null, traits: Record<string, any> = {}): void {
    if (typeof window === 'undefined') return;

    const dispatcher = EventDispatcher.getInstance();
    const anonId = getOrSetAnonymousId();

    // Call identify hook on all active provider client interfaces
    dispatcher.getActiveProviders().forEach((provId) => {
      console.log(`[MarketingPlatformService] Client Identify on ${provId}:`, {
        userId,
        anonId,
        traits,
      });
    });

    this.track(
      'profile_updated',
      {
        userId,
        traits,
      },
      userId
    );
  },

  consent(
    state: Partial<Omit<ConsentState, 'version' | 'timestamp'>>,
    subjectId: string
  ): void {
    updateConsentState(state, subjectId);
  },

  alias(userId: string, previousId: string): void {
    // Explicitly link anonymous ID to user profile
    this.track(
      'profile_updated',
      {
        aliasUserId: userId,
        previousId,
      },
      userId
    );
  },

  group(
    groupId: string,
    traits: Record<string, any> = {},
    userId: string | null = null
  ): void {
    // Groups customer accounts under corporate segments
    this.track(
      'profile_updated',
      {
        groupId,
        groupTraits: traits,
      },
      userId
    );
  },

  screen(
    name: string,
    properties: Record<string, any> = {},
    userId: string | null = null
  ): void {
    // Support screen view logging (e.g. for PWA / Mobile shell views)
    this.track(
      'page_viewed',
      {
        screenName: name,
        ...properties,
      },
      userId
    );
  },
};
