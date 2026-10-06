import { useEffect, useRef } from 'react';
import { useMediaCheck, type DeviceOption } from '../hooks/useMediaCheck';
import { cx, useVideoUi } from '../theme';
import { ProblemCard } from './ProblemCard';

export interface DeviceCheckProps {
  className?: string;
  /** Start testing as soon as it mounts (the browser asks for permission right away). */
  autoStart?: boolean;
}

function Picker({ label, value, options, onChange }: { label: string; value: string; options: DeviceOption[]; onChange: (id: string) => void }) {
  if (options.length < 2) return null;
  return (
    <label className="ve-picker">
      <span className="ve-sr">{label}</span>
      <select className="ve-select" value={value} onChange={(e) => onChange(e.target.value)}>
        {options.map((o) => (
          <option key={o.deviceId} value={o.deviceId}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function Preview({ stream }: { stream: MediaStream | null }) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.srcObject = stream;
  }, [stream]);
  return <video ref={ref} className="ve-preview" autoPlay muted playsInline aria-hidden="true" />;
}

/**
 * Pre-join check for microphone, camera and speaker. Diagnoses each one separately and
 * shows the fix for the person's own browser. Never blocks joining.
 */
export function DeviceCheck({ className, autoStart = false }: DeviceCheckProps) {
  const { labels, classNames } = useVideoUi();
  const check = useMediaCheck();
  const { mic, camera, speaker, devices } = check;
  const started = mic.status !== 'idle' || camera.status !== 'idle';
  // The first start() only: re-running on every render would re-prompt for permission.
  const firstStart = useRef(check.start);
  useEffect(() => {
    if (autoStart) void firstStart.current();
  }, [autoStart]);

  const allGood = mic.status === 'heard' && camera.status === 'ok' && speaker.status === 'heard';
  const meter = Math.min(100, Math.round((mic.level / 0.08) * 100));

  return (
    <section className={cx('ve-check', classNames.deviceCheck, className)} aria-label={labels.checkTitle}>
      <header className="ve-check__head">
        <h3 className="ve-check__title">{labels.checkTitle}</h3>
        <p className="ve-check__intro">{labels.checkIntro}</p>
      </header>

      {!started ? (
        <button type="button" className={cx('ve-btn ve-btn--primary', classNames.button, classNames.buttonPrimary)} onClick={() => void check.start()}>
          {labels.checkStart}
        </button>
      ) : (
        <div className="ve-check__rows">
          {mic.status === 'asking' || camera.status === 'asking' ? <p className="ve-hint ve-hint--warn" role="status">{labels.permissionHint}</p> : null}
          <div className="ve-row">
            <div className="ve-row__head">
              <span className="ve-row__name">{labels.microphone}</span>
              <span className={cx('ve-pill', mic.status === 'heard' && 've-pill--ok', (mic.status === 'silent' || mic.status === 'error') && 've-pill--warn')}>
                {mic.status === 'heard' ? labels.micHeard : mic.status === 'silent' || mic.status === 'error' ? labels.micSilent : mic.status === 'asking' ? labels.waitingForPermission : labels.micListening}
              </span>
            </div>
            <div className="ve-meter" aria-hidden="true">
              <span className="ve-meter__fill" style={{ width: `${meter}%` }} />
            </div>
            <Picker label={labels.microphone} value={mic.deviceId} options={devices.microphones} onChange={(id) => void check.selectMic(id)} />
            {mic.diagnosis ? <ProblemCard diagnosis={mic.diagnosis} /> : null}
          </div>

          <div className="ve-row">
            <div className="ve-row__head">
              <span className="ve-row__name">{labels.camera}</span>
              <span className={cx('ve-pill', camera.status === 'ok' && 've-pill--ok', camera.status === 'error' && 've-pill--warn')}>
                {camera.status === 'ok' ? labels.cameraOk : camera.status === 'error' ? labels.cameraOff : labels.waitingForPermission}
              </span>
            </div>
            {camera.stream ? <Preview stream={camera.stream} /> : null}
            <Picker label={labels.camera} value={camera.deviceId} options={devices.cameras} onChange={(id) => void check.selectCamera(id)} />
            {camera.diagnosis ? <ProblemCard diagnosis={camera.diagnosis} /> : null}
          </div>

          <div className="ve-row">
            <div className="ve-row__head">
              <span className="ve-row__name">{labels.speaker}</span>
              {speaker.status === 'heard' ? <span className="ve-pill ve-pill--ok">{labels.speakerYes}</span> : null}
            </div>
            {speaker.canSelect ? (
              <Picker label={labels.speaker} value={speaker.deviceId} options={devices.speakers} onChange={check.selectSpeaker} />
            ) : (
              <p className="ve-hint">{labels.speakerDefaultOnly}</p>
            )}
            {speaker.status === 'asking' ? (
              <div className="ve-ask">
                <span>{labels.speakerAsk}</span>
                <button type="button" className={cx('ve-btn', classNames.button)} onClick={() => check.answerSpeaker(true)}>
                  {labels.speakerYes}
                </button>
                <button type="button" className={cx('ve-btn', classNames.button)} onClick={() => check.answerSpeaker(false)}>
                  {labels.speakerNo}
                </button>
              </div>
            ) : (
              <button type="button" className={cx('ve-btn', classNames.button)} disabled={speaker.status === 'playing'} onClick={() => void check.playTone()}>
                {speaker.status === 'playing' ? labels.speakerPlaying : labels.speakerTest}
              </button>
            )}
            {speaker.status === 'not-heard' ? <p className="ve-hint ve-hint--warn">{labels.speakerFix}</p> : null}
          </div>

          {check.autoFixed.map((what) => (
            <p key={what} className="ve-hint ve-hint--ok">
              {labels.autoFixed(what)}
            </p>
          ))}

          <div className="ve-check__foot">
            <p className={cx('ve-hint', allGood && 've-hint--ok')}>{allGood ? labels.allGood : labels.neverBlocks}</p>
            <button type="button" className={cx('ve-btn', classNames.button)} onClick={() => void check.start()}>
              {labels.checkAgain}
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
