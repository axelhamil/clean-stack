export interface INotificationStreamHub {
  subscribe(userId: string, onSignal: () => void): () => void;
  subscriberCount(userId: string): number;
}
