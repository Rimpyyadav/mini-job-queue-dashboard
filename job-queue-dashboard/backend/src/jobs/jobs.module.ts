import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JobsController } from './jobs.controller';
import { JobsService } from './jobs.service';
import { Job, JobTransition } from './job.entity';
import { TransactionRunner } from '../common/transaction-runner';

@Module({
  imports: [TypeOrmModule.forFeature([Job, JobTransition])],
  controllers: [JobsController],
  providers: [JobsService, TransactionRunner],
})
export class JobsModule {}
