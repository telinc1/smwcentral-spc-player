#!/bin/bash

if [ ! -x "$(which emcc)" ]; then
	echo "Emscripten compiler frontend (emcc) not found" >&2
	exit 1
fi

BABEL="./node_modules/.bin/babel"
SASS="./node_modules/.bin/sass"

if [ ! -x "$BABEL" ] || [ ! -x "$SASS" ]; then
	echo "NPM modules not installed" >&2
	exit 1
fi

if [ "$1" = "--dev" ]; then
	$SASS --embed-source-map --no-charset src/spc_player.scss dist/spc_player.css
else
	$SASS --style=compressed --no-source-map --no-charset src/spc_player.scss dist/spc_player.css
fi

$BABEL -o pre/spc_player.js src/spc_player.js
$BABEL -o pre/interface.js src/interface.js

EMCC_FLAGS="-O3"

if [ "$1" = "--dev" ]; then
	EMCC_FLAGS="-O0"
fi

[ $? -eq 0 ] \
&& mkdir -p dist \
&& emcc $EMCC_FLAGS --pre-js pre/spc_player.js --pre-js pre/interface.js \
	-s NO_EXIT_RUNTIME -s ENVIRONMENT=web -s "EXPORTED_FUNCTIONS=['_main', '_malloc', '_free', '_loadSPC', '_playSPC']" \
	-I.. src/spc_player.c src/snes_spc/*cpp -o dist/spc.js
