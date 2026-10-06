# @shirahcan/video-embed

One call UI for every product on video-service (plan V18). Daily Prebuilt stays the in-call
experience; this package wraps it so a call that goes wrong is diagnosed, repaired and
explained, the same way in every product. It never calls a product's backend: the product
passes the functions that do.

```json
"@shirahcan/video-embed": "github:Shirahcan/video-embed#v0.1.0"
```

Peer deps: React 19, `@daily-co/daily-js`.

```tsx
import { VideoUiProvider, DeviceCheck, CallFrame } from '@shirahcan/video-embed';
import '@shirahcan/video-embed/styles.css';
```

## What it covers

| Failure | Before the call (active) | In the call (reactive) |
|---|---|---|
| Room missing, expired, token refused | (product: room repair in its detector) | `CallFrame` asks the product for a FRESH join once by itself (`fetchFreshUrl(kind)`): the product's backend repairs the room under the same name and mints a new token. Never "retry the dead URL". |
| Host removed someone | | Explained; never auto-rejoined |
| Network drop | | Waits for `online`, then rejoins |
| Mic or camera blocked by the browser | `DeviceCheck` names it and gives the steps for THAT browser | Banner + "Having trouble?" panel with the same steps |
| Blocked by the operating system | Told apart from a browser block ("Permission denied by system") | Same |
| Device busy, missing, or picked one fails | Retries the default device and says so | Switch microphone or camera without leaving |
| Silent microphone | Live meter; "we cannot hear anything" after 4 s | |
| Sound going nowhere | Test tone + "Did you hear it?" + speaker picker where the browser allows | |
| Someone knocking (old or pasted link) | | `KnockBar` above the call for the host: who is knocking, a chime, and where to let them in (with Prebuilt, admitting is only possible from Daily's own request in the frame; `updateWaitingParticipant` is call-object-only). `onKnock` for the product's own record |

Every failure is reported through `onFailure(failure, outcome)` so the product can keep a
record (retroactive).

## Wiring

```tsx
<VideoUiProvider labels={{ checkTitle: 'Before you join' }} theme={{ accent: '#4361EE' }}>
  {roomOpen && !joined && <DeviceCheck />}
  {joined && (
    <CallFrame
      url={joinUrl}                                    // tokened URL from your backend
      fetchFreshUrl={(why) => api.join({ recover: why })} // repair + new token
      onFailure={(f, outcome) => api.logJoinIssue(f.kind, outcome)}
      onJoined={...} onLeft={...}
    />
  )}
</VideoUiProvider>
```

Every sentence is a label (`DEFAULT_VIDEO_LABELS`), including the per-browser steps
(`fixSteps(problem, device, browser)`). Theme with `--ve-*` variables or the `theme` prop;
size the stage with `--ve-stage-height`.

## Pieces

| Export | Does |
|---|---|
| `useDailyFrame` | the Daily frame: StrictMode-safe, typed `failure`, diagnosed `deviceError`, `waiting` (from the knock events), `setDevices`, `rejoin` |
| `useMediaCheck` | mic meter, camera preview, speaker tone, device lists, diagnosis, auto-fix |
| `classifyCallError`, `REPAIRABLE` | Daily's fatal error -> kind; which kinds a fresh join can fix |
| `diagnoseMediaError`, `browserFamily` | getUserMedia error -> cause; which browser's steps to show |
| `CallFrame`, `DeviceCheck`, `Troubleshooter`, `KnockBar`, `ProblemCard` | the themed screens |
