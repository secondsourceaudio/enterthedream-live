/* Shared controls for the SECOND SOURCE audiovisual studies. */
(() => {
    "use strict";

    const space = document.querySelector("[data-experience]");
    if (!space) return;

    const audio = space.querySelector('audio');
    const trackTitle = audio?.dataset.trackTitle || "Sage Counsel";
    const soundButton = space.querySelector("[data-sound]");
    const compactSound = soundButton?.hasAttribute("data-compact-sound");
    const muteButton = space.querySelector("[data-mute]");
    const volumeInput = space.querySelector("[data-volume]");
    const volumeOutput = space.querySelector("[data-volume-output]");
    const seekInput = space.querySelector("[data-seek]");
    const currentTimeOutput = space.querySelector("[data-current-time]");
    const durationOutput = space.querySelector("[data-duration]");
    const motionButton = space.querySelector("[data-motion-toggle]");
    const glitchButton = space.querySelector("[data-glitch-toggle]");
    const fullscreenButton = space.querySelector("[data-fullscreen]");
    const infoButton = space.querySelector("[data-info]");
    const dialog = space.querySelector("dialog");
    const visualizerDock = space.querySelector('[data-visualizer-dock]');
    const status = space.querySelector("[data-status]");
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const modeButtons = [...space.querySelectorAll('[data-visual-mode]')];
    const modePanels = [...space.querySelectorAll('[data-visual-panel]')];
    const unavailableModes = new Set();
    let visualMode = modeButtons.length ? 'whirl' : null;
    const rendererMode = mode => mode === 'visualizer' ? 'fluid' : mode;
    const rendererKey = mode => modeButtons.length ? rendererMode(mode) : 'default';
    const isVisualActive = mode => !modeButtons.length || rendererMode(mode) === rendererMode(visualMode);

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
    let motionRequested = motionDefaultOn || !reducedMotion.matches;
    let motionEnabled = motionRequested;
    let glitchEnabled = false;
    let context = null;
    let analyser = null;
    let gain = null;
    let frequencies = null;
    let waveform = null;
    const quietSignal = {active: false, bass: 0, mid: 0, treble: 0, beat: 0, level: 0};
    let signal = quietSignal;
    let analysisTime = -1;
    let bassAverage = 0;
    let previousBass = 0;
    let lastBeat = -1;
    let loading = false;
    let hasStarted = false;
    let immersive = false;
    let controlsTimer = 0;
    let previousFocus = null;
    let rejectPlayback = null;
    const inertElements = new Map();

    function applyVolume() {
        if (!audio) return;
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
            candidateAnalyser.fftSize = 2048;
            candidateAnalyser.smoothingTimeConstant = 0.45;
            const candidateGain = candidate.createGain();
            source = candidate.createMediaElementSource(audio);
            source.connect(candidateAnalyser);
            candidateAnalyser.connect(candidateGain);
            candidateGain.connect(candidate.destination);
            context = candidate;
            analyser = candidateAnalyser;
            gain = candidateGain;
            frequencies = new Uint8Array(analyser.frequencyBinCount);
            waveform = new Float32Array(analyser.fftSize);
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
        if (!audio) return;
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

    function sampleAudio() {
        if (!audio || !analyser || audio.paused || audio.muted || volume === 0 || context.state !== 'running') {
            signal = quietSignal;
            analysisTime = -1;
            bassAverage = previousBass = 0;
            lastBeat = -1;
            return signal;
        }
        const now = context.currentTime;
        if (now === analysisTime) return signal;
        const dt = analysisTime < 0 ? 1 / 60 : Math.min(.1, now - analysisTime);
        analysisTime = now;
        analyser.getByteFrequencyData(frequencies);
        analyser.getFloatTimeDomainData(waveform);
        const binWidth = context.sampleRate / analyser.fftSize;
        const band = (low, high) => {
            const first = Math.max(1, Math.ceil(low / binWidth));
            const last = Math.min(frequencies.length - 1, Math.floor(high / binWidth));
            let power = 0;
            for (let i = first; i <= last; i++) power += Math.pow(frequencies[i] / 255, 2);
            return Math.min(1, Math.sqrt(power / Math.max(1, last - first + 1)) * volume / .35);
        };
        const smooth = (value, previous, release) => previous + (value - previous) * (1 - Math.exp(-dt / (value > previous ? .025 : release)));
        const rawBass = band(35, 220);
        bassAverage += (rawBass - bassAverage) * (1 - Math.exp(-dt / 1.2));
        const onset = Math.max(0, rawBass - bassAverage * 1.08 - .015);
        const hit = onset > .025 && rawBass - previousBass > .012 && now - lastBeat > .18;
        if (hit) lastBeat = now;
        previousBass = rawBass;
        let power = 0;
        for (const value of waveform) power += value * value;
        signal = {
            active: true,
            bass: smooth(rawBass, signal.bass, .22),
            mid: smooth(band(220, 2500), signal.mid, .3),
            treble: smooth(band(2500, 10000), signal.treble, .18),
            beat: hit ? Math.min(1, .25 + onset * 6) : signal.beat * Math.exp(-dt / .18),
            level: smooth(Math.min(1, Math.sqrt(power / waveform.length) * 3 * volume / .35), signal.level, .25)
        };
        return signal;
    }
    if (muteButton) muteButton.addEventListener("click", () => {
        audio.muted = !audio.muted;
        updateSound();
        status.textContent = audio.muted ? "Sound muted." : "Sound unmuted.";
    });

    soundButton?.addEventListener("click", async () => {
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
    audio?.addEventListener("play", updateSound);
    audio?.addEventListener("pause", updateSound);
    window.addEventListener('pagehide', () => audio?.pause());
    audio?.addEventListener("error", () => {
        if (rejectPlayback) rejectPlayback(new Error("Sound could not load"));
        audio.pause();
        status.textContent = "Sound could not load. Select the sound button to try again.";
    }, true);
    volumeInput?.addEventListener("input", () => {
        volume = Number(volumeInput.value);
        applyVolume();
        updateSound();
        savePreference("second-source-volume", String(volume));
    });

    function formatTime(seconds) {
        const whole = Math.floor(Number.isFinite(seconds) ? Math.max(0, seconds) : 0);
        return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, "0")}`;
    }

    function updateTimeline() {
        if (!seekInput) return;
        const duration = audio.duration;
        const ready = Number.isFinite(duration) && duration > 0 && !audio.error;
        const current = ready ? Math.min(duration, Math.max(0, audio.currentTime)) : 0;
        seekInput.disabled = !ready;
        seekInput.max = ready ? duration : 1;
        seekInput.value = current;
        seekInput.style.setProperty("--progress", `${ready ? current / duration * 100 : 0}%`);
        seekInput.setAttribute("aria-valuetext", ready
            ? `${formatTime(current)} of ${formatTime(duration)}` : "Playback not started");
        currentTimeOutput.textContent = formatTime(current);
        durationOutput.textContent = ready ? formatTime(duration) : "--:--";
    }

    if (seekInput) {
        // Metadata loads only after Play; seeking never starts or resumes sound.
        for (const event of ["loadedmetadata", "durationchange", "timeupdate", "seeking", "seeked", "emptied", "error"]) {
            audio.addEventListener(event, updateTimeline);
        }
        seekInput.addEventListener("input", () => {
            if (seekInput.disabled || !Number.isFinite(audio.duration)) return;
            audio.currentTime = Math.min(audio.duration, Math.max(0, Number(seekInput.value)));
            updateTimeline();
        });
        updateTimeline();
    }

    function updateMotion() {
        const unavailable = unavailableModes.has(rendererKey(visualMode));
        motionEnabled = motionRequested && !unavailable;
        motionButton.disabled = unavailable;
        if (glitchButton) glitchButton.disabled = unavailable;
        document.documentElement.dataset.motion = motionEnabled ? "on" : "off";
        motionButton.textContent = motionEnabled ? "MOTION ON" : "MOTION OFF";
        motionButton.setAttribute("aria-pressed", String(motionEnabled));
        motionButton.setAttribute("aria-label", motionEnabled ? "Motion on: use static artwork" : "Motion off: animate artwork");
        window.dispatchEvent(new Event("experience:motionchange"));
    }
    motionButton.addEventListener("click", () => {
        motionRequested = !motionRequested;
        updateMotion();
        status.textContent = motionEnabled ? "Artwork motion enabled." : "Static artwork selected.";
    });
    reducedMotion.addEventListener("change", () => {
        if (motionDefaultOn) return;
        motionRequested = !reducedMotion.matches;
        updateMotion();
    });

    function selectVisualMode(mode, announce = true) {
        if (!modeButtons.some(button => button.dataset.visualMode === mode)) return;
        visualMode = mode;
        space.dataset.activeVisual = mode;
        for (const button of modeButtons) button.setAttribute('aria-pressed', String(button.dataset.visualMode === mode));
        for (const panel of modePanels) panel.hidden = panel.dataset.visualPanel !== rendererMode(mode);
        for (const control of space.querySelectorAll('[data-mode-controls]')) {
            control.hidden = control.dataset.modeControls !== rendererMode(mode);
        }
        updateMotion();
        updateVisualizer();
        window.dispatchEvent(new Event('experience:visualchange'));
        window.dispatchEvent(new Event('resize'));
        if (announce) status.textContent = mode === 'visualizer'
            ? 'Visualizer selected. Automatic flow is on; play the track for music response.'
            : `${mode === 'fluid' ? 'Fluid' : 'Whirl'} selected.`;
    }
    for (const button of modeButtons) button.addEventListener('click', () => {
        if (button.dataset.visualMode !== visualMode) selectVisualMode(button.dataset.visualMode);
    });

    if (glitchButton) glitchButton.addEventListener("click", () => {
        glitchEnabled = !glitchEnabled;
        glitchButton.textContent = glitchEnabled ? "SRC_GLITCH / ON" : "SRC_GLITCH / OFF";
        glitchButton.setAttribute("aria-pressed", String(glitchEnabled));
        glitchButton.setAttribute("aria-label", `SRC_GLITCH: ${glitchEnabled ? "on" : "off"}`);
        status.textContent = glitchEnabled ? "SRC_GLITCH enabled." : "SRC_GLITCH disabled.";
    });

    function revealVisualizerControls() {
        window.clearTimeout(controlsTimer);
        space.classList.remove('visualizer-idle');
        if (!space.classList.contains('is-visualizer') || !visualizerDock) return;
        controlsTimer = window.setTimeout(() => {
            const focused = visualizerDock.contains(document.activeElement) && document.activeElement.matches(':focus-visible');
            if (dialog.open || visualizerDock.matches(':hover') || focused) {
                revealVisualizerControls();
                return;
            }
            space.classList.add('visualizer-idle');
        }, 3200);
    }
    function fitVisualizer() {
        if (!immersive || visualMode !== 'visualizer' || !visualizerDock) return;
        const style = getComputedStyle(space);
        const reserved = visualizerDock.getBoundingClientRect().height +
            parseFloat(style.paddingTop) + parseFloat(style.paddingBottom) + parseFloat(style.rowGap);
        space.style.setProperty('--visualizer-space', `${Math.ceil(reserved)}px`);
    }
    window.addEventListener('resize', fitVisualizer);
    if (visualizerDock) new ResizeObserver(fitVisualizer).observe(visualizerDock);
    function updateVisualizer() {
        space.classList.toggle('is-visualizer', immersive && visualMode === 'visualizer');
        fitVisualizer();
        revealVisualizerControls();
    }
    for (const event of ['pointermove', 'pointerdown', 'keydown']) {
        space.addEventListener(event, revealVisualizerControls);
    }
    document.addEventListener('visibilitychange', revealVisualizerControls);

    function setImmersive(enabled) {
        if (enabled === immersive) return;
        immersive = enabled;
        space.classList.toggle("is-immersive", enabled);
        document.body.classList.toggle("listening-mode", enabled);
        fullscreenButton.textContent = enabled ? "EXIT FULLSCREEN" : "FULLSCREEN";
        fullscreenButton.setAttribute("aria-pressed", String(enabled));
        const modeLabel = audio ? "listening" : "viewing";
        fullscreenButton.setAttribute("aria-label", `${enabled ? "Exit" : "Enter"} fullscreen ${modeLabel} mode`);
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
        updateVisualizer();
        window.dispatchEvent(new Event('experience:immersivechange'));
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
        get visualMode() { return visualMode; },
        get visualizerEnabled() { return visualMode === 'visualizer' && motionEnabled; },
        get soundPlaying() { return !!audio && !audio.paused; },
        isVisualActive,
        useStaticArtwork(mode = visualMode) {
            unavailableModes.add(rendererKey(mode));
            updateMotion();
        },
        sampleAudio,
        sampleBass() { return sampleAudio().bass; },
        createRenderLoop(draw, element) {
            let frame = 0;
            let visible = true;
            let previous = null;
            let elapsed = 0;
            const allowed = () => motionEnabled && visible && !document.hidden &&
                (!element.dataset.visualPanel || isVisualActive(element.dataset.visualPanel));
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
            window.addEventListener("experience:visualchange", reconcile);
            window.addEventListener("pagehide", () => {
                cancelAnimationFrame(frame);
                frame = 0;
            });
            window.addEventListener("pageshow", reconcile);
            reconcile();
        }
    };

    applyVolume();
    updateSound();
    updateMotion();
    if (modeButtons.length) selectVisualMode(visualMode, false);
})();
