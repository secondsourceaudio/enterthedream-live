/* =========================================
   SECOND SOURCE
   SRC001 — DRIP
========================================= */


/* =========================================
   AUDIO
========================================= */

const audio =
    document.getElementById("experiment-audio");


const playButton =
    document.getElementById("play-button");


const playSymbol =
    document.getElementById("play-symbol");


const soundButton =
    document.getElementById("sound-button");


const speakerSymbol =
    document.getElementById("speaker-symbol");


const volumeSlider =
    document.getElementById("volume-slider");


const volumePercent =
    document.getElementById("volume-percent");


const progressFill =
    document.getElementById("progress-fill");


const playerTime =
    document.getElementById("player-time");


let selectedVolume =
    0.35;


let muted =
    false;


audio.volume =
    selectedVolume;


audio.muted =
    false;


/* =========================================
   AUDIO HELPERS
========================================= */

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


function updatePlayer() {

    playSymbol.textContent =
        audio.paused
            ? "▶"
            : "Ⅱ";


    speakerSymbol.textContent =
        muted
            ? "×"
            : "◖))";


    volumePercent.textContent =
        Math.round(
            selectedVolume * 100
        )
        +
        "%";


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
   START AUDIO
========================================= */

function startAudio() {

    if (muted) {

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
        .catch(function () {

            /*
               Normal browser autoplay restriction.

               First interaction will try again.
            */

            updatePlayer();

        });

}


/* =========================================
   PLAY
========================================= */

playButton.addEventListener(
    "click",
    function () {

        if (audio.paused) {

            muted =
                false;


            audio.muted =
                false;


            audio.play()
                .catch(function () {});

        }

        else {

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
            audio.paused
        ) {

            audio.play()
                .catch(function () {});

        }


        updatePlayer();

    }
);


/* =========================================
   VOLUME

   Works naturally with mouse and touch.
========================================= */

volumeSlider.addEventListener(
    "input",
    function () {

        selectedVolume =
            Number(
                volumeSlider.value
            )
            /
            100;


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


        if (
            audio.paused
        ) {

            audio.play()
                .catch(function () {});

        }


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


/*
   Request autoplay.

   Browser may defer this until first interaction.
*/

startAudio();


/* =========================================
   WEBGL
========================================= */

const canvas =
    document.getElementById("visual");


const container =
    document.getElementById(
        "visual-container"
    );


const interactionMessage =
    document.getElementById(
        "interaction-message"
    );


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
   WEBGL
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

        uniform float u_time;

        uniform float u_motion;


        void main() {

            vec2 uv =
                v_uv;


            /* =================================
               CONSTANT CENTER BUBBLING
            ================================= */


            vec2 center =
                vec2(
                    0.5,
                    0.5
                );


            vec2 centerDelta =
                uv
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


            /*
               Several waves travelling outward
               continuously from the center.
            */


            float centerWave1 =
                sin(
                    centerDistance
                    *
                    48.0
                    -
                    u_time
                    *
                    3.2
                );


            float centerWave2 =
                sin(
                    centerDistance
                    *
                    27.0
                    -
                    u_time
                    *
                    2.1
                );


            float centerWave3 =
                sin(
                    centerDistance
                    *
                    76.0
                    -
                    u_time
                    *
                    4.4
                );


            float centerBubbles =
                centerWave1
                *
                0.50
                +
                centerWave2
                *
                0.32
                +
                centerWave3
                *
                0.18;


            /*
               Strongest toward center,
               gradually softer toward edges.
            */


            float centerInfluence =
                smoothstep(
                    0.72,
                    0.04,
                    centerDistance
                );


            uv +=
                centerDirection
                *
                centerBubbles
                *
                centerInfluence
                *
                0.0048;


            /* =================================
               SLOW BREATHING / WATER MOTION
            ================================= */


            uv.x +=
                sin(
                    uv.y
                    *
                    10.0
                    +
                    u_time
                    *
                    0.55
                )
                *
                0.0022;


            uv.y +=
                cos(
                    uv.x
                    *
                    9.0
                    -
                    u_time
                    *
                    0.42
                )
                *
                0.0018;


            /* =================================
               POINTER RIPPLE
            ================================= */


            vec2 pointerDelta =
                v_uv
                -
                u_pointer;


            float pointerDistance =
                length(
                    pointerDelta
                );


            float pointerInfluence =
                smoothstep(
                    0.34,
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


            float pointerWave1 =
                sin(
                    pointerDistance
                    *
                    58.0
                    -
                    u_time
                    *
                    7.0
                );


            float pointerWave2 =
                sin(
                    pointerDistance
                    *
                    29.0
                    -
                    u_time
                    *
                    4.0
                );


            float pointerWave =
                pointerWave1
                *
                0.68
                +
                pointerWave2
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
                    0.025
                );


            /* =================================
               DRAGGING LIQUID

               Faster movement pulls the artwork
               slightly behind the pointer.
            ================================= */


            uv -=
                u_velocity
                *
                pointerInfluence
                *
                (
                    0.18
                    +
                    u_motion
                    *
                    0.45
                );


            /* =================================
               LOCAL LENS / BULGE
            ================================= */


            float bulge =
                pointerInfluence
                *
                (
                    0.008
                    +
                    u_motion
                    *
                    0.018
                );


            uv -=
                pointerDelta
                *
                bulge;


            /* =================================
               SAFE UV
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
               IMAGE
            ================================= */


            vec4 colour =
                texture2D(
                    u_texture,
                    uv
                );


            gl_FragColor =
                colour;

        }

    `;


    /* =========================================
       SHADERS
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
               IMAGE
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
                       Resize internally.

                       Original JPG stays untouched.
                    */

                    const maximum =
                        Math.min(
                            1800,
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
                        longest > maximum
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

                        textureCanvas

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


            let interacted =
                false;


            function clampValue(
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
                    clampValue(
                        deltaX * 2.5,
                        -0.07,
                        0.07
                    );


                targetVelocityY =
                    clampValue(
                        deltaY * 2.5,
                        -0.07,
                        0.07
                    );


                targetMotion =
                    Math.min(
                        1,
                        Math.hypot(
                            deltaX,
                            deltaY
                        )
                        *
                        50
                    );


                if (!interacted) {

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
               MOUSE + TOUCH
            ================================= */


            const activePointers =
                new Set();


            container.addEventListener(
                "pointerdown",
                function (event) {

                    activePointers.add(
                        event.pointerId
                    );


                    updatePointer(
                        event.clientX,
                        event.clientY
                    );


                    /*
                       First meaningful interaction
                       can unlock browser audio.
                    */

                    if (
                        audio.paused
                        &&
                        !muted
                    ) {

                        audio.play()
                            .catch(
                                function () {}
                            );

                    }


                    try {

                        container.setPointerCapture(
                            event.pointerId
                        );

                    }

                    catch (error) {
                    }

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
                    0.14;


                targetVelocityX *=
                    0.86;


                targetVelocityY *=
                    0.86;


                targetMotion *=
                    0.90;


                const time =
                    (
                        performance.now()
                        -
                        start
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


                    gl.uniform1f(
                        timeUniform,
                        time
                    );


                    gl.uniform1f(
                        motionUniform,
                        motion
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