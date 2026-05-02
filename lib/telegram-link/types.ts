export interface TelegramLinkCodeRecord {
  code: string;
  controllerWallet: string;
  expiresAt: string;
  consumedAt: string | null;
  createdAt: string;
}

export interface TelegramLinkedAccountRecord {
  telegramUserId: string;
  controllerWallet: string;
  createdAt: string;
  updatedAt: string;
}

export interface TelegramLinkCodeResult {
  code: string;
  expiresAt: string;
  command: string;
}

export interface TelegramLinkedAccountResult {
  telegramUserId: string;
  controllerWallet: string;
  linkedAt: string;
}
