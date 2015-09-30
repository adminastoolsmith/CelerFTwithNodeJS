/**
 * Description - This code provides the functionality to do Gigabit file uploads to a backend server that supports
 *               this capability. We use the XMLHttpRequest Level 2 object to upload either a binary file chunk or
 *               a base64 encoded represenation of teh file chunk to the server. The file chunk is uploaded as
 *               multipart/form-data and is sent use the HTTP POST verb. The parameters sent in the upload method are:
 *               
 *               filename - This is the name of the file to be uploaded
 *               directoryname - This is the name of directory to save the file in on the remote server
 *               chunkNumber - The current number of the file chunk that is being uploaded
 *               numberOfChunks - The total number of file chunks that is to be uploaded
 *               asynstate - Access the url either synchrnoulsy or asynchrnously
 *               
 *               
 *               
 * Author - Nigel Thomas
 * 
 * Copyright 2014 by Nigel Thomas<nigelbtomas@gmail.com>
 * 
 *  */

// Url for WebAPI functions
var webapiUrl = "/api/CelerFTFileUpload/UploadChunk";
var webapiGetMergeAllUrl = "/api/CelerFTFileUpload/MergeAll";

// Global variables
// Note IE 10 does not recognize the const declaration so we have to use var instead
var LARGE_FILE = 500 * 1024 * 1024;
var workerdata = '';
var blocks = [];

var xhrworkerspool = '';

var totalnumberofchunks = 0;
var uploadedchunk = 0;

var urlcount = 0;
var urlnumber = 0;

function sleep(milliseconds) {
    var start = new Date().getTime();
    for (var i = 0; i < 1e7; i++) {
        if ((new Date().getTime() - start) > milliseconds) {
            break;
        }
    }
}


// Function used to create the XMLHttpRequest worker pool
function XHRWorkerPool(numberofxhr) {

    this.xhrworkerpool = [];

    for (var i = 0; i < numberofxhr; i++) {
        var xhr = new XMLHttpRequest();
        this.xhrworkerpool.push(xhr);
    }

}

XHRWorkerPool.prototype.getWorker = function () {

    var xhr;
    if (this.xhrworkerpool.length > 0) {
        xhr = this.xhrworkerpool.pop();
    }
    else {
        xhr = new XMLHttpRequest();
    }

    return xhr;
}

XHRWorkerPool.prototype.releaseWorker = function (xhr) {
    //xhr.abort();
    this.xhrworkerpool.push(xhr);
    /*xhr.abort();
    var xhr1 = new XMLHttpRequest();
    this.xhrworkerpool.push(xhr1);*/
}

XHRWorkerPool.prototype.terminateWorkers = function () {
    for (var i = 0; i < this.workerpool.length; i++) {
        this.xhrworkerpool[i].abort();
    }
}

// Function used to creae the multipart/form-data in browsers
// that don't support Formdata
function buildFormData(chunk) {

    // Transform the data into a base64 string
    var reader = new FileReaderSync();
    var dataUrl = reader.readAsDataURL(chunk);
    var chunkdata = dataUrl.match(/,(.*)$/)[1];

    // Create the form request

    // Hard code the boundary
    var boundary = '----12345678wertysdfg';

    // We start a new part in our body's request
    var data = '';
    data += '--' + boundary + '\r\n' + 'Content-Disposition: form-data; name="Slice"; filename="blob"';
    data += '\r\n';

    // We provide the mime type of the file. In this case it is text for base64 encoded file
    data += 'Content-Type: text/html; charset=UTF-8'
    data += '\r\n';

    // There is always a blank line between the meta-data and the data
    data += '\r\n';

    // We append the binary data to our body's request
    data += chunkdata + '\r\n';

    // Once we are done, we "close" the body's request
    data += '--' + boundary + '--';

    reader = null;

    return data;

}

// Function used to send the request to the server to merge the file chunks 
// into one file
function mergeall(filename, chunkCount) {

    var xhr = new XMLHttpRequest();
 
    xhr.onreadystatechange = function (e) {

        if (this.readyState == 4 && this.status == 200) {

            // Update the UI with the information that we have finished the file upload, and indicate the time taken
            // Update the UI with the remote file checksum
            if (chunkCount.numberOfUploadedChunks == chunkCount.numberOfChunks) {
                var endtime = new Date();
                var timetaken = new Date();
                var timetaken = (((endtime.getTime() - chunkCount.starttime.getTime()) / 1000) / 60);
                var md5hash = this.responseText.split(",");
                self.postMessage({ 'type': 'status', 'message': filename + " uploaded succesfully. It took " + timetaken.toFixed(2) + " minutes to upload.", 'id': workerdata.id });
                self.postMessage({ 'type': 'checksum', 'message':  md5hash[1], 'id': workerdata.id });

            }
        }

        // A 400 message indicates that we can't merge all of the files as yet.
        // So queue up the merge request to run in 5 seconds
        if (this.readyState == 4 && this.status == 400) {
            
            setTimeout(function () { mergeall(filename, chunkCount); }, 5000);
        }

    };

    // Send the request to merge the file
    xhr.open('GET', webapiGetMergeAllUrl + '/?filename=' + filename + '&directoryname=' + workerdata.directory + '&numberOfChunks=' + chunkCount.numberOfChunks, false);
    xhr.send(null);
    xhr = null;


}

// Function used to upload the file chunks
function upload(chunk, filename, chunkCount, uploadurl, asyncstate) {

    // Grab a worker from the pool
    var xhr = xhrworkerspool.getWorker();

    // xhr.upload causes an error in IE. Use the try catch block to
    // catch the failure in IE, and then upload the progress block in
    // the catch routine.
    try {
        if (asyncstate == true) {
            xhr.upload.onprogress = function (e) {
                
                if (e.lengthComputable) {
                    var progress = parseInt((e.loaded * 100 / e.total), 10);
                    self.postMessage({ 'type': 'progress', 'percentage': progress, 'id': workerdata.id });
                }
                else {
                    var progress = parseInt((chunkCount.currentNumber * 100 / chunkCount.numberOfChunks), 10);
                    self.postMessage({ 'type': 'progress', 'percentage': progress, 'id': workerdata.id });
                }
    
                /* //var progress = parseInt((e.loaded * 100 / e.total), 10);
                var progress = parseInt((chunkCount.currentNumber * 100 / chunkCount.numberOfChunks), 10);
                self.postMessage({ 'type': 'progress', 'percentage': progress, 'id': workerdata.id });*/
            }(chunkCount);
        }
    }
    catch (e) {

        xhr.onprogress = function (e) {
            
            if (e.lengthComputable) {
                var progress = parseInt((e.loaded * 100 / e.total), 10);
                self.postMessage({ 'type': 'progress', 'percentage': progress, 'id': workerdata.id });
            }
            else {
                var progress = parseInt((chunkCount.currentNumber * 100 / chunkCount.numberOfChunks), 10);
                self.postMessage({ 'type': 'progress', 'percentage': progress, 'id': workerdata.id });
            }
            
            /* //var progress = parseInt((e.loaded * 100 / e.total), 10);
            var progress = parseInt((chunkCount.currentNumber * 100 / chunkCount.numberOfChunks), 10);
            self.postMessage({ 'type': 'progress', 'percentage': progress, 'id': workerdata.id });*/
        }(chunkCount);

    }


    xhr.onreadystatechange = function (e) {

        if (this.readyState == 4 && this.status == 200) {

            // Send back progess information for synchronous uploads 
            // The upload.onprogress method only fires on asynchornous uploads
            // and we are doing synchronous uploads
            if (asyncstate == false) {
                var progress = parseInt((chunkCount.currentNumber * 100 / chunkCount.numberOfChunks), 10);
                self.postMessage({ 'type': 'progress', 'percentage': progress, 'id': workerdata.id });
            }

        }

        if (this.readyState == 4 && this.status == 415) {

            // Tried to upload file that is not multipart/form-data.
            // End the upload
            self.postMessage({ 'type': 'error', 'message': "Upload Error: " + this.responseText, 'id': workerdata.id });

        }

        if (this.readyState == 4 && this.status == 413) {

            // Tried to upload file that is greater than the maximum file size.
            // End the upload
            self.postMessage({ 'type': 'error', 'message': "Upload Error: " + this.responseText, 'id': workerdata.id });

        }


        if (this.readyState == 4 && this.status == 500) {

            // Fatal error occured on the server side
            // Send the error message and end the webworker
            self.postMessage({ 'type': 'error', 'message': "Server Error: " + this.responseText, 'id': workerdata.id });

        }

    };

    xhr.onloadend = function () {

        // If we have uploaded all of the file chunks then tell the server to merge them
        /*if (chunkCount.numberOfUploadedChunks == chunkCount.numberOfChunks) {
            mergeall(filename, chunkCount);

        }*/
    };

    // Open the url and upload the file chunk
    xhr.open('POST', uploadurl + '?filename=' + filename + '&directoryname=' + workerdata.directory + '&chunkNumber=' + chunkCount.currentNumber + '&numberOfChunks=' + chunkCount.numberOfChunks, asyncstate);

    var formData = '';

    if (typeof FormData == "undefined") {

        // The browser does not support the FormData object.
        // We will manually create the from 

        formData = buildFormData(chunk);

        // Create the form with appropriate header
        xhr.setRequestHeader("Content-Type", "multipart/form-data; boundary=----12345678wertysdfg");
        xhr.setRequestHeader("Content-Length", formData.length);
        xhr.setRequestHeader("CelerFT-Encoded", "base64");

    }
    else {

        // Browser supports the Formdata object
        // Create the form 
        formData = new FormData();
        formData.append("Slice", chunk);

    }

   
    // Send the form
    xhr.send(formData);

    formData = null;

    xhrworkerspool.releaseWorker(xhr);

}


// This is where we start
// The upload information is sent as a paramter
// in e.data
self.onmessage = function (e) {

    workerdata = e.data;

    // Create the xhr upload workers.
    // We will upload to multiple urls
    xhrworkerspool = new XHRWorkerPool(6);
    
    // We are doing a normal upload to a backend that provides
    // multiple methods to accept the upload
    if (workerdata.chunk != null && workerdata.paralleluploads == false) {

        if (urlcount >= 6) {

            urlcount = 0;
        }

        if (urlcount == 0) {
            uploadurl = webapiUrl;
        }
        else {
            uploadurl = webapiUrl + urlcount;
        }

        upload(workerdata.chunk, workerdata.filename, workerdata.chunkCount, uploadurl, workerdata.asyncstate);
        urlcount++;
    }

    // We are going to upload to a backend that supports parallel uploads.
    // Parallel uploads is supported by publishng the web site on different ports
    // The backen must implement CORS for this to work
    else if (workerdata.chunk != null && workerdata.paralleluploads == true) {
        
        if (urlnumber >= 6) {
            urlnumber = 0;
        }

        if (urlcount >= 6) {
            urlcount = 0;
        }
        
        if (urlcount == 0) {
            uploadurl = workerdata.currentlocation + webapiUrl + urlnumber;
        }
        else {
            // Increment the port numbers, e.g 8000, 8001, 8002, 8003, 8004, 8005
            uploadurl = workerdata.currentlocation.slice(0, -1) + urlcount + webapiUrl + urlnumber;
        }
        
        upload(workerdata.chunk, workerdata.filename, workerdata.chunkCount, uploadurl, workerdata.asyncstate);
        urlcount++;
        urlnumber++;
    }

    /*else {
        mergeall(workerdata.filename, workerdata.chunkCount);
    }*/



}
