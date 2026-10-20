# SECOND SOURCE

A static site for artwork, sound, and audiovisual studies. It runs directly on
GitHub Pages and needs no build step or production dependencies.

## Local development

From the repository root:

```sh
python3 -m http.server 8000
```

Open the local server in your browser. The homepage is DRIP;
`experiment.html` is INTERFERENCE, a generative wave field;
`experiments.html` collects both. The experiments index and INTERFERENCE page
are unlisted workshop drafts: no site navigation links to them, and both request
that search engines do not index them. Open their filenames directly to work on
them locally.
`gallery.html` is the image archive. `src001.html` remains a work-in-progress
release page and is not linked from the public navigation.

`preview.html` embeds the homepage artwork, font, styles and scripts for file
viewers that cannot load relative assets. Play streams the existing public track
from GitHub. Rebuild it after homepage changes with `python3 scripts/build_preview.py`.

## Listening and viewing

Both studies load silently. Select **Enter with sound** to play the bundled
Sage Counsel track on DRIP or the original Tone Field loop on INTERFERENCE.
Audio is analyzed in the browser; low-frequency energy gently influences the
artwork. Volume is applied through a gain node
when Web Audio is available, including on iOS. The sound button pauses and
resumes playback. No audio context or audio download starts before that button
is selected. Playback does not start automatically when following a page link.

**Motion off** shows the static artwork and stops the rendering loop. Motion
starts enabled on each DRIP visit, including with reduced-motion preferences.
Other study pages follow reduced-motion preferences. A visitor can explicitly enable animation or turn it off
for the current visit. Volume is remembered; the motion toggle is not. Rendering
also pauses while the artwork is offscreen or the tab is
hidden. If WebGL is unavailable, the original artwork remains available.

**Fullscreen** enters browser fullscreen where supported and falls back to a
fullscreen view within the page otherwise. Viewing and sound controls stay
available; use Exit fullscreen or Escape to return. **Info** opens notes about
the study and sound. Information and artwork viewers support keyboard focus
and restore it when closed.

`experience.js` and `experience.css` provide the shared controls. The DRIP
renderer retains its reflective artwork and pointer effects.
DRIP uses damped ripple crests and troughs for clicks or taps.
Dragging adds no repeated drops or fine ripple bands; it creates a
broader, stronger whirl that follows stirring around the initial touch and
coasts after release. Up to eight click impacts can overlap independently.
The motion settles using elapsed time,
and ripples pause with the motion toggle. Space or Enter on the focused artwork
also creates a ripple. Pinch gestures zoom instead of creating a second impact.
The original compact play/pause, mute and volume player sits beneath DRIP;
sound still starts only when Play is selected.
DRIP's INFO panel also contains SRC_GLITCH, an opt-in modifier with folded
refraction, occasional small horizontal tears and light channel separation
that preserves the artwork's blue palette.
It starts off on each visit, responds to drag and optional audio, and pauses
with the motion toggle. Turning it off eases back to the original artwork.
INTERFERENCE uses a separate procedural shader with draggable sources, pulse
interaction, arrow-key controls, and reset. It uses no photographic texture.
`site.js` handles internal-link fades, browser Back navigation, and artwork
viewer focus. Reduced-motion preferences disable the page and gallery fades.

## Validation

The browser suite needs Python Playwright and Chromium (already installed in
the prepared cloud environment). With the local server running:

```sh
python3 tests/browser_smoke.py
```

Use `SITE_BASE_URL` for a different server URL and `CHROMIUM_PATH` for a
different Chromium executable. On a Mac, install the optional test tools into
a virtual environment with `python -m pip install playwright`, then run
`python -m playwright install chromium` and set `CHROMIUM_PATH` to that browser's
executable. These tools are not needed to run or publish the site.

The checks cover opt-in audio, actual audio analysis and shader response,
volume and pause, pointer interaction, motion preferences and rendering pauses,
native and fallback fullscreen, keyboard dialogs, all seven gallery images,
navigation and Back, mobile layouts, and audio/storage/WebGL failure paths.

The image conversion tool is `scripts/optimize_images.py`. Use `--dry-run` to
preview changes before converting any additional PNG or JPEG artwork.

## Local studio revision

The experiments index presents two distinct pieces: DRIP with its artwork and
Sage Counsel, and INTERFERENCE with monochrome wave contours and an original
synthesized tone loop. The field preview animates only on hover or keyboard
focus, stays silent, and pauses offscreen. Reduced motion uses the vector
fallback. The homepage artwork has no visible title or instruction overlay.

The new vector fallback and 32-second stereo tone loop are generated locally
with `scripts/generate_field_assets.py`. Regeneration requires FFmpeg; viewing
the site needs no additional dependencies. That script replaces only those two
generated assets. The current draft is local work and has not been pushed or
deployed.
