# SMW Central SPC Player

[![Latest Stable Version](https://img.shields.io/npm/v/@smwcentral/spc-player)](https://www.npmjs.com/package/@smwcentral/spc-player)
[![License](https://img.shields.io/npm/l/@smwcentral/spc-player)](https://github.com/telinc1/smwcentral-spc-player/blob/master/LICENSE)

The online SNES SPC700 player used by [SMW Central](https://www.smwcentral.net).

* [Usage](#usage)
  * [Loading SPC files](#loading-spc-files)
  * [Playlists](#playlists)
  * [Events](#events)
  * [Custom interface](#custom-interface)
* [Building](#building)
* [License](#license)
* [Credits](#credits)

## Usage

Load the stylesheet and the SPC player script:

```html
<link rel="stylesheet" href="https://unpkg.com/@smwcentral/spc-player@2.0.0/dist/spc_player.css">
<script src="https://unpkg.com/@smwcentral/spc-player@2.0.0/dist/spc.js"></script>
```

You must also include the HTML from [spc_player.html](https://github.com/telinc1/smwcentral-spc-player/blob/master/src/spc_player.html) somewhere on the page.

After the DOM is ready, the `SMWCentral.SPCPlayer` namespace will be globally available.

### Loading SPC files

You can call:
- `SMWCentral.SPCPlayer.loadFromLink` with an `HTMLAnchorElement` (i.e. an `<a>` element) to fetch and play its `href` (which should be an SPC file).
- `SMWCentral.SPCPlayer.loadSPC` with an `ArrayBuffer` containing an SPC file.
- `SMWCentral.SPCPlayer.loadSong` with a song data object.

The song data objects used by `loadSong` have the following structure:

```typescript
interface Song {
    index: number; /* Index of the song within the playlist */
    files: string[]; /* Filenames in the playlist */
    filename: string; /* Filename of the SPC */
    title: string;
    game: string;
    comment: string;
    date: string;
    duration: number;
    fade: number; /* Fade-out duration before ending the SPC (if not looping) */
    author: string;
    spc?: ArrayBuffer; /* SPC file to play */
    data?: string; /* If `spc` is `undefined`, base64-encoded SPC file to play */
}
```

### Playlists

Two steps are necessary to show a playlist in the SPC player.

First, you have to play the SPC using the low-level `SMWCentral.SPCPlayer.loadSong`. Set `index`, `files`, and `filename` appropriately. To make this easier, you can use `SMWCentral.SPCPlayer.parseSPC` to extract the ID666 tags from an `ArrayBuffer` containing an SPC file.

To make the playlist items interactive, set `SMWCentral.SPCPlayer.createPlaylistItem` to a function that returns an `HTMLLIElement` (i.e. an `<li>` element). This function will be given, in order, the song that's currently playing (as a song data object), a filename of an SPC (from the `files` property of the `song`), and the index of that file within the playlist.

### Events

If the player runs into an error, `SMWCentral.SPCPlayer.onError` will be called with an error message. By default, the message is directly passed into `window.alert`.

When a button in the interface is clicked, the following functions are called:

- `SMWCentral.SPCPlayer.onPlay`
- `SMWCentral.SPCPlayer.onPause`
- `SMWCentral.SPCPlayer.onRestart`
- `SMWCentral.SPCPlayer.onStop`

If the user turns off looping, `SMWCentral.SPCPlayer.onEnd` is called when the SPC ends.

### Custom interface

You can use any HTML and CSS for the SPC player. Check `src/interface.js` for a list of elements that must exist.

## Building

Building requires the Emscripten SDK. Execute `npm run build` to compile production-ready files in `dist/`, or `npm run build-dev` for an unminified development build.

## License

Released under the [GNU Lesser General Public License v2.1](https://github.com/telinc1/smwcentral-spc-player/blob/master/LICENSE).

## Credits

Built and maintained by [Telinc1](https://github.com/telinc1). SMW Central is property of [Noivern](https://smwc.me/u/6651).

Uses [Blargg's snes_spc library](http://www.slack.net/~ant/libs/audio.html#snes_spc) and logic from [cosinusoidally's snes_spc_js](https://github.com/cosinusoidally/snes_spc_js), both licensed under the GNU Lesser General Public License v2.1.
