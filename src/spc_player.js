/*!
 * SMW Central SPC player
 * Copyright (C) 2021 Telinc1
 *
 * Resampling logic from snes_spc_js by Liam Wilson (cosinusoidally)
 * https://github.com/cosinusoidally/snes_spc_js
 * 
 * This library is free software; you can redistribute it and/or
 * modify it under the terms of the GNU Lesser General Public
 * License as published by the Free Software Foundation; either
 * version 2.1 of the License, or (at your option) any later version.
 *
 * This library is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the GNU
 * Lesser General Public License for more details.
 *
 * You should have received a copy of the GNU Lesser General Public
 * License along with this library; if not, write to the Free Software
 * Foundation, Inc., 51 Franklin Street, Fifth Floor, Boston, MA  02110-1301  USA
 */

(function()
{

window.SMWCentral ??= {};
window.SMWCentral.SPCPlayer ??= {};

SMWCentral.SPCPlayer.Backend = (function()
{
	const AudioContext = window.AudioContext || window.webkitAudioContext;
	
	return {
		// Controlled by spc_player.c: -2: not supported, -1: error, 0: not initialized, 1: ready
		status: (AudioContext == null || window.Uint8Array == null || window.WebAssembly == null) ? -2 : 0,
		locked: true,
		context: null,
		gainNode: null,
		scriptProcessorNode: null,
		rateRatio: 0,
		lastSample: 0,
		bufferPointer: 0,
		bufferSize: 0,
		spcPointer: null,
		channelBuffers: [
			new Float32Array(16384),
			new Float32Array(16384)
		],
		timeoutID: 0,
		hasNewChannelData: false,
		startedAt: 0,
		initialize()
		{
			if(this.status !== 0)
			{
				return;
			}
			
			this.context = new AudioContext();
			this.gainNode = this.context.createGain();
			
			this.rateRatio = 32000 / this.context.sampleRate;
			this.lastSample = 1 + Math.floor(16384 * this.rateRatio);
			
			this.bufferSize = 4 * (this.lastSample - 1);
			this.bufferPointer = Module._malloc(this.bufferSize + 4);
			
			this.playSPC = this.playSPC.bind(this);
			this.copyBuffers = this.copyBuffers.bind(this);
			
			this.gainNode.connect(this.context.destination);
			
			this.status = 1;
		},
		loadSPC(spc, time = 0)
		{
			if(this.status !== 1)
			{
				throw new TypeError("Cannot play SPC right now");
			}
			
			this.stopSPC(false);
			this.scriptProcessorNode?.disconnect(this.gainNode);
			window.clearInterval(this.timeoutID);
			
			this.spcPointer = Module._malloc(spc.length * Uint8Array.BYTES_PER_ELEMENT);
			Module.HEAPU8.set(spc, this.spcPointer);
			Module._loadSPC(this.spcPointer, spc.length * Uint8Array.BYTES_PER_ELEMENT);
			
			if(time > 0)
			{
				Module._skipSPC(time);
			}
			
			this.playSPC();
			
			this.scriptProcessorNode = this.context.createScriptProcessor(this.channelBuffers[0].length, 0, this.channelBuffers.length);
			this.scriptProcessorNode.onaudioprocess = this.copyBuffers;
			
			this.startedAt = this.context.currentTime - Math.max(0, time);
			
			this.scriptProcessorNode.connect(this.gainNode);
			this.resume();
		},
		stopSPC(pause = true)
		{
			if(pause)
			{
				this.pause();
			}
			
			if(this.spcPointer !== null)
			{
				Module._free(this.spcPointer);
				this.spcPointer = null;
			}
		},
		pause()
		{
			if(this.context != null)
			{
				this.context.suspend();
			}
		},
		resume()
		{
			if(this.context != null)
			{
				this.context.resume();
			}
		},
		getTime()
		{
			return (this.context == null) ? 0 : this.context.currentTime - this.startedAt;
		},
		getVolume()
		{
			return (this.gainNode == null) ? 1 : Math.min(Math.max(this.gainNode.gain.value, 0), 1.5);
		},
		setVolume(volume, duration = 0)
		{
			if(this.gainNode === null)
			{
				return;
			}
			
			if(duration <= 0.02)
			{
				this.gainNode.gain.setValueAtTime(Math.min(Math.max(volume, 0), 1.5), this.context.currentTime);
			}
			else
			{
				this.gainNode.gain.exponentialRampToValueAtTime(Math.min(Math.max(volume, 0.01), 1.5), this.context.currentTime + duration);
			}
		},
		getSample(channel, index)
		{
			const offset = this.rateRatio * index;
			const bufferOffset = Math.floor(offset);
			
			if(bufferOffset + 1 > this.lastSample)
			{
				throw new RangeError(`Buffer overflow for sample ${index} in channel ${channel}`);
			}
			
			const high = offset - bufferOffset;
			const low = 1 - high;
			
			const lowValue = Module.HEAP16[channel + this.bufferPointer / 2 + (bufferOffset) * 2] * low;
			const highValue = Module.HEAP16[channel + this.bufferPointer / 2 + (bufferOffset + 1) * 2] * high;
			
			return lowValue + highValue;
		},
		playSPC()
		{
			const {channelBuffers} = this;
			
			Module._playSPC(this.bufferPointer, this.lastSample * 2);
			
			for(let channel = 0; channel < channelBuffers.length; channel += 1)
			{
				const buffer = channelBuffers[channel];
				
				for(let index = 0; index < buffer.length; index++)
				{
					buffer[index] = this.getSample(channel, index) / 32000;
				}
			}
			
			this.hasNewChannelData = true;
		},
		copyBuffers({outputBuffer})
		{
			if(this.spcPointer === null || this.context.state !== "running")
			{
				return;
			}
			
			if(!this.hasNewChannelData)
			{
				window.clearTimeout(this.timeoutID);
				this.playSPC();
			}
			
			for(let channel = 0; channel < outputBuffer.numberOfChannels; channel += 1)
			{
				outputBuffer.copyToChannel(this.channelBuffers[channel], channel, 0);
			}
			
			this.hasNewChannelData = false;
			
			window.clearTimeout(this.timeoutID);
			this.timeoutID = window.setTimeout(this.playSPC, 0);
		},
		unlock()
		{
			if(this.locked && this.context != null)
			{
				this.context.resume();
				this.locked = false;
			}
		}
	};
})();

})();
