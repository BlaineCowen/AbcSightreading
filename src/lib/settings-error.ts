/**
 * An exercise that cannot be written with the settings chosen (no rhythm that
 * fits the meter, say). The message is for the reader, and /api/generate
 * answers it with a 400, not a 500: it is not the server failing, and the
 * health alerts (scripts/health-alerts.ts) count only 5xx.
 */
export class SettingsError extends Error {
  override name = "SettingsError";
}
