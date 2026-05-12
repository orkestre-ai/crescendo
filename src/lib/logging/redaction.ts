/**
 * Pino Redaction Configuration
 *
 * Configures automatic redaction of sensitive fields in log output.
 * Uses Pino's built-in fast-redact under the hood.
 */

export function getRedactionConfig() {
  return {
    paths: [
      '*.token',
      '*.apiKey',
      '*.api_key',
      '*.secret',
      '*.password',
      '*.authorization',
      '*.access_token',
      '*.refresh_token',
      '*.private_key',
      '*.privatekey',
      '*.creditcard',
      '*.credit_card',
      '*.ssn',
      '*.encryptionKey',
      '*.serviceAccountKey',
    ],
    censor: '[REDACTED]',
  };
}
