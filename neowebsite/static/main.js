import * as THREE from 'https://cdn.jsdelivr.net/npm/three@v0.167.0/build/three.module.js';
import { ConvexGeometry } from 'https://cdn.jsdelivr.net/npm/three@v0.167.0/examples/jsm/geometries/ConvexGeometry.js';

document.addEventListener("DOMContentLoaded", function() {
    // Object to store renderers, cameras, and scenes
    const renderers = {};
    const cameras = {};
    const scenes = {}; // Initialize the scenes object
    let neoData = []; // Store NEO data

    // Get today's date in UTC formatted as YYYY-MM-DD
    const today = getFormattedDate(new Date());

    // Function to detect if the user is on a mobile device
    function isMobileDevice() {
        return window.innerWidth <= 768; // Adjust breakpoint as needed
    }

    // Fetch NEO data from the API
    fetch(`https://r8rt1aci7a.execute-api.us-east-2.amazonaws.com/dev/get-neo-data?fetch_date=${today}`)
        .then(response => response.json())
        .then(data => {
            if (data) {
                neoData = data.neos; // Store the fetched NEO data here
                document.getElementById('fetchDate').textContent = data.fetch_date;
                document.getElementById('neoCount').textContent = `Count: ${data.neos.length}`;
                const neoContainer = document.getElementById('neo-data-container');
                data.neos.forEach(neo => {
                    const neoEntry = createNeoEntry(neo);
                    neoContainer.appendChild(neoEntry);
                    addIrregularShapes(neo);
                });
            } else {
                console.error("No NEO Data found");
            }
        })
        .catch(error => {
            console.error("Error fetching NEO Data:", error);
        });

    // Function to get formatted date as YYYY-MM-DD in UTC
    function getFormattedDate(date) {
        const year = date.getUTCFullYear();
        const month = String(date.getUTCMonth() + 1).padStart(2, '0');
        const day = String(date.getUTCDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    }

    function createNeoEntry(neo) {
        const neoEntry = document.createElement('div');
        neoEntry.classList.add('neo-entry');

        const neoInfo = document.createElement('div');
        neoInfo.classList.add('neo-info');

        const neoTitle = document.createElement('h2');
        neoTitle.textContent = neo.name;
        neoInfo.appendChild(neoTitle);

        // Start building the neoDetails string
        let neoDetails = `
            <p><strong>NEO ID:</strong> ${neo.neo_id}</p>
            <p><a href="${neo.nasa_jpl_url}" target="_blank">NASA JPL URL</a></p>
            <p><strong>Is Potentially Hazardous:</strong> ${neo.is_potentially_hazardous_asteroid}</p>
        `;
        // add later if needed <p><strong>Absolute Magnitude H:</strong> ${neo.absolute_magnitude_h}</p>


        // Check if not on mobile device, include additional details
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
                            <li>Kilometers per second: ${data.relative_velocity.kilometers_per_second}</li>
                            <li>Kilometers per hour: ${data.relative_velocity.kilometers_per_hour}</li>
                            <li>Miles per hour: ${data.relative_velocity.miles_per_hour}</li>
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

        neoInfo.innerHTML += neoDetails;

        neoEntry.appendChild(neoInfo);

        const neoVisual = document.createElement('div');
        neoVisual.classList.add('neo-visual');
        neoVisual.id = `visual-${neo.neo_id}`;
        neoEntry.appendChild(neoVisual);

        return neoEntry;
    }

    function addIrregularShapes(neo) {
        const container = document.getElementById(`visual-${neo.neo_id}`);
        if (!container) return;
    
        const scaleFactor = isMobileDevice() ? 800 : 400; // Adjust scale factors as needed
        const statueHeightMeters = 93;
        const fixedReferenceHeight = (statueHeightMeters / 1000) * scaleFactor;
        const diameterMin = parseFloat(neo.estimated_diameter.kilometers.estimated_diameter_min) * scaleFactor;
        const diameterMax = parseFloat(neo.estimated_diameter.kilometers.estimated_diameter_max) * scaleFactor;
        const diameterMedian = (diameterMin + diameterMax) / 2;
    
        const scene = new THREE.Scene();
        const camera = new THREE.PerspectiveCamera(60, container.clientWidth / container.clientHeight, 0.1, 10000);
        const renderer = new THREE.WebGLRenderer({ alpha: true });
        renderer.setPixelRatio(window.devicePixelRatio);
        renderer.setSize(container.clientWidth, container.clientHeight);
        container.appendChild(renderer.domElement);
    
        // Store the scene, renderer, and camera
        scenes[neo.neo_id] = scene;
        renderers[neo.neo_id] = renderer;
        cameras[neo.neo_id] = camera;
    
        // Create a reference shape for the Statue of Liberty with a fixed size
        const geometryReference = new THREE.BoxGeometry(fixedReferenceHeight / 2, fixedReferenceHeight, fixedReferenceHeight / 2);
        const materialReference = new THREE.MeshBasicMaterial({ color: 0xcc00ff, wireframe: true });
        const referenceShape = new THREE.Mesh(geometryReference, materialReference);
    
        // Create an asteroid-like shape for the NEO
        const radius = diameterMedian / 2;
        const detail = 2; // Increase for more detail if needed
        const neoGeometry = new THREE.IcosahedronGeometry(radius, detail);
    
        // Displace the vertices to create an irregular surface
        const displacement = 0.1 * radius; // Adjust this value to control roughness
        const vertices = neoGeometry.attributes.position.array;
    
        for (let i = 0; i < vertices.length; i += 3) {
            const x = vertices[i];
            const y = vertices[i + 1];
            const z = vertices[i + 2];
    
            const offset = (Math.random() - 0.5) * 2 * displacement;
            vertices[i] += x / radius * offset;
            vertices[i + 1] += y / radius * offset;
            vertices[i + 2] += z / radius * offset;
        }
    
        neoGeometry.computeVertexNormals();
    
        const materialNeo = new THREE.MeshBasicMaterial({ color: 0xffffff, wireframe: true });
        const neoShape = new THREE.Mesh(neoGeometry, materialNeo);
    
        // Position the reference shape and NEO shape
        const spacing = radius + (fixedReferenceHeight / 2) + 15;
        referenceShape.position.set(-spacing, 0, 0); // Move to the left
        neoShape.position.set(spacing, 0, 0); // Move to the right
    
        scene.add(referenceShape);
        scene.add(neoShape);
    
        // Adjust camera position dynamically
        camera.position.z = Math.max(200, 3 * spacing); // Set a minimum distance
    
        camera.lookAt(new THREE.Vector3(0, 0, 0));
    
        function animate() {
            requestAnimationFrame(animate);
            referenceShape.rotation.y += 0.01;
            neoShape.rotation.x += 0.005;
            neoShape.rotation.y += 0.01;
            renderer.render(scene, camera);
        }
    
        animate();
    }
    

    window.addEventListener('resize', () => {
        neoData.forEach(neo => {
            const container = document.getElementById(`visual-${neo.neo_id}`);
            const scene = scenes[neo.neo_id];
            const camera = cameras[neo.neo_id];
            const renderer = renderers[neo.neo_id];
            if (container && scene && camera && renderer) {
                // Update pixel ratio
                renderer.setPixelRatio(window.devicePixelRatio);
                renderer.setSize(container.clientWidth, container.clientHeight);
                camera.aspect = container.clientWidth / container.clientHeight;
                camera.updateProjectionMatrix();
            }
        });
    });   
});
