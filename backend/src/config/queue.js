const { Queue } = require('bullmq');
const IORedis = require('ioredis');

// BullMQ requires this specific setting on the connection it uses for blocking ops
const connection = new IORedis(process.env.REDIS_URL, {
  maxRetriesPerRequest: null,
});

const submissionQueue = new Queue('submissions', { connection });

module.exports = { submissionQueue, connection };