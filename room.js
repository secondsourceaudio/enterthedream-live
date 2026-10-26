/* A small playlist with independent scene choices. Playback always starts with a visitor action. */
(() => {
    'use strict';
    const room=document.querySelector('[data-room]');
    if (!room) return;
    const frame=room.querySelector('.room-frame');
    const canvas=room.querySelector('canvas');
    const dock=room.querySelector('.room-dock');
    const audio=room.querySelector('audio');
    const play=room.querySelector('[data-room-play]');
    const motion=room.querySelector('[data-room-motion]');
    const fullscreen=room.querySelector('[data-room-fullscreen]');
    const seek=room.querySelector('[data-room-seek]');
    const stop=room.querySelector('[data-room-stop]');
    const mute=room.querySelector('[data-room-mute]');
    const volume=room.querySelector('[data-room-volume]');
    const repeat=room.querySelector('[data-room-repeat]');
    const playlistToggle=room.querySelector('[data-room-playlist-toggle]');
    const playlist=room.querySelector('.room-playlist');
    const skinButton=room.querySelector('[data-room-skin]');
    const spectrum=room.querySelector('[data-room-spectrum]');
    const status=document.querySelector('[data-room-status]');
    const tracks=[...room.querySelectorAll('[data-room-song]')];
    const scenes=[...room.querySelectorAll('[data-room-scene]')];
    const sourceNames={shore:'SOURCE 1 / DUSK',city:'SOURCE 2 / NIGHT'};
    playlist.querySelector('h2 span').textContent=String(tracks.length).padStart(2,'0');
    if (matchMedia('(max-width: 750px)').matches) {
        playlist.hidden=true;
        playlistToggle.setAttribute('aria-expanded','false');
    }
    const reduced=matchMedia('(prefers-reduced-motion: reduce)');
    const hover=matchMedia('(hover: hover) and (pointer: fine)');
    const inertElements=new Map(), worlds=new Map(), sceneTimes=new Map();
    let moving=!reduced.matches, visible=true, elapsed=0, last=null, animation=0;
    let world=null, scene='shore', selected=null, playRequest=0;
    let immersive=false, controlsTimer=0, returnFocus=null;
    let meterContext=null, meterAnalyser=null, meterData=null, meterUnavailable=false;
    let meterFrame=0, meterLast=null, meterVisible=false;
    const meterBands=[];
    for (let index=0;index<20;index++) {
        const element=document.createElement('span');
        element.className='room-spectrum-band';
        for (const kind of ['level','peak']) {
            const part=document.createElement('span');
            part.className='room-spectrum-'+kind; element.append(part);
        }
        spectrum.append(element);
        meterBands.push({element,level:0,peak:0,hold:0});
    }

    function isRunning() { return moving && !audio.paused && !audio.ended; }
    function updateControls() {
        const playing=!audio.paused && !audio.ended;
        play.setAttribute('aria-pressed',String(playing));
        play.setAttribute('aria-label',playing ? 'Pause music' : 'Play music');
        play.querySelector('[data-room-play-label]').textContent=playing ? 'PAUSE' : 'PLAY';
        play.querySelector('[data-room-pause]').toggleAttribute('hidden',!playing);
        play.querySelector('[data-room-start]').toggleAttribute('hidden',playing);
        room.classList.toggle('is-playing',playing);
        room.querySelector('[data-room-state]').textContent=playing ? 'PLAYING' : audio.ended ? 'ENDED' : audio.currentTime > 0 ? 'PAUSED' : 'STOPPED';
        motion.disabled=!world;
        motion.textContent=moving && world ? 'MOTION ON' : 'MOTION OFF';
        motion.setAttribute('aria-pressed',String(moving && !!world));
        reconcile();
    }
    function tick(now) {
        animation=0;
        if (!world || !visible || document.hidden || !isRunning()) { last=null; return; }
        if (last !== null && now-last < 1000/30) { animation=requestAnimationFrame(tick); return; }
        if (last !== null) elapsed+=Math.min((now-last)/1000,.1);
        last=now;
        drawStill();
        animation=requestAnimationFrame(tick);
    }
    function drawStill() {
        if (!world) return;
        world.draw(elapsed);
    }
    function reconcile() {
        if (!world || !visible || document.hidden || !isRunning()) {
            cancelAnimationFrame(animation); animation=0; last=null;
        } else if (!animation) { last=null; animation=requestAnimationFrame(tick); }
        reconcileSpectrum();
    }
    function connectSpectrum() {
        // Connect once, in the same user gesture as Play. A track change reuses the graph.
        const AudioContext=window.AudioContext || window.webkitAudioContext;
        if (!meterContext && AudioContext && !meterUnavailable) {
            let candidate=null, source=null;
            try {
                candidate=new AudioContext();
                const analyser=candidate.createAnalyser();
                analyser.fftSize=2048; analyser.smoothingTimeConstant=.5;
                source=candidate.createMediaElementSource(audio);
                source.connect(analyser); analyser.connect(candidate.destination);
                meterContext=candidate; meterAnalyser=analyser;
                meterData=new Float32Array(analyser.frequencyBinCount);
            } catch {
                meterUnavailable=true;
                if (source) {
                    source.disconnect(); source.connect(candidate.destination); meterContext=candidate;
                } else candidate?.close().catch(()=>{});
            }
            if (meterContext) meterContext.addEventListener('statechange',reconcileSpectrum);
        }
        return meterContext && meterContext.state !== 'running' ? meterContext.resume() : Promise.resolve();
    }
    function spectrumAllowed() {
        return !!meterAnalyser && meterContext.state === 'running' && meterVisible && moving &&
            !immersive && !document.hidden && !audio.paused && !audio.ended && !audio.muted &&
            audio.volume > 0 && audio.readyState >= audio.HAVE_FUTURE_DATA;
    }
    function clearSpectrum() {
        for (const band of meterBands) {
            band.level=band.peak=band.hold=0;
            band.element.style.setProperty('--level','0');
            band.element.style.setProperty('--peak','0');
            band.element.style.setProperty('--peak-visible','0');
        }
    }
    function paintSpectrum(now) {
        meterFrame=0;
        if (!spectrumAllowed()) { clearSpectrum(); return; }
        const dt=meterLast === null ? 1/30 : Math.min(.1,(now-meterLast)/1000);
        if (dt >= 1/30) {
            meterLast=now;
            meterAnalyser.getFloatFrequencyData(meterData);
            const binWidth=meterContext.sampleRate/meterAnalyser.fftSize;
            for (let index=0;index<meterBands.length;index++) {
                const band=meterBands[index];
                const low=40*Math.pow(350,index/meterBands.length);
                const high=40*Math.pow(350,(index+1)/meterBands.length);
                const first=Math.max(1,Math.floor(low/binWidth));
                const lastBin=Math.min(meterData.length-1,Math.max(first,Math.ceil(high/binWidth)-1));
                let power=0;
                for (let bin=first;bin<=lastBin;bin++) power+=Math.pow(10,meterData[bin]/10);
                const db=power > 0 ? 10*Math.log10(power/Math.max(1,lastBin-first+1)) : -100;
                const target=Math.max(0,Math.min(.96,(db+70)/60));
                band.level+=(target-band.level)*(1-Math.exp(-dt/(target > band.level ? .025 : .12)));
                if (band.level >= band.peak) { band.peak=band.level; band.hold=.18; }
                else { band.hold-=dt; if (band.hold <= 0) band.peak=Math.max(band.level,band.peak-dt*.65); }
                band.element.style.setProperty('--level',band.level.toFixed(3));
                band.element.style.setProperty('--peak',band.peak.toFixed(3));
                band.element.style.setProperty('--peak-visible',band.peak > .01 ? '1' : '0');
            }
        }
        meterFrame=requestAnimationFrame(paintSpectrum);
    }
    function reconcileSpectrum() {
        if (!spectrumAllowed()) {
            cancelAnimationFrame(meterFrame); meterFrame=0; meterLast=null; clearSpectrum();
        } else if (!meterFrame) { meterLast=null; meterFrame=requestAnimationFrame(paintSpectrum); }
    }
    function selectScene(value) {
        if (!scenes.some(button=>button.dataset.roomScene === value)) return;
        sceneTimes.set(scene,elapsed);
        scene=value; elapsed=sceneTimes.get(scene) || 0; last=null;
        room.dataset.scene=scene;
        const sourceName=sourceNames[scene];
        room.querySelector('.room-scene-label').textContent=sourceName;
        room.querySelector('.room-player-catalogue').textContent=sourceName;
        for (const track of tracks) track.querySelector('.room-song-scene').textContent=sourceNames[track === selected ? scene : track.dataset.scene];
        const description=scene === 'city' ? 'A quiet low-poly evening street in fine drizzle, with warm windows and reflections on wet asphalt.' : 'A low-poly city skyline and suspension bridge in fine dusk drizzle, seen across slowly moving water.';
        frame.setAttribute('aria-label',description+' Slowly looping scenery. Press Space to play or pause music, F for fullscreen.');
        for (const button of scenes) button.setAttribute('aria-pressed',String(button.dataset.roomScene === scene));
        try {
            if (!worlds.has(scene)) worlds.set(scene,window.SecondSourceRoomScenes.create(scene,canvas,frame));
            world=worlds.get(scene); drawStill();
            room.classList.add('has-scene'); canvas.dataset.renderState='ready';
        } catch {
            world=null; room.classList.remove('has-scene'); canvas.dataset.renderState='fallback';
            status.textContent='Your browser is showing a still scene. Music is still available.';
        }
        updateControls();
    }
    async function startPlayback() {
        const request=++playRequest;
        try {
            const ready=connectSpectrum();
            if (audio.getAttribute('src') !== selected.dataset.src || audio.error) {
                audio.src=selected.dataset.src;
                audio.load();
            }
            await Promise.all([ready,audio.play()]);
            reconcileSpectrum();
            if (request === playRequest) status.textContent='';
        } catch (error) {
            if (request === playRequest && error.name !== 'AbortError') {
                status.textContent='The audio could not start. Select Play to try again.';
            }
        }
    }
    function selectTrack(button,autoplay=true) {
        if (button.disabled) return;
        if (button === selected) { if (autoplay && audio.paused) startPlayback(); return; }
        ++playRequest; audio.pause(); selected=button;
        // Assign the source only on Play: preload=none alone is merely a browser hint.
        audio.removeAttribute('src');
        audio.load();
        for (const track of tracks) track.setAttribute('aria-pressed',String(track === selected));
        room.querySelector('[data-room-artist]').textContent=button.dataset.artist;
        room.querySelector('[data-room-title]').textContent=button.dataset.title;
        status.textContent=''; timeline(); selectScene(button.dataset.scene);
        if (autoplay) startPlayback();
    }
    async function togglePlay() {
        if (!audio.paused) { ++playRequest; audio.pause(); return; }
        if (audio.ended) audio.currentTime=0;
        await startPlayback();
    }
    play.addEventListener('click',togglePlay);
    stop.addEventListener('click',()=>{
        ++playRequest; audio.pause();
        if (audio.currentSrc) audio.currentTime=0;
        timeline(); updateControls();
    });
    function updateVolume() {
        const silent=audio.muted || audio.volume === 0;
        mute.setAttribute('aria-pressed',String(silent));
        mute.setAttribute('aria-label',silent ? 'Unmute music' : 'Mute music');
        mute.title=silent ? 'Unmute' : 'Mute';
        room.querySelector('[data-room-speaker]').toggleAttribute('hidden',silent);
        room.querySelector('[data-room-muted]').toggleAttribute('hidden',!silent);
        volume.value=audio.volume;
        const percent=Math.round(audio.volume*100)+'%';
        volume.setAttribute('aria-valuetext',percent);
        room.querySelector('[data-room-volume-output]').textContent=percent;
        reconcileSpectrum();
    }
    audio.volume=Number(volume.value);
    mute.addEventListener('click',()=>{
        if (audio.volume === 0) { audio.volume=.35; audio.muted=false; }
        else audio.muted=!audio.muted;
    });
    volume.addEventListener('input',()=>{ audio.volume=Number(volume.value); audio.muted=false; });
    audio.addEventListener('volumechange',updateVolume);
    updateVolume();
    repeat.addEventListener('click',()=>{
        audio.loop=!audio.loop;
        repeat.setAttribute('aria-pressed',String(audio.loop));
    });
    playlistToggle.addEventListener('click',()=>{
        playlist.hidden=!playlist.hidden;
        playlistToggle.setAttribute('aria-expanded',String(!playlist.hidden));
    });
    const skins=['graphite','chrome','cobalt','amber'];
    function setSkin(skin) {
        dock.dataset.skin=skin;
        skinButton.setAttribute('aria-label','Change player skin. Current skin: '+skin[0].toUpperCase()+skin.slice(1));
    }
    try {
        const stored=localStorage.getItem('second-source-player-skin');
        if (skins.includes(stored)) setSkin(stored);
    } catch { /* Skin preferences are optional. */ }
    skinButton.addEventListener('click',()=>{
        const skin=skins[(skins.indexOf(dock.dataset.skin)+1)%skins.length];
        setSkin(skin);
        try { localStorage.setItem('second-source-player-skin',skin); } catch { /* Optional preference. */ }
    });
    for (const track of tracks) track.addEventListener('click',()=>selectTrack(track));
    for (const button of scenes) button.addEventListener('click',()=>selectScene(button.dataset.roomScene));
    motion.addEventListener('click',()=>{ moving=!moving; updateControls(); });
    reduced.addEventListener('change',()=>{ moving=!reduced.matches; updateControls(); });
    const format=seconds=>{
        const value=Math.max(0,Math.floor(Number.isFinite(seconds) ? seconds : 0));
        return Math.floor(value/60)+':'+String(value%60).padStart(2,'0');
    };
    function timeline() {
        const ready=Number.isFinite(audio.duration) && audio.duration > 0;
        seek.disabled=!ready;
        seek.max=ready ? audio.duration : 1; seek.value=ready ? audio.currentTime : 0;
        seek.style.setProperty('--progress',(ready ? audio.currentTime/audio.duration*100 : 0)+'%');
        seek.setAttribute('aria-valuetext',format(audio.currentTime)+(ready ? ' of '+format(audio.duration) : ''));
        room.querySelector('[data-room-time]').textContent=format(audio.currentTime)+(ready ? ' / '+format(audio.duration) : ' / —:—');
    }
    for (const event of ['play','pause','ended','playing','waiting','canplay']) audio.addEventListener(event,updateControls);
    for (const event of ['loadedmetadata','durationchange','timeupdate','emptied']) audio.addEventListener(event,timeline);
    audio.addEventListener('ended',()=>{
        const available=tracks.filter(track=>!track.disabled);
        if (available.length < 2) return;
        selectTrack(available[(available.indexOf(selected)+1)%available.length]);
    });
    audio.addEventListener('error',()=>{ status.textContent='This track could not load. Select it again to retry.'; });
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
        drawStill();
        reconcileSpectrum();
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
    new IntersectionObserver(entries=>{ meterVisible=entries[0].isIntersecting; reconcileSpectrum(); }).observe(spectrum);
    new ResizeObserver(drawStill).observe(frame);
    document.addEventListener('visibilitychange',reconcile);
    canvas.addEventListener('webglcontextlost',event=>{
        event.preventDefault(); worlds.clear(); world=null; room.classList.remove('has-scene');
        canvas.dataset.renderState='fallback'; updateControls();
    });
    canvas.addEventListener('webglcontextrestored',()=>selectScene(scene));
    window.addEventListener('pagehide',()=>{ audio.pause(); cancelAnimationFrame(animation); animation=0; last=null; reconcileSpectrum(); });
    window.addEventListener('pageshow',reconcile);
    selectTrack(tracks[0],false);
    document.querySelector('[data-room-still]').hidden=true;
    room.classList.add('is-ready');
})();
