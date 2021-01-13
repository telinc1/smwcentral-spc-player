/*!
 * SMW Central SPC player
 * Copyright (C) 2021 Telinc1
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

SMWCentral.SPCPlayer.onPlay ??= () => {};
SMWCentral.SPCPlayer.onPause ??= () => {};
SMWCentral.SPCPlayer.onRestart ??= () => {};
SMWCentral.SPCPlayer.onStop ??= () => {};

SMWCentral.SPCPlayer.onError ??= (error) => window.alert(error);

SMWCentral.SPCPlayer.createPlaylistItem ??= (song, filename, index) => {
	const item = document.createElement("li");
	item.innerText = filename;
	
	if(song.index === index)
	{
		item.classList.add("playing");
	}
	
	return item;
};

function createSPCPlayerUI(){
	const SPCPlayer = window.SMWCentral.SPCPlayer.Backend;
	
	const toggle = document.getElementById("spc-player-toggle");
	const loop = document.getElementById("spc-player-loop");
	const move = document.getElementById("spc-player-move");
	const player = document.getElementById("spc-player-interface");
	const pause = player.querySelector(".pause");
	const play = player.querySelector(".play");
	const seekControl = player.querySelector(".seek");
	const seekPreview = player.querySelector(".seek > span");
	const volumeControl = player.querySelector(".volume-control");
	const volumeFill = player.querySelector(".fill");
	const volumeLabel = player.querySelector(".volume > span");
	
	let volume = Number(sessionStorage.getItem("spc_volume") || 1);
	let changingVolume = false;
	
	let currentSong = null;
	
	let finished = false;
	let timer = {target: 0, finish: 0, fade: 0, element: null};
	
	if(Number.isNaN(volume))
	{
		volume = 1;
	}
	
	const updateVolume = (event = null) => {
		if(event instanceof MouseEvent)
		{
			const range = event.target.clientWidth;
			const position = Math.min(Math.max(event.offsetX, 0), range);
			
			volume = (1.5 * position) / range;
		}
		
		volume = Math.min(Math.max(volume, 0), 1.5);
		
		SPCPlayer.setVolume(volume, Math.abs(SPCPlayer.getVolume() - volume) * 0.5);
		
		const bar = (volume / 1.5) * 100;
		volumeFill.style.clip = `rect(auto, ${(volume / 1.5) * volumeFill.clientWidth}px, auto, auto)`;
		volumeFill.style.clipPath = `polygon(0% 0%, ${bar}% 0%, ${bar}% 100%, 0% 100%)`;
		
		volumeLabel.innerText = `${Math.round(volume * 100)}%`;
	};
	
	const loadSong = (song, time = 0) => {
		if(SPCPlayer.status < 0)
		{
			SMWCentral.SPCPlayer.onError("Couldn't load SPC player.");
			return;
		}
		
		if(SPCPlayer.status !== 1)
		{
			setTimeout(() => loadSong(song, time), 15);
			return;
		}
		
		if(song == null)
		{
			document.body.classList.remove("fetching-song");
			SMWCentral.SPCPlayer.onError("Couldn't read SPC file.");
			return;
		}
		
		finished = false;
		timer.finish = 0;
		
		if(typeof song.data === "string" && song.spc == null)
		{
			const spc = window.atob(song.data);
			const spcLength = spc.length;
			const data = new Uint8Array(new ArrayBuffer(spcLength));
			
			for(let index = 0; index < spcLength; index += 1)
			{
				data[index] = spc.charCodeAt(index);
			}
			
			song.spc = data.buffer;
		}
		
		SPCPlayer.loadSPC(new Uint8Array(song.spc), time);
		updateVolume();
		
		pause.classList.remove("hidden");
		play.classList.add("hidden");
		
		const title = [song.game, song.title].filter((value) => value.trim().length > 0);
		player.querySelector("h2").innerText = (title.length > 0) ? title.join(" - ") : song.filename;
		
		const subtitle = [song.author, song.comment].filter((value) => value.trim().length > 0);
		const subtitleElement = player.querySelector("h3");
		subtitleElement.style.display = (subtitle.length > 0) ? "block" : "none";
		subtitleElement.innerText = subtitle.join(", ");
		
		const aside = [];
		
		if(song.duration > 0)
		{
			timer.target = song.duration;
			timer.fade = song.fade;
			
			const seconds = song.duration % 60;
			aside.push(`${Math.floor(song.duration / 60)}:${(seconds > 9) ? "" : "0"}${seconds} minutes`);
		}
		else
		{
			timer.target = 0;
		}
		
		if(song.date.trim().length > 0)
		{
			aside.push(`exported on ${song.date}`);
		}
		
		const asideElement = player.querySelector("aside");
		asideElement.style.display = (aside.length > 0) ? "block" : "none";
		asideElement.innerText = aside.join(", ");
		
		if(timer.target > 0)
		{
			const seconds = Math.floor(time % 60);
			
			timer.element = document.createElement("span");
			timer.element.innerText = `${Math.floor(time / 60)}:${(seconds > 9) ? "" : "0"}${seconds} / `;
			
			asideElement.insertBefore(timer.element, asideElement.firstChild);
			
			requestAnimationFrame(updateTimer);
			
			seekControl.style.display = "block";
		}
		else
		{
			seekControl.style.display = "none";
		}
		
		const playlist = player.querySelector("ul");
		
		if(song.files.length > 1)
		{
			while(playlist.lastChild !== null)
			{
				playlist.removeChild(playlist.lastChild);
			}
			
			const files = song.files;
			let common = files[0].length;
			
			for(let i = 1; i < files.length; i++)
			{
				let position = 0;
				for(; position < common && position < files[i].length && files[0][position] === files[i][position]; position++);
				
				common = position;
			}
			
			const prefix = files[0].slice(0, common).lastIndexOf("/") + 1;
			
			files.forEach((file, index) => {
				playlist.appendChild(SMWCentral.SPCPlayer.createPlaylistItem(song, file.slice(prefix), index));
			});
			
			playlist.style.display = "block";
		}
		else
		{
			playlist.style.display = "none";
		}
		
		currentSong = song;
		
		player.classList.add("shown");
		document.body.classList.remove("fetching-song");
	};
	
	const updateTimer = () => {
		if(
			timer.target <= 0
			|| timer.element.parentElement == null
			|| SPCPlayer.status !== 1
			|| SPCPlayer.spcPointer === null
		)
		{
			return;
		}
		
		const time = SPCPlayer.getTime();
		const progress = Math.min(time, timer.target);
		const seconds = Math.floor(progress % 60);
		
		timer.element.innerText = `${Math.floor(progress / 60)}:${(seconds > 9) ? "" : "0"}${seconds} / `;
		
		const percentage = (progress / timer.target) * 100;
		seekControl.style.backgroundImage = `linear-gradient(to right, #22B14C 0%, #22B14C ${percentage}%, rgba(255,255,255,.1) ${percentage}%)`;
		
		if(!finished && timer.finish > 0 && time >= timer.finish)
		{
			finished = true;
			
			pause.classList.add("hidden");
			play.classList.remove("hidden");
			
			SPCPlayer.stopSPC();
			
			return;
		}
		
		if(time > 1 && time % timer.target <= 1)
		{
			if(!loop.checked)
			{
				timer.finish = time + timer.fade / 1000;
				
				SPCPlayer.setVolume(SPCPlayer.getVolume());
				SPCPlayer.setVolume(0, timer.fade / 1000);
			}
			else
			{
				return;
			}
		}
		
		requestAnimationFrame(updateTimer);
	};
	
	const extractString = (bytes, start, length) => {
		let realLength;
		
		for(realLength = 0; realLength < length && bytes[start + realLength] !== 0; realLength += 1);
		
		return new TextDecoder("latin1").decode(bytes.slice(start, start + realLength));
	};
	
	const parseSPC = (spc) => {
		const array = new Uint8Array(spc);
		
		return {
			title: extractString(array, 0x2E, 32) || "SPC File",
			game: extractString(array, 0x4E, 32),
			comment: extractString(array, 0x7E, 32),
			date: extractString(array, 0x9E, 10),
			duration: Number(extractString(array, 0xA9, 3)),
			fade: Number(extractString(array, 0xAC, 4)),
			author: extractString(array, 0xB1, 32)
		};
	};
	
	const loadSPC = (spc) => {
		const data = parseSPC(spc);
		
		return loadSong({
			index: 0,
			files: [data.title],
			filename: data.title,
			...data,
			spc
		});
	};
	
	updateVolume();
	
	toggle.checked = (sessionStorage.getItem("spc_collapsed") === "true");
	loop.checked = (sessionStorage.getItem("spc_loop") !== "false");
	move.checked = (sessionStorage.getItem("spc_moved") === "true");
	
	toggle.addEventListener("change", (event) => {
		sessionStorage.setItem("spc_collapsed", (event.target.checked) ? "true" : "false");
	});
	
	loop.addEventListener("change", (event) => {
		if(!finished)
		{
			requestAnimationFrame(updateTimer);
		}
		
		sessionStorage.setItem("spc_loop", (event.target.checked) ? "true" : "false");
	});
	
	move.addEventListener("change", (event) => {
		sessionStorage.setItem("spc_moved", (event.target.checked) ? "true" : "false");
	});
	
	pause.addEventListener("click", () => {
		SPCPlayer.pause();
		
		pause.classList.add("hidden");
		play.classList.remove("hidden");
		
		SMWCentral.SPCPlayer.onPause();
	});
	
	play.addEventListener("click", () => {
		if(finished)
		{
			if(!document.body.classList.contains("fetching-song"))
			{
				document.body.classList.add("fetching-song");
				loadSong(currentSong);
			}
		}
		else
		{
			SPCPlayer.resume();
			
			pause.classList.remove("hidden");
			play.classList.add("hidden");
		}
		
		SMWCentral.SPCPlayer.onPlay();
	});
	
	player.querySelector(".restart").addEventListener("click", () => {
		if(document.body.classList.contains("fetching-song"))
		{
			return;
		}
		
		document.body.classList.add("fetching-song");
		loadSong(currentSong);
		
		SMWCentral.SPCPlayer.onRestart();
	});
	
	player.querySelector(".stop").addEventListener("click", () => {
		if(document.body.classList.contains("fetching-song"))
		{
			return;
		}
		
		SPCPlayer.stopSPC();
		player.classList.remove("shown");
		
		SMWCentral.SPCPlayer.onStop();
	});
	
	seekControl.addEventListener("mousemove", (event) => {
		if(timer.target <= 0)
		{
			return;
		}
		
		const range = event.target.clientWidth;
		const position = Math.min(Math.max(event.offsetX, 0), range);
		const seconds = Math.round(Math.min(Math.max((timer.target * position) / range, 0), timer.target));
		const fraction = seconds % 60;
		
		seekPreview.innerText = `${Math.floor(seconds / 60)}:${(fraction > 9) ? "" : "0"}${fraction}`;
		seekPreview.style.transform = `translate(calc(${position}px - 50%), 0)`;
	});
	
	seekControl.addEventListener("mouseup", (event) => {
		if(document.body.classList.contains("fetching-song") || timer.target <= 0)
		{
			return;
		}
		
		const range = event.target.clientWidth;
		const position = Math.min(Math.max(event.offsetX, 0), range);
		const seconds = Math.round(Math.min(Math.max((timer.target * position) / range, 0), timer.target));
		
		document.body.classList.add("fetching-song");
		loadSong(currentSong, seconds);
	});
	
	volumeControl.addEventListener("mousedown", (event) => {
		changingVolume = true;
		updateVolume(event);
	});
	
	volumeControl.addEventListener("mousemove", (event) => {
		if(changingVolume)
		{
			updateVolume(event);
		}
	});
	
	volumeControl.addEventListener("mouseleave", () => {
		changingVolume = false;
		sessionStorage.setItem("spc_volume", volume);
	});
	
	volumeControl.addEventListener("mouseup", (event) => {
		changingVolume = false;
		
		updateVolume(event);
		sessionStorage.setItem("spc_volume", volume);
	});
	
	document.body.addEventListener("click", () => {
		SPCPlayer.unlock();
	});
	
	SMWCentral.SPCPlayer.parseSPC = parseSPC;
	
	SMWCentral.SPCPlayer.loadSong = loadSong;
	SMWCentral.SPCPlayer.loadSPC = loadSPC;
	
	SMWCentral.SPCPlayer.loadFromLink = (link, options = {}) => fetch(link.href, options).then(
		(response) => response.arrayBuffer()
	).then(loadSPC);
};

if(document.readyState === "loading")
{
	document.addEventListener("DOMContentLoaded", createSPCPlayerUI);
}
else
{
	createSPCPlayerUI();
}
