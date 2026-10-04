# PlatformIO's mklittlefs for macOS is an Intel binary, even in the
# "darwin_arm64" package, so on an Apple Silicon Mac without Rosetta
# `pio run -t uploadfs` fails with "Bad CPU type". If a native mklittlefs is
# on PATH (`brew install mklittlefs`), use that instead. Its images mount on
# the board: the framework's esp_littlefs 1.14 reads littlefs disk v2.1.
Import("env")

import os
import platform
import shutil
import subprocess

def rosetta_runs():
    try:
        return subprocess.run(["arch", "-x86_64", "/usr/bin/true"], capture_output=True).returncode == 0
    except OSError:
        return False

if platform.system() == "Darwin" and platform.machine() == "arm64" and not rosetta_runs():
    packages = os.path.expanduser("~/.platformio")
    path = os.pathsep.join(p for p in os.environ.get("PATH", "").split(os.pathsep) if not p.startswith(packages))
    native = shutil.which("mklittlefs", path=path)
    if native:
        env.Replace(MKFSTOOL=native)
    else:
        print("mklittlefs: PlatformIO's is Intel-only and Rosetta is not installed. `brew install mklittlefs`.")
