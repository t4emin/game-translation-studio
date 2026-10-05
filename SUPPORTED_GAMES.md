# Supported Games

| Game | Revision | Export-ready | Thai translation | Emulator-verified |
| --- | --- | --- | --- | --- |
| Pokemon FireRed USA/Europe | Rev 1 / BPRE | Yes (FULL) | 3,881 of 3,881 buildable entries (100%): dialogue/story and battle messages. Menus and Pokedex pages are not buildable yet | Boot and opening scene only |
| Pokemon Emerald USA/Europe | BPEE | Yes (experimental) | 795 of 4,454 extracted messages (about 18%); the rest keep the original English | No |
| The Legend of Zelda: The Minish Cap (USA) | BZME | Yes (experimental) | 2,460 of 2,460 translatable messages (100%); 445 names and staff credits stay in English | No |

"Export-ready" means a rebuilt `.gba` can be downloaded and the build passes validation.
Untranslated entries keep the original text on export.

Exact input SHA-256:
`729041b940afe031302d630fdbe57c0c145f3f7b6d9b8eca5e98678d0ca4d059`.

Supported: 3,481 dialogue/story entries and 400 battle messages, Thai glyph generation, text
relocation, new ROM export, persistent translation progress and name preservation.

Unchanged: names, battle menus, menus, Pokedex pages, descriptions, specialized help
screens and unmatched resources.
No other revisions are FULL support. Other `.gba` files may enter generic
analysis mode, but injection and rebuild are blocked until an adapter exists.
PSP, PS2, ISO and CSO are not V1 targets.

mGBA verification covers boot and the translated opening scene, not a full-game
playthrough. See [ROM_PIPELINE.md](ROM_PIPELINE.md).
