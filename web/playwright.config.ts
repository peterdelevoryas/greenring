import { defineConfig } from "@playwright/test";

const envFile = process.env.GREENRING_ENV_FILE ?? ".env.e2e";

export default defineConfig({
  testDir: "./tests",
  fullyParallel: false,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: "list",
  use: {
    baseURL: "http://127.0.0.1:4173",
    permissions: ["microphone"],
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
    launchOptions: {
      args: [
        "--use-fake-device-for-media-stream",
        "--use-fake-ui-for-media-stream",
      ],
    },
  },
  webServer: [
    {
      command: `bash ./scripts/run-local-api.sh ${envFile}`,
      url: "http://127.0.0.1:3000/health",
      cwd: "..",
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
    {
      command: "PORT=4173 VITE_API_BASE_URL=http://127.0.0.1:3000 bash ./scripts/run-local-web.sh",
      url: "http://127.0.0.1:4173",
      cwd: "..",
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
  ],
});
