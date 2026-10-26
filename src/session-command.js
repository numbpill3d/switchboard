'use strict';

function shellQuote(value) {
  return `'${String(value).replace(/'/g, `'\\''`)}'`;
}

function buildAgentShellCommand(profile) {
  const command = [profile.command, ...(profile.args || [])]
    .map(shellQuote)
    .join(' ');
  const label = profile.name || profile.command;
  const exitMessage = shellQuote(`[${label} exited — starting shell]`);
  return `${command}; echo; echo ${exitMessage}; exec bash -l`;
}

module.exports = { buildAgentShellCommand, shellQuote };
