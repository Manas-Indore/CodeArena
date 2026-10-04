const { spawn } = require('child_process');
const fs = require('fs/promises');
const path = require('path');
const { randomUUID } = require('crypto');

const TMP_ROOT = path.join(__dirname, '../../tmp/submissions');
const JUDGE_IMAGE = 'codearena-judge:latest';
const COMPILE_TIMEOUT_MS = 15000;
const DEFAULT_MEMORY_MB = 256;

// Each supported language: filename to write the code as, optional compile
// command (null = interpreted language, no compile step), and run command.
const LANGUAGE_CONFIG = {
  java: {
    filename: 'Main.java',
    compileCmd: ['javac', 'Main.java'],
    runCmd: ['java', 'Main'],
  },
  python: {
    filename: 'main.py',
    compileCmd: null,
    runCmd: ['python3', 'main.py'],
  },
  cpp: {
    filename: 'main.cpp',
    compileCmd: ['g++', '-O2', '-o', 'main', 'main.cpp'],
    runCmd: ['./main'],
  },
  javascript: {
    filename: 'main.js',
    compileCmd: null,
    runCmd: ['node', 'main.js'],
  },
};

// Runs a full submission (any supported language) against all test cases.
// Returns a verdict summary — never throws (errors are captured as verdicts).
async function runSubmission({ language, code, testCases, timeLimitMs = 2000, memoryLimitMb = DEFAULT_MEMORY_MB }) {
  const config = LANGUAGE_CONFIG[language];
  if (!config) {
    throw new Error(`Unsupported language: ${language}`);
  }

  const workDir = path.join(TMP_ROOT, randomUUID());
  await fs.mkdir(workDir, { recursive: true });

  try {
    await fs.writeFile(path.join(workDir, config.filename), code, 'utf-8');

    // ---- Compile step (skipped for interpreted languages) ----
    if (config.compileCmd) {
      const compileResult = await runInContainer(workDir, config.compileCmd, {
        timeoutMs: COMPILE_TIMEOUT_MS,
        input: null,
      });

      if (compileResult.exitCode !== 0) {
        return {
          verdict: 'compile_error',
          testsPassed: 0,
          testsTotal: testCases.length,
          runtimeMs: null,
          memoryKb: null,
          errorOutput: compileResult.stderr,
        };
      }
    }

    // ---- Run step (once per test case) ----
    let testsPassed = 0;
    let maxRuntimeMs = 0;
    let verdict = 'accepted';
    let errorOutput = null;

    for (const tc of testCases) {
      const runResult = await runInContainer(workDir, config.runCmd, {
        timeoutMs: timeLimitMs,
        input: tc.input,
        memoryLimitMb,
      });

      if (runResult.timedOut) {
        verdict = 'time_limit_exceeded';
        break;
      }

      if (runResult.exitCode !== 0) {
        verdict = 'runtime_error';
        errorOutput = runResult.stderr;
        break;
      }

      maxRuntimeMs = Math.max(maxRuntimeMs, runResult.durationMs);

      const actual = runResult.stdout.trim();
      const expected = tc.expected_output.trim();

      if (actual === expected) {
        testsPassed++;
      } else {
        verdict = 'wrong_answer';
        break;
      }
    }

    return {
      verdict,
      testsPassed,
      testsTotal: testCases.length,
      runtimeMs: maxRuntimeMs || null,
      memoryKb: null, // precise memory tracking deferred to a later day
      errorOutput,
    };
  } finally {
    await fs.rm(workDir, { recursive: true, force: true }).catch(() => {});
  }
}

// Generic container runner — used for both compile and run steps, any language.
function runInContainer(workDir, command, { timeoutMs, input, memoryLimitMb }) {
  return new Promise((resolve) => {
    const args = [
      'run', '-i', '--rm',
      '--network', 'none',
      '-v', `${workDir}:/code`,
      '-w', '/code',
    ];

    if (memoryLimitMb) {
      args.push(`--memory=${memoryLimitMb}m`, '--cpus=1', '--pids-limit=64');
    }

    args.push(JUDGE_IMAGE, ...command);

    const proc = spawn('docker', args);

    let stdout = '';
    let stderr = '';
    let timedOut = false;
    const startTime = Date.now();

    const timer = setTimeout(() => {
      timedOut = true;
      proc.kill('SIGKILL');
    }, timeoutMs);

    proc.stdout.on('data', (chunk) => { stdout += chunk.toString(); });
    proc.stderr.on('data', (chunk) => { stderr += chunk.toString(); });

    proc.on('close', (exitCode) => {
      clearTimeout(timer);
      resolve({ stdout, stderr, exitCode, timedOut, durationMs: Date.now() - startTime });
    });

    proc.on('error', (err) => {
      clearTimeout(timer);
      resolve({ stdout: '', stderr: err.message, exitCode: 1, timedOut: false, durationMs: Date.now() - startTime });
    });

    if (input !== null && input !== undefined) {
      proc.stdin.write(input);
    }
    proc.stdin.end();
  });
}

module.exports = { runSubmission, LANGUAGE_CONFIG };