/* =========================================
   SECOND SOURCE — EXPERIMENT
========================================= */


/* =========================================
   AUDIO
========================================= */

const audio = document.getElementById("experiment-audio");

const playButton = document.getElementById("play-button");
const playSymbol = document.getElementById("play-symbol");

const soundButton = document.getElementById("sound-button");
const speakerSymbol = document.getElementById("speaker-symbol");

const volumeSlider = document.getElementById("volume-slider");
const volumePercent = document.getElementById("volume-percent");

const progressTrack = document.getElementById("progress-track");
const progressFill = document.getElementById("progress-fill");
const playerTime = document.getElementById("player-time");


let selectedVolume = 0.35;
let muted = false;
let wantsPlayback = true;


/* =========================================
   IPHONE VOLUME SUPPORT (Web Audio)

   iOS ignores audio.volume (it is read-only
   there). On those devices we send the audio
   through a gain node and control volume with
   that instead. Everywhere else the normal
   audio.volume is used, exactly as before.
========================================= */

const volumeIsReadOnly = (function () {

    const test = new Audio();

    test.volume = 0.5;

    return test.volume === 1;
})();


let audioContext = null;
let gainNode = null;


function setupWebAudio() {

    const AudioContextClass =
        window.AudioContext || window.webkitAudioContext;

    if (!AudioContextClass) {
        return;
    }

    try {

        audioContext = new AudioContextClass();

        const source = audioContext.createMediaElementSource(audio);

        gainNode = audioContext.createGain();

        source.connect(gainNode);
        gainNode.connect(audioContext.destination);

    } catch (error) {

        audioContext = null;
        gainNode = null;
    }
}


if (volumeIsReadOnly) {
    setupWebAudio();
}


/* Browsers keep the audio context "suspended"
   until a tap. This wakes it up. */

function resumeAudio() {

    if (audioContext && audioContext.state === "suspended") {
        audioContext.resume().catch(function () {});
    }
}


/* Single place that applies volume + mute. */

function applyOutput() {

    if (gainNode) {

        audio.muted = false;
        audio.volume = 1;

        gainNode.gain.setTargetAtTime(
            muted ? 0 : selectedVolume,
            audioContext.currentTime,
            0.015
        );

    } else {

        audio.muted = muted;
        audio.volume = selectedVolume;
    }
}


applyOutput();


/* =========================================
   HELPERS
========================================= */

function clamp(value, minimum, maximum) {
    return Math.max(minimum, Math.min(maximum, value));
}


function formatTime(seconds) {

    if (!Number.isFinite(seconds)) {
        return "0:00";
    }

    const minutes = Math.floor(seconds / 60);
    const secondsLeft = Math.floor(seconds % 60);

    return minutes + ":" + String(secondsLeft).padStart(2, "0");
}


/* =========================================
   PLAYER DISPLAY
========================================= */

function updatePlayer() {

    playSymbol.textContent = audio.paused ? "▶" : "Ⅱ";

    speakerSymbol.textContent =
        (muted || selectedVolume <= 0) ? "×" : "◖))";

    volumePercent.textContent = Math.round(selectedVolume * 100) + "%";

    volumeSlider.value = selectedVolume * 100;

    if (Number.isFinite(audio.duration) && audio.duration > 0) {
        progressFill.style.width =
            (audio.currentTime / audio.duration * 100) + "%";
    }

    playerTime.textContent =
        formatTime(audio.currentTime) + " / " + formatTime(audio.duration);
}


/* =========================================
   PLAYBACK
========================================= */

function attemptPlayback() {

    if (!wantsPlayback || muted) {
        return;
    }

    applyOutput();
    resumeAudio();

    audio
        .play()
        .then(updatePlayer)
        .catch(updatePlayer);
}


attemptPlayback();


/* First tap anywhere (except the player controls)
   starts the audio if the browser blocked autoplay.

   iPhones only accept audio starts on touchend /
   click, so we listen for all three. The handler is
   cheap and only acts when audio is still paused. */

function firstGesture(event) {

    if (event.target.closest(".compact-player")) {
        return;
    }

    resumeAudio();

    if (wantsPlayback && !muted && audio.paused) {
        attemptPlayback();
    }
}

["pointerdown", "touchend", "click"].forEach(function (name) {
    document.addEventListener(name, firstGesture, true);
});


/* =========================================
   PLAY / PAUSE
========================================= */

playButton.addEventListener("click", function () {

    resumeAudio();

    if (audio.paused) {

        wantsPlayback = true;
        muted = false;

        attemptPlayback();

    } else {

        wantsPlayback = false;

        audio.pause();
    }

    updatePlayer();
});


/* =========================================
   MUTE
========================================= */

soundButton.addEventListener("click", function () {

    resumeAudio();

    muted = !muted;

    applyOutput();

    if (!muted && wantsPlayback && audio.paused) {
        attemptPlayback();
    }

    updatePlayer();
});


/* =========================================
   VOLUME
========================================= */

function setVolume(value) {

    selectedVolume = clamp(value, 0, 1);

    if (selectedVolume > 0) {
        muted = false;
    }

    applyOutput();

    updatePlayer();
}


volumeSlider.addEventListener("input", function () {

    resumeAudio();

    setVolume(Number(volumeSlider.value) / 100);

    if (wantsPlayback && audio.paused) {
        attemptPlayback();
    }
});


/* =========================================
   VERTICAL VOLUME DRAG
========================================= */

let volumeDragging = false;

let volumeStartY = 0;
let volumeStartValue = selectedVolume;


volumePercent.addEventListener("pointerdown", function (event) {

    volumeDragging = true;

    volumeStartY = event.clientY;
    volumeStartValue = selectedVolume;

    try {
        volumePercent.setPointerCapture(event.pointerId);
    } catch (error) {
    }
});


volumePercent.addEventListener("pointermove", function (event) {

    if (!volumeDragging) {
        return;
    }

    const movement = volumeStartY - event.clientY;

    setVolume(volumeStartValue + movement / 220);

    if (wantsPlayback && audio.paused) {
        attemptPlayback();
    }
});


function stopVolumeDrag() {
    volumeDragging = false;
}

volumePercent.addEventListener("pointerup", stopVolumeDrag);
volumePercent.addEventListener("pointercancel", stopVolumeDrag);


/* =========================================
   SEEK
========================================= */

progressTrack.addEventListener("click", function (event) {

    if (!Number.isFinite(audio.duration)) {
        return;
    }

    const rect = progressTrack.getBoundingClientRect();

    const position = clamp(
        (event.clientX - rect.left) / rect.width,
        0,
        1
    );

    audio.currentTime = position * audio.duration;

    updatePlayer();
});


/* =========================================
   AUDIO EVENTS
========================================= */

audio.addEventListener("timeupdate", updatePlayer);
audio.addEventListener("loadedmetadata", updatePlayer);
audio.addEventListener("play", updatePlayer);
audio.addEventListener("pause", updatePlayer);


updatePlayer();


/* =========================================
   EXPERIMENT
========================================= */

const canvas = document.getElementById("visual");
const container = document.getElementById("visual-container");
const visualMedia = document.getElementById("visual-media");
const fallbackImage = document.getElementById("fallback-image");
const interactionMessage = document.getElementById("interaction-message");


/* =========================================
   PINCH ZOOM
========================================= */

let viewScale = 1;

let viewX = 0;
let viewY = 0;


const viewPointers = new Map();


let pinchStartDistance = 0;
let pinchStartScale = 1;

let pinchStartX = 0;
let pinchStartY = 0;

let pinchStartViewX = 0;
let pinchStartViewY = 0;


let panStartX = 0;
let panStartY = 0;

let panOriginalX = 0;
let panOriginalY = 0;

let panning = false;


/* =========================================
   DRAG DETECTION

   Prevents trackpad snapping.
========================================= */

let dragPointerId = null;

let dragOriginX = 0;
let dragOriginY = 0;

let dragHasStarted = false;


/* The pointer must actually move this far
   before the whirl activates. */

const dragThreshold = 7;


/* =========================================
   LIMIT ZOOM PAN
========================================= */

function limitViewPan() {

    if (viewScale <= 1) {

        viewScale = 1;

        viewX = 0;
        viewY = 0;

        return;
    }

    const maxX = container.clientWidth * (viewScale - 1) / 2;
    const maxY = container.clientHeight * (viewScale - 1) / 2;

    viewX = clamp(viewX, -maxX, maxX);
    viewY = clamp(viewY, -maxY, maxY);
}


/* =========================================
   APPLY ZOOM
========================================= */

function updateViewTransform() {

    limitViewPan();

    visualMedia.classList.toggle("is-zooming", viewScale > 1);

    visualMedia.style.transform =
        "translate3d(" + viewX + "px, " + viewY + "px, 0) " +
        "scale(" + viewScale + ")";
}


/* =========================================
   PINCH HELPERS
========================================= */

function viewPointerDistance() {

    const points = Array.from(viewPointers.values());

    return Math.hypot(
        points[1].x - points[0].x,
        points[1].y - points[0].y
    );
}


function viewPointerMidpoint() {

    const points = Array.from(viewPointers.values());

    return {
        x: (points[0].x + points[1].x) / 2,
        y: (points[0].y + points[1].y) / 2
    };
}


/* =========================================
   STOP BROWSER DOUBLE-TAP ZOOM
========================================= */

container.addEventListener("dblclick", function (event) {
    event.preventDefault();
});


/* =========================================
   WEBGL
========================================= */

const gl = canvas.getContext("webgl", {
    antialias: false,
    alpha: true
});


if (!gl) {
    canvas.style.display = "none";
}


if (gl) {

    /* =========================================
       SHADERS
    ========================================== */

    const vertexShaderSource = `

        attribute vec2 a_position;

        varying vec2 v_uv;

        void main() {

            v_uv = a_position * 0.5 + 0.5;

            gl_Position = vec4(a_position, 0.0, 1.0);
        }

    `;


    const fragmentShaderSource = `

        #ifdef GL_FRAGMENT_PRECISION_HIGH
        precision highp float;
        #else
        precision mediump float;
        #endif

        varying vec2 v_uv;

        uniform sampler2D u_texture;

        uniform vec2 u_pointer;
        uniform vec2 u_velocity;

        /* Up to 4 overlapping drips.
           x, y = centre   z = age in seconds */
        uniform vec3 u_drips[4];

        uniform float u_time;
        uniform float u_motion;
        uniform float u_dragging;


        mat2 rotate2D(float angle) {

            float s = sin(angle);
            float c = cos(angle);

            return mat2(
                c, -s,
                s,  c
            );
        }


        void main() {

            vec2 baseUV = v_uv;

            vec2 uv = baseUV;


            /* =================================
               CONSTANT CENTER BUBBLING
            ================================= */

            vec2 center = vec2(0.5, 0.5);

            vec2 centerDelta = baseUV - center;

            float centerDistance = length(centerDelta);

            vec2 centerDirection =
                normalize(centerDelta + vec2(0.0001));


            float bubbleOne =
                sin(centerDistance * 50.0 - u_time * 3.1);

            float bubbleTwo =
                sin(centerDistance * 29.0 - u_time * 2.0);

            float bubbleThree =
                sin(centerDistance * 76.0 - u_time * 4.1);


            float centerBubble =
                bubbleOne * 0.50 +
                bubbleTwo * 0.32 +
                bubbleThree * 0.18;


            float centerInfluence =
                smoothstep(0.75, 0.03, centerDistance);


            uv +=
                centerDirection *
                centerBubble *
                centerInfluence *
                0.0045;


            /* =================================
               SUBTLE 90s WAVING
            ================================= */

            float waveX =
                sin(baseUV.y * 8.0 - u_time * 1.15) * 0.0040;

            float waveY =
                cos(baseUV.x * 6.5 - u_time * 0.9) * 0.0022;

            float fineWave =
                sin(baseUV.y * 16.0 + u_time * 1.6) * 0.0010;


            uv.x += waveX + fineWave;

            uv.y += waveY;


            /* =================================
               POINTER FIELD
            ================================= */

            vec2 pointerDelta = baseUV - u_pointer;

            float pointerDistance = length(pointerDelta);

            float pointerInfluence =
                smoothstep(0.35, 0.0, pointerDistance);

            vec2 pointerDirection =
                normalize(pointerDelta + vec2(0.0001));


            /* =================================
               SMOOTH WHIRL WHILE DRAGGING
            ================================= */

            float velocityMagnitude =
                min(length(u_velocity) * 20.0, 1.0);


            float whirlFade =
                exp(-pointerDistance * 5.2);


            /* Continuous direction (no sudden flip). */

            float whirlDirection =
                clamp(
                    (u_velocity.x - u_velocity.y) * 150.0,
                    -1.0,
                    1.0
                );


            float whirlAngle =
                whirlDirection *
                u_dragging *
                whirlFade *
                (
                    0.08 +
                    u_motion * 0.70 +
                    velocityMagnitude * 0.42
                );


            vec2 whirledDelta =
                rotate2D(whirlAngle) * pointerDelta;


            uv +=
                (whirledDelta - pointerDelta) *
                pointerInfluence *
                0.30;


            /* =================================
               POINTER WATER RIPPLE
            ================================= */

            float pointerWaveOne =
                sin(pointerDistance * 59.0 - u_time * 6.8);

            float pointerWaveTwo =
                sin(pointerDistance * 27.0 - u_time * 3.8);

            float pointerWave =
                pointerWaveOne * 0.68 +
                pointerWaveTwo * 0.32;


            uv +=
                pointerDirection *
                pointerWave *
                pointerInfluence *
                (0.0045 + u_motion * 0.017);


            /* =================================
               SOFT LIQUID DRAG
            ================================= */

            uv -=
                u_velocity *
                pointerInfluence *
                (0.08 + u_motion * 0.20);


            /* =================================
               DRIPS ON CLICK / TAP

               Loops over every active drip so
               several can ripple at once.
            ================================= */

            for (int i = 0; i < 4; i++) {

                vec3 drip = u_drips[i];

                float dripAge = drip.z;

                vec2 dripDelta = baseUV - drip.xy;

                float dripDistance = length(dripDelta);

                vec2 dripDirection =
                    normalize(dripDelta + vec2(0.0001));


                float dripRadius = dripAge * 0.33;

                float dripLife =
                    clamp(1.0 - dripAge / 2.6, 0.0, 1.0);


                /* Main expanding ring. */

                float dripRing =
                    exp(-abs(dripDistance - dripRadius) * 58.0) *
                    dripLife;


                /* Trailing ring. */

                float secondRadius =
                    max(0.0, dripRadius - 0.055);

                float secondRing =
                    exp(-abs(dripDistance - secondRadius) * 72.0) *
                    dripLife *
                    0.45;


                /* Initial indentation. */

                float impact =
                    exp(-dripDistance * 24.0) *
                    exp(-dripAge * 4.0);


                uv += dripDirection * dripRing * 0.050;

                uv += dripDirection * secondRing * 0.022;

                uv -= dripDelta * impact * 0.10;
            }


            /* =================================
               SAFE IMAGE AREA
            ================================= */

            uv = clamp(uv, vec2(0.002), vec2(0.998));


            /* =================================
               ORIGINAL IMAGE
            ================================= */

            vec4 mainSample = texture2D(u_texture, uv);


            vec4 draggedSample =
                texture2D(
                    u_texture,
                    clamp(
                        uv - u_velocity * pointerInfluence * 0.35,
                        vec2(0.002),
                        vec2(0.998)
                    )
                );


            float dragBlend =
                clamp(
                    u_motion * pointerInfluence * 0.12,
                    0.0,
                    0.12
                );


            gl_FragColor =
                mix(mainSample, draggedSample, dragBlend);
        }

    `;


    /* =========================================
       CREATE SHADER
    ========================================== */

    function createShader(type, source) {

        const shader = gl.createShader(type);

        gl.shaderSource(shader, source);
        gl.compileShader(shader);

        if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {

            console.error(gl.getShaderInfoLog(shader));

            return null;
        }

        return shader;
    }


    /* =========================================
       GL RESOURCES

       Everything the GPU owns lives here, so it can
       be rebuilt if the browser takes the WebGL
       context away (common on phones when you switch
       apps) and then gives it back.
    ========================================== */

    let glActive = false;
    let imageReady = false;

    let uniforms = {};
    let texture = null;


    function uploadArtworkTexture() {

        const maximum = Math.min(
            1800,
            gl.getParameter(gl.MAX_TEXTURE_SIZE)
        );

        const sourceWidth = fallbackImage.naturalWidth;
        const sourceHeight = fallbackImage.naturalHeight;

        /* Crop to the largest centred square so the
           texture matches the CSS object-fit: cover crop. */

        const side = Math.min(sourceWidth, sourceHeight);
        const size = Math.min(side, maximum);

        const textureCanvas = document.createElement("canvas");

        textureCanvas.width = size;
        textureCanvas.height = size;

        const context = textureCanvas.getContext("2d");

        context.drawImage(
            fallbackImage,
            (sourceWidth - side) / 2,
            (sourceHeight - side) / 2,
            side,
            side,
            0,
            0,
            size,
            size
        );


        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);

        gl.bindTexture(gl.TEXTURE_2D, texture);

        gl.texImage2D(
            gl.TEXTURE_2D,
            0,
            gl.RGBA,
            gl.RGBA,
            gl.UNSIGNED_BYTE,
            textureCanvas
        );

        imageReady = true;

        canvas.classList.add("is-ready");
    }


    function setupGL() {

        const vertexShader =
            createShader(gl.VERTEX_SHADER, vertexShaderSource);

        const fragmentShader =
            createShader(gl.FRAGMENT_SHADER, fragmentShaderSource);

        if (!vertexShader || !fragmentShader) {
            return false;
        }


        const program = gl.createProgram();

        gl.attachShader(program, vertexShader);
        gl.attachShader(program, fragmentShader);

        gl.linkProgram(program);

        if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {

            console.error(gl.getProgramInfoLog(program));

            return false;
        }

        gl.useProgram(program);


        /* PLANE */

        const buffer = gl.createBuffer();

        gl.bindBuffer(gl.ARRAY_BUFFER, buffer);

        gl.bufferData(
            gl.ARRAY_BUFFER,
            new Float32Array([
                -1, -1,
                 1, -1,
                -1,  1,

                -1,  1,
                 1, -1,
                 1,  1
            ]),
            gl.STATIC_DRAW
        );

        const position = gl.getAttribLocation(program, "a_position");

        gl.enableVertexAttribArray(position);

        gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);


        /* UNIFORMS */

        uniforms = {
            pointer:  gl.getUniformLocation(program, "u_pointer"),
            velocity: gl.getUniformLocation(program, "u_velocity"),
            drips:    gl.getUniformLocation(program, "u_drips"),
            time:     gl.getUniformLocation(program, "u_time"),
            motion:   gl.getUniformLocation(program, "u_motion"),
            dragging: gl.getUniformLocation(program, "u_dragging"),
            texture:  gl.getUniformLocation(program, "u_texture")
        };


        /* TEXTURE */

        texture = gl.createTexture();

        gl.activeTexture(gl.TEXTURE0);

        gl.bindTexture(gl.TEXTURE_2D, texture);

        gl.texParameteri(
            gl.TEXTURE_2D,
            gl.TEXTURE_WRAP_S,
            gl.CLAMP_TO_EDGE
        );

        gl.texParameteri(
            gl.TEXTURE_2D,
            gl.TEXTURE_WRAP_T,
            gl.CLAMP_TO_EDGE
        );

        gl.texParameteri(
            gl.TEXTURE_2D,
            gl.TEXTURE_MIN_FILTER,
            gl.LINEAR
        );

        gl.texParameteri(
            gl.TEXTURE_2D,
            gl.TEXTURE_MAG_FILTER,
            gl.LINEAR
        );

        gl.uniform1i(uniforms.texture, 0);


        gl.viewport(0, 0, canvas.width, canvas.height);


        glActive = true;

        if (
            fallbackImage.complete &&
            fallbackImage.naturalWidth > 0
        ) {
            uploadArtworkTexture();
        }

        return true;
    }


    /* If the image finishes loading after setup. */

    fallbackImage.addEventListener("load", function () {

        if (glActive) {
            uploadArtworkTexture();
        }
    });


    /* =========================================
       CONTEXT LOSS / RESTORE
    ========================================== */

    canvas.addEventListener("webglcontextlost", function (event) {

        /* Tells the browser we want the context back. */
        event.preventDefault();

        glActive = false;
        imageReady = false;
    });


    canvas.addEventListener("webglcontextrestored", function () {

        setupGL();
    });


    /* =========================================
       SMOOTH POINTER STATE
    ========================================== */

    let pointerX = 0.5;
    let pointerY = 0.5;

    let targetPointerX = 0.5;
    let targetPointerY = 0.5;

    let velocityX = 0;
    let velocityY = 0;

    let targetVelocityX = 0;
    let targetVelocityY = 0;

    let motion = 0;
    let targetMotion = 0;

    let draggingAmount = 0;
    let targetDraggingAmount = 0;


    /* =========================================
       DRIP STATE

       A small pool of 4 drips. Each new tap takes
       the next slot, so older ripples keep going.
    ========================================== */

    const MAX_DRIPS = 4;

    const drips = [];

    for (let i = 0; i < MAX_DRIPS; i++) {
        drips.push({ x: 0.5, y: 0.5, start: -10000000 });
    }

    const dripData = new Float32Array(MAX_DRIPS * 3);

    let nextDrip = 0;
    let lastDripIndex = -1;


    let interacted = false;


    /* =========================================
       UPDATE POINTER TARGET

       We do NOT directly move the shader pointer.
       The render loop eases toward this position.
    ========================================== */

    function updateShaderPointer(clientX, clientY) {

        const rect = container.getBoundingClientRect();

        const nextX = clamp(
            (clientX - rect.left) / rect.width,
            0,
            1
        );

        const nextY = clamp(
            1 - (clientY - rect.top) / rect.height,
            0,
            1
        );

        const deltaX = nextX - targetPointerX;
        const deltaY = nextY - targetPointerY;

        targetPointerX = nextX;
        targetPointerY = nextY;


        targetVelocityX = clamp(deltaX * 1.5, -0.040, 0.040);
        targetVelocityY = clamp(deltaY * 1.5, -0.040, 0.040);

        targetMotion = Math.min(
            1,
            Math.hypot(deltaX, deltaY) * 30
        );


        if (!interacted) {

            interacted = true;

            interactionMessage.classList.add("is-hidden");
        }
    }


    /* =========================================
       CREATE / CANCEL DRIP
    ========================================== */

    function createDrip(clientX, clientY) {

        const rect = container.getBoundingClientRect();

        const drip = drips[nextDrip];

        drip.x = clamp(
            (clientX - rect.left) / rect.width,
            0,
            1
        );

        drip.y = clamp(
            1 - (clientY - rect.top) / rect.height,
            0,
            1
        );

        drip.start = performance.now();

        lastDripIndex = nextDrip;

        nextDrip = (nextDrip + 1) % MAX_DRIPS;
    }


    /* Used when a tap turns out to be the start of a pinch. */

    function cancelLastDrip() {

        if (lastDripIndex >= 0) {
            drips[lastDripIndex].start = -10000000;
        }
    }


    /* =========================================
       POINTER DOWN
    ========================================== */

    container.addEventListener("pointerdown", function (event) {

        viewPointers.set(event.pointerId, {
            x: event.clientX,
            y: event.clientY,
            type: event.pointerType
        });


        try {
            container.setPointerCapture(event.pointerId);
        } catch (error) {
        }


        /* ONE POINTER: click/tap = DRIP
           (the whirl does NOT start yet) */

        if (viewPointers.size === 1 && viewScale === 1) {

            dragPointerId = event.pointerId;

            dragOriginX = event.clientX;
            dragOriginY = event.clientY;

            dragHasStarted = false;

            targetDraggingAmount = 0;

            updateShaderPointer(event.clientX, event.clientY);

            createDrip(event.clientX, event.clientY);
        }


        /* TWO FINGERS = PINCH */

        if (viewPointers.size === 2) {

            cancelLastDrip();

            targetDraggingAmount = 0;

            dragHasStarted = false;

            dragPointerId = null;

            pinchStartDistance = viewPointerDistance();

            pinchStartScale = viewScale;

            const midpoint = viewPointerMidpoint();

            pinchStartX = midpoint.x;
            pinchStartY = midpoint.y;

            pinchStartViewX = viewX;
            pinchStartViewY = viewY;

            panning = false;
        }


        /* ALREADY ZOOMED = PAN */

        else if (viewScale > 1) {

            targetDraggingAmount = 0;

            dragHasStarted = false;

            panning = true;

            panStartX = event.clientX;
            panStartY = event.clientY;

            panOriginalX = viewX;
            panOriginalY = viewY;
        }


        if (audio.paused && wantsPlayback && !muted) {
            attemptPlayback();
        }
    });


    /* =========================================
       POINTER MOVE
    ========================================== */

    container.addEventListener("pointermove", function (event) {

        if (viewPointers.has(event.pointerId)) {

            viewPointers.set(event.pointerId, {
                x: event.clientX,
                y: event.clientY,
                type: event.pointerType
            });
        }


        /* PINCH */

        if (viewPointers.size === 2) {

            targetDraggingAmount = 0;

            const distance = viewPointerDistance();

            const midpoint = viewPointerMidpoint();

            viewScale = clamp(
                pinchStartScale * (distance / pinchStartDistance),
                1,
                3.5
            );

            viewX = pinchStartViewX + (midpoint.x - pinchStartX);
            viewY = pinchStartViewY + (midpoint.y - pinchStartY);

            updateViewTransform();

            return;
        }


        /* PAN WHILE ZOOMED */

        if (panning && viewScale > 1) {

            targetDraggingAmount = 0;

            viewX = panOriginalX + (event.clientX - panStartX);
            viewY = panOriginalY + (event.clientY - panStartY);

            updateViewTransform();

            return;
        }


        if (viewScale !== 1) {
            return;
        }


        /* MOUSE HOVER: water follows cursor, whirl stays off. */

        if (
            event.pointerType === "mouse" &&
            !viewPointers.has(event.pointerId)
        ) {

            targetDraggingAmount = 0;

            updateShaderPointer(event.clientX, event.clientY);

            return;
        }


        /* HELD POINTER: whirl only after deliberate movement. */

        if (viewPointers.has(event.pointerId)) {

            if (event.pointerId === dragPointerId) {

                const distanceFromStart = Math.hypot(
                    event.clientX - dragOriginX,
                    event.clientY - dragOriginY
                );

                if (
                    !dragHasStarted &&
                    distanceFromStart > dragThreshold
                ) {
                    dragHasStarted = true;
                }

                targetDraggingAmount = dragHasStarted ? 1 : 0;
            }

            updateShaderPointer(event.clientX, event.clientY);
        }
    });


    /* =========================================
       RELEASE
    ========================================== */

    function releasePointer(event) {

        viewPointers.delete(event.pointerId);


        if (event.pointerId === dragPointerId) {

            dragPointerId = null;

            dragHasStarted = false;

            targetDraggingAmount = 0;
        }


        if (viewPointers.size < 2) {
            pinchStartDistance = 0;
        }


        if (viewPointers.size === 0) {

            panning = false;

            targetDraggingAmount = 0;
        }
    }


    container.addEventListener("pointerup", releasePointer);
    container.addEventListener("pointercancel", releasePointer);


    /* =========================================
       CANVAS SIZE
    ========================================== */

    function resizeCanvas() {

        const ratio = Math.min(window.devicePixelRatio || 1, 2);

        const width = Math.floor(container.clientWidth * ratio);
        const height = Math.floor(container.clientHeight * ratio);

        if (canvas.width !== width || canvas.height !== height) {

            canvas.width = width;
            canvas.height = height;

            gl.viewport(0, 0, width, height);
        }
    }


    /* =========================================
       RENDER LOOP

       Runs once and keeps going. While the context
       is lost it just waits.
    ========================================== */

    const start = performance.now();


    function render() {

        requestAnimationFrame(render);


        if (!glActive) {
            return;
        }


        resizeCanvas();


        /* Smooth the actual pointer toward the raw
           trackpad / mouse position. */

        pointerX += (targetPointerX - pointerX) * 0.17;
        pointerY += (targetPointerY - pointerY) * 0.17;


        velocityX += (targetVelocityX - velocityX) * 0.12;
        velocityY += (targetVelocityY - velocityY) * 0.12;


        motion += (targetMotion - motion) * 0.10;


        draggingAmount +=
            (targetDraggingAmount - draggingAmount) * 0.09;


        /* Natural decay. */

        targetVelocityX *= 0.82;
        targetVelocityY *= 0.82;

        targetMotion *= 0.88;


        const now = performance.now();

        const time = (now - start) / 1000;


        if (imageReady) {

            for (let i = 0; i < MAX_DRIPS; i++) {

                const drip = drips[i];

                dripData[i * 3] = drip.x;
                dripData[i * 3 + 1] = drip.y;

                /* Capped so very old drips stay tiny numbers. */
                dripData[i * 3 + 2] =
                    Math.min((now - drip.start) / 1000, 100);
            }


            gl.uniform2f(uniforms.pointer, pointerX, pointerY);

            gl.uniform2f(uniforms.velocity, velocityX, velocityY);

            gl.uniform3fv(uniforms.drips, dripData);

            gl.uniform1f(uniforms.time, time);

            gl.uniform1f(uniforms.motion, motion);

            gl.uniform1f(uniforms.dragging, draggingAmount);

            gl.drawArrays(gl.TRIANGLES, 0, 6);
        }
    }


    if (setupGL()) {
        render();
    }
}