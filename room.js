/* A small, original low-poly landscape. Its motions close on a three-minute loop.
 * Audio is optional and comes only from a file the visitor selects on their device.
 */
(() => {
    'use strict';
    const room = document.querySelector('[data-room]');
    if (!room) return;
    const frame = room.querySelector('.room-frame');
    const canvas = room.querySelector('canvas');
    const dock = room.querySelector('.room-dock');
    const audio = room.querySelector('audio');
    const play = room.querySelector('[data-room-play]');
    const motion = room.querySelector('[data-room-motion]');
    const fullscreen = room.querySelector('[data-room-fullscreen]');
    const input = room.querySelector('[data-room-file]');
    const seek = room.querySelector('[data-room-seek]');
    const status = document.querySelector('[data-room-status]');
    const reduced = matchMedia('(prefers-reduced-motion: reduce)');
    const hover = matchMedia('(hover: hover) and (pointer: fine)');
    const inertElements = new Map();
    let moving = !reduced.matches;
    let visible = true;
    let elapsed = 0;
    let last = null;
    let animation = 0;
    let world = null;
    let source = null;
    let immersive = false;
    let controlsTimer = 0;
    let returnFocus = null;

    function createWorld() {
        const gl = canvas.getContext('webgl', {alpha: false, antialias: false});
        if (!gl) throw new Error('WebGL unavailable');
        const fog = [0.57, 0.65, 0.67];
        const objects = [];
        const water = [];
        const dot = (a, b) => a.reduce((n, value, i) => n + value * b[i], 0);
        const subtract = (a, b) => a.map((value, i) => value - b[i]);
        const cross = (a, b) => [a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0]];
        const normalize = a => { const length = Math.hypot(...a) || 1; return a.map(value => value / length); };
        const hash = n => { const value = Math.sin(n * 127.1 + 311.7) * 43758.5453; return value - Math.floor(value); };
        function triangle(a, b, c, color, wind = 0) {
            const normal = normalize(cross(subtract(b, a), subtract(c, a)));
            for (const point of [a, b, c]) objects.push(...point, ...normal, ...color, wind);
        }
        function quad(a, b, c, d, color, wind = 0) {
            triangle(a, b, c, color, wind);
            triangle(a, c, d, color, wind);
        }
        function box(x, y, z, width, height, depth, color) {
            const p = [[-1,0,-1],[1,0,-1],[1,0,1],[-1,0,1],[-1,1,-1],[1,1,-1],[1,1,1],[-1,1,1]]
                .map(([a,b,c]) => [x+a*width/2, y+b*height, z+c*depth/2]);
            for (const face of [[4,7,6,5],[3,2,6,7],[1,0,4,5],[2,1,5,6],[0,3,7,4]]) quad(...face.map(i => p[i]), color);
        }
        function cone(x, y, z, radius, height, color, wind = 0) {
            for (let i = 0; i < 7; i++) {
                const a = i/7*Math.PI*2, b = (i+1)/7*Math.PI*2;
                triangle([x+Math.cos(a)*radius,y,z+Math.sin(a)*radius], [x,y+height,z],
                    [x+Math.cos(b)*radius,y,z+Math.sin(b)*radius], color, wind);
            }
        }
        function tree(x, y, z, size, seed) {
            box(x,y,z,.17*size,1.6*size,.17*size,[.25,.29,.25]);
            for (let tier = 0; tier < 3; tier++) {
                const shade = hash(seed+tier)*.025;
                cone(x,y+size*(.7+tier*.7),z,size*(1.15-tier*.22),size*1.7,
                    [.19+shade,.29+shade,.25+shade], .018*(tier+1));
            }
        }
        function island(cx, cz, rx, rz, height, seed) {
            const segments = 24, rings = 5;
            const surface = (x, z) => {
                const r = Math.min(1, Math.hypot((x-cx)/rx,(z-cz)/rz));
                return height*Math.pow(Math.max(0,1-r*r),1.2)-.3;
            };
            const point = (ring, segment) => {
                const angle = segment/segments*Math.PI*2;
                const radius = ring/rings*(.94+.08*hash(segment+seed));
                const x = cx+Math.cos(angle)*rx*radius, z = cz+Math.sin(angle)*rz*radius;
                return [x,surface(x,z)+(ring === 0 ? 0 : (hash(seed+segment*11+ring)-.5)*.26),z];
            };
            for (let ring = 0; ring < rings; ring++) for (let i = 0; i < segments; i++) {
                const next = (i+1)%segments;
                const shade = (hash(seed+ring*29+i)-.5)*.045;
                const color = ring >= rings-1 ? [.40+shade,.43+shade,.36+shade] : [.30+shade,.39+shade,.30+shade];
                const a=point(ring,i), b=point(ring+1,i), c=point(ring+1,next), d=point(ring,next);
                triangle(a,c,b,color);
                if (ring) triangle(a,d,c,color);
            }
            return surface;
        }
        const near = island(-28,1,28,31,4.6,7);
        const centre = island(0,-32,8,6,2.8,31);
        const back = island(-33,-64,25,10,4.5,52);
        const right = island(38,-78,32,12,6,78);
        for (let i=0;i<24;i++) {
            const x=-53+i*1.75, z=-64+(hash(i*3)-.5)*8;
            tree(x,back(x,z),z,.75+hash(i)*.8,i+200);
        }
        for (let i=0;i<19;i++) {
            const x=15+i*2.1, z=-79+(hash(i+14)-.5)*9;
            tree(x,right(x,z),z,.8+hash(i+9)*.9,i+300);
        }
        for (const [x,z,size] of [[-16,1,2],[-19,-8,1.7],[-12,-7,1.45],[-23,12,2.8],[-6,-32,1.2],[4,-34,1.0]]) {
            tree(x,(z < -25 ? centre : near)(x,z),z,size,Math.round(x*17-z));
        }
        // A weathered arch gives the scene scale, without a moving character.
        const stone = [.65,.67,.57], base = centre(0,-32)+.1, archY=base+2.65;
        box(0,base-.25,-32,5.8,.35,2.4,[.48,.53,.44]);
        box(-2,base,-32,.55,2.65,.72,stone);
        box(2,base,-32,.55,2.65,.72,stone);
        for (let i=0;i<11;i++) {
            const a=i/11*Math.PI, b=(i+1)/11*Math.PI;
            const p=(r,angle,z)=>[Math.cos(angle)*r,archY+Math.sin(angle)*r,-32+z];
            quad(p(2.28,a,.36),p(1.72,a,.36),p(1.72,b,.36),p(2.28,b,.36),stone);
            quad(p(2.28,b,-.36),p(1.72,b,-.36),p(1.72,a,-.36),p(2.28,a,-.36),stone);
            quad(p(2.28,a,-.36),p(2.28,a,.36),p(2.28,b,.36),p(2.28,b,-.36),stone);
            quad(p(1.72,b,-.36),p(1.72,b,.36),p(1.72,a,.36),p(1.72,a,-.36),stone);
        }
        box(4.2,centre(4.2,-31),-31,.7,1.15,.7,[.53,.58,.48]);
        // Quiet foreground details: a short pier and simple shoreline rocks.
        for (let i=0;i<19;i++) box(-3.5,1.0,6-i*.65,2.1,.1,.57,[.34+hash(i)*.04,.36+hash(i)*.04,.31]);
        for (const z of [6,1,-5]) for (const x of [-4.4,-2.6]) box(x,-.4,z,.16,1.75,.16,[.28,.32,.28]);
        for (const [x,z,r,h] of [[-8,-4,1.2,1],[-9,5,1.6,1.4],[7,-30,1,.8],[-5,-26,.6,.8]]) {
            cone(x,-.15,z,r,h,[.38,.43,.38]);
        }
        for (let i=0;i<12;i++) {
            const x=-132+i*24;
            const height=9+hash(i+60)*15;
            triangle([x-25,-1,-132],[x,height,-137],[x+29,-1,-133],[.41,.50,.51]);
        }
        // Repeating water geometry is intentionally modest for phone GPUs.
        const wx=40, wz=44;
        for (let z=0;z<wz;z++) for (let x=0;x<wx;x++) {
            const p=(a,b)=>[-130+a/wx*260,-178+b/wz*205];
            water.push(...p(x,z),...p(x+1,z+1),...p(x+1,z),...p(x,z),...p(x,z+1),...p(x+1,z+1));
        }
        function compile(vertex, fragment) {
            const program=gl.createProgram();
            for (const [type,source] of [[gl.VERTEX_SHADER,vertex],[gl.FRAGMENT_SHADER,fragment]]) {
                const shader=gl.createShader(type);
                gl.shaderSource(shader,source);
                gl.compileShader(shader);
                if (!gl.getShaderParameter(shader,gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(shader));
                gl.attachShader(program,shader);
                gl.deleteShader(shader);
            }
            gl.linkProgram(program);
            if (!gl.getProgramParameter(program,gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program));
            return {program, attributes:{}, uniforms:{}};
        }
        const common=`
            precision highp float;
            uniform float u_phase;
            uniform vec3 u_eye;
            uniform vec3 u_fog;
            uniform float u_aspect;
            float grain(vec2 p) { return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453); }
            vec3 finish(vec3 color) {
                float d=fract(dot(floor(gl_FragCoord.xy),vec2(.754877,.56984)))-.5;
                return floor(clamp(color+d/100.,0.,1.)*63.+.5)/63.;
            }
        `;
        const sky=compile(`
            attribute vec2 a_position; varying vec2 v_uv;
            void main() { v_uv=a_position*.5+.5; gl_Position=vec4(a_position,0.,1.); }
        `,common+`
            varying vec2 v_uv;
            float noise(vec2 p) {
                vec2 a=floor(p), b=fract(p); b=b*b*(3.-2.*b);
                return mix(mix(grain(a),grain(a+vec2(1,0)),b.x),mix(grain(a+vec2(0,1)),grain(a+1.),b.x),b.y);
            }
            void main() {
                vec3 color=mix(vec3(.68,.71,.69),vec3(.35,.45,.56),smoothstep(.3,1.,v_uv.y));
                float clouds=noise(v_uv*vec2(5.,15.)+vec2(sin(u_phase)*.28,cos(u_phase)*.035));
                color+=smoothstep(.51,.78,clouds)*.055*smoothstep(.55,.7,v_uv.y);
                color+=vec3(.045,.018,.01)*exp(-pow((v_uv.y-.52)*9.,2.));
                float moon=1.-smoothstep(.015,.018,length((v_uv-vec2(.76,.82))*vec2(u_aspect,1.)));
                color=mix(color,vec3(.85,.85,.74),moon*.64);
                gl_FragColor=vec4(finish(color),1.);
            }
        `);
        const land=compile(`
            attribute vec3 a_position; attribute vec3 a_normal; attribute vec3 a_color; attribute float a_wind;
            uniform mat4 u_matrix; uniform float u_phase; uniform float u_reflect;
            varying vec3 v_world; varying vec3 v_normal; varying vec3 v_color;
            void main() {
                vec3 p=a_position;
                p.x+=sin(u_phase*2.+p.z*.4)*a_wind;
                p.y=mix(p.y,-p.y-.1,u_reflect);
                v_world=p; v_normal=a_normal; v_color=a_color;
                gl_Position=u_matrix*vec4(p,1.);
            }
        `,common+`
            varying vec3 v_world; varying vec3 v_normal; varying vec3 v_color; uniform float u_reflect;
            void main() {
                float light=.66+.34*max(0.,dot(normalize(v_normal),normalize(vec3(-.45,.8,.3))));
                float texture=(grain(floor(v_world.xz*3.))- .5)*.025;
                vec3 color=v_color*light+texture;
                float fog=1.-exp(-length(v_world-u_eye)*.014);
                color=mix(color,u_fog,clamp(fog,0.,.97));
                color=mix(color,u_fog,.25*u_reflect);
                gl_FragColor=vec4(finish(color),1.);
            }
        `);
        const sea=compile(`
            attribute vec2 a_position; uniform mat4 u_matrix; uniform float u_phase;
            varying vec3 v_world;
            void main() {
                float y=sin(a_position.x*.43+a_position.y*.28+u_phase*5.)*.025;
                y+=sin(a_position.x*.2-a_position.y*.32+u_phase*3.)*.018;
                v_world=vec3(a_position.x,y,a_position.y);
                gl_Position=u_matrix*vec4(v_world,1.);
            }
        `,common+`
            varying vec3 v_world;
            void main() {
                float distance=length(v_world-u_eye);
                float ripple=sin(v_world.x*.65+v_world.z*.43+u_phase*5.);
                ripple+=sin(v_world.x*.21-v_world.z*.54+u_phase*3.)*.6;
                vec3 color=mix(vec3(.27,.40,.40),u_fog,1.-exp(-distance*.018));
                color+=ripple*.009;
                float sheen=pow(max(0.,sin(v_world.x*.08-v_world.z*.03+u_phase)),12.)*.025;
                color+=sheen*exp(-distance*.008);
                gl_FragColor=vec4(finish(color),.86);
            }
        `);
        function buffer(data) {
            const value=gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER,value);
            gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(data),gl.STATIC_DRAW); return value;
        }
        const skyBuffer=buffer([-1,-1,1,-1,-1,1,-1,1,1,-1,1,1]);
        const landBuffer=buffer(objects), waterBuffer=buffer(water);
        function attribute(pass, name, size, stride, offset) {
            if (!(name in pass.attributes)) pass.attributes[name]=gl.getAttribLocation(pass.program,name);
            const location=pass.attributes[name];
            if (location < 0) return;
            gl.enableVertexAttribArray(location);
            gl.vertexAttribPointer(location,size,gl.FLOAT,false,stride*4,offset*4);
        }
        function uniform(pass,name) {
            if (!(name in pass.uniforms)) pass.uniforms[name]=gl.getUniformLocation(pass.program,name);
            return pass.uniforms[name];
        }
        function use(pass,phase,eye,matrix) {
            gl.useProgram(pass.program);
            gl.uniform1f(uniform(pass,'u_phase'),phase);
            gl.uniform3fv(uniform(pass,'u_eye'),eye);
            gl.uniform3fv(uniform(pass,'u_fog'),fog);
            gl.uniform1f(uniform(pass,'u_aspect'),canvas.width/canvas.height);
            if (matrix) gl.uniformMatrix4fv(uniform(pass,'u_matrix'),false,matrix);
        }
        function multiply(a,b) {
            const out=new Float32Array(16);
            for (let c=0;c<4;c++) for (let r=0;r<4;r++) for (let k=0;k<4;k++) out[c*4+r]+=a[k*4+r]*b[c*4+k];
            return out;
        }
        function camera(eye,aspect) {
            const z=normalize(subtract(eye,[0,2.15,-32])), x=normalize(cross([0,1,0],z)), y=cross(z,x);
            const view=new Float32Array([x[0],y[0],z[0],0,x[1],y[1],z[1],0,x[2],y[2],z[2],0,-dot(x,eye),-dot(y,eye),-dot(z,eye),1]);
            const f=1/Math.tan(55*Math.PI/360), n=.1, far=260;
            const projection=new Float32Array([f/aspect,0,0,0,0,f,0,0,0,0,(far+n)/(n-far),-1,0,0,2*far*n/(n-far),0]);
            return multiply(projection,view);
        }
        function geometry(phase,eye,matrix,reflect) {
            use(land,phase,eye,matrix);
            gl.uniform1f(uniform(land,'u_reflect'),reflect);
            gl.bindBuffer(gl.ARRAY_BUFFER,landBuffer);
            attribute(land,'a_position',3,10,0); attribute(land,'a_normal',3,10,3);
            attribute(land,'a_color',3,10,6); attribute(land,'a_wind',1,10,9);
            gl.drawArrays(gl.TRIANGLES,0,objects.length/10);
        }
        function draw(seconds) {
            const size=frame.getBoundingClientRect();
            if (size.width < 1 || size.height < 1) return;
            const scale=Math.min(1,640/size.width,480/size.height);
            const width=Math.max(1,Math.round(size.width*scale)), height=Math.max(1,Math.round(size.height*scale));
            if (canvas.width !== width || canvas.height !== height) { canvas.width=width; canvas.height=height; }
            gl.viewport(0,0,width,height);
            const phase=(seconds%180)/180*Math.PI*2;
            const eye=[Math.sin(phase)*.08,5.1+Math.sin(phase*2)*.035,15];
            const matrix=camera(eye,size.width/size.height);
            gl.disable(gl.BLEND); gl.disable(gl.DEPTH_TEST);
            gl.clearColor(...fog,1); gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);
            use(sky,phase,eye);
            gl.bindBuffer(gl.ARRAY_BUFFER,skyBuffer); attribute(sky,'a_position',2,2,0);
            gl.drawArrays(gl.TRIANGLES,0,6);
            gl.enable(gl.DEPTH_TEST);
            geometry(phase,eye,matrix,1);
            use(sea,phase,eye,matrix);
            gl.bindBuffer(gl.ARRAY_BUFFER,waterBuffer); attribute(sea,'a_position',2,2,0);
            gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA);
            gl.drawArrays(gl.TRIANGLES,0,water.length/2);
            gl.disable(gl.BLEND);
            geometry(phase,eye,matrix,0);
        }
        return {draw};
    }

    function isRunning() { return moving && (!source || !audio.paused); }
    function updateControls() {
        const playing=source ? !audio.paused : moving;
        play.disabled=!source && !world;
        motion.disabled=!world;
        play.setAttribute('aria-pressed',String(playing));
        play.setAttribute('aria-label',(playing ? 'Pause ' : 'Play ')+(source ? 'mix' : 'scenery'));
        play.querySelector('[data-room-pause]').hidden=!playing;
        play.querySelector('[data-room-start]').hidden=playing;
        motion.textContent=moving ? 'MOTION ON' : 'MOTION OFF';
        motion.setAttribute('aria-pressed',String(moving));
        motion.hidden=!source;
        reconcile();
    }
    function tick(now) {
        animation=0;
        if (!world || !visible || document.hidden || !isRunning()) { last=null; return; }
        if (last !== null && now-last < 1000/30) { animation=requestAnimationFrame(tick); return; }
        if (last !== null) elapsed+=Math.min((now-last)/1000,.1);
        last=now;
        world.draw(elapsed);
        animation=requestAnimationFrame(tick);
    }
    function reconcile() {
        if (!world || !visible || document.hidden || !isRunning()) {
            cancelAnimationFrame(animation); animation=0; last=null;
        } else if (!animation) { last=null; animation=requestAnimationFrame(tick); }
    }
    function initialize() {
        try {
            world=createWorld(); world.draw(elapsed);
            room.classList.add('has-scene'); canvas.dataset.renderState='ready';
        } catch {
            world=null; moving=false; motion.disabled=true; canvas.dataset.renderState='fallback';
            status.textContent='Your browser is showing a still scene. You can still open a mix to listen.';
        }
        room.classList.add('is-ready');
        document.querySelector('[data-room-still]').hidden=true;
        document.querySelector('[data-room-help]').hidden=false;
        updateControls();
    }
    async function togglePlay() {
        if (!source) { moving=!moving; updateControls(); return; }
        if (!audio.paused) { audio.pause(); return; }
        try { await audio.play(); status.textContent=''; }
        catch { status.textContent='The audio could not start. Try Play again or choose another file.'; }
    }
    play.addEventListener('click',togglePlay);
    motion.addEventListener('click',()=>{ moving=!moving; updateControls(); });
    reduced.addEventListener('change',()=>{ moving=!reduced.matches; updateControls(); });
    const format=seconds=>{
        const value=Math.max(0,Math.floor(Number.isFinite(seconds) ? seconds : 0));
        return Math.floor(value/60)+':'+String(value%60).padStart(2,'0');
    };
    function timeline() {
        const ready=source && Number.isFinite(audio.duration) && audio.duration > 0;
        seek.disabled=!ready; seek.hidden=!ready;
        if (ready) {
            seek.max=audio.duration; seek.value=audio.currentTime;
            seek.setAttribute('aria-valuetext',format(audio.currentTime)+' of '+format(audio.duration));
        }
        room.querySelector('[data-room-time]').textContent=format(audio.currentTime)+(ready ? ' / '+format(audio.duration) : '');
    }
    input.addEventListener('change',()=>{
        const file=input.files[0];
        if (!file) return;
        audio.pause();
        if (source) URL.revokeObjectURL(source);
        source=URL.createObjectURL(file);
        audio.src=source; audio.preload='metadata'; audio.load();
        room.querySelector('.room-track').hidden=false;
        room.querySelector('[data-room-track]').textContent=file.name.replace(/\.[^.]+$/,'');
        status.textContent='Mix opened. Select Play to listen.';
        timeline(); updateControls();
    });
    for (const event of ['play','pause','ended']) audio.addEventListener(event,updateControls);
    for (const event of ['loadedmetadata','durationchange','timeupdate']) audio.addEventListener(event,timeline);
    audio.addEventListener('error',()=>{ status.textContent='This audio file could not play. Choose another audio file.'; });
    seek.addEventListener('input',()=>{ if (!seek.disabled) audio.currentTime=Number(seek.value); });

    function revealControls() {
        clearTimeout(controlsTimer); room.classList.remove('controls-hidden');
        if (!immersive) return;
        controlsTimer=setTimeout(()=>{
            if ((hover.matches && dock.matches(':hover')) || (dock.contains(document.activeElement) && document.activeElement.matches(':focus-visible'))) {
                revealControls(); return;
            }
            room.classList.add('controls-hidden');
        },3000);
    }
    function setFullscreen(enabled) {
        if (enabled === immersive) return;
        immersive=enabled; room.classList.toggle('is-fullscreen',enabled);
        document.body.classList.toggle('room-fullscreen',enabled);
        fullscreen.setAttribute('aria-pressed',String(enabled));
        fullscreen.setAttribute('aria-label',enabled ? 'Exit fullscreen' : 'Enter fullscreen');
        fullscreen.textContent=enabled ? 'EXIT FULLSCREEN' : 'FULLSCREEN';
        if (enabled) {
            for (const element of document.body.children) {
                if (element.contains(room) || element.tagName === 'SCRIPT') continue;
                inertElements.set(element,element.inert); element.inert=true;
            }
            frame.focus({preventScroll:true});
            clearTimeout(controlsTimer); room.classList.add('controls-hidden');
        } else {
            for (const [element,inert] of inertElements) element.inert=inert;
            inertElements.clear(); clearTimeout(controlsTimer); room.classList.remove('controls-hidden');
            if (returnFocus?.isConnected) returnFocus.focus({preventScroll:true});
        }
        world?.draw(elapsed);
    }
    async function leaveFullscreen() {
        if (document.fullscreenElement === room) {
            try { await document.exitFullscreen(); } catch { setFullscreen(false); }
        } else setFullscreen(false);
    }
    fullscreen.addEventListener('click',async()=>{
        if (immersive) { await leaveFullscreen(); return; }
        returnFocus=document.activeElement;
        if (room.requestFullscreen) {
            try { await room.requestFullscreen(); return; } catch { /* Use the in-page view. */ }
        }
        setFullscreen(true);
    });
    document.addEventListener('fullscreenchange',()=>setFullscreen(document.fullscreenElement === room));
    for (const event of ['pointerdown','pointermove','keydown','focusin']) room.addEventListener(event,revealControls);
    room.addEventListener('keydown',event=>{
        if (event.defaultPrevented || event.repeat || event.ctrlKey || event.metaKey || event.altKey ||
            event.target.closest('input,textarea,select,[contenteditable="true"]')) return;
        const key=event.key.toLowerCase();
        if (key === 'escape' && immersive) { event.preventDefault(); leaveFullscreen(); }
        else if (key === 'f') { event.preventDefault(); fullscreen.click(); }
        else if (key === 'p' || (key === ' ' && event.target === frame)) { event.preventDefault(); togglePlay(); }
        else if (key === 'tab' && immersive) {
            const controls=[frame,...dock.querySelectorAll('button')].filter(node=>node.getClientRects().length);
            const first=controls[0], lastControl=controls[controls.length-1];
            if (event.shiftKey && document.activeElement === first) { event.preventDefault(); lastControl.focus(); }
            else if (!event.shiftKey && document.activeElement === lastControl) { event.preventDefault(); first.focus(); }
        }
    });
    new IntersectionObserver(entries=>{ visible=entries[0].isIntersecting; reconcile(); }).observe(frame);
    new ResizeObserver(()=>world?.draw(elapsed)).observe(frame);
    document.addEventListener('visibilitychange',reconcile);
    canvas.addEventListener('webglcontextlost',event=>{
        event.preventDefault(); world=null; room.classList.remove('has-scene');
        canvas.dataset.renderState='fallback'; updateControls();
    });
    canvas.addEventListener('webglcontextrestored',initialize);
    window.addEventListener('pagehide',()=>{ audio.pause(); cancelAnimationFrame(animation); animation=0; last=null; });
    window.addEventListener('pageshow',reconcile);
    initialize();
})();
