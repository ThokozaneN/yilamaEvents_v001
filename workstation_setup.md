# Workstation Setup: Yilama Events

This guide helps you set up your local environment in VS Code to run and test the Yilama Events platform.

## 1. VS Code Extensions
Install the following for the best experience:
- **Live Server**: To serve the `index.html` file with hot-reloading.
- **ESLint & Prettier**: For code formatting and quality.
- **Tailwind CSS IntelliSense**: For autocompleting style classes.

## 2. Running the Application
Since this project uses ES Modules directly in the browser via `importmap`:

1. Open the project folder in VS Code.
2. Click **"Go Live"** in the bottom right corner (from the Live Server extension).
3. The app will open at `http://127.0.0.1:5500/index.html`.

## 3. Local Testing
- **Responsive Design**: Open Chrome DevTools (`F12`), click the "Toggle Device Toolbar" icon, and select "iPhone 14" or "Pixel 7" to test the mobile-first UI.
- **Theme Testing**: Go to **Settings** in the app to switch between Light, Dark, and Matte Black modes.
- **Camera Scanning**: If testing on a laptop, ensure you grant browser permissions for the camera when clicking "Start Gate Camera" in the Scanner view.

## 4. Troubleshooting
- If scripts fail to load, ensure you have an active internet connection as dependencies are fetched via `esm.sh`.
- If icons don't appear, check that the SVG paths haven't been corrupted during copy-pasting.
