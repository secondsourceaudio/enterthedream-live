/* Original, quietly looping low-poly scenes for the listening room. */
(() => {
    'use strict';
    function createScene(kind, canvas, frame) {
        const gl = canvas.getContext('webgl', {alpha: false, antialias: false});
        if (!gl) throw new Error('WebGL unavailable');
        const night = kind === 'city';
        const fog = night ? [.045, .051, .085] : [.49, .31, .32];
        const lights = [];
        const objects = [];
        const water = [];
        const dot = (a, b) => a.reduce((n, value, i) => n + value * b[i], 0);
        const subtract = (a, b) => a.map((value, i) => value - b[i]);
        const cross = (a, b) => [a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0]];
        const normalize = a => { const length = Math.hypot(...a) || 1; return a.map(value => value / length); };
        const hash = n => { const value = Math.sin(n * 127.1 + 311.7) * 43758.5453; return value - Math.floor(value); };
        function triangle(a, b, c, color, wind = 0, glow = 0, material = 0) {
            const normal = normalize(cross(subtract(b, a), subtract(c, a)));
            for (const point of [a, b, c]) objects.push(...point, ...normal, ...color, wind, glow, material);
        }
        function quad(a, b, c, d, color, wind = 0, glow = 0, material = 0) {
            triangle(a, b, c, color, wind, glow, material);
            triangle(a, c, d, color, wind, glow, material);
        }
        function box(x, y, z, width, height, depth, color, glow = 0, material = 0) {
            const p = [[-1,0,-1],[1,0,-1],[1,0,1],[-1,0,1],[-1,1,-1],[1,1,-1],[1,1,1],[-1,1,1]]
                .map(([a,b,c]) => [x+a*width/2, y+b*height, z+c*depth/2]);
            for (const face of [[4,7,6,5],[3,2,6,7],[1,0,4,5],[2,1,5,6],[0,3,7,4]]) quad(...face.map(i => p[i]), color, 0, glow, material);
        }
        function cone(x, y, z, radius, height, color, wind = 0, glow = 0, material = 0) {
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
        if (!night) {
        // A distant city at dusk, seen across open water from a quiet waterfront.
        const silhouette=[.075,.075,.105], bridge=[.085,.075,.09], warm=[.82,.38,.18];
        box(0,-.45,-61,150,.7,6,[.10,.09,.115]);
        const skyline=[];
        for (let i=0;i<29;i++) {
            const x=-79+i*5.7+(hash(i+18)-.5)*1.5;
            const width=3.2+hash(i+31)*4.3;
            const height=5+hash(i+63)*15+(i===15 ? 14 : 0);
            const z=-69-hash(i+87)*9;
            const color=[.075+hash(i+4)*.035,.07+hash(i+9)*.025,.10+hash(i+13)*.045];
            box(x,-.1,z,width,height,5+hash(i+44)*4,color,0,1);
            skyline.push({x,width,height,z,seed:i});
            if (i===15) {
                box(x,height-.1,z,.8,7,.8,[.07,.07,.10]);
                box(x,height+6.9,z,.18,3.6,.18,[.13,.10,.12]);
            }
        }
        for (const building of skyline) {
            const floors=Math.max(1,Math.floor((building.height-2)/2.2));
            const columns=Math.max(1,Math.floor(building.width/1.6));
            for (let floor=0;floor<floors;floor++) for (let column=0;column<columns;column++) {
                const seed=building.seed*71+floor*11+column*5;
                if (hash(seed)<.52) continue;
                const x=building.x-building.width*.34+(column/Math.max(1,columns-1))*building.width*.68;
                const y=1.4+floor*2.15;
                const glow=.48+hash(seed+3)*.38;
                box(x,y,building.z+3.05,.42,.72,.08,warm.map(value=>value*glow),1);
            }
        }
        // Suspension bridge between the viewer and skyline.
        const deckY=3.2, deckZ=-45, towerHeight=11.5;
        box(0,deckY,deckZ,116,.55,2.2,bridge,0,2);
        box(0,deckY-.45,deckZ,116,.3,1.3,[.055,.055,.072],0,2);
        for (const x of [-27,27]) {
            box(x,deckY-.6,deckZ-.65,1.05,towerHeight,1.1,bridge,0,2);
            box(x,deckY-.6,deckZ+.65,1.05,towerHeight,1.1,bridge,0,2);
            box(x,deckY+towerHeight-1.1,deckZ,4,.6,2.4,bridge,0,2);
            box(x,deckY-6,deckZ,2.4,6,2.8,[.065,.06,.075],0,2);
        }
        function ribbon(x1,y1,x2,y2,z,width,color) {
            const dx=x2-x1, dy=y2-y1, length=Math.hypot(dx,dy)||1;
            const px=-dy/length*width, py=dx/length*width;
            quad([x1+px,y1+py,z],[x2+px,y2+py,z],[x2-px,y2-py,z],[x1-px,y1-py,z],color);
        }
        const cableY=x=>deckY+3.2+Math.pow(Math.abs(x)/27,1.7)*5.5;
        let previous=[-27,cableY(-27)];
        for (let step=1;step<=18;step++) {
            const x=-27+step*3, point=[x,cableY(x)];
            ribbon(previous[0],previous[1],point[0],point[1],deckZ+.72,.10,[.16,.13,.14]);
            previous=point;
        }
        for (let x=-24;x<=24;x+=4) {
            ribbon(x,deckY+.35,x,cableY(x),deckZ+.72,.045,[.13,.115,.125]);
        }
        for (const side of [-1,1]) {
            const towerX=side*27, anchorX=side*66;
            previous=[towerX,deckY+towerHeight-1];
            for (let step=1;step<=10;step++) {
                const t=step/10, x=towerX+(anchorX-towerX)*t;
                const y=deckY+towerHeight-1-(deckY+towerHeight-3.4)*Math.pow(t,.82);
                ribbon(previous[0],previous[1],x,y,deckZ+.72,.10,[.16,.13,.14]);
                previous=[x,y];
            }
        }
        // Sparse waterfront rail and marker lights keep the foreground grounded.
        box(0,.15,7,130,.22,.5,[.055,.055,.072],0,2);
        for (let x=-54;x<=54;x+=9) {
            box(x,.1,7,.16,1.3,.16,[.075,.07,.085],0,2);
            box(x,1.35,7,.18,.16,.18,[.55,.24,.12],1);
        }
        } else {
            // An original empty evening street: warm windows and wet stone.
            // One 48-metre street section repeats past the camera, like a slow treadmill.
            const pavement=[.19,.19,.20], iron=[.075,.085,.095];
            for (const side of [-1,1]) {
                box(side*6.05,.02,0,2.9,.18,48,pavement,0,2);
                box(side*4.64,.02,0,.14,.23,48,[.30,.28,.25],0,2);
                for (let block=0;block<3;block++) {
                    const seed=block*29+(side+1)*17, z=16-block*16;
                    const height=12+Math.floor(hash(seed+2)*4)*2.4;
                    const color=side < 0 ? [.26,.19,.19] : [.22,.22,.25];
                    const shade=.85+hash(seed)*.4;
                    box(side*12.2,.2,z,9.4,height,15,color.map(v=>v*shade),0,1);
                    box(side*12.2,height+.2,z,9.8,.35,15.4,[.22,.21,.22],0,2);
                    box(side*7.35,3.9,z,.45,.3,15,[.27,.25,.24],0,2);
                    for (let floor=0;floor<Math.floor((height-4)/2.7);floor++) {
                        const y=5.0+floor*2.7;
                        for (let window=0;window<4;window++) {
                            const wz=z-5.5+window*3.6, lit=hash(seed+floor*13+window*3)>.40;
                            box(side*7.47,y-.13,wz,.18,1.8,1.45,[.10,.10,.12]);
                            const warm=lit ? [.66+hash(seed+window)*.16,.37+hash(seed+floor)*.1,.19] : [.055,.075,.105];
                            const x=side*7.36;
                            quad([x,y,wz-.53],[x,y+1.5,wz-.53],[x,y+1.5,wz+.53],[x,y,wz+.53],warm,0,lit ? 1 : .15);
                            box(side*7.30,y-.17,wz,.27,.13,1.6,[.30,.28,.27],0,2);
                            box(side*7.28,y+.72,wz,.04,.05,1.12,[.12,.105,.10]);
                            box(side*7.28,y,wz,.04,1.5,.045,[.12,.105,.10]);
                        }
                    }
                    // Unnamed shopfronts: recessed glass, a door and a fabric canopy.
                    for (let shop=0;shop<2;shop++) {
                        const wz=z-3.8+shop*7.5, x=side*7.30;
                        box(side*7.38,.35,wz,.15,3.3,6.4,[.075,.065,.07]);
                        quad([x,.65,wz-2.9],[x,3.35,wz-2.9],[x,3.35,wz+2.9],[x,.65,wz+2.9],
                            shop ? [.27,.18,.11] : [.38,.22,.13],0,.8);
                        for (const bar of [-2.9,0,2.9]) box(side*7.24,.55,wz+bar,.1,2.9,.12,iron);
                        box(side*7.23,2.7,wz,.1,.09,5.8,iron);
                        const cloth=hash(seed+shop)>.5 ? [.19,.10,.115] : [.10,.16,.145];
                        quad([side*7.35,3.6,wz-3.3],[side*6.2,3.15,wz-3.3],[side*6.2,3.15,wz+3.3],[side*7.35,3.6,wz+3.3],cloth);
                        box(side*6.2,2.94,wz,.06,.22,6.6,cloth);
                    }
                    // A few fire-escape landings, kept simple at this resolution.
                    if (block%3===1) for (let floor=0;floor<3;floor++) {
                        const y=5+floor*2.7;
                        box(side*6.99,y,z,.8,.12,3.1,iron);
                        box(side*6.6,y+1,z,.055,.055,3.1,iron);
                        for (let rail=0;rail<5;rail++) box(side*6.6,y,z-1.5+rail*.75,.045,1,.045,iron);
                    }
                }
                for (const z of [0,-24]) {
                    const x=side*5.8;
                    box(x,.2,z,.13,4.2,.13,iron);
                    box(x,4.30,z,.52,.12,.52,iron);
                    box(x,4.42,z,.32,.55,.32,[.90,.67,.34],1);
                    box(x,4.99,z,.53,.15,.53,iron);
                    cone(x,5.14,z,.36,.22,iron);
                    lights.push(x,4.68,z,.95,.62,.29,1);
                    // A softer, broken reflection rather than a second sharp lamp.
                    lights.push(x,-4.68,z,.50,.28,.12,.5);
                }
            }

        }
        // The road is one flat quad; the dusk skyline keeps a wave mesh.
        const wx=night ? 1 : 64, wz=night ? 1 : 72;
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
        const lampFlicker=`
            // Only a few street lamps dip; there is no whole-screen flash.
            float cityFlicker(vec3 p, float phase) {
                float lamp=1.-smoothstep(.25,.48,abs(abs(p.x)-5.8));
                lamp*=1.-smoothstep(.55,.9,abs(abs(p.y)-4.68));
                float faulty=lamp*step(p.x,0.)*(1.-smoothstep(1.,2.,abs(p.z)));
                float dip=pow(.5+.5*sin(phase*31.+1.1),12.);
                dip*=.55+.45*sin(phase*7.+2.);
                float flutter=.035*sin(phase*97.+.4)*sin(phase*43.+1.2);
                return 1.-faulty*clamp(dip*.46+flutter,0.,.5);
            }
        `;
        const common=`
            precision highp float;
            uniform float u_phase;
            uniform vec3 u_eye;
            uniform vec3 u_fog;
            uniform float u_aspect;
            uniform float u_night;
            uniform float u_travel;
            uniform vec2 u_resolution;
            ${lampFlicker}
            float grain(vec2 p) { return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453); }
            vec3 finish(vec3 color) {
                float d=fract(dot(floor(gl_FragCoord.xy),vec2(.754877,.56984)))-.5;
                vec2 uv=gl_FragCoord.xy/u_resolution-.5;
                float vignette=smoothstep(.3,.72,length(uv*vec2(.9,1.)));
                color*=1.-vignette*.18*u_night;
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
                vec3 day=mix(vec3(.82,.40,.27),vec3(.11,.14,.29),smoothstep(.24,1.,v_uv.y));
                vec3 dusk=mix(u_fog,vec3(.018,.025,.065),smoothstep(.48,1.,v_uv.y));
                vec3 color=mix(day,dusk,u_night);
                float clouds=noise(v_uv*vec2(5.,15.)+vec2(sin(u_phase)*.28,cos(u_phase)*.035));
                color+=smoothstep(.51,.78,clouds)*mix(.035,.012,u_night)*smoothstep(.55,.7,v_uv.y);
                color+=vec3(.13,.045,.018)*exp(-pow((v_uv.y-.34)*8.,2.))*(1.-u_night);
                color+=vec3(.045,.018,.01)*exp(-pow((v_uv.y-.52)*9.,2.))*u_night;
                float sun=1.-smoothstep(.021,.026,length((v_uv-vec2(.76,.42))*vec2(u_aspect,1.)));
                color=mix(color,vec3(1.,.66,.37),sun*.72*(1.-u_night));
                float moon=1.-smoothstep(.015,.018,length((v_uv-vec2(.76,.82))*vec2(u_aspect,1.)));
                color=mix(color,vec3(.85,.85,.74),moon*.30*u_night);
                gl_FragColor=vec4(finish(color),1.);
            }
        `);
        const land=compile(`
            attribute vec3 a_position; attribute vec3 a_normal; attribute vec3 a_color; attribute float a_wind; attribute float a_glow; attribute float a_material;
            uniform mat4 u_matrix; uniform float u_phase; uniform float u_reflect; uniform float u_offset;
            varying vec3 v_world; varying vec3 v_local; varying vec3 v_normal; varying vec3 v_color; varying float v_glow; varying float v_material;
            void main() {
                vec3 p=a_position;
                p.z+=u_offset;
                p.x+=sin(u_phase*2.+p.z*.4)*a_wind;
                p.y=mix(p.y,-p.y-.1,u_reflect);
                v_world=p; v_local=a_position; v_normal=a_normal; v_color=a_color; v_glow=a_glow; v_material=a_material;
                gl_Position=u_matrix*vec4(p,1.);
            }
        `,common+`
            varying vec3 v_world; varying vec3 v_local; varying vec3 v_normal; varying vec3 v_color; varying float v_glow; varying float v_material; uniform float u_reflect;
            void main() {
                float light=.66+.34*max(0.,dot(normalize(v_normal),normalize(vec3(-.45,.8,.3))));
                float texture=(grain(floor(v_local.xz*3.))- .5)*.025;
                vec3 color=v_color*light+texture;
                if (u_night > .5) {
                    float lamps=exp(-pow(abs(v_world.x)-5.8,2.)*.09)*(.6+.4*cos((v_world.z-u_travel)*(6.28318530718/24.)));
                    color=v_color*(.32+max(0.,v_normal.y)*.12)+vec3(.12,.07,.028)*lamps;
                    if (v_material > .5 && v_material < 1.5) {
                        vec2 brick=vec2(v_local.z*1.5+step(.5,fract(v_local.y*1.7))*.5,v_local.y*3.4);
                        float mortar=step(.94,fract(brick.x))+step(.91,fract(brick.y));
                        color-=min(1.,mortar)*.018;
                    }
                    color=mix(color,v_color*(.9+.025*sin(u_phase*2.))*cityFlicker(v_local,u_phase),v_glow);
                } else color=mix(color,v_color*(1.05+.018*sin(u_phase*2.))+vec3(.055,.02,.008),v_glow*.82);
                float fog=1.-exp(-length(v_world-u_eye)*mix(.014,.021,u_night));
                if (u_night > .5) fog=max(fog,smoothstep(60.,108.,length(v_world-u_eye)));
                color=mix(color,u_fog,clamp(fog,0.,u_night > .5 ? 1. : .97));
                color=mix(color,u_fog,.25*u_reflect);
                gl_FragColor=vec4(finish(color),1.);
            }
        `);
        const sea=compile(`
            attribute vec2 a_position; uniform mat4 u_matrix; uniform float u_phase; uniform float u_night;
            varying vec3 v_world;
            void main() {
                float y=sin(a_position.x*.43+a_position.y*.28+u_phase*5.)*.075;
                y+=sin(a_position.x*.2-a_position.y*.32+u_phase*3.)*.045;
                y*=1.-u_night;
                v_world=vec3(a_position.x,y,a_position.y);
                gl_Position=u_matrix*vec4(v_world,1.);
            }
        `,common+`
            varying vec3 v_world;
            void main() {
                float distance=length(v_world-u_eye);
                float ripple=sin(v_world.x*.65+v_world.z*.43+u_phase*5.);
                ripple+=sin(v_world.x*.21-v_world.z*.54+u_phase*3.)*.6;
                vec3 color=mix(vec3(.10,.13,.20),u_fog,1.-exp(-distance*.018));
                color+=ripple*.012;
                float sheen=pow(max(0.,sin(v_world.x*.08-v_world.z*.03+u_phase)),12.)*.018;
                color+=sheen*exp(-distance*.008)+vec3(.08,.025,.012)*exp(-pow(v_world.x*.018,2.))*exp(-distance*.013);
                if (u_night > .5) {
                    vec2 street=vec2(v_world.x,v_world.z-u_travel);
                    // Unbroken wet asphalt, without a tile grid beneath the reflections.
                    color=mix(vec3(.047,.048,.065),u_fog,1.-exp(-distance*.018));
                    color+=ripple*.002;
                    float pool=exp(-pow(abs(v_world.x)-5.8,2.)*.18)*pow(.5+.5*cos(street.y*(6.28318530718/24.)),5.);
                    float lampZ=mod(floor(street.y/24.+.5)*24.+24.,48.)-24.;
                    float flutter=cityFlicker(vec3(sign(street.x)*5.8,4.68,lampZ),u_phase);
                    color+=vec3(.18,.09,.028)*pool*flutter;
                    float puddle=smoothstep(-.9,.9,sin(street.x*1.7+sin(street.y*(6.28318530718/48.)*6.))*cos(street.y*(6.28318530718/48.)*3.));
                    gl_FragColor=vec4(finish(color),mix(.60,.94,puddle));
                } else gl_FragColor=vec4(finish(color),.84);
            }
        `);
        const glow=compile(`
            attribute vec3 a_position; attribute vec3 a_color; attribute float a_strength;
            uniform mat4 u_matrix; uniform float u_size; uniform float u_offset; uniform float u_phase;
            varying vec3 v_color;
            ${lampFlicker}
            void main() {
                vec4 p=u_matrix*vec4(a_position+vec3(0.,0.,u_offset),1.);
                gl_Position=p; gl_PointSize=clamp(u_size*a_strength/p.w,2.,50.);
                v_color=a_color*cityFlicker(a_position,u_phase);
            }
        `,`precision mediump float; varying vec3 v_color;
            void main() {
                float r=length(gl_PointCoord-.5)*2.;
                float alpha=exp(-r*r*5.)*(1.-smoothstep(.65,1.,r))*.37;
                gl_FragColor=vec4(v_color,alpha);
            }
        `);
        function buffer(data) {
            const value=gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER,value);
            gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(data),gl.STATIC_DRAW); return value;
        }
        const skyBuffer=buffer([-1,-1,1,-1,-1,1,-1,1,1,-1,1,1]);
        const landBuffer=buffer(objects), waterBuffer=buffer(water), lightBuffer=buffer(lights);
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
        function use(pass,phase,eye,matrix,travel=0) {
            for (let i=0;i<8;i++) gl.disableVertexAttribArray(i);
            gl.useProgram(pass.program);
            gl.uniform1f(uniform(pass,'u_phase'),phase);
            gl.uniform1f(uniform(pass,'u_night'),night ? 1 : 0);
            gl.uniform1f(uniform(pass,'u_travel'),travel);
            gl.uniform2f(uniform(pass,'u_resolution'),canvas.width,canvas.height);
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
            const z=normalize(subtract(eye,night ? [0,2.3,-90] : [0,2.15,-32])), x=normalize(cross([0,1,0],z)), y=cross(z,x);
            const view=new Float32Array([x[0],y[0],z[0],0,x[1],y[1],z[1],0,x[2],y[2],z[2],0,-dot(x,eye),-dot(y,eye),-dot(z,eye),1]);
            const f=1/Math.tan(55*Math.PI/360), n=.1, far=260;
            const projection=new Float32Array([f/aspect,0,0,0,0,f,0,0,0,0,(far+n)/(n-far),-1,0,0,2*far*n/(n-far),0]);
            return multiply(projection,view);
        }
        function geometry(phase,eye,matrix,reflect,offsets,travel) {
            use(land,phase,eye,matrix,travel);
            gl.uniform1f(uniform(land,'u_reflect'),reflect);
            gl.bindBuffer(gl.ARRAY_BUFFER,landBuffer);
            attribute(land,'a_position',3,12,0); attribute(land,'a_normal',3,12,3);
            attribute(land,'a_color',3,12,6); attribute(land,'a_wind',1,12,9);
            attribute(land,'a_glow',1,12,10); attribute(land,'a_material',1,12,11);
            for (const offset of offsets) {
                gl.uniform1f(uniform(land,'u_offset'),offset);
                gl.drawArrays(gl.TRIANGLES,0,objects.length/12);
            }
        }
        function draw(seconds) {
            const size=frame.getBoundingClientRect();
            if (size.width < 1 || size.height < 1) return;
            const scale=Math.min(1,640/size.width,480/size.height);
            const width=Math.max(1,Math.round(size.width*scale)), height=Math.max(1,Math.round(size.height*scale));
            if (canvas.width !== width || canvas.height !== height) { canvas.width=width; canvas.height=height; }
            gl.viewport(0,0,width,height);
            const phase=(seconds%180)/180*Math.PI*2;
            const travel=night ? (seconds%180)/180*48 : 0;
            const offsets=night ? [travel+48,travel,travel-48,travel-96,travel-144] : [0];
            const eye=night ? [Math.sin(phase*36)*.028,1.85+Math.sin(phase*72)*.012,14] : [Math.sin(phase)*.08,5.1+Math.sin(phase*2)*.035,15];
            const matrix=camera(eye,size.width/size.height);
            gl.disable(gl.BLEND); gl.disable(gl.DEPTH_TEST);
            gl.clearColor(...fog,1); gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);
            use(sky,phase,eye);
            gl.bindBuffer(gl.ARRAY_BUFFER,skyBuffer); attribute(sky,'a_position',2,2,0);
            gl.drawArrays(gl.TRIANGLES,0,6);
            gl.enable(gl.DEPTH_TEST);
            geometry(phase,eye,matrix,1,offsets,travel);
            use(sea,phase,eye,matrix,travel);
            gl.bindBuffer(gl.ARRAY_BUFFER,waterBuffer); attribute(sea,'a_position',2,2,0);
            gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA);
            gl.drawArrays(gl.TRIANGLES,0,water.length/2);
            gl.disable(gl.BLEND);
            geometry(phase,eye,matrix,0,offsets,travel);
            if (night) {
                use(glow,phase,eye,matrix);
                gl.uniform1f(uniform(glow,'u_size'),height*1.3);
                gl.bindBuffer(gl.ARRAY_BUFFER,lightBuffer);
                attribute(glow,'a_position',3,7,0); attribute(glow,'a_color',3,7,3); attribute(glow,'a_strength',1,7,6);
                gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA,gl.ONE); gl.depthMask(false);
                for (const offset of offsets) {
                    gl.uniform1f(uniform(glow,'u_offset'),offset);
                    gl.drawArrays(gl.POINTS,0,lights.length/7);
                }
                gl.depthMask(true); gl.disable(gl.BLEND);
            }
        }
        return {draw};
    }

    window.SecondSourceRoomScenes = {create: createScene};
})();
