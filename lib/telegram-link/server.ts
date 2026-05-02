import { getStorageMode } from "../storage/config";
import { SupabaseTelegramLinkRepository } from "./database-repository";
import { DevFileTelegramLinkRepository, InMemoryTelegramLinkRepository } from "./repository";
import { TelegramLinkService } from "./service";

type TelegramLinkGlobal = typeof globalThis & {
  __whisperPayTelegramLinkService?: TelegramLinkService;
};

const globalForTelegramLink = globalThis as TelegramLinkGlobal;

const createTelegramLinkRepository = () => {
  if (getStorageMode() === "database") {
    return new SupabaseTelegramLinkRepository();
  }

  return process.env.NODE_ENV === "development"
    ? new DevFileTelegramLinkRepository()
    : new InMemoryTelegramLinkRepository();
};

export const telegramLinkService =
  globalForTelegramLink.__whisperPayTelegramLinkService ??
  new TelegramLinkService({
    repository: createTelegramLinkRepository()
  });

export const resolveControllerWalletForTelegramUser = (telegramUserId: string): Promise<string | null> =>
  telegramLinkService.resolveControllerWalletForTelegramUser(telegramUserId);

if (process.env.NODE_ENV !== "production") {
  globalForTelegramLink.__whisperPayTelegramLinkService = telegramLinkService;
}
