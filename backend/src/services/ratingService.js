const { calculateNewRatings } = require('./eloService');
const { getOrCreateRating, updateRating } = require('../models/ratingModel');
const { listParticipants, setParticipantRatingChange } = require('../models/matchModel');

// Applies Elo rating changes for everyone in a completed match.
// For 1v1 modes this is a single standard Elo update.
// For multiplayer (group_battle), the winner's delta vs each loser is
// averaged into one final update — a reasonable simplification of full
// multiplayer Elo, refinable later.
async function applyEloUpdates(matchId, mode, winnerUserId) {
  const participants = await listParticipants(matchId); // [{ user_id, username, result }]
  const losers = participants.filter((p) => p.user_id !== winnerUserId);

  if (losers.length === 0) return; // nothing to do (shouldn't happen in practice)

  const winnerRatingRow = await getOrCreateRating(winnerUserId, mode);
  const winnerStartRating = winnerRatingRow.rating;

  let winnerDeltaSum = 0;

  for (const loser of losers) {
    const loserRatingRow = await getOrCreateRating(loser.user_id, mode);
    const { newRatingA, newRatingB } = calculateNewRatings(winnerStartRating, loserRatingRow.rating, 1);

    await updateRating(loser.user_id, mode, { newRating: newRatingB, result: 'loss' });
    await setParticipantRatingChange(matchId, loser.user_id, loserRatingRow.rating, newRatingB);

    winnerDeltaSum += newRatingA - winnerStartRating;
  }

  const winnerFinalRating = Math.round(winnerStartRating + winnerDeltaSum / losers.length);
  await updateRating(winnerUserId, mode, { newRating: winnerFinalRating, result: 'win' });
  await setParticipantRatingChange(matchId, winnerUserId, winnerStartRating, winnerFinalRating);
}

module.exports = { applyEloUpdates };