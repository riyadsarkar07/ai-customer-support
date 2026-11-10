import { EventEmitter } from "events";

export type RealtimeEvent =
  | { type: "conversation.created"; organizationId: string; conversationId: string }
  | {
      type: "message.created";
      organizationId: string;
      conversationId: string;
      messageId: string;
    }
  | {
      type: "conversation.updated";
      organizationId: string;
      conversationId: string;
    }
  | { type: "notification"; organizationId: string; notificationId: string };

const globalForBus = globalThis as unknown as {
  bus?: EventEmitter;
};

export const bus = globalForBus.bus ?? new EventEmitter();
bus.setMaxListeners(0);
if (!globalForBus.bus) globalForBus.bus = bus;

export function publish(event: RealtimeEvent): void {
  bus.emit(`org:${event.organizationId}`, event);
}

export function subscribe(
  organizationId: string,
  handler: (event: RealtimeEvent) => void,
): () => void {
  const channel = `org:${organizationId}`;
  bus.on(channel, handler);
  return () => bus.off(channel, handler);
}
