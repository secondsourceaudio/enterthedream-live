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



/* =========================================
   WEBGL
========================================= */

const gl =
    canvas.getContext(
        "webgl",
        {
            antialias: true,
            alpha: false
        }
    );


if (!gl) {

    canvas.style.display =
        "none";

    fallbackImage.style.display =
        "block";

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

        uniform vec2 u_mouse;

        uniform vec2 u_resolution;

        uniform vec2 u_imageResolution;

        uniform float u_time;

        uniform float u_strength;

        uniform float u_pulse;


        void main() {

            vec2 uv =
                v_uv;


            /*
               Match the behaviour of
               object-fit: contain
            */

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


            if (
                screenAspect
                >
                imageAspect
            ) {

                float scale =
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
                    scale
                    +
                    0.5;

            }

            else {

                float scale =
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
                    scale
                    +
                    0.5;

            }


            /*
               Keep the area outside
               the artwork black.
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
               Pointer position
            */

            vec2 mouse =
                u_mouse;


            vec2 delta =
                uv
                -
                mouse;


            delta.x *=
                screenAspect;


            float distanceFromMouse =
                length(
                    delta
                );


            /*
               Area influenced by pointer
            */

            float radius =
                0.32;


            float influence =
                smoothstep(
                    radius,
                    0.0,
                    distanceFromMouse
                );


            /*
               Two overlapping waves make
               the motion less mechanical.
            */

            float waveOne =
                sin(
                    distanceFromMouse
                    *
                    42.0
                    -
                    u_time
                    *
                    4.0
                );


            float waveTwo =
                sin(
                    distanceFromMouse
                    *
                    19.0
                    +
                    u_time
                    *
                    2.2
                );


            float wave =
                waveOne
                *
                0.65
                +
                waveTwo
                *
                0.35;


            /*
               Normal cursor distortion
            */

            float distortion =
                wave
                *
                influence
                *
                0.015
                *
                u_strength;


            /*
               Click / tap ripple
            */

            float pulseWave =
                sin(
                    distanceFromMouse
                    *
                    55.0
                    -
                    u_pulse
                    *
                    10.0
                );


            float pulseEnvelope =
                exp(
                    -distanceFromMouse
                    *
                    6.0
                );


            distortion +=
                pulseWave
                *
                pulseEnvelope
                *
                0.022
                *
                u_pulse;


            /*
               Direction away from pointer
            */

            vec2 direction =
                normalize(
                    delta
                    +
                    vec2(
                        0.0001
                    )
                );


            direction.x /=
                screenAspect;


            imageUV +=
                direction
                *
                distortion;


            /*
               Very subtle constant
               movement in the image.
            */

            imageUV.x +=

                sin(
                    imageUV.y
                    *
                    10.0
                    +
                    u_time
                    *
                    0.35
                )

                *

                0.0012;


            /*
               Read final pixel
            */

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



    /* =========================================
       WEBGL PROGRAM
    ========================================== */

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
            gl.getProgramInfoLog(
                program
            )
        );

    }


    gl.useProgram(
        program
    );



    /* =========================================
       FULLSCREEN PLANE
    ========================================== */

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



    /* =========================================
       UNIFORMS
    ========================================== */

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



    /* =========================================
       TEXTURE
    ========================================== */

    const texture =
        gl.createTexture();


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



    /* =========================================
       DRIP IMAGE
    ========================================== */

    const image =
        new Image();


    image.src =
        "./images/drip_cover_front.jpg";


    let imageLoaded =
        false;


    image.onload =
        function () {

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

                image

            );


            imageLoaded =
                true;

        };



    /* =========================================
       POINTER STATE
    ========================================== */

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



    /* =========================================
       POINTER POSITION
    ========================================== */

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


        if (
            !hasInteracted
        ) {

            hasInteracted =
                true;


            interactionMessage.classList.add(
                "is-hidden"
            );

        }

    }



    /* =========================================
       POINTER EVENTS

       Works with mouse, trackpad,
       touch and stylus.
    ========================================== */

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

            updatePointer(
                event.clientX,
                event.clientY
            );


            pulse =
                1;

        }
    );



    /* =========================================
       CANVAS SIZE
    ========================================== */

    function resizeCanvas() {

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



    window.addEventListener(
        "resize",
        resizeCanvas
    );



    /* =========================================
       ANIMATION
    ========================================== */

    const startTime =
        performance.now();


    function render() {

        resizeCanvas();


        /*
           Smooth interaction response
        */

        currentStrength +=
            (
                targetStrength
                -
                currentStrength
            )
            *
            0.06;


        /*
           Gradually settle after movement
        */

        targetStrength *=
            0.985;


        /*
           Fade click ripple
        */

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


        if (
            imageLoaded
        ) {

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
                image.width,
                image.height
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