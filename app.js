const { addonBuilder, serveHTTP } = require("stremio-addon-sdk");
const WebTorrent = require("webtorrent");
const express = require("express");
const cors = require("cors");
const fs = require("fs");
const path = require("path");

const app = express();
app.use(cors()); // Enable CORS for Stremio requests

const client = new WebTorrent();

// Magnet URI for the torrent
const magnetURI =
    "magnet:?xt=urn:btih:382efee548a0a7502e23ce09e5a6550f724e5f0d&dn=Essential+Palestine+Documentaries";

// Load torrent files from JSON
let torrentInfo = { name: "Essential Palestine Documentaries", files: [] };
try {
    const torrentFilePath = path.join(__dirname, "torrent_files.json");
    const data = fs.readFileSync(torrentFilePath, "utf-8");
    torrentInfo = JSON.parse(data);
} catch (error) {
    console.error("Error reading torrent files JSON:", error);
    process.exit(1);
}

// Set up a static file streaming endpoint
app.get("/:filename", (req, res) => {
    const { filename } = req.params;
    const torrent = client.get(magnetURI);
    if (torrent) {
        const streamFile = torrent.files.find(f => f.name === decodeURIComponent(filename));
        if (streamFile) {
            res.setHeader("Content-Type", "video/mp4"); // Adjust based on your content type
            const stream = streamFile.createReadStream();
            stream.pipe(res);
        } else {
            res.status(404).send("File not found in torrent.");
        }
    } else {
        res.status(404).send("Torrent not found.");
    }
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
            name: "Essential Palestine Documentaries",
        },
    ],
};

const builder = new addonBuilder(manifest);

// Catalog handler
builder.defineCatalogHandler(({ type, id }) => {
    if (type === "other" && id === "essential-palestine-docs") {
        const metas = torrentInfo.files.map((file, index) => ({
            id: `epd_${index}`,
            type: "other",
            name: file.path,
            poster: "https://via.placeholder.com/150", // Placeholder image URL
            description: `File size: ${file.size}`,
        }));
        return Promise.resolve({ metas });
    }
    return Promise.reject("Invalid catalog request.");
});

// Meta handler
builder.defineMetaHandler(({ id }) => {
    const index = parseInt(id.split("_")[1], 10);
    const file = torrentInfo.files[index];
    if (file) {
        return Promise.resolve({
            meta: {
                id,
                type: "other",
                name: file.path,
                poster: "https://via.placeholder.com/150",
                description: `File size: ${file.size}`,
            },
        });
    }
    return Promise.reject("Invalid meta request.");
});

// Stream handler
builder.defineStreamHandler(({ id }) => {
    const index = parseInt(id.split("_")[1], 10);
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

function attachStream(torrent, file, resolve, reject) {
    const streamFile = torrent.files.find(f => f.name === file.path);
    if (streamFile) {
        streamFile.select();
        const streamURL = `https://${process.env.RENDER_EXTERNAL_HOST}:${process.env.PORT}/${encodeURIComponent(
            file.path
        )}`;
        resolve({
            streams: [{ title: "Stream Now", url: streamURL }],
        });
    } else {
        reject("File not found in torrent.");
    }
}

// Start combined server
const port = process.env.PORT || 3000;
serveHTTP(builder.getInterface(), { port });
app.listen(port, "0.0.0.0", () => {
    console.log(`Add-on manifest running at https://${process.env.RENDER_EXTERNAL_HOST}:${port}/manifest.json`);
});
