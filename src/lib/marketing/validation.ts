import { MarketingEvent } from './types';
import { EVENT_REGISTRY } from './registry';

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

export function validateMarketingEvent(event: Partial<MarketingEvent>): ValidationResult {
  const errors: string[] = [];

  // 1. Basic properties checks
  if (!event.eventId) {
    errors.push('Event ID is missing.');
  }
  if (!event.eventName) {
    errors.push('Event name is missing.');
    return { valid: false, errors };
  }
  
  const registryDef = EVENT_REGISTRY[event.eventName];
  if (!registryDef) {
    errors.push(`Event name "${event.eventName}" is not registered in the Canonical Event Registry.`);
    return { valid: false, errors };
  }

  // Check deprecation status
  if (registryDef.deprecationStatus === 'hidden') {
    errors.push(`Event "${event.eventName}" is hidden / disabled in the registry.`);
    return { valid: false, errors };
  }

  // 2. Timestamp check
  if (!event.timestamp) {
    errors.push('Event timestamp is missing.');
  } else {
    const timestampParsed = Date.parse(event.timestamp);
    if (isNaN(timestampParsed)) {
      errors.push('Event timestamp is invalid (must be a valid ISO-8601 string).');
    }
  }

  // 3. User & Session tracking identifiers check
  if (!event.anonymousId) {
    errors.push('Anonymous ID is missing.');
  }
  if (!event.sessionId) {
    errors.push('Session ID is missing.');
  }

  // 4. Required event-specific properties checks
  const props = event.properties || {};
  
  // Properties are searched first inside properties, then inside page context as a convenience fallback (like page URL/path)
  for (const propName of registryDef.requiredProperties) {
    const val = props[propName] ?? (event.context?.page as any)?.[propName];
    if (val === undefined || val === null || val === '') {
      errors.push(`Required property "${propName}" is missing.`);
    } else if (registryDef.typeChecks && registryDef.typeChecks[propName]) {
      const expectedType = registryDef.typeChecks[propName];
      const actualType = typeof val;
      
      if (expectedType === 'array') {
        if (!Array.isArray(val)) {
          errors.push(`Property "${propName}" must be an array (got "${actualType}").`);
        }
      } else if (actualType !== expectedType) {
        errors.push(`Property "${propName}" must be of type "${expectedType}" (got "${actualType}").`);
      }
    }
  }

  // 5. Currency validity checks
  const currencyVal = props.currency;
  if (currencyVal !== undefined) {
    if (typeof currencyVal !== 'string') {
      errors.push('Property "currency" must be a string.');
    } else if (!/^[A-Z]{3}$/.test(currencyVal)) {
      errors.push(`Currency "${currencyVal}" is invalid. Must be standard ISO-4217 (e.g. "INR", "USD").`);
    }
  }

  // 6. Product SKU / Identifier checks if applicable
  const productId = props.productId;
  if (productId !== undefined && typeof productId !== 'string') {
    errors.push('Product ID must be a string.');
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}
