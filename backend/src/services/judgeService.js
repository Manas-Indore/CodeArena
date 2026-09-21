const { spawn } = require('child_process');
const fs = require('fs/promises');
const path = require('path');
const { randomUUID } = require('crypto');

const TMP_ROOT = path.join(__dirname, '../../tmp/submissions');
const JAVA_IMAGE = 'eclipse-temurin:17-jdk-alpine';
const COMPILE_TIMEOUT_MS = 10000;
const DEFAULT_MEMORY_MB = 256;

// Runs a full Java submission against all provided test cases.
// Returns a verdict summary — never throws (errors are captured as verdicts).
async function runJavaSubmission({ code, testCases, timeLimitMs = 2000, memoryLimitMb = DEFAULT_MEMORY_MB }) {
  const workDir = path.join(TMP_ROOT, randomUUID());
  await fs.mkdir(workDir, { recursive: true });

  try {
    // Submitted code MUST define: public class Main { public static void main(String[] args) {...} }
    await fs.writeFile(path.join(workDir, 'Main.java'), code, 'utf-8');

    // ---- Compile step (once) ----
    const compileResult = await compileJava(workDir);
    if (!compileResult.success) {
      return {
        verdict: 'compile_error',
        testsPassed: 0,
        testsTotal: testCases.length,
        runtimeMs: null,
        memoryKb: null,
        errorOutput: compileResult.stderr,
      };
    }

    // ---- Run step (once per test case) ----
    let testsPassed = 0;
    let maxRuntimeMs = 0;
    let verdict = 'accepted';
    let errorOutput = null;

    for (const tc of testCases) {
      const runResult = await runJava(workDir, tc.input, timeLimitMs, memoryLimitMb);

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
      memoryKb: null, // precise memory tracking deferred — needs docker stats, out of scope for Day 5
      errorOutput,
    };
  } finally {
    await fs.rm(workDir, { recursive: true, force: true }).catch(() => {});
  }
}

function compileJava(workDir) {
  return new Promise((resolve) => {
    const args = [
      'run', '--rm',
      '--network', 'none',
      '-v', `${workDir}:/code`,
      '-w', '/code',
      JAVA_IMAGE,
      'javac', 'Main.java',
    ];

    const proc = spawn('docker', args);
    let stderr = '';

    const timer = setTimeout(() => proc.kill('SIGKILL'), COMPILE_TIMEOUT_MS);

    proc.stderr.on('data', (chunk) => { stderr += chunk.toString(); });

    proc.on('close', (exitCode) => {
      clearTimeout(timer);
      resolve({ success: exitCode === 0, stderr });
    });

    proc.on('error', (err) => {
      clearTimeout(timer);
      resolve({ success: false, stderr: err.message });
    });
  });
}

function runJava(workDir, input, timeLimitMs, memoryLimitMb) {
  return new Promise((resolve) => {
    const args = [
      'run', '-i', '--rm',
      '--network', 'none',
      `--memory=${memoryLimitMb}m`,
      '--cpus=1',
      '--pids-limit=64',
      '-v', `${workDir}:/code`,
      '-w', '/code',
      JAVA_IMAGE,
      'java', 'Main',
    ];

    const proc = spawn('docker', args);

    let stdout = '';
    let stderr = '';
    let timedOut = false;
    const startTime = Date.now();

    const timer = setTimeout(() => {
      timedOut = true;
      proc.kill('SIGKILL');
    }, timeLimitMs);

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

    proc.stdin.write(input);
    proc.stdin.end();
  });
}

module.exports = { runJavaSubmission };