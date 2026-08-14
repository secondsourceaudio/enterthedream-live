/* =========================================
   SECOND SOURCE
   SRC001 — LIQUID STUDY 001
========================================= */


const canvas =
    document.getElementById("visual");


const container =
    document.getElementById("visual-container");


const fallbackImage =
    document.getElementById("fallback-image");


const interactionMessage =
    document.getElementById("interaction-message");


const audio =
    document.getElementById("experiment-audio");


const soundButton =
    document.getElementById("sound-button");


/* =========================================
   AUDIO
========================================= */

let audioStarted = false;

let userMuted = false;


audio.volume =
    0.7;


/*
   Update the speaker icon.
*/

function updateSoundButton() {

    const muted =
        userMuted
        ||
        audio.muted;


    soundButton.classList.toggle(
        "is-muted",
        muted
    );


    if (muted) {

        soundButton.setAttribute(
            "aria-label",
            "Unmute sound"
        );


        soundButton.setAttribute(
            "title",
            "Unmute sound"
        );

    }

    else {

        soundButton.setAttribute(
            "aria-label",
            "Mute sound"
        );


        soundButton.setAttribute(
            "title",
            "Mute sound"
        );

    }

}


/*
   Try audible autoplay immediately.

   Some browsers allow this.
   Others will reject it until the
   visitor interacts with the page.
*/

async function attemptAutoplay() {

    try {

        audio.muted =
            false;


        await audio.play();


        audioStarted =
            true;


        updateSoundButton();

    }

    catch (error) {

        /*
           Browser blocked audible autoplay.

           Keep the intended state as sound ON,
           but start it on the first interaction.
        */

        audioStarted =
            false;


        console.log(
            "Audible autoplay blocked by browser."
        );

    }

}


/*
   Called after a click/touch if autoplay
   was initially blocked.
*/

async function ensureAudioStarted() {

    if (
        audioStarted
        ||
        userMuted
    ) {

        return;

    }


    try {

        audio.muted =
            false;


        await audio.play();


        audioStarted =
            true;


        updateSoundButton();

    }

    catch (error) {

        console.log(
            "Audio could not start:",
            error
        );

    }

}


/*
   Speaker button.
*/

soundButton.addEventListener(
    "pointerdown",
    function (event) {

        /*
           Prevent this click from also
           creating a visual ripple.
        */

        event.stopPropagation();

    }
);


soundButton.addEventListener(
    "click",
    async function (event) {

        event.stopPropagation();


        if (userMuted) {

            /*
               TURN SOUND ON
            */

            userMuted =
                false;


            audio.muted =
                false;


            try {

                await audio.play();


                audioStarted =
                    true;

            }

            catch (error) {

                console.log(
                    "Audio could not start:",
                    error
                );

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

        }


        updateSoundButton();

    }
);


/*
   Initial visual state:
   speaker is shown as ON.
*/

updateSoundButton();


/*
   Request autoplay as soon as the page loads.
*/

attemptAutoplay();


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


function showFallback() {

    canvas.style.display =
        "none";


    fallbackImage.style.display =
        "block";

}


if (!gl) {

    showFallback();

}


/* =========================================
   WEBGL EXPERIMENT
========================================= */

if (gl) {

    /* =========================================
       VERTEX SHADER
    ========================================== */

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


    /* =========================================
       FRAGMENT SHADER
    ========================================== */

    const fragmentShaderSource = `

        precision mediump float;


        varying vec2 v_uv;


        uniform sampler2D u_texture;

        uniform vec2 u_mouse;

        uniform vec2 u_resolution;

        uniform vec2 u_imageResolution;

        uniform float u_time;

        uniform float u_strength;

        uniform float u_pulse;


        void main() {

            vec2 uv =
                v_uv;


            float screenAspect =
                u_resolution.x
                /
                u_resolution.y;


            float imageAspect =
                u_imageResolution.x
                /
                u_imageResolution.y;


            vec2 imageUV =
                uv;


            /*
               OBJECT-FIT: CONTAIN
            */

            if (
                screenAspect
                >
                imageAspect
            ) {

                float visibleWidth =
                    imageAspect
                    /
                    screenAspect;


                imageUV.x =
                    (
                        uv.x
                        -
                        0.5
                    )
                    /
                    visibleWidth
                    +
                    0.5;

            }

            else {

                float visibleHeight =
                    screenAspect
                    /
                    imageAspect;


                imageUV.y =
                    (
                        uv.y
                        -
                        0.5
                    )
                    /
                    visibleHeight
                    +
                    0.5;

            }


            /*
               BLACK OUTSIDE ARTWORK
            */

            if (
                imageUV.x < 0.0
                ||
                imageUV.x > 1.0
                ||
                imageUV.y < 0.0
                ||
                imageUV.y > 1.0
            ) {

                gl_FragColor =
                    vec4(
                        0.02,
                        0.02,
                        0.02,
                        1.0
                    );

                return;

            }


            /* =====================================
               POINTER
            ===================================== */

            vec2 delta =
                uv
                -
                u_mouse;


            delta.x *=
                screenAspect;


            float distanceFromMouse =
                length(
                    delta
                );


            float influence =
                smoothstep(
                    0.32,
                    0.0,
                    distanceFromMouse
                );


            /* =====================================
               LIQUID WAVES
            ===================================== */

            float wave1 =
                sin(
                    distanceFromMouse
                    *
                    38.0
                    -
                    u_time
                    *
                    4.0
                );


            float wave2 =
                sin(
                    distanceFromMouse
                    *
                    17.0
                    +
                    u_time
                    *
                    2.0
                );


            float wave =
                wave1
                *
                0.65
                +
                wave2
                *
                0.35;


            float distortion =
                wave
                *
                influence
                *
                0.018
                *
                u_strength;


            /* =====================================
               CLICK / TOUCH RIPPLE
            ===================================== */

            float pulseWave =
                sin(
                    distanceFromMouse
                    *
                    50.0
                    -
                    u_pulse
                    *
                    11.0
                );


            float pulseEnvelope =
                exp(
                    -distanceFromMouse
                    *
                    5.0
                );


            distortion +=
                pulseWave
                *
                pulseEnvelope
                *
                0.028
                *
                u_pulse;


            /* =====================================
               DISTORT TEXTURE
            ===================================== */

            vec2 direction =
                normalize(
                    delta
                    +
                    vec2(
                        0.0001,
                        0.0001
                    )
                );


            direction.x /=
                screenAspect;


            imageUV +=
                direction
                *
                distortion;


            /* =====================================
               SUBTLE MOTION
            ===================================== */

            imageUV.x +=
                sin(
                    imageUV.y
                    *
                    9.0
                    +
                    u_time
                    *
                    0.4
                )
                *
                0.0015;


            imageUV.y +=
                sin(
                    imageUV.x
                    *
                    7.0
                    -
                    u_time
                    *
                    0.25
                )
                *
                0.0008;


            /* =====================================
               FINAL IMAGE
            ===================================== */

            vec4 colour =
                texture2D(
                    u_texture,
                    imageUV
                );


            gl_FragColor =
                colour;

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
            gl.createShader(type);


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
                "Shader error:",
                gl.getShaderInfoLog(shader)
            );


            gl.deleteShader(
                shader
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
        !vertexShader
        ||
        !fragmentShader
    ) {

        showFallback();

    }


    /* =========================================
       PROGRAM
    ========================================== */

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
            !gl.getProgramParameter(
                program,
                gl.LINK_STATUS
            )
        ) {

            console.error(
                "Program error:",
                gl.getProgramInfoLog(program)
            );


            showFallback();

        }


        else {

            gl.useProgram(
                program
            );


            /* =====================================
               FULLSCREEN PLANE
            ===================================== */

            const positionBuffer =
                gl.createBuffer();


            gl.bindBuffer(
                gl.ARRAY_BUFFER,
                positionBuffer
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


            const positionLocation =
                gl.getAttribLocation(
                    program,
                    "a_position"
                );


            gl.enableVertexAttribArray(
                positionLocation
            );


            gl.vertexAttribPointer(
                positionLocation,
                2,
                gl.FLOAT,
                false,
                0,
                0
            );


            /* =====================================
               UNIFORMS
            ===================================== */

            const mouseLocation =
                gl.getUniformLocation(
                    program,
                    "u_mouse"
                );


            const resolutionLocation =
                gl.getUniformLocation(
                    program,
                    "u_resolution"
                );


            const imageResolutionLocation =
                gl.getUniformLocation(
                    program,
                    "u_imageResolution"
                );


            const timeLocation =
                gl.getUniformLocation(
                    program,
                    "u_time"
                );


            const strengthLocation =
                gl.getUniformLocation(
                    program,
                    "u_strength"
                );


            const pulseLocation =
                gl.getUniformLocation(
                    program,
                    "u_pulse"
                );


            const textureLocation =
                gl.getUniformLocation(
                    program,
                    "u_texture"
                );


            /* =====================================
               TEXTURE
            ===================================== */

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
                textureLocation,
                0
            );


            /* =====================================
               LOAD DRIP IMAGE
            ===================================== */

            const image =
                new Image();


            image.src =
                "./images/drip_cover_front.jpg";


            let imageLoaded =
                false;


            let textureWidth =
                1;


            let textureHeight =
                1;


            image.onerror =
                function () {

                    console.error(
                        "Could not load drip_cover_front.jpg"
                    );


                    showFallback();

                };


            image.onload =
                function () {

                    /*
                       Resize internally if the
                       artwork exceeds the GPU's
                       safe texture dimensions.
                    */

                    const maximumTextureSize =
                        Math.min(
                            gl.getParameter(
                                gl.MAX_TEXTURE_SIZE
                            ),
                            4096
                        );


                    let width =
                        image.naturalWidth;


                    let height =
                        image.naturalHeight;


                    const longestSide =
                        Math.max(
                            width,
                            height
                        );


                    if (
                        longestSide
                        >
                        maximumTextureSize
                    ) {

                        const scale =
                            maximumTextureSize
                            /
                            longestSide;


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


                    const textureCanvas =
                        document.createElement(
                            "canvas"
                        );


                    textureCanvas.width =
                        width;


                    textureCanvas.height =
                        height;


                    const textureContext =
                        textureCanvas.getContext(
                            "2d"
                        );


                    textureContext.drawImage(
                        image,
                        0,
                        0,
                        width,
                        height
                    );


                    textureWidth =
                        width;


                    textureHeight =
                        height;


                    gl.activeTexture(
                        gl.TEXTURE0
                    );


                    gl.bindTexture(
                        gl.TEXTURE_2D,
                        texture
                    );


                    gl.pixelStorei(
                        gl.UNPACK_FLIP_Y_WEBGL,
                        true
                    );


                    gl.texImage2D(

                        gl.TEXTURE_2D,

                        0,

                        gl.RGBA,

                        gl.RGBA,

                        gl.UNSIGNED_BYTE,

                        textureCanvas

                    );


                    const error =
                        gl.getError();


                    if (
                        error
                        !==
                        gl.NO_ERROR
                    ) {

                        console.error(
                            "WebGL texture error:",
                            error
                        );


                        showFallback();


                        return;

                    }


                    imageLoaded =
                        true;

                };


            /* =====================================
               POINTER STATE
            ===================================== */

            let mouseX =
                0.5;


            let mouseY =
                0.5;


            let targetStrength =
                0;


            let currentStrength =
                0;


            let pulse =
                0;


            let hasInteracted =
                false;


            /* =====================================
               POINTER POSITION
            ===================================== */

            function updatePointer(
                clientX,
                clientY
            ) {

                const rect =
                    container.getBoundingClientRect();


                mouseX =
                    (
                        clientX
                        -
                        rect.left
                    )
                    /
                    rect.width;


                mouseY =
                    1
                    -
                    (
                        clientY
                        -
                        rect.top
                    )
                    /
                    rect.height;


                targetStrength =
                    1;


                if (!hasInteracted) {

                    hasInteracted =
                        true;


                    interactionMessage.classList.add(
                        "is-hidden"
                    );

                }

            }


            /* =====================================
               POINTER EVENTS
            ===================================== */

            container.addEventListener(
                "pointermove",
                function (event) {

                    updatePointer(
                        event.clientX,
                        event.clientY
                    );

                }
            );


            container.addEventListener(
                "pointerenter",
                function () {

                    targetStrength =
                        1;

                }
            );


            container.addEventListener(
                "pointerleave",
                function () {

                    targetStrength =
                        0;

                }
            );


            container.addEventListener(
                "pointerdown",
                function (event) {

                    /*
                       Ignore speaker-button clicks.
                    */

                    if (
                        event.target.closest(
                            ".sound-button"
                        )
                    ) {

                        return;

                    }


                    updatePointer(
                        event.clientX,
                        event.clientY
                    );


                    pulse =
                        1;


                    /*
                       If autoplay was blocked,
                       first interaction starts sound.
                    */

                    ensureAudioStarted();

                }
            );


            /* =====================================
               CANVAS SIZE
            ===================================== */

            function resizeWebGLCanvas() {

                const pixelRatio =
                    Math.min(
                        window.devicePixelRatio || 1,
                        2
                    );


                const width =
                    Math.floor(
                        container.clientWidth
                        *
                        pixelRatio
                    );


                const height =
                    Math.floor(
                        container.clientHeight
                        *
                        pixelRatio
                    );


                if (
                    canvas.width !== width
                    ||
                    canvas.height !== height
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


            window.addEventListener(
                "resize",
                resizeWebGLCanvas
            );


            /* =====================================
               RENDER
            ===================================== */

            const startTime =
                performance.now();


            function render() {

                resizeWebGLCanvas();


                currentStrength +=
                    (
                        targetStrength
                        -
                        currentStrength
                    )
                    *
                    0.06;


                targetStrength *=
                    0.985;


                pulse *=
                    0.94;


                const time =
                    (
                        performance.now()
                        -
                        startTime
                    )
                    /
                    1000;


                if (imageLoaded) {

                    gl.activeTexture(
                        gl.TEXTURE0
                    );


                    gl.bindTexture(
                        gl.TEXTURE_2D,
                        texture
                    );


                    gl.uniform2f(
                        mouseLocation,
                        mouseX,
                        mouseY
                    );


                    gl.uniform2f(
                        resolutionLocation,
                        canvas.width,
                        canvas.height
                    );


                    gl.uniform2f(
                        imageResolutionLocation,
                        textureWidth,
                        textureHeight
                    );


                    gl.uniform1f(
                        timeLocation,
                        time
                    );


                    gl.uniform1f(
                        strengthLocation,
                        currentStrength
                    );


                    gl.uniform1f(
                        pulseLocation,
                        pulse
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