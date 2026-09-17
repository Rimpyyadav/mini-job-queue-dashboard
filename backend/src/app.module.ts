import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JobsModule } from './jobs/jobs.module';
import { Job, JobTransition } from './jobs/job.entity';
import { HealthController } from './common/health.controller';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const entities = [Job, JobTransition];
        const isPostgres = config.get('DB_TYPE') === 'postgres';

        if (isPostgres) {
          return {
            type: 'postgres' as const,
            url: config.get<string>('DATABASE_URL'),
            entities,
            // Fine for an assignment. For a real deployment this would be off
            // and schema changes would go through generated migrations.
            synchronize: true,
            ssl: config.get('DB_SSL') === 'false' ? false : { rejectUnauthorized: false },
          };
        }

        return {
          type: 'sqlite' as const,
          database: config.get<string>('SQLITE_PATH') ?? 'data/jobs.sqlite',
          entities,
          synchronize: true,
          // Write-ahead logging lets readers proceed while a write is in flight.
          enableWAL: true,
        };
      },
    }),
    JobsModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
