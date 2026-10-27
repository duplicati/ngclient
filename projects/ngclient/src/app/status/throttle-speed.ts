/** Multipliers for the unit suffixes the server's size parser accepts in throttle settings */
const SPEED_UNIT_FACTORS: Record<string, number> = {
  '': 1,
  b: 1,
  kb: 1024,
  mb: 1024 ** 2,
  gb: 1024 ** 3,
  tb: 1024 ** 4,
  pb: 1024 ** 5,
};

/**
 * Parses a throttle setting such as "10MB" into bytes per second.
 * Returns null when the setting is empty, unparseable or zero, as those all mean no throttle.
 */
export function parseThrottleSpeed(value: string | null | undefined): number | null {
  const match = (value ?? '').trim().match(/^(\d+(?:\.\d+)?)\s*([a-zA-Z]*)$/);
  if (!match) return null;

  const factor = SPEED_UNIT_FACTORS[match[2].toLowerCase()];
  if (factor === undefined) return null;

  const bytesPerSecond = parseFloat(match[1]) * factor;
  return bytesPerSecond > 0 ? bytesPerSecond : null;
}
