import { describe, expect, it } from 'vitest';
import { classifyCallError, REPAIRABLE } from '../src/callErrors';
import { browserFamily, diagnoseMediaError, rms } from '../src/diagnose';
import { DEFAULT_VIDEO_LABELS } from '../src/labels';

describe('classifyCallError', () => {
  it('maps every Daily fatal type to a kind', () => {
    const cases: Array<[string, string]> = [
      ['no-room', 'room-missing'],
      ['exp-room', 'room-expired'],
      ['nbf-room', 'not-open-yet'],
      ['exp-token', 'token-expired'],
      ['not-allowed', 'not-allowed'],
      ['ejected', 'ejected'],
      ['meeting-full', 'meeting-full'],
      ['end-of-life', 'unsupported-browser'],
      ['connection-error', 'network'],
    ];
    for (const [type, kind] of cases) {
      expect(classifyCallError({ errorMsg: 'x', error: { type, msg: 'x' } }).kind).toBe(kind);
    }
  });

  it('reads the message when an older build sends no type, and keeps it', () => {
    const f = classifyCallError({ errorMsg: 'Meeting has ended' });
    expect(f).toEqual({ kind: 'room-expired', message: 'Meeting has ended' });
  });

  it('repairs room and token kinds, never an ejection', () => {
    expect(REPAIRABLE.has('room-expired')).toBe(true);
    expect(REPAIRABLE.has('not-allowed')).toBe(true);
    expect(REPAIRABLE.has('ejected')).toBe(false);
    expect(REPAIRABLE.has('network')).toBe(false);
  });
});

describe('diagnoseMediaError', () => {
  it('tells an OS block from a browser block', () => {
    expect(diagnoseMediaError({ name: 'NotAllowedError', message: 'Permission denied by system' }, 'microphone').problem).toBe('blocked-system');
    expect(diagnoseMediaError({ name: 'NotAllowedError', message: 'Permission denied' }, 'microphone').problem).toBe('blocked-browser');
  });

  it('names busy, missing and impossible devices', () => {
    expect(diagnoseMediaError({ name: 'NotReadableError' }, 'camera').problem).toBe('in-use');
    expect(diagnoseMediaError({ name: 'NotFoundError' }, 'camera').problem).toBe('not-found');
    expect(diagnoseMediaError({ name: 'OverconstrainedError' }, 'camera').problem).toBe('constraints');
  });

  it('knows the browser family', () => {
    expect(browserFamily('Mozilla/5.0 (Windows NT 10.0) AppleWebKit/537.36 Chrome/130 Safari/537.36 Edg/130')).toBe('edge');
    expect(browserFamily('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0) Safari/604.1')).toBe('ios');
    expect(browserFamily('Mozilla/5.0 (Macintosh) Version/18 Safari/605.1.15')).toBe('safari');
    expect(browserFamily('Mozilla/5.0 Firefox/131.0')).toBe('firefox');
  });

  it('gives steps for that browser', () => {
    const firefox = DEFAULT_VIDEO_LABELS.fixSteps('blocked-browser', 'microphone', 'firefox');
    const system = DEFAULT_VIDEO_LABELS.fixSteps('blocked-system', 'camera', 'chrome');
    expect(firefox.join(' ')).toContain('Firefox');
    expect(system.join(' ')).toContain('Privacy & Security');
  });

  it('measures loudness', () => {
    expect(rms([0, 0, 0])).toBe(0);
    expect(rms([0.5, -0.5])).toBeCloseTo(0.5);
  });
});
