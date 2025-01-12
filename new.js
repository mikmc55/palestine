const { addonBuilder, serveHTTP } = require("stremio-addon-sdk");
const WebTorrent = require("webtorrent");
const express = require("express");
const fs = require("fs");
const path = require("path");

// Magnet URI for the torrent
const magnetURI =
    "magnet:?xt=urn:btih:382efee548a0a7502e23ce09e5a6550f724e5f0d&dn=Essential%20Palestine%20Documentaries";

// WebTorrent client instance
const client = new WebTorrent();
const app = express();

// Load torrent metadata from a JSON file
let torrentInfo = { name: "Essential Palestine Documentaries", files: [] };
try {
    const data = fs.readFileSync("torrent_files.json", "utf-8");
    torrentInfo = JSON.parse(data);
} catch (error) {
    console.error("Error reading torrent files JSON:", error);
    process.exit(1);
}

app.get("/:filename", (req, res) => {
    const { filename } = req.params;
    const torrent = client.get(magnetURI);

    if (torrent) {
        // Find the file in the torrent by name
        const streamFile = torrent.files.find(f => f.name === decodeURIComponent(filename));
        if (streamFile) {
            // Set the content type to video/mp4 or adjust according to file type
            res.setHeader("Content-Type", "video/mp4");
            const stream = streamFile.createReadStream();

            // Handle stream errors
            stream.on('error', (err) => {
                console.error("Error reading file stream:", err);
                if (!res.headersSent) {
                    res.status(500).send("Internal server error");
                }
            });

            // Handle response stream closure
            res.on('close', () => {
                console.log("Client closed the connection");
                stream.destroy();  // Stop the torrent stream if client disconnects
            });

            stream.on('end', () => {
                console.log("Streaming finished");
                res.end(); // End the response when stream finishes
            });

            // Pipe the stream to the response
            stream.pipe(res);

            // Ensure headers are set only once
            if (!res.headersSent) {
                res.setHeader("Content-Type", "video/mp4");
            }

        } else {
            if (!res.headersSent) {
                res.status(404).send("File not found in torrent.");
            }
        }
    } else {
        if (!res.headersSent) {
            res.status(404).send("Torrent not found.");
        }
    }
});

// Start streaming server on port 3000
const streamPort = 3000;
app.listen(streamPort, () => {
    console.log(`Streaming server running at http://localhost:${streamPort}`);
});

// Add-on Manifest
const manifest = {
    id: "essential-palestine-docs",
    version: "1.0.0",
    name: torrentInfo.name,
    description: "Catalog of essential Palestine documentaries available via torrent streaming.",
    resources: ["catalog", "meta", "stream"],
    types: ["other"],
    idPrefixes: ["epd_"],
    catalogs: [
        {
            type: "other",
            id: "essential-palestine-docs",
            name: "Essential Palestine Documentaries"
        }
    ]
};

const builder = new addonBuilder(manifest);

// Catalog handler: Fetch the metadata for the catalog
builder.defineCatalogHandler(({ type, id }) => {
    if (type === "other" && id === "essential-palestine-docs") {
        const metas = torrentInfo.files.map((file, index) => ({
            id: `epd_${index}`,
            type: "other",
            name: file.path,
            poster: "https://via.placeholder.com/150", // Placeholder image
            description: `File size: ${file.size}`
        }));
        return Promise.resolve({ metas });
    }
    return Promise.reject("Invalid catalog request.");
});

// Meta handler: Fetch metadata for each file in the torrent
builder.defineMetaHandler(({ id }) => {
    const index = parseInt(id.split("_")[1]);
    const file = torrentInfo.files[index];
    if (file) {
        return Promise.resolve({
            meta: {
                id,
                type: "other",
                name: file.path,
                poster: "https://via.placeholder.com/150",
                description: `File size: ${file.size}`
            }
        });
    }
    return Promise.reject("Invalid meta request.");
});

// Stream handler: Handle streaming of the file over HTTP
builder.defineStreamHandler(({ id }) => {
    const index = parseInt(id.split("_")[1]);
    const file = torrentInfo.files[index];

    if (file) {
        return new Promise((resolve, reject) => {
            if (!client.get(magnetURI)) {
                client.add(magnetURI, { announce: ["udp://tracker.opentrackr.org:1337"] }, torrent => {
                    attachStream(torrent, file, resolve, reject);
                });
            } else {
                const torrent = client.get(magnetURI);
                attachStream(torrent, file, resolve, reject);
            }
        });
    }
    return Promise.reject("Invalid stream request.");
});

// Function to attach the stream to the HTTP server
function attachStream(torrent, file, resolve, reject) {
    const streamFile = torrent.files.find(f => f.name === file.path);
    if (streamFile) {
        streamFile.select();
        const streamURL = `http://localhost:3000/${encodeURIComponent(file.path)}`;
        resolve({
            streams: [{ title: "Stream Now", url: streamURL }]
        });
    } else {
        reject("File not found in torrent.");
    }
}

// Start the add-on server
serveHTTP(builder.getInterface(), { port: 7000 });
console.log("Add-on running on http://localhost:7000/manifest.json");
