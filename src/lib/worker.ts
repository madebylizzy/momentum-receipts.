import { prisma } from "./prisma";
import { CONFIG } from "./config";
import { extractReceiptData } from "./deepseek";

/**
 * In-Process Background Job Worker with strict Concurrency Capping.
 *
 * Ensures at most CONFIG.CONCURRENCY_CAP (2) DeepSeek API calls execute
 * simultaneously across all users and jobs.
 */
class JobWorker {
  private activeJobsCount = 0;
  private isProcessingQueue = false;

  public getActiveCount(): number {
    return this.activeJobsCount;
  }

  /**
   * Enqueues work / kicks off worker loop if capacity is available.
   */
  public trigger(): void {
    if (this.isProcessingQueue) return;
    this.processNextJobs().catch((err) => {
      console.error("[JobWorker] Unexpected error in worker loop:", err);
    });
  }

  /**
   * Processes PENDING jobs up to the concurrency cap.
   */
  private async processNextJobs(): Promise<void> {
    if (this.isProcessingQueue) return;
    this.isProcessingQueue = true;

    try {
      while (this.activeJobsCount < CONFIG.CONCURRENCY_CAP) {
        // Find next PENDING job in FIFO order
        const pendingJob = await prisma.job.findFirst({
          where: { status: "PENDING" },
          orderBy: { createdAt: "asc" },
        });

        if (!pendingJob) {
          // No more pending jobs to process
          break;
        }

        // Atomically claim the job to prevent duplicate processing
        const claimed = await prisma.job.updateMany({
          where: {
            id: pendingJob.id,
            status: "PENDING",
          },
          data: {
            status: "PROCESSING",
            attemptCount: { increment: 1 },
          },
        });

        if (claimed.count === 0) {
          // Another worker cycle or thread claimed it first
          continue;
        }

        // Launch job processing asynchronously within concurrency cap
        this.activeJobsCount++;
        this.processSingleJob(pendingJob.id, pendingJob.storageKey).finally(() => {
          this.activeJobsCount--;
          // Trigger next job when a slot frees up
          this.trigger();
        });
      }
    } finally {
      this.isProcessingQueue = false;
    }
  }

  /**
   * Processes an individual job: calls DeepSeek, validates output, and updates DB status.
   */
  private async processSingleJob(jobId: string, storageKey: string): Promise<void> {
    console.log(`[JobWorker] Starting job ${jobId} (Active calls: ${this.activeJobsCount}/${CONFIG.CONCURRENCY_CAP})`);

    try {
      const result = await extractReceiptData(storageKey);

      await prisma.job.update({
        where: { id: jobId },
        data: {
          status: "DONE",
          validatedResult: result.validatedResult as any,
          rawOutput: result.rawOutput,
          attemptCount: result.attemptCount,
          errorMessage: null,
        },
      });

      console.log(`[JobWorker] Job ${jobId} completed successfully (status: DONE).`);
    } catch (err: any) {
      console.error(`[JobWorker] Job ${jobId} failed:`, err.message);

      const rawOutput = err.rawOutput || null;
      const attemptCount = err.attemptCount || 1;
      const errorMessage = err.message || "An unexpected error occurred during receipt extraction.";

      await prisma.job.update({
        where: { id: jobId },
        data: {
          status: "FAILED",
          errorMessage,
          rawOutput,
          attemptCount,
        },
      });
    }
  }
}

// Global singleton worker instance across Next.js dev hot-reloads
const globalForWorker = globalThis as unknown as { jobWorker: JobWorker | undefined };
export const jobWorker = globalForWorker.jobWorker ?? new JobWorker();
if (process.env.NODE_ENV !== "production") globalForWorker.jobWorker = jobWorker;
