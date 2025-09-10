@echo off
pushd %~dp0

python main.py deploy
python main.py unpack
python main.py render base base_top zombie zombie_top foraging foraging_top rooms objects streets

cd scripts/marks
python locate_texture.py -c S:\PZmap\conf\conf.yaml -p 16 -o sprite_lookup.json -z 128 -i sprite_map.json

set "src=%cd%\sprite_lookup.json"
set "dest=%cd%\..\..\html"
copy "%src%" "%dest%\sprite_lookup.json" /Y
cd ..\..
python main.py deploy

echo All done
popd
pause