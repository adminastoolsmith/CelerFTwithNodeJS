/**
 * Description - This code provides the functionality to do Gigabit file uploads to a backend server that supports
 *               this capability. We use the XMLHttpRequest Level 2 object to send an HTTP GET to the backend
 *               API to merge the files. If all of teh files have not been uploaded as yet the API returns a 400
 *               message. The parameters sent in the merge method are:
 *               
 *               
 *               filename - This is the name of the file to be uploaded
 *               directoryname - This is the name of directory to save the file in on the remote server
 *               numberOfChunks - The total number of file chunks that is to be uploaded
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


var totalnumberofchunks = 0;
var uploadedchunk = 0;

var urlcount = 0;

function sleep(milliseconds) {
    var start = new Date().getTime();
    for (var i = 0; i < 1e7; i++) {
        if ((new Date().getTime() - start) > milliseconds) {
            break;
        }
    }
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
                self.postMessage({ 'type': 'checksum', 'message': md5hash[1], 'id': workerdata.id });

            }
        }
        
        // A 400 message indicates that we can't merge all of the files as yet.
        // So queue up the merge request to run in 30 seconds
        if (this.readyState == 4 && this.status == 400) {
            
            setTimeout(function () { mergeall(filename, chunkCount); }, 5000);
        }

    };
    
    // Send the request to merge the file
    xhr.open('GET', webapiGetMergeAllUrl + '/?filename=' + filename + '&directoryname=' + workerdata.directory + '&numberOfChunks=' + chunkCount.numberOfChunks, false);
    xhr.send(null);
    xhr = null;


}



// This is where we start
// The upload information is sent as a paramter
// in e.data
self.onmessage = function (e) {
    
    workerdata = e.data;
    
    mergeall(workerdata.filename, workerdata.chunkCount);
 

}
