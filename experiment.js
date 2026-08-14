/* =========================================
   SECOND SOURCE
   SRC001 — DRIP
========================================= */


/* =========================================
   AUDIO PLAYER
========================================= */

const audio =
    document.getElementById(
        "experiment-audio"
    );


const playButton =
    document.getElementById(
        "play-button"
    );


const playSymbol =
    document.getElementById(
        "play-symbol"
    );


const soundButton =
    document.getElementById(
        "sound-button"
    );


const speakerSymbol =
    document.getElementById(
        "speaker-symbol"
    );


const volumeSlider =
    document.getElementById(
        "volume-slider"
    );


const volumePercent =
    document.getElementById(
        "volume-percent"
    );


const progressTrack =
    document.getElementById(
        "progress-track"
    );


const progressFill =
    document.getElementById(
        "progress-fill"
    );


const playerTime =
    document.getElementById(
        "player-time"
    );


/* =========================================
   INITIAL AUDIO STATE
========================================= */

let selectedVolume =
    0.35;


let muted =
    false;


let wantsPlayback =
    true;


audio.volume =
    selectedVolume;


audio.muted =
    false;


/* =========================================
   GENERAL HELPERS
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


function formatTime(
    seconds
) {

    if (
        !Number.isFinite(
            seconds
        )
    ) {

        return "0:00";

    }


    const minutes =
        Math.floor(
            seconds / 60
        );


    const secondsLeft =
        Math.floor(
            seconds % 60
        );


    return (
        minutes
        +
        ":"
        +
        String(
            secondsLeft
        ).padStart(
            2,
            "0"
        )
    );

}


/* =========================================
   PLAYER DISPLAY
========================================= */

function updatePlayer() {

    playSymbol.textContent =
        audio.paused
            ? "▶"
            : "Ⅱ";


    speakerSymbol.textContent =
        (
            muted
            ||
            selectedVolume <= 0
        )
            ? "×"
            : "◖))";


    volumePercent.textContent =
        Math.round(
            selectedVolume
            *
            100
        )
        +
        "%";


    volumeSlider.value =
        selectedVolume
        *
        100;


    if (
        Number.isFinite(
            audio.duration
        )
        &&
        audio.duration > 0
    ) {

        progressFill.style.width =
            (
                audio.currentTime
                /
                audio.duration
                *
                100
            )
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
   PLAYBACK
========================================= */

function attemptPlayback() {

    if (
        !wantsPlayback
        ||
        muted
    ) {

        return;

    }


    audio.muted =
        false;


    audio.volume =
        selectedVolume;


    audio.play()
        .then(
            updatePlayer
        )
        .catch(
            updatePlayer
        );

}


attemptPlayback();


document.addEventListener(
    "pointerdown",
    function () {

        if (
            wantsPlayback
            &&
            !muted
            &&
            audio.paused
        ) {

            attemptPlayback();

        }

    },
    {
        once: true,
        capture: true
    }
);


/* =========================================
   PLAY / PAUSE
========================================= */

playButton.addEventListener(
    "click",
    function () {

        if (
            audio.paused
        ) {

            wantsPlayback =
                true;


            muted =
                false;


            audio.muted =
                false;


            attemptPlayback();

        }

        else {

            wantsPlayback =
                false;


            audio.pause();

        }


        updatePlayer();

    }
);


/* =========================================
   MUTE
========================================= */

soundButton.addEventListener(
    "click",
    function () {

        muted =
            !muted;


        audio.muted =
            muted;


        if (
            !muted
            &&
            wantsPlayback
            &&
            audio.paused
        ) {

            attemptPlayback();

        }


        updatePlayer();

    }
);


/* =========================================
   SMOOTH VOLUME
========================================= */

function setVolume(
    value
) {

    selectedVolume =
        clamp(
            value,
            0,
            1
        );


    audio.volume =
        selectedVolume;


    if (
        selectedVolume > 0
    ) {

        muted =
            false;


        audio.muted =
            false;

    }


    updatePlayer();

}


volumeSlider.addEventListener(
    "input",
    function () {

        setVolume(
            Number(
                volumeSlider.value
            )
            /
            100
        );


        if (
            wantsPlayback
            &&
            audio.paused
        ) {

            attemptPlayback();

        }

    }
);


/* =========================================
   VERTICAL VOLUME DRAG
========================================= */

let volumeDragging =
    false;


let volumeStartY =
    0;


let volumeStartValue =
    selectedVolume;


volumePercent.addEventListener(
    "pointerdown",
    function (event) {

        volumeDragging =
            true;


        volumeStartY =
            event.clientY;


        volumeStartValue =
            selectedVolume;


        try {

            volumePercent
                .setPointerCapture(
                    event.pointerId
                );

        }

        catch (error) {
        }

    }
);


volumePercent.addEventListener(
    "pointermove",
    function (event) {

        if (
            !volumeDragging
        ) {

            return;

        }


        const movement =
            volumeStartY
            -
            event.clientY;


        setVolume(

            volumeStartValue
            +
            movement
            /
            220

        );


        if (
            wantsPlayback
            &&
            audio.paused
        ) {

            attemptPlayback();

        }

    }
);


function stopVolumeDrag() {

    volumeDragging =
        false;

}


volumePercent.addEventListener(
    "pointerup",
    stopVolumeDrag
);


volumePercent.addEventListener(
    "pointercancel",
    stopVolumeDrag
);


/* =========================================
   SEEK
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


        const position =
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
            position
            *
            audio.duration;


        updatePlayer();

    }
);


/* =========================================
   AUDIO EVENTS
========================================= */

audio.addEventListener(
    "timeupdate",
    updatePlayer
);


audio.addEventListener(
    "loadedmetadata",
    updatePlayer
);


audio.addEventListener(
    "play",
    updatePlayer
);


audio.addEventListener(
    "pause",
    updatePlayer
);


updatePlayer();


/* =========================================
   EXPERIMENT ELEMENTS
========================================= */

const canvas =
    document.getElementById(
        "visual"
    );


const container =
    document.getElementById(
        "visual-container"
    );


const visualMedia =
    document.getElementById(
        "visual-media"
    );


const fallbackImage =
    document.getElementById(
        "fallback-image"
    );


const interactionMessage =
    document.getElementById(
        "interaction-message"
    );


/* =========================================
   PINCH ZOOM
========================================= */

let viewScale =
    1;


let viewX =
    0;


let viewY =
    0;


const viewPointers =
    new Map();


let pinchStartDistance =
    0;


let pinchStartScale =
    1;


let pinchStartX =
    0;


let pinchStartY =
    0;


let pinchStartViewX =
    0;


let pinchStartViewY =
    0;


let panStartX =
    0;


let panStartY =
    0;


let panOriginalX =
    0;


let panOriginalY =
    0;


let panning =
    false;


/* =========================================
   LIMIT PAN
========================================= */

function limitViewPan() {

    if (
        viewScale <= 1
    ) {

        viewScale =
            1;


        viewX =
            0;


        viewY =
            0;


        return;

    }


    const maxX =
        container.clientWidth
        *
        (
            viewScale - 1
        )
        /
        2;


    const maxY =
        container.clientHeight
        *
        (
            viewScale - 1
        )
        /
        2;


    viewX =
        clamp(
            viewX,
            -maxX,
            maxX
        );


    viewY =
        clamp(
            viewY,
            -maxY,
            maxY
        );

}


/* =========================================
   APPLY ZOOM
========================================= */

function updateViewTransform() {

    limitViewPan();


    visualMedia.style.transform =
        `
            translate3d(
                ${viewX}px,
                ${viewY}px,
                0
            )
            scale(
                ${viewScale}
            )
        `;

}


/* =========================================
   PINCH HELPERS
========================================= */

function viewPointerDistance() {

    const points =
        Array.from(
            viewPointers.values()
        );


    return Math.hypot(

        points[1].x
        -
        points[0].x,

        points[1].y
        -
        points[0].y

    );

}


function viewPointerMidpoint() {

    const points =
        Array.from(
            viewPointers.values()
        );


    return {

        x:
            (
                points[0].x
                +
                points[1].x
            )
            /
            2,

        y:
            (
                points[0].y
                +
                points[1].y
            )
            /
            2

    };

}


/*
   Prevent browser double-click zoom.
*/

container.addEventListener(
    "dblclick",
    function (event) {

        event.preventDefault();

    }
);


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
                a_position
                *
                0.5
                +
                0.5;


            gl_Position =
                vec4(
                    a_position,
                    0.0,
                    1.0
                );

        }

    `;


    const fragmentShaderSource = `

        precision mediump float;


        varying vec2 v_uv;


        uniform sampler2D u_texture;

        uniform vec2 u_pointer;

        uniform vec2 u_velocity;

        uniform vec2 u_dripCenter;

        uniform float u_time;

        uniform float u_motion;

        uniform float u_dripAge;

        uniform float u_dragging;


        mat2 rotate2D(
            float angle
        ) {

            float sineValue =
                sin(
                    angle
                );


            float cosineValue =
                cos(
                    angle
                );


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
               1. CONSTANT CENTER BUBBLING
            ================================= */


            vec2 center =
                vec2(
                    0.5,
                    0.5
                );


            vec2 centerDelta =
                baseUV
                -
                center;


            float centerDistance =
                length(
                    centerDelta
                );


            vec2 centerDirection =
                normalize(
                    centerDelta
                    +
                    vec2(
                        0.0001
                    )
                );


            float bubbleOne =
                sin(
                    centerDistance
                    *
                    50.0
                    -
                    u_time
                    *
                    3.1
                );


            float bubbleTwo =
                sin(
                    centerDistance
                    *
                    29.0
                    -
                    u_time
                    *
                    2.0
                );


            float bubbleThree =
                sin(
                    centerDistance
                    *
                    76.0
                    -
                    u_time
                    *
                    4.1
                );


            float centerBubble =
                bubbleOne
                *
                0.50

                +

                bubbleTwo
                *
                0.32

                +

                bubbleThree
                *
                0.18;


            float centerInfluence =
                smoothstep(
                    0.75,
                    0.03,
                    centerDistance
                );


            uv +=
                centerDirection
                *
                centerBubble
                *
                centerInfluence
                *
                0.0048;


            /* =================================
               2. SUBTLE 90s WAVE
            ================================= */


            float waveX =
                sin(
                    baseUV.y
                    *
                    8.0
                    -
                    u_time
                    *
                    1.15
                )
                *
                0.0042;


            float waveY =
                cos(
                    baseUV.x
                    *
                    6.5
                    -
                    u_time
                    *
                    0.9
                )
                *
                0.0024;


            float fineWave =
                sin(
                    baseUV.y
                    *
                    16.0
                    +
                    u_time
                    *
                    1.6
                )
                *
                0.0011;


            uv.x +=
                waveX
                +
                fineWave;


            uv.y +=
                waveY;


            /* =================================
               3. POINTER FIELD
            ================================= */


            vec2 pointerDelta =
                baseUV
                -
                u_pointer;


            float pointerDistance =
                length(
                    pointerDelta
                );


            float pointerInfluence =
                smoothstep(
                    0.42,
                    0.0,
                    pointerDistance
                );


            vec2 pointerDirection =
                normalize(
                    pointerDelta
                    +
                    vec2(
                        0.0001
                    )
                );


            /* =================================
               4. WHIRL WHILE DRAGGING
            ================================= */


            /*
               The whirl only comes alive while
               the mouse/finger is actually held.

               Faster dragging creates a deeper,
               more aggressive vortex.
            */


            float velocityMagnitude =
                min(
                    length(
                        u_velocity
                    )
                    *
                    18.0,
                    1.0
                );


            float whirlDirection =
                sign(

                    u_velocity.x
                    -
                    u_velocity.y
                    +
                    0.0001

                );


            float whirlFade =
                exp(
                    -pointerDistance
                    *
                    3.2
                );


            float whirlAngle =
                whirlDirection
                *
                u_dragging
                *
                whirlFade
                *
                (
                    0.20
                    +
                    u_motion
                    *
                    1.8
                    +
                    velocityMagnitude
                    *
                    1.1
                );


            vec2 whirledDelta =
                rotate2D(
                    whirlAngle
                )
                *
                pointerDelta;


            /*
               Blend the rotated coordinate field
               into the normal image.

               This creates the vortex rather than
               rotating the entire square.
            */


            uv +=
                (
                    whirledDelta
                    -
                    pointerDelta
                )
                *
                pointerInfluence
                *
                0.60;


            /* =================================
               5. POINTER WATER RIPPLE
            ================================= */


            float pointerWaveOne =
                sin(
                    pointerDistance
                    *
                    59.0
                    -
                    u_time
                    *
                    6.8
                );


            float pointerWaveTwo =
                sin(
                    pointerDistance
                    *
                    27.0
                    -
                    u_time
                    *
                    3.8
                );


            float pointerWave =
                pointerWaveOne
                *
                0.68

                +

                pointerWaveTwo
                *
                0.32;


            uv +=
                pointerDirection
                *
                pointerWave
                *
                pointerInfluence
                *
                (
                    0.006
                    +
                    u_motion
                    *
                    0.026
                );


            /* =================================
               6. LIQUID DRAG
            ================================= */


            uv -=
                u_velocity
                *
                pointerInfluence
                *
                (
                    0.16
                    +
                    u_motion
                    *
                    0.42
                );


            /* =================================
               7. DRIP ON CLICK / TAP
            ================================= */


            vec2 dripDelta =
                baseUV
                -
                u_dripCenter;


            float dripDistance =
                length(
                    dripDelta
                );


            vec2 dripDirection =
                normalize(
                    dripDelta
                    +
                    vec2(
                        0.0001
                    )
                );


            float dripRadius =
                u_dripAge
                *
                0.33;


            float dripLife =
                clamp(
                    1.0
                    -
                    u_dripAge
                    /
                    2.6,
                    0.0,
                    1.0
                );


            /*
               Main expanding ring.
            */


            float dripRing =
                exp(
                    -abs(
                        dripDistance
                        -
                        dripRadius
                    )
                    *
                    58.0
                )
                *
                dripLife;


            /*
               Smaller trailing ring.
            */


            float secondRadius =
                max(
                    0.0,
                    dripRadius
                    -
                    0.055
                );


            float secondRing =
                exp(
                    -abs(
                        dripDistance
                        -
                        secondRadius
                    )
                    *
                    72.0
                )
                *
                dripLife
                *
                0.45;


            /*
               Initial impact depression.
            */


            float impact =
                exp(
                    -dripDistance
                    *
                    24.0
                )
                *
                exp(
                    -u_dripAge
                    *
                    4.0
                );


            uv +=
                dripDirection
                *
                dripRing
                *
                0.050;


            uv +=
                dripDirection
                *
                secondRing
                *
                0.022;


            uv -=
                dripDelta
                *
                impact
                *
                0.10;


            /* =================================
               8. SAFE TEXTURE
            ================================= */


            uv =
                clamp(
                    uv,
                    vec2(
                        0.002
                    ),
                    vec2(
                        0.998
                    )
                );


            /* =================================
               9. ORIGINAL IMAGE COLOURS
            ================================= */


            vec4 mainSample =
                texture2D(
                    u_texture,
                    uv
                );


            /*
               Subtle viscous trailing sample.
            */


            vec4 draggedSample =
                texture2D(

                    u_texture,

                    clamp(

                        uv
                        -
                        u_velocity
                        *
                        pointerInfluence
                        *
                        0.65,

                        vec2(
                            0.002
                        ),

                        vec2(
                            0.998
                        )

                    )

                );


            float dragBlend =
                clamp(
                    u_motion
                    *
                    pointerInfluence
                    *
                    0.20,
                    0.0,
                    0.20
                );


            gl_FragColor =
                mix(
                    mainSample,
                    draggedSample,
                    dragBlend
                );

        }

    `;


    /* =========================================
       CREATE SHADER
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
               PLANE
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


            const dripCenterUniform =
                gl.getUniformLocation(
                    program,
                    "u_dripCenter"
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


            const dripAgeUniform =
                gl.getUniformLocation(
                    program,
                    "u_dripAge"
                );


            const draggingUniform =
                gl.getUniformLocation(
                    program,
                    "u_dragging"
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
               ARTWORK TEXTURE
            ================================= */


            let imageReady =
                false;


            function uploadArtworkTexture() {

                const maximum =
                    Math.min(
                        1800,
                        gl.getParameter(
                            gl.MAX_TEXTURE_SIZE
                        )
                    );


                let width =
                    fallbackImage.naturalWidth;


                let height =
                    fallbackImage.naturalHeight;


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

                    const resizeScale =
                        maximum
                        /
                        longest;


                    width =
                        Math.round(
                            width
                            *
                            resizeScale
                        );


                    height =
                        Math.round(
                            height
                            *
                            resizeScale
                        );

                }


                const textureCanvas =
                    document.createElement(
                        "canvas"
                    );


                textureCanvas.width =
                    width;


                textureCanvas.height =
                    height;


                const context =
                    textureCanvas.getContext(
                        "2d"
                    );


                context.drawImage(
                    fallbackImage,
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

                    textureCanvas

                );


                imageReady =
                    true;


                canvas.classList.add(
                    "is-ready"
                );

            }


            if (
                fallbackImage.complete
                &&
                fallbackImage.naturalWidth
                >
                0
            ) {

                uploadArtworkTexture();

            }

            else {

                fallbackImage.addEventListener(
                    "load",
                    uploadArtworkTexture,
                    {
                        once: true
                    }
                );

            }


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


            /*
               Smooth dragging value means
               the vortex eases in/out rather
               than snapping.
            */


            let draggingAmount =
                0;


            let targetDraggingAmount =
                0;


            /* =================================
               DRIP STATE
            ================================= */


            let dripX =
                0.5;


            let dripY =
                0.5;


            let dripStarted =
                -10000;


            let interacted =
                false;


            /* =================================
               POINTER UPDATE
            ================================= */


            function updateShaderPointer(
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
                        2.6,
                        -0.075,
                        0.075
                    );


                targetVelocityY =
                    clamp(
                        deltaY
                        *
                        2.6,
                        -0.075,
                        0.075
                    );


                targetMotion =
                    Math.min(
                        1,
                        Math.hypot(
                            deltaX,
                            deltaY
                        )
                        *
                        52
                    );


                if (
                    !interacted
                ) {

                    interacted =
                        true;


                    interactionMessage
                        .classList
                        .add(
                            "is-hidden"
                        );

                }

            }


            /* =================================
               CREATE DRIP
            ================================= */


            function createDrip(
                clientX,
                clientY
            ) {

                const rect =
                    container
                        .getBoundingClientRect();


                dripX =
                    (
                        clientX
                        -
                        rect.left
                    )
                    /
                    rect.width;


                dripY =
                    1
                    -
                    (
                        clientY
                        -
                        rect.top
                    )
                    /
                    rect.height;


                dripStarted =
                    performance.now();

            }


            /* =================================
               POINTER DOWN
            ================================= */


            container.addEventListener(
                "pointerdown",
                function (event) {

                    viewPointers.set(
                        event.pointerId,
                        {
                            x: event.clientX,
                            y: event.clientY,
                            type: event.pointerType
                        }
                    );


                    try {

                        container.setPointerCapture(
                            event.pointerId
                        );

                    }

                    catch (error) {
                    }


                    /*
                       First finger / mouse button:
                       activate water + DRIP + whirl.
                    */


                    if (
                        viewPointers.size === 1
                        &&
                        viewScale === 1
                    ) {

                        updateShaderPointer(
                            event.clientX,
                            event.clientY
                        );


                        createDrip(
                            event.clientX,
                            event.clientY
                        );


                        targetDraggingAmount =
                            1;

                    }


                    /*
                       Second finger:
                       immediately switch to pinch.
                    */


                    if (
                        viewPointers.size === 2
                    ) {

                        targetDraggingAmount =
                            0;


                        pinchStartDistance =
                            viewPointerDistance();


                        pinchStartScale =
                            viewScale;


                        const midpoint =
                            viewPointerMidpoint();


                        pinchStartX =
                            midpoint.x;


                        pinchStartY =
                            midpoint.y;


                        pinchStartViewX =
                            viewX;


                        pinchStartViewY =
                            viewY;


                        panning =
                            false;

                    }


                    else if (
                        viewScale > 1
                    ) {

                        targetDraggingAmount =
                            0;


                        panning =
                            true;


                        panStartX =
                            event.clientX;


                        panStartY =
                            event.clientY;


                        panOriginalX =
                            viewX;


                        panOriginalY =
                            viewY;

                    }


                    if (
                        audio.paused
                        &&
                        wantsPlayback
                        &&
                        !muted
                    ) {

                        attemptPlayback();

                    }

                }
            );


            /* =================================
               POINTER MOVE
            ================================= */


            container.addEventListener(
                "pointermove",
                function (event) {

                    if (
                        viewPointers.has(
                            event.pointerId
                        )
                    ) {

                        viewPointers.set(
                            event.pointerId,
                            {
                                x: event.clientX,
                                y: event.clientY,
                                type: event.pointerType
                            }
                        );

                    }


                    /* =================================
                       PINCH
                    ================================= */


                    if (
                        viewPointers.size === 2
                    ) {

                        targetDraggingAmount =
                            0;


                        const distance =
                            viewPointerDistance();


                        const midpoint =
                            viewPointerMidpoint();


                        viewScale =
                            clamp(

                                pinchStartScale
                                *
                                (
                                    distance
                                    /
                                    pinchStartDistance
                                ),

                                1,
                                3.5

                            );


                        viewX =
                            pinchStartViewX
                            +
                            (
                                midpoint.x
                                -
                                pinchStartX
                            );


                        viewY =
                            pinchStartViewY
                            +
                            (
                                midpoint.y
                                -
                                pinchStartY
                            );


                        updateViewTransform();


                        return;

                    }


                    /* =================================
                       PAN WHILE ZOOMED
                    ================================= */


                    if (
                        panning
                        &&
                        viewScale > 1
                    ) {

                        targetDraggingAmount =
                            0;


                        viewX =
                            panOriginalX
                            +
                            (
                                event.clientX
                                -
                                panStartX
                            );


                        viewY =
                            panOriginalY
                            +
                            (
                                event.clientY
                                -
                                panStartY
                            );


                        updateViewTransform();


                        return;

                    }


                    /* =================================
                       NORMAL WATER MOVEMENT
                    ================================= */


                    if (
                        viewScale === 1
                    ) {

                        /*
                           Mouse without button:
                           ordinary ripple only.
                        */


                        if (
                            event.pointerType
                            ===
                            "mouse"
                            &&
                            !viewPointers.has(
                                event.pointerId
                            )
                        ) {

                            targetDraggingAmount =
                                0;


                            updateShaderPointer(
                                event.clientX,
                                event.clientY
                            );

                        }


                        /*
                           Mouse button / finger held:
                           whirl + water.
                        */


                        if (
                            viewPointers.has(
                                event.pointerId
                            )
                        ) {

                            targetDraggingAmount =
                                1;


                            updateShaderPointer(
                                event.clientX,
                                event.clientY
                            );

                        }

                    }

                }
            );


            /* =================================
               RELEASE POINTER
            ================================= */


            function releasePointer(
                event
            ) {

                viewPointers.delete(
                    event.pointerId
                );


                if (
                    viewPointers.size < 2
                ) {

                    pinchStartDistance =
                        0;

                }


                if (
                    viewPointers.size === 0
                ) {

                    panning =
                        false;


                    targetDraggingAmount =
                        0;

                }

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
               CANVAS SIZE
            ================================= */


            function resizeCanvas() {

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
               RENDER
            ================================= */


            const start =
                performance.now();


            function render() {

                resizeCanvas();


                velocityX +=
                    (
                        targetVelocityX
                        -
                        velocityX
                    )
                    *
                    0.18;


                velocityY +=
                    (
                        targetVelocityY
                        -
                        velocityY
                    )
                    *
                    0.18;


                motion +=
                    (
                        targetMotion
                        -
                        motion
                    )
                    *
                    0.14;


                draggingAmount +=
                    (
                        targetDraggingAmount
                        -
                        draggingAmount
                    )
                    *
                    0.16;


                /*
                   Gradual water / vortex decay.
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


                const dripAge =
                    (
                        now
                        -
                        dripStarted
                    )
                    /
                    1000;


                if (
                    imageReady
                ) {

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
                        dripCenterUniform,
                        dripX,
                        dripY
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
                        dripAgeUniform,
                        dripAge
                    );


                    gl.uniform1f(
                        draggingUniform,
                        draggingAmount
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