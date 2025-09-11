import os
import re
import json
import struct
import sqlite3
import flask

app = flask.Flask(__name__)

# ---------- config ----------

def load_conf(config_path=None):
    if config_path is None:
        dir_path = os.path.dirname(os.path.realpath(__file__))
        config_path = os.path.join(dir_path, 'server_config.txt')
    conf = {}
    if os.path.isfile(config_path):
        with open(config_path, 'r') as f:
            for line in f:
                if '=' in line:
                    key, value = line.strip().split('=', 1)
                    conf[key] = value
    if 'save_path' in conf:
        conf['save_path'] = os.path.expandvars(conf['save_path'])
    return conf

# Load config at import time so gunicorn workers inherit it.
for k, v in load_conf().items():
    app.config[k] = v

# ---------- version/layout maps ----------

SIGNATURE_MAP = {
    (300, 300, 8): 'B41',
    (256, 256, 32): 'B42',
}
PATH_MAP = {
    'map': {
        'B42': 'map',
        'B41': '.',
    },
    'chunkdata': {
        'B42': 'chunkdata',
        'B41': '.',
    },
    'zpop': {
        'B42': 'zpop',
        'B41': '.',
    },
    'apop': {
        'B42': 'apop',
        'B41': '.',
    },
}
CELL_IN_BLOCK = {
    'B41': 30,
    'B42': 32,
}

def get_version(path):
    map_bin = os.path.join(path, 'map.bin')
    if os.path.exists(map_bin):
        with open(map_bin, 'rb') as f:
            data = f.read()
        if len(data) < 12:
            return 'unknown'
        cx, cy, layer = struct.unpack('>iii', data[:12])
        return SIGNATURE_MAP.get((cx, cy, layer), 'unknown')
    return 'unknown'

# ---------- utility ----------

def _os_open(path):
    # Open directory in the platform’s default file browser
    if not path:
        return 1
    if os.name == 'nt':
        cmd = f'start "" "{path}"'
    elif sys.platform == 'darwin':
        cmd = f'open "{path}"'
    else:
        cmd = f'xdg-open "{path}"'
    return os.system(cmd)

def remove_bin(save_path, mode, version, x, y):
    folder = PATH_MAP[mode].get(version, '.')
    name = os.path.join(save_path, folder, f'{mode}_{x}_{y}.bin')
    if os.path.isfile(name):
        print(f'delete {mode} {x},{y}')
        os.remove(name)

# ---------- routes ----------

@app.route('/browse')
def browse():
    path = app.config.get('save_path', None)
    rc = _os_open(path)
    if rc == 0:
        return ""
    flask.abort(404)

@app.route('/list_save')
def list_save():
    path = app.config.get('save_path', None)
    saves = []
    if path and os.path.isdir(path):
        for mode in os.listdir(path):
            mode_dir = os.path.join(path, mode)
            if not os.path.isdir(mode_dir):
                continue
            for save in os.listdir(mode_dir):
                save_dir = os.path.join(mode_dir, save)
                if os.path.isdir(save_dir):
                    saves.append(os.path.join(mode, save))
    return json.dumps(saves)

MAP = re.compile(r'^map_(\d+)_(\d+)\.bin$')

@app.route('/load/<path:save>')
def load(save):
    base = app.config.get('save_path', None)
    if not base:
        return flask.jsonify({'version': 'unknown', 'blocks': ''})
    save_path = os.path.join(base, save)
    if not os.path.isdir(save_path):
        return flask.jsonify({'version': 'unknown', 'blocks': ''})

    version = get_version(save_path)
    blocks = []
    folder = PATH_MAP['map'].get(version, '.')
    scan_dir = os.path.join(save_path, folder)
    if os.path.isdir(scan_dir):
        for f in os.listdir(scan_dir):
            m = MAP.match(f)
            if m:
                x, y = map(int, m.groups())
                blocks.append(f'{x},{y}')
    return flask.jsonify({'version': version, 'blocks': ';'.join(blocks)})

@app.route('/delete/<path:save>', methods=['POST'])
def delete_save(save):
    if flask.request.method != 'POST':
        return ''

    base = app.config.get('save_path', None)
    if not base:
        return ''
    save_path = os.path.join(base, save)
    if not os.path.isdir(save_path):
        return ''

    cell = []
    cell_str = flask.request.form.get('cells', None)
    if cell_str:
        for c in cell_str.split(';'):
            if not c:
                continue
            x, y = map(int, c.split(','))
            cell.append((x, y))

    block = []
    block_str = flask.request.form.get('blocks', None)
    if block_str:
        for c in block_str.split(';'):
            if not c:
                continue
            x, y = map(int, c.split(','))
            block.append((x, y))

    print(f'trimming [{save}]')
    if app.debug:
        print('req: ', flask.request.form)

    version = get_version(save_path)
    cb = CELL_IN_BLOCK.get(version, 0)

    vehicles = None
    cursor = None
    if flask.request.form.get('vehicles', False):
        db_path = os.path.join(save_path, 'vehicles.db')
        if os.path.isfile(db_path):
            vehicles = sqlite3.connect(db_path)
            cursor = vehicles.cursor()

    # Delete whole blocks
    for x, y in block:
        remove_bin(save_path, 'map', version, x, y)
        if cursor:
            sql = f'DELETE FROM vehicles WHERE wx = {x} AND wy = {y};'
            cursor.execute(sql)

    # Delete by cells
    for x, y in cell:
        types = ['chunkdata', 'zpop']
        if flask.request.form.get('animals', False):
            types.append('apop')

        for t in types:
            remove_bin(save_path, t, version, x, y)

        if cursor and cb:
            sql = (
                'DELETE FROM vehicles '
                f'WHERE wx >= {x * cb} AND wx < {(x + 1) * cb} '
                f'AND wy >= {y * cb} AND wy < {(y + 1) * cb};'
            )
            cursor.execute(sql)

        if cb:
            for i in range(cb):
                for j in range(cb):
                    bx = x * cb + i
                    by = y * cb + j
                    remove_bin(save_path, 'map', version, bx, by)

    if vehicles:
        vehicles.commit()
        vehicles.close()

    return 'done'

@app.route('/<path:filename>.js')
def serve_js(filename):
    file_path = f'{filename}.js'
    return flask.send_from_directory('.', file_path, mimetype='application/javascript')

@app.route('/')
def maybe_root():
    index = 'pzmap.html'
    if os.path.isfile(os.path.join('.', index)):
        return flask.send_from_directory('.', index)
    return '', 204

@app.route('/<path:filename>')
def static_files(filename):
    return flask.send_from_directory('.', filename)

# No __main__ server start: Gunicorn will import app from this module.
