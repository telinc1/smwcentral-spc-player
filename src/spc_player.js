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
			
			this.gainNode.connect(this.context.destination);
			
			this.status = 1;
		},
		loadSPC(spc, time = 0)
		{
			if(this.status !== 1)
			{
				throw new TypeError("Cannot play SPC right now");
			}
			
			this.createProcessorNode();
			this.stopSPC(false);
			
			this.spcPointer = Module._malloc(spc.length * Uint8Array.BYTES_PER_ELEMENT);
			Module.HEAPU8.set(spc, this.spcPointer);
			Module._loadSPC(this.spcPointer, spc.length * Uint8Array.BYTES_PER_ELEMENT);
			
			if(time > 0)
			{
				Module._skipSPC(time);
				this.startedAt -= time;
			}
			
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
			
			if(duration === 0)
			{
				this.gainNode.gain.setValueAtTime(Math.min(Math.max(volume, 0), 1.5), this.context.currentTime);
			}
			else
			{
				this.gainNode.gain.exponentialRampToValueAtTime(Math.min(Math.max(volume, 0.01), 1.5), this.context.currentTime + duration);
			}
		},
		createProcessorNode()
		{
			if(this.scriptProcessorNode !== null)
			{
				this.scriptProcessorNode.disconnect(this.gainNode);
			}
			
			this.scriptProcessorNode = this.context.createScriptProcessor(16384, 0, 2);
			this.scriptProcessorNode.connect(this.gainNode);
			this.scriptProcessorNode.onaudioprocess = this.playSPC;
			
			this.startedAt = this.context.currentTime;
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
		playSPC({outputBuffer})
		{
			if(this.spcPointer === null || this.context.state !== "running")
			{
				return;
			}
			
			Module._playSPC(this.bufferPointer, this.lastSample * 2);
			
			for(let channel = 0; channel < outputBuffer.numberOfChannels; channel += 1)
			{
				const output = outputBuffer.getChannelData(channel);
				
				for(let k = 0; k < output.length; k++)
				{
					output[k] = this.getSample(channel, k) / 32000;
				}
			}
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
