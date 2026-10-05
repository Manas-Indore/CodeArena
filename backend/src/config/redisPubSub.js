const IORedis = require('ioredis');

const MATCH_EVENTS_CHANNEL = 'match-events';

const publisher = new IORedis(process.env.REDIS_URL);

async function publishMatchEvent(event) {
  // event: { matchId, type, payload }
  await publisher.publish(MATCH_EVENTS_CHANNEL, JSON.stringify(event));
}

module.exports = { publishMatchEvent, MATCH_EVENTS_CHANNEL };