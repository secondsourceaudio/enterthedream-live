/* Shared controls for the SECOND SOURCE audiovisual studies. */
(() => {
    "use strict";

    const space = document.querySelector("[data-experience]");
    if (!space) return;

    const audio = space.querySelector("audio");
    const trackTitle = audio.dataset.trackTitle || "Sage Counsel";
    const soundButton = space.querySelector("[data-sound]");
    const compactSound = soundButton.hasAttribute("data-compact-sound");
    const muteButton = space.querySelector("[data-mute]");
    const volumeInput = space.querySelector("[data-volume]");
    const volumeOutput = space.querySelector("[data-volume-output]");
    const motionButton = space.querySelector("[data-motion-toggle]");
    const glitchButton = space.querySelector("[data-glitch-toggle]");
    const fullscreenButton = space.querySelector("[data-fullscreen]");
    const infoButton = space.querySelector("[data-info]");
    const dialog = space.querySelector("dialog");
    const status = space.querySelector("[data-status]");
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

    const readPreference = (key) => {
        try { return localStorage.getItem(key); } catch { return null; }
    };
    const savePreference = (key, value) => {
        try { localStorage.setItem(key, value); } catch { /* Storage is optional. */ }
    };

    const savedVolume = readPreference("second-source-volume");
    let volume = savedVolume === null ? 0.35 : Number(savedVolume);
    if (!Number.isFinite(volume) || volume < 0 || volume > 1) volume = 0.35;
    const motionDefaultOn = space.hasAttribute("data-motion-default-on");
    let motionEnabled = motionDefaultOn || !reducedMotion.matches;
    let glitchEnabled = false;
    let context = null;
    let analyser = null;
    let gain = null;
    let frequencies = null;
    let loading = false;
    let hasStarted = false;
    let immersive = false;
    let previousFocus = null;
    let rejectPlayback = null;
    const inertElements = new Map();

    function applyVolume() {
        if (gain) {
            gain.gain.setTargetAtTime(volume, context.currentTime, 0.02);
        } else {
            audio.volume = volume;
        }
        volumeInput.value = volume;
        volumeInput.setAttribute("aria-valuetext", `${Math.round(volume * 100)} percent`);
        volumeOutput.textContent = `${Math.round(volume * 100)}%`;
    }

    function connectAudio() {
        if (context) return;
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        if (!AudioContext) return;
        const candidate = new AudioContext();
        let source = null;
        try {
            const candidateAnalyser = candidate.createAnalyser();
            candidateAnalyser.fftSize = 512;
            candidateAnalyser.smoothingTimeConstant = 0.8;
            const candidateGain = candidate.createGain();
            source = candidate.createMediaElementSource(audio);
            source.connect(candidateAnalyser);
            candidateAnalyser.connect(candidateGain);
            candidateGain.connect(candidate.destination);
            context = candidate;
            analyser = candidateAnalyser;
            gain = candidateGain;
            frequencies = new Uint8Array(analyser.frequencyBinCount);
            // A gain node also supplies working volume controls on iOS.
            audio.volume = 1;
            gain.gain.value = volume;
        } catch {
            // Keep an already attached media source audible if analysis fails.
            if (source) {
                source.disconnect();
                source.connect(candidate.destination);
                context = candidate;
            } else {
                candidate.close().catch(() => {});
            }
        }
    }

    function updateSound() {
        const playing = !audio.paused;
        const silent = audio.muted || volume === 0;
        soundButton.setAttribute("aria-pressed", String(playing));
        if (compactSound) {
            const label = loading ? "Loading sound" : `${playing ? "Pause" : "Play"} ${trackTitle}`;
            soundButton.setAttribute("aria-label", label);
            soundButton.title = label;
            soundButton.querySelector("[data-play-symbol]").textContent = loading ? "…" : playing ? "Ⅱ" : "▶\uFE0E";
        } else {
            soundButton.setAttribute("aria-label", loading ? "Loading sound" : playing ? "Sound on: pause sound" : hasStarted ? "Sound off: resume sound" : "Enter with sound");
            soundButton.textContent = loading ? "LOADING SOUND" : playing ? "SOUND ON" : hasStarted ? "SOUND OFF" : "ENTER WITH SOUND";
        }
        soundButton.disabled = loading;
        space.classList.toggle("sound-is-on", playing && !silent);
        if (muteButton) {
            muteButton.setAttribute("aria-pressed", String(audio.muted));
            muteButton.setAttribute("aria-label", audio.muted ? "Unmute" : "Mute");
            muteButton.title = audio.muted ? "Unmute" : "Mute";
            muteButton.querySelector("[data-mute-symbol]").textContent = silent ? "×" : "◖))";
        }
    }
    if (muteButton) muteButton.addEventListener("click", () => {
        audio.muted = !audio.muted;
        updateSound();
        status.textContent = audio.muted ? "Sound muted." : "Sound unmuted.";
    });

    soundButton.addEventListener("click", async () => {
        if (loading) return;
        if (!audio.paused) {
            audio.pause();
            status.textContent = "Sound paused.";
            return;
        }
        loading = true;
        updateSound();
        status.textContent = `Loading ${trackTitle}…`;
        let timeout;
        const failed = new Promise((_, reject) => {
            rejectPlayback = reject;
            timeout = window.setTimeout(() => reject(new Error("Sound loading timed out")), 15000);
        });
        try {
            connectAudio();
            if (audio.error || audio.networkState === audio.NETWORK_NO_SOURCE) audio.load();
            // Call play inside the gesture, before awaiting anything (Safari).
            const playback = audio.play();
            await Promise.race([
                Promise.all([playback, context ? context.resume() : Promise.resolve()]),
                failed
            ]);
            hasStarted = true;
            status.textContent = `Playing ${trackTitle}. Use the sound button to pause.`;
        } catch {
            audio.pause();
            status.textContent = "Sound could not start. Select the sound button to try again.";
        } finally {
            window.clearTimeout(timeout);
            rejectPlayback = null;
            loading = false;
            updateSound();
        }
    });
    audio.addEventListener("play", updateSound);
    audio.addEventListener("pause", updateSound);
    audio.addEventListener("error", () => {
        if (rejectPlayback) rejectPlayback(new Error("Sound could not load"));
        audio.pause();
        status.textContent = "Sound could not load. Select the sound button to try again.";
    }, true);
    volumeInput.addEventListener("input", () => {
        volume = Number(volumeInput.value);
        applyVolume();
        updateSound();
        savePreference("second-source-volume", String(volume));
    });

    function updateMotion() {
        document.documentElement.dataset.motion = motionEnabled ? "on" : "off";
        motionButton.textContent = motionEnabled ? "MOTION ON" : "MOTION OFF";
        motionButton.setAttribute("aria-pressed", String(motionEnabled));
        motionButton.setAttribute("aria-label", motionEnabled ? "Motion on: use static artwork" : "Motion off: animate artwork");
        window.dispatchEvent(new Event("experience:motionchange"));
    }
    motionButton.addEventListener("click", () => {
        motionEnabled = !motionEnabled;
        updateMotion();
        status.textContent = motionEnabled ? "Artwork motion enabled." : "Static artwork selected.";
    });
    reducedMotion.addEventListener("change", () => {
        if (motionDefaultOn) return;
        motionEnabled = !reducedMotion.matches;
        updateMotion();
    });

    if (glitchButton) glitchButton.addEventListener("click", () => {
        glitchEnabled = !glitchEnabled;
        glitchButton.textContent = glitchEnabled ? "SRC_GLITCH / ON" : "SRC_GLITCH / OFF";
        glitchButton.setAttribute("aria-pressed", String(glitchEnabled));
        glitchButton.setAttribute("aria-label", `SRC_GLITCH: ${glitchEnabled ? "on" : "off"}`);
        status.textContent = glitchEnabled ? "SRC_GLITCH enabled." : "SRC_GLITCH disabled.";
    });

    function setImmersive(enabled) {
        immersive = enabled;
        space.classList.toggle("is-immersive", enabled);
        document.body.classList.toggle("listening-mode", enabled);
        fullscreenButton.textContent = enabled ? "EXIT FULLSCREEN" : "FULLSCREEN";
        fullscreenButton.setAttribute("aria-pressed", String(enabled));
        fullscreenButton.setAttribute("aria-label", enabled ? "Exit fullscreen listening mode" : "Enter fullscreen listening mode");
        if (enabled) {
            for (const element of document.body.children) {
                if (element.contains(space) || element.tagName === "SCRIPT") continue;
                inertElements.set(element, element.inert);
                element.inert = true;
            }
            fullscreenButton.focus({ preventScroll: true });
        } else {
            for (const [element, wasInert] of inertElements) element.inert = wasInert;
            inertElements.clear();
            if (previousFocus && previousFocus.isConnected) previousFocus.focus({ preventScroll: true });
        }
        window.dispatchEvent(new Event("resize"));
    }
    async function exitImmersive() {
        if (document.fullscreenElement === space) {
            try { await document.exitFullscreen(); } catch { setImmersive(false); }
        } else {
            setImmersive(false);
        }
    }
    fullscreenButton.addEventListener("click", async () => {
        if (immersive) { await exitImmersive(); return; }
        previousFocus = document.activeElement;
        if (space.requestFullscreen) {
            try {
                await space.requestFullscreen();
                return;
            } catch { /* Embedded browsers can use the in-page mode. */ }
        }
        setImmersive(true);
    });
    document.addEventListener("fullscreenchange", () => {
        const enabled = document.fullscreenElement === space;
        if (enabled !== immersive) setImmersive(enabled);
    });

    infoButton.addEventListener("click", () => dialog.showModal());
    dialog.querySelector("[data-close-info]").addEventListener("click", () => dialog.close());
    dialog.addEventListener("click", (event) => {
        if (event.target !== dialog) return;
        const bounds = dialog.getBoundingClientRect();
        if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) dialog.close();
    });
    document.addEventListener("keydown", (event) => {
        if (dialog.open || !immersive) return;
        if (event.key === "Escape") { event.preventDefault(); exitImmersive(); }
        // Contain keyboard focus in the in-page fullscreen fallback.
        if (event.key === "Tab") {
            const controls = [...space.querySelectorAll("button:not([disabled]), input, a[href], [tabindex='0']")]
                .filter(element => element.getClientRects().length && !element.closest("dialog"));
            const first = controls[0];
            const last = controls[controls.length - 1];
            if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
            else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
        }
    });

    space.querySelector(".visual-container").addEventListener("pointerdown", () => {
        space.classList.add("has-interacted");
    }, { once: true });

    window.SecondSourceExperience = {
        get motionEnabled() { return motionEnabled; },
        get glitchEnabled() { return glitchEnabled; },
        useStaticArtwork() {
            motionEnabled = false;
            motionButton.disabled = true;
            if (glitchButton) glitchButton.disabled = true;
            updateMotion();
        },
        sampleBass() {
            if (!analyser || audio.paused || audio.muted || volume === 0) return 0;
            analyser.getByteFrequencyData(frequencies);
            const lastBassBin = Math.max(2, Math.floor(250 / (context.sampleRate / analyser.fftSize)));
            let total = 0;
            for (let index = 1; index <= lastBassBin; index++) total += frequencies[index];
            return Math.min(1, total / (lastBassBin * 255) * (volume / 0.35));
        },
        createRenderLoop(draw, element) {
            let frame = 0;
            let visible = true;
            let previous = null;
            let elapsed = 0;
            const allowed = () => motionEnabled && visible && !document.hidden;
            function tick(now) {
                frame = 0;
                if (!allowed()) return;
                if (previous !== null) elapsed += Math.min(now - previous, 64);
                previous = now;
                draw(elapsed);
                frame = requestAnimationFrame(tick);
            }
            function reconcile() {
                if (!allowed()) {
                    cancelAnimationFrame(frame);
                    frame = 0;
                    previous = null;
                } else if (!frame) {
                    previous = null;
                    frame = requestAnimationFrame(tick);
                }
            }
            const observer = new IntersectionObserver(entries => {
                visible = entries[0].isIntersecting;
                reconcile();
            });
            observer.observe(element);
            document.addEventListener("visibilitychange", reconcile);
            window.addEventListener("experience:motionchange", reconcile);
            window.addEventListener("pagehide", () => {
                cancelAnimationFrame(frame);
                frame = 0;
                audio.pause();
            });
            window.addEventListener("pageshow", reconcile);
            reconcile();
        }
    };

    applyVolume();
    updateSound();
    updateMotion();
})();
