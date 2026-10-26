'use strict';

const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const { test } = require('node:test');
const { buildAgentShellCommand, shellQuote } = require('../src/session-command');

test('shellQuote preserves shell metacharacters as literal text', () => {
  const payload = "agent $(printf injected) 'quoted'";
  const output = execFileSync('/bin/bash', [
    '-c',
    `printf %s ${shellQuote(payload)}`,
  ], { encoding: 'utf8' });

  assert.equal(output, payload);
});

test('agent exit labels are quoted in the fallback command', () => {
  const command = buildAgentShellCommand({
    command: 'missing-agent',
    args: ['--mode', 'safe value'],
    name: '$(touch /tmp/switchboard-injected)',
  });

  assert.equal(
    command,
    "'missing-agent' '--mode' 'safe value'; echo; echo '[$(touch /tmp/switchboard-injected) exited — starting shell]'; exec bash -l",
  );
});
