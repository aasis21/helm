import { ACCEPTED_IMAGE_TYPES, attachmentSrc } from '@/lib/imageAttachments';
import { clipText, compareHistory, historyItemId } from '@aasis21/helm-shared';
import * as B from '@/test/helpers/builders';

describe('shared history helpers', () => {
  it('mergeHistory dedups by turnIndex and role with incoming winning, then sorts ascending', () => {
    const existing = [B.historyItem(2, 'assistant', 'old assistant'), B.historyItem(1, 'user', 'old user')];
    const incoming = [B.historyItem(2, 'assistant', 'new assistant'), B.historyItem(2, 'user', 'new user')];

    expect(B.mergeHistory(existing, incoming)).toEqual([
      B.historyItem(1, 'user', 'old user'),
      B.historyItem(2, 'user', 'new user'),
      B.historyItem(2, 'assistant', 'new assistant'),
    ]);
  });

  it('compareHistory orders by turn index and user before assistant', () => {
    const user = B.historyItem(1, 'user', 'u');
    const assistant = B.historyItem(1, 'assistant', 'a');
    const later = B.historyItem(2, 'user', 'later');

    expect(compareHistory(user, assistant)).toBeLessThan(0);
    expect(compareHistory(assistant, later)).toBeLessThan(0);
    expect(compareHistory(later, user)).toBeGreaterThan(0);
  });

  it('clipText clips strings with an ellipsis and normalizes non-strings', () => {
    expect(clipText('abcdef', 3)).toBe('abc…');
    expect(clipText('abc', 3)).toBe('abc');
    expect(clipText(null as unknown as string, 3)).toBe('');
  });

  it('historyItemId is stable for turn index and role', () => {
    expect(historyItemId(B.historyItem(7, 'assistant', 'text'))).toBe('7:assistant');
  });
});

describe('shared message helpers', () => {
  it('eventForKind maps representative kinds to logical events', () => {
    expect(B.eventForKind(B.KIND.ASSISTANT_DELTA)).toBe('stream');
    expect(B.eventForKind(B.KIND.APPROVAL_REQUEST)).toBe('approval');
    expect(B.eventForKind(B.KIND.APPROVAL_DECISION)).toBe('decision');
    expect(B.eventForKind(B.KIND.ELICITATION_REQUEST)).toBe('elicitation');
    expect(B.eventForKind(B.KIND.PROMPT)).toBe('prompt');
    expect(B.eventForKind(B.KIND.MODE)).toBe('control');
  });

  it('isValidInner accepts real factory messages and rejects invalid shapes', () => {
    expect(B.isValidInner(B.assistantMessage('ok'))).toBe(true);
    expect(B.isValidInner({})).toBe(false);
    expect(B.isValidInner(null)).toBe(false);
    expect(B.isValidInner({ kind: 1, ts: 1 })).toBe(false);
    expect(B.isValidInner({ kind: B.KIND.ASSISTANT_MESSAGE })).toBe(false);
  });
});

describe('image attachment pure exports', () => {
  it('exposes accepted MIME types and builds img data URLs', () => {
    expect(ACCEPTED_IMAGE_TYPES).toBe('image/png,image/jpeg,image/webp,image/gif,image/bmp');
    expect(attachmentSrc({ data: 'abc123', mimeType: 'image/jpeg', name: 'photo.jpg' })).toBe('data:image/jpeg;base64,abc123');
  });

  it('leaves fileToAttachment to browser/canvas integration coverage', () => {
    // fileToAttachment depends on Image/createImageBitmap plus canvas encoding, which jsdom does not implement faithfully.
    expect(ACCEPTED_IMAGE_TYPES).not.toContain('image/heic');
  });
});
