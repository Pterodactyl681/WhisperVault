import type { ServerPaymentIntent, ServerPaylink } from "./types";

export interface WhisperPayServerRepository {
  createPaylink(paylink: ServerPaylink): Promise<ServerPaylink>;
  updatePaylink(paylink: ServerPaylink): Promise<ServerPaylink>;
  getPaylink(paylinkId: string): Promise<ServerPaylink | null>;
  listPaylinks(): Promise<ServerPaylink[]>;
  createPaymentIntent(paymentIntent: ServerPaymentIntent): Promise<ServerPaymentIntent>;
  updatePaymentIntent(paymentIntent: ServerPaymentIntent): Promise<ServerPaymentIntent>;
  getPaymentIntent(paymentIntentId: string): Promise<ServerPaymentIntent | null>;
  listPaymentIntents(): Promise<ServerPaymentIntent[]>;
}

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

export class InMemoryWhisperPayServerRepository implements WhisperPayServerRepository {
  private readonly paylinks = new Map<string, ServerPaylink>();

  private readonly paymentIntents = new Map<string, ServerPaymentIntent>();

  async createPaylink(paylink: ServerPaylink): Promise<ServerPaylink> {
    if (this.paylinks.has(paylink.id)) {
      throw new Error(`Paylink already exists for id "${paylink.id}".`);
    }

    const stored = clone(paylink);
    this.paylinks.set(stored.id, stored);
    return clone(stored);
  }

  async updatePaylink(paylink: ServerPaylink): Promise<ServerPaylink> {
    const stored = clone(paylink);
    this.paylinks.set(stored.id, stored);
    return clone(stored);
  }

  async getPaylink(paylinkId: string): Promise<ServerPaylink | null> {
    const paylink = this.paylinks.get(paylinkId);
    return paylink ? clone(paylink) : null;
  }

  async listPaylinks(): Promise<ServerPaylink[]> {
    return Array.from(this.paylinks.values(), (paylink) => clone(paylink));
  }

  async createPaymentIntent(paymentIntent: ServerPaymentIntent): Promise<ServerPaymentIntent> {
    if (this.paymentIntents.has(paymentIntent.id)) {
      throw new Error(`Payment intent already exists for id "${paymentIntent.id}".`);
    }

    const stored = clone(paymentIntent);
    this.paymentIntents.set(stored.id, stored);
    return clone(stored);
  }

  async updatePaymentIntent(paymentIntent: ServerPaymentIntent): Promise<ServerPaymentIntent> {
    const stored = clone(paymentIntent);
    this.paymentIntents.set(stored.id, stored);
    return clone(stored);
  }

  async getPaymentIntent(paymentIntentId: string): Promise<ServerPaymentIntent | null> {
    const paymentIntent = this.paymentIntents.get(paymentIntentId);
    return paymentIntent ? clone(paymentIntent) : null;
  }

  async listPaymentIntents(): Promise<ServerPaymentIntent[]> {
    return Array.from(this.paymentIntents.values(), (paymentIntent) => clone(paymentIntent));
  }
}
