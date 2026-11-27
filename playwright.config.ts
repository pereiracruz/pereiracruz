import { defineConfig, devices } from '@playwright/test'

/**
 * Testes automáticos (npm test).
 * - tests/unidade: cálculos e leitores de ficheiros, sem browser.
 * - tests/app: a aplicação no browser, em modo local (sem Supabase, utilizador admin / pereira2026).
 * O servidor de desenvolvimento arranca sozinho na porta 5199, sempre sem as chaves do Supabase e do Google.
 */
const CI = !!process.env.CI
const PORTA = 5199

export default defineConfig({
  testDir: './tests',
  timeout: 90_000,
  expect: { timeout: 10_000 },
  fullyParallel: true,
  workers: CI ? 2 : undefined,
  retries: CI ? 1 : 0,
  forbidOnly: CI,
  reporter: CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: `http://localhost:${PORTA}`,
    trace: 'off',
    acceptDownloads: true,
  },
  projects: [
    { name: 'unidade', testMatch: /unidade\/.*\.spec\.ts/ },
    { name: 'app', testMatch: /app\/.*\.spec\.ts/, use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 1000 } } },
  ],
  webServer: {
    command: `npx vite --port ${PORTA} --strictPort`,
    url: `http://localhost:${PORTA}`,
    reuseExistingServer: !CI,
    timeout: 120_000,
    // modo local: sem servidor nem Google (as variáveis vazias sobrepõem-se a qualquer .env)
    env: { VITE_SUPABASE_URL: '', VITE_SUPABASE_ANON_KEY: '', VITE_GOOGLE_CLIENT_ID: '' },
  },
})
