# No Orb Ads

> ⚠️ **Status: Currently Broken** — This plugin is currently broken and may not function properly on recent Discord / Revenge versions.

Block or mute Discord Quest and Orb video ads to save data, battery, and bandwidth while farming Orbs.

## Features

- **5-Layer Ad Blocking:**
  - **Flag Patching:** Overrides quest video playback flags and marks requirements without loading full ad streams.
  - **Component Hiding:** Automatically suppresses video ad players and promotional containers in the UI.
  - **Video Collapse:** Collapses ad video containers to prevent rendering overhead.
  - **REST API Interception:** Intercepts Quest video streaming and telemetry requests to prevent ad media downloads.
  - **Experiment Gating:** Overrides client experiment stores related to video quest ads.
- **Mute Only Mode:** Optional setting that leaves video playback active for strict quest verification while completely muting the audio stream.
- **Settings Dashboard:** Built-in settings toggle in Revenge/Vendetta to switch between full ad blocking and mute-only mode anytime.

## Settings

Navigate to **Settings → Plugins → No Orb Ads** to configure:
- **Mute Only:** Keep videos playing silently instead of blocking them completely.

## Installation

Add the plugin URL to Revenge/Vendetta:
```
https://ilickft.github.io/revenge-plugins/no-orb-ads/
```
