require('dotenv').config();
const { Worker } = require('bullmq');

const { connection } = require('./src/config/queue');
const { getSubmissionById, updateSubmissionResult } = require('./src/models/submissionModel');
const { getProblemById, getAllTestCasesByProblemId } = require('./src/models/problemModel');
const { completeMatch } = require('./src/models/matchModel');
const { publishMatchEvent } = require('./src/config/redisPubSub');
const { runSubmission } = require('./src/services/judgeService');
const { applyEloUpdates } = require('./src/services/ratingService');

console.log('Judge worker started, waiting for jobs...');

const worker = new Worker(
  'submissions',
  async (job) => {
    const { submissionId } = job.data;
    console.log(`Processing submission ${submissionId}`);

    const submission = await getSubmissionById(submissionId);
    if (!submission) {
      console.error(`Submission ${submissionId} not found`);
      return;
    }

    const problem = await getProblemById(submission.problem_id);
    if (!problem) {
      console.error(`Problem ${submission.problem_id} not found`);
      return;
    }

    const testCases = await getAllTestCasesByProblemId(problem.id);

    const judgeResult = await runSubmission({
      language: submission.language,
      code: submission.code,
      testCases,
      timeLimitMs: problem.time_limit_ms,
      memoryLimitMb: problem.memory_limit_mb,
    });

    await updateSubmissionResult(submissionId, {
      verdict: judgeResult.verdict,
      runtimeMs: judgeResult.runtimeMs,
      memoryKb: judgeResult.memoryKb,
      testsPassed: judgeResult.testsPassed,
      testsTotal: judgeResult.testsTotal,
    });

    console.log(`Submission ${submissionId} verdict: ${judgeResult.verdict}`);

    if (submission.match_id) {
      await publishMatchEvent({
        matchId: submission.match_id,
        type: 'progress_update',
        payload: {
          userId: submission.user_id,
          verdict: judgeResult.verdict,
          testsPassed: judgeResult.testsPassed,
          testsTotal: judgeResult.testsTotal,
        },
      });

      if (judgeResult.verdict === 'accepted') {
        const completed = await completeMatch(submission.match_id, submission.user_id);
        if (completed) {
          await publishMatchEvent({
            matchId: submission.match_id,
            type: 'match_completed',
            payload: { winnerUserId: submission.user_id },
          });
          console.log(`Match ${submission.match_id} completed — winner: ${submission.user_id}`);

          // Open Battles are casual — no rating impact. Everything else counts.
          if (completed.mode !== 'open_battle') {
            await applyEloUpdates(completed.id, completed.mode, submission.user_id);
            console.log(`Elo updated for match ${completed.id} (mode: ${completed.mode})`);
          }
        }
      }
    }
  },
  { connection, concurrency: 2 }
);

worker.on('failed', (job, err) => {
  console.error(`Job ${job.id} failed:`, err.message);
});