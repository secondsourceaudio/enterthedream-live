/* The FLOWER X/Y instrument: a sine carrier with gentle sine modulation. */
(() => {
    'use strict';
    const clamp = value => Math.max(0, Math.min(1, value));

    class FlowerTone extends EventTarget {
        constructor() {
            super();
            this.dataset = {trackTitle: 'Flower tone'};
            this.paused = true;
            this.error = null;
            this.networkState = 1;
            this.NETWORK_NO_SOURCE = 3;
            this.x = this.y = .5;
            this._muted = false;
            this._volume = 1;
            this.voice = null;
        }
        get muted() { return this._muted; }
        set muted(value) { this._muted = !!value; this.updateLevel(); }
        get volume() { return this._volume; }
        set volume(value) { this._volume = clamp(value); this.updateLevel(); }
        updateLevel() {
            if (this.output) this.output.gain.setTargetAtTime(this.muted ? 0 : this.volume, this.context.currentTime, .02);
        }
        createSource(context) {
            this.context = context;
            this.output = context.createGain();
            this.output.gain.value = this.muted ? 0 : this.volume;
            return this.output;
        }
        setPosition(x, y) {
            this.x = clamp(x);
            this.y = clamp(y);
            if (!this.voice) return;
            const now = this.context.currentTime;
            const frequency = 55 * Math.pow(8, this.x);
            this.voice.carrier.frequency.setTargetAtTime(frequency, now, .04);
            this.voice.modulator.frequency.setTargetAtTime(frequency * 2, now, .04);
            this.voice.depth.gain.setTargetAtTime(frequency * 1.5 * this.y * this.y, now, .04);
        }
        play() {
            if (!this.context || !this.output) return Promise.reject(new Error('Web Audio unavailable'));
            if (!this.paused) return Promise.resolve();
            const context = this.context;
            const carrier = context.createOscillator();
            const modulator = context.createOscillator();
            const depth = context.createGain();
            const envelope = context.createGain();
            carrier.type = modulator.type = 'sine';
            const frequency = 55 * Math.pow(8, this.x);
            carrier.frequency.value = frequency;
            modulator.frequency.value = frequency * 2;
            depth.gain.value = frequency * 1.5 * this.y * this.y;
            envelope.gain.value = 0;
            modulator.connect(depth);
            depth.connect(carrier.frequency);
            carrier.connect(envelope);
            envelope.connect(this.output);
            const voice = {carrier, modulator, depth, envelope};
            this.voice = voice;
            carrier.start();
            modulator.start();
            envelope.gain.setTargetAtTime(.2, context.currentTime, .03);
            carrier.onended = () => {
                carrier.disconnect(); modulator.disconnect(); depth.disconnect(); envelope.disconnect();
            };
            this.paused = false;
            this.dispatchEvent(new Event('play'));
            return Promise.resolve();
        }
        pause() {
            if (this.paused) return;
            const voice = this.voice;
            this.voice = null;
            voice.envelope.gain.setTargetAtTime(0, this.context.currentTime, .015);
            voice.carrier.stop(this.context.currentTime + .12);
            voice.modulator.stop(this.context.currentTime + .12);
            this.paused = true;
            this.dispatchEvent(new Event('pause'));
        }
        load() { /* The instrument has no media file to load. */ }
    }

    window.SecondSourceTone = {create: () => new FlowerTone()};

    document.addEventListener('DOMContentLoaded', () => {
        const space = document.querySelector('[data-xy-tone]');
        const surface = space?.querySelector('.visual-container');
        const experience = window.SecondSourceExperience;
        if (!surface || !experience) return;
        let pointerId = null;
        let x = .5, y = .5;
        const update = event => {
            const bounds = surface.getBoundingClientRect();
            x = clamp((event.clientX - bounds.left) / bounds.width);
            y = clamp(1 - (event.clientY - bounds.top) / bounds.height);
            experience.setTonePosition(x, y);
        };
        surface.addEventListener('pointerdown', event => {
            if (pointerId !== null || (event.pointerType === 'mouse' && event.button !== 0)) return;
            event.preventDefault();
            pointerId = event.pointerId;
            update(event);
            try { surface.setPointerCapture(pointerId); } catch {}
        });
        window.addEventListener('pointermove', event => {
            if (event.pointerId !== pointerId) return;
            if (event.pointerType === 'mouse' && !(event.buttons & 1)) { pointerId = null; return; }
            update(event);
        });
        const release = event => { if (event.pointerId === pointerId) pointerId = null; };
        window.addEventListener('pointerup', release);
        window.addEventListener('pointercancel', release);
        surface.addEventListener('lostpointercapture', release);
        window.addEventListener('blur', () => { pointerId = null; });
        window.addEventListener('pagehide', () => { pointerId = null; });
        document.addEventListener('visibilitychange', () => { if (document.hidden) pointerId = null; });
        surface.addEventListener('keydown', event => {
            if (event.target !== surface || !['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return;
            event.preventDefault();
            const step = event.shiftKey ? .1 : .025;
            if (event.key === 'ArrowLeft') x = clamp(x - step);
            if (event.key === 'ArrowRight') x = clamp(x + step);
            if (event.key === 'ArrowDown') y = clamp(y - step);
            if (event.key === 'ArrowUp') y = clamp(y + step);
            experience.setTonePosition(x, y);
        });
        space.querySelector('[data-fluid-reset]').addEventListener('click', () => {
            x = y = .5;
            experience.setTonePosition(x, y);
        });
    });
})();
