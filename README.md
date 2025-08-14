# Customer Priority Score (CPS) – Zendesk App

A self-provisioning sidebar app that calculates CPS in real time and writes it to a ticket field.

## What it does
- Creates (or maps) these fields by **title** on first run (admin required):
  - **Impact** (dropdown: High, Medium, Low)
  - **Urgency** (dropdown: High, Medium, Low)
  - **Security flag** (checkbox)
  - **Manager override** (integer 0–5)
  - **Customer Priority Score** (integer, calculated)
- Watches field changes and recomputes CPS using your weights:
  - Impact: 12/8/4
  - Urgency: 12/8/4
  - Time open: >7d=6, 3–7d=4, 1–2d=2, <1d=0
  - Security flag: +4
  - Manager override: +0..5
- Updates the CPS field immediately.

## Install
1. Download the ZIP.
2. In Zendesk, go to **Admin Center → Apps and integrations → Zendesk Support apps**.
3. Click **Upload private app** and upload the ZIP.
4. Install. Ensure **an Admin** opens a ticket so the app can create fields if missing.

## Notes
- If a non-admin opens first, the app runs in mapping-only mode. An admin can open any ticket later to auto-create fields.
- The app keys off **field titles**. You can rename them in `main.js` under `FIELD_TITLES` if needed.
- Option order controls weights (12/8/4); reorder in Admin if desired.

## Dev
- Uses framework v2 and ZAFClient from Zendesk runtime.
- To modify, unzip, edit files, re-zip, and upload again.
