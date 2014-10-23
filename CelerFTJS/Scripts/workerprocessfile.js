/**
 * Description - This code provides the functionality to do Gigabit file uploads to a backend server that supports
 *               this capability. We use the File API to slice a file inot chunks and then send the chunk back to
 *               another web worker process for uploading to the backend server. We use the CryptoMD5 library to
 *               calculate the MD5 file checksum for the file
 *                             
 * Author - Nigel Thomas
 * 
 * Copyright 2014 by Nigel Thomas<nigelbtomas@gmail.com>
 * 
 *  */

// Import additional scripts
// MD5 checksum libraray https://github.com/satazor/SparkMD5
importScripts('/Scripts/spark-md5.js');

// Global variables
// Note IE 10 does not recognize the const declaration so we have to use var instead
var LARGE_FILE = 500 * 1024 * 1024;
var workerdata = '';
var asyncstate = true;


// 1MB chunk sizes. The default
var BYTES_PER_CHUNK = 1 * 1024 * 1024;

function sleep(milliseconds) {
    var start = new Date().getTime();
    for (var i = 0; i < 1e7; i++) {
        if ((new Date().getTime() - start) > milliseconds) {
            break;
        }
    }
}

// Function used to generate file checksum
// Using synchronous file reader in teh webworker
function processFileChecksum(blob) {


    // Size of the file
    var SIZE = blob.size;
    
    // The total number of file chunks
    var chunks = Math.ceil(blob.size / BYTES_PER_CHUNK);
    var currentChunk = 0;

    // The synchrnous file reader used in the web worker
    var fileReader = new FileReaderSync();

    // SparkMD5 MD5 checksum generator variable
    var spark = new SparkMD5.ArrayBuffer();

    var start = 0;
    var end = BYTES_PER_CHUNK;


    // Read the file and generate the checksum
    while (start < SIZE) {

        var chunk = fileReader.readAsArrayBuffer(blob.slice(start, end));
        spark.append(chunk);

        currentChunk++;

        var progress = parseInt((currentChunk * 100 / chunks), 10);
        self.postMessage({ 'type': 'progress', 'percentage': progress, 'id': workerdata.id });

        start = end;
        end = start + BYTES_PER_CHUNK;

        if (chunks == currentChunk) {

            // All done calculate the checksum. 
            var md5hash = spark.end();
            self.postMessage({ 'type': 'checksum', 'message': md5hash.toUpperCase(), 'id': workerdata.id });

        }
    }
}

// This function is used to read the file, calculate the checksum,
// and send the file chunk to the web worker that uploads the file chunk
function processFile(blob) {


    // Size of the file
    var SIZE = blob.size;

    // The total number of file chunks
    var Total_Number_of_Chunks = Math.ceil(blob.size / BYTES_PER_CHUNK);

    // Array used to hold the total number of chunks, the number of chunks that have been uploaded,
    // and the current chunk. This information is sent to the web worker that uploads the file chunks
    var chunkCount = {

        currentNumber: 1,
        numberOfChunks: Total_Number_of_Chunks,
        numberOfUploadedChunks: 0,
        starttime: new Date()
    };

    var start = 0;
    var end = BYTES_PER_CHUNK;

    var fileReader = new FileReaderSync();
    var spark = new SparkMD5.ArrayBuffer();

    while (start < SIZE) {


        var chunk = blob.slice(start, end);

        // Read the chunk into another variable to calculate the checksum
        var chunk1 = fileReader.readAsArrayBuffer(chunk);
        spark.append(chunk1);

        // Send the chunk back to the parent
        self.postMessage({ 'type': 'upload', 'filename': blob.name, 'blob': chunk, 'chunkCount': chunkCount, 'asyncstate': asyncstate,'id': workerdata.id });
        
        chunkCount.currentNumber++;
        chunkCount.numberOfUploadedChunks++;

        start = end;
        end = start + BYTES_PER_CHUNK;

        if (chunkCount.numberOfUploadedChunks == chunkCount.numberOfChunks) {

            // All done calculate the checksum
            var md5hash = spark.end();
            self.postMessage({ 'type': 'checksum', 'message': md5hash.toUpperCase(), 'id': workerdata.id });

            // Merge the file on the remote server
            self.postMessage({ 'type': 'merge', 'filename': blob.name, 'chunkCount': chunkCount, 'id': workerdata.id });
        }
    }

}

// This is where we start.
// The parent sends us the file as a part of the data 
self.onmessage = function (e) {

    workerdata = e.data;

    // If we have an id greater than 5 then we abort. We upload five files at a time.
    if (workerdata.id > 5) {
        self.postMessage({ 'type': 'error', 'message': "We can only upload five files at a time.", 'id': workerdata.id });
        return;
    }

   
    // If we have a large file we will use a synchronous upload by default.
    // Large file is greater than 500GB
    if (workerdata.files.size > LARGE_FILE && workerdata.uploadlargfileasync == false) {
        asyncstate = false; 
    }
  

    // Configure the bytes per chunk.
    // The default is 1MB
    switch (workerdata.bytesperchunk) {

        case '50MB':
            BYTES_PER_CHUNK = 50 * 1024 * 1024;
            break;
        case '20MB':
            BYTES_PER_CHUNK = 20 * 1024 * 1024;
            break;
        case '10MB':
            BYTES_PER_CHUNK = 10 * 1024 * 1024;
            break;
        case '5MB':
            BYTES_PER_CHUNK = 5 * 1024 * 1024;
            break;
        case '2MB':
            BYTES_PER_CHUNK = 2 * 1024 * 1024;
            break;
        case '1MB':
            BYTES_PER_CHUNK = 1 * 1024 * 1024;
            break;
        case '500K':
            BYTES_PER_CHUNK = 500 * 1024;
            break;
        case '256K':
            BYTES_PER_CHUNK = 256 * 1024;
        case '128K':
            BYTES_PER_CHUNK = 128 * 1024;
            break;
        case '64K':
            BYTES_PER_CHUNK = 64 * 1024;
            break;
        default:
            BYTES_PER_CHUNK = 1024 * 1024;
    }
    
    // Generate the file checksum
    // Note we will generate the local checksum while uploading the file.
    // That way is much faster. Just leaving this here for future testing
    //self.postMessage({ 'type': 'status', 'message': "Generating file checksum for " + workerdata.files.name, 'id': workerdata.id });
    //processFileChecksum(workerdata.files);

    // Process the file for uploading      
    //  Send a status message to the parent page
    self.postMessage({ 'type': 'status', 'message': "Uploading file " + workerdata.files.name, 'id': workerdata.id });

    // Start processing the file
    processFile(workerdata.files);



}
