/*************************************************
 * main.js (updated to use Intersection Observer)
 *************************************************/
import * as THREE from 'https://cdn.jsdelivr.net/npm/three@v0.167.0/build/three.module.js';
import { ConvexGeometry } from 'https://cdn.jsdelivr.net/npm/three@v0.167.0/examples/jsm/geometries/ConvexGeometry.js';

document.addEventListener("DOMContentLoaded", function() {
    // We keep references so we can dispose them later
    const renderers = {};
    const cameras = {};
    const scenes = {};
    
    let neoData = []; // Store NEO data

    // Create an Intersection Observer to watch each .neo-entry
    const observerOptions = {
        root: null,       // use the browser viewport as root
        rootMargin: '0px',
        threshold: 0.1    // trigger when 10% is visible
    };
    const observer = new IntersectionObserver(handleIntersection, observerOptions);

    /**
     * Intersection Observer callback:
     * - If .neo-entry is in view, create the 3D scene (unless we already have it).
     * - If it's out of view, dispose of that scene to free the WebGL context.
     */
    function handleIntersection(entries) {
        entries.forEach(entry => {
            const target = entry.target;         // the .neo-entry element
            const neoId = target.dataset.neoId;  // read data-neo-id

            if (entry.isIntersecting) {
                // If not already rendered, create the shapes
                if (!scenes[neoId]) {
                    const thisNeo = neoData.find(obj => obj.neo_id === neoId);
                    if (thisNeo) {
                        addIrregularShapes(thisNeo);
                    }
                }
            } else {
                // If going out of view, dispose of that scene if it exists
                if (scenes[neoId]) {
                    disposeThreeJS(neoId);
                }
            }
        });
    }

    /**
     * Properly dispose of a Three.js scene so we free up the WebGL context.
     */
    function disposeThreeJS(neoId) {
        const renderer = renderers[neoId];
        const scene = scenes[neoId];
        
        // If we stored an animationFrame ID, we would cancel it here:
        // cancelAnimationFrame(animateIds[neoId]); // Not used in this example

        // Remove the renderer’s canvas from the DOM
        if (renderer && renderer.domElement && renderer.domElement.parentNode) {
            renderer.domElement.parentNode.removeChild(renderer.domElement);
        }

        // Traverse the scene and dispose of geometry/materials
        if (scene) {
            scene.traverse(object => {
                if (object.isMesh) {
                    if (object.geometry) object.geometry.dispose();
                    if (object.material) {
                        if (Array.isArray(object.material)) {
                            object.material.forEach(mat => mat.dispose());
                        } else {
                            object.material.dispose();
                        }
                    }
                }
            });
        }

        // Dispose the renderer itself
        if (renderer) {
            renderer.dispose();
        }

        // Delete references
        delete scenes[neoId];
        delete renderers[neoId];
        delete cameras[neoId];
    }

    /**
     * Get today's date in UTC (YYYY-MM-DD).
     */
    function getFormattedDate(date) {
        const year = date.getUTCFullYear();
        const month = String(date.getUTCMonth() + 1).padStart(2, '0');
        const day = String(date.getUTCDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    }

    // ---------------------------------------------
    // Fetch the data (adjust your endpoint as needed)
    // ---------------------------------------------
    const today = getFormattedDate(new Date());
    fetch(`https://r8rt1aci7a.execute-api.us-east-2.amazonaws.com/dev/get-neo-data?fetch_date=${today}`)
        .then(response => response.json())
        .then(data => {
            if (data) {
                // Store NEOs
                neoData = data.neos; 
                
                // Update basic info
                document.getElementById('fetchDate').textContent = data.fetch_date;
                document.getElementById('neoCount').textContent = `Count: ${data.neos.length}`;
                
                // Build the entries in the DOM
                const neoContainer = document.getElementById('neo-data-container');
                data.neos.forEach(neo => {
                    const neoEntry = createNeoEntry(neo);
                    neoContainer.appendChild(neoEntry);

                    // Observe this entry for intersection
                    observer.observe(neoEntry);
                });

                // Hide loading spinner, show content
                document.getElementById('loading').style.display = 'none';
                document.getElementById('content').style.display = 'block';

                // Switch the body background
                document.body.classList.remove('loading');
                document.body.classList.add('loaded');

            } else {
                console.error("No NEO Data found");
            }
        })
        .catch(error => {
            console.error("Error fetching NEO Data:", error);
        });

    /**
     * Create an HTML block for one NEO (text info + empty .neo-visual container).
     */
    function createNeoEntry(neo) {
        const neoEntry = document.createElement('div');
        neoEntry.classList.add('neo-entry');

        // <-- NEW: store the neo_id on the container so the observer can find it
        neoEntry.dataset.neoId = neo.neo_id;

        const neoInfo = document.createElement('div');
        neoInfo.classList.add('neo-info');

        const neoTitle = document.createElement('h2');
        neoTitle.textContent = neo.name;
        neoInfo.appendChild(neoTitle);

        // Build up the HTML for the details
        let neoDetails = `
            <p><strong>NEO ID:</strong> ${neo.neo_id}</p>
            <p><a href="${neo.nasa_jpl_url}" target="_blank">NASA JPL URL</a></p>
            <p><strong>Is Potentially Hazardous:</strong> ${neo.is_potentially_hazardous_asteroid}</p>
        `;

        // If not on mobile, add extra details
        if (!isMobileDevice()) {
            neoDetails += `
                <p><strong>Estimated Diameter:</strong></p>
                <ul>
                    <li>Kilometers: ${neo.estimated_diameter.kilometers.estimated_diameter_min} - ${neo.estimated_diameter.kilometers.estimated_diameter_max}</li>
                    <li>Meters: ${neo.estimated_diameter.meters.estimated_diameter_min} - ${neo.estimated_diameter.meters.estimated_diameter_max}</li>
                    <li>Miles: ${neo.estimated_diameter.miles.estimated_diameter_min} - ${neo.estimated_diameter.miles.estimated_diameter_max}</li>
                    <li>Feet: ${neo.estimated_diameter.feet.estimated_diameter_min} - ${neo.estimated_diameter.feet.estimated_diameter_max}</li>
                </ul>
                <h3>Close Approach Data</h3>
            `;

            neo.close_approach_data.forEach(data => {
                const closeApproachDetails = `
                    <ul>
                        <li><strong>Date:</strong> ${data.close_approach_date}</li>
                        <li><strong>Relative Velocity:</strong></li>
                        <ul>
                            <li>Km/s: ${data.relative_velocity.kilometers_per_second}</li>
                            <li>Km/h: ${data.relative_velocity.kilometers_per_hour}</li>
                            <li>Mi/h: ${data.relative_velocity.miles_per_hour}</li>
                        </ul>
                        <li><strong>Miss Distance:</strong></li>
                        <ul>
                            <li>Astronomical: ${data.miss_distance.astronomical}</li>
                            <li>Lunar: ${data.miss_distance.lunar}</li>
                            <li>Kilometers: ${data.miss_distance.kilometers}</li>
                            <li>Miles: ${data.miss_distance.miles}</li>
                        </ul>
                        <li><strong>Orbiting Body:</strong> ${data.orbiting_body}</li>
                    </ul>
                `;
                neoDetails += closeApproachDetails;
            });
        }

        // Add the final details to the .neo-info
        neoInfo.innerHTML += neoDetails;
        neoEntry.appendChild(neoInfo);

        // This container will hold our Three.js scene
        const neoVisual = document.createElement('div');
        neoVisual.classList.add('neo-visual');
        neoVisual.id = `visual-${neo.neo_id}`;
        neoEntry.appendChild(neoVisual);

        return neoEntry;
    }

    /**
     * Check if on mobile (simple breakpoint check).
     */
    function isMobileDevice() {
        return window.innerWidth <= 768; 
    }

    /**
     * Create the 3D scene for one NEO. 
     * Called only when the .neo-entry scrolls into view (via observer).
     */
    function addIrregularShapes(neo) {
        const container = document.getElementById(`visual-${neo.neo_id}`);
        if (!container) return;

        // Calculate scale factors
        const scaleFactor = isMobileDevice() ? 800 : 400;
        const statueHeightMeters = 93;
        const fixedReferenceHeight = (statueHeightMeters / 1000) * scaleFactor;

        const diameterMin = parseFloat(neo.estimated_diameter.kilometers.estimated_diameter_min) * scaleFactor;
        const diameterMax = parseFloat(neo.estimated_diameter.kilometers.estimated_diameter_max) * scaleFactor;
        const diameterMedian = (diameterMin + diameterMax) / 2;

        // Create a Three.js scene, camera, and renderer
        const scene = new THREE.Scene();
        const camera = new THREE.PerspectiveCamera(
            60,
            container.clientWidth / container.clientHeight,
            0.1,
            10000
        );
        const renderer = new THREE.WebGLRenderer({ alpha: true });
        renderer.setPixelRatio(window.devicePixelRatio);
        renderer.setSize(container.clientWidth, container.clientHeight);
        container.appendChild(renderer.domElement);

        // Store them so we can dispose later
        scenes[neo.neo_id] = scene;
        cameras[neo.neo_id] = camera;
        renderers[neo.neo_id] = renderer;

        // Reference shape (Statue of Liberty)
        const geometryReference = new THREE.BoxGeometry(
            fixedReferenceHeight / 2,
            fixedReferenceHeight,
            fixedReferenceHeight / 2
        );
        const materialReference = new THREE.MeshBasicMaterial({
            color: 0x1a73e8,
            wireframe: true
        });
        const referenceShape = new THREE.Mesh(geometryReference, materialReference);

        // Asteroid-like shape (NEO)
        const radius = diameterMedian / 2;
        const detail = 2;
        const neoGeometry = new THREE.IcosahedronGeometry(radius, detail);

        // Displace vertices for roughness
        const displacement = 0.1 * radius;
        const vertices = neoGeometry.attributes.position.array;
        for (let i = 0; i < vertices.length; i += 3) {
            const x = vertices[i];
            const y = vertices[i + 1];
            const z = vertices[i + 2];
            const offset = (Math.random() - 0.5) * 2 * displacement;
            vertices[i] += (x / radius) * offset;
            vertices[i + 1] += (y / radius) * offset;
            vertices[i + 2] += (z / radius) * offset;
        }
        neoGeometry.computeVertexNormals();

        const materialNeo = new THREE.MeshBasicMaterial({ color: 0xffffff, wireframe: true });
        const neoShape = new THREE.Mesh(neoGeometry, materialNeo);

        // Position them in the scene
        const spacing = radius + fixedReferenceHeight / 2 + 15;
        referenceShape.position.set(-spacing, 0, 0);
        neoShape.position.set(spacing, 0, 0);

        scene.add(referenceShape);
        scene.add(neoShape);

        // Position camera
        camera.position.z = Math.max(200, 3 * spacing);
        camera.lookAt(new THREE.Vector3(0, 0, 0));

        // Animate
        function animate() {
            requestAnimationFrame(animate);
            referenceShape.rotation.y += 0.01;
            neoShape.rotation.x += 0.005;
            neoShape.rotation.y += 0.01;
            renderer.render(scene, camera);
        }
        animate();
    }

    // Handle window resizing for any visible scenes
    window.addEventListener('resize', () => {
        // Resize each active scene
        neoData.forEach(neo => {
            const container = document.getElementById(`visual-${neo.neo_id}`);
            const scene = scenes[neo.neo_id];
            const camera = cameras[neo.neo_id];
            const renderer = renderers[neo.neo_id];
            if (container && scene && camera && renderer) {
                // Update size
                renderer.setPixelRatio(window.devicePixelRatio);
                renderer.setSize(container.clientWidth, container.clientHeight);
                camera.aspect = container.clientWidth / container.clientHeight;
                camera.updateProjectionMatrix();
            }
        });
    });
});
