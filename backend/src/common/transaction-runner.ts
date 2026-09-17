import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, EntityManager } from 'typeorm';

/**
 * Runs a unit of work in a database transaction.
 *
 * On Postgres this is a thin pass-through: the pool hands each request its own
 * connection, so transactions run genuinely in parallel and the database sorts
 * out contention with row locks.
 *
 * SQLite has no connection pool in TypeORM — every query in the process shares
 * one connection — so two overlapping transactions produce
 * "cannot start a transaction within a transaction". Where the driver is SQLite,
 * transactions are therefore queued so only one is open at a time.
 *
 * Note what this queue is and is not doing. It is not what makes the status
 * transition safe; the guarded UPDATE in JobsService does that, and it would
 * still be correct with this queue removed and several server instances running.
 * The queue only works around a single-connection driver, which is also why
 * SQLite is the local default and Postgres is the deployed database.
 */
@Injectable()
export class TransactionRunner {
  private readonly mustSerialize: boolean;
  private tail: Promise<unknown> = Promise.resolve();

  constructor(@InjectDataSource() private readonly dataSource: DataSource) {
    this.mustSerialize = this.dataSource.options.type === 'sqlite';
  }

  run<T>(work: (manager: EntityManager) => Promise<T>): Promise<T> {
    if (!this.mustSerialize) {
      return this.dataSource.transaction(work);
    }

    const result = this.tail.then(() => this.dataSource.transaction(work));
    // Keep the chain alive regardless of whether this unit of work failed.
    this.tail = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }
}
