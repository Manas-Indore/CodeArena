-- =========================================================
-- CodeArena — Core Schema (Day 2)
-- =========================================================

-- Enable UUID generation
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ---------------------------------------------------------
-- ENUM TYPES
-- ---------------------------------------------------------

CREATE TYPE difficulty_level AS ENUM ('easy', 'medium', 'hard');

CREATE TYPE submission_language AS ENUM ('python', 'cpp', 'java', 'javascript');

CREATE TYPE submission_verdict AS ENUM (
    'pending',
    'accepted',
    'wrong_answer',
    'time_limit_exceeded',
    'memory_limit_exceeded',
    'runtime_error',
    'compile_error'
);

CREATE TYPE duel_mode AS ENUM (
    'speed_coding',
    'debug_duel',
    'elite_challenge',
    'group_battle',
    'open_battle'
);

CREATE TYPE match_status AS ENUM (
    'waiting',
    'in_progress',
    'completed',
    'cancelled'
);

CREATE TYPE participant_result AS ENUM ('win', 'loss', 'draw', 'pending');

CREATE TYPE friendship_status AS ENUM ('pending', 'accepted', 'blocked');

-- ---------------------------------------------------------
-- USERS
-- ---------------------------------------------------------

CREATE TABLE users (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    username        VARCHAR(30) UNIQUE NOT NULL,
    email           VARCHAR(255) UNIQUE NOT NULL,
    password_hash   VARCHAR(255) NOT NULL,
    avatar_url      TEXT,
    is_admin        BOOLEAN NOT NULL DEFAULT FALSE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ---------------------------------------------------------
-- PROBLEMS
-- ---------------------------------------------------------

CREATE TABLE problems (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title           VARCHAR(150) NOT NULL,
    slug            VARCHAR(160) UNIQUE NOT NULL,
    description     TEXT NOT NULL,
    difficulty      difficulty_level NOT NULL,
    time_limit_ms   INTEGER NOT NULL DEFAULT 2000,
    memory_limit_mb INTEGER NOT NULL DEFAULT 256,
    created_by      UUID REFERENCES users(id) ON DELETE SET NULL,
    is_published    BOOLEAN NOT NULL DEFAULT FALSE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_problems_difficulty ON problems(difficulty);
CREATE INDEX idx_problems_published ON problems(is_published);

-- ---------------------------------------------------------
-- TEST CASES
-- ---------------------------------------------------------

CREATE TABLE test_cases (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    problem_id      UUID NOT NULL REFERENCES problems(id) ON DELETE CASCADE,
    input           TEXT NOT NULL,
    expected_output TEXT NOT NULL,
    is_sample       BOOLEAN NOT NULL DEFAULT FALSE,  -- sample cases shown to user, hidden ones used for real judging
    order_index     INTEGER NOT NULL DEFAULT 0,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_test_cases_problem ON test_cases(problem_id);

-- ---------------------------------------------------------
-- MATCHES (online mode games — practice mode doesn't use this table)
-- ---------------------------------------------------------

CREATE TABLE matches (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    mode            duel_mode NOT NULL,
    status          match_status NOT NULL DEFAULT 'waiting',
    problem_id      UUID REFERENCES problems(id) ON DELETE SET NULL,
    max_players     INTEGER NOT NULL DEFAULT 2,
    min_rating      INTEGER,              -- NULL for open battles (no rating gate)
    started_at      TIMESTAMPTZ,
    ended_at        TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_matches_mode_status ON matches(mode, status);

-- ---------------------------------------------------------
-- SUBMISSIONS
-- ---------------------------------------------------------

CREATE TABLE submissions (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    problem_id      UUID NOT NULL REFERENCES problems(id) ON DELETE CASCADE,
    match_id        UUID REFERENCES matches(id) ON DELETE SET NULL, -- NULL = practice mode submission
    language        submission_language NOT NULL,
    code            TEXT NOT NULL,
    verdict         submission_verdict NOT NULL DEFAULT 'pending',
    runtime_ms      INTEGER,
    memory_kb       INTEGER,
    tests_passed    INTEGER NOT NULL DEFAULT 0,
    tests_total     INTEGER NOT NULL DEFAULT 0,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_submissions_user ON submissions(user_id);
CREATE INDEX idx_submissions_problem ON submissions(problem_id);
CREATE INDEX idx_submissions_match ON submissions(match_id);

-- ---------------------------------------------------------
-- MATCH PARTICIPANTS
-- ---------------------------------------------------------

CREATE TABLE match_participants (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    match_id        UUID NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    submission_id   UUID REFERENCES submissions(id) ON DELETE SET NULL,
    result          participant_result NOT NULL DEFAULT 'pending',
    rating_before   INTEGER,
    rating_after    INTEGER,
    joined_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (match_id, user_id)
);

CREATE INDEX idx_match_participants_match ON match_participants(match_id);
CREATE INDEX idx_match_participants_user ON match_participants(user_id);

-- ---------------------------------------------------------
-- RATINGS (separate Elo per duel mode)
-- ---------------------------------------------------------

CREATE TABLE ratings (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    mode            duel_mode NOT NULL,
    rating          INTEGER NOT NULL DEFAULT 1200,
    games_played    INTEGER NOT NULL DEFAULT 0,
    wins            INTEGER NOT NULL DEFAULT 0,
    losses          INTEGER NOT NULL DEFAULT 0,
    draws           INTEGER NOT NULL DEFAULT 0,
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (user_id, mode)
);

CREATE INDEX idx_ratings_mode_rating ON ratings(mode, rating DESC);

-- ---------------------------------------------------------
-- FRIENDSHIPS
-- ---------------------------------------------------------

CREATE TABLE friendships (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    requester_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    addressee_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    status          friendship_status NOT NULL DEFAULT 'pending',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (requester_id, addressee_id),
    CHECK (requester_id <> addressee_id)
);

CREATE INDEX idx_friendships_requester ON friendships(requester_id);
CREATE INDEX idx_friendships_addressee ON friendships(addressee_id);