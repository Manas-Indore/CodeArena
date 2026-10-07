const K_FACTOR = 32;

function expectedScore(ratingA, ratingB) {
  return 1 / (1 + Math.pow(10, (ratingB - ratingA) / 400));
}

// scoreA: 1 = A won, 0 = A lost, 0.5 = draw
function calculateNewRatings(ratingA, ratingB, scoreA) {
  const expectedA = expectedScore(ratingA, ratingB);
  const expectedB = 1 - expectedA;
  const scoreB = 1 - scoreA;

  const newRatingA = Math.round(ratingA + K_FACTOR * (scoreA - expectedA));
  const newRatingB = Math.round(ratingB + K_FACTOR * (scoreB - expectedB));

  return { newRatingA, newRatingB };
}

module.exports = { calculateNewRatings };