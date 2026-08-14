/* =========================================
   SECOND SOURCE
   SRC001 — DRIP
========================================= */


const canvas =
    document.getElementById("visual");


const container =
    document.getElementById("visual-container");


const interactionMessage =
    document.getElementById("interaction-message");


/* =========================================
   AUDIO PLAYER
========================================= */

const audio =
    document.getElementById("experiment-audio");


const playButton =
    document.getElementById("play-button");


const playIcon =
    document.getElementById("play-icon");


const pauseIcon =
    document.getElementById("pause-icon");


const soundButton =
    document.getElementById("sound-button");


const volumeControl =
    document.getElementById("volume-control");


const volumePercent =
    document.getElementById("volume-percent");


const progressTrack =
    document.getElementById("progress-track");


const progressFill =
    document.getElementById("progress-fill");


const playerTime =
    document.getElementById("player-time");


/* =========================================
   INITIAL AUDIO STATE

   Previous setting was 70%.
   Half of that = 35%.
========================================= */

let preferredVolume =
    0.35;


let userMuted =
    false;


audio.volume =
    preferredVolume;


audio.muted =
    false;


/* =========================================
   HELPERS
========================================= */

function clamp(
    value,
    minimum,
    maximum
) {

    return Math.max(
        minimum,
        Math.min(
            maximum,
            value
        )
    );

}


function formatTime(seconds) {

    if (
        !Number.isFinite(seconds)
    ) {

        return "0:00";

    }


    const minutes =
        Math.floor(
            seconds / 60
        );


    const remainingSeconds =
        Math.floor(
            seconds % 60
        );


    return (
        minutes
        +
        ":"
        +
        String(
            remainingSeconds
        ).padStart(
            2,
            "0"
        )
    );

}


/* =========================================
   PLAYER DISPLAY
========================================= */

function updatePlayButton() {

    const playing =
        !audio.paused;


    playIcon.classList.toggle(
        "is-hidden",
        playing
    );


    pauseIcon.classList.toggle(
        "is-hidden",
        !playing
    );


    playButton.setAttribute(
        "aria-label",
        playing
            ? "Pause"
            : "Play"
    );

}


function updateVolumeDisplay() {

    const percentage =
        Math.round(
            preferredVolume
            *
            100
        );


    volumePercent.textContent =
        percentage
        +
        "%";


    soundButton.classList.toggle(
        "is-muted",
        userMuted
        ||
        audio.muted
    );


    soundButton.setAttribute(
        "aria-label",
        userMuted
            ? "Unmute"
            : "Mute"
    );

}


function updateProgress() {

    if (
        Number.isFinite(
            audio.duration
        )
        &&
        audio.duration > 0
    ) {

        const progress =
            (
                audio.currentTime
                /
                audio.duration
            )
            *
            100;


        progressFill.style.width =
            progress
            +
            "%";

    }


    playerTime.textContent =
        formatTime(
            audio.currentTime
        )
        +
        " / "
        +
        formatTime(
            audio.duration
        );

}


/* =========================================
   START AUDIO
========================================= */

function tryToPlayAudio() {

    if (userMuted) {

        return;

    }


    audio.muted =
        false;


    const promise =
        audio.play();


    if (promise !== undefined) {

        promise
            .then(function () {

                updatePlayButton();
                updateVolumeDisplay();

            })
            .catch(function () {

                /*
                   Browser blocked autoplay.

                   First click / touch will retry.
                */

                updatePlayButton();

            });

    }

}


/*
   Initial autoplay attempt.
*/

tryToPlayAudio();


/* =========================================
   PLAY / PAUSE
========================================= */

playButton.addEventListener(
    "click",
    function () {

        if (audio.paused) {

            userMuted =
                false;


            audio.muted =
                false;


            audio.play()
                .then(function () {

                    updatePlayButton();
                    updateVolumeDisplay();

                })
                .catch(function (error) {

                    console.error(
                        "Audio could not play:",
                        error
                    );

                });

        }

        else {

            audio.pause();

        }

    }
);


/* =========================================
   SPEAKER CLICK = MUTE / UNMUTE
========================================= */

soundButton.addEventListener(
    "click",
    function (event) {

        event.stopPropagation();


        userMuted =
            !userMuted;


        audio.muted =
            userMuted;


        if (
            !userMuted
            &&
            audio.paused
        ) {

            audio.play()
                .catch(function () {});

        }


        updateVolumeDisplay();

    }
);


/* =========================================
   VERTICAL VOLUME DRAG

   Drag upward = louder
   Drag downward = quieter
========================================= */

let volumeDragging =
    false;


let volumeStartY =
    0;


let volumeStartValue =
    preferredVolume;


let volumeHasMoved =
    false;


volumeControl.addEventListener(
    "pointerdown",
    function (event) {

        /*
           Let a normal speaker click remain
           a mute/unmute click unless the
           pointer actually moves vertically.
        */

        volumeDragging =
            true;


        volumeHasMoved =
            false;


        volumeStartY =
            event.clientY;


        volumeStartValue =
            preferredVolume;


        try {

            volumeControl.setPointerCapture(
                event.pointerId
            );

        }

        catch (error) {
        }

    }
);


volumeControl.addEventListener(
    "pointermove",
    function (event) {

        if (!volumeDragging) {

            return;

        }


        const movement =
            volumeStartY
            -
            event.clientY;


        if (
            Math.abs(
                movement
            )
            >
            3
        ) {

            volumeHasMoved =
                true;

        }


        if (!volumeHasMoved) {

            return;

        }


        /*
           About 140 pixels of movement
           covers the full volume range.
        */

        const newVolume =
            clamp(

                volumeStartValue
                +
                movement
                /
                140,

                0,
                1

            );


        preferredVolume =
            newVolume;


        audio.volume =
            preferredVolume;


        /*
           Adjusting volume means the user
           intends to hear sound.
        */

        userMuted =
            false;


        audio.muted =
            false;


        if (audio.paused) {

            audio.play()
                .catch(function () {});

        }


        updateVolumeDisplay();

    }
);


function finishVolumeDrag() {

    volumeDragging =
        false;

}


volumeControl.addEventListener(
    "pointerup",
    finishVolumeDrag
);


volumeControl.addEventListener(
    "pointercancel",
    finishVolumeDrag
);


/* =========================================
   SEEKING
========================================= */

progressTrack.addEventListener(
    "click",
    function (event) {

        if (
            !Number.isFinite(
                audio.duration
            )
        ) {

            return;

        }


        const rect =
            progressTrack
                .getBoundingClientRect();


        const percentage =
            clamp(

                (
                    event.clientX
                    -
                    rect.left
                )
                /
                rect.width,

                0,
                1

            );


        audio.currentTime =
            percentage
            *
            audio.duration;


        updateProgress();

    }
);


/* =========================================
   AUDIO EVENTS
========================================= */

audio.addEventListener(
    "timeupdate",
    updateProgress
);


audio.addEventListener(
    "durationchange",
    updateProgress
);


audio.addEventListener(
    "loadedmetadata",
    updateProgress
);


audio.addEventListener(
    "play",
    updatePlayButton
);


audio.addEventListener(
    "pause",
    updatePlayButton
);


audio.addEventListener(
    "volumechange",
    updateVolumeDisplay
);


/* =========================================
   AUTOPLAY UNLOCK

   If Brave/Safari blocks autoplay,
   first interaction with the artwork
   starts it.
========================================= */

function unlockAudio() {

    if (
        audio.paused
        &&
        !userMuted
    ) {

        audio.play()
            .catch(function () {});

    }

}


container.addEventListener(
    "pointerdown",
    unlockAudio,
    {
        once: true
    }
);


updatePlayButton();
updateVolumeDisplay();
updateProgress();


/* =========================================
   WEBGL
========================================= */

const gl =
    canvas.getContext(
        "webgl",
        {
            antialias: true,
            alpha: true
        }
    );


if (!gl) {

    canvas.style.display =
        "none";

}


/* =========================================
   SHADERS
========================================= */

if (gl) {

    const vertexShaderSource = `

        attribute vec2 a_position;

        varying vec2 v_uv;


        void main() {

            v_uv =
                a_position * 0.5 + 0.5;


            gl_Position =
                vec4(
                    a_position,
                    0.0,
                    1.0
                );

        }

    `;


    const fragmentShaderSource = `

        precision highp float;


        varying vec2 v_uv;


        uniform sampler2D u_texture;

        uniform vec2 u_pointer;

        uniform vec2 u_velocity;

        uniform vec2 u_pulseCenter;

        uniform float u_time;

        uniform float u_motion;

        uniform float u_pulseAge;


        float randomValue(float value) {

            return fract(
                sin(
                    value
                )
                *
                43758.5453123
            );

        }


        mat2 rotate2D(float angle) {

            float sineValue =
                sin(angle);


            float cosineValue =
                cos(angle);


            return mat2(
                cosineValue,
                -sineValue,
                sineValue,
                cosineValue
            );

        }


        void main() {

            vec2 baseUV =
                v_uv;


            vec2 uv =
                baseUV;


            /* =================================
               LIQUID BASE FLOW
            ================================= */


            float flowX =
                sin(
                    uv.y
                    *
                    11.0
                    +
                    u_time
                    *
                    0.72
                    +
                    sin(
                        uv.x
                        *
                        8.0
                        -
                        u_time
                        *
                        0.45
                    )
                );


            float flowY =
                cos(
                    uv.x
                    *
                    9.0
                    -
                    u_time
                    *
                    0.60
                    +
                    cos(
                        uv.y
                        *
                        8.0
                        +
                        u_time
                        *
                        0.38
                    )
                );


            vec2 flow =
                vec2(
                    flowX,
                    flowY
                );


            uv +=
                flow
                *
                (
                    0.002
                    +
                    u_motion
                    *
                    0.018
                );


            /* =================================
               POINTER FIELD
            ================================= */


            vec2 pointerDelta =
                baseUV
                -
                u_pointer;


            float pointerDistance =
                length(
                    pointerDelta
                );


            float influence =
                smoothstep(
                    0.48,
                    0.0,
                    pointerDistance
                );


            /* =================================
               SWIRL
            ================================= */


            float swirl =
                influence
                *
                (
                    0.25
                    +
                    u_motion
                    *
                    3.5
                )
                *
                sin(
                    u_time
                    *
                    0.8
                    +
                    pointerDistance
                    *
                    8.0
                );


            vec2 rotated =
                rotate2D(
                    swirl
                )
                *
                pointerDelta;


            uv +=
                (
                    rotated
                    -
                    pointerDelta
                )
                *
                influence
                *
                0.82;


            /* =================================
               SMEAR
            ================================= */


            uv -=
                u_velocity
                *
                influence
                *
                (
                    0.28
                    +
                    u_motion
                    *
                    1.05
                );


            /* =================================
               LIQUID RIPPLES
            ================================= */


            vec2 radialDirection =
                normalize(
                    pointerDelta
                    +
                    vec2(
                        0.0001
                    )
                );


            float waveA =
                sin(
                    pointerDistance
                    *
                    65.0
                    -
                    u_time
                    *
                    9.0
                );


            float waveB =
                sin(
                    pointerDistance
                    *
                    26.0
                    +
                    u_time
                    *
                    4.2
                );


            float waves =
                waveA
                *
                0.68
                +
                waveB
                *
                0.32;


            uv +=
                radialDirection
                *
                waves
                *
                influence
                *
                (
                    0.005
                    +
                    u_motion
                    *
                    0.038
                );


            /* =================================
               HORIZONTAL DIGITAL TEARS
            ================================= */


            float glitchTime =
                floor(
                    u_time
                    *
                    10.0
                );


            float row =
                floor(
                    baseUV.y
                    *
                    38.0
                );


            float rowRandom =
                randomValue(
                    row
                    *
                    17.17
                    +
                    glitchTime
                    *
                    3.71
                );


            float glitchGate =
                step(
                    0.87
                    -
                    u_motion
                    *
                    0.18,
                    rowRandom
                );


            float horizontalTear =
                (
                    randomValue(
                        row
                        *
                        71.3
                        +
                        glitchTime
                    )
                    -
                    0.5
                )
                *
                glitchGate
                *
                (
                    0.003
                    +
                    u_motion
                    *
                    0.065
                );


            uv.x +=
                horizontalTear;


            /* =================================
               POINTER GLITCH BURST
            ================================= */


            float microBands =
                sin(
                    baseUV.y
                    *
                    240.0
                    +
                    u_time
                    *
                    19.0
                );


            uv.x +=
                microBands
                *
                influence
                *
                u_motion
                *
                0.0035;


            /* =================================
               CLICK RIPPLE
            ================================= */


            vec2 pulseDelta =
                baseUV
                -
                u_pulseCenter;


            float pulseDistance =
                length(
                    pulseDelta
                );


            float pulseLife =
                clamp(
                    1.0
                    -
                    u_pulseAge
                    /
                    2.0,
                    0.0,
                    1.0
                );


            float pulseRadius =
                u_pulseAge
                *
                0.36;


            float ring =
                exp(
                    -abs(
                        pulseDistance
                        -
                        pulseRadius
                    )
                    *
                    72.0
                )
                *
                pulseLife;


            vec2 pulseDirection =
                normalize(
                    pulseDelta
                    +
                    vec2(
                        0.0001
                    )
                );


            uv +=
                pulseDirection
                *
                ring
                *
                0.06;


            /* =================================
               SAFE UV
            ================================= */


            uv =
                clamp(
                    uv,
                    vec2(
                        0.003
                    ),
                    vec2(
                        0.997
                    )
                );


            /* =================================
               RGB SEPARATION

               Comes alive mainly during movement.
            ================================= */


            vec2 rgbOffset =
                (
                    u_velocity
                    *
                    1.6
                    +
                    flow
                    *
                    0.002
                )
                *
                (
                    0.18
                    +
                    u_motion
                    *
                    1.1
                );


            rgbOffset.x +=
                horizontalTear
                *
                0.5;


            vec2 redUV =
                clamp(
                    uv
                    +
                    rgbOffset,
                    vec2(0.003),
                    vec2(0.997)
                );


            vec2 blueUV =
                clamp(
                    uv
                    -
                    rgbOffset,
                    vec2(0.003),
                    vec2(0.997)
                );


            float red =
                texture2D(
                    u_texture,
                    redUV
                ).r;


            float green =
                texture2D(
                    u_texture,
                    uv
                ).g;


            float blue =
                texture2D(
                    u_texture,
                    blueUV
                ).b;


            /* =================================
               EXTRA SMEAR SAMPLE
            ================================= */


            vec4 smearSample =
                texture2D(

                    u_texture,

                    clamp(

                        uv
                        -
                        u_velocity
                        *
                        influence
                        *
                        1.2,

                        vec2(0.003),

                        vec2(0.997)

                    )

                );


            vec3 glitchColour =
                vec3(
                    red,
                    green,
                    blue
                );


            float smearAmount =
                clamp(
                    influence
                    *
                    u_motion
                    *
                    0.35,
                    0.0,
                    0.35
                );


            vec3 finalColour =
                mix(
                    glitchColour,
                    smearSample.rgb,
                    smearAmount
                );


            gl_FragColor =
                vec4(
                    finalColour,
                    1.0
                );

        }

    `;


    /* =========================================
       SHADER CREATION
    ========================================== */

    function createShader(
        type,
        source
    ) {

        const shader =
            gl.createShader(
                type
            );


        gl.shaderSource(
            shader,
            source
        );


        gl.compileShader(
            shader
        );


        if (
            !gl.getShaderParameter(
                shader,
                gl.COMPILE_STATUS
            )
        ) {

            console.error(
                gl.getShaderInfoLog(
                    shader
                )
            );


            return null;

        }


        return shader;

    }


    const vertexShader =
        createShader(
            gl.VERTEX_SHADER,
            vertexShaderSource
        );


    const fragmentShader =
        createShader(
            gl.FRAGMENT_SHADER,
            fragmentShaderSource
        );


    if (
        vertexShader
        &&
        fragmentShader
    ) {

        const program =
            gl.createProgram();


        gl.attachShader(
            program,
            vertexShader
        );


        gl.attachShader(
            program,
            fragmentShader
        );


        gl.linkProgram(
            program
        );


        if (
            gl.getProgramParameter(
                program,
                gl.LINK_STATUS
            )
        ) {

            gl.useProgram(
                program
            );


            /* =================================
               FULLSCREEN PLANE
            ================================= */


            const buffer =
                gl.createBuffer();


            gl.bindBuffer(
                gl.ARRAY_BUFFER,
                buffer
            );


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


            const position =
                gl.getAttribLocation(
                    program,
                    "a_position"
                );


            gl.enableVertexAttribArray(
                position
            );


            gl.vertexAttribPointer(
                position,
                2,
                gl.FLOAT,
                false,
                0,
                0
            );


            /* =================================
               UNIFORMS
            ================================= */


            const pointerUniform =
                gl.getUniformLocation(
                    program,
                    "u_pointer"
                );


            const velocityUniform =
                gl.getUniformLocation(
                    program,
                    "u_velocity"
                );


            const pulseCenterUniform =
                gl.getUniformLocation(
                    program,
                    "u_pulseCenter"
                );


            const timeUniform =
                gl.getUniformLocation(
                    program,
                    "u_time"
                );


            const motionUniform =
                gl.getUniformLocation(
                    program,
                    "u_motion"
                );


            const pulseAgeUniform =
                gl.getUniformLocation(
                    program,
                    "u_pulseAge"
                );


            const textureUniform =
                gl.getUniformLocation(
                    program,
                    "u_texture"
                );


            /* =================================
               TEXTURE
            ================================= */


            const texture =
                gl.createTexture();


            gl.activeTexture(
                gl.TEXTURE0
            );


            gl.bindTexture(
                gl.TEXTURE_2D,
                texture
            );


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


            gl.uniform1i(
                textureUniform,
                0
            );


            /* =================================
               LOAD IMAGE
            ================================= */


            const image =
                new Image();


            image.src =
                "./images/drip_cover_front.jpg";


            let imageReady =
                false;


            image.onload =
                function () {

                    const maximum =
                        Math.min(
                            2048,
                            gl.getParameter(
                                gl.MAX_TEXTURE_SIZE
                            )
                        );


                    let width =
                        image.naturalWidth;


                    let height =
                        image.naturalHeight;


                    const longest =
                        Math.max(
                            width,
                            height
                        );


                    if (
                        longest
                        >
                        maximum
                    ) {

                        const scale =
                            maximum
                            /
                            longest;


                        width =
                            Math.round(
                                width
                                *
                                scale
                            );


                        height =
                            Math.round(
                                height
                                *
                                scale
                            );

                    }


                    const temporaryCanvas =
                        document.createElement(
                            "canvas"
                        );


                    temporaryCanvas.width =
                        width;


                    temporaryCanvas.height =
                        height;


                    const context =
                        temporaryCanvas.getContext(
                            "2d"
                        );


                    context.drawImage(
                        image,
                        0,
                        0,
                        width,
                        height
                    );


                    gl.pixelStorei(
                        gl.UNPACK_FLIP_Y_WEBGL,
                        true
                    );


                    gl.bindTexture(
                        gl.TEXTURE_2D,
                        texture
                    );


                    gl.texImage2D(

                        gl.TEXTURE_2D,

                        0,

                        gl.RGBA,

                        gl.RGBA,

                        gl.UNSIGNED_BYTE,

                        temporaryCanvas

                    );


                    imageReady =
                        true;


                    canvas.classList.add(
                        "is-ready"
                    );

                };


            /* =================================
               POINTER STATE
            ================================= */


            let pointerX =
                0.5;


            let pointerY =
                0.5;


            let velocityX =
                0;


            let velocityY =
                0;


            let targetVelocityX =
                0;


            let targetVelocityY =
                0;


            let motion =
                0;


            let targetMotion =
                0;


            let pulseX =
                0.5;


            let pulseY =
                0.5;


            let pulseStarted =
                -10000;


            const activePointers =
                new Set();


            let hasVisualInteraction =
                false;


            function updatePointer(
                clientX,
                clientY
            ) {

                const rect =
                    container
                        .getBoundingClientRect();


                const nextX =
                    (
                        clientX
                        -
                        rect.left
                    )
                    /
                    rect.width;


                const nextY =
                    1
                    -
                    (
                        clientY
                        -
                        rect.top
                    )
                    /
                    rect.height;


                const deltaX =
                    nextX
                    -
                    pointerX;


                const deltaY =
                    nextY
                    -
                    pointerY;


                pointerX =
                    nextX;


                pointerY =
                    nextY;


                targetVelocityX =
                    clamp(
                        deltaX
                        *
                        2.8,
                        -0.085,
                        0.085
                    );


                targetVelocityY =
                    clamp(
                        deltaY
                        *
                        2.8,
                        -0.085,
                        0.085
                    );


                targetMotion =
                    Math.min(
                        1,
                        Math.hypot(
                            deltaX,
                            deltaY
                        )
                        *
                        60
                    );


                if (!hasVisualInteraction) {

                    hasVisualInteraction =
                        true;


                    interactionMessage
                        .classList
                        .add(
                            "is-hidden"
                        );

                }

            }


            /* =================================
               DESKTOP + MOBILE INPUT
            ================================= */


            container.addEventListener(
                "pointerdown",
                function (event) {

                    activePointers.add(
                        event.pointerId
                    );


                    try {

                        container.setPointerCapture(
                            event.pointerId
                        );

                    }

                    catch (error) {
                    }


                    updatePointer(
                        event.clientX,
                        event.clientY
                    );


                    pulseX =
                        pointerX;


                    pulseY =
                        pointerY;


                    pulseStarted =
                        performance.now();

                }
            );


            container.addEventListener(
                "pointermove",
                function (event) {

                    if (
                        event.pointerType
                        ===
                        "mouse"
                        ||
                        activePointers.has(
                            event.pointerId
                        )
                    ) {

                        updatePointer(
                            event.clientX,
                            event.clientY
                        );

                    }

                }
            );


            function releasePointer(
                event
            ) {

                activePointers.delete(
                    event.pointerId
                );

            }


            container.addEventListener(
                "pointerup",
                releasePointer
            );


            container.addEventListener(
                "pointercancel",
                releasePointer
            );


            /* =================================
               RESIZE
            ================================= */


            function resize() {

                const ratio =
                    Math.min(
                        window.devicePixelRatio
                        ||
                        1,
                        2
                    );


                const width =
                    Math.floor(
                        container.clientWidth
                        *
                        ratio
                    );


                const height =
                    Math.floor(
                        container.clientHeight
                        *
                        ratio
                    );


                if (
                    canvas.width
                    !==
                    width
                    ||
                    canvas.height
                    !==
                    height
                ) {

                    canvas.width =
                        width;


                    canvas.height =
                        height;


                    gl.viewport(
                        0,
                        0,
                        width,
                        height
                    );

                }

            }


            /* =================================
               RENDER LOOP
            ================================= */


            const start =
                performance.now();


            function render() {

                resize();


                velocityX +=
                    (
                        targetVelocityX
                        -
                        velocityX
                    )
                    *
                    0.19;


                velocityY +=
                    (
                        targetVelocityY
                        -
                        velocityY
                    )
                    *
                    0.19;


                motion +=
                    (
                        targetMotion
                        -
                        motion
                    )
                    *
                    0.14;


                /*
                   Slow decay gives the image
                   a lingering liquid/glitch trail.
                */

                targetVelocityX *=
                    0.87;


                targetVelocityY *=
                    0.87;


                targetMotion *=
                    0.90;


                const now =
                    performance.now();


                const time =
                    (
                        now
                        -
                        start
                    )
                    /
                    1000;


                const pulseAge =
                    (
                        now
                        -
                        pulseStarted
                    )
                    /
                    1000;


                if (imageReady) {

                    gl.uniform2f(
                        pointerUniform,
                        pointerX,
                        pointerY
                    );


                    gl.uniform2f(
                        velocityUniform,
                        velocityX,
                        velocityY
                    );


                    gl.uniform2f(
                        pulseCenterUniform,
                        pulseX,
                        pulseY
                    );


                    gl.uniform1f(
                        timeUniform,
                        time
                    );


                    gl.uniform1f(
                        motionUniform,
                        motion
                    );


                    gl.uniform1f(
                        pulseAgeUniform,
                        pulseAge
                    );


                    gl.drawArrays(
                        gl.TRIANGLES,
                        0,
                        6
                    );

                }


                requestAnimationFrame(
                    render
                );

            }


            render();

        }

    }

}