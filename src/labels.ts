import type { CallFailureKind } from './callErrors';
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
  repairing: string;
  repaired: string;
  repairFailed: string;
  waitingForNetwork: string;
  // Host: people knocking
  knockingOne: (name: string) => string;
  knockingMany: (count: number) => string;
  knockingHint: string;
  // In-call device trouble
  deviceTroubleInCall: string;
  dismiss: string;
}

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
  repairing: 'Fixing the room...',
  repaired: 'Room fixed. Reconnecting you.',
  repairFailed: 'We could not fix the room just now. Try again in a moment.',
  waitingForNetwork: 'Waiting for your connection...',
  knockingOne: (name) => `${name || 'Someone'} is asking to join`,
  knockingMany: (count) => `${count} people are asking to join`,
  knockingHint: 'Let them in from the request shown inside the call.',
  deviceTroubleInCall: 'Your camera or microphone stopped working.',
  dismiss: 'Dismiss',
};
