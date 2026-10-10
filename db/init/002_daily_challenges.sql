-- One challenge problem per calendar day
CREATE TABLE daily_challenges (
    challenge_date  DATE PRIMARY KEY,
    problem_id      UUID NOT NULL REFERENCES problems(id) ON DELETE CASCADE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Which user completed which day's challenge (one row per user per day)
CREATE TABLE daily_challenge_completions (
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    challenge_date  DATE NOT NULL REFERENCES daily_challenges(challenge_date) ON DELETE CASCADE,
    submission_id   UUID REFERENCES submissions(id) ON DELETE SET NULL,
    completed_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (user_id, challenge_date)
);

CREATE INDEX idx_daily_completions_user
    ON daily_challenge_completions(user_id, challenge_date DESC);