/* =========================================
   SECOND SOURCE
   SRC001
========================================= */


const canvas =
    document.getElementById("visual");


const container =
    document.getElementById("visual-container");


const interactionMessage =
    document.getElementById("interaction-message");


const audio =
    document.getElementById("experiment-audio");


const soundButton =
    document.getElementById("sound-button");


/* =========================================
   AUDIO
========================================= */

let userMuted = false;

let hasVisualInteraction = false;


/*
   Reflect ACTUAL sound state.
*/

function updateSoundButton() {

    const soundIsOff =
        userMuted
        ||
        audio.paused
        ||
        audio.muted;


    soundButton.classList.toggle(
        "is-muted",
        soundIsOff
    );


    soundButton.setAttribute(
        "aria-label",
        soundIsOff
            ? "Play sound"
            : "Mute sound"
    );


    soundButton.setAttribute(
        "title",
        soundIsOff
            ? "Play sound"
            : "Mute sound"
    );

}


/*
   Try to play immediately.
*/

function requestSound() {

    if (userMuted) {
        return;
    }


    audio.muted =
        false;


    const playPromise =
        audio.play();


    if (playPromise !== undefined) {

        playPromise
            .then(function () {

                updateSoundButton();

                if (!hasVisualInteraction) {

                    interactionMessage.textContent =
                        "MOVE / TOUCH";

                }

            })
            .catch(function (error) {

                /*
                   Browser probably blocked autoplay.

                   The next click/touch retries.
                */

                interactionMessage.textContent =
                    "CLICK / TOUCH FOR SOUND";


                updateSoundButton();


                console.log(
                    "Autoplay waiting for interaction:",
                    error
                );

            });

    }

}


/*
   Speaker button.

   If audio is currently off for ANY reason,
   clicking it explicitly starts playback.

   If it is playing, clicking mutes it.
*/

soundButton.addEventListener(
    "pointerdown",
    function (event) {

        event.stopPropagation();

    }
);


soundButton.addEventListener(
    "click",
    function (event) {

        event.preventDefault();

        event.stopPropagation();


        const currentlyOff =
            userMuted
            ||
            audio.paused
            ||
            audio.muted;


        if (currentlyOff) {

            /*
               TURN SOUND ON
            */

            userMuted =
                false;


            audio.muted =
                false;


            const playPromise =
                audio.play();


            if (playPromise !== undefined) {

                playPromise
                    .then(function () {

                        interactionMessage.textContent =
                            "MOVE / TOUCH";


                        updateSoundButton();

                    })
                    .catch(function (error) {

                        console.error(
                            "Could not play audio:",
                            error
                        );


                        updateSoundButton();

                    });

            }

        }

        else {

            /*
               TURN SOUND OFF
            */

            userMuted =
                true;


            audio.muted =
                true;


            updateSoundButton();

        }

    }
);


/*
   Retry playback directly inside the first
   genuine user gesture.
*/

function unlockSound(event) {

    if (
        event.target.closest(
            "#sound-button"
        )
    ) {

        return;

    }


    if (
        !userMuted
        &&
        (
            audio.paused
            ||
            audio.muted
        )
    ) {

        audio.muted =
            false;


        const playPromise =
            audio.play();


        if (playPromise !== undefined) {

            playPromise
                .then(function () {

                    updateSoundButton();

                })
                .catch(function (error) {

                    console.error(
                        "Audio unlock failed:",
                        error
                    );

                });

        }

    }

}


document.addEventListener(
    "pointerdown",
    unlockSound,
    true
);


document.addEventListener(
    "click",
    unlockSound,
    true
);


audio.addEventListener(
    "playing",
    updateSoundButton
);


audio.addEventListener(
    "pause",
    updateSoundButton
);


audio.addEventListener(
    "volumechange",
    updateSoundButton
);


audio.addEventListener(
    "error",
    function () {

        console.error(
            "Audio file could not be loaded.",
            audio.error
        );


        interactionMessage.textContent =
            "AUDIO FILE NOT FOUND";


        updateSoundButton();

    }
);


/*
   Initial attempt.
*/

requestSound();

updateSoundButton();


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

        precision mediump float;


        varying vec2 v_uv;


        uniform sampler2D u_texture;

        uniform vec2 u_pointer;

        uniform vec2 u_velocity;

        uniform vec2 u_pulseCenter;

        uniform float u_time;

        uniform float u_motion;

        uniform float u_pulseAge;


        mat2 rotate2D(float angle) {

            float s =
                sin(angle);

            float c =
                cos(angle);


            return mat2(
                c,
                -s,
                s,
                c
            );

        }


        void main() {

            vec2 baseUV =
                v_uv;


            vec2 uv =
                baseUV;


            /* =================================
               CONSTANT VISCOUS FLOW
            ================================= */


            float flowX =
                sin(
                    uv.y
                    *
                    10.0
                    +
                    u_time
                    *
                    0.55
                    +
                    sin(
                        uv.x
                        *
                        7.0
                        -
                        u_time
                        *
                        0.32
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
                    0.48
                    +
                    cos(
                        uv.y
                        *
                        8.0
                        +
                        u_time
                        *
                        0.25
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
                    0.0018
                    +
                    u_motion
                    *
                    0.014
                );


            /* =================================
               LOCAL POINTER FIELD
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
                    0.46,
                    0.0,
                    pointerDistance
                );


            /* =================================
               SWIRL / REFRACTION
            ================================= */


            float swirl =
                influence
                *
                (
                    0.28
                    +
                    u_motion
                    *
                    3.2
                )
                *
                sin(
                    u_time
                    *
                    0.55
                    +
                    pointerDistance
                    *
                    7.0
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
                0.78;


            /* =================================
               DRAG / SMEAR
            ================================= */


            uv -=
                u_velocity
                *
                influence
                *
                (
                    0.22
                    +
                    u_motion
                    *
                    0.9
                );


            /* =================================
               LIQUID WAVES
            ================================= */


            vec2 radial =
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
                    62.0
                    -
                    u_time
                    *
                    8.0
                );


            float waveB =
                sin(
                    pointerDistance
                    *
                    25.0
                    +
                    u_time
                    *
                    3.5
                );


            float waves =
                waveA
                *
                0.7
                +
                waveB
                *
                0.3;


            uv +=
                radial
                *
                waves
                *
                influence
                *
                (
                    0.004
                    +
                    u_motion
                    *
                    0.034
                );


            /* =================================
               SECONDARY WARP
            ================================= */


            vec2 secondaryWarp =
                vec2(

                    sin(
                        uv.y
                        *
                        21.0
                        +
                        u_time
                        *
                        1.2
                    ),

                    cos(
                        uv.x
                        *
                        18.0
                        -
                        u_time
                        *
                        0.9
                    )

                );


            uv +=
                secondaryWarp
                *
                influence
                *
                u_motion
                *
                0.009;


            /* =================================
               CLICK / TOUCH RIPPLE
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
                0.34;


            float ring =
                exp(
                    -abs(
                        pulseDistance
                        -
                        pulseRadius
                    )
                    *
                    70.0
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
                0.055;


            /* =================================
               KEEP INSIDE TEXTURE
            ================================= */


            uv =
                clamp(
                    uv,
                    vec2(
                        0.001
                    ),
                    vec2(
                        0.999
                    )
                );


            /* =================================
               VISCOUS DOUBLE-SAMPLE

               No RGB splitting.
               Just soft refractive smearing.
            ================================= */


            vec4 normalSample =
                texture2D(
                    u_texture,
                    uv
                );


            vec4 draggedSample =
                texture2D(

                    u_texture,

                    clamp(
                        uv
                        -
                        u_velocity
                        *
                        influence
                        *
                        0.9,
                        vec2(
                            0.001
                        ),
                        vec2(
                            0.999
                        )
                    )

                );


            float smearAmount =
                clamp(
                    u_motion
                    *
                    influence
                    *
                    0.48,
                    0.0,
                    0.48
                );


            gl_FragColor =
                mix(
                    normalSample,
                    draggedSample,
                    smearAmount
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

                    /*
                       Resize internally for mobile/GPU.
                    */

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


                    const tempCanvas =
                        document.createElement(
                            "canvas"
                        );


                    tempCanvas.width =
                        width;


                    tempCanvas.height =
                        height;


                    const context =
                        tempCanvas.getContext(
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

                        tempCanvas

                    );


                    imageReady =
                        true;


                    canvas.classList.add(
                        "is-ready"
                    );

                };


            /* =================================
               POINTER
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
                        2.5,
                        -0.075,
                        0.075
                    );


                targetVelocityY =
                    clamp(
                        deltaY
                        *
                        2.5,
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
                        55
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
               DESKTOP + MOBILE
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

                    /*
                       Mouse always reacts.

                       Touch reacts while finger
                       is actually dragging.
                    */

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
               RENDER
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
                    0.13;


                /*
                   Slow viscous decay creates
                   a lingering feeling after movement.
                */

                targetVelocityX *=
                    0.88;


                targetVelocityY *=
                    0.88;


                targetMotion *=
                    0.91;


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