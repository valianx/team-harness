type Order = { id: string; email: string };

interface OrdersDatabase {
  save(order: Order): Promise<void>;
}

interface ReceiptQueue {
  publish(order: Order): Promise<void>;
  subscribe(handler: (order: Order) => Promise<void>): void;
}

interface MailProvider {
  sendReceipt(email: string): Promise<void>;
}

/** Accepts an order through the Checkout API; adapters are outside this excerpt. */
export function checkoutApi(database: OrdersDatabase, queue: ReceiptQueue) {
  return async function placeOrder(order: Order): Promise<void> {
    await database.save(order);
    await queue.publish(order);
  };
}

/** Receives broker deliveries in the Receipt Worker and calls the external mail provider. */
export function receiptWorker(queue: ReceiptQueue, mail: MailProvider): void {
  queue.subscribe(async (order) => {
    await mail.sendReceipt(order.email);
  });
}
