#include <emscripten.h>

#include <assert.h>
#include <string.h>
#include <stdlib.h>
#include <stdio.h>

#include "snes_spc_js/snes_spc/spc.h"

/* If str is not NULL, prints it and exits program, otherwise returns. */
void error(const char* str);

void loadSPC(void* spc, long spcSize);
void playSPC(short* buffer, int bufferSize);

SNES_SPC* spcPlayer;
SPC_Filter* filter;

void error(const char* str)
{
	if(str)
	{
		fprintf(stderr, "Error: %s\n", str);
		EM_ASM(SMWCentral.SPCPlayer.Backend.status = -1);
		exit(EXIT_FAILURE);
	}
}

int main(int argc, char** argv)
{
	spcPlayer = spc_new();
	filter = spc_filter_new();
	
	if(!spcPlayer || !filter)
	{
		error("Couldn't create SPC player");
		return 1;
	}

	EM_ASM({
		try {
			SMWCentral.SPCPlayer.Backend.initialize();
		}catch(error){
			SMWCentral.SPCPlayer.Backend.status = -1;
			console.error(error);
		}
	});

	return 0;
}

void EMSCRIPTEN_KEEPALIVE loadSPC(void* spc, long spcSize)
{
	if(!spcPlayer || !filter)
	{
		error("No SPC player created");
		return;
	}
	
	error(spc_load_spc(spcPlayer, spc, spcSize));

	spc_clear_echo(spcPlayer);
	spc_filter_clear(filter);
}

void EMSCRIPTEN_KEEPALIVE playSPC(short* buffer, int bufferSize)
{
	if(!spcPlayer || !filter)
	{
		error("No SPC player created");
		return;
	}

	error(spc_play(spcPlayer, bufferSize, buffer));
	spc_filter_run(filter, buffer, bufferSize);
}

void EMSCRIPTEN_KEEPALIVE skipSPC(int seconds)
{
	if(!spcPlayer || !filter)
	{
		error("No SPC player created");
		return;
	}

	spc_skip(spcPlayer, seconds * 64000); // 32 kHz stereo
}
