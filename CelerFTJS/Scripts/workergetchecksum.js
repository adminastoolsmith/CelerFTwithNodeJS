/**
 * Description - This code provides the functionality to do Gigabit file uploads to a backend server that supports
 *               this capability. We use the XMLHttpRequest Level 2 object to send an HTTP GET to the backend
 *               API to get the checksum of the uploaded files.
 *               The parameters sent in the merge method are:
 *               
 *               
 *               filename - This is the name of the file to be uploaded
 *               directoryname - This is the name of directory to save the file in on the remote server
 *               
 *               
 * Author - Nigel Thomas
 * 
 * Copyright 2014 by Nigel Thomas<nigelbtomas@gmail.com>
 * 
 *  */

// Import additional scripts
// MD5 checksum libraray https://github.com/satazor/SparkMD5
importScripts('/Scripts/spark-md5.js');

// Url for WebAPI functions
var webapiUrl = "/api/CelerFTFileUpload/UploadChunk";
var webapiGetMergeAllUrl = "/api/CelerFTFileUpload/MergeAll";
var webapiGetChecksumlUrl = "/api/CelerFTFileUpload/GetChecksum";

// Global variables
// Note IE 10 does not recognize the const declaration so we have to use var instead
var LARGE_FILE = 500 * 1024 * 1024;
var workerdata = '';
var blocks = [];


var totalnumberofchunks = 0;
var uploadedchunk = 0;

var urlcount = 0;

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
// Using asynchronous file reader in the webworker
function processLocalFileChecksum(blob) {
    
    var blobSlice = File.prototype.slice || File.prototype.mozSlice || File.prototype.webkitSlice;
    
    // Size of the file
    var SIZE = blob.size;
    
    // The total number of file chunks
    var chunks = Math.ceil(blob.size / BYTES_PER_CHUNK);
    var currentChunk = 0;
    
    // The synchrnous file reader used in the web worker
    var fileReader = new FileReader();
    
    // SparkMD5 MD5 checksum generator variable
    var spark = new SparkMD5.ArrayBuffer();
    
    fileReader.onload = function (e) {
        //console.log('read chunk nr', currentChunk + 1, 'of', chunks);
        spark.append(e.target.result);                   // Append array buffer 
        currentChunk++;
        
        if (currentChunk < chunks) {
            loadNext();
        } else {
            //console.log('finished loading');
            //console.info('computed hash', spark.end());  // Compute hash 
            
            // All done calculate the checksum. 
            var md5hash = spark.end();
            self.postMessage({ 'type': 'localchecksum', 'message': md5hash.toUpperCase(), 'id': workerdata.id });
        }
    };
    
    fileReader.onerror = function () {
        console.warn('oops, something went wrong.');
    };
    
    function loadNext() {
        var start = currentChunk * BYTES_PER_CHUNK,
            end = ((start + BYTES_PER_CHUNK) >= blob.size) ? blob.size : start + BYTES_PER_CHUNK;
        
        fileReader.readAsArrayBuffer(blobSlice.call(blob, start, end));
    }
    
    loadNext();
    
   
}

// Function used to generate file checksum
// Using synchronous file reader in teh webworker
function processLocalFileChecksumSync(blob) {
    
    
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
        
        //var progress = parseInt((currentChunk * 100 / chunks), 10);
        //self.postMessage({ 'type': 'progress', 'percentage': progress, 'id': workerdata.id });
        
        start = end;
        end = start + BYTES_PER_CHUNK;
        
        if (chunks == currentChunk) {
            
            // All done calculate the checksum. 
            var md5hash = spark.end();
            self.postMessage({ 'type': 'localchecksum', 'message': md5hash.toUpperCase(), 'id': workerdata.id });

        }
    }
}

// Function used to send the request to the server to calculate the file checksum
function processRemoteFileChecksum (directory, filename) {
    
    var xhr = new XMLHttpRequest();
    
    xhr.onreadystatechange = function (e) {
        
        if (this.readyState == 4 && this.status == 200) {
            
            // Update the UI with the checksum
            var md5hash = this.responseText.split(",");
            self.postMessage({ 'type': 'remotechecksum', 'message': md5hash[1], 'id': workerdata.id });
        }
        
        // A 400 message indicates that the file does not exists as yet
        // So queue up the checksum request to run in 30 seconds
        if (this.readyState == 4 && this.status == 400) {
            
            setTimeout(function () { processRemoteFileChecksum(directory, filename); }, 5000);
        }

        if (this.readyState == 4 && this.status == 502) {
            
            setTimeout(function () { processRemoteFileChecksum(directory, filename); }, 5000);
        }

        if (this.readyState == 4 && this.status == 503) {
            
            setTimeout(function () { processRemoteFileChecksum(directory, filename); }, 5000);
        }

    };
    
    // Send the request to get the checksum
    xhr.open('GET', webapiGetChecksumlUrl+ '/?filename=' + filename + '&directoryname=' + directory, false);
    xhr.send(null);
    xhr = null;

}



// This is where we start
// The upload information is sent as a paramter
// in e.data
self.onmessage = function (e) {
    
    workerdata = e.data;
    
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
    
    // Get the remote file checksum
    processRemoteFileChecksum(workerdata.directory, workerdata.filename);

    // Calculate the local file checksum
    //self.postMessage({ 'type': 'status', 'message': "Calculating checksum " + workerdata.files.name, 'id': workerdata.id });
    //processLocalFileChecksum1(workerdata.filename);
 
}
