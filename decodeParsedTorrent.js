const fs = require('fs');

// Path to the parsed JSON file
const parsedTorrentPath = './parsedTorrent.json';

// Decode ASCII characters
function decodeASCII(asciiArray) {
    return asciiArray
        .split(',')
        .map(charCode => String.fromCharCode(parseInt(charCode, 10)))
        .join('');
}

try {
    // Load and parse the JSON file
    const parsedData = JSON.parse(fs.readFileSync(parsedTorrentPath, 'utf-8'));

    // Decode the name
    const torrentName = decodeASCII(parsedData.name);
    console.log("Torrent Name:", torrentName);

    // Decode file list
    const files = parsedData.files.map(file => ({
        path: decodeASCII(file.path),
        size: (file.length / (1024 * 1024)).toFixed(2) + " MB"
    }));

    console.log("File List:");
    files.forEach((file, index) => {
        console.log(`${index + 1}. ${file.path} (${file.size})`);
    });

    // Save the decoded data
    const outputFilePath = './decodedTorrent.json';
    fs.writeFileSync(outputFilePath, JSON.stringify({ name: torrentName, files }, null, 2));
    console.log(`Decoded details saved to: ${outputFilePath}`);
} catch (error) {
    console.error("Error decoding parsed torrent:", error.message);
}
