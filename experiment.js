/* =========================================
   SECOND SOURCE
   SRC001 — LIQUID STUDY 001
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

   Kept completely separate from WebGL.
========================================= */

let soundRequested =
    true;


/*
   Update the icon according to what is
   ACTUALLY happening, not just what we
   requested.
*/

function updateSoundIcon() {

    const audible =
        soundRequested
        &&
        !audio.paused
        &&
        !audio.muted;


    soundButton.classList.toggle(
        "is-muted",
        !audible
    );


    if (audible) {

        soundButton.setAttribute(
            "aria-label",
            "Mute sound"
        );

        soundButton.setAttribute(
            "title",
            "Mute sound"
        );

    }

    else {

        soundButton.setAttribute(
            "aria-label",
            "Play sound"
        );

        soundButton.setAttribute(
            "title",
            "Play sound"
        );

    }

}


/*
   Attempt to start the music.

   This works immediately when the browser
   permits autoplay, and after a user gesture
   when autoplay was blocked.
*/

function startSound() {

    if (!soundRequested) {

        return;

    }


    audio.muted =
        false;


    const promise =
        audio.play();


    if (promise !== undefined) {

        promise
            .then(function () {

                updateSoundIcon();

            })
            .catch(function () {

                /*
                   Audible autoplay was blocked.

                   This isn't an error in the site;
                   first click/touch will retry it.
                */

                updateSoundIcon();

            });

    }

}


/*
   SOUND BUTTON

   This intentionally does not rely on any
   WebGL state.
*/

soundButton.addEventListener(
    "click",
    function (event) {

        event.preventDefault();

        event.stopPropagation();


        const currentlyAudible =
            !audio.paused
            &&
            !audio.muted;


        if (currentlyAudible) {

            /*
               MUTE
            */

            soundRequested =
                false;


            audio.muted =
                true;


            updateSoundIcon();

        }

        else {

            /*
               UNMUTE / START
            */

            soundRequested =
                true;


            audio.muted =
                false;


            const promise =
                audio.play();


            if (promise !== undefined) {

                promise
                    .then(
                        updateSoundIcon
                    )
                    .catch(
                        updateSoundIcon
                    );

            }

        }

    }
);


audio.addEventListener(
    "play",
    updateSoundIcon
);


audio.addEventListener(
    "pause",
    updateSoundIcon
);


audio.addEventListener(
    "volumechange",
    updateSoundIcon
);


/*
   Try autoplay immediately.
*/

startSound();

updateSoundIcon();


/*
   If autoplay was blocked, the first click
   or touch anywhere on the experiment starts
   the track.

   Muting with the speaker disables this,
   because soundRequested becomes false.
*/

document.addEventListener(
    "pointerdown",
    function (event) {

        if (
            event.target.closest(
                "#sound-button"
            )
        ) {

            return;

        }


        if (
            soundRequested
            &&
            (
                audio.paused
                ||
                audio.muted
            )
        ) {

            startSound();

        }

    },
    true
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
   WEBGL PROGRAM
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

        uniform vec2 u_mouse;

        uniform vec2 u_resolution;

        uniform vec2 u_imageResolution;

        uniform vec2 u_pointerVelocity;

        uniform float u_time;

        uniform float u_strength;

        uniform float u_motion;

        uniform float u_pulseAge;


        void main() {

            vec2 uv =
                v_uv;


            float screenAspect =
                u_resolution.x
                /
                u_resolution.y;


            /*
               =================================
               GLOBAL LIQUID FLOW
               =================================
            */


            float flowA =
                sin(
                    uv.y
                    *
                    11.0
                    +
                    u_time
                    *
                    0.75
                    +
                    sin(
                        uv.x
                        *
                        7.0
                        -
                        u_time
                        *
                        0.35
                    )
                );


            float flowB =
                cos(
                    uv.x
                    *
                    9.0
                    -
                    u_time
                    *
                    0.55
                    +
                    sin(
                        uv.y
                        *
                        6.0
                        +
                        u_time
                        *
                        0.25
                    )
                );


            vec2 flow =
                vec2(
                    flowA,
                    flowB
                );


            vec2 warpedUV =
                uv;


            /*
               Calm when idle, much more fluid
               while the pointer is moving.
            */

            warpedUV +=
                flow
                *
                (
                    0.0015
                    +
                    u_strength
                    *
                    0.008
                    +
                    u_motion
                    *
                    0.022
                );


            /*
               =================================
               POINTER FIELD
               =================================
            */


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
                    0.40,
                    0.0,
                    distanceFromMouse
                );


            /*
               =================================
               SWIRL
               =================================
            */


            float swirlAngle =
                influence
                *
                (
                    u_strength
                    *
                    0.75
                    +
                    u_motion
                    *
                    2.8
                );


            float cosineAngle =
                cos(
                    swirlAngle
                );


            float sineAngle =
                sin(
                    swirlAngle
                );


            mat2 rotation =
                mat2(
                    cosineAngle,
                    -sineAngle,
                    sineAngle,
                    cosineAngle
                );


            vec2 rotatedDelta =
                rotation
                *
                delta;


            vec2 swirlOffset =
                rotatedDelta
                -
                delta;


            swirlOffset.x /=
                screenAspect;


            warpedUV +=
                swirlOffset
                *
                0.55;


            /*
               =================================
               POINTER DRAG

               Fast movement pulls the image
               behind the cursor.
               =================================
            */


            warpedUV -=
                u_pointerVelocity
                *
                influence
                *
                (
                    0.15
                    +
                    u_motion
                    *
                    0.5
                );


            /*
               =================================
               ACTIVE WAVES
               =================================
            */


            float waveOne =
                sin(
                    distanceFromMouse
                    *
                    55.0
                    -
                    u_time
                    *
                    8.0
                );


            float waveTwo =
                sin(
                    distanceFromMouse
                    *
                    24.0
                    +
                    u_time
                    *
                    4.0
                );


            float activeWave =
                (
                    waveOne
                    *
                    0.65
                    +
                    waveTwo
                    *
                    0.35
                )
                *
                influence;


            vec2 radialDirection =
                normalize(
                    delta
                    +
                    vec2(
                        0.0001
                    )
                );


            radialDirection.x /=
                screenAspect;


            warpedUV +=
                radialDirection
                *
                activeWave
                *
                (
                    0.004
                    +
                    u_motion
                    *
                    0.018
                );


            /*
               =================================
               CLICK / TOUCH RIPPLE

               Ripple travels outward instead
               of simply vibrating in place.
               =================================
            */


            float pulseLife =
                max(
                    0.0,
                    1.0
                    -
                    u_pulseAge
                    /
                    2.2
                );


            float pulseRadius =
                u_pulseAge
                *
                0.32;


            float pulseRing =
                exp(
                    -abs(
                        distanceFromMouse
                        -
                        pulseRadius
                    )
                    *
                    70.0
                )
                *
                pulseLife;


            warpedUV +=
                radialDirection
                *
                pulseRing
                *
                0.045;


            /*
               =================================
               OBJECT-FIT: CONTAIN
               =================================
            */


            float imageAspect =
                u_imageResolution.x
                /
                u_imageResolution.y;


            vec2 imageUV =
                warpedUV;


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
                        warpedUV.x
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
                        warpedUV.y
                        -
                        0.5
                    )
                    /
                    visibleHeight
                    +
                    0.5;

            }


            /*
               Black outside the image.
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


            /*
               =================================
               CHROMATIC LIQUID SEPARATION

               Very subtle while idle, stronger
               during quick movement.
               =================================
            */


            vec2 chromaticOffset =
                flow
                *
                (
                    0.0005
                    +
                    u_motion
                    *
                    0.0028
                );


            vec2 safeUV =
                clamp(
                    imageUV,
                    vec2(
                        0.002
                    ),
                    vec2(
                        0.998
                    )
                );


            float red =
                texture2D(
                    u_texture,
                    clamp(
                        safeUV
                        +
                        chromaticOffset,
                        vec2(0.002),
                        vec2(0.998)
                    )
                ).r;


            float green =
                texture2D(
                    u_texture,
                    safeUV
                ).g;


            float blue =
                texture2D(
                    u_texture,
                    clamp(
                        safeUV
                        -
                        chromaticOffset,
                        vec2(0.002),
                        vec2(0.998)
                    )
                ).b;


            gl_FragColor =
                vec4(
                    red,
                    green,
                    blue,
                    1.0
                );

        }

    `;


    /* =========================================
       SHADER COMPILATION
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


            /* =====================================
               PLANE
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


            const velocityLocation =
                gl.getUniformLocation(
                    program,
                    "u_pointerVelocity"
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


            const motionLocation =
                gl.getUniformLocation(
                    program,
                    "u_motion"
                );


            const pulseAgeLocation =
                gl.getUniformLocation(
                    program,
                    "u_pulseAge"
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
               LOAD ARTWORK
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


            image.onload =
                function () {

                    /*
                       Resize the print-resolution
                       source internally.

                       Your JPG itself is unchanged.
                    */

                    const maxSize =
                        Math.min(
                            gl.getParameter(
                                gl.MAX_TEXTURE_SIZE
                            ),
                            2048
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
                        maxSize
                    ) {

                        const scale =
                            maxSize
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


                    textureWidth =
                        width;


                    textureHeight =
                        height;


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


                    imageLoaded =
                        true;


                    canvas.classList.add(
                        "is-ready"
                    );

                };


            image.onerror =
                function () {

                    console.error(
                        "DRIP image failed to load."
                    );

            };


            /* =====================================
               POINTER / TOUCH STATE
            ===================================== */

            let pointerX =
                0.5;


            let pointerY =
                0.5;


            let targetStrength =
                0;


            let strength =
                0;


            let targetVelocityX =
                0;


            let targetVelocityY =
                0;


            let velocityX =
                0;


            let velocityY =
                0;


            let targetMotion =
                0;


            let motion =
                0;


            let pulseStarted =
                -10000;


            let hasInteracted =
                false;


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


            /* =====================================
               UPDATE POINTER

               Works for mouse and touch.
            ===================================== */

            function updatePointer(
                clientX,
                clientY
            ) {

                const rect =
                    container
                        .getBoundingClientRect();


                const newX =
                    (
                        clientX
                        -
                        rect.left
                    )
                    /
                    rect.width;


                const newY =
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
                    newX
                    -
                    pointerX;


                const deltaY =
                    newY
                    -
                    pointerY;


                pointerX =
                    newX;


                pointerY =
                    newY;


                targetVelocityX =
                    clamp(
                        deltaX
                        *
                        2.8,
                        -0.08,
                        0.08
                    );


                targetVelocityY =
                    clamp(
                        deltaY
                        *
                        2.8,
                        -0.08,
                        0.08
                    );


                targetMotion =
                    Math.min(
                        1,
                        Math.hypot(
                            deltaX,
                            deltaY
                        )
                        *
                        40
                    );


                targetStrength =
                    1;


                if (!hasInteracted) {

                    hasInteracted =
                        true;


                    interactionMessage
                        .classList
                        .add(
                            "is-hidden"
                        );

                }

            }


            /* =====================================
               POINTER / TOUCH EVENTS
            ===================================== */

            container.addEventListener(
                "pointerdown",
                function (event) {

                    if (
                        event.target.closest(
                            "#sound-button"
                        )
                    ) {

                        return;

                    }


                    /*
                       Keeps finger movement attached
                       to the artwork on mobile.
                    */

                    try {

                        container
                            .setPointerCapture(
                                event.pointerId
                            );

                    }

                    catch (error) {
                    }


                    updatePointer(
                        event.clientX,
                        event.clientY
                    );


                    pulseStarted =
                        performance.now();

                }
            );


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
                "pointerleave",
                function () {

                    targetStrength =
                        0;

                }
            );


            /* =====================================
               RESIZE
            ===================================== */

            function resizeCanvas() {

                const pixelRatio =
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
                        pixelRatio
                    );


                const height =
                    Math.floor(
                        container.clientHeight
                        *
                        pixelRatio
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


            /* =====================================
               ANIMATION
            ===================================== */

            const startTime =
                performance.now();


            function render() {

                resizeCanvas();


                /*
                   Smooth everything rather than
                   making it snap to the pointer.
                */

                strength +=
                    (
                        targetStrength
                        -
                        strength
                    )
                    *
                    0.08;


                velocityX +=
                    (
                        targetVelocityX
                        -
                        velocityX
                    )
                    *
                    0.2;


                velocityY +=
                    (
                        targetVelocityY
                        -
                        velocityY
                    )
                    *
                    0.2;


                motion +=
                    (
                        targetMotion
                        -
                        motion
                    )
                    *
                    0.15;


                /*
                   Motion trails decay gradually.
                */

                targetVelocityX *=
                    0.82;


                targetVelocityY *=
                    0.82;


                targetMotion *=
                    0.88;


                targetStrength *=
                    0.992;


                const now =
                    performance.now();


                const time =
                    (
                        now
                        -
                        startTime
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
                        pointerX,
                        pointerY
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


                    gl.uniform2f(
                        velocityLocation,
                        velocityX,
                        velocityY
                    );


                    gl.uniform1f(
                        timeLocation,
                        time
                    );


                    gl.uniform1f(
                        strengthLocation,
                        strength
                    );


                    gl.uniform1f(
                        motionLocation,
                        motion
                    );


                    gl.uniform1f(
                        pulseAgeLocation,
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

        else {

            console.error(
                gl.getProgramInfoLog(
                    program
                )
            );

        }

    }

}