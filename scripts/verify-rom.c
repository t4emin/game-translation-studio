#include <mgba/core/core.h>
#include <mgba/core/config.h>
#include <mgba/core/log.h>
#include <mgba-util/vfs.h>
#include <stdio.h>
#include <stdlib.h>
#include <fcntl.h>

static void quietLog(struct mLogger *logger, int category, enum mLogLevel level, const char *format, va_list args) {
    (void)logger; (void)category;
    if (level == mLOG_FATAL) { vfprintf(stderr, format, args); exit(5); }
}

int main(int argc, char **argv) {
    if (argc < 3) { fprintf(stderr, "Usage: verify-rom ROM OUTPUT_DIRECTORY [FRAMES]\n"); return 1; }
    struct mLogger logger = { .log = quietLog };
    mLogSetDefaultLogger(&logger);
    struct mCore *core = mCoreFind(argv[1]);
    if (!core || !core->init(core)) return 2;
    mCoreConfigInit(&core->config, "gts-verification");
    mCoreConfigSetDefaultIntValue(&core->config, "skipBios", 1);
    mCoreConfigSetDefaultIntValue(&core->config, "mute", 1);
    mCoreLoadConfig(core);
    color_t *pixels = calloc(240 * 160, sizeof(color_t));
    core->setVideoBuffer(core, pixels, 240);
    if (!mCoreLoadFile(core, argv[1])) return 3;
    core->reset(core);
    int frames = argc > 3 ? atoi(argv[3]) : 6000;
    for (int frame = 0; frame < frames; ++frame) {
        unsigned keys = 0;
        if (frame == 200 || frame == 600 || frame == 4800 || frame == 6000) keys = 8;
        else if (frame > 600 && frame % 180 < 4) keys = 1;
        core->setKeys(core, keys);
        core->runFrame(core);
        if (frame % 180 == 179) {
            char path[1024];
            snprintf(path, sizeof(path), "%s/frame-%05d.png", argv[2], frame);
            struct VFile *file = VFileOpen(path, O_WRONLY | O_CREAT | O_TRUNC);
            if (!file || !mCoreTakeScreenshotVF(core, file)) return 4;
            file->close(file);
        }
    }
    printf("Ran %d frames; game code: ", frames);
    char code[16] = {0}; core->getGameCode(core, code); puts(code);
    core->deinit(core);
    free(pixels);
    return 0;
}
