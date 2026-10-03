# `pio run -t uploadfs` erases and writes the last data partition with a
# filesystem subtype. That must be the app's partition ("spiffs"), never the
# family's ("state"), or updating the app would wipe the family. Checked on
# every build, so a reordered partitions.csv fails loudly instead.
Import("env")

import csv
import os

table = os.path.join(env.subst("$PROJECT_DIR"), env.GetProjectOption("board_build.partitions"))
rows = []
with open(table) as f:
    for row in csv.reader(line for line in f if line.strip() and not line.lstrip().startswith("#")):
        rows.append([cell.strip() for cell in row])

filesystems = [r for r in rows if r[1] == "data" and r[2] in ("spiffs", "fat", "littlefs")]
if not filesystems or filesystems[-1][0] != "spiffs":
    print("partitions.csv: uploadfs would write to '%s', not the app's 'spiffs' partition. "
          "Keep 'spiffs' as the last filesystem partition." % (filesystems[-1][0] if filesystems else "nothing"))
    env.Exit(1)
