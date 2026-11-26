import type { CallFailureKind } from './callErrors';
import type { TranscriptState } from './components/TranscriptStatus';
import type { BrowserFamily, MediaDevice, MediaProblem } from './diagnose';

/**
 * Every sentence the package shows. A product overrides any of them through
 * <VideoUiProvider labels={...}> for its own voice or language. The defaults name no
 * product and no product's records.
 */
export interface VideoLabels {
  // Device check
  checkTitle: string;
  checkIntro: string;
  checkStart: string;
  checkAgain: string;
  microphone: string;
  camera: string;
  speaker: string;
  micListening: string;
  waitingForPermission: string;
  permissionHint: string;
  micHeard: string;
  micSilent: string;
  cameraOk: string;
  cameraOff: string;
  speakerTest: string;
  speakerPlaying: string;
  speakerAsk: string;
  speakerYes: string;
  speakerNo: string;
  speakerFix: string;
  speakerDefaultOnly: string;
  allGood: string;
  neverBlocks: string;
  autoFixed: (what: string) => string;
  // Troubleshooting
  troubleTitle: string;
  troubleOpen: string;
  troubleClose: string;
  problemTitle: (problem: MediaProblem, device: MediaDevice) => string;
  fixSteps: (problem: MediaProblem, device: MediaDevice, browser: BrowserFamily) => string[];
  tryAgain: string;
  rejoin: string;
  joinWithoutCamera: string;
  // Call failures and recovery
  failureTitle: (kind: CallFailureKind) => string;
  failureDetail: (kind: CallFailureKind) => string;
  connecting: string;
  /** The call dock's mini-player, while the person is away from the call's page. */
  dockBack: string;
  dockLeave: string;
  dockMute: string;
  dockUnmute: string;
  dockRegion: string;
  prejoinPermissionHint: string;
  repairing: string;
  repaired: string;
  repairFailed: string;
  /** BackupCallOffer: carry on in a matching Google Meet when the room cannot be fixed. */
  backupSwitch: string;
  backupSwitching: string;
  backupHint: string;
  backupOpen: string;
  backupSent: string;
  backupFailed: string;
  backupMoved: string;
  waitingForNetwork: string;
  // Host: people knocking
  knockingOne: (name: string) => string;
  knockingMany: (count: number) => string;
  knockingHint: string;
  /** The host's answer on the drawn screen, and who a nameless knocker is. */
  knockLetIn: string;
  /** The title over one person's Let in / Deny row (their name is on the row). */
  knockAnswerOne: string;
  knockDeny: string;
  knockSomeone: string;
  // Ask to join by an anyone-link (AskToJoin), and the host letting them in (JoinRequestBar)
  askTitle: string;
  askIntro: string;
  askName: string;
  askSubmit: string;
  askAsking: string;
  askWaiting: string;
  askWaitingHint: string;
  askDeclined: string;
  askExpired: string;
  askAgain: string;
  askFailed: string;
  requestLetIn: string;
  requestDecline: string;
  requestHint: string;
  // The call against its booked time (ScheduledEndCue)
  endCueCountdown: (mmss: string) => string;
  endCueMinutes: (minutes: number) => string;
  endCueReached: string;
  // Ending the call
  endForEveryone: string;
  endConfirmTitle: string;
  endConfirmDetail: string;
  endCancel: string;
  ending: string;
  endFailed: string;
  leftTitle: string;
  leftKeepOpen: string;
  // Waiting alone (nobody else in the call for a while)
  aloneTitle: (minutes: number) => string;
  aloneDetail: string;
  aloneKeepWaiting: string;
  aloneLeave: string;
  callEnded: string;
  callEndedDetail: string;
  // One call per machine (CallFrame's single-tab guard)
  heldElsewhereTitle: string;
  /** Any page of another tab while a call runs in this browser (CallInAnotherTabNotice). */
  callInAnotherTab: string;
  /** The drawn call screen (Daily's call object, drawn by the kit). */
  drawnYou: string;
  drawnWaiting: string;
  drawnMute: string;
  drawnUnmute: string;
  drawnCameraOff: string;
  drawnCameraOn: string;
  drawnLeave: string;
  drawnMore: string;
  drawnUseStandard: string;
  drawnUseStandardDetail: string;
  drawnRegion: string;
  drawnControls: string;
  drawnMuted: string;
  drawnVideoStop: string;
  drawnVideoStart: string;
  drawnMoreShort: string;
  drawnPresenting: (name: string) => string;
  /** The drawn screen has no Join button: the call starts once the browser's camera / microphone prompt is answered. */
  drawnPermissionHint: string;
  /** P2c: the arrows on Mute / Stop video, and what the drawn screen says about devices. */
  drawnMicSettings: string;
  drawnCameraSettings: string;
  drawnDefaultDevice: string;
  /** `label` null = the device was pulled out and the call fell back to the system default. */
  drawnDeviceSwitched: (kind: 'microphone' | 'camera' | 'speaker', label: string | null) => string;
  /** A chosen device would not start; the call kept the one it had. */
  drawnDeviceFailed: (label: string, kept: string | null) => string;
  drawnSoundBlocked: string;
  drawnHearCall: string;
  drawnDismiss: string;
  /** The knocker's side on the drawn screen. */
  drawnAsking: string;
  drawnAskingDetail: string;
  drawnDenied: string;
  drawnDeniedDetail: string;
  /** P2d chat. */
  drawnChat: string;
  drawnChatShort: string;
  drawnChatUnread: (count: number) => string;
  drawnChatTitle: string;
  drawnChatNote: string;
  drawnChatEmpty: string;
  drawnChatPlaceholder: string;
  drawnChatSend: string;
  drawnChatClose: string;
  /** P2d connection. */
  drawnReconnecting: string;
  drawnWeak: string;
  drawnWeakVideoOff: string;
  /** P2e presenting and effects. */
  drawnPresent: string;
  drawnPresentStop: string;
  drawnPresentingYou: string;
  drawnNoise: string;
  drawnNoiseDetail: string;
  drawnBlur: string;
  drawnBlurDetail: string;
  drawnEffectFailed: (effect: 'noise' | 'blur') => string;
  drawnMirror: string;
  drawnMirrorDetail: string;
  /** P3a floating window. */
  drawnFloat: string;
  drawnFloatLong: string;
  drawnFloatBack: string;
  drawnFloated: string;
  drawnFloatedDetail: string;
  drawnFloatFailed: string;
  drawnAutoFloat: string;
  drawnAutoFloatDetail: string;
  heldElsewhereDetail: string;
  moveCallHere: string;
  // Call continuity: the same person on another device (InCallElsewhere)
  inCallElsewhereTitle: string;
  inCallElsewhereDetail: (since: string | null) => string;
  switchHere: string;
  joinHereToo: string;
  movedElsewhereTitle: string;
  movedElsewhereDetail: string;
  moveCallBackHere: string;
  // The call is transcribed (TranscriptionNotice): the host keeps the record, everyone else is told
  transcriptionNoticeHost: string;
  transcriptionNoticeAttendee: string;
  // A call on another platform (ExternalCall)
  externalTitle: (platform: string) => string;
  externalDetail: string;
  externalOpen: (platform: string) => string;
  externalPassword: string;
  externalMissing: string;
  externalMissingDetail: string;
  callEndedByYouDetail: string;
  /** The running call clock, for screen readers ("Call time 12:04"). */
  callElapsed: (time: string) => string;
  /** The call-over notice: where the person is being taken. */
  callOverMoving: (destination: string) => string;
  callOverGoNow: string;
  // Transcript retention (admin)
  retentionTitle: string;
  retentionIntro: string;
  retentionDays: string;
  retentionHint: (maxDays: number) => string;
  retentionSave: string;
  retentionSaved: string;
  retentionFailed: string;

  // Call transcript
  transcriptTitle: (state: TranscriptState) => string;
  transcriptDetail: (state: TranscriptState, ctx: { expectedByLabel: string | null; readyWithinMinutes: number }) => string;
  transcriptAdd: string;
  transcriptView: string;
  transcriptDownload: string;
  transcriptReplace: string;
  /** The kebab menu's accessible name. */
  transcriptActions: string;
  /** A menu item while its action runs. */
  transcriptWorking: string;
  /** The three readings of a held transcript, from the strip's kebab (TranscriptReader). */
  transcriptReadRecap: string;
  transcriptReadTidied: string;
  transcriptReadAsSpoken: string;
  readerClose: string;
  /* Share a call link (a person's own link, or a guest link that asks to join) */
  shareStripTitle: string;
  shareStripHint: string;
  shareOpen: string;
  shareTitle: string;
  shareWho: string;
  sharePersonHint: string;
  shareGuestHint: string;
  shareLoading: string;
  shareMaking: string;
  shareCopy: string;
  shareCopied: string;
  shareShare: string;
  shareClose: string;
  shareFailed: string;
  /** The text a device's share sheet sends with the link. */
  shareText: (callTitle: string) => string;
  readerCopy: string;
  readerCopied: string;
  // A call's kept transcripts (TranscriptPanel)
  transcriptsHeading: string;
  transcriptPreparing: string;
  transcriptFailed: string;
  transcriptShow: string;
  transcriptHide: string;
  /** The toggle between the product's tidied text and the words as spoken. */
  transcriptTidied: string;
  transcriptAsSpoken: string;
  transcriptCopy: string;
  transcriptDownloadText: string;
  transcriptCopied: string;
  /** A transcript a person supplied: who, when the product knows. */
  transcriptAddedBy: (who: string | null) => string;
  transcriptLength: (seconds: number) => string;
  // A call's LIVE transcription and the way to start it (LiveTranscription)
  liveTranscriptionRunningTitle: string;
  liveTranscriptionRunningDetail: string;
  liveTranscriptionStoppedTitle: string;
  liveTranscriptionStoppedDetail: (presentCount: number) => string;
  liveTranscriptionWaitingTitle: string;
  liveTranscriptionWaitingDetail: string;
  liveTranscriptionStart: string;
  liveTranscriptionStarting: string;
  liveTranscriptionAsked: string;
  // Who could not get into the call (JoinIssuesPanel)
  issuesHeading: string;
  issuesIntro: string;
  issueWhat: (kind: string) => string;
  issueOutcome: (outcome: string) => string;
  issueSomeone: string;
  // In-call device trouble
  deviceTroubleInCall: string;
  dismiss: string;
}

const ISSUE_WHAT: Record<string, string> = {
  'room-missing': 'The room was missing',
  'room-expired': 'The room had closed',
  'token-expired': 'Their join link had expired',
  'not-allowed': 'The room refused them',
  'not-open-yet': 'The room was not open yet',
  ejected: 'They were removed from the call',
  'meeting-full': 'The call was full',
  'unsupported-browser': 'Their browser was too old',
  network: 'Their connection dropped',
  'blocked-browser': 'Their browser blocked the device',
  'blocked-system': 'Their computer blocked the browser from the device',
  'not-found': 'No device was found',
  'in-use': 'Another app was using the device',
  constraints: 'The chosen device could not start',
  silent: 'The microphone heard nothing',
  insecure: 'The page could not use devices',
  unsupported: 'The browser could not use devices',
  unknown: 'Something stopped the call',
};

const ISSUE_OUTCOME: Record<string, string> = {
  repaired: 'fixed automatically',
  failed: 'could not be fixed',
  offline: 'waited for their connection',
  idle: 'shown to them',
};

const DEVICE = { microphone: 'microphone', camera: 'camera' } as const;

function permissionSteps(device: MediaDevice, browser: BrowserFamily): string[] {
  const d = DEVICE[device];
  switch (browser) {
    case 'chrome':
    case 'edge':
      return [
        'Click the icon at the left of the address bar (a padlock or sliders).',
        `Set ${d === 'microphone' ? 'Microphone' : 'Camera'} to Allow.`,
        'Reload this page, then check again.',
      ];
    case 'firefox':
      return [
        `Click the crossed-out ${d} icon in the address bar.`,
        'Remove the "Blocked temporarily" or "Blocked" entry.',
        'Reload this page and choose Allow when Firefox asks.',
      ];
    case 'safari':
      return [
        'In the Safari menu choose Settings for This Website.',
        `Set ${d === 'microphone' ? 'Microphone' : 'Camera'} to Allow.`,
        'Reload this page, then check again.',
      ];
    case 'ios':
      return [
        'Open the Settings app, scroll to Safari (or the browser you use).',
        `Under Settings for Websites, set ${d === 'microphone' ? 'Microphone' : 'Camera'} to Allow or Ask.`,
        'Come back and reload this page.',
      ];
    case 'android':
      return [
        'Tap the icon at the left of the address bar, then Permissions.',
        `Turn ${d === 'microphone' ? 'Microphone' : 'Camera'} on.`,
        'Reload this page, then check again.',
      ];
    default:
      return [`Allow this site to use your ${d} in your browser's site settings, then reload.`];
  }
}

function systemSteps(device: MediaDevice): string[] {
  const d = DEVICE[device];
  return [
    `On a Mac: System Settings, Privacy & Security, ${d === 'microphone' ? 'Microphone' : 'Camera'}: turn your browser on.`,
    `On Windows: Settings, Privacy & security, ${d === 'microphone' ? 'Microphone' : 'Camera'}: turn on access for apps and for your browser.`,
    'Quit and reopen the browser, then come back to this page.',
  ];
}

export const DEFAULT_VIDEO_LABELS: VideoLabels = {
  checkTitle: 'Check your camera, microphone and sound',
  checkIntro: 'Takes a few seconds. You can join whatever it finds.',
  checkStart: 'Start the check',
  checkAgain: 'Check again',
  microphone: 'Microphone',
  camera: 'Camera',
  speaker: 'Speaker',
  micListening: 'Say something...',
  waitingForPermission: 'Allow it when your browser asks',
  permissionHint: 'Your browser is asking to use your microphone and camera, usually near the address bar. Choose Allow.',
  micHeard: 'We can hear you',
  micSilent: 'We cannot hear anything yet',
  cameraOk: 'Your camera works',
  cameraOff: 'No camera picture',
  speakerTest: 'Play a test sound',
  speakerPlaying: 'Playing...',
  speakerAsk: 'Did you hear the sound?',
  speakerYes: 'Yes',
  speakerNo: 'No',
  speakerFix: 'Turn your volume up, unmute the computer, or choose another speaker (above, or in your computer\x27s sound settings), then play it again.',
  speakerDefaultOnly: 'This browser plays sound through your system speaker; change it in your computer\'s sound settings.',
  allGood: 'Everything works. You are ready to join.',
  neverBlocks: 'Something not working? You can still join, and fix it from inside the call.',
  autoFixed: (what) => `We fixed it for you: ${what}.`,
  troubleTitle: 'Having trouble?',
  troubleOpen: 'Having trouble?',
  troubleClose: 'Close',
  problemTitle: (problem, device) => {
    const d = DEVICE[device];
    switch (problem) {
      case 'blocked-browser': return `Your browser is blocking the ${d}`;
      case 'blocked-system': return `Your computer is blocking the browser from the ${d}`;
      case 'not-found': return `No ${d} was found`;
      case 'in-use': return `Another app is using your ${d}`;
      case 'constraints': return `That ${d} could not start`;
      case 'insecure': return `This page cannot use your ${d}`;
      case 'unsupported': return `This browser cannot use a ${d} here`;
      case 'silent': return 'Your microphone is on but hears nothing';
      default: return `Your ${d} could not be started`;
    }
  },
  fixSteps: (problem, device, browser) => {
    const d = DEVICE[device];
    switch (problem) {
      case 'blocked-browser': return permissionSteps(device, browser);
      case 'blocked-system': return systemSteps(device);
      case 'not-found': return [`Plug in a ${d} (or a headset) and make sure it is switched on.`, 'Pick it in the list above, then check again.'];
      case 'in-use': return ['Close other call apps (Zoom, Teams, Meet, WhatsApp) and other tabs on a call.', 'Then check again. Restarting the browser helps if it stays busy.'];
      case 'constraints': return [`Pick a different ${d} in the list above.`, 'Then check again.'];
      case 'insecure': return ['Open the meeting from the link in your email, which starts with https://.'];
      case 'unsupported': return ['Open the meeting in an up-to-date Chrome, Edge, Safari or Firefox.'];
      case 'silent': return ['Check the microphone is not muted (a switch on the headset, or a mute key).', 'Pick another microphone in the list above, then speak again.', 'Turn up the input volume in your computer\'s sound settings.'];
      default: return ['Reload the page and check again.', 'If it keeps failing, try another browser.'];
    }
  },
  tryAgain: 'Try again',
  rejoin: 'Rejoin the call',
  joinWithoutCamera: 'Join with sound only',
  failureTitle: (kind) => {
    switch (kind) {
      case 'room-missing':
      case 'room-expired':
      case 'not-allowed':
      case 'not-open-yet':
      case 'token-expired': return 'The meeting room needs a moment';
      case 'ejected': return 'You were removed from the call';
      case 'meeting-full': return 'The call is full';
      case 'unsupported-browser': return 'This browser is too old for the call';
      case 'network': return 'Your connection dropped';
      default: return 'The call stopped';
    }
  },
  failureDetail: (kind) => {
    switch (kind) {
      case 'room-missing':
      case 'room-expired':
      case 'not-allowed':
      case 'not-open-yet':
      case 'token-expired': return 'We are fixing the room and letting you in. Your link stays the same.';
      case 'ejected': return 'If that was a mistake, ask the host to let you back in.';
      case 'meeting-full': return 'Ask the host to make room, then rejoin.';
      case 'unsupported-browser': return 'Open the meeting in an up-to-date Chrome, Edge, Safari or Firefox.';
      case 'network': return 'We will reconnect as soon as you are back online.';
      default: return 'Rejoin to carry on.';
    }
  },
  connecting: 'Connecting you to the call...',
  dockBack: 'Back to call',
  dockLeave: 'Leave',
  dockMute: 'Mute',
  dockUnmute: 'Unmute',
  dockRegion: 'Your call',
  prejoinPermissionHint: 'No Join button in the call? Your browser may be asking to use your camera and microphone (look near the address bar) - choose Allow.',
  repairing: 'Fixing the room...',
  repaired: 'Room fixed. Reconnecting you.',
  repairFailed: 'We could not fix the room just now. Try again in a moment.',
  backupSwitch: 'Switch to a backup Google Meet',
  backupSwitching: 'Making the backup meeting...',
  backupHint: 'Still not working? Carry on in a Google Meet instead. Everyone in this call is sent the link.',
  backupOpen: 'Open the backup Google Meet',
  backupSent: 'Everyone in this call has been sent this link.',
  backupFailed: 'The backup meeting could not be made just now. Try again in a moment.',
  backupMoved: 'This call moved to a backup Google Meet.',
  waitingForNetwork: 'Waiting for your connection...',
  knockingOne: (name) => `${name || 'Someone'} is asking to join`,
  knockingMany: (count) => `${count} people are asking to join`,
  knockingHint: 'Let them in from the request shown inside the call.',
  knockLetIn: 'Let in',
  knockAnswerOne: 'Someone wants to join this call',
  knockDeny: 'Deny',
  knockSomeone: 'Someone',
  askTitle: 'Ask to join this call',
  askIntro: 'Tell the host who you are. They will let you in from the call.',
  askName: 'Your name',
  askSubmit: 'Ask to join',
  askAsking: 'Asking...',
  askWaiting: 'Waiting for the host to let you in',
  askWaitingHint: 'Keep this page open. You will join as soon as they say yes.',
  askDeclined: 'The host did not let you in to this call.',
  askExpired: 'Nobody answered in time. You can ask again.',
  askAgain: 'Ask again',
  askFailed: 'Your request could not be sent. Please try again.',
  requestLetIn: 'Let in',
  requestDecline: 'Decline',
  requestHint: 'They opened a link to this call and are waiting to join.',
  endCueCountdown: (mmss) => `${mmss} left in the scheduled time`,
  endCueMinutes: (minutes) => (minutes === 1 ? 'About 1 minute left in the scheduled time' : `About ${minutes} minutes left in the scheduled time`),
  endCueReached: 'You are at the end of the scheduled meeting time',
  endForEveryone: 'End for everyone',
  endConfirmTitle: 'End the call for everyone?',
  endConfirmDetail: 'Everyone is removed now and the link stops working. This cannot be undone.',
  endCancel: 'Keep the call going',
  ending: 'Ending the call...',
  endFailed: 'The call could not be ended just now. Try again.',
  leftTitle: 'You left the call. Is it over?',
  leftKeepOpen: 'Leave it open and the others can carry on; it ends by itself once everyone has gone.',
  aloneTitle: (minutes) => `You have been the only one here for ${minutes} minutes`,
  aloneDetail: 'Keep waiting if they may still join, or leave the call. You can come back through the same link.',
  aloneKeepWaiting: 'Keep waiting',
  aloneLeave: 'Leave the call',
  callEnded: 'This call has ended',
  callEndedDetail: 'The host ended the call for everyone. You can close this page.',
  heldElsewhereTitle: 'You are already in this call in another tab',
  callInAnotherTab: 'Your call is running in another tab.',
  drawnYou: 'You',
  drawnWaiting: 'Waiting for the others to join',
  drawnMute: 'Mute',
  drawnUnmute: 'Unmute',
  drawnCameraOff: 'Turn off camera',
  drawnCameraOn: 'Turn on camera',
  drawnLeave: 'Leave',
  drawnMore: 'More options',
  drawnUseStandard: 'Use the standard call screen',
  drawnUseStandardDetail: 'Switches this device to the standard call screen. You join again with one click.',
  drawnRegion: 'Call',
  drawnControls: 'Call controls',
  drawnMuted: 'Muted',
  drawnVideoStop: 'Stop video',
  drawnVideoStart: 'Start video',
  drawnMoreShort: 'More',
  drawnPresenting: (name) => `${name} is presenting`,
  drawnPermissionHint: 'Your browser is asking to use your camera and microphone (look near the address bar). Choose Allow and you join the call.',
  drawnMicSettings: 'Microphone and speaker',
  drawnCameraSettings: 'Camera',
  drawnDefaultDevice: 'System default',
  drawnDeviceSwitched: (kind, label) => (label ? `Your ${kind} is now ${label}.` : `Your ${kind} was unplugged, so the call is using the system default.`),
  drawnSoundBlocked: 'Your browser is holding back the call sound until you click on the page.',
  drawnHearCall: 'Hear the call',
  drawnDismiss: 'Dismiss',
  drawnAsking: 'Asking to join',
  drawnAskingDetail: 'The host has been told you are here and will let you in shortly.',
  drawnDenied: 'The host did not let you in',
  drawnDeniedDetail: 'If you think this is a mistake, contact them and ask for a new link.',
  drawnChat: 'Chat with everyone',
  drawnChatShort: 'Chat',
  drawnChatUnread: (count) => `Chat with everyone, ${count} new ${count === 1 ? 'message' : 'messages'}`,
  drawnChatTitle: 'In-call messages',
  drawnChatNote: 'Everyone in the call sees these. They are not kept after the call ends.',
  drawnChatEmpty: 'No messages yet.',
  drawnChatPlaceholder: 'Send a message to everyone',
  drawnChatSend: 'Send',
  drawnChatClose: 'Close chat',
  drawnReconnecting: 'Your connection dropped. Reconnecting...',
  drawnWeak: 'Your connection is weak. Turning off your video keeps the sound clear.',
  drawnWeakVideoOff: 'Turn off video',
  drawnPresent: 'Present',
  drawnPresentStop: 'Stop presenting',
  drawnPresentingYou: 'You are presenting to everyone.',
  drawnNoise: 'Reduce background noise',
  drawnNoiseDetail: 'Quietens typing, fans and traffic behind your voice.',
  drawnBlur: 'Blur my background',
  drawnBlurDetail: 'Keeps you sharp and softens the room behind you.',
  drawnEffectFailed: (effect) =>
    effect === 'noise' ? 'Background noise could not be reduced in this browser.' : 'Your background could not be blurred in this browser.',
  drawnMirror: 'Mirror my video',
  drawnMirrorDetail: 'Only changes your own view. Others always see you the right way round.',
  drawnFloat: 'Pop out',
  drawnFloatLong: 'Pop the call out into a small window',
  drawnFloatBack: 'Back to the tab',
  drawnFloated: 'Your call is in the small window',
  drawnFloatedDetail: 'It stays on top while you work in other tabs and apps.',
  drawnFloatFailed: 'The small window could not open. Try Pop out again.',
  drawnAutoFloat: 'Pop out when I switch tabs',
  drawnAutoFloatDetail: 'While your camera or microphone is on, the call follows you into a small window when you switch tabs.',
  drawnDeviceFailed: (label, kept) => `${label || 'That device'} would not start (another app may be using it)${kept ? `, so the call kept ${kept}` : ''}.`,
  heldElsewhereDetail: 'Joining twice from one device makes both microphones live, which causes echo for everyone else. Switch back to the other tab, or move the call here.',
  moveCallHere: 'Move the call here',
  inCallElsewhereTitle: "You're in this call on another device",
  inCallElsewhereDetail: (since) => `${since ? `You joined at ${since} on another device. ` : ''}Switch the call here, or join here too with your microphone and camera off so there is no echo.`,
  switchHere: 'Switch here',
  joinHereToo: 'Join here too',
  movedElsewhereTitle: 'You joined on another device',
  movedElsewhereDetail: 'The call moved to your other device, so it left this one. You can move it back here.',
  moveCallBackHere: 'Move the call back here',
  transcriptionNoticeHost: 'This call is transcribed, so you keep an accurate record of what was discussed. Everyone in the call sees this notice.',
  transcriptionNoticeAttendee: 'This call is transcribed so the host keeps an accurate record of what was discussed. Ask them if you have questions about it.',
  externalTitle: (platform) => `This call runs on ${platform}`,
  externalDetail: 'It opens in a new tab. You can keep this page open.',
  externalOpen: (platform) => `Open ${platform}`,
  externalPassword: 'Password',
  externalMissing: 'No call link yet',
  externalMissingDetail: 'This meeting does not have a call link attached. Ask the host to add one.',
  callEndedByYouDetail: 'You ended the call for everyone.',
  callElapsed: (time) => `Call time ${time}`,
  callOverMoving: (destination) => `Taking you back to ${destination}...`,
  callOverGoNow: 'Go now',
  retentionTitle: 'Call transcripts',
  retentionIntro: 'How long a call transcript is kept after the call. It is then deleted for good, here and on the video provider.',
  retentionDays: 'Delete transcripts after (days)',
  retentionHint: (maxDays) => `Leave empty to keep them. 1 to ${maxDays} days.`,
  retentionSave: 'Save',
  retentionSaved: 'Saved',
  retentionFailed: 'The retention could not be saved. Try again.',
  transcriptTitle: (state) => {
    switch (state) {
      case 'preparing': return 'Transcript on its way';
      case 'ready': return 'Transcript ready';
      case 'overdue': return 'No transcript yet';
      case 'not_transcribed': return 'Not transcribed';
      case 'no_call': return 'No call held here';
      case 'unknown': return 'Transcript status unavailable';
      default: return 'Call transcript';
    }
  },
  transcriptDetail: (state, { expectedByLabel, readyWithinMinutes }) => {
    switch (state) {
      case 'not_started': return 'The call has not started. It is transcribed while it runs. If you held it somewhere else, you can add the record.';
      case 'in_call': return 'The call is on now. Its transcript arrives after it ends.';
      case 'preparing': return expectedByLabel
        ? `The call has ended and the transcript is being prepared. Expect it ${expectedByLabel}.`
        : `The call has ended and the transcript is being prepared. It usually arrives within ${readyWithinMinutes} minutes.`;
      case 'ready': return 'The transcript is ready and being collected.';
      case 'held': return 'The full record of the call.';
      case 'overdue': return `The call ended more than ${readyWithinMinutes} minutes ago and no transcript arrived. If you have a record of the call, add it.`;
      case 'not_transcribed': return 'Transcription was off for this call, so there is no transcript. If you have a record of the call, add it.';
      case 'no_call': return 'Nobody joined this call on the platform. If it happened somewhere else, add the record.';
      default: return 'We could not check on the transcript just now.';
    }
  },
  transcriptAdd: 'Add transcript',
  transcriptView: 'View',
  transcriptDownload: 'Download',
  transcriptReplace: 'Replace',
  transcriptActions: 'Transcript actions',
  transcriptWorking: 'Working...',
  transcriptReadRecap: 'Read the recap',
  transcriptReadTidied: 'Read the tidied transcript',
  transcriptReadAsSpoken: 'Read it as spoken',
  readerClose: 'Close',
  shareStripTitle: 'Invite someone to this call',
  shareStripHint: 'Send a person their own link, or a link anyone can use to ask to join.',
  shareOpen: 'Share link',
  shareTitle: 'Share a link to this call',
  shareWho: 'Who is it for?',
  sharePersonHint: 'Their own link: it opens the call without signing in, as them. Send it only to them.',
  shareGuestHint: 'Anyone with this link types their name and asks to join. You let them in from the call.',
  shareLoading: 'Loading...',
  shareMaking: 'Making the link...',
  shareCopy: 'Copy link',
  shareCopied: 'Copied',
  shareShare: 'Share...',
  shareClose: 'Close',
  shareFailed: 'The link could not be made. Please try again.',
  shareText: (callTitle) => `Join "${callTitle}"`,
  readerCopy: 'Copy text',
  readerCopied: 'Copied',
  transcriptsHeading: 'Call transcripts',
  transcriptPreparing: 'The transcript is being prepared. It usually lands a few minutes after the call ends.',
  transcriptFailed: "This call's transcript could not be made. The call itself was not affected; if you have a record of it, add it.",
  transcriptShow: 'Show full transcript',
  transcriptHide: 'Hide full transcript',
  transcriptTidied: 'Tidied',
  transcriptAsSpoken: 'As spoken',
  transcriptCopy: 'Copy transcript',
  transcriptDownloadText: 'Download as text',
  transcriptCopied: 'Transcript copied',
  transcriptAddedBy: (who) => (who ? `Added by ${who}` : 'Added by hand'),
  liveTranscriptionRunningTitle: 'Being transcribed',
  liveTranscriptionRunningDetail: 'This call is being transcribed now.',
  liveTranscriptionStoppedTitle: 'Not being transcribed',
  liveTranscriptionStoppedDetail: (n) => `${n === 1 ? 'Someone is' : `${n} people are`} in the call and transcription has not started. Start it now, or nothing said from here on is recorded.`,
  liveTranscriptionWaitingTitle: 'Transcription starts when someone joins',
  liveTranscriptionWaitingDetail: 'Nobody is in the call yet. Transcription starts on its own as soon as anyone joins.',
  liveTranscriptionStart: 'Start transcription',
  liveTranscriptionStarting: 'Starting...',
  liveTranscriptionAsked: 'Asked to start. It shows as being transcribed within a few seconds.',
  transcriptLength: (seconds) => {
    const minutes = Math.round(seconds / 60);
    return minutes < 1 ? 'under a minute' : `${minutes} min`;
  },
  issuesHeading: 'Joining problems',
  issuesIntro: 'What stopped someone getting into this call, and what happened next.',
  issueWhat: (kind) => ISSUE_WHAT[kind] ?? 'Something stopped the call',
  issueOutcome: (outcome) => ISSUE_OUTCOME[outcome] ?? outcome,
  issueSomeone: 'Someone',
  deviceTroubleInCall: 'Your camera or microphone stopped working.',
  dismiss: 'Dismiss',
};
