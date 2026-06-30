import {
  EVENTS,
  SecureChannel,
  _resetLocalBus,
  approvalRequest,
  assistantMessage,
  buildPairingPayload,
  createLocalTransport,
  generateKeyPair,
  heartbeat,
  logLine,
  modeChange,
  randomChannelId,
  sessionEnd,
  sessionStart,
  toolComplete,
  toolStart,
  waitForPeer,
} from '@aasis21/helm-shared';
import type { ApprovalDecision, ModeChange, PromptMessage } from '@aasis21/helm-shared';
import { pairSession } from './helmClient';
import type { HelmClient } from './helmClient';

export interface DemoSession {
  client: HelmClient;
  channelId: string;
  pairingJson: string;
  stop(): Promise<void>;
}

export async function startDemoSession(): Promise<DemoSession> {
  _resetLocalBus();
  const channelId = randomChannelId();
  const laptopKeys = await generateKeyPair();
  const laptopTransport = createLocalTransport({ channelId });
  const laptopPeer = waitForPeer({
    transport: laptopTransport,
    keyPair: laptopKeys,
    timeoutMs: 10_000,
  });
  const pairingPayload = buildPairingPayload({ channelId, publicKeyB64: laptopKeys.publicKeyB64 });
  // The Demo/Simulator runs entirely in-process: force the phone side onto the same
  // in-memory LocalTransport bus as the simulated laptop, regardless of the build's
  // VITE_HELM_TRANSPORT (which may be `supabase` for real pairing).
  const phoneTransport = createLocalTransport({ channelId });
  const { client } = await pairSession(JSON.stringify(pairingPayload), { transport: phoneTransport });
  const { key: laptopKey } = await laptopPeer;
  const extension = new SecureChannel({
    transport: laptopTransport,
    key: laptopKey,
    identity: { deviceId: 'demo-laptop', sessionId: 'demo-session' },
  });
  await extension.connect();

  const timers: number[] = [];
  const push = (delay: number, action: () => void | Promise<void>): void => {
    timers.push(window.setTimeout(() => void action(), delay));
  };

  const unsubs = [
    extension.onEvent(EVENTS.PROMPT, (message) => {
      const prompt = message as PromptMessage;
      void extension.send(logLine('info', `Prompt injected from phone: "${prompt.text}"`));
      void extension.send(assistantMessage(`Queued your instruction: ${prompt.text}`, 'demo-ack'));
    }),
    extension.onEvent(EVENTS.DECISION, (message) => {
      const decision = message as ApprovalDecision;
      void extension.send(logLine('info', `Permission ${decision.requestId}: ${decision.optionId}`));
      void extension.send(toolComplete('tool-1', 'powershell', decision.optionId !== 'deny', 'native decision relayed'));
    }),
    extension.onEvent(EVENTS.CONTROL, (message) => {
      const control = message as ModeChange;
      if (control.kind === 'control.mode') {
        void extension.send(modeChange(control.mode));
        void extension.send(logLine('info', `Session mode changed to ${control.mode}`));
      }
    }),
  ];

  const heartbeatTimer = window.setInterval(() => void extension.send(heartbeat()), 2_500);
  push(100, () => extension.send(sessionStart(channelId, 'demo-session', 'C:\\Users\\akash\\helm')));
  push(450, () => extension.send(logLine('info', 'Encrypted LocalTransport linked; relay sees envelopes only.')));
  push(900, () =>
    extension.send(
      assistantMessage(
        "Hi — I'm your live `gh copilot` session, mirrored to your phone. Let me check the mobile build.",
        'demo-1',
      ),
    ),
  );
  push(1_700, () => extension.send(toolStart('tool-1', 'powershell', { command: 'npm run build -w @aasis21/helm-mobile' })));
  push(3_400, () =>
    extension.send(toolComplete('tool-1', 'powershell', true, 'vite build ✓  104 modules transformed · dist/ ready in 1.21s')),
  );
  push(3_900, () =>
    extension.send(
      assistantMessage(
        "Build is green. Here's the gist of what changed:\n\n- Ported the **Anya** chat skin into Helm\n- Tool calls now render **inline**, collapsed by default\n- User prompts sit on the right, like a real chat\n\n```ts\nexport const shipped = true;\n```",
        'demo-2',
      ),
    ),
  );
  push(5_400, () => extension.send(toolStart('tool-2', 'view', { path: 'mobile/src/App.tsx' })));
  push(6_600, () => extension.send(toolComplete('tool-2', 'view', true, 'read 204 lines')));
  push(7_200, () =>
    extension.send(
      approvalRequest('approval-1', 'powershell', { command: 'gh copilot suggest "fix failing test"' }, [
        { id: 'allow-once', label: 'Allow once' },
        { id: 'allow-always', label: 'Always allow this session' },
        { id: 'deny', label: 'Deny' },
      ]),
    ),
  );
  push(120_000, () => extension.send(sessionEnd('Demo script finished.')));

  return {
    client,
    channelId,
    pairingJson: JSON.stringify(pairingPayload),
    async stop() {
      window.clearInterval(heartbeatTimer);
      for (const timer of timers) window.clearTimeout(timer);
      for (const unsub of unsubs) unsub();
      await extension.close();
      await client.close();
    },
  };
}
