import { useEffect, useState } from 'react';
import type { MediaDiagnosis } from '../diagnose';
import { cx, useVideoUi } from '../theme';
import { ProblemCard } from './ProblemCard';
import { devicesOfKind } from '../drawnDevices';

interface Options {
  microphones: MediaDeviceInfo[];
  cameras: MediaDeviceInfo[];
}

/**
 * Help from inside the call: what is wrong (when the frame reported a device problem),
 * the fix for this browser, switching microphone or camera without leaving, and rejoining.
 */
export function Troubleshooter({ open, onClose, diagnosis, setDevices, rejoin, className }: {
  open: boolean;
  onClose: () => void;
  diagnosis: MediaDiagnosis | null;
  setDevices: (devices: { audioDeviceId?: string; videoDeviceId?: string }) => void;
  rejoin: () => void;
  className?: string;
}) {
  const { labels, classNames } = useVideoUi();
  const [options, setOptions] = useState<Options>({ microphones: [], cameras: [] });

  useEffect(() => {
    if (!open || !navigator.mediaDevices?.enumerateDevices) return;
    let live = true;
    void navigator.mediaDevices.enumerateDevices().then((list) => {
      if (!live) return;
      // The real devices only: Chrome also lists "Default - X" and "Communications - X" copies.
      const real = (kind: MediaDeviceKind) => {
        const ids = new Set(devicesOfKind(list, kind, '').map((d) => d.id));
        return list.filter((d) => d.kind === kind && ids.has(d.deviceId));
      };
      setOptions({ microphones: real('audioinput'), cameras: real('videoinput') });
    }).catch(() => {});
    return () => {
      live = false;
    };
  }, [open]);

  if (!open) return null;

  return (
    <div className={cx('ve-trouble', classNames.troubleshooter, className)} role="dialog" aria-label={labels.troubleTitle}>
      <div className="ve-trouble__head">
        <p className="ve-trouble__title">{labels.troubleTitle}</p>
        <button type="button" className={cx('ve-btn', classNames.button)} onClick={onClose}>
          {labels.troubleClose}
        </button>
      </div>
      <div className="ve-trouble__body">
        {diagnosis ? <ProblemCard diagnosis={diagnosis} /> : null}
        {options.microphones.length > 1 ? (
          <label className="ve-picker">
            <span className="ve-picker__label">{labels.microphone}</span>
            <select className="ve-select" defaultValue="" onChange={(e) => e.target.value && setDevices({ audioDeviceId: e.target.value })}>
              <option value="" disabled>
                ...
              </option>
              {options.microphones.map((d, i) => (
                <option key={d.deviceId} value={d.deviceId}>
                  {d.label || `${labels.microphone} ${i + 1}`}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        {options.cameras.length > 1 ? (
          <label className="ve-picker">
            <span className="ve-picker__label">{labels.camera}</span>
            <select className="ve-select" defaultValue="" onChange={(e) => e.target.value && setDevices({ videoDeviceId: e.target.value })}>
              <option value="" disabled>
                ...
              </option>
              {options.cameras.map((d, i) => (
                <option key={d.deviceId} value={d.deviceId}>
                  {d.label || `${labels.camera} ${i + 1}`}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        <button type="button" className={cx('ve-btn ve-btn--primary', classNames.button, classNames.buttonPrimary)} onClick={rejoin}>
          {labels.rejoin}
        </button>
      </div>
    </div>
  );
}
