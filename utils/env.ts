import dotenv from 'dotenv';

// Load .env once. In CI there is no .env file; the values come from the workflow instead.
dotenv.config({ quiet: true });

export function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing env variable ${name}. Copy .env.example to .env and fill it in.`);
  return value;
}

// Getters, so a value is only required when a test actually uses it.
// Example: the API tests can run without the Sauce Demo password.
export const env = {
  get sauceBaseUrl() { return requireEnv('SAUCE_BASE_URL'); },
  get sauceUser() { return requireEnv('SAUCE_USER'); },
  get saucePassword() { return requireEnv('SAUCE_PASSWORD'); },
  get internetBaseUrl() { return requireEnv('INTERNET_BASE_URL'); },
  get bookerApiUrl() { return requireEnv('BOOKER_API_URL'); },
  get bookerUser() { return requireEnv('BOOKER_USER'); },
  get bookerPassword() { return requireEnv('BOOKER_PASSWORD'); },
};
