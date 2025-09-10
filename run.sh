#!/bin/sh
set -e

# Go to the script's directory
cd "$(dirname "$0")"

# Run the main steps
python3 main.py deploy
python3 main.py unpack
python3 main.py render base base_top zombie zombie_top foraging foraging_top rooms objects streets

# Enter scripts/marks
cd scripts/marks

# Run locate_texture.py
python3 locate_texture.py -c /mnt/s/PZmap/conf/conf.yaml -p 16 -o sprite_lookup.json -z 128 -i sprite_map.json

# Copy the generated sprite_lookup.json into html folder
src="$(pwd)/sprite_lookup.json"
dest="$(pwd)/../../html"
cp "$src" "$dest/sprite_lookup.json"

# Back to root
cd ../..
python3 main.py deploy

echo "All done"
