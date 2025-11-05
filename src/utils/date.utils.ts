import { format, formatDistanceToNow } from 'date-fns';
import { formatInTimeZone, toZonedTime } from 'date-fns-tz';

/**
 * Format date to ET timezone
 * @param date - Date to format
 * @param formatStr - Format string (default: 'MMM d, yyyy h:mm a')
 * @returns Formatted date string in ET
 */
export function formatToET(
  date: Date | string | number,
  formatStr: string = 'MMM d, yyyy h:mm a'
): string {
  const dateObj = typeof date === 'string' || typeof date === 'number' 
    ? new Date(date) 
    : date;
  
  return formatInTimeZone(dateObj, 'America/New_York', formatStr);
}

/**
 * Get relative time string (e.g., "2 hours ago")
 * @param date - Date to format
 * @returns Relative time string
 */
export function getRelativeTime(date: Date | string | number): string {
  const dateObj = typeof date === 'string' || typeof date === 'number' 
    ? new Date(date) 
    : date;
  
  return formatDistanceToNow(dateObj, { addSuffix: true });
}

/**
 * Format date for tooltip (local time)
 * @param date - Date to format
 * @returns Formatted date string in local timezone
 */
export function formatLocalTime(date: Date | string | number): string {
  const dateObj = typeof date === 'string' || typeof date === 'number' 
    ? new Date(date) 
    : date;
  
  return format(dateObj, 'MMM d, yyyy h:mm a');
}

/**
 * Convert UTC date to ET timezone
 * @param date - Date to convert
 * @returns Date object in ET timezone
 */
export function toET(date: Date | string | number): Date {
  const dateObj = typeof date === 'string' || typeof date === 'number' 
    ? new Date(date) 
    : date;
  
  return toZonedTime(dateObj, 'America/New_York');
}

