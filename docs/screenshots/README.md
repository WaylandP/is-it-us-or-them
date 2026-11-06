# Interface screenshots

`dashboard.webp` is a cropped and resized Chromium capture of the implemented dashboard, using explicitly simulated API data. The service incident, maintenance, timestamps and organization are illustrative, not live vendor information.

The capture shows the real HTML/CSS/JavaScript, not an image-generation concept. It was rendered locally through an offline DOM adapter because that environment does not allow browser navigation. The same frontend was also verified through the normal local-HTTP browser harness in CI.

To reproduce the full screenshot set, including light/dark themes, phone layouts, administration and dialogs:

```bash
python -m pip install -r scripts/requirements-ui.txt
python -m playwright install --with-deps chromium
python scripts/ui-check.py --output ui-artifacts
```

The `UI checks` GitHub Actions workflow uploads the full images and its scenario results as `ui-checks-and-screenshots`. These artifacts expire after 14 days; the checked-in preview remains available. Refresh the preview when layout changes, and never present simulated provider incidents as live status.
