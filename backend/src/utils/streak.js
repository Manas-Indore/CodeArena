// Converts 'YYYY-MM-DD' to a whole day number so we can compare days by simple subtraction.
function toDayNumber(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return Math.round(Date.UTC(y, m - 1, d) / 86400000);
}

// datesDesc: distinct 'YYYY-MM-DD' strings, newest first. todayStr: 'YYYY-MM-DD'.
// A streak stays alive if the latest completion is today OR yesterday.
function computeStreaks(datesDesc, todayStr) {
  if (datesDesc.length === 0) {
    return { current: 0, longest: 0, completedToday: false };
  }

  const days = datesDesc.map(toDayNumber);
  const today = toDayNumber(todayStr);
  const completedToday = days[0] === today;

  let current = 0;
  if (days[0] === today || days[0] === today - 1) {
    current = 1;
    for (let i = 1; i < days.length; i++) {
      if (days[i] === days[i - 1] - 1) current++;
      else break;
    }
  }

  let longest = 1;
  let run = 1;
  for (let i = 1; i < days.length; i++) {
    if (days[i] === days[i - 1] - 1) {
      run++;
      if (run > longest) longest = run;
    } else {
      run = 1;
    }
  }

  return { current, longest, completedToday };
}

module.exports = { computeStreaks };