import sys
import os
import json

_BASE_DIR = os.path.dirname(os.path.abspath(__file__))
sys.path.append(os.path.join(_BASE_DIR, "../.."))
_DEFAULT_CONF = os.path.join(_BASE_DIR, "../../conf/conf.yaml")
import main
from pzmap2dzi import lotheader, cell, mptask


class SearchCell(object):
    def __init__(self, path, textures, texture_to_marker=None):
        self.path = path
        self.textures = textures
        self.texture_to_marker = texture_to_marker or {}

    def on_job(self, job):
        x, y = job
        c = cell.load_cell(self.path, x, y)
        if not c:
            return []
        marks = []
        for sx in range(c.cell_size):
            for sy in range(c.cell_size):
                for layer in range(c.minlayer, c.maxlayer):
                    square = c.get_square(sx, sy, layer)
                    if not square:
                        continue
                    for t in square:
                        if t in self.textures:
                            wx = x * c.cell_size + sx
                            wy = y * c.cell_size + sy
                            marker_names = self.texture_to_marker.get(t, [t])
                            # Create a mark for each marker name that uses this texture
                            for marker_name in marker_names:
                                marks.append(
                                    {
                                        "type": "point",
                                        "name": marker_name,
                                        "x": wx,
                                        "y": wy,
                                        "layer": layer,
                                    }
                                )
        return marks


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description="texture locator")
    parser.add_argument("-c", "--conf", type=str, default=_DEFAULT_CONF)
    parser.add_argument("-p", "--parallel", type=int, default=16)
    parser.add_argument("-o", "--output", type=str, default="./output.json")
    parser.add_argument("-z", "--no-zoom-limit", type=int, default=128)
    parser.add_argument(
        "-i",
        "--input",
        type=str,
        help="JSON file containing marker definitions with textures",
    )
    parser.add_argument("textures", nargs=argparse.REMAINDER)
    args = parser.parse_args()

    # Load marker definitions from JSON file if provided
    texture_to_marker = {}
    markers_data = {}
    if args.input:
        print("Loading marker definitions from [{}]".format(args.input))
        with open(args.input, "r") as f:
            markers_data = json.load(f)

        # Create mapping from texture to marker names (one texture can map to multiple markers)
        textures = set()
        for marker_name, marker_info in markers_data.items():
            if "textures" in marker_info:
                for texture in marker_info["textures"]:
                    if texture not in texture_to_marker:
                        texture_to_marker[texture] = []
                    texture_to_marker[texture].append(marker_name)
                    textures.add(texture)
        print(
            "Loaded {} markers with {} total textures".format(
                len(markers_data), len(textures)
            )
        )
    else:
        # Use command line textures (original behavior)
        textures = set(args.textures)
        for texture in textures:
            texture_to_marker[texture] = [texture]

    print("Textures to locate: [ {} ]".format(", ".join(list(textures))))
    map_path = main.get_map_path(args.conf, "default")
    print("Loading cell headers from [{}]".format(map_path))
    headers = lotheader.load_all_headers(map_path)
    print("Total cell headers: {}".format(len(headers)))

    jobs = []
    for (x, y), header in headers.items():
        for texture in header["tiles"]:
            if texture in textures:
                jobs.append((x, y))
                break
    print("Cells containing targets: {}".format(len(jobs)))
    task = mptask.Task(
        SearchCell(map_path, textures, texture_to_marker),
        mptask.SplitScheduler(verbose=True),
    )
    result = task.run(jobs, args.parallel)
    raw_marks = [m for sub in result for m in sub]
    print("Total raw marks found: {}".format(len(raw_marks)))

    # Group marks by marker name, include layer in coordinates
    grouped_marks = {}
    for mark in raw_marks:
        marker_name = mark["name"]

        if marker_name not in grouped_marks:
            grouped_marks[marker_name] = {"type": mark["type"], "coordinates": []}
        grouped_marks[marker_name]["coordinates"].append(
            {"x": mark["x"], "y": mark["y"], "layer": mark["layer"]}
        )

    # Filter out adjacent coordinates for each marker
    def is_adjacent(coord1, coord2):
        x_diff = abs(coord1["x"] - coord2["x"])
        y_diff = abs(coord1["y"] - coord2["y"])
        layer_diff = abs(coord1["layer"] - coord2["layer"])

        # Adjacent means one of:
        # 1. Same layer, X or Y differs by 1 (horizontally/vertically adjacent)
        # 2. Same X,Y position but layer differs by 1 (stacked vertically)
        same_layer_adjacent = (layer_diff == 0) and (
            (x_diff == 1 and y_diff == 0) or (x_diff == 0 and y_diff == 1)
        )
        stacked_adjacent = x_diff == 0 and y_diff == 0 and layer_diff == 1

        return same_layer_adjacent or stacked_adjacent

    filtered_marks = {}
    total_filtered_count = 0
    for marker_name, marker_data in grouped_marks.items():
        coordinates = marker_data["coordinates"]
        # Sort coordinates for consistent processing (layer, then x, then y)
        coordinates.sort(key=lambda c: (c["layer"], c["x"], c["y"]))

        filtered_coords = []
        for coord in coordinates:
            # Check if this coordinate is adjacent to any already kept coordinate
            is_too_close = any(
                is_adjacent(coord, kept_coord) for kept_coord in filtered_coords
            )
            if not is_too_close:
                filtered_coords.append(coord)

        if filtered_coords:  # Only include markers that have at least one coordinate
            filtered_marks[marker_name] = {
                "type": marker_data["type"],
                "coordinates": filtered_coords,
            }
            total_filtered_count += len(filtered_coords)
            print(
                "Marker '{}': {} locations (filtered from {})".format(
                    marker_name, len(filtered_coords), len(coordinates)
                )
            )

    print("Total filtered marks: {}".format(total_filtered_count))

    # Apply zoom limit if needed
    if args.no_zoom_limit and total_filtered_count >= args.no_zoom_limit:
        for marker_data in filtered_marks.values():
            marker_data["visible_zoom_level"] = 2

    if args.output:
        with open(args.output, "w") as f:
            json.dump(filtered_marks, f, indent=2)
        print(
            "{} marker type(s) with {} total location(s) saved to [{}]".format(
                len(filtered_marks), total_filtered_count, args.output
            )
        )
