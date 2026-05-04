// GPS poller scheduler — STUB.
//
// Phase 1 did NOT add BullMQ (no `bullmq` / `@nestjs/bullmq` in package.json).
// Per the wave brief, we DO NOT add the dep here; instead we leave this
// scaffold as a clear TODO so Phase 9 (or whenever BullMQ lands) only needs
// to fill in the @Processor and the OnApplicationBootstrap registration.
//
// In the meantime, cache population is on-demand via `POST /api/v1/integrations
// /gps/refresh` (admin only) — see GpsController.refresh.
//
// Once BullMQ is added the implementation will look like:
//
//   import { InjectQueue, Processor, WorkerHost } from '@nestjs/bullmq';
//   import { Queue, Job } from 'bullmq';
//
//   @Injectable()
//   export class GpsScheduler implements OnApplicationBootstrap {
//     constructor(@InjectQueue('gps-poll') private q: Queue) {}
//     async onApplicationBootstrap() {
//       await this.q.add('poll', {}, {
//         repeat: { every: GPS_POLL_INTERVAL_SEC * 1000 },
//         jobId: 'gps-poll-cron',  // static — no duplicates on restart.
//       });
//     }
//   }
//
//   @Processor('gps-poll')
//   export class GpsPollProcessor extends WorkerHost {
//     constructor(private gps: GpsService) { super(); }
//     async process(_job: Job): Promise<void> {
//       await this.gps.populateFromProvider({ kind: 'all' });
//     }
//   }

export const GPS_SCHEDULER_PLACEHOLDER = true;
