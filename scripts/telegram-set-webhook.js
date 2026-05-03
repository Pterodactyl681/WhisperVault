const TELEGRAM_API_BASE = "https://api.telegram.org";

const token = process.env.TELEGRAM_BOT_TOKEN?.trim() || null;
const webhookUrl = process.env.TELEGRAM_WEBHOOK_URL?.trim() || null;
const webhookSecret = process.env.TELEGRAM_WEBHOOK_SECRET?.trim() || null;

const fail = (message) => {
  console.error(message);
  process.exitCode = 1;
};

const run = async () => {
  if (!webhookUrl) {
    fail("TELEGRAM_WEBHOOK_URL is required. Example: https://your-app.example.com/api/telegram/webhook");
    return;
  }

  if (!token) {
    fail("TELEGRAM_BOT_TOKEN is required to set the Telegram webhook.");
    return;
  }

  const body = { url: webhookUrl };

  if (webhookSecret) {
    body.secret_token = webhookSecret;
  }

  try {
    const response = await fetch(`${TELEGRAM_API_BASE}/bot${token}/setWebhook`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
    const payload = await response.json();

    if (!response.ok || !payload?.ok) {
      fail(`Telegram setWebhook failed: ${payload?.description || response.statusText}`);
      return;
    }

    console.log(`Webhook URL: ${webhookUrl}`);
    console.log(`setWebhook: ${JSON.stringify(payload.result)}`);
  } catch (error) {
    fail(`Telegram setWebhook request failed: ${error instanceof Error ? error.message : String(error)}`);
  }
};

void run();
