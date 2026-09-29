/**
 * The server setting switched on by the operator.
 */
export const REDUCED_REPORTING_KEY = 'reduced-reporting';

/**
 * The server setting enforced by the console. It cannot be changed locally, and while it is
 * set the operator setting cannot be switched off.
 */
export const REDUCED_REPORTING_CONSOLE_KEY = 'reduced-reporting-console';

export type ReducedReportingState = {
  /** The operator's own setting */
  local: boolean;
  /** Whether the console enforces reduced reporting */
  console: boolean;
  /** Whether reduced reporting is active: local, console, or both */
  active: boolean;
  /** Whether the operator can switch it off: only when the console does not enforce it */
  canDisable: boolean;
};

function isTrue(value: unknown): boolean {
  return typeof value === 'string' && value.trim().toLowerCase() === 'true';
}

/**
 * Reads the reduced reporting state from the server settings map.
 */
export function toReducedReportingState(
  serverSettings: Record<string, unknown> | null | undefined
): ReducedReportingState {
  const local = isTrue(serverSettings?.[REDUCED_REPORTING_KEY]);
  const consoleEnforced = isTrue(serverSettings?.[REDUCED_REPORTING_CONSOLE_KEY]);

  return {
    local,
    console: consoleEnforced,
    active: local || consoleEnforced,
    canDisable: !consoleEnforced,
  };
}
