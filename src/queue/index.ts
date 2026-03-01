import { Queue, Worker, Job } from 'bullmq';
import IORedis from 'ioredis';
import type { GenerationJob } from '../types/index.js';

// Redis connection
const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
const connection = new IORedis(redisUrl, {
  maxRetriesPerRequest: null,
  enableReadyCheck: false
});

// Job queue
export const generationQueue = new Queue('video-generation', {
  connection,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 1000
    },
    removeOnComplete: 100,
    removeOnFail: 50
  }
});

// Worker processor (to be implemented)
export function createGenerationWorker(processor: (job: Job<GenerationJob>) => Promise<void>) {
  return new Worker('video-generation', processor, { connection });
}

// Add job to queue
export async function addGenerationJob(job: GenerationJob): Promise<Job> {
  return generationQueue.add(job.id, job, {
    jobId: job.id,
    priority: job.attempts === 0 ? 1 : 5 // Lower priority for retries
  });
}

// Get job status
export async function getJobStatus(jobId: string) {
  const job = await generationQueue.getJob(jobId);
  if (!job) return null;
  
  return {
    id: job.id,
    state: await job.getState(),
    progress: job.progress,
    attempts: job.attemptsMade,
    timestamp: job.timestamp
  };
}
