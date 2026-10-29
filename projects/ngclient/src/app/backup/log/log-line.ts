/**
 * A Duplicati log line is written as
 * `<timestamp> - [<Level>-<Source>-<Tag>]: <message>`
 * for example
 * `2026-10-10 17:26:02 +00 - [Warning-Duplicati.Library.Main.Operation.BackupHandler-FileAccessError]: Error reported ...`
 *
 * The message may span several lines (stack traces, exception details).
 * Lines that do not follow the format are kept whole, so nothing is lost in the log view.
 */

export type LogLevel = 'information' | 'warning' | 'error' | 'retry' | 'verbose' | 'profiling' | 'dryrun' | 'unknown';

export interface ParsedLogLine {
  /** The entry exactly as received, used for copying */
  raw: string;
  /** Whether the entry matched the `<timestamp> - [Level-Source-Tag]` format */
  parsed: boolean;
  /** Full timestamp text, e.g. `2026-10-10 17:26:02 +00` */
  timestamp: string | null;
  /** The time-of-day part only, e.g. `17:26:02` */
  time: string | null;
  level: LogLevel;
  /** The source between level and tag, e.g. `Duplicati.Library.Main.Operation.BackupHandler` */
  source: string | null;
  /** The last part of the bracket, e.g. `FileAccessError`; this is the id used by --suppress-warnings */
  tag: string | null;
  /** First line of the message, for the compact row */
  summary: string;
  /** The whole message, for the expanded row */
  details: string;
}

// Timestamp: whatever precedes ` - [` on the first line. The server formats it in its own locale,
// so `2026-10-10 17:26:02 +00` and `2026-10-09 16.13.00 +02` both occur
const TIMESTAMP = String.raw`([^\r\n\[]+?)`;
// Bracket: `[Level-Source-Tag]` where the source may itself contain hyphens, the tag may not
const BRACKET = String.raw`\[([A-Za-z]+)-(.+?)-([^-\]\s]+)\]`;
const LOG_LINE = new RegExp(String.raw`^\s*${TIMESTAMP}\s+-\s+${BRACKET}(?::\s?)?([\s\S]*)$`);
// Time of day inside the timestamp, with `:` or `.` between the parts. The last match is used,
// so a dotted date such as `20.10.2026 14.56.54` does not pass for the time
const TIME_OF_DAY = /(\d{1,2})[:.](\d{2})[:.](\d{2})/g;

const LEVELS: Record<string, LogLevel> = {
  information: 'information',
  info: 'information',
  warning: 'warning',
  warn: 'warning',
  error: 'error',
  retry: 'retry',
  verbose: 'verbose',
  profiling: 'profiling',
  dryrun: 'dryrun',
};

function firstLine(text: string): string {
  const end = text.search(/\r?\n/);
  return (end < 0 ? text : text.slice(0, end)).trim();
}

/**
 * Parses one log entry. Entries outside the expected format come back with
 * `parsed: false`, no time or tag, the given fallback level, and the whole text as summary and details.
 */
export function parseLogLine(entry: unknown, fallbackLevel: LogLevel = 'unknown'): ParsedLogLine {
  const raw = typeof entry === 'string' ? entry : entry == null ? '' : String(entry);
  const text = raw.replace(/[\r\n]+$/, '');
  const match = LOG_LINE.exec(text);

  if (!match) {
    return {
      raw,
      parsed: false,
      timestamp: null,
      time: null,
      level: fallbackLevel,
      source: null,
      tag: null,
      summary: firstLine(text),
      details: text,
    };
  }

  const [, timestamp, level, source, tag, message] = match;
  const details = message.trim();
  const timeOfDay = [...timestamp.matchAll(TIME_OF_DAY)].at(-1);

  return {
    raw,
    parsed: true,
    timestamp: timestamp.trim(),
    // Normalised to HH:mm:ss; falls back to the whole timestamp when no time of day is found
    time: timeOfDay ? `${timeOfDay[1].padStart(2, '0')}:${timeOfDay[2]}:${timeOfDay[3]}` : timestamp.trim(),
    level: LEVELS[level.toLowerCase()] ?? fallbackLevel,
    source,
    tag,
    summary: firstLine(details),
    details,
  };
}
