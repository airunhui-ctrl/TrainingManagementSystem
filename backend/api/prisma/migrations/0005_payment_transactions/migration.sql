CREATE TABLE IF NOT EXISTS "PaymentTransaction" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "orderId" TEXT NOT NULL,
  "channel" TEXT NOT NULL,
  "provider" TEXT NOT NULL,
  "outTradeNo" TEXT NOT NULL,
  "providerTradeNo" TEXT,
  "amount" REAL NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'pending',
  "payload" TEXT NOT NULL DEFAULT '{}',
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL,
  "paidAt" DATETIME,
  CONSTRAINT "PaymentTransaction_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "PaymentTransaction_outTradeNo_key" ON "PaymentTransaction"("outTradeNo");
CREATE INDEX IF NOT EXISTS "PaymentTransaction_orderId_createdAt_idx" ON "PaymentTransaction"("orderId", "createdAt");
CREATE INDEX IF NOT EXISTS "PaymentTransaction_channel_status_createdAt_idx" ON "PaymentTransaction"("channel", "status", "createdAt");
