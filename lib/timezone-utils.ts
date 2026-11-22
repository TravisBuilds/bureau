/**
 * Timezone utilities for Bureau
 * Default timezone: America/Los_Angeles (Travis's timezone)
 */

const DEFAULT_TIMEZONE = 'America/Los_Angeles';

/**
 * Format a timestamp in the user's timezone (defaults to America/Los_Angeles)
 */
export function formatTimestamp(
  timestamp: string,
  options: Intl.DateTimeFormatOptions = {},
  timezone: string = DEFAULT_TIMEZONE
): string {
  const date = new Date(timestamp);
  
  const defaultOptions: Intl.DateTimeFormatOptions = {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: true,
    timeZone: timezone,
    ...options,
  };
  
  return new Intl.DateTimeFormat('en-US', defaultOptions).format(date);
}

/**
 * Format as short date in America/Los_Angeles
 */
export function formatShortDate(timestamp: string, timezone: string = DEFAULT_TIMEZONE): string {
  return formatTimestamp(timestamp, {
    month: 'numeric',
    day: 'numeric',
    year: 'numeric',
    hour: undefined,
    minute: undefined,
    second: undefined,
  }, timezone);
}

/**
 * Format as full datetime in America/Los_Angeles
 */
export function formatFullDateTime(timestamp: string, timezone: string = DEFAULT_TIMEZONE): string {
  return formatTimestamp(timestamp, { timeZoneName: 'short' }, timezone);
}

/**
 * Format relative time ("2h ago", "3d ago")
 * Pass nowTimestamp to avoid new Date() during SSR/prerender
 */
export function formatRelativeTime(timestamp: string, nowTimestamp: number = Date.now()): string {
  const date = new Date(timestamp);
  const diff = nowTimestamp - date.getTime();
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  
  if (seconds < 60) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 7) return `${days}d ago`;
  
  // For older dates, show the actual date
  return formatShortDate(timestamp);
}
