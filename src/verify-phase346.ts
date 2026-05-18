import { buildChannelsCommandPayload } from "./gateway-channels";
import { buildDaemonCommandPayload } from "./gateway-daemon";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const flagOnlyChannels = buildChannelsCommandPayload(["--approved"]);
assert(!flagOnlyChannels.isError, "flag-only channels view renders overview");
assert(flagOnlyChannels.output.includes("Channels:"), "flag-only channels view renders overview heading");
assert(!flagOnlyChannels.output.includes("--approved"), "flag-only channels view does not echo stray flag");

const flaggedChannelsAuth = buildChannelsCommandPayload(["auth", "--approved"]);
assert(!flaggedChannelsAuth.isError, "flagged channels auth view still succeeds");
assert(flaggedChannelsAuth.output.includes("Channel Auth:"), "flagged channels auth view renders auth heading");
assert(!flaggedChannelsAuth.output.includes("--approved"), "flagged channels auth view does not echo stray flag");

const flaggedChannelsExternal = buildChannelsCommandPayload(["external", "--approved"]);
assert(!flaggedChannelsExternal.isError, "flagged channels external view still succeeds");
assert(flaggedChannelsExternal.output.includes("External Channel Adapter Gates:"), "flagged channels external view renders gates heading");
assert(!flaggedChannelsExternal.output.includes("--approved"), "flagged channels external view does not echo stray flag");

const secretChannels = buildChannelsCommandPayload(["ghp_CHANNELS_SHOULD_NOT_LEAK12345678"]);
assert(secretChannels.isError, "secret-shaped channels view remains rejected");
assert(secretChannels.output.includes("Unknown channels view '[REDACTED]'"), "secret-shaped channels view renders redacted label");
assert(!secretChannels.output.includes("CHANNELS_SHOULD_NOT_LEAK"), "secret-shaped channels view redacts token body");
assert(!secretChannels.output.includes("ghp_"), "secret-shaped channels view redacts token prefix");

const flagOnlyDaemon = buildDaemonCommandPayload(["--approved"]);
assert(!flagOnlyDaemon.isError, "flag-only daemon view renders overview");
assert(flagOnlyDaemon.output.includes("Daemon Control Plane:"), "flag-only daemon view renders overview heading");
assert(!flagOnlyDaemon.output.includes("--approved"), "flag-only daemon view does not echo stray flag");

const flaggedDaemonAuth = buildDaemonCommandPayload(["auth", "--approved"]);
assert(!flaggedDaemonAuth.isError, "flagged daemon auth view still succeeds");
assert(flaggedDaemonAuth.output.includes("Daemon Auth:"), "flagged daemon auth view renders auth heading");
assert(!flaggedDaemonAuth.output.includes("--approved"), "flagged daemon auth view does not echo stray flag");

const secretDaemon = buildDaemonCommandPayload(["github_pat_DAEMON_SHOULD_NOT_LEAK12345678"]);
assert(secretDaemon.isError, "secret-shaped daemon view remains rejected");
assert(secretDaemon.output.includes("Unknown daemon view '[REDACTED]'"), "secret-shaped daemon view renders redacted label");
assert(!secretDaemon.output.includes("DAEMON_SHOULD_NOT_LEAK"), "secret-shaped daemon view redacts token body");
assert(!secretDaemon.output.includes("github_pat_"), "secret-shaped daemon view redacts token prefix");

console.log("Phase 346: channels and daemon command inputs ignore flags and redact secrets.");
