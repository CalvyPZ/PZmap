// Search functionality for POI markers, streets, objects, rooms, and tiles
let spriteData = null; // Cache for sprite lookup data

// Load sprite lookup data
async function loadSpriteData() {
    if (spriteData === null) {
        try {
            const response = await fetch('./sprite_lookup.json');
            spriteData = await response.json();
            console.log('Sprite lookup data loaded');
        } catch (error) {
            console.error('Failed to load sprite lookup data:', error);
            spriteData = {}; // Set to empty object to prevent repeated attempts
        }
    }
    return spriteData;
}

// Search for tiles/sprites
async function searchTiles(query, g) {
    const sprites = await loadSpriteData();
    if (!sprites || Object.keys(sprites).length === 0) {
        return [];
    }
    
    const searchTerms = query.toLowerCase().trim().split(/\s+/);
    const results = [];
    
    // Search through sprite names
    Object.keys(sprites).forEach(spriteName => {
        const searchText = spriteName.toLowerCase();
        let score = 0;
        let matchCount = 0;
        
        searchTerms.forEach(term => {
            if (searchText.includes(term)) {
                matchCount++;
                // Higher score for exact matches or word boundaries
                if (searchText === term) {
                    score += 50; // Exact match
                } else if (searchText.startsWith(term + ' ') || searchText.endsWith(' ' + term) || searchText.includes(' ' + term + ' ')) {
                    score += 30; // Word boundary match
                } else if (searchText.startsWith(term)) {
                    score += 20; // Prefix match
                } else {
                    score += 10; // Partial match
                }
            }
        });
        
        // Only include results that match all search terms
        if (matchCount === searchTerms.length && score > 0) {
            const spriteInfo = sprites[spriteName];
            const coordinateCount = spriteInfo.coordinates ? spriteInfo.coordinates.length : 0;
            
            results.push({
                poi: {
                    id: `sprite-${spriteName.replace(/\s+/g, '-').toLowerCase()}`,
                    name: spriteName,
                    desc: `Tile (${coordinateCount} locations)`,
                    sprite_name: spriteName,
                    sprite_data: spriteInfo,
                    coordinate_count: coordinateCount
                },
                score,
                type: 'tile'
            });
        }
    });
    
    return results.sort((a, b) => b.score - a.score);
}

export async function searchPOIs(query, g) {
    if (!query.trim()) {
        return [];
    }
    
    const searchTerms = query.toLowerCase().trim().split(/\s+/);
    const results = [];
    
    // Search tiles/sprites first as they might be the primary use case
    const tileResults = await searchTiles(query, g);
    results.push(...tileResults);
    
    // Search through POI markers
    if (g.poiMarkers) {
        g.poiMarkers.forEach(marker => {
            const searchText = [
                marker.name || '',
                marker.desc || '',
                marker.location || '',
                ...(marker.tags || [])
            ].join(' ').toLowerCase();
            
            let score = 0;
            let matchCount = 0;
            
            searchTerms.forEach(term => {
                if (searchText.includes(term)) {
                    matchCount++;
                    // Boost score for name matches
                    if ((marker.name || '').toLowerCase().includes(term)) {
                        score += 10;
                    }
                    // Location matches
                    if ((marker.location || '').toLowerCase().includes(term)) {
                        score += 5;
                    }
                    // Tag matches
                    if ((marker.tags || []).some(tag => tag.toLowerCase().includes(term))) {
                        score += 5;
                    }
                    // Description matches
                    if ((marker.desc || '').toLowerCase().includes(term)) {
                        score += 2;
                    }
                    // General text match
                    score += 1;
                }
            });
            
            // Only include results that match all search terms
            if (matchCount === searchTerms.length && score > 0) {
                results.push({ poi: marker, score, type: 'poi' });
            }
        });
    }
    
    // Search through street names
    if (g.base_map && g.base_map.marks && g.base_map.marks.streets) {
        const streetMarks = g.base_map.marks.streets.db.all();
        streetMarks.forEach(street => {
            const streetName = street.name || street.text || '';
            if (!streetName) return; // Skip streets without names
            
            const searchText = streetName.toLowerCase();
            let score = 0;
            let matchCount = 0;
            
            searchTerms.forEach(term => {
                if (searchText.includes(term)) {
                    matchCount++;
                    // Higher score for street name matches since they're more specific
                    score += 15;
                    
                    // Extra boost for exact matches or word boundaries
                    if (searchText === term || searchText.startsWith(term + ' ') || searchText.endsWith(' ' + term)) {
                        score += 10;
                    }
                }
            });
            
            // Only include results that match all search terms
            if (matchCount === searchTerms.length && score > 0) {
                // Extract coordinates from street data
                let streetX = 0, streetY = 0;
                
                if (street.points && street.points.length > 0) {
                    // For polyline streets, use the midpoint
                    const midIndex = Math.floor(street.points.length / 2);
                    streetX = street.points[midIndex].x;
                    streetY = street.points[midIndex].y;
                } else if (street.x !== undefined && street.y !== undefined) {
                    // Direct coordinates
                    streetX = street.x;
                    streetY = street.y;
                } else if (street.rects && street.rects[0]) {
                    // Rectangle-based
                    const rect = street.rects[0];
                    streetX = rect.x + rect.width / 2;
                    streetY = rect.y + rect.height / 2;
                }
                
                results.push({ 
                    poi: {
                        id: street.id,
                        name: streetName,
                        desc: 'Street',
                        x: streetX,
                        y: streetY,
                        location: 'Street',
                        tags: ['street'],
                        street_data: street // Store original street data for navigation
                    }, 
                    score, 
                    type: 'street' 
                });
            }
        });
    }
    
    // Search through objects
    if (g.base_map && g.base_map.marks && g.base_map.marks.objects) {
        const objectMarks = g.base_map.marks.objects.db.all();
        objectMarks.forEach(obj => {
            const objName = obj.name || '';
            if (!objName) return; // Skip objects without names
            
            const searchText = objName.toLowerCase();
            let score = 0;
            let matchCount = 0;
            
            searchTerms.forEach(term => {
                if (searchText.includes(term)) {
                    matchCount++;
                    // Good score for object name matches
                    score += 12;
                    
                    // Extra boost for exact matches or word boundaries
                    if (searchText === term || searchText.startsWith(term + ' ') || searchText.endsWith(' ' + term)) {
                        score += 8;
                    }
                }
            });
            
            // Only include results that match all search terms
            if (matchCount === searchTerms.length && score > 0) {
                // Extract coordinates from object data
                let objX = 0, objY = 0;
                
                if (obj.rects && obj.rects[0]) {
                    // Rectangle-based - use center of first rectangle
                    const rect = obj.rects[0];
                    objX = rect.x + rect.width / 2;
                    objY = rect.y + rect.height / 2;
                } else if (obj.x !== undefined && obj.y !== undefined) {
                    // Direct coordinates
                    objX = obj.x;
                    objY = obj.y;
                }
                
                // Determine the object category based on color
                let objectCategory;
                
                // Use color to determine category as specified
                if (obj.color === 'Blue' || obj.color.toLowerCase() === 'blue') {
                    objectCategory = 'Car Spawn';
                } else if (obj.color === 'Red' || obj.color.toLowerCase() === 'red') {
                    objectCategory = 'Zombie';
                } else if (obj.color === 'Yellow' || obj.color.toLowerCase() === 'yellow') {
                    objectCategory = 'Zone Story';
                } else {
                    // Default category if color doesn't match
                    objectCategory = 'Other';
                }
                
                results.push({ 
                    poi: {
                        id: obj.id || `obj-${objX}-${objY}`,
                        name: objName,
                        desc: objectCategory,
                        x: objX,
                        y: objY,
                        location: 'Object',
                        tags: ['object', objectCategory.toLowerCase()],
                        object_data: obj, // Store original object data for navigation
                        object_category: objectCategory // Store the category
                    }, 
                    score, 
                    type: 'object' 
                });
            }
        });
    }
    
    // Search through rooms
    if (g.base_map && g.base_map.marks && g.base_map.marks.rooms) {
        const roomMarks = g.base_map.marks.rooms.db.all();
        roomMarks.forEach(room => {
            const roomName = room.name || '';
            if (!roomName) return; // Skip rooms without names
            
            const searchText = roomName.toLowerCase();
            let score = 0;
            let matchCount = 0;
            
            searchTerms.forEach(term => {
                if (searchText.includes(term)) {
                    matchCount++;
                    // Good score for room name matches
                    score += 12;
                    
                    // Extra boost for exact matches or word boundaries
                    if (searchText === term || searchText.startsWith(term + ' ') || searchText.endsWith(' ' + term)) {
                        score += 8;
                    }
                }
            });
            
            // Only include results that match all search terms
            if (matchCount === searchTerms.length && score > 0) {
                // Extract coordinates from room data
                let roomX = 0, roomY = 0;
                
                if (room.rects && room.rects[0]) {
                    // Rectangle-based - use center of first rectangle
                    const rect = room.rects[0];
                    roomX = rect.x + rect.width / 2;
                    roomY = rect.y + rect.height / 2;
                } else if (room.x !== undefined && room.y !== undefined) {
                    // Direct coordinates
                    roomX = room.x;
                    roomY = room.y;
                }
                
                results.push({ 
                    poi: {
                        id: room.id || `room-${roomX}-${roomY}`,
                        name: roomName,
                        desc: 'Room',
                        x: roomX,
                        y: roomY,
                        location: 'Room',
                        tags: ['room'],
                        room_data: room // Store original room data for navigation
                    }, 
                    score, 
                    type: 'room' 
                });
            }
        });
    }
    
    // Sort by type priority first, then by score
    const typePriority = { 'tile': 1, 'poi': 2, 'street': 3, 'object': 4, 'room': 5 };
    return results.sort((a, b) => {
        const priorityA = typePriority[a.type] || 6;
        const priorityB = typePriority[b.type] || 6;
        
        if (priorityA !== priorityB) {
            return priorityA - priorityB; // Lower number = higher priority
        }
        
        return b.score - a.score; // Within same type, sort by score descending
    });
}

// Add markers for all tile coordinates
export function addTileMarkers(poi, g) {
    if (!poi.sprite_data || !poi.sprite_data.coordinates) {
        console.warn('No sprite data or coordinates found for:', poi.name);
        return;
    }
    
    const coordinates = poi.sprite_data.coordinates;
    
    console.log(`Adding ${coordinates.length} tile markers for: ${poi.name}`);
    
    const tileMarkers = coordinates.map((coord, index) => ({
        id: `tile-${poi.sprite_name.replace(/\s+/g, '-').toLowerCase()}-${index}`,
        name: poi.name,
        desc: `${poi.name} at layer ${coord.layer}`,
        x: coord.x, // Coordinates are already in pixel format
        y: coord.y, // Coordinates are already in pixel format
        type: 'point',
        color: 'cyan',
        background: 'rgba(0, 255, 255, 0.4)',
        text_position: 'none',
        visible_zoom_level: 0, // Always show tile markers at all zoom levels
        layer: coord.layer,
        class_list: ['search-marker', 'search-tile']
    }));
    
    // Load all tile markers
    g.marker.load(tileMarkers);
    
    // Store references for cleanup
    if (!g.searchMarkers) {
        g.searchMarkers = [];
    }
    const markerIds = tileMarkers.map(m => m.id);
    g.searchMarkers.push(...markerIds);
    
    return tileMarkers.length;
}

export function addPurpleMarker(poi, g, resultType = 'poi') {
    // Handle tile markers specially - they need to add all coordinates
    if (resultType === 'tile' || poi.sprite_data) {
        return addTileMarkers(poi, g);
    }
    
    // Use different colors for different result types
    let color, background, className;
    if (resultType === 'street' || poi.street_data) {
        color = 'orange';
        background = 'rgba(255, 165, 0, 0.5)';
        className = 'search-street';
    } else if (resultType === 'object' || poi.object_data) {
        color = 'green';
        background = 'rgba(0, 255, 0, 0.5)';
        className = 'search-object';
    } else if (resultType === 'room' || poi.room_data) {
        color = 'blue';
        background = 'rgba(0, 128, 255, 0.5)';
        className = 'search-room';
    } else {
        color = 'purple';
        background = 'rgba(128, 0, 128, 0.5)';
        className = 'search-point';
    }
    
    const searchMarker = {
        id: `search-${poi.id}`,
        name: poi.name,
        desc: poi.desc,
        x: poi.x,
        y: poi.y,
        location: poi.location,
        tags: poi.tags || [],
        type: 'point',
        color: color,
        background: background,
        text_position: 'none',
        visible_zoom_level: 0,
        layer: 0,
        class_list: ['search-marker', className]
    };
    
    g.marker.load([searchMarker]);
    
    // Store reference for cleanup
    if (!g.searchMarkers) {
        g.searchMarkers = [];
    }
    g.searchMarkers.push(searchMarker.id);
}

export function clearPurpleMarkers(g) {
    if (g.searchMarkers) {
        g.searchMarkers.forEach(markerId => {
            g.marker.remove(markerId);
        });
        g.searchMarkers = [];
    }
}

export function panToPOI(poi, g) {
    if (!g.viewer || !poi.x || poi.x === 0) {
        console.error('Invalid coordinates for target:', poi.name, 'x:', poi.x, 'y:', poi.y);
        return;
    }
    
    let targetX = poi.x;
    let targetY = poi.y;
    
    const resultType = poi.street_data ? 'street' : poi.object_data ? 'object' : poi.room_data ? 'room' : 'poi';
    console.log('Pan to:', poi.name, 'at coords:', targetX, targetY, 'type:', resultType);
    
    // Enable appropriate overlay based on result type
    if (poi.street_data && !g.overlays.streets) {
        console.log('Enabling streets overlay for street navigation');
        try {
            if (typeof toggleOverlay === 'function') {
                toggleOverlay('streets');
            } else if (typeof window.toggleOverlay === 'function') {
                window.toggleOverlay('streets');
            }
        } catch (error) {
            console.warn('Could not enable streets overlay:', error);
        }
    } else if (poi.object_data && !g.overlays.objects) {
        console.log('Enabling objects overlay for object navigation');
        try {
            if (typeof toggleOverlay === 'function') {
                toggleOverlay('objects');
            } else if (typeof window.toggleOverlay === 'function') {
                window.toggleOverlay('objects');
            }
        } catch (error) {
            console.warn('Could not enable objects overlay:', error);
        }
    } else if (poi.room_data && !g.overlays.rooms) {
        console.log('Enabling rooms overlay for room navigation');
        try {
            if (typeof toggleOverlay === 'function') {
                toggleOverlay('rooms');
            } else if (typeof window.toggleOverlay === 'function') {
                window.toggleOverlay('rooms');
            }
        } catch (error) {
            console.warn('Could not enable rooms overlay:', error);
        }
    }
    
    // Get the tiled image
    const tiledImage = g.viewer.world.getItemAt(0);
    if (!tiledImage) {
        console.error('No tiled image found');
        return;
    }
    
    let viewportPoint;
    
    // Try the same coordinate conversion approach for both POIs and streets
    // Convert coordinates to grid coordinates first
    const gridX = targetX / 256;
    const gridY = targetY / 256;
    
    console.log('Grid coordinates:', gridX, gridY);
    
    // Use the base map's cell2pixel method to convert to image coordinates
    const imageCoords = g.base_map.cell2pixel(gridX, gridY);
    console.log('Image coordinates:', imageCoords);
    
    // Convert to viewport coordinates
    viewportPoint = tiledImage.imageToViewportCoordinates(imageCoords.x, imageCoords.y);
    console.log('Viewport coordinates:', viewportPoint);
    
    // Pan to the location
    g.viewer.viewport.panTo(viewportPoint, true);
    
    // Set zoom level - much lower for streets, moderate for POIs
    const maxZoom = g.viewer.viewport.getMaxZoom();
    const minZoom = g.viewer.viewport.getMinZoom();
    
    let targetZoom;
    if (poi.street_data) {
        // Much lower zoom for streets to see more context
        targetZoom = minZoom + (0.2 * (maxZoom - minZoom)); // 20% of zoom range
    } else if (poi.object_data) {
        // Medium zoom for objects to see building context
        targetZoom = minZoom + (0.4 * (maxZoom - minZoom)); // 40% of zoom range
    } else if (poi.room_data) {
        // Higher zoom for rooms to see interior detail
        targetZoom = minZoom + (0.7 * (maxZoom - minZoom)); // 70% of zoom range
    } else {
        // Moderate zoom for POIs
        targetZoom = minZoom + (0.6 * (maxZoom - minZoom)); // 60% of zoom range
    }
    
    g.viewer.viewport.zoomTo(targetZoom, viewportPoint, true);
}

export function displaySearchResults(results, g) {
    const container = document.getElementById('search-results');
    if (!container) return;
    
    container.innerHTML = '';
    
    if (results.length === 0) {
        const noResultDiv = document.createElement('div');
        noResultDiv.textContent = 'No results found';
        noResultDiv.classList.add('search-result');
        container.appendChild(noResultDiv);
    } else {
        // Show top 10 results
        const topResults = results.slice(0, 10);
        const highConfidenceResults = results.filter(r => r.score >= 10);
        
        topResults.forEach(({ poi, score, type }) => {
            const div = document.createElement('div');
            div.classList.add('search-result');
            
            const name = poi.name || 'Unnamed POI';
            const location = poi.location || 'Unknown location';
            const coordinates = poi.x && poi.y ? `(${poi.x}, ${poi.y})` : 'No coordinates';
            
            // Add styling based on type
            let typeLabel = '';
            if (type === 'tile') {
                typeLabel = 'Tile';
            } else if (type === 'street') {
                typeLabel = 'Street';
            } else if (type === 'object') {
                // Use the specific object category instead of generic "Object"
                typeLabel = poi.object_category || 'Building';
            } else if (type === 'room') {
                typeLabel = 'Room';
            } else {
                typeLabel = 'POI';
            }
            
            let content = `
                <div style="font-weight: bold;">
                    ${name}
                    <span style="font-size: 12px; color: #888; font-weight: normal; margin-left: 8px;">[${typeLabel}]</span>
                </div>
                <div style="color: #cccccc;"><small>${coordinates}</small></div>
            `;
            
            // Don't show description if it matches the category already shown in the header
            // or if it's one of the standard type labels
            const skipDescriptions = ['Street', 'Object', 'Room', 'Zombie', 'Car Spawn', 'Zone Story', 'Other'];
            if (poi.desc && !skipDescriptions.includes(poi.desc)) {
                content += `<div><em>${poi.desc}</em></div>`;
            }
            
            // For POIs only, show location underneath description in lighter font and italicized
            if (type === 'poi' && poi.location && poi.location.trim()) {
                content += `<div style="color: #999; font-style: italic; font-size: 12px; margin-top: 4px;">${poi.location}</div>`;
            }
            
            div.innerHTML = content;
            
            div.addEventListener('click', () => {
                if (type === 'tile') {
                    // For tiles, immediately add all markers instead of panning
                    clearPurpleMarkers(g);
                    const markerCount = addTileMarkers(poi, g);
                    clearSearchResults();
                    console.log(`Added ${markerCount} tile markers for ${poi.name}`);
                } else {
                    panToPOI(poi, g);
                    clearSearchResults();
                    clearPurpleMarkers(g);
                }
            });
            
            container.appendChild(div);
        });
        
        // Add "Show All Results" button for high confidence results
        if (highConfidenceResults.length > 1) {
            const showAllDiv = document.createElement('div');
            showAllDiv.textContent = `Show All ${highConfidenceResults.length} Results on Map`;
            showAllDiv.classList.add('search-result');
            showAllDiv.style.textAlign = 'center';
            showAllDiv.style.cursor = 'pointer';
            showAllDiv.style.fontWeight = 'bold';
            showAllDiv.style.backgroundColor = '#505050';
            
            showAllDiv.addEventListener('click', () => {
                clearPurpleMarkers(g);
                
                // Check if any results need overlays and enable them
                const hasStreets = highConfidenceResults.some(({ poi }) => poi.street_data);
                const hasObjects = highConfidenceResults.some(({ poi }) => poi.object_data);
                const hasRooms = highConfidenceResults.some(({ poi }) => poi.room_data);
                
                if (hasStreets && !g.overlays.streets) {
                    console.log('Enabling streets overlay for street search results');
                    try {
                        if (typeof toggleOverlay === 'function') {
                            toggleOverlay('streets');
                        } else if (typeof window.toggleOverlay === 'function') {
                            window.toggleOverlay('streets');
                        }
                    } catch (error) {
                        console.warn('Could not enable streets overlay:', error);
                    }
                }
                
                if (hasObjects && !g.overlays.objects) {
                    console.log('Enabling objects overlay for object search results');
                    try {
                        if (typeof toggleOverlay === 'function') {
                            toggleOverlay('objects');
                        } else if (typeof window.toggleOverlay === 'function') {
                            window.toggleOverlay('objects');
                        }
                    } catch (error) {
                        console.warn('Could not enable objects overlay:', error);
                    }
                }
                
                if (hasRooms && !g.overlays.rooms) {
                    console.log('Enabling rooms overlay for room search results');
                    try {
                        if (typeof toggleOverlay === 'function') {
                            toggleOverlay('rooms');
                        } else if (typeof window.toggleOverlay === 'function') {
                            window.toggleOverlay('rooms');
                        }
                    } catch (error) {
                        console.warn('Could not enable rooms overlay:', error);
                    }
                }
                
                highConfidenceResults.forEach(({ poi, type }) => addPurpleMarker(poi, g, type));
                clearSearchResults();
            });
            
            container.appendChild(showAllDiv);
        }
    }
    
    container.classList.remove('hidden');
}

export function clearSearchResults() {
    const container = document.getElementById('search-results');
    const searchInput = document.getElementById('search-input');
    
    if (container) {
        container.innerHTML = '';
        container.classList.add('hidden');
    }
    
    if (searchInput) {
        searchInput.value = '';
    }
}

export function setupSearchEvents(g) {
    const searchInput = document.getElementById('search-input');
    const clearBtn = document.getElementById('clear-search-btn');
    const resultsContainer = document.getElementById('search-results');
    
    if (!searchInput || !clearBtn || !resultsContainer) {
        console.warn('Search elements not found');
        return;
    }
    
    // Clear search input on page load/refresh
    searchInput.value = '';
    resultsContainer.classList.add('hidden');
    
    // Search input event
    searchInput.addEventListener('input', async function(event) {
        const query = event.target.value.trim();
        
        if (query) {
            try {
                const results = await searchPOIs(query, g);
                displaySearchResults(results, g);
            } catch (error) {
                console.error('Search error:', error);
                clearSearchResults();
            }
        } else {
            clearSearchResults();
            clearPurpleMarkers(g);
        }
    });
    
    // Clear button event
    clearBtn.addEventListener('click', function() {
        clearSearchResults();
        clearPurpleMarkers(g);
    });
    
    // Focus event to restore results
    searchInput.addEventListener('focus', async function() {
        const query = searchInput.value.trim();
        if (query) {
            try {
                const results = await searchPOIs(query, g);
                displaySearchResults(results, g);
            } catch (error) {
                console.error('Search error:', error);
            }
        }
    });
    
    // Click outside to hide results
    document.addEventListener('click', function(event) {
        if (!resultsContainer.contains(event.target) && 
            event.target !== searchInput && 
            event.target !== clearBtn) {
            resultsContainer.classList.add('hidden');
        }
    });
    
    // Escape key to clear search
    searchInput.addEventListener('keydown', function(event) {
        if (event.key === 'Escape') {
            clearSearchResults();
            clearPurpleMarkers(g);
            searchInput.blur();
        }
    });
    
    console.log('Search events initialized');
}
