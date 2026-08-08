/* How many submissions one address gets.
 *
 * Every accepted submission renders a PDF and sends two emails, so an
 * unthrottled endpoint costs real money and buries the parish inbox. The limits
 * are set so a family filling in a registration, making a mistake, and doing it
 * again never notices them, while a script hits a wall almost immediately.
 *
 * Counts live in the storage account the function app already uses. A
 * consumption plan runs more than one instance, so an in-memory counter would
 * only ever see part of the traffic.
 */

import crypto from 'node:crypto';
import { TableClient } from '@azure/data-tables';

const TABLE = 'submitrate';

export const LIMITS = { perHour: 5, perDay: 20 };

let clientPromise = null;

function table() {
  if (!clientPromise) {
    const conn = process.env.AzureWebJobsStorage;
    if (!conn) return Promise.resolve(null);
    const client = TableClient.fromConnectionString(conn, TABLE, { allowInsecureConnection: true });
    clientPromise = client.createTable().catch(() => {}).then(() => client);
  }
  return clientPromise;
}

/* The counter needs to recognise a repeat visitor, not identify one, so it
 * stores a keyed hash rather than the address itself. */
function bucketKey(ip) {
  const secret = process.env.FINGERPRINT_SECRET || 'development-only-secret';
  return crypto.createHmac('sha256', secret).update(ip).digest('hex').slice(0, 32);
}

const stamps = (now) => ({
  hour: now.toISOString().slice(0, 13).replace(/[-T]/g, ''),
  day: now.toISOString().slice(0, 10).replace(/-/g, ''),
});

async function bump(client, partition, row) {
  try {
    const existing = await client.getEntity(partition, row);
    const count = (existing.count || 0) + 1;
    await client.updateEntity({ partitionKey: partition, rowKey: row, count }, 'Merge');
    return count;
  } catch (err) {
    if (err.statusCode !== 404) throw err;
    await client.createEntity({ partitionKey: partition, rowKey: row, count: 1 });
    return 1;
  }
}

/* Returns null when the caller is within its allowance, or a reason string when
 * it is not. An address we cannot read is not counted: rate limiting is not the
 * control that keeps bad submissions out, and refusing everyone because a
 * header is missing would be worse than letting it through.
 */
export async function checkRate(ip, now = new Date()) {
  if (!ip) return null;

  const client = await table();
  if (!client) return null;

  const key = bucketKey(ip);
  const when = stamps(now);

  try {
    const hour = await bump(client, `h${when.hour}`, key);
    if (hour > LIMITS.perHour) return 'hour';

    const day = await bump(client, `d${when.day}`, key);
    if (day > LIMITS.perDay) return 'day';

    return null;
  } catch {
    // Storage being unreachable should not stop a family registering. The
    // submission still has to pass every other check before it is accepted.
    return null;
  }
}
