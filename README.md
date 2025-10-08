# Customer Priority Score (CPS) – Zendesk App

Real‑time Customer Priority Score in the ticket sidebar. The app computes a weighted score from ticket context and writes it back to a custom integer field so agents, SLAs, and views can sort by impact and urgency.

## Features
- **Auto‑provision or map fields** on first admin run (see Field Provisioning)
- **Live recalculation** when Impact, Priority, Security flag, or Override changes
- **Writes to ticket** immediately using the agent’s session (no OAuth required)
- **Safe writes**: debounced/queued/retried to avoid Zendesk save races
- **Diagnostics** pane and recent activity trail
- **Dark mode** and compact UI

## Scoring model (default)
- **Impact**: High 12 / Medium 8 / Low 4
- **Urgency (Priority)**: Urgent 12 / High 8 / Normal 4 / Low 0
- **Time open**: >7d 6 / 3–7d 4 / 1–2d 2 / <1d 0
- **Security flag**: +4 if checked
- **Manager override**: +1 … +5 (1–5)

Weights for Priority can be adjusted via app settings (see Configuration).

## Installation
1. Download the latest ZIP from `releases/` (for example `releases/cps-calculator-1.6.1.zip`).
2. In Zendesk, open **Admin Center → Apps and integrations → Zendesk Support apps**.
3. Click **Upload private app** and select the ZIP.
4. After install, open any ticket as an **Admin** once so the app can create missing fields automatically.

> Tip: If the app appears but fields are missing, simply open a ticket as an Admin to trigger auto‑provisioning.

## Field provisioning and mapping
On first admin run, the app tries to detect existing fields or create them when missing. It looks for:

- Impact dropdown: options tagged like `cps_impact_high|medium|low` or titles containing “Impact”
- Security flag: a checkbox with tag `cps_security_flag`
- Manager override: a dropdown with values `cps_override_1..5` or a title containing “CPS Manager override”
- CPS score: an integer field with title containing “CPS” or “Customer Priority Score”

Fallback metadata in `requirements.json` documents the expected shapes. The app keys off field titles and tags; you can rename titles in Zendesk if you prefer, as long as the tags/options remain recognizable.

## Configuration
These settings are provided via app parameters (set at install time):

- `priority_points_urgent` (default 12)
- `priority_points_high` (default 8)
- `priority_points_normal` (default 4)
- `priority_points_low` (default 0)
- `impact_allowed_groups` (optional, comma‑separated)
- `security_flag_allowed_groups` (optional, comma‑separated)
- `manager_override_allowed_groups` (optional, comma‑separated)

When an allowed‑groups list is provided, only members of those groups may change the corresponding field.

## Authentication
- Uses the **agent session** provided by Zendesk runtime. No OAuth configuration is required.

## Troubleshooting
- **App icon not visible**: Ensure you’re using the packaged ZIP and not a folder upload. Icons are bundled in `assets/` (`icon.png`, `icon_small.png`, plus logos). Avoid adding a custom `icons` block to `manifest.json` unless you also update file paths.
- **Fields didn’t create**: Open a ticket as an **Admin** to allow the app to create missing fields. Non‑admin runs only map existing fields.
- **Score not updating**: Change Impact/Priority and watch Diagnostics pane. If writes conflict with agent saves, the safe‑write layer will retry. Ensure your CPS field is an Integer and not restricted by form/permissions.
- **Layout issues**: Clear browser cache or reload the app iframe. The UI auto‑resizes; Diagnostics will display if any init step fails.

## Development
- Framework: Zendesk Apps Framework v2 (ZAFClient is loaded from Zendesk runtime)
- Key files: `assets/index.html`, `assets/main.js`, `assets/style.css`, `assets/safe-api.js`
- Safe writes: `assets/safe-api.js` exposes `window.safeApi.safeUpdate()` used by a client wrapper to queue/debounce/retry ticket PUTs

### Local edits
1. Modify files under `assets/`.
2. Zip the project root contents (exclude `.git`, `__MACOSX`, `.DS_Store`).
3. Upload the ZIP as a private app.

Example packaging command from the repo root:

```bash
zip -r releases/cps-calculator-<version>.zip . -x "*.DS_Store" "*__MACOSX*" "*.git*" "*.zip"
```

## Releases
- Built packages are kept in the `releases/` folder (e.g., `cps-calculator-1.6.1.zip`).
- Versioning follows **SemVer** for app changes.

## License
All rights reserved.
