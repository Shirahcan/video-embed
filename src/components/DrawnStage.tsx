import { Component, useEffect, useId, useRef, useState, type CSSProperties, type ErrorInfo, type ReactNode, useCallback } from 'react';
import type { DailyCall, DailyParticipant } from '@daily-co/daily-js';
import { cx, useVideoUi } from '../theme';
import { BlurIcon, FullscreenIcon, LayoutIcon, MirrorIcon, PinIcon, PopOutIcon, CameraIcon, CameraOffIcon, ChatIcon, HandIcon, MicIcon, MicOffIcon, NoiseIcon, PeopleIcon, PresentIcon } from './icons';
import { REACTIONS, useHandsAndReactions, useRaisedHandNotice } from '../drawnHands';
import { DrawnReactMenu } from './DrawnReactMenu';
import { DrawnProductPanel, type CallPanel } from './DrawnProductPanel';
import { PRESENT_OPTIONS, useDrawnEffects } from '../drawnEffects';
import { prefersMirroredSelf, setMirroredSelf } from '../callScreen';
import { createPortal } from 'react-dom';
import { useAppSwitchTip, useDrawnFloat } from '../drawnFloat';
import { useBarFold, type FoldableControl } from '../barFold';
import { DrawnFloat } from './DrawnFloat';
import { Control } from './DrawnControl';
import { DrawnMoreMenu } from './DrawnMoreMenu';
import { DrawnLeaveMenu } from './DrawnLeaveMenu';
import { DrawnChatPanel } from './DrawnChatPanel';
import { DrawnPeoplePanel } from './DrawnPeoplePanel';
import { DrawnNotices } from './DrawnNotices';
import { useHostControls } from '../hostControls';
import { useDrawnChat } from '../drawnChat';
import { useDrawnNetwork } from '../drawnNetwork';
import { arrangeStage, arrangementLayers, drawnPeople, fitTiles, presenterOf, type DrawnLayoutMode, type DrawnPerson } from '../drawnLayout';
import { Sound } from './DrawnTile';
import { DrawnTiles } from './DrawnTiles';
import { useLayoutMode, useStageFullscreen } from '../drawnView';
import { DrawnDeviceMenu } from './DrawnDeviceMenu';
import { useDrawnDevices } from '../drawnDevices';
import type { CallAccess, WaitingPerson } from '../hooks/useDailyFrame';

export { drawnPeople, type DrawnPerson };

/**
 * The call drawn by the kit from Daily's call object: the people's tiles, their sound, and our own
 * controls (mute, camera, leave, "Use the standard call screen"). Everything around the call
 * (repair, knocks, ending, the clock, notices) stays CallFrame's, exactly as for Prebuilt.
 *
 * Drawn with plain DOM media elements, so the same nodes can later move into a floating window
 * without the call noticing (P1 spike, 2026-11-26). Remote SOUND always plays from elements that
 * never move, so it never pauses.
 */
/** A round icon button with its short label underneath (the call's control bar). */

export interface DrawnStageProps {
  call: DailyCall;
  /**
   * The corner window (P3b): the call drawn small, the float's own look, with "Back to the call"
   * and the call clock, so the corner window, the float and the room share one language.
   */
  compact?: {
    onBack: () => void;
    clock?: ReactNode;
    /** The call went out to the floating window (true) or came back (false): the host hides its corner window meanwhile. */
    onFloated?: (floated: boolean) => void;
  } | null;
  /** Leave the call (CallFrame's own leave, so its "Is it over?" and presence follow). */
  onLeave: () => void;
  /** A host's End the call for everyone (L1): Leave then asks Leave the call / End for everyone. */
  onEndForEveryone?: () => void;
  /** Switch this device to Daily Prebuilt. */
  onUseStandard: () => void;
  /** This person's access: while `asking` or `denied` the stage says so instead of the call. */
  access?: CallAccess;
  /**
   * Switch microphone / camera (the frame's setDevices). A blocked or busy device is said ABOVE the
   * call by CallFrame, with "Having trouble?"; the stage does not repeat it.
   */
  setDevices?: (devices: { audioDeviceId?: string; videoDeviceId?: string }) => void;
  /** People asking to be let in (the host's list), shown in the People panel (F1). */
  waiting?: WaitingPerson[];
  /** Let a waiting person in (true) or turn them away (false). */
  onAnswer?: (id: string, letIn: boolean) => void;
  /** A host removed someone: the product records it, so their way back is asking to join (F1b). */
  onRemovePerson?: (person: { userId: string | null; name: string }) => void;
  /** The product's own side panels (F3); never shown in the float or the corner window. */
  panels?: CallPanel[];
}

export function DrawnStage({ call, access = null, compact = null, onLeave, onEndForEveryone, onUseStandard, setDevices, waiting = [], onAnswer, onRemovePerson, panels = [] }: DrawnStageProps) {
  const { labels } = useVideoUi();
  const devices = useDrawnDevices(call, { microphone: labels.microphone, camera: labels.camera, speaker: labels.speaker }, setDevices);
  // The browser refused to play the call's sound (no click on the page yet): one button fixes it.
  const [soundBlocked, setSoundBlocked] = useState(false);
  // One side panel at a time: the chat or the people (F1), each sliding over the stage.
  // 'chat', 'people', or a product panel as `p:<key>`: one panel at a time shares the slot.
  const [panel, setPanel] = useState<string | null>(null);
  const chatOpen = panel === 'chat';
  const peopleOpen = panel === 'people';
  const togglePanel = (which: string) => setPanel((p) => (p === which ? null : which));
  const productPanel = panels.find((x) => panel === `p:${x.key}`) ?? null;
  const hostControls = useHostControls(call);
  const connection = useDrawnNetwork(call);
  const effects = useDrawnEffects(call);
  const [mirror, setMirror] = useState(prefersMirroredSelf);
  const rootRef = useRef<HTMLDivElement>(null);
  const float = useDrawnFloat(useCallback(() => rootRef.current, []));

  // Leaving the call page (P3c, owner 2026-11-26: "always be the screen"): the call goes out to the
  // floating window on the screen rather than the corner of the page. The browser allows that only
  // for a few seconds after a click, so a click on a link works; the Back button, a slow page or a
  // browser without the window keeps the corner window, which stays the fallback. A window opened
  // this way closes again when the person comes back to the call page.
  const inCorner = compact !== null;
  const openedOnLeaveRef = useRef(false);
  const floatOpen = float.open;
  const floatClose = float.close;
  useEffect(() => {
    if (inCorner) {
      if (!float.supported || float.host) return;
      const activation = (navigator as Navigator & { userActivation?: { isActive: boolean } }).userActivation;
      if (activation && !activation.isActive) return;
      openedOnLeaveRef.current = true;
      void floatOpen({ quiet: true });
      return;
    }
    if (openedOnLeaveRef.current) {
      openedOnLeaveRef.current = false;
      floatClose();
    }
    // Only the move between the room and another page decides this, never a re-render.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- float.host / supported are read at the moment of the move on purpose
  }, [inCorner]);
  const onFloated = compact?.onFloated;
  useEffect(() => {
    onFloated?.(Boolean(float.host));
  }, [onFloated, float.host]);
  const toggleMirror = () => {
    setMirroredSelf(!mirror);
    setMirror(!mirror);
  };
  // The weak-connection offer is answered once per drop; a good spell lets it come back.
  const [weakDismissed, setWeakDismissed] = useState(false);
  const [lastConnection, setLastConnection] = useState(connection);
  if (connection !== lastConnection) {
    setLastConnection(connection);
    if (connection === 'ok') setWeakDismissed(false);
  }
  const soundRef = useRef<HTMLDivElement>(null);
  const hearCall = () => {
    const els = [...(soundRef.current?.querySelectorAll('audio') ?? [])];
    void Promise.all(els.map((el) => el.play())).then(() => setSoundBlocked(false), () => {});
  };
  // A device change the person did not make is said for a few seconds, then goes.
  const { notice, dismissNotice } = devices;
  useEffect(() => {
    if (!notice) return undefined;
    const t = setTimeout(dismissNotice, 6000);
    return () => clearTimeout(t);
  }, [notice, dismissNotice]);
  const [people, setPeople] = useState<DrawnPerson[]>(() => drawnPeople(call.participants() as Record<string, DailyParticipant>));
  // Who is speaking now (Daily's active speaker), for the ring on their tile.
  const [speakerId, setSpeakerId] = useState<string | null>(null);
  // F5: the person's layout choice (per device), a pinned tile (this call), and full screen.
  const view = useLayoutMode();
  const [pinnedId, setPinnedId] = useState<string | null>(null);
  const fullscreen = useStageFullscreen(rootRef);
  // The stage's inner size, so the tiles are fitted to it (as Meet does), not stretched by a grid.
  const stageRef = useRef<HTMLDivElement>(null);
  const [stage, setStage] = useState({ width: 0, height: 0 });
  useEffect(() => {
    const el = stageRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return undefined;
    const measure = () => {
      const css = getComputedStyle(el);
      const width = el.clientWidth - parseFloat(css.paddingLeft) - parseFloat(css.paddingRight);
      const height = el.clientHeight - parseFloat(css.paddingTop) - parseFloat(css.paddingBottom);
      setStage((s) => (s.width === width && s.height === height ? s : { width, height }));
    };
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    measure();
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const sync = () => {
      try {
        setPeople(drawnPeople(call.participants() as Record<string, DailyParticipant>));
      } catch {
        /* torn down mid-event */
      }
    };
    const onSpeaker = (e?: { activeSpeaker?: { peerId?: string } }) => setSpeakerId(e?.activeSpeaker?.peerId ?? null);
    const events = ['joined-meeting', 'participant-joined', 'participant-updated', 'participant-left', 'track-started', 'track-stopped'] as const;
    for (const e of events) call.on(e, sync);
    call.on('active-speaker-change', onSpeaker);
    sync();
    return () => {
      for (const e of events) call.off(e, sync);
      call.off('active-speaker-change', onSpeaker);
    };
  }, [call]);


  const self = people.find((p) => p.local) ?? null;
  const others = people.filter((p) => !p.local);
  const chat = useDrawnChat(call, self?.name ?? '', chatOpen);
  const hands = useHandsAndReactions(call, self?.id ?? null, self?.handAt ?? null);
  const handNotice = useRaisedHandNotice(people);
  const handsUp = others.filter((p) => p.handAt).length;
  const appSwitch = useAppSwitchTip(float.supported && !float.host && !compact && access !== 'asking' && access !== 'denied');
  // B1: the bar never overflows. Pop out folds into More first, then Present, then Chat; mic,
  // camera, More and Leave always stay.
  const barRef = useRef<HTMLDivElement>(null);
  const foldable: FoldableControl[] = [
    ...(float.supported ? [{ key: 'float', priority: 1 }] : []),
    ...(effects.support.present ? [{ key: 'present', priority: 2 }] : []),
    { key: 'react', priority: 2.5 },
    { key: 'chat', priority: 3 },
    { key: 'hand', priority: 3.5 },
    { key: 'people', priority: 4 },
    ...panels.map((x) => ({ key: `p:${x.key}`, priority: x.priority ?? 2 })),
  ];
  const folded = useBarFold(rootRef, barRef, foldable);
  const isFolded = (key: string) => folded.includes(key);
  const micOff = self ? !self.audioOn : false;
  // "The host muted you" holds only while the microphone is still off.
  const mutedByHost = hostControls.mutedByHost && micOff;
  const camOff = self ? !self.videoOn : false;
  // You are presenting when your own screen track is live; you never see it back (no mirror tunnel).
  const presenting = Boolean(self?.screen);
  const togglePresent = () => {
    try {
      if (presenting) call.stopScreenShare();
      else call.startScreenShare(PRESENT_OPTIONS as never);
    } catch {
      /* not in the call any more */
    }
  };
  // People waiting to be let in: a count on People for the host who can answer them.
  const knocking = hostControls.isHost ? waiting.length : 0;
  const presenter = presenterOf(people);
  // Auto (Meet's tiles: one other large with you in the corner, a grid with more), Tiled or
  // Spotlight, then a pin over all of them (F5).
  const arrangement = arrangeStage(people, { mode: view.mode, pinnedId, speakerId });
  const fit = fitTiles(arrangement.tiles.length, stage.width, stage.height);
  // A ring only means something with someone to tell apart.
  const ringFor = (p: DrawnPerson) => others.length >= 1 && speakerId === p.id;

  // Spend a weak connection's bandwidth on what is large on screen.
  const layersKey = JSON.stringify(arrangementLayers(people, arrangement));
  useEffect(() => {
    const layers = JSON.parse(layersKey) as Record<string, 0 | 1 | 2>;
    if (Object.keys(layers).length === 0) return;
    const settings: Record<string, { video: { layer: number } }> = {};
    for (const [id, layer] of Object.entries(layers)) settings[id] = { video: { layer } };
    try {
      void Promise.resolve(call.updateReceiveSettings?.(settings)).catch(() => {});
    } catch {
      /* not in a call (yet), or torn down: the default quality stays */
    }
  }, [call, layersKey]);

  const mainPerson = presenter ? null : others.find((p) => p.id === speakerId) ?? others[0] ?? null;
  const floatPortal = float.host
    ? createPortal(
        <DrawnFloat
          main={mainPerson}
          presenterScreen={presenter?.screen ?? null}
          presenterName={presenter?.name ?? ''}
          self={self}
          micOff={micOff}
          camOff={camOff}
          mirror={mirror}
          speakingId={speakerId}
          onMic={() => call.setLocalAudio(micOff)}
          onCam={() => call.setLocalVideo(camOff)}
          onBack={compact ? compact.onBack : float.close}
          backLabel={compact ? labels.drawnDockBack : undefined}
          onLeave={() => {
            float.close();
            onLeave();
          }}
        />,
        float.host,
      )
    : null;
  if (compact) {
    return (
      <div ref={rootRef} className="ve-drawn ve-drawn--compact">
        {floatPortal}
        <DrawnFloat
          className="ve-float--dock"
          main={mainPerson}
          presenterScreen={presenter?.screen ?? null}
          presenterName={presenter?.name ?? ''}
          self={self}
          micOff={micOff}
          camOff={camOff}
          mirror={mirror}
          speakingId={speakerId}
          onMic={() => call.setLocalAudio(micOff)}
          onCam={() => call.setLocalVideo(camOff)}
          onBack={compact.onBack}
          backLabel={labels.drawnDockBack}
          clock={compact.clock}
          onLeave={onLeave}
        />
        <div className="ve-drawn__sound" hidden ref={soundRef}>
          {others.map((p) => <Sound key={p.id} track={p.audio} sinkId={devices.speakerId} onBlocked={() => setSoundBlocked(true)} />)}
          {others.filter((p) => p.screenAudio).map((p) => <Sound key={`${p.id}-screen`} track={p.screenAudio ?? null} sinkId={devices.speakerId} onBlocked={() => setSoundBlocked(true)} />)}
        </div>
      </div>
    );
  }

  return (
    <div ref={rootRef} className={cx('ve-drawn', panel && 've-drawn--chat', float.host && 've-drawn--floated')} role="region" aria-label={labels.drawnRegion}>
      {floatPortal}
      {float.host ? (
        <div className="ve-drawn__floated" role="status">
          <PopOutIcon width={28} height={28} />
          <p className="ve-drawn__floated-title">{labels.drawnFloated}</p>
          <p className="ve-drawn__floated-detail">{labels.drawnFloatedDetail}</p>
          <button type="button" className="ve-drawn__notice-btn" onClick={float.close}>{labels.drawnFloatBack}</button>
        </div>
      ) : null}
      <DrawnTiles
        arrangement={arrangement}
        stageRef={stageRef}
        fit={fit}
        reactions={hands.reactions}
        ringFor={ringFor}
        mirror={mirror}
        pinnedId={pinnedId}
        onPin={setPinnedId}
        self={self}
      />

      <div className="ve-drawn__sound" hidden ref={soundRef}>
        {others.map((p) => <Sound key={p.id} track={p.audio} sinkId={devices.speakerId} onBlocked={() => setSoundBlocked(true)} />)}
        {others.filter((p) => p.screenAudio).map((p) => <Sound key={`${p.id}-screen`} track={p.screenAudio ?? null} sinkId={devices.speakerId} onBlocked={() => setSoundBlocked(true)} />)}
      </div>

      {access === 'asking' || access === 'denied' ? (
        <div className="ve-drawn__knock" role="status" aria-live="polite">
          {access === 'asking' ? <span className="ve-drawn__knock-pulse" aria-hidden="true" /> : null}
          <p className="ve-drawn__knock-title">{access === 'asking' ? labels.drawnAsking : labels.drawnDenied}</p>
          <p className="ve-drawn__knock-detail">{access === 'asking' ? labels.drawnAskingDetail : labels.drawnDeniedDetail}</p>
        </div>
      ) : null}

      <DrawnNotices
        floatFailed={Boolean(float.failed)}
        onDismissFloat={float.dismissFailed}
        mutedByHost={mutedByHost}
        onDismissMuted={hostControls.dismissMutedByHost}
        presenting={presenting}
        onStopPresenting={togglePresent}
        effectFailed={effects.failed}
        onDismissEffect={effects.dismissFailed}
        connection={connection}
        showWeak={connection === 'weak' && !weakDismissed && !camOff}
        onVideoOff={() => { call.setLocalVideo(false); setWeakDismissed(true); }}
        onDismissWeak={() => setWeakDismissed(true)}
        soundBlocked={soundBlocked}
        onHearCall={hearCall}
        notice={notice}
        onDismissNotice={dismissNotice}
      >
        {hands.handUp ? (
          <p className="ve-drawn__notice" role="status">
            <HandIcon width={16} height={16} />
            <span>{labels.drawnYourHandUp}</span>
            <button type="button" className="ve-drawn__notice-btn" onClick={hands.toggleHand}>{labels.drawnLowerHand}</button>
          </p>
        ) : null}
        {appSwitch.show ? (
          <p className="ve-drawn__notice" role="status">
            <PopOutIcon width={16} height={16} />
            <span>{labels.drawnAppSwitchTip}</span>
            <button type="button" className="ve-drawn__notice-btn" onClick={() => { appSwitch.dismiss(); void float.open(); }}>{labels.drawnFloat}</button>
            <button type="button" className="ve-drawn__notice-btn ve-drawn__notice-btn--quiet" onClick={appSwitch.dismiss}>{labels.drawnDismiss}</button>
          </p>
        ) : null}
        {handNotice.notice ? (
          <p className="ve-drawn__notice" role="status">
            <HandIcon width={16} height={16} />
            <span>{labels.drawnHandRaisedBy(handNotice.notice.name || labels.knockSomeone)}</span>
            <button type="button" className="ve-drawn__notice-btn" onClick={() => setPanel('people')}>{labels.drawnPeopleShort}</button>
          </p>
        ) : null}
      </DrawnNotices>

      {productPanel ? <DrawnProductPanel panel={productPanel} onClose={() => setPanel(null)} /> : null}
      {chatOpen ? <DrawnChatPanel messages={chat.messages} onSend={chat.send} onClose={() => setPanel(null)} /> : null}
      {peopleOpen ? (
        <DrawnPeoplePanel
          people={people}
          waiting={hostControls.isHost ? waiting : []}
          onAnswer={onAnswer}
          host={
            hostControls.isHost
              ? {
                  mute: hostControls.mute,
                  lowerHand: hands.lowerHandOf,
                  remove: (id) => {
                    const p = people.find((x) => x.id === id);
                    hostControls.remove(id);
                    if (p) onRemovePerson?.({ userId: p.userId ?? null, name: p.name });
                  },
                }
              : null
          }
          onClose={() => setPanel(null)}
        />
      ) : null}

      <div className="ve-drawn__bar" role="toolbar" aria-label={labels.drawnControls} ref={barRef}>
        <DrawnDeviceMenu
          label={labels.drawnMicSettings}
          onChoose={devices.choose}
          sections={[
            { kind: 'microphone', heading: labels.microphone, choices: devices.microphones, selected: devices.micId },
            ...(devices.canChooseSpeaker
              ? [{ kind: 'speaker' as const, heading: labels.speaker, choices: [{ id: '', label: labels.drawnDefaultDevice }, ...devices.speakers], selected: devices.speakerId }]
              : []),
          ]}
        >
          <Control
            label={micOff ? labels.drawnUnmute : labels.drawnMute}
            ariaLabel={micOff ? labels.drawnUnmute : labels.drawnMute}
            pressed={micOff}
            off={micOff}
            onClick={() => call.setLocalAudio(micOff)}
            icon={micOff ? <MicOffIcon /> : <MicIcon />}
          />
        </DrawnDeviceMenu>
        <DrawnDeviceMenu
          label={labels.drawnCameraSettings}
          onChoose={devices.choose}
          sections={[{ kind: 'camera', heading: labels.camera, choices: devices.cameras, selected: devices.cameraId }]}
        >
          <Control
            label={camOff ? labels.drawnVideoStart : labels.drawnVideoStop}
            ariaLabel={camOff ? labels.drawnCameraOn : labels.drawnCameraOff}
            pressed={camOff}
            off={camOff}
            onClick={() => call.setLocalVideo(camOff)}
            icon={camOff ? <CameraOffIcon /> : <CameraIcon />}
          />
        </DrawnDeviceMenu>
        {effects.support.present && !isFolded('present') ? (
          <span className="ve-ctl-slot" data-fold-key="present">
            <Control
              label={presenting ? labels.drawnPresentStop : labels.drawnPresent}
              ariaLabel={presenting ? labels.drawnPresentStop : labels.drawnPresent}
              pressed={presenting}
              onClick={togglePresent}
              icon={<PresentIcon />}
            />
          </span>
        ) : null}
        {float.supported && !isFolded('float') ? (
          <span className="ve-ctl-slot" data-fold-key="float">
            <Control
              label={float.host ? labels.drawnFloatBack : labels.drawnFloat}
              ariaLabel={float.host ? labels.drawnFloatBack : labels.drawnFloatLong}
              pressed={Boolean(float.host)}
              onClick={() => (float.host ? float.close() : void float.open())}
              icon={<PopOutIcon />}
            />
          </span>
        ) : null}
        {isFolded('react') ? null : (
          <span className="ve-ctl-slot" data-fold-key="react">
            <DrawnReactMenu onReact={hands.react} />
          </span>
        )}
        {isFolded('chat') ? null : <span className="ve-ctl-badged" data-fold-key="chat">
          <Control
            label={labels.drawnChatShort}
            ariaLabel={chat.unread > 0 ? labels.drawnChatUnread(chat.unread) : labels.drawnChat}
            pressed={chatOpen}
            onClick={() => togglePanel('chat')}
            icon={<ChatIcon />}
          />
          {chat.unread > 0 ? <span className="ve-ctl-badge" aria-hidden="true">{chat.unread > 9 ? '9+' : chat.unread}</span> : null}
        </span>}
        {panels.map((x) =>
          isFolded(`p:${x.key}`) ? null : (
            <span key={x.key} className="ve-ctl-badged" data-fold-key={`p:${x.key}`}>
              <Control label={x.label} ariaLabel={x.title ?? x.label} pressed={panel === `p:${x.key}`} onClick={() => togglePanel(`p:${x.key}`)} icon={x.icon} />
              {x.badge ? <span className="ve-ctl-badge" aria-hidden="true">{x.badge > 9 ? '9+' : x.badge}</span> : null}
            </span>
          ),
        )}
        {isFolded('hand') ? null : (
          <span className="ve-ctl-slot" data-fold-key="hand">
            <Control
              label={labels.drawnHandShort}
              ariaLabel={hands.handUp ? labels.drawnLowerHand : labels.drawnRaiseHand}
              pressed={hands.handUp}
              onClick={hands.toggleHand}
              icon={<HandIcon />}
            />
          </span>
        )}
        {isFolded('people') ? null : <span className="ve-ctl-badged" data-fold-key="people">
          <Control
            label={labels.drawnPeopleShort}
            ariaLabel={labels.drawnPeople}
            pressed={peopleOpen}
            onClick={() => togglePanel('people')}
            icon={<PeopleIcon />}
          />
          {knocking + handsUp > 0 ? <span className="ve-ctl-badge" aria-hidden="true">{knocking + handsUp > 9 ? '9+' : knocking + handsUp}</span> : null}
        </span>}
        <DrawnMoreMenu
          onUseStandard={onUseStandard}
          actions={[
            ...(fullscreen.supported ? [{ key: 'fullscreen', title: fullscreen.on ? labels.drawnExitFullscreen : labels.drawnFullscreen, icon: <FullscreenIcon />, pressed: fullscreen.on, onSelect: fullscreen.toggle }] : []),
            ...(isFolded('float') ? [{ key: 'float', title: float.host ? labels.drawnFloatBack : labels.drawnFloatLong, icon: <PopOutIcon />, pressed: Boolean(float.host), onSelect: () => (float.host ? float.close() : void float.open()) }] : []),
            ...(isFolded('present') ? [{ key: 'present', title: presenting ? labels.drawnPresentStop : labels.drawnPresent, icon: <PresentIcon />, pressed: presenting, onSelect: togglePresent }] : []),
            ...(isFolded('react') ? REACTIONS.map((emoji) => ({ key: `react-${emoji}`, title: labels.drawnReactionName(emoji), icon: <span aria-hidden="true">{emoji}</span>, pressed: false, onSelect: () => hands.react(emoji) })) : []),
            ...(isFolded('hand') ? [{ key: 'hand', title: hands.handUp ? labels.drawnLowerHand : labels.drawnRaiseHand, icon: <HandIcon />, pressed: hands.handUp, onSelect: hands.toggleHand }] : []),
            ...panels.filter((x) => isFolded(`p:${x.key}`)).map((x) => ({ key: `p:${x.key}`, title: x.title ?? x.label, icon: x.icon, pressed: panel === `p:${x.key}`, badge: x.badge, onSelect: () => togglePanel(`p:${x.key}`) })),
            ...(isFolded('chat') ? [{ key: 'chat', title: chat.unread > 0 ? labels.drawnChatUnread(chat.unread) : labels.drawnChat, icon: <ChatIcon />, pressed: chatOpen, badge: chat.unread, onSelect: () => togglePanel('chat') }] : []),
            ...(isFolded('people') ? [{ key: 'people', title: labels.drawnPeople, icon: <PeopleIcon />, pressed: peopleOpen, badge: knocking + handsUp, onSelect: () => togglePanel('people') }] : []),
          ]}
          choices={[
            {
              title: labels.drawnLayout,
              value: view.mode,
              onChange: (key) => view.setMode(key as DrawnLayoutMode),
              options: [
                { key: 'auto', title: labels.drawnLayoutAuto, detail: labels.drawnLayoutAutoDetail, icon: <LayoutIcon /> },
                { key: 'tiled', title: labels.drawnLayoutTiled, detail: labels.drawnLayoutTiledDetail, icon: <PeopleIcon /> },
                { key: 'spotlight', title: labels.drawnLayoutSpotlight, detail: labels.drawnLayoutSpotlightDetail, icon: <PinIcon /> },
              ],
            },
          ]}
          switches={[
            ...(effects.support.noise ? [{ key: 'noise', on: effects.noise, title: labels.drawnNoise, detail: labels.drawnNoiseDetail, icon: <NoiseIcon />, onToggle: effects.toggleNoise }] : []),
            ...(effects.support.blur ? [{ key: 'blur', on: effects.blur, title: labels.drawnBlur, detail: labels.drawnBlurDetail, icon: <BlurIcon />, onToggle: effects.toggleBlur }] : []),
            { key: 'mirror', on: mirror, title: labels.drawnMirror, detail: labels.drawnMirrorDetail, icon: <MirrorIcon />, onToggle: toggleMirror },
            ...(float.supported ? [{ key: 'float', on: float.autoFloat, title: labels.drawnAutoFloat, detail: labels.drawnAutoFloatDetail, icon: <PopOutIcon />, onToggle: float.toggleAuto }] : []),
          ]}
        />
        <DrawnLeaveMenu onLeave={onLeave} onEndForEveryone={onEndForEveryone} />
      </div>
    </div>
  );
}

/** A crash while drawing the call never strands the person: it hands them to the standard screen. */
export class DrawnStageBoundary extends Component<{ children: ReactNode; onCrash: (error: Error) => void }, { crashed: boolean }> {
  state = { crashed: false };

  static getDerivedStateFromError(): { crashed: boolean } {
    return { crashed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    void info;
    this.props.onCrash(error);
  }

  render(): ReactNode {
    return this.state.crashed ? null : this.props.children;
  }
}
