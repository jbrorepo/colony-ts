/** Phase 118 Verification - Slack Media Metadata Inspection */

import {
  ChannelAuthPolicy,
  ChannelRegistry,
  ChannelSessionBridge,
  InMemoryChannelAdapter,
  handleExternalChannelVendorWebhookRequest,
  type ChannelSessionRequest,
} from "./channel";

let passed = 0;
let failed = 0;
function assert(condition: boolean, label: string): void {
  if (condition) { console.log(`  PASS ${label}`); passed++; } else { console.error(`  FAIL ${label}`); failed++; }
}
function assertEqual<T>(actual: T, expected: T, label: string): void {
  assert(actual === expected, `${label}${actual === expected ? "" : ` - expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`}`);
}
function section(title: string): void { console.log(`\n${"=".repeat(60)}\n  ${title}\n${"=".repeat(60)}`); }

const HOST_SECRET = "phase118-host-secret";
const CALLBACK_URL = "https://hooks.example.com/api/channels/slack/external-event";

function createSlackAuth(): ChannelAuthPolicy {
  return new ChannelAuthPolicy({
    channels: {
      slack: {
        webhookSecret: HOST_SECRET,
        groupPolicy: "open",
      },
    },
  });
}

function createSlackHarness(): {
  bridge: ChannelSessionBridge;
  adapter: InMemoryChannelAdapter;
  seen: ChannelSessionRequest[];
  releaseRunner: () => void;
} {
  const registry = new ChannelRegistry();
  const adapter = new InMemoryChannelAdapter({ channelId: "slack" });
  registry.register(adapter);
  const seen: ChannelSessionRequest[] = [];
  let releaseRunner: (() => void) | undefined;
  const runnerGate = new Promise<void>((resolve) => { releaseRunner = resolve; });
  const bridge = new ChannelSessionBridge({
    registry,
    now: () => "2026-05-08T04:41:00.000Z",
    sessionRunner: async (request) => {
      seen.push(request);
      await runnerGate;
      return { text: `reply:${request.message.messageId}` };
    },
  });
  return { bridge, adapter, seen, releaseRunner: () => releaseRunner?.() };
}

function slackFile(index: number, overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: `F118${index}`,
    name: `operator-notes-${index}.pdf`,
    title: `Operator notes ${index}`,
    mimetype: "application/pdf",
    filetype: "pdf",
    size: 12345 + index,
    url_private: `https://files.slack.com/files-pri/T118-F118${index}/operator-notes.pdf?token=xoxb-phase118-secret`,
    permalink: `https://example.slack.com/files/U118/F118${index}/operator-notes?secret=phase118`,
    thumb_64: `https://files.slack.com/thumb/F118${index}?api_key=phase118-secret`,
    user: "U118",
    ...overrides,
  };
}

function longText(length: number): string {
  return "x".repeat(length);
}

function repeatedSensitiveTokenText(count: number): string {
  return Array.from({ length: count }, (_, index) => `xoxp-${index}`).join(" ");
}

function slackFileShareEvent(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    type: "event_callback",
    token: "xoxb-phase118-secret",
    team_id: "T118",
    api_app_id: "A118PHASE",
    event: {
      type: "message",
      subtype: "file_share",
      user: "U118",
      channel: "C118",
      ts: "171000.1180",
      thread_ts: "171000.1179",
      client_msg_id: "client-118-file-share",
      files: [slackFile(0, { name: "operator-notes.pdf", title: "Operator notes" })],
    },
    ...overrides,
  };
}

function slackAppMentionWithFiles(): Record<string, unknown> {
  return {
    type: "event_callback",
    token: "xoxb-phase118-secret",
    team_id: "T118",
    api_app_id: "A118PHASE",
    event: {
      type: "app_mention",
      user: "U118",
      text: "<@UCOLONY> inspect the attached files",
      channel: "C118",
      ts: "171000.1181",
      thread_ts: "171000.1179",
      client_msg_id: "client-118-app-mention-files",
      files: Array.from({ length: 7 }, (_, index) => slackFile(index, index === 1 ? { name: "xoxb-phase118-secret-notes.txt" } : {})),
    },
  };
}

async function postSlackEvent(bridge: ChannelSessionBridge, body: Record<string, unknown>): Promise<Response> {
  return await handleExternalChannelVendorWebhookRequest(new Request(CALLBACK_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-channel-secret": HOST_SECRET,
    },
    body: JSON.stringify(body),
  }), {
    bridge,
    authPolicy: createSlackAuth(),
    vendorSignatureVerifier: () => ({ accepted: true, code: "signature_verified", reason: "ok" }),
  });
}

async function readJson(response: Response): Promise<Record<string, unknown>> {
  return await response.json() as Record<string, unknown>;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function mediaAttachments(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? value.filter((item): item is Record<string, unknown> => typeof item === "object" && item !== null && !Array.isArray(item)) : [];
}

function containsSensitive(value: unknown): boolean {
  const text = JSON.stringify(value);
  return text.includes(HOST_SECRET) ||
    text.includes("xoxb-phase118-secret") ||
    text.includes("phase118-secret") ||
    text.includes("files.slack.com") ||
    text.includes("url_private") ||
    text.includes("permalink") ||
    text.includes("thumb_64");
}

async function verifySlackFileShareAcceptedWithSafeMetadata(): Promise<void> {
  section("1. Slack file_share Message Preserves Safe Media Metadata");
  const { bridge, adapter, seen, releaseRunner } = createSlackHarness();
  const response = await postSlackEvent(bridge, slackFileShareEvent());
  const body = await readJson(response);

  assertEqual(response.status, 202, "Slack file_share callback receives accepted ACK");
  assertEqual(body.turnStatus, "deferred", "Slack file_share keeps deferred turn status");
  await delay(5);
  assertEqual(seen.length, 1, "Slack file_share dispatches runner once");
  assertEqual(seen[0]?.message.messageId, "client-118-file-share", "Slack file_share client_msg_id becomes message id");
  assertEqual(seen[0]?.message.text, "Slack file shared: operator-notes.pdf", "Slack file_share without text gets exact fallback text");
  assertEqual(seen[0]?.message.target.threadId, "171000.1179", "Slack file_share thread route is preserved");
  const attachments = mediaAttachments(seen[0]?.message.metadata?.mediaAttachments);
  assertEqual(attachments.length, 1, "Slack file_share stores one safe media attachment");
  assertEqual(attachments[0]?.source, "slack", "Slack media attachment records source");
  assertEqual(attachments[0]?.id, "F1180", "Slack media attachment preserves file id");
  assertEqual(attachments[0]?.name, "operator-notes.pdf", "Slack media attachment preserves safe file name");
  assertEqual(attachments[0]?.title, "Operator notes", "Slack media attachment preserves safe title");
  assertEqual(attachments[0]?.mimeType, "application/pdf", "Slack media attachment preserves mime type");
  assertEqual(attachments[0]?.fileType, "pdf", "Slack media attachment preserves file type");
  assertEqual(attachments[0]?.sizeBytes, 12345, "Slack media attachment preserves bounded size");
  assertEqual(seen[0]?.message.metadata?.mediaAttachmentCount, 1, "Slack media metadata records total attachment count");
  assertEqual(seen[0]?.message.metadata?.mediaAttachmentTruncated, false, "Slack media metadata records non-truncated state");
  assert(!containsSensitive([body, seen[0]?.message.metadata]), "Slack file_share ACK and metadata leak no token, host secret, private URL, permalink, or thumbnail URL");
  releaseRunner();
  await delay(5);
  assertEqual(adapter.sentMessages.length, 1, "Slack file_share async reply still delivers through adapter");
}

async function verifySlackAppMentionFilesAreBoundedAndRedacted(): Promise<void> {
  section("2. Slack app_mention Files Are Bounded and Redacted");
  const { bridge, seen, releaseRunner } = createSlackHarness();
  const response = await postSlackEvent(bridge, slackAppMentionWithFiles());
  const body = await readJson(response);

  assertEqual(response.status, 202, "Slack app_mention with files receives accepted ACK");
  await delay(5);
  assertEqual(seen.length, 1, "Slack app_mention with files dispatches runner once");
  assertEqual(seen[0]?.message.text, "<@UCOLONY> inspect the attached files", "Slack app_mention keeps explicit user text");
  const attachments = mediaAttachments(seen[0]?.message.metadata?.mediaAttachments);
  assertEqual(attachments.length, 5, "Slack media metadata stores at most five attachments");
  assertEqual(seen[0]?.message.metadata?.mediaAttachmentCount, 7, "Slack media metadata records full attachment count");
  assertEqual(seen[0]?.message.metadata?.mediaAttachmentTruncated, true, "Slack media metadata reports truncation");
  assertEqual(attachments[1]?.name, "[REDACTED].txt", "Slack media metadata redacts token-like file names");
  assert(!containsSensitive([body, seen[0]?.message.metadata]), "bounded Slack media metadata leaks no token, host secret, private URL, permalink, or thumbnail URL");
  releaseRunner();
}

async function verifySlackNonFileShareSubtypeStillIgnored(): Promise<void> {
  section("3. Slack Non-file Message Subtypes Stay Ignored");
  const { bridge, seen, releaseRunner } = createSlackHarness();
  const response = await postSlackEvent(bridge, slackFileShareEvent({
    event: {
      type: "message",
      subtype: "bot_message",
      user: "U118",
      text: "bot text xoxb-phase118-secret",
      channel: "C118",
      ts: "171000.1182",
      files: [slackFile(0)],
    },
  }));
  const body = await readJson(response);

  assertEqual(response.status, 400, "Slack non-file message subtype remains rejected");
  assertEqual(body.accepted, false, "Slack non-file message subtype is not accepted");
  assertEqual(bridge.status().routeCount, 0, "Slack non-file message subtype creates no route");
  await delay(5);
  assertEqual(seen.length, 0, "Slack non-file message subtype dispatches no runner");
  assert(!containsSensitive(body), "Slack non-file subtype rejection leaks no token, host secret, or private media URL");
  releaseRunner();
}

async function verifySlackMediaMetadataRedactsEmbeddedUrlAndTokenFamilies(): Promise<void> {
  section("4. Slack Media Metadata Redacts Embedded URLs and Token Families");
  const { bridge, seen, releaseRunner } = createSlackHarness();
  const response = await postSlackEvent(bridge, slackFileShareEvent({
    event: {
      type: "message",
      subtype: "file_share",
      user: "U118",
      channel: "C118",
      ts: "171000.1183",
      client_msg_id: "client-118-url-token",
      files: [slackFile(3, {
        name: "see https://files.slack.com/files-pri/T118-F1183/private.pdf",
        title: "xoxp-phase118-secret-token and xapp-phase118-secret-token",
        pretty_type: "secret-ish https://example.slack.com/files/U118/F1183/private",
      })],
    },
  }));
  await readJson(response);
  await delay(5);
  const attachments = mediaAttachments(seen[0]?.message.metadata?.mediaAttachments);

  assertEqual(response.status, 202, "Slack file metadata with embedded URL/token families is accepted after redaction");
  assertEqual(attachments[0]?.name, "see [REDACTED_URL]", "Slack private file URL embedded in file name is redacted");
  assertEqual(attachments[0]?.title, "[REDACTED] and [REDACTED]", "Slack xoxp/xapp token families embedded in title are redacted");
  assertEqual(attachments[0]?.prettyType, "secret-ish [REDACTED_URL]", "Slack URL embedded in pretty type is redacted");
  assert(!containsSensitive([seen[0]?.message.metadata]), "embedded URL/token media metadata leaks no private URL or Slack token family");
  releaseRunner();
}

async function verifySlackMediaMetadataFieldsAreLengthBounded(): Promise<void> {
  section("5. Slack Media Metadata Fields Are Length Bounded");
  const { bridge, seen, releaseRunner } = createSlackHarness();
  const response = await postSlackEvent(bridge, slackFileShareEvent({
    event: {
      type: "message",
      subtype: "file_share",
      user: "U118",
      channel: "C118",
      ts: "171000.1184",
      client_msg_id: "client-118-long-metadata",
      files: [slackFile(4, {
        name: longText(500),
        title: longText(500),
        mimetype: longText(500),
      })],
    },
  }));
  await readJson(response);
  await delay(5);
  const attachments = mediaAttachments(seen[0]?.message.metadata?.mediaAttachments);

  assertEqual(response.status, 202, "Slack long file metadata is accepted after bounding");
  assert(String(attachments[0]?.name ?? "").length <= 160, "Slack file name metadata is bounded");
  assert(String(attachments[0]?.title ?? "").length <= 160, "Slack file title metadata is bounded");
  assert(String(attachments[0]?.mimeType ?? "").length <= 160, "Slack file mime metadata is bounded");
  releaseRunner();
}

async function verifySlackMediaMetadataFieldsStayBoundedAfterRedaction(): Promise<void> {
  section("6. Slack Media Metadata Fields Stay Bounded After Redaction");
  const { bridge, seen, releaseRunner } = createSlackHarness();
  const response = await postSlackEvent(bridge, slackFileShareEvent({
    event: {
      type: "message",
      subtype: "file_share",
      user: "U118",
      channel: "C118",
      ts: "171000.1186",
      client_msg_id: "client-118-redaction-expansion",
      files: [slackFile(6, {
        name: repeatedSensitiveTokenText(40),
        title: repeatedSensitiveTokenText(40),
      })],
    },
  }));
  await readJson(response);
  await delay(5);
  const attachments = mediaAttachments(seen[0]?.message.metadata?.mediaAttachments);

  assertEqual(response.status, 202, "Slack token-heavy file metadata is accepted after redaction and bounding");
  assert(String(attachments[0]?.name ?? "").length <= 160, "Slack file name metadata stays bounded after token redaction");
  assert(String(attachments[0]?.title ?? "").length <= 160, "Slack file title metadata stays bounded after token redaction");
  assert(!containsSensitive(seen[0]?.message.metadata), "Slack token-heavy file metadata leaks no token after post-redaction bounding");
  releaseRunner();
}

async function verifySlackAppMentionSubtypeStillIgnored(): Promise<void> {
  section("7. Slack app_mention Non-file Subtypes Stay Ignored");
  const { bridge, seen, releaseRunner } = createSlackHarness();
  const response = await postSlackEvent(bridge, {
    type: "event_callback",
    token: "xoxb-phase118-secret",
    team_id: "T118",
    api_app_id: "A118PHASE",
    event: {
      type: "app_mention",
      subtype: "bot_message",
      user: "U118",
      text: "<@UCOLONY> bot loop",
      channel: "C118",
      ts: "171000.1185",
      files: [slackFile(5)],
    },
  });
  const body = await readJson(response);

  assertEqual(response.status, 400, "Slack app_mention with bot subtype remains rejected");
  assertEqual(body.accepted, false, "Slack app_mention subtype is not accepted");
  assertEqual(bridge.status().routeCount, 0, "Slack app_mention subtype creates no route");
  await delay(5);
  assertEqual(seen.length, 0, "Slack app_mention subtype dispatches no runner");
  assert(!containsSensitive(body), "Slack app_mention subtype rejection leaks no token, host secret, or private media URL");
  releaseRunner();
}

async function main(): Promise<void> {
  console.log("THE COLONY - Phase 118 Verification (Slack Media Metadata Inspection)\n");
  await verifySlackFileShareAcceptedWithSafeMetadata();
  await verifySlackAppMentionFilesAreBoundedAndRedacted();
  await verifySlackNonFileShareSubtypeStillIgnored();
  await verifySlackMediaMetadataRedactsEmbeddedUrlAndTokenFamilies();
  await verifySlackMediaMetadataFieldsAreLengthBounded();
  await verifySlackMediaMetadataFieldsStayBoundedAfterRedaction();
  await verifySlackAppMentionSubtypeStillIgnored();
  console.log(`\n${"=".repeat(60)}\n  RESULTS: ${passed} passed, ${failed} failed\n${"=".repeat(60)}`);
  if (failed > 0) process.exit(1);
  console.log("\nPhase 118: Slack media metadata inspection is GREEN.");
}

main().catch((error) => { console.error(error); process.exit(1); });
