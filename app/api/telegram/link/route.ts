import { createTelegramLinkHttpHandlers } from "@/lib/telegram-link/http";
import { telegramLinkService } from "@/lib/telegram-link/server";

const handlers = createTelegramLinkHttpHandlers({
  service: telegramLinkService
});

export const POST = handlers.consumeLinkCode;
