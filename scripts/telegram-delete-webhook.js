const TELEGRAM_API_BASE = "https://api.telegram.org";

const token = process.env.TELEGRAM_BOT_TOKEN?.trim() || null;

const fail = (message) => {
  console.error(message);
  process.exitCode = 1;
};

const run = async () => {
  if (!token) {
    fail("TELEGRAM_BOT_TOKEN is required to delete the Telegram webhook.");
    return;
  }

  try {
    const response = await fetch(`${TELEGRAM_API_BASE}/bot${token}/deleteWebhook`, {
      method: "POST"
    });
    const payload = await response.json();

    if (!response.ok || !payload?.ok) {
      fail(`Telegram deleteWebhook failed: ${payload?.description || response.statusText}`);
      return;
    }

    console.log(`deleteWebhook: ${JSON.stringify(payload.result)}`);
  } catch (error) {
    fail(`Telegram deleteWebhook request failed: ${error instanceof Error ? error.message : String(error)}`);
  }
};

void run();
