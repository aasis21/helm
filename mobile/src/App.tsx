import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import type { JSX } from 'react';
import type { SessionMode } from '@aasis21/helm-shared';
import { PairingScreen } from './components/PairingScreen';
import { SessionScreen } from './components/SessionScreen';
import { sessionManager } from './lib/sessionManager';

export default function App(): JSX.Element {
  const snapshot = useSyncExternalStore(sessionManager.subscribe, sessionManager.getSnapshot);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void sessionManager.init();
  }, []);

  const handlePair = useCallback(async (raw: string): Promise<void> => {
    await sessionManager.addByQr(raw);
    setAdding(false);
  }, []);

  const handleDemo = useCallback(async (): Promise<void> => {
    await sessionManager.addDemo();
    setAdding(false);
  }, []);

  const activeId = snapshot.activeId;
  const active = snapshot.sessions.find((s) => s.meta.channelId === activeId) ?? snapshot.sessions[0] ?? null;

  if (!snapshot.ready) {
    return (
      <main className="boot">
        <div className="boot-mark" aria-hidden="true">H</div>
        <p>Restoring your sessions…</p>
      </main>
    );
  }

  if (snapshot.sessions.length === 0 || adding || !active) {
    return (
      <PairingScreen
        error={error}
        onError={setError}
        onPair={handlePair}
        onStartDemo={handleDemo}
        onCancel={snapshot.sessions.length > 0 ? () => setAdding(false) : undefined}
      />
    );
  }

  return (
    <SessionScreen
      active={active}
      sessions={snapshot.sessions}
      activeId={active.meta.channelId}
      onPrompt={(text) => void sessionManager.sendPrompt(active.meta.channelId, text)}
      onApprove={(requestId, optionId) => void sessionManager.sendApproval(active.meta.channelId, requestId, optionId)}
      onModeChange={(mode: SessionMode) => void sessionManager.sendMode(active.meta.channelId, mode)}
      onSelectSession={(id) => sessionManager.setActive(id)}
      onAddSession={() => setAdding(true)}
      onRemoveSession={(id) => void sessionManager.remove(id)}
      onReconnect={(id) => void sessionManager.reconnect(id)}
    />
  );
}
