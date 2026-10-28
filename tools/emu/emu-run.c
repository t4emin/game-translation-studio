// Headless mGBA runner: emu-run <rom> <script> [save.sav]
// script commands: run N | hold KEYS N | shot out.ppm | savestate f | loadstate f
// KEYS: A B SELECT START RIGHT LEFT UP DOWN R L joined with '+'
#include <mgba/core/core.h>
#include <mgba/core/config.h>
#include <mgba/core/serialize.h>
#include <mgba/gba/core.h>
#include <mgba-util/vfs.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

static int keyBit(const char *k) {
  static const char *names[] = {"A","B","SELECT","START","RIGHT","LEFT","UP","DOWN","R","L"};
  for (int i = 0; i < 10; i++) if (!strcmp(k, names[i])) return 1 << i;
  return 0;
}
static uint32_t parseKeys(char *s) {
  uint32_t m = 0; char *t = strtok(s, "+");
  while (t) { m |= keyBit(t); t = strtok(NULL, "+"); }
  return m;
}
int main(int argc, char **argv) {
  if (argc < 3) { fprintf(stderr, "usage: emu-run rom script [save]\n"); return 2; }
  struct mCore *core = mCoreFind(argv[1]);
  if (!core) { fprintf(stderr, "no core\n"); return 1; }
  core->init(core);
  mCoreInitConfig(core, NULL);
  mCoreLoadFile(core, argv[1]);
  if (argc > 3) { struct VFile *sav = VFileOpen(argv[3], O_CREAT | O_RDWR); if (sav) core->loadSave(core, sav); }
  unsigned w, h; core->desiredVideoDimensions(core, &w, &h);
  uint32_t *buf = calloc(w * h, 4);
  core->setVideoBuffer(core, (color_t *)buf, w);
  core->reset(core);
  FILE *sc = fopen(argv[2], "r"); char line[512];
  while (fgets(line, sizeof line, sc)) {
    char cmd[32], a[256]; int n = 0;
    if (sscanf(line, "%31s", cmd) != 1) continue;
    if (!strcmp(cmd, "run")) { sscanf(line, "%*s %d", &n); core->setKeys(core, 0); for (int i = 0; i < n; i++) core->runFrame(core); }
    else if (!strcmp(cmd, "hold")) { sscanf(line, "%*s %255s %d", a, &n); core->setKeys(core, parseKeys(a)); for (int i = 0; i < n; i++) core->runFrame(core); core->setKeys(core, 0); }
    else if (!strcmp(cmd, "shot")) {
      sscanf(line, "%*s %255s", a); FILE *f = fopen(a, "wb"); fprintf(f, "P6\n%u %u\n255\n", w, h);
      for (unsigned i = 0; i < w * h; i++) { uint32_t p = buf[i]; fputc(p & 0xFF, f); fputc((p >> 8) & 0xFF, f); fputc((p >> 16) & 0xFF, f); }
      fclose(f);
    }
    else if (!strcmp(cmd, "savestate")) { sscanf(line, "%*s %255s", a); struct VFile *v = VFileOpen(a, O_CREAT | O_TRUNC | O_RDWR); mCoreSaveStateNamed(core, v, SAVESTATE_SAVEDATA | SAVESTATE_SCREENSHOT); v->close(v); }
    else if (!strcmp(cmd, "loadstate")) { sscanf(line, "%*s %255s", a); struct VFile *v = VFileOpen(a, O_RDONLY); if (v) { mCoreLoadStateNamed(core, v, SAVESTATE_SAVEDATA); v->close(v); } }
  }
  core->deinit(core);
  return 0;
}
