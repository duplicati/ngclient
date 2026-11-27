import { SettingInputDto } from '../../../../core/openapi';

/**
 * Option names used by the server's SendMail report module
 * (see Duplicati/Library/Modules/Builtin/SendMail.cs).
 */
export const EMAIL_OPTIONS = {
  to: 'send-mail-to',
  from: 'send-mail-from',
  url: 'send-mail-url',
  username: 'send-mail-username',
  password: 'send-mail-password',
  subject: 'send-mail-subject',
  body: 'send-mail-body',
  bodyHtml: 'send-mail-body-html',
  level: 'send-mail-level',
  operations: 'send-mail-operations',
  format: 'send-mail-result-output-format',
  template: 'send-mail-result-template',
  acceptAnyCertificate: 'send-mail-accept-any-ssl-certificate',
} as const;

export type EmailField = keyof typeof EMAIL_OPTIONS;
export type EmailValues = Partial<Record<EmailField, string>>;

/** Result levels that can trigger an email; "All" on the server is shorthand for all of them */
export const EMAIL_LEVELS = ['Success', 'Warning', 'Error', 'Fatal'] as const;

/** All send-mail-* values, keyed by option name without the leading dashes */
export type RawEmailOptions = Record<string, string>;

export function optionKey(name: string | null | undefined) {
  return (name ?? '').replace(/^--/, '');
}

function asString(value: unknown) {
  if (value === null || value === undefined) return '';
  return typeof value === 'string' ? value : String(value);
}

/** Collects every send-mail-* option from a settings list (names may or may not have leading dashes) */
export function readEmailOptions(
  settings: ReadonlyArray<{ Name?: string | null; Value?: unknown }> | null | undefined
) {
  const result: RawEmailOptions = {};
  for (const setting of settings ?? []) {
    const key = optionKey(setting.Name);
    if (key.startsWith('send-mail-')) result[key] = asString(setting.Value);
  }
  return result;
}

export function toEmailValues(raw: RawEmailOptions): EmailValues {
  const values: EmailValues = {};
  for (const [field, name] of Object.entries(EMAIL_OPTIONS) as [EmailField, string][]) {
    if (raw[name] !== undefined) values[field] = raw[name];
  }
  return values;
}

/**
 * Writes the dialog result into a settings list. An empty value removes the option, so the
 * server default (or the global setting) applies again. Options the dialog does not manage are kept.
 */
export function applyEmailValues(settings: SettingInputDto[], values: EmailValues): SettingInputDto[] {
  let result = [...settings];
  for (const [field, name] of Object.entries(EMAIL_OPTIONS) as [EmailField, string][]) {
    if (!(field in values)) continue;
    const value = (values[field] ?? '').trim();
    const index = result.findIndex((s) => optionKey(s.Name) === name);

    if (value === '') {
      if (index >= 0) result = result.filter((_, i) => i !== index);
    } else if (index >= 0) {
      result[index] = { ...result[index], Value: value };
    } else {
      result.push({ Name: name, Value: value });
    }
  }
  return result;
}

export function parseLevels(value: string | null | undefined): string[] {
  const parts = (value ?? '')
    .split(',')
    .map((x) => x.trim())
    .filter((x) => x !== '');
  if (parts.length === 0 || parts.some((x) => x.toLowerCase() === 'all')) return [...EMAIL_LEVELS];
  return EMAIL_LEVELS.filter((level) => parts.some((x) => x.toLowerCase() === level.toLowerCase()));
}

export function serializeLevels(levels: readonly string[]): string {
  if (EMAIL_LEVELS.every((level) => levels.includes(level))) return 'All';
  return EMAIL_LEVELS.filter((level) => levels.includes(level)).join(',');
}

/** Compares option values ignoring case, whitespace and the order of comma separated parts */
export function sameOptionValue(a: string | null | undefined, b: string | null | undefined) {
  const normalize = (v: string | null | undefined) =>
    (v ?? '')
      .split(',')
      .map((x) => x.trim().toLowerCase())
      .filter((x) => x !== '')
      .sort()
      .join(',');
  return normalize(a) === normalize(b);
}

export type SmtpPreset = {
  name: string;
  url: string;
  /** What the provider needs besides the server, shown once the preset is picked */
  note: string;
};

/**
 * SMTP servers for common providers. Microsoft (Outlook.com and Microsoft 365) is left out,
 * as it no longer accepts a username and password over SMTP, which is all the mail module supports.
 */
export const SMTP_PRESETS: readonly SmtpPreset[] = [
  {
    name: 'Gmail',
    url: 'smtps://smtp.gmail.com:465',
    note: $localize`Gmail needs an app password, created under Security in your Google account. Use your full address as the username.`,
  },
  {
    name: 'iCloud Mail',
    url: 'smtp://smtp.mail.me.com:587/?starttls=always',
    note: $localize`iCloud needs an app-specific password, created at account.apple.com. Use your full iCloud address as the username.`,
  },
  {
    name: 'Yahoo Mail',
    url: 'smtps://smtp.mail.yahoo.com:465',
    note: $localize`Yahoo needs an app password, created under Account security. Use your full address as the username.`,
  },
  {
    name: 'Fastmail',
    url: 'smtps://smtp.fastmail.com:465',
    note: $localize`Fastmail needs an app password with SMTP access, created under Settings → Privacy & Security. Use your full address as the username.`,
  },
];

export function findSmtpPreset(url: string | null | undefined) {
  const normalized = (url ?? '').trim().toLowerCase();
  return SMTP_PRESETS.find((preset) => preset.url.toLowerCase() === normalized) ?? null;
}
