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

(function()
{

SMWCentral.SPCPlayer.onPlay ??= () => {};
SMWCentral.SPCPlayer.onPause ??= () => {};
SMWCentral.SPCPlayer.onRestart ??= () => {};
SMWCentral.SPCPlayer.onStop ??= () => {};

SMWCentral.SPCPlayer.onEnd ??= () => {};

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
	const player = document.getElementById("spc-player-interface");

	const playerUI = {
		pauseBtn: player.querySelector(".pause"),
		playBtn: player.querySelector(".play"),
		stopBtn: player.querySelector(".stop"),
		restartBtn: player.querySelector(".restart"),

		details: player.querySelector(".details"),
		subtitles: player.getElementsByClassName("subtitle"),

		trackListContainer: player.querySelector('#track-list-container'),
		tracklist: player.querySelector(".track-list"),

		seekContainer: player.querySelector(".seek-container"),
		seekControl: player.querySelector(".seek"),
		seekPreview: player.querySelector(".seek-preview"),

		trackTimeElapsed: player.querySelector(".track-time-elapsed"),
		trackDuration: player.querySelector(".track-duration"),

		volumeSlider: player.querySelector("#volume-slider"),
		volumeLabel: player.querySelector(".volume-level"),
		volumeFill: player.querySelector(".volume-fill"),
		volumeThumb: player.querySelector(".volume-thumb")
	};

	let currentSong = null;

	let finished = false;
	let timer = {lastUpdatedUI: -1, target: 0, finish: 0, fade: 0, element: null};

	let volume = Number(sessionStorage.getItem("spc_volume") || 1);

	if(Number.isNaN(volume))
	{
		volume = 1;
	}

	playerUI.volumeSlider.min = 0;
	playerUI.volumeSlider.max = 1.5;
	playerUI.volumeSlider.step = 0.01;
	playerUI.volumeSlider.value = volume;

	const updateVolumeSlider = () => {
		const trackWidth = playerUI.volumeSlider.clientWidth;
		const percent = volume / 1.5;
		const thumbWidth = playerUI.volumeThumb.getBoundingClientRect().width;

		if (!thumbWidth) return;

		const clampedLeft = Math.min(trackWidth - thumbWidth / 2, Math.max(thumbWidth / 2, percent * trackWidth));

		playerUI.volumeFill.style.clipPath = `inset(0 ${100 - percent * 100}% 0 0)`;
		playerUI.volumeThumb.style.left = `${clampedLeft}px`;
		playerUI.volumeLabel.innerText = `${Math.round(volume * 100)}%`;

		SPCPlayer.setVolume(volume, Math.abs(SPCPlayer.getVolume() - volume) * 0.5);
		sessionStorage.setItem("spc_volume", volume.toString());
	};

	const updateVolume = (event = null) => {
		if(event instanceof Event && event.type === "input")
		{
			let newVolume = parseFloat(playerUI.volumeSlider.value);

			if(Math.abs(newVolume - 1.5) < 0.05)
			{
				newVolume = 1.5;
			}
			else if(Math.abs(newVolume - 1) < 0.05)
			{
				newVolume = 1;
			}
			else if(Math.abs(newVolume - 0.5) < 0.025)
			{
				newVolume = 0.5;
			}
			volume = Math.min(Math.max(newVolume, 0), 1.5);
		}
		updateVolumeSlider();
	};

	// hack to set slider position on load
	const initVolumeSlider = () => {
		if (playerUI.volumeThumb.getBoundingClientRect().width) {
			playerUI.volumeSlider.value = volume;
			updateVolumeSlider();
		} else {
			requestAnimationFrame(initVolumeSlider);
		}
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

		playerUI.pauseBtn.classList.remove("hidden");
		playerUI.playBtn.classList.add("hidden");

		const title = [song.game, song.title].filter((value) => value.trim().length > 0);
		const titleElements = player.getElementsByClassName("title");
		for (let i = 0; i < titleElements.length; i++) {
			titleElements[i].innerText = (title.length > 0) ? title.join(" - ") : song.filename;
		}

		const subtitle = [song.author, song.comment].filter((value) => value.trim().length > 0);

		for (let i = 0; i < playerUI.subtitles.length; i++) {
			if (subtitle.length > 0) {
				playerUI.subtitles[i].innerHTML = "";
				playerUI.subtitles[i].innerText = subtitle.join(", ");
			} else {
				playerUI.subtitles[i].innerHTML = '<i style="opacity:0.5;">No Track Info</i>';
			}
		}

		// fill track details
		const date = song.date.trim();

		if (date) {
			playerUI.details.innerText = `Exported on ${date}`;
		} else {
			playerUI.details.innerHTML = '<i style="opacity:0.5;">No Track Details</i>';
		}

		// display duration
		if(song.duration > 0)
		{
			timer.target = song.duration;

			const seconds = song.duration % 60;
			playerUI.trackDuration.innerText = `${Math.floor(song.duration / 60)}:${(seconds > 9) ? "" : "0"}${seconds}`;
		}
		else
		{
			timer.target = 0;
		}

		// display time elapsed
		if(timer.target > 0)
		{
			const seconds = Math.floor(time % 60);
			playerUI.trackTimeElapsed.innerText = `${Math.floor(time / 60)}:${(seconds > 9) ? "" : "0"}${seconds}`;
			playerUI.trackTimeElapsed.style.opacity = `1`
		}
		else
		{
			playerUI.trackTimeElapsed.innerText = `ERR`
			playerUI.trackTimeElapsed.style.opacity = `0.5`
		}

		// fill track list
		if(song.files.length > 1)
		{
			while(playerUI.tracklist.lastChild !== null)
			{
				playerUI.tracklist.removeChild(playerUI.tracklist.lastChild);
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
				playerUI.tracklist.appendChild(SMWCentral.SPCPlayer.createPlaylistItem(song, file.slice(prefix), index));
			});
			playerUI.trackListContainer.classList.remove("hidden");
		}
		else
		{
			playerUI.trackListContainer.classList.add("hidden");
		}

		currentSong = song;

		player.classList.add("shown");
		document.body.classList.remove("fetching-song");
	};

	const updateTimer = () => {
		if(
			timer.target <= 0
			|| SPCPlayer.status !== 1
			|| SPCPlayer.spcPointer === null
		)
		{
			return;
		}

		const time = SPCPlayer.getTime();

		if(!finished && timer.finish > 0 && time >= timer.finish)
		{
			finished = true;

			playerUI.pauseBtn.classList.add("hidden");
			playerUI.playBtn.classList.remove("hidden");

			SPCPlayer.stopSPC();

			SMWCentral.SPCPlayer.onEnd();

			return;
		}

		if(time > 1 && time % timer.target <= 1 && !loop.checked)
		{
			timer.finish = time + timer.fade / 1000;

			SPCPlayer.setVolume(SPCPlayer.getVolume());
			SPCPlayer.setVolume(0, timer.fade / 1000);
		}
	};

	const updateUI = () => {
		requestAnimationFrame(updateUI);

		if(
			timer.target <= 0
			|| SPCPlayer.status !== 1
			|| SPCPlayer.spcPointer === null
		)
		{
			playerUI.seekControl.style.backgroundImage = `none`; // reset seek bar
			return;
		}

		const time = SPCPlayer.getTime();
		const progress = Math.min(time, timer.target);
		const seconds = Math.floor(progress % 60);

		if(timer.lastUpdatedUI !== time)
		{
			timer.lastUpdatedUI = time;

			playerUI.trackTimeElapsed.innerText = `${Math.floor(progress / 60)}:${(seconds > 9) ? "" : "0"}${seconds}`;

			const percentage = (progress / timer.target) * 100;
			playerUI.seekControl.style.backgroundImage = `linear-gradient(to right, var(--seek_fill) 0%, var(--seek_fill) ${percentage}%, var(--seek_bar) ${percentage}%)`;
		}
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
	initVolumeSlider();

	// player state listeners
	toggle.checked = (sessionStorage.getItem("spc_collapsed") === "true");
	toggle.addEventListener("change", (event) => {
		sessionStorage.setItem("spc_collapsed", (event.target.checked) ? "true" : "false");
	});

	loop.checked = (sessionStorage.getItem("spc_loop") !== "false");
	loop.addEventListener("change", (event) => {
		sessionStorage.setItem("spc_loop", (event.target.checked) ? "true" : "false");
	});

	// volume control listeners
	playerUI.volumeSlider.addEventListener("input", updateVolume);

	playerUI.volumeSlider.addEventListener("wheel", (e) => {
		e.preventDefault();
		const step = 0.05;
		if (e.deltaY < 0) {
			volume = Math.min(1.5, volume + step);
		} else {
			volume = Math.max(0, volume - step);
		}
		playerUI.volumeSlider.value = volume.toFixed(2);
		updateVolumeSlider();
	});

	// playback control listeners
	playerUI.pauseBtn.addEventListener("click", () => {
		SPCPlayer.pause();

		playerUI.pauseBtn.classList.add("hidden");
		playerUI.playBtn.classList.remove("hidden");

		SMWCentral.SPCPlayer.onPause();
	});

	playerUI.playBtn.addEventListener("click", () => {
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

			playerUI.pauseBtn.classList.remove("hidden");
			playerUI.playBtn.classList.add("hidden");
		}

		SMWCentral.SPCPlayer.onPlay();
	});

	playerUI.restartBtn.addEventListener("click", () => {
		if(document.body.classList.contains("fetching-song"))
		{
			return;
		}

		document.body.classList.add("fetching-song");
		loadSong(currentSong);

		SMWCentral.SPCPlayer.onRestart();
	});

	playerUI.stopBtn.addEventListener("click", () => {
		if(document.body.classList.contains("fetching-song"))
		{
			return;
		}

		SPCPlayer.stopSPC();
		player.classList.remove("shown");

		SMWCentral.SPCPlayer.onStop();
	});

	// seek control listeners
	playerUI.seekControl.addEventListener("mousemove", (event) => {
		if(timer.target <= 0)
		{
			return;
		}

		const range = event.target.clientWidth;
		const position = Math.min(Math.max(event.offsetX, 0), range);
		const seconds = Math.round(Math.min(Math.max((timer.target * position) / range, 0), timer.target));
		const fraction = seconds % 60;

		playerUI.seekPreview.innerText = `${Math.floor(seconds / 60)}:${(fraction > 9) ? "" : "0"}${fraction}`;
		playerUI.seekPreview.style.transform = `translate(calc(${position}px - 50%), 0)`;
	});

	playerUI.seekControl.addEventListener("mouseup", (event) => {
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

	document.body.addEventListener("click", () => {
		SPCPlayer.unlock();
	});

	setInterval(updateTimer, 500);
	requestAnimationFrame(updateUI);

	SMWCentral.SPCPlayer.parseSPC = parseSPC;

	SMWCentral.SPCPlayer.loadSong = loadSong;
	SMWCentral.SPCPlayer.loadSPC = loadSPC;

	SMWCentral.SPCPlayer.loadFromLink = (link, options = {}) => fetch(link.href, options).then(
		(response) => response.arrayBuffer()
	).then(loadSPC);
};

// function to allow the player window to be dragged
function dragSPCPlayer(element, handle) {
	let isDragging = false;
	let startX = 0,
		startY = 0;
	let currentX = 0,
		currentY = 0;
	let offsetX = 0,
		offsetY = 0;

	// drag with mouse
	handle.addEventListener("mousedown", (e) => {
		if (e.target.closest(".header-button")) return;

		e.preventDefault();
		isDragging = true;

		startX = e.clientX - offsetX;
		startY = e.clientY - offsetY;

		document.addEventListener("mousemove", onMouseMove);
		document.addEventListener("mouseup", stopDragging);
	});

	function onMouseMove(e) {
		if (!isDragging) return;

		currentX = e.clientX - startX;
		currentY = e.clientY - startY;
		offsetX = currentX;
		offsetY = currentY;

		element.style.transform = `translate3d(${currentX}px, ${currentY}px, 0)`;
	}

	function stopDragging() {
		isDragging = false;
		document.removeEventListener("mousemove", onMouseMove);
		document.removeEventListener("mouseup", stopDragging);
	}

	// drag on touch (on not phones)
	if (window.innerWidth >= 768) {
		handle.addEventListener("touchstart", (e) => {
			if (e.target.closest(".header-button")) return;

			isDragging = true;
			const touch = e.touches[0];
			startX = touch.clientX - offsetX;
			startY = touch.clientY - offsetY;

			document.addEventListener("touchmove", onTouchMove, {passive: false});
			document.addEventListener("touchend", stopTouchDragging);
		});

		function onTouchMove(e) {
			if (!isDragging) return;
			e.preventDefault();

			const touch = e.touches[0];
			currentX = touch.clientX - startX;
			currentY = touch.clientY - startY;
			offsetX = currentX;
			offsetY = currentY;

			element.style.transform = `translate3d(${currentX}px, ${currentY}px, 0)`;
		}

		function stopTouchDragging() {
			isDragging = false;
			document.removeEventListener("touchmove", onTouchMove);
			document.removeEventListener("touchend", stopTouchDragging);
		}
	}

	// reset position
	function resetPosition() {
		offsetX = 0;
		offsetY = 0;
		element.style.transform = `translate3d(0,0,0)`;
	}
	return {resetPosition};
}

const player = document.getElementById("spc-player-interface");
const header = player.querySelector("#spc-player-header");
const closeBtn = player.querySelector(".close");

closeBtn.addEventListener("click", () => {
	dragSPCPlayer(player, header).resetPosition();
});

// display an overflow indicator for long track lists
function trackListOverflow() {
	const player = document.getElementById("spc-player-interface");

	const trackList = player.querySelector('#track-list-container');
	const scrollbox = trackList.querySelector('.track-list-scrollbox');
	const topIndicator = trackList.querySelector('.overflow-indicator.top');
	const btmIndicator = trackList.querySelector('.overflow-indicator.bottom');

	function updateOverflowDisplay() {
		const { scrollTop, clientHeight, scrollHeight } = scrollbox;
		topIndicator.classList.toggle('visible', scrollTop > 0);
		btmIndicator.classList.toggle('visible', scrollTop + clientHeight < scrollHeight);
	}

	if (scrollbox.scrollHeight > scrollbox.clientHeight) {
		btmIndicator.classList.add('visible');
	}

	const observer = new MutationObserver(() => updateOverflowDisplay());
	observer.observe(scrollbox, { childList: true, subtree: true });

	scrollbox.addEventListener('scroll', updateOverflowDisplay);

	updateOverflowDisplay();
}

if(document.readyState === "loading")
{
	document.addEventListener("DOMContentLoaded", () => {
		createSPCPlayerUI();
		dragSPCPlayer(player, header);
		trackListOverflow();
	});
}
else
{
	createSPCPlayerUI();
	dragSPCPlayer(player, header);
	trackListOverflow();
}

})();
