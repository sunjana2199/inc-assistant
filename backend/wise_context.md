# Wise Context: Fintech Database Estate

## Purpose and how the AI should use this document

This document describes the database estate of **Meridian Pay**, a fictional cross-border payments company, so an AI assistant can triage database incidents using only what is written here.

The estate is a sample. Every system name, limit and threshold below is invented for learning: replace them with your own once you move from the Week 1 prototype to a real team.

The assistant answers a pasted error, symptom or schema question in four steps:

1. Identify which database in the estate is involved.
2. Name the likely causes from the runbooks.
3. Give the first checks and the fix, with a severity from the policy.
4. Say "not covered in the context" if the document has no answer.

## Estate at a glance

Meridian Pay runs seven databases on five engines; the two Tier 0 databases (ledger and payments) hold money state and get the fastest response.

| ID | System | Engine | Topology | Owner | Tier |
|---|---|---|---|---|---|
| LEDGER-DB | Double-entry ledger, balances | PostgreSQL 15 | 1 primary, 2 replicas | Ledger team | 0 |
| PAY-DB | Payments, transfers, idempotency keys | PostgreSQL 15 | 1 primary, 1 replica | Payments team | 0 |
| CUST-DB | Customers, KYC status | PostgreSQL 15 | 1 primary, 1 replica | Identity team | 1 |
| AUDIT-DB | Append-only audit trail | PostgreSQL 15 | 1 primary, no replica | Compliance | 1 |
| FX-CACHE | Live exchange rates | Redis 7 | 3-node cluster | Payments team | 1 |
| NOTIF-DB | Email and SMS delivery records | MongoDB 6 | 3-node replica set | Messaging team | 2 |
| WAREHOUSE | Analytics and reporting | BigQuery | Managed | Data team | 2 |

Tier meanings: **Tier 0** = money is wrong or cannot move if it fails. **Tier 1** = a customer-facing feature or a legal duty fails. **Tier 2** = internal or delayed impact only.

## Core databases and what normal looks like

Each database has a baseline; a reading outside it is the first sign of an incident.

### LEDGER-DB

- Stores every money movement as balanced debit and credit rows. Money is held as integer minor units (pence, cents), never floats.
- Key tables: `accounts`, `ledger_entries` (append-only), `balances` (derived), `currencies`.
- Normal: p95 query under 50 ms, replication lag under 1 s, connection use under 70% of 500.
- Rule: for every transaction, the sum of debits equals the sum of credits.

### PAY-DB

- Stores payment requests, transfer state and idempotency keys.
- Key tables: `payments`, `transfers`, `idempotency_keys` (unique on key), `payment_events`.
- Normal: p95 query under 80 ms, replication lag under 2 s, connection use under 70% of 400.
- Rule: a payment is created at most once per idempotency key.

### CUST-DB

- Stores customer profiles, KYC status and document references. Holds personal data (PII), so access is logged.
- Key tables: `customers`, `kyc_checks`, `documents`.
- Normal: p95 query under 100 ms, replication lag under 5 s.

### AUDIT-DB

- Append-only record of who did what and when; rows are never updated or deleted.
- Key tables: `audit_events`, partitioned by month.
- Normal: write latency under 20 ms; disk growth is steady and predictable.

### FX-CACHE

- Holds the latest exchange rate per currency pair with a 30-second TTL.
- Normal: hit rate above 95%, memory use under 75%.
- If it fails, payments fall back to the last rate stored in PAY-DB.

### NOTIF-DB and WAREHOUSE

- NOTIF-DB stores delivery records for email and SMS; WAREHOUSE receives copies of ledger and payment data for reporting.
- Neither is on the payment path: failures delay messages and reports but do not stop money.

## Data flows and dependencies

A payment reads rates and customer status, writes to PAY-DB and LEDGER-DB, and only those two can stop money from moving.

The payments service calls four databases (FX-CACHE, CUST-DB, PAY-DB, LEDGER-DB); LEDGER-DB also writes to AUDIT-DB, and the two money databases (PAY-DB and LEDGER-DB) feed WAREHOUSE with copies. WAREHOUSE and NOTIF-DB are off the payment path.

| If this fails | Effect | Fallback | Severity |
|---|---|---|---|
| LEDGER-DB | No payment completes; balances cannot update | None, payments pause | SEV1 |
| PAY-DB | No new payments or transfers; idempotency checks fail | None, payments pause | SEV1 |
| AUDIT-DB | Audit trail not written, a legal duty at risk | None | SEV2 |
| CUST-DB | KYC checks queue up | None | SEV3 |
| FX-CACHE | Rates come from the last value stored in PAY-DB | Last stored rate | SEV3 |
| WAREHOUSE, NOTIF-DB | Reports and messages arrive late | Not needed | SEV4 |

## Severity policy

Severity follows the worst effect on money or customers, not on how loud the alert is.

| Severity | When it applies | Examples | Respond within | Update every |
|---|---|---|---|---|
| SEV1 | Money is wrong, lost or cannot move | LEDGER-DB or PAY-DB down; ledger out of balance; duplicate charges; data loss | 5 min | 15 min |
| SEV2 | Money path degraded, or a legal duty at risk | Tier 0 replication lag over 60 s; payments slow but completing; AUDIT-DB not writing | 15 min | 30 min |
| SEV3 | A customer-facing feature is impaired | CUST-DB slow so KYC checks queue; FX-CACHE down with fallback working | 1 hour | 2 hours |
| SEV4 | Internal or delayed impact only | WAREHOUSE reports late; NOTIF-DB delays | Next working day | Daily |

Rules for choosing severity:

- Any sign that balances or charges are incorrect is SEV1 until proven otherwise.
- If two databases are affected, use the higher severity.
- Raise severity when the impact grows; never lower it during the incident.

## Common incidents and runbooks

Six incidents cover most pages; each lists the symptom, likely causes, first checks and the fix.

### 1. Connection pool exhausted (PAY-DB or LEDGER-DB)

- **Symptom:** errors like `too many connections` or requests timing out waiting for a connection.
- **Likely causes:** a slow query holding connections, a deploy that raised the pool size, a service that leaks connections.
- **First checks:** count connections by state and by application.

```sql
SELECT application_name, state, count(*)
FROM pg_stat_activity
GROUP BY 1, 2 ORDER BY 3 DESC;
```

- **Fix:** end idle-in-transaction sessions older than 5 minutes, roll back the recent deploy if it started the spike, then fix the leak. Severity: SEV1 on Tier 0.

### 2. Replication lag

- **Symptom:** replicas return stale data; lag alert above 60 s.
- **Likely causes:** a long-running transaction on the primary, a large batch write, a replica starved of I/O.
- **First checks:** compare lag per replica and find long transactions.

```sql
SELECT client_addr, replay_lag FROM pg_stat_replication;
SELECT pid, now() - xact_start AS age, query
FROM pg_stat_activity WHERE xact_start IS NOT NULL ORDER BY age DESC LIMIT 5;
```

- **Fix:** stop the batch job or the long transaction; send balance reads to the primary until lag recovers. Severity: SEV2 on Tier 0.

### 3. Slow queries and lock contention

- **Symptom:** p95 latency above baseline, many sessions waiting on locks.
- **Likely causes:** a missing index on `ledger_entries` or `payments`, a sequential scan after a data growth spike, a long transaction blocking updates.
- **First checks:** find blocked sessions and run `EXPLAIN (ANALYZE, BUFFERS)` on the slowest query.

```sql
SELECT pid, wait_event_type, wait_event, query
FROM pg_stat_activity WHERE wait_event_type = 'Lock';
```

- **Fix:** add the missing index with `CREATE INDEX CONCURRENTLY`; end the blocking session if it is safe to do so. Severity: SEV2 if payments still complete, SEV1 if they stop.

### 4. Duplicate payments

- **Symptom:** a customer is charged twice; two `payments` rows share the same request.
- **Likely causes:** retries without an idempotency key, or a missing unique constraint on `idempotency_keys.key`.
- **First checks:** find duplicates in the last hour.

```sql
SELECT idempotency_key, count(*)
FROM payments WHERE created_at > now() - interval '1 hour'
GROUP BY 1 HAVING count(*) > 1;
```

- **Fix:** pause the retrying service, reverse the duplicates through the ledger (never delete rows), and add the unique constraint. Severity: SEV1.

### 5. Ledger out of balance

- **Symptom:** the nightly check finds debits not equal to credits, or a balance differs from the sum of its entries.
- **Likely causes:** a transaction that wrote only one side, a float rounding bug, a manual data fix.
- **First checks:** find unbalanced transactions.

```sql
SELECT transaction_id, sum(amount_minor) AS net
FROM ledger_entries GROUP BY 1 HAVING sum(amount_minor) <> 0;
```

- **Fix:** freeze the affected accounts, write correcting entries (never edit history), and find the code path that wrote one side. Severity: SEV1.

### 6. Disk full or WAL growth

- **Symptom:** disk usage above 85%, writes failing, WAL directory growing.
- **Likely causes:** a stalled replica or replication slot holding WAL, runaway logging, a large unpartitioned table.
- **First checks:** check replication slots and the largest tables.

```sql
SELECT slot_name, active,
  pg_size_pretty(pg_wal_lsn_diff(pg_current_wal_lsn(), restart_lsn)) AS retained
FROM pg_replication_slots;
```

- **Fix:** restore or drop the stalled slot, expand the disk, then add retention or partitioning. Severity: SEV1 if writes fail, SEV2 otherwise.

## Ownership and escalation

Every database has one owning team and one incident channel; SEV1 always pulls in the Incident Commander.

| Database | Owning team | Incident channel | Escalate to |
|---|---|---|---|
| LEDGER-DB | Ledger team | #inc-ledger | Head of Engineering, then CTO |
| PAY-DB | Payments team | #inc-payments | Head of Engineering, then CTO |
| CUST-DB | Identity team | #inc-identity | Head of Engineering |
| AUDIT-DB | Compliance | #inc-compliance | Compliance Officer |
| FX-CACHE | Payments team | #inc-payments | Payments on-call lead |
| NOTIF-DB | Messaging team | #inc-messaging | Messaging on-call lead |
| WAREHOUSE | Data team | #inc-data | Data team lead |

The channels and roles above are sample placeholders. Replace them with your real ones.

## Glossary and rules for the AI

The assistant must follow these rules in every answer.

1. Answer only from this document. If it does not cover the question, say "not covered in the context" and name what is missing.
2. Always state the database ID involved, the severity and the owning team.
3. Give first checks before fixes, and never suggest deleting or editing ledger or audit rows; corrections are new entries.
4. Treat any hint of wrong balances or duplicate charges as SEV1.
5. Keep answers short: cause, check, fix, severity, escalation.
6. Tell the user that suggested SQL should be run on a replica first where possible, and reviewed by a person.

| Term | Meaning |
|---|---|
| Idempotency key | A unique value per payment request so a retry cannot create a second payment |
| Double-entry | Every transaction records equal debits and credits, so the ledger always balances |
| Minor units | The smallest currency unit stored as an integer, such as pence or cents |
| Replication lag | How far a replica is behind the primary |
| WAL | Write-ahead log, the change log Postgres uses for durability and replication |
| TTL | Time-to-live, how long a cached value is kept |
| PII | Personal data that must be access-logged and protected |
