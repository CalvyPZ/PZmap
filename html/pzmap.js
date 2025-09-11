var g; // globals vars
var globals; // module
var map; // module
var c; // module coordinates
var util; // module
var i18n; // module
var ui; // module
var marker; // module
var svg_draw; // module
var osd_draw; // module
var search; // module
var pmodules = [
    import("./pzmap/globals.js").then((m) => {
        g = m.g;
        globals = m;
        return m.init();
    }),
    import("./pzmap/map.js").then((m) => {
        map = m;
    }),
    import("./pzmap/coordinates.js").then((m) => {
        c = m;
    }),
    import("./pzmap/marker.js").then((m) => {
        marker = m;
    }),
    import("./pzmap/i18n.js").then((m) => {
        i18n = m;
        return m.init();
    }),
    import("./pzmap/util.js").then((m) => {
        util = m;
    }),
    import("./pzmap/ui.js").then((m) => {
        ui = m;
    }),
    import("./pzmap/mark/svg_draw.js").then((m) => {
        svg_draw = m;
    }),
    import("./pzmap/mark/osd_draw.js").then((m) => {
        osd_draw = m;
    }),
    import("./pzmap/search.js").then((m) => {
        search = m;
    })
];

window.addEventListener("keydown", (event) => {onKeyDown(event);});

function initUI() {
    g.UI = ui.createUI();
    util.changeStyle('.iso-only-btn', 'display', g.map_type == 'top' ? 'none' : 'inline-block');
    updateLayerSelector();
    for (const type of ['zombie', 'foraging', 'rooms', 'objects', 'streets']) {
        const uiContainer = document.getElementById(type + '_ui');
        const btn = document.getElementById(type + '_btn');
        if (g.overlays[type]) {
            if (uiContainer) {
                uiContainer.innerHTML = g.UI[type].html;
            }
            if (btn) {
                btn.classList.add('active');
            }
        } else {
            if (uiContainer) {
                uiContainer.innerHTML = '';
            }
            if (btn) {
                btn.classList.remove('active');
            }
        }
    }
    const uiContainer = document.getElementById('grid_ui');
    const btn = document.getElementById('grid_btn');
    if (g.gridui) {
        if (uiContainer) {
            uiContainer.innerHTML = g.UI.grid.html;
        }
        if (btn) {
            btn.classList.add('active');
        }
    } else {
        if (uiContainer) {
            uiContainer.innerHTML = '';
        }
        if (btn) {
            btn.classList.remove('active');
        }
    }
    
    // Initialize POI button state
    const poisBtn = document.getElementById('pois_btn');
    if (g.poisui) {
        if (poisBtn) {
            poisBtn.classList.add('active');
        }
    } else {
        if (poisBtn) {
            poisBtn.classList.remove('active');
        }
    }
    if (g.overlays.foraging || g.overlays.objects) {
        document.getElementById('legends').style.display = '';
    } else {
        document.getElementById('legends').style.display = 'none';
    }

    updateViewSwitcher();

    util.setOutput('main_output', 'Green', '');
    document.body.style.background = 'black';
}

function updateMainOutput() {
    if (g.load_error) {
        util.setOutput('main_output', 'red', '<b>' + i18n.E('MapMissingType') + '</b>');
    } else {
        util.setOutput('main_output', 'green', '');
    }
}

function initOSD() {
    g.load_error = 0;
    const options = {
        drawer: 'canvas',
        opacity: 1,
        element: document.getElementById('map_div'),
        tileSources: globals.getRoot() + 'base' + g.base_map.suffix + '/layer0.dzi',
        homeFillsViewer: true,
        showZoomControl: true,
        constrainDuringPan: true,
        visibilityRatio: 0.5,
        prefixUrl: 'openseadragon/images/',
        navigatorBackground: 'black',
        minZoomImageRatio: 0.5,
        maxZoomPixelRatio: 2 * g.base_map.scale
    };
    if (g.base_map.type == 'top') {
        options.imageSmoothingEnabled = false;
        options.maxZoomPixelRatio = 16 * g.base_map.scale;
    }
    g.viewer = OpenSeadragon(options);

    g.viewer.addHandler('add-item-failed', (event) => {
        const sourcePath = event.source.split('/');
        const type = sourcePath[sourcePath.length - 2];
        if (!['rooms', 'objects'].includes(type)) {
            g.load_error = 1;
        }
        updateMainOutput();
    });

    g.viewer.addHandler('update-viewport', function() {
        const zoomChange = g.grid.update(g.viewer);
        g.range = c.getCanvasRange(true);
        if (zoomChange) {
            marker.updateZoom();
            svg_draw.updateZoom();
            osd_draw.updateZoom();
        }


        if (g.gridui) {
            g.grid.draw(g.currentLayer);
        }

        svg_draw.updateViewport(g.viewer, g.base_map);
        for (const marker of [g.marker, g.sys_marker, g.debug_marker]) {
            if (marker) {
                marker.redrawAll();
            }
        }

        g.base_map.redrawMarks(g.overlays);
        for (const map of g.mod_maps) {
            map.redrawMarks(g.overlays);
        }
        if (zoomChange) {
            forceRedraw();
        }
    });

    //g.viewer.addHandler('zoom', function(event) {});

    g.viewer.addHandler('canvas-press', function(event) {
        // Canvas press event handler
    });

    g.viewer.addHandler('canvas-drag', function(event) {
        // Canvas drag event handler
    });

    g.viewer.addHandler('canvas-release', function(event) {
        // Canvas release event handler
    });

    g.viewer.addHandler('canvas-click', function(event) {
        if (event.quick) {
            // Canvas click event handler
        }
    });

    g.viewer.addHandler('canvas-scroll', function(event) {
        if (event.originalEvent.shiftKey) {
            g.currentLayer += event.scroll;
            updateLayerSelector();
            onLayerSelect();
            event.preventDefaultAction = true;
        }
    });

    if (!g.query_string.debug) {
        const nullfunction = (e) => {};
        OpenSeadragon.console = {
            log:    nullfunction,
            debug:  nullfunction,
            info:   nullfunction,
            warn:   nullfunction,
            error:  nullfunction,
            assert: nullfunction
        };
    }
}

function init(callback=null) {
    globals.reset();
    svg_draw.init();
    if (!g.marker) {
        g.marker = new marker.MarkManager({ indexType: 'rtree', enableEdit: false });
    } else {
        g.marker.clearRenderCache();
    }
    if (!g.sys_marker) {
        g.sys_marker = new marker.MarkManager({ onlyCurrentLayer: true });
    } else {
        g.sys_marker.clearRenderCache();
    }
    if (!g.debug_marker) {
        g.debug_marker = new marker.MarkManager({ renderOptions: { renderMethod: 'svg' } });
    } else {
        g.debug_marker.clearRenderCache();
    }
    g.base_map = new map.Map(globals.getRoot(), g.map_type, '');
    return g.base_map.init().then(function(b) {
        g.map_type = b.type;
        g.grid = new c.Grid(b);
        initUI();
        updateClip();
        initOSD();
        i18n.update('id');
        g.marker.changeMode(g.map_type);
        //g.sys_marker.changeMode(); // sys_marker does not use rtree index, always 'top' mode

        return new Promise(function(resolve, reject) {
            g.viewer.addOnceHandler('tile-loaded', function(e) {
                let p = new Promise(function(res, rej) {
                    const img = e.tiledImage;
                    img.addOnceHandler('fully-loaded-change', function(e) {
                        img.setOpacity(0);
                        res();
                    });
                });
                g.viewer.canvas.addEventListener('pointermove', onPointerMove);
                initCoordinatesUpdater();
                updateMaps(g.currentLayer);
                
                // Update the view switcher button after loading
                updateViewSwitcher();
                
                // Load POI markers after map is ready
                const poiPromise = loadPOIMarkers();
                
                // Set up search functionality
                search.setupSearchEvents(g);
                
                // Initialize search container visibility based on POI state
                const searchContainer = document.getElementById('search-container');
                if (searchContainer) {
                    if (g.poisui) {
                        searchContainer.classList.remove('hidden');
                    } else {
                        searchContainer.classList.add('hidden');
                    }
                }
                
                // Check for URL coordinates and pan/zoom to them
                checkAndPanFromURL();
                
                g.sys_marker.redrawAll();
                g.debug_marker.redrawAll();
                if (callback) {
                    p = Promise.all([p, poiPromise, callback()]);
                } else {
                    p = Promise.all([p, poiPromise]);
                }
                p.then(() => { 
                    resolve(e);
                    // Process any pending item search after everything is loaded
                    if (g.pendingItemSearch) {
                        setTimeout(() => {
                            // Only process if POIs are enabled, otherwise markers won't be visible
                            if (g.poisui) {
                                handleItemSearchFromURL(g.pendingItemSearch);
                            } else {
                                console.log('⏳ Container search ready. Enable POIs to see results.');
                                // Keep the search for when POIs are enabled
                                return;
                            }
                            g.pendingItemSearch = null;
                        }, 100); // Small delay to ensure everything is fully ready
                    }
                });
            });
        });
    });
}

/**
 * Checks for URL coordinates and automatically pans and zooms to that location
 * URL Format: 
 * - ?XxY or ?XxYxZ (coordinates)
 * - ?item={container_type}~{room} (container search)
 * Where X = pixel X coordinate, Y = pixel Y coordinate, Z = zoom level (0-max, optional, defaults to 7)
 * Example: ?12800x9600x5 or ?12800x9600 or ?item=fridge~kitchen
 */
function checkAndPanFromURL() {
    const query = window.location.search.substring(1);
    
    if (!query) {
        return;
    }
    
    // Check if this is an item search query - defer until after page load
    if (query.startsWith('item=')) {
        // Store the query for later processing after map is fully loaded
        g.pendingItemSearch = query;
        return;
    }
    
    const parts = query.split("x").map(Number);
    
    if (parts.length < 2 || isNaN(parts[0]) || isNaN(parts[1])) {
        console.error("Invalid query string format. Expected 'XxYxZ', 'XxY', or 'item={container_type}~{room}'.");
        return;
    }
    
    let pixelX = parts[0];
    let pixelY = parts[1];
    const Z = parts.length > 2 && !isNaN(parts[2]) ? parts[2] : 7;
    
    if (!g.base_map || typeof g.base_map.cell2pixel !== "function") {
        console.error("Base map or required methods are not initialized.");
        return;
    }
    
    // Convert pixel coordinates to grid coordinates (same as old system)
    const gridX = pixelX / 256;
    const gridY = pixelY / 256;
    
    // Use base map's cell2pixel method to get image coordinates
    const { x: imageX, y: imageY } = g.base_map.cell2pixel(gridX, gridY);
    
    if (!g.base_map.scale) {
        console.error("Base map scale is not initialized.");
        return;
    }
    
    // Get the tiled image and convert to viewport coordinates
    const tiledImage = g.viewer.world.getItemAt(0);
    if (!tiledImage) {
        console.error("No tiled image found.");
        return;
    }
    
    const viewportPoint = tiledImage.imageToViewportCoordinates(imageX, imageY);
    
    // Pan to the location
    g.viewer.viewport.panTo(viewportPoint, true);
    
    // Calculate and set zoom level based on Z parameter
    const maxZoom = g.viewer.viewport.getMaxZoom();
    const minZoom = g.viewer.viewport.getMinZoom();
    const layerZoom = minZoom + (Z / g.base_map.layers) * (maxZoom - minZoom);
    g.viewer.viewport.zoomTo(layerZoom, viewportPoint, true);
    
    // Create a marker for the linked coordinates using the new marker system
    const urlMarker = {
        id: 'url-coordinate-marker',
        name: 'Linked Coordinates',
        desc: 'Coordinate marker based on your link.',
        x: pixelX,
        y: pixelY,
        type: 'point',
        color: 'red',
        background: 'rgba(255, 0, 0, 0.3)',
        text_position: 'none',
        visible_zoom_level: 0,
        layer: 0,
        class_list: ['url-marker']
    };
    
    // Store the URL marker for POI toggle management
    if (!g.urlMarkers) {
        g.urlMarkers = [];
    }
    g.urlMarkers = [urlMarker]; // Replace any existing URL marker
    
    // Add the marker to the main marker system only if POIs are enabled
    if (g.poisui && g.marker) {
        g.marker.load([urlMarker]);
        console.log(`Panned to coordinates: ${pixelX}, ${pixelY} with zoom level: ${Z} and added marker`);
    } else {
        console.log(`Panned to coordinates: ${pixelX}, ${pixelY} with zoom level: ${Z}. Enable POIs to see the coordinate marker.`);
    }
}

/**
 * Handles item search from URL format: ?item={container_type}~{room}
 * @param {string} query - The query string (e.g., "item=fridge~kitchen")
 */
async function handleItemSearchFromURL(query) {
    // Parse the query: item={container_type}~{room}
    const itemPart = query.substring(5); // Remove "item="
    const parts = itemPart.split('~');
    
    if (parts.length !== 2) {
        console.error("Invalid item query format. Expected 'item={container_type}~{room}'.");
        return;
    }
    
    const containerType = parts[0].toLowerCase();
    const roomName = parts[1].toLowerCase();
    
    console.log(`🔍 Loading ${containerType} containers in rooms matching: ${roomName}...`);
    
    try {
        // Load the container data
        const containerData = await loadContainerData(containerType);
        if (!containerData) {
            console.warn(`❌ Container type '${containerType}' not found.`);
            return;
        }
        
        // Wait for room data to be available
        await waitForRoomData();
        
        // Find matching rooms
        const matchingRooms = findMatchingRooms(roomName);
        if (matchingRooms.length === 0) {
            console.warn(`❌ No rooms found matching: ${roomName}`);
            return;
        }
        
        // Find containers within matching rooms
        const matchingContainers = findContainersInRooms(containerData, matchingRooms);
        if (matchingContainers.length === 0) {
            console.warn(`❌ No ${containerType} containers found in rooms matching: ${roomName}`);
            return;
        }
        
        console.log(`✅ Found ${matchingContainers.length} ${containerType} containers in ${matchingRooms.length} matching rooms`);
        
        // Add container markers (no panning - just show all like "Show All Results")
        addContainerMarkers(matchingContainers, containerType, roomName);
        
    } catch (error) {
        console.error('❌ Error processing container search:', error);
    }
}

/**
 * Loads container data from processed_containers folder
 * @param {string} containerType - The container type (e.g., "fridge", "barbecue")
 * @returns {Promise<Object|null>} Container data or null if not found
 */
async function loadContainerData(containerType) {
    try {
        const response = await fetch(`./processed_containers/${containerType}_processed_containers.json`);
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const data = await response.json();
        return data[containerType]; // Return the specific container type data
    } catch (error) {
        console.error(`Failed to load container data for ${containerType}:`, error);
        return null;
    }
}

/**
 * Waits for room data to be available in the map (optimized with max retries)
 * @returns {Promise<void>}
 */
async function waitForRoomData() {
    return new Promise((resolve, reject) => {
        let retries = 0;
        const maxRetries = 50; // Max 5 seconds (50 * 100ms)
        
        const checkRoomData = () => {
            if (g.base_map && g.base_map.marks && g.base_map.marks.rooms && g.base_map.marks.rooms.db) {
                resolve();
            } else if (retries >= maxRetries) {
                console.error('Timeout waiting for room data to be available');
                reject(new Error('Room data not available'));
            } else {
                retries++;
                setTimeout(checkRoomData, 100);
            }
        };
        checkRoomData();
    });
}

/**
 * Finds rooms that match the given room name
 * @param {string} roomName - The room name to search for
 * @returns {Array} Array of matching room objects
 */
function findMatchingRooms(roomName) {
    if (!g.base_map || !g.base_map.marks || !g.base_map.marks.rooms) {
        console.error('Room data not available');
        return [];
    }
    
    const roomMarks = g.base_map.marks.rooms.db.all();
    const matchingRooms = [];
    
    roomMarks.forEach(room => {
        const roomNameLower = (room.name || '').toLowerCase();
        // Check if room name contains the search term
        if (roomNameLower.includes(roomName)) {
            matchingRooms.push(room);
        }
    });
    
    return matchingRooms;
}

/**
 * Finds containers that are within the bounds of matching rooms
 * @param {Object} containerData - Container data with coordinates array
 * @param {Array} matchingRooms - Array of room objects
 * @returns {Array} Array of container coordinates that match
 */
function findContainersInRooms(containerData, matchingRooms) {
    if (!containerData || !containerData.coordinates) {
        return [];
    }
    
    const matchingContainers = [];
    
    containerData.coordinates.forEach(container => {
        // Check if container coordinates are within any matching room
        for (const room of matchingRooms) {
            if (isContainerInRoom(container, room)) {
                matchingContainers.push({
                    ...container,
                    roomId: room.id,
                    roomName: room.name
                });
                break; // Don't add the same container multiple times
            }
        }
    });
    
    return matchingContainers;
}

/**
 * Checks if a container coordinate is within a room's bounds
 * @param {Object} container - Container with x, y, layer properties
 * @param {Object} room - Room object with either rects or x,y coordinates
 * @returns {boolean} True if container is within room bounds
 */
function isContainerInRoom(container, room) {
    // Handle room with rectangles (most common case)
    if (room.rects && room.rects.length > 0) {
        return room.rects.some(rect => {
            return container.x >= rect.x && 
                   container.x <= rect.x + rect.width &&
                   container.y >= rect.y && 
                   container.y <= rect.y + rect.height;
        });
    }
    
    // Handle room with direct coordinates (less common)
    // For point rooms, we'll use a small radius for matching
    if (room.x !== undefined && room.y !== undefined) {
        const radius = 50; // 50 pixel radius for point rooms
        const distance = Math.sqrt(
            Math.pow(container.x - room.x, 2) + 
            Math.pow(container.y - room.y, 2)
        );
        return distance <= radius;
    }
    
    return false;
}

/**
 * Adds markers for found containers - identical to tile search markers
 * @param {Array} containers - Array of container coordinates
 * @param {string} containerType - The container type name
 * @param {string} roomName - The searched room name
 */
function addContainerMarkers(containers, containerType, roomName) {
    const containerMarkers = containers.map((container, index) => ({
        id: `container-${containerType}-${index}`,
        name: `${containerType} in ${container.roomName || roomName}`,
        desc: `${containerType} container at layer ${container.layer}`,
        x: container.x,
        y: container.y,
        type: 'point',
        color: 'cyan',
        background: 'rgba(0, 255, 255, 0.4)',
        text_position: 'none',
        visible_zoom_level: 0, // Always show container markers at all zoom levels
        layer: container.layer,
        class_list: ['search-marker', 'search-tile'] // Use same classes as tile search markers
    }));
    
    // Load markers into the marker system (same as tile search markers)
    g.marker.load(containerMarkers);
    
    // Store references for cleanup in search markers system (same as tile search)
    if (!g.searchMarkers) {
        g.searchMarkers = [];
    }
    const markerIds = containerMarkers.map(m => m.id);
    g.searchMarkers.push(...markerIds);
    
    console.log(`Added ${containerMarkers.length} container markers for ${containerType}`);
}


function loadPOIMarkers() {
    return fetch('./poi.json')
        .then(response => response.json())
        .then(pois => {
            const markers = pois.map(poi => {
                // Convert POI format to marker format
                const isAlwaysShow = poi.ID.startsWith('3');
                if (isAlwaysShow) {
                    // 3000 series - Text only markers
                    return {
                        id: poi.ID,
                        name: poi.name,
                        desc: poi.description, // Use desc property as expected by the marker system
                        x: poi.x,
                        y: poi.y,
                        location: poi.location,
                        tags: poi.tags || [],
                        type: 'text', // Text type for 3000 series
                        color: '#FFD700', // Gold color
                        background: 'transparent',
                        text_position: 'center',
                        font: 'bold 18px Arial, sans-serif', // Slightly smaller font
                        visible_zoom_level: 0, // Always show
                        layer: 0, // Show on all layers
                        class_list: ['poi-marker', 'poi-text'] // Add class for hover targeting
                    };
                } else {
                    // Regular POIs - Point markers only (no text)
                    return {
                        id: poi.ID,
                        name: poi.name,
                        desc: poi.description, // Use desc property as expected by the marker system
                        x: poi.x,
                        y: poi.y,
                        location: poi.location,
                        tags: poi.tags || [],
                        type: 'point', // Point type for dot markers
                        color: 'yellow', // Yellow border
                        background: 'rgba(255, 243, 17, 0.3)', // Semi-transparent yellow background
                        text_position: 'none', // Hide text, only show on hover
                        visible_zoom_level: 1, // Show from further out
                        layer: 0, // Show on all layers
                        class_list: ['poi-marker', 'poi-point'] // Add class for hover targeting
                    };
                }
            });
            
            // Store POI markers for later toggling
            g.poiMarkers = markers;
            
            // Load markers into the marker system
            g.marker.load(markers);
            console.log(`Loaded ${markers.length} POI markers from poi.json`);
            
            // Set up POI hover tooltips after a small delay to ensure DOM is ready
            setTimeout(() => {
                setupPOIHoverTooltips();
            }, 100);
            
            return Promise.resolve();
        })
        .catch(error => {
            console.error('Failed to load POI markers:', error);
            return Promise.resolve();
        });
}

function setupPOIHoverTooltips() {
    // Create tooltip element
    const tooltip = document.createElement('div');
    tooltip.id = 'poi-tooltip';
    tooltip.style.cssText = `
        position: fixed;
        background: #2e2e2e;
        color: white;
        padding: 10px 14px;
        border-radius: 6px;
        font-size: 14px;
        font-family: Arial, sans-serif;
        z-index: 10000;
        pointer-events: none;
        display: none;
        max-width: 300px;
        box-shadow: 0 4px 16px rgba(0, 0, 0, 0.5);
        border: 1px solid #444;
        line-height: 1.4;
    `;
    document.body.appendChild(tooltip);
    
    // Add CSS for POI markers
    const style = document.createElement('style');
    style.textContent = `
        /* Point markers (non-3000 series) - reduced by 25% from previous size */
        .poi-point {
            width: 18px !important;
            height: 18px !important;
            border-radius: 50% !important;
            border: 2px solid yellow !important;
            background-color: rgba(255, 243, 17, 0.3) !important;
            cursor: pointer !important;
            pointer-events: auto !important;
            box-shadow: 0 2px 6px rgba(0, 0, 0, 0.3) !important;
        }
        
        /* SVG circle markers - reduced by 25% from previous size */
        .poi-point circle {
            r: 9 !important;
            stroke-width: 2px !important;
            stroke: yellow !important;
            fill: rgba(255, 243, 17, 0.3) !important;
        }
        
        /* Text markers (3000 series) - reduced by 25% from previous size */
        .poi-text {
            background: transparent !important;
            border: none !important;
            pointer-events: auto !important;
            cursor: pointer !important;
            text-shadow: 1px 1px 2px rgba(0, 0, 0, 0.8) !important;
            transform: scale(1.125) !important; /* 1.5 * 0.75 = 1.125 */
            transform-origin: center !important;
        }
        
        /* Fix for duplicate markers */
        .poi-marker + .poi-marker[id$="-1"] {
            display: none !important;
        }
    `;
    document.head.appendChild(style);
    
    // Enable pointer events for POI markers and set up hover handlers
    const observer = new MutationObserver(() => {
        const poiElements = document.querySelectorAll('.poi-marker');
        poiElements.forEach(element => {
            // Enable pointer events for POI markers
            element.style.pointerEvents = 'auto';
            element.style.cursor = 'pointer';
            
            // Remove default title attribute to prevent browser tooltip
            element.removeAttribute('title');
            
            // Add hover event listeners if not already added
            if (!element.hasAttribute('data-poi-hover-setup')) {
                element.setAttribute('data-poi-hover-setup', 'true');
                
                element.addEventListener('mouseenter', (e) => {
                    // Extract marker ID from element ID (format: mark-point-{id}-{index})
                    const elementId = e.target.id;
                    const idParts = elementId.split('-');
                    const markId = idParts.length >= 3 ? idParts[2] : null;
                    
                    if (markId) {
                        const poi = g.marker.db.get(markId);
                        if (poi) {
                            const tooltipContent = `
                                <div style="font-weight: bold; color: white; margin-bottom: 6px; border-bottom: 1px solid #555; padding-bottom: 4px;">${poi.name}</div>
                                ${poi.desc ? `<div style="color: #bbb; font-size: 12px; line-height: 1.3;">${poi.desc}</div>` : ''}
                            `;
                            tooltip.innerHTML = tooltipContent;
                            tooltip.style.display = 'block';
                            
                            // Position tooltip
                            positionTooltip(e, tooltip);
                        }
                    }
                });
                
                element.addEventListener('mouseleave', () => {
                    tooltip.style.display = 'none';
                });
                
                element.addEventListener('mousemove', (e) => {
                    if (tooltip.style.display === 'block') {
                        positionTooltip(e, tooltip);
                    }
                });
            }
        });
    });
    
    // Start observing for POI marker elements
    observer.observe(document.body, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['class']
    });
    
    console.log('POI hover tooltips initialized');
}

function positionTooltip(event, tooltip) {
    const tooltipRect = tooltip.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    
    let left = event.clientX + 15;
    let top = event.clientY - 10;
    
    // Adjust horizontal position if tooltip would go off-screen
    if (left + tooltipRect.width > viewportWidth) {
        left = event.clientX - tooltipRect.width - 15;
    }
    
    // Adjust vertical position if tooltip would go off-screen
    if (top + tooltipRect.height > viewportHeight) {
        top = event.clientY - tooltipRect.height - 15;
    }
    
    // Ensure tooltip doesn't go negative
    if (left < 5) left = 5;
    if (top < 5) top = 5;
    
    tooltip.style.left = left + 'px';
    tooltip.style.top = top + 'px';
}


function forceRedraw() {
    g.viewer.forceRedraw();
    g.viewer.raiseEvent('update-viewport', {});
}

// layer selector
function updateLayerSelector() {
    const s = document.getElementById('layer_selector')
    for (let i = s.options.length - 1; i >= 0; i--) {
        s.remove(i);
    }
    g.minLayer = g.base_map.minlayer;
    g.maxLayer = g.base_map.maxlayer;
    for (const mod_map of g.mod_maps) {
        if (g.minLayer > mod_map.minlayer) {
            g.minLayer = mod_map.minlayer;
        }
        if (g.maxLayer < mod_map.maxlayer) {
            g.maxLayer = mod_map.maxlayer;
        }
    }
    for (let i = g.minLayer; i < g.maxLayer; i++) {
        const o = document.createElement('option');
        o.value = i;
        o.text = i18n.E('Floor', i);
        s.appendChild(o);
    }
    if (g.currentLayer >= g.maxLayer) {
        g.currentLayer = g.maxLayer - 1;
    }
    if (g.currentLayer < g.minLayer) {
        g.currentLayer = g.minLayer;
    }
    s.selectedIndex = g.currentLayer - g.minLayer;
}

function onLayerSelect() {
    const layer = Number(document.getElementById('layer_selector').value);
    updateMaps(layer);
    g.marker.redrawAll();
}

// roof opacity
function updateRoofOpacity() {
    const slider = document.getElementById('roof_opacity_slider');
    const label = document.querySelector('.slider-label');
    g.roof_opacity = slider.value;
    slider.title = i18n.E('RoofOpacity');
    if (label) {
        label.textContent = `Roof Layer Opacity: ${slider.value}%`;
    }
    updateMaps(g.currentLayer);
}




function updateClip() {
    g.base_map.setClipByOtherMaps(g.mod_maps, g.currentLayer);
    for (let i = 0; i < g.mod_maps.length; i++) {
        g.mod_maps[i].setClipByOtherMaps(g.mod_maps.slice(i + 1), g.currentLayer);
    }
}

function updateMaps(layer) {
    g.currentLayer = layer;
    g.base_map.setBaseLayer(layer);
    g.base_map.setOverlayLayer(g.overlays, layer);
    for (let i = 0; i < g.mod_maps.length; i++) {
        g.mod_maps[i].setBaseLayer(layer);
        g.mod_maps[i].setOverlayLayer(g.overlays, layer);
    }
}





// grid
function toggleGrid() {
    if (g.gridui) {
        g.gridui = 0;
        document.getElementById('grid_btn').classList.remove('active');
    } else {
        g.gridui = 1;
        document.getElementById('grid_btn').classList.add('active');
        g.viewer.raiseEvent('update-viewport', {});
    }
    forceRedraw();
}

// POIs
function togglePOIs() {
    if (g.poisui) {
        g.poisui = 0;
        document.getElementById('pois_btn').classList.remove('active');
        // Hide POI markers by removing them
        if (g.marker && g.poiMarkers) {
            for (const poi of g.poiMarkers) {
                g.marker.remove(poi.id);
            }
        }
        // Hide URL coordinate markers
        if (g.marker && g.urlMarkers) {
            for (const urlMarker of g.urlMarkers) {
                g.marker.remove(urlMarker.id);
            }
        }
        // Hide locked coordinate markers
        if (g.marker && g.lockedMarkers) {
            for (const lockedMarker of g.lockedMarkers) {
                g.marker.remove(lockedMarker.id);
            }
        }
        // Also clear search markers when POIs are hidden (includes container markers)
        search.clearPurpleMarkers(g);
        
        // Hide search container when POIs are disabled
        const searchContainer = document.getElementById('search-container');
        if (searchContainer) {
            searchContainer.classList.add('hidden');
        }
    } else {
        g.poisui = 1;
        document.getElementById('pois_btn').classList.add('active');
        // Show POI markers by loading them back
        if (g.marker && g.poiMarkers) {
            g.marker.load(g.poiMarkers);
            // Re-setup hover tooltips for POI markers
            setTimeout(() => {
                setupPOIHoverTooltips();
            }, 100);
        }
        // Show URL coordinate markers
        if (g.marker && g.urlMarkers) {
            g.marker.load(g.urlMarkers);
            // Set up hover tooltips for URL markers too
            setTimeout(() => {
                setupPOIHoverTooltips();
            }, 100);
        }
        // Show locked coordinate markers
        if (g.marker && g.lockedMarkers) {
            g.marker.load(g.lockedMarkers);
            // Set up hover tooltips for locked markers too
            setTimeout(() => {
                setupPOIHoverTooltips();
            }, 100);
        }
        // Show search container when POIs are enabled
        const searchContainer = document.getElementById('search-container');
        if (searchContainer) {
            searchContainer.classList.remove('hidden');
        }
        
        // Process any pending container search when POIs are enabled
        if (g.pendingItemSearch) {
            setTimeout(() => {
                handleItemSearchFromURL(g.pendingItemSearch);
                g.pendingItemSearch = null;
            }, 100);
        }
    }
}

// overlay maps
function toggleOverlay(type) {
    g.overlays[type] = !g.overlays[type];
    if (g.overlays[type]) {
        document.getElementById(type + '_btn').classList.add('active');
        const uiContainer = document.getElementById(type + '_ui');
        if (uiContainer) {
            uiContainer.innerHTML = g.UI[type].html;
            i18n.update('id', g.UI[type].ids);
        }
    } else {
        document.getElementById(type + '_btn').classList.remove('active');
        const uiContainer = document.getElementById(type + '_ui');
        if (uiContainer) {
            uiContainer.innerHTML = '';
        }
    }
    if (g.overlays.foraging || g.overlays.objects) {
        document.getElementById('legends').style.display = '';
    } else {
        document.getElementById('legends').style.display = 'none';
    }
    updateMaps(g.currentLayer);
}








// coordinates


function onPointerMove(event) {
    const mouse = OpenSeadragon.getMousePosition(event);
    const offset = OpenSeadragon.getElementOffset(g.viewer.canvas);
    g.position = {position: mouse.minus(offset)};
    if (g.position) {
        [g.sx, g.sy] = c.getSquare(g.position);
    }
    updateCoordinatesSidebar(mouse.minus(offset));
}

function updateCoordinatesSidebar(position) {
    const coordsDiv = document.getElementById('mouse-coordinates');
    if (coordsDiv && g.position) {
        // Don't update coordinates if they're locked
        if (!coordinatesLocked) {
            const [sx, sy] = c.getSquare(g.position);
            coordsDiv.textContent = `X: ${sx}, Y: ${sy}`;
        }
    }
}

function initCoordinatesUpdater() {
    const coordsDiv = document.getElementById('mouse-coordinates');
    if (coordsDiv) {
        coordsDiv.addEventListener('click', function() {
            if (g.position) {
                const [sx, sy] = c.getSquare(g.position);
                const coords = `${sx}x${sy}`;
                
                // Try to copy to clipboard
                if (navigator.clipboard) {
                    navigator.clipboard.writeText(coords).then(() => {
                        const originalText = coordsDiv.textContent;
                        coordsDiv.textContent = 'Copied successfully!';
                        setTimeout(() => {
                            coordsDiv.textContent = originalText;
                        }, 1000);
                    }).catch(() => {
                        // Fallback if clipboard API fails
                        copyToClipboardFallback(coords, coordsDiv);
                    });
                } else {
                    // Fallback for older browsers
                    copyToClipboardFallback(coords, coordsDiv);
                }
            }
        });
    }
}

function copyToClipboardFallback(text, coordsDiv) {
    // Create a temporary input element
    const tempInput = document.createElement('input');
    tempInput.value = text;
    document.body.appendChild(tempInput);
    tempInput.select();
    tempInput.setSelectionRange(0, 99999); // For mobile devices
    
    try {
        document.execCommand('copy');
        const originalText = coordsDiv.textContent;
        coordsDiv.textContent = 'Copied successfully!';
        setTimeout(() => {
            coordsDiv.textContent = originalText;
        }, 1000);
    } catch (err) {
        coordsDiv.textContent = 'Copy failed';
        setTimeout(() => {
            coordsDiv.textContent = `Coords: (X: ${g.sx || 0}, Y: ${g.sy || 0})`;
        }, 1000);
    }
    
    document.body.removeChild(tempInput);
}

// Coordinate locking functionality
let coordinatesLocked = false;
let lockState = "normal"; // "normal", "waiting", "locked"
let lockedCoordinates = null;

function toggleCoordinatesLock() {
    const lockButton = document.getElementById('lock_coords_btn');
    
    if (lockState === "normal") {
        // Enter waiting mode
        lockState = "waiting";
        lockButton.textContent = "Waiting...";
        lockButton.disabled = true;
        
        // Set up one-time click handler
        const clickHandler = function(event) {
            if (event.quick) { // Only handle quick clicks (not drags)
                handleCoordinateLock(event);
                // Remove the handler after use
                g.viewer.removeHandler('canvas-click', clickHandler);
            }
        };
        
        g.viewer.addHandler('canvas-click', clickHandler);
        
    } else if (lockState === "locked") {
        // Unlock coordinates
        lockState = "normal";
        lockButton.textContent = "Lock Coordinates";
        lockButton.disabled = false;
        coordinatesLocked = false;
        lockedCoordinates = null;
        
        // Remove the locked coordinate marker
        if (g.marker && g.lockedMarkers) {
            for (const marker of g.lockedMarkers) {
                g.marker.remove(marker.id);
            }
            g.lockedMarkers = [];
        }
        
        // Reset coordinates display
        if (g.position) {
            const [sx, sy] = c.getSquare(g.position);
            const coordsDiv = document.getElementById('mouse-coordinates');
            if (coordsDiv) {
                coordsDiv.textContent = `X: ${sx}, Y: ${sy}`;
            }
        }
    }
}

function handleCoordinateLock(event) {
    // Get click position
    const pixelPosition = event.position;
    const canvasPosition = {
        x: pixelPosition.x * window.devicePixelRatio,
        y: pixelPosition.y * window.devicePixelRatio
    };
    
    // Convert to square coordinates using the coordinate system
    const [sx, sy] = c.getSquare({position: pixelPosition});
    
    // Create clipboard URL
    const clipboardUrl = `b42map.com/?${sx}x${sy}`;
    
    // Copy to clipboard
    if (navigator.clipboard) {
        navigator.clipboard.writeText(clipboardUrl).then(() => {
            showCoordinatesCopiedMessage(sx, sy);
        }).catch(() => {
            copyToClipboardFallbackForLock(clipboardUrl, sx, sy);
        });
    } else {
        copyToClipboardFallbackForLock(clipboardUrl, sx, sy);
    }
    
    // Create marker for locked coordinates
    createLockedCoordinateMarker(sx, sy);
    
    // Update lock state
    lockState = "locked";
    coordinatesLocked = true;
    lockedCoordinates = { x: sx, y: sy };
    
    const lockButton = document.getElementById('lock_coords_btn');
    lockButton.textContent = "Unlock Coordinates";
    lockButton.disabled = false;
    
    console.log(`Locked coordinates: ${sx}, ${sy}`);
}

function createLockedCoordinateMarker(sx, sy) {
    const lockedMarker = {
        id: 'locked-coordinate-marker',
        name: 'Locked Coordinates',
        desc: `Locked at (X: ${sx}, Y: ${sy})`,
        x: sx,
        y: sy,
        type: 'point',
        color: 'lime',
        background: 'rgba(0, 255, 0, 0.4)',
        text_position: 'none',
        visible_zoom_level: 0,
        layer: 0,
        class_list: ['locked-marker']
    };
    
    // Store the locked marker
    if (!g.lockedMarkers) {
        g.lockedMarkers = [];
    }
    g.lockedMarkers = [lockedMarker]; // Replace any existing locked marker
    
    // Add the marker to the main marker system only if POIs are enabled
    if (g.poisui && g.marker) {
        g.marker.load([lockedMarker]);
    }
}

function showCoordinatesCopiedMessage(sx, sy) {
    const coordsDiv = document.getElementById('mouse-coordinates');
    if (coordsDiv) {
        const originalText = coordsDiv.textContent;
        coordsDiv.textContent = 'Coordinates copied to clipboard';
        
        setTimeout(() => {
            if (coordinatesLocked && lockedCoordinates) {
                coordsDiv.textContent = `Locked: (X: ${lockedCoordinates.x}, Y: ${lockedCoordinates.y})`;
            } else {
                coordsDiv.textContent = originalText;
            }
        }, 2000);
    }
}

function copyToClipboardFallbackForLock(text, sx, sy) {
    const tempInput = document.createElement('input');
    tempInput.value = text;
    document.body.appendChild(tempInput);
    tempInput.select();
    tempInput.setSelectionRange(0, 99999);
    
    try {
        document.execCommand('copy');
        showCoordinatesCopiedMessage(sx, sy);
    } catch (err) {
        console.error('Copy failed:', err);
        const coordsDiv = document.getElementById('mouse-coordinates');
        if (coordsDiv) {
            coordsDiv.textContent = 'Copy failed';
            setTimeout(() => {
                if (coordinatesLocked && lockedCoordinates) {
                    coordsDiv.textContent = `Locked: (X: ${lockedCoordinates.x}, Y: ${lockedCoordinates.y})`;
                } else if (g.position) {
                    const [sx, sy] = c.getSquare(g.position);
                    coordsDiv.textContent = `X: ${sx}, Y: ${sy}`;
                }
            }, 2000);
        }
    }
    
    document.body.removeChild(tempInput);
}


// sidebar toggle
function toggleSidebar() {
    const sidebarContainer = document.getElementById('sidebar-container');
    sidebarContainer.classList.toggle('collapsed');
}

// View switcher functions
function updateViewSwitcher() {
    let changeView = false;
    for (const type of g.base_map.available_types) {
        if (type != g.base_map.type) {
            changeView = true;
        }
    }
    
    const viewBtn = document.getElementById('change_view_btn');
    const viewLink = document.getElementById('top_view_link');
    
    if (changeView) {
        viewBtn.style.display = '';
        viewLink.style.display = '';
        if (g.map_type == 'top') {
            viewBtn.innerHTML = 'Switch to Isometric View';
        } else {
            viewBtn.innerHTML = 'Switch to Top View';
        }
    } else {
        viewBtn.style.display = 'none';
        viewLink.style.display = 'none';
    }
}

// change view
function onChangeView() {
    if (g.map_type == 'top') {
        g.map_type = 'iso';
    } else {
        g.map_type = 'top';
    }
    return reloadView(true);
}

function reloadView(keep_mod_map=false) {
    g.viewer.destroy();
    return init();
}



// key listener
function onKeyDown(event) {
    if (g.query_string.debug && event.key == 't') {
        // debug: display r-tree index
        const nodeList = (rtree, type) => {
            const result = [];
            const stack = [];
            const colorList = ['white', 'red', 'green', 'blue', 'grey'];
            const cls = type === 'iso' ? ['diff-sum'] : undefined;
            if (rtree.root) {
                stack.push([rtree.root, 0]);
            }
            while (stack.length > 0) {
                const [current, level] = stack.pop();
                const color = level < colorList.length ? colorList[level] : colorList[colorList.length - 1];
                if (current.E) {
                    result.push({
                        type: 'area',
                        id: util.uniqueId(),
                        class_list: cls,
                        background: 'transparent',
                        color: color,
                        layer: 0,
                        visible_zoom_level: 0,
                        rects: [{
                            x: current.L[0],
                            y: current.L[1],
                            width: current.U[0] - current.L[0],
                            height: current.U[1] - current.L[1]
                        }],
                    });
                    if (current.E.length > 0 && current.E[0].E) {
                        for (const entry of current.E) {
                            stack.push([entry, level + 1]);
                        }
                    }
                }
            }
            return result;
        }
        if (g.debug_marker.db.all().length > 0) {
            g.debug_marker.removeAll();
        } else {
            const index = g.marker.db._index(0, g.zoomLevel);
            const marks = nodeList(index.index[index.mode], index.mode);
            g.debug_marker.load(marks);
        }
    }
    if (g.query_string.debug && event.key == 'y') {
        if (g.debug_marker.db.all().length > 0) {
            g.debug_marker.removeAll();
        } else {
            const range = g.range;
            g.debug_marker.load([{
                type: 'area',
                id: util.uniqueId(),
                class_list: g.map_type === 'iso' ? ['diff-sum'] : undefined,
                background: 'transparent',
                color: 'lime',
                layer: 0,
                visible_zoom_level: 0,
                rects: [{
                    x: Math.round(g.map_type === 'iso' ? range.minDiff: range.minX),
                    y: Math.round(g.map_type === 'iso' ? range.minSum: range.minY),
                    width: Math.round(g.map_type === 'iso' ? range.maxDiff - range.minDiff : range.maxX - range.minX),
                    height: Math.round(g.map_type === 'iso' ? range.maxSum - range.minSum : range.maxY - range.minY)
                }]
            }]);
        }
    }
}

// Help popup functions
function showHelpPopup() {
    const overlay = document.getElementById('help-popup-overlay');
    if (overlay) {
        overlay.style.display = 'flex';
        // Prevent background scrolling when popup is open
        document.body.style.overflow = 'hidden';
    }
}

function hideHelpPopup() {
    const overlay = document.getElementById('help-popup-overlay');
    if (overlay) {
        overlay.style.display = 'none';
        // Restore background scrolling
        document.body.style.overflow = 'auto';
    }
}

// Make functions globally available for onclick handlers
window.showHelpPopup = showHelpPopup;
window.hideHelpPopup = hideHelpPopup;

// Add escape key handler for help popup
document.addEventListener('keydown', function(event) {
    if (event.key === 'Escape') {
        const overlay = document.getElementById('help-popup-overlay');
        if (overlay && overlay.style.display === 'flex') {
            hideHelpPopup();
        }
    }
});

Promise.all(pmodules).then(() => {
    init();
}).catch((e) => {
    const output = document.getElementById('main_output');
    if (output) {
        output.style.color = 'red';
        output.innerHTML = 'Failed to initialize modules.<br/>Error: ' + e;
    }
    document.body.style.background = 'white';
    throw e;
});
