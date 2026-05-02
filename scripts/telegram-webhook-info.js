const TELEGRAM_API_BASE = "https://api.telegram.org";

const token = process.env.TELEGRAM_BOT_TOKEN?.trim() || null;
const webhookSecret = process.env.TELEGRAM_WEBHOOK_SECRET?.trim() || null;
const baseUrl = process.env.WHISPERVAULT_BASE_URL?.trim() || null;
const defaultWebhookUrl = baseUrl ? `${baseUrl.replace(/\/+$/, "")}/api/telegram/webhook` : null;

const printSetupInstructions = () => {
  console.log("WhisperVault Telegram webhook info");
  console.log("- TELEGRAM_BOT_TOKEN: missing");
  console.log("- No live Telegram API call was attempted.");
  console.log("- To configure a webhook later:");
  console.log("  1. Set TELEGRAM_BOT_TOKEN.");
  console.log("  2. Set WHISPERVAULT_BASE_URL to your public app URL.");
  console.log("  3. Optional: set TELEGRAM_WEBHOOK_SECRET.");
  if (defaultWebhookUrl) {
    console.log(`  4. Webhook target: ${defaultWebhookUrl}`);
  } else {
    console.log("  4. Webhook target: <your-public-base-url>/api/telegram/webhook");
  }
  console.log("  5. Example setWebhook curl:");
  console.log(
    `     curl -X POST "${TELEGRAM_API_BASE}/bot<token>/setWebhook" -H "Content-Type: application/json" -d "{\\"url\\":\\"${defaultWebhookUrl ?? "https://your-app.example.com/api/telegram/webhook"}\\"${webhookSecret ? ',\\"secret_token\\":\\"<your-secret>\\"' : ""}}"`
  );
};

const run = async () => {
  if (!token) {
    printSetupInstructions();
    return;
  }

  console.log("WhisperVault Telegram webhook info");
  console.log("- TELEGRAM_BOT_TOKEN: set");
  if (defaultWebhookUrl) {
    console.log(`- Expected webhook URL: ${defaultWebhookUrl}`);
  }
  console.log(`- TELEGRAM_WEBHOOK_SECRET: ${webhookSecret ? "set" : "missing"}`);

  try {
    const response = await fetch(`${TELEGRAM_API_BASE}/bot${token}/getWebhookInfo`);
    const payload = await response.json();

    if (!response.ok || !payload?.ok) {
      console.log("- getWebhookInfo: failed");
      console.log(`- Telegram response: ${JSON.stringify(payload)}`);
      process.exitCode = 1;
      return;
    }

    const result = payload.result ?? {};
    console.log("- getWebhookInfo: ok");
    console.log(`- Current webhook URL: ${result.url || "(not set)"}`);
    console.log(`- Pending update count: ${result.pending_update_count ?? 0}`);
    console.log(`- Last error date: ${result.last_error_date ?? "(none)"}`);
    console.log(`- Last error message: ${result.last_error_message ?? "(none)"}`);
    console.log(`- Max connections: ${result.max_connections ?? "(default)"}`);
    console.log(`- Secret token env: ${webhookSecret ? "set" : "missing"}`);
    console.log("- To change the webhook:");
    console.log(
      `  curl -X POST "${TELEGRAM_API_BASE}/bot${token}/setWebhook" -H "Content-Type: application/json" -d "{\\"url\\":\\"${defaultWebhookUrl ?? "https://your-app.example.com/api/telegram/webhook"}\\"${webhookSecret ? `,\\"secret_token\\":\\"${webhookSecret}\\"` : ""}}"`
    );
  } catch (error) {
    console.log("- getWebhookInfo: network call failed");
    console.log(`- Reason: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
};

void run();
